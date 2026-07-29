import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { applyMigrations } from "../../electron/database";
import { PersonaRepository } from "../../electron/repositories/persona-repository";

describe("PersonaRepository", () => {
  it("persists and updates a persona without losing structured fields", () => {
    const database = new Database(":memory:");
    applyMigrations(database);
    const repository = new PersonaRepository(database);

    const created = repository.create({
      name: "袋研官",
      industry: "广告物料",
      brandFacts: ["自有工厂", "十年经验"],
      tone: "专业直接",
      cta: "关注我",
      bannedWords: ["全网最低"],
      isDefault: true
    });
    repository.update(created.id, { tone: "真实克制" });

    expect(repository.get(created.id)).toMatchObject({
      name: "袋研官",
      brandFacts: ["自有工厂", "十年经验"],
      tone: "真实克制",
      isDefault: true
    });
  });

  it("keeps only one default persona", () => {
    const database = new Database(":memory:");
    applyMigrations(database);
    const repository = new PersonaRepository(database);

    const first = repository.create({
      name: "档案一",
      industry: "",
      brandFacts: [],
      tone: "",
      cta: "",
      bannedWords: [],
      isDefault: true
    });
    const second = repository.create({
      name: "档案二",
      industry: "",
      brandFacts: [],
      tone: "",
      cta: "",
      bannedWords: [],
      isDefault: true
    });

    expect(repository.get(first.id)?.isDefault).toBe(false);
    expect(repository.get(second.id)?.isDefault).toBe(true);
  });
});
