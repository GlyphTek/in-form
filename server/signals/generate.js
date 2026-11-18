// Orchestrates one signal run: fetch every declared source (in parallel, with a
// concurrency cap and an overall deadline), then rank into the RAKE channels.
//
// Response contract (also what the frontend relies on):
//   status   "ok"          every source delivered
//            "partial"     some sources failed or timed out
//            "unavailable" sources were declared but none delivered
//            "no_sources"  nothing declared
//   channels { relevant|attention|knowing|experience: {title, linkText, link,
//              source, published, score (1-10), reason} | null }
//   sources  per-source health so the UI can say exactly what is broken
//   platforms link-outs only; never turned into fake items

import { assignChannels, CHANNELS } from "./rank.js";

const MAX_ITEMS_PER_SOURCE = 10;

function linkLabel(link) {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "Open link";
  }
}

// Platform names are free text. Known names map to their home page; anything
// else only becomes a link if it looks like a domain. Never invent a URL.
const KNOWN_PLATFORMS = {
  linkedin: "https://www.linkedin.com",
  github: "https://github.com",
  youtube: "https://www.youtube.com",
  x: "https://x.com",
  twitter: "https://x.com",
  reddit: "https://www.reddit.com",
  facebook: "https://www.facebook.com",
  instagram: "https://www.instagram.com",
  medium: "https://medium.com",
  stackoverflow: "https://stackoverflow.com",
  "stack overflow": "https://stackoverflow.com",
  mastodon: "https://joinmastodon.org",
  bluesky: "https://bsky.app",
  discord: "https://discord.com",
  slack: "https://slack.com",
  substack: "https://substack.com",
  tiktok: "https://www.tiktok.com",
  twitch: "https://www.twitch.tv",
};

export function platformLink(name) {
  const key = name.trim().toLowerCase();
  if (KNOWN_PLATFORMS[key]) return KNOWN_PLATFORMS[key];
  if (/^(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/:?#]\S*)?$/i.test(key)) {
    try {
      const url = new URL(/^https?:\/\//i.test(key) ? name.trim() : `https://${name.trim()}`);
      if (url.protocol === "http:" || url.protocol === "https:") return url.href;
    } catch {
      /* fall through */
    }
  }
  return null;
}

async function mapWithLimit(values, limit, fn) {
  const results = new Array(values.length);
  let next = 0;
  async function worker() {
    while (next < values.length) {
      const i = next++;
      results[i] = await fn(values[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

// Resolves with the work's result or a timeout marker. The work itself keeps
// running, so a slow source still warms the cache for the next request.
function withDeadline(promise, ms) {
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), ms);
  });
  return Promise.race([promise.then((value) => ({ value })), deadline]).finally(() => clearTimeout(timer));
}

export async function generateSignals({
  ingestor,
  sources = [],
  platforms = [],
  now = Date.now,
  concurrency = 5,
  deadlineMs = 25_000,
  log,
}) {
  const startedAt = now();
  const platformLinks = platforms.map((name) => ({ name, url: platformLink(name) }));

  if (sources.length === 0) {
    return {
      status: "no_sources",
      generatedAt: new Date(startedAt).toISOString(),
      channels: Object.fromEntries(CHANNELS.map((c) => [c, null])),
      sources: [],
      platforms: platformLinks,
    };
  }

  const deadlineAt = startedAt + deadlineMs;
  const fetched = await mapWithLimit(sources, concurrency, async (input) => {
    const remaining = Math.max(0, deadlineAt - now());
    const outcome = await withDeadline(ingestor.getItems(input), remaining);
    if (outcome.timedOut) {
      log?.warn?.({ input }, "source did not finish before the deadline");
      return {
        input,
        status: "error",
        items: [],
        error: { kind: "timeout", message: "Source took too long to respond" },
      };
    }
    return outcome.value;
  });

  const candidates = [];
  const sourceReports = fetched.map((result) => {
    for (const item of result.items.slice(0, MAX_ITEMS_PER_SOURCE)) {
      candidates.push({
        title: item.title,
        link: item.link,
        linkText: linkLabel(item.link),
        published: item.published,
        summary: item.summary,
        source: result.input,
        sourceKind: result.kind,
      });
    }
    return {
      input: result.input,
      kind: result.kind,
      status: result.status,
      itemCount: result.items.length,
      fetchedAt: result.fetchedAt ?? null,
      error: result.error ?? null,
    };
  });

  const delivered = sourceReports.filter((s) => s.status !== "error").length;
  let status = "ok";
  if (delivered === 0) status = "unavailable";
  else if (delivered < sourceReports.length || sourceReports.some((s) => s.status === "stale")) status = "partial";

  const assigned = assignChannels(candidates, { now: now() });
  const channels = {};
  for (const channel of CHANNELS) {
    const a = assigned[channel];
    channels[channel] = a
      ? {
          title: a.title,
          link: a.link,
          linkText: a.linkText,
          source: a.source,
          published: a.published,
          score: a.score,
          reason: a.reason,
        }
      : null;
  }

  return {
    status,
    generatedAt: new Date(startedAt).toISOString(),
    channels,
    sources: sourceReports,
    platforms: platformLinks,
  };
}
