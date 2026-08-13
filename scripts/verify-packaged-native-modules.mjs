import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pnpmDirectory = join(process.cwd(), "node_modules", ".pnpm");
const asarDirectory = readdirSync(pnpmDirectory).find((name) =>
  name.startsWith("@electron+asar@")
);
if (!asarDirectory) throw new Error("@electron/asar is not installed");
const { extractAll } = require(
  join(pnpmDirectory, asarDirectory, "node_modules", "@electron", "asar")
);

const root = process.cwd();
const outputArgument = process.argv.find((argument) =>
  argument.startsWith("--output=")
);
const installedArgument = process.argv.find((argument) =>
  argument.startsWith("--installed=")
);
const outputDirectory =
  outputArgument?.slice("--output=".length) ??
  process.env.PACKAGED_OUTPUT ??
  "release";
const installedDirectory = installedArgument?.slice("--installed=".length);
const unpackedDirectory = installedDirectory
  ? installedDirectory
  : join(root, outputDirectory, "win-unpacked");
const resources = join(unpackedDirectory, "resources");
const extracted = mkdtempSync(join(tmpdir(), "autocut-native-check-"));
const executableName = readdirSync(unpackedDirectory).find((name) => {
  const lowerName = name.toLowerCase();
  return lowerName.endsWith(".exe") && !lowerName.startsWith("uninstall");
});
if (!executableName) {
  throw new Error(`No packaged executable found in ${unpackedDirectory}`);
}
const executable = join(unpackedDirectory, executableName);

try {
  extractAll(join(resources, "app.asar"), extracted);
  for (const relativePath of [
    "node_modules/better-sqlite3/build/Release/better_sqlite3.node",
    "node_modules/keytar/build/Release/keytar.node"
  ]) {
    const destination = join(extracted, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(
      join(resources, "app.asar.unpacked", relativePath),
      destination
    );
  }

  const probe = [
    `const Database = require(${JSON.stringify(
      join(extracted, "node_modules", "better-sqlite3")
    )});`,
    "const database = new Database(':memory:');",
    "database.prepare('SELECT 1').get();",
    "database.close();",
    `require(${JSON.stringify(join(extracted, "node_modules", "keytar"))});`,
    "process.stdout.write('Packaged native modules loaded successfully\\n');"
  ].join("");
  const result = spawnSync(executable, ["-e", probe], {
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }
  });
  if (result.status !== 0) {
    throw new Error(
      `Packaged native module check failed:\n${result.stderr || result.stdout}`
    );
  }
  process.stdout.write(result.stdout);
} finally {
  rmSync(extracted, { recursive: true, force: true });
}
