import { createHash } from "node:crypto";

export interface HardwareIdentity { machineGuid: string|null; boardUuid: string|null; volumeSerial: string|null; cpu: string|null; installationId: string }
export function normalizeHardwareValue(value:string):string{return value.trim().replace(/\s+/g," ").toUpperCase()}
export function buildDeviceFingerprint(input:HardwareIdentity){
  const parts=[input.machineGuid,input.boardUuid,input.volumeSerial,input.cpu,input.installationId].map(value=>value?normalizeHardwareValue(value):"MISSING");
  const fingerprint=createHash("sha256").update(parts.join("\u001f")).digest("hex");
  const installationIdHash=createHash("sha256").update(normalizeHardwareValue(input.installationId)).digest("hex");
  return {fingerprint,installationIdHash,shortCode:fingerprint.slice(0,12).toUpperCase()};
}
