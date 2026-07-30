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
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { basename, extname, join, resolve } from "node:path";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { ChildProcess } from "node:child_process";
import Database from "better-sqlite3";
import keytar from "keytar";
import {
  createBackendLaunchConfig,
  spawnBackend,
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

let window: BrowserWindow | null = null;
let backend: ChildProcess | null = null;
let database: Database.Database | null = null;
let publishScheduler: ReturnType<typeof setInterval> | null = null;
let logger: JsonLogger | null = null;
let logPath = "";
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
  const outputPath = join(
    settings.outputDirectory || join(app.getPath("videos"), "袋研官混剪成片"),
    `${task.id}.mp4`
  );
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Autocut-Token": backendState.token
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
      taskRepository().transition(task.id, "failed", {
        errorCode: "WORKER_CONNECTION_FAILED",
        errorMessage: error instanceof Error ? error.message : "任务执行失败"
      });
      logger?.write("error", "generation.connection_failed", {
        taskId: task.id,
        error
      });
    }
  }
}

async function runNextPublishJob(): Promise<void> {
  if (backendState.status !== "ready") return;
  const job = publishRepository().claimNextDue(new Date().toISOString());
  if (!job) return;
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
    return;
  }
  try {
    const response = await fetch(
      `${backendState.baseUrl}/publish/jobs/${job.id}/run`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Autocut-Token": backendState.token
        },
        body: JSON.stringify({
          platform: account.platform,
          userDataDir: account.userDataDir,
          videoPath: task.outputPath,
          title: job.title,
          topics: job.topics,
          coverPath: job.coverPath,
          screenshotDir: join(app.getPath("userData"), "logs", "publish", job.id)
        })
      }
    );
    const result = (await response.json()) as {
      status?: "published" | "failed" | "needs_user" | "canceled";
      errorMessage?: string | null;
      screenshotPath?: string | null;
      detail?: string;
    };
    if (!response.ok || !result.status) {
      throw new Error(result.detail || `发布服务失败 (${response.status})`);
    }
    const current = publishRepository().getJob(job.id);
    if (current?.status === "canceled") return;
    if (result.status === "canceled") {
      publishRepository().cancelJob(job.id);
      return;
    }
    publishRepository().finishJob(job.id, result.status, {
      errorMessage: result.errorMessage ?? undefined,
      screenshotPath: result.screenshotPath ?? undefined
    });
    logger?.write(
      result.status === "published" ? "info" : "warn",
      "publish.finished",
      {
        jobId: job.id,
        status: result.status,
        errorMessage: result.errorMessage,
        screenshotPath: result.screenshotPath
      }
    );
    if (result.status === "needs_user") {
      publishRepository().updateAccountStatus(account.id, "needs_user");
    }
  } catch (error) {
    if (publishRepository().getJob(job.id)?.status === "canceled") return;
    publishRepository().finishJob(job.id, "failed", {
      errorMessage: error instanceof Error ? error.message : "发布失败"
    });
    logger?.write("error", "publish.failed", { jobId: job.id, error });
  }
}
let backendState:
  | { status: "starting" | "ready"; baseUrl: string; token: string }
  | { status: "stopped" | "failed"; message: string } = {
  status: "stopped",
  message: "本地服务尚未启动"
};

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

async function startBackend(): Promise<void> {
  const port = await findFreePort();
  const token = randomBytes(32).toString("hex");
  const backendDirectory = app.isPackaged
    ? resolve(process.resourcesPath, "backend")
    : resolve(process.cwd(), "backend");
  const config = createBackendLaunchConfig({
    pythonExecutable: app.isPackaged
      ? resolve(backendDirectory, "autocut-backend.exe")
      : process.env.AUTOCUT_PYTHON ?? "python",
    backendDirectory,
    sessionToken: token,
    port,
    packaged: app.isPackaged,
    resourceDirectory: app.isPackaged ? process.resourcesPath : undefined,
    dataDirectory: app.getPath("userData")
  });
  backendState = {
    status: "starting",
    baseUrl: `http://127.0.0.1:${port}`,
    token
  };
  const processHandle = spawnBackend(config);
  backend = processHandle;
  processHandle.once("spawn", async () => {
    try {
      await waitForBackendHealth({
        baseUrl: `http://127.0.0.1:${port}`,
        token
      });
      backendState = {
        status: "ready",
        baseUrl: `http://127.0.0.1:${port}`,
        token
      };
      logger?.write("info", "backend.ready", { port });
    } catch (error) {
      backendState = {
        status: "failed",
        message: error instanceof Error ? error.message : "后端健康检查失败"
      };
      logger?.write("error", "backend.health_failed", { error });
      processHandle.kill();
    }
  });
  processHandle.once("error", (error) => {
    backendState = { status: "failed", message: error.message };
  });
  processHandle.once("exit", (code) => {
    if (backendState.status !== "failed") {
      backendState = {
        status: "stopped",
        message: `本地服务已退出 (${code ?? "unknown"})`
      };
    }
  });
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
ipcMain.handle("publishAccounts:check", async (_event, id: string) => {
  if (backendState.status !== "ready") throw new Error("本地发布服务尚未就绪");
  const account = publishRepository().getAccount(id);
  if (!account) throw new Error("发布账号不存在");
  const response = await fetch(
    `${backendState.baseUrl}/publish/accounts/${id}/check`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Autocut-Token": backendState.token
      },
      body: JSON.stringify({
        platform: account.platform,
        userDataDir: account.userDataDir
      })
    }
  );
  const result = (await response.json()) as {
    status?: "unknown" | "connected" | "expired" | "needs_user";
    detail?: string;
  };
  if (!response.ok || !result.status) {
    throw new Error(result.detail || "账号状态检测失败");
  }
  return publishRepository().updateAccountStatus(id, result.status);
});
ipcMain.handle("publishAccounts:connect", async (_event, id: string) => {
  if (backendState.status !== "ready") throw new Error("本地发布服务尚未就绪");
  const account = publishRepository().getAccount(id);
  if (!account) throw new Error("发布账号不存在");
  const response = await fetch(
    `${backendState.baseUrl}/publish/accounts/${id}/connect`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Autocut-Token": backendState.token
      },
      body: JSON.stringify({
        platform: account.platform,
        userDataDir: account.userDataDir
      })
    }
  );
  const result = (await response.json()) as {
    status?: "unknown" | "connected" | "expired" | "needs_user";
    detail?: string;
  };
  if (!response.ok || !result.status) {
    throw new Error(result.detail || "账号登录连接失败");
  }
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
ipcMain.handle("assets:selectAndScan", async () => {
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
      "X-Autocut-Token": backendState.token
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
ipcMain.handle("tasks:createBatch", (_event, input: CreateTaskBatchInput) => {
  const media = settingsRepository().getMediaSettings();
  const tasks = taskRepository().createBatch({
    ...input,
    snapshot: {
      ...input.snapshot,
      media,
      bgmPath: media.bgmPath
    }
  });
  for (const task of tasks) void runGenerationTask(task);
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
    for (const task of tasks) void runGenerationTask(task);
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
    filters: [{ name: "字体", extensions: ["ttf", "otf"] }]
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
ipcMain.handle("tasks:retry", (_event, id: string) => {
  const task = taskRepository().retry(id);
  void runGenerationTask(task);
  return task;
});
ipcMain.handle("tasks:openOutput", (_event, id: string) => {
  const task = taskRepository().get(id);
  if (!task?.outputPath || !existsSync(task.outputPath)) {
    throw new Error("成片文件不存在");
  }
  shell.showItemInFolder(task.outputPath);
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
  (_event, input: { name: string; platform: PublishPlatform }) =>
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
      scheduledAt: string | null;
      coverPath?: string | null;
    }
  ) =>
    publishRepository().createJob({
      ...input,
      idempotencyKey: [
        input.taskId,
        input.accountId,
        input.scheduledAt ?? "now"
      ].join(":")
    })
);
ipcMain.handle("publishJobs:cancel", async (_event, id: string) => {
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
      throw new Error(result.detail || "发布已经提交到平台，不能再安全取消");
    }
  }
  return publishRepository().cancelJob(id);
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
ipcMain.handle("copywriting:rewrite", async (_event, payload: unknown) => {
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
      "X-Bailian-Key": apiKey
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
      ...(apiKey ? { "X-Bailian-Key": apiKey } : {})
    },
    body: JSON.stringify(payload)
  });
  const result = (await response.json()) as {
    detail?: string | { code?: string; message?: string };
  };
  if (!response.ok) {
    const detail =
      typeof result.detail === "string"
        ? result.detail
        : result.detail?.message;
    throw new Error(
      detail || `文案服务请求失败 (${response.status})，请稍后重试`
    );
  }
  return result;
}
ipcMain.handle("copywriting:topics", (_event, payload: unknown) =>
  postCopywriting("topics", payload, true)
);
ipcMain.handle("copywriting:generate", (_event, payload: unknown) =>
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
          "X-Autocut-Token": backendState.token
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
ipcMain.handle("voices:clone", async (_event, payload: unknown) => {
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
      "X-MiniMax-Key": apiKey
    },
    body: JSON.stringify(payload)
  });
  const result = (await response.json()) as { detail?: string };
  if (!response.ok) {
    throw new Error(result.detail || `声音克隆失败 (${response.status})`);
  }
  return result;
});
ipcMain.handle("voices:synthesize", async (_event, payload: unknown) => {
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
      "X-MiniMax-Key": apiKey
    },
    body: JSON.stringify(payload)
  });
  const result = (await response.json()) as { detail?: string };
  if (!response.ok) {
    throw new Error(result.detail || `语音合成失败 (${response.status})`);
  }
  return result;
});
ipcMain.handle("voices:preview", async (_event, payload: unknown) => {
  if (backendState.status !== "ready") throw new Error("本地 AI 服务尚未就绪");
  const apiKey = await credentials.get("minimax");
  if (!apiKey) throw new Error("请先在系统设置中配置 MiniMax API Key");
  const response = await fetch(`${backendState.baseUrl}/voices/synthesize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Autocut-Token": backendState.token,
      "X-MiniMax-Key": apiKey
    },
    body: JSON.stringify(payload)
  });
  const result = (await response.json()) as {
    audioPath?: string;
    detail?: string;
  };
  if (!response.ok || !result.audioPath) {
    throw new Error(result.detail || "音色试听生成失败");
  }
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
  database = new Database(resolve(app.getPath("userData"), "autocut.sqlite3"));
  applyMigrations(database);
  ensureBuiltInTemplate(templateRepository());
  taskRepository().recoverInterrupted();
  protocol.handle("autocut-media", (request) => {
    const url = new URL(request.url);
    const resourceId = url.pathname.split("/").filter(Boolean).at(-1);
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
  publishScheduler = setInterval(() => void runNextPublishJob(), 15_000);
  void runNextPublishJob();
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
  backend?.kill();
  backend = null;
  database?.close();
  database = null;
  if (publishScheduler) clearInterval(publishScheduler);
  publishScheduler = null;
});
