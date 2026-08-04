import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { applyMigrations } from "../../electron/database";
import { CopywritingProjectRepository } from "../../electron/repositories/copywriting-project-repository";

describe("CopywritingProjectRepository", () => {
  function databaseWithPersona(): Database.Database {
    const database = new Database(":memory:");
    applyMigrations(database);
    database.prepare(`INSERT INTO personas(id, name, industry, brand_facts_json, tone, cta,
      banned_words_json, is_default, created_at, updated_at) VALUES
      ('p1', '测试人设', '', '[]', '', '', '[]', 1, '', '')`).run();
    return database;
  }

  it("keeps generated projects independent and collects one into the library", () => {
    const database = databaseWithPersona();
    const repository = new CopywritingProjectRepository(database);
    const first = repository.create({ personaId: "p1", topicId: "t1", topicTitle: "选题一", mainTitle: "工厂避坑指南", text: "第一条完整口播文案。", model: "deepseek-v3", status: "review" });
    repository.create({ personaId: "p1", topicId: "t2", topicTitle: "选题二", mainTitle: "定制省钱方法", text: "第二条完整口播文案。", model: "deepseek-v3", status: "review" });

    repository.collect(first.id);

    expect(repository.list(["library"]).map((item) => item.topicTitle)).toEqual(["选题一"]);
    expect(repository.list(["review"]).map((item) => item.topicTitle)).toEqual(["选题二"]);
    database.close();
  });

  it("persists ordered shots and marks a project ready", () => {
    const database = databaseWithPersona();
    const repository = new CopywritingProjectRepository(database);
    const project = repository.create({ personaId: "p1", topicId: null, topicTitle: "自定义", mainTitle: "工厂真实成本", text: "质量决定复购。生产决定交期。", model: "deepseek-v3", status: "library" });

    repository.replaceShots(project.id, [
      { copywriting: "质量决定复购。", suggestedCategoryId: "quality", assetCategoryId: "quality", suggestionSource: "ai", suggestionConfirmed: false, durationMode: "voice", durationSec: null, muteOriginal: true },
      { copywriting: "生产决定交期。", suggestedCategoryId: "production", assetCategoryId: "production", suggestionSource: "keyword", suggestionConfirmed: false, durationMode: "voice", durationSec: null, muteOriginal: true }
    ]);

    expect(repository.require(project.id).status).toBe("shots_ready");
    expect(repository.listShots(project.id).map((shot) => shot.copywriting)).toEqual(["质量决定复购。", "生产决定交期。"]);
    database.close();
  });

  it("keeps only the newest thirty archived projects", () => {
    const database = databaseWithPersona();
    const repository = new CopywritingProjectRepository(database);
    for (let index = 0; index < 31; index += 1) {
      const project = repository.create({ personaId: "p1", topicId: null, topicTitle: `选题${index}`, mainTitle: "批量内容归档", text: `第${index}条文案`, model: "deepseek-v3", status: "library" });
      repository.archive(project.id, new Date(2026, 0, 1, 0, 0, index).toISOString());
    }

    const archived = repository.list(["archived"]);
    expect(archived).toHaveLength(30);
    expect(archived.some((item) => item.topicTitle === "选题0")).toBe(false);
    database.close();
  });

  it("clones an archived project without mutating its history", () => {
    const database = databaseWithPersona();
    const repository = new CopywritingProjectRepository(database);
    const original = repository.create({ personaId: "p1", topicId: "t1", topicTitle: "低价竞争", mainTitle: "同行低价真相", text: "原始口播文案", model: "deepseek-v3", status: "library" });
    repository.archive(original.id);
    const clone = repository.cloneArchived(original.id);
    expect(clone.id).not.toBe(original.id);
    expect(clone.status).toBe("library");
    expect(clone.sourceProjectId).toBe(original.id);
    expect(repository.require(original.id).status).toBe("archived");
    database.close();
  });
});
