import { randomBytes } from "node:crypto";
import type { LicensePlan } from "../domain/license";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function segment(): string { const bytes = randomBytes(5); return [...bytes].map((value) => ALPHABET[value % ALPHABET.length]).join(""); }
export function generateActivationCodes(plan: LicensePlan, count: number): Array<{ plaintext: string; plan: LicensePlan }> {
  if (!Number.isInteger(count) || count < 1 || count > 500) throw new Error("Batch size must be 1-500");
  const seen = new Set<string>(); const result: Array<{ plaintext: string; plan: LicensePlan }> = [];
  while (result.length < count) { const plaintext = `BAGL-${segment()}-${segment()}-${segment()}`; if (!seen.has(plaintext)) { seen.add(plaintext); result.push({ plaintext, plan }); } }
  return result;
}
