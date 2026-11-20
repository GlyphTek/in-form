-- Signals the user has been shown, with what they did about them.
--
-- One row per (user, item). The same story appearing on several days is the same
-- row, so opens, dismissals and "useful" marks stay attached to it. item_key is
-- the normalised link (title key when a link is unusable). Step 6 reads this
-- table to learn what the user finds useful.

CREATE TABLE signals (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_key      TEXT NOT NULL,
  title         TEXT NOT NULL,
  link          TEXT NOT NULL,
  source        TEXT NOT NULL,
  published     TEXT,
  channel       TEXT NOT NULL CHECK (channel IN ('relevant', 'attention', 'knowing', 'experience')),
  score         INTEGER NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL,
  shown_count   INTEGER NOT NULL DEFAULT 1,
  opened_at     TEXT,
  open_count    INTEGER NOT NULL DEFAULT 0,
  dismissed_at  TEXT,
  useful_at     TEXT,
  UNIQUE (user_id, item_key)
);

CREATE INDEX idx_signals_user_dismissed ON signals(user_id) WHERE dismissed_at IS NOT NULL;
