import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../../electron/database";
import {
  InvalidTaskTransitionError,
  TaskRepository
} from "../../electron/repositories/task-repository";

describe("TaskRepository", () => {
  let database: Database.Database;
  let repository: TaskRepository;

  beforeEach(() => {
    database = new Database(":memory:");
    applyMigrations(database);
    repository = new TaskRepository(database);
  });

  afterEach(() => database.close());

  it("creates a batch with immutable snapshots and deterministic seeds", () => {
    const created = repository.createBatch({
      templateId: "template-1",
      personaId: "persona-1",
      count: 3,
      seed: 500,
      snapshot: { template: { name: "门店口播" }, apiKey: undefined }
    });

    expect(created).toHaveLength(3);
    expect(created.map((task) => task.seed)).toEqual([500, 501, 502]);
    expect(created.every((task) => task.status === "pending")).toBe(true);
    expect(repository.get(created[0].id)?.snapshot).toEqual({
      template: { name: "门店口播" }
    });
  });

  it("rejects secrets in task snapshots", () => {
    expect(() =>
      repository.createBatch({
        templateId: "template-1",
        personaId: "persona-1",
        count: 1,
        seed: 1,
        snapshot: { settings: { apiKey: "must-not-persist" } }
      })
    ).toThrow(/secret/i);
  });

  it("enforces transitions and records progress timestamps", () => {
    const [task] = repository.createBatch({
      templateId: "template-1",
      personaId: "persona-1",
      count: 1,
      seed: 9,
      snapshot: {}
    });

    const running = repository.transition(task.id, "preparing_copy", {
      progress: 10
    });
    const encoding = repository.transition(task.id, "encoding", {
      progress: 80
    });
    const completed = repository.transition(task.id, "completed", {
      progress: 100,
      outputPath: "D:/output/final.mp4"
    });

    expect(running.startedAt).not.toBeNull();
    expect(encoding.progress).toBe(80);
    expect(completed.completedAt).not.toBeNull();
    expect(completed.outputPath).toBe("D:/output/final.mp4");
    expect(() => repository.transition(task.id, "pending")).toThrow(
      InvalidTaskTransitionError
    );
  });

  it("cancels active tasks and retries failed tasks without changing snapshot", () => {
    const [active, failed] = repository.createBatch({
      templateId: "template-1",
      personaId: "persona-1",
      count: 2,
      seed: 20,
      snapshot: { shots: [{ copywriting: "原始快照" }] }
    });
    repository.transition(active.id, "generating_voice");
    repository.transition(failed.id, "failed", {
      errorCode: "TTS_FAILED",
      errorMessage: "配音失败"
    });

    expect(repository.cancel(active.id).status).toBe("canceled");
    const retried = repository.retry(failed.id);

    expect(retried.status).toBe("pending");
    expect(retried.progress).toBe(0);
    expect(retried.errorCode).toBeNull();
    expect(retried.snapshot).toEqual({ shots: [{ copywriting: "原始快照" }] });
  });

  it("recovers interrupted tasks as failed and retryable after restart", () => {
    const [task] = repository.createBatch({
      templateId: "template-1",
      personaId: "persona-1",
      count: 1,
      seed: 1,
      snapshot: {}
    });
    repository.transition(task.id, "composing", { progress: 60 });

    expect(repository.recoverInterrupted()).toBe(1);
    const recovered = repository.get(task.id);
    expect(recovered?.status).toBe("failed");
    expect(recovered?.errorCode).toBe("APP_INTERRUPTED");
  });

  it("deletes terminal records but protects active tasks", () => {
    const [task] = repository.createBatch({
      templateId: "template-1", personaId: "persona-1",
      count: 1, seed: 1, snapshot: {}
    });
    expect(() => repository.delete(task.id)).toThrow(/active/i);
    repository.cancel(task.id);
    expect(repository.delete(task.id)).toBe(true);
    expect(repository.get(task.id)).toBeNull();
  });

  it("persists serial queue state and returns pending tasks oldest first", () => {
    repository.createBatch({ templateId:"t",personaId:"p",count:2,seed:1,snapshot:{} });
    expect(repository.listPending().map(task=>task.seed)).toEqual([1,2]);
    expect(repository.getQueueState()).toMatchObject({status:"idle",activeTaskId:null,pendingCount:2});
    repository.saveQueueState("running",repository.listPending()[0].id);
    expect(repository.getQueueState()).toMatchObject({status:"running",pendingCount:2});
  });
});
