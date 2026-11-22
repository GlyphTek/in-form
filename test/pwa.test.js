import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { testConfig } from "./helpers.js";
import { buildApp } from "../server/app.js";
import { openDatabase } from "../server/db.js";

const pub = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const read = (f) => fs.readFileSync(path.join(pub, f), "utf8");
const pngSize = (f) => {
  const b = fs.readFileSync(path.join(pub, f));
  assert.equal(b.toString("ascii", 1, 4), "PNG", `${f} is not a PNG`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

test("the manifest has what a phone needs to offer 'add to home screen'", () => {
  const m = JSON.parse(read("manifest.webmanifest"));
  assert.equal(m.name, "IN-FORM");
  assert.equal(m.display, "standalone");
  assert.equal(m.start_url, "/");
  assert.match(m.background_color, /^#[0-9a-f]{6}$/i);
  assert.match(m.theme_color, /^#[0-9a-f]{6}$/i);
  const purposes = m.icons.map((i) => `${i.sizes}:${i.purpose}`);
  assert.ok(purposes.includes("192x192:any") && purposes.includes("512x512:any"), "192 and 512 icons");
  assert.ok(purposes.includes("512x512:maskable"), "a maskable icon so Android does not crop the artwork");
  for (const icon of m.icons) {
    const [w, h] = pngSize(icon.src);
    assert.equal(`${w}x${h}`, icon.sizes, `${icon.src} really is ${icon.sizes}`);
  }
});

test("the page links the manifest and icons, and the apple icon is 180px", () => {
  const html = read("index.html");
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /<meta name="theme-color"/);
  assert.match(html, /apple-touch-icon" href="icons\/apple-touch-icon\.png"/);
  assert.match(html, /viewport-fit=cover/);
  assert.deepEqual(pngSize("icons/apple-touch-icon.png"), [180, 180]);
  assert.deepEqual(pngSize("icons/favicon-32.png"), [32, 32]);
});

test("the service worker saves only the app's own files and never /api, so it can't show old news", () => {
  const sw = read("sw.js");
  assert.match(sw, /pathname\.startsWith\("\/api\/"\)\) return/, "API requests are left alone");
  assert.match(sw, /request\.method !== "GET"\) return/);
  assert.match(sw, /url\.origin !== self\.location\.origin\) return/, "nothing from other sites");
  const listed = [...sw.slice(sw.indexOf("const SHELL"), sw.indexOf("];")).matchAll(/"(\/[^"]*)"/g)].map((m) => m[1]);
  assert.ok(listed.length >= 8);
  for (const url of listed) {
    if (url === "/") continue;
    assert.ok(fs.existsSync(path.join(pub, url)), `${url} is in the cache list but missing from public/`);
  }
  assert.ok(!listed.some((u) => u.startsWith("/api")), "no API path is ever precached");
});

test("the app registers the service worker without depending on it", () => {
  const js = read("app.js");
  assert.match(js, /serviceWorker\.register\("\/sw\.js"\)\.catch\(/);
});

test("the server serves the manifest and worker with the right types", async () => {
  const app = await buildApp(testConfig(), { db: openDatabase(":memory:") });
  const manifest = await app.inject({ method: "GET", url: "/manifest.webmanifest" });
  assert.equal(manifest.statusCode, 200);
  assert.match(manifest.headers["content-type"], /manifest\+json|json/);
  const sw = await app.inject({ method: "GET", url: "/sw.js" });
  assert.equal(sw.statusCode, 200);
  assert.match(sw.headers["content-type"], /javascript/);
  const icon = await app.inject({ method: "GET", url: "/icons/icon-512.png" });
  assert.equal(icon.statusCode, 200);
  assert.match(icon.headers["content-type"], /image\/png/);
  await app.close();
});
