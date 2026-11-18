-- Removing a source from the setup list forgets what was shown from it, so adding
-- it back starts fresh. The rows are kept (opens, useful and dismissals are what
-- Step 6 learns from); cleared_at only stops them counting as "already seen".
-- A dismissed item stays hidden even when cleared.

ALTER TABLE signals ADD COLUMN cleared_at TEXT;
