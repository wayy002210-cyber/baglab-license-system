import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Windows upgrade installer", () => {
  it("terminates stale backend process trees before replacing packaged files", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve("package.json"), "utf8")
    ) as { build: { nsis: { include?: string } } };
    expect(packageJson.build.nsis.include).toBe("build/installer.nsh");

    const include = readFileSync(resolve("build/installer.nsh"), "utf8");
    expect(include).toContain("taskkill");
    expect(include).toContain("/T");
    expect(include).toContain("autocut-backend.exe");
  });
});
