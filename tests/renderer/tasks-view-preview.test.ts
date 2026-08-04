import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("TasksView preview", () => {
  it("uses the validated media protocol and keeps preview outside the table", () => {
    const source = readFileSync("src/renderer/views/TasksView.vue", "utf8");
    expect(source).toContain("autocut-media://task/");
    expect(source).not.toContain("autocut-file://");
    expect(source).toContain("fixed-preview");
    expect(source).toContain("打开成品文件夹");
  });
});
