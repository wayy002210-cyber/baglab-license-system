<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { useRouter } from "vue-router";
import PageIntro from "../components/PageIntro.vue";
import MediaSettingsPanel from "../components/editing/MediaSettingsPanel.vue";
import { useCreationDraft } from "../composables/useCreationDraft";
import { defaultSubtitleStyle, defaultTitleStyle, type TextStyle } from "../../shared/media-style";
import { splitAndRecommendShots } from "../editing/split-copywriting-shots";

type Project=Awaited<ReturnType<typeof window.autocut.listCopywritingProjects>>[number];
type Shot=Awaited<ReturnType<typeof window.autocut.listCopywritingShots>>[number];
type Category=Awaited<ReturnType<typeof window.autocut.listAssetCategories>>[number];
const draft=useCreationDraft();
const router=useRouter();
const projects=ref<Project[]>([]),categories=ref<Category[]>([]),shots=ref<Shot[]>([]);
const selectedId=ref<string|null>(null),tab=ref<"library"|"shots_ready"|"archived">("library");
const splitting=ref(false),saving=ref(false);
const creating=ref(false);
const selected=computed(()=>projects.value.find(p=>p.id===selectedId.value)??null);
const visibleProjects=computed(()=>projects.value.filter(p=>p.status===tab.value));
const subtitleStyle=computed<TextStyle>({get:()=>draft.draft.value.subtitleStyle??defaultSubtitleStyle,set:v=>draft.draft.value.subtitleStyle=v});
const titleStyle=computed<TextStyle>({get:()=>draft.draft.value.titleStyle??defaultTitleStyle,set:v=>draft.draft.value.titleStyle=v});
const voiceSettings=ref<Awaited<ReturnType<typeof window.autocut.getVoiceSettings>>|null>(null);
const voiceVolume=computed(()=>voiceSettings.value?.volume??1);

async function load(){
  const loadedProjects=await window.autocut.listCopywritingProjects(["library","shots_ready","archived"]);
  projects.value=loadedProjects;
  try{voiceSettings.value=await window.autocut.getVoiceSettings()}catch(e){ElMessage.warning(`声音设置读取失败，暂时使用默认音量：${e instanceof Error?e.message:"未知错误"}`)}
  try{categories.value=await window.autocut.listAssetCategories()}catch(e){ElMessage.warning(`素材分类读取失败：${e instanceof Error?e.message:"未知错误"}`)}
  try{await draft.load()}catch(e){ElMessage.warning(`媒体设置读取失败，文案库仍可使用：${e instanceof Error?e.message:"未知错误"}`)}
  const first=loadedProjects.find(p=>p.status==="library")??loadedProjects[0];
  if(first)await selectProject(first);
}
async function updateVoiceVolume(value:number){
  if(!voiceSettings.value)return;
  voiceSettings.value={...voiceSettings.value,volume:value};
  voiceSettings.value=await window.autocut.saveVoiceSettings({...voiceSettings.value});
}
async function selectProject(project:Project){selectedId.value=project.id;shots.value=await window.autocut.listCopywritingShots(project.id)}
function inputs(){return shots.value.map(s=>({copywriting:s.copywriting,suggestedCategoryId:s.suggestedCategoryId,assetCategoryId:s.assetCategoryId,suggestionSource:s.suggestionSource,suggestionConfirmed:s.suggestionConfirmed,durationMode:s.durationMode,durationSec:s.durationSec,muteOriginal:s.muteOriginal}))}
async function splitProject(project:Project){
  const generated=splitAndRecommendShots(project.text,categories.value).map(s=>({
    copywriting:s.copywriting,suggestedCategoryId:s.categoryId,assetCategoryId:s.categoryId,
    suggestionSource:s.source,suggestionConfirmed:false,durationMode:"voice" as const,durationSec:null,muteOriginal:true
  }));
  const saved=await window.autocut.replaceCopywritingShots(project.id,generated);
  const index=projects.value.findIndex(p=>p.id===project.id);if(index>=0)projects.value[index]={...projects.value[index],status:"shots_ready"};
  if(project.id===selectedId.value)shots.value=saved;
}
async function splitCurrent(){if(!selected.value)return ElMessage.warning("请先选择一条待剪辑文案");splitting.value=true;try{await splitProject(selected.value);tab.value="shots_ready";ElMessage.success("已按台词拆分镜头并完成素材类型初选，请人工确认")}catch(e){ElMessage.error(e instanceof Error?e.message:"自动拆镜失败")}finally{splitting.value=false}}
async function splitAll(){
  const pending=projects.value.filter(p=>p.status==="library");if(!pending.length)return ElMessage.warning("没有待拆分文案");splitting.value=true;
  let done=0;try{for(const project of pending){await splitProject(project);done++}tab.value="shots_ready";ElMessage.success(`已完成 ${done} 条文案拆镜`)}catch(e){ElMessage.error(`已完成 ${done} 条，随后失败：${e instanceof Error?e.message:"未知错误"}`)}finally{splitting.value=false}
}
function updateShot(index:number,patch:Partial<Shot>){shots.value=shots.value.map((s,i)=>i===index?{...s,...patch,suggestionSource:patch.assetCategoryId?"manual":s.suggestionSource,suggestionConfirmed:patch.assetCategoryId?true:s.suggestionConfirmed}:s)}
function move(index:number,offset:number){const target=index+offset;if(target<0||target>=shots.value.length)return;const copy=[...shots.value];[copy[index],copy[target]]=[copy[target],copy[index]];shots.value=copy.map((s,i)=>({...s,index:i}))}
function remove(index:number){shots.value=shots.value.filter((_,i)=>i!==index).map((s,i)=>({...s,index:i}))}
async function saveShots(){if(!selected.value)return;saving.value=true;try{shots.value=await window.autocut.replaceCopywritingShots(selected.value.id,inputs());ElMessage.success("镜头修改已保存")}finally{saving.value=false}}
async function createTasks(all:boolean){
  const ids=all?projects.value.filter(p=>p.status==="shots_ready").map(p=>p.id):selected.value?.status==="shots_ready"?[selected.value.id]:[];
  if(!ids.length)return ElMessage.warning("没有已完成拆镜的文案可创建任务");creating.value=true;
  try{if(shots.value.length&&selected.value?.status==="shots_ready")await saveShots();await draft.saveImmediate();const tasks=await window.autocut.createTasksFromCopywriting({projectIds:ids,seed:Date.now()&0x7fffffff});ElMessage.success(`已创建 ${tasks.length} 条待合成任务`);await router.push("/tasks")}catch(e){ElMessage.error(e instanceof Error?e.message:"创建混剪任务失败")}finally{creating.value=false}
}
onMounted(load);
</script>

<template><div class="page editing-page">
  <PageIntro title="镜头剪辑" description="从文案库批量拆分台词镜头，自动建议素材类型，再统一设置背景音乐、标题和字幕。" />
  <section class="task-bar surface"><div><strong>批量混剪准备</strong><small>完成拆镜和样式后，可创建当前脚本或所有脚本任务</small></div><el-button :loading="creating" @click="createTasks(false)">创建当前脚本任务</el-button><el-button type="primary" :loading="creating" @click="createTasks(true)">创建所有脚本任务</el-button></section>
  <div class="editor-grid">
    <aside class="surface library">
      <h3>文案库</h3><div class="tabs"><button :class="{active:tab==='library'}" @click="tab='library'">待剪辑文案</button><button :class="{active:tab==='shots_ready'}" @click="tab='shots_ready'">已拆镜文案</button><button :class="{active:tab==='archived'}" @click="tab='archived'">归档文案</button></div>
      <div class="project-list"><button v-for="project in visibleProjects" :key="project.id" class="project" :class="{selected:project.id===selectedId}" @click="selectProject(project)"><strong>{{project.mainTitle||project.topicTitle}}</strong><span>{{project.topicTitle}}</span><small>{{project.text.slice(0,56)}}{{project.text.length>56?'…':''}}</small></button><p v-if="!visibleProjects.length" class="empty">当前列表为空</p></div>
    </aside>
    <main class="surface shot-workspace">
      <header><div><h3>镜头创作区</h3><p>每句台词对应一个镜头，素材类型是系统建议结果，可人工修改。</p></div><div><el-button data-action="split-current" :loading="splitting" @click="splitCurrent">从当前文案自动拆分镜头</el-button><el-button :loading="splitting" @click="splitAll">自动拆分所有文案镜头</el-button></div></header>
      <div v-if="!selected" class="workspace-empty">请从左侧选择文案</div>
      <div v-else-if="!shots.length" class="workspace-empty"><strong>当前文案还没有镜头</strong><span>点击右上角按钮，系统会拆分台词并推荐素材类型。</span></div>
      <article v-for="(shot,index) in shots" :key="shot.id" class="shot-card"><span class="number">{{index+1}}</span><div class="shot-copy"><el-input :model-value="shot.copywriting" type="textarea" :rows="3" @update:model-value="updateShot(index,{copywriting:String($event)})"/><small>{{shot.suggestionSource==='manual'?'已人工确认':shot.suggestionSource==='default'?'待人工确认':'已按关键词推荐'}}</small></div><div class="shot-settings"><label>素材类型<el-select :model-value="shot.assetCategoryId" @update:model-value="updateShot(index,{assetCategoryId:String($event)})"><el-option v-for="category in categories" :key="category.id" :label="`${category.name}（${category.assetCount}）`" :value="category.id"/></el-select></label><label>时长策略<el-select :model-value="shot.durationMode" @update:model-value="updateShot(index,{durationMode:$event})"><el-option label="跟随配音" value="voice"/><el-option label="固定时长" value="fixed"/><el-option label="自动" value="auto"/></el-select></label><el-checkbox :model-value="shot.muteOriginal" @update:model-value="updateShot(index,{muteOriginal:Boolean($event)})">静音原声</el-checkbox></div><footer><el-button :disabled="index===0" @click="move(index,-1)">上移</el-button><el-button :disabled="index===shots.length-1" @click="move(index,1)">下移</el-button><el-button type="danger" @click="remove(index)">删除</el-button></footer></article>
      <div v-if="shots.length" class="save-row"><el-button type="primary" :loading="saving" @click="saveShots">保存镜头修改</el-button></div>
    </main>
  </div>
  <MediaSettingsPanel class="surface media-panel" :bgm="draft.draft.value.bgm" :voice-volume="voiceVolume" :subtitle-style="subtitleStyle" :title-style="titleStyle" :title="selected?.mainTitle??''" :sample-text="shots[0]?.copywriting??''" @update:bgm="draft.draft.value.bgm=$event;draft.scheduleSave()" @update:voice-volume="updateVoiceVolume" @update:subtitle-style="subtitleStyle=$event;draft.scheduleSave()" @update:title-style="titleStyle=$event;draft.scheduleSave()" />
</div></template>
<style scoped>.editing-page{display:grid;gap:18px}.task-bar{position:sticky;top:12px;z-index:5;padding:16px 20px;display:flex;align-items:center;justify-content:flex-end;gap:10px}.task-bar>div{display:grid;margin-right:auto}.task-bar small,.shot-workspace p,.project span,.project small,.workspace-empty{color:var(--text-muted)}.editor-grid{display:grid;grid-template-columns:290px minmax(0,1fr);gap:18px}.library,.shot-workspace,.media-panel{padding:20px}.library h3,.shot-workspace h3,.shot-workspace p{margin:0}.tabs{display:grid;gap:7px;margin:16px 0}.tabs button,.project{border:0;text-align:left;cursor:pointer}.tabs button{padding:10px 12px;border-radius:10px;background:#f2f2ee}.tabs button.active{background:#151512;color:#fff}.project-list{display:grid;gap:10px;max-height:620px;overflow:auto}.project{display:grid;gap:5px;padding:14px;border-radius:14px;background:#f7f7f3;border:1px solid transparent}.project.selected{border-color:var(--brand-yellow);background:#fffbe0}.shot-workspace>header{display:flex;justify-content:space-between;gap:16px}.shot-workspace>header>div:last-child{display:flex;gap:8px}.workspace-empty{min-height:300px;display:grid;place-items:center;align-content:center;gap:8px}.shot-card{display:grid;grid-template-columns:34px minmax(280px,1fr) 250px;gap:12px;padding:16px 0;border-bottom:1px solid var(--border)}.number{width:30px;height:30px;display:grid;place-items:center;border-radius:9px;background:var(--brand-yellow);font-weight:800}.shot-copy,.shot-settings{display:grid;gap:8px}.shot-copy small{color:#8b6a00}.shot-settings label{display:grid;gap:5px;font-size:12px}.shot-card footer{grid-column:2/4;text-align:right}.save-row{text-align:right;padding-top:18px}.media-panel{margin-bottom:30px}@media(max-width:1000px){.editor-grid{grid-template-columns:1fr}.task-bar{position:static;flex-wrap:wrap}.shot-card{grid-template-columns:34px 1fr}.shot-settings,.shot-card footer{grid-column:2}}
</style>
