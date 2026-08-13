import { describe, expect, it } from "vitest";
import {
  OFFLINE_GRACE_MS,
  calculateExpiry,
  canonicalCredential,
  hashActivationCode,
  normalizeActivationCode,
  type LicenseCredential
} from "./license";

describe("license domain", () => {
  const activatedAt = new Date("2026-08-13T00:00:00.000Z");

  it.each([
    ["day1", 24], ["day3", 72], ["day7", 168],
    ["month", 30 * 24], ["year", 365 * 24]
  ] as const)("calculates %s from server activation time", (plan, hours) => {
    expect(calculateExpiry(plan, activatedAt)?.toISOString()).toBe(
      new Date(activatedAt.getTime() + hours * 3_600_000).toISOString()
    );
  });

  it("gives permanent licenses no business expiry", () => {
    expect(calculateExpiry("permanent", activatedAt)).toBeNull();
  });

  it("normalizes formatting before hashing without storing plaintext", () => {
    expect(normalizeActivationCode(" bagl-abcd-1234 ")).toBe("BAGLABCD1234");
    expect(hashActivationCode("bagl-abcd-1234", "pepper")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashActivationCode("bagl-abcd-1234", "pepper")).toBe(
      hashActivationCode("BAGL ABCD 1234", "pepper")
    );
  });

  it("canonicalizes signed credentials deterministically", () => {
    const credential: LicenseCredential = {
      version: 1, licenseId: "lic_1", deviceFingerprint: "abc", plan: "day1",
      status: "active", issuedAt: "2026-08-13T00:00:00.000Z",
      expiresAt: "2026-08-14T00:00:00.000Z",
      offlineUntil: "2026-08-14T00:00:00.000Z", minimumBuildId: "0.7.0"
    };
    expect(canonicalCredential(credential)).toBe(JSON.stringify(credential));
    expect(OFFLINE_GRACE_MS).toBe(72 * 3_600_000);
  });
});
