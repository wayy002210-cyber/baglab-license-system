import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export type Persona = {
  id: string;
  name: string;
  industry: string;
  brandFacts: string[];
  tone: string;
  cta: string;
  bannedWords: string[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PersonaInput = Omit<Persona, "id" | "createdAt" | "updatedAt">;
export type PersonaUpdate = Partial<PersonaInput>;

type PersonaRow = {
  id: string;
  name: string;
  industry: string;
  brand_facts_json: string;
  tone: string;
  cta: string;
  banned_words_json: string;
  is_default: number;
  created_at: string;
  updated_at: string;
};

function mapRow(row: PersonaRow): Persona {
  return {
    id: row.id,
    name: row.name,
    industry: row.industry,
    brandFacts: JSON.parse(row.brand_facts_json) as string[],
    tone: row.tone,
    cta: row.cta,
    bannedWords: JSON.parse(row.banned_words_json) as string[],
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class PersonaRepository {
  constructor(private readonly database: Database.Database) {}

  list(): Persona[] {
    const rows = this.database
      .prepare(
        `SELECT * FROM personas
         ORDER BY is_default DESC, updated_at DESC`
      )
      .all() as PersonaRow[];
    return rows.map(mapRow);
  }

  get(id: string): Persona | null {
    const row = this.database
      .prepare("SELECT * FROM personas WHERE id = ?")
      .get(id) as PersonaRow | undefined;
    return row ? mapRow(row) : null;
  }

  create(input: PersonaInput): Persona {
    const create = this.database.transaction(() => {
      if (input.isDefault) this.clearDefault();
      const id = randomUUID();
      const now = new Date().toISOString();
      this.database
        .prepare(
          `INSERT INTO personas (
            id, name, industry, brand_facts_json, tone, cta,
            banned_words_json, is_default, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          input.name.trim(),
          input.industry.trim(),
          JSON.stringify(input.brandFacts),
          input.tone.trim(),
          input.cta.trim(),
          JSON.stringify(input.bannedWords),
          input.isDefault ? 1 : 0,
          now,
          now
        );
      return this.get(id);
    });
    const persona = create();
    if (!persona) throw new Error("Failed to create persona");
    return persona;
  }

  update(id: string, patch: PersonaUpdate): Persona {
    const current = this.get(id);
    if (!current) throw new Error(`Persona not found: ${id}`);
    const next: PersonaInput = {
      name: patch.name ?? current.name,
      industry: patch.industry ?? current.industry,
      brandFacts: patch.brandFacts ?? current.brandFacts,
      tone: patch.tone ?? current.tone,
      cta: patch.cta ?? current.cta,
      bannedWords: patch.bannedWords ?? current.bannedWords,
      isDefault: patch.isDefault ?? current.isDefault
    };
    const update = this.database.transaction(() => {
      if (next.isDefault) this.clearDefault();
      this.database
        .prepare(
          `UPDATE personas SET
            name = ?, industry = ?, brand_facts_json = ?, tone = ?, cta = ?,
            banned_words_json = ?, is_default = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          next.name.trim(),
          next.industry.trim(),
          JSON.stringify(next.brandFacts),
          next.tone.trim(),
          next.cta.trim(),
          JSON.stringify(next.bannedWords),
          next.isDefault ? 1 : 0,
          new Date().toISOString(),
          id
        );
    });
    update();
    const persona = this.get(id);
    if (!persona) throw new Error("Failed to update persona");
    return persona;
  }

  duplicate(id: string): Persona {
    const source = this.get(id);
    if (!source) throw new Error(`Persona not found: ${id}`);
    return this.create({
      name: `${source.name} 副本`,
      industry: source.industry,
      brandFacts: source.brandFacts,
      tone: source.tone,
      cta: source.cta,
      bannedWords: source.bannedWords,
      isDefault: false
    });
  }

  delete(id: string): boolean {
    return this.database
      .prepare("DELETE FROM personas WHERE id = ?")
      .run(id).changes > 0;
  }

  private clearDefault(): void {
    this.database
      .prepare("UPDATE personas SET is_default = 0 WHERE is_default = 1")
      .run();
  }
}
