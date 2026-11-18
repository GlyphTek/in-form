import { test } from "node:test";
import assert from "node:assert/strict";
import { assignChannels, lexiconHits, recencyScore } from "../../server/signals/rank.js";

const NOW = Date.parse("2026-11-17T12:00:00Z");
const hoursAgo = (h) => new Date(NOW - h * 3_600_000).toISOString();
const item = (title, over = {}) => ({
  title,
  link: `https://example.com/${encodeURIComponent(title)}`,
  published: hoursAgo(2),
  summary: "",
  source: "feed-a",
  ...over,
});

test("recency halves every 24 hours; undated items get a small fixed score", () => {
  assert.equal(recencyScore(hoursAgo(0), NOW), 1);
  assert.ok(Math.abs(recencyScore(hoursAgo(24), NOW) - 0.5) < 1e-9);
  assert.ok(Math.abs(recencyScore(hoursAgo(48), NOW) - 0.25) < 1e-9);
  assert.equal(recencyScore(null, NOW), 0.25);
});

test("lexicon matching is whole-word and case-insensitive", () => {
  assert.ok(lexiconHits("attention", item("STORM warning issued")) >= 2);
  assert.equal(lexiconHits("attention", item("Stormwater upgrades planned")), 0);
  assert.equal(lexiconHits("experience", item("Live music tonight")), 1);
  assert.equal(lexiconHits("knowing", item("Nothing special here")), 0);
});

test("assigns each cue to its channel and the rest to relevant", () => {
  const out = assignChannels(
    [
      item("Severe storm warning for Auckland", { source: "a" }),
      item("New study explains quantum error correction", { source: "b" }),
      item("Open day and live demo this weekend", { source: "c" }),
      item("Council approves budget", { source: "d", published: hoursAgo(1) }),
    ],
    { now: NOW },
  );
  assert.match(out.attention.title, /storm/i);
  assert.match(out.knowing.title, /study/i);
  assert.match(out.experience.title, /open day/i);
  assert.equal(out.relevant.title, "Council approves budget");
});

test("an item is never used in two channels", () => {
  const out = assignChannels([item("Live webinar: how to survive a storm warning")], { now: NOW });
  const filled = Object.values(out).filter(Boolean);
  assert.equal(filled.length, 1);
});

test("channels with nothing suitable stay empty instead of being padded", () => {
  const out = assignChannels([item("Council approves budget"), item("Mayor opens library")], { now: NOW });
  assert.equal(out.attention, null);
  assert.equal(out.knowing, null);
  assert.equal(out.experience, null);
  assert.ok(out.relevant);
});

test("no candidates gives four empty channels", () => {
  const out = assignChannels([], { now: NOW });
  assert.deepEqual(out, { relevant: null, attention: null, knowing: null, experience: null });
});

test("fresher items beat older ones within a channel", () => {
  const out = assignChannels(
    [item("Old storm warning", { published: hoursAgo(72) }), item("New storm warning", { published: hoursAgo(1) })],
    { now: NOW },
  );
  assert.equal(out.attention.title, "New storm warning");
});

test("ties prefer a source that has not been used yet", () => {
  const out = assignChannels(
    [
      item("Storm warning one", { source: "a" }),
      item("Research study one", { source: "a" }),
      item("Research study two", { source: "b" }),
      item("Plain news", { source: "a" }),
    ],
    { now: NOW },
  );
  assert.equal(out.attention.source, "a");
  assert.equal(out.knowing.source, "b", "second pick should come from a different source");
});

test("scores are integers from 1 to 10 and fresher means higher", () => {
  const fresh = assignChannels([item("Storm warning", { published: hoursAgo(0) })], { now: NOW }).attention.score;
  const old = assignChannels([item("Storm warning", { published: hoursAgo(120) })], { now: NOW }).attention.score;
  for (const s of [fresh, old]) assert.ok(Number.isInteger(s) && s >= 1 && s <= 10);
  assert.ok(fresh > old);
});

test("input is not mutated and the output carries the candidate fields", () => {
  const input = [item("Storm warning")];
  const snapshot = JSON.stringify(input);
  const out = assignChannels(input, { now: NOW });
  assert.equal(JSON.stringify(input), snapshot);
  assert.equal(out.attention.link, input[0].link);
  assert.ok(out.attention.reason);
});
