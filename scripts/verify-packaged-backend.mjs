import { spawn } from "node:child_process";
import { join } from "node:path";

const token = "packaged-backend-verification-token";
const port = 43199;
const executable = join(
  process.cwd(),
  "build-resources",
  "backend",
  "autocut-backend.exe"
);
const child = spawn(executable, [], {
  env: {
    ...process.env,
    AUTOCUT_SESSION_TOKEN: token,
    AUTOCUT_PORT: String(port)
  },
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  let verified = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        headers: { "X-Autocut-Token": token }
      });
      const body = await response.json();
      if (response.ok && body.status === "ok") {
        verified = true;
        break;
      }
    } catch {
      // One-file PyInstaller startup can take several seconds.
    }
  }
  if (!verified) throw new Error("Packaged backend health check failed");
  process.stdout.write("Packaged backend health check passed\n");
} finally {
  if (child.pid) {
    spawn("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
      windowsHide: true,
      stdio: "ignore"
    });
  }
}
