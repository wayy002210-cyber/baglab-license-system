import { describe, expect, it } from "vitest";
import { estimateSubtitleLineCapacity, wrapSubtitlePreview } from "../../src/shared/subtitle-layout";

describe("subtitle layout", () => {
  it("reduces capacity for large fonts and outlines", () => {
    expect(estimateSubtitleLineCapacity({ fontSize: 80, outlineWidth: 6 }))
      .toBeLessThan(estimateSubtitleLineCapacity({ fontSize: 48, outlineWidth: 0 }));
  });

  it("returns no more than two preview lines", () => {
    const lines = wrapSubtitlePreview(
      "每个袋子必须让使用者愿意背，这才是客户品牌曝光的核心，还要兼顾质量和传播。",
      { fontSize: 80, outlineWidth: 6 }
    );
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => line.length > 0)).toBe(true);
  });
});
