import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import CopywritingView from "../../src/renderer/views/CopywritingView.vue";

describe("CopywritingView", () => {
  it("loads the default persona and exposes AI and custom writing modes", async () => {
    Object.assign(window, {
      autocut: {
        listPersonas: vi.fn(async () => [
          {
            id: "00000000-0000-4000-8000-000000000001",
            name: "袋研官工厂",
            industry: "工厂",
            brandFacts: ["自有工厂"],
            tone: "专业",
            cta: "欢迎咨询",
            bannedWords: [],
            isDefault: true,
            createdAt: "2026-07-29",
            updatedAt: "2026-07-29"
          }
        ]),
        getCopyModelSettings: vi.fn(async () => ({
          defaultModel: "deepseek-v3",
          temperature: 0.7,
          candidateModels: ["deepseek-v3", "qwen-plus"]
        })),
        getCreationDraft: vi.fn(async () => null),
        saveCreationDraft: vi.fn(async (draft) => draft),
        searchReferenceScripts: vi.fn(async () => [])
      }
    });

    const wrapper = mount(CopywritingView, {
      global: {
        stubs: {
          "el-select": { template: "<div><slot /></div>" },
          "el-option": true,
          "el-input": true,
          "el-button": true,
          "el-tag": true,
          "el-icon": true
        }
      }
    });
    await flushPromises();

    expect(wrapper.text()).toContain("文案生成");
    expect(wrapper.text()).toContain("AI 自动选题");
    expect(wrapper.text()).toContain("自定义文案");
    expect(window.autocut.listPersonas).toHaveBeenCalled();
  });

  it("writes generated text into the current draft after an in-flight autosave replaces it", async () => {
    let resolveGeneration!: (value: { text: string }) => void;
    const generatedText = "新生成的完整文案".repeat(30);
    Object.assign(window, {
      autocut: {
        listPersonas: vi.fn(async () => [
          {
            id: "00000000-0000-4000-8000-000000000001",
            name: "袋研官工厂",
            industry: "工厂",
            brandFacts: ["自有工厂"],
            tone: "专业",
            cta: "欢迎咨询",
            bannedWords: [],
            isDefault: true,
            createdAt: "2026-07-29",
            updatedAt: "2026-07-29"
          }
        ]),
        getCopyModelSettings: vi.fn(async () => ({
          defaultModel: "deepseek-v3",
          temperature: 0.7,
          candidateModels: ["deepseek-v3"]
        })),
        getCreationDraft: vi.fn(async () => ({
          version: 1,
          stage: "copywriting",
          personaId: "00000000-0000-4000-8000-000000000001",
          copywriting: {
            model: "deepseek-v3",
            temperature: 0.7,
            topics: [
              { id: "a", title: "旧选题", angle: "角度 A", hook: "钩子 A" },
              { id: "b", title: "新选题", angle: "角度 B", hook: "钩子 B" }
            ],
            selectedTopicId: "a",
            text: "旧文案",
            complianceIssues: []
          },
          voice: null,
          audioSegments: [],
          shots: [],
          bgm: null,
          titleStyle: null,
          subtitleStyle: null
        })),
        saveCreationDraft: vi.fn(async (draft) => structuredClone(draft)),
        searchReferenceScripts: vi.fn(async () => []),
        generateCopywriting: vi.fn(
          () =>
            new Promise<{ text: string }>((resolve) => {
              resolveGeneration = resolve;
            })
        )
      }
    });

    const wrapper = mount(CopywritingView, {
      global: {
        stubs: {
          "el-select": { template: "<div><slot /></div>" },
          "el-option": true,
          "el-button": {
            inheritAttrs: false,
            template: '<button v-bind="$attrs"><slot /></button>'
          },
          "el-tag": true,
          "el-icon": true,
          "el-progress": true
        }
      }
    });
    await flushPromises();

    await wrapper.get('[data-topic-id="b"]').trigger("click");
    await wrapper.get('[data-action="generate-copywriting"]').trigger("click");
    await new Promise((resolve) => setTimeout(resolve, 600));
    resolveGeneration({ text: generatedText });
    await flushPromises();

    expect(wrapper.get("textarea").element.value).toBe(generatedText);
    expect(
      vi.mocked(window.autocut.saveCreationDraft).mock.calls.at(-1)?.[0]
        .copywriting?.text
    ).toBe(generatedText);
  });
});
