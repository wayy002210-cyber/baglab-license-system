import { describe, expect, it, vi } from "vitest";
import { reportStartupFailure } from "../../electron/startup";

describe("reportStartupFailure", () => {
  it("logs and shows a readable startup error", () => {
    const write = vi.fn();
    const showError = vi.fn();

    const message = reportStartupFailure(
      new Error("native module ABI mismatch"),
      { write },
      showError
    );

    expect(message).toBe("native module ABI mismatch");
    expect(write).toHaveBeenCalledWith(
      "error",
      "application.start_failed",
      expect.objectContaining({ error: expect.any(Error) })
    );
    expect(showError).toHaveBeenCalledWith(
      "全自动混剪工作台启动失败",
      expect.stringContaining("native module ABI mismatch")
    );
  });
});
