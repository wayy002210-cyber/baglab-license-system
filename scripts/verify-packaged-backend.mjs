import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const token = "packaged-backend-verification-token";
const port = 43199;
const executable =
  process.env.AUTOCUT_BACKEND_VERIFY_EXECUTABLE ??
  join(
    process.cwd(),
    "build-resources",
    "backend",
    "autocut-backend.exe"
  );
const expectedBuildId = JSON.parse(
  readFileSync(join(process.cwd(), "package.json"), "utf8")
).version;
const child = spawn(executable, [], {
  env: {
    ...process.env,
    AUTOCUT_SESSION_TOKEN: token,
    AUTOCUT_PORT: String(port)
  },
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"]
});
let stderr = "";
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
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
      if (
        response.ok &&
        body.status === "ok" &&
        body.buildId === expectedBuildId
      ) {
        verified = true;
        break;
      }
      if (response.ok && body.status === "ok") {
        throw new Error(
          `Packaged backend version mismatch: desktop ${expectedBuildId}, backend ${body.buildId ?? "unknown"}`
        );
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("Packaged backend version mismatch:")
      ) {
        throw error;
      }
      // One-file PyInstaller startup can take several seconds.
    }
  }
  if (!verified) {
    throw new Error(
      `Packaged backend health check failed: ${stderr.trim() || "no stderr"}`
    );
  }
  process.stdout.write("Packaged backend health check passed\n");
} finally {
  if (child.pid) {
    spawnSync("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
      windowsHide: true,
      stdio: "ignore"
    });
  }
}
