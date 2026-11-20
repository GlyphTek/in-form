// Orchestrates one signal run: fetch every declared source (in parallel, with a
// concurrency cap and an overall deadline), then rank into the RAKE channels.
//
// Response contract (also what the frontend relies on):
//   status   "ok"          every source delivered
//            "partial"     some sources failed or timed out
//            "unavailable" sources were declared but none delivered
//            "no_sources"  nothing declared
//   channels { relevant|attention|knowing|experience: [ {title, linkText, link,
//              source, published, score (1-10), reason}, ... up to 3, best
//              first ] }; an empty array means nothing suitable
//   caughtUp true only when every declared source delivered fresh data and
//            nothing is left to show in any channel. A failing, stale or
//            timed-out source never counts: empty cards then mean "broken", not
//            "done", and the app must keep saying so.
//   hidden   { seen, dismissed }: items left out because the user was already
//            shown them, or dismissed them (see `exclude`)
//   sources  per-source health so the UI can say exactly what is broken

import { assignChannels, CHANNELS } from "./rank.js";
import { normalizeUrl, titleKey } from "../ingest/normalize.js";
import { TOPIC_PREFIX, getTopic } from "../topics.js";
import { editionsFor, getRegion } from "../regions.js";

const MAX_ITEMS_PER_SOURCE = 15;

function linkLabel(link) {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "Open link";
  }
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


// Which fetches one configured source turns into, given the region choice.
// Only topics with regional variants (News, Sport, Education) are affected;
// everything else is fetched once, exactly as typed.
//   global  the plain topic
//   local   one fetch per regional edition of the chosen continent
//   both    the plain topic plus the regional editions
// A continent with no English edition gives no local fetches, and `note` says so.
function planSource(input, region) {
  const plan = { input, fetches: [input], note: null, noLocal: false };
  if (!region || region.scope === "global" || !region.area) return plan;
  const lower = input.toLowerCase();
  if (!lower.startsWith(TOPIC_PREFIX)) return plan;
  const topic = getTopic(lower.slice(TOPIC_PREFIX.length));
  if (!topic?.local) return plan;

  const editions = editionsFor(region.area);
  const regionLabel = getRegion(region.area)?.label ?? region.area;
  if (editions.length === 0) {
    plan.noLocal = true;
    plan.note = `No English-language local sources for ${regionLabel} yet`;
    plan.fetches = region.scope === "both" ? [input] : [];
    return plan;
  }
  const local = editions.map((e) => `${input}@${e.code.toLowerCase()}`);
  plan.fetches = region.scope === "local" ? local : [input, ...local];
  return plan;
}

const byNewest = (a, b) => (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0);

// Folds the results of a source's fetches back into one result.
function mergeResults(plan, parts) {
  if (plan.fetches.length === 0) {
    return {
      input: plan.input,
      kind: "topic",
      status: "error",
      items: [],
      error: { kind: "no_regional_sources", message: `${plan.note}. Choose Global or Both to see this topic.` },
    };
  }
  if (parts.length === 1 && !plan.note) return { ...parts[0], input: plan.input };

  const delivered = parts.filter((p) => p.status !== "error");
  const pool = delivered.length ? delivered : parts;
  const status = delivered.length === 0 ? "error" : delivered.some((p) => p.status === "ok") ? "ok" : "stale";
  const times = delivered.map((p) => p.fetchedAt).filter(Boolean).sort();
  return {
    input: plan.input,
    kind: pool.find((p) => p.kind)?.kind ?? null,
    label: pool.find((p) => p.label)?.label ?? null,
    status,
    items: delivered.flatMap((p) => p.items).sort(byNewest),
    fetchedAt: times.length ? times[times.length - 1] : null,
    error: delivered.length ? null : parts.find((p) => p.error)?.error ?? null,
    note: plan.note,
    // What each fetch did, so a failing edition shows up even when another one
    // delivered. Only present when a source was fetched more than one way.
    editions: parts.map((p, i) => ({
      input: plan.fetches[i],
      status: p.status,
      itemCount: p.items.length,
      error: p.error ?? null,
    })),
  };
}

export async function generateSignals({
  ingestor,
  sources = [],
  now = Date.now,
  concurrency = 5,
  deadlineMs = 25_000,
  // exclude(item) returns "seen", "dismissed" or a falsy value. Excluded items
  // are dropped before ranking so the next-best items fill the channels.
  exclude = () => false,
  relevantMaxAgeHours,
  affinity,
  // { scope: "local" | "global" | "both", area: continent id }, or null for global.
  region = null,
  log,
}) {
  const startedAt = now();
  if (sources.length === 0) {
    return {
      status: "no_sources",
      generatedAt: new Date(startedAt).toISOString(),
      channels: Object.fromEntries(CHANNELS.map((c) => [c, []])),
      caughtUp: false,
      hidden: { seen: 0, dismissed: 0 },
      sources: [],
    };
  }

  const deadlineAt = startedAt + deadlineMs;
  const plans = sources.map((input) => planSource(input, region));
  const fetchedParts = await mapWithLimit(plans.flatMap((p) => p.fetches), concurrency, async (input) => {
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
  let cursor = 0;
  const fetched = plans.map((plan) => {
    const parts = fetchedParts.slice(cursor, cursor + plan.fetches.length);
    cursor += plan.fetches.length;
    return mergeResults(plan, parts);
  });

  const candidates = [];
  const hidden = { seen: 0, dismissed: 0 };
  const inThisRun = new Set(); // the same story from two sources counts once
  const sourceReports = fetched.map((result) => {
    const fresh = [];
    for (const item of result.items) {
      const reason = exclude(item);
      if (reason) {
        hidden[reason === "dismissed" ? "dismissed" : "seen"]++;
        continue;
      }
      const keys = [`u:${normalizeUrl(item.link)}`, `t:${titleKey(item.title)}`];
      if (keys.some((k) => inThisRun.has(k))) continue;
      keys.forEach((k) => inThisRun.add(k));
      fresh.push(item);
    }
    for (const item of fresh.slice(0, MAX_ITEMS_PER_SOURCE)) {
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
      label: result.label ?? null,
      note: result.note ?? null,
      ...(result.editions ? { editions: result.editions } : {}),
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

  const assigned = assignChannels(candidates, { now: now(), relevantMaxAgeHours, affinity });
  const channels = {};
  for (const channel of CHANNELS) {
    channels[channel] = assigned[channel].map((a) => ({
      title: a.title,
      link: a.link,
      linkText: a.linkText,
      source: a.source,
      published: a.published,
      score: a.score,
      reason: a.reason,
    }));
  }

  // Caught up = a complete, healthy run that has nothing left to show.
  const nothingShown = CHANNELS.every((channel) => channels[channel].length === 0);
  const caughtUp = nothingShown && sourceReports.length > 0 && sourceReports.every((s) => s.status === "ok");

  return {
    status,
    generatedAt: new Date(startedAt).toISOString(),
    channels,
    caughtUp,
    hidden,
    sources: sourceReports,
  };
}
