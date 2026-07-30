<script setup lang="ts">
import { ref } from "vue";
import type { CreationDraft } from "../../../shared/contracts";
import type { TextStyle } from "../../../shared/media-style";
import SubtitleStyleEditor from "./SubtitleStyleEditor.vue";
import TitleStyleEditor from "./TitleStyleEditor.vue";
import PhoneCanvasPreview from "./PhoneCanvasPreview.vue";
type Bgm = NonNullable<CreationDraft["bgm"]>;
const props = defineProps<{ bgm: Bgm | null; subtitleStyle: TextStyle; titleStyle: TextStyle; sampleText: string }>();
const emit = defineEmits<{ "update:bgm": [value:Bgm|null]; "update:subtitleStyle":[value:TextStyle]; "update:titleStyle":[value:TextStyle] }>();
const tracks = ref<Array<{path:string;name:string;format:string}>>([]);
const invalidCount = ref(0);
async function chooseFile(){const path=await window.autocut.selectBgmFile();if(path)emit("update:bgm",{sourceType:"file",path,mode:"fixed",volume:.16,fadeInSec:1,fadeOutSec:1});}
async function chooseFolder(){const path=await window.autocut.selectBgmFolder();if(!path)return;const result=await window.autocut.scanAudioLibrary({folderPath:path,recursive:true});tracks.value=result.tracks;invalidCount.value=result.invalid.length;emit("update:bgm",{sourceType:"folder",path,mode:"random",volume:.16,fadeInSec:1,fadeOutSec:1});}
</script>
<template>
  <aside class="panel media-panel">
    <header><h3>背景音乐与字幕</h3><p>集中设置成片声音、标题和字幕。</p></header>
    <section><strong>背景音乐</strong><div class="actions"><el-button size="small" @click="chooseFile">选择单曲</el-button><el-button size="small" @click="chooseFolder">选择文件夹</el-button></div><p class="path">{{ bgm?.path || "未选择，支持 MP3 / WAV / M4A / AAC / FLAC" }}</p><el-select v-if="bgm?.sourceType==='folder'" :model-value="bgm.mode" @update:model-value="$emit('update:bgm',{...bgm,mode:$event})"><el-option label="随机" value="random"/><el-option label="顺序" value="sequential"/></el-select><p v-if="tracks.length">{{ tracks.length }} 首可用，{{ invalidCount }} 首无法读取</p><label v-if="bgm">音乐音量 {{ bgm.volume.toFixed(2) }}<el-slider :model-value="bgm.volume" :min="0" :max="1" :step=".01" @update:model-value="$emit('update:bgm',{...bgm,volume:Number($event)})"/></label></section>
    <section class="preview-section">
      <div class="preview-heading"><strong>成片字幕预览</strong><span>9:16 · 1080×1920</span></div>
      <PhoneCanvasPreview :subtitle-style="subtitleStyle" :title-style="titleStyle" :subtitle="sampleText" />
    </section>
    <SubtitleStyleEditor :model-value="subtitleStyle" @update:model-value="$emit('update:subtitleStyle',$event)"/>
    <TitleStyleEditor :model-value="titleStyle" @update:model-value="$emit('update:titleStyle',$event)"/>
  </aside>
</template>
<style scoped>
.panel{padding:22px;display:grid;gap:22px}.panel h3,.panel p{margin:0}.panel header p,.path{font-size:12px;color:var(--muted);word-break:break-all}.panel section{display:grid;gap:10px}.actions{display:flex;gap:8px;flex-wrap:wrap}.preview-section{padding:16px;border-radius:16px;background:#f5f5f2}.preview-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.preview-heading span{font-size:12px;color:var(--muted)}.panel :deep(.phone-canvas){margin:auto}
</style>
