import { test } from "node:test";
import assert from "node:assert/strict";
import { testConfig } from "../helpers.js";
import { buildApp } from "../../server/app.js";
import { openDatabase } from "../../server/db.js";

const NOW = Date.now();
const item = (title) => ({
  title,
  link: `https://news.example.com/${encodeURIComponent(title)}`,
  published: new Date(NOW - 3_600_000).toISOString(),
  summary: "",
});

const ingestor = {
  calls: [],
  async getItems(input) {
    this.calls.push(input);
    if (input === "broken") {
      return { input, kind: null, status: "error", items: [], error: { kind: "http", message: "HTTP 500" } };
    }
    return { input, kind: "keyword", status: "ok", items: [item(`Storm warning about ${input}`)], fetchedAt: null, error: null };
  },
  listHealth: () => [],
};

async function makeApp(overrides = {}) {
  const config = testConfig(overrides);
  return buildApp(config, { db: openDatabase(":memory:"), ingestor });
}

const post = (app, payload) => app.inject({ method: "POST", url: "/api/signals/generate", payload });

test("returns channels and per-source status", async () => {
  const app = await makeApp();
  const res = await post(app, { sources: ["weather"] });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["cache-control"], "no-store");
  const body = res.json();
  assert.equal(body.status, "ok");
  assert.match(body.channels.attention[0].title, /Storm warning/);
  assert.equal(body.channels.attention[0].linkText, "news.example.com");
  assert.equal(body.sources[0].input, "weather");
  await app.close();
});

test("sources are trimmed and deduplicated before use", async () => {
  ingestor.calls.length = 0;
  const app = await makeApp();
  await post(app, { sources: ["  weather ", "Weather", "weather", "physics"] });
  assert.deepEqual(ingestor.calls, ["weather", "physics"]);
  await app.close();
});

test("an empty body or empty sources reports no_sources", async () => {
  const app = await makeApp();
  const res = await post(app, {});
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().status, "no_sources");
  await app.close();
});

test("a failing source is reported, not thrown", async () => {
  const app = await makeApp();
  const res = await post(app, { sources: ["weather", "broken"] });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().status, "partial");
  await app.close();
});

test("malformed bodies are rejected with 400", async () => {
  const app = await makeApp();
  const bad = [
    { sources: "weather" },
    { sources: [1, 2] },
    { sources: [""] },
    { sources: ["x".repeat(3000)] },
    { sources: Array.from({ length: 21 }, (_, i) => `s${i}`) },
    { platforms: Array.from({ length: 21 }, (_, i) => `p${i}`) },
    { platforms: ["p".repeat(81)] },
    { sources: [], extra: true },
  ];
  for (const payload of bad) {
    const res = await post(app, payload);
    assert.equal(res.statusCode, 400, JSON.stringify(payload).slice(0, 60));
  }
  await app.close();
});

test("the generate endpoint is rate limited with a JSON 429", async () => {
  const app = await makeApp({ generateRateLimitPerMinute: 3 });
  const codes = [];
  let last;
  for (let i = 0; i < 5; i++) {
    last = await post(app, { sources: ["weather"] });
    codes.push(last.statusCode);
  }
  assert.deepEqual(codes, [200, 200, 200, 429, 429]);
  assert.equal(last.json().error, "rate_limited");
  assert.match(last.json().message, /Try again in \d+s/);
  await app.close();
});

test("static files are not rate limited", async () => {
  const app = await makeApp({ rateLimitPerMinute: 2 });
  for (let i = 0; i < 6; i++) assert.equal((await app.inject({ url: "/style.css" })).statusCode, 200);
  await app.close();
});

test("the removed global health endpoint is not exposed", async () => {
  const app = await makeApp();
  assert.equal((await app.inject({ url: "/api/sources/health" })).statusCode, 404);
  await app.close();
});

// --- Stored signals: ids, open, dismiss, useful ---------------------------------

const put = (app, url, payload) => app.inject({ method: "PUT", url, payload });

test("generated items carry ids and a useful flag", async () => {
  const app = await makeApp();
  const body = (await post(app, { sources: ["weather"] })).json();
  const first = body.channels.attention[0];
  assert.ok(Number.isInteger(first.id) && first.id > 0);
  assert.equal(first.useful, false);
  assert.deepEqual(body.hidden, { seen: 0, dismissed: 0 });
  await app.close();
});

test("an item already shown is left out of the next run", async () => {
  const app = await makeApp();
  const first = (await post(app, { sources: ["weather"] })).json();
  assert.equal(first.channels.attention.length, 1);

  const second = (await post(app, { sources: ["weather"] })).json();
  assert.equal(Object.values(second.channels).flat().length, 0);
  assert.deepEqual(second.hidden, { seen: 1, dismissed: 0 });
  assert.equal(second.status, "ok", "being fully seen is not a failure");
  await app.close();
});

test("dismissed items are counted separately, and undoing keeps them seen", async () => {
  const app = await makeApp();
  const { id } = (await post(app, { sources: ["weather"] })).json().channels.attention[0];
  const dismissed = await put(app, `/api/signals/${id}/state`, { dismissed: true });
  assert.deepEqual(dismissed.json(), { id, dismissed: true, useful: false });

  const second = (await post(app, { sources: ["weather"] })).json();
  assert.deepEqual(second.hidden, { seen: 0, dismissed: 1 });

  await put(app, `/api/signals/${id}/state`, { dismissed: false });
  const third = (await post(app, { sources: ["weather"] })).json();
  assert.equal(Object.values(third.channels).flat().length, 0);
  assert.deepEqual(third.hidden, { seen: 1, dismissed: 0 });
  await app.close();
});

test("pressing again gives the next three per channel, never repeating an item", async () => {
  const many = {
    async getItems(input) {
      const items = Array.from({ length: 8 }, (_, n) => ({
        ...item(`Storm warning number ${n + 1}`),
        published: new Date(NOW - (n + 1) * 3_600_000).toISOString(),
      }));
      return { input, kind: "keyword", status: "ok", items, fetchedAt: null, error: null };
    },
    listHealth: () => [],
  };
  const app = await buildApp(testConfig(), { db: openDatabase(":memory:"), ingestor: many });
  const titles = (r) => Object.values(r.channels).flat().map((i) => i.title);

  const first = (await post(app, { sources: ["x"] })).json();
  assert.deepEqual(first.channels.attention.map((i) => i.title), [
    "Storm warning number 1", "Storm warning number 2", "Storm warning number 3",
  ]);

  // Relevant takes the best of what is left over, so the first run used 6 of the 8.
  assert.deepEqual(first.channels.relevant.map((i) => i.title), [
    "Storm warning number 4", "Storm warning number 5", "Storm warning number 6",
  ]);

  const second = (await post(app, { sources: ["x"] })).json();
  assert.deepEqual(second.channels.attention.map((i) => i.title), ["Storm warning number 7", "Storm warning number 8"]);
  assert.equal(second.channels.relevant.length, 0);
  assert.equal(second.hidden.seen, 6);

  const all = [...titles(first), ...titles(second)];
  assert.equal(new Set(all).size, all.length, "nothing is shown twice");

  const third = (await post(app, { sources: ["x"] })).json();
  assert.equal(titles(third).length, 0);
  assert.equal(third.hidden.seen, 8);
  await app.close();
});

test("the same story from two sources is shown once", async () => {
  const same = {
    async getItems(input) {
      return { input, kind: "keyword", status: "ok", items: [item("Storm warning everywhere")], fetchedAt: null, error: null };
    },
    listHealth: () => [],
  };
  const app = await buildApp(testConfig(), { db: openDatabase(":memory:"), ingestor: same });
  const r = (await post(app, { sources: ["a", "b"] })).json();
  assert.equal(Object.values(r.channels).flat().length, 1);
  await app.close();
});

test("seen history belongs to the account, not the request", async () => {
  const app = await makeApp();
  await post(app, { sources: ["weather"] });
  // Same sources supplied differently (stored config instead of body) still see the history.
  await app.inject({ method: "PUT", url: "/api/config", payload: { sources: ["weather"] } });
  const again = (await app.inject({ method: "POST", url: "/api/signals/generate", payload: {} })).json();
  assert.equal(Object.values(again.channels).flat().length, 0);
  await app.close();
});

test("opening a signal is recorded and answers 204", async () => {
  const app = await makeApp();
  const { id } = (await post(app, { sources: ["weather"] })).json().channels.attention[0];
  const res = await app.inject({ method: "POST", url: `/api/signals/${id}/open` });
  assert.equal(res.statusCode, 204);
  const row = app.db.prepare("SELECT open_count FROM signals WHERE id = ?").get(id);
  assert.equal(row.open_count, 1);
  await app.close();
});

test("unknown ids give 404 and malformed requests give 400", async () => {
  const app = await makeApp();
  assert.equal((await app.inject({ method: "POST", url: "/api/signals/999/open" })).statusCode, 404);
  assert.equal((await put(app, "/api/signals/999/state", { useful: true })).statusCode, 404);
  assert.equal((await put(app, "/api/signals/abc/state", { useful: true })).statusCode, 400);
  assert.equal((await put(app, "/api/signals/1/state", {})).statusCode, 400);
  assert.equal((await put(app, "/api/signals/1/state", { dismissed: "yes" })).statusCode, 400);
  assert.equal((await put(app, "/api/signals/1/state", { other: true })).statusCode, 400);
  await app.close();
});

test("signal actions require sign-in when auth is on", async () => {
  const app = await makeApp({ auth: { mode: "password", password: "a long enough passphrase" } });
  assert.equal((await app.inject({ method: "POST", url: "/api/signals/1/open" })).statusCode, 401);
  assert.equal((await put(app, "/api/signals/1/state", { useful: true })).statusCode, 401);
  await app.close();
});

// --- Removing a source and adding it back starts it fresh -------------------------

const setSources = (app, sources) => app.inject({ method: "PUT", url: "/api/config", payload: { sources } });
const generateStored = async (app) => (await app.inject({ method: "POST", url: "/api/signals/generate", payload: {} })).json();
const shownCount = (r) => Object.values(r.channels).flat().length;

test("removing a source and adding it back brings its items back as new", async () => {
  const app = await makeApp();
  await setSources(app, ["weather"]);
  assert.equal(shownCount(await generateStored(app)), 1);
  const seen = await generateStored(app);
  assert.equal(shownCount(seen), 0);
  assert.deepEqual(seen.hidden, { seen: 1, dismissed: 0 });

  await setSources(app, []);
  await setSources(app, ["weather"]);
  const fresh = await generateStored(app);
  assert.equal(shownCount(fresh), 1, "the source starts fresh");
  assert.deepEqual(fresh.hidden, { seen: 0, dismissed: 0 });
  await app.close();
});

test("saving without removing a source keeps its history", async () => {
  const app = await makeApp();
  await setSources(app, ["weather", "other"]);
  await generateStored(app);
  await setSources(app, ["other", "weather", "third"]); // reordered, one added, none removed
  const next = await generateStored(app);
  assert.equal(next.hidden.seen, 2, "weather and other are still seen");
  await app.close();
});

test("only the removed source starts fresh", async () => {
  const app = await makeApp();
  await setSources(app, ["weather", "other"]);
  await generateStored(app);
  await setSources(app, ["other"]); // weather removed
  await setSources(app, ["weather", "other"]); // weather back
  const next = await generateStored(app);
  assert.deepEqual(next.channels.attention.map((i) => i.source), ["weather"]);
  assert.equal(next.hidden.seen, 1, "other is still seen");
  await app.close();
});

test("a dismissed item stays hidden after its source is removed and added back", async () => {
  const app = await makeApp();
  await setSources(app, ["weather"]);
  const { id } = (await generateStored(app)).channels.attention[0];
  await put(app, `/api/signals/${id}/state`, { dismissed: true });
  await setSources(app, []);
  await setSources(app, ["weather"]);
  const next = await generateStored(app);
  assert.equal(shownCount(next), 0);
  assert.deepEqual(next.hidden, { seen: 0, dismissed: 1 });
  await app.close();
});

test("a rejected save does not forget anything", async () => {
  const app = await makeApp();
  await setSources(app, ["weather"]);
  await generateStored(app);
  const bad = await setSources(app, ["javascript:alert(1)"]);
  assert.equal(bad.statusCode, 400);
  assert.equal(shownCount(await generateStored(app)), 0);
  assert.equal((await generateStored(app)).hidden.seen, 1);
  await app.close();
});

// --- Learning from feedback ------------------------------------------------------

function learningApp() {
  let round = 1;
  const make = (input) => {
    const topic = input === "a" ? "Quantum computing" : "Celebrity gossip";
    const items = Array.from({ length: 4 }, (_, n) => ({
      ...item(`${topic} roundup ${round}-${n + 1}`),
      link: `https://news.example.com/${input}-${round}-${n + 1}`,
      published: new Date(NOW - 3_600_000 * (n + 1)).toISOString(),
    }));
    return { input, kind: "keyword", status: "ok", items, fetchedAt: null, error: null };
  };
  const ingestor = { async getItems(input) { return make(input); }, listHealth: () => [] };
  return { ingestor, nextRound: () => { round++; } };
}

test("items you mark useful pull similar ones up, and dismissed ones push similar ones down", async () => {
  const { ingestor, nextRound } = learningApp();
  const app = await buildApp(testConfig(), { db: openDatabase(":memory:"), ingestor });
  const gen = async (sources) => (await post(app, { sources })).json();

  // No history: a tie between the two sources, so no learning note anywhere.
  const first = await gen(["a"]);
  for (const i of first.channels.relevant) assert.ok(!/boosted|ranked lower/.test(i.reason));
  for (const i of first.channels.relevant) await put(app, `/api/signals/${i.id}/state`, { useful: true });
  const other = await gen(["b"]);
  for (const i of other.channels.relevant) await put(app, `/api/signals/${i.id}/state`, { dismissed: true });

  nextRound();
  const next = await gen(["a", "b"]);
  const titles = next.channels.relevant.map((i) => i.title);
  assert.ok(titles.every((t) => t.startsWith("Quantum")), `liked topic leads: ${titles.join(" | ")}`);
  assert.match(next.channels.relevant[0].reason, /boosted: a source you like and topics you like \(/);
  assert.ok(next.channels.relevant[0].score >= 1);

  // The disliked source's items still exist, just later, and say why.
  nextRound();
  const later = await gen(["b"]);
  assert.ok(later.channels.relevant.length > 0, "demoted, not hidden");
  assert.match(later.channels.relevant[0].reason, /ranked lower: a source you dismiss/);
  await app.close();
});

test("another account's feedback does not influence ranking", async () => {
  const { ingestor, nextRound } = learningApp();
  const db = openDatabase(":memory:");
  const app = await buildApp(testConfig(), { db, ingestor });
  const first = (await post(app, { sources: ["a"] })).json();
  const ids = first.channels.relevant.map((i) => i.id);
  // Feedback belonging to a different user row must not be read for this one.
  db.prepare("INSERT INTO users (id, email) VALUES (99, 'other@x.test')").run();
  db.prepare("UPDATE signals SET user_id = 99 WHERE id IN (" + ids.join(",") + ")").run();
  db.prepare("UPDATE signals SET useful_at = '2026-11-18T00:00:00.000Z' WHERE user_id = 99").run();
  nextRound();
  const next = (await post(app, { sources: ["a"] })).json();
  for (const i of next.channels.relevant) assert.ok(!/boosted/.test(i.reason));
  await app.close();
});

test("GET /api/learning shows what has been learned, and needs sign-in", async () => {
  const { ingestor } = learningApp();
  const app = await buildApp(testConfig(), { db: openDatabase(":memory:"), ingestor });
  const empty = (await app.inject({ method: "GET", url: "/api/learning" })).json();
  assert.deepEqual(empty, { events: 0, likedSources: [], dismissedSources: [], likedWords: [], dismissedWords: [] });

  const first = (await post(app, { sources: ["a"] })).json();
  for (const i of first.channels.relevant) await put(app, `/api/signals/${i.id}/state`, { useful: true });
  const learned = (await app.inject({ method: "GET", url: "/api/learning" })).json();
  assert.equal(learned.events, 3);
  assert.equal(learned.likedSources[0].name, "a");
  assert.ok(learned.likedWords.some((w) => w.name === "quantum"));
  await app.close();

  const locked = await makeApp({ auth: { mode: "password", password: "a long enough passphrase" } });
  assert.equal((await locked.inject({ method: "GET", url: "/api/learning" })).statusCode, 401);
  await locked.close();
});
