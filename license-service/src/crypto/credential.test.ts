import { generateKeyPair, exportJWK } from "jose";
import { describe, expect, it } from "vitest";
import { signCredential, verifyCredential } from "./credential";
import type { LicenseCredential } from "../domain/license";

describe("signed credential", () => {
  it("verifies authentic claims and rejects tampering", async () => {
    const keys = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
    const privateJwk = await exportJWK(keys.privateKey); const publicJwk = await exportJWK(keys.publicKey);
    const claims: LicenseCredential = { version: 1, licenseId: "l1", deviceFingerprint: "d1", plan: "day1", status: "active", issuedAt: "2026-08-13T00:00:00.000Z", expiresAt: "2026-08-14T00:00:00.000Z", offlineUntil: "2026-08-14T00:00:00.000Z", minimumBuildId: "0.7.0" };
    const signed = await signCredential(claims, privateJwk);
    await expect(verifyCredential(signed, publicJwk)).resolves.toEqual(claims);
    const [payload, signature] = signed.split(".");
    await expect(verifyCredential(`${payload.slice(0, -1)}A.${signature}`, publicJwk)).rejects.toThrow();
  });
});
