export type VoiceOption = {
  voiceId: string;
  name: string;
  kind: string;
};

export const emotionOptions = [
  { label: "开心", value: "happy" },
  { label: "悲伤", value: "sad" },
  { label: "愤怒", value: "angry" },
  { label: "害怕", value: "fearful" },
  { label: "厌恶", value: "disgusted" },
  { label: "惊讶", value: "surprised" },
  { label: "平静", value: "calm" }
] as const;

const VOICE_NAMES: Record<string, string> = {
  "male-qn-qingse": "青涩男声",
  "male-qn-jingying": "精英男声",
  "male-qn-badao": "霸道男声",
  "male-qn-daxuesheng": "大学生男声",
  "female-shaonv": "少女音",
  "female-yujie": "御姐音",
  "female-chengshu": "成熟女声",
  "female-tianmei": "甜美女声"
};

export function voiceDisplayName(voice: VoiceOption): string {
  return (
    VOICE_NAMES[voice.voiceId] ??
    VOICE_NAMES[voice.name] ??
    voice.name ??
    voice.voiceId
  );
}

export function isChineseVoice(voice: VoiceOption): boolean {
  if (voice.kind !== "system") return true;
  return (
    /[\u3400-\u9fff]/u.test(voice.name) ||
    voice.voiceId.startsWith("Chinese") ||
    voice.voiceId.startsWith("Cantonese")
  );
}

export function selectPreferredVoices(
  voices: VoiceOption[],
  basicLimit = 10
): VoiceOption[] {
  const personal = voices.filter((voice) => voice.kind !== "system");
  const basic = voices
    .filter((voice) => voice.kind === "system" && isChineseVoice(voice))
    .slice(0, basicLimit);
  return [...personal, ...basic];
}

export function voiceKindLabel(kind: string): string {
  if (kind === "system") return "官方音色";
  if (kind === "clone") return "我的克隆音色";
  return "自定义音色";
}

export function emotionLabel(value: string | null): string {
  if (!value) return "不指定";
  return (
    emotionOptions.find((option) => option.value === value)?.label ?? value
  );
}
