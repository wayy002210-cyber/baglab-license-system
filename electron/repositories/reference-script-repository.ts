import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export type ReferenceScriptStructure = {
  hook: string;
  narrative: string;
  cta: string;
};

export type ReferenceScriptInput = {
  title: string;
  industry: string;
  tags: string[];
  content: string;
  structure: ReferenceScriptStructure;
};

export type ReferenceScript = ReferenceScriptInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

type ScriptRow = {
  id: string;
  title: string;
  industry: string;
  tags_json: string;
  content: string;
  structure_json: string;
  created_at: string;
  updated_at: string;
};

function mapRow(row: ScriptRow): ReferenceScript {
  return {
    id: row.id,
    title: row.title,
    industry: row.industry,
    tags: JSON.parse(row.tags_json) as string[],
    content: row.content,
    structure: JSON.parse(row.structure_json) as ReferenceScriptStructure,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeTokens(value: string): string[] {
  return [
    ...new Set(
      value
        .toLocaleLowerCase("zh-CN")
        .split(/[\s,，。！？、；：]+/)
        .map((token) => token.trim())
        .filter(Boolean)
    )
  ];
}

export class ReferenceScriptRepository {
  constructor(private readonly database: Database.Database) {}

  create(input: ReferenceScriptInput): ReferenceScript {
    if (!input.title.trim() || !input.content.trim()) {
      throw new Error("Reference script title and content are required");
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    this.database
      .prepare(
        `INSERT INTO reference_scripts(
           id, title, industry, tags_json, content, structure_json,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.title.trim(),
        input.industry.trim(),
        JSON.stringify([...new Set(input.tags.map((tag) => tag.trim()))].filter(Boolean)),
        input.content.trim(),
        JSON.stringify(input.structure),
        now,
        now
      );
    return this.get(id);
  }

  get(id: string): ReferenceScript {
    const row = this.database
      .prepare("SELECT * FROM reference_scripts WHERE id = ?")
      .get(id) as ScriptRow | undefined;
    if (!row) throw new Error("Reference script not found");
    return mapRow(row);
  }

  list(): ReferenceScript[] {
    return (
      this.database
        .prepare("SELECT * FROM reference_scripts ORDER BY created_at DESC")
        .all() as ScriptRow[]
    ).map(mapRow);
  }

  delete(id: string): boolean {
    return (
      this.database.prepare("DELETE FROM reference_scripts WHERE id = ?").run(id)
        .changes > 0
    );
  }

  search(input: {
    industry: string;
    query: string;
    limit: number;
  }): ReferenceScript[] {
    const tokens = normalizeTokens(`${input.industry} ${input.query}`);
    return this.list()
      .map((script) => {
        const haystack = [
          script.title,
          script.industry,
          script.tags.join(" "),
          script.content
        ]
          .join(" ")
          .toLocaleLowerCase("zh-CN");
        const score = tokens.reduce(
          (total, token) => total + (haystack.includes(token) ? 1 : 0),
          script.industry === input.industry && input.industry.trim() ? 2 : 0
        );
        return { script, score };
      })
      .filter((item) => item.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.script.createdAt.localeCompare(left.script.createdAt)
      )
      .slice(0, Math.max(0, Math.min(5, input.limit)))
      .map((item) => item.script);
  }
}
