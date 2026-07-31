const STOP_PHRASES = [
  "为什么", "你的", "我们", "客户", "一个", "这个", "怎么",
  "行业", "告诉你", "真相", "就是"
];

export function deriveShortTitle(topic: string): string {
  let chinese = (topic.match(/[\u3400-\u9fff]/g) ?? []).join("");
  for (const phrase of STOP_PHRASES) {
    chinese = chinese.replaceAll(phrase, "");
  }
  if (chinese.length < 5) return "袋研官做定制";
  return chinese.slice(0, 6);
}
