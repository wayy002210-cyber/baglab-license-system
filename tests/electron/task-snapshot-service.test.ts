import { describe, expect, it } from "vitest";
import { buildDraftTaskSnapshot } from "../../electron/services/task-snapshot-service";

describe("buildDraftTaskSnapshot", () => {
  it("creates an immutable secret-free snapshot from a ready draft", () => {
    const draft = {
      version: 1 as const, stage: "ready" as const, personaId: "p1",
      copywriting: { model: "deepseek-v3", temperature: 0.7, topics: [], selectedTopicId: null, text: "口播", complianceIssues: [] },
      voice: { voiceId: "voice", source: "system" as const, emotion: "calm", speed: 1, volume: 1, pitch: 0, languageBoost: "Chinese" },
      audioSegments: [
        { id: "a1", index: 0, text: "口播一", sourceStart: 0, sourceEnd: 3, textHash: "x", parameterHash: "y", audioPath: "D:/a.mp3", durationSec: 2, status: "ready" as const, errorMessage: null },
        { id: "a2", index: 1, text: "口播二", sourceStart: 4, sourceEnd: 7, textHash: "z", parameterHash: "y", audioPath: "D:/b.mp3", durationSec: 3, status: "ready" as const, errorMessage: null }
      ],
      shots: [
        { id: "s1", index: 0, audioSegmentId: "a1", copywriting: "口播一", assetCategoryId: "c1", durationMode: "voice" as const, durationSec: 2, muteOriginal: true },
        { id: "s2", index: 1, audioSegmentId: "a2", copywriting: "口播二", assetCategoryId: "c1", durationMode: "voice" as const, durationSec: 3, muteOriginal: true }
      ],
      bgm: { sourceType: "file" as const, path: "D:/music.flac", mode: "fixed" as const, volume: .2, fadeInSec: 1, fadeOutSec: 1 },
      titleStyle: null, subtitleStyle: null
    };
    const snapshot = buildDraftTaskSnapshot({
      draft,
      persona: { id: "p1", name: "袋研官", industry: "箱包", brandFacts: [], tone: "", cta: "", bannedWords: [], isDefault: true, createdAt: "", updatedAt: "" },
      assets: [{ id: "asset", categoryId: "c1", fileName: "a.mp4", filePath: "D:/a.mp4", durationSec: 5, width: 1080, height: 1920, fps: 30, codec: "h264", rotation: 0, fileSize: 1, fingerprint: "f", thumbnailPath: null, status: "ready", errorMessage: null }],
      media: { outputDirectory: "D:/out", workDirectory: "D:/work", encoder: "auto", videoBitrateMbps: 8, fontFamily: "Microsoft YaHei", bgmPath: null, bgmVolume: .16 }
    });
    expect(snapshot.approved).toBe(true);
    expect(snapshot.bgmPath).toBe("D:/music.flac");
    expect(JSON.stringify(snapshot)).not.toMatch(/apiKey|token|cookie/i);
    draft.shots[0].copywriting = "已修改";
    expect((snapshot.shots as Array<{copywriting:string}>)[0].copywriting).toBe("口播一");
  });
});
