import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import ScheduleView from "../../src/renderer/views/ScheduleView.vue";

const asset = {
  id: "11111111-1111-4111-8111-111111111111", taskId: "task-1", shortTitle: "测试视频", topic: "",
  publishTitle: "测试标题", topics: ["测试"], topicTemplateId: null, coverPath: "D:/vertical.jpg",
  verticalCoverPath: "D:/vertical.jpg", horizontalCoverPath: "D:/horizontal.jpg", status: "unscheduled",
  createdAt: "2026-08-12T00:00:00.000Z", updatedAt: "2026-08-12T00:00:00.000Z"
} as const;

describe("ScheduleView", () => {
  it("switches to the publish queue after creating a publish job", async () => {
    const createPublishJobsForAsset = vi.fn(async () => []);
    Object.assign(window, { autocut: {
      listPublishAssets: vi.fn(async () => [{ ...asset }]),
      listPublishAccounts: vi.fn(async () => [{ id:"22222222-2222-4222-8222-222222222222", name:"测试2", platform:"douyin", linkStatus:"connected" }]),
      listPublishTopicTemplates: vi.fn(async () => []), listPublishJobs: vi.fn(async () => []),
      updatePublishAsset: vi.fn(async (_id: string, patch: object) => ({ ...asset, ...patch })),
      createPublishJobsForAsset
    }});
    const wrapper = mount(ScheduleView, { global: { stubs: {
      PageIntro: true, "el-segmented": { props:["modelValue","options"], template:"<div data-active-tab>{{modelValue}}</div>" },
      "el-button": { template:"<button @click=\"$emit('click')\"><slot /></button>" }, "el-tag":true,
      "el-input":true, "el-select":true, "el-option":true, "el-date-picker":true, "el-empty":true,
      "el-dialog":true
    }}});
    await flushPromises();
    const vm = wrapper.vm as unknown as { selectedAccounts: Record<string,string[]>; publishTimes: Record<string,Date|null>; publish: (value: typeof asset, scheduled: boolean) => Promise<void> };
    vm.selectedAccounts[asset.id] = ["22222222-2222-4222-8222-222222222222"];
    vm.publishTimes[asset.id] = new Date("2026-08-17T13:00:00+08:00");

    await vm.publish({ ...asset }, true);
    await flushPromises();

    expect(createPublishJobsForAsset).toHaveBeenCalledWith(expect.objectContaining({ startImmediately: false }));
    expect(wrapper.text()).toContain("一键发布");
    expect(wrapper.get("[data-active-tab]").text()).toBe("scheduled");
  });
});
