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
});
