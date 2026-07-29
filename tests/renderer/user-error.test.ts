import { describe, expect, it } from "vitest";
import { toUserMessage } from "../../src/renderer/lib/user-error.js";

describe("toUserMessage", () => {
  it("translates a missing preload bridge into an actionable Chinese message", () => {
    expect(
      toUserMessage(
        new TypeError(
          "Cannot read properties of undefined (reading 'selectAndScanAssets')"
        ),
        "素材扫描失败"
      )
    ).toBe("程序组件未正确加载，请重启软件；若仍失败，请重新安装最新版。");
  });

  it("does not expose unknown English implementation errors", () => {
    expect(toUserMessage(new Error("Network request failed"), "检测失败")).toBe(
      "检测失败，请稍后重试。"
    );
  });

  it("preserves a useful Chinese business error", () => {
    expect(toUserMessage(new Error("请选择包含视频的分类文件夹"), "素材扫描失败"))
      .toBe("请选择包含视频的分类文件夹");
  });

  it("removes Electron IPC implementation prefixes from Chinese errors", () => {
    expect(
      toUserMessage(
        new Error(
          "Error invoking remote method 'assets:selectAndScan': Error: 素材扫描失败 (500)"
        ),
        "素材扫描失败"
      )
    ).toBe("素材扫描失败（错误码 500）");
  });
});
