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

const SUPPORTED_EXTENSIONS = new Set([".ttf", ".otf", ".ttc", ".otc", ".fon", ".fnt"]);

export function parseRegistryFontPaths(
  output: string,
  windowsDirectory = process.env.WINDIR ?? "C:\\Windows"
): string[] {
  const paths: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/\s+REG_(?:SZ|EXPAND_SZ)\s+(.+?)\s*$/i);
    if (!match) continue;
    const value = match[1].replace(/%WINDIR%/gi, windowsDirectory).trim();
    if (!SUPPORTED_EXTENSIONS.has(extname(value).toLowerCase())) continue;
    paths.push(isAbsolute(value) ? value : join(windowsDirectory, "Fonts", value));
  }
  return paths;
}

function registryFontPaths(): string[] {
  const paths: string[] = [];
  for (const root of ["HKLM", "HKCU"]) {
    const result = spawnSync(
      "reg.exe",
      ["query", `${root}\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts`],
      { windowsHide: true, encoding: "utf8" }
    );
    if (result.status === 0 && result.stdout) {
      paths.push(...parseRegistryFontPaths(result.stdout));
    }
  }
  return paths;
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
    for (const path of registryFontPaths()) {
      if (!existsSync(path)) continue;
      try {
        paths.add(realpathSync(path));
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
      const displayName = basename(path, extname(path))
        .replace(/[_-]+/g, " ")
        .trim();
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
