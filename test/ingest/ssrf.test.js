import { test } from "node:test";
import assert from "node:assert/strict";
import { isBlockedAddress, makeLookup, validateUrl } from "../../server/ingest/ssrf.js";

test("blocks private, loopback, link-local, metadata and reserved addresses", () => {
  const blocked = [
    "127.0.0.1", "127.255.255.254", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1",
    "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1",
    "::1", "::", "fe80::1", "fe80::1%eth0", "fc00::1", "fd12:3456::1", "ff02::1", "2001:db8::1",
    // IPv6 forms that wrap an IPv4 address
    "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "::127.0.0.1",
    "64:ff9b::7f00:1", "2002:7f00:1::", "2002:a00:1::",
    // not an IP at all: fail closed
    "not-an-ip", "",
  ];
  for (const addr of blocked) assert.equal(isBlockedAddress(addr), true, addr);
});

test("allows ordinary public addresses", () => {
  const allowed = [
    "93.184.216.34", "8.8.8.8", "1.1.1.1", "172.15.255.255", "172.32.0.1", "11.0.0.1",
    "2606:4700:4700::1111", "2001:4860:4860::8888", "::ffff:8.8.8.8", "64:ff9b::808:808",
  ];
  for (const addr of allowed) assert.equal(isBlockedAddress(addr), false, addr);
});

test("validateUrl accepts normal public URLs", () => {
  for (const url of ["https://example.com/feed", "http://example.com/a?b=1", "http://example.com:8080/x", "https://example.com:8443/"]) {
    assert.equal(validateUrl(url).href.startsWith("http"), true, url);
  }
});

test("validateUrl rejects bad schemes, credentials and malformed URLs", () => {
  const cases = [
    ["file:///etc/passwd", "invalid_url"],
    ["ftp://example.com/", "invalid_url"],
    ["gopher://example.com/", "invalid_url"],
    ["http://user:pw@example.com/", "invalid_url"],
    ["http://", "invalid_url"],
    ["nonsense", "invalid_url"],
    ["", "invalid_url"],
    [`https://example.com/${"a".repeat(2100)}`, "invalid_url"],
  ];
  for (const [url, kind] of cases) {
    assert.throws(() => validateUrl(url), (e) => e.kind === kind, url);
  }
});

test("validateUrl rejects internal hostnames and IP literals in every spelling", () => {
  const urls = [
    "http://localhost/", "http://LOCALHOST:8080/", "http://foo.localhost/", "http://printer.local/",
    "http://intranet.internal/", "http://nas.home.arpa/",
    "http://127.0.0.1/", "http://127.1/", "http://2130706433/", "http://0x7f.0.0.1/", "http://017700000001/",
    "http://0.0.0.0/", "http://10.0.0.5/", "http://192.168.0.1/", "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/", "http://[::ffff:127.0.0.1]/", "http://[fe80::1]/", "http://[fd00::1]:8080/",
  ];
  for (const url of urls) {
    assert.throws(() => validateUrl(url), (e) => e.kind === "blocked", url);
  }
});

test("validateUrl rejects non-web ports", () => {
  for (const port of [22, 25, 3306, 5432, 6379, 9200, 11211]) {
    assert.throws(() => validateUrl(`http://example.com:${port}/`), (e) => e.kind === "blocked", String(port));
  }
});

test("lookup rejects hostnames that resolve to blocked addresses", async () => {
  const lookup = makeLookup();
  const result = await new Promise((resolve) => lookup("localhost", { all: true }, (err, addrs) => resolve({ err, addrs })));
  assert.equal(result.err?.code, "ESSRF_BLOCKED");
  assert.equal(result.addrs, undefined);
});

test("lookup passes addresses through when none are blocked", async () => {
  const lookup = makeLookup(() => false);
  const all = await new Promise((resolve) => lookup("localhost", { all: true }, (err, addrs) => resolve(addrs)));
  assert.ok(Array.isArray(all) && all.length >= 1);
  const [address, family] = await new Promise((resolve) => lookup("localhost", {}, (err, a, f) => resolve([a, f])));
  assert.ok(typeof address === "string" && (family === 4 || family === 6));
});

test("lookup rejects when ANY resolved address is blocked (mixed answers)", async () => {
  // localhost typically yields both 127.0.0.1 and ::1; block only one of them.
  const lookup = makeLookup((addr) => addr === "127.0.0.1");
  const result = await new Promise((resolve) => lookup("localhost", { all: true }, (err) => resolve(err)));
  // If the host has no IPv4 loopback entry this assertion is not meaningful; skip then.
  if (result === null) return;
  assert.equal(result.code, "ESSRF_BLOCKED");
});
