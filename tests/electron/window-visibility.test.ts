import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { registerDesktopWindowVisibility } from "../../electron/window-visibility";

class FakeWindow extends EventEmitter {
  readonly webContents = new EventEmitter();
  showCount = 0;
  focusCount = 0;
  moveTopCount = 0;

  show(): void {
    this.showCount += 1;
  }

  focus(): void {
    this.focusCount += 1;
  }

  moveTop(): void {
    this.moveTopCount += 1;
  }
}

describe("registerDesktopWindowVisibility", () => {
  it("shows the development window after the renderer finishes loading when ready-to-show is missing", () => {
    const window = new FakeWindow();
    registerDesktopWindowVisibility(window, false);

    window.webContents.emit("did-finish-load");
    window.emit("ready-to-show");

    expect(window.showCount).toBe(1);
    expect(window.focusCount).toBe(1);
    expect(window.moveTopCount).toBe(1);
  });

  it("shows the development window after the fallback delay when renderer events never arrive", () => {
    const window = new FakeWindow();
    let fallback: (() => void) | undefined;
    registerDesktopWindowVisibility(window, false, (callback) => {
      fallback = callback;
    });

    fallback?.();

    expect(window.showCount).toBe(1);
  });
});
