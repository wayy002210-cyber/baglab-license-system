<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import PageIntro from "../components/PageIntro.vue";
import { toUserMessage } from "../lib/user-error";
import { toPublishAccountInput } from "../publishing/publish-account-form";

type Account = Awaited<ReturnType<typeof window.autocut.listPublishAccounts>>[number];
const accounts = ref<Account[]>([]);
const dialogOpen = ref(false);
const connecting = ref(false);
const connectionMessage = ref("");
const createdAccount = ref<Account | null>(null);
const form = reactive<{ name: string; platform: "douyin" | "wechat_channels" }>({
  name: "", platform: "douyin"
});
const platformName = { douyin: "抖音", wechat_channels: "视频号" };
const statusName = {
  unknown: "未检测", connected: "已登录", expired: "登录失效", needs_user: "需要接管"
};
async function load() { accounts.value = await window.autocut.listPublishAccounts(); }
function openCreate() { form.name = ""; form.platform = "douyin"; createdAccount.value = null; connectionMessage.value = ""; dialogOpen.value = true; }
async function create() {
  connecting.value = true;
  connectionMessage.value = "正在创建独立账号卡片和浏览器目录……";
  try {
    createdAccount.value = await window.autocut.createPublishAccount(
      toPublishAccountInput(form)
    );
    await load();
    ElMessage.success("账号卡片已创建，请点击卡片打开登录窗口");
    dialogOpen.value = false;
  } catch (error) {
    connectionMessage.value = toUserMessage(error, "创建账号卡片失败");
    ElMessage.error(connectionMessage.value);
  } finally {
    connecting.value = false;
  }
}
async function connect(account: Account) {
  connecting.value = true;
  connectionMessage.value = "正在打开独立登录窗口，请完成扫码或验证……";
  try {
    createdAccount.value = await window.autocut.connectPublishAccount(account.id);
    await load();
    connectionMessage.value = createdAccount.value.linkStatus === "connected"
      ? "账号连接成功，可以用于发布。"
      : "尚未检测到登录，请继续在浏览器中操作。";
    if (createdAccount.value.linkStatus === "connected") ElMessage.success("账号登录状态正常");
    else ElMessage.warning(connectionMessage.value);
  } catch (error) {
    connectionMessage.value = toUserMessage(error, "账号登录连接失败");
    ElMessage.error(connectionMessage.value);
  } finally {
    connecting.value = false;
  }
}
async function remove(account: Account) {
  await ElMessageBox.confirm(`删除账号“${account.name}”？`, "确认删除");
  await window.autocut.deletePublishAccount(account.id); await load();
}
async function check(account: Account) {
  ElMessage.info("正在检测账号登录状态…");
  try {
    const checked = await window.autocut.checkPublishAccount(account.id);
    await load();
    if (checked.linkStatus === "connected") ElMessage.success("账号登录状态正常");
    else if (checked.linkStatus === "expired") ElMessage.warning("账号登录已失效，请重新登录");
    else ElMessage.warning("尚未检测到有效登录，请打开登录窗口完成登录");
  }
  catch (error) { ElMessage.error(toUserMessage(error, "检测失败")); }
}
onMounted(load);
</script>

<template>
  <div class="page">
    <PageIntro title="发布账号" description="每个账号使用独立浏览器目录保存登录状态" action="添加账号" @action="openCreate" />
    <section class="surface account-grid">
      <el-empty v-if="!accounts.length" description="添加账号后手动完成扫码登录" />
      <article v-for="account in accounts" :key="account.id" class="account-card">
        <div class="platform">{{ platformName[account.platform] }}</div>
        <h3>{{ account.name }}</h3>
        <el-tag :type="account.linkStatus === 'connected' ? 'success' : 'info'">
          {{ statusName[account.linkStatus] }}
        </el-tag>
        <p>独立登录目录已创建</p>
        <div class="actions">
          <el-button type="primary" @click="connect(account)">打开登录窗口</el-button>
          <el-button @click="check(account)">检测状态</el-button>
          <el-button class="delete-account" plain type="danger" @click="remove(account)">删除</el-button>
        </div>
      </article>
    </section>
    <el-dialog v-model="dialogOpen" title="添加发布账号" width="460px">
      <el-form v-if="!createdAccount" label-position="top">
        <el-form-item label="平台">
          <el-radio-group v-model="form.platform">
            <el-radio-button value="douyin">抖音</el-radio-button>
            <el-radio-button value="wechat_channels">视频号</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="账号备注"><el-input v-model="form.name" placeholder="例如：上海门店抖音" /></el-form-item>
      </el-form>
      <section v-else class="connection-panel">
        <el-progress :percentage="createdAccount.linkStatus === 'connected' ? 100 : 60" :indeterminate="connecting" :status="createdAccount.linkStatus === 'connected' ? 'success' : undefined" />
        <h3>{{ createdAccount.linkStatus === "connected" ? "账号连接成功" : "等待登录" }}</h3>
        <p>{{ connectionMessage }}</p>
        <el-tag>{{ platformName[createdAccount.platform] }} · {{ createdAccount.name }}</el-tag>
      </section>
      <template #footer>
        <el-button @click="dialogOpen = false">{{ createdAccount ? "关闭" : "取消" }}</el-button>
        <el-button v-if="!createdAccount" type="primary" :loading="connecting" :disabled="!form.name.trim()" @click="create">创建账号卡片</el-button>
        <el-button v-else-if="createdAccount.linkStatus !== 'connected'" type="primary" :loading="connecting" @click="connect(createdAccount)">继续登录</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.account-grid{padding:24px;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:18px;min-height:360px}
.account-card{min-width:0;display:flex;flex-direction:column;border:1px solid #e3e9f3;border-radius:16px;padding:20px;background:#fbfcff}
.account-card h3{margin:10px 0}.account-card p{color:#8490a5;font-size:13px}.platform{color:#4d7fe8;font-weight:700}.actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:auto;padding-top:20px}.actions .el-button{margin-left:0}.delete-account{margin-left:auto!important;border-radius:10px}
.connection-panel{display:grid;gap:12px;padding:18px;border-radius:16px;background:#f7f7f3}.connection-panel h3,.connection-panel p{margin:0}.connection-panel p{color:var(--text-muted);line-height:1.7}
</style>
