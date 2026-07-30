import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import VoiceLibrary from "../../src/renderer/components/audio/VoiceLibrary.vue";

describe("VoiceLibrary", () => {
  it("renders selectable cards and exposes mutually exclusive playing state", async () => {
    const wrapper = mount(VoiceLibrary, {
      props: {
        modelValue: "voice-1",
        playingId: "voice-1",
        voices: [
          { voiceId: "voice-1", name: "清澈男声", kind: "system" },
          { voiceId: "voice-2", name: "我的克隆音色", kind: "clone" }
        ]
      },
      global: {
        stubs: {
          "el-button": { template: "<button><slot /></button>" }
        }
      }
    });

    const cards = wrapper.findAll("[data-voice-card]");
    expect(cards).toHaveLength(2);
    expect(cards[0].classes()).toContain("playing");
    expect(cards[0].text()).toContain("停止试听");

    await cards[1].find("button").trigger("click");
    expect(wrapper.emitted("audition")?.[0]).toEqual(["voice-2"]);
  });
});
