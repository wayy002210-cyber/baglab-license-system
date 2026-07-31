import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export type PublishPlatform = "douyin" | "wechat_channels";
export type AccountLinkStatus =
  | "unknown"
  | "connected"
  | "expired"
  | "needs_user";
export type PublishStatus =
  | "pending"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed"
  | "needs_user"
  | "canceled";

export type PublishAccount = {
  id: string;
  name: string;
  platform: PublishPlatform;
  userDataDir: string;
  linkStatus: AccountLinkStatus;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublishJob = {
  id: string;
  taskId: string;
  accountId: string;
  title: string;
  topics: string[];
  coverPath: string | null;
  status: PublishStatus;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  screenshotPath: string | null;
  attemptCount: number;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
};

export class PublishRepository {
  constructor(private readonly database: Database.Database) {}

  createAccount(input: {
    name: string;
    platform: PublishPlatform;
    userDataDir: string;
  }): PublishAccount {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.database
      .prepare(
        `INSERT INTO publish_accounts(
          id, name, platform, user_data_dir, link_status,
          last_checked_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'unknown', NULL, ?, ?)`
      )
      .run(id, input.name.trim(), input.platform, input.userDataDir, now, now);
    return this.requireAccount(id);
  }

  listAccounts(): PublishAccount[] {
    return (
      this.database
        .prepare(
          "SELECT * FROM publish_accounts WHERE platform IN ('douyin', 'wechat_channels') ORDER BY created_at DESC"
        )
        .all() as AccountRow[]
    ).map(mapAccount);
  }
  getAccount(id: string): PublishAccount | null {
    const row = this.database.prepare(
      "SELECT * FROM publish_accounts WHERE id = ?"
    ).get(id) as AccountRow | undefined;
    return row ? mapAccount(row) : null;
  }

  updateAccountStatus(
    id: string,
    status: AccountLinkStatus
  ): PublishAccount {
    const now = new Date().toISOString();
    const result = this.database
      .prepare(
        `UPDATE publish_accounts
         SET link_status = ?, last_checked_at = ?, updated_at = ? WHERE id = ?`
      )
      .run(status, now, now, id);
    if (!result.changes) throw new Error(`Publish account not found: ${id}`);
    return this.requireAccount(id);
  }

  deleteAccount(id: string): boolean {
    return (
      this.database.prepare("DELETE FROM publish_accounts WHERE id = ?").run(id)
        .changes > 0
    );
  }

  createJob(input: {
    taskId: string;
    accountId: string;
    title: string;
    topics: string[];
    scheduledAt: string | null;
    idempotencyKey: string;
    coverPath?: string | null;
  }): PublishJob {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.database
      .prepare(
        `INSERT INTO publish_jobs(
          id, task_id, account_id, title, topics_json, cover_path, status,
          scheduled_at, started_at, completed_at, error_message,
          screenshot_path, attempt_count, idempotency_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 0, ?, ?, ?)`
      )
      .run(
        id,
        input.taskId,
        input.accountId,
        input.title.trim(),
        JSON.stringify(input.topics),
        input.coverPath ?? null,
        input.scheduledAt ? "scheduled" : "pending",
        input.scheduledAt,
        input.idempotencyKey,
        now,
        now
      );
    return this.requireJob(id);
  }

  listJobs(): PublishJob[] {
    return (
      this.database
        .prepare("SELECT * FROM publish_jobs ORDER BY created_at DESC")
        .all() as JobRow[]
    ).map(mapJob);
  }
  getJob(id: string): PublishJob | null {
    const row = this.database.prepare(
      "SELECT * FROM publish_jobs WHERE id = ?"
    ).get(id) as JobRow | undefined;
    return row ? mapJob(row) : null;
  }

  claimNextDue(now: string): PublishJob | null {
    const claim = this.database.transaction(() => {
      const row = this.database
        .prepare(
          `SELECT job.id FROM publish_jobs job
           WHERE job.status IN ('pending', 'scheduled')
             AND (job.scheduled_at IS NULL OR job.scheduled_at <= ?)
             AND NOT EXISTS (
               SELECT 1 FROM publish_jobs active
               WHERE active.account_id = job.account_id
                 AND active.status = 'publishing'
             )
           ORDER BY COALESCE(job.scheduled_at, job.created_at), job.created_at
           LIMIT 1`
        )
        .get(now) as { id: string } | undefined;
      return row ? this.claim(row.id) : null;
    });
    return claim();
  }

  claim(id: string): PublishJob {
    const now = new Date().toISOString();
    const result = this.database
      .prepare(
        `UPDATE publish_jobs
         SET status = 'publishing', started_at = ?, updated_at = ?,
             attempt_count = attempt_count + 1
         WHERE id = ? AND status IN ('pending', 'scheduled')`
      )
      .run(now, now, id);
    if (!result.changes) throw new Error(`Publish job cannot be claimed: ${id}`);
    return this.requireJob(id);
  }

  cancelJob(id: string): PublishJob {
    const now = new Date().toISOString();
    const result = this.database
      .prepare(
        `UPDATE publish_jobs
         SET status = 'canceled', completed_at = ?, updated_at = ?
         WHERE id = ? AND status IN ('pending', 'scheduled', 'publishing')`
      )
      .run(now, now, id);
    if (!result.changes) {
      throw new Error(`Publish job cannot be canceled: ${id}`);
    }
    return this.requireJob(id);
  }

  finishJob(
    id: string,
    status: "published" | "failed" | "needs_user",
    details: { errorMessage?: string; screenshotPath?: string } = {}
  ): PublishJob {
    const now = new Date().toISOString();
    const result = this.database
      .prepare(
        `UPDATE publish_jobs
         SET status = ?, completed_at = ?, error_message = ?,
             screenshot_path = ?, updated_at = ?
         WHERE id = ? AND status = 'publishing'`
      )
      .run(
        status,
        now,
        details.errorMessage ?? null,
        details.screenshotPath ?? null,
        now,
        id
      );
    if (!result.changes) throw new Error(`Publish job is not running: ${id}`);
    return this.requireJob(id);
  }

  deleteJob(id: string): boolean {
    const job = this.requireJob(id);
    if (!["canceled", "failed", "published", "needs_user"].includes(job.status)) {
      throw new Error("Only terminal publish jobs can be deleted");
    }
    return this.database
      .prepare("DELETE FROM publish_jobs WHERE id = ?")
      .run(id).changes > 0;
  }

  private requireAccount(id: string): PublishAccount {
    const row = this.database
      .prepare("SELECT * FROM publish_accounts WHERE id = ?")
      .get(id) as AccountRow | undefined;
    if (!row) throw new Error(`Publish account not found: ${id}`);
    return mapAccount(row);
  }

  private requireJob(id: string): PublishJob {
    const row = this.database
      .prepare("SELECT * FROM publish_jobs WHERE id = ?")
      .get(id) as JobRow | undefined;
    if (!row) throw new Error(`Publish job not found: ${id}`);
    return mapJob(row);
  }
}

type AccountRow = {
  id: string; name: string; platform: PublishPlatform; user_data_dir: string;
  link_status: AccountLinkStatus; last_checked_at: string | null;
  created_at: string; updated_at: string;
};
type JobRow = {
  id: string; task_id: string; account_id: string; title: string;
  topics_json: string; cover_path: string | null; status: PublishStatus;
  scheduled_at: string | null; started_at: string | null;
  completed_at: string | null; error_message: string | null;
  screenshot_path: string | null; attempt_count: number;
  idempotency_key: string; created_at: string; updated_at: string;
};

const mapAccount = (row: AccountRow): PublishAccount => ({
  id: row.id, name: row.name, platform: row.platform,
  userDataDir: row.user_data_dir, linkStatus: row.link_status,
  lastCheckedAt: row.last_checked_at, createdAt: row.created_at,
  updatedAt: row.updated_at
});
const mapJob = (row: JobRow): PublishJob => ({
  id: row.id, taskId: row.task_id, accountId: row.account_id,
  title: row.title, topics: JSON.parse(row.topics_json) as string[],
  coverPath: row.cover_path, status: row.status, scheduledAt: row.scheduled_at,
  startedAt: row.started_at, completedAt: row.completed_at,
  errorMessage: row.error_message, screenshotPath: row.screenshot_path,
  attemptCount: row.attempt_count, idempotencyKey: row.idempotency_key,
  createdAt: row.created_at, updatedAt: row.updated_at
});
