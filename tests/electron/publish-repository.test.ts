import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../../electron/database";
import {
  PublishRepository
} from "../../electron/repositories/publish-repository";

describe("PublishRepository", () => {
  let database: Database.Database;
  let repository: PublishRepository;

  beforeEach(() => {
    database = new Database(":memory:");
    applyMigrations(database);
    repository = new PublishRepository(database);
  });
  afterEach(() => database.close());

  function seedTask(id: string): void {
    const now = new Date().toISOString();
    database.prepare(
      `INSERT INTO generation_tasks(
        id, template_id, persona_id, status, progress, seed, snapshot_json,
        created_at, updated_at
      ) VALUES (?, 'template', 'persona', 'completed', 100, 1, '{}', ?, ?)`
    ).run(id, now, now);
  }

  it("creates isolated platform accounts and updates login state", () => {
    const account = repository.createAccount({
      name: "门店抖音",
      platform: "douyin",
      userDataDir: "D:/profiles/douyin-one"
    });

    const checked = repository.updateAccountStatus(account.id, "connected");

    expect(checked.linkStatus).toBe("connected");
    expect(checked.lastCheckedAt).not.toBeNull();
    expect(repository.listAccounts()).toHaveLength(1);
  });

  it("creates idempotent scheduled jobs and rejects duplicates", () => {
    seedTask("task-1");
    const account = repository.createAccount({
      name: "小红书",
      platform: "xiaohongshu",
      userDataDir: "D:/profiles/xhs"
    });
    const input = {
      taskId: "task-1",
      accountId: account.id,
      title: "工厂实拍",
      topics: ["工厂", "定制"],
      scheduledAt: "2026-08-01T03:00:00.000Z",
      idempotencyKey: "task-1:xhs:20260801"
    };

    repository.createJob(input);
    expect(() => repository.createJob(input)).toThrow();
    expect(repository.listJobs()[0].topics).toEqual(["工厂", "定制"]);
  });

  it("claims due jobs once and serializes work for the same account", () => {
    seedTask("task-0");
    seedTask("task-1");
    const account = repository.createAccount({
      name: "抖音一号",
      platform: "douyin",
      userDataDir: "D:/profiles/douyin"
    });
    for (const [index, scheduledAt] of [
      "2026-07-29T01:00:00.000Z",
      "2026-07-29T01:01:00.000Z"
    ].entries()) {
      repository.createJob({
        taskId: `task-${index}`,
        accountId: account.id,
        title: `视频 ${index}`,
        topics: [],
        scheduledAt,
        idempotencyKey: `job-${index}`
      });
    }

    const first = repository.claimNextDue("2026-07-29T02:00:00.000Z");
    const blocked = repository.claimNextDue("2026-07-29T02:00:00.000Z");
    repository.finishJob(first!.id, "published");
    const second = repository.claimNextDue("2026-07-29T02:00:00.000Z");

    expect(first?.status).toBe("publishing");
    expect(blocked).toBeNull();
    expect(second?.id).not.toBe(first?.id);
  });

  it("moves human verification failures to needs_user without retrying", () => {
    seedTask("task-1");
    const account = repository.createAccount({
      name: "平台账号",
      platform: "douyin",
      userDataDir: "D:/profiles/user"
    });
    const job = repository.createJob({
      taskId: "task-1",
      accountId: account.id,
      title: "测试",
      topics: [],
      scheduledAt: null,
      idempotencyKey: "human-check"
    });

    repository.claim(job.id);
    const result = repository.finishJob(job.id, "needs_user", {
      errorMessage: "需要扫码或验证码",
      screenshotPath: "D:/logs/check.png"
    });

    expect(result.status).toBe("needs_user");
    expect(result.attemptCount).toBe(1);
    expect(result.screenshotPath).toBe("D:/logs/check.png");
  });
});
