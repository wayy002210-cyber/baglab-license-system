import { describe, expect, it } from "vitest";
import { generateCopywritingBatch } from "../../src/renderer/copywriting/generate-copywriting-batch";

function topic(id: string) {
  return {
    id, displayTitle: `这是完整选题标题${id}用于测试`, shortTitle: "工厂选题一号",
    description: "这是面向采购人员的详细内容方向说明和可执行方法", hook: "这个问题真正应该先看什么？",
    identity: { audience: "采购", scenario: `场景${id}`, problem: `问题${id}`, thesis: `结论${id}`,
      evidenceType: "测试", angle: "判断", structureType: "现场演示", hookType: "问题",
      viewerGain: "学会判断", hotspotId: null }, hotspot: null, semanticVector: null
  };
}

describe("generateCopywritingBatch", () => {
  it("keeps successful projects when a later topic fails", async () => {
    const topics = [topic("a"), { ...topic("b"), shortTitle: "工厂选题二号" }, { ...topic("c"), shortTitle: "工厂选题三号" }];
    const saved: string[] = [];

    const result = await generateCopywritingBatch({
      topics,
      generate: async (topic) => {
        if (topic.id === "b") throw new Error("额度不足");
        return { text: `${topic.shortTitle}的完整文案`, structureType: "现场演示", hookType: "问题", argumentBeats: [], semanticVector: null };
      },
      saveSuccess: async (topic, result) => { saved.push(`${topic.id}:${result.text}`); },
      saveFailure: async () => undefined
    });

    expect(saved).toEqual(["a:工厂选题一号的完整文案", "c:工厂选题三号的完整文案"]);
    expect(result).toEqual({ total: 3, completed: 3, succeeded: 2, failed: 1 });
  });

  it("reports progress after every selected topic", async () => {
    const progress: number[] = [];
    await generateCopywritingBatch({
      topics: [topic("a"), topic("b")],
      generate: async (topic) => ({ text: topic.shortTitle, structureType: "现场演示", hookType: "问题", argumentBeats: [], semanticVector: null }),
      saveSuccess: async () => undefined,
      saveFailure: async () => undefined,
      onProgress: (state) => progress.push(state.completed)
    });
    expect(progress).toEqual([1, 2]);
  });

  it("retries one transient Electron IPC failure before saving a failed project", async () => {
    let attempts = 0;
    const saved: string[] = [];

    const result = await generateCopywritingBatch({
      topics: [topic("a")],
      generate: async (current) => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("Error invoking remote method 'copywriting:generate': Error: net::ERR_CONNECTION_RESET");
        }
        return { text: `${current.shortTitle}的完整文案`, structureType: "现场演示", hookType: "问题", argumentBeats: [], semanticVector: null };
      },
      saveSuccess: async (_topic, value) => { saved.push(value.text); },
      saveFailure: async () => undefined
    });

    expect(attempts).toBe(2);
    expect(saved).toEqual(["工厂选题一号的完整文案"]);
    expect(result).toEqual({ total: 1, completed: 1, succeeded: 1, failed: 0 });
  });
});
