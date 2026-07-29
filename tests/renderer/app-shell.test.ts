import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { describe, expect, it, vi } from "vitest";
import AppShell from "../../src/renderer/layouts/AppShell.vue";

describe("AppShell", () => {
  it("renders the eight product modules", () => {
    const wrapper = mount(AppShell, {
      global: {
        plugins: [createTestingPinia({ createSpy: vi.fn })]
      }
    });
    for (const label of [
      "工作台",
      "账号档案",
      "素材中心",
      "镜头模板",
      "任务中心",
      "发布账号",
      "发布排期",
      "系统设置"
    ]) {
      expect(wrapper.text()).toContain(label);
    }
  });

  it("renders the Bag Lab product name and logo without legacy branding", () => {
    const wrapper = mount(AppShell);

    expect(wrapper.text()).toContain("袋研官矩阵混剪工作台");
    expect(wrapper.find('img[alt="袋研官"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain("AUTOCUT");
  });
});
