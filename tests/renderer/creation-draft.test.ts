import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { describe, expect, it, vi } from "vitest";
import { useCreationDraft } from "../../src/renderer/composables/useCreationDraft";

describe("useCreationDraft", () => {
  it("surfaces automatic save failures instead of creating an unhandled promise", async () => {
    Object.assign(window, {
      autocut: {
        saveCreationDraft: vi.fn(async () => {
          throw new Error("数据库写入失败");
        })
      }
    });
    let state!: ReturnType<typeof useCreationDraft>;
    mount(
      defineComponent({
        setup() {
          state = useCreationDraft();
          return {};
        },
        template: "<div />"
      })
    );

    state.scheduleSave(0);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await flushPromises();

    expect(state.saveStatus.value).toBe("failed");
    expect(state.saveError.value).toBe("数据库写入失败");
  });

  it("marks a successful explicit save as persisted", async () => {
    Object.assign(window, {
      autocut: {
        saveCreationDraft: vi.fn(async (draft) => draft)
      }
    });
    let state!: ReturnType<typeof useCreationDraft>;
    mount(
      defineComponent({
        setup() {
          state = useCreationDraft();
          return {};
        },
        template: "<div />"
      })
    );

    await state.saveImmediate();

    expect(state.saveStatus.value).toBe("saved");
    expect(state.saveError.value).toBe("");
  });
});
