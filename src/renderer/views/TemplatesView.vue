<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import PageIntro from "../components/PageIntro.vue";
import TemplateLibrary from "../components/editing/TemplateLibrary.vue";
import ShotEditor from "../components/editing/ShotEditor.vue";
import MediaSettingsPanel from "../components/editing/MediaSettingsPanel.vue";
import { useCreationDraft } from "../composables/useCreationDraft";
import { defaultSubtitleStyle, defaultTitleStyle } from "../../shared/media-style";
import type { TextStyle } from "../../shared/media-style";
import type { CreationDraft } from "../../shared/contracts";
import {
  appendShot,
  buildShotsFromDraft
} from "../editing/shot-builder";
type Template = Awaited<ReturnType<typeof window.autocut.listTemplates>>[number];
type Category = Awaited<ReturnType<typeof window.autocut.listAssetCategories>>[number];
const state=useCreationDraft();const templates=ref<Template[]>([]);const categories=ref<Category[]>([]);const selectedId=ref<string|null>(null);
const router=useRouter();const taskCount=ref(1);const creating=ref(false);
const templateName=ref("新建镜头模板");const templateDescription=ref("由当前镜头创作区保存");
const subtitleStyle=computed<TextStyle>({get:()=>state.draft.value.subtitleStyle??defaultSubtitleStyle,set:value=>state.draft.value.subtitleStyle=value});
const titleStyle=computed<TextStyle>({get:()=>state.draft.value.titleStyle??defaultTitleStyle,set:value=>state.draft.value.titleStyle=value});
function deriveShots(){
 if(state.draft.value.shots.length)return;
 state.draft.value.shots=buildShotsFromDraft(state.draft.value,categories.value[0]?.id??null);
}
async function load(){[templates.value,categories.value]=await Promise.all([window.autocut.listTemplates(),window.autocut.listAssetCategories(),state.load()]);deriveShots();}
function applyTemplate(template:Template){selectedId.value=template.id;templateName.value=template.name;templateDescription.value=template.description;const sources=buildShotsFromDraft(state.draft.value,categories.value[0]?.id??null);state.draft.value.shots=sources.map((source,index)=>{const preset=template.shots.length?template.shots[index%template.shots.length]:null;return{...source,assetCategoryId:preset?.assetCategoryId??source.assetCategoryId,durationMode:preset?.durationMode??source.durationMode,durationSec:preset?.durationMode==="fixed"?preset.durationSec:source.durationSec,muteOriginal:preset?.muteOriginal??source.muteOriginal};});}
function templateInput(){return{name:templateName.value.trim()||"未命名镜头模板",description:templateDescription.value.trim(),shots:state.draft.value.shots.map(shot=>({role:"custom" as const,assetCategoryId:shot.assetCategoryId,copywriting:shot.copywriting,durationMode:shot.durationMode,durationSec:shot.durationMode==="fixed"?shot.durationSec:null,muteOriginal:shot.muteOriginal}))};}
async function saveTemplate(){if(!state.draft.value.shots.length)return ElMessage.warning("请先创建至少一个镜头");if(selectedId.value)await window.autocut.updateTemplate(selectedId.value,templateInput());else{const created=await window.autocut.createTemplate(templateInput());selectedId.value=created.id;}templates.value=await window.autocut.listTemplates();ElMessage.success("当前镜头结构已保存为模板");}
function newTemplate(){selectedId.value=null;templateName.value="新建镜头模板";templateDescription.value="";state.draft.value.shots=buildShotsFromDraft(state.draft.value,categories.value[0]?.id??null);}
async function duplicateTemplate(id:string){const created=await window.autocut.duplicateTemplate(id);templates.value=await window.autocut.listTemplates();applyTemplate(created);ElMessage.success("模板副本已创建，可继续编辑");}
function rebuildShots(){state.draft.value.shots=buildShotsFromDraft(state.draft.value,categories.value[0]?.id??null);state.scheduleSave();}
function addShot(){state.draft.value.shots=appendShot(state.draft.value.shots,categories.value[0]?.id??null);state.scheduleSave();}
function updateShots(shots:CreationDraft["shots"]){state.draft.value.shots=shots;state.scheduleSave();}
async function validateAndSave(){const notReady=state.draft.value.audioSegments.findIndex(s=>s.status!=="ready");if(notReady>=0)return ElMessage.warning(`第 ${notReady+1} 段配音尚未生成`);const missing=state.draft.value.shots.findIndex(s=>!s.assetCategoryId||!s.copywriting.trim());if(missing>=0)return ElMessage.warning(`第 ${missing+1} 个镜头缺少素材类型或口播文案`);state.draft.value.stage="ready";await state.saveImmediate();ElMessage.success("镜头方案已保存，可以创建任务");}
async function createTasks(){await validateAndSave();if(state.draft.value.stage!=="ready")return;creating.value=true;try{await window.autocut.createTasksFromDraft({count:taskCount.value,seed:Date.now()&0x7fffffff});ElMessage.success(`已创建 ${taskCount.value} 条混剪任务`);await router.push("/tasks");}finally{creating.value=false;}}
onMounted(load);
</script>
<template>
 <div class="page editing-page">
  <PageIntro title="镜头剪辑" description="按口播音频逐镜头指定素材类型，并统一设置背景音乐、标题和字幕。" action="保存镜头方案" @action="validateAndSave"/>
  <section class="create-bar surface">
    <div><strong>创建混剪任务</strong><span>将当前文案、配音、选片规则和样式固化为不可变快照</span></div>
    <el-input-number v-model="taskCount" :min="1" :max="20"/>
    <el-button type="primary" :loading="creating" @click="createTasks">创建任务并进入任务中心</el-button>
  </section>
  <div class="studio">
   <TemplateLibrary class="surface" :templates="templates" :selected-id="selectedId" :name="templateName" :description="templateDescription" @update:name="templateName=$event" @update:description="templateDescription=$event" @select="applyTemplate" @save="saveTemplate" @new="newTemplate" @duplicate="duplicateTemplate"/>
   <ShotEditor class="surface" :shots="state.draft.value.shots" :categories="categories" @update:shots="updateShots" @rebuild="rebuildShots" @add="addShot"/>
   <MediaSettingsPanel class="surface" :bgm="state.draft.value.bgm" :subtitle-style="subtitleStyle" :title-style="titleStyle" :sample-text="state.draft.value.shots[0]?.copywriting??''" @update:bgm="state.draft.value.bgm=$event;state.scheduleSave()" @update:subtitle-style="subtitleStyle=$event;state.scheduleSave()" @update:title-style="titleStyle=$event;state.scheduleSave()"/>
  </div>
 </div>
</template>
<style scoped>
.create-bar{display:flex;align-items:center;justify-content:flex-end;gap:14px;padding:14px 18px;margin-bottom:16px}.create-bar div{display:grid;margin-right:auto}.create-bar span{font-size:12px;color:var(--muted);margin-top:3px}.studio{display:grid;grid-template-columns:250px minmax(460px,1fr) 330px;gap:16px;align-items:start}.studio>*{min-width:0}@media(max-width:1250px){.studio{grid-template-columns:220px 1fr}.media-panel{grid-column:1/-1}}@media(max-width:820px){.studio{grid-template-columns:1fr}.media-panel{grid-column:auto}.create-bar{flex-wrap:wrap}}
</style>
