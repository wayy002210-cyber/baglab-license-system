import { describe, expect, it } from "vitest";
import { buildDeviceFingerprint, normalizeHardwareValue } from "../../electron/license/device";

describe("license device identity", () => {
  it("normalizes noisy hardware values deterministically", () => {
    expect(normalizeHardwareValue("  Ab-C  12\r\n")).toBe("AB-C 12");
  });
  it("hashes available hardware and installation id without exposing raw values", () => {
    const first=buildDeviceFingerprint({machineGuid:"guid",boardUuid:"board",volumeSerial:"disk",cpu:"cpu",installationId:"install"});
    const second=buildDeviceFingerprint({machineGuid:"GUID",boardUuid:"BOARD",volumeSerial:"DISK",cpu:"CPU",installationId:"INSTALL"});
    expect(first).toEqual(second); expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/); expect(first.shortCode).toHaveLength(12); expect(JSON.stringify(first)).not.toContain("GUID");
  });
  it("remains usable when individual probes fail",()=>{expect(buildDeviceFingerprint({machineGuid:null,boardUuid:null,volumeSerial:null,cpu:"cpu",installationId:"install"}).fingerprint).toMatch(/^[a-f0-9]{64}$/)});
});
