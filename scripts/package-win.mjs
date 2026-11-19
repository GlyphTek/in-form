// Builds the portable Windows package: dist/in-form-<version>-win-x64.zip
//
//   node scripts/package-win.mjs                    fetch node.exe from npm
//   node scripts/package-win.mjs --node-exe <path>  use a node.exe you supply
//
// The package is a plain folder: node.exe, the app, its (pure JavaScript)
// dependencies, and a start.bat that runs it for one person on this computer.
// Nothing is installed and nothing needs a compiler. Run it on any OS.
//
// node.exe comes from the `node-win-x64` npm package, pinned to an exact version
// whose tarball hash is checked below, and the node.exe hash is printed so it can
// be compared with the official list at
//   https://nodejs.org/dist/v<NODE_VERSION>/SHASUMS256.txt   (line: win-x64/node.exe)

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The Node release bundled into the app. Must be 22.13 or newer (built-in SQLite).
export const NODE_VERSION = "22.23.4";
// Hash of the node-win-x64@NODE_VERSION tarball as published on npm.
export const NODE_TARBALL_INTEGRITY =
  "sha512-huo+na0+5+/jIQiOBRVVauXiGEuuyd9KTe1JPu+BcJDtHbv35cVWmQaO/O5L0940EP5tU9flaZm3hnAMSIf60g==";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const name = `in-form-${pkg.version}-win-x64`;
const dist = path.join(root, "dist");
const out = path.join(dist, name);

export const START_BAT = [
  "@echo off",
  "setlocal",
  'cd /d "%~dp0"',
  "title IN-FORM",
  "",
  "rem IN-FORM for one person on this computer: it only answers this computer,",
  "rem so there is no sign-in. Your setup and history live in %APPDATA%\\IN-FORM.",
  "set INFORM_AUTH=off",
  "set HOST=127.0.0.1",
  "if not defined PORT set PORT=3000",
  'if not defined DATABASE_PATH set "DATABASE_PATH=%APPDATA%\\IN-FORM\\inform.db"',
  "set LOG_LEVEL=warn",
  "",
  "echo.",
  "echo   IN-FORM is starting. Your browser will open at http://127.0.0.1:%PORT%",
  "echo   Keep this window open while you use it. Close it to stop IN-FORM.",
  "echo.",
  "",
  'start "" /b cmd /c "ping -n 4 127.0.0.1 >nul && start http://127.0.0.1:%PORT%"',
  '"%~dp0node.exe" --disable-warning=ExperimentalWarning server\\index.js',
  "",
  "echo.",
  "echo   IN-FORM stopped. If it says the port is in use, another copy is probably",
  "echo   still running: close its window, or set PORT to another number and retry.",
  "pause",
  "",
].join("\r\n");

export const README_TXT = [
  "IN-FORM (portable, Windows)",
  "",
  "To start: double-click start.bat. Your browser opens on IN-FORM.",
  "Keep the black window open while you use it; close it to stop.",
  "",
  "Windows may warn that start.bat comes from an unknown publisher (this app is",
  "not code-signed). Choose More info, then Run anyway, if you downloaded it from",
  "the official IN-FORM release page. If you moved it from a zip, right-click the",
  "zip first, choose Properties, tick Unblock, then extract.",
  "",
  "Your setup and history are kept in %APPDATA%\\IN-FORM (paste that into the",
  "File Explorer address bar). They survive updating this folder. To update,",
  "download the new zip and replace this folder.",
  "",
  "Back up or move your setup from the setup screen: \"Back up or move your setup\".",
  "",
  "This copy only answers your own computer (127.0.0.1) and has no password.",
  "Do not expose it to a network.",
  "",
].join("\r\n");

function sha(file, algo) {
  return createHash(algo).update(fs.readFileSync(file)).digest("hex");
}

function fetchNodeExe(tmp) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  execFileSync(npm, ["pack", `node-win-x64@${NODE_VERSION}`, "--pack-destination", tmp], { cwd: tmp, stdio: "inherit", shell: process.platform === "win32" });
  const tgz = path.join(tmp, `node-win-x64-${NODE_VERSION}.tgz`);
  const actual = "sha512-" + createHash("sha512").update(fs.readFileSync(tgz)).digest("base64");
  if (actual !== NODE_TARBALL_INTEGRITY) {
    throw new Error(`node-win-x64@${NODE_VERSION} does not match the pinned hash.\n  expected ${NODE_TARBALL_INTEGRITY}\n  got      ${actual}`);
  }
  execFileSync("tar", ["-xzf", tgz, "-C", tmp], { stdio: "inherit" });
  return path.join(tmp, "package", "bin", "node.exe");
}

function main() {
  const flag = process.argv.indexOf("--node-exe");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "inform-pack-"));
  try {
    const nodeExe = flag > -1 ? path.resolve(process.argv[flag + 1]) : fetchNodeExe(tmp);
    if (!fs.existsSync(nodeExe)) throw new Error(`node.exe not found at ${nodeExe}`);

    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });

    fs.copyFileSync(nodeExe, path.join(out, "node.exe"));
    for (const dir of ["server", "public"]) fs.cpSync(path.join(root, dir), path.join(out, dir), { recursive: true });
    for (const file of ["package.json", "package-lock.json"]) fs.copyFileSync(path.join(root, file), path.join(out, file));

    // Production dependencies only, and never run install scripts: everything
    // IN-FORM depends on is plain JavaScript.
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    execFileSync(npm, ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: out, stdio: "inherit", shell: process.platform === "win32" });

    fs.writeFileSync(path.join(out, "start.bat"), START_BAT);
    fs.writeFileSync(path.join(out, "README.txt"), README_TXT);

    const zip = path.join(dist, `${name}.zip`);
    fs.rmSync(zip, { force: true });
    if (process.platform === "win32") {
      execFileSync("tar", ["-a", "-c", "-f", zip, "-C", dist, name], { stdio: "inherit" });
    } else {
      execFileSync("zip", ["-q", "-r", zip, name], { cwd: dist, stdio: "inherit" });
    }

    console.log(`\nBuilt ${path.relative(root, zip)} (${(fs.statSync(zip).size / 1048576).toFixed(1)} MB)`);
    console.log(`node.exe sha256: ${sha(path.join(out, "node.exe"), "sha256")}`);
    console.log(`Compare with the win-x64/node.exe line at https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
