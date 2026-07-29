import { describe, expect, it } from "vitest";
import { createChineseMenuTemplate } from "../../electron/application-menu.js";

describe("createChineseMenuTemplate", () => {
  it("provides Chinese top-level menus and no default English labels", () => {
    const template = createChineseMenuTemplate();
    expect(template.map((item) => item.label)).toEqual([
      "文件",
      "编辑",
      "视图",
      "窗口",
      "帮助"
    ]);
    expect(JSON.stringify(template)).not.toMatch(
      /"(File|Edit|View|Window|Help)"/
    );
  });
});
