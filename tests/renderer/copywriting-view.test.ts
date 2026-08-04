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
        { id: "a", title: "选题A", angle: "角度A", hook: "钩子A" }, { id: "b", title: "选题B", angle: "角度B", hook: "钩子B" },
        { id: "c", title: "选题C", angle: "角度C", hook: "钩子C" }, { id: "d", title: "选题D", angle: "角度D", hook: "钩子D" },
        { id: "e", title: "选题E", angle: "角度E", hook: "钩子E" }
      ] })), generateCopywriting: vi.fn(async (input) => ({ text: `${input.topic}完整文案`.repeat(30) })), createCopywritingProject: create
    } });
    const wrapper = mountView(); await flushPromises();

    await wrapper.get('[data-action="generate-topics"]').trigger("click"); await flushPromises();
    await wrapper.get('[data-topic-id="a"]').trigger("click");
    await wrapper.get('[data-topic-id="b"]').trigger("click");
    await wrapper.get('[data-action="generate-selected-copywriting"]').trigger("click"); await flushPromises();

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls.map(([input]) => input.topicTitle)).toEqual(["选题A", "选题B"]);
  });
});
