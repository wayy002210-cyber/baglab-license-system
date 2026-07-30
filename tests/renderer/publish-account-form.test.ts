import { isProxy, reactive } from "vue";
import { describe, expect, it } from "vitest";
import { toPublishAccountInput } from "../../src/renderer/publishing/publish-account-form";

describe("toPublishAccountInput", () => {
  it("converts a Vue reactive form into a cloneable plain IPC payload", () => {
    const form = reactive({
      name: " 抖音测试1 ",
      platform: "douyin" as const
    });

    const payload = toPublishAccountInput(form);

    expect(isProxy(form)).toBe(true);
    expect(isProxy(payload)).toBe(false);
    expect(payload).toEqual({ name: "抖音测试1", platform: "douyin" });
    expect(Object.getPrototypeOf(payload)).toBe(Object.prototype);
  });
});
