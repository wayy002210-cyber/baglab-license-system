export type DesktopWindowVisibilityTarget = {
  show(): void;
  focus(): void;
  moveTop(): void;
  once(event: "ready-to-show", listener: () => void): unknown;
  webContents: {
    once(event: "did-finish-load", listener: () => void): unknown;
  };
};

export function registerDesktopWindowVisibility(
  window: DesktopWindowVisibilityTarget,
  isPackaged: boolean,
  schedule: (callback: () => void, milliseconds: number) => unknown = setTimeout
): void {
  let shown = false;
  const showOnce = () => {
    if (shown) return;
    shown = true;
    window.show();
    window.focus();
    window.moveTop();
  };
  window.once("ready-to-show", showOnce);
  if (!isPackaged) {
    window.webContents.once("did-finish-load", showOnce);
    schedule(showOnce, 1_500);
  }
}
