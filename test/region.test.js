import { test } from "node:test";
import assert from "node:assert/strict";
import { testConfig } from "./helpers.js";
import { buildApp } from "../server/app.js";
import { openDatabase } from "../server/db.js";
import { detectSource } from "../server/ingest/detect.js";
import { generateSignals } from "../server/signals/generate.js";
import { REGIONS, editionsFor } from "../server/regions.js";

const recorder = () => {
  const calls = [];
  return {
    calls,
    async getItems(input) {
      calls.push(input);
      return {
        input, kind: "topic", label: "L", status: "ok", fetchedAt: "2026-11-19T00:00:00.000Z", error: null,
        items: [{ title: `Story from ${input}`, link: `https://x.example/${encodeURIComponent(input)}`, published: new Date().toISOString(), summary: "" }],
      };
    },
  };
};
const run = (sources, region) => {
  const ingestor = recorder();
  return generateSignals({ ingestor, sources, region }).then((r) => ({ r, calls: ingestor.calls }));
};

test("a topic can name one regional edition; unknown regions are rejected", () => {
  const d = detectSource("topic:news@nz");
  assert.equal(d.edition.code, "NZ");
  assert.equal(d.query, "news", "local News uses its own phrase");
  assert.equal(detectSource("topic:news").query, "world news");
  assert.throws(() => detectSource("topic:news@zz"), /Unknown region/);
  assert.throws(() => detectSource("topic:news@nz@au"), /Unknown region/);
  assert.throws(() => detectSource("topic:cooking@nz"), /Unknown topic/);
});

test("global fetches the plain topic only", async () => {
  const { calls } = await run(["topic:news"], { scope: "global", area: "oceania" });
  assert.deepEqual(calls, ["topic:news"]);
});

test("no region behaves as before", async () => {
  const { calls } = await run(["topic:news", "quantum"], null);
  assert.deepEqual(calls, ["topic:news", "quantum"]);
});

test("local fetches every edition of the continent and no global feed", async () => {
  const { r, calls } = await run(["topic:sport"], { scope: "local", area: "oceania" });
  assert.deepEqual(calls, ["topic:sport@nz", "topic:sport@au"]);
  assert.equal(r.sources.length, 1, "one report per configured source");
  assert.equal(r.sources[0].input, "topic:sport");
  assert.equal(r.sources[0].itemCount, 2);
  assert.equal(r.status, "ok");
});

test("both fetches global plus the editions", async () => {
  const { calls } = await run(["topic:education"], { scope: "both", area: "europe" });
  assert.deepEqual(calls, ["topic:education", "topic:education@gb", "topic:education@ie"]);
});

test("topics without local variants and custom sources are never regionalised", async () => {
  const { calls } = await run(["topic:science", "topic:religion", "my keyword", "https://example.com/feed.xml"], { scope: "local", area: "asia" });
  assert.deepEqual(calls, ["topic:science", "topic:religion", "my keyword", "https://example.com/feed.xml"]);
});

test("items keep the configured source name, so learning is not split by edition", async () => {
  const { r } = await run(["topic:news"], { scope: "local", area: "oceania" });
  const all = Object.values(r.channels).flat();
  assert.ok(all.length > 0);
  assert.ok(all.every((i) => i.source === "topic:news"));
});

test("a continent with no English edition says so plainly", async () => {
  assert.equal(editionsFor("south-america").length, 0);
  const local = await run(["topic:news", "topic:science"], { scope: "local", area: "south-america" });
  assert.deepEqual(local.calls, ["topic:science"], "nothing is silently substituted for the local topic");
  const news = local.r.sources.find((s) => s.input === "topic:news");
  assert.equal(news.status, "error");
  assert.match(news.error.message, /No English-language local sources for South America/);
  assert.equal(local.r.status, "partial");

  const both = await run(["topic:news"], { scope: "both", area: "south-america" });
  assert.deepEqual(both.calls, ["topic:news"]);
  assert.equal(both.r.sources[0].status, "ok");
  assert.match(both.r.sources[0].note, /No English-language local sources/);
});

test("one edition failing does not lose the others", async () => {
  const ingestor = {
    async getItems(input) {
      if (input.endsWith("@nz")) return { input, kind: null, status: "error", items: [], fetchedAt: null, error: { kind: "network", message: "down" } };
      return { input, kind: "topic", label: "News", status: "ok", fetchedAt: null, error: null, items: [{ title: `ok ${input}`, link: `https://x.example/${input}`, published: new Date().toISOString(), summary: "" }] };
    },
  };
  const r = await generateSignals({ ingestor, sources: ["topic:news"], region: { scope: "local", area: "oceania" } });
  assert.equal(r.sources[0].status, "ok");
  assert.equal(r.sources[0].itemCount, 1);
});

test("every region with editions has real, English editions", () => {
  for (const region of REGIONS) {
    for (const e of editionsFor(region.id)) assert.match(e.ceid, /^[A-Z]{2}:en$/);
  }
});

// --- through the API ---------------------------------------------------------

const PASSWORD = "correct horse battery staple";
async function makeApp() {
  const ingestor = recorder();
  const db = openDatabase(":memory:");
  const config = testConfig({ auth: { mode: "password", password: PASSWORD, loginRateLimitPerMinute: 100 } });
  const app = await buildApp(config, { db, ingestor });
  const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { password: PASSWORD } });
  const headers = { cookie: `inform_session=${res.cookies.find((c) => c.name === "inform_session").value}` };
  return { app, headers, ingestor };
}

test("the region is saved with the setup, kept when omitted, and clearable", async () => {
  const { app, headers } = await makeApp();
  const put = (payload) => app.inject({ method: "PUT", url: "/api/config", headers, payload });
  const get = async () => (await app.inject({ method: "GET", url: "/api/config", headers })).json().region;

  assert.equal(await get(), null);
  assert.equal((await put({ sources: ["topic:news"], region: { scope: "local", area: "oceania" } })).statusCode, 200);
  assert.deepEqual(await get(), { scope: "local", area: "oceania" });
  await put({ sources: ["topic:news"] });
  assert.deepEqual(await get(), { scope: "local", area: "oceania" }, "omitting region keeps it");
  await put({ sources: [], region: { scope: "global" } });
  assert.deepEqual(await get(), { scope: "global", area: null });
  await put({ sources: [], region: null });
  assert.equal(await get(), null);
  await app.close();
});

test("bad regions are rejected", async () => {
  const { app, headers } = await makeApp();
  for (const region of [{ scope: "nearby" }, { scope: "local", area: "atlantis" }, { area: "europe" }, { scope: "local", extra: 1 }]) {
    const res = await app.inject({ method: "PUT", url: "/api/config", headers, payload: { sources: [], region } });
    assert.equal(res.statusCode, 400, JSON.stringify(region));
  }
  await app.close();
});

test("generate uses the stored region, and a region in the body overrides it", async () => {
  const { app, headers, ingestor } = await makeApp();
  await app.inject({ method: "PUT", url: "/api/config", headers, payload: { sources: ["topic:news"], region: { scope: "local", area: "oceania" } } });
  await app.inject({ method: "POST", url: "/api/signals/generate", headers, payload: {} });
  assert.deepEqual(ingestor.calls, ["topic:news@nz", "topic:news@au"]);

  ingestor.calls.length = 0;
  await app.inject({ method: "POST", url: "/api/signals/generate", headers, payload: { region: { scope: "global", area: null } } });
  assert.deepEqual(ingestor.calls, ["topic:news"]);
  await app.close();
});

test("/api/topics says which topics have local variants and which regions have editions", async () => {
  const { app, headers } = await makeApp();
  const body = (await app.inject({ method: "GET", url: "/api/topics", headers })).json();
  assert.deepEqual(body.topics.filter((t) => t.local).map((t) => t.id), ["news", "sport", "education"]);
  assert.equal(body.regions.length, 6);
  assert.equal(body.regions.find((r) => r.id === "south-america").hasEditions, false);
  await app.close();
});
