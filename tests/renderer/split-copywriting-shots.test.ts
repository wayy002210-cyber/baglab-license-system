import { describe, expect, it } from "vitest";
import { splitAndRecommendShots } from "../../src/renderer/editing/split-copywriting-shots";

const categories = [
  { id: "product", name: "产品" }, { id: "production", name: "生产过程" },
  { id: "store", name: "门头" }, { id: "people", name: "人物" }
];

describe("splitAndRecommendShots", () => {
  it("merges tiny clauses and recommends an existing category", () => {
    const result = splitAndRecommendShots("品质。我们在车间严格生产，确保每一道工序稳定！欢迎到店了解。", categories);
    expect(result.map((item) => item.copywriting)).toEqual([
      "品质。我们在车间严格生产，确保每一道工序稳定！", "欢迎到店了解。"
    ]);
    expect(result[0]).toMatchObject({ categoryId: "production", source: "keyword" });
    expect(result[1].categoryId).toBe("store");
  });

  it("always returns a valid default category", () => {
    const [shot] = splitAndRecommendShots("这是一个没有明显关键词的完整口播句子。", categories);
    expect(categories.some((item) => item.id === shot.categoryId)).toBe(true);
    expect(shot.source).toBe("default");
  });
});
