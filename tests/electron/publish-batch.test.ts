import { describe, expect, it, vi } from "vitest";
import { runPublishBatch } from "../../electron/publish-batch";

describe("runPublishBatch", () => {
  it("continues after a failed or human-review task", async () => {
    const run = vi.fn(async (id: string) => {
      if (id === "needs-human") throw new Error("页面控件未匹配");
      return id === "ok";
    });

    const result = await runPublishBatch(["needs-human", "failed", "ok"], run);

    expect(run.mock.calls.map(([id]) => id)).toEqual(["needs-human", "failed", "ok"]);
    expect(result).toEqual({ total: 3, succeeded: 1, failed: 2 });
  });
});
