import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import AudioProductionView from "../../src/renderer/views/AudioProductionView.vue";

describe("AudioProductionView", () => {
  it("only saves global voice settings and never generates narration", async () => {
    const saveVoiceSettings = vi.fn(async (settings) => settings);
    const synthesizeVoice = vi.fn();
    Object.assign(window, {
      autocut: {
        getVoiceSettings: vi.fn(async () => ({
          voiceId: "male-qn-qingse", source: "system", model: "speech-2.8-hd",
          emotion: "calm", speed: 1, volume: 1, pitch: 0, languageBoost: "Chinese"
        })),
        saveVoiceSettings,
        synthesizeVoice,
        listVoices: vi.fn(async () => [
          { voiceId: "male-qn-qingse", name: "青涩男声", kind: "system" }
        ]),
        getVoiceCapabilities: vi.fn(async () => ({
          models: ["speech-2.8-hd"], emotions: ["calm", "happy"],
          speedRange: [0.5, 2], volumeRange: [0, 3], pitchRange: [-12, 12],
          sample: { formats: ["mp3", "wav"], minDurationSec: 10, maxDurationSec: 300, maxSizeBytes: 20971520 }
        })),
        previewVoice: vi.fn(), selectVoiceSample: vi.fn(), validateVoiceSample: vi.fn(), cloneVoice: vi.fn()
      }
    });

    const wrapper = mount(AudioProductionView, {
      global: { stubs: {
        "el-input": true, "el-slider": true, "el-dialog": { template: "<div><slot /></div>" },
        "el-checkbox": true, "el-tag": true, "el-progress": true,
        "el-button": { template: "<button @click=\"$emit('click')\"><slot /></button>" }
      }}
    });
    await flushPromises();

    expect(wrapper.text()).toContain("音频设置");
    expect(wrapper.text()).toContain("青涩男声");
    expect(wrapper.find('[data-action="generate-master-audio"]').exists()).toBe(false);
    await wrapper.get('[data-action="save-voice-settings"]').trigger("click");
    await flushPromises();
    expect(saveVoiceSettings).toHaveBeenCalledWith(expect.objectContaining({ voiceId: "male-qn-qingse" }));
    expect(synthesizeVoice).not.toHaveBeenCalled();
  });
});
