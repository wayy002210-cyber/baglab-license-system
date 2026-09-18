import { describe, expect, it, vi } from "vitest";
import {
  buildBailianBackendHeaders,
  refreshBailianModels
} from "../../electron/services/bailian-model-service";

function input(fetchImpl: typeof fetch) {
  return {
    baseUrl: "http://127.0.0.1:4567",
    apiKey: "private-key-value",
    sessionToken: "session-token",
    licenseHeaders: { "X-Autocut-License": "signed-proof" },
    fetchImpl
  };
}

describe("refreshBailianModels", () => {
  it("builds the same protected headers for connection tests and model refresh", () => {
    expect(buildBailianBackendHeaders({
      apiKey: "private-key-value",
      sessionToken: "session-token",
      licenseHeaders: { "X-Autocut-License": "signed-proof" }
    })).toEqual({
      "X-Autocut-Token": "session-token",
      "X-Autocut-License": "signed-proof",
      "X-Bailian-Key": "private-key-value"
    });
  });

  it("sends secrets only to the local backend and returns model metadata", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        "X-Autocut-Token": "session-token",
        "X-Autocut-License": "signed-proof",
        "X-Bailian-Key": "private-key-value"
      });
      return new Response(JSON.stringify({
        recommendations: [{
          id: "deepseek-v4.1-flash",
          displayName: "DeepSeek V4.1 Flash",
          family: "deepseek",
          status: "available",
          note: "实时调用验证通过"
        }],
        checkedAt: "2026-09-18T08:00:00Z",
        source: "provider"
      }), { status: 200 });
    }) as typeof fetch;

    const result = await refreshBailianModels(input(fetchImpl));

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:4567/copywriting/models/recommendations",
      expect.any(Object)
    );
    expect(result.recommendations[0].id).toBe("deepseek-v4.1-flash");
    expect(JSON.stringify(result)).not.toContain("private-key-value");
  });

  it.each([
    [401, "BAILIAN_INVALID_KEY", "密钥无效或地域不匹配"],
    [403, "BAILIAN_MODEL_FORBIDDEN", "无权使用推荐模型"],
    [429, "BAILIAN_RATE_LIMITED", "请求过于频繁"],
    [504, "BAILIAN_TIMEOUT", "网络连接超时"]
  ])("maps %i failures to an actionable message", async (status, code, message) => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      detail: { code, message: "provider detail" }
    }), { status })) as typeof fetch;

    await expect(refreshBailianModels(input(fetchImpl))).rejects.toThrow(message);
  });

  it("rejects malformed success responses", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      recommendations: [{ id: "unchecked" }]
    }), { status: 200 })) as typeof fetch;

    await expect(refreshBailianModels(input(fetchImpl))).rejects.toThrow(/无法识别/);
  });
});
