import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Windows installer build preservation", () => {
  it("never recursively deletes the release directory", () => {
    const script = readFileSync("scripts/build-installer.mjs", "utf8");

    expect(script).not.toMatch(/rmSync\(join\(root,\s*["']release["']\)/);
    expect(script).not.toMatch(/Remove-Item.*release/i);
  });
});
