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
const installer = join(releaseDirectory, "AutoCut-Studio-0.1.0-x64.exe");
const installed = spawnSync(
  installer,
  ["/S", `/D=${installDirectory}`],
  { windowsHide: true, stdio: "inherit" }
);
const executable = join(installDirectory, "全自动混剪工作台.exe");
if (installed.status !== 0 && !existsSync(executable)) {
  throw new Error(`Installer exited with ${installed.status}`);
}
if (!existsSync(executable)) throw new Error("Installed executable is missing");

const child = spawn(executable, [], {
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"]
});
let stderr = "";
child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
const outcome = await Promise.race([
  new Promise((resolveResult) =>
    child.once("exit", (code) => resolveResult({ exited: true, code }))
  ),
  new Promise((resolveResult) =>
    setTimeout(() => resolveResult({ exited: false }), 10_000)
  )
]);
if (outcome.exited) {
  throw new Error(`Installed app exited early (${outcome.code}): ${stderr}`);
}
if (child.pid) {
  spawnSync("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
    windowsHide: true,
    stdio: "ignore"
  });
}
process.stdout.write("NSIS install and installed-app launch check passed\n");
