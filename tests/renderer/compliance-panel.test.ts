import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import CompliancePanel from "../../src/renderer/components/copywriting/CompliancePanel.vue";

describe("CompliancePanel", () => {
  it("shows risks and asks the parent to apply one suggestion", async () => {
    const issue = {
      term: "第一",
      start: 4,
      end: 6,
      riskType: "ranking",
      explanation: "缺少排名依据",
      suggestion: "较为领先"
    };
    const wrapper = mount(CompliancePanel, {
      props: {
        issues: [issue],
        disclaimer: "风险提示，不构成法律结论"
      }
    });

    expect(wrapper.text()).toContain("第一");
    expect(wrapper.text()).toContain("较为领先");
    await wrapper.get('[data-action="apply-suggestion"]').trigger("click");
    expect(wrapper.emitted("apply")?.[0]).toEqual([issue]);
  });
});
