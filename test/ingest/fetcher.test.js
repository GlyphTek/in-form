// Exercises the real fetcher against a local HTTP server. The server is on
// loopback, so tests that want a response relax the address guard via the
// injectable options; the final tests prove the DEFAULT guard blocks it.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { createSafeFetcher, describeNetworkError } from "../../server/ingest/fetcher.js";
import { fixture } from "../helpers.js";

const RSS = fixture("rss2.xml");
let server;
let base;
let port;

before(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    switch (url.pathname) {
      case "/ok":
        res.writeHead(200, { "content-type": "application/rss+xml; charset=utf-8", etag: '"abc"', "last-modified": "Mon, 16 Nov 2026 08:00:00 GMT" });
        return res.end(RSS);
      case "/etag":
        if (req.headers["if-none-match"] === '"abc"') {
          res.writeHead(304);
          return res.end();
        }
        res.writeHead(200, { "content-type": "text/xml", etag: '"abc"' });
        return res.end(RSS);
      case "/redirect":
        res.writeHead(302, { location: "/ok" });
        return res.end();
      case "/loop":
        res.writeHead(302, { location: "/loop" });
        return res.end();
      case "/chain1": res.writeHead(301, { location: "/chain2" }); return res.end();
      case "/chain2": res.writeHead(301, { location: "/chain3" }); return res.end();
      case "/chain3": res.writeHead(301, { location: "/chain4" }); return res.end();
      case "/chain4": res.writeHead(301, { location: "/ok" }); return res.end();
      case "/redirect-private":
        res.writeHead(302, { location: `http://127.0.0.2:${port}/ok` });
        return res.end();
      case "/redirect-nolocation":
        res.writeHead(302);
        return res.end();
      case "/redirect-scheme":
        res.writeHead(302, { location: "file:///etc/passwd" });
        return res.end();
      case "/slow":
        return setTimeout(() => { res.writeHead(200); res.end("late"); }, 3000);
      case "/stream-big": {
        res.writeHead(200, { "content-type": "text/xml" });
        const chunk = Buffer.alloc(64 * 1024, "a");
        let sent = 0;
        const timer = setInterval(() => {
          if (res.destroyed || sent > 4 * 1024 * 1024) { clearInterval(timer); return res.end(); }
          res.write(chunk);
          sent += chunk.length;
        }, 1);
        res.on("close", () => clearInterval(timer));
        return;
      }
      case "/declared-big":
        res.writeHead(200, { "content-type": "text/xml", "content-length": String(10 * 1024 * 1024) });
        return res.end("tiny"); // lies about its length; fetcher should refuse up front
      case "/image":
        res.writeHead(200, { "content-type": "image/png" });
        return res.end("fake");
      case "/500":
        res.writeHead(500);
        return res.end("boom");
      case "/latin1":
        res.writeHead(200, { "content-type": "text/xml; charset=iso-8859-1" });
        return res.end(Buffer.from('<rss version="2.0"><channel><title>Caf\xe9</title></channel></rss>', "latin1"));
      default:
        res.writeHead(404);
        return res.end("nope");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
});

// Allows the loopback test server but still blocks 127.0.0.2 (used to prove
// that redirects are re-validated hop by hop).
const relaxed = (extra = {}) =>
  createSafeFetcher({
    isAddressBlocked: (addr) => addr === "127.0.0.2",
    allowedPorts: null,
    blockedHostSuffixes: [],
    timeoutMs: 1500,
    ...extra,
  });

test("fetches a feed and returns status, headers, body and final URL", async () => {
  const fetcher = relaxed();
  const res = await fetcher(`${base}/ok`);
  assert.equal(res.status, 200);
  assert.equal(res.notModified, false);
  assert.equal(res.headers.etag, '"abc"');
  assert.match(res.body, /Quantum error correction/);
  assert.equal(res.finalUrl, `${base}/ok`);
  await fetcher.close();
});

test("conditional request returns notModified on 304", async () => {
  const fetcher = relaxed();
  const res = await fetcher(`${base}/etag`, { headers: { "if-none-match": '"abc"' } });
  assert.equal(res.status, 304);
  assert.equal(res.notModified, true);
  assert.equal(res.body, "");
  await fetcher.close();
});

test("follows redirects and reports the final URL", async () => {
  const fetcher = relaxed();
  const res = await fetcher(`${base}/redirect`);
  assert.equal(res.finalUrl, `${base}/ok`);
  assert.match(res.body, /Quantum/);
  await fetcher.close();
});

test("redirect loops and long chains fail with a redirect error", async () => {
  const fetcher = relaxed({ maxRedirects: 3 });
  await assert.rejects(() => fetcher(`${base}/loop`), (e) => e.kind === "redirect");
  await assert.rejects(() => fetcher(`${base}/chain1`), (e) => e.kind === "redirect");
  await assert.rejects(() => fetcher(`${base}/redirect-nolocation`), (e) => e.kind === "redirect");
  await fetcher.close();
});

test("a redirect to a blocked address is stopped before it is requested", async () => {
  const fetcher = relaxed();
  await assert.rejects(() => fetcher(`${base}/redirect-private`), (e) => e.kind === "blocked");
  await fetcher.close();
});

test("a redirect to a non-http scheme is rejected", async () => {
  const fetcher = relaxed();
  await assert.rejects(() => fetcher(`${base}/redirect-scheme`), (e) => e.kind === "invalid_url");
  await fetcher.close();
});

test("slow responses time out", async () => {
  const fetcher = relaxed({ timeoutMs: 300 });
  const started = Date.now();
  await assert.rejects(() => fetcher(`${base}/slow`), (e) => e.kind === "timeout");
  assert.ok(Date.now() - started < 1500);
  await fetcher.close();
});

test("oversized streamed bodies are cut off", async () => {
  const fetcher = relaxed({ maxBytes: 256 * 1024, timeoutMs: 5000 });
  await assert.rejects(() => fetcher(`${base}/stream-big`), (e) => e.kind === "too_large");
  await fetcher.close();
});

test("a declared Content-Length over the limit is refused immediately", async () => {
  const fetcher = relaxed({ maxBytes: 1024 * 1024 });
  await assert.rejects(() => fetcher(`${base}/declared-big`), (e) => e.kind === "too_large");
  await fetcher.close();
});

test("binary content types are refused", async () => {
  const fetcher = relaxed();
  await assert.rejects(() => fetcher(`${base}/image`), (e) => e.kind === "content_type");
  await fetcher.close();
});

test("HTTP errors carry the status", async () => {
  const fetcher = relaxed();
  await assert.rejects(
    () => fetcher(`${base}/500`),
    (e) => e.kind === "http" && e.status === 500,
  );
  await assert.rejects(() => fetcher(`${base}/missing`), (e) => e.kind === "http" && e.status === 404);
  await fetcher.close();
});

test("honours the charset declared in Content-Type", async () => {
  const fetcher = relaxed();
  const res = await fetcher(`${base}/latin1`);
  assert.match(res.body, /Café/);
  await fetcher.close();
});

test("connection failures are reported as network errors in plain words", async () => {
  // Bind and release a port so it is guaranteed closed (low ports like 1 are
  // on the fetch spec's blocked list and never reach the network at all).
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const closedPort = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));

  const fetcher = relaxed();
  await assert.rejects(
    () => fetcher(`http://127.0.0.1:${closedPort}/`),
    (e) => e.kind === "network" && e.message === "Connection refused" && e.code === "ECONNREFUSED",
  );
  await fetcher.close();
});

test("an unresolvable hostname says so instead of showing a raw error code", async () => {
  const fetcher = createSafeFetcher({ timeoutMs: 4000 });
  await assert.rejects(
    () => fetcher("http://does-not-exist.invalid/feed"),
    (e) => e.kind === "network" && /Could not look up that address/.test(e.message) && !/ENOTFOUND|EAI_AGAIN/.test(e.message),
  );
  await fetcher.close();
});

test("describeNetworkError maps known codes and falls back safely", () => {
  assert.equal(describeNetworkError("ECONNRESET"), "Connection was reset");
  assert.equal(describeNetworkError("CERT_HAS_EXPIRED"), "Security certificate has expired");
  assert.equal(describeNetworkError("SOMETHING_NEW"), "Network error");
  assert.equal(describeNetworkError(undefined), "Network error");
});

test("hostnames connect successfully through the vetted DNS lookup", async () => {
  // Unlike IP literals, a name goes through makeLookup, which is the production path.
  const fetcher = createSafeFetcher({
    isAddressBlocked: () => false,
    allowedPorts: null,
    blockedHostSuffixes: [],
    timeoutMs: 3000,
  });
  const res = await fetcher(`http://localhost:${port}/ok`);
  assert.equal(res.status, 200);
  assert.match(res.body, /Quantum error correction/);
  await fetcher.close();
});

test("DEFAULT settings refuse the loopback test server", async () => {
  const fetcher = createSafeFetcher({ timeoutMs: 1500 });
  // IP literal, default port rules and default address rules all say no.
  await assert.rejects(() => fetcher(`${base}/ok`), (e) => e.kind === "blocked");
  await assert.rejects(() => fetcher("http://localhost/"), (e) => e.kind === "blocked");
  await assert.rejects(() => fetcher("http://169.254.169.254/latest/meta-data/"), (e) => e.kind === "blocked");
  await fetcher.close();
});

test("DNS-time check blocks a hostname that resolves to loopback (no name rules)", async () => {
  // Disable the name/port rules so only the connection-time lookup guard is left.
  const fetcher = createSafeFetcher({ allowedPorts: null, blockedHostSuffixes: [], timeoutMs: 1500 });
  await assert.rejects(() => fetcher(`http://localhost:${port}/ok`), (e) => e.kind === "blocked");
  await fetcher.close();
});
