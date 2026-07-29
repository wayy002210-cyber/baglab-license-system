import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";

const builder = join(
  process.cwd(),
  "node_modules",
  "electron-builder",
  "cli.js"
);
const result = spawnSync(process.execPath, [builder, "--win", "nsis", "--publish", "never"], {
  stdio: "inherit",
  windowsHide: true,
  env: {
    ...process.env,
    ELECTRON_BUILDER_BINARIES_MIRROR:
      process.env.ELECTRON_BUILDER_BINARIES_MIRROR ??
      "https://npmmirror.com/mirrors/electron-builder-binaries/"
  }
});
const restore = spawnSync(
  process.execPath,
  [
    join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    "rebuild",
    "better-sqlite3",
    "keytar"
  ],
  { stdio: "inherit", windowsHide: true }
);
if (restore.status !== 0) {
  throw new Error(`native module restore failed with exit code ${restore.status}`);
}
if (result.status !== 0) {
  throw new Error(`electron-builder failed with exit code ${result.status}`);
}
