import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const electronVersion = JSON.parse(
  readFileSync(join(root, "node_modules", "electron", "package.json"), "utf8")
).version;
const builder = join(root, "node_modules", "electron-builder", "cli.js");
const nativeVerifier = join(
  root,
  "scripts",
  "verify-packaged-native-modules.mjs"
);
const preloadVerifier = join(root, "scripts", "verify-preload-bundle.mjs");
const runtimePreparer = join(root, "scripts", "prepare-runtime.mjs");

const runtimePreparation = spawnSync(process.execPath, [runtimePreparer], {
  stdio: "inherit",
  windowsHide: true
});
if (runtimePreparation.status !== 0) {
  throw new Error(
    `runtime preparation failed with exit code ${runtimePreparation.status}`
  );
}

const preloadVerification = spawnSync(process.execPath, [preloadVerifier], {
  stdio: "inherit",
  windowsHide: true
});
if (preloadVerification.status !== 0) {
  throw new Error(
    `preload bundle verification failed with exit code ${preloadVerification.status}`
  );
}

const pnpmDirectory = join(root, "node_modules", ".pnpm");
const electronRebuildDirectory = readdirSync(pnpmDirectory).find((name) =>
  name.startsWith("@electron+rebuild@")
);
if (!electronRebuildDirectory) throw new Error("@electron/rebuild is not installed");
const electronRebuild = join(
  pnpmDirectory,
  electronRebuildDirectory,
  "node_modules",
  "@electron",
  "rebuild",
  "lib",
  "cli.js"
);
const rebuild = spawnSync(
  process.execPath,
  [electronRebuild, "-f", "-w", "better-sqlite3", "-w", "keytar", "-v", electronVersion],
  { stdio: "inherit", windowsHide: true }
);
if (rebuild.status !== 0) {
  throw new Error(
    `electron native rebuild failed with exit code ${rebuild.status}`
  );
}

const electronExecutable = join(root, "node_modules", "electron", "dist", "electron.exe");
const workspaceNativeProbe = spawnSync(
  electronExecutable,
  [
    "-e",
    "const D=require('better-sqlite3');const d=new D(':memory:');require('keytar');d.close();"
  ],
  {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }
  }
);
if (workspaceNativeProbe.status !== 0) {
  throw new Error(
    `workspace Electron native probe failed with exit code ${workspaceNativeProbe.status}`
  );
}

rmSync(join(root, "release"), { recursive: true, force: true });

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
  rmSync(join(root, "release"), { recursive: true, force: true });
  throw new Error(
    `packaged native verification failed with exit code ${nativeVerification.status}`
  );
}
