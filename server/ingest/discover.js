// Find a site's feed. Used when the user gives a site URL instead of a feed URL.
//
// 1. Look for <link rel="alternate" type="application/rss+xml|atom+xml"> tags.
// 2. Otherwise guess a few conventional paths.
//
// No HTML scraping: if neither works the source reports "no_feed" and the user
// can paste the feed URL directly.

const FEED_TYPES = /^application\/(?:rss|atom|rdf)\+xml$|^(?:application|text)\/xml$/i;

export const FALLBACK_PATHS = ["/feed", "/rss", "/feed.xml", "/rss.xml", "/atom.xml", "/index.xml"];
export const MAX_CANDIDATES = 5;

function parseAttributes(tag) {
  const attrs = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m;
  while ((m = re.exec(tag))) attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return attrs;
}

/** Feed URLs advertised in an HTML page, in page order, deduplicated. */
export function discoverFeedLinks(html, baseUrl) {
  const head = html.slice(0, 200_000);
  const found = [];
  const seen = new Set();
  for (const [tag] of head.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = parseAttributes(tag);
    const rel = (attrs.rel || "").toLowerCase().split(/\s+/);
    if (!rel.includes("alternate") || !attrs.href) continue;
    if (!FEED_TYPES.test((attrs.type || "").split(";")[0].trim())) continue;
    try {
      const url = new URL(attrs.href, baseUrl);
      if ((url.protocol !== "http:" && url.protocol !== "https:") || seen.has(url.href)) continue;
      seen.add(url.href);
      found.push(url.href);
    } catch {
      /* ignore unparseable hrefs */
    }
  }
  return found;
}

/** Conventional feed locations on the same origin, used as a last resort. */
export function fallbackFeedUrls(baseUrl) {
  const origin = new URL(baseUrl).origin;
  return FALLBACK_PATHS.map((p) => `${origin}${p}`);
}
