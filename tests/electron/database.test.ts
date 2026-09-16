import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { applyMigrations, listBusinessTables } from "../../electron/database";

describe("database migrations", () => {
  it("creates every business table in a single migration", () => {
    const database = new Database(":memory:");

    applyMigrations(database);

    expect(listBusinessTables(database)).toEqual([
      "app_settings",
      "asset_categories",
      "asset_usage_history",
      "assets",
      "content_history",
      "copywriting_projects",
      "copywriting_shots",
      "creation_drafts",
      "generation_tasks",
      "personas",
      "publish_accounts",
      "publish_assets",
      "publish_job_events",
      "publish_jobs",
      "publish_topic_templates",
      "queue_state",
      "reference_scripts",
      "schema_migrations",
      "task_shots",
      "template_shots",
      "templates"
    ]);
  });

  it("is safe to apply migrations more than once", () => {
    const database = new Database(":memory:");

    applyMigrations(database);
    applyMigrations(database);

    const row = database
      .prepare("SELECT COUNT(*) AS count FROM schema_migrations")
      .get() as { count: number };
    expect(row.count).toBe(7);
  });

  it("adds display titles without changing existing copywriting projects", () => {
    const database = new Database(":memory:");
    database.exec(`
      CREATE TABLE copywriting_projects (
        id TEXT PRIMARY KEY,
        persona_id TEXT NOT NULL,
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
      );
      INSERT INTO copywriting_projects(
        id, persona_id, topic_title, main_title, content, model, status,
        created_at, updated_at
      ) VALUES ('legacy', 'p1', '旧选题', '旧短标题', '旧文案', 'deepseek-v3', 'review', 'a', 'b');
    `);

    applyMigrations(database);

    const columns = database.prepare("PRAGMA table_info(copywriting_projects)").all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).toContain("display_title");
    expect(database.prepare("SELECT main_title, display_title FROM copywriting_projects WHERE id='legacy'").get()).toEqual({
      main_title: "旧短标题",
      display_title: ""
    });
  });
});
