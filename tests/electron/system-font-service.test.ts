import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parsePowerShellFontEntries, parseRegistryFontEntries, parseRegistryFontPaths, scanSystemFonts } from "../../electron/services/system-font-service";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
const createTempDirectory = (prefix: string) => mkdtempSync(join(tmpdir(), prefix));

describe("parseRegistryFontPaths", () => {
  it("preserves Chinese names returned as UTF-8 JSON by PowerShell", () => {
    expect(parsePowerShellFontEntries('[{"family":"郑庆科黄油体 Regular20170516 (TrueType)","path":"zqkhy.ttf"}]', "C:\\Windows")).toEqual([
      { family: "郑庆科黄油体 Regular20170516", path: "C:\\Windows\\Fonts\\zqkhy.ttf" }
    ]);
  });
  it("resolves system-relative, legacy, and external installed font files", () => {
    const output = [
      "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts",
      "    测试字体 (TrueType)    REG_SZ    TestFont.ttf",
      "    外部字体 (OpenType)    REG_SZ    D:\\Fonts\\External.otf",
      "    旧式字体 (Raster)    REG_SZ    Legacy.fon"
    ].join("\r\n");
    expect(parseRegistryFontPaths(output, "C:\\Windows")).toEqual([
      "C:\\Windows\\Fonts\\TestFont.ttf",
      "D:\\Fonts\\External.otf",
      "C:\\Windows\\Fonts\\Legacy.fon"
    ]);
  });

  it("keeps the installed Windows family name instead of guessing it from the file name", () => {
    const output = "    郑庆科黄油体 Regular20170516 (TrueType)    REG_SZ    zqkhy.ttf";
    expect(parseRegistryFontEntries(output, "C:\\Windows")).toEqual([
      { family: "郑庆科黄油体 Regular20170516", path: "C:\\Windows\\Fonts\\zqkhy.ttf" }
    ]);
  });
});

describe("scanSystemFonts", () => {
  it("scans all supported Windows font formats deterministically", () => {
    const system = createTempDirectory("font-system-");
    const user = createTempDirectory("font-user-");
    roots.push(system, user);
    writeFileSync(join(system, "Microsoft YaHei.ttf"), "font");
    writeFileSync(join(system, "SourceHanSans.ttc"), "font");
    writeFileSync(join(user, "BagLab Display.otf"), "font");
    writeFileSync(join(user, "Variable Collection.otc"), "font");
    writeFileSync(join(user, "Terminal.fon"), "font");
    writeFileSync(join(user, "Fixed.fnt"), "font");
    writeFileSync(join(user, "ignore.txt"), "not-font");
    const fonts = scanSystemFonts([system, user]);
    expect(fonts.map((font) => font.displayName)).toEqual([
      "BagLab Display", "Fixed", "Microsoft YaHei", "SourceHanSans", "Terminal", "Variable Collection"
    ]);
    expect(fonts.map((font) => font.extension)).toEqual(["otf", "fnt", "ttf", "ttc", "fon", "otc"]);
  });

  it("ignores missing directories and duplicate resolved paths", () => {
    const system = createTempDirectory("font-deduplicate-");
    roots.push(system);
    writeFileSync(join(system, "A.ttf"), "font");
    expect(scanSystemFonts([join(system, "missing"), system, system])).toHaveLength(1);
  });
});
