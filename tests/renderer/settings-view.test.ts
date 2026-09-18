import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsView from "../../src/renderer/views/SettingsView.vue";

vi.mock("element-plus", async (importOriginal) => {
  const actual = await importOriginal<typeof import("element-plus")>();
  return {
    ...actual,
    ElMessage: {
      success: vi.fn(),
      warning: vi.fn(),
      error: vi.fn()
    }
  };
});

type CopyModelSettings = Awaited<ReturnType<typeof window.autocut.getCopyModelSettings>>;

const baseSettings: CopyModelSettings = {
  defaultModel: "deepseek-v4.1-flash",
  temperature: 0.7,
  candidateModels: ["deepseek-v4.1-flash", "qwen-plus"],
  modelRecommendations: [],
  modelsCheckedAt: null
};

const mediaSettings = {
  outputDirectory: "",
  workDirectory: "",
  encoder: "auto" as const,
  videoBitrateMbps: 8,
  fontFamily: "Microsoft YaHei",
  bgmPath: null,
  bgmVolume: 0.16
};

function installBridge(refresh: ReturnType<typeof vi.fn<() => Promise<CopyModelSettings>>> = vi.fn(async () => baseSettings)) {
  const bridge = {
    credentialStatus: vi.fn(async () => ({ bailian: true, minimax: true })),
    getMediaSettings: vi.fn(async () => mediaSettings),
    getCopyModelSettings: vi.fn(async () => baseSettings),
    listReferenceScripts: vi.fn(async () => []),
    refreshBailianModels: refresh,
    saveCopyModelSettings: vi.fn(async (settings) => settings)
  };
  Object.assign(window, { autocut: bridge });
  return bridge;
}

function mountView() {
  const passthrough = { template: "<div><slot /></div>" };
  return mount(SettingsView, { global: { stubs: {
    PageIntro: true,
    ReferenceScriptsPanel: true,
    "el-icon": passthrough,
    "el-tag": passthrough,
    "el-form": passthrough,
    "el-form-item": passthrough,
    "el-input": passthrough,
    "el-input-number": true,
    "el-slider": true,
    "el-select": passthrough,
    "el-option": { props: ["label"], template: "<span>{{ label }}</span>" },
    "el-alert": { props: ["title"], template: "<div>{{ title }}</div>" },
    "el-divider": true,
    "el-button": {
      inheritAttrs: false,
      template: '<button v-bind="$attrs"><slot /></button>'
    }
  } } });
}

describe("SettingsView BaiLian model refresh", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not refresh the model catalog while loading settings", async () => {
    const bridge = installBridge();

    mountView();
    await flushPromises();

    expect(bridge.getCopyModelSettings).toHaveBeenCalledOnce();
    expect(bridge.refreshBailianModels).not.toHaveBeenCalled();
  });

  it("refreshes only after a click and renders at most five verified models", async () => {
    const recommendations = Array.from({ length: 5 }, (_, index) => ({
      id: `model-${index + 1}`,
      displayName: `推荐模型 ${index + 1}`,
      family: "other" as const,
      status: "available" as const,
      note: "实时调用验证通过"
    }));
    const refresh = vi.fn(async () => ({
      ...baseSettings,
      candidateModels: [baseSettings.defaultModel, ...recommendations.map((item) => item.id)],
      modelRecommendations: recommendations,
      modelsCheckedAt: "2026-09-18T08:00:00Z"
    }));
    const bridge = installBridge(refresh);
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('[data-action="refresh-bailian-models"]').trigger("click");
    await flushPromises();

    expect(refresh).toHaveBeenCalledOnce();
    expect(wrapper.findAll('[data-testid="model-recommendation"]')).toHaveLength(5);
    expect(wrapper.text()).toContain("推荐模型 1");
    expect(wrapper.text()).toContain("上次检查");
    expect(bridge.saveCopyModelSettings).not.toHaveBeenCalled();
  });

  it("keeps an unverified current model until the user selects and saves a verified one", async () => {
    const verified = {
      id: "qwen3.7-plus",
      displayName: "Qwen 3.7 Plus",
      family: "qwen" as const,
      status: "available" as const,
      note: "实时调用验证通过"
    };
    const refresh = vi.fn(async (): Promise<CopyModelSettings> => ({
      ...baseSettings,
      candidateModels: [baseSettings.defaultModel, verified.id],
      modelRecommendations: [verified],
      modelsCheckedAt: "2026-09-18T08:00:00Z"
    }));
    const bridge = installBridge(refresh);
    const wrapper = mountView();
    await flushPromises();
    await wrapper.get('[data-action="refresh-bailian-models"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("当前模型未通过本次验证");
    expect(wrapper.get('[data-action="save-copy-model"]').attributes("disabled")).toBeDefined();

    await wrapper.get('[data-testid="model-recommendation"]').trigger("click");
    await wrapper.get('[data-action="save-copy-model"]').trigger("click");
    await flushPromises();

    expect(bridge.saveCopyModelSettings).toHaveBeenCalledWith(
      expect.objectContaining({ defaultModel: "qwen3.7-plus" })
    );
  });
});
