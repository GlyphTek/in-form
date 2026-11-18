// Stored signals: every item shown to a user, and what they did with it.
//
// All queries are scoped by user_id, so one account can never read or change
// another's rows; an unknown or foreign id looks identical (not found).

import { normalizeUrl, titleKey } from "../ingest/normalize.js";

/** Stable identity for an item: its normalised link, or its title as a fallback. */
export function itemKey(item) {
  return item.link ? normalizeUrl(item.link) : `title:${titleKey(item.title)}`;
}

export function createSignalStore(db) {
  // Cleared rows (their source was removed) no longer count as seen, unless dismissed.
  const selectAllKeys = db.prepare(`
    SELECT item_key, dismissed_at IS NOT NULL AS dismissed FROM signals
    WHERE user_id = ? AND (cleared_at IS NULL OR dismissed_at IS NOT NULL)`);
  const selectSources = db.prepare("SELECT DISTINCT source FROM signals WHERE user_id = ? AND cleared_at IS NULL");
  const clearSource = db.prepare("UPDATE signals SET cleared_at = ? WHERE user_id = ? AND source = ? AND cleared_at IS NULL");
  const selectByKey = db.prepare("SELECT id, useful_at FROM signals WHERE user_id = ? AND item_key = ?");
  const insertSignal = db.prepare(`
    INSERT INTO signals (user_id, item_key, title, link, source, published, channel, score, first_seen_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const updateSeen = db.prepare(`
    UPDATE signals SET channel = ?, score = ?, source = ?, last_seen_at = ?, shown_count = shown_count + 1, cleared_at = NULL
    WHERE id = ? AND user_id = ?`);
  const selectOne = db.prepare("SELECT id, opened_at, dismissed_at, useful_at FROM signals WHERE id = ? AND user_id = ?");
  const markOpened = db.prepare(`
    UPDATE signals SET opened_at = COALESCE(opened_at, ?), open_count = open_count + 1
    WHERE id = ? AND user_id = ?`);
  const setDismissed = db.prepare("UPDATE signals SET dismissed_at = ? WHERE id = ? AND user_id = ?");
  const setUseful = db.prepare("UPDATE signals SET useful_at = ? WHERE id = ? AND user_id = ?");

  const FEEDBACK_LIMIT = 500;
  const selectFeedback = db.prepare(`
    SELECT title, source, open_count, opened_at, useful_at, dismissed_at FROM signals
    WHERE user_id = ? AND (opened_at IS NOT NULL OR useful_at IS NOT NULL OR dismissed_at IS NOT NULL)
    ORDER BY MAX(COALESCE(opened_at, ''), COALESCE(useful_at, ''), COALESCE(dismissed_at, '')) DESC
    LIMIT ${FEEDBACK_LIMIT}`);

  /** The user's most recent feedback (opens, useful marks, dismissals), for learning. */
  function feedbackRows(userId) {
    return selectFeedback.all(userId).map((r) => ({
      title: r.title,
      source: r.source,
      openCount: r.open_count,
      openedAt: r.opened_at,
      usefulAt: r.useful_at,
      dismissedAt: r.dismissed_at,
    }));
  }

  /**
   * Every item this user has been shown, as item key to "seen" or "dismissed".
   * A row exists only once an item has been shown, so all of them are left out
   * of later runs: each item is offered once, and dismissing marks it as
   * unwanted for the learning step.
   */
  function seenKeys(userId) {
    return new Map(selectAllKeys.all(userId).map((r) => [r.item_key, r.dismissed ? "dismissed" : "seen"]));
  }

  /**
   * Store everything in `channels` as shown now and return a copy of it where
   * each item also carries its stored `id` and its `useful` state.
   */
  const recordShown = db.transaction((userId, channels, nowIso = new Date().toISOString()) => {
    const out = {};
    for (const [channel, items] of Object.entries(channels)) {
      out[channel] = items.map((item) => {
        const key = itemKey(item);
        const existing = selectByKey.get(userId, key);
        if (existing) {
          updateSeen.run(channel, item.score, item.source, nowIso, existing.id, userId);
          return { ...item, id: existing.id, useful: existing.useful_at !== null };
        }
        const { lastInsertRowid } = insertSignal.run(
          userId, key, item.title, item.link, item.source, item.published ?? null,
          channel, item.score, nowIso, nowIso,
        );
        return { ...item, id: Number(lastInsertRowid), useful: false };
      });
    }
    return out;
  });

  /**
   * Forget what was shown from these sources (compared case-insensitively), so
   * their items count as new again. Returns how many items were cleared.
   */
  function forgetSources(userId, inputs, nowIso = new Date().toISOString()) {
    const wanted = new Set(inputs.map((i) => String(i).trim().toLowerCase()));
    let cleared = 0;
    for (const { source } of selectSources.all(userId)) {
      if (wanted.has(source.trim().toLowerCase())) cleared += Number(clearSource.run(nowIso, userId, source).changes);
    }
    return cleared;
  }

  /** Returns false when the id is not this user's. */
  function recordOpen(userId, id, nowIso = new Date().toISOString()) {
    if (!selectOne.get(id, userId)) return false;
    markOpened.run(nowIso, id, userId);
    return true;
  }

  /**
   * Set dismissed and/or useful. Fields left undefined are unchanged. Returns
   * the new state, or null when the id is not this user's.
   */
  function updateState(userId, id, { dismissed, useful } = {}, nowIso = new Date().toISOString()) {
    const row = selectOne.get(id, userId);
    if (!row) return null;
    if (dismissed !== undefined) setDismissed.run(dismissed ? (row.dismissed_at ?? nowIso) : null, id, userId);
    if (useful !== undefined) setUseful.run(useful ? (row.useful_at ?? nowIso) : null, id, userId);
    const now = selectOne.get(id, userId);
    return { id, dismissed: now.dismissed_at !== null, useful: now.useful_at !== null };
  }

  return { seenKeys, feedbackRows, forgetSources, recordShown, recordOpen, updateState };
}
