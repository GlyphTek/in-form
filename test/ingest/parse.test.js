import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "../helpers.js";
import { cleanText, looksLikeHtml, parseFeed } from "../../server/ingest/parse.js";
import { discoverFeedLinks, fallbackFeedUrls } from "../../server/ingest/discover.js";
import { dedupeItems, normalizeUrl, titleKey } from "../../server/ingest/normalize.js";

const NOW = Date.parse("2026-11-17T00:00:00Z");

test("parses RSS 2.0 into clean, safe, deduplicated items", async () => {
  const feed = await parseFeed(fixture("rss2.xml"), { now: NOW });
  assert.equal(feed.title, "Example Physics & Tech");

  const titles = feed.items.map((i) => i.title);
  // Tracking-param duplicate and same-title story collapse to one; the first occurrence wins.
  assert.equal(titles.filter((t) => /milestone|Same story/.test(t)).length, 1);
  // javascript: link and empty-title items are dropped.
  assert.ok(!titles.some((t) => /Malicious/.test(t)));
  assert.ok(!feed.items.some((i) => /no-title/.test(i.link)));
  // Script tags in titles are stripped to plain text.
  const storm = feed.items.find((i) => /Storm warning/.test(i.title));
  assert.ok(storm);
  assert.ok(!/[<>]/.test(storm.title));
  // Every link is http(s).
  assert.ok(feed.items.every((i) => /^https?:\/\//.test(i.link)));
});

test("HTML in summaries is stripped and entities decoded", async () => {
  const feed = await parseFeed(fixture("rss2.xml"), { now: NOW });
  const item = feed.items.find((i) => /milestone/.test(i.title));
  assert.equal(item.summary, "Researchers report a new result & more.");
});

test("future dates are discarded and items are sorted newest first", async () => {
  const feed = await parseFeed(fixture("rss2.xml"), { now: NOW });
  const future = feed.items.find((i) => /far-future/.test(i.title));
  assert.equal(future.published, null);
  const dated = feed.items.filter((i) => i.published).map((i) => Date.parse(i.published));
  assert.deepEqual(dated, [...dated].sort((a, b) => b - a));
  // Undated items sort after dated ones.
  const lastDated = feed.items.map((i) => i.published).lastIndexOf(feed.items.filter((i) => i.published).at(-1).published);
  const firstUndated = feed.items.findIndex((i) => !i.published);
  assert.ok(firstUndated > lastDated);
});

test("parses Atom", async () => {
  const feed = await parseFeed(fixture("atom.xml"), { now: NOW });
  assert.equal(feed.title, "Example Atom Blog");
  assert.equal(feed.items.length, 2);
  assert.equal(feed.items[0].link, "https://blog.example.org/2026/11/infra");
  assert.equal(feed.items[0].published, "2026-11-16T10:00:00.000Z");
});

test("maxItems caps the result", async () => {
  const feed = await parseFeed(fixture("rss2.xml"), { now: NOW, maxItems: 2 });
  assert.equal(feed.items.length, 2);
});

test("HTML and garbage are rejected with a parse error", async () => {
  for (const body of [fixture("site-no-feed.html"), "just some text", "", "<xml><not-a-feed/></xml>"]) {
    await assert.rejects(() => parseFeed(body, { now: NOW }), (e) => e.kind === "parse");
  }
});

test("XML entity-expansion payloads do not blow up or leak", async () => {
  const bomb = `<?xml version="1.0"?><!DOCTYPE rss [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;"><!ENTITY xxe SYSTEM "file:///etc/passwd">]>
    <rss version="2.0"><channel><title>t</title><item><title>&b;&xxe;</title><link>https://example.com/x</link></item></channel></rss>`;
  const started = Date.now();
  try {
    const feed = await parseFeed(bomb, { now: NOW });
    assert.ok(!feed.items.some((i) => /root:/.test(i.title)), "external entity must not be resolved");
  } catch (err) {
    assert.equal(err.kind, "parse"); // refusing is also acceptable
  }
  assert.ok(Date.now() - started < 2000);
});

test("looksLikeHtml distinguishes pages from feeds", () => {
  assert.equal(looksLikeHtml(fixture("site-no-feed.html")), true);
  assert.equal(looksLikeHtml(fixture("rss2.xml")), false);
});

test("cleanText strips tags, control chars and truncates", () => {
  assert.equal(cleanText("<b>Hi</b>\u0000 there &amp; <i>you</i>", 100), "Hi there & you");
  assert.equal(cleanText("x".repeat(50), 10).length, 10);
  assert.equal(cleanText(undefined, 10), "");
});

test("discovers feed links from HTML, resolving relative URLs and skipping junk", () => {
  const links = discoverFeedLinks(fixture("site-with-feeds.html"), "https://example.com/news/");
  assert.deepEqual(links, ["https://example.com/atom/all.xml", "https://example.com/rss/main.xml"]);
});

test("no links found in a page without feeds; fallbacks use the same origin", () => {
  assert.deepEqual(discoverFeedLinks(fixture("site-no-feed.html"), "https://example.com/"), []);
  const fallbacks = fallbackFeedUrls("https://example.com/some/deep/page");
  assert.ok(fallbacks.length >= 4);
  assert.ok(fallbacks.every((u) => u.startsWith("https://example.com/")));
});

test("normalizeUrl strips tracking, fragments, www and trailing slashes", () => {
  assert.equal(
    normalizeUrl("https://www.Example.com/a/b/?utm_source=x&b=2&a=1&fbclid=z#frag"),
    "https://example.com/a/b?a=1&b=2",
  );
  assert.equal(normalizeUrl("https://example.com/"), "https://example.com");
});

test("dedupeItems removes repeated URLs and repeated titles, keeping order", () => {
  const items = [
    { title: "A story", link: "https://x.com/1?utm_source=a" },
    { title: "Other", link: "https://x.com/2" },
    { title: "A story!", link: "https://y.com/9" },
    { title: "Third", link: "https://www.x.com/1" },
  ];
  assert.deepEqual(dedupeItems(items).map((i) => i.title), ["A story", "Other"]);
  assert.equal(titleKey("Hello, World!"), titleKey("hello world"));
});
