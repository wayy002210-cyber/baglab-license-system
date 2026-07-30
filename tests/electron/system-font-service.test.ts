import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanSystemFonts } from "../../electron/services/system-font-service";

const roots: string[] = [];
afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});
const createTempDirectory = (prefix: string) =>
  mkdtempSync(join(tmpdir(), prefix));

describe("scanSystemFonts", () => {
  it("scans Windows and per-user font directories deterministically", () => {
    const system = createTempDirectory("font-system-");
    const user = createTempDirectory("font-user-");
    roots.push(system, user);
    writeFileSync(join(system, "Microsoft YaHei.ttf"), "font");
    writeFileSync(join(system, "SourceHanSans.ttc"), "font");
    writeFileSync(join(user, "BagLab Display.otf"), "font");
    writeFileSync(join(user, "ignore.txt"), "not-font");

    const fonts = scanSystemFonts([system, user]);

    expect(fonts.map((font) => font.displayName)).toEqual([
      "BagLab Display",
      "Microsoft YaHei",
      "SourceHanSans"
    ]);
    expect(fonts.map((font) => font.extension)).toEqual(["otf", "ttf", "ttc"]);
  });

  it("ignores missing directories and duplicate resolved paths", () => {
    const system = createTempDirectory("font-deduplicate-");
    roots.push(system);
    writeFileSync(join(system, "A.ttf"), "font");

    expect(
      scanSystemFonts([join(system, "missing"), system, system])
    ).toHaveLength(1);
  });
});
