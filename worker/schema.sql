CREATE TABLE IF NOT EXISTS drawings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content_json TEXT NOT NULL,
  files_json TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  is_deleted INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_drawings_updated_at ON drawings(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_drawings_is_deleted ON drawings(is_deleted);

CREATE TABLE IF NOT EXISTS drawing_assets (
  hash TEXT PRIMARY KEY,
  mime_type TEXT,
  size INTEGER,
  created_at INTEGER NOT NULL
);
