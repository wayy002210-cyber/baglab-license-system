import { describe, expect, it } from "vitest";
import { generateCopywritingBatch } from "../../src/renderer/copywriting/generate-copywriting-batch";

describe("generateCopywritingBatch", () => {
  it("keeps successful projects when a later topic fails", async () => {
    const topics = [
      { id: "a", title: "选题A", angle: "角度A", hook: "钩子A" },
      { id: "b", title: "选题B", angle: "角度B", hook: "钩子B" },
      { id: "c", title: "选题C", angle: "角度C", hook: "钩子C" }
    ];
    const saved: string[] = [];

    const result = await generateCopywritingBatch({
      topics,
      generate: async (topic) => {
        if (topic.id === "b") throw new Error("额度不足");
        return { text: `${topic.title}的完整文案` };
      },
      saveSuccess: async (topic, text) => { saved.push(`${topic.id}:${text}`); },
      saveFailure: async () => undefined
    });

    expect(saved).toEqual(["a:选题A的完整文案", "c:选题C的完整文案"]);
    expect(result).toEqual({ total: 3, completed: 3, succeeded: 2, failed: 1 });
  });

  it("reports progress after every selected topic", async () => {
    const progress: number[] = [];
    await generateCopywritingBatch({
      topics: [
        { id: "a", title: "选题A", angle: "", hook: "" },
        { id: "b", title: "选题B", angle: "", hook: "" }
      ],
      generate: async (topic) => ({ text: topic.title }),
      saveSuccess: async () => undefined,
      saveFailure: async () => undefined,
      onProgress: (state) => progress.push(state.completed)
    });
    expect(progress).toEqual([1, 2]);
  });
});
