// The ingestion service: turn a user-declared source into cached, healthy items.
//
//   resolve(input)    detect keyword/site/feed and find the feed URL
//   getItems(input)   items + health for one source; never throws for
//                     source-level failures, so one bad source cannot break a run
//   listHealth()      per-feed health for the Active Sources panel
//
// Behaviour worth knowing:
//   - Fresh cache (younger than ttlMs) is served without any network call.
//   - Expired entries are revalidated with If-None-Match / If-Modified-Since.
//   - On failure we serve the last good items marked "stale" for up to
//     maxStaleMs, then report "error" with no items rather than showing old news
//     as current.
//   - Failures back off exponentially so a dead feed is not hammered.
//   - Concurrent requests for the same feed share one fetch.

import { IngestError } from "./errors.js";
import { detectSource } from "./detect.js";
import { discoverFeedLinks, fallbackFeedUrls, MAX_CANDIDATES } from "./discover.js";
import { looksLikeHtml, parseFeed } from "./parse.js";

const NOOP_LOG = { info() {}, warn() {}, error() {}, debug() {} };

export function createIngestor({
  db,
  fetcher,
  ttlMs = 20 * 60_000,
  maxStaleMs = 48 * 3600_000,
  resolutionTtlMs = 7 * 24 * 3600_000,
  failedResolutionTtlMs = 3600_000,
  backoffBaseMs = 60_000,
  backoffMaxMs = 6 * 3600_000,
  maxItemsPerFeed = 30,
  news = { hl: "en-US", gl: "US", ceid: "US:en", when: "30d" },
  now = Date.now,
  log = NOOP_LOG,
}) {
  if (!db || !fetcher) throw new Error("createIngestor needs { db, fetcher }");

  const getFeedRow = db.prepare("SELECT * FROM feeds WHERE url = ?");
  const putFeedRow = db.prepare(`
    INSERT INTO feeds (url, title, etag, last_modified, items_json, fetched_at, last_success_at,
                       last_attempt_at, next_attempt_at, last_error_kind, last_error_message, consecutive_failures)
    VALUES (@url, @title, @etag, @last_modified, @items_json, @fetched_at, @last_success_at,
            @last_attempt_at, @next_attempt_at, @last_error_kind, @last_error_message, @consecutive_failures)
    ON CONFLICT(url) DO UPDATE SET
      title = excluded.title, etag = excluded.etag, last_modified = excluded.last_modified,
      items_json = excluded.items_json, fetched_at = excluded.fetched_at,
      last_success_at = excluded.last_success_at, last_attempt_at = excluded.last_attempt_at,
      next_attempt_at = excluded.next_attempt_at, last_error_kind = excluded.last_error_kind,
      last_error_message = excluded.last_error_message, consecutive_failures = excluded.consecutive_failures
  `);
  const getResolution = db.prepare("SELECT * FROM resolutions WHERE input = ?");
  const putResolution = db.prepare(`
    INSERT INTO resolutions (input, kind, feed_url, resolved_at, error_kind, error_message)
    VALUES (@input, @kind, @feed_url, @resolved_at, @error_kind, @error_message)
    ON CONFLICT(input) DO UPDATE SET kind = excluded.kind, feed_url = excluded.feed_url,
      resolved_at = excluded.resolved_at, error_kind = excluded.error_kind, error_message = excluded.error_message
  `);

  const inflight = new Map();
  function shared(key, work) {
    if (inflight.has(key)) return inflight.get(key);
    const promise = work().finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
  }

  function newsUrl(query) {
    const q = news.when ? `${query} when:${news.when}` : query;
    const params = new URLSearchParams({ q, hl: news.hl, gl: news.gl, ceid: news.ceid });
    return `https://news.google.com/rss/search?${params}`;
  }

  // --- feed storage ----------------------------------------------------------

  function saveSuccess(url, row, parsed, headers) {
    const t = now();
    putFeedRow.run({
      url,
      title: parsed ? parsed.title : row?.title ?? null,
      etag: headers.etag ?? row?.etag ?? null,
      last_modified: headers["last-modified"] ?? row?.last_modified ?? null,
      items_json: parsed ? JSON.stringify(parsed.items) : row?.items_json ?? null,
      fetched_at: t,
      last_success_at: t,
      last_attempt_at: t,
      next_attempt_at: null,
      last_error_kind: null,
      last_error_message: null,
      consecutive_failures: 0,
    });
  }

  function saveFailure(url, row, err) {
    const t = now();
    const failures = (row?.consecutive_failures ?? 0) + 1;
    const delay = Math.min(backoffBaseMs * 2 ** (failures - 1), backoffMaxMs);
    putFeedRow.run({
      url,
      title: row?.title ?? null,
      etag: row?.etag ?? null,
      last_modified: row?.last_modified ?? null,
      items_json: row?.items_json ?? null,
      fetched_at: row?.fetched_at ?? null,
      last_success_at: row?.last_success_at ?? null,
      last_attempt_at: t,
      next_attempt_at: t + delay,
      last_error_kind: err instanceof IngestError ? err.kind : "network",
      last_error_message: String(err?.message ?? err).slice(0, 300),
      consecutive_failures: failures,
    });
  }

  // Shape a stored row into what callers see.
  function present(row, extra = {}) {
    const t = now();
    const items = row?.items_json ? JSON.parse(row.items_json) : [];
    const failing = (row?.consecutive_failures ?? 0) > 0;
    const stalenessMs = row?.last_success_at ? t - row.last_success_at : Infinity;
    let status = "ok";
    if (failing) status = items.length && stalenessMs <= maxStaleMs ? "stale" : "error";
    return {
      status,
      items: status === "error" ? [] : items,
      title: row?.title ?? null,
      fetchedAt: row?.last_success_at ? new Date(row.last_success_at).toISOString() : null,
      error: failing ? { kind: row.last_error_kind, message: row.last_error_message } : null,
      consecutiveFailures: row?.consecutive_failures ?? 0,
      retryAt: failing && row.next_attempt_at ? new Date(row.next_attempt_at).toISOString() : null,
      fromCache: false,
      ...extra,
    };
  }

  async function fetchAndParse(url, conditional) {
    const headers = {};
    if (conditional?.etag) headers["if-none-match"] = conditional.etag;
    if (conditional?.last_modified) headers["if-modified-since"] = conditional.last_modified;
    const res = await fetcher(url, { headers });
    if (res.notModified) return { res, parsed: null };
    return { res, parsed: await parseFeed(res.body, { maxItems: maxItemsPerFeed, now: now() }) };
  }

  function loadFeed(url) {
    return shared(`feed:${url}`, async () => {
      const row = getFeedRow.get(url);
      const t = now();

      if (row?.fetched_at && !row.consecutive_failures && t - row.fetched_at < ttlMs) {
        return present(row, { fromCache: true });
      }
      if (row?.next_attempt_at && t < row.next_attempt_at) {
        return present(row, { fromCache: true });
      }

      try {
        const usable = row?.items_json ? row : null; // a 304 is only useful if we have items
        const { res, parsed } = await fetchAndParse(url, usable);
        saveSuccess(url, row, parsed, res.headers);
      } catch (err) {
        log.warn({ feed: url, kind: err.kind, message: err.message }, "feed refresh failed");
        saveFailure(url, row, err);
      }
      return present(getFeedRow.get(url));
    });
  }

  // --- resolution --------------------------------------------------------------

  async function resolveByFetching(detected) {
    const first = await fetcher(detected.url, {});
    try {
      const parsed = await parseFeed(first.body, { maxItems: maxItemsPerFeed, now: now() });
      saveSuccess(first.finalUrl, getFeedRow.get(first.finalUrl), parsed, first.headers);
      return first.finalUrl;
    } catch (err) {
      if (!(err instanceof IngestError) || err.kind !== "parse" || !looksLikeHtml(first.body)) throw err;
    }

    const candidates = [
      ...discoverFeedLinks(first.body, first.finalUrl),
      ...fallbackFeedUrls(first.finalUrl),
    ].slice(0, MAX_CANDIDATES + 3);

    let lastError = null;
    for (const candidate of [...new Set(candidates)]) {
      try {
        const res = await fetcher(candidate, {});
        const parsed = await parseFeed(res.body, { maxItems: maxItemsPerFeed, now: now() });
        saveSuccess(res.finalUrl, getFeedRow.get(res.finalUrl), parsed, res.headers);
        return res.finalUrl;
      } catch (err) {
        lastError = err;
        if (err.kind === "blocked") continue;
      }
    }
    throw new IngestError(
      "no_feed",
      `No feed found on ${new URL(first.finalUrl).host}${lastError ? ` (last error: ${lastError.kind})` : ""}. Paste the feed URL directly.`,
    );
  }

  async function resolve(input) {
    const detected = detectSource(input); // throws IngestError("invalid_input")
    if (detected.kind === "keyword" || detected.kind === "topic") {
      return { kind: detected.kind, input: detected.input, label: detected.label, feedUrl: newsUrl(detected.query) };
    }

    return shared(`resolve:${detected.url}`, async () => {
      const t = now();
      const cached = getResolution.get(detected.url);
      if (cached) {
        const ttl = cached.error_kind ? failedResolutionTtlMs : resolutionTtlMs;
        if (t - cached.resolved_at < ttl) {
          if (cached.error_kind) throw new IngestError(cached.error_kind, cached.error_message);
          return { kind: detected.kind, input: detected.input, feedUrl: cached.feed_url };
        }
      }
      try {
        const feedUrl = await resolveByFetching(detected);
        putResolution.run({
          input: detected.url, kind: detected.kind, feed_url: feedUrl, resolved_at: t,
          error_kind: null, error_message: null,
        });
        return { kind: detected.kind, input: detected.input, feedUrl };
      } catch (err) {
        log.warn({ input: detected.url, kind: err.kind, message: err.message }, "source resolution failed");
        putResolution.run({
          input: detected.url, kind: detected.kind, feed_url: null, resolved_at: t,
          error_kind: err.kind ?? "network", error_message: String(err.message).slice(0, 300),
        });
        throw err;
      }
    });
  }

  // --- public API ---------------------------------------------------------------

  async function getItems(input) {
    try {
      const resolved = await resolve(input);
      const feed = await loadFeed(resolved.feedUrl);
      return { input, kind: resolved.kind, label: resolved.label ?? null, feedUrl: resolved.feedUrl, ...feed };
    } catch (err) {
      return {
        input,
        kind: null,
        feedUrl: null,
        status: "error",
        items: [],
        title: null,
        fetchedAt: null,
        error: { kind: err.kind ?? "network", message: err.message },
        consecutiveFailures: 0,
        retryAt: null,
        fromCache: false,
      };
    }
  }

  // Health of everything we know about: resolved feeds, plus sources that could
  // not even be resolved to a feed (those never get a feed row, but the user
  // still needs to see that they are broken).
  function listHealth() {
    const feeds = db
      .prepare("SELECT * FROM feeds ORDER BY url")
      .all()
      .map((row) => {
        const p = present(row);
        return {
          url: row.url,
          title: row.title,
          status: p.status,
          itemCount: row.items_json ? JSON.parse(row.items_json).length : 0,
          lastSuccessAt: p.fetchedAt,
          error: p.error,
          consecutiveFailures: p.consecutiveFailures,
          retryAt: p.retryAt,
          unresolved: false,
        };
      });

    const unresolved = db
      .prepare("SELECT * FROM resolutions WHERE error_kind IS NOT NULL ORDER BY input")
      .all()
      .map((row) => ({
        url: row.input,
        title: null,
        status: "error",
        itemCount: 0,
        lastSuccessAt: null,
        error: { kind: row.error_kind, message: row.error_message },
        consecutiveFailures: 1,
        retryAt: new Date(row.resolved_at + failedResolutionTtlMs).toISOString(),
        unresolved: true,
      }));

    return [...feeds, ...unresolved];
  }

  return { resolve, getItems, listHealth };
}
