<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import PageIntro from "../components/PageIntro.vue";
import { toUserMessage } from "../lib/user-error";
type Task = Awaited<ReturnType<typeof window.autocut.listTasks>>[number];
type Queue = Awaited<ReturnType<typeof window.autocut.getQueueState>>;
const tasks = ref<Task[]>([]);
const queue = ref<Queue>({ status: "idle", activeTaskId: null, pendingCount: 0 });
const loading = ref(false);
const previewTask = ref<Task | null>(null);
let timer: ReturnType<typeof setInterval> | undefined;
const statusMeta: Record<Task["status"], { label: string; type: "info"|"primary"|"warning"|"success"|"danger" }> = {
  draft:{label:"草稿",type:"info"},pending:{label:"待合成",type:"info"},queued:{label:"旧版排队",type:"info"},
  preparing_copy:{label:"准备文案",type:"primary"},generating_voice:{label:"生成配音",type:"primary"},
  selecting_assets:{label:"选择素材",type:"primary"},composing:{label:"编排镜头",type:"warning"},
  waiting_encoding:{label:"等待编码器",type:"info"},encoding:{label:"编码成片",type:"warning"},
  completed:{label:"已完成",type:"success"},failed:{label:"失败",type:"danger"},canceled:{label:"已取消",type:"info"}
};
const running = computed(() => queue.value.status === "running" || queue.value.status === "pause_requested");
async function load(){loading.value=true;try{[tasks.value,queue.value]=await Promise.all([window.autocut.listTasks(),window.autocut.getQueueState()]);if(previewTask.value){previewTask.value=tasks.value.find(item=>item.id===previewTask.value?.id)??null}}finally{loading.value=false}}
async function action(run:()=>Promise<unknown>,success?:string){try{await run();if(success)ElMessage.success(success);await load()}catch(error){ElMessage.error(toUserMessage(error,"操作失败"))}}
const start=(task:Task)=>action(()=>window.autocut.startTask(task.id),"任务已开始合成");
const startAll=()=>action(()=>window.autocut.startAllPendingTasks(),"串行合成队列已启动");
const pause=()=>action(()=>window.autocut.requestQueuePause(),"当前任务完成后将暂停队列");
const resume=()=>action(()=>window.autocut.resumeQueue(),"队列已继续");
const cancel=(task:Task)=>action(()=>window.autocut.cancelTask(task.id),"任务已取消");
const retry=(task:Task)=>action(()=>window.autocut.retryTask(task.id),"任务已恢复为待合成");
async function remove(task:Task){await ElMessageBox.confirm("只删除任务记录，不删除已生成的成片文件。","删除任务");await action(()=>window.autocut.deleteTask(task.id));if(previewTask.value?.id===task.id)previewTask.value=null}
const open=(task:Task)=>action(()=>window.autocut.openTaskOutput(task.id));
const openFolder=()=>action(()=>window.autocut.openOutputDirectory());
function name(task:Task,key:"persona"|"template"){const value=task.snapshot[key];return value&&typeof value==="object"&&"name" in value?String(value.name):key==="template"?String((task.snapshot.copywriting as {mainTitle?:string}|undefined)?.mainTitle??"创作文案"):"账号档案"}
function elapsed(task:Task){if(!task.startedAt)return"—";const end=task.completedAt?Date.parse(task.completedAt):Date.now();const sec=Math.max(0,Math.floor((end-Date.parse(task.startedAt))/1000));return sec<60?`${sec}秒`:`${Math.floor(sec/60)}分${sec%60}秒`}
const active=(task:Task)=>!["pending","completed","failed","canceled"].includes(task.status);
const meta=(task:Task)=>statusMeta[task.status];
onMounted(async()=>{await load();timer=setInterval(()=>void load(),5000)});
onBeforeUnmount(()=>timer&&clearInterval(timer));
</script>
<template>
  <div class="page task-page">
    <PageIntro title="任务中心" description="任务创建后先进入待合成列表，由你手动启动单条或严格串行合成全部任务。" />
    <section class="surface queue-bar">
      <div><strong>串行合成队列</strong><span>{{queue.status==='running'?'正在合成':queue.status==='pause_requested'?'等待当前任务结束后暂停':queue.status==='paused'?'已暂停':'空闲'}} · {{queue.pendingCount}} 条待合成</span></div>
      <el-button @click="openFolder">打开成品文件夹</el-button>
      <el-button type="primary" :disabled="running||queue.pendingCount===0" @click="startAll">一键合成所有任务</el-button>
      <el-button :disabled="queue.status!=='running'" @click="pause">暂停合成任务</el-button>
      <el-button :disabled="queue.status!=='paused'" @click="resume">继续合成任务</el-button>
    </section>
    <section class="task-layout">
      <div class="surface task-panel">
        <el-table v-loading="loading" :data="tasks" height="100%" highlight-current-row @current-change="(row:Task|null)=>{if(row?.status==='completed')previewTask=row}">
          <el-table-column label="脚本 / 档案" min-width="155"><template #default="{row}"><strong>{{name(row,'template')}}</strong><div class="muted">{{name(row,'persona')}}</div></template></el-table-column>
          <el-table-column label="阶段" width="105"><template #default="{row}"><el-tag :type="meta(row).type">{{meta(row).label}}</el-tag></template></el-table-column>
          <el-table-column label="进度" min-width="145"><template #default="{row}"><el-progress :percentage="Math.round(row.progress)" :status="row.status==='failed'?'exception':row.status==='completed'?'success':undefined"/></template></el-table-column>
          <el-table-column label="耗时" width="76"><template #default="{row}">{{elapsed(row)}}</template></el-table-column>
          <el-table-column label="错误与处理建议" min-width="180"><template #default="{row}"><span class="error-text">{{row.errorMessage||'—'}}</span></template></el-table-column>
          <el-table-column label="操作" width="210"><template #default="{row}"><el-button v-if="row.status==='pending'" link type="primary" :disabled="running" @click.stop="start(row)">开始</el-button><el-button v-if="active(row)" link type="danger" @click.stop="cancel(row)">取消</el-button><el-button v-if="row.status==='failed'||row.status==='canceled'" link type="primary" @click.stop="retry(row)">重试</el-button><el-button v-if="row.status==='completed'" link type="primary" @click.stop="open(row)">打开</el-button><el-button v-if="row.status==='completed'" link @click.stop="previewTask=row">预览</el-button><el-button v-if="['completed','failed','canceled'].includes(row.status)" link type="danger" @click.stop="remove(row)">删除</el-button></template></el-table-column>
          <template #empty><el-empty description="还没有待合成任务，请先在镜头剪辑页面创建"/></template>
        </el-table>
      </div>
      <aside class="surface fixed-preview">
        <header><strong>成片预览</strong><span v-if="previewTask">{{name(previewTask,'template')}}</span></header>
        <video v-if="previewTask" :key="previewTask.id" controls preload="metadata" :src="`autocut-media://task/${previewTask.id}`" />
        <el-empty v-else description="选择一条已完成任务即可预览" />
      </aside>
    </section>
  </div>
</template>
<style scoped>
.task-page{display:grid;gap:18px}.queue-bar{display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:18px 20px}.queue-bar>div{display:grid;margin-right:auto}.queue-bar span,.muted{color:var(--text-muted);font-size:12px;margin-top:4px}.task-layout{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:16px;align-items:start}.task-panel{height:calc(100vh - 285px);min-height:420px;padding:12px}.fixed-preview{position:sticky;top:18px;padding:14px;display:grid;gap:12px}.fixed-preview header{display:grid;gap:3px}.fixed-preview header span{font-size:12px;color:var(--text-muted)}.fixed-preview video{width:100%;aspect-ratio:9/16;max-height:calc(100vh - 340px);background:#111;border-radius:14px}.error-text{color:#d33;white-space:normal}@media(max-width:1100px){.task-layout{grid-template-columns:1fr}.fixed-preview{position:static}.fixed-preview video{aspect-ratio:16/9}.queue-bar{align-items:stretch;flex-direction:column}.queue-bar>div{margin-right:0}.task-panel{height:600px}}
</style>
