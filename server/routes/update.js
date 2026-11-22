// "Is there a newer IN-FORM?" for the copy on your own computer.
//
// Once a day at most, this asks GitHub for the latest release of IN-FORM and says
// whether it is newer than the version running. It sends nothing about you or your
// setup: it is the same request any browser would make to read the public releases
// list, so GitHub sees an ordinary request from your internet address.
//
// It only exists for a personal copy (auth off). The hosted phone version redeploys
// itself, so it has nothing to tell. Set INFORM_UPDATE_CHECK=off to never ask.
// If GitHub cannot be reached the answer is simply "unknown": no notice, no error.

const RELEASES_API = "https://api.github.com/repos/GlyphTek/in-form/releases/latest";
const RELEASES_PREFIX = "https://github.com/GlyphTek/in-form/releases/";
const GOOD_FOR_MS = 24 * 60 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 60 * 60 * 1000;

const parts = (v) => String(v).replace(/^v/i, "").split(".").map(Number);

/** True when `latest` is a higher x.y.z than `current`. Anything unreadable is not newer. */
export function isNewer(latest, current) {
  const a = parts(latest);
  const b = parts(current);
  if (a.length !== 3 || b.length !== 3 || [...a, ...b].some((n) => !Number.isInteger(n) || n < 0)) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

/** Asks GitHub. Returns { latest: "0.3.0", url } or null if the answer cannot be trusted. */
export async function fetchLatestRelease(fetchImpl = fetch) {
  const res = await fetchImpl(RELEASES_API, {
    headers: { accept: "application/vnd.github+json", "user-agent": "IN-FORM-update-check" },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const tag = String(data?.tag_name ?? "");
  const url = String(data?.html_url ?? "");
  if (!/^v\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(tag) || !url.startsWith(RELEASES_PREFIX)) return null;
  return { latest: tag.slice(1), url };
}

export default async function updateRoutes(app, { current, fetchLatest = fetchLatestRelease, now = Date.now }) {
  let cached = null; // { at, ttl, value }

  async function answer() {
    if (cached && now() - cached.at < cached.ttl) return cached.value;
    let value = { checked: false };
    let ttl = RETRY_AFTER_FAILURE_MS;
    try {
      const found = await fetchLatest();
      if (found) {
        value = { checked: true, current, latest: found.latest, newer: isNewer(found.latest, current), url: found.url };
        ttl = GOOD_FOR_MS;
      }
    } catch {
      /* offline, blocked or slow: no notice */
    }
    cached = { at: now(), ttl, value };
    return value;
  }

  app.get("/api/update", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    return answer();
  });
}
