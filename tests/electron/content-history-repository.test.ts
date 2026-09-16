import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { applyMigrations } from "../../electron/database";
import {
  ContentHistoryRepository,
  type ContentTopic
} from "../../electron/repositories/content-history-repository";

const NOW = "2026-09-16T00:00:00.000Z";

function topic(): ContentTopic {
  return {
    id: "topic-a",
    displayTitle: "预算有限时袋子哪里不能省",
    shortTitle: "预算先保哪里",
    description: "从使用场景解释有限预算应优先保留哪些耐用结构",
    hook: "预算有限，最先砍掉的真不该是这里。",
    identity: {
      audience: "品牌采购",
      scenario: "活动礼赠",
      problem: "有限预算如何取舍",
      thesis: "先保留承重结构再调整装饰工艺",
      evidenceType: "工艺对比",
      angle: "预算分配",
      structureType: "正反对比",
      hookType: "反常识",
      viewerGain: "得到可执行的预算顺序",
      hotspotId: null
    },
    hotspot: null,
    semanticVector: [0.25, 0.75]
  };
}

function databaseWithPersona(): Database.Database {
  const database = new Database(":memory:");
  applyMigrations(database);
  database.prepare(`INSERT INTO personas(id, name, industry, brand_facts_json, tone, cta,
    banned_words_json, is_default, created_at, updated_at) VALUES
    ('p1', '测试人设', '帆布袋', '[]', '', '', '[]', 1, '', '')`).run();
  return database;
}

describe("ContentHistoryRepository", () => {
  it("records every shown topic and keeps it after project deletion", () => {
    const database = databaseWithPersona();
    const history = new ContentHistoryRepository(database);
    history.recordTopics("p1", [topic()], NOW);

    expect(history.listDigest("p1", 500)).toMatchObject([
      {
        contentType: "topic",
        lifecycleState: "shown",
        displayTitle: "预算有限时袋子哪里不能省",
        semanticVector: [0.25, 0.75]
      }
    ]);

    database.prepare("DELETE FROM copywriting_projects").run();
    expect(history.listDigest("p1", 500)).toHaveLength(1);
    database.close();
  });

  it("upserts the same normalized topic without duplicating history", () => {
    const database = databaseWithPersona();
    const history = new ContentHistoryRepository(database);
    history.recordTopics("p1", [topic()], NOW);
    history.recordTopics("p1", [{ ...topic(), displayTitle: "预算有限时，袋子哪里不能省？" }], "2026-09-16T01:00:00.000Z");

    const rows = history.listDigest("p1", 500);
    expect(rows).toHaveLength(1);
    expect(rows[0].lastUsedAt).toBe("2026-09-16T01:00:00.000Z");
    database.close();
  });

  it("advances lifecycle state and never downgrades it", () => {
    const database = databaseWithPersona();
    const history = new ContentHistoryRepository(database);
    history.recordTopics("p1", [topic()], NOW);
    history.markTopic("p1", topic(), "selected", "project-1", "2026-09-16T01:00:00.000Z");
    history.markTopic("p1", topic(), "shown", undefined, "2026-09-16T02:00:00.000Z");

    expect(history.listDigest("p1", 500)[0]).toMatchObject({
      lifecycleState: "selected",
      projectId: "project-1",
      lastUsedAt: "2026-09-16T02:00:00.000Z"
    });
    database.close();
  });

  it("records scripts independently from their project lifetime", () => {
    const database = databaseWithPersona();
    const history = new ContentHistoryRepository(database);
    history.recordScript("p1", topic(), "这是已经生成并保存的完整口播文案。", "project-1", NOW);

    const row = history.listDigest("p1", 500)[0];
    expect(row).toMatchObject({
      contentType: "script",
      lifecycleState: "generated",
      projectId: "project-1",
      contentText: "这是已经生成并保存的完整口播文案。"
    });
    database.close();
  });

  it("attaches a generated script to its project and advances it to collected", () => {
    const database = databaseWithPersona();
    const history = new ContentHistoryRepository(database);
    const text = "这是已经生成并保存的完整口播文案。";
    history.recordScript("p1", topic(), text, null, NOW);

    history.markScript("p1", text, "collected", "project-2", "2026-09-16T03:00:00.000Z");

    expect(history.listDigest("p1", 500)[0]).toMatchObject({
      contentType: "script",
      lifecycleState: "collected",
      projectId: "project-2",
      lastUsedAt: "2026-09-16T03:00:00.000Z"
    });
    database.close();
  });

  it("keeps permanent exact signatures beyond the recent fuzzy window and across the same industry", () => {
    const database = databaseWithPersona();
    database.prepare(`INSERT INTO personas(id, name, industry, brand_facts_json, tone, cta,
      banned_words_json, is_default, created_at, updated_at) VALUES
      ('p2', '同行人设', '帆布袋', '[]', '', '', '[]', 0, '', '')`).run();
    const history = new ContentHistoryRepository(database);
    for (let index = 0; index < 501; index += 1) {
      const marker = String.fromCodePoint(0x5200 + index);
      history.recordTopics("p1", [{
        ...topic(), id: `topic-${index}`, displayTitle: marker.repeat(10),
        description: marker.repeat(20), hook: marker.repeat(6)
      }], new Date(2026, 0, 1, 0, 0, index).toISOString());
    }

    const signatures = history.listStrictSignatures("p2");

    expect(signatures.topics).toHaveLength(501);
    expect(signatures.topics).toContain("刀".repeat(36));
    database.close();
  });
});
