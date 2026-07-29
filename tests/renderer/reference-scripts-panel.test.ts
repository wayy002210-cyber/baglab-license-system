import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ReferenceScriptsPanel from "../../src/renderer/components/copywriting/ReferenceScriptsPanel.vue";

describe("ReferenceScriptsPanel", () => {
  it("renders local scripts and emits deletion", async () => {
    const wrapper = mount(ReferenceScriptsPanel, {
      props: {
        scripts: [
          {
            id: "script-1",
            title: "工厂获客脚本",
            industry: "工厂",
            tags: ["获客"],
            content: "示例内容",
            structure: { hook: "反问", narrative: "问题-方案", cta: "咨询" },
            createdAt: "2026-07-29T00:00:00.000Z",
            updatedAt: "2026-07-29T00:00:00.000Z"
          }
        ]
      }
    });

    expect(wrapper.text()).toContain("工厂获客脚本");
    await wrapper.get('[data-action="delete-script"]').trigger("click");
    expect(wrapper.emitted("delete")?.[0]).toEqual(["script-1"]);
  });

  it("emits a normalized script input", async () => {
    const wrapper = mount(ReferenceScriptsPanel, { props: { scripts: [] } });
    await wrapper.get('[data-field="title"]').setValue(" 工厂脚本 ");
    await wrapper.get('[data-field="industry"]').setValue(" 工厂 ");
    await wrapper.get('[data-field="tags"]').setValue("获客，成本");
    await wrapper.get('[data-field="content"]').setValue("示例正文");
    await wrapper.get('[data-action="create-script"]').trigger("click");

    expect(wrapper.emitted("create")?.[0]?.[0]).toMatchObject({
      title: "工厂脚本",
      industry: "工厂",
      tags: ["获客", "成本"],
      content: "示例正文"
    });
  });
});
