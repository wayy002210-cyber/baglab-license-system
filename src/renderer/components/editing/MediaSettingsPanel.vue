<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import type { CreationDraft } from "../../../shared/contracts";
import type { TextStyle } from "../../../shared/media-style";
import SubtitleStyleEditor from "./SubtitleStyleEditor.vue";
import TitleStyleEditor from "./TitleStyleEditor.vue";
import PhoneCanvasPreview from "./PhoneCanvasPreview.vue";
type Bgm = NonNullable<CreationDraft["bgm"]>;
const props = defineProps<{ bgm: Bgm | null; voiceVolume: number; subtitleStyle: TextStyle; titleStyle: TextStyle; title: string; sampleText: string }>();
const emit = defineEmits<{ "update:bgm": [value:Bgm|null]; "update:voiceVolume":[value:number]; "update:subtitleStyle":[value:TextStyle]; "update:titleStyle":[value:TextStyle] }>();
const tracks = ref<Array<{path:string;name:string;format:string}>>([]);
const invalidCount = ref(0);
const presets = ref<Awaited<ReturnType<typeof window.autocut.getStylePresets>>>([]);
const selectedPreset = ref("");
const presetName = ref("");
async function chooseFile(){const path=await window.autocut.selectBgmFile();if(path)emit("update:bgm",{sourceType:"file",path,mode:"fixed",volume:.16,fadeInSec:1,fadeOutSec:1});}
async function chooseFolder(){const path=await window.autocut.selectBgmFolder();if(!path)return;const result=await window.autocut.scanAudioLibrary({folderPath:path,recursive:true});tracks.value=result.tracks;invalidCount.value=result.invalid.length;emit("update:bgm",{sourceType:"folder",path,mode:"random",volume:.16,fadeInSec:1,fadeOutSec:1});}
function applyPreset(id:string){const preset=presets.value.find(item=>item.id===id);if(!preset)return;emit("update:subtitleStyle",structuredClone(preset.subtitleStyle));emit("update:titleStyle",structuredClone(preset.titleStyle));}
async function savePreset(){const name=presetName.value.trim();if(!name)return ElMessage.warning("请输入样式模板名称");const preset={id:crypto.randomUUID(),name,subtitleStyle:structuredClone(props.subtitleStyle),titleStyle:structuredClone(props.titleStyle)};presets.value=await window.autocut.saveStylePresets([...presets.value,preset]);selectedPreset.value=preset.id;presetName.value="";ElMessage.success("字幕与标题样式模板已保存");}
async function deletePreset(){if(!selectedPreset.value)return;presets.value=await window.autocut.saveStylePresets(presets.value.filter(item=>item.id!==selectedPreset.value));selectedPreset.value="";ElMessage.success("样式模板已删除");}
onMounted(async()=>{presets.value=await window.autocut.getStylePresets();});
</script>
<template>
  <aside class="panel media-panel">
    <header><h3>背景音乐与字幕</h3><p>集中设置成片声音、标题和字幕。</p></header>
    <section><strong>声音混合</strong><div class="actions"><el-button size="small" @click="chooseFile">选择单曲</el-button><el-button size="small" @click="chooseFolder">选择文件夹</el-button></div><p class="path">{{ bgm?.path || "未选择，支持 MP3 / WAV / M4A / AAC / FLAC" }}</p><el-select v-if="bgm?.sourceType==='folder'" :model-value="bgm.mode" @update:model-value="$emit('update:bgm',{...bgm,mode:$event})"><el-option label="随机" value="random"/><el-option label="顺序" value="sequential"/></el-select><p v-if="tracks.length">{{ tracks.length }} 首可用，{{ invalidCount }} 首无法读取</p><div class="mix-grid"><label>人声音量 {{ voiceVolume.toFixed(1) }}<el-slider :model-value="voiceVolume" :min="0" :max="3" :step=".1" @update:model-value="$emit('update:voiceVolume',Number($event))"/></label><label v-if="bgm">背景音乐音量 {{ bgm.volume.toFixed(2) }}<el-slider :model-value="bgm.volume" :min="0" :max="1" :step=".01" @update:model-value="$emit('update:bgm',{...bgm,volume:Number($event)})"/></label><label v-else>背景音乐音量<small>选择音乐后可调节</small></label></div></section>
    <section class="preview-section">
      <div class="preview-heading"><strong>成片字幕预览</strong><span>9:16 · 1080×1920</span></div>
      <PhoneCanvasPreview :subtitle-style="subtitleStyle" :title-style="titleStyle" :title="title" :subtitle="sampleText" />
    </section>
    <section class="style-presets">
      <strong>字幕与标题样式模板</strong>
      <el-select v-model="selectedPreset" placeholder="选择已保存模板" @change="applyPreset">
        <el-option v-for="preset in presets" :key="preset.id" :label="preset.name" :value="preset.id"/>
      </el-select>
      <div class="actions"><el-input v-model="presetName" placeholder="输入模板名称"/><el-button type="primary" @click="savePreset">保存当前样式</el-button><el-button :disabled="!selectedPreset" @click="deletePreset">删除</el-button></div>
    </section>
    <SubtitleStyleEditor :model-value="subtitleStyle" @update:model-value="$emit('update:subtitleStyle',$event)"/>
    <TitleStyleEditor :model-value="titleStyle" @update:model-value="$emit('update:titleStyle',$event)"/>
  </aside>
</template>
<style scoped>
.panel{padding:22px;display:grid;gap:22px}.panel h3,.panel p{margin:0}.panel header p,.path{font-size:12px;color:var(--muted);word-break:break-all}.panel section{display:grid;gap:10px}.actions{display:flex;gap:8px;flex-wrap:wrap}.mix-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.mix-grid label{display:grid;gap:7px;font-size:12px}.mix-grid small{color:var(--muted)}.preview-section{padding:16px;border-radius:16px;background:#f5f5f2}.preview-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.preview-heading span{font-size:12px;color:var(--muted)}.panel :deep(.phone-canvas){margin:auto}
</style>
