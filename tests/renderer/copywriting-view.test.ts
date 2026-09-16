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

function richTopic(id: string, hotspot = false) {
  const suffix: Record<string, string> = { a: "甲", b: "乙", c: "丙", d: "丁", e: "戊" };
  return {
    id, displayTitle: `展厅灯光下袋子颜色为何会变化${id}`, shortTitle: `展厅色差${suffix[id] ?? "甲"}`,
    description: "面向展会设计师，在展厅布置时讲清现场灯光造成颜色偏差的判断方法",
    hook: "同一块面料，为什么进了展厅就像换了颜色？",
    identity: { audience: "展会设计师", scenario: `展厅布置${id}`, problem: `现场颜色偏差${id}`,
      thesis: `选色必须在现场灯光确认${id}`, evidenceType: "色样对比", angle: "光线影响",
      structureType: "现场观察", hookType: "场景冲突", viewerGain: "学会现场确认颜色", hotspotId: hotspot ? "hot-1" : null },
    hotspot: hotspot ? { id: "hot-1", title: "近期展会灯光设计趋势", sourceUrl: "https://example.com/trend",
      publishedAt: "2026-09-15", retrievedAt: "2026-09-16T00:00:00Z", summary: "展会照明变化", relevance: "影响袋子现场颜色" } : null,
    semanticVector: null
  };
}

describe("CopywritingView", () => {
  it("generates every selected topic and stores each successful script independently", async () => {
    const create = vi.fn(async (input) => ({ id: crypto.randomUUID(), ...input, complianceIssues: [], errorMessage: null, createdAt: "", updatedAt: "", archivedAt: null }));
    Object.assign(window, { autocut: {
      listPersonas: vi.fn(async () => [persona]), getCopyModelSettings: vi.fn(async () => ({ defaultModel: "deepseek-v3", temperature: 0.7, candidateModels: ["deepseek-v3"] })),
      searchReferenceScripts: vi.fn(async () => []), listCopywritingProjects: vi.fn(async () => []),
      generateTopics: vi.fn(async () => ({ topics: ["a", "b", "c", "d", "e"].map((id) => richTopic(id)), historyChecked: 126, hotspotStatus: "no_match" })),
      generateCopywriting: vi.fn(async (input) => ({ text: `${input.topic.shortTitle}完整文案`.repeat(30), structureType: "现场观察", hookType: "场景冲突", argumentBeats: [], semanticVector: null })),
      createCopywritingProject: create, openExternalUrl: vi.fn(async () => undefined)
    } });
    const wrapper = mountView(); await flushPromises();

    await wrapper.get('[data-action="generate-topics"]').trigger("click"); await flushPromises();
    await wrapper.get('[data-topic-id="a"]').trigger("click");
    await wrapper.get('[data-topic-id="b"]').trigger("click");
    await wrapper.get('[data-action="generate-selected-copywriting"]').trigger("click"); await flushPromises();

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls.map(([input]) => input.mainTitle)).toEqual(["展厅色差甲", "展厅色差乙"]);
    expect(wrapper.find('[data-action="select-all-topics"]').exists()).toBe(true);
  });

  it("shows the full title, short title, angle and verified hotspot source", async () => {
    Object.assign(window, { autocut: {
      listPersonas: vi.fn(async () => [persona]), getCopyModelSettings: vi.fn(async () => ({ defaultModel: "deepseek-v3", temperature: 0.7, candidateModels: ["deepseek-v3"] })),
      searchReferenceScripts: vi.fn(async () => []), listCopywritingProjects: vi.fn(async () => []),
      generateTopics: vi.fn(async () => ({ topics: [richTopic("a", true), ...["b", "c", "d", "e"].map((id) => richTopic(id))], historyChecked: 42, hotspotStatus: "available" })),
      openExternalUrl: vi.fn(async () => undefined)
    } });
    const wrapper = mountView(); await flushPromises();

    await wrapper.get('[data-action="generate-topics"]').trigger("click"); await flushPromises();

    expect(wrapper.text()).toContain("展厅灯光下袋子颜色为何会变化a");
    expect(wrapper.text()).toContain("展厅色差甲");
    expect(wrapper.text()).toContain("光线影响");
    expect(wrapper.get('[data-testid="hotspot-source"]').attributes("href")).toBe("https://example.com/trend");
    expect(wrapper.text()).toContain("已避开本地历史 42 条内容");
  });

  it("reports evergreen fallback when current sources are unavailable", async () => {
    Object.assign(window, { autocut: {
      listPersonas: vi.fn(async () => [persona]), getCopyModelSettings: vi.fn(async () => ({ defaultModel: "deepseek-v3", temperature: 0.7, candidateModels: ["deepseek-v3"] })),
      searchReferenceScripts: vi.fn(async () => []), listCopywritingProjects: vi.fn(async () => []),
      generateTopics: vi.fn(async () => ({ topics: ["a", "b", "c", "d", "e"].map((id) => richTopic(id)), historyChecked: 126, hotspotStatus: "unavailable" })),
      openExternalUrl: vi.fn(async () => undefined)
    } });
    const wrapper = mountView(); await flushPromises();
    await wrapper.get('[data-action="generate-topics"]').trigger("click"); await flushPromises();

    expect(wrapper.text()).toContain("已避开本地历史 126 条内容");
    expect(wrapper.text()).toContain("本次热点不可用，已使用常规选题");
  });
});
