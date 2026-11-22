import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { testConfig } from "./helpers.js";
import { buildApp } from "../server/app.js";
import { openDatabase } from "../server/db.js";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("the health check says which version is running, so a bug report can name it", async () => {
  const app = await buildApp(testConfig(), { db: openDatabase(":memory:") });
  const res = await app.inject({ url: "/api/health" });
  const { version } = JSON.parse(res.body);
  assert.equal(version, JSON.parse(read("package.json")).version);
  await app.close();
});

test("the issue forms ask for what a report needs and tell people not to post personal details", () => {
  for (const f of [".github/ISSUE_TEMPLATE/bug.yml", ".github/ISSUE_TEMPLATE/feedback.yml"]) {
    assert.ok(existsSync(new URL(`../${f}`, import.meta.url)), `${f} exists`);
    const t = read(f);
    assert.match(t, /^name: .+/m);
    assert.match(t, /^description: .+/m);
    assert.match(t, /id: version/, "the form has a field the app can fill in");
    assert.match(t, /id: where/);
    assert.match(t, /personal details/i);
  }
  assert.match(read(".github/ISSUE_TEMPLATE/bug.yml"), /id: happened/);
});

test("the app and the download page link to feedback, and the app fills in the version", () => {
  const html = read("public/index.html");
  assert.match(html, /id="feedback-link"[^>]*href="https:\/\/github\.com\/GlyphTek\/in-form\/issues\/new\?template=feedback\.yml"/);
  assert.match(html, /id="feedback-link"[^>]*rel="noopener noreferrer"/);
  const js = read("public/app.js");
  assert.match(js, /&version=\$\{encodeURIComponent\(appVersion\)\}/);
  const page = read("index.html");
  assert.match(page, /TELL ME WHAT YOU THINK/);
  assert.match(page, /issues\/new\/choose/);
  assert.match(page, /free GitHub account/);
});

test("the feedback link is the only thing the app sends a version to, and only as part of the link the person chooses to open", () => {
  const js = read("public/app.js").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  assert.doesNotMatch(js, /fetch\([^)]*github\.com/, "the app never contacts GitHub by itself");
});
