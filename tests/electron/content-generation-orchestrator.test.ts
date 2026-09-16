import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { applyMigrations } from "../../electron/database";
import {
  ContentGenerationOrchestrator,
  type ContentGenerationBackend
} from "../../electron/services/content-generation-orchestrator";
import {
  ContentHistoryRepository,
  type ContentTopic
} from "../../electron/repositories/content-history-repository";

function topic(id: string): ContentTopic {
  return {
    id,
    displayTitle: `不同场景下定制袋的判断方法${id}`,
    shortTitle: "定制判断方法",
    description: "面向品牌采购，在活动礼赠场景讲清材料选择与验收方法",
    hook: "同一个袋子，为什么换个场景就要重新判断？",
    identity: {
      audience: "品牌采购", scenario: `活动场景${id}`, problem: `材料判断${id}`,
      thesis: `材料必须匹配场景${id}`, evidenceType: `样品测试${id}`,
      angle: `采购决策${id}`, structureType: `现场演示${id}`, hookType: `场景冲突${id}`,
      viewerGain: `掌握验收方法${id}`, hotspotId: null
    },
    hotspot: null,
    semanticVector: null
  };
}

function setup(): { database: Database.Database; history: ContentHistoryRepository } {
  const database = new Database(":memory:");
  applyMigrations(database);
  database.prepare(`INSERT INTO personas(id, name, industry, brand_facts_json, tone, cta,
    banned_words_json, is_default, created_at, updated_at) VALUES
    ('p1', '袋研官', '帆布袋', '[]', '', '', '[]', 1, '', '')`).run();
  return { database, history: new ContentHistoryRepository(database) };
}

describe("ContentGenerationOrchestrator", () => {
  it("injects persona history and atomically records every returned topic", async () => {
    const { database, history } = setup();
    history.recordTopics("p1", [topic("old")], "2026-09-15T00:00:00.000Z");
    let receivedHistory = 0;
    const backend: ContentGenerationBackend = {
      generateTopics: async (payload) => {
        receivedHistory = payload.history.length;
        return {
          topics: ["a", "b", "c", "d", "e"].map(topic),
          historyChecked: payload.history.length,
          hotspotStatus: "disabled"
        };
      },
      generateCopywriting: async () => { throw new Error("not called"); }
    };
    const orchestrator = new ContentGenerationOrchestrator(history, backend);

    const result = await orchestrator.generateTopics({
      personaId: "p1", model: "deepseek-v3", personaName: "袋研官"
    });

    expect(receivedHistory).toBe(1);
    expect(result.topics).toHaveLength(5);
    expect(history.listDigest("p1", 500)).toHaveLength(6);
    database.close();
  });

  it("marks the selected topic and records an accepted script", async () => {
    const { database, history } = setup();
    const selected = topic("selected");
    history.recordTopics("p1", [selected], "2026-09-15T00:00:00.000Z");
    const backend: ContentGenerationBackend = {
      generateTopics: async () => { throw new Error("not called"); },
      generateCopywriting: async (payload) => {
        expect(payload.history.some((item) => item.lifecycleState === "selected")).toBe(true);
        return {
          text: "这是一条通过去重检查并可以保存的完整口播文案。",
          structureType: "实验验证",
          hookType: "现场动作",
          argumentBeats: ["准备样品", "执行测试", "比较结果"],
          semanticVector: [0.1, 0.9]
        };
      }
    };
    const orchestrator = new ContentGenerationOrchestrator(history, backend);

    await orchestrator.generateCopywriting({
      personaId: "p1", model: "deepseek-v3", personaName: "袋研官",
      topic: selected, minLength: 50, maxLength: 1000
    });

    const rows = history.listDigest("p1", 500);
    expect(rows.some((item) => item.contentType === "script" && item.structureType === "实验验证")).toBe(true);
    expect(rows.find((item) => item.contentType === "topic")?.lifecycleState).toBe("selected");
    database.close();
  });
});
