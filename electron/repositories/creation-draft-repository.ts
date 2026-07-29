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
    return row ? creationDraftSchema.parse(JSON.parse(row.payload_json)) : null;
  }

  save(input: CreationDraft): CreationDraft {
    const draft = creationDraftSchema.parse(input);
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
