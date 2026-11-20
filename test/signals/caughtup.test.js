import { test } from "node:test";
import assert from "node:assert/strict";
import { testConfig } from "../helpers.js";
import { buildApp } from "../../server/app.js";
import { openDatabase } from "../../server/db.js";

const PASSWORD = "correct horse battery staple";
const items = (n) => Array.from({ length: n }, (_, i) => ({ title: `Story ${i}`, link: `https://news.example.com/s${i}`, published: new Date().toISOString(), summary: "" }));

async function makeApp(getItems) {
  const db = openDatabase(":memory:");
  const config = testConfig({ auth: { mode: "password", password: PASSWORD, loginRateLimitPerMinute: 100 }, generateRateLimitPerMinute: 1000 });
  const app = await buildApp(config, { db, ingestor: { getItems, listHealth: () => [] } });
  const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { password: PASSWORD } });
  const headers = { cookie: `inform_session=${login.cookies.find((c) => c.name === "inform_session").value}` };
  const press = () => app.inject({ method: "POST", url: "/api/signals/generate", headers, payload: { sources: ["feed"] } }).then((r) => r.json());
  return { app, press };
}

test("pressing through a finite source ends in caughtUp, and it stays that way", async () => {
  const { app, press } = await makeApp(async (input) => ({ input, kind: "keyword", status: "ok", items: items(7), fetchedAt: null, error: null }));
  const states = [];
  for (let i = 0; i < 6; i++) states.push((await press()).caughtUp);
  const firstDone = states.indexOf(true);
  assert.ok(firstDone > 0, `not done on the first press: ${states}`);
  assert.ok(states.slice(firstDone).every(Boolean), `stays done: ${states}`);
  await app.close();
});

test("a source that fails on the last press does not read as caught up", async () => {
  let failing = false;
  const { app, press } = await makeApp(async (input) =>
    failing
      ? { input, kind: "keyword", status: "error", items: [], fetchedAt: null, error: { kind: "network", message: "down" } }
      : { input, kind: "keyword", status: "ok", items: items(3), fetchedAt: null, error: null });
  while (!(await press()).caughtUp) { /* press until done */ }
  failing = true;
  const r = await press();
  assert.equal(r.status, "unavailable");
  assert.equal(r.caughtUp, false);
  await app.close();
});
