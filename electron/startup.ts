export type StartupLogger = {
  write(
    level: "info" | "warn" | "error",
    event: string,
    details?: unknown
  ): void;
};

export function reportStartupFailure(
  error: unknown,
  logger: StartupLogger | null,
  showError: (title: string, content: string) => void
): string {
  const message = error instanceof Error ? error.message : String(error);
  logger?.write("error", "application.start_failed", { error });
  showError(
    "全自动混剪工作台启动失败",
    `程序初始化失败：${message}\n\n请重新安装最新版；如仍失败，请提供应用日志。`
  );
  return message;
}
