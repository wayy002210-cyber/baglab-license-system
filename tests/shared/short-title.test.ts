import { describe, expect, it } from "vitest";
import { deriveShortTitle, normalizeShortTitle, toSafeOutputStem } from "../../src/shared/short-title";

describe("deriveShortTitle", () => {
  it("produces a five-to-eight character Chinese title from an AI topic", () => {
    const title = deriveShortTitle("为什么你的帆布袋客户只用一次就丢了？");
    expect(title).toMatch(/^[\u3400-\u9fff]{5,8}$/);
    expect(title).toContain("帆布袋");
  });

  it("uses a stable fallback when the topic has too little Chinese text", () => {
    expect(deriveShortTitle("AI 2026")).toBe("袋研官做定制");
  });

  it("normalizes punctuation and protects Windows output names", () => {
    expect(normalizeShortTitle("  总嫌贵？我教你！ ")).toBe("总嫌贵我教你");
    expect(toSafeOutputStem('客户说：“贵”/怎么办?')).toBe("客户说贵怎么办");
    expect(toSafeOutputStem("CON")).toBe("视频CON");
  });
});
