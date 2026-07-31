import type Database from "better-sqlite3";
import {
  creationDraftSchema,
  type CreationDraft
} from "../../src/shared/contracts.js";

const ACTIVE_DRAFT_ID = "active";

type DraftRow = {
  payload_json: string;
};

export class CreationDraftRepository {
  constructor(private readonly database: Database.Database) {}

  get(): CreationDraft | null {
    const row = this.database
      .prepare("SELECT payload_json FROM creation_drafts WHERE id = ?")
      .get(ACTIVE_DRAFT_ID) as DraftRow | undefined;
    return row
      ? creationDraftSchema.parse(normalizeStylePositions(JSON.parse(row.payload_json)))
      : null;
  }

  save(input: CreationDraft): CreationDraft {
    const draft = creationDraftSchema.parse(normalizeStylePositions(input));
    const now = new Date().toISOString();
    this.database
      .prepare(
        `INSERT INTO creation_drafts(
           id, version, stage, payload_json, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           version = excluded.version,
           stage = excluded.stage,
           payload_json = excluded.payload_json,
           updated_at = excluded.updated_at`
      )
      .run(
        ACTIVE_DRAFT_ID,
        draft.version,
        draft.stage,
        JSON.stringify(draft),
        now,
        now
      );
    return structuredClone(draft);
  }

  clear(): void {
    this.database
      .prepare("DELETE FROM creation_drafts WHERE id = ?")
      .run(ACTIVE_DRAFT_ID);
  }

  duplicate(): CreationDraft | null {
    const draft = this.get();
    return draft ? structuredClone(draft) : null;
  }
}

function normalizeStylePositions(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const draft = structuredClone(value) as Record<string, any>;
  if (draft.subtitleStyle) {
    draft.subtitleStyle.positionX ??= 540;
    draft.subtitleStyle.positionY ??= 1650;
    normalizeEffectColors(draft.subtitleStyle);
  }
  if (draft.titleStyle) {
    draft.titleStyle.positionX ??= 540;
    draft.titleStyle.positionY ??= 180;
    normalizeEffectColors(draft.titleStyle);
  }
  return draft;
}

function normalizeEffectColors(style: Record<string, any>): void {
  const invalid = (value: unknown) =>
    typeof value !== "string" || !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value);
  if (invalid(style.primaryColor)) style.primaryColor = "#FFFFFF";
  if (invalid(style.outlineColor)) {
    style.outlineColor = Number(style.outlineWidth) > 0 ? "#101010" : "#00000000";
  }
  if (invalid(style.shadowColor)) style.shadowColor = "#00000000";
}
