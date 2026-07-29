import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { applyMigrations } from "../../electron/database";
import { CreationDraftRepository } from "../../electron/repositories/creation-draft-repository";

describe("CreationDraftRepository", () => {
  it("persists and restores one versioned creation draft", () => {
    const database = new Database(":memory:");
    applyMigrations(database);
    const repository = new CreationDraftRepository(database);

    repository.save({
      version: 1,
      stage: "copywriting",
      personaId: "persona-1",
      copywriting: {
        model: "deepseek-v3",
        temperature: 0.7,
        topics: [],
        selectedTopicId: null,
        text: "测试文案",
        complianceIssues: []
      },
      voice: null,
      audioSegments: [],
      shots: [],
      bgm: null,
      titleStyle: null,
      subtitleStyle: null
    });

    expect(repository.get()?.copywriting?.text).toBe("测试文案");
    const restored = new CreationDraftRepository(database).get();
    expect(restored).not.toBeNull();
    expect(restored?.stage).toBe("copywriting");
    database.close();
  });

  it("duplicates and clears the active draft without sharing object state", () => {
    const database = new Database(":memory:");
    applyMigrations(database);
    const repository = new CreationDraftRepository(database);
    const draft = repository.save({
      version: 1,
      stage: "persona",
      personaId: null,
      copywriting: null,
      voice: null,
      audioSegments: [],
      shots: [],
      bgm: null,
      titleStyle: null,
      subtitleStyle: null
    });

    const duplicate = repository.duplicate();
    expect(duplicate).toEqual(draft);
    expect(duplicate).not.toBe(draft);

    repository.clear();
    expect(repository.get()).toBeNull();
    database.close();
  });

  it("rejects secret-bearing fields before writing JSON", () => {
    const database = new Database(":memory:");
    applyMigrations(database);
    const repository = new CreationDraftRepository(database);

    expect(() =>
      repository.save({
        version: 1,
        stage: "persona",
        personaId: null,
        copywriting: null,
        voice: null,
        audioSegments: [],
        shots: [],
        bgm: null,
        titleStyle: null,
        subtitleStyle: null,
        apiKey: "must-not-persist"
      } as never)
    ).toThrow();
    database.close();
  });
});
