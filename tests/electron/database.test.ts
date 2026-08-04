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
      "copywriting_projects",
      "copywriting_shots",
      "creation_drafts",
      "generation_tasks",
      "personas",
      "publish_accounts",
      "publish_jobs",
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
    expect(row.count).toBe(2);
  });
});
