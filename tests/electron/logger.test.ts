import { describe, expect, it } from "vitest";
import { redactSensitive } from "../../electron/logger";

describe("redactSensitive", () => {
  it("redacts nested credentials, cookies and authorization headers", () => {
    expect(redactSensitive({
      apiKey: "secret-key",
      headers: { Authorization: "Bearer token", Cookie: "sid=123" },
      safe: "visible"
    })).toEqual({
      apiKey: "[REDACTED]",
      headers: { Authorization: "[REDACTED]", Cookie: "[REDACTED]" },
      safe: "visible"
    });
  });

  it("redacts bearer tokens embedded in messages", () => {
    expect(redactSensitive("request Authorization: Bearer abc.def.ghi failed"))
      .toBe("request Authorization: [REDACTED] failed");
  });

  it("serializes error name and message for diagnostics", () => {
    expect(redactSensitive(new Error("encoder unavailable"))).toEqual({
      name: "Error",
      message: "encoder unavailable"
    });
  });
});
