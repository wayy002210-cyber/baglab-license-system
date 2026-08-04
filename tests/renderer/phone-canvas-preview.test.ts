import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import PhoneCanvasPreview from "../../src/renderer/components/editing/PhoneCanvasPreview.vue";
import { defaultSubtitleStyle, defaultTitleStyle } from "../../src/shared/media-style";

describe("PhoneCanvasPreview", () => {
  it("uses a scene background and wraps long subtitles", () => {
    const wrapper = mount(PhoneCanvasPreview, {
      props: {
        subtitleStyle: { ...defaultSubtitleStyle, fontSize: 80 },
        titleStyle: defaultTitleStyle,
        subtitle: "每个袋子必须让使用者愿意背，这才是客户品牌曝光的核心，还要兼顾质量和传播。"
      }
    });
    expect(wrapper.attributes("style")).toContain("subtitle-preview-background");
    expect(wrapper.find(".subtitle").text()).toContain("\n");
  });

  it("converts ASS alpha-first shadow colors to visible CSS colors", () => {
    const wrapper = mount(PhoneCanvasPreview, {
      props: {
        subtitleStyle: {
          ...defaultSubtitleStyle,
          shadowColor: "#80000000",
          shadowX: 10,
          shadowY: 13,
          shadowBlur: 11
        },
        titleStyle: defaultTitleStyle
      }
    });

    expect(wrapper.find(".subtitle").attributes("style")).toContain("#00000080");
    expect(wrapper.find(".subtitle").attributes("style")).not.toContain("#80000000");
  });
});
