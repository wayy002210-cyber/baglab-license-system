import { describe, expect, it } from "vitest";
import { generateCopywritingBatch } from "../../src/renderer/copywriting/generate-copywriting-batch";

describe("generateCopywritingBatch", () => {
  it("keeps successful projects when a later topic fails", async () => {
    const topics = [
      { id: "a", shortTitle: "工厂选题一号", description: "第一个详细内容方向说明", hook: "钩子A" },
      { id: "b", shortTitle: "工厂选题二号", description: "第二个详细内容方向说明", hook: "钩子B" },
      { id: "c", shortTitle: "工厂选题三号", description: "第三个详细内容方向说明", hook: "钩子C" }
    ];
    const saved: string[] = [];

    const result = await generateCopywritingBatch({
      topics,
      generate: async (topic) => {
        if (topic.id === "b") throw new Error("额度不足");
        return { text: `${topic.shortTitle}的完整文案` };
      },
      saveSuccess: async (topic, text) => { saved.push(`${topic.id}:${text}`); },
      saveFailure: async () => undefined
    });

    expect(saved).toEqual(["a:工厂选题一号的完整文案", "c:工厂选题三号的完整文案"]);
    expect(result).toEqual({ total: 3, completed: 3, succeeded: 2, failed: 1 });
  });

  it("reports progress after every selected topic", async () => {
    const progress: number[] = [];
    await generateCopywritingBatch({
      topics: [
        { id: "a", shortTitle: "工厂选题一号", description: "第一个详细内容方向说明", hook: "" },
        { id: "b", shortTitle: "工厂选题二号", description: "第二个详细内容方向说明", hook: "" }
      ],
      generate: async (topic) => ({ text: topic.shortTitle }),
      saveSuccess: async () => undefined,
      saveFailure: async () => undefined,
      onProgress: (state) => progress.push(state.completed)
    });
    expect(progress).toEqual([1, 2]);
  });
});
