<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import PageIntro from "../components/PageIntro.vue";
type Job = Awaited<ReturnType<typeof window.autocut.listPublishJobs>>[number];
type Account = Awaited<ReturnType<typeof window.autocut.listPublishAccounts>>[number];
type Task = Awaited<ReturnType<typeof window.autocut.listTasks>>[number];
const jobs = ref<Job[]>([]); const accounts = ref<Account[]>([]); const tasks = ref<Task[]>([]);
const dialogOpen = ref(false);
const form = reactive({ taskId: "", accountId: "", title: "", topics: "", scheduledAt: null as Date | null });
const statusName: Record<Job["status"], string> = {
  pending:"待发布",scheduled:"已排期",publishing:"发布中",published:"已发布",
  failed:"失败",needs_user:"需要接管",canceled:"已取消"
};
async function load() {
  [jobs.value, accounts.value, tasks.value] = await Promise.all([
    window.autocut.listPublishJobs(), window.autocut.listPublishAccounts(), window.autocut.listTasks()
  ]);
}
function openCreate() {
  form.taskId = tasks.value.find(t => t.status === "completed")?.id ?? "";
  form.accountId = accounts.value[0]?.id ?? ""; form.title = ""; form.topics = ""; form.scheduledAt = null;
  dialogOpen.value = true;
}
async function create() {
  await window.autocut.createPublishJob({
    taskId: form.taskId, accountId: form.accountId, title: form.title,
    topics: form.topics.split(/[,，\s]+/).map(v => v.trim()).filter(Boolean),
    scheduledAt: form.scheduledAt ? form.scheduledAt.toISOString() : null
  });
  dialogOpen.value = false; await load(); ElMessage.success("发布任务已创建");
}
const accountName = (id:string) => accounts.value.find(a => a.id === id)?.name ?? "已删除账号";
onMounted(load);
</script>
<template>
  <div class="page">
    <PageIntro title="发布排期" description="将已完成成片分配到平台账号和发布时间" action="新建排期" @action="openCreate" />
    <section class="surface schedule-panel">
      <el-table :data="jobs" height="100%">
        <el-table-column prop="title" label="发布内容" min-width="200" />
        <el-table-column label="账号" min-width="150"><template #default="{row}">{{ accountName(row.accountId) }}</template></el-table-column>
        <el-table-column label="状态" width="110"><template #default="{row}"><el-tag>{{ statusName[row.status as Job['status']] }}</el-tag></template></el-table-column>
        <el-table-column label="发布时间" min-width="180"><template #default="{row}">{{ row.scheduledAt ? new Date(row.scheduledAt).toLocaleString() : "立即发布" }}</template></el-table-column>
        <el-table-column prop="attemptCount" label="尝试" width="80" />
        <el-table-column prop="errorMessage" label="错误" min-width="180" />
        <template #empty><el-empty description="暂无待发布内容" /></template>
      </el-table>
    </section>
    <el-dialog v-model="dialogOpen" title="新建发布排期" width="520px">
      <el-form label-position="top">
        <el-form-item label="已完成成片"><el-select v-model="form.taskId"><el-option v-for="task in tasks.filter(t=>t.status==='completed')" :key="task.id" :label="task.outputPath || task.id" :value="task.id" /></el-select></el-form-item>
        <el-form-item label="发布账号"><el-select v-model="form.accountId"><el-option v-for="account in accounts" :key="account.id" :label="account.name" :value="account.id" /></el-select></el-form-item>
        <el-form-item label="标题"><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="话题"><el-input v-model="form.topics" placeholder="工厂, 定制, 实拍" /></el-form-item>
        <el-form-item label="发布时间"><el-date-picker v-model="form.scheduledAt" type="datetime" placeholder="留空为立即发布" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogOpen=false">取消</el-button><el-button type="primary" :disabled="!form.taskId || !form.accountId || !form.title.trim()" @click="create">创建</el-button></template>
    </el-dialog>
  </div>
</template>
<style scoped>.schedule-panel{height:calc(100vh - 210px);min-height:420px;padding:14px 18px}.el-select{width:100%}</style>
