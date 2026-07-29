const CHINESE_CHARACTER = /[\u3400-\u9fff]/;
const IMPLEMENTATION_ERROR =
  /Cannot read properties|is not a function|is not defined|window\.autocut|selectAndScanAssets/i;

export function toUserMessage(error: unknown, fallback: string): string {
  const rawMessage = error instanceof Error ? error.message.trim() : "";
  const message = rawMessage.replace(
    /^Error invoking remote method '[^']+': Error:\s*/i,
    ""
  );

  if (IMPLEMENTATION_ERROR.test(message)) {
    return "程序组件未正确加载，请重启软件；若仍失败，请重新安装最新版。";
  }
  if (message && CHINESE_CHARACTER.test(message)) {
    return message.replace(/\s*\((\d{3})\)$/u, "（错误码 $1）");
  }
  return `${fallback.replace(/[。！!]+$/u, "")}，请稍后重试。`;
}
