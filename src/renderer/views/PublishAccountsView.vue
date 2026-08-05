<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import PageIntro from "../components/PageIntro.vue";
import { toUserMessage } from "../lib/user-error";
import { toPublishAccountInput } from "../publishing/publish-account-form";

type Account = Awaited<ReturnType<typeof window.autocut.listPublishAccounts>>[number];
type Platform = Account["platform"];
const accounts = ref<Account[]>([]);
const dialogOpen = ref(false);
const busyId = ref("");
const query = ref("");
const statusFilter = ref("all");
const activePlatform = ref<Platform>("douyin");
const form = reactive<{ name: string; positioning: string; platform: Platform }>({ name: "", positioning: "", platform: "douyin" });
const platforms: Array<{ id: Platform; name: string }> = [
  { id: "douyin", name: "抖音" },
  { id: "wechat_channels", name: "视频号" },
  { id: "kuaishou", name: "快手" }
];
const statusName: Record<Account["linkStatus"], string> = {
  unknown: "未检测", checking: "检测中", connected: "已登录", expired: "登录失效", needs_user: "需要接管"
};
const filtered = computed(() => accounts.value.filter((account) =>
  account.platform === activePlatform.value
  && (statusFilter.value === "all" || account.linkStatus === statusFilter.value)
  && (!query.value || `${account.name}${account.positioning}${statusName[account.linkStatus]}`.toLowerCase().includes(query.value.toLowerCase()))
));
const logged = computed(() => accounts.value.filter((account) => account.linkStatus === "connected").length);

async function load() { accounts.value = await window.autocut.listPublishAccounts(); }
function openCreate() { Object.assign(form, { name: "", positioning: "", platform: activePlatform.value }); dialogOpen.value = true; }
async function create() {
  try {
    await window.autocut.createPublishAccount(toPublishAccountInput(form));
    dialogOpen.value = false;
    await load();
    ElMessage.success("账号卡片已创建，请打开登录窗口完成扫码登录");
  } catch (error) { ElMessage.error(toUserMessage(error, "创建账号失败")); }
}
async function run(account: Account, mode: "connect" | "check") {
  busyId.value = account.id;
  ElMessage.info(mode === "connect" ? "已打开独立登录窗口，请完成登录或验证" : "正在检测账号登录状态…");
  try {
    const value = mode === "connect"
      ? await window.autocut.connectPublishAccount(account.id)
      : await window.autocut.checkPublishAccount(account.id);
    await load();
    if (value.linkStatus === "connected") ElMessage.success("账号登录状态正常");
    else if (value.linkStatus === "expired") ElMessage.warning("登录已失效，请重新登录");
    else ElMessage.warning("平台要求验证，请在浏览器窗口完成后重试");
  } catch (error) { ElMessage.error(toUserMessage(error, "账号状态操作失败")); }
  finally { busyId.value = ""; }
}
async function remove(account: Account) {
  await ElMessageBox.confirm(`确定删除账号“${account.name}”吗？`, "删除账号");
  try { await window.autocut.deletePublishAccount(account.id); await load(); ElMessage.success("账号已删除"); }
  catch (error) { ElMessage.error(toUserMessage(error, "账号删除失败；如有排期任务，请先删除对应任务")); }
}
onMounted(load);
</script>

<template>
  <div class="page">
    <PageIntro title="发布账号管理" description="每个账号使用独立浏览器目录保存登录状态，平台之间互不混用。" action="添加账号" @action="openCreate" />
    <section class="surface panel">
      <div class="notice">这里负责账号建档、扫码登录和状态检测。验证码与平台风控必须由用户在独立浏览器窗口中完成。</div>
      <div class="metrics">
        <div><strong>{{ accounts.length }}</strong><span>全部平台账号</span></div>
        <div><strong class="green">{{ logged }}</strong><span>已登录账号</span></div>
        <div><strong class="orange">{{ accounts.length - logged }}</strong><span>待登录或需验证</span></div>
      </div>
      <div class="toolbar">
        <el-segmented v-model="activePlatform" :options="platforms.map((p) => ({ label: p.name, value: p.id }))" />
        <el-input v-model="query" clearable placeholder="搜索账号名称、定位或状态" />
        <el-select v-model="statusFilter"><el-option label="全部状态" value="all" /><el-option v-for="(label, key) in statusName" :key="key" :label="label" :value="key" /></el-select>
        <el-button @click="load">刷新列表</el-button>
      </div>
      <div v-if="filtered.length" class="cards">
        <article v-for="account in filtered" :key="account.id" class="card">
          <header><div><span class="platform">{{ platforms.find((p) => p.id === account.platform)?.name }}</span><h3>{{ account.name }}</h3></div><el-tag :type="account.linkStatus === 'connected' ? 'success' : account.linkStatus === 'expired' ? 'danger' : 'warning'">{{ statusName[account.linkStatus] }}</el-tag></header>
          <dl><div><dt>账号定位</dt><dd>{{ account.positioning || '未填写' }}</dd></div><div><dt>最近检测</dt><dd>{{ account.lastCheckedAt ? new Date(account.lastCheckedAt).toLocaleString('zh-CN') : '尚未检测' }}</dd></div><div><dt>浏览器目录</dt><dd :title="account.userDataDir">{{ account.userDataDir }}</dd></div></dl>
          <footer><el-button type="primary" :loading="busyId === account.id" @click="run(account, 'connect')">打开登录窗口</el-button><el-button :loading="busyId === account.id" @click="run(account, 'check')">检测状态</el-button><el-button class="delete" type="danger" plain @click="remove(account)">删除</el-button></footer>
        </article>
      </div>
      <el-empty v-else description="当前平台暂无账号" />
    </section>
    <el-dialog v-model="dialogOpen" title="添加发布账号" width="520px">
      <el-form label-position="top"><el-form-item label="所属平台"><el-segmented v-model="form.platform" :options="platforms.map((p) => ({ label: p.name, value: p.id }))" /></el-form-item><el-form-item label="账号名称"><el-input v-model="form.name" placeholder="例如：郑州工厂抖音" /></el-form-item><el-form-item label="账号定位"><el-input v-model="form.positioning" placeholder="例如：工厂实拍 / 行业知识分享" /></el-form-item></el-form>
      <template #footer><el-button @click="dialogOpen = false">取消</el-button><el-button type="primary" :disabled="!form.name.trim()" @click="create">创建账号卡片</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.panel{padding:26px;min-height:590px}.notice{padding:15px 18px;border-radius:12px;background:#fff9d7;color:#5a5220}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:18px 0}.metrics div{display:grid;gap:5px;padding:20px;border:1px solid #e9e8e1;border-radius:16px}.metrics strong{font-size:28px}.metrics span{color:var(--text-muted)}.green{color:#2b8a57}.orange{color:#c06c00}.toolbar{display:grid;grid-template-columns:auto minmax(220px,1fr) 160px auto;gap:12px;align-items:center;margin-bottom:20px}.toolbar :deep(.el-segmented),:deep(.el-dialog .el-segmented){--el-segmented-item-selected-bg-color:var(--brand-yellow);--el-segmented-item-selected-color:#111;--el-segmented-bg-color:#f1f1ed;min-height:44px;padding:4px;border-radius:14px}.toolbar :deep(.el-segmented__item),:deep(.el-dialog .el-segmented__item){padding:0 18px;font-weight:700}.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:16px}.card{display:flex;flex-direction:column;padding:20px;border:1px solid #e5e5dd;border-radius:18px;background:#fff}.card header{display:flex;justify-content:space-between;gap:12px}.card h3{margin:5px 0}.platform{display:inline-block;padding:5px 10px;border-radius:9px;background:var(--brand-yellow);color:#111;font-weight:800}.card dl{display:grid;gap:10px}.card dl div{display:grid;grid-template-columns:82px 1fr;gap:8px}.card dt{color:#8b8b83}.card dd{margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.card footer{display:flex;gap:8px;margin-top:auto;padding-top:16px}.card footer .el-button{min-height:40px;margin:0;padding:0 16px;border-radius:12px}.delete{margin-left:auto!important;border-radius:12px}@media(max-width:980px){.toolbar{grid-template-columns:1fr 1fr}.metrics{grid-template-columns:1fr}}
</style>
