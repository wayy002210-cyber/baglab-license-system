import { describe, expect, it } from "vitest";
import {
  defaultSubtitleStyle,
  textStyleSchema
} from "../../src/shared/media-style";

describe("textStyleSchema", () => {
  it("validates complete subtitle styles and rejects invalid colors", () => {
    expect(textStyleSchema.parse(defaultSubtitleStyle).fontFamily).toBe(
      "Microsoft YaHei"
    );
    expect(() =>
      textStyleSchema.parse({ ...defaultSubtitleStyle, primaryColor: "white" })
    ).toThrow();
  });
});
