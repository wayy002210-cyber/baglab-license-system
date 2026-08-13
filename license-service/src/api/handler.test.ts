import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createJsonHandler } from "./handler";
import { ActivationError } from "../domain/activation-service";

describe("JSON handler", () => {
  it("validates requests and maps domain errors without stack details", async () => {
    const handler = createJsonHandler(z.object({ value: z.string().min(2) }), async () => { throw new ActivationError("LICENSE_DISABLED", "授权已被禁用"); });
    expect(await handler({ value: "x" }, "request-1")).toMatchObject({ status: 400, body: { error: { code: "INVALID_REQUEST" } } });
    expect(await handler({ value: "ok" }, "request-2")).toEqual({ status: 403, body: { ok: false, error: { code: "LICENSE_DISABLED", message: "授权已被禁用" }, requestId: "request-2" } });
  });

  it("returns successful data with request id", async () => {
    const handler = createJsonHandler(z.object({ value: z.string() }), async ({ value }) => ({ value }));
    expect(await handler({ value: "ok" }, "r1")).toEqual({ status: 200, body: { ok: true, data: { value: "ok" }, requestId: "r1" } });
  });
});
