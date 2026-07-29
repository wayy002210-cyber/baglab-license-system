<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import PageIntro from "../components/PageIntro.vue";

type Task = Awaited<ReturnType<typeof window.autocut.listTasks>>[number];
type Persona = Awaited<ReturnType<typeof window.autocut.listPersonas>>[number];
type Template = Awaited<ReturnType<typeof window.autocut.listTemplates>>[number];

const tasks = ref<Task[]>([]);
const personas = ref<Persona[]>([]);
const templates = ref<Template[]>([]);
const voices = ref<Array<{ voiceId: string; name: string; kind: string }>>([]);
const loading = ref(false);
const dialogOpen = ref(false);
const creating = ref(false);
const form = reactive({
  personaId: "",
  templateId: "",
  count: 1,
  voiceId: ""
});
let refreshTimer: ReturnType<typeof setInterval> | undefined;

const statusMeta: Record<
  Task["status"],
  { label: string; type: "info" | "primary" | "warning" | "success" | "danger" }
> = {
  draft: { label: "草稿", type: "info" },
  queued: { label: "排队中", type: "info" },
  preparing_copy: { label: "生成文案", type: "primary" },
  generating_voice: { label: "生成配音", type: "primary" },
  selecting_assets: { label: "选择素材", type: "primary" },
  composing: { label: "编排镜头", type: "warning" },
  encoding: { label: "编码成片", type: "warning" },
  completed: { label: "已完成", type: "success" },
  failed: { label: "失败", type: "danger" },
  canceled: { label: "已取消", type: "info" }
};

async function load(): Promise<void> {
  loading.value = true;
  try {
    [tasks.value, personas.value, templates.value] = await Promise.all([
      window.autocut.listTasks(),
      window.autocut.listPersonas(),
      window.autocut.listTemplates()
    ]);
  } finally {
    loading.value = false;
  }
}

async function openCreate(): Promise<void> {
  form.personaId =
    personas.value.find((persona) => persona.isDefault)?.id ??
    personas.value[0]?.id ??
    "";
  form.templateId = templates.value[0]?.id ?? "";
  form.count = 1;
  try {
    voices.value = await window.autocut.listVoices();
    form.voiceId = voices.value[0]?.voiceId ?? "";
  } catch {
    voices.value = [];
    form.voiceId = "";
  }
  dialogOpen.value = true;
}

async function createTasks(): Promise<void> {
  const persona = personas.value.find((item) => item.id === form.personaId);
  const template = templates.value.find((item) => item.id === form.templateId);
  if (!persona || !template) {
    ElMessage.warning("请先创建账号档案和镜头模板");
    return;
  }
  if (!form.voiceId) {
    ElMessage.warning("请先配置 MiniMax Key 并选择配音音色");
    return;
  }
  creating.value = true;
  try {
    const categoryIds = [
      ...new Set(
        template.shots
          .map((shot) => shot.assetCategoryId)
          .filter((id): id is string => Boolean(id))
      )
    ];
    const assets = (
      await Promise.all(categoryIds.map((id) => window.autocut.listAssets(id)))
    ).flat();
    const created = await window.autocut.createTaskBatch({
      personaId: persona.id,
      templateId: template.id,
      count: form.count,
      seed: Date.now(),
      snapshot: {
        persona,
        template,
        assets,
        voice: { voiceId: form.voiceId }
      }
    });
    tasks.value = [...created, ...tasks.value];
    dialogOpen.value = false;
    ElMessage.success(`已创建 ${created.length} 个任务`);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "创建任务失败");
  } finally {
    creating.value = false;
  }
}

async function cancelTask(task: Task): Promise<void> {
  try {
    await window.autocut.cancelTask(task.id);
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "取消失败");
  }
}

async function retryTask(task: Task): Promise<void> {
  try {
    await window.autocut.retryTask(task.id);
    await load();
    ElMessage.success("任务已重新加入队列");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "重试失败");
  }
}
async function deleteTask(task: Task): Promise<void> {
  await ElMessageBox.confirm("只删除任务记录，不删除已生成的视频文件。", "删除任务");
  await window.autocut.deleteTask(task.id);
  await load();
}
async function openOutput(task: Task): Promise<void> {
  await window.autocut.openTaskOutput(task.id);
}

function snapshotName(task: Task, key: "persona" | "template"): string {
  const value = task.snapshot[key];
  return value && typeof value === "object" && "name" in value
    ? String(value.name)
    : "已删除";
}

function isActive(task: Task): boolean {
  return !["completed", "failed", "canceled"].includes(task.status);
}

function taskStatusMeta(task: Task) {
  return statusMeta[task.status];
}

onMounted(async () => {
  await load();
  refreshTimer = setInterval(() => void load(), 2_000);
});
onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer);
});
</script>

<template>
  <div class="page">
    <PageIntro
      title="任务中心"
      description="查看文案、配音、选片、合成与编码进度，失败任务可从原始快照恢复"
      action="创建任务"
      @action="openCreate"
    />

    <section class="surface task-panel">
      <el-table v-loading="loading" :data="tasks" height="100%">
        <el-table-column label="模板 / 档案" min-width="210">
          <template #default="{ row }">
            <strong>{{ snapshotName(row, "template") }}</strong>
            <div class="muted">{{ snapshotName(row, "persona") }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="taskStatusMeta(row).type">
              {{ taskStatusMeta(row).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="进度" min-width="200">
          <template #default="{ row }">
            <el-progress
              :percentage="Math.round(row.progress)"
              :status="row.status === 'failed' ? 'exception' : row.status === 'completed' ? 'success' : undefined"
            />
          </template>
        </el-table-column>
        <el-table-column prop="seed" label="任务种子" width="150" />
        <el-table-column label="错误" min-width="180">
          <template #default="{ row }">
            <span class="error-text">{{ row.errorMessage || "—" }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="isActive(row)"
              link
              type="danger"
              @click="cancelTask(row)"
            >
              取消
            </el-button>
            <el-button
              v-if="row.status === 'failed' || row.status === 'canceled'"
              link
              type="primary"
              @click="retryTask(row)"
            >
              重试
            </el-button>
            <el-button v-if="row.status === 'completed'" link type="primary" @click="openOutput(row)">打开成片</el-button>
            <el-button v-if="!isActive(row)" link type="danger" @click="deleteTask(row)">删除记录</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="还没有生成任务" />
        </template>
      </el-table>
    </section>

    <el-dialog v-model="dialogOpen" title="创建批量任务" width="520px">
      <el-form label-position="top">
        <el-form-item label="账号档案">
          <el-select v-model="form.personaId" placeholder="选择账号档案">
            <el-option
              v-for="persona in personas"
              :key="persona.id"
              :label="persona.name"
              :value="persona.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="镜头模板">
          <el-select v-model="form.templateId" placeholder="选择镜头模板">
            <el-option
              v-for="template in templates"
              :key="template.id"
              :label="`${template.name} · ${template.shots.length} 镜头`"
              :value="template.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="生成数量">
          <el-input-number v-model="form.count" :min="1" :max="20" />
          <span class="form-tip">每条任务拥有独立且可复现的随机种子</span>
        </el-form-item>
        <el-form-item label="配音音色">
          <el-select v-model="form.voiceId" placeholder="选择 MiniMax 音色">
            <el-option
              v-for="voice in voices"
              :key="voice.voiceId"
              :label="voice.name"
              :value="voice.voiceId"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogOpen = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="createTasks">
          加入队列
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.task-panel {
  height: calc(100vh - 210px);
  min-height: 420px;
  padding: 14px 18px;
}

.muted,
.form-tip {
  color: #8a96aa;
  font-size: 12px;
  margin-top: 5px;
}

.error-text {
  color: #d45353;
  font-size: 13px;
}

.el-select {
  width: 100%;
}

.form-tip {
  margin-left: 12px;
}
</style>
