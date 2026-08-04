const STOP_PHRASES = [
  "为什么", "你的", "我们", "客户", "一个", "这个", "怎么",
  "行业", "告诉你", "真相", "就是"
];

export function deriveShortTitle(topic: string): string {
  let chinese = normalizeShortTitle(topic);
  for (const phrase of STOP_PHRASES) {
    chinese = chinese.replaceAll(phrase, "");
  }
  if (chinese.length < 5) return "袋研官做定制";
  return chinese.slice(0, 8);
}

export function normalizeShortTitle(value: string): string {
  return (value.match(/[\u3400-\u9fff]/g) ?? []).join("");
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function toSafeOutputStem(value: string): string {
  const cleaned = value
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*“”‘’：，。！？、]/g, "")
    .replace(/[\u0000-\u001f]/g, "")
    .trim()
    .replace(/[. ]+$/g, "") || "未命名视频";
  return WINDOWS_RESERVED.test(cleaned) ? `视频${cleaned}` : cleaned;
}
