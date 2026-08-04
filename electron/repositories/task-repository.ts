import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export const TASK_STATUSES = [
  "draft",
  "pending",
  "queued",
  "preparing_copy",
  "generating_voice",
  "selecting_assets",
  "composing",
  "waiting_encoding",
  "encoding",
  "completed",
  "failed",
  "canceled"
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export type GenerationTask = {
  id: string;
  templateId: string;
  personaId: string;
  status: TaskStatus;
  progress: number;
  seed: number;
  snapshot: Record<string, unknown>;
  outputPath: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
};

export type CreateTaskBatchInput = {
  templateId: string;
  personaId: string;
  count: number;
  seed: number;
  snapshot: Record<string, unknown>;
};

export type TransitionPatch = {
  progress?: number;
  outputPath?: string;
  errorCode?: string;
  errorMessage?: string;
};
export type QueueStatus = "idle" | "running" | "pause_requested" | "paused";
export type QueueState = { status:QueueStatus;activeTaskId:string|null;pendingCount:number };

type TaskRow = {
  id: string;
  template_id: string;
  persona_id: string;
  status: TaskStatus;
  progress: number;
  seed: number;
  snapshot_json: string;
  output_path: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

const ACTIVE_STATUSES: TaskStatus[] = [
  "preparing_copy",
  "generating_voice",
  "selecting_assets",
  "composing",
  "waiting_encoding",
  "encoding"
];

const TERMINAL_STATUSES: TaskStatus[] = ["completed", "failed", "canceled"];

export class InvalidTaskTransitionError extends Error {}

export class TaskRepository {
  constructor(private readonly database: Database.Database) {}

  createBatch(input: CreateTaskBatchInput): GenerationTask[] {
    if (!Number.isInteger(input.count) || input.count < 1 || input.count > 20) {
      throw new RangeError("Task batch count must be between 1 and 20");
    }
    if (!input.templateId || !input.personaId) {
      throw new Error("Template and persona are required");
    }
    assertSnapshotContainsNoSecrets(input.snapshot);
    const snapshotJson = JSON.stringify(input.snapshot);
    const insert = this.database.prepare(
      `INSERT INTO generation_tasks(
        id, template_id, persona_id, status, progress, seed, snapshot_json,
        output_path, error_code, error_message, created_at, started_at,
        completed_at, updated_at
      ) VALUES (?, ?, ?, 'pending', 0, ?, ?, NULL, NULL, NULL, ?, NULL, NULL, ?)`
    );
    const create = this.database.transaction(() => {
      const tasks: GenerationTask[] = [];
      for (let index = 0; index < input.count; index += 1) {
        const id = randomUUID();
        const now = new Date().toISOString();
        insert.run(
          id,
          input.templateId,
          input.personaId,
          input.seed + index,
          snapshotJson,
          now,
          now
        );
        tasks.push(this.require(id));
      }
      return tasks;
    });
    return create();
  }

  list(): GenerationTask[] {
    const rows = this.database
      .prepare("SELECT * FROM generation_tasks ORDER BY created_at DESC, id DESC")
      .all() as TaskRow[];
    return rows.map(mapTask);
  }

  listPending(): GenerationTask[] {
    return (this.database.prepare("SELECT * FROM generation_tasks WHERE status = 'pending' ORDER BY created_at ASC, rowid ASC").all() as TaskRow[]).map(mapTask);
  }

  getQueueState(): QueueState {
    const row=this.database.prepare("SELECT status, active_task_id FROM queue_state WHERE id='generation'").get() as {status:QueueStatus;active_task_id:string|null};
    const pendingCount=Number((this.database.prepare("SELECT COUNT(*) count FROM generation_tasks WHERE status='pending'").get() as {count:number}).count);
    return {status:row.status,activeTaskId:row.active_task_id,pendingCount};
  }

  saveQueueState(status:QueueStatus,activeTaskId:string|null):QueueState {
    this.database.prepare("UPDATE queue_state SET status=?, active_task_id=?, updated_at=? WHERE id='generation'").run(status,activeTaskId,new Date().toISOString());
    return this.getQueueState();
  }

  get(id: string): GenerationTask | null {
    const row = this.database
      .prepare("SELECT * FROM generation_tasks WHERE id = ?")
      .get(id) as TaskRow | undefined;
    return row ? mapTask(row) : null;
  }

  transition(
    id: string,
    nextStatus: TaskStatus,
    patch: TransitionPatch = {}
  ): GenerationTask {
    const task = this.require(id);
    this.assertTransition(task.status, nextStatus);
    const now = new Date().toISOString();
    const startedAt =
      task.startedAt ??
      (ACTIVE_STATUSES.includes(nextStatus) ? now : null);
    const completedAt = TERMINAL_STATUSES.includes(nextStatus) ? now : null;
    const progress =
      nextStatus === "completed"
        ? 100
        : Math.max(0, Math.min(100, patch.progress ?? task.progress));

    this.database
      .prepare(
        `UPDATE generation_tasks
         SET status = ?, progress = ?, output_path = ?, error_code = ?,
             error_message = ?, started_at = ?, completed_at = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        nextStatus,
        progress,
        patch.outputPath ?? task.outputPath,
        patch.errorCode ?? (nextStatus === "failed" ? task.errorCode : null),
        patch.errorMessage ??
          (nextStatus === "failed" ? task.errorMessage : null),
        startedAt,
        completedAt,
        now,
        id
      );
    return this.require(id);
  }

  cancel(id: string): GenerationTask {
    const task = this.require(id);
    if (TERMINAL_STATUSES.includes(task.status)) {
      throw new InvalidTaskTransitionError(
        `Cannot cancel task in ${task.status} state`
      );
    }
    return this.transition(id, "canceled");
  }

  retry(id: string): GenerationTask {
    const task = this.require(id);
    if (!["failed", "canceled"].includes(task.status)) {
      throw new InvalidTaskTransitionError(
        `Cannot retry task in ${task.status} state`
      );
    }
    const now = new Date().toISOString();
    this.database
      .prepare(
        `UPDATE generation_tasks
         SET status = 'pending', progress = 0, output_path = NULL,
             error_code = NULL, error_message = NULL, started_at = NULL,
             completed_at = NULL, updated_at = ?
         WHERE id = ?`
      )
      .run(now, id);
    return this.require(id);
  }

  recoverInterrupted(): number {
    const placeholders = ACTIVE_STATUSES.map(() => "?").join(", ");
    const now = new Date().toISOString();
    const result = this.database
      .prepare(
        `UPDATE generation_tasks
         SET status = 'failed', error_code = 'APP_INTERRUPTED',
             error_message = '应用上次运行时意外退出，可重试此任务',
             completed_at = ?, updated_at = ?
         WHERE status IN (${placeholders})`
      )
      .run(now, now, ...ACTIVE_STATUSES);
    return result.changes;
  }

  delete(id: string): boolean {
    const task = this.require(id);
    if (!TERMINAL_STATUSES.includes(task.status)) {
      throw new InvalidTaskTransitionError("Cannot delete an active task");
    }
    return (
      this.database.prepare("DELETE FROM generation_tasks WHERE id = ?").run(id)
        .changes > 0
    );
  }

  private require(id: string): GenerationTask {
    const task = this.get(id);
    if (!task) throw new Error(`Task not found: ${id}`);
    return task;
  }

  private assertTransition(current: TaskStatus, next: TaskStatus): void {
    if (TERMINAL_STATUSES.includes(current)) {
      throw new InvalidTaskTransitionError(
        `Cannot transition terminal task from ${current} to ${next}`
      );
    }
    if (next === "draft" || next === "pending" || next === "queued") {
      throw new InvalidTaskTransitionError(
        `Cannot transition task from ${current} to ${next}`
      );
    }
  }
}

function mapTask(row: TaskRow): GenerationTask {
  return {
    id: row.id,
    templateId: row.template_id,
    personaId: row.persona_id,
    status: row.status,
    progress: row.progress,
    seed: row.seed,
    snapshot: JSON.parse(row.snapshot_json) as Record<string, unknown>,
    outputPath: row.output_path,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at
  };
}

function assertSnapshotContainsNoSecrets(
  value: unknown,
  path = "snapshot"
): void {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;
    if (
      nested !== undefined &&
      /(api.?key|authorization|cookie|password|secret|token)/i.test(key)
    ) {
      throw new Error(`Task snapshot cannot contain secrets: ${nestedPath}`);
    }
    assertSnapshotContainsNoSecrets(nested, nestedPath);
  }
}
