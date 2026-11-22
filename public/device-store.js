// What the phone remembers, on the phone.
//
// In the phone version the server keeps nothing about you, so this is where the
// things the desktop app keeps in its database live instead: which items you have
// already been shown, which you opened, marked Useful or dismissed. Each press sends
// the part the server needs (see POST /api/v1/generate) and the server forgets it.
//
// It behaves like the server's own signal store (server/store/signals.js), and a
// test checks that the two agree on the same sequence of actions.
//
//   seen         each item is offered once, so everything shown is remembered
//   dismissed    hidden for good, and counted against what it was
//   feedback     opens, Useful marks and dismissals, which nudge the ranking
//   forget       removing a topic in setup and adding it back makes its items new again
//
// Everything is kept in one JSON entry in the browser's own storage. If that is
// unavailable (some private windows) or full, it carries on in memory and says so
// through `problem`, so the page can tell you history will not survive a restart,
// instead of failing quietly.
//
// This file is plain ES module code with no page dependencies, so tests run it directly.

export const DEVICE_STATE_KEY = "inform_device_v1";

// What one request may carry. Must not exceed the server's limits (tested).
export const CAPS = { seen: 3000, dismissed: 1000, feedback: 500, keyLength: 1024, titleLength: 300, sourceLength: 200 };

const DAY_MS = 86_400_000;
// News searches only look back 30 days, so an item shown longer ago than this cannot
// come back and need not be remembered as seen. Items you reacted to are kept far
// longer, because learning from them fades over months, not weeks.
const FORGET_SEEN_AFTER_DAYS = 45;
const FORGET_REACTED_AFTER_DAYS = 180;
const MAX_ENTRIES = 6000;

const iso = (ms) => new Date(ms).toISOString();
const newest = (...times) => times.filter(Boolean).sort().pop() ?? "";

export function createDeviceStore({ storage = null, now = Date.now } = {}) {
  let state = { v: 1, nextId: 1, entries: {} };
  let byId = new Map();
  let persistent = false;
  let problem = null;

  function reindex() {
    byId = new Map(Object.values(state.entries).map((e) => [e.id, e]));
  }

  function load() {
    if (!storage) {
      problem = "This browser is not keeping history, so items may come back after you close it.";
      return;
    }
    let raw = null;
    try {
      raw = storage.getItem(DEVICE_STATE_KEY);
    } catch {
      problem = "This browser will not let IN-FORM keep history, so items may come back after you close it.";
      return;
    }
    persistent = true;
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      if (saved && saved.v === 1 && saved.entries && typeof saved.entries === "object" && Number.isInteger(saved.nextId)) {
        state = { v: 1, nextId: saved.nextId, entries: saved.entries };
      }
    } catch {
      /* unreadable: start fresh rather than fail */
    }
  }

  function save() {
    if (!storage || !persistent) return;
    try {
      storage.setItem(DEVICE_STATE_KEY, JSON.stringify(state));
    } catch {
      persistent = false;
      problem = "This browser has no room left to keep your history, so items may come back after you close it.";
    }
  }

  function prune() {
    const t = now();
    for (const [key, e] of Object.entries(state.entries)) {
      const reacted = Boolean(e.openedAt || e.usefulAt || e.dismissedAt);
      const last = Date.parse(newest(e.shownAt, e.openedAt, e.usefulAt, e.dismissedAt));
      const limit = (reacted ? FORGET_REACTED_AFTER_DAYS : FORGET_SEEN_AFTER_DAYS) * DAY_MS;
      if (Number.isFinite(last) && t - last > limit) delete state.entries[key];
    }
    const keys = Object.keys(state.entries);
    if (keys.length > MAX_ENTRIES) {
      // Drop the oldest items nobody reacted to first.
      const droppable = keys
        .filter((k) => !state.entries[k].openedAt && !state.entries[k].usefulAt && !state.entries[k].dismissedAt)
        .sort((a, b) => state.entries[a].shownAt.localeCompare(state.entries[b].shownAt));
      for (const k of droppable.slice(0, keys.length - MAX_ENTRIES)) delete state.entries[k];
    }
    reindex();
  }

  load();
  prune();

  /**
   * Remember everything in `channels` as shown now. Returns a copy where each item
   * also has the local `id` the page uses to act on it, and its `useful` state.
   * Items need the `key` the server gave them.
   */
  function recordShown(channels) {
    const at = iso(now());
    const out = {};
    for (const [channel, items] of Object.entries(channels)) {
      out[channel] = items.map((item) => {
        const key = String(item.key ?? "");
        let entry = state.entries[key];
        if (entry) {
          entry.shownAt = at;
          entry.source = String(item.source ?? "").slice(0, CAPS.sourceLength);
          delete entry.clearedAt;
        } else {
          entry = {
            id: state.nextId++,
            title: String(item.title ?? "").slice(0, CAPS.titleLength),
            source: String(item.source ?? "").slice(0, CAPS.sourceLength),
            shownAt: at,
            openCount: 0,
            openedAt: null,
            usefulAt: null,
            dismissedAt: null,
          };
          state.entries[key] = entry;
        }
        byId.set(entry.id, entry);
        return { ...item, id: entry.id, useful: entry.usefulAt !== null };
      });
    }
    prune();
    save();
    return out;
  }

  /** The user opened an item's link. Returns false for an unknown id. */
  function recordOpen(id) {
    const entry = byId.get(id);
    if (!entry) return false;
    entry.openedAt = entry.openedAt ?? iso(now());
    entry.openCount += 1;
    save();
    return true;
  }

  /**
   * Set dismissed and/or useful (undefined leaves a field alone; false undoes it).
   * Returns { id, dismissed, useful }, or null for an unknown id.
   */
  function updateState(id, { dismissed, useful } = {}) {
    const entry = byId.get(id);
    if (!entry) return null;
    const at = iso(now());
    if (dismissed !== undefined) entry.dismissedAt = dismissed ? (entry.dismissedAt ?? at) : null;
    if (useful !== undefined) entry.usefulAt = useful ? (entry.usefulAt ?? at) : null;
    save();
    return { id, dismissed: entry.dismissedAt !== null, useful: entry.usefulAt !== null };
  }

  /**
   * Forget what was shown from these sources (compared case-insensitively) so their
   * items count as new again, except ones you dismissed. Returns how many were cleared.
   */
  function forgetSources(inputs) {
    const wanted = new Set(inputs.map((i) => String(i).trim().toLowerCase()));
    const at = iso(now());
    let cleared = 0;
    for (const entry of Object.values(state.entries)) {
      if (!entry.clearedAt && wanted.has(entry.source.trim().toLowerCase())) {
        entry.clearedAt = at;
        cleared += 1;
      }
    }
    if (cleared) save();
    return cleared;
  }

  /** What to send with a request: everything the server needs to rank, nothing more. */
  function snapshot() {
    const rows = Object.entries(state.entries).filter(([key]) => key.length > 0 && key.length <= CAPS.keyLength);
    const byRecent = (field) => (a, b) => b[1][field].localeCompare(a[1][field]);

    const dismissed = rows
      .filter(([, e]) => e.dismissedAt)
      .sort(byRecent("dismissedAt"))
      .slice(0, CAPS.dismissed)
      .map(([key]) => key);

    const seen = rows
      .filter(([, e]) => !e.dismissedAt && !e.clearedAt)
      .sort(byRecent("shownAt"))
      .slice(0, CAPS.seen)
      .map(([key]) => key);

    const feedback = Object.values(state.entries)
      .filter((e) => e.openedAt || e.usefulAt || e.dismissedAt)
      .sort((a, b) => newest(b.openedAt, b.usefulAt, b.dismissedAt).localeCompare(newest(a.openedAt, a.usefulAt, a.dismissedAt)))
      .slice(0, CAPS.feedback)
      .map((e) => ({
        title: e.title,
        source: e.source,
        openCount: e.openCount,
        openedAt: e.openedAt,
        usefulAt: e.usefulAt,
        dismissedAt: e.dismissedAt,
      }));

    return { seen, dismissed, feedback };
  }

  /** Erase everything this device remembers. */
  function clear() {
    state = { v: 1, nextId: state.nextId, entries: {} };
    reindex();
    save();
  }

  return {
    recordShown,
    recordOpen,
    updateState,
    forgetSources,
    snapshot,
    clear,
    get persistent() { return persistent; },
    get problem() { return problem; },
    get size() { return Object.keys(state.entries).length; },
  };
}
