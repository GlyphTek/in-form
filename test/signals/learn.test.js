import { test } from "node:test";
import assert from "node:assert/strict";
import { affinity, buildProfile, summarize, tokenize } from "../../server/signals/learn.js";

const NOW = Date.parse("2026-11-19T00:00:00Z");
const daysAgo = (d) => new Date(NOW - d * 86_400_000).toISOString();
const row = (title, source, over = {}) => ({ title, source, openCount: 0, openedAt: null, usefulAt: null, dismissedAt: null, ...over });
const cand = (title, source = "feed-a") => ({ title, source });

test("tokenize keeps distinct meaningful words only", () => {
  assert.deepEqual(tokenize("The new Quantum study: quantum errors, 2026 and AI!"), ["quantum", "study", "errors"]);
  assert.deepEqual(tokenize(""), []);
  assert.deepEqual(tokenize(null), []);
});

test("with no history nothing changes", () => {
  const a = affinity(buildProfile([], NOW), cand("Quantum computing breakthrough"));
  assert.deepEqual(a, { value: 0, factor: 1, note: null });
  assert.deepEqual(affinity(undefined, cand("x")), { value: 0, factor: 1, note: null });
});

test("one click barely moves anything; a pattern moves a lot", () => {
  const once = buildProfile([row("Quantum computing news", "feed-a", { usefulAt: daysAgo(1) })], NOW);
  const often = buildProfile(
    Array.from({ length: 6 }, (_, i) => row(`Quantum computing story ${i}`, "feed-a", { usefulAt: daysAgo(1) })),
    NOW,
  );
  const a1 = affinity(once, cand("Quantum computing today", "feed-a"));
  const a6 = affinity(often, cand("Quantum computing today", "feed-a"));
  assert.ok(a1.value > 0 && a1.value < 0.4, `one click: ${a1.value}`);
  assert.ok(a6.value > a1.value && a6.value > 0.5, `pattern: ${a6.value}`);
  assert.ok(a6.factor > 1 && a6.factor <= 1.5);
});

test("liking is explained in plain language", () => {
  const profile = buildProfile(
    Array.from({ length: 5 }, (_, i) => row(`Quantum computing result ${i}`, "feed-a", { openCount: 1, openedAt: daysAgo(2), usefulAt: daysAgo(2) })),
    NOW,
  );
  const a = affinity(profile, cand("Quantum computing milestone", "feed-a"));
  assert.match(a.note, /^boosted: a source you like and topics you like \(/);
  assert.match(a.note, /quantum/);
});

test("dismissing lowers the score and says why", () => {
  const profile = buildProfile(
    Array.from({ length: 5 }, (_, i) => row(`Celebrity gossip roundup ${i}`, "tabloid", { dismissedAt: daysAgo(1) })),
    NOW,
  );
  const a = affinity(profile, cand("Celebrity gossip latest", "tabloid"));
  assert.ok(a.value < -0.3 && a.factor < 1 && a.factor >= 0.5);
  assert.match(a.note, /^ranked lower: a source you dismiss and topics you dismissed \(/);
  // An unrelated item from another source is untouched.
  assert.deepEqual(affinity(profile, cand("Council approves budget", "other")), { value: 0, factor: 1, note: null });
});

test("ignoring an item counts as nothing", () => {
  const profile = buildProfile([row("Quantum computing news", "feed-a")], NOW);
  assert.equal(profile.events, 0);
  assert.deepEqual(affinity(profile, cand("Quantum computing news", "feed-a")), { value: 0, factor: 1, note: null });
});

test("likes and dismissals of the same thing cancel out", () => {
  const rows = [
    ...Array.from({ length: 3 }, (_, i) => row(`Quantum computing a${i}`, "feed-a", { usefulAt: daysAgo(1) })),
    ...Array.from({ length: 3 }, (_, i) => row(`Quantum computing b${i}`, "feed-a", { dismissedAt: daysAgo(1) })),
  ];
  const a = affinity(buildProfile(rows, NOW), cand("Quantum computing c", "feed-a"));
  assert.ok(Math.abs(a.value) < 0.05);
  assert.equal(a.note, null);
});

test("old feedback fades: interests can change", () => {
  const fresh = buildProfile([row("Quantum computing x", "a", { usefulAt: daysAgo(1) })], NOW);
  const old = buildProfile([row("Quantum computing x", "a", { usefulAt: daysAgo(180) })], NOW);
  assert.ok(affinity(fresh, cand("Quantum computing y", "a")).value > 5 * affinity(old, cand("Quantum computing y", "a")).value);
});

test("an open counts only once however many times the link was opened", () => {
  const once = buildProfile([row("Quantum computing x", "a", { openCount: 1, openedAt: daysAgo(1) })], NOW);
  const many = buildProfile([row("Quantum computing x", "a", { openCount: 9, openedAt: daysAgo(1) })], NOW);
  assert.equal(once.events, many.events);
  assert.equal(affinity(once, cand("Quantum computing y", "a")).value, affinity(many, cand("Quantum computing y", "a")).value);
});

test("source names match regardless of case and outer spaces", () => {
  const profile = buildProfile([row("Alpha beta gamma", " BBC.com ", { usefulAt: daysAgo(1) })], NOW);
  assert.ok(affinity(profile, cand("Different headline entirely", "bbc.com")).value > 0);
});

test("the effect is bounded between half and one and a half", () => {
  const loved = buildProfile(Array.from({ length: 40 }, (_, i) => row(`Quantum computing ${i}`, "a", { usefulAt: daysAgo(0) })), NOW);
  const hated = buildProfile(Array.from({ length: 40 }, (_, i) => row(`Quantum computing ${i}`, "a", { dismissedAt: daysAgo(0) })), NOW);
  const hi = affinity(loved, cand("Quantum computing", "a")).factor;
  const lo = affinity(hated, cand("Quantum computing", "a")).factor;
  assert.ok(hi <= 1.5 && hi > 1.3, String(hi));
  assert.ok(lo >= 0.5 && lo < 0.7, String(lo));
});

test("summarize lists the strongest likes and dislikes, needing a pattern for words", () => {
  const rows = [
    ...Array.from({ length: 4 }, (_, i) => row(`Quantum computing note ${i}`, "science", { usefulAt: daysAgo(1) })),
    ...Array.from({ length: 4 }, (_, i) => row(`Gossip column entry ${i}`, "tabloid", { dismissedAt: daysAgo(1) })),
    row("Singleton oddity", "misc", { usefulAt: daysAgo(1) }),
  ];
  const s = summarize(buildProfile(rows, NOW));
  assert.equal(s.likedSources[0].name, "science");
  assert.equal(s.dismissedSources[0].name, "tabloid");
  assert.ok(s.likedWords.some((w) => w.name === "quantum"));
  assert.ok(s.dismissedWords.some((w) => w.name === "gossip"));
  assert.ok(!s.likedWords.some((w) => w.name === "singleton"), "one click is not a pattern");
  assert.equal(s.events, 9);
});
