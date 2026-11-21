import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

// The Windows pieces can only be compiled and run in CI (windows-latest). These checks
// catch the mistakes that are cheap to catch anywhere.

test("the icon is a real .ico with the sizes Windows asks for", () => {
  const b = fs.readFileSync(path.join(root, "installer/inform.ico"));
  assert.equal(b.readUInt16LE(0), 0, "reserved");
  assert.equal(b.readUInt16LE(2), 1, "type 1 = icon");
  const count = b.readUInt16LE(4);
  assert.ok(count >= 5, `only ${count} sizes`);
  const sizes = [];
  for (let i = 0; i < count; i++) sizes.push(b[6 + i * 16] || 256);
  for (const s of [16, 32, 48, 256]) assert.ok(sizes.includes(s), `missing ${s}px`);
});

test("the launcher sticks to C# 5, which is all the compiler on the Windows runner knows", () => {
  const cs = read("installer/IN-FORM.cs").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(cs, /\$"/, "string interpolation");
  assert.doesNotMatch(cs, /\?\./, "null-conditional");
  assert.doesNotMatch(cs, /=>/, "expression bodies and lambdas");
  assert.doesNotMatch(cs, /\bnameof\s*\(/, "nameof");
  assert.doesNotMatch(cs, /\bout var\b/, "out var");
  assert.doesNotMatch(cs, /\bis \w+ \w+\)/, "pattern matching");
});

test("the launcher runs IN-FORM the way start.bat does: local only, no sign-in, data in AppData", () => {
  const cs = read("installer/IN-FORM.cs");
  assert.match(cs, /"INFORM_AUTH"\] = "off"/);
  assert.match(cs, /"HOST"\] = "127\.0\.0\.1"/);
  assert.doesNotMatch(cs, /0\.0\.0\.0/);
  assert.match(cs, /SpecialFolder\.ApplicationData/);
  assert.match(cs, /"GENERATE_RATE_LIMIT_PER_MINUTE", "120"/);
  assert.match(cs, /CreateNoWindow = true/, "no black window");
  assert.match(cs, /"--stop"/);
  assert.match(cs, /"--quiet"/);
  assert.match(cs, /\/api\/health/, "reuses a running server instead of starting a second one");
});

test("the installer script installs per user and sets up icons, stop and uninstall", () => {
  const iss = read("installer/inform.iss");
  assert.match(iss, /PrivilegesRequired=lowest/, "no administrator prompt");
  assert.match(iss, /DefaultDirName=\{autopf\}\\IN-FORM/);
  assert.match(iss, /AppId=\{\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}/);
  assert.match(iss, /AppPublisher=JV7T9 - GlyphTek Project/);
  assert.match(iss, /\{autoprograms\}\\IN-FORM/);
  assert.match(iss, /\{autodesktop\}\\IN-FORM/);
  assert.match(iss, /Parameters: "--stop"/);
  assert.match(iss, /\[UninstallRun\]/);
  assert.match(iss, /Excludes: "start\.bat,README\.txt"/, "the launcher replaces start.bat");
  assert.match(iss, /MsgBox\(.*delete your setup and history/s, "uninstall asks before deleting the user's data");
  assert.match(iss, /MB_DEFBUTTON2/, "and defaults to keeping it");
});

test("the release workflow builds the installer on Windows, tests it, and checksums everything", () => {
  const y = read(".github/workflows/release.yml");
  assert.match(y, /runs-on: windows-latest/);
  assert.match(y, /csc\.exe/);
  assert.match(y, /ISCC\.exe/);
  assert.match(y, /unins000\.exe/, "the CI really uninstalls it");
  assert.match(y, /INFORM_NO_BROWSER/);
  assert.match(y, /sha256sum IN-FORM-Setup-\*\.exe in-form-\*\.zip/);
  assert.match(y, /needs: \[packages, installer\]/, "nothing is published unless the install test passed");
  assert.match(y, /--repo "\$\{GITHUB_REPOSITORY\}"/, "the publish job has no checkout");
});
