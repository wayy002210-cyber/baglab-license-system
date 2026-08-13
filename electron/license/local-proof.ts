import { createHmac } from "node:crypto";

export function issueLocalLicenseProof(input: {
  secret: string;
  buildId: string;
  deviceFingerprint: string;
  nowMs?: number;
  lifetimeSeconds?: number;
}): string {
  const expiresAt = Math.floor((input.nowMs ?? Date.now()) / 1000) + (input.lifetimeSeconds ?? 120);
  const payload = Buffer.from(JSON.stringify({
    buildId: input.buildId,
    deviceFingerprint: input.deviceFingerprint,
    expiresAt
  })).toString("base64url");
  const signature = createHmac("sha256", input.secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
