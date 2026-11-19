// Per-account storage of what forms the user's day: sources (topics, sites, feeds),
// kept in the order the user chose them. The old `platforms` table is no longer
// used; it is left in place rather than dropped so nothing is lost.

export const MAX_SOURCES = 20;

/** Trim, collapse whitespace, drop empties and case-insensitive duplicates. */
export function normalizeList(values) {
  const seen = new Set();
  const out = [];
  for (const v of values) {
    const t = String(v).trim().replace(/\s+/g, " ");
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out;
}

export function createConfigStore(db) {
  const selectSources = db.prepare("SELECT input FROM sources WHERE user_id = ? ORDER BY position, id");
  const selectUpdated = db.prepare("SELECT config_updated_at, region_scope, region_area FROM users WHERE id = ?");
  const setRegion = db.prepare("UPDATE users SET region_scope = ?, region_area = ? WHERE id = ?");
  const clearSources = db.prepare("DELETE FROM sources WHERE user_id = ?");
  const addSource = db.prepare("INSERT INTO sources (user_id, input, kind, position) VALUES (?, ?, ?, ?)");
  const touch = db.prepare("UPDATE users SET config_updated_at = ? WHERE id = ?");

  function get(userId) {
    const row = selectUpdated.get(userId);
    return {
      sources: selectSources.all(userId).map((r) => r.input),
      // null until the user has chosen (the setup screen then suggests one).
      region: row?.region_scope ? { scope: row.region_scope, area: row.region_area ?? null } : null,
      updatedAt: row?.config_updated_at ?? null,
    };
  }

  /** Replace the whole configuration atomically. `sources` are { input, kind }; `region` is { scope, area } or null. */
  const replace = db.transaction((userId, { sources, region }, nowIso = new Date().toISOString()) => {
    // `region` left out keeps what is stored; null clears it.
    if (region !== undefined) setRegion.run(region?.scope ?? null, region?.area ?? null, userId);
    clearSources.run(userId);
    sources.forEach((s, i) => addSource.run(userId, s.input, s.kind, i));
    touch.run(nowIso, userId);
    return get(userId);
  });

  return { get, replace };
}
