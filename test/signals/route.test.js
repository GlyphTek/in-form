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

test("returns channels, per-source status and platform links", async () => {
  const app = await makeApp();
  const res = await post(app, { sources: ["weather"], platforms: ["GitHub"] });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["cache-control"], "no-store");
  const body = res.json();
  assert.equal(body.status, "ok");
  assert.match(body.channels.attention[0].title, /Storm warning/);
  assert.equal(body.channels.attention[0].linkText, "news.example.com");
  assert.equal(body.sources[0].input, "weather");
  assert.deepEqual(body.platforms, [{ name: "GitHub", url: "https://github.com" }]);
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
  assert.equal(body.hiddenDismissed, 0);
  await app.close();
});

test("a dismissed item is left out of the next run and undo brings it back", async () => {
  const app = await makeApp();
  const first = (await post(app, { sources: ["weather"] })).json();
  const { id } = first.channels.attention[0];

  const dismissed = await put(app, `/api/signals/${id}/state`, { dismissed: true });
  assert.equal(dismissed.statusCode, 200);
  assert.deepEqual(dismissed.json(), { id, dismissed: true, useful: false });

  const second = (await post(app, { sources: ["weather"] })).json();
  assert.equal(Object.values(second.channels).flat().length, 0);
  assert.equal(second.hiddenDismissed, 1);

  await put(app, `/api/signals/${id}/state`, { dismissed: false });
  const third = (await post(app, { sources: ["weather"] })).json();
  assert.equal(third.channels.attention[0].id, id);
  assert.equal(third.hiddenDismissed, 0);
  await app.close();
});

test("marking useful is remembered on the next run", async () => {
  const app = await makeApp();
  const { id } = (await post(app, { sources: ["weather"] })).json().channels.attention[0];
  await put(app, `/api/signals/${id}/state`, { useful: true });
  const next = (await post(app, { sources: ["weather"] })).json();
  assert.equal(next.channels.attention[0].useful, true);
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
