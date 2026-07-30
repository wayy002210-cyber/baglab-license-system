import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("global design tokens", () => {
  it("defines consistent spacing, radius, control and typography tokens", () => {
    const css = readFileSync("src/renderer/styles/global.css", "utf8");
    for (const token of [
      "--space-card",
      "--radius-card",
      "--radius-control",
      "--control-height",
      "--font-page-title",
      "--font-section-title"
    ]) {
      expect(css).toContain(token);
    }
  });
});
