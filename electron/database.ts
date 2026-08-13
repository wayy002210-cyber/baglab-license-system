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

CREATE TABLE IF NOT EXISTS publish_assets (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL UNIQUE REFERENCES generation_tasks(id) ON DELETE CASCADE,
  short_title TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  publish_title TEXT NOT NULL DEFAULT '',
  topics_json TEXT NOT NULL DEFAULT '[]',
  topic_template_id TEXT,
  cover_path TEXT,
  vertical_cover_path TEXT,
  horizontal_cover_path TEXT,
  status TEXT NOT NULL DEFAULT 'unscheduled',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS publish_assets_status_idx
  ON publish_assets(status, created_at);

CREATE TABLE IF NOT EXISTS publish_topic_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  topics_json TEXT NOT NULL DEFAULT '[]',
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
  vertical_cover_path TEXT,
  horizontal_cover_path TEXT,
  status TEXT NOT NULL,
  scheduled_at TEXT,
  publish_time TEXT,
  started_at TEXT,
  completed_at TEXT,
  error_message TEXT,
  screenshot_path TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Durable browser-agent audit trail.  The Electron process owns these records so
-- a backend restart can never make a publish action disappear from the UI.
CREATE TABLE IF NOT EXISTS publish_job_events (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES publish_jobs(id) ON DELETE CASCADE,
  state TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS publish_job_events_job_idx
  ON publish_job_events(job_id, created_at);

CREATE INDEX IF NOT EXISTS publish_jobs_due_idx
  ON publish_jobs(status, scheduled_at);
CREATE INDEX IF NOT EXISTS publish_jobs_ready_idx
  ON publish_jobs(status, created_at);

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

CREATE TABLE IF NOT EXISTS copywriting_projects (
  id TEXT PRIMARY KEY,
  persona_id TEXT NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  topic_id TEXT,
  topic_title TEXT NOT NULL DEFAULT '',
  main_title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  compliance_issues_json TEXT NOT NULL DEFAULT '[]',
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
  ,source_project_id TEXT
);

CREATE INDEX IF NOT EXISTS copywriting_projects_status_idx
  ON copywriting_projects(status, updated_at);

CREATE TABLE IF NOT EXISTS copywriting_shots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES copywriting_projects(id) ON DELETE CASCADE,
  shot_index INTEGER NOT NULL,
  copywriting TEXT NOT NULL,
  suggested_category_id TEXT,
  asset_category_id TEXT,
  suggestion_source TEXT NOT NULL,
  suggestion_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (suggestion_confirmed IN (0, 1)),
  duration_mode TEXT NOT NULL DEFAULT 'voice',
  duration_sec REAL,
  mute_original INTEGER NOT NULL DEFAULT 1 CHECK (mute_original IN (0, 1)),
  UNIQUE(project_id, shot_index)
);

CREATE TABLE IF NOT EXISTS queue_state (
  id TEXT PRIMARY KEY CHECK (id = 'generation'),
  status TEXT NOT NULL,
  active_task_id TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reference_scripts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  industry TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  content TEXT NOT NULL,
  structure_json TEXT NOT NULL DEFAULT '{}',
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
    const projectColumns = database.prepare("PRAGMA table_info(copywriting_projects)").all() as Array<{ name: string }>;
    if (!projectColumns.some((column) => column.name === "source_project_id")) {
      database.exec("ALTER TABLE copywriting_projects ADD COLUMN source_project_id TEXT");
    }
    const accountColumns = database.prepare("PRAGMA table_info(publish_accounts)").all() as Array<{ name: string }>;
    if (!accountColumns.some((column) => column.name === "positioning")) {
      database.exec("ALTER TABLE publish_accounts ADD COLUMN positioning TEXT NOT NULL DEFAULT ''");
    }
    const assetColumns = database.prepare("PRAGMA table_info(publish_assets)").all() as Array<{ name: string }>;
    if (!assetColumns.some((column) => column.name === "vertical_cover_path")) {
      database.exec("ALTER TABLE publish_assets ADD COLUMN vertical_cover_path TEXT");
      database.exec(
        "UPDATE publish_assets SET vertical_cover_path = cover_path WHERE vertical_cover_path IS NULL AND cover_path IS NOT NULL"
      );
    }
    if (!assetColumns.some((column) => column.name === "horizontal_cover_path")) {
      database.exec("ALTER TABLE publish_assets ADD COLUMN horizontal_cover_path TEXT");
    }
    const jobColumns = database.prepare("PRAGMA table_info(publish_jobs)").all() as Array<{ name: string }>;
    if (!jobColumns.some((column) => column.name === "vertical_cover_path")) {
      database.exec("ALTER TABLE publish_jobs ADD COLUMN vertical_cover_path TEXT");
      database.exec(
        "UPDATE publish_jobs SET vertical_cover_path = cover_path WHERE vertical_cover_path IS NULL AND cover_path IS NOT NULL"
      );
    }
    if (!jobColumns.some((column) => column.name === "horizontal_cover_path")) {
      database.exec("ALTER TABLE publish_jobs ADD COLUMN horizontal_cover_path TEXT");
    }
    if (!jobColumns.some((column) => column.name === "publish_time")) {
      database.exec("ALTER TABLE publish_jobs ADD COLUMN publish_time TEXT");
      database.exec(
        "UPDATE publish_jobs SET publish_time = scheduled_at WHERE publish_time IS NULL AND scheduled_at IS NOT NULL"
      );
    }
    if (!jobColumns.some((column) => column.name === "publish_asset_id")) {
      database.exec("ALTER TABLE publish_jobs ADD COLUMN publish_asset_id TEXT REFERENCES publish_assets(id)");
    }
    if (!jobColumns.some((column) => column.name === "result_url")) {
      database.exec("ALTER TABLE publish_jobs ADD COLUMN result_url TEXT");
    }
    if (!jobColumns.some((column) => column.name === "workflow_state")) {
      database.exec("ALTER TABLE publish_jobs ADD COLUMN workflow_state TEXT NOT NULL DEFAULT 'queued'");
    }
    if (!jobColumns.some((column) => column.name === "last_heartbeat_at")) {
      database.exec("ALTER TABLE publish_jobs ADD COLUMN last_heartbeat_at TEXT");
    }
    if (!jobColumns.some((column) => column.name === "last_step_error")) {
      database.exec("ALTER TABLE publish_jobs ADD COLUMN last_step_error TEXT");
    }
    if (!jobColumns.some((column) => column.name === "agent_session_id")) {
      database.exec("ALTER TABLE publish_jobs ADD COLUMN agent_session_id TEXT");
    }
    database.prepare(
      `INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (4, ?)`
    ).run(new Date().toISOString());
    database.prepare(
      `INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (3, ?)`
    ).run(new Date().toISOString());
    database
      .prepare(
        `INSERT OR IGNORE INTO schema_migrations(version, applied_at)
         VALUES (2, ?)`
      )
      .run(new Date().toISOString());
    database.prepare(
      `INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (5, ?)`
    ).run(new Date().toISOString());
    database.prepare(
      `INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (7, ?)`
    ).run(new Date().toISOString());
    database.prepare(
      `INSERT OR IGNORE INTO queue_state(id, status, active_task_id, updated_at)
       VALUES ('generation', 'idle', NULL, ?)`
    ).run(new Date().toISOString());
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
