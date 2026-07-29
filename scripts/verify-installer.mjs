import { existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const root = resolve(process.cwd());
const releaseDirectory = resolve(root, "release");
const installDirectory = resolve(releaseDirectory, "install-smoke");
if (!installDirectory.startsWith(`${releaseDirectory}\\`)) {
  throw new Error("Unsafe smoke-test install directory");
}
rmSync(installDirectory, { recursive: true, force: true });
const installer = join(
  releaseDirectory,
  "袋研官矩阵混剪工作台-0.1.0-x64.exe"
);
const installed = spawnSync(
  installer,
  ["/S", `/D=${installDirectory}`],
  { windowsHide: true, stdio: "inherit" }
);
const executable = join(installDirectory, "袋研官矩阵混剪工作台.exe");
if (installed.status !== 0 && !existsSync(executable)) {
  throw new Error(`Installer exited with ${installed.status}`);
}
if (!existsSync(executable)) throw new Error("Installed executable is missing");

const child = spawn(executable, [], {
  windowsHide: false,
  stdio: ["ignore", "pipe", "pipe"]
});
let stderr = "";
child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
try {
  let visible = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Installed app exited early (${child.exitCode}): ${stderr}`);
    }
    const windowProbe = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `(Get-Process -Id ${child.pid}).MainWindowHandle`
      ],
      { encoding: "utf8", windowsHide: true }
    );
    visible = Number(windowProbe.stdout.trim()) > 0;
    if (visible) break;
    await new Promise((resolveResult) => setTimeout(resolveResult, 500));
  }
  if (!visible) {
    throw new Error(`Installed app did not display a visible window: ${stderr}`);
  }
  process.stdout.write("NSIS install and visible-window check passed\n");
} finally {
  if (child.pid) {
    spawnSync("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
      windowsHide: true,
      stdio: "ignore"
    });
  }
}
