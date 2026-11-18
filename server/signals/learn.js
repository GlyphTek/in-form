// What IN-FORM learns from what you do. Deliberately small and explainable: no
// model, just two kinds of weight (per source, per word in titles) worked out
// from your own opens, "Useful" marks and dismissals.
//
//   event values   opened +1, useful +2, dismissed -2 (ignoring an item counts
//                  as nothing: we never punish you for not clicking)
//   decay          an event's weight halves every 30 days, so changing
//                  interests take over
//   weight         sum / (total + 4), between -1 and 1. The +4 means one click
//                  barely moves anything and a pattern moves it a lot; likes
//                  and dismissals of the same thing cancel out
//   affinity       half from the item's source, half from its (up to) three
//                  strongest words, between -1 and 1
//   factor         1 + 0.5 * affinity, so ranking is nudged, never overridden:
//                  an item can be worth between half and one-and-a-half times
//                  its normal score
//
// With no history the factor is exactly 1, so ranking is unchanged until you
// start using Open, Useful and Dismiss.

export const EVENT_VALUES = { opened: 1, useful: 2, dismissed: -2 };
const SMOOTHING = 4;
const HALF_LIFE_DAYS = 30;
const MIN_WORD_WEIGHT = 0.15; // weaker words are ignored
const NOTE_WEIGHT = 0.2; // a word or source must reach this to be named in a reason
const NOTE_AFFINITY = 0.12; // below this overall pull, no reason is given
const MAX_FACTOR_SWING = 0.5;

const STOPWORDS = new Set(
  ("about after again also because been before being between both could does doing down during each "
    + "even every first from further have having here into just like made make many more most much "
    + "must only other over said says should since some such than that their them then there these "
    + "they this those through under until upon very want well were what when where which while "
    + "will with within without would your news today latest update updates new").split(" "),
);

/** Distinct lowercase words of 4+ letters from a title, without filler words or numbers. */
export function tokenize(title) {
  const words = String(title ?? "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(words.filter((w) => w.length >= 4 && !STOPWORDS.has(w) && !/^\d+$/.test(w)))];
}

const sourceKey = (s) => String(s ?? "").trim().toLowerCase();
const decay = (at, now) => 0.5 ** (Math.max(0, now - at) / (HALF_LIFE_DAYS * 86_400_000));

function add(map, key, value) {
  const e = map.get(key) ?? { sum: 0, total: 0 };
  e.sum += value;
  e.total += Math.abs(value);
  map.set(key, e);
}

const weightOf = (e) => (e ? e.sum / (e.total + SMOOTHING) : 0);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/**
 * Build a profile from feedback rows: { title, source, openCount, openedAt,
 * usefulAt, dismissedAt } (timestamps are ISO strings or null).
 */
export function buildProfile(rows, now = Date.now()) {
  const profile = { sources: new Map(), words: new Map(), events: 0 };
  for (const row of rows) {
    const events = [
      [row.openCount > 0 ? row.openedAt : null, EVENT_VALUES.opened],
      [row.usefulAt, EVENT_VALUES.useful],
      [row.dismissedAt, EVENT_VALUES.dismissed],
    ];
    for (const [at, base] of events) {
      const time = at ? Date.parse(at) : NaN;
      if (Number.isNaN(time)) continue;
      const value = base * decay(time, now);
      add(profile.sources, sourceKey(row.source), value);
      for (const word of tokenize(row.title)) add(profile.words, word, value);
      profile.events++;
    }
  }
  return profile;
}

/**
 * How much this profile likes a candidate: { value (-1..1), factor, note }.
 * `note` is a short plain-language reason, or null when the pull is too weak
 * to be worth naming.
 */
export function affinity(profile, candidate) {
  if (!profile || profile.events === 0) return { value: 0, factor: 1, note: null };

  const sourceW = weightOf(profile.sources.get(sourceKey(candidate.source)));
  const words = tokenize(candidate.title)
    .map((word) => ({ word, w: weightOf(profile.words.get(word)) }))
    .filter((x) => Math.abs(x.w) >= MIN_WORD_WEIGHT)
    .sort((a, b) => Math.abs(b.w) - Math.abs(a.w))
    .slice(0, 3);
  const wordTerm = clamp(words.reduce((n, x) => n + x.w, 0) / 2, -1, 1);
  const value = clamp(0.5 * sourceW + 0.5 * wordTerm, -1, 1);

  let note = null;
  if (value >= NOTE_AFFINITY) {
    const parts = [];
    if (sourceW >= NOTE_WEIGHT) parts.push("a source you like");
    const liked = words.filter((x) => x.w >= NOTE_WEIGHT).slice(0, 2).map((x) => x.word);
    if (liked.length) parts.push(`topics you like (${liked.join(", ")})`);
    if (parts.length) note = `boosted: ${parts.join(" and ")}`;
  } else if (value <= -NOTE_AFFINITY) {
    const parts = [];
    if (sourceW <= -NOTE_WEIGHT) parts.push("a source you dismiss");
    const disliked = words.filter((x) => x.w <= -NOTE_WEIGHT).slice(0, 2).map((x) => x.word);
    if (disliked.length) parts.push(`topics you dismissed (${disliked.join(", ")})`);
    if (parts.length) note = `ranked lower: ${parts.join(" and ")}`;
  }
  return { value, factor: 1 + MAX_FACTOR_SWING * value, note };
}

/** A readable summary of what has been learned, strongest first. */
export function summarize(profile, limit = 5) {
  const rank = (map, minTotal) =>
    [...map.entries()]
      .filter(([, e]) => e.total >= minTotal)
      .map(([name, e]) => ({ name, weight: Math.round(weightOf(e) * 100) / 100 }));
  const top = (list, sign) =>
    list
      .filter((x) => x.weight * sign >= NOTE_WEIGHT)
      .sort((a, b) => b.weight * sign - a.weight * sign)
      .slice(0, limit);
  const sources = rank(profile.sources, 0);
  const words = rank(profile.words, 2); // a word needs a pattern, not one click
  return {
    events: profile.events,
    likedSources: top(sources, 1),
    dismissedSources: top(sources, -1),
    likedWords: top(words, 1),
    dismissedWords: top(words, -1),
  };
}
