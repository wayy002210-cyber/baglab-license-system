import { decodeProtectedHeader, importJWK, SignJWT, jwtVerify, type JWK } from "jose";
import { z } from "zod";
import type { LicenseCredential } from "../domain/license";

const credentialSchema = z.object({
  version: z.literal(1), licenseId: z.string().min(1), deviceFingerprint: z.string().min(1),
  plan: z.enum(["day1", "day3", "day7", "month", "year", "permanent"]),
  status: z.enum(["active", "disabled", "expired"]), issuedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime().nullable(), offlineUntil: z.iso.datetime(), minimumBuildId: z.string().min(1)
});

export async function signCredential(claims: LicenseCredential, privateJwk: JWK): Promise<string> {
  const key = await importJWK(privateJwk, "EdDSA");
  return new SignJWT({ license: claims }).setProtectedHeader({ alg: "EdDSA", typ: "JWT" }).sign(key);
}

export async function verifyCredential(token: string, publicJwk: JWK): Promise<LicenseCredential> {
  if (decodeProtectedHeader(token).alg !== "EdDSA") throw new Error("Unsupported credential algorithm");
  const key = await importJWK(publicJwk, "EdDSA");
  const verified = await jwtVerify(token, key, { algorithms: ["EdDSA"] });
  return credentialSchema.parse(verified.payload.license);
}
