import { existsSync, readdirSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, extname, isAbsolute, join } from "node:path";

export type SystemFont = {
  id: string;
  displayName: string;
  family: string;
  path: string;
  extension: "ttf" | "otf" | "ttc" | "otc" | "fon" | "fnt";
};

export type RegistryFontEntry = { family: string; path: string };

const SUPPORTED_EXTENSIONS = new Set([".ttf", ".otf", ".ttc", ".otc", ".fon", ".fnt"]);

export function parseRegistryFontEntries(
  output: string,
  windowsDirectory = process.env.WINDIR ?? "C:\\Windows"
): RegistryFontEntry[] {
  const entries: RegistryFontEntry[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*(.+?)\s+REG_(?:SZ|EXPAND_SZ)\s+(.+?)\s*$/i);
    if (!match) continue;
    const family = match[1].replace(/\s+\((?:TrueType|OpenType|Raster)\)\s*$/i, "").trim();
    const value = match[2].replace(/%WINDIR%/gi, windowsDirectory).trim();
    if (!SUPPORTED_EXTENSIONS.has(extname(value).toLowerCase())) continue;
    entries.push({
      family,
      path: isAbsolute(value) ? value : join(windowsDirectory, "Fonts", value)
    });
  }
  return entries;
}

export function parseRegistryFontPaths(
  output: string,
  windowsDirectory = process.env.WINDIR ?? "C:\\Windows"
): string[] {
  return parseRegistryFontEntries(output, windowsDirectory).map((entry) => entry.path);
}

function registryFontEntries(): RegistryFontEntry[] {
  const entries: RegistryFontEntry[] = [];
  for (const root of ["HKLM", "HKCU"]) {
    const result = spawnSync(
      "reg.exe",
      ["query", `${root}\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts`],
      { windowsHide: true, encoding: "utf8" }
    );
    if (result.status === 0 && result.stdout) {
      entries.push(...parseRegistryFontEntries(result.stdout));
    }
  }
  return entries;
}

export function defaultFontDirectories(): string[] {
  const windowsDirectory = process.env.WINDIR ?? "C:\\Windows";
  const localAppData = process.env.LOCALAPPDATA ?? "";
  return [
    join(windowsDirectory, "Fonts"),
    ...(localAppData
      ? [join(localAppData, "Microsoft", "Windows", "Fonts")]
      : [])
  ];
}

export function scanSystemFonts(
  directories?: string[]
): SystemFont[] {
  const resolvedDirectories = directories ?? defaultFontDirectories();
  const paths = new Set<string>();
  const registryFamilies = new Map<string, string>();
  for (const directory of resolvedDirectories) {
    if (!existsSync(directory)) continue;
    try {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const extension = extname(entry.name).toLowerCase();
        if (!SUPPORTED_EXTENSIONS.has(extension)) continue;
        const absolutePath = realpathSync(join(directory, entry.name));
        paths.add(absolutePath);
      }
    } catch {
      // A protected or transient font directory must not block the editor.
    }
  }
  if (!directories) {
    for (const entry of registryFontEntries()) {
      const path = entry.path;
      if (!existsSync(path)) continue;
      try {
        const resolved = realpathSync(path);
        paths.add(resolved);
        registryFamilies.set(resolved.toLocaleLowerCase("en-US"), entry.family);
      } catch {
        // Ignore stale registry entries.
      }
    }
  }

  return [...paths]
    .map((path) => {
      const extension = extname(path).slice(1).toLowerCase() as
        | "ttf"
        | "otf"
        | "ttc"
        | "otc"
        | "fon"
        | "fnt";
      const fallbackName = basename(path, extname(path))
        .replace(/[_-]+/g, " ")
        .trim();
      const displayName = registryFamilies.get(path.toLocaleLowerCase("en-US")) ?? fallbackName;
      return {
        id: path.toLocaleLowerCase("en-US"),
        displayName,
        family: displayName,
        path,
        extension
      };
    })
    .sort((left, right) =>
      left.displayName.localeCompare(right.displayName, "zh-CN")
    );
}
