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
  assert.match(out.attention[0].title, /storm/i);
  assert.match(out.knowing[0].title, /study/i);
  assert.match(out.experience[0].title, /open day/i);
  assert.equal(out.relevant[0].title, "Council approves budget");
});

test("an item is never used in two channels", () => {
  const out = assignChannels([item("Live webinar: how to survive a storm warning")], { now: NOW });
  assert.equal(Object.values(out).flat().length, 1);
});

test("channels with nothing suitable stay empty instead of being padded", () => {
  const out = assignChannels([item("Council approves budget"), item("Mayor opens library")], { now: NOW });
  assert.deepEqual(out.attention, []);
  assert.deepEqual(out.knowing, []);
  assert.deepEqual(out.experience, []);
  assert.equal(out.relevant.length, 2);
});

test("no candidates gives four empty channels", () => {
  const out = assignChannels([], { now: NOW });
  assert.deepEqual(out, { relevant: [], attention: [], knowing: [], experience: [] });
});

test("fresher items beat older ones within a channel", () => {
  const out = assignChannels(
    [item("Old storm warning", { published: hoursAgo(72) }), item("New storm warning", { published: hoursAgo(1) })],
    { now: NOW },
  );
  assert.equal(out.attention[0].title, "New storm warning");
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
  assert.equal(out.attention[0].source, "a");
  assert.equal(out.knowing[0].source, "b", "second pick should come from a different source");
});

test("scores are integers from 1 to 10 and fresher means higher", () => {
  const fresh = assignChannels([item("Storm warning", { published: hoursAgo(0) })], { now: NOW }).attention[0].score;
  const old = assignChannels([item("Storm warning", { published: hoursAgo(120) })], { now: NOW }).attention[0].score;
  for (const s of [fresh, old]) assert.ok(Number.isInteger(s) && s >= 1 && s <= 10);
  assert.ok(fresh > old);
});

test("input is not mutated and the output carries the candidate fields", () => {
  const input = [item("Storm warning")];
  const snapshot = JSON.stringify(input);
  const out = assignChannels(input, { now: NOW });
  assert.equal(JSON.stringify(input), snapshot);
  assert.equal(out.attention[0].link, input[0].link);
  assert.ok(out.attention[0].reason);
});

test("a channel holds up to three items, best first, and never duplicates an item", () => {
  const out = assignChannels(
    [
      item("Storm warning one", { published: hoursAgo(1) }),
      item("Storm warning two", { published: hoursAgo(5) }),
      item("Storm warning three", { published: hoursAgo(9) }),
      item("Storm warning four", { published: hoursAgo(13) }),
      item("Council approves budget", { published: hoursAgo(2) }),
    ],
    { now: NOW },
  );
  assert.deepEqual(out.attention.map((i) => i.title), ["Storm warning one", "Storm warning two", "Storm warning three"]);
  assert.ok(out.attention[0].score >= out.attention[1].score && out.attention[1].score >= out.attention[2].score);
  const titles = Object.values(out).flat().map((i) => i.title);
  assert.equal(new Set(titles).size, titles.length);
  assert.ok(titles.includes("Council approves budget"));
});

test("every channel gets its best item before any gets a second", () => {
  const out = assignChannels(
    [
      item("Storm warning one", { published: hoursAgo(1) }),
      item("Storm warning two", { published: hoursAgo(2) }),
      item("Council approves budget", { published: hoursAgo(3) }),
    ],
    { now: NOW },
  );
  assert.equal(out.attention.length, 2);
  assert.equal(out.relevant.length, 1);
});

test("Relevant only takes items from the last 48 hours, so it runs dry", () => {
  const out = assignChannels(
    [
      item("Council approves budget", { published: hoursAgo(5) }),
      item("Library hours updated", { published: hoursAgo(47) }),
      item("Parking rules explained", { published: hoursAgo(49) }),
      item("Old planning story", { published: hoursAgo(24 * 10) }),
    ],
    { now: NOW },
  );
  assert.deepEqual(out.relevant.map((i) => i.title), ["Council approves budget", "Library hours updated"]);
});

test("the Relevant age limit is adjustable", () => {
  const items = [item("Council approves budget", { published: hoursAgo(5) }), item("Library hours updated", { published: hoursAgo(30) })];
  assert.equal(assignChannels(items, { now: NOW, relevantMaxAgeHours: 12 }).relevant.length, 1);
  assert.equal(assignChannels(items, { now: NOW, relevantMaxAgeHours: 72 }).relevant.length, 2);
});

test("undated items can still appear in Relevant", () => {
  const out = assignChannels([item("Site news without a date", { published: null })], { now: NOW });
  assert.equal(out.relevant.length, 1);
});

test("the age limit applies to Relevant only; an old item matching a cue still lands in its channel", () => {
  const out = assignChannels([item("Storm warning issued", { published: hoursAgo(24 * 5) })], { now: NOW });
  assert.equal(out.attention.length, 1);
  assert.equal(out.relevant.length, 0);
});

test("an affinity function scales scores and adds its note to the reason", () => {
  const items = [
    item("Alpha story", { source: "liked", published: hoursAgo(10) }),
    item("Beta story", { source: "plain", published: hoursAgo(9) }),
  ];
  const plain = assignChannels(items, { now: NOW });
  assert.equal(plain.relevant[0].title, "Beta story", "newer wins without learning");

  const affinity = (c) => (c.source === "liked" ? { factor: 1.4, note: "boosted: a source you like" } : { factor: 1, note: null });
  const learned = assignChannels(items, { now: NOW, affinity });
  assert.equal(learned.relevant[0].title, "Alpha story");
  assert.equal(learned.relevant[0].reason, "recent item from your sources; boosted: a source you like");
  assert.equal(learned.relevant[1].reason, "recent item from your sources");
});

test("a lower factor pushes an item down but never removes it", () => {
  const items = [item("Alpha story", { source: "disliked", published: hoursAgo(1) }), item("Beta story", { source: "plain", published: hoursAgo(12) })];
  const affinity = (c) => (c.source === "disliked" ? { factor: 0.5, note: "ranked lower: a source you dismiss" } : { factor: 1, note: null });
  const out = assignChannels(items, { now: NOW, affinity });
  assert.deepEqual(out.relevant.map((i) => i.title), ["Beta story", "Alpha story"]);
});
