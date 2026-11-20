// URL and title normalisation so the same story from two sources (or the same
// feed fetched twice) is only counted once.

const TRACKING_PARAMS = /^(?:utm_.+|fbclid|gclid|mc_cid|mc_eid|igshid|ref|ref_src|cmpid|oc)$/i;

export function normalizeUrl(raw) {
  try {
    const url = new URL(raw);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    let out = `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}${url.search}`;
    if (out.endsWith("?")) out = out.slice(0, -1);
    return out;
  } catch {
    return String(raw);
  }
}

// Lowercase alphanumerics only, so punctuation and spacing differences vanish.
export function titleKey(title) {
  return String(title).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Keeps the first occurrence of each URL or title; preserves input order. */
export function dedupeItems(items) {
  const urls = new Set();
  const titles = new Set();
  const out = [];
  for (const item of items) {
    const u = normalizeUrl(item.link);
    const t = titleKey(item.title);
    if (urls.has(u) || (t && titles.has(t))) continue;
    urls.add(u);
    if (t) titles.add(t);
    out.push(item);
  }
  return out;
}
