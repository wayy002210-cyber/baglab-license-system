import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { applyMigrations } from "../../electron/database";
import {
  SettingsRepository,
  defaultCopyModelSettings,
  defaultMediaSettings
} from "../../electron/repositories/settings-repository";

describe("SettingsRepository", () => {
  it("returns defaults and persists validated media settings", () => {
    const database = new Database(":memory:");
    applyMigrations(database);
    const repository = new SettingsRepository(database);

    expect(repository.getMediaSettings()).toEqual(defaultMediaSettings);
    const saved = repository.saveMediaSettings({
      ...defaultMediaSettings,
      outputDirectory: "D:/成片",
      videoBitrateMbps: 10,
      encoder: "libx264"
    });

    expect(saved.outputDirectory).toBe("D:/成片");
    expect(new SettingsRepository(database).getMediaSettings()).toEqual(saved);
    database.close();
  });

  it("rejects secrets and invalid bitrate values", () => {
    const database = new Database(":memory:");
    applyMigrations(database);
    const repository = new SettingsRepository(database);
    expect(() => repository.set("apiKey", "secret")).toThrow(/sensitive/i);
    expect(() =>
      repository.saveMediaSettings({
        ...defaultMediaSettings,
        videoBitrateMbps: 0
      })
    ).toThrow();
    database.close();
  });

  it("persists a default copywriting model and candidate models", () => {
    const database = new Database(":memory:");
    applyMigrations(database);
    const repository = new SettingsRepository(database);

    expect(repository.getCopyModelSettings()).toEqual(defaultCopyModelSettings);
    const saved = repository.saveCopyModelSettings({
      defaultModel: "deepseek-v3",
      temperature: 0.8,
      candidateModels: ["deepseek-v3", "qwen-plus"]
    });

    expect(repository.getCopyModelSettings()).toEqual(saved);
    expect(() =>
      repository.saveCopyModelSettings({
        ...saved,
        temperature: 2.1
      })
    ).toThrow();
    database.close();
  });
});
