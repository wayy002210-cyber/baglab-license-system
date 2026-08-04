import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { applyMigrations } from "../../electron/database";
import {
  SettingsRepository,
  defaultCopyModelSettings,
  defaultMediaSettings,
  defaultVoiceSettings
} from "../../electron/repositories/settings-repository";
import {
  defaultSubtitleStyle,
  defaultTitleStyle
} from "../../src/shared/media-style";

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

  it("persists reusable subtitle and title style presets", () => {
    const database = new Database(":memory:");
    applyMigrations(database);
    const repository = new SettingsRepository(database);
    const preset = {
      id: "brand-yellow",
      name: "品牌黄",
      subtitleStyle: defaultSubtitleStyle,
      titleStyle: defaultTitleStyle
    };

    repository.saveStylePresets([preset]);
    expect(new SettingsRepository(database).getStylePresets()).toEqual([preset]);
    expect(repository.getStylePresetSelection()).toBe("__random__");
    expect(repository.saveStylePresetSelection(preset.id)).toBe(preset.id);
    expect(new SettingsRepository(database).getStylePresetSelection()).toBe(preset.id);
    database.close();
  });

  it("persists global voice settings without generated audio", () => {
    const database = new Database(":memory:");
    applyMigrations(database);
    const repository = new SettingsRepository(database);
    expect(repository.getVoiceSettings()).toEqual(defaultVoiceSettings);

    const saved = repository.saveVoiceSettings({
      voiceId: "baglab-clone", source: "clone", model: "speech-2.8-hd",
      emotion: "calm", speed: 1.2, volume: 1.4, pitch: 2, languageBoost: "Chinese"
    });

    expect(new SettingsRepository(database).getVoiceSettings()).toEqual(saved);
    expect(Object.keys(saved)).not.toContain("audioPath");
    database.close();
  });
});
