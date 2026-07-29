import type Database from "better-sqlite3";
import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { redactSensitive } from "./logger.js";

export function exportDiagnosticBundle(
  database: Database.Database,
  outputPath: string,
  input: { applicationVersion: string; logs: string[] }
): void {
  const tasks = database
    .prepare(
      `SELECT id, status, progress, error_code, error_message,
              created_at, started_at, completed_at, updated_at
       FROM generation_tasks ORDER BY created_at DESC LIMIT 100`
    )
    .all();
  const publishJobs = database
    .prepare(
      `SELECT id, status, error_message, attempt_count, created_at, updated_at
       FROM publish_jobs ORDER BY created_at DESC LIMIT 100`
    )
    .all();
  const payload = redactSensitive({
    exportedAt: new Date().toISOString(),
    applicationVersion: input.applicationVersion,
    platform: process.platform,
    architecture: process.arch,
    nodeVersion: process.version,
    tasks,
    publishJobs,
    logs: input.logs
  });
  writeFileSync(
    outputPath,
    gzipSync(Buffer.from(JSON.stringify(payload, null, 2), "utf8"))
  );
}
