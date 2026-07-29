<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { Collection, Files, Upload, VideoPlay } from "@element-plus/icons-vue";
const router = useRouter();
const categories = ref<Awaited<ReturnType<typeof window.autocut.listAssetCategories>>>([]);
const templates = ref<Awaited<ReturnType<typeof window.autocut.listTemplates>>>([]);
const tasks = ref<Awaited<ReturnType<typeof window.autocut.listTasks>>>([]);
const jobs = ref<Awaited<ReturnType<typeof window.autocut.listPublishJobs>>>([]);
const metrics = computed(() => [
  { label:"可用素材", value:categories.value.reduce((sum,c)=>sum+c.assetCount-c.invalidCount,0), unit:"条", icon:Files, tone:"blue" },
  { label:"镜头模板", value:templates.value.length, unit:"套", icon:Collection, tone:"violet" },
  { label:"生成任务", value:tasks.value.length, unit:"个", icon:VideoPlay, tone:"cyan" },
  { label:"待发布", value:jobs.value.filter(j=>["pending","scheduled","needs_user"].includes(j.status)).length, unit:"条", icon:Upload, tone:"orange" }
]);
const health = computed(() => categories.value.length
  ? Math.round(categories.value.filter(c=>c.assetCount-c.invalidCount>=10).length/categories.value.length*100)
  : 0);
const recentTasks = computed(() => tasks.value.slice(0,5));
const statusName: Record<string,string> = {
  queued:"排队中",preparing_copy:"生成文案",generating_voice:"生成配音",
  selecting_assets:"选择素材",composing:"编排镜头",encoding:"编码成片",
  completed:"已完成",failed:"失败",canceled:"已取消",draft:"草稿"
};
onMounted(async()=>{
  [categories.value,templates.value,tasks.value,jobs.value]=await Promise.all([
    window.autocut.listAssetCategories(),window.autocut.listTemplates(),
    window.autocut.listTasks(),window.autocut.listPublishJobs()
  ]);
});
</script>
<template>
  <div class="page">
    <section class="hero surface">
      <div><span class="eyebrow">本地优先内容生产引擎</span><h2>把素材库变成持续生产力</h2><p>分类素材、结构化分镜、智能配音与自动发布，一条生产线完成。</p>
        <div class="hero-actions"><el-button type="primary" size="large" round @click="router.push('/tasks')">创建生成任务</el-button><el-button size="large" round @click="router.push('/assets')">管理素材</el-button></div>
      </div><div class="hero-visual"><div class="orbit one"/><div class="orbit two"/><div class="play">▶</div></div>
    </section>
    <section class="metrics"><article v-for="m in metrics" :key="m.label" class="metric surface"><div :class="['metric-icon',m.tone]"><el-icon><component :is="m.icon"/></el-icon></div><div><span>{{m.label}}</span><strong>{{m.value}} <small>{{m.unit}}</small></strong></div></article></section>
    <section class="dashboard-grid">
      <article class="surface panel"><div class="panel-head"><div><h3>最近任务</h3><p>真实生成与编码状态</p></div><el-button link type="primary" @click="router.push('/tasks')">查看全部</el-button></div>
        <el-empty v-if="!recentTasks.length" description="还没有生成任务" :image-size="92"/>
        <div v-else class="recent"><div v-for="task in recentTasks" :key="task.id" class="recent-row"><div><strong>{{ String((task.snapshot.template as any)?.name || task.id) }}</strong><span>{{new Date(task.updatedAt).toLocaleString()}}</span></div><el-tag :type="task.status==='completed'?'success':task.status==='failed'?'danger':'info'">{{statusName[task.status]}}</el-tag><el-progress :percentage="Math.round(task.progress)" :show-text="false"/></div></div>
      </article>
      <article class="surface panel"><div class="panel-head"><div><h3>素材健康度</h3><p>每个分类至少准备 10 条可用素材</p></div></div><div class="health"><el-progress type="dashboard" :percentage="health" :width="132"/><p>{{categories.length ? `${categories.filter(c=>c.assetCount-c.invalidCount>=10).length}/${categories.length} 个分类准备充足` : "请先导入分类素材"}}</p></div></article>
    </section>
  </div>
</template>
<style scoped>
.hero{min-height:244px;padding:34px 42px;display:flex;align-items:center;justify-content:space-between;overflow:hidden;background:radial-gradient(circle at 80% 20%,rgba(91,141,239,.18),transparent 34%),linear-gradient(135deg,#fff,#f5f8ff)}.eyebrow{color:#5b8def;font-size:11px;font-weight:800;letter-spacing:.16em}.hero h2{margin:12px 0 8px;font-size:34px}.hero p{color:#718097}.hero-actions{margin-top:26px}.hero-visual{position:relative;width:220px;height:180px}.orbit{position:absolute;border:1px solid rgba(91,141,239,.24);border-radius:50%}.one{inset:10px 24px}.two{inset:34px 0;transform:rotate(35deg)}.play{position:absolute;inset:55px 74px;display:grid;place-items:center;border-radius:28px;color:#fff;background:linear-gradient(135deg,#5b8def,#7a6ff0);box-shadow:0 18px 36px rgba(91,141,239,.32)}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}.metric{padding:20px;display:flex;gap:14px;align-items:center}.metric-icon{width:46px;height:46px;display:grid;place-items:center;border-radius:14px;font-size:21px}.blue{color:#4f7ee8;background:#eaf1ff}.violet{color:#7a6ff0;background:#f0edff}.cyan{color:#2ba8b9;background:#e5f8fb}.orange{color:#e78c38;background:#fff2e6}.metric span,.metric strong{display:block}.metric span{color:#8490a3;font-size:13px}.metric strong{margin-top:4px;font-size:25px}.metric small{font-size:12px;color:#9aa5b5}.dashboard-grid{display:grid;grid-template-columns:1.6fr 1fr;gap:18px}.panel{min-height:300px;padding:24px}.panel-head{display:flex;justify-content:space-between}.panel h3,.panel p{margin:0}.panel p{margin-top:5px;color:#8a97aa;font-size:13px}.health{min-height:215px;display:grid;place-items:center;align-content:center;gap:12px}.recent{margin-top:20px}.recent-row{display:grid;grid-template-columns:1fr 90px 130px;gap:14px;align-items:center;padding:12px 0;border-bottom:1px solid #edf0f5}.recent-row span{display:block;color:#929daf;font-size:12px;margin-top:4px}@media(max-width:1080px){.metrics{grid-template-columns:repeat(2,1fr)}.dashboard-grid{grid-template-columns:1fr}}
</style>
