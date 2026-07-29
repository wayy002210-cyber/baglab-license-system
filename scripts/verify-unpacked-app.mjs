import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";

const executable = join(
  process.cwd(),
  "release",
  "win-unpacked",
  "全自动混剪工作台.exe"
);
const child = spawn(executable, [], {
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
}
