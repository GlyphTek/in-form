import { test } from "node:test";
import assert from "node:assert/strict";
import { createDeviceStore, CAPS, DEVICE_STATE_KEY } from "../public/device-store.js";
import { LIMITS } from "../server/routes/hosted.js";
import { itemKey, createSignalStore } from "../server/store/signals.js";
import { buildApp } from "../server/app.js";
import { openDatabase } from "../server/db.js";
import { testConfig } from "./helpers.js";

const DAY = 86_400_000;
const T0 = Date.parse("2026-11-22T00:00:00Z");

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
  };
}
function clock(start = T0) {
  let t = start;
  const now = () => t;
  now.advance = (ms) => { t += ms; };
  return now;
}
const item = (n, source = "topic:news", extra = {}) => ({
  title: `Story ${n} about the harbour`,
  link: `https://news.example/${source}/${n}`,
  linkText: "news.example",
  source,
  published: new Date(T0 - n * 3_600_000).toISOString(),
  score: 5,
  reason: "recent item",
  ...extra,
});
const withKey = (i) => ({ ...i, key: itemKey(i) });
const shown = (...items) => ({ relevant: items.map(withKey), attention: [], knowing: [], experience: [] });
const idOf = (out, n) => out.relevant[n].id;

test("the phone's limits never exceed what the server accepts", () => {
  assert.ok(CAPS.seen <= LIMITS.seen);
  assert.ok(CAPS.dismissed <= LIMITS.dismissed);
  assert.ok(CAPS.feedback <= LIMITS.feedback);
  assert.ok(CAPS.keyLength <= LIMITS.keyLength);
});

test("a new device remembers nothing", () => {
  const store = createDeviceStore({ storage: fakeStorage(), now: clock() });
  assert.deepEqual(store.snapshot(), { seen: [], dismissed: [], feedback: [] });
  assert.equal(store.persistent, true);
  assert.equal(store.problem, null);
});

test("showing items gives each a stable local id and remembers it as seen", () => {
  const store = createDeviceStore({ storage: fakeStorage(), now: clock() });
  const out = store.recordShown(shown(item(1), item(2)));
  assert.deepEqual(out.relevant.map((i) => [i.id, i.useful]), [[1, false], [2, false]]);
  assert.equal(out.relevant[0].title, item(1).title, "the item itself is unchanged");
  assert.deepEqual(store.snapshot().seen.sort(), [itemKey(item(1)), itemKey(item(2))].sort());
  const again = store.recordShown(shown(item(1)));
  assert.equal(again.relevant[0].id, 1, "the same item keeps its id");
});

test("history survives a restart, and a damaged copy is ignored instead of breaking the app", () => {
  const storage = fakeStorage();
  const a = createDeviceStore({ storage, now: clock() });
  const out = a.recordShown(shown(item(1)));
  a.updateState(idOf(out, 0), { useful: true });
  const b = createDeviceStore({ storage, now: clock() });
  assert.deepEqual(b.snapshot(), a.snapshot());
  assert.equal(b.recordShown(shown(item(1))).relevant[0].useful, true);

  for (const bad of ["{not json", JSON.stringify({ v: 2, nextId: 1, entries: {} }), JSON.stringify({ v: 1 }), "null", "42"]) {
    const c = createDeviceStore({ storage: fakeStorage({ [DEVICE_STATE_KEY]: bad }), now: clock() });
    assert.deepEqual(c.snapshot(), { seen: [], dismissed: [], feedback: [] }, bad);
  }
});

test("it says so when the browser will not keep history, and still works for this visit", () => {
  const noStorage = createDeviceStore({ storage: null, now: clock() });
  assert.match(noStorage.problem, /not keeping history/);
  assert.equal(noStorage.recordShown(shown(item(1))).relevant[0].id, 1);

  const blocked = createDeviceStore({ storage: { getItem() { throw new Error("denied"); }, setItem() {} }, now: clock() });
  assert.equal(blocked.persistent, false);
  assert.match(blocked.problem, /will not let IN-FORM keep history/);

  let full = false;
  const filling = createDeviceStore({ storage: { getItem: () => null, setItem() { if (full) throw new Error("quota"); } }, now: clock() });
  filling.recordShown(shown(item(1)));
  assert.equal(filling.persistent, true);
  full = true;
  filling.recordShown(shown(item(2)));
  assert.equal(filling.persistent, false);
  assert.match(filling.problem, /no room left/);
  assert.equal(filling.snapshot().seen.length, 2, "it keeps working in memory");
});

test("opening, Useful and Dismiss work, are idempotent, and can be undone", () => {
  const now = clock();
  const store = createDeviceStore({ storage: fakeStorage(), now });
  const out = store.recordShown(shown(item(1), item(2)));
  const [a, b] = [idOf(out, 0), idOf(out, 1)];

  assert.equal(store.recordOpen(a), true);
  assert.equal(store.recordOpen(999), false);
  assert.deepEqual(store.updateState(a, { useful: true }), { id: a, dismissed: false, useful: true });
  now.advance(1000);
  assert.deepEqual(store.updateState(a, { useful: true }), { id: a, dismissed: false, useful: true });
  assert.equal(store.snapshot().feedback.find((r) => r.title === item(1).title).usefulAt, new Date(T0).toISOString(), "marking twice keeps the first time");
  assert.deepEqual(store.updateState(b, { dismissed: true }), { id: b, dismissed: true, useful: false });
  assert.deepEqual(store.snapshot().dismissed, [itemKey(item(2))]);
  assert.ok(!store.snapshot().seen.includes(itemKey(item(2))), "dismissed items are listed once, as dismissed");
  assert.deepEqual(store.updateState(b, { dismissed: false }), { id: b, dismissed: false, useful: false });
  assert.equal(store.snapshot().dismissed.length, 0);
  assert.equal(store.updateState(999, { useful: true }), null);
});

test("removing a topic and adding it back makes its items new again, but dismissed ones stay hidden", () => {
  const store = createDeviceStore({ storage: fakeStorage(), now: clock() });
  const out = store.recordShown(shown(item(1, "topic:news"), item(2, "topic:news"), item(3, "topic:science")));
  store.updateState(idOf(out, 1), { dismissed: true });
  assert.equal(store.forgetSources(["Topic:News"]), 2, "case does not matter");
  const snap = store.snapshot();
  assert.deepEqual(snap.seen, [itemKey(item(3, "topic:science"))]);
  assert.deepEqual(snap.dismissed, [itemKey(item(2, "topic:news"))]);
  store.recordShown(shown(item(1, "topic:news")));
  assert.ok(store.snapshot().seen.includes(itemKey(item(1, "topic:news"))), "shown again, so seen again");
  assert.equal(store.forgetSources(["topic:never-used"]), 0);
});

test("old history is forgotten so storage stays small, but what you reacted to is kept longer", () => {
  const now = clock();
  const storage = fakeStorage();
  const store = createDeviceStore({ storage, now });
  const out = store.recordShown(shown(item(1), item(2)));
  store.updateState(idOf(out, 1), { useful: true });

  now.advance(50 * DAY);
  const later = createDeviceStore({ storage, now });
  assert.deepEqual(later.snapshot().seen, [itemKey(item(2))], "item 1, only seen, is older than 45 days and cannot come back, so it is dropped; item 2 has a Useful mark and stays");
  assert.equal(later.snapshot().feedback.length, 1, "a Useful mark is kept");

  now.advance(140 * DAY);
  assert.equal(createDeviceStore({ storage, now }).snapshot().feedback.length, 0, "and goes after about 6 months");
});

test("a snapshot never exceeds the request limits, keeping the most recent", () => {
  const now = clock();
  const store = createDeviceStore({ storage: fakeStorage(), now });
  let lastKey;
  for (let batch = 0; batch < 100; batch++) {
    const items = Array.from({ length: 50 }, (_, i) => item(batch * 50 + i));
    store.recordShown(shown(...items));
    lastKey = itemKey(items[items.length - 1]);
    now.advance(1000);
  }
  const out = store.recordShown(shown(...Array.from({ length: 30 }, (_, i) => item(90_000 + i))));
  for (const row of out.relevant) { store.recordOpen(row.id); store.updateState(row.id, { dismissed: true }); }
  const snap = store.snapshot();
  assert.ok(snap.seen.length <= CAPS.seen && snap.dismissed.length <= CAPS.dismissed && snap.feedback.length <= CAPS.feedback);
  assert.equal(snap.seen.length, CAPS.seen);
  assert.ok(snap.seen.includes(lastKey), "the most recent items are the ones kept");

  const long = createDeviceStore({ storage: fakeStorage(), now: clock() });
  long.recordShown(shown({ ...item(1), link: `https://news.example/${"x".repeat(CAPS.keyLength + 10)}` }));
  assert.deepEqual(long.snapshot().seen, [], "a key the server would refuse is left out instead of breaking every request");
});

test("clearing erases everything", () => {
  const storage = fakeStorage();
  const store = createDeviceStore({ storage, now: clock() });
  store.recordShown(shown(item(1)));
  store.clear();
  assert.deepEqual(store.snapshot(), { seen: [], dismissed: [], feedback: [] });
  assert.deepEqual(createDeviceStore({ storage, now: clock() }).snapshot(), { seen: [], dismissed: [], feedback: [] });
});

test("it agrees with the server's own store on the same actions", async () => {
  const app = await buildApp(testConfig(), { db: openDatabase(":memory:") });
  await app.inject({ method: "GET", url: "/api/auth/me" });
  const userId = app.db.prepare("SELECT id FROM users LIMIT 1").get().id;
  const server = createSignalStore(app.db);

  const now = clock();
  const device = createDeviceStore({ storage: fakeStorage(), now });
  const step = (fn) => { now.advance(60_000); return fn(new Date(now()).toISOString()); };

  const batch1 = [item(1, "topic:news"), item(2, "topic:news"), item(3, "topic:science"), item(4, "topic:science")];
  const s1 = step((at) => server.recordShown(userId, shown(...batch1), at));
  const d1 = device.recordShown(shown(...batch1));
  assert.deepEqual(d1.relevant.map((i) => [i.id, i.useful]), s1.relevant.map((i) => [i.id, i.useful]));

  step((at) => server.recordOpen(userId, s1.relevant[0].id, at)); device.recordOpen(d1.relevant[0].id);
  step((at) => server.recordOpen(userId, s1.relevant[0].id, at)); device.recordOpen(d1.relevant[0].id);
  step((at) => server.updateState(userId, s1.relevant[1].id, { useful: true }, at)); device.updateState(d1.relevant[1].id, { useful: true });
  step((at) => server.updateState(userId, s1.relevant[2].id, { dismissed: true }, at)); device.updateState(d1.relevant[2].id, { dismissed: true });
  step((at) => server.updateState(userId, s1.relevant[3].id, { dismissed: true }, at)); device.updateState(d1.relevant[3].id, { dismissed: true });
  step((at) => server.updateState(userId, s1.relevant[3].id, { dismissed: false }, at)); device.updateState(d1.relevant[3].id, { dismissed: false });
  step((at) => server.forgetSources(userId, ["topic:science"], at)); device.forgetSources(["topic:science"]);
  const s2 = step((at) => server.recordShown(userId, shown(item(4, "topic:science"), item(5, "topic:news")), at));
  const d2 = device.recordShown(shown(item(4, "topic:science"), item(5, "topic:news")));
  assert.deepEqual(d2.relevant.map((i) => [i.id, i.useful]), s2.relevant.map((i) => [i.id, i.useful]));

  const snap = device.snapshot();
  const seen = [], dismissed = [];
  for (const [key, state] of server.seenKeys(userId)) (state === "dismissed" ? dismissed : seen).push(key);
  assert.deepEqual([...snap.seen].sort(), seen.sort());
  assert.deepEqual([...snap.dismissed].sort(), dismissed.sort());
  const byTitle = (a, b) => a.title.localeCompare(b.title);
  assert.deepEqual([...snap.feedback].sort(byTitle), server.feedbackRows(userId).sort(byTitle));
  assert.ok(snap.seen.length > 0 && snap.dismissed.length > 0 && snap.feedback.length >= 3, "the comparison covers every kind of state");
  await app.close();
});

test("end to end with the hosted server: pressing until caught up never repeats an item", async () => {
  const NOW = Date.now();
  const ingestor = {
    async getItems(input) {
      const id = input.replace(/^topic:/, "").replace(/@.*/, "");
      const items = Array.from({ length: 9 }, (_, i) => ({
        title: `${id} story ${i + 1} about harbour planning`,
        link: `https://news.example/${id}/${i + 1}`,
        published: new Date(NOW - (i + 1) * 3_600_000).toISOString(),
        summary: "",
      }));
      return { input, kind: "topic", label: id, status: "ok", fetchedAt: null, error: null, items };
    },
    listHealth: () => [],
  };
  const app = await buildApp(testConfig({ mode: "hosted" }), { db: openDatabase(":memory:"), ingestor, generateOptions: { now: () => NOW } });
  const store = createDeviceStore({ storage: fakeStorage(), now: () => NOW });

  const offered = new Set();
  let result;
  for (let press = 0; press < 12; press++) {
    const res = await app.inject({ method: "POST", url: "/api/v1/generate", payload: { topics: ["technology", "science"], ...store.snapshot() } });
    assert.equal(res.statusCode, 200, "the server accepts exactly what the store produces");
    result = res.json();
    if (result.caughtUp) break;
    const out = store.recordShown(result.channels);
    for (const row of Object.values(out).flat()) {
      assert.ok(!offered.has(row.key), `${row.key} was offered twice`);
      offered.add(row.key);
    }
    // React like a person would, so feedback is sent too.
    const first = Object.values(out).flat()[0];
    if (first) { store.recordOpen(first.id); store.updateState(first.id, { useful: true }); }
  }
  assert.equal(result.caughtUp, true, "it reaches the end");
  assert.equal(offered.size, 18, "all 18 items were offered exactly once");
  await app.close();
});
