import { describe, expect, it } from "vitest";
import { deriveShortTitle } from "../../src/shared/short-title";

describe("deriveShortTitle", () => {
  it("produces a five-to-six character Chinese title from an AI topic", () => {
    const title = deriveShortTitle("为什么你的帆布袋客户只用一次就丢了？");
    expect(title).toMatch(/^[\u3400-\u9fff]{5,6}$/);
    expect(title).toContain("帆布袋");
  });

  it("uses a stable fallback when the topic has too little Chinese text", () => {
    expect(deriveShortTitle("AI 2026")).toBe("袋研官做定制");
  });
});
