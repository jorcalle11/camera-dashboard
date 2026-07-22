CREATE TABLE IF NOT EXISTS cameras (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS segments (
  id          INTEGER PRIMARY KEY,
  camera_id   TEXT NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  start_ts    INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  path        TEXT NOT NULL UNIQUE,
  size_bytes  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_segments_camera_time ON segments (camera_id, start_ts);

CREATE TABLE IF NOT EXISTS snapshots (
  id          INTEGER PRIMARY KEY,
  camera_id   TEXT NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  ts          INTEGER NOT NULL,
  path        TEXT NOT NULL UNIQUE,
  size_bytes  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_camera_time ON snapshots (camera_id, ts);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  applied_at  INTEGER NOT NULL
);
