export type VoiceOption = { voiceId:string;name:string;kind:string };
export const emotionOptions=[
  {label:"开心",value:"happy"},{label:"悲伤",value:"sad"},{label:"愤怒",value:"angry"},
  {label:"害怕",value:"fearful"},{label:"厌恶",value:"disgusted"},{label:"惊讶",value:"surprised"},
  {label:"平静",value:"calm"}
] as const;
const VOICE_NAMES:Record<string,string>={
  "male-qn-qingse":"青涩男声","male-qn-jingying":"精英男声","male-qn-badao":"霸道男声",
  "male-qn-daxuesheng":"大学生男声","female-shaonv":"少女音","female-yujie":"御姐音",
  "female-chengshu":"成熟女声","female-tianmei":"甜美女声"
};
export function voiceDisplayName(voice:VoiceOption):string{return VOICE_NAMES[voice.voiceId]??VOICE_NAMES[voice.name]??voice.name??voice.voiceId}
export function isChineseVoice(voice:VoiceOption):boolean{return voice.kind!=="system"||/[\u3400-\u9fff]/u.test(voice.name)||voice.voiceId.startsWith("Chinese")||voice.voiceId.startsWith("Cantonese")||voice.voiceId.startsWith("male-qn-")||voice.voiceId.startsWith("female-")}
export function selectPreferredVoices(voices:VoiceOption[],basicLimit=10):VoiceOption[]{const personal=voices.filter(v=>v.kind!=="system");const basic=voices.filter(v=>v.kind==="system"&&isChineseVoice(v)).slice(0,basicLimit);return [...personal,...basic]}
export function voiceKindLabel(kind:string):string{return kind==="system"?"官方音色":kind==="clone"?"我的克隆音色":"自定义音色"}
export function emotionLabel(value:string|null):string{return value?emotionOptions.find(o=>o.value===value)?.label??value:"不指定"}
