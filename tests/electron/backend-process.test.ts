import { describe, expect, it } from "vitest";
import {
  createBackendLaunchConfig,
  waitForBackendHealth
} from "../../electron/backend-process";

describe("createBackendLaunchConfig", () => {
  it("binds the backend to localhost with a session token", () => {
    const config = createBackendLaunchConfig({
      pythonExecutable: "python",
      backendDirectory: "D:/autocut/backend",
      sessionToken: "token-123",
      port: 43120
    });

    expect(config.command).toBe("python");
    expect(config.args).toEqual(["-m", "app.main"]);
    expect(config.cwd).toBe("D:/autocut/backend");
    expect(config.env.AUTOCUT_SESSION_TOKEN).toBe("token-123");
    expect(config.env.AUTOCUT_PORT).toBe("43120");
    expect(config.env.AUTOCUT_HOST).toBe("127.0.0.1");
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
});
