import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import CopywritingView from "../../src/renderer/views/CopywritingView.vue";

const persona = {
  id: "00000000-0000-4000-8000-000000000001", name: "袋研官工厂", industry: "工厂",
  brandFacts: ["自有工厂"], tone: "专业", cta: "欢迎咨询", bannedWords: [], isDefault: true,
  createdAt: "2026-08-04", updatedAt: "2026-08-04"
};

function mountView() {
  return mount(CopywritingView, { global: { stubs: {
    "el-select": { template: "<div><slot /></div>" }, "el-option": true,
    "el-button": { inheritAttrs: false, template: '<button v-bind="$attrs"><slot /></button>' },
    "el-tag": true, "el-progress": true, "el-dialog": { template: "<div><slot /><slot name='footer'/></div>" }
  } } });
}

describe("CopywritingView", () => {
  it("generates every selected topic and stores each successful script independently", async () => {
    const create = vi.fn(async (input) => ({ id: crypto.randomUUID(), ...input, complianceIssues: [], errorMessage: null, createdAt: "", updatedAt: "", archivedAt: null }));
    Object.assign(window, { autocut: {
      listPersonas: vi.fn(async () => [persona]), getCopyModelSettings: vi.fn(async () => ({ defaultModel: "deepseek-v3", temperature: 0.7, candidateModels: ["deepseek-v3"] })),
      searchReferenceScripts: vi.fn(async () => []), listCopywritingProjects: vi.fn(async () => []),
      generateTopics: vi.fn(async () => ({ topics: [
        { id: "a", shortTitle: "工厂选题一号", description: "这是第一个详细内容方向说明", hook: "钩子A" }, { id: "b", shortTitle: "工厂选题二号", description: "这是第二个详细内容方向说明", hook: "钩子B" },
        { id: "c", shortTitle: "工厂选题三号", description: "这是第三个详细内容方向说明", hook: "钩子C" }, { id: "d", shortTitle: "工厂选题四号", description: "这是第四个详细内容方向说明", hook: "钩子D" },
        { id: "e", shortTitle: "工厂选题五号", description: "这是第五个详细内容方向说明", hook: "钩子E" }
      ] })), generateCopywriting: vi.fn(async (input) => ({ text: `${input.topic}完整文案`.repeat(30) })), createCopywritingProject: create
    } });
    const wrapper = mountView(); await flushPromises();

    await wrapper.get('[data-action="generate-topics"]').trigger("click"); await flushPromises();
    await wrapper.get('[data-topic-id="a"]').trigger("click");
    await wrapper.get('[data-topic-id="b"]').trigger("click");
    await wrapper.get('[data-action="generate-selected-copywriting"]').trigger("click"); await flushPromises();

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls.map(([input]) => input.mainTitle)).toEqual(["工厂选题一号", "工厂选题二号"]);
    expect(wrapper.find('[data-action="select-all-topics"]').exists()).toBe(true);
  });
});
