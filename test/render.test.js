import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const code = (f) => read(f).split("\n").filter((l) => !/^\s*(#|\/\/)/.test(l)).join("\n");

test("render.yaml runs the free phone version: hosted, free plan, no password, behind a proxy", () => {
  const y = code("render.yaml");
  assert.match(y, /runtime:\s*docker/);
  assert.match(y, /plan:\s*free/);
  assert.match(y, /healthCheckPath:\s*\/api\/health/);
  assert.match(y, /key:\s*INFORM_MODE\s*\n\s*value:\s*hosted/);
  assert.match(y, /key:\s*TRUST_PROXY\s*\n\s*value:\s*"true"/);
  assert.match(y, /key:\s*HOST\s*\n\s*value:\s*0\.0\.0\.0/);
  assert.doesNotMatch(y, /INFORM_PASSWORD|INFORM_AUTH/);
  assert.doesNotMatch(y, /disk:/, "the free plan has no persistent disk");
  assert.match(y, /DATABASE_PATH\s*\n\s*value:\s*\/tmp\//, "the database must be somewhere writable and disposable");
});

test("a sleeping free host is handled: patient requests, a waking notice, and no waiting at startup", () => {
  const a = code("public/app.js");
  assert.match(a, /Waking the server up/);
  assert.match(a, /WAKE_STATUSES\s*=\s*\[502,\s*503,\s*504\]/);
  assert.match(a, /inform_hosted_origin/);
  assert.match(a, /knownHosted\(\)/);
});

test("the deploy guide covers Render, says what is free and what is not", () => {
  const d = read("docs/DEPLOY.md");
  assert.match(d, /Render/);
  assert.match(d, /render\.yaml/);
  assert.match(d, /sleeps after 15 minutes/i);
  assert.match(d, /about a minute/i);
});

test("the download page offers the phone version, with install steps and honest limits", () => {
  const h = read("index.html");
  assert.match(h, /href="https:\/\/in-form\.onrender\.com"/);
  assert.match(h, /Add to Home Screen/);
  assert.match(h, /about a minute/);
  assert.match(h, /keeps nothing/);
  assert.match(h, /built-in topics only/);
  assert.doesNotMatch(h, /never leaves your phone/i, "the server does see the request, so never claim that");
});

test("the phone version offers to install: a button where the browser allows it, steps where it does not", () => {
  const a = code("public/app.js");
  assert.match(a, /beforeinstallprompt/);
  assert.match(a, /appinstalled/);
  assert.match(a, /display-mode: standalone/);
  assert.match(a, /Add to Home Screen/);
  assert.match(a, /deviceMode && !isInstalled\(\)/, "only the phone version, and not once installed");
  const h = read("public/index.html");
  assert.match(h, /id="install-hint"/);
  assert.match(h, /id="install-dismiss"/);
});

test("headlines are easier to read and show who the source is, using the publisher for Google News links", () => {
  const a = code("public/app.js");
  assert.match(a, /function splitHeadline/);
  assert.match(a, /lastIndexOf\(" - "\)/, "Google News headlines end with ' - Publisher'");
  assert.match(a, /class="signal-title"/);
  assert.match(a, /class="signal-source"/);
  const c = code("public/style.css");
  assert.match(c, /p\.signal-title\{[^}]*font-size:\.98rem/);
  assert.match(c, /p\.signal-source\{[^}]*text-transform:uppercase/);
});

test("the known limits say plainly that it is built for $0 on free tiers", () => {
  for (const f of ["index.html", "README.md"]) {
    const t = read(f);
    assert.match(t, /Built for \$0/);
    assert.match(t, /free-tier wake-up delays/);
    assert.match(t, /no paid cloud AI/);
  }
});
