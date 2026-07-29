import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import AudioProductionView from "../../src/renderer/views/AudioProductionView.vue";
import { segmentCopywriting } from "../../src/renderer/audio/segment-copywriting";

describe("segmentCopywriting", () => {
  it("splits Chinese copy deterministically and preserves source ranges", () => {
    const text = "第一句。第二句很重要！第三句？";
    const result = segmentCopywriting(text, 8);

    expect(result.map((item) => item.text)).toEqual([
      "第一句。",
      "第二句很重要！",
      "第三句？"
    ]);
    expect(result.map((item) => text.slice(item.sourceStart, item.sourceEnd))).toEqual(
      result.map((item) => item.text)
    );
  });
});

describe("AudioProductionView", () => {
  it("loads voices, exposes clone and voice controls, and creates segments", async () => {
    Object.assign(window, {
      autocut: {
        getCreationDraft: vi.fn(async () => ({
          version: 1,
          stage: "audio",
          personaId: "persona-1",
          copywriting: {
            model: "deepseek-v3",
            temperature: 0.7,
            topics: [],
            selectedTopicId: null,
            text: "这是第一段口播。这里是第二段口播！",
            complianceIssues: []
          },
          voice: null,
          audioSegments: [],
          shots: [],
          bgm: null,
          titleStyle: null,
          subtitleStyle: null
        })),
        saveCreationDraft: vi.fn(async (draft) => draft),
        listVoices: vi.fn(async () => [
          { voiceId: "voice-1", name: "专业女声", kind: "system" }
        ]),
        getVoiceCapabilities: vi.fn(async () => ({
          models: ["speech-2.8-hd"],
          emotions: ["happy", "calm"],
          speedRange: [0.5, 2],
          volumeRange: [0, 3],
          pitchRange: [-12, 12],
          sample: {
            formats: ["mp3", "m4a", "wav"],
            minDurationSec: 10,
            maxDurationSec: 300,
            maxSizeBytes: 20 * 1024 * 1024
          }
        }))
      }
    });

    const wrapper = mount(AudioProductionView, {
      global: {
        stubs: {
          "el-select": { template: "<div><slot /></div>" },
          "el-option": true,
          "el-slider": true,
          "el-button": { template: "<button><slot /></button>" },
          "el-input": true,
          "el-dialog": { template: "<div><slot /></div>" },
          "el-checkbox": true,
          "el-tag": true
        }
      }
    });
    await flushPromises();

    expect(wrapper.text()).toContain("音频制作");
    expect(wrapper.text()).toContain("声音克隆");
    expect(wrapper.text()).toContain("专业女声");
    expect(wrapper.text()).toContain("逐段生成");
    expect(window.autocut.getVoiceCapabilities).toHaveBeenCalled();
  });
});
