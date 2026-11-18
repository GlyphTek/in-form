-- Feed ingestion state. Feeds are shared across users (keyed by URL) so the same
-- feed is fetched once however many people follow it. All times are epoch ms.

CREATE TABLE feeds (
  url                  TEXT PRIMARY KEY,
  title                TEXT,
  etag                 TEXT,
  last_modified        TEXT,
  items_json           TEXT,              -- cleaned, deduplicated items from the last good fetch
  fetched_at           INTEGER,           -- last successful fetch or 304 revalidation
  last_success_at      INTEGER,
  last_attempt_at      INTEGER,
  next_attempt_at      INTEGER,           -- set after a failure (exponential backoff)
  last_error_kind      TEXT,
  last_error_message   TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0
);

-- What a user-typed site/feed URL resolved to (so site feed discovery runs once,
-- not on every refresh). Failures are cached briefly to avoid hammering.
CREATE TABLE resolutions (
  input              TEXT PRIMARY KEY,    -- normalised URL that was resolved
  kind               TEXT NOT NULL,       -- 'feed' or 'site'
  feed_url           TEXT,
  resolved_at        INTEGER NOT NULL,
  error_kind         TEXT,
  error_message      TEXT
);
