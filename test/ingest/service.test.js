import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "../helpers.js";
import { loadConfig } from "../../server/config.js";
import { openDatabase, runMigrations } from "../../server/db.js";
import { IngestError } from "../../server/ingest/errors.js";
import { createIngestor } from "../../server/ingest/service.js";

const RSS = fixture("rss2.xml");
const ATOM = fixture("atom.xml");
const SITE_WITH_FEEDS = fixture("site-with-feeds.html");
const SITE_NO_FEED = fixture("site-no-feed.html");
const MIN = 60_000;
const HOUR = 60 * MIN;

function makeEnv(overrides = {}) {
  const db = openDatabase(":memory:");
  runMigrations(db, loadConfig({}).migrationsDir, {});
  const clock = { t: Date.parse("2026-11-17T00:00:00Z") };
  const calls = [];
  const routes = new Map();

  const fetcher = async (url, { headers = {} } = {}) => {
    calls.push({ url, headers });
    const handler = routes.get(url);
    if (!handler) throw new IngestError("http", "HTTP 404", { status: 404 });
    return handler({ url, headers });
  };

  const ingestor = createIngestor({ db, fetcher, now: () => clock.t, ...overrides });
  const ok = (url, body, headers = {}) => ({ status: 200, headers, body, finalUrl: url, notModified: false });
  const notModified = (url) => ({ status: 304, headers: {}, body: "", finalUrl: url, notModified: true });
  const callsTo = (url) => calls.filter((c) => c.url === url).length;
  return { db, clock, calls, routes, ingestor, ok, notModified, callsTo };
}

async function keywordEnv(handler, overrides) {
  const env = makeEnv(overrides);
  const { feedUrl } = await env.ingestor.resolve("quantum computing");
  env.routes.set(feedUrl, handler(env));
  env.feedUrl = feedUrl;
  return env;
}

test("keywords resolve to a news search feed without any network call", async () => {
  const env = makeEnv();
  const r = await env.ingestor.resolve("quantum computing");
  assert.equal(r.kind, "keyword");
  assert.match(r.feedUrl, /^https:\/\/news\.google\.com\/rss\/search\?q=quantum\+computing\+when%3A30d&/);
  assert.equal(env.calls.length, 0);
});

test("first fetch returns clean items; repeat within the TTL is served from cache", async () => {
  const env = await keywordEnv((e) => ({ url }) => e.ok(url, RSS, { etag: '"v1"' }));
  const a = await env.ingestor.getItems("quantum computing");
  assert.equal(a.status, "ok");
  assert.equal(a.fromCache, false);
  assert.ok(a.items.length >= 3);
  assert.ok(!a.items.some((i) => /Malicious/.test(i.title)));

  env.clock.t += 5 * MIN;
  const b = await env.ingestor.getItems("quantum computing");
  assert.equal(b.fromCache, true);
  assert.equal(b.status, "ok");
  assert.equal(env.callsTo(env.feedUrl), 1);
  assert.deepEqual(b.items, a.items);
});

test("after the TTL a conditional request is sent and 304 keeps the cached items", async () => {
  const env = await keywordEnv((e) => ({ url, headers }) =>
    headers["if-none-match"] === '"v1"' ? e.notModified(url) : e.ok(url, RSS, { etag: '"v1"', "last-modified": "Mon, 16 Nov 2026 10:00:00 GMT" }));
  const first = await env.ingestor.getItems("quantum computing");

  env.clock.t += 21 * MIN;
  const second = await env.ingestor.getItems("quantum computing");
  const last = env.calls.at(-1);
  assert.equal(last.headers["if-none-match"], '"v1"');
  assert.equal(last.headers["if-modified-since"], "Mon, 16 Nov 2026 10:00:00 GMT");
  assert.equal(second.status, "ok");
  assert.equal(second.fromCache, false);
  assert.deepEqual(second.items, first.items);
  assert.equal(second.fetchedAt, new Date(env.clock.t).toISOString());
});

test("changed content after the TTL replaces the cached items", async () => {
  let body = RSS;
  const env = await keywordEnv((e) => ({ url }) => e.ok(url, body, { etag: '"x"' }));
  await env.ingestor.getItems("quantum computing");
  body = ATOM;
  env.clock.t += 21 * MIN;
  const r = await env.ingestor.getItems("quantum computing");
  assert.equal(r.items[0].title, "Open source infrastructure update");
  assert.equal(r.title, "Example Atom Blog");
});

test("on failure the last good items are served as stale, with backoff, then recover", async () => {
  let failing = false;
  const env = await keywordEnv((e) => ({ url }) => {
    if (failing) throw new IngestError("timeout", "Request timed out");
    return e.ok(url, RSS, { etag: '"v1"' });
  });
  const good = await env.ingestor.getItems("quantum computing");

  failing = true;
  env.clock.t += 21 * MIN;
  const stale = await env.ingestor.getItems("quantum computing");
  assert.equal(stale.status, "stale");
  assert.deepEqual(stale.items, good.items);
  assert.equal(stale.error.kind, "timeout");
  assert.equal(stale.consecutiveFailures, 1);
  assert.equal(stale.retryAt, new Date(env.clock.t + MIN).toISOString());

  // Inside the backoff window nothing is fetched.
  const before = env.callsTo(env.feedUrl);
  env.clock.t += 30_000;
  const waiting = await env.ingestor.getItems("quantum computing");
  assert.equal(env.callsTo(env.feedUrl), before);
  assert.equal(waiting.status, "stale");

  // After it elapses we retry, and a success clears the failure state.
  failing = false;
  env.clock.t += 31_000;
  const recovered = await env.ingestor.getItems("quantum computing");
  assert.equal(recovered.status, "ok");
  assert.equal(recovered.consecutiveFailures, 0);
  assert.equal(recovered.error, null);
  assert.equal(recovered.retryAt, null);
});

test("backoff doubles on each consecutive failure and is capped", async () => {
  const env = await keywordEnv(() => () => { throw new IngestError("http", "HTTP 503", { status: 503 }); }, {
    backoffBaseMs: MIN,
    backoffMaxMs: 5 * MIN,
  });
  const delays = [];
  for (let i = 0; i < 5; i++) {
    const r = await env.ingestor.getItems("quantum computing");
    delays.push(Date.parse(r.retryAt) - env.clock.t);
    env.clock.t = Date.parse(r.retryAt);
  }
  assert.deepEqual(delays, [1 * MIN, 2 * MIN, 4 * MIN, 5 * MIN, 5 * MIN]);
});

test("stale content older than the limit is reported as an error with no items", async () => {
  let failing = false;
  const env = await keywordEnv((e) => ({ url }) => {
    if (failing) throw new IngestError("network", "ENOTFOUND");
    return e.ok(url, RSS);
  });
  await env.ingestor.getItems("quantum computing");
  failing = true;
  env.clock.t += 49 * HOUR; // beyond the 48h default
  const r = await env.ingestor.getItems("quantum computing");
  assert.equal(r.status, "error");
  assert.deepEqual(r.items, []);
  assert.equal(r.error.kind, "network");
});

test("a source that has never worked reports an error and no items", async () => {
  const env = await keywordEnv(() => () => { throw new IngestError("http", "HTTP 503", { status: 503 }); });
  const r = await env.ingestor.getItems("quantum computing");
  assert.equal(r.status, "error");
  assert.deepEqual(r.items, []);
  assert.equal(r.error.kind, "http");
});

test("a site URL is resolved through feed discovery, then cached", async () => {
  const env = makeEnv();
  const site = "https://example.com/news";
  const feed = "https://example.com/atom/all.xml";
  env.routes.set(site, ({ url }) => env.ok(url, SITE_WITH_FEEDS));
  env.routes.set(feed, ({ url }) => env.ok(url, ATOM));

  const r = await env.ingestor.getItems(site);
  assert.equal(r.status, "ok");
  assert.equal(r.kind, "site");
  assert.equal(r.feedUrl, feed);
  assert.equal(r.items[0].title, "Open source infrastructure update");
  assert.equal(env.callsTo(site), 1);
  assert.equal(env.callsTo(feed), 1, "resolution should prime the feed cache");

  // Later refreshes hit the feed but never re-run discovery on the homepage.
  env.clock.t += 21 * MIN;
  await env.ingestor.getItems(site);
  assert.equal(env.callsTo(site), 1);
  assert.equal(env.callsTo(feed), 2);
  const row = env.db.prepare("SELECT * FROM resolutions WHERE input = ?").get(site);
  assert.equal(row.feed_url, feed);
});

test("a site URL that already serves a feed resolves to itself", async () => {
  const env = makeEnv();
  const url = "https://example.com/blog";
  env.routes.set(url, ({ url: u }) => env.ok(u, RSS));
  const r = await env.ingestor.getItems(url);
  assert.equal(r.status, "ok");
  assert.equal(r.feedUrl, url);
  assert.equal(env.callsTo(url), 1);
});

test("a site with no feed reports no_feed and the failure is cached briefly", async () => {
  const env = makeEnv();
  const site = "https://nofeed.example.com/";
  env.routes.set(site, ({ url }) => env.ok(url, SITE_NO_FEED));

  const a = await env.ingestor.getItems(site);
  assert.equal(a.status, "error");
  assert.equal(a.error.kind, "no_feed");
  assert.match(a.error.message, /nofeed\.example\.com/);
  const attempts = env.calls.length;
  assert.ok(attempts > 1, "should have tried conventional feed paths");

  const b = await env.ingestor.getItems(site);
  assert.equal(b.error.kind, "no_feed");
  assert.equal(env.calls.length, attempts, "cached failure must not refetch");

  env.clock.t += 61 * MIN;
  await env.ingestor.getItems(site);
  assert.ok(env.calls.length > attempts, "retries once the failure cache expires");
});

test("a failing source never breaks the others", async () => {
  const env = makeEnv();
  const { feedUrl } = await env.ingestor.resolve("physics");
  env.routes.set(feedUrl, ({ url }) => env.ok(url, RSS));
  env.routes.set("https://blocked.example.com/feed.xml", () => { throw new IngestError("blocked", "Address is not allowed"); });

  const results = await Promise.all([
    env.ingestor.getItems("physics"),
    env.ingestor.getItems("https://blocked.example.com/feed.xml"),
    env.ingestor.getItems("javascript:alert(1)"),
    env.ingestor.getItems("   "),
  ]);
  assert.deepEqual(results.map((r) => r.status), ["ok", "error", "error", "error"]);
  assert.deepEqual(results.slice(1).map((r) => r.error.kind), ["blocked", "invalid_input", "invalid_input"]);
  assert.deepEqual(results.slice(1).map((r) => r.items), [[], [], []]);
});

test("concurrent requests for the same feed share one fetch", async () => {
  const env = await keywordEnv((e) => async ({ url }) => {
    await new Promise((r) => setTimeout(r, 25));
    return e.ok(url, RSS);
  });
  const [a, b, c] = await Promise.all([
    env.ingestor.getItems("quantum computing"),
    env.ingestor.getItems("quantum computing"),
    env.ingestor.getItems("quantum computing"),
  ]);
  assert.equal(env.callsTo(env.feedUrl), 1);
  assert.deepEqual(a.items, b.items);
  assert.deepEqual(b.items, c.items);
});

test("listHealth summarises every known feed", async () => {
  const env = makeEnv();
  const good = (await env.ingestor.resolve("physics")).feedUrl;
  const bad = "https://down.example.com/feed.xml";
  env.routes.set(good, ({ url }) => env.ok(url, RSS));
  env.routes.set(bad, () => { throw new IngestError("http", "HTTP 500", { status: 500 }); });
  await env.ingestor.getItems("physics");
  await env.ingestor.getItems(bad);

  const health = env.ingestor.listHealth();
  const byUrl = Object.fromEntries(health.map((h) => [h.url, h]));
  assert.equal(byUrl[good].status, "ok");
  assert.ok(byUrl[good].itemCount >= 3);
  assert.equal(byUrl[good].title, "Example Physics & Tech");
  assert.equal(byUrl[bad].status, "error");
  assert.equal(byUrl[bad].consecutiveFailures, 1);
  assert.equal(byUrl[bad].error.kind, "http");
  assert.ok(byUrl[bad].retryAt);
});

test("state survives a new ingestor on the same database (cache is persisted)", async () => {
  const env = await keywordEnv((e) => ({ url }) => e.ok(url, RSS));
  await env.ingestor.getItems("quantum computing");

  const second = createIngestor({ db: env.db, fetcher: async () => { throw new Error("must not fetch"); }, now: () => env.clock.t });
  const r = await second.getItems("quantum computing");
  assert.equal(r.status, "ok");
  assert.equal(r.fromCache, true);
  assert.ok(r.items.length >= 3);
});
