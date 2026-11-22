import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Fastify from "fastify";
import { testConfig } from "./helpers.js";
import { buildApp } from "../server/app.js";
import { openDatabase } from "../server/db.js";
import updateRoutes, { isNewer, fetchLatestRelease } from "../server/routes/update.js";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const URL_OK = "https://github.com/GlyphTek/in-form/releases/tag/v0.9.0";
const release = (over = {}) => ({ ok: true, json: async () => ({ tag_name: "v0.9.0", html_url: URL_OK, ...over }) });

test("versions compare by number, and anything unreadable is never newer", () => {
  assert.equal(isNewer("0.3.0", "0.2.0"), true);
  assert.equal(isNewer("0.10.0", "0.9.0"), true, "numbers, not text");
  assert.equal(isNewer("1.0.0", "0.99.99"), true);
  assert.equal(isNewer("0.2.0", "0.2.0"), false);
  assert.equal(isNewer("0.1.9", "0.2.0"), false);
  assert.equal(isNewer("garbage", "0.2.0"), false);
  assert.equal(isNewer("0.3.0", "unknown"), false);
  assert.equal(isNewer("0.3", "0.2.0"), false);
});

test("only a well-formed GitHub release for this project is believed", async () => {
  assert.deepEqual(await fetchLatestRelease(async () => release()), { latest: "0.9.0", url: URL_OK });
  assert.equal(await fetchLatestRelease(async () => release({ tag_name: "latest" })), null);
  assert.equal(await fetchLatestRelease(async () => release({ tag_name: "v1.2.3-evil" })), null);
  assert.equal(await fetchLatestRelease(async () => release({ html_url: "https://evil.example/releases/" })), null);
  assert.equal(await fetchLatestRelease(async () => ({ ok: false })), null);
});

test("the route says whether a newer version exists, asks at most once a day, and stays quiet when it cannot find out", async () => {
  let t = 1_000_000;
  let calls = 0;
  let result = { latest: "0.9.0", url: URL_OK };
  const app = Fastify();
  await app.register(updateRoutes, { current: "0.2.0", now: () => t, fetchLatest: async () => { calls++; if (result instanceof Error) throw result; return result; } });

  const first = (await app.inject({ url: "/api/update" })).json();
  assert.deepEqual(first, { checked: true, current: "0.2.0", latest: "0.9.0", newer: true, url: URL_OK });
  await app.inject({ url: "/api/update" });
  assert.equal(calls, 1, "the second ask is answered from memory");
  t += 23 * 3_600_000;
  await app.inject({ url: "/api/update" });
  assert.equal(calls, 1);
  t += 2 * 3_600_000;
  result = new Error("offline");
  const later = (await app.inject({ url: "/api/update" })).json();
  assert.equal(calls, 2, "a day later it asks again");
  assert.deepEqual(later, { checked: false }, "unreachable: no claim either way");
  t += 30 * 60_000;
  await app.inject({ url: "/api/update" });
  assert.equal(calls, 2, "after a failure it waits an hour before trying again");
  t += 31 * 60_000;
  result = { latest: "0.2.0", url: URL_OK };
  assert.equal((await app.inject({ url: "/api/update" })).json().newer, false, "the same version is not newer");
  await app.close();
});

test("only a personal copy has the route: not the hosted phone version, not a password site, not when switched off", async () => {
  const stub = async () => ({ latest: "9.9.9", url: URL_OK });
  const make = async (config) => buildApp(config, { db: openDatabase(":memory:"), fetchLatest: stub });

  const personal = await make(testConfig());
  assert.equal((await personal.inject({ url: "/api/update" })).statusCode, 200);
  await personal.close();

  for (const [name, config] of [
    ["hosted", testConfig({ mode: "hosted" })],
    ["password", testConfig({ auth: { mode: "password", password: "a long enough passphrase" } })],
    ["switched off", testConfig({ updateCheck: false })],
  ]) {
    const app = await make(config);
    assert.equal((await app.inject({ url: "/api/update" })).statusCode, 404, `${name}: no update route`);
    await app.close();
  }
});

test("the page shows the notice only for a well-formed answer, and the privacy wording matches", () => {
  const js = read("public/app.js");
  assert.match(js, /async function checkForUpdate/);
  assert.match(js, /if \(deviceMode\) return;/);
  assert.match(js, /releases\//);
  assert.match(js, /inform_update_dismissed/);
  assert.match(read("README.md"), /INFORM_UPDATE_CHECK=off/);
  assert.match(read("index.html"), /INFORM_UPDATE_CHECK=off/);
  assert.match(read("index.html"), /Windows app only/);
});
