import { test } from "node:test";
import assert from "node:assert/strict";
import { detectSource } from "../../server/ingest/detect.js";

test("plain text is a keyword", () => {
  const d = detectSource("  quantum   computing ");
  assert.equal(d.kind, "keyword");
  assert.equal(d.query, "quantum computing");
});

test("quoted text is always a keyword, even if it looks like a URL", () => {
  const d = detectSource('"example.com"');
  assert.equal(d.kind, "keyword");
  assert.equal(d.query, "example.com");
  assert.equal(d.reason, "quoted");
});

test("dotted words that are not real domains stay keywords", () => {
  for (const text of ["node.js", "vue.js", "asp.net core", "v1.2.3", "192.168.1.1"]) {
    const kind = detectSource(text).kind;
    // "asp.net core" has a space so it is text; "node.js"/"vue.js" end in a non-TLD.
    assert.equal(kind, "keyword", text);
  }
});

test("bare well-known domains are sites", () => {
  for (const text of ["bbc.com", "www.theverge.com", "arxiv.org/list/quant-ph/new", "stuff.co.nz"]) {
    const d = detectSource(text);
    assert.equal(d.kind, "site", text);
    assert.match(d.url, /^https:\/\//);
  }
});

test("URLs that look like feeds are feeds", () => {
  for (const text of [
    "https://example.com/feed.xml",
    "https://example.com/rss",
    "example.com/feed/",
    "https://example.com/blog/atom.xml",
    "https://feeds.example.com/main",
    "https://example.com/?feed=rss",
  ]) {
    assert.equal(detectSource(text).kind, "feed", text);
  }
});

test("other URLs are sites and fragments are dropped", () => {
  const d = detectSource("https://example.com/news#top");
  assert.equal(d.kind, "site");
  assert.equal(d.url, "https://example.com/news");
});

test("dangerous or unsupported schemes are rejected", () => {
  for (const text of ["javascript:alert(1)", "file:///etc/passwd", "ftp://example.com/x", "data:text/html,hi", "mailto:a@b.co"]) {
    assert.throws(() => detectSource(text), (e) => e.kind === "invalid_input", text);
  }
});

test("empty, non-string and oversized input is rejected", () => {
  assert.throws(() => detectSource("   "), (e) => e.kind === "invalid_input");
  assert.throws(() => detectSource(null), (e) => e.kind === "invalid_input");
  assert.throws(() => detectSource("a".repeat(201)), (e) => e.kind === "invalid_input");
  assert.throws(() => detectSource("https://exa mple.com"), (e) => e.kind === "invalid_input");
});
