<script setup lang="ts">
import { computed,onBeforeUnmount,onMounted,ref } from "vue";
import { ElMessage,ElMessageBox } from "element-plus";
import PageIntro from "../components/PageIntro.vue";
import { toUserMessage } from "../lib/user-error";
type Task=Awaited<ReturnType<typeof window.autocut.listTasks>>[number];
type Queue=Awaited<ReturnType<typeof window.autocut.getQueueState>>;
const tasks=ref<Task[]>([]),queue=ref<Queue>({status:"idle",activeTaskId:null,pendingCount:0});
const loading=ref(false),previewTask=ref<Task|null>(null);let timer:ReturnType<typeof setInterval>|undefined;
const statusMeta:Record<Task["status"],{label:string;type:"info"|"primary"|"warning"|"success"|"danger"}>={
  draft:{label:"草稿",type:"info"},pending:{label:"待合成",type:"info"},queued:{label:"旧版排队",type:"info"},
  preparing_copy:{label:"准备文案",type:"primary"},generating_voice:{label:"生成配音",type:"primary"},
  selecting_assets:{label:"选择素材",type:"primary"},composing:{label:"编排镜头",type:"warning"},
  waiting_encoding:{label:"等待编码器",type:"info"},encoding:{label:"编码成片",type:"warning"},
  completed:{label:"已完成",type:"success"},failed:{label:"失败",type:"danger"},canceled:{label:"已取消",type:"info"}
};
const running=computed(()=>queue.value.status==="running"||queue.value.status==="pause_requested");
async function load(){loading.value=true;try{[tasks.value,queue.value]=await Promise.all([window.autocut.listTasks(),window.autocut.getQueueState()])}finally{loading.value=false}}
async function action(run:()=>Promise<unknown>,success?:string){try{await run();if(success)ElMessage.success(success);await load()}catch(e){ElMessage.error(toUserMessage(e,"操作失败"))}}
function start(task:Task){return action(()=>window.autocut.startTask(task.id),"任务已开始合成")}
function startAll(){return action(()=>window.autocut.startAllPendingTasks(),"串行合成队列已启动")}
function pause(){return action(()=>window.autocut.requestQueuePause(),"当前任务完成后将暂停队列")}
function resume(){return action(()=>window.autocut.resumeQueue(),"队列已继续")}
function cancel(task:Task){return action(()=>window.autocut.cancelTask(task.id),"任务已取消")}
function retry(task:Task){return action(()=>window.autocut.retryTask(task.id),"任务已恢复为待合成")}
async function remove(task:Task){await ElMessageBox.confirm("只删除任务记录，不删除已生成的成片文件。","删除任务");await action(()=>window.autocut.deleteTask(task.id))}
function open(task:Task){return action(()=>window.autocut.openTaskOutput(task.id))}
function name(task:Task,key:"persona"|"template"){const value=task.snapshot[key];return value&&typeof value==="object"&&"name" in value?String(value.name):key==="template"?String(task.snapshot.mainTitle??"创作文案"):"账号档案"}
function elapsed(task:Task){if(!task.startedAt)return"—";const end=task.completedAt?Date.parse(task.completedAt):Date.now();const sec=Math.max(0,Math.floor((end-Date.parse(task.startedAt))/1000));return sec<60?`${sec}秒`:`${Math.floor(sec/60)}分${sec%60}秒`}
function active(task:Task){return!["pending","completed","failed","canceled"].includes(task.status)}
function meta(task:Task){return statusMeta[task.status]}
onMounted(async()=>{await load();timer=setInterval(()=>void load(),5000)});onBeforeUnmount(()=>timer&&clearInterval(timer));
</script>
<template><div class="page task-page">
  <PageIntro title="任务中心" description="任务创建后先进入待合成列表，由你手动启动单条或严格串行合成全部任务。" />
  <section class="surface queue-bar"><div><strong>串行合成队列</strong><span>{{queue.status==='running'?'正在合成':queue.status==='pause_requested'?'等待当前任务结束后暂停':queue.status==='paused'?'已暂停':'空闲'}} · {{queue.pendingCount}} 条待合成</span></div><el-button type="primary" :disabled="running||queue.pendingCount===0" @click="startAll">一键合成所有任务</el-button><el-button :disabled="queue.status!=='running'" @click="pause">暂停合成任务</el-button><el-button :disabled="queue.status!=='paused'" @click="resume">继续合成任务</el-button></section>
  <section class="surface task-panel"><el-table v-loading="loading" :data="tasks" height="100%">
    <el-table-column label="脚本 / 档案" min-width="220"><template #default="{row}"><strong>{{name(row,'template')}}</strong><div class="muted">{{name(row,'persona')}}</div></template></el-table-column>
    <el-table-column label="阶段" width="125"><template #default="{row}"><el-tag :type="meta(row).type">{{meta(row).label}}</el-tag></template></el-table-column>
    <el-table-column label="进度" min-width="210"><template #default="{row}"><el-progress :percentage="Math.round(row.progress)" :status="row.status==='failed'?'exception':row.status==='completed'?'success':undefined"/></template></el-table-column>
    <el-table-column label="耗时" width="100"><template #default="{row}">{{elapsed(row)}}</template></el-table-column>
    <el-table-column label="错误与处理建议" min-width="230"><template #default="{row}"><span class="error-text">{{row.errorMessage||'—'}}</span></template></el-table-column>
    <el-table-column label="操作" min-width="285" fixed="right"><template #default="{row}"><el-button v-if="row.status==='pending'" link type="primary" :disabled="running" @click="start(row)">开始合成</el-button><el-button v-if="active(row)" link type="danger" @click="cancel(row)">取消</el-button><el-button v-if="row.status==='failed'||row.status==='canceled'" link type="primary" @click="retry(row)">失败重试</el-button><el-button v-if="row.status==='completed'" link type="primary" @click="open(row)">打开成片</el-button><el-button v-if="row.status==='completed'" link @click="previewTask=row">预览</el-button><el-button v-if="['completed','failed','canceled'].includes(row.status)" link type="danger" @click="remove(row)">删除记录</el-button></template></el-table-column>
    <template #empty><el-empty description="还没有待合成任务，请先在镜头剪辑页面创建"/></template>
  </el-table></section>
  <el-dialog :model-value="Boolean(previewTask)" title="成片预览" width="430px" @close="previewTask=null"><video v-if="previewTask?.outputPath" class="video" controls :src="`autocut-file://${previewTask.outputPath}`"/></el-dialog>
</div></template>
<style scoped>.task-page{display:grid;gap:18px}.queue-bar{display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:18px 20px}.queue-bar>div{display:grid;margin-right:auto}.queue-bar span,.muted{color:var(--text-muted);font-size:12px;margin-top:4px}.task-panel{height:calc(100vh - 285px);min-height:420px;padding:12px}.error-text{color:#d33;white-space:normal}.video{width:100%;max-height:70vh;background:#111;border-radius:14px}@media(max-width:800px){.queue-bar{align-items:stretch;flex-direction:column}.queue-bar>div{margin-right:0}.task-panel{height:600px}}</style>
