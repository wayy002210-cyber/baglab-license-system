import { z } from "zod";

const sha256 = z.string().regex(/^[a-f0-9]{64}$/i);
export const activateRequestSchema = z.object({
  activationCode: z.string().min(12).max(128), deviceFingerprint: sha256,
  installationIdHash: sha256, buildId: z.string().min(1).max(64)
}).strict();
export const validateRequestSchema = z.object({
  licenseId: z.uuid(), deviceFingerprint: sha256, buildId: z.string().min(1).max(64)
}).strict();
export const refreshRequestSchema = validateRequestSchema;

export function apiError(code: string, message: string, status: number) {
  return { status, body: { ok: false as const, error: { code, message } } };
}
