// Per-account storage of what forms the user's day: sources and platforms, kept
// in the order the user typed them.

export const MAX_SOURCES = 20;
export const MAX_PLATFORMS = 20;

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
  const selectPlatforms = db.prepare("SELECT name FROM platforms WHERE user_id = ? ORDER BY position, id");
  const selectUpdated = db.prepare("SELECT config_updated_at FROM users WHERE id = ?");
  const clearSources = db.prepare("DELETE FROM sources WHERE user_id = ?");
  const clearPlatforms = db.prepare("DELETE FROM platforms WHERE user_id = ?");
  const addSource = db.prepare("INSERT INTO sources (user_id, input, kind, position) VALUES (?, ?, ?, ?)");
  const addPlatform = db.prepare("INSERT INTO platforms (user_id, name, position) VALUES (?, ?, ?)");
  const touch = db.prepare("UPDATE users SET config_updated_at = ? WHERE id = ?");

  function get(userId) {
    return {
      sources: selectSources.all(userId).map((r) => r.input),
      platforms: selectPlatforms.all(userId).map((r) => r.name),
      updatedAt: selectUpdated.get(userId)?.config_updated_at ?? null,
    };
  }

  /** Replace the whole configuration atomically. `sources` are { input, kind }. */
  const replace = db.transaction((userId, { sources, platforms }, nowIso = new Date().toISOString()) => {
    clearSources.run(userId);
    clearPlatforms.run(userId);
    sources.forEach((s, i) => addSource.run(userId, s.input, s.kind, i));
    platforms.forEach((name, i) => addPlatform.run(userId, name, i));
    touch.run(nowIso, userId);
    return get(userId);
  });

  return { get, replace };
}
