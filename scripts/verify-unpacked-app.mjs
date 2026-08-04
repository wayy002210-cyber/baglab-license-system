import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const executable = join(
  process.cwd(),
  "release",
  "win-unpacked",
  "袋研官矩阵混剪工作台.exe"
);
const isolatedUserData = mkdtempSync(join(tmpdir(), "autocut-packaged-smoke-"));
const child = spawn(executable, [`--user-data-dir=${isolatedUserData}`], {
  windowsHide: false,
  stdio: ["ignore", "pipe", "pipe"]
});
let stderr = "";
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});
try {
  let windowProbe = { stdout: "", stderr: "" };
  let rendererProbe = { stdout: "", stderr: "" };
  let visible = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Packaged app exited early (${child.exitCode}): ${stderr}`);
    }
    windowProbe = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `(Get-Process -Id ${child.pid}).MainWindowHandle`
      ],
      { encoding: "utf8", windowsHide: true }
    );
    rendererProbe = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `(Get-CimInstance Win32_Process -Filter "ParentProcessId = ${child.pid}").CommandLine`
      ],
      { encoding: "utf8", windowsHide: true }
    );
    visible =
      Number(windowProbe.stdout.trim()) > 0 &&
      rendererProbe.stdout.includes("--type=renderer");
    if (visible) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!visible) {
    throw new Error(
      [
        "Packaged app did not create a visible renderer window.",
        `window probe: ${windowProbe.stdout} ${windowProbe.stderr}`,
        `renderer probe: ${rendererProbe.stdout} ${rendererProbe.stderr}`,
        `application stderr: ${stderr}`
      ].join("\n")
    );
  }
  process.stdout.write("Packaged desktop app displayed a renderer window\n");
} finally {
  if (child.pid) {
    spawnSync("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
      windowsHide: true,
      stdio: "ignore"
    });
  }
  // Chromium may keep cache handles alive briefly after the process tree exits.
  // Cleanup is best-effort and must not turn a successful window smoke test into
  // a false application-startup failure on Windows.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      rmSync(isolatedUserData, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 200
      });
      break;
    } catch (error) {
      if (attempt === 9) {
        process.stderr.write(
          `Warning: could not remove smoke-test profile: ${error.message}\n`
        );
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
}
