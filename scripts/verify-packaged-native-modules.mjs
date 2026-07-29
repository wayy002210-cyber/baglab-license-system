import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { extractAll } from "@electron/asar";

const root = process.cwd();
const resources = join(root, "release", "win-unpacked", "resources");
const extracted = mkdtempSync(join(tmpdir(), "autocut-native-check-"));
const executable = join(
  root,
  "release",
  "win-unpacked",
  "全自动混剪工作台.exe"
);

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
