import { spawn, type ChildProcess } from "node:child_process";

export type BackendLaunchInput = {
  pythonExecutable: string;
  backendDirectory: string;
  sessionToken: string;
  port: number;
};

export type BackendLaunchConfig = {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
};

export function createBackendLaunchConfig(
  input: BackendLaunchInput
): BackendLaunchConfig {
  return {
    command: input.pythonExecutable,
    args: ["-m", "app.main"],
    cwd: input.backendDirectory,
    env: {
      ...process.env,
      AUTOCUT_HOST: "127.0.0.1",
      AUTOCUT_PORT: String(input.port),
      AUTOCUT_SESSION_TOKEN: input.sessionToken,
      PYTHONUTF8: "1"
    }
  };
}

export function spawnBackend(config: BackendLaunchConfig): ChildProcess {
  return spawn(config.command, config.args, {
    cwd: config.cwd,
    env: config.env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
}
