import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import TemplatesView from "../../src/renderer/views/TemplatesView.vue";

describe("TemplatesView", () => {
  it("renders the three-column studio and derives shots from audio segments", async () => {
    Object.assign(window, {
      autocut: {
        listTemplates: vi.fn(async () => []),
        listAssetCategories: vi.fn(async () => [
          { id: "cat-1", name: "产品", folderPath: "D:/产品", assetCount: 3, invalidCount: 0, lastScannedAt: null }
        ]),
        getCreationDraft: vi.fn(async () => ({
          version: 1, stage: "editing", personaId: "p1",
          copywriting: { model: "deepseek-v3", temperature: 0.7, topics: [], selectedTopicId: null, text: "第一段。", complianceIssues: [] },
          voice: { voiceId: "v1", source: "system", emotion: "calm", speed: 1, volume: 1, pitch: 0, languageBoost: "Chinese" },
          audioSegments: [{ id: "s1", index: 0, text: "第一段。", sourceStart: 0, sourceEnd: 4, textHash: "a", parameterHash: "b", audioPath: "D:/a.mp3", durationSec: 2, status: "ready", errorMessage: null }],
          shots: [], bgm: null, titleStyle: null, subtitleStyle: null
        })),
        saveCreationDraft: vi.fn(async (draft) => draft)
        ,listPersonas: vi.fn(async () => [{ id: "p1", name: "袋研官", industry: "工厂", brandFacts: ["自有工厂"], tone: "专业", cta: "欢迎咨询", bannedWords: [], isDefault: true, createdAt: "", updatedAt: "" }])
      }
    });
    const wrapper = mount(TemplatesView, {
      global: {
        stubs: {
          "el-button": { template: "<button><slot /></button>" },
          "el-select": { template: "<div><slot /></div>" },
          "el-option": true, "el-input": true, "el-input-number": true,
          "el-checkbox": true, "el-tag": true, "el-slider": true,
          "el-color-picker": true
        }
      }
    });
    await flushPromises();
    expect(wrapper.text()).toContain("模板库");
    expect(wrapper.text()).toContain("镜头创作区");
    expect(wrapper.text()).toContain("背景音乐与字幕");
    expect(wrapper.text()).toContain("第一段。");
    expect(wrapper.text()).toContain("一键改写");
  });
});
