import { describe, expect, it } from "vitest";
import {
  emotionOptions,
  voiceDisplayName,
  voiceKindLabel
} from "../../src/renderer/audio/voice-labels";

describe("voice labels", () => {
  it("shows Chinese emotion labels but keeps API values", () => {
    expect(emotionOptions).toContainEqual({ label: "平静", value: "calm" });
    expect(emotionOptions).toContainEqual({ label: "开心", value: "happy" });
    expect(emotionOptions).toContainEqual({ label: "愤怒", value: "angry" });
  });

  it("localizes known voice identifiers and kinds", () => {
    expect(
      voiceDisplayName({
        voiceId: "male-qn-qingse",
        name: "male-qn-qingse",
        kind: "system"
      })
    ).toBe("青涩男声");
    expect(voiceKindLabel("clone")).toBe("我的克隆音色");
    expect(voiceKindLabel("system")).toBe("官方音色");
  });

  it("preserves an unknown provider voice name", () => {
    expect(
      voiceDisplayName({
        voiceId: "provider-new",
        name: "袋袋儿",
        kind: "custom"
      })
    ).toBe("袋袋儿");
  });
});
