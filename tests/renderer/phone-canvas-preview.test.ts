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

  it("previews blur-only shadows and visible title outlines", () => {
    const wrapper = mount(PhoneCanvasPreview, {
      props: {
        subtitleStyle: {
          ...defaultSubtitleStyle,
          shadowColor: "#80000000",
          shadowX: 0,
          shadowY: 0,
          shadowBlur: 12
        },
        titleStyle: { ...defaultTitleStyle, outlineWidth: 6, outlineColor: "#FF000000" }
      }
    });

    expect(wrapper.find(".subtitle").attributes("style")).toContain("4px");
    expect(wrapper.find(".title").attributes("style")).toContain("paint-order: stroke fill");
    expect(wrapper.find(".title").attributes("style")).toContain("2px 0px");
  });
});
