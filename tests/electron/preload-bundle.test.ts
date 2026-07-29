import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("packaged preload bridge", () => {
  it("bundles runtime dependencies so the sandbox can expose the asset scanner", () => {
    const preloadPath = resolve("dist-electron/preload/preload.cjs");
    expect(existsSync(preloadPath)).toBe(true);
    const preload = readFileSync(preloadPath, "utf8");

    expect(preload).toContain('exposeInMainWorld("autocut"');
    expect(preload).toContain("selectAndScanAssets");
    expect(preload).toContain("getCopyModelSettings");
    expect(preload).toContain("listReferenceScripts");
    expect(preload).toContain("generateTopics");
    expect(preload).toContain("generateCopywriting");
    expect(preload).toContain("checkCopywritingCompliance");
    expect(preload).toContain("selectVoiceSample");
    expect(preload).toContain("validateVoiceSample");
    expect(preload).toContain("cloneVoice");
    expect(preload).toContain("getVoiceCapabilities");
    expect(preload).toMatch(/require\(["']electron["']\)/);
    expect(preload).not.toMatch(/^\s*import\s/m);
    expect(preload).not.toMatch(/from\s+["']zod["']/);
  });
});
