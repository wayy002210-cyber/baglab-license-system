import type Database from "better-sqlite3";
import type { TextStyle } from "../../src/shared/media-style.js";

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
  modelRecommendations: BailianModelRecommendation[];
  modelsCheckedAt: string | null;
};

export type BailianModelRecommendation = {
  id: string;
  displayName: string;
  family: "deepseek" | "qwen" | "other";
  status: "available";
  note: string;
};

export type StylePreset = {
  id: string;
  name: string;
  subtitleStyle: TextStyle;
  titleStyle: TextStyle;
};
export type VoiceSettings = {
  voiceId: string;
  source: "system" | "custom" | "clone";
  model: string;
  emotion: string | null;
  speed: number;
  volume: number;
  pitch: number;
  languageBoost: string | null;
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
  defaultModel: "deepseek-v4.1-flash",
  temperature: 0.7,
  candidateModels: ["deepseek-v4.1-flash", "qwen-plus"],
  modelRecommendations: [],
  modelsCheckedAt: null
};
export const defaultVoiceSettings: VoiceSettings = {
  voiceId: "male-qn-qingse",
  source: "system",
  model: "speech-2.8-hd",
  emotion: "calm",
  speed: 1,
  volume: 1,
  pitch: 0,
  languageBoost: "Chinese"
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
    const stored = this.get<Partial<CopyModelSettings> | null>("copy-model", null);
    if (!stored) return structuredClone(defaultCopyModelSettings);
    const normalized = normalizeCopyModelSettings(stored);
    if (JSON.stringify(stored) !== JSON.stringify(normalized)) {
      this.set("copy-model", normalized);
    }
    return normalized;
  }

  saveCopyModelSettings(settings: CopyModelSettings): CopyModelSettings {
    const normalized = normalizeCopyModelSettings(settings);
    const models = [...new Set(normalized.candidateModels.map((model) => model.trim()))]
      .filter(Boolean);
    if (!normalized.defaultModel) {
      throw new Error("Default copywriting model is required");
    }
    if (!models.includes(normalized.defaultModel)) {
      throw new Error("Default model must be included in candidate models");
    }
    if (normalized.modelRecommendations.length > 5) {
      throw new RangeError("No more than five verified models may be stored");
    }
    if (
      normalized.modelsCheckedAt &&
      !normalized.modelRecommendations.some((item) => item.id === normalized.defaultModel)
    ) {
      throw new Error("Default model must be a verified available model");
    }
    if (
      !Number.isFinite(normalized.temperature) ||
      normalized.temperature < 0 ||
      normalized.temperature > 2
    ) {
      throw new RangeError("Temperature must be between 0 and 2");
    }
    return this.set("copy-model", {
      ...normalized,
      candidateModels: models
    });
  }

  getStylePresets(): StylePreset[] {
    return this.get("text-style-presets", []);
  }

  saveStylePresets(presets: StylePreset[]): StylePreset[] {
    return this.set("text-style-presets", structuredClone(presets));
  }

  getStylePresetSelection(): string {
    return this.get("text-style-preset-selection", "__random__");
  }

  saveStylePresetSelection(id: string): string {
    if (!id.trim()) throw new Error("Style preset selection is required");
    return this.set("text-style-preset-selection", id.trim());
  }

  getVoiceSettings(): VoiceSettings {
    return this.get("voice-settings", defaultVoiceSettings);
  }

  saveVoiceSettings(settings: VoiceSettings): VoiceSettings {
    if (!settings.voiceId.trim()) throw new Error("必须选择配音音色");
    if (settings.speed < 0.5 || settings.speed > 2) throw new RangeError("语速必须在 0.5 至 2.0 之间");
    if (settings.volume < 0 || settings.volume > 3) throw new RangeError("人声音量必须在 0 至 3 之间");
    if (!Number.isInteger(settings.pitch) || settings.pitch < -12 || settings.pitch > 12) throw new RangeError("音调必须在 -12 至 12 之间");
    return this.set("voice-settings", structuredClone(settings));
  }
}

function migrateModelId(model: string): string {
  return model.trim() === "deepseek-v3" ? "deepseek-v4.1-flash" : model.trim();
}

function normalizeCopyModelSettings(
  settings: Partial<CopyModelSettings>
): CopyModelSettings {
  const defaultModel = migrateModelId(
    typeof settings.defaultModel === "string"
      ? settings.defaultModel
      : defaultCopyModelSettings.defaultModel
  );
  const rawCandidates = Array.isArray(settings.candidateModels)
    ? settings.candidateModels
    : defaultCopyModelSettings.candidateModels;
  const candidateModels = [...new Set(
    rawCandidates
      .filter((model): model is string => typeof model === "string")
      .map(migrateModelId)
      .filter(Boolean)
  )];
  if (!candidateModels.includes(defaultModel)) candidateModels.unshift(defaultModel);
  const modelRecommendations = Array.isArray(settings.modelRecommendations)
    ? settings.modelRecommendations
      .filter((item): item is BailianModelRecommendation => Boolean(
        item &&
        typeof item.id === "string" &&
        typeof item.displayName === "string" &&
        ["deepseek", "qwen", "other"].includes(item.family) &&
        item.status === "available" &&
        typeof item.note === "string"
      ))
      .map((item) => ({ ...item, id: migrateModelId(item.id) }))
    : [];
  return {
    defaultModel,
    temperature: typeof settings.temperature === "number"
      ? settings.temperature
      : defaultCopyModelSettings.temperature,
    candidateModels,
    modelRecommendations,
    modelsCheckedAt: typeof settings.modelsCheckedAt === "string"
      ? settings.modelsCheckedAt
      : null
  };
}
