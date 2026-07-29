import Database from "better-sqlite3";
import { gunzipSync } from "node:zlib";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyMigrations } from "../../electron/database";
import { exportDiagnosticBundle } from "../../electron/diagnostics";

describe("exportDiagnosticBundle", () => {
  it("exports task metadata and redacted logs without snapshots", () => {
    const database = new Database(":memory:");
    applyMigrations(database);
    const now = new Date().toISOString();
    database.prepare(
      `INSERT INTO generation_tasks(
        id, template_id, persona_id, status, progress, seed, snapshot_json,
        error_message, created_at, updated_at
      ) VALUES ('task-1','t','p','failed',10,1,?,'Bearer hidden',?,?)`
    ).run(JSON.stringify({ apiKey: "never-export" }), now, now);
    const output = join(mkdtempSync(join(tmpdir(), "autocut-diagnostics-")), "bundle.json.gz");

    exportDiagnosticBundle(database, output, {
      applicationVersion: "0.1.0",
      logs: ["Authorization: Bearer abc"]
    });
    const bundle = JSON.parse(gunzipSync(readFileSync(output)).toString("utf8"));

    expect(bundle.tasks[0].status).toBe("failed");
    expect(JSON.stringify(bundle)).not.toContain("never-export");
    expect(JSON.stringify(bundle)).not.toContain("Bearer abc");
    database.close();
  });
});
