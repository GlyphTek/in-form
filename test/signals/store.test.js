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

test("dismiss hides the item's key; undo brings it back; useful is independent", () => {
  const { store } = setup();
  const [a] = store.recordShown(1, channelsOf(item("One"))).relevant;
  assert.equal(store.dismissedKeys(1).size, 0);

  assert.deepEqual(store.updateState(1, a.id, { dismissed: true }), { id: a.id, dismissed: true, useful: false });
  assert.ok(store.dismissedKeys(1).has(itemKey(item("One"))));

  assert.deepEqual(store.updateState(1, a.id, { useful: true }), { id: a.id, dismissed: true, useful: true });
  assert.deepEqual(store.updateState(1, a.id, { dismissed: false }), { id: a.id, dismissed: false, useful: true });
  assert.equal(store.dismissedKeys(1).size, 0);

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
  assert.equal(store.dismissedKeys(1).size, 0, "user 2's attempt changed nothing");

  // The same story for user 2 is a separate row with its own state.
  const [b] = store.recordShown(2, channelsOf(item("One"))).relevant;
  assert.notEqual(b.id, a.id);
  store.updateState(2, b.id, { dismissed: true });
  assert.equal(store.dismissedKeys(1).size, 0);
  assert.equal(store.dismissedKeys(2).size, 1);
});

test("unknown ids are not found", () => {
  const { store } = setup();
  assert.equal(store.recordOpen(1, 999), false);
  assert.equal(store.updateState(1, 999, { useful: true }), null);
});
