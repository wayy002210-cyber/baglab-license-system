import type Database from "better-sqlite3";

export type MediaSettings = {
  outputDirectory: string;
  workDirectory: string;
  encoder: "auto" | "h264_nvenc" | "h264_qsv" | "h264_amf" | "libx264";
  videoBitrateMbps: number;
  fontFamily: string;
  bgmPath: string | null;
  bgmVolume: number;
};

export type CopyModelSettings = {
  defaultModel: string;
  temperature: number;
  candidateModels: string[];
};

export const defaultMediaSettings: MediaSettings = {
  outputDirectory: "",
  workDirectory: "",
  encoder: "auto",
  videoBitrateMbps: 8,
  fontFamily: "Microsoft YaHei",
  bgmPath: null,
  bgmVolume: 0.16
};

export const defaultCopyModelSettings: CopyModelSettings = {
  defaultModel: "deepseek-v3",
  temperature: 0.7,
  candidateModels: ["deepseek-v3", "qwen-plus"]
};

export class SettingsRepository {
  constructor(private readonly database: Database.Database) {}

  get<T>(key: string, fallback: T): T {
    const row = this.database
      .prepare("SELECT value_json FROM app_settings WHERE key = ?")
      .get(key) as { value_json: string } | undefined;
    return row ? (JSON.parse(row.value_json) as T) : fallback;
  }

  set<T>(key: string, value: T): T {
    if (/(api.?key|authorization|cookie|password|secret|token)/i.test(key)) {
      throw new Error(`Sensitive setting is not allowed: ${key}`);
    }
    const now = new Date().toISOString();
    this.database
      .prepare(
        `INSERT INTO app_settings(key, value_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at`
      )
      .run(key, JSON.stringify(value), now);
    return value;
  }

  getMediaSettings(): MediaSettings {
    return this.get("media", defaultMediaSettings);
  }

  saveMediaSettings(settings: MediaSettings): MediaSettings {
    if (
      !Number.isFinite(settings.videoBitrateMbps) ||
      settings.videoBitrateMbps < 1 ||
      settings.videoBitrateMbps > 50
    ) {
      throw new RangeError("Video bitrate must be between 1 and 50 Mbps");
    }
    if (
      !Number.isFinite(settings.bgmVolume) ||
      settings.bgmVolume < 0 ||
      settings.bgmVolume > 1
    ) {
      throw new RangeError("BGM volume must be between 0 and 1");
    }
    return this.set("media", { ...settings });
  }

  getCopyModelSettings(): CopyModelSettings {
    return this.get("copy-model", defaultCopyModelSettings);
  }

  saveCopyModelSettings(settings: CopyModelSettings): CopyModelSettings {
    const models = [...new Set(settings.candidateModels.map((model) => model.trim()))]
      .filter(Boolean);
    if (!settings.defaultModel.trim()) {
      throw new Error("Default copywriting model is required");
    }
    if (!models.includes(settings.defaultModel.trim())) {
      throw new Error("Default model must be included in candidate models");
    }
    if (
      !Number.isFinite(settings.temperature) ||
      settings.temperature < 0 ||
      settings.temperature > 2
    ) {
      throw new RangeError("Temperature must be between 0 and 2");
    }
    return this.set("copy-model", {
      defaultModel: settings.defaultModel.trim(),
      temperature: settings.temperature,
      candidateModels: models
    });
  }
}
