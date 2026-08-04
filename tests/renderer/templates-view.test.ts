import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import TemplatesView from "../../src/renderer/views/TemplatesView.vue";

describe("TemplatesView", () => {
  it("lists copywriting projects and splits the selected project into editable shots", async () => {
    const replaceCopywritingShots = vi.fn(async (_id: string, shots: Array<Record<string, unknown>>) =>
      shots.map((shot, index) => ({ id: `s${index}`, projectId: "p1", index, ...shot }))
    );
    Object.assign(window,{autocut:{
      listCopywritingProjects:vi.fn(async()=>[{id:"p1",personaId:"persona",topicId:"t1",topicTitle:"质量怎么保证",mainTitle:"品质真相",text:"我们在车间严格生产。欢迎到店了解。",model:"deepseek-v3",status:"library",complianceIssues:[],errorMessage:null,createdAt:"",updatedAt:"",archivedAt:null}]),
      listCopywritingShots:vi.fn(async()=>[]), replaceCopywritingShots,
      listAssetCategories:vi.fn(async()=>[{id:"production",name:"生产过程",folderPath:"D:/生产",assetCount:3,invalidCount:0,lastScannedAt:null},{id:"store",name:"门头",folderPath:"D:/门头",assetCount:2,invalidCount:0,lastScannedAt:null}]),
      getCreationDraft:vi.fn(async()=>null),saveCreationDraft:vi.fn(async d=>d),getStylePresets:vi.fn(async()=>[]),saveStylePresets:vi.fn(async p=>p)
    }});
    const wrapper=mount(TemplatesView,{global:{stubs:{
      "el-button":{template:"<button @click=\"$emit('click')\"><slot /></button>"},"el-select":true,"el-option":true,"el-input":true,
      "el-input-number":true,"el-checkbox":true,"el-slider":true,"el-color-picker":true
    }}});
    await flushPromises();
    expect(wrapper.text()).toContain("待剪辑文案");
    expect(wrapper.text()).toContain("质量怎么保证");
    await wrapper.get('[data-action="split-current"]').trigger("click");
    await flushPromises();
    expect(replaceCopywritingShots).toHaveBeenCalledWith("p1",expect.arrayContaining([
      expect.objectContaining({copywriting:"我们在车间严格生产。",assetCategoryId:"production"})
    ]));
    expect(wrapper.text()).toContain("镜头创作区");
  });
});
