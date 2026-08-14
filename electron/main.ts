import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  protocol,
  net,
  Menu
} from "electron";
import { randomBytes, type JsonWebKey as NodeJsonWebKey } from "node:crypto";
import { createServer } from "node:net";
import { assertPublishServiceReady } from "./publish-readiness.js";
import { createSingleFlight } from "./single-flight.js";
import { runPublishBatch } from "./publish-batch.js";
import { basename, extname, join, resolve } from "node:path";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { ChildProcess } from "node:child_process";
import Database from "better-sqlite3";
import keytar from "keytar";
import {
  createBackendLaunchConfig,
  spawnBackend,
  terminateStalePackagedBackends,
  terminateBackendProcessTree,
  waitForBackendHealth
} from "./backend-process.js";
import { CredentialStore, type CredentialName } from "./credential-store.js";
import { applyMigrations } from "./database.js";
import {
  PersonaRepository,
  type PersonaInput,
  type PersonaUpdate
} from "./repositories/persona-repository.js";
import {
  AssetRepository,
  type ScannedAssetInput
} from "./repositories/asset-repository.js";
import {
  ensureBuiltInTemplate,
  TemplateRepository,
  type TemplateInput
} from "./repositories/template-repository.js";
import {
  TaskRepository,
  type CreateTaskBatchInput,
  type GenerationTask,
  type TaskStatus
} from "./repositories/task-repository.js";
import { SseParser } from "./sse-parser.js";
import {
  PublishRepository,
  type PublishPlatform
} from "./repositories/publish-repository.js";
import { JsonLogger } from "./logger.js";
import { reportStartupFailure } from "./startup.js";
import { exportDiagnosticBundle } from "./diagnostics.js";
import { readJsonResponse } from "./http-response.js";
import {
  SettingsRepository,
  defaultMediaSettings,
  type MediaSettings
} from "./repositories/settings-repository.js";
import { createChineseMenuTemplate } from "./application-menu.js";
import { PRODUCT_NAME } from "../src/shared/product-copy.js";
import type { CreationDraft } from "../src/shared/contracts.js";
import { CreationDraftRepository } from "./repositories/creation-draft-repository.js";
import {
  ReferenceScriptRepository,
  type ReferenceScriptInput
} from "./repositories/reference-script-repository.js";
import type { CopyModelSettings } from "./repositories/settings-repository.js";
import { buildDraftTaskSnapshot } from "./services/task-snapshot-service.js";
import { scanSystemFonts } from "./services/system-font-service.js";
import {
  CopywritingProjectRepository,
  type CopywritingStatus,
  type CreateCopywritingProjectInput,
  type ReplaceShotInput
} from "./repositories/copywriting-project-repository.js";
import { GenerationQueue } from "./services/generation-queue.js";
import { createProjectTasks } from "./services/copywriting-task-service.js";
import { defaultSubtitleStyle,defaultTitleStyle } from "../src/shared/media-style.js";
import { toSafeOutputStem } from "../src/shared/short-title.js";
import { createElectronLicenseApiClient } from "./license/api-client.js";
import { LicenseCoordinator } from "./license/coordinator.js";
import { verifySignedCredential } from "./license/credential.js";
import { collectWindowsDevice } from "./license/windows-device.js";
import { createLicensedHandler } from "./license/ipc-guard.js";
import { issueLocalLicenseProof } from "./license/local-proof.js";
import { loadLicensePublicConfig } from "./license/public-config.js";

let window: BrowserWindow | null = null;
let backend: ChildProcess | null = null;
let database: Database.Database | null = null;
let publishScheduler: ReturnType<typeof setInterval> | null = null;
let logger: JsonLogger | null = null;
let generationQueue: GenerationQueue | null = null;
let logPath = "";
let backendStartPromise: Promise<void> | null = null;
let licenseRefreshTimer: ReturnType<typeof setInterval> | null = null;
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}
app.on("second-instance", () => {
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
});
protocol.registerSchemesAsPrivileged([
  {
    scheme: "autocut-media",
    privileges: { secure: true, standard: true, stream: true, supportFetchAPI: true }
  }
]);
const credentials = new CredentialStore(keytar);
let licenseCoordinator: LicenseCoordinator | null = null;
const localLicenseProofSecret = randomBytes(32).toString("hex");
let localLicenseDeviceFingerprint = "";

function backendLicenseHeaders(): Record<string, string> {
  if (!licenseCoordinator || !localLicenseDeviceFingerprint) throw new Error("LICENSE_INITIALIZING");
  licenseCoordinator.assertAllowed();
  return {
    "X-Autocut-License": issueLocalLicenseProof({
      secret: localLicenseProofSecret,
      buildId: app.getVersion(),
      deviceFingerprint: localLicenseDeviceFingerprint
    })
  };
}

function licensedHandle(channel: string, handler: (event: unknown, ...args: any[]) => unknown): void {
  ipcMain.handle(channel, createLicensedHandler({
    assertAllowed: () => {
      if (!licenseCoordinator) throw new Error("LICENSE_INITIALIZING");
      licenseCoordinator.assertAllowed();
    }
  }, handler));
}

function personaRepository(): PersonaRepository {
  if (!database) throw new Error("Database is not ready");
  return new PersonaRepository(database);
}

function assetRepository(): AssetRepository {
  if (!database) throw new Error("Database is not ready");
  return new AssetRepository(database);
}

function templateRepository(): TemplateRepository {
  if (!database) throw new Error("Database is not ready");
  return new TemplateRepository(database);
}

function taskRepository(): TaskRepository {
  if (!database) throw new Error("Database is not ready");
  return new TaskRepository(database);
}
function publishRepository(): PublishRepository {
  if (!database) throw new Error("Database is not ready");
  return new PublishRepository(database);
}
function settingsRepository(): SettingsRepository {
  if (!database) throw new Error("Database is not ready");
  return new SettingsRepository(database);
}
function creationDraftRepository(): CreationDraftRepository {
  if (!database) throw new Error("Database is not ready");
  return new CreationDraftRepository(database);
}
function referenceScriptRepository(): ReferenceScriptRepository {
  if (!database) throw new Error("Database is not ready");
  return new ReferenceScriptRepository(database);
}
function copywritingProjectRepository(): CopywritingProjectRepository {
  if (!database) throw new Error("Database is not ready");
  return new CopywritingProjectRepository(database);
}
function queue():GenerationQueue{
  if(!generationQueue)generationQueue=new GenerationQueue(taskRepository(),runGenerationTask);
  return generationQueue;
}

async function runGenerationTask(task: GenerationTask): Promise<void> {
  logger?.write("info", "generation.start", { taskId: task.id });
  if (backendState.status !== "ready") {
    taskRepository().transition(task.id, "failed", {
      errorCode: "BACKEND_UNAVAILABLE",
      errorMessage: "本地生成服务尚未就绪"
    });
    return;
  }
  const [bailianKey, minimaxKey] = await Promise.all([
    credentials.get("bailian"),
    credentials.get("minimax")
  ]);
  if ((!bailianKey || !minimaxKey) && !task.snapshot.approved) {
    taskRepository().transition(task.id, "failed", {
      errorCode: "AI_KEY_MISSING",
      errorMessage: "请先配置百炼和 MiniMax API Key"
    });
    return;
  }
  const settings = settingsRepository().getMediaSettings();
  const mainTitle = String(
    (task.snapshot.copywriting as { mainTitle?: string } | undefined)?.mainTitle || "未命名视频"
  );
  const outputPath = join(
    settings.outputDirectory || join(app.getPath("videos"), "袋研官混剪成片"),
    `${toSafeOutputStem(mainTitle)}-${task.id.slice(0, 8)}.mp4`
  );
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Autocut-Token": backendState.token,
    ...backendLicenseHeaders()
  };
  if (bailianKey) headers["X-Bailian-Key"] = bailianKey;
  if (minimaxKey) headers["X-MiniMax-Key"] = minimaxKey;
  try {
    const start = await fetch(`${backendState.baseUrl}/tasks/${task.id}/run`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        taskId: task.id,
        seed: task.seed,
        snapshot: task.snapshot,
        outputPath
      })
    });
    if (!start.ok) {
      const body = (await start.json()) as { detail?: string };
      throw new Error(body.detail || `任务启动失败 (${start.status})`);
    }
    const stream = await fetch(
      `${backendState.baseUrl}/tasks/${task.id}/events`,
      { headers: { "X-Autocut-Token": backendState.token } }
    );
    if (!stream.ok || !stream.body) throw new Error("无法订阅任务进度");
    const reader = stream.body.getReader();
    const decoder = new TextDecoder();
    const parser = new SseParser();
    let lastStatus: TaskStatus | null = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const event of parser.feed(decoder.decode(value, { stream: true }))) {
        if (event.event !== "task") continue;
        const payload = JSON.parse(event.data) as {
          status: TaskStatus;
          progress: number;
          errorCode?: string | null;
          errorMessage?: string | null;
        };
        taskRepository().transition(task.id, payload.status, {
          progress: payload.progress,
          outputPath: payload.status === "completed" ? outputPath : undefined,
          errorCode: payload.errorCode ?? undefined,
          errorMessage: payload.errorMessage ?? undefined
        });
        if (payload.status !== lastStatus) {
          logger?.write(
            payload.status === "failed" ? "error" : "info",
            "generation.stage",
            {
              taskId: task.id,
              status: payload.status,
              progress: payload.progress,
              errorCode: payload.errorCode,
              errorMessage: payload.errorMessage
            }
          );
          lastStatus = payload.status;
        }
      }
    }
  } catch (error) {
    const current = taskRepository().get(task.id);
    if (current && !["completed", "failed", "canceled"].includes(current.status)) {
      logger?.write("warn", "generation.stream_disconnected", {
        taskId: task.id, error
      });
      try {
        while (true) {
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 5_000));
          const response = await fetch(
            `${backendState.baseUrl}/tasks/${task.id}`,
            { headers: { "X-Autocut-Token": backendState.token } }
          );
          if (!response.ok) throw new Error(`任务状态查询失败 (${response.status})`);
          const payload = await response.json() as {
            status: TaskStatus;
            progress: number;
            errorCode?: string | null;
            errorMessage?: string | null;
          };
          taskRepository().transition(task.id, payload.status, {
            progress: payload.progress,
            outputPath: payload.status === "completed" ? outputPath : undefined,
            errorCode: payload.errorCode ?? undefined,
            errorMessage: payload.errorMessage ?? undefined
          });
          if (["completed", "failed", "canceled"].includes(payload.status)) break;
        }
      } catch (pollError) {
        taskRepository().transition(task.id, "failed", {
          errorCode: "WORKER_CONNECTION_FAILED",
          errorMessage: pollError instanceof Error ? pollError.message : "任务执行连接失败"
        });
        logger?.write("error", "generation.connection_failed", {
          taskId: task.id, error: pollError
        });
      }
    }
  }
}

async function runNextPublishJob(jobId?: string): Promise<boolean> {
  if (backendState.status !== "ready") return false;
  const job = jobId ? publishRepository().claim(jobId) : publishRepository().claimNextDue(new Date().toISOString());
  if (!job) return false;
  logger?.write("info", "publish.claimed", {
    jobId: job.id,
    accountId: job.accountId,
    taskId: job.taskId
  });
  const account = publishRepository().getAccount(job.accountId);
  const task = taskRepository().get(job.taskId);
  if (!account || !task?.outputPath || !existsSync(task.outputPath)) {
    publishRepository().finishJob(job.id, "failed", {
      errorMessage: "发布账号或成片文件不存在"
    });
    logger?.write("error", "publish.invalid_input", { jobId: job.id });
    return false;
  }
  try {
    const response = await fetch(
      `${backendState.baseUrl}/publish/tasks/${job.id}/start`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Autocut-Token": backendState.token,
          ...backendLicenseHeaders()
        },
        body: JSON.stringify({
          platform: account.platform,
          userDataDir: account.userDataDir,
          videoPath: task.outputPath,
          title: job.title,
          // Douyin's description editor receives only hashtags. Full scripts
          // must never be copied into the platform's work-description field.
          description: "",
          topics: job.topics,
          scheduledAt: job.publishTime ?? job.scheduledAt,
          coverPath: job.coverPath,
          verticalCoverPath: job.verticalCoverPath,
          horizontalCoverPath: job.horizontalCoverPath,
          screenshotDir: join(app.getPath("userData"), "logs", "publish", job.id)
        })
      }
    );
    const result = (await response.json()) as {
      state?: "queued"|"opening_profile"|"checking_login"|"waiting_for_human"|"uploading_video"|"waiting_upload"|"filling_metadata"|"uploading_cover"|"configuring_publish_time"|"submitting"|"verifying"|"published"|"failed"|"canceled";
      message?: string | null;
      screenshotPath?: string | null;
      sessionId?: string | null;
      currentUrl?: string | null;
      resultUrl?: string | null;
      detail?: string;
    };
    if (!response.ok || !result.state) {
      throw new Error(result.detail || `发布服务失败 (${response.status})`);
    }
    publishRepository().setAgentSession(job.id, result.sessionId ?? null);
    await monitorPublishAgent(job.id, account.id);
    return publishRepository().getJob(job.id)?.status === "published";
  } catch (error) {
    if (publishRepository().getJob(job.id)?.status === "canceled") return false;
    publishRepository().finishJob(job.id, "failed", {
      errorMessage: error instanceof Error ? error.message : "发布失败"
    });
    logger?.write("error", "publish.failed", { jobId: job.id, error });
    return false;
  }
}

const wakePublishRunner = createSingleFlight(async (jobIds?: string[]) => {
  if (jobIds?.length) {
    logger?.write("info", "publish.batch_started", { total: jobIds.length, jobIds });
    const result = await runPublishBatch(jobIds, runNextPublishJob);
    logger?.write("info", "publish.batch_completed", result);
    return;
  }
  const readyIds = publishRepository().listJobs()
    .filter((job) => job.status === "ready")
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map((job) => job.id);
  logger?.write("info", "publish.batch_started", { total: readyIds.length, jobIds: readyIds });
  const result = await runPublishBatch(readyIds, runNextPublishJob);
  logger?.write("info", "publish.batch_completed", result);
}, (_jobIds?: string[]) => {
  logger?.write("warn", "publish.runner.skip_active", {
    reason: "publish runner already active in this Electron process"
  });
});

async function monitorPublishAgent(jobId: string, accountId: string): Promise<void> {
  while (backendState.status === "ready") {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 5_000));
    const response = await fetch(`${backendState.baseUrl}/publish/tasks/${jobId}`, {
      headers: { "X-Autocut-Token": backendState.token }
    });
    if (!response.ok) throw new Error(`发布代理状态查询失败 (${response.status})`);
    const snapshot = (await response.json()) as {
      state: "queued"|"opening_profile"|"checking_login"|"waiting_for_human"|"uploading_video"|"waiting_upload"|"filling_metadata"|"uploading_cover"|"configuring_publish_time"|"submitting"|"verifying"|"published"|"failed"|"canceled";
      message: string; screenshotPath?: string | null; currentUrl?: string | null; resultUrl?: string | null;
      events?: Array<{id:string;state:"queued"|"opening_profile"|"checking_login"|"waiting_for_human"|"uploading_video"|"waiting_upload"|"filling_metadata"|"uploading_cover"|"configuring_publish_time"|"submitting"|"verifying"|"published"|"failed"|"canceled";level:"info"|"warning"|"error";message:string;details:Record<string,unknown>;createdAt:string}>;
    };
    for (const event of snapshot.events ?? []) {
      publishRepository().recordAgentEvent({ ...event, jobId });
    }
    const current = publishRepository().getJob(jobId);
    if (!current || current.status === "canceled") return;
    if (snapshot.state === "waiting_for_human") {
      publishRepository().finishJob(jobId, "failed", { errorMessage: snapshot.message, screenshotPath: snapshot.screenshotPath ?? undefined, resultUrl: snapshot.currentUrl ?? undefined });
      return;
    }
    if (snapshot.state === "published") {
      publishRepository().finishJob(jobId, "published", { screenshotPath: snapshot.screenshotPath ?? undefined, resultUrl: snapshot.resultUrl ?? snapshot.currentUrl ?? undefined });
      return;
    }
    if (snapshot.state === "failed") {
      publishRepository().finishJob(jobId, "failed", { errorMessage: snapshot.message, screenshotPath: snapshot.screenshotPath ?? undefined, resultUrl: snapshot.currentUrl ?? undefined });
      return;
    }
    if (snapshot.state === "canceled") {
      publishRepository().cancelJob(jobId);
      return;
    }
    publishRepository().updateWorkflow(jobId, snapshot.state, snapshot.message);
  }
}
type BackendReadyState = { status: "ready"; baseUrl: string; token: string };
type BackendState =
  | BackendReadyState
  | { status: "starting"; baseUrl: string; token: string }
  | { status: "stopped" | "failed"; message: string };
let backendState: BackendState = {
  status: "stopped",
  message: "本地服务尚未启动"
};

function isBackendReady(state: BackendState): state is BackendReadyState {
  return state.status === "ready";
}

function findFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("无法分配本地端口"));
        return;
      }
      const { port } = address;
      server.close(() => resolvePort(port));
    });
  });
}

async function startBackendInternal(): Promise<void> {
  const backendDirectory = app.isPackaged
    ? resolve(process.resourcesPath, "backend")
    : resolve(process.cwd(), "backend");
  if (app.isPackaged) terminateStalePackagedBackends();

  // Do not expose the renderer until health has passed.  Previously this
  // method returned immediately after spawn, leaving a race where page hooks
  // could ask the backend for account status while it was still booting.
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const port = await findFreePort();
    const token = randomBytes(32).toString("hex");
    const packagedExecutable = resolve(
      backendDirectory,
      `autocut-backend-${app.getVersion()}.exe`
    );
    const config = createBackendLaunchConfig({
      pythonExecutable: app.isPackaged
        ? packagedExecutable
        : process.env.AUTOCUT_PYTHON ?? "python",
      backendDirectory,
      sessionToken: token,
      port,
      packaged: app.isPackaged,
      resourceDirectory: app.isPackaged ? process.resourcesPath : undefined,
      dataDirectory: app.getPath("userData"),
      buildId: app.getVersion(),
      installRoot: app.isPackaged ? process.resourcesPath : process.cwd(),
      lockFilePath: join(app.getPath("userData"), "runtime", "autocut-backend.lock")
      ,licenseProofSecret: localLicenseProofSecret
      ,licenseDeviceFingerprint: localLicenseDeviceFingerprint
    });
    if (app.isPackaged && !existsSync(packagedExecutable)) {
      lastError = new Error(
        `本地服务组件不完整：未找到 ${basename(packagedExecutable)}。请运行最新安装包覆盖安装。`
      );
      break;
    }
    backendState = { status: "starting", baseUrl: `http://127.0.0.1:${port}`, token };
    const processHandle = spawnBackend(config);
    backend = processHandle;
    // Always consume the child streams. Leaving the pipe unread eventually
    // blocks Uvicorn/Playwright on Windows and made a healthy backend appear
    // to randomly go offline after account checks.
    const consumeBackendOutput = (stream: NodeJS.ReadableStream | null, level: "info" | "warn") => {
      if (!stream) return;
      stream.on("data", (chunk: Buffer | string) => {
        const message = String(chunk).trim();
        if (message) logger?.write(level, "backend.output", { message: message.slice(0, 4_000) });
      });
    };
    consumeBackendOutput(processHandle.stdout, "info");
    consumeBackendOutput(processHandle.stderr, "warn");
    let launchError: Error | null = null;
    processHandle.once("error", (error) => {
      launchError = error;
      logger?.write("error", "backend.process_error", { error: error.message });
    });
    processHandle.once("exit", (code) => {
      logger?.write("warn", "backend.exited", { code, pid: processHandle.pid });
      if (backend === processHandle && backendState.status !== "failed") {
        backendState = { status: "stopped", message: `本地服务已退出 (${code ?? "unknown"})` };
      }
    });
    try {
      await waitForBackendHealth({
        baseUrl: `http://127.0.0.1:${port}`,
        token,
        expectedBuildId: app.getVersion(),
        attempts: 80
      });
      if (launchError) throw launchError;
      backendState = { status: "ready", baseUrl: `http://127.0.0.1:${port}`, token };
      logger?.write("info", "backend.ready", { port, attempt });
      return;
    } catch (error) {
      lastError = error;
      logger?.write("warn", "backend.start_retry", { attempt, error });
      if (processHandle.pid) terminateBackendProcessTree(processHandle.pid);
      else processHandle.kill();
      backend = null;
      if (attempt === 1 && app.isPackaged) terminateStalePackagedBackends();
    }
  }
  backendState = {
    status: "failed",
    message: lastError instanceof Error ? lastError.message : "后端健康检查失败"
  };
  logger?.write("error", "backend.health_failed", { error: lastError });
}

async function startBackend(): Promise<void> {
  if (!backendStartPromise) {
    backendStartPromise = startBackendInternal().finally(() => {
      backendStartPromise = null;
    });
  }
  return backendStartPromise;
}

async function ensureBackendReady(action: string): Promise<BackendReadyState> {
  if (isBackendReady(backendState)) {
    try {
      const response = await fetch(`${backendState.baseUrl}/health`, {
        headers: { "X-Autocut-Token": backendState.token },
        signal: AbortSignal.timeout(3_000)
      });
      if (response.ok) return backendState;
    } catch (error) {
      logger?.write("warn", "backend.health_lost", { action, error: error instanceof Error ? error.message : String(error) });
    }
    backendState = { status: "stopped", message: "本地服务连接已中断，正在自动恢复" };
  }
  await startBackend();
  if (isBackendReady(backendState)) return backendState;
  const detail = "message" in backendState ? backendState.message : "本地服务仍在启动";
  throw new Error(`${action}不可用：${detail}。请关闭软件后使用最新安装包覆盖安装，并在“系统设置”导出诊断包。`);
}

function createWindow(): void {
  window = new BrowserWindow({
    title: PRODUCT_NAME,
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 640,
    show: false,
    backgroundColor: "#f4f7fc",
    webPreferences: {
      preload: resolve(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
      ,devTools: !app.isPackaged
    }
  });
  window.once("ready-to-show", () => window?.show());
  window.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedUrl) => {
      logger?.write("error", "renderer.load_failed", {
        errorCode,
        errorDescription,
        validatedUrl
      });
      window?.show();
    }
  );
  const developmentUrl = process.env.ELECTRON_RENDERER_URL;
  if (developmentUrl) {
    void window.loadURL(developmentUrl);
  } else {
    void window.loadFile(resolve(__dirname, "../../dist/index.html"));
  }
}

ipcMain.handle("backend:status", () => backendState);
ipcMain.handle("app:getBuildId", () => app.getVersion());
ipcMain.handle("license:status", () => licenseCoordinator?.getStatus() ?? { allowed: false, mode: "inactive", deviceShortCode: "------------", code: "LICENSE_INITIALIZING" });
ipcMain.handle("license:activate", async (_event, activationCode: string) => {
  if (!licenseCoordinator) throw new Error("LICENSE_INITIALIZING");
  return licenseCoordinator.activate(activationCode);
});
ipcMain.handle("license:refresh", async () => {
  if (!licenseCoordinator) throw new Error("LICENSE_INITIALIZING");
  return licenseCoordinator.refresh();
});
ipcMain.handle("credentials:status", async () => ({
  bailian: Boolean(await credentials.get("bailian")),
  minimax: Boolean(await credentials.get("minimax"))
}));
ipcMain.handle(
  "credentials:set",
  async (_event, name: CredentialName, value: string) => {
    await credentials.set(name, value);
    return { configured: true };
  }
);
ipcMain.handle("credentials:testBailian", async (_event, model: string) => {
  if (backendState.status !== "ready") throw new Error("本地 AI 服务尚未就绪");
  const apiKey = await credentials.get("bailian");
  if (!apiKey) throw new Error("请先保存百炼 API Key");
  const response = await fetch(`${backendState.baseUrl}/copywriting/connection`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Autocut-Token": backendState.token,
      "X-Bailian-Key": apiKey
    },
    body: JSON.stringify({ model })
  });
  const result = (await response.json()) as {
    status?: string;
    model?: string;
    detail?: string | { message?: string };
  };
  if (!response.ok) {
    throw new Error(
      typeof result.detail === "string"
        ? result.detail
        : result.detail?.message || `百炼连接测试失败 (${response.status})`
    );
  }
  return { connected: result.status === "connected", model: result.model || model };
});
ipcMain.handle("credentials:testMinimax", async () => {
  if (backendState.status !== "ready") throw new Error("本地 AI 服务尚未就绪");
  const apiKey = await credentials.get("minimax");
  if (!apiKey) throw new Error("请先保存 MiniMax API Key");
  const response = await fetch(`${backendState.baseUrl}/voices/connection`, {
    headers: {
      "X-Autocut-Token": backendState.token,
      "X-MiniMax-Key": apiKey
    }
  });
  const result = (await response.json()) as {
    status?: string;
    voiceCount?: number;
    detail?: string | { message?: string };
  };
  if (!response.ok) {
    throw new Error(
      typeof result.detail === "string"
        ? result.detail
        : result.detail?.message || `MiniMax 连接测试失败 (${response.status})`
    );
  }
  return {
    connected: result.status === "connected",
    voiceCount: result.voiceCount ?? 0
  };
});
ipcMain.handle("publishAccounts:check", async (_event, id: string) => {
  const service = await ensureBackendReady("账号状态检测");
  const account = publishRepository().getAccount(id);
  if (!account) throw new Error("发布账号不存在");
  const response = await fetch(
    `${service.baseUrl}/publish/accounts/${id}/check`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Autocut-Token": service.token
      },
      body: JSON.stringify({
        platform: account.platform,
        userDataDir: account.userDataDir
      })
    }
  );
  const result = await readJsonResponse<{
    status?: "unknown" | "connected" | "expired" | "needs_user";
    detail?: string;
  }>(response, "账号状态检测失败");
  if (!result.status) throw new Error("账号状态检测失败：本地服务没有返回账号状态");
  return publishRepository().updateAccountStatus(id, result.status);
});
ipcMain.handle("publishAccounts:connect", async (_event, id: string) => {
  const service = await ensureBackendReady("登录窗口");
  const account = publishRepository().getAccount(id);
  if (!account) throw new Error("发布账号不存在");
  const response = await fetch(
    `${service.baseUrl}/publish/accounts/${id}/connect`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Autocut-Token": service.token
      },
      body: JSON.stringify({
        platform: account.platform,
        userDataDir: account.userDataDir
      })
    }
  );
  const result = await readJsonResponse<{
    status?: "unknown" | "connected" | "expired" | "needs_user";
    detail?: string;
  }>(response, "账号登录窗口打开失败");
  if (!result.status) throw new Error("账号登录窗口打开失败：本地服务没有返回账号状态");
  return publishRepository().updateAccountStatus(id, result.status);
});
ipcMain.handle("personas:list", () => personaRepository().list());
ipcMain.handle(
  "personas:create",
  (_event, input: PersonaInput) => personaRepository().create(input)
);
ipcMain.handle(
  "personas:update",
  (_event, id: string, patch: PersonaUpdate) =>
    personaRepository().update(id, patch)
);
ipcMain.handle("personas:duplicate", (_event, id: string) =>
  personaRepository().duplicate(id)
);
ipcMain.handle("personas:delete", (_event, id: string) => ({
  deleted: personaRepository().delete(id)
}));
ipcMain.handle("draft:get", () => creationDraftRepository().get());
ipcMain.handle("draft:save", (_event, input: CreationDraft) =>
  creationDraftRepository().save(input)
);
ipcMain.handle("draft:clear", () => {
  creationDraftRepository().clear();
  return { cleared: true };
});
ipcMain.handle("draft:duplicate", () => creationDraftRepository().duplicate());
ipcMain.handle("referenceScripts:list", () =>
  referenceScriptRepository().list()
);
ipcMain.handle(
  "referenceScripts:create",
  (_event, input: ReferenceScriptInput) =>
    referenceScriptRepository().create(input)
);
ipcMain.handle(
  "referenceScripts:update",
  (_event, id: string, input: ReferenceScriptInput) =>
    referenceScriptRepository().update(id, input)
);
ipcMain.handle("referenceScripts:delete", (_event, id: string) => ({
  deleted: referenceScriptRepository().delete(id)
}));
ipcMain.handle(
  "referenceScripts:search",
  (
    _event,
    input: { industry: string; query: string; limit: number }
  ) => referenceScriptRepository().search(input)
);
ipcMain.handle("assets:listCategories", () =>
  assetRepository().listCategories()
);
ipcMain.handle("assets:list", (_event, categoryId: string) =>
  assetRepository().listAssets(categoryId)
);
licensedHandle("assets:selectAndScan", async () => {
  if (!window) throw new Error("Application window is not ready");
  const selection = await dialog.showOpenDialog(window, {
    title: "选择一个素材分类文件夹",
    properties: ["openDirectory"]
  });
  if (selection.canceled || !selection.filePaths[0]) return null;
  if (backendState.status !== "ready") {
    throw new Error("本地媒体服务尚未就绪");
  }
  const folderPath = selection.filePaths[0];
  const response = await fetch(`${backendState.baseUrl}/assets/scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Autocut-Token": backendState.token,
      ...backendLicenseHeaders()
    },
    body: JSON.stringify({ folderPath })
  });
  if (!response.ok) {
    throw new Error(`素材扫描失败 (${response.status})`);
  }
  const result = (await response.json()) as {
    assets: Array<{
      file_name: string;
      file_path: string;
      duration_sec: number | null;
      width: number | null;
      height: number | null;
      fps: number | null;
      codec: string | null;
      rotation: number;
      file_size: number;
      fingerprint: string;
      thumbnail_path: string | null;
      status: string;
      error_message: string | null;
    }>;
  };
  const assets: ScannedAssetInput[] = result.assets.map((asset) => ({
    fileName: asset.file_name,
    filePath: asset.file_path,
    durationSec: asset.duration_sec,
    width: asset.width,
    height: asset.height,
    fps: asset.fps,
    codec: asset.codec,
    rotation: asset.rotation,
    fileSize: asset.file_size,
    fingerprint: asset.fingerprint,
    thumbnailPath: asset.thumbnail_path ?? null,
    status: asset.status,
    errorMessage: asset.error_message
  }));
  return assetRepository().saveCategoryScan({
    categoryName: basename(folderPath),
    folderPath,
    assets
  });
});
ipcMain.handle("templates:list", () => templateRepository().list());
ipcMain.handle("settings:getVoice", () => settingsRepository().getVoiceSettings());
ipcMain.handle("settings:saveVoice", (_event, input) => settingsRepository().saveVoiceSettings(input));
ipcMain.handle("copywritingProjects:list", (_event, statuses?: CopywritingStatus[]) =>
  copywritingProjectRepository().list(statuses)
);
ipcMain.handle("copywritingProjects:create", (_event, input: CreateCopywritingProjectInput) =>
  copywritingProjectRepository().create(input)
);
ipcMain.handle("copywritingProjects:update", (_event, id: string, patch: Parameters<CopywritingProjectRepository["update"]>[1]) =>
  copywritingProjectRepository().update(id, patch)
);
ipcMain.handle("copywritingProjects:collect", (_event, id: string) =>
  copywritingProjectRepository().collect(id)
);
ipcMain.handle("copywritingProjects:archive", (_event, id: string) =>
  copywritingProjectRepository().archive(id)
);
ipcMain.handle("copywritingProjects:delete", (_event, id: string) => ({
  deleted: copywritingProjectRepository().delete(id)
}));
ipcMain.handle("copywritingProjects:cloneArchived", (_event, id: string) =>
  copywritingProjectRepository().cloneArchived(id)
);
ipcMain.handle("copywritingProjects:shots", (_event, id: string) =>
  copywritingProjectRepository().listShots(id)
);
ipcMain.handle("copywritingProjects:replaceShots", (_event, id: string, shots: ReplaceShotInput[]) =>
  copywritingProjectRepository().replaceShots(id, shots)
);
ipcMain.handle("copywritingProjects:createTasks",(_event,input:{projectIds:string[];seed:number})=>{
  if(!database)throw new Error("数据库尚未就绪");
  const draft=creationDraftRepository().get();const bgm=draft?.bgm??null;
  const bgmCandidates=bgm?.sourceType==="folder"&&existsSync(bgm.path)?readdirSync(bgm.path,{withFileTypes:true}).filter(entry=>entry.isFile()&&[".mp3",".wav",".m4a",".aac",".flac"].includes(extname(entry.name).toLowerCase())).map(entry=>join(bgm.path,entry.name)).sort():[];
  return createProjectTasks({database,projectRepository:copywritingProjectRepository(),taskRepository:taskRepository(),projectIds:input.projectIds,seed:input.seed,personas:personaRepository().list(),assets:assetRepository().listCategories().flatMap(category=>assetRepository().listAssets(category.id)),voice:settingsRepository().getVoiceSettings(),media:settingsRepository().getMediaSettings(),bgm,bgmCandidates,stylePresets:settingsRepository().getStylePresets(),stylePresetSelection:settingsRepository().getStylePresetSelection(),subtitleStyle:draft?.subtitleStyle??defaultSubtitleStyle,titleStyle:draft?.titleStyle??defaultTitleStyle});
});
ipcMain.handle("templates:create", (_event, input: TemplateInput) =>
  templateRepository().create(input)
);
ipcMain.handle(
  "templates:update",
  (_event, id: string, input: TemplateInput) =>
    templateRepository().update(id, input)
);
ipcMain.handle("templates:duplicate", (_event, id: string) =>
  templateRepository().duplicate(id)
);
ipcMain.handle("templates:delete", (_event, id: string) => ({
  deleted: templateRepository().delete(id)
}));
ipcMain.handle("templates:export", async (_event, id: string) => {
  if (!window) throw new Error("应用窗口尚未就绪");
  const template = templateRepository().list().find((item) => item.id === id);
  if (!template) throw new Error("模板不存在");
  const result = await dialog.showSaveDialog(window, {
    title: "导出镜头模板",
    defaultPath: `${template.name}.autocut-template.json`,
    filters: [{ name: "袋研官混剪模板", extensions: ["json"] }]
  });
  if (result.canceled || !result.filePath) return null;
  const { id: _id, version: _version, canvas: _canvas, createdAt: _createdAt,
    updatedAt: _updatedAt, shots, ...base } = template;
  writeFileSync(
    result.filePath,
    JSON.stringify({
      ...base,
      shots: shots.map(({ id: _shotId, index: _index, ...shot }) => shot)
    }, null, 2),
    "utf8"
  );
  return result.filePath;
});
ipcMain.handle("templates:import", async () => {
  if (!window) throw new Error("应用窗口尚未就绪");
  const result = await dialog.showOpenDialog(window, {
    title: "导入镜头模板",
    properties: ["openFile"],
    filters: [{ name: "袋研官混剪模板", extensions: ["json"] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const input = JSON.parse(readFileSync(result.filePaths[0], "utf8")) as TemplateInput;
  return templateRepository().create(input);
});
ipcMain.handle("tasks:list", () => taskRepository().list());
licensedHandle("tasks:createBatch", (_event, input: CreateTaskBatchInput) => {
  const media = settingsRepository().getMediaSettings();
  const tasks = taskRepository().createBatch({
    ...input,
    snapshot: {
      ...input.snapshot,
      media,
      bgmPath: media.bgmPath
    }
  });
  return tasks;
});
ipcMain.handle(
  "tasks:createFromDraft",
  (_event, input: { count: number; seed: number }) => {
    const draft = creationDraftRepository().get();
    if (!draft) throw new Error("没有可创建任务的创作草稿");
    const persona = personaRepository()
      .list()
      .find((item) => item.id === draft.personaId);
    if (!persona) throw new Error("草稿关联的人设档案不存在");
    const assets = assetRepository()
      .listCategories()
      .flatMap((category) => assetRepository().listAssets(category.id));
    const media = settingsRepository().getMediaSettings();
    const baseSnapshot = buildDraftTaskSnapshot({
      draft,
      persona,
      assets,
      media
    });
    const tasks = [];
    for (let index = 0; index < input.count; index += 1) {
      const seed = input.seed + index;
      const snapshot = structuredClone(baseSnapshot);
      if (draft.bgm?.sourceType === "folder") {
        const candidates = readdirSync(draft.bgm.path, { withFileTypes: true })
          .filter(
            (entry) =>
              entry.isFile() &&
              [".mp3", ".wav", ".m4a", ".aac", ".flac"].includes(
                extname(entry.name).toLowerCase()
              )
          )
          .map((entry) => join(draft.bgm!.path, entry.name))
          .sort();
        if (!candidates.length) {
          throw new Error("背景音乐文件夹中没有可用音频");
        }
        snapshot.bgmPath =
          draft.bgm.mode === "sequential"
            ? candidates[index % candidates.length]
            : candidates[Math.abs(seed) % candidates.length];
      }
      const [task] = taskRepository().createBatch({
        templateId: "creation-draft",
        personaId: persona.id,
        count: 1,
        seed,
        snapshot
      });
      tasks.push(task);
    }
    return tasks;
  }
);
ipcMain.handle("settings:getMedia", () => {
  const current = settingsRepository().getMediaSettings();
  return {
    ...defaultMediaSettings,
    ...current,
    outputDirectory:
      current.outputDirectory || join(app.getPath("videos"), "袋研官混剪成片"),
    workDirectory:
      current.workDirectory || join(app.getPath("userData"), "work")
  };
});
ipcMain.handle("settings:saveMedia", (_event, input: MediaSettings) =>
  settingsRepository().saveMediaSettings(input)
);
ipcMain.handle("settings:getStylePresets", () =>
  settingsRepository().getStylePresets()
);
ipcMain.handle("settings:saveStylePresets", (_event, input) =>
  settingsRepository().saveStylePresets(input)
);
ipcMain.handle("settings:getStylePresetSelection", () =>
  settingsRepository().getStylePresetSelection()
);
ipcMain.handle("settings:saveStylePresetSelection", (_event, input) =>
  settingsRepository().saveStylePresetSelection(String(input))
);
ipcMain.handle("media:selectBgmFile", async () => {
  if (!window) throw new Error("应用窗口尚未就绪");
  const result = await dialog.showOpenDialog(window, {
    title: "选择背景音乐",
    properties: ["openFile"],
    filters: [
      { name: "音频", extensions: ["mp3", "wav", "m4a", "aac", "flac"] }
    ]
  });
  return result.canceled ? null : result.filePaths[0] ?? null;
});
ipcMain.handle("media:selectBgmFolder", async () => {
  if (!window) throw new Error("应用窗口尚未就绪");
  const result = await dialog.showOpenDialog(window, {
    title: "选择背景音乐文件夹",
    properties: ["openDirectory"]
  });
  return result.canceled ? null : result.filePaths[0] ?? null;
});
ipcMain.handle("media:scanAudioLibrary", async (_event, payload: unknown) => {
  if (backendState.status !== "ready") {
    throw new Error("本地媒体服务尚未就绪");
  }
  const response = await fetch(
    `${backendState.baseUrl}/media/audio-library/scan`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Autocut-Token": backendState.token
      },
      body: JSON.stringify(payload)
    }
  );
  const result = (await response.json()) as { detail?: string };
  if (!response.ok) {
    throw new Error(result.detail || `扫描背景音乐失败 (${response.status})`);
  }
  return result;
});
ipcMain.handle("media:selectAndProbeFont", async () => {
  if (!window) throw new Error("应用窗口尚未就绪");
  const result = await dialog.showOpenDialog(window, {
    title: "选择字幕字体",
    properties: ["openFile"],
    filters: [{ name: "字体", extensions: ["ttf", "otf", "ttc", "otc", "fon", "fnt"] }]
  });
  const fontPath = result.canceled ? null : result.filePaths[0] ?? null;
  if (!fontPath) return null;
  if (backendState.status !== "ready") {
    throw new Error("本地媒体服务尚未就绪");
  }
  const response = await fetch(`${backendState.baseUrl}/media/fonts/probe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Autocut-Token": backendState.token
    },
    body: JSON.stringify({ fontPath })
  });
  const metadata = (await response.json()) as { detail?: string };
  if (!response.ok) {
    throw new Error(metadata.detail || `读取字体失败 (${response.status})`);
  }
  return metadata;
});
ipcMain.handle("media:listSystemFonts", () => scanSystemFonts());
ipcMain.handle("settings:getCopyModel", () =>
  settingsRepository().getCopyModelSettings()
);
ipcMain.handle(
  "settings:saveCopyModel",
  (_event, input: CopyModelSettings) =>
    settingsRepository().saveCopyModelSettings(input)
);
ipcMain.handle(
  "settings:selectPath",
  async (_event, kind: "output" | "work" | "bgm") => {
    if (!window) throw new Error("应用窗口尚未就绪");
    const result =
      kind === "bgm"
        ? await dialog.showOpenDialog(window, {
            title: "选择背景音乐",
            properties: ["openFile"],
            filters: [{ name: "音频", extensions: ["mp3", "wav", "m4a", "aac"] }]
          })
        : await dialog.showOpenDialog(window, {
            title: kind === "output" ? "选择成片目录" : "选择工作目录",
            properties: ["openDirectory"]
          });
    return result.canceled ? null : result.filePaths[0] ?? null;
  }
);
ipcMain.handle("tasks:cancel", async (_event, id: string) => {
  if (backendState.status === "ready") {
    await fetch(`${backendState.baseUrl}/tasks/${id}/cancel`, {
      method: "POST",
      headers: { "X-Autocut-Token": backendState.token }
    });
  }
  return taskRepository().cancel(id);
});
licensedHandle("tasks:retry", (_event, id: string) => {
  return taskRepository().retry(id);
});
licensedHandle("tasks:start", (_event,id:string)=>queue().startTask(id));
licensedHandle("tasks:startAll", ()=>queue().startAllPending());
ipcMain.handle("tasks:pause", ()=>queue().requestPause());
ipcMain.handle("tasks:resume", ()=>queue().resume());
ipcMain.handle("tasks:queueState", ()=>queue().getState());
ipcMain.handle("tasks:openOutput", (_event, id: string) => {
  const task = taskRepository().get(id);
  if (!task?.outputPath || !existsSync(task.outputPath)) {
    throw new Error("成片文件不存在");
  }
  shell.showItemInFolder(task.outputPath);
  return { opened: true };
});
ipcMain.handle("tasks:openOutputDirectory", async () => {
  const settings = settingsRepository().getMediaSettings();
  const outputDirectory = settings.outputDirectory || join(app.getPath("videos"), "袋研官混剪成片");
  mkdirSync(outputDirectory, { recursive: true });
  const result = await shell.openPath(outputDirectory);
  if (result) throw new Error(`无法打开成品文件夹：${result}`);
  return { opened: true };
});
ipcMain.handle("tasks:delete", (_event, id: string) => ({
  deleted: taskRepository().delete(id)
}));
ipcMain.handle("publishAccounts:list", () =>
  publishRepository().listAccounts()
);
ipcMain.handle(
  "publishAccounts:create",
  (_event, input: { name: string; positioning: string; platform: PublishPlatform }) =>
    publishRepository().createAccount({
      ...input,
      userDataDir: join(
        app.getPath("userData"),
        "browser-profiles",
        input.platform,
        randomBytes(12).toString("hex")
      )
    })
);
ipcMain.handle(
  "publishAccounts:setStatus",
  (_event, id: string, status: "unknown" | "connected" | "expired" | "needs_user") =>
    publishRepository().updateAccountStatus(id, status)
);
ipcMain.handle("publishAccounts:delete", (_event, id: string) => ({
  deleted: publishRepository().deleteAccount(id)
}));
ipcMain.handle("publishAssets:list", () => publishRepository().syncCompletedTasks());
ipcMain.handle("publishAssets:update", (_event, id: string, input: Parameters<PublishRepository["updateAsset"]>[1]) => publishRepository().updateAsset(id, input));
ipcMain.handle("publishAssets:discard", (_event, id: string) => publishRepository().discardAsset(id));
ipcMain.handle("publishAssets:selectCover", async () => {
  if (!window) return null;
  const selection=await dialog.showOpenDialog(window,{title:"选择发布封面",properties:["openFile"],filters:[{name:"图片",extensions:["jpg","jpeg","png","webp"]}]});
  return selection.canceled?null:selection.filePaths[0]??null;
});
ipcMain.handle("publishTopics:list", () => publishRepository().listTopicTemplates());
ipcMain.handle("publishTopics:save", (_event, input: Parameters<PublishRepository["saveTopicTemplate"]>[0]) => publishRepository().saveTopicTemplate(input));
ipcMain.handle("publishTopics:delete", (_event, id:string) => ({deleted:publishRepository().deleteTopicTemplate(id)}));
licensedHandle("publishAssets:createJobs", (_event, input: Parameters<PublishRepository["createJobsForAsset"]>[0]) => {
  assertPublishServiceReady(backendState);
  const jobs = publishRepository().createJobsForAsset(input);
  if ((input as typeof input & { startImmediately?: boolean }).startImmediately) void wakePublishRunner(jobs.map((job) => job.id));
  return jobs;
});
licensedHandle("publishJobs:startQueue", () => {
  assertPublishServiceReady(backendState);
  void wakePublishRunner();
  return { started: true };
});
licensedHandle("publishJobs:retry", (_event, id: string) => {
  assertPublishServiceReady(backendState);
  const job = publishRepository().getJob(id);
  if (!job || job.status !== "failed") throw new Error("该任务当前不可重试");
  void wakePublishRunner([id]);
  return { started: true };
});
ipcMain.handle("publishJobs:list", () => publishRepository().listJobs());
ipcMain.handle(
  "publishJobs:create",
  (
    _event,
    input: {
      taskId: string;
      accountId: string;
      title: string;
      topics: string[];
      scheduledAt?: string | null;
      publishTime?: string | null;
      coverPath?: string | null;
      verticalCoverPath?: string | null;
      horizontalCoverPath?: string | null;
    }
  ) =>
    publishRepository().createJob({
      ...input,
      idempotencyKey: [
        input.taskId,
        input.accountId,
        input.publishTime ?? input.scheduledAt ?? "now"
      ].join(":")
    })
);
ipcMain.handle("publishJobs:cancel", async (_event, id: string) => {
  const currentJob = publishRepository().getJob(id);
  if (!currentJob) throw new Error(`未找到发布任务：${id}`);
  if (currentJob.status === "publishing" || currentJob.status === "needs_user") {
    if (backendState.status !== "ready") {
      throw new Error("本地发布服务尚未就绪，无法安全取消执行中的任务");
    }
    const cancelResponse = await fetch(`${backendState.baseUrl}/publish/jobs/${id}/cancel`, {
      method: "POST",
      headers: { "X-Autocut-Token": backendState.token }
    });
    if (!cancelResponse.ok) {
      const cancelResult = (await cancelResponse.json()) as { detail?: string };
      if (cancelResponse.status === 409 || cancelResult.detail?.toLowerCase().includes("submitted")) {
        throw new Error("任务已经提交到平台，无法从本地撤回，请到平台内容管理中取消");
      }
      throw new Error(cancelResult.detail || "发布任务取消失败，请稍后重试");
    }
  }
  return publishRepository().cancelJob(id);
  /* Legacy cancellation flow retained temporarily for migration compatibility.
  const job = publishRepository().getJob(id);
  if (!job) throw new Error(`Publish job not found: ${id}`);
  if (job.status === "publishing") {
    if (backendState.status !== "ready") {
      throw new Error("本地发布服务尚未就绪，无法安全取消执行中的任务");
    }
    const response = await fetch(
      `${backendState.baseUrl}/publish/jobs/${id}/cancel`,
      {
        method: "POST",
        headers: { "X-Autocut-Token": backendState.token }
      }
    );
    if (!response.ok) {
      const result = (await response.json()) as { detail?: string };
      if (response.status === 409 || result.detail?.toLowerCase().includes("submitted")) {
        throw new Error("任务已经提交到平台定时发布，无法从本地撤回，请到平台内容管理中取消");
      }
      throw new Error(result.detail || "发布任务取消失败，请稍后重试");
    }
  }
  return publishRepository().cancelJob(id); */
});
ipcMain.handle("publishJobs:delete", (_event, id: string) => ({
  deleted: publishRepository().deleteJob(id)
}));
ipcMain.handle("publishJobs:events", (_event, id: string) => publishRepository().listEvents(id));
licensedHandle("publishJobs:resume", async (_event, id: string) => {
  assertPublishServiceReady(backendState);
  if (backendState.status !== "ready") throw new Error("本地发布服务尚未就绪");
  const service = backendState;
  const previous = publishRepository().getJob(id);
  if (!previous) throw new Error("未找到发布任务");
  const account = publishRepository().getAccount(previous.accountId);
  if (!account) throw new Error("发布账号不存在");
  const job = publishRepository().claim(id);
  try {
    const response = await fetch(`${service.baseUrl}/publish/tasks/${id}/resume`, {
      method: "POST",
      headers: { "X-Autocut-Token": service.token }
    });
    const result = (await response.json()) as { detail?: string };
    if (!response.ok) throw new Error(result.detail || "浏览器会话已结束，请重新开始发布");
    void monitorPublishAgent(job.id, account.id);
    return job;
  } catch (error) {
    publishRepository().finishJob(id, "failed", {
      errorMessage: error instanceof Error ? error.message : "继续发布失败"
    });
    throw error;
  }
});
ipcMain.handle("diagnostics:export", async () => {
  if (!window || !database) throw new Error("应用尚未就绪");
  const selection = await dialog.showSaveDialog(window, {
    title: "导出脱敏诊断包",
    defaultPath: `autocut-diagnostics-${Date.now()}.json.gz`,
    filters: [{ name: "Gzip JSON", extensions: ["gz"] }]
  });
  if (selection.canceled || !selection.filePath) return null;
  const logs = existsSync(logPath)
    ? readFileSync(logPath, "utf8").split(/\r?\n/).slice(-2000)
    : [];
  exportDiagnosticBundle(database, selection.filePath, {
    applicationVersion: app.getVersion(),
    logs
  });
  return selection.filePath;
});
licensedHandle("copywriting:rewrite", async (_event, payload: unknown) => {
  if (backendState.status !== "ready") {
    throw new Error("本地 AI 服务尚未就绪");
  }
  const apiKey = await credentials.get("bailian");
  if (!apiKey) throw new Error("请先在系统设置中配置百炼 API Key");
  const response = await fetch(`${backendState.baseUrl}/copywriting/rewrite`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Autocut-Token": backendState.token,
      "X-Bailian-Key": apiKey,
      ...backendLicenseHeaders()
    },
    body: JSON.stringify(payload)
  });
  const result = (await response.json()) as { detail?: string };
  if (!response.ok) {
    throw new Error(result.detail || `文案改写失败 (${response.status})`);
  }
  return result;
});
async function postCopywriting(
  path: "topics" | "generate" | "compliance",
  payload: unknown,
  includeApiKey: boolean
): Promise<unknown> {
  if (backendState.status !== "ready") {
    throw new Error("本地 AI 服务尚未就绪，请稍后重试");
  }
  const apiKey = includeApiKey ? await credentials.get("bailian") : null;
  if (includeApiKey && !apiKey) {
    throw new Error("请先在系统设置中配置百炼 API Key");
  }
  const response = await fetch(`${backendState.baseUrl}/copywriting/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Autocut-Token": backendState.token,
      ...(apiKey ? { "X-Bailian-Key": apiKey } : {}),
      ...backendLicenseHeaders()
    },
    body: JSON.stringify(payload)
  });
  return readJsonResponse<{
    detail?: string | { code?: string; message?: string };
  }>(response, "文案服务请求失败");
}
licensedHandle("copywriting:topics", (_event, payload: unknown) =>
  postCopywriting("topics", payload, true)
);
licensedHandle("copywriting:generate", (_event, payload: unknown) =>
  postCopywriting("generate", payload, true)
);
ipcMain.handle("copywriting:compliance", (_event, payload: unknown) =>
  postCopywriting("compliance", payload, false)
);
ipcMain.handle("voices:list", async () => {
  if (backendState.status !== "ready") {
    throw new Error("本地 AI 服务尚未就绪");
  }
  const apiKey = await credentials.get("minimax");
  if (!apiKey) throw new Error("请先在系统设置中配置 MiniMax API Key");
  const response = await fetch(`${backendState.baseUrl}/voices`, {
    headers: {
      "X-Autocut-Token": backendState.token,
      "X-MiniMax-Key": apiKey
    }
  });
  const result = (await response.json()) as { detail?: string };
  if (!response.ok) {
    throw new Error(result.detail || `获取音色失败 (${response.status})`);
  }
  return result;
});
ipcMain.handle("voices:capabilities", async () => {
  if (backendState.status !== "ready") {
    throw new Error("本地 AI 服务尚未就绪");
  }
  const response = await fetch(`${backendState.baseUrl}/voices/capabilities`, {
    headers: { "X-Autocut-Token": backendState.token }
  });
  const result = (await response.json()) as { detail?: string };
  if (!response.ok) {
    throw new Error(result.detail || `获取声音能力失败 (${response.status})`);
  }
  return result;
});
ipcMain.handle("voices:selectSample", async () => {
  if (!window) return null;
  const result = await dialog.showOpenDialog(window, {
    title: "选择声音克隆样本",
    properties: ["openFile"],
    filters: [
      { name: "声音样本", extensions: ["mp3", "m4a", "wav"] }
    ]
  });
  return result.canceled ? null : result.filePaths[0] ?? null;
});
ipcMain.handle(
  "voices:validateSample",
  async (_event, samplePath: string) => {
    if (backendState.status !== "ready") {
      throw new Error("本地 AI 服务尚未就绪");
    }
    const response = await fetch(
      `${backendState.baseUrl}/voices/sample/validate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Autocut-Token": backendState.token,
          ...backendLicenseHeaders()
        },
        body: JSON.stringify({ samplePath })
      }
    );
    const result = (await response.json()) as { detail?: string };
    if (!response.ok) {
      throw new Error(result.detail || `声音样本校验失败 (${response.status})`);
    }
    return result;
  }
);
licensedHandle("voices:clone", async (_event, payload: unknown) => {
  if (backendState.status !== "ready") {
    throw new Error("本地 AI 服务尚未就绪");
  }
  const apiKey = await credentials.get("minimax");
  if (!apiKey) throw new Error("请先在系统设置中配置 MiniMax API Key");
  const response = await fetch(`${backendState.baseUrl}/voices/clones`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Autocut-Token": backendState.token,
      "X-MiniMax-Key": apiKey,
      ...backendLicenseHeaders()
    },
    body: JSON.stringify(payload)
  });
  const result = (await response.json()) as { detail?: string };
  if (!response.ok) {
    throw new Error(result.detail || `声音克隆失败 (${response.status})`);
  }
  return result;
});
licensedHandle("voices:synthesize", async (_event, payload: unknown) => {
  if (backendState.status !== "ready") {
    throw new Error("本地 AI 服务尚未就绪");
  }
  const apiKey = await credentials.get("minimax");
  if (!apiKey) throw new Error("请先在系统设置中配置 MiniMax API Key");
  const response = await fetch(`${backendState.baseUrl}/voices/synthesize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Autocut-Token": backendState.token,
      "X-MiniMax-Key": apiKey,
      ...backendLicenseHeaders()
    },
    body: JSON.stringify(payload)
  });
  const result = (await response.json()) as { detail?: string };
  if (!response.ok) {
    throw new Error(result.detail || `语音合成失败 (${response.status})`);
  }
  return result;
});
licensedHandle("voices:preview", async (_event, payload: unknown) => {
  if (backendState.status !== "ready") throw new Error("本地 AI 服务尚未就绪");
  const apiKey = await credentials.get("minimax");
  if (!apiKey) throw new Error("请先在系统设置中配置 MiniMax API Key");
  const response = await fetch(`${backendState.baseUrl}/voices/synthesize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Autocut-Token": backendState.token,
      "X-MiniMax-Key": apiKey,
      ...backendLicenseHeaders()
    },
    body: JSON.stringify(payload)
  });
  const result = await readJsonResponse<{
    audioPath?: string;
    detail?: string;
  }>(response, "音色试听生成失败");
  if (!result.audioPath) throw new Error("音色试听生成失败：未找到音频文件");
  const audio = readFileSync(result.audioPath);
  return `data:audio/mpeg;base64,${audio.toString("base64")}`;
});
ipcMain.handle(
  "credentials:delete",
  async (_event, name: CredentialName) => ({
    deleted: await credentials.delete(name)
  })
);

app.whenReady().then(async () => {
  app.setName(PRODUCT_NAME);
  Menu.setApplicationMenu(Menu.buildFromTemplate(createChineseMenuTemplate()));
  logPath = join(app.getPath("userData"), "logs", "electron.jsonl");
  logger = new JsonLogger(logPath);
  logger.write("info", "application.start", { version: app.getVersion() });
  const device = await collectWindowsDevice(credentials);
  localLicenseDeviceFingerprint = device.fingerprint;
  try {
    const { serviceOrigin, publicJwk } = loadLicensePublicConfig({
      environment: process.env,
      packagedConfigPath: resolve(process.resourcesPath, "license-public.json")
    });
    licenseCoordinator = new LicenseCoordinator({ device, buildId: app.getVersion(), store: credentials, api: createElectronLicenseApiClient(serviceOrigin, net.fetch), verify: (token) => verifySignedCredential(token, publicJwk) });
    await licenseCoordinator.initialize();
    licenseRefreshTimer = setInterval(() => { void licenseCoordinator?.refresh().then(() => window?.webContents.send("license:changed")); }, 30 * 60_000);
  } catch (error) {
    logger.write("warn", "license.public_config_missing", { error: error instanceof Error ? error.message : String(error) });
  }
  database = new Database(resolve(app.getPath("userData"), "autocut.sqlite3"));
  applyMigrations(database);
  ensureBuiltInTemplate(templateRepository());
  taskRepository().recoverInterrupted();
  taskRepository().recoverQueueState();
  protocol.handle("autocut-media", (request) => {
    const url = new URL(request.url);
    const resourceId = url.pathname.split("/").filter(Boolean).at(-1);
    if (url.hostname === "font") {
      const requestedPath = url.searchParams.get("path");
      const font = requestedPath
        ? scanSystemFonts().find(
            (item) => item.path.toLocaleLowerCase("en-US") === requestedPath.toLocaleLowerCase("en-US")
          )
        : null;
      if (!font || !existsSync(font.path)) {
        return new Response("Not found", { status: 404 });
      }
      return net.fetch(pathToFileURL(font.path).toString());
    }
    if (url.hostname === "asset" && resourceId) {
      const asset = assetRepository().getAsset(resourceId);
      if (!asset?.thumbnailPath || !existsSync(asset.thumbnailPath)) {
        return new Response("Not found", { status: 404 });
      }
      return net.fetch(pathToFileURL(asset.thumbnailPath).toString());
    }
    if (url.hostname === "voice" && resourceId) {
      const segment = creationDraftRepository()
        .get()
        ?.audioSegments.find((item) => item.id === resourceId);
      if (!segment?.audioPath || !existsSync(segment.audioPath)) {
        return new Response("Not found", { status: 404 });
      }
      return net.fetch(pathToFileURL(segment.audioPath).toString());
    }
    const taskId = resourceId;
    const task = taskId ? taskRepository().get(taskId) : null;
    if (!task?.outputPath || !existsSync(task.outputPath)) {
      return new Response("Not found", { status: 404 });
    }
    return net.fetch(pathToFileURL(task.outputPath).toString());
  });
  await startBackend();
  createWindow();
}).catch((error: unknown) => {
  reportStartupFailure(
    error,
    logger,
    (title, content) => dialog.showErrorBox(title, content)
  );
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (backend?.pid) terminateBackendProcessTree(backend.pid);
  else backend?.kill();
  backend = null;
  database?.close();
  database = null;
  if (publishScheduler) clearInterval(publishScheduler);
  publishScheduler = null;
  if (licenseRefreshTimer) clearInterval(licenseRefreshTimer);
  licenseRefreshTimer = null;
});
