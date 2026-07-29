import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const electronVersion = "41.10.3";
const electronRebuild = join(
  root,
  "node_modules",
  "@electron",
  "rebuild",
  "lib",
  "cli.js"
);
const builder = join(root, "node_modules", "electron-builder", "cli.js");
const nativeVerifier = join(
  root,
  "scripts",
  "verify-packaged-native-modules.mjs"
);
const preloadVerifier = join(root, "scripts", "verify-preload-bundle.mjs");

const preloadVerification = spawnSync(process.execPath, [preloadVerifier], {
  stdio: "inherit",
  windowsHide: true
});
if (preloadVerification.status !== 0) {
  throw new Error(
    `preload bundle verification failed with exit code ${preloadVerification.status}`
  );
}

const rebuild = spawnSync(
  process.execPath,
  [
    electronRebuild,
    "-f",
    "-o",
    "better-sqlite3",
    "-v",
    electronVersion
  ],
  { stdio: "inherit", windowsHide: true }
);
if (rebuild.status !== 0) {
  throw new Error(
    `electron native rebuild failed with exit code ${rebuild.status}`
  );
}

const build = spawnSync(
  process.execPath,
  [builder, "--win", "nsis", "--publish", "never"],
  {
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      ELECTRON_BUILDER_BINARIES_MIRROR:
        process.env.ELECTRON_BUILDER_BINARIES_MIRROR ??
        "https://npmmirror.com/mirrors/electron-builder-binaries/"
    }
  }
);
const nativeVerification =
  build.status === 0
    ? spawnSync(process.execPath, [nativeVerifier], {
        stdio: "inherit",
        windowsHide: true
      })
    : { status: null };

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const restore = spawnSync(
  npmCommand,
  ["rebuild", "better-sqlite3", "keytar"],
  { stdio: "inherit", windowsHide: true, shell: process.platform === "win32" }
);
if (restore.status !== 0) {
  throw new Error(`native module restore failed with exit code ${restore.status}`);
}
if (build.status !== 0) {
  throw new Error(`electron-builder failed with exit code ${build.status}`);
}
if (nativeVerification.status !== 0) {
  throw new Error(
    `packaged native verification failed with exit code ${nativeVerification.status}`
  );
}
