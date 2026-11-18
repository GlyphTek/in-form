// Turn raw feed XML into clean, bounded, safe item objects.
//
// Items are plain data: { id, title, link, published, summary }. Titles and
// summaries are tag-stripped text (the UI must still escape them); links are
// restricted to http(s); anything without a usable title and link is dropped.

import crypto from "node:crypto";
import Parser from "rss-parser";
import { IngestError } from "./errors.js";
import { dedupeItems } from "./normalize.js";

const parser = new Parser();

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body) => {
    if (body[0] === "#") {
      const code = body[1].toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

export function cleanText(value, max) {
  if (typeof value !== "string") return "";
  const text = decodeEntities(value.replace(/<[^>]*>/g, " "))
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function safeLink(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

// Reject dates that are unparseable or implausibly far in the future (a common
// feed bug that would otherwise pin an item to the top forever).
function safePublished(item, nowMs) {
  const raw = item.isoDate || item.pubDate;
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (Number.isNaN(ms) || ms > nowMs + 24 * 3600 * 1000) return null;
  return new Date(ms).toISOString();
}

/**
 * Parse feed text. Throws IngestError("parse") if it is not an RSS/Atom feed.
 */
export async function parseFeed(xml, { maxItems = 30, now = Date.now() } = {}) {
  let feed;
  try {
    feed = await parser.parseString(xml);
  } catch (err) {
    throw new IngestError("parse", `Not a readable feed (${String(err.message).slice(0, 80)})`);
  }

  const items = [];
  for (const raw of feed.items ?? []) {
    const title = cleanText(raw.title, 300);
    const link = safeLink(raw.link);
    if (!title || !link) continue;
    items.push({
      id: crypto.createHash("sha1").update(String(raw.guid || link)).digest("hex").slice(0, 16),
      title,
      link,
      published: safePublished(raw, now),
      summary: cleanText(raw.contentSnippet || raw.summary || raw.content, 400),
    });
  }

  // Newest first; undated items sort after dated ones but keep feed order.
  items.sort((a, b) => (b.published ? Date.parse(b.published) : -Infinity) - (a.published ? Date.parse(a.published) : -Infinity));

  return {
    title: cleanText(feed.title, 200),
    items: dedupeItems(items).slice(0, maxItems),
  };
}

/** Cheap check used to decide whether a failed parse is worth feed discovery. */
export function looksLikeHtml(body) {
  return /<(?:!doctype html|html|head|body)\b/i.test(body.slice(0, 2048));
}
