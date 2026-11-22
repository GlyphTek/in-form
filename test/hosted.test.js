import { test } from "node:test";
import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { testConfig } from "./helpers.js";
import { buildApp } from "../server/app.js";
import { openDatabase } from "../server/db.js";
import { createSignalStore } from "../server/store/signals.js";
import { LIMITS } from "../server/routes/hosted.js";

const NOW = Date.now();
const generateOptions = { now: () => NOW };

// Six recent items per topic, all different, so repeated presses keep finding new ones.
function stubIngestor() {
  return {
    async getItems(input) {
      const id = input.replace(/^topic:/, "").replace(/@.*/, "");
      const items = Array.from({ length: 6 }, (_, i) => ({
        title: `${id} story number ${i + 1} about harbour planning`,
        link: `https://news.example/${encodeURIComponent(input)}/${i + 1}`,
        published: new Date(NOW - (i + 1) * 3_600_000).toISOString(),
        summary: "",
      }));
      return { input, kind: "topic", label: id, status: "ok", fetchedAt: null, error: null, items };
    },
    listHealth: () => [],
  };
}

async function hostedApp(overrides = {}, extra = {}) {
  const db = openDatabase(":memory:");
  const app = await buildApp(testConfig({ mode: "hosted", ...overrides }), { db, ingestor: stubIngestor(), generateOptions, ...extra });
  return { app, db };
}

const post = (app, payload) => app.inject({ method: "POST", url: "/api/v1/generate", payload });
const keysOf = (result) => Object.values(result.channels).flat().map((i) => i.key);
// The signed-in answer also carries per-item server state (`id`, and `useful` from its database); the
// stateless one carries a `key` instead, and the phone tracks "useful" itself. Everything else must match.
const PER_PERSON = new Set(["id", "key", "useful"]);
const strip = (result) => JSON.parse(JSON.stringify(result, (k, v) => (PER_PERSON.has(k) ? undefined : v)));

test("local mode has no stateless endpoint, so a password-protected copy can't be used without signing in", async () => {
  const app = await buildApp(testConfig(), { db: openDatabase(":memory:"), ingestor: stubIngestor(), generateOptions });
  const res = await post(app, { topics: ["technology"] });
  assert.equal(res.statusCode, 404);
  await app.close();
});

test("hosted mode has no accounts: no sign-in, no saved setup, no per-person routes", async () => {
  const { app } = await hostedApp();
  for (const [method, url] of [["GET", "/api/config"], ["GET", "/api/auth/me"], ["POST", "/api/signals/generate"], ["GET", "/api/learning"], ["PUT", "/api/signals/1/state"]]) {
    const res = await app.inject({ method, url, payload: method === "GET" ? undefined : {} });
    assert.equal(res.statusCode, 404, `${method} ${url} should not exist`);
  }
  const health = await app.inject({ method: "GET", url: "/api/health" });
  assert.equal(health.json().mode, "hosted");
  await app.close();
});

test("the topic list is public in hosted mode and says nothing about anyone", async () => {
  const { app } = await hostedApp();
  const res = await app.inject({ method: "GET", url: "/api/topics" });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.topics.length >= 7 && body.regions.length >= 6);
  assert.deepEqual(Object.keys(body).sort(), ["regions", "topics"]);
  await app.close();
});

test("a run returns channels with item keys, and writes nothing about the person", async () => {
  const { app, db } = await hostedApp();
  const res = await post(app, { topics: ["technology", "news"], region: { scope: "both", area: "oceania" }, seen: [], dismissed: [], feedback: [] });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.status, "ok");
  const items = Object.values(body.channels).flat();
  assert.ok(items.length > 0);
  for (const item of items) {
    assert.match(item.key, /^https:\/\/news\.example\//);
    assert.equal(item.id, undefined, "no server-side id exists");
  }
  assert.equal(res.headers["cache-control"], "no-store");
  for (const table of ["users", "sessions", "sources", "platforms", "signals"]) {
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0, `${table} must stay empty`);
  }
  await app.close();
});

test("only the built-in topics can be fetched: no sites, feeds or keywords", async () => {
  const { app } = await hostedApp();
  for (const topics of [["https://evil.example/feed.xml"], ["topic:technology"], ["nonsense"], ["technology", "technology"]]) {
    const res = await post(app, { topics });
    assert.equal(res.statusCode, 400, JSON.stringify(topics));
  }
  const extra = await post(app, { topics: ["technology"], sources: ["https://evil.example"] });
  assert.equal(extra.statusCode, 400, "unknown fields are refused");
  const none = await post(app, { topics: [] });
  assert.equal(none.statusCode, 200);
  assert.equal(none.json().status, "no_sources");
  await app.close();
});

test("items already seen are left out, and pressing on reaches caught up", async () => {
  const { app } = await hostedApp();
  const seen = [];
  const first = (await post(app, { topics: ["technology"], seen })).json();
  const firstKeys = keysOf(first);
  assert.ok(firstKeys.length > 0);
  seen.push(...firstKeys);
  const second = (await post(app, { topics: ["technology"], seen })).json();
  for (const key of keysOf(second)) assert.ok(!firstKeys.includes(key), "an item is offered once");
  assert.ok(second.hidden.seen >= firstKeys.length);

  let result = second;
  for (let i = 0; i < 6 && !result.caughtUp; i++) {
    seen.push(...keysOf(result));
    result = (await post(app, { topics: ["technology"], seen })).json();
  }
  assert.equal(result.caughtUp, true, "everything seen: the app can finish");
  await app.close();
});

test("dismissed items stay hidden and are counted separately", async () => {
  const { app } = await hostedApp();
  const first = (await post(app, { topics: ["technology"] })).json();
  const key = keysOf(first)[0];
  const again = (await post(app, { topics: ["technology"], dismissed: [key] })).json();
  assert.ok(!keysOf(again).includes(key));
  assert.equal(again.hidden.dismissed, 1);
  await app.close();
});

test("feedback sent with the request nudges the ranking", async () => {
  const { app } = await hostedApp();
  const first = (await post(app, { topics: ["technology"] })).json();
  const item = Object.values(first.channels).flat()[0];
  const liked = { title: item.title, source: item.source, openCount: 1, openedAt: new Date(NOW).toISOString(), usefulAt: new Date(NOW).toISOString(), dismissedAt: null };
  const withFeedback = (await post(app, { topics: ["technology"], feedback: [liked, liked, liked] })).json();
  const reasons = Object.values(withFeedback.channels).flat().map((i) => i.reason).join(" | ");
  assert.match(reasons, /boosted/, reasons);
  await app.close();
});

test("the stateless run gives the same answer as the signed-in one for the same history", async () => {
  // Signed-in (local) app: a first run, then an open, a useful mark and a dismissal.
  const db = openDatabase(":memory:");
  const local = await buildApp(testConfig(), { db, ingestor: stubIngestor(), generateOptions });
  const sources = ["topic:technology", "topic:news"];
  const first = (await local.inject({ method: "POST", url: "/api/signals/generate", payload: { sources, region: { scope: "both", area: "oceania" } } })).json();
  const shown = Object.values(first.channels).flat();
  assert.ok(shown.length >= 3);
  await local.inject({ method: "POST", url: `/api/signals/${shown[0].id}/open` });
  await local.inject({ method: "PUT", url: `/api/signals/${shown[1].id}/state`, payload: { useful: true } });
  await local.inject({ method: "PUT", url: `/api/signals/${shown[2].id}/state`, payload: { dismissed: true } });

  // What the phone would be holding at this point.
  const userId = db.prepare("SELECT id FROM users LIMIT 1").get().id;
  const store = createSignalStore(db);
  const seen = [], dismissed = [];
  for (const [key, state] of store.seenKeys(userId)) (state === "dismissed" ? dismissed : seen).push(key);
  const feedback = store.feedbackRows(userId);
  assert.ok(feedback.length >= 3);

  const signedIn = (await local.inject({ method: "POST", url: "/api/signals/generate", payload: { sources, region: { scope: "both", area: "oceania" } } })).json();
  const { app } = await hostedApp();
  const stateless = (await post(app, { topics: ["technology", "news"], region: { scope: "both", area: "oceania" }, seen, dismissed, feedback })).json();

  assert.deepEqual(strip(stateless), strip(signedIn));
  assert.ok(Object.values(stateless.channels).flat().length > 0, "the comparison is not of two empty results");
  await local.close();
  await app.close();
});

test("size limits stop an oversized or runaway request", async () => {
  const { app } = await hostedApp();
  const tooManySeen = await post(app, { topics: ["technology"], seen: Array.from({ length: LIMITS.seen + 1 }, (_, i) => `k${i}`) });
  assert.equal(tooManySeen.statusCode, 400);
  const tooMuchFeedback = await post(app, { topics: ["technology"], feedback: Array.from({ length: LIMITS.feedback + 1 }, () => ({ title: "t", source: "s" })) });
  assert.equal(tooMuchFeedback.statusCode, 400);
  const longKey = await post(app, { topics: ["technology"], seen: ["x".repeat(LIMITS.keyLength + 1)] });
  assert.equal(longKey.statusCode, 400);
  const huge = await app.inject({ method: "POST", url: "/api/v1/generate", headers: { "content-type": "application/json" }, payload: JSON.stringify({ topics: [], pad: "x".repeat(LIMITS.bodyBytes + 10) }) });
  assert.equal(huge.statusCode, 413);
  await app.close();
});

test("each visitor is rate limited", async () => {
  const { app } = await hostedApp({ generateRateLimitPerMinute: 2 });
  assert.equal((await post(app, { topics: [] })).statusCode, 200);
  assert.equal((await post(app, { topics: [] })).statusCode, 200);
  const third = await post(app, { topics: [] });
  assert.equal(third.statusCode, 429);
  await app.close();
});

test("what the phone sends is never written to the logs", async () => {
  const lines = [];
  const logStream = new Writable({ write(chunk, _enc, done) { lines.push(chunk.toString()); done(); } });
  const { app } = await hostedApp({ logLevel: "info" }, { logStream });
  const res = await post(app, {
    topics: ["religion"],
    region: { scope: "local", area: "oceania" },
    seen: ["https://marker-seen.example/a"],
    dismissed: ["https://marker-dismissed.example/b"],
    feedback: [{ title: "MARKERTITLE private reading", source: "MARKERSOURCE", openCount: 1, openedAt: new Date(NOW).toISOString() }],
  });
  assert.equal(res.statusCode, 200);
  const logs = lines.join("");
  assert.match(logs, /stateless generate/, "the run is logged, as counts");
  assert.doesNotMatch(logs, /marker-seen|marker-dismissed|MARKERTITLE|MARKERSOURCE/, "no request contents in the logs");
  assert.doesNotMatch(logs, /religion|oceania/i, "not even which topics or region were chosen");
  await app.close();
});
