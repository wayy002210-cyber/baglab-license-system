import { createHash, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export type ContentLifecycleState =
  | "rejected"
  | "shown"
  | "selected"
  | "generated"
  | "collected"
  | "archived"
  | "published";

export type ContentIdentity = {
  audience: string;
  scenario: string;
  problem: string;
  thesis: string;
  evidenceType: string;
  angle: string;
  structureType: string;
  hookType: string;
  viewerGain: string;
  hotspotId: string | null;
};

export type HotspotSource = {
  id: string;
  title: string;
  sourceUrl: string;
  publishedAt: string;
  retrievedAt: string;
  summary: string;
  relevance: string;
};

export type ContentTopic = {
  id: string;
  displayTitle: string;
  shortTitle: string;
  description: string;
  hook: string;
  identity: ContentIdentity;
  hotspot: HotspotSource | null;
  semanticVector: number[] | null;
};

export type ContentHistoryDigest = {
  id: string;
  personaId: string;
  contentType: "topic" | "script";
  lifecycleState: ContentLifecycleState;
  projectId: string | null;
  displayTitle: string;
  shortTitle: string;
  description: string;
  hook: string;
  contentText: string;
  identity: ContentIdentity;
  structureType: string;
  hotspot: HotspotSource | null;
  normalizedHash: string;
  lexicalSignature: { normalized: string };
  semanticVector: number[] | null;
  createdAt: string;
  lastUsedAt: string;
};

type HistoryRow = {
  id: string;
  persona_id: string;
  content_type: "topic" | "script";
  lifecycle_state: ContentLifecycleState;
  project_id: string | null;
  display_title: string;
  short_title: string;
  description: string;
  hook: string;
  content_text: string;
  identity_json: string;
  structure_type: string;
  hotspot_json: string | null;
  normalized_hash: string;
  lexical_signature_json: string;
  semantic_vector_json: string | null;
  created_at: string;
  last_used_at: string;
};

const lifecycleRank: Record<ContentLifecycleState, number> = {
  rejected: 0,
  shown: 1,
  selected: 2,
  generated: 3,
  collected: 4,
  archived: 5,
  published: 6
};

function normalizeContent(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[零〇一二两三四五六七八九]/g, (character) => ({
      零: "0", 〇: "0", 一: "1", 二: "2", 两: "2", 三: "3", 四: "4",
      五: "5", 六: "6", 七: "7", 八: "8", 九: "9"
    }[character] ?? character))
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

function hashContent(value: string): string {
  return createHash("sha256").update(normalizeContent(value), "utf8").digest("hex");
}

function topicHash(topic: ContentTopic): string {
  return hashContent(`${topic.displayTitle}|${topic.description}|${topic.hook}`);
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function mapRow(row: HistoryRow): ContentHistoryDigest {
  return {
    id: row.id,
    personaId: row.persona_id,
    contentType: row.content_type,
    lifecycleState: row.lifecycle_state,
    projectId: row.project_id,
    displayTitle: row.display_title,
    shortTitle: row.short_title,
    description: row.description,
    hook: row.hook,
    contentText: row.content_text,
    identity: parseJson(row.identity_json, {} as ContentIdentity),
    structureType: row.structure_type,
    hotspot: parseJson<HotspotSource | null>(row.hotspot_json, null),
    normalizedHash: row.normalized_hash,
    lexicalSignature: parseJson(row.lexical_signature_json, { normalized: "" }),
    semanticVector: parseJson<number[] | null>(row.semantic_vector_json, null),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at
  };
}

export class ContentHistoryRepository {
  constructor(private readonly database: Database.Database) {}

  recordTopics(personaId: string, topics: ContentTopic[], now = new Date().toISOString()): ContentHistoryDigest[] {
    const transaction = this.database.transaction(() => {
      for (const topic of topics) this.upsert(personaId, "topic", "shown", topic, "", null, now);
    });
    transaction();
    return this.listDigest(personaId, Math.max(topics.length, 1)).filter((item) =>
      topics.some((topic) => item.normalizedHash === topicHash(topic))
    );
  }

  recordScript(
    personaId: string,
    topic: ContentTopic,
    text: string,
    projectId: string | null,
    now = new Date().toISOString()
  ): ContentHistoryDigest {
    return this.upsert(personaId, "script", "generated", topic, text, projectId, now);
  }

  markTopic(
    personaId: string,
    topic: ContentTopic,
    state: ContentLifecycleState,
    projectId?: string,
    now = new Date().toISOString()
  ): ContentHistoryDigest {
    return this.upsert(personaId, "topic", state, topic, "", projectId ?? null, now);
  }

  markScript(
    personaId: string,
    text: string,
    state: ContentLifecycleState,
    projectId?: string,
    now = new Date().toISOString()
  ): ContentHistoryDigest | null {
    const normalizedHash = hashContent(text);
    const current = this.database.prepare(
      `SELECT * FROM content_history
       WHERE persona_id = ? AND content_type = 'script' AND normalized_hash = ?`
    ).get(personaId, normalizedHash) as HistoryRow | undefined;
    if (!current) return null;
    const nextState = lifecycleRank[current.lifecycle_state] > lifecycleRank[state]
      ? current.lifecycle_state
      : state;
    this.database.prepare(`UPDATE content_history
      SET lifecycle_state = ?, project_id = COALESCE(?, project_id), last_used_at = ?
      WHERE id = ?`).run(nextState, projectId ?? null, now, current.id);
    const row = this.database.prepare("SELECT * FROM content_history WHERE id = ?")
      .get(current.id) as HistoryRow;
    return mapRow(row);
  }

  listDigest(personaId: string, limit: number): ContentHistoryDigest[] {
    const rows = this.database.prepare(
      `SELECT * FROM content_history WHERE persona_id = ?
       ORDER BY last_used_at DESC, id DESC LIMIT ?`
    ).all(personaId, limit) as HistoryRow[];
    return rows.map(mapRow);
  }

  listRecentConfirmedTopicTitles(personaId: string, limit = 100): string[] {
    const rows = this.database.prepare(`
      SELECT short_title, MAX(last_used_at) AS latest
      FROM content_history
      WHERE persona_id = ?
        AND content_type = 'topic'
        AND lifecycle_state IN ('selected', 'generated', 'collected', 'archived', 'published')
      GROUP BY short_title
      ORDER BY latest DESC, short_title DESC
      LIMIT ?
    `).all(personaId, Math.min(Math.max(limit, 0), 100)) as Array<{ short_title: string }>;
    return rows.map((row) => row.short_title).filter(Boolean);
  }

  listRecentConfirmedScriptHashes(personaId: string, limit = 100): string[] {
    const rows = this.database.prepare(`
      SELECT normalized_hash
      FROM content_history
      WHERE persona_id = ?
        AND content_type = 'script'
        AND lifecycle_state IN ('generated', 'collected', 'archived', 'published')
      ORDER BY last_used_at DESC, id DESC
      LIMIT ?
    `).all(personaId, Math.min(Math.max(limit, 0), 100)) as Array<{ normalized_hash: string }>;
    return rows.map((row) => row.normalized_hash).filter(Boolean);
  }

  listStrictSignatures(personaId: string): { topics: string[]; scripts: string[] } {
    const rows = this.database.prepare(`
      SELECT DISTINCT history.*
      FROM content_history history
      JOIN personas source ON source.id = history.persona_id
      JOIN personas target ON target.id = ?
      WHERE history.persona_id = ?
         OR (source.industry <> '' AND source.industry = target.industry)
    `).all(personaId, personaId) as HistoryRow[];
    const topics: string[] = [];
    const scripts: string[] = [];
    for (const row of rows) {
      if (row.content_type === "topic") {
        topics.push(normalizeContent(`${row.display_title}|${row.description}|${row.hook}`));
      } else if (row.content_text) {
        scripts.push(normalizeContent(row.content_text));
      }
    }
    return { topics: [...new Set(topics)], scripts: [...new Set(scripts)] };
  }

  setSemanticVector(id: string, vector: number[]): void {
    this.database.prepare(
      "UPDATE content_history SET semantic_vector_json = ? WHERE id = ?"
    ).run(JSON.stringify(vector), id);
  }

  private upsert(
    personaId: string,
    contentType: "topic" | "script",
    state: ContentLifecycleState,
    topic: ContentTopic,
    text: string,
    projectId: string | null,
    now: string
  ): ContentHistoryDigest {
    const normalizedHash = contentType === "topic" ? topicHash(topic) : hashContent(text);
    const current = this.database.prepare(
      `SELECT * FROM content_history
       WHERE persona_id = ? AND content_type = ? AND normalized_hash = ?`
    ).get(personaId, contentType, normalizedHash) as HistoryRow | undefined;
    const nextState = current && lifecycleRank[current.lifecycle_state] > lifecycleRank[state]
      ? current.lifecycle_state
      : state;
    const nextProjectId = projectId ?? current?.project_id ?? null;
    const id = current?.id ?? randomUUID();
    const normalized = normalizeContent(contentType === "topic"
      ? `${topic.displayTitle}|${topic.description}|${topic.hook}`
      : text);
    this.database.prepare(`
      INSERT INTO content_history(
        id, persona_id, content_type, lifecycle_state, project_id,
        display_title, short_title, description, hook, content_text,
        identity_json, structure_type, hotspot_json, normalized_hash,
        lexical_signature_json, semantic_vector_json, created_at, last_used_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(persona_id, content_type, normalized_hash) DO UPDATE SET
        lifecycle_state=excluded.lifecycle_state,
        project_id=excluded.project_id,
        display_title=excluded.display_title,
        short_title=excluded.short_title,
        description=excluded.description,
        hook=excluded.hook,
        content_text=excluded.content_text,
        identity_json=excluded.identity_json,
        structure_type=excluded.structure_type,
        hotspot_json=excluded.hotspot_json,
        lexical_signature_json=excluded.lexical_signature_json,
        semantic_vector_json=COALESCE(excluded.semantic_vector_json, content_history.semantic_vector_json),
        last_used_at=excluded.last_used_at
    `).run(
      id, personaId, contentType, nextState, nextProjectId,
      topic.displayTitle, topic.shortTitle, topic.description, topic.hook, text,
      JSON.stringify(topic.identity), topic.identity.structureType,
      topic.hotspot ? JSON.stringify(topic.hotspot) : null,
      normalizedHash, JSON.stringify({ normalized }),
      topic.semanticVector ? JSON.stringify(topic.semanticVector) : null,
      current?.created_at ?? now, now
    );
    const row = this.database.prepare("SELECT * FROM content_history WHERE id = ?").get(id) as HistoryRow;
    return mapRow(row);
  }
}
