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

  it("returns the existing job when a live idempotency key is submitted again", () => {
    seedTask("task-1");
    const account = repository.createAccount({
      name: "小红书",
      platform: "wechat_channels",
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

    const first = repository.createJob(input);
    const second = repository.createJob(input);
    expect(second.id).toBe(first.id);
    expect(repository.listJobs()).toHaveLength(1);
    expect(repository.listJobs()[0].topics).toEqual(["工厂", "定制"]);
  });

  it("creates a new immediate job after the previous immediate publish has completed", () => {
    seedTask("task-republish");
    database.prepare("UPDATE generation_tasks SET output_path=?, snapshot_json=? WHERE id=?")
      .run("D:/outputs/republish.mp4", JSON.stringify({ copywriting: { mainTitle: "复发测试" } }), "task-republish");
    const asset = repository.syncCompletedTasks()[0];
    const account = repository.createAccount({
      name: "抖音复发号",
      platform: "douyin",
      userDataDir: "D:/profiles/republish"
    });
    repository.updateAccountStatus(account.id, "connected");

    const first = repository.createJobsForAsset({ assetId: asset.id, accountIds: [account.id], scheduledAt: null })[0];
    repository.claim(first.id);
    repository.finishJob(first.id, "published");
    const second = repository.createJobsForAsset({ assetId: asset.id, accountIds: [account.id], scheduledAt: null })[0];

    expect(second.id).not.toBe(first.id);
    expect(second.status).toBe("ready");
    expect(repository.claimNextDue(new Date().toISOString())?.id).toBe(second.id);
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

  it.skip("claims a future platform-scheduled job immediately so the website can receive its time", () => {
    seedTask("task-future");
    const account = repository.createAccount({
      name: "抖音定时号", platform: "douyin", userDataDir: "D:/profiles/future"
    });
    const job = repository.createJob({
      taskId: "task-future", accountId: account.id, title: "提前上传",
      topics: [], scheduledAt: "2099-08-04T20:30:00.000Z", idempotencyKey: "future-job"
    });

    expect(repository.claimNextDue("2026-08-04T12:00:00.000Z")?.id).toBe(job.id);
  });

  it("only claims ready jobs and never auto-claims platform publish times", () => {
    seedTask("task-future");
    seedTask("task-past");
    const account = repository.createAccount({
      name: "douyin scheduled account",
      platform: "douyin",
      userDataDir: "D:/profiles/future"
    });
    const futurePlatformTimeJob = repository.createJob({
      taskId: "task-future",
      accountId: account.id,
      title: "future upload",
      topics: [],
      publishTime: "2099-08-04T20:30:00.000Z",
      scheduledAt: null,
      idempotencyKey: "future-job"
    });
    const now = new Date().toISOString();
    database.prepare(
      `INSERT INTO publish_jobs(
        id, task_id, account_id, title, topics_json, status, scheduled_at,
        idempotency_key, created_at, updated_at
      ) VALUES ('legacy-scheduled', 'task-past', ?, 'legacy due upload', '[]',
        'scheduled', '2026-08-04T11:59:00.000Z', 'legacy-due-job', ?, ?)`
    ).run(account.id, now, now);

    expect(futurePlatformTimeJob.status).toBe("ready");
    expect(repository.claimNextDue("2026-08-04T12:00:00.000Z")?.id).toBe(futurePlatformTimeJob.id);
    repository.finishJob(futurePlatformTimeJob.id, "published");
    expect(repository.claimNextDue("2026-08-04T12:00:00.000Z")).toBeNull();
    expect(repository.getJob("legacy-scheduled")?.status).toBe("scheduled");
  });

  it("records human verification failures as retryable failed jobs", () => {
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
    const result = repository.finishJob(job.id, "failed", {
      errorMessage: "需要扫码或验证码",
      screenshotPath: "D:/logs/check.png"
    });

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toBe("需要扫码或验证码");
    expect(result.attemptCount).toBe(1);
    expect(result.screenshotPath).toBe("D:/logs/check.png");
  });

  it("cancels a queued job and never claims it afterward", () => {
    seedTask("task-cancel");
    const account = repository.createAccount({
      name: "待发布账号",
      platform: "douyin",
      userDataDir: "D:/profiles/cancel"
    });
    const job = repository.createJob({
      taskId: "task-cancel",
      accountId: account.id,
      title: "取消测试",
      topics: [],
      scheduledAt: null,
      idempotencyKey: "cancel-job"
    });

    const canceled = repository.cancelJob(job.id);

    expect(canceled.status).toBe("canceled");
    expect(canceled.completedAt).not.toBeNull();
    expect(repository.claimNextDue(new Date().toISOString())).toBeNull();
    expect(repository.cancelJob(job.id).status).toBe("canceled");
  });

  it("marks a claimed job canceled when backend stops before submission", () => {
    seedTask("task-active-cancel");
    const account = repository.createAccount({
      name: "执行中账号",
      platform: "wechat_channels",
      userDataDir: "D:/profiles/active-cancel"
    });
    const job = repository.createJob({
      taskId: "task-active-cancel",
      accountId: account.id,
      title: "执行中取消",
      topics: [],
      scheduledAt: null,
      idempotencyKey: "active-cancel"
    });
    repository.claim(job.id);

    const canceled = repository.cancelJob(job.id);

    expect(canceled.status).toBe("canceled");
  });

  it("deletes canceled records but rejects active records", () => {
    seedTask("task-delete");
    const account = repository.createAccount({
      name: "删除测试账号",
      platform: "douyin",
      userDataDir: "D:/profiles/delete"
    });
    const job = repository.createJob({
      taskId: "task-delete",
      accountId: account.id,
      title: "删除测试",
      topics: [],
      scheduledAt: null,
      idempotencyKey: "delete-job"
    });

    repository.claim(job.id);
    expect(() => repository.deleteJob(job.id)).toThrow(/取消正在等待或执行/);
    repository.cancelJob(job.id);
    expect(repository.deleteJob(job.id)).toBe(true);
    expect(repository.getJob(job.id)).toBeNull();
  });

  it("syncs completed videos into the publishing asset pool once", () => {
    seedTask("task-asset");
    database.prepare("UPDATE generation_tasks SET output_path=?, snapshot_json=? WHERE id=?")
      .run("D:/outputs/video.mp4", JSON.stringify({ copywriting: { mainTitle: "工厂十年坚守", topicTitle: "为什么坚持质量优先" } }), "task-asset");
    const first = repository.syncCompletedTasks();
    const second = repository.syncCompletedTasks();
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0]).toMatchObject({ shortTitle: "工厂十年坚守", topic: "为什么坚持质量优先", status: "unscheduled" });
  });

  it("creates one scheduled job per selected connected account", () => {
    seedTask("task-batch");
    database.prepare("UPDATE generation_tasks SET output_path=?, snapshot_json=? WHERE id=?")
      .run("D:/outputs/batch.mp4", JSON.stringify({ copywriting: { mainTitle: "批量发布" } }), "task-batch");
    const asset = repository.syncCompletedTasks()[0];
    const first = repository.createAccount({ name: "抖音一号", platform: "douyin", positioning: "工厂实拍", userDataDir: "D:/profiles/one" });
    const second = repository.createAccount({ name: "视频号一号", platform: "wechat_channels", userDataDir: "D:/profiles/two" });
    repository.updateAccountStatus(first.id, "connected");
    repository.updateAccountStatus(second.id, "connected");
    repository.updateAsset(asset.id, { topics: ["工厂", "定制"] });
    const jobs = repository.createJobsForAsset({ assetId: asset.id, accountIds: [first.id, second.id], scheduledAt: "2026-08-06T10:00:00.000Z" });
    expect(jobs).toHaveLength(2);
    expect(jobs.every((job) => job.status === "ready")).toBe(true);
    expect(jobs.every((job) => job.publishTime === "2026-08-06T10:00:00.000Z")).toBe(true);
    expect(repository.getAsset(asset.id)?.status).toBe("scheduled");
  });

  it("freezes vertical and horizontal cover paths into publish jobs", () => {
    seedTask("task-cover");
    database.prepare("UPDATE generation_tasks SET output_path=?, snapshot_json=? WHERE id=?")
      .run("D:/outputs/cover.mp4", JSON.stringify({ copywriting: { mainTitle: "封面测试" } }), "task-cover");
    const asset = repository.syncCompletedTasks()[0];
    const account = repository.createAccount({
      name: "douyin cover account",
      platform: "douyin",
      userDataDir: "D:/profiles/cover"
    });
    repository.updateAccountStatus(account.id, "connected");

    const updated = repository.updateAsset(asset.id, {
      verticalCoverPath: "D:/covers/vertical.jpg",
      horizontalCoverPath: "D:/covers/horizontal.jpg"
    });
    const job = repository.createJobsForAsset({ assetId: updated.id, accountIds: [account.id], publishTime: null })[0];

    expect(updated.coverPath).toBe("D:/covers/vertical.jpg");
    expect(updated.verticalCoverPath).toBe("D:/covers/vertical.jpg");
    expect(updated.horizontalCoverPath).toBe("D:/covers/horizontal.jpg");
    expect(job.coverPath).toBe("D:/covers/vertical.jpg");
    expect(job.verticalCoverPath).toBe("D:/covers/vertical.jpg");
    expect(job.horizontalCoverPath).toBe("D:/covers/horizontal.jpg");
  });

  it("maps legacy cover_path to verticalCoverPath for old publish assets", () => {
    seedTask("task-legacy-cover");
    const now = new Date().toISOString();
    database.prepare(
      `INSERT INTO publish_assets(
        id, task_id, short_title, topic, publish_title, topics_json,
        cover_path, status, created_at, updated_at
      ) VALUES ('legacy-cover-asset', 'task-legacy-cover', '旧封面', '', '旧封面', '[]',
        'D:/covers/legacy.jpg', 'unscheduled', ?, ?)`
    ).run(now, now);

    const asset = repository.getAsset("legacy-cover-asset");

    expect(asset?.coverPath).toBe("D:/covers/legacy.jpg");
    expect(asset?.verticalCoverPath).toBe("D:/covers/legacy.jpg");
    expect(asset?.horizontalCoverPath).toBeNull();
  });

  it("stores reusable topic templates", () => {
    const template = repository.saveTopicTemplate({ name: "工厂通用", topics: ["源头工厂", "定制"] });
    expect(repository.listTopicTemplates()[0]).toMatchObject({ id: template.id, topics: ["源头工厂", "定制"] });
    expect(repository.deleteTopicTemplate(template.id)).toBe(true);
  });
});
