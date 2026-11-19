// Classify what the user typed into the "what forms your day?" box.
//
//   feed     a URL that looks like an RSS/Atom feed
//   site     any other URL (we discover its feed when resolving)
//   keyword  anything else; becomes a news search
//   topic    "topic:<id>", one of the built-in topic chips (server/topics.js)
//
// Detection is purely syntactic and never touches the network. A URL that looks
// like a site but actually serves a feed is handled at resolve time, so these
// labels only need to be right most of the time.
//
// A bare word with a dot ("node.js") is only treated as a site when its ending
// is a well-known TLD. Wrap text in quotes to force keyword treatment.

import { IngestError } from "./errors.js";
import { TOPIC_PREFIX, getTopic } from "../topics.js";
import { getEdition } from "../regions.js";

const COMMON_TLDS = new Set(
  (
    "com org net edu gov mil int io co dev app ai info biz news tech blog xyz me tv fm cc sh " +
    "online site store cloud page wiki media press today world live agency studio design " +
    "nz uk au ca us de fr es it nl se no dk fi ie ch at be pt pl cz ru ua jp cn kr in sg hk tw br mx ar za eu"
  ).split(" "),
);

const BARE_URL =
  /^(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+([a-z]{2,24})(?::\d{1,5})?(?:[/?#]\S*)?$/i;
const NON_HTTP_SCHEME = /^(?:javascript|data|file|vbscript|ftp|mailto|ws|wss|gopher):/i;
const FEED_PATH = /(?:\.(?:rss|atom|xml)|\/(?:feed|feeds|rss|atom)(?:\.xml|\.rss)?)\/?$/i;

export const MAX_KEYWORD_LENGTH = 200;

export function isLikelyFeedUrl(url) {
  if (FEED_PATH.test(url.pathname)) return true;
  if (/^(?:feeds?|rss)\./i.test(url.hostname)) return true;
  if (/(?:^|&)(?:feed|format)=(?:rss|atom|1)\b/i.test(url.search.slice(1))) return true;
  return false;
}

function keyword(text, reason) {
  if (!text) throw new IngestError("invalid_input", "Source is empty");
  if (text.length > MAX_KEYWORD_LENGTH) {
    throw new IngestError("invalid_input", `Keywords are limited to ${MAX_KEYWORD_LENGTH} characters`);
  }
  return { kind: "keyword", input: text, query: text, reason };
}

function fromUrl(input, url) {
  url.hash = "";
  return {
    kind: isLikelyFeedUrl(url) ? "feed" : "site",
    input,
    url: url.href,
    reason: isLikelyFeedUrl(url) ? "url-looks-like-feed" : "url",
  };
}

export function detectSource(raw) {
  if (typeof raw !== "string") throw new IngestError("invalid_input", "Source must be text");
  const input = raw.trim().replace(/\s+/g, " ");
  if (!input) throw new IngestError("invalid_input", "Source is empty");

  if (input.toLowerCase().startsWith(TOPIC_PREFIX)) {
    // "topic:news" is global; "topic:news@nz" is the same topic from one
    // regional edition (added by the signal run, never typed by the user).
    const [id, code, ...extra] = input.slice(TOPIC_PREFIX.length).toLowerCase().split("@");
    const topic = getTopic(id);
    if (!topic) throw new IngestError("invalid_input", `Unknown topic "${id.slice(0, 40)}"`);
    let edition = null;
    if (code !== undefined) {
      edition = getEdition(code);
      if (!edition || extra.length) throw new IngestError("invalid_input", `Unknown region "${String(code).slice(0, 20)}"`);
    }
    return { kind: "topic", input, query: (edition && topic.localQuery) || topic.query, label: topic.label, edition, reason: "topic" };
  }

  const quoted = /^(["'“‘])(.+)(["'”’])$/.exec(input);
  if (quoted) return keyword(quoted[2].trim(), "quoted");

  if (NON_HTTP_SCHEME.test(input) || /^[a-z][a-z0-9+.-]*:\/\//i.test(input) && !/^https?:\/\//i.test(input)) {
    throw new IngestError("invalid_input", "Only http and https links are supported");
  }

  if (/^https?:\/\//i.test(input)) {
    if (/\s/.test(input)) throw new IngestError("invalid_input", "URL contains spaces");
    try {
      return fromUrl(input, new URL(input));
    } catch {
      throw new IngestError("invalid_input", "That link is not a valid URL");
    }
  }

  const bare = BARE_URL.exec(input);
  if (bare && COMMON_TLDS.has(bare[1].toLowerCase())) {
    try {
      return fromUrl(input, new URL(`https://${input}`));
    } catch {
      /* fall through to keyword */
    }
  }

  return keyword(input, "text");
}
