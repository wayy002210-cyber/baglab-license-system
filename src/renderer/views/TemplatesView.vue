<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import PageIntro from "../components/PageIntro.vue";
import TemplateLibrary from "../components/editing/TemplateLibrary.vue";
import ShotEditor from "../components/editing/ShotEditor.vue";
import MediaSettingsPanel from "../components/editing/MediaSettingsPanel.vue";
import { useCreationDraft } from "../composables/useCreationDraft";
import { defaultSubtitleStyle, defaultTitleStyle } from "../../shared/media-style";
import type { TextStyle } from "../../shared/media-style";
import type { CreationDraft } from "../../shared/contracts";
type Template = Awaited<ReturnType<typeof window.autocut.listTemplates>>[number];
type Category = Awaited<ReturnType<typeof window.autocut.listAssetCategories>>[number];
const state=useCreationDraft();const templates=ref<Template[]>([]);const categories=ref<Category[]>([]);const selectedId=ref<string|null>(null);
const subtitleStyle=computed<TextStyle>({get:()=>state.draft.value.subtitleStyle??defaultSubtitleStyle,set:value=>state.draft.value.subtitleStyle=value});
const titleStyle=computed<TextStyle>({get:()=>state.draft.value.titleStyle??defaultTitleStyle,set:value=>state.draft.value.titleStyle=value});
function deriveShots(){
 if(state.draft.value.shots.length)return;
 state.draft.value.shots=state.draft.value.audioSegments.map((segment,index)=>({id:`shot-${segment.id}`,index,audioSegmentId:segment.id,copywriting:segment.text,assetCategoryId:categories.value[0]?.id??null,durationMode:"voice",durationSec:segment.durationSec,muteOriginal:true}));
}
async function load(){[templates.value,categories.value]=await Promise.all([window.autocut.listTemplates(),window.autocut.listAssetCategories(),state.load()]);deriveShots();}
function applyTemplate(template:Template){selectedId.value=template.id;state.draft.value.shots=state.draft.value.audioSegments.map((segment,index)=>{const preset=template.shots[index%template.shots.length];return{id:`shot-${segment.id}`,index,audioSegmentId:segment.id,copywriting:segment.text,assetCategoryId:preset?.assetCategoryId??categories.value[0]?.id??null,durationMode:preset?.durationMode??"voice",durationSec:segment.durationSec,muteOriginal:preset?.muteOriginal??true};});}
async function saveTemplate(){if(!state.draft.value.shots.length)return;await window.autocut.createTemplate({name:`创作模板 ${new Date().toLocaleDateString()}`,description:"由当前镜头创作区保存",shots:state.draft.value.shots.map(shot=>({role:"custom",assetCategoryId:shot.assetCategoryId,copywriting:shot.copywriting,durationMode:shot.durationMode,durationSec:shot.durationMode==="fixed"?shot.durationSec:null,muteOriginal:shot.muteOriginal}))});templates.value=await window.autocut.listTemplates();ElMessage.success("当前镜头结构已保存为模板");}
function updateShots(shots:CreationDraft["shots"]){state.draft.value.shots=shots;state.scheduleSave();}
async function validateAndSave(){const notReady=state.draft.value.audioSegments.findIndex(s=>s.status!=="ready");if(notReady>=0)return ElMessage.warning(`第 ${notReady+1} 段配音尚未生成`);const missing=state.draft.value.shots.findIndex(s=>!s.assetCategoryId||!s.copywriting.trim());if(missing>=0)return ElMessage.warning(`第 ${missing+1} 个镜头缺少素材类型或口播文案`);state.draft.value.stage="ready";await state.saveImmediate();ElMessage.success("镜头方案已保存，可以创建任务");}
onMounted(load);
</script>
<template>
 <div class="page editing-page">
  <PageIntro title="镜头剪辑" description="按口播音频逐镜头指定素材类型，并统一设置背景音乐、标题和字幕。" action="保存镜头方案" @action="validateAndSave"/>
  <div class="studio">
   <TemplateLibrary class="surface" :templates="templates" :selected-id="selectedId" @select="applyTemplate" @save="saveTemplate"/>
   <ShotEditor class="surface" :shots="state.draft.value.shots" :categories="categories" @update:shots="updateShots"/>
   <MediaSettingsPanel class="surface" :bgm="state.draft.value.bgm" :subtitle-style="subtitleStyle" :title-style="titleStyle" :sample-text="state.draft.value.shots[0]?.copywriting??''" @update:bgm="state.draft.value.bgm=$event;state.scheduleSave()" @update:subtitle-style="subtitleStyle=$event;state.scheduleSave()" @update:title-style="titleStyle=$event;state.scheduleSave()"/>
  </div>
 </div>
</template>
<style scoped>
.studio{display:grid;grid-template-columns:250px minmax(460px,1fr) 330px;gap:16px;align-items:start}.studio>*{min-width:0}@media(max-width:1250px){.studio{grid-template-columns:220px 1fr}.media-panel{grid-column:1/-1}}@media(max-width:820px){.studio{grid-template-columns:1fr}.media-panel{grid-column:auto}}
</style>
