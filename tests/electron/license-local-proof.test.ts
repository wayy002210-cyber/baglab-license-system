import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { issueLocalLicenseProof } from "../../electron/license/local-proof";

describe("issueLocalLicenseProof", () => {
  it("signs short-lived build and device claims with the backend session secret", () => {
    const proof = issueLocalLicenseProof({
      secret: "session-secret",
      buildId: "0.7.0-test",
      deviceFingerprint: "device-a",
      nowMs: Date.UTC(2026, 7, 13),
      lifetimeSeconds: 60
    });
    const [payload, signature] = proof.split(".");
    const expected = createHmac("sha256", "session-secret")
      .update(payload)
      .digest("base64url");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));

    expect(signature).toBe(expected);
    expect(claims).toEqual({
      buildId: "0.7.0-test",
      deviceFingerprint: "device-a",
      expiresAt: 1786579260
    });
  });
});
