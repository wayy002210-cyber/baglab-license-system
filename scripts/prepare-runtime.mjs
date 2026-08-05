import { cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const resources = join(root, "build-resources");
const backendOutput = join(resources, "backend");
const binOutput = join(resources, "bin");
rmSync(resources, { recursive: true, force: true });
mkdirSync(backendOutput, { recursive: true });
mkdirSync(binOutput, { recursive: true });

function locate(command) {
  const result = spawnSync("where.exe", [command], {
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) throw new Error(`${command} is not installed`);
  return result.stdout.trim().split(/\r?\n/)[0];
}

for (const executable of ["ffmpeg.exe", "ffprobe.exe"]) {
  cpSync(locate(executable), join(binOutput, executable));
}

const pyinstaller = spawnSync(
  process.env.PYTHON ?? "python",
  [
    "-m",
    "PyInstaller",
    "--noconfirm",
    "--clean",
    "--onefile",
    "--name",
    "autocut-backend",
    "--distpath",
    backendOutput,
    "--workpath",
    join(root, "backend", "build"),
    "--specpath",
    join(root, "backend"),
    "--collect-all",
    "playwright",
    "--paths",
    join(root, "backend"),
    join(root, "backend", "app", "main.py")
  ],
  { cwd: join(root, "backend"), stdio: "inherit", windowsHide: true }
);
if (pyinstaller.status !== 0) {
  throw new Error(`PyInstaller failed with exit code ${pyinstaller.status}`);
}

const browserSource = join(
  process.env.LOCALAPPDATA ?? "",
  "ms-playwright"
);
const browserOutput = join(resources, "ms-playwright");
mkdirSync(browserOutput, { recursive: true });
for (const directory of ["chromium-1181"]) {
  cpSync(join(browserSource, directory), join(browserOutput, directory), {
    recursive: true
  });
}
