import { describe, expect, it } from "vitest";
import { activateRequestSchema, validateRequestSchema, apiError } from "./contracts";

describe("API contracts", () => {
  it("accepts hashed device identifiers and rejects malformed input", () => {
    const hash = "a".repeat(64);
    expect(activateRequestSchema.parse({ activationCode: "BAGL-AAAA-BBBB-CCCC", deviceFingerprint: hash, installationIdHash: hash, buildId: "0.7.0" }).buildId).toBe("0.7.0");
    expect(() => activateRequestSchema.parse({ activationCode: "x", deviceFingerprint: "raw-hardware", installationIdHash: hash, buildId: "0.7.0" })).toThrow();
  });

  it("requires license identity for validation", () => {
    expect(() => validateRequestSchema.parse({ licenseId: "", deviceFingerprint: "a".repeat(64), buildId: "0.7.0" })).toThrow();
  });

  it("returns stable sanitized errors", () => {
    expect(apiError("LICENSE_DISABLED", "授权已被禁用", 403)).toEqual({ status: 403, body: { ok: false, error: { code: "LICENSE_DISABLED", message: "授权已被禁用" } } });
  });
});
