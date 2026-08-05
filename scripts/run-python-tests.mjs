import { spawnSync } from "node:child_process";

const candidates = process.env.PYTHON
  ? [process.env.PYTHON]
  : process.platform === "win32"
    ? ["python", "py"]
    : ["python3", "python"];

let lastError = "";
for (const candidate of candidates) {
  const command = candidate === "py" ? ["-3", "-m", "pytest", "backend/tests", "-q"] : ["-m", "pytest", "backend/tests", "-q"];
  const result = spawnSync(candidate, command, { stdio: "inherit", windowsHide: true });
  if (!result.error && result.status === 0) process.exit(0);
  lastError = result.error?.message ?? `${candidate} exited with code ${result.status}`;
}

throw new Error(`Python test environment is unavailable: ${lastError}. Set PYTHON to the interpreter that has backend requirements installed.`);
