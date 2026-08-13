import { createHmac } from "node:crypto";

export const OFFLINE_GRACE_MS = 72 * 3_600_000;
export type LicensePlan = "day1" | "day3" | "day7" | "month" | "year" | "permanent";
export type LicenseStatus = "active" | "disabled" | "expired";

const PLAN_HOURS: Record<Exclude<LicensePlan, "permanent">, number> = {
  day1: 24, day3: 72, day7: 168, month: 30 * 24, year: 365 * 24
};

export interface LicenseCredential {
  version: 1;
  licenseId: string;
  deviceFingerprint: string;
  plan: LicensePlan;
  status: LicenseStatus;
  issuedAt: string;
  expiresAt: string | null;
  offlineUntil: string;
  minimumBuildId: string;
}

export function calculateExpiry(plan: LicensePlan, activatedAt: Date): Date | null {
  if (plan === "permanent") return null;
  return new Date(activatedAt.getTime() + PLAN_HOURS[plan] * 3_600_000);
}

export function normalizeActivationCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashActivationCode(value: string, pepper: string): string {
  return createHmac("sha256", pepper).update(normalizeActivationCode(value)).digest("hex");
}

export function canonicalCredential(value: LicenseCredential): string {
  return JSON.stringify(value);
}
