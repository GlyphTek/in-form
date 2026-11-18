-- Ordered, per-account configuration. Position keeps the order the user typed
-- their sources and platforms in; config_updated_at lets later steps detect
-- stale writes from another device.

ALTER TABLE sources   ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE platforms ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users     ADD COLUMN config_updated_at TEXT;

CREATE INDEX idx_sources_user_position   ON sources(user_id, position);
CREATE INDEX idx_platforms_user_position ON platforms(user_id, position);
