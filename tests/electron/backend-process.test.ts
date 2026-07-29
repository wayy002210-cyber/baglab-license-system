import { describe, expect, it } from "vitest";
import { createBackendLaunchConfig } from "../../electron/backend-process";

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
});
