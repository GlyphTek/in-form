import { test } from "node:test";
import assert from "node:assert/strict";
import { generateSignals, platformLink } from "../../server/signals/generate.js";

const NOW = Date.parse("2026-11-17T12:00:00Z");
const iso = (h) => new Date(NOW - h * 3_600_000).toISOString();

function fakeIngestor(table) {
  return {
    calls: [],
    async getItems(input) {
      this.calls.push(input);
      const entry = typeof table[input] === "function" ? await table[input]() : table[input];
      return entry ?? { input, kind: "keyword", status: "error", items: [], error: { kind: "http", message: "HTTP 404" } };
    },
  };
}
const ok = (input, items) => ({ input, kind: "keyword", status: "ok", items, fetchedAt: iso(0), error: null });
const mk = (title, h = 2) => ({ title, link: `https://news.example.com/${encodeURIComponent(title)}`, published: iso(h), summary: "" });

test("no sources gives no_sources with empty channels and platform links", async () => {
  const r = await generateSignals({ ingestor: fakeIngestor({}), sources: [], platforms: ["GitHub", "Some Club"], now: () => NOW });
  assert.equal(r.status, "no_sources");
  assert.deepEqual(Object.values(r.channels), [[], [], [], []]);
  assert.deepEqual(r.platforms, [
    { name: "GitHub", url: "https://github.com" },
    { name: "Some Club", url: null },
  ]);
});

test("all sources healthy gives ok with real items and no synthetic platform content", async () => {
  const ingestor = fakeIngestor({
    physics: ok("physics", [mk("New study on quantum error correction"), mk("Lab opens")]),
    weather: ok("weather", [mk("Severe storm warning for Auckland")]),
  });
  const r = await generateSignals({ ingestor, sources: ["physics", "weather"], platforms: ["X", "YouTube"], now: () => NOW });
  assert.equal(r.status, "ok");
  assert.match(r.channels.attention[0].title, /storm/i);
  assert.match(r.channels.knowing[0].title, /study/i);
  assert.equal(r.channels.attention[0].linkText, "news.example.com");
  assert.deepEqual(r.channels.experience, []);
  // Platforms never appear as channel content.
  for (const c of Object.values(r.channels).flat()) assert.ok(!/Activity emerging|Participation window/.test(c.title));
  assert.deepEqual(r.sources.map((s) => s.status), ["ok", "ok"]);
});

test("one failing source gives partial and the others still deliver", async () => {
  const ingestor = fakeIngestor({ physics: ok("physics", [mk("Lab opens")]) });
  const r = await generateSignals({ ingestor, sources: ["physics", "broken"], now: () => NOW });
  assert.equal(r.status, "partial");
  assert.equal(r.channels.relevant.length, 1);
  assert.equal(r.sources.find((s) => s.input === "broken").status, "error");
  assert.equal(r.sources.find((s) => s.input === "broken").error.kind, "http");
});

test("a stale source also marks the run partial", async () => {
  const stale = { ...ok("physics", [mk("Lab opens", 30)]), status: "stale", error: { kind: "timeout", message: "x" } };
  const r = await generateSignals({ ingestor: fakeIngestor({ physics: stale }), sources: ["physics"], now: () => NOW });
  assert.equal(r.status, "partial");
  assert.equal(r.channels.relevant.length, 1);
});

test("every source failing gives unavailable and empty channels (no placeholders)", async () => {
  const r = await generateSignals({ ingestor: fakeIngestor({}), sources: ["a", "b"], now: () => NOW });
  assert.equal(r.status, "unavailable");
  assert.deepEqual(Object.values(r.channels), [[], [], [], []]);
});

test("sources that miss the deadline are reported as timeouts without blocking the rest", async () => {
  const ingestor = fakeIngestor({
    fast: ok("fast", [mk("Lab opens")]),
    slow: () => new Promise((resolve) => setTimeout(() => resolve(ok("slow", [mk("Late")])), 400)),
  });
  const started = Date.now();
  const r = await generateSignals({ ingestor, sources: ["fast", "slow"], deadlineMs: 50, now: Date.now });
  assert.ok(Date.now() - started < 300);
  assert.equal(r.status, "partial");
  const slow = r.sources.find((s) => s.input === "slow");
  assert.equal(slow.status, "error");
  assert.equal(slow.error.kind, "timeout");
  assert.equal(r.channels.relevant[0].title, "Lab opens");
});

test("concurrency is capped", async () => {
  let active = 0;
  let peak = 0;
  const table = {};
  const sources = Array.from({ length: 12 }, (_, i) => `s${i}`);
  for (const s of sources) {
    table[s] = async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return ok(s, [mk(`Item ${s}`)]);
    };
  }
  await generateSignals({ ingestor: fakeIngestor(table), sources, concurrency: 3, now: () => NOW });
  assert.ok(peak <= 3, `peak concurrency was ${peak}`);
});

test("platform links: known names map to home pages, domains are accepted, free text gets none", () => {
  assert.equal(platformLink("LinkedIn"), "https://www.linkedin.com");
  assert.equal(platformLink("  youtube "), "https://www.youtube.com");
  assert.equal(platformLink("forum.example.org"), "https://forum.example.org/");
  assert.equal(platformLink("https://example.org/club"), "https://example.org/club");
  assert.equal(platformLink("my local club"), null);
  assert.equal(platformLink("javascript:alert(1)"), null);
});
