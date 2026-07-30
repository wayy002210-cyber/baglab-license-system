import { describe, expect, it } from "vitest";
import {
  defaultSubtitleStyle,
  textStyleSchema
} from "../../src/shared/media-style";

describe("textStyleSchema", () => {
  it("uses readable light outlines without default shadow offsets", () => {
    expect(defaultSubtitleStyle.outlineWidth).toBeLessThanOrEqual(2);
    expect(defaultSubtitleStyle.shadowX).toBe(0);
    expect(defaultSubtitleStyle.shadowY).toBe(0);
  });

  it("validates complete subtitle styles and rejects invalid colors", () => {
    expect(textStyleSchema.parse(defaultSubtitleStyle).fontFamily).toBe(
      "Microsoft YaHei"
    );
    expect(() =>
      textStyleSchema.parse({ ...defaultSubtitleStyle, primaryColor: "white" })
    ).toThrow();
  });
});
