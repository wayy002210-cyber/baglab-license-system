import { describe, expect, it } from "vitest";
import {
  allocateShotDurations,
  buildMasterAudioSegment
} from "../../src/renderer/audio/master-audio";

const voice = {
  voiceId: "Baglab001",
  source: "clone" as const,
  emotion: "calm",
  speed: 1,
  volume: 1,
  pitch: 0,
  languageBoost: "Chinese"
};

describe("master audio", () => {
  it("builds one stable full-script audio segment", () => {
    const text = "第一段完整口播。\n第二段继续说明。";
    const first = buildMasterAudioSegment(text, voice, "speech-2.8-hd");
    const repeated = buildMasterAudioSegment(text, voice, "speech-2.8-hd");
    const changed = buildMasterAudioSegment(
      text,
      { ...voice, speed: 1.2 },
      "speech-2.8-hd"
    );

    expect(first).toMatchObject({
      index: 0,
      text,
      sourceStart: 0,
      sourceEnd: text.length,
      audioPath: null,
      durationSec: null,
      status: "pending"
    });
    expect(repeated.id).toBe(first.id);
    expect(changed.id).not.toBe(first.id);
  });

  it("allocates the exact master duration by non-whitespace character weight", () => {
    const durations = allocateShotDurations(
      ["短句", "这是一段明显更长的镜头口播文字", "结尾"],
      30
    );

    expect(durations).toHaveLength(3);
    expect(durations.every((duration) => duration > 0)).toBe(true);
    expect(durations[1]).toBeGreaterThan(durations[0]);
    expect(durations.reduce((sum, duration) => sum + duration, 0)).toBe(30);
  });
});
