import { test } from "node:test";
import assert from "node:assert/strict";
import { NODE_VERSION, NODE_TARBALL_INTEGRITY, START_BAT, README_TXT, pruneModules } from "../scripts/package-win.mjs";

const atLeast = (v, min) => {
  const a = v.split(".").map(Number), b = min.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
};

test("the bundled Node is new enough for built-in SQLite and the hash is pinned", () => {
  assert.ok(atLeast(NODE_VERSION, "22.13.0"), NODE_VERSION);
  assert.match(NODE_TARBALL_INTEGRITY, /^sha512-[A-Za-z0-9+/]{86}==$/);
});

test("start.bat runs locally with no sign-in, keeps data outside the app folder, and uses its own node.exe", () => {
  assert.match(START_BAT, /set INFORM_AUTH=off/);
  assert.match(START_BAT, /set HOST=127\.0\.0\.1/);
  assert.match(START_BAT, /GENERATE_RATE_LIMIT_PER_MINUTE=120/, "pressing quickly must not be refused on a one-person copy");
  assert.doesNotMatch(START_BAT, /HOST=0\.0\.0\.0/);
  assert.match(START_BAT, /DATABASE_PATH=%APPDATA%\\IN-FORM\\inform\.db/);
  assert.match(START_BAT, /set "NODE_CMD=%~dp0node\.exe"/, "prefers the node.exe next to it");
  assert.match(START_BAT, /"%NODE_CMD%" .*server\\index\.js/);
  assert.match(START_BAT, /process\.versions\.node/, "the lite package checks the installed Node version");
  assert.match(START_BAT, /\r\n/, "batch files need Windows line endings");
  assert.doesNotMatch(START_BAT, /[^\r]\n/);
});

test("the readme tells people about the unsigned warning, where data lives, and the no-password caveat", () => {
  assert.match(README_TXT, /unknown publisher/);
  assert.match(README_TXT, /%APPDATA%\\IN-FORM/);
  assert.match(README_TXT, /no password/);
});

test("pruning removes docs, types, maps and test folders but keeps code and licences", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prune-"));
  const w = (rel, text = "x") => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
  w("pkg/index.js"); w("pkg/lib/util.js"); w("pkg/package.json"); w("pkg/LICENSE"); w("pkg/LICENSE.md"); w("pkg/README.md");
  w("pkg/index.d.ts"); w("pkg/index.js.map"); w("pkg/test/a.js"); w("pkg/docs/b.md"); w("pkg/CHANGELOG.md");
  pruneModules(dir);
  const left = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(path.join(d, e.name)) : left.push(path.relative(dir, path.join(d, e.name)).split(path.sep).join("/")); })(dir);
  assert.deepEqual(left.sort(), ["pkg/LICENSE", "pkg/LICENSE.md", "pkg/index.js", "pkg/lib/util.js", "pkg/package.json"]);
  fs.rmSync(dir, { recursive: true, force: true });
});
