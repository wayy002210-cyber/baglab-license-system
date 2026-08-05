import { describe, expect, it } from "vitest";
import { assertPublishServiceReady } from "../../electron/publish-readiness";

describe("assertPublishServiceReady", () => {
  it("本地服务版本不匹配时阻止创建无法执行的发布任务", () => {
    expect(() =>
      assertPublishServiceReady({
        status: "failed",
        message: "前后端版本不一致：桌面端 0.5.8，本地服务 0.5.7。"
      })
    ).toThrow("发布任务未创建：前后端版本不一致：桌面端 0.5.8，本地服务 0.5.7。");
  });

  it("本地服务已就绪时允许创建发布任务", () => {
    expect(() =>
      assertPublishServiceReady({
        status: "ready",
        baseUrl: "http://127.0.0.1:43199",
        token: "token"
      })
    ).not.toThrow();
  });
});
