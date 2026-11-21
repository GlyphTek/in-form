import { test } from "node:test";
import assert from "node:assert/strict";
import { testConfig } from "./helpers.js";
import { buildApp } from "../server/app.js";
import { openDatabase, runMigrations } from "../server/db.js";

async function makeApp() {
  const config = testConfig();
  return buildApp(config, { db: openDatabase(":memory:") });
}

test("GET /api/health reports ok and applied migrations", async () => {
  const app = await makeApp();
  const res = await app.inject({ method: "GET", url: "/api/health" });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.status, "ok");
  assert.equal(body.database, "ok");
  assert.ok(body.migrations >= 1);
  await app.close();
});

test("serves the frontend at / with hardening headers", async () => {
  const app = await makeApp();
  const res = await app.inject({ method: "GET", url: "/" });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /IN-FORM/);
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  await app.close();
});

test("serves app.js and style.css but not server code", async () => {
  const app = await makeApp();
  assert.equal((await app.inject({ url: "/app.js" })).statusCode, 200);
  assert.equal((await app.inject({ url: "/style.css" })).statusCode, 200);
  assert.equal((await app.inject({ url: "/server/config.js" })).statusCode, 404);
  assert.equal((await app.inject({ url: "/package.json" })).statusCode, 404);
  await app.close();
});

test("unknown /api routes return JSON 404", async () => {
  const app = await makeApp();
  const res = await app.inject({ method: "GET", url: "/api/nope" });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, "not_found");
  await app.close();
});

test("migrations are idempotent", async () => {
  const config = testConfig();
  const db = openDatabase(":memory:");
  const first = runMigrations(db, config.migrationsDir, {});
  const second = runMigrations(db, config.migrationsDir, {});
  assert.ok(first.length >= 1);
  assert.equal(second.length, 0);
  db.close();
});

test("the app loads nothing from other websites: fonts are served locally and no page references an outside URL", async () => {
  const fs = await import("node:fs");
  const app = await makeApp();
  const font = await app.inject({ url: "/fonts/michroma-latin-400-normal.woff2" });
  assert.equal(font.statusCode, 200);
  assert.match(font.headers["content-type"], /font\/woff2|application\/(font-woff2|octet-stream)/);
  assert.equal((await app.inject({ url: "/fonts/Michroma-OFL.txt" })).statusCode, 200, "the font licence ships with the font");
  await app.close();

  for (const file of ["public/index.html", "public/style.css", "public/app.js", "index.html"]) {
    const text = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    // Links the user clicks (such as the item links) are built at run time; here we
    // only look for resources the page would fetch by itself.
    assert.doesNotMatch(text, /@import\s+url\(\s*['"]?https?:/i, `${file} imports from another site`);
    assert.doesNotMatch(text, /<(?:script|link|img|iframe)[^>]+(?:src|href)=["']https?:/i, `${file} loads from another site`);
    assert.doesNotMatch(text, /url\(\s*['"]?https?:/i, `${file} loads a resource from another site`);
  }
});
