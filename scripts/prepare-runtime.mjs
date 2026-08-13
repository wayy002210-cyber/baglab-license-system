import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const packageVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const resources = join(root, "build-resources");
const licensePublicConfigSource = join(root, "config", "license-public.json");
const backendOutput = join(resources, "backend");
const binOutput = join(resources, "bin");
const bundledFfmpegDir =
  process.env.AUTOCUT_FFMPEG_DIR ?? join(root, "vendor", "ffmpeg");
rmSync(resources, { recursive: true, force: true });
mkdirSync(backendOutput, { recursive: true });
mkdirSync(binOutput, { recursive: true });
if (!existsSync(licensePublicConfigSource)) {
  throw new Error("config/license-public.json is missing");
}
cpSync(licensePublicConfigSource, join(resources, "license-public.json"));

function locate(command) {
  const bundledPath = join(bundledFfmpegDir, command);
  if (existsSync(bundledPath)) return bundledPath;
  const result = spawnSync("where.exe", [command], {
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) throw new Error(`${command} is not installed`);
  return result.stdout.trim().split(/\r?\n/)[0];
}

for (const executable of ["ffmpeg.exe", "ffprobe.exe"]) {
  const source = locate(executable);
  cpSync(source, join(binOutput, executable));
  console.log(`Bundled ${executable} from ${source}`);
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
    `autocut-backend-${packageVersion}`,
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
writeFileSync(
  join(backendOutput, "runtime.json"),
  JSON.stringify({ version: packageVersion, executable: `autocut-backend-${packageVersion}.exe` }, null, 2),
  "utf8"
);

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
