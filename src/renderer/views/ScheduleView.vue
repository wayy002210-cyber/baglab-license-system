<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import PageIntro from "../components/PageIntro.vue";
import { toUserMessage } from "../lib/user-error";
import { createPublishAssetPatch, createPublishJobsInput } from "../lib/publish-payload";

type Asset = Awaited<ReturnType<typeof window.autocut.listPublishAssets>>[number];
type Account = Awaited<ReturnType<typeof window.autocut.listPublishAccounts>>[number];
type TopicTemplate = Awaited<ReturnType<typeof window.autocut.listPublishTopicTemplates>>[number];
type PublishJob = Awaited<ReturnType<typeof window.autocut.listPublishJobs>>[number];
const assets = ref<Asset[]>([]);
const accounts = ref<Account[]>([]);
const templates = ref<TopicTemplate[]>([]);
const jobs = ref<PublishJob[]>([]);
const activeTab = ref("unscheduled");
const preview = ref<Asset | null>(null);
const busy = ref("");
const templateDialog = ref(false);
const eventDialog = ref(false);
const eventJob = ref<PublishJob | null>(null);
const agentEvents = ref<Awaited<ReturnType<typeof window.autocut.listPublishJobEvents>>>([]);
const templateName = ref("");
const templateTopics = ref("");
const selectedAccounts = ref<Record<string, string[]>>({});
const scheduleTimes = ref<Record<string, Date | null>>({});
const mode = ref("auto");
const statusLabel: Record<Asset["status"], string> = { unscheduled: "待排期", scheduled: "排期中", publishing: "发布中", published: "已发布", failed: "发布失败", discarded: "已删除" };
const visible = computed(() => assets.value.filter((asset) => activeTab.value === "unscheduled" ? ["unscheduled", "failed"].includes(asset.status) : activeTab.value === "scheduled" ? ["scheduled", "publishing"].includes(asset.status) : asset.status === "published"));
const missing = computed(() => assets.value.filter((asset) => !asset.publishTitle.trim() || !asset.topics.length).length);

function accountLabel(id: string) { const account = accounts.value.find((value) => value.id === id); const platform = account?.platform === "douyin" ? "抖音" : account?.platform === "wechat_channels" ? "视频号" : "快手"; return account ? `${account.name} / ${platform}` : id; }
async function load() {
  [assets.value, accounts.value, templates.value, jobs.value] = await Promise.all([window.autocut.listPublishAssets(), window.autocut.listPublishAccounts(), window.autocut.listPublishTopicTemplates(), window.autocut.listPublishJobs()]);
  for (const asset of assets.value) { selectedAccounts.value[asset.id] ??= []; scheduleTimes.value[asset.id] ??= new Date(Date.now() + 20 * 60 * 1000); }
}
function jobsFor(asset: Asset) { return jobs.value.filter((job) => job.publishAssetId === asset.id); }
function activeJob(asset: Asset) { return jobsFor(asset).find((job) => ["publishing", "needs_user"].includes(job.status)) ?? null; }
const workflowLabel: Record<string, string> = { opening_profile:"正在打开浏览器", checking_login:"检查登录状态", waiting_for_human:"等待人工接管", uploading_video:"正在上传视频", waiting_upload:"等待上传完成", filling_metadata:"正在填写标题与话题", uploading_cover:"正在上传封面", configuring_publish_time:"正在设置发布时间", submitting:"正在提交发布", verifying:"正在验证发布", published:"发布成功", failed:"发布失败", canceled:"已取消" };
async function save(asset: Asset, showError = true): Promise<boolean> {
  try {
    Object.assign(asset, await window.autocut.updatePublishAsset(asset.id, createPublishAssetPatch(asset)));
    return true;
  } catch (error) {
    if (showError) ElMessage.error(toUserMessage(error, "发布资料保存失败"));
    return false;
  }
}
async function chooseTemplate(asset: Asset, id: string) { asset.topicTemplateId = id || null; const template = templates.value.find((value) => value.id === id); if (template) asset.topics = [...template.topics]; await save(asset); }
async function ensureTopics(asset: Asset) {
  if (asset.topics.length || !templates.value.length) return;
  const index = [...asset.id].reduce((sum, value) => sum + value.charCodeAt(0), 0) % templates.value.length;
  const template = templates.value[index];
  asset.topicTemplateId = null;
  asset.topics = [...template.topics];
  await save(asset);
}
async function cover(asset: Asset) { const path = await window.autocut.selectPublishCover(); if (path) { asset.coverPath = path; await save(asset); } }
async function publish(asset: Asset, scheduled: boolean) {
  if (!asset.publishTitle.trim()) return ElMessage.warning("请先填写发布标题");
  await ensureTopics(asset);
  if (!asset.topics.length) return ElMessage.warning("请先创建或填写发布话题模板");
  const accountIds = selectedAccounts.value[asset.id] ?? [];
  if (!accountIds.length) return ElMessage.warning("请至少选择一个已登录发布账号");
  busy.value = asset.id;
  try {
    if (!await save(asset, false)) throw new Error("发布资料保存失败，请检查标题、话题和封面后重试");
    await window.autocut.createPublishJobsForAsset(createPublishJobsInput(asset.id, accountIds, scheduled ? (scheduleTimes.value[asset.id] ?? new Date(Date.now() + 20 * 60 * 1000)).toISOString() : null));
    await load();
    ElMessage.success(scheduled ? "已创建平台定时发布任务" : "已进入立即发布队列");
  } catch (error) { ElMessage.error(toUserMessage(error, "发布任务创建失败")); }
  finally { busy.value = ""; }
}
async function resume(job: PublishJob) {
  busy.value = job.publishAssetId ?? job.id;
  try { await window.autocut.resumePublishJob(job.id); ElMessage.success("已继续发布，请在浏览器中等待平台处理"); await load(); }
  catch (error) { ElMessage.error(toUserMessage(error, "继续发布失败")); }
  finally { busy.value = ""; }
}
async function showEvents(job: PublishJob) {
  eventJob.value = job;
  eventDialog.value = true;
  try { agentEvents.value = await window.autocut.listPublishJobEvents(job.id); }
  catch (error) { ElMessage.error(toUserMessage(error, "读取发布日志失败")); }
}
async function cancelJob(job: PublishJob) {
  try { await window.autocut.cancelPublishJob(job.id); ElMessage.success("发布任务已取消"); await load(); }
  catch (error) { ElMessage.error(toUserMessage(error, "发布任务取消失败")); }
}
async function discard(asset: Asset) { await ElMessageBox.confirm(`删除待发布视频“${asset.shortTitle}”？成片文件不会删除。`, "删除发布记录"); await window.autocut.discardPublishAsset(asset.id); if (preview.value?.id === asset.id) preview.value = null; await load(); }
async function saveTemplate() { const topics = templateTopics.value.split(/[,，\s#]+/).map((value) => value.trim()).filter(Boolean); if (!templateName.value.trim() || !topics.length) return ElMessage.warning("请填写模板名称和话题"); await window.autocut.savePublishTopicTemplate({ name: templateName.value, topics }); templateDialog.value = false; templateName.value = ""; templateTopics.value = ""; await load(); ElMessage.success("话题模板已保存"); }
let refreshTimer: ReturnType<typeof setInterval> | undefined;
onMounted(async () => { await load(); refreshTimer = setInterval(() => void load(), 5_000); });
onUnmounted(() => { if (refreshTimer) clearInterval(refreshTimer); });
</script>

<template>
  <div class="page"><PageIntro title="发布排期" description="集中配置成片的标题、话题、封面和发布账号，支持立即发布与平台定时发布。" />
    <section class="surface publish-shell"><div class="main">
      <div class="notice">批量生成成功的成片会自动出现在本页。精细化发布保留逐条配置逻辑；批量发布可按平台和账号轮询，为多条视频完成分配与排期。</div>
      <div class="stats"><div><strong>{{ assets.filter((a) => a.status === 'unscheduled').length }}</strong><span>待排期视频</span></div><div><strong>{{ assets.filter((a) => ['scheduled','publishing'].includes(a.status)).length }}</strong><span>排期中</span></div><div><strong>{{ missing }}</strong><span>待补标题 / 话题</span></div><div><strong>{{ assets.filter((a) => a.status === 'published').length }}</strong><span>已有发布结果</span></div></div>
      <div class="switches"><el-segmented v-model="activeTab" :options="[{label:'未排期',value:'unscheduled'},{label:'排期中',value:'scheduled'},{label:'已有结果',value:'published'}]" /><span>立即发布方式</span><el-segmented v-model="mode" :options="[{label:'自动发布',value:'auto'},{label:'手动确认',value:'manual'}]" /><el-button @click="templateDialog = true">管理话题模板</el-button></div>
      <h3>排期列表</h3><div class="asset-list">
        <article v-for="asset in visible" :key="asset.id" class="asset-card"><div class="timeline" /><header><el-tag>{{ statusLabel[asset.status] }}</el-tag><strong>{{ new Date(asset.createdAt).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) }} · {{ asset.shortTitle }}</strong><el-tag type="success" effect="plain">{{ asset.publishTitle && asset.topics.length ? '标题 / 话题已填' : '待补资料' }}</el-tag><span>{{ (selectedAccounts[asset.id] ?? []).length ? `已选 ${(selectedAccounts[asset.id] ?? []).length} 个账号` : '未选择发布账号' }}</span><el-button class="preview-btn" @click="preview = asset">预览视频</el-button></header>
          <div class="form-grid"><label>发布标题<el-input v-model="asset.publishTitle" type="textarea" :rows="2" maxlength="30" show-word-limit @blur="save(asset)" /></label><label>发布话题<div class="topic-row"><el-select :model-value="asset.topicTemplateId ?? ''" placeholder="选择话题模板" @change="chooseTemplate(asset, String($event))"><el-option label="随机话题模板" value="" /><el-option v-for="template in templates" :key="template.id" :label="template.name" :value="template.id" /></el-select><el-input :model-value="asset.topics.map((value) => '#'+value.replace(/^#/,'')).join(' ')" placeholder="#工厂 #定制" @change="asset.topics=String($event).split(/[,，\s#]+/).filter(Boolean); save(asset)" /></div></label><label>发布账号<el-select v-model="selectedAccounts[asset.id]" multiple collapse-tags placeholder="选择一个或多个已登录账号"><el-option v-for="account in accounts.filter((value) => value.linkStatus === 'connected')" :key="account.id" :label="accountLabel(account.id)" :value="account.id" /></el-select></label><label>本地封面<el-button class="cover" @click="cover(asset)">{{ asset.coverPath ? '已选择：'+asset.coverPath.split(/[\\/]/).pop() : '点击选择本地封面' }}</el-button></label></div>
          <footer><template v-if="activeJob(asset)"><span class="agent-state">{{ workflowLabel[activeJob(asset)?.workflowState ?? ''] ?? activeJob(asset)?.workflowState }}</span><el-button plain @click="showEvents(activeJob(asset)!)">查看发布日志</el-button><el-button v-if="activeJob(asset)?.status === 'needs_user'" type="primary" :loading="busy === asset.id" @click="resume(activeJob(asset)!)">继续发布</el-button><el-button v-if="['publishing','needs_user'].includes(activeJob(asset)?.status ?? '')" plain @click="cancelJob(activeJob(asset)!)">取消发布</el-button></template><template v-else-if="(selectedAccounts[asset.id] ?? []).length"><el-date-picker v-model="scheduleTimes[asset.id]" type="datetime" format="YYYY年MM月DD日 HH:mm" placeholder="默认20分钟后" /><el-button :loading="busy === asset.id" @click="publish(asset,true)">设定排期</el-button><el-button type="primary" :loading="busy === asset.id" @click="publish(asset,false)">立即发布</el-button></template><span v-else>请选择发布账号后操作</span><el-button class="delete" type="danger" plain @click="discard(asset)">删除</el-button></footer>
        </article><el-empty v-if="!visible.length" description="当前分类暂无视频" />
      </div></div>
      <aside><h3>通用预览</h3><video v-if="preview" :key="preview.id" controls preload="metadata" :src="`autocut-media://task/${preview.taskId}`" /><div v-else class="empty-preview">点击卡片上的“预览视频”<br>在此播放成片</div><span v-if="preview">{{ preview.shortTitle }}</span><el-button v-if="preview" text @click="preview = null">清空预览</el-button></aside>
    </section>
    <el-dialog v-model="templateDialog" title="新增话题模板" width="520px"><el-form label-position="top"><el-form-item label="模板名称"><el-input v-model="templateName" /></el-form-item><el-form-item label="话题（空格或逗号分隔）"><el-input v-model="templateTopics" type="textarea" placeholder="工厂 定制 实拍 创业干货" /></el-form-item></el-form><template #footer><el-button @click="templateDialog = false">取消</el-button><el-button type="primary" @click="saveTemplate">保存模板</el-button></template></el-dialog>
    <el-dialog v-model="eventDialog" :title="`发布日志：${eventJob?.publishAssetId ? eventJob?.id.slice(0, 8) : ''}`" width="620px">
      <el-timeline v-if="agentEvents.length"><el-timeline-item v-for="event in agentEvents" :key="event.id" :type="event.level === 'error' ? 'danger' : event.level === 'warning' ? 'warning' : 'primary'" :timestamp="new Date(event.createdAt).toLocaleString('zh-CN')">{{ event.message }}</el-timeline-item></el-timeline><el-empty v-else description="暂未记录发布步骤" />
    </el-dialog>
  </div>
</template>

<style scoped>
.agent-state{padding:8px 12px;border:1px solid #f0d84f;border-radius:10px;background:#fff8cf;color:#765d00!important}
.publish-shell{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:22px;padding:26px}.notice{padding:16px 18px;border-radius:14px;background:#fff9cf;color:#5b521b;line-height:1.7;border:1px solid #f5e86a}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:18px 0}.stats div{display:grid;gap:5px;padding:18px;border:1px solid #e9e9e2;border-radius:16px}.stats strong{font-size:26px;color:#171714}.stats div:first-child strong,.stats div:nth-child(3) strong{color:#b69000}.stats span,.asset-card header>span{font-size:12px;color:var(--text-muted)}.switches{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.switches>span{font-weight:700;margin-left:10px}.switches :deep(.el-segmented){--el-segmented-item-selected-bg-color:var(--brand-yellow);--el-segmented-item-selected-color:#111;--el-segmented-bg-color:#f1f1ed;min-height:44px;padding:4px;border-radius:14px}.switches :deep(.el-segmented__item){padding:0 18px;border-radius:10px;font-weight:700}.switches>.el-button{height:44px;padding:0 20px;border-radius:13px}.asset-list{display:grid;gap:16px}.asset-card{position:relative;padding:18px 18px 16px 32px;border:1px solid #e7e7df;border-radius:18px;background:#fff}.timeline{position:absolute;left:18px;top:23px;bottom:20px;width:3px;background:var(--brand-yellow);border-radius:3px}.asset-card header{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.preview-btn{margin-left:auto}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px;margin:16px 0}.form-grid label{display:grid;gap:7px;font-size:13px;font-weight:700}.topic-row{display:grid;grid-template-columns:180px 1fr;gap:8px}.cover{width:100%;overflow:hidden}.asset-card footer{display:flex;align-items:center;gap:9px}.asset-card footer>span{color:var(--text-muted)}.asset-card footer .el-button{min-height:40px;padding:0 18px;border-radius:12px}.delete{margin-left:auto;border-radius:12px}.publish-shell aside{position:sticky;top:20px;align-self:start;display:grid;gap:12px;padding:16px;border:1px solid #e6e6df;border-radius:18px}.publish-shell aside h3{margin:0}.publish-shell aside video,.empty-preview{width:100%;aspect-ratio:9/16;max-height:66vh;border-radius:15px;background:#171714;color:#aaa}.empty-preview{display:grid;place-items:center;text-align:center;line-height:1.8}.publish-shell aside span{font-size:12px;color:var(--text-muted)}@media(max-width:1150px){.publish-shell{grid-template-columns:1fr}.publish-shell aside{position:static}.stats{grid-template-columns:1fr 1fr}.form-grid{grid-template-columns:1fr}}
</style>
