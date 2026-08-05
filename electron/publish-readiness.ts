export type PublishBackendState =
  | { status: "starting" | "ready"; baseUrl: string; token: string }
  | { status: "stopped" | "failed"; message: string };

export function assertPublishServiceReady(state: PublishBackendState): void {
  if (state.status === "ready") return;
  const reason =
    "message" in state && state.message
      ? state.message
      : "本地发布服务正在启动，请稍后重试";
  throw new Error(`发布任务未创建：${reason}`);
}
