import { reactive } from "vue";
import { describe, expect, it } from "vitest";
import {
  toCopywritingContext,
  toCopywritingGenerationInput
} from "../../src/renderer/copywriting/copywriting-request";

describe("copywriting request payloads", () => {
  it("turns nested reactive persona arrays into cloneable values", () => {
    const persona = reactive({
      name: "袋研官",
      industry: "广告定制",
      brandFacts: ["自有工厂"],
      tone: "专业",
      cta: "关注我",
      bannedWords: ["第一"]
    });

    const context = toCopywritingContext(persona, "deepseek-v3");
    const generation = toCopywritingGenerationInput(
      context,
      persona.bannedWords
    );

    expect(() => structuredClone(context)).not.toThrow();
    expect(() => structuredClone(generation)).not.toThrow();
    expect(context.brandFacts).toEqual(["自有工厂"]);
    expect(generation.bannedWords).toEqual(["第一"]);
  });
});
