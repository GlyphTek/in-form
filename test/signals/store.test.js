import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase, runMigrations } from "../../server/db.js";
import { loadConfig } from "../../server/config.js";
import { createSignalStore, itemKey } from "../../server/store/signals.js";

function setup() {
  const db = openDatabase(":memory:");
  runMigrations(db, loadConfig({}).migrationsDir, {});
  db.prepare("INSERT INTO users (id, email) VALUES (1, 'a@x.test'), (2, 'b@x.test')").run();
  return { db, store: createSignalStore(db) };
}

const item = (title, over = {}) => ({
  title,
  link: `https://news.example.com/${encodeURIComponent(title)}`,
  source: "feed",
  published: "2026-11-17T00:00:00.000Z",
  score: 7,
  reason: "r",
  ...over,
});
const channelsOf = (...items) => ({ relevant: items, attention: [], knowing: [], experience: [] });

test("itemKey ignores tracking params, fragments and www", () => {
  assert.equal(
    itemKey({ title: "x", link: "https://www.Example.com/a/?utm_source=z#top" }),
    itemKey({ title: "x", link: "https://example.com/a" }),
  );
});

test("recordShown stores items and returns ids; the same item keeps its id on later runs", () => {
  const { db, store } = setup();
  const first = store.recordShown(1, channelsOf(item("One"), item("Two")));
  const ids = first.relevant.map((i) => i.id);
  assert.equal(new Set(ids).size, 2);
  assert.ok(first.relevant.every((i) => i.useful === false));

  const second = store.recordShown(1, { ...channelsOf(), attention: [item("One", { score: 9 })] });
  assert.equal(second.attention[0].id, ids[0]);
  const row = db.prepare("SELECT channel, score, shown_count FROM signals WHERE id = ?").get(ids[0]);
  assert.deepEqual({ ...row }, { channel: "attention", score: 9, shown_count: 2 });
  assert.equal(db.prepare("SELECT COUNT(*) n FROM signals").get().n, 2);
});

test("recordOpen counts opens and keeps the first open time", () => {
  const { db, store } = setup();
  const [a] = store.recordShown(1, channelsOf(item("One"))).relevant;
  assert.equal(store.recordOpen(1, a.id, "2026-11-18T01:00:00.000Z"), true);
  assert.equal(store.recordOpen(1, a.id, "2026-11-18T02:00:00.000Z"), true);
  const row = db.prepare("SELECT opened_at, open_count FROM signals WHERE id = ?").get(a.id);
  assert.deepEqual({ ...row }, { opened_at: "2026-11-18T01:00:00.000Z", open_count: 2 });
});

test("shown items are 'seen'; dismissing marks them 'dismissed'; undo returns them to 'seen'; useful is independent", () => {
  const { store } = setup();
  assert.equal(store.seenKeys(1).size, 0);
  const [a] = store.recordShown(1, channelsOf(item("One"))).relevant;
  const key = itemKey(item("One"));
  assert.equal(store.seenKeys(1).get(key), "seen");

  assert.deepEqual(store.updateState(1, a.id, { dismissed: true }), { id: a.id, dismissed: true, useful: false });
  assert.equal(store.seenKeys(1).get(key), "dismissed");

  assert.deepEqual(store.updateState(1, a.id, { useful: true }), { id: a.id, dismissed: true, useful: true });
  assert.deepEqual(store.updateState(1, a.id, { dismissed: false }), { id: a.id, dismissed: false, useful: true });
  assert.equal(store.seenKeys(1).get(key), "seen", "undoing a dismissal does not make it new again");

  const again = store.recordShown(1, channelsOf(item("One")));
  assert.equal(again.relevant[0].useful, true, "useful state comes back with the item");
  assert.deepEqual(store.updateState(1, a.id, { useful: false }), { id: a.id, dismissed: false, useful: false });
});

test("repeating a dismissal is harmless and keeps the original time", () => {
  const { db, store } = setup();
  const [a] = store.recordShown(1, channelsOf(item("One"))).relevant;
  store.updateState(1, a.id, { dismissed: true }, "2026-11-18T01:00:00.000Z");
  store.updateState(1, a.id, { dismissed: true }, "2026-11-18T09:00:00.000Z");
  assert.equal(db.prepare("SELECT dismissed_at d FROM signals WHERE id = ?").get(a.id).d, "2026-11-18T01:00:00.000Z");
});

test("one user cannot see or change another user's signals", () => {
  const { store } = setup();
  const [a] = store.recordShown(1, channelsOf(item("One"))).relevant;
  assert.equal(store.recordOpen(2, a.id), false);
  assert.equal(store.updateState(2, a.id, { dismissed: true }), null);
  assert.equal(store.seenKeys(1).get(itemKey(item("One"))), "seen", "user 2's attempt changed nothing");
  assert.equal(store.seenKeys(2).size, 0, "user 2 has seen nothing");

  // The same story for user 2 is a separate row with its own state.
  const [b] = store.recordShown(2, channelsOf(item("One"))).relevant;
  assert.notEqual(b.id, a.id);
  store.updateState(2, b.id, { dismissed: true });
  assert.equal(store.seenKeys(1).get(itemKey(item("One"))), "seen");
  assert.equal(store.seenKeys(2).get(itemKey(item("One"))), "dismissed");
});

test("unknown ids are not found", () => {
  const { store } = setup();
  assert.equal(store.recordOpen(1, 999), false);
  assert.equal(store.updateState(1, 999, { useful: true }), null);
});

test("forgetSources makes that source's items new again but keeps the history rows", () => {
  const { db, store } = setup();
  const shown = store.recordShown(1, channelsOf(item("One", { source: "Weather" }), item("Two", { source: "sport" })));
  const [one, two] = shown.relevant;
  store.recordOpen(1, one.id);
  store.updateState(1, one.id, { useful: true });

  assert.equal(store.forgetSources(1, ["  weather "]), 1, "matches case-insensitively, ignoring outer spaces");
  const seen = store.seenKeys(1);
  assert.equal(seen.has(itemKey(item("One"))), false, "forgotten");
  assert.equal(seen.get(itemKey(item("Two"))), "seen", "other sources untouched");

  const row = db.prepare("SELECT open_count, useful_at, cleared_at FROM signals WHERE id = ?").get(one.id);
  assert.equal(row.open_count, 1, "history kept for learning");
  assert.ok(row.useful_at && row.cleared_at);

  // Shown again, it counts as seen again and keeps its id.
  const again = store.recordShown(1, channelsOf(item("One", { source: "Weather" })));
  assert.equal(again.relevant[0].id, one.id);
  assert.equal(store.seenKeys(1).get(itemKey(item("One"))), "seen");
  assert.equal(db.prepare("SELECT cleared_at c FROM signals WHERE id = ?").get(one.id).c, null);
  assert.ok(two.id);
});

test("a dismissed item stays hidden even when its source is forgotten", () => {
  const { store } = setup();
  const [a] = store.recordShown(1, channelsOf(item("One", { source: "weather" }))).relevant;
  store.updateState(1, a.id, { dismissed: true });
  store.forgetSources(1, ["weather"]);
  assert.equal(store.seenKeys(1).get(itemKey(item("One"))), "dismissed");
});

test("forgetting is per user and does nothing for unknown sources", () => {
  const { store } = setup();
  store.recordShown(1, channelsOf(item("One", { source: "weather" })));
  store.recordShown(2, channelsOf(item("One", { source: "weather" })));
  assert.equal(store.forgetSources(2, ["weather"]), 1);
  assert.equal(store.seenKeys(1).size, 1, "user 1 untouched");
  assert.equal(store.seenKeys(2).size, 0);
  assert.equal(store.forgetSources(1, ["nothing-here"]), 0);
});
