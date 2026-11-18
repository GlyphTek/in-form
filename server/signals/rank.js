// Stateless, rule-based channel assignment for the four RAKE channels.
//
// Input:  candidates = [{ title, link, published, summary, source, sourceKind }]
// Output: { relevant, attention, knowing, experience } where each value is an
//         array of up to `perChannel` (default 3) items, best first, each
//         { ...candidate, score (0-10), reason }. An empty array means nothing
//         suitable exists. A channel with nothing honest to show stays short or
//         empty; we never pad it with the closest-looking item.
//
// How it works
//   1. Every candidate gets a base score from recency (half-life 24h). Undated
//      items get a modest fixed score so they can still appear but not dominate.
//   2. Lexicon rules say which channel a candidate suits. Attention, Experience
//      and Knowing each need a lexicon match; Relevant is the default channel
//      for the best remaining item from the user's own sources.
//   3. Cue-based channels fill first, in rounds (each gets its best item before
//      any gets a second); Relevant then takes the best of what remains. An
//      item appears in at most one channel, and repeats from one source are
//      mildly penalised. Relevant only takes items from the last
//      RELEVANT_MAX_AGE_HOURS, so it runs dry when nothing recent is left
//      instead of working back through old items. Undated items are allowed.
//
// This is deliberately small and explainable. Per-user learned weights (see
// learn.js) scale each candidate's recency score by 0.5x to 1.5x and add a plain
// reason; with no history the scale is exactly 1.

export const CHANNELS = ["relevant", "attention", "knowing", "experience"];

export const ITEMS_PER_CHANNEL = 3;
/** Relevant only takes items published within this many hours (undated items are allowed). */
export const RELEVANT_MAX_AGE_HOURS = 48;
const HALF_LIFE_HOURS = 24;
const UNDATED_RECENCY = 0.25;
const SOURCE_REPEAT_PENALTY = 0.8;
const LEXICON_BONUS = { attention: 0.5, experience: 0.4, knowing: 0.4 };

// Whole-word, case-insensitive. Kept short and unambiguous on purpose.
export const LEXICONS = {
  attention: [
    "alert", "warning", "warnings", "outage", "breach", "recall", "deadline", "urgent", "emergency",
    "advisory", "vulnerability", "cve", "evacuation", "evacuate", "closure", "closed", "delayed",
    "cancelled", "canceled", "suspended", "storm", "flood", "flooding", "cyclone", "earthquake",
    "tsunami", "shutdown", "ban", "banned", "lawsuit", "fine", "fined", "deprecated", "sunset",
  ],
  knowing: [
    "research", "study", "studies", "analysis", "paper", "explained", "explainer", "guide",
    "findings", "review", "report", "science", "scientists", "researchers", "evidence",
    "history", "why", "how", "understanding", "deep dive", "tutorial", "preprint",
  ],
  experience: [
    "event", "events", "live", "festival", "launch", "webinar", "conference", "workshop",
    "exhibition", "concert", "meetup", "tickets", "join", "livestream", "premiere", "tour",
    "open day", "hackathon", "demo", "showcase", "summit", "register",
  ],
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MATCHERS = Object.fromEntries(
  Object.entries(LEXICONS).map(([channel, words]) => [
    channel,
    new RegExp(`(?<![\\p{L}\\p{N}])(?:${words.map(escapeRe).join("|")})(?![\\p{L}\\p{N}])`, "giu"),
  ]),
);

/** How many distinct lexicon words for `channel` appear in the title (and summary at half weight). */
export function lexiconHits(channel, candidate) {
  const count = (text) => new Set((text || "").toLowerCase().match(MATCHERS[channel]) ?? []).size;
  return count(candidate.title) + count(candidate.summary) * 0.5;
}

export function recencyScore(published, now) {
  if (!published) return UNDATED_RECENCY;
  const ageHours = Math.max(0, (now - Date.parse(published)) / 3_600_000);
  return 0.5 ** (ageHours / HALF_LIFE_HOURS);
}

function baseScore(candidate, now) {
  return recencyScore(candidate.published, now);
}

function toTen(score) {
  // base is 0-1; with a lexicon bonus it can reach ~1.5. Map to 1-10.
  return Math.max(1, Math.min(10, Math.round(score * 10 * (10 / 15) + 1)));
}

/**
 * Assign up to `perChannel` candidates to each channel.
 * @param {Array} candidates
 * @param {{ now?: number, perChannel?: number, relevantMaxAgeHours?: number, affinity?: Function }} options
 */
export function assignChannels(
  candidates,
  {
    now = Date.now(),
    perChannel = ITEMS_PER_CHANNEL,
    relevantMaxAgeHours = RELEVANT_MAX_AGE_HOURS,
    // candidate -> { factor, note }: how much this user likes it (see learn.js).
    affinity = () => ({ factor: 1, note: null }),
  } = {},
) {
  const result = { relevant: [], attention: [], knowing: [], experience: [] };
  // Learned taste scales the recency score (0.5x to 1.5x) and may add a note.
  const pool = candidates.map((c) => {
    const { factor, note } = affinity(c);
    return { c, base: baseScore(c, now) * factor, note };
  });
  const usedSources = new Map();
  const taken = new Set();

  function pick(channel, scoreOf) {
    let best = null;
    for (const entry of pool) {
      if (taken.has(entry)) continue;
      const raw = scoreOf(entry);
      if (raw == null) continue;
      const repeats = usedSources.get(entry.c.source) ?? 0;
      const adjusted = raw * SOURCE_REPEAT_PENALTY ** repeats;
      if (!best || adjusted > best.adjusted) best = { entry, raw, adjusted };
    }
    if (!best) return;
    taken.add(best.entry);
    usedSources.set(best.entry.c.source, (usedSources.get(best.entry.c.source) ?? 0) + 1);
    result[channel].push({
      ...best.entry.c,
      score: toTen(best.raw),
      reason: (channel === "relevant" ? "recent item from your sources" : `matches ${channel} cues`)
        + (best.entry.note ? `; ${best.entry.note}` : ""),
    });
  }

  // Cue-based channels first, in rounds (each gets its best item before any
  // gets a second), so items that match a cue are never taken by Relevant.
  for (let round = 0; round < perChannel; round++) {
    for (const channel of ["attention", "experience", "knowing"]) {
      pick(channel, ({ c, base }) => {
        const hits = lexiconHits(channel, c);
        return hits > 0 ? base + LEXICON_BONUS[channel] * Math.min(hits, 2) / 2 : null;
      });
    }
  }
  // Relevant takes the best of what is left.
  const maxAgeMs = relevantMaxAgeHours * 3_600_000;
  const freshEnough = (c) => !c.published || now - Date.parse(c.published) <= maxAgeMs;
  for (let n = 0; n < perChannel; n++) pick("relevant", ({ c, base }) => (freshEnough(c) ? base : null));

  return result;
}
