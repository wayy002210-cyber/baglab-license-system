import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SubtitleStyleEditor from "../../src/renderer/components/editing/SubtitleStyleEditor.vue";
import { defaultSubtitleStyle } from "../../src/shared/media-style";

describe("SubtitleStyleEditor", () => {
  it("shows presets and full font and outline controls", () => {
    const wrapper = mount(SubtitleStyleEditor, {
      props: { modelValue: defaultSubtitleStyle },
      global: {
        stubs: {
          "el-select": true,
          "el-option": true,
          "el-input-number": true,
          "el-color-picker": true,
          "el-switch": true,
          "el-button": { template: "<button><slot /></button>" }
        }
      }
    });
    expect(wrapper.text()).toContain("字幕样式");
    expect(wrapper.text()).toContain("选择本地字体");
    expect(wrapper.text()).toContain("描边");
    expect(wrapper.text()).toContain("预设");
  });
});
