import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export const COPYWRITING_STATUSES = [
  "generating", "failed", "review", "library", "shots_ready", "tasked", "archived"
] as const;
export type CopywritingStatus = (typeof COPYWRITING_STATUSES)[number];
export type SuggestionSource = "ai" | "keyword" | "default" | "manual";

export type CopywritingProject = {
  id: string; personaId: string; topicId: string | null; topicTitle: string;
  mainTitle: string; text: string; model: string; status: CopywritingStatus;
  complianceIssues: unknown[]; errorMessage: string | null; createdAt: string;
  updatedAt: string; archivedAt: string | null;
  sourceProjectId: string | null;
};

export type CopywritingShot = {
  id: string; projectId: string; index: number; copywriting: string;
  suggestedCategoryId: string | null; assetCategoryId: string | null;
  suggestionSource: SuggestionSource; suggestionConfirmed: boolean;
  durationMode: "voice" | "fixed" | "auto"; durationSec: number | null;
  muteOriginal: boolean;
};

export type CreateCopywritingProjectInput = Pick<CopywritingProject,
  "personaId" | "topicId" | "topicTitle" | "mainTitle" | "text" | "model" | "status"
> & { complianceIssues?: unknown[]; errorMessage?: string | null };
export type CreateProjectWithSource = CreateCopywritingProjectInput & { sourceProjectId?: string | null };

export type ReplaceShotInput = Omit<CopywritingShot, "id" | "projectId" | "index">;

type ProjectRow = {
  id: string; persona_id: string; topic_id: string | null; topic_title: string;
  main_title: string; content: string; model: string; status: CopywritingStatus;
  compliance_issues_json: string; error_message: string | null; created_at: string;
  updated_at: string; archived_at: string | null;
  source_project_id: string | null;
};

export class CopywritingProjectRepository {
  constructor(private readonly database: Database.Database) {}

  create(input: CreateProjectWithSource): CopywritingProject {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.database.prepare(`INSERT INTO copywriting_projects(
      id, persona_id, topic_id, topic_title, main_title, content, model, status,
      compliance_issues_json, error_message, created_at, updated_at, archived_at, source_project_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`).run(
      id, input.personaId, input.topicId, input.topicTitle, input.mainTitle,
      input.text, input.model, input.status, JSON.stringify(input.complianceIssues ?? []),
      input.errorMessage ?? null, now, now, input.sourceProjectId ?? null
    );
    return this.require(id);
  }

  list(statuses?: CopywritingStatus[]): CopywritingProject[] {
    if (statuses && statuses.length === 0) return [];
    const where = statuses?.length ? `WHERE status IN (${statuses.map(() => "?").join(",")})` : "";
    const rows = this.database.prepare(
      `SELECT * FROM copywriting_projects ${where} ORDER BY updated_at DESC, id DESC`
    ).all(...(statuses ?? [])) as ProjectRow[];
    return rows.map(mapProject);
  }

  get(id: string): CopywritingProject | null {
    const row = this.database.prepare("SELECT * FROM copywriting_projects WHERE id = ?").get(id) as ProjectRow | undefined;
    return row ? mapProject(row) : null;
  }

  require(id: string): CopywritingProject {
    const project = this.get(id);
    if (!project) throw new Error(`Copywriting project not found: ${id}`);
    return project;
  }

  update(id: string, patch: Partial<Pick<CopywritingProject, "text" | "mainTitle" | "status" | "complianceIssues" | "errorMessage">>): CopywritingProject {
    const current = this.require(id);
    const now = new Date().toISOString();
    this.database.prepare(`UPDATE copywriting_projects SET content = ?, main_title = ?, status = ?,
      compliance_issues_json = ?, error_message = ?, updated_at = ? WHERE id = ?`).run(
      patch.text ?? current.text, patch.mainTitle ?? current.mainTitle,
      patch.status ?? current.status, JSON.stringify(patch.complianceIssues ?? current.complianceIssues),
      patch.errorMessage === undefined ? current.errorMessage : patch.errorMessage, now, id
    );
    return this.require(id);
  }

  collect(id: string): CopywritingProject { return this.update(id, { status: "library", errorMessage: null }); }

  cloneArchived(id: string): CopywritingProject {
    const source = this.require(id);
    if (source.status !== "archived") throw new Error("只有归档文案可以创建新版本");
    return this.create({
      personaId: source.personaId,
      topicId: source.topicId,
      topicTitle: source.topicTitle,
      mainTitle: source.mainTitle,
      text: source.text,
      model: source.model,
      status: "library",
      complianceIssues: source.complianceIssues,
      errorMessage: null
      ,sourceProjectId: source.id
    });
  }

  replaceShots(projectId: string, shots: ReplaceShotInput[]): CopywritingShot[] {
    this.require(projectId);
    const transaction = this.database.transaction(() => {
      this.database.prepare("DELETE FROM copywriting_shots WHERE project_id = ?").run(projectId);
      const insert = this.database.prepare(`INSERT INTO copywriting_shots(
        id, project_id, shot_index, copywriting, suggested_category_id, asset_category_id,
        suggestion_source, suggestion_confirmed, duration_mode, duration_sec, mute_original
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      shots.forEach((shot, index) => insert.run(
        randomUUID(), projectId, index, shot.copywriting, shot.suggestedCategoryId,
        shot.assetCategoryId, shot.suggestionSource, shot.suggestionConfirmed ? 1 : 0,
        shot.durationMode, shot.durationSec, shot.muteOriginal ? 1 : 0
      ));
      this.update(projectId, { status: "shots_ready", errorMessage: null });
    });
    transaction();
    return this.listShots(projectId);
  }

  listShots(projectId: string): CopywritingShot[] {
    const rows = this.database.prepare(
      "SELECT * FROM copywriting_shots WHERE project_id = ? ORDER BY shot_index"
    ).all(projectId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id), projectId: String(row.project_id), index: Number(row.shot_index),
      copywriting: String(row.copywriting), suggestedCategoryId: row.suggested_category_id ? String(row.suggested_category_id) : null,
      assetCategoryId: row.asset_category_id ? String(row.asset_category_id) : null,
      suggestionSource: row.suggestion_source as SuggestionSource,
      suggestionConfirmed: Boolean(row.suggestion_confirmed), durationMode: row.duration_mode as CopywritingShot["durationMode"],
      durationSec: row.duration_sec === null ? null : Number(row.duration_sec), muteOriginal: Boolean(row.mute_original)
    }));
  }

  archive(id: string, archivedAt = new Date().toISOString()): CopywritingProject {
    const transaction = this.database.transaction(() => {
      this.require(id);
      this.database.prepare(`UPDATE copywriting_projects SET status='archived', archived_at=?, updated_at=? WHERE id=?`).run(archivedAt, archivedAt, id);
      const stale = this.database.prepare(`SELECT id FROM copywriting_projects WHERE status='archived'
        ORDER BY archived_at DESC, id DESC LIMIT -1 OFFSET 30`).all() as Array<{ id: string }>;
      const remove = this.database.prepare("DELETE FROM copywriting_projects WHERE id = ?");
      stale.forEach((item) => remove.run(item.id));
    });
    transaction();
    return this.require(id);
  }
}

function mapProject(row: ProjectRow): CopywritingProject {
  return { id: row.id, personaId: row.persona_id, topicId: row.topic_id,
    topicTitle: row.topic_title, mainTitle: row.main_title, text: row.content,
    model: row.model, status: row.status, complianceIssues: JSON.parse(row.compliance_issues_json) as unknown[],
    errorMessage: row.error_message, createdAt: row.created_at, updatedAt: row.updated_at,
    archivedAt: row.archived_at, sourceProjectId: row.source_project_id };
}
