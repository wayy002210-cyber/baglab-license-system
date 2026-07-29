import type Database from "better-sqlite3";

const INITIAL_SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS personas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  industry TEXT NOT NULL DEFAULT '',
  brand_facts_json TEXT NOT NULL DEFAULT '[]',
  tone TEXT NOT NULL DEFAULT '',
  cta TEXT NOT NULL DEFAULT '',
  banned_words_json TEXT NOT NULL DEFAULT '[]',
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS asset_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  folder_path TEXT NOT NULL UNIQUE,
  last_scanned_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES asset_categories(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL UNIQUE,
  duration_sec REAL,
  width INTEGER,
  height INTEGER,
  fps REAL,
  codec TEXT,
  rotation INTEGER NOT NULL DEFAULT 0,
  file_size INTEGER NOT NULL DEFAULT 0,
  fingerprint TEXT,
  thumbnail_path TEXT,
  status TEXT NOT NULL DEFAULT 'ready',
  error_message TEXT,
  probed_at TEXT
);

CREATE INDEX IF NOT EXISTS assets_category_idx ON assets(category_id);
CREATE INDEX IF NOT EXISTS assets_fingerprint_idx ON assets(fingerprint);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  width INTEGER NOT NULL DEFAULT 1080,
  height INTEGER NOT NULL DEFAULT 1920,
  fps INTEGER NOT NULL DEFAULT 30,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS template_shots (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  shot_index INTEGER NOT NULL,
  role TEXT NOT NULL,
  asset_category_id TEXT REFERENCES asset_categories(id),
  copywriting TEXT NOT NULL DEFAULT '',
  duration_mode TEXT NOT NULL,
  duration_sec REAL,
  mute_original INTEGER NOT NULL DEFAULT 1 CHECK (mute_original IN (0, 1)),
  subtitle_overrides_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(template_id, shot_index)
);

CREATE TABLE IF NOT EXISTS generation_tasks (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  persona_id TEXT NOT NULL,
  status TEXT NOT NULL,
  progress REAL NOT NULL DEFAULT 0,
  seed INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  output_path TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS generation_tasks_status_idx
  ON generation_tasks(status, created_at);

CREATE TABLE IF NOT EXISTS task_shots (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES generation_tasks(id) ON DELETE CASCADE,
  shot_index INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  copywriting TEXT NOT NULL,
  asset_id TEXT REFERENCES assets(id),
  source_start_sec REAL,
  duration_sec REAL,
  voice_path TEXT,
  error_message TEXT,
  UNIQUE(task_id, shot_index)
);

CREATE TABLE IF NOT EXISTS publish_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  user_data_dir TEXT NOT NULL UNIQUE,
  link_status TEXT NOT NULL DEFAULT 'unknown',
  last_checked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS publish_jobs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES generation_tasks(id),
  account_id TEXT NOT NULL REFERENCES publish_accounts(id),
  title TEXT NOT NULL,
  topics_json TEXT NOT NULL DEFAULT '[]',
  cover_path TEXT,
  status TEXT NOT NULL,
  scheduled_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  error_message TEXT,
  screenshot_path TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS publish_jobs_due_idx
  ON publish_jobs(status, scheduled_at);

CREATE TABLE IF NOT EXISTS asset_usage_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  task_id TEXT NOT NULL REFERENCES generation_tasks(id) ON DELETE CASCADE,
  shot_index INTEGER NOT NULL,
  source_start_sec REAL NOT NULL DEFAULT 0,
  source_end_sec REAL NOT NULL DEFAULT 0,
  used_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS asset_usage_lookup_idx
  ON asset_usage_history(template_id, shot_index, used_at);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS creation_drafts (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  stage TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export function applyMigrations(database: Database.Database): void {
  database.pragma("foreign_keys = ON");
  database.pragma("journal_mode = WAL");
  const migrate = database.transaction(() => {
    database.exec(INITIAL_SCHEMA);
    database
      .prepare(
        `INSERT OR IGNORE INTO schema_migrations(version, applied_at)
         VALUES (1, ?)`
      )
      .run(new Date().toISOString());
  });
  migrate();
}

export function listBusinessTables(database: Database.Database): string[] {
  const rows = database
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`
    )
    .all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}
