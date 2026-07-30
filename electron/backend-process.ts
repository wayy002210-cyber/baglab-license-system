import { spawn, type ChildProcess } from "node:child_process";

export type BackendLaunchInput = {
  pythonExecutable: string;
  backendDirectory: string;
  sessionToken: string;
  port: number;
  packaged?: boolean;
  resourceDirectory?: string;
  dataDirectory?: string;
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
    args: input.packaged ? [] : ["-m", "app.main"],
    cwd: input.backendDirectory,
    env: {
      ...process.env,
      AUTOCUT_HOST: "127.0.0.1",
      AUTOCUT_PORT: String(input.port),
      AUTOCUT_SESSION_TOKEN: input.sessionToken,
      ...(input.resourceDirectory
        ? {
            AUTOCUT_FFMPEG: `${input.resourceDirectory}/bin/ffmpeg.exe`,
            AUTOCUT_FFPROBE: `${input.resourceDirectory}/bin/ffprobe.exe`,
            PLAYWRIGHT_BROWSERS_PATH: `${input.resourceDirectory}/ms-playwright`
          }
        : {}),
      ...(input.dataDirectory
        ? {
            AUTOCUT_VOICE_CACHE: `${input.dataDirectory}/cache/voice`,
            AUTOCUT_THUMBNAIL_CACHE: `${input.dataDirectory}/cache/thumbnails`,
            AUTOCUT_WORK_DIRECTORY: `${input.dataDirectory}/work`
          }
        : {}),
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

export async function waitForBackendHealth(input: {
  baseUrl: string;
  token: string;
  expectedBuildId?: string;
  attempts?: number;
  fetcher?: typeof fetch;
  delay?: (milliseconds: number) => Promise<void>;
}): Promise<void> {
  const fetcher = input.fetcher ?? fetch;
  const attempts = input.attempts ?? 60;
  const delay =
    input.delay ??
    ((milliseconds: number) =>
      new Promise<void>((resolveDelay) => setTimeout(resolveDelay, milliseconds)));
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetcher(`${input.baseUrl}/health`, {
        headers: { "X-Autocut-Token": input.token }
      });
      if (response.ok) {
        if (input.expectedBuildId) {
          const payload = (await response.json()) as { buildId?: string };
          if (payload.buildId !== input.expectedBuildId) {
            throw new Error(
              `前后端版本不一致：桌面端 ${input.expectedBuildId}，本地服务 ${payload.buildId ?? "未知"}。请关闭软件后重新安装最新版。`
            );
          }
        }
        return;
      }
      lastError = new Error(`Health check returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Backend health check timed out");
}
