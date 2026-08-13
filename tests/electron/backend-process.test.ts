import { describe, expect, it } from "vitest";
import {
  createBackendLaunchConfig,
  terminateBackendProcessTree,
  terminateStalePackagedBackends,
  waitForBackendHealth
} from "../../electron/backend-process";

describe("createBackendLaunchConfig", () => {
  it("binds the backend to localhost with a session token", () => {
    const config = createBackendLaunchConfig({
      pythonExecutable: "python",
      backendDirectory: "D:/autocut/backend",
      sessionToken: "token-123",
      port: 43120,
      buildId: "0.6.7-diag.test",
      installRoot: "D:/autocut",
      lockFilePath: "D:/autocut/userData/runtime/autocut-backend.lock"
    });

    expect(config.command).toBe("python");
    expect(config.args).toEqual(["-m", "app.main"]);
    expect(config.cwd).toBe("D:/autocut/backend");
    expect(config.env.AUTOCUT_SESSION_TOKEN).toBe("token-123");
    expect(config.env.AUTOCUT_PORT).toBe("43120");
    expect(config.env.AUTOCUT_HOST).toBe("127.0.0.1");
    expect(config.env.AUTOCUT_BUILD_ID).toBe("0.6.7-diag.test");
    expect(config.env.AUTOCUT_INSTALL_ROOT).toBe("D:/autocut");
    expect(config.env.AUTOCUT_BACKEND_LOCK_FILE).toBe(
      "D:/autocut/userData/runtime/autocut-backend.lock"
    );
    expect(config.env.PYTHONIOENCODING).toBe("utf-8");
  });

  it("launches the packaged backend executable without Python module args", () => {
    const config = createBackendLaunchConfig({
      pythonExecutable: "resources/backend/autocut-backend.exe",
      backendDirectory: "resources/backend",
      sessionToken: "token",
      port: 41000,
      packaged: true
    });
    expect(config.args).toEqual([]);
  });

  it("waits through transient startup failures until health succeeds", async () => {
    let calls = 0;
    await waitForBackendHealth({
      baseUrl: "http://127.0.0.1:41000",
      token: "secret",
      attempts: 3,
      delay: async () => undefined,
      fetcher: async () => {
        calls += 1;
        if (calls < 3) throw new Error("not ready");
        return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
      }
    });
    expect(calls).toBe(3);
  });

  it("rejects a packaged backend whose build id differs from the desktop app", async () => {
    await expect(
      waitForBackendHealth({
        baseUrl: "http://127.0.0.1:41000",
        token: "secret",
        expectedBuildId: "0.5.1",
        attempts: 1,
        delay: async () => undefined,
        fetcher: async () =>
          new Response(
            JSON.stringify({
              status: "ok",
              service: "autocut-backend",
              buildId: "0.5.0"
            }),
            { status: 200 }
          )
      })
    ).rejects.toThrow("前后端版本不一致");
  });
});

describe("terminateStalePackagedBackends", () => {
  it("terminates the complete stale backend process tree", () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    terminateStalePackagedBackends((command, args) => {
      calls.push({ command, args });
      return { status: 0 } as never;
    });
    expect(calls).toEqual([
      { command: "taskkill.exe", args: ["/IM", "autocut-backend.exe", "/T", "/F"] },
      {
        command: "powershell.exe",
        args: [
          "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command",
          "Get-Process -Name 'autocut-backend-*' -ErrorAction SilentlyContinue | Stop-Process -Force"
        ]
      }
    ]);
  });
});

describe("terminateBackendProcessTree", () => {
  it("terminates the owned backend and all encoder children", () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    terminateBackendProcessTree(4321, (command, args) => {
      calls.push({ command, args });
      return { status: 0 } as never;
    });
    expect(calls).toEqual([{
      command: "taskkill.exe",
      args: ["/PID", "4321", "/T", "/F"]
    }]);
  });
});
