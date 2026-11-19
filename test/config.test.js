import { test } from "node:test";
import assert from "node:assert/strict";
import { testConfig } from "./helpers.js";
import { loadConfig } from "../server/config.js";
import { buildApp } from "../server/app.js";
import { openDatabase } from "../server/db.js";

const PASSWORD = "correct horse battery staple";
const seen = [];
const ingestor = {
  async getItems(input) {
    seen.push(input);
    return { input, kind: "keyword", status: "ok", items: [], fetchedAt: null, error: null };
  },
  listHealth: () => [],
};

async function makeApp(authOverrides = {}) {
  const db = openDatabase(":memory:");
  const config = testConfig({ auth: { mode: "password", password: PASSWORD, loginRateLimitPerMinute: 100, ...authOverrides } });
  const app = await buildApp(config, { db, ingestor });
  const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { password: PASSWORD } });
  const headers = { cookie: `inform_session=${res.cookies.find((c) => c.name === "inform_session").value}` };
  return { app, db, headers };
}

const put = (app, headers, payload) => app.inject({ method: "PUT", url: "/api/config", headers, payload });
const get = (app, headers) => app.inject({ method: "GET", url: "/api/config", headers });

test("a new account starts empty", async () => {
  const { app, headers } = await makeApp();
  const res = await get(app, headers);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { sources: [], updatedAt: null });
  assert.equal(res.headers["cache-control"], "no-store");
  await app.close();
});

test("PUT stores the configuration in order and GET returns it", async () => {
  const { app, headers } = await makeApp();
  const saved = await put(app, headers, {
    sources: ["quantum computing", "https://example.com/feed.xml", "bbc.com"],
  });
  assert.equal(saved.statusCode, 200);
  assert.ok(saved.json().updatedAt);

  const res = (await get(app, headers)).json();
  assert.deepEqual(res.sources, ["quantum computing", "https://example.com/feed.xml", "bbc.com"]);
  await app.close();
});

test("the detected kind of each source is stored", async () => {
  const { app, db, headers } = await makeApp();
  await put(app, headers, { sources: ["quantum computing", "https://example.com/feed.xml", "bbc.com"] });
  const rows = db.prepare("SELECT input, kind, position FROM sources ORDER BY position").all();
  assert.deepEqual(rows.map((r) => r.kind), ["keyword", "feed", "site"]);
  assert.deepEqual(rows.map((r) => r.position), [0, 1, 2]);
  await app.close();
});

test("PUT replaces rather than merges, and an empty list clears", async () => {
  const { app, headers } = await makeApp();
  await put(app, headers, { sources: ["a topic", "another topic"] });
  await put(app, headers, { sources: ["only this"] });
  assert.deepEqual((await get(app, headers)).json().sources, ["only this"]);
  await put(app, headers, { sources: [] });
  assert.deepEqual((await get(app, headers)).json().sources, []);
  await app.close();
});

test("entries are trimmed and case-insensitively deduplicated", async () => {
  const { app, headers } = await makeApp();
  await put(app, headers, { sources: ["  Quantum   Computing ", "quantum computing", "Other"] });
  const res = (await get(app, headers)).json();
  assert.deepEqual(res.sources, ["Quantum Computing", "Other"]);
  await app.close();
});

test("sources that can never be fetched are rejected with a reason each, and nothing is saved", async () => {
  const { app, headers } = await makeApp();
  await put(app, headers, { sources: ["kept"] });

  const res = await put(app, headers, {
    sources: ["fine topic", "javascript:alert(1)", "file:///etc/passwd", "a".repeat(250)],
  });
  assert.equal(res.statusCode, 400);
  const body = res.json();
  assert.equal(body.error, "invalid_sources");
  assert.deepEqual(body.invalid.map((i) => i.input.slice(0, 12)), ["javascript:a", "file:///etc/", "aaaaaaaaaaaa"]);
  assert.ok(body.invalid.every((i) => i.message));

  assert.deepEqual((await get(app, headers)).json().sources, ["kept"], "a rejected save must not change stored data");
  await app.close();
});

test("schema limits and strictness apply", async () => {
  const { app, headers } = await makeApp();
  const bad = [
    {},
    { sources: "x" },
    { sources: [], extra: 1 },
    { sources: Array.from({ length: 21 }, (_, i) => `s${i}`) },
    { sources: [], platforms: Array.from({ length: 21 }, (_, i) => `p${i}`) },
    { sources: [""] },
    { sources: [], platforms: ["p".repeat(81)] },
  ];
  for (const payload of bad) assert.equal((await put(app, headers, payload)).statusCode, 400, JSON.stringify(payload).slice(0, 50));
  await app.close();
});

test("a legacy platforms field from an older page is accepted and ignored", async () => {
  const { app, headers } = await makeApp();
  const res = await put(app, headers, { sources: ["quantum"], platforms: ["GitHub"] });
  assert.equal(res.statusCode, 200);
  assert.equal("platforms" in res.json(), false, "platforms are no longer part of the configuration");
  assert.equal("platforms" in (await get(app, headers)).json(), false);
  const gen = await app.inject({ method: "POST", url: "/api/signals/generate", headers, payload: { sources: ["x"], platforms: ["GitHub"] } });
  assert.equal(gen.statusCode, 200);
  assert.equal("platforms" in gen.json(), false);
  await app.close();
});

test("stored values containing markup are returned as plain data", async () => {
  const { app, headers } = await makeApp();
  await put(app, headers, { sources: ["<img src=x onerror=alert(1)>"] });
  const res = (await get(app, headers)).json();
  assert.equal(res.sources[0], "<img src=x onerror=alert(1)>");
  const raw = await get(app, headers);
  assert.match(raw.headers["content-type"], /application\/json/);
  await app.close();
});

test("generate with an empty body uses the stored configuration", async () => {
  const { app, headers } = await makeApp();
  await put(app, headers, { sources: ["stored one", "stored two"] });
  seen.length = 0;
  const res = await app.inject({ method: "POST", url: "/api/signals/generate", headers, payload: {} });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(seen, ["stored one", "stored two"]);
  await app.close();
});

test("a source list in the generate body overrides the stored one", async () => {
  const { app, headers } = await makeApp();
  await put(app, headers, { sources: ["stored"] });

  seen.length = 0;
  const res = await app.inject({ method: "POST", url: "/api/signals/generate", headers, payload: { sources: ["from body"] } });
  assert.deepEqual(seen, ["from body"]);

  seen.length = 0;
  const res2 = await app.inject({ method: "POST", url: "/api/signals/generate", headers, payload: { sources: [] } });
  assert.equal(res2.json().status, "no_sources", "explicit empty lists are respected, not replaced by stored");
  assert.deepEqual(seen, []);
  await app.close();
});

test("configuration survives a new session (same account, different login)", async () => {
  const { app, headers } = await makeApp();
  await put(app, headers, { sources: ["persisted"] });
  const again = await app.inject({ method: "POST", url: "/api/auth/login", payload: { password: PASSWORD } });
  const headers2 = { cookie: `inform_session=${again.cookies.find((c) => c.name === "inform_session").value}` };
  assert.deepEqual((await get(app, headers2)).json().sources, ["persisted"]);
  await app.close();
});

test("rows are scoped to their owner (a second account cannot read the first's config)", async () => {
  const { app, db, headers } = await makeApp();
  await put(app, headers, { sources: ["private topic"] });
  db.prepare("INSERT INTO users (email) VALUES ('other@example.com')").run();
  const other = db.prepare("SELECT id FROM users WHERE email = 'other@example.com'").get().id;
  const { createConfigStore } = await import("../server/store/config.js");
  const store = createConfigStore(db);
  assert.deepEqual(store.get(other), { sources: [], updatedAt: null });
  await app.close();
});

test("RELEVANT_MAX_AGE_HOURS defaults to 48 and is clamped to 1..720", () => {
  assert.equal(loadConfig({ INFORM_AUTH: "off" }).relevantMaxAgeHours, 48);
  assert.equal(loadConfig({ INFORM_AUTH: "off", RELEVANT_MAX_AGE_HOURS: "24" }).relevantMaxAgeHours, 24);
  assert.equal(loadConfig({ INFORM_AUTH: "off", RELEVANT_MAX_AGE_HOURS: "0" }).relevantMaxAgeHours, 1);
  assert.equal(loadConfig({ INFORM_AUTH: "off", RELEVANT_MAX_AGE_HOURS: "99999" }).relevantMaxAgeHours, 720);
  assert.equal(loadConfig({ INFORM_AUTH: "off", RELEVANT_MAX_AGE_HOURS: "soon" }).relevantMaxAgeHours, 48);
});
