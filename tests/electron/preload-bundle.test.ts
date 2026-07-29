import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("packaged preload bridge", () => {
  it("bundles runtime dependencies so the sandbox can expose the asset scanner", () => {
    const preload = readFileSync(
      resolve("dist-electron/preload/preload.mjs"),
      "utf8"
    );

    expect(preload).toContain('exposeInMainWorld("autocut"');
    expect(preload).toContain("selectAndScanAssets");
    expect(preload).not.toMatch(/from\s+["']zod["']/);
  });
});
