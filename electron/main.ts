import { app, BrowserWindow, ipcMain } from "electron";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { resolve } from "node:path";
import type { ChildProcess } from "node:child_process";
import Database from "better-sqlite3";
import keytar from "keytar";
import {
  createBackendLaunchConfig,
  spawnBackend
} from "./backend-process.js";
import { CredentialStore, type CredentialName } from "./credential-store.js";
import { applyMigrations } from "./database.js";

let window: BrowserWindow | null = null;
let backend: ChildProcess | null = null;
let database: Database.Database | null = null;
const credentials = new CredentialStore(keytar);
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
    pythonExecutable: process.env.AUTOCUT_PYTHON ?? "python",
    backendDirectory,
    sessionToken: token,
    port
  });
  backendState = {
    status: "starting",
    baseUrl: `http://127.0.0.1:${port}`,
    token
  };
  const processHandle = spawnBackend(config);
  backend = processHandle;
  processHandle.once("spawn", () => {
    backendState = {
      status: "ready",
      baseUrl: `http://127.0.0.1:${port}`,
      token
    };
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
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 640,
    show: false,
    backgroundColor: "#f4f7fc",
    webPreferences: {
      preload: resolve(__dirname, "../preload/preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  window.once("ready-to-show", () => window?.show());
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
ipcMain.handle(
  "credentials:delete",
  async (_event, name: CredentialName) => ({
    deleted: await credentials.delete(name)
  })
);

app.whenReady().then(async () => {
  database = new Database(resolve(app.getPath("userData"), "autocut.sqlite3"));
  applyMigrations(database);
  await startBackend();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  backend?.kill();
  backend = null;
  database?.close();
  database = null;
});
