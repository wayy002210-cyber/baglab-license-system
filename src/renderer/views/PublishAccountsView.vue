<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import PageIntro from "../components/PageIntro.vue";

type Account = Awaited<ReturnType<typeof window.autocut.listPublishAccounts>>[number];
const accounts = ref<Account[]>([]);
const dialogOpen = ref(false);
const form = reactive<{ name: string; platform: "douyin" | "xiaohongshu" }>({
  name: "", platform: "douyin"
});
const platformName = { douyin: "抖音", xiaohongshu: "小红书" };
const statusName = {
  unknown: "未检测", connected: "已登录", expired: "登录失效", needs_user: "需要接管"
};
async function load() { accounts.value = await window.autocut.listPublishAccounts(); }
function openCreate() { form.name = ""; form.platform = "douyin"; dialogOpen.value = true; }
async function create() {
  await window.autocut.createPublishAccount(form);
  dialogOpen.value = false; await load(); ElMessage.success("账号已添加");
}
async function remove(account: Account) {
  await ElMessageBox.confirm(`删除账号“${account.name}”？`, "确认删除");
  await window.autocut.deletePublishAccount(account.id); await load();
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
          <el-button type="primary" disabled>打开登录（适配器接入中）</el-button>
          <el-button link type="danger" @click="remove(account)">删除</el-button>
        </div>
      </article>
    </section>
    <el-dialog v-model="dialogOpen" title="添加发布账号" width="460px">
      <el-form label-position="top">
        <el-form-item label="平台">
          <el-radio-group v-model="form.platform">
            <el-radio-button value="douyin">抖音</el-radio-button>
            <el-radio-button value="xiaohongshu">小红书</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="账号备注"><el-input v-model="form.name" placeholder="例如：上海门店抖音" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogOpen = false">取消</el-button><el-button type="primary" :disabled="!form.name.trim()" @click="create">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.account-grid{padding:24px;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:18px;min-height:360px}
.account-card{border:1px solid #e3e9f3;border-radius:16px;padding:20px;background:#fbfcff}
.account-card h3{margin:10px 0}.account-card p{color:#8490a5;font-size:13px}.platform{color:#4d7fe8;font-weight:700}.actions{display:flex;align-items:center;margin-top:20px}
</style>
