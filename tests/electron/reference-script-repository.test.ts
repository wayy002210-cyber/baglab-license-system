import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { applyMigrations } from "../../electron/database";
import { ReferenceScriptRepository } from "../../electron/repositories/reference-script-repository";

describe("ReferenceScriptRepository", () => {
  it("creates, lists and deletes local reference scripts", () => {
    const database = new Database(":memory:");
    applyMigrations(database);
    const repository = new ReferenceScriptRepository(database);

    const created = repository.create({
      title: "工厂获客脚本",
      industry: "工厂",
      tags: ["获客", "成本"],
      content: "为什么你的宣传片没人看？先讲客户损失，再给解决方案。",
      structure: {
        hook: "反问",
        narrative: "问题-损失-方案",
        cta: "关注"
      }
    });

    expect(repository.list()).toEqual([
      expect.objectContaining({ id: created.id, tags: ["获客", "成本"] })
    ]);
    expect(repository.delete(created.id)).toBe(true);
    expect(repository.list()).toEqual([]);
    database.close();
  });

  it("returns the most relevant scripts within the requested limit", () => {
    const database = new Database(":memory:");
    applyMigrations(database);
    const repository = new ReferenceScriptRepository(database);
    repository.create({
      title: "工厂获客脚本",
      industry: "工厂",
      tags: ["获客"],
      content: "工厂如何降低获客成本",
      structure: { hook: "结果前置", narrative: "问题-方案", cta: "咨询" }
    });
    repository.create({
      title: "门店服务脚本",
      industry: "门店",
      tags: ["服务"],
      content: "门店如何提升服务体验",
      structure: { hook: "场景", narrative: "案例", cta: "到店" }
    });

    const result = repository.search({
      industry: "工厂",
      query: "获客 成本",
      limit: 1
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("工厂获客脚本");
    database.close();
  });

  it("updates an existing script for preview editing", () => {
    const database = new Database(":memory:");
    applyMigrations(database);
    const repository = new ReferenceScriptRepository(database);
    const created = repository.create({
      title: "旧标题",
      industry: "工厂",
      tags: ["旧标签"],
      content: "旧内容",
      structure: { hook: "", narrative: "", cta: "" }
    });

    const updated = repository.update(created.id, {
      title: "新标题",
      industry: "门店",
      tags: ["获客"],
      content: "新的完整脚本内容",
      structure: { hook: "反问", narrative: "问题-方案", cta: "咨询" }
    });

    expect(updated).toMatchObject({
      id: created.id,
      title: "新标题",
      content: "新的完整脚本内容"
    });
    database.close();
  });
});
