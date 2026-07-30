import { describe, expect, it, vi } from "vitest";
import { createOperationState } from "../../src/renderer/lib/operation-state";

describe("createOperationState", () => {
  it("reports stage progress while an operation is running", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const state = createOperationState();
    const run = state.run(
      () => pending,
      { phase: "requesting", progress: 45, message: "正在请求百炼生成选题" }
    );

    expect(state.busy.value).toBe(true);
    expect(state.phase.value).toBe("requesting");
    expect(state.progress.value).toBe(45);
    expect(state.message.value).toBe("正在请求百炼生成选题");
    release();
    await run;
    expect(state.phase.value).toBe("success");
    expect(state.progress.value).toBe(100);
  });

  it("keeps a retry callback and actionable Chinese error", async () => {
    const operation = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("401 API key required"))
      .mockResolvedValueOnce();
    const state = createOperationState();

    await expect(
      state.run(operation, {
        phase: "requesting",
        progress: 45,
        message: "正在生成"
      })
    ).rejects.toThrow();

    expect(state.phase.value).toBe("error");
    expect(state.error.value?.title).toBe("服务授权失效");
    expect(state.error.value?.action).toContain("系统设置");
    await state.retry();
    expect(operation).toHaveBeenCalledTimes(2);
    expect(state.phase.value).toBe("success");
  });
});
