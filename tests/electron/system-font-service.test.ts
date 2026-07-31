import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseRegistryFontPaths,
  scanSystemFonts
} from "../../electron/services/system-font-service";

const roots: string[] = [];
afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

describe("parseRegistryFontPaths", () => {
  it("resolves system-relative and external installed font files", () => {
    const output = [
      "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts",
      "    测试字体 (TrueType)    REG_SZ    TestFont.ttf",
      "    外部字体 (OpenType)    REG_SZ    D:\\Fonts\\External.otf",
      "    不支持字体    REG_SZ    Legacy.fon"
    ].join("\r\n");

    expect(parseRegistryFontPaths(output, "C:\\Windows")).toEqual([
      "C:\\Windows\\Fonts\\TestFont.ttf",
      "D:\\Fonts\\External.otf"
    ]);
  });
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
    writeFileSync(join(user, "Variable Collection.otc"), "font");
    writeFileSync(join(user, "ignore.txt"), "not-font");

    const fonts = scanSystemFonts([system, user]);

    expect(fonts.map((font) => font.displayName)).toEqual([
      "BagLab Display",
      "Microsoft YaHei",
      "SourceHanSans",
      "Variable Collection"
    ]);
    expect(fonts.map((font) => font.extension)).toEqual(["otf", "ttf", "ttc", "otc"]);
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
