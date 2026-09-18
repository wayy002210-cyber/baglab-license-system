import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { describe, expect, it, vi } from "vitest";
import { useCreationDraft } from "../../src/renderer/composables/useCreationDraft";
import { creationDraftSchema } from "../../src/shared/contracts";

describe("useCreationDraft", () => {
  it("keeps legacy long display titles while accepting a ten-character unified title", () => {
    const parsed = creationDraftSchema.parse({
      version: 1,
      stage: "copywriting",
      personaId: "persona-1",
      copywriting: {
        model: "deepseek-v3",
        temperature: 0.7,
        topics: [{
          id: "a",
          displayTitle: "采购验收时怎样快速识别车线风险",
          shortTitle: "帆布袋选购新方法论篇",
          description: "这是面向采购人员的详细内容方向说明",
          hook: "这个问题应该先看什么？"
        }],
        selectedTopicId: "a",
        mainTitle: "帆布袋选购新方法论篇",
        text: "",
        complianceIssues: []
      },
      voice: null,
      audioSegments: [],
      shots: [],
      bgm: null,
      titleStyle: null,
      subtitleStyle: null
    });

    expect(parsed.copywriting?.mainTitle).toBe("帆布袋选购新方法论篇");
    expect(parsed.copywriting?.topics[0].displayTitle).toContain("采购验收");
  });

  it("surfaces automatic save failures instead of creating an unhandled promise", async () => {
    Object.assign(window, {
      autocut: {
        saveCreationDraft: vi.fn(async () => {
          throw new Error("数据库写入失败");
        })
      }
    });
    let state!: ReturnType<typeof useCreationDraft>;
    mount(
      defineComponent({
        setup() {
          state = useCreationDraft();
          return {};
        },
        template: "<div />"
      })
    );

    state.scheduleSave(0);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await flushPromises();

    expect(state.saveStatus.value).toBe("failed");
    expect(state.saveError.value).toBe("数据库写入失败");
  });

  it("marks a successful explicit save as persisted", async () => {
    Object.assign(window, {
      autocut: {
        saveCreationDraft: vi.fn(async (draft) => draft)
      }
    });
    let state!: ReturnType<typeof useCreationDraft>;
    mount(
      defineComponent({
        setup() {
          state = useCreationDraft();
          return {};
        },
        template: "<div />"
      })
    );

    await state.saveImmediate();

    expect(state.saveStatus.value).toBe("saved");
    expect(state.saveError.value).toBe("");
  });

  it("sends a cloneable plain draft across the preload boundary", async () => {
    Object.assign(window, {
      autocut: {
        saveCreationDraft: vi.fn(async (draft) => structuredClone(draft))
      }
    });
    let state!: ReturnType<typeof useCreationDraft>;
    mount(
      defineComponent({
        setup() {
          state = useCreationDraft();
          return {};
        },
        template: "<div />"
      })
    );
    state.draft.value.copywriting = {
      model: "deepseek-v3",
      temperature: 0.7,
      topics: [
        { id: "a", shortTitle: "工厂选题一号", description: "这是详细内容方向说明", hook: "钩子" }
      ],
      selectedTopicId: null,
      text: "",
      complianceIssues: []
    };

    await expect(state.saveImmediate()).resolves.toBeDefined();
    const submitted = vi.mocked(window.autocut.saveCreationDraft).mock.calls[0][0];
    expect(() => structuredClone(submitted)).not.toThrow();
  });
});
