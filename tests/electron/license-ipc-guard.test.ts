import { describe, expect, it, vi } from "vitest";
import { createLicensedHandler } from "../../electron/license/ipc-guard";

describe("createLicensedHandler", () => {
  it("rejects the business handler when the coordinator denies access", async () => {
    const handler = vi.fn();
    const guarded = createLicensedHandler(
      { assertAllowed: () => { throw new Error("LICENSE_REQUIRED"); } },
      handler
    );

    await expect(guarded({}, "payload")).rejects.toThrow("LICENSE_REQUIRED");
    expect(handler).not.toHaveBeenCalled();
  });

  it("runs the business handler after the license check succeeds", async () => {
    const handler = vi.fn(async (_event, value: string) => `ok:${value}`);
    const guarded = createLicensedHandler({ assertAllowed: () => undefined }, handler);

    await expect(guarded({}, "payload")).resolves.toBe("ok:payload");
  });
});
