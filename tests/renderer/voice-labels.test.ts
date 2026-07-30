import { describe, expect, it } from "vitest";
import {
  emotionOptions,
  isChineseVoice,
  selectPreferredVoices,
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

  it("keeps Chinese and cloned voices while excluding foreign system voices", () => {
    expect(
      isChineseVoice({
        voiceId: "Chinese (Mandarin)_Reliable_Executive",
        name: "沉稳高管",
        kind: "system"
      })
    ).toBe(true);
    expect(
      isChineseVoice({
        voiceId: "Cantonese_ProfessionalHost（F)",
        name: "专业女主持",
        kind: "system"
      })
    ).toBe(true);
    expect(
      isChineseVoice({
        voiceId: "English_Trustworthy_Man",
        name: "Trustworthy Man",
        kind: "system"
      })
    ).toBe(false);
    expect(
      isChineseVoice({
        voiceId: "Baglab001",
        name: "Baglab001",
        kind: "clone"
      })
    ).toBe(true);
  });

  it("keeps every cloned voice before at most ten basic system voices", () => {
    const system = Array.from({ length: 15 }, (_, index) => ({
      voiceId: `Chinese_System_${index}`,
      name: `基础音色 ${index}`,
      kind: "system"
    }));
    const clones = [
      { voiceId: "clone-1", name: "我的声音 1", kind: "clone" },
      { voiceId: "clone-2", name: "我的声音 2", kind: "clone" }
    ];

    const selected = selectPreferredVoices([...system, ...clones]);

    expect(selected.filter((voice) => voice.kind === "system")).toHaveLength(10);
    expect(selected.slice(0, 2)).toEqual(clones);
  });
});
