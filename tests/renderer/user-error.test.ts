import { describe, expect, it } from "vitest";
import { mapUserError, toUserMessage } from "../../src/renderer/lib/user-error.js";

describe("user error mapping", () => {
  it("explains a model structured-output failure instead of hiding it", () => {
    const result = mapUserError(
      new Error("Model output failed validation after 3 attempts: topics too long"),
      "生成选题失败"
    );

    expect(result.title).toBe("模型返回格式不稳定");
    expect(result.detail).toContain("DeepSeek");
    expect(result.action).toContain("重新生成");
  });

  it("maps unavailable model errors to a model recovery action", () => {
    const result = mapUserError(
      new Error("model deepseek-v3 not found (404)"),
      "生成选题失败"
    );
    expect(result.title).toBe("当前模型不可用");
    expect(result.action).toContain("系统设置");
  });

  it("translates a missing preload bridge into an actionable Chinese message", () => {
    expect(toUserMessage(
      new TypeError("Cannot read properties of undefined (reading 'selectAndScanAssets')"),
      "素材扫描失败"
    )).toContain("请重启软件");
  });

  it("maps authorization, rate-limit, disk and font failures", () => {
    expect(mapUserError(new Error("HTTP 401"), "失败").title).toBe("服务授权失效");
    expect(mapUserError(new Error("429 rate limit"), "失败").action).toContain("一分钟");
    expect(mapUserError(new Error("ENOSPC"), "失败").title).toBe("磁盘空间不足");
    expect(mapUserError(new Error("font missing"), "失败").action).toContain("TTF");
  });

  it("does not expose unknown English implementation errors", () => {
    expect(toUserMessage(new Error("opaque provider failure"), "检测失败")).toBe(
      "检测失败，请稍后重试。"
    );
  });

  it("preserves a useful Chinese business error", () => {
    expect(toUserMessage(new Error("请选择包含视频的分类文件夹"), "素材扫描失败"))
      .toBe("请选择包含视频的分类文件夹");
  });
});
