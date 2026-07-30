import { existsSync, readdirSync, realpathSync } from "node:fs";
import { basename, extname, join } from "node:path";

export type SystemFont = {
  id: string;
  displayName: string;
  family: string;
  path: string;
  extension: "ttf" | "otf" | "ttc";
};

const SUPPORTED_EXTENSIONS = new Set([".ttf", ".otf", ".ttc"]);

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
  directories = defaultFontDirectories()
): SystemFont[] {
  const paths = new Set<string>();
  for (const directory of directories) {
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

  return [...paths]
    .map((path) => {
      const extension = extname(path).slice(1).toLowerCase() as
        | "ttf"
        | "otf"
        | "ttc";
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
