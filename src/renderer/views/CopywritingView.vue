<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import PageIntro from "../components/PageIntro.vue";
import { generateCopywritingBatch, type BatchProgress, type BatchTopic } from "../copywriting/generate-copywriting-batch";
import { toCopywritingContext, toCopywritingGenerationInput } from "../copywriting/copywriting-request";
import { deriveShortTitle } from "../../shared/short-title";
import { toUserMessage } from "../lib/user-error";

type Persona = Awaited<ReturnType<typeof window.autocut.listPersonas>>[number];
type Project = Awaited<ReturnType<typeof window.autocut.listCopywritingProjects>>[number];

const personas = ref<Persona[]>([]);
const personaId = ref("");
const model = ref("deepseek-v3");
const topics = ref<BatchTopic[]>([]);
const selectedIds = ref<string[]>([]);
const projects = ref<Project[]>([]);
const mode = ref<"ai" | "custom">("ai");
const customText = ref("");
const customTitle = ref("");
const loadingTopics = ref(false);
const batchRunning = ref(false);
const progress = ref<BatchProgress>({ total: 0, completed: 0, succeeded: 0, failed: 0, currentTopicId: null });

const persona = computed(() => personas.value.find((item) => item.id === personaId.value) ?? null);
const reviewProjects = computed(() => projects.value.filter((item) => ["review", "failed"].includes(item.status)));

async function load(): Promise<void> {
  const [loadedPersonas, settings, loadedProjects] = await Promise.all([
    window.autocut.listPersonas(), window.autocut.getCopyModelSettings(),
    window.autocut.listCopywritingProjects(["review", "failed"])
  ]);
  personas.value = loadedPersonas;
  personaId.value = loadedPersonas.find((item) => item.isDefault)?.id ?? loadedPersonas[0]?.id ?? "";
  model.value = settings.defaultModel;
  projects.value = loadedProjects;
}

async function references(topic = ""): Promise<string[]> {
  if (!persona.value) return [];
  return (await window.autocut.searchReferenceScripts({ industry: persona.value.industry, query: topic, limit: 3 })).map((item) => item.content);
}

function context() {
  if (!persona.value) throw new Error("请先选择人设档案");
  return toCopywritingContext(persona.value, model.value);
}

async function generateTopics(): Promise<void> {
  if (!persona.value) return void ElMessage.warning("请先选择人设档案");
  loadingTopics.value = true;
  try {
    const result = await window.autocut.generateTopics({ ...context(), referenceScripts: await references() });
    topics.value = result.topics;
    selectedIds.value = [];
  } catch (error) { ElMessage.error(toUserMessage(error, "生成选题失败")); }
  finally { loadingTopics.value = false; }
}

function toggleTopic(id: string): void {
  selectedIds.value = selectedIds.value.includes(id) ? selectedIds.value.filter((item) => item !== id) : [...selectedIds.value, id];
}

async function createFromTopic(topic: BatchTopic, text: string, status: "review" | "failed", errorMessage: string | null): Promise<void> {
  if (!persona.value) return;
  const project = await window.autocut.createCopywritingProject({
    personaId: persona.value.id, topicId: topic.id, topicTitle: topic.title,
    mainTitle: deriveShortTitle(topic.title), text, model: model.value, status, errorMessage
  });
  projects.value = [project, ...projects.value];
}

async function generateSelected(): Promise<void> {
  const selected = topics.value.filter((item) => selectedIds.value.includes(item.id));
  if (!selected.length) return void ElMessage.warning("请至少选择一个选题");
  if (!persona.value) return;
  batchRunning.value = true;
  progress.value = { total: selected.length, completed: 0, succeeded: 0, failed: 0, currentTopicId: null };
  const base = toCopywritingGenerationInput(context(), persona.value.bannedWords);
  const result = await generateCopywritingBatch({
    topics: selected,
    generate: async (topic) => window.autocut.generateCopywriting({ ...base, referenceScripts: await references(topic.title), topic: topic.title, minLength: 200, maxLength: 1000 }),
    saveSuccess: async (topic, text) => createFromTopic(topic, text, "review", null),
    saveFailure: async (topic, error) => createFromTopic(topic, "", "failed", toUserMessage(error, "生成文案失败")),
    onProgress: (state) => { progress.value = state; }
  });
  batchRunning.value = false;
  ElMessage[result.failed ? "warning" : "success"](`批量生成完成：成功 ${result.succeeded} 条，失败 ${result.failed} 条`);
}

async function generateCurrent(): Promise<void> {
  if (selectedIds.value.length !== 1) return void ElMessage.warning("生成当前文案时请选择一个选题");
  await generateSelected();
}

async function saveProject(project: Project): Promise<void> {
  const updated = await window.autocut.updateCopywritingProject(project.id, { text: project.text, mainTitle: project.mainTitle });
  projects.value = projects.value.map((item) => item.id === updated.id ? updated : item);
  ElMessage.success("文案已保存");
}

async function checkProject(project: Project): Promise<void> {
  if (!persona.value || !project.text.trim()) return void ElMessage.warning("请先生成或填写文案");
  try {
    const result = await window.autocut.checkCopywritingCompliance({ text: project.text, personaBannedWords: persona.value.bannedWords });
    const updated = await window.autocut.updateCopywritingProject(project.id, { complianceIssues: result.issues });
    projects.value = projects.value.map((item) => item.id === updated.id ? updated : item);
    ElMessage[result.issues.length ? "warning" : "success"](result.issues.length ? `发现 ${result.issues.length} 处风险词` : "未发现风险词");
  } catch (error) { ElMessage.error(toUserMessage(error, "违禁词检查失败")); }
}

async function collect(project: Project): Promise<void> {
  if (project.text.replace(/\s/g, "").length < 50) return void ElMessage.warning("文案内容过短，请先完善");
  await window.autocut.collectCopywritingProject(project.id);
  projects.value = projects.value.filter((item) => item.id !== project.id);
  ElMessage.success("已收进文案库，可继续生成更多内容");
}

async function retry(project: Project): Promise<void> {
  const topic = { id: project.topicId ?? project.id, title: project.topicTitle, angle: "", hook: "" };
  projects.value = projects.value.filter((item) => item.id !== project.id);
  selectedIds.value = [];
  batchRunning.value = true;
  try {
    const current = persona.value;
    if (!current) throw new Error("人设档案不存在");
    const result = await window.autocut.generateCopywriting({ ...toCopywritingGenerationInput(context(), current.bannedWords), referenceScripts: await references(topic.title), topic: topic.title, minLength: 200, maxLength: 1000 });
    const updated = await window.autocut.updateCopywritingProject(project.id, { text: result.text, mainTitle: deriveShortTitle(topic.title), status: "review", errorMessage: null });
    projects.value = [updated, ...projects.value];
  } catch (error) {
    const updated = await window.autocut.updateCopywritingProject(project.id, { status: "failed", errorMessage: toUserMessage(error, "生成文案失败") });
    projects.value = [updated, ...projects.value];
  } finally { batchRunning.value = false; }
}

async function addCustom(): Promise<void> {
  if (!persona.value || customText.value.replace(/\s/g, "").length < 50) return void ElMessage.warning("请粘贴至少50字的完整口播文案");
  await createFromTopic({ id: crypto.randomUUID(), title: customTitle.value.trim() || "自定义文案", angle: "", hook: "" }, customText.value, "review", null);
  customText.value = ""; customTitle.value = "";
}

onMounted(load);
</script>

<template>
  <div class="page copy-page">
    <PageIntro title="文案批量生产" description="多选选题批量生成，检查后持续收进待剪辑文案库" />
    <section class="surface workspace">
      <div class="selectors">
        <label>人设档案<el-select v-model="personaId"><el-option v-for="item in personas" :key="item.id" :label="item.name" :value="item.id" /></el-select></label>
        <label>文案模型<el-input :model-value="model" disabled /></label>
      </div>
      <div class="mode-tabs"><button :class="{active:mode==='ai'}" @click="mode='ai'">AI 自动选题</button><button :class="{active:mode==='custom'}" @click="mode='custom'">自定义文案</button></div>

      <template v-if="mode==='ai'">
        <div class="topic-header"><div><strong>选题库</strong><span>一次生成5个内容角度，可多选</span></div><el-button data-action="generate-topics" :loading="loadingTopics" @click="generateTopics">{{ topics.length?'换一批':'生成选题' }}</el-button></div>
        <div v-if="topics.length" class="topic-list">
          <button v-for="(topic,index) in topics" :key="topic.id" :data-topic-id="topic.id" :class="{selected:selectedIds.includes(topic.id)}" @click="toggleTopic(topic.id)">
            <span>{{ String.fromCharCode(65+index) }}</span><div><strong>{{ topic.title }}</strong><small>{{ topic.hook }} · {{ topic.angle }}</small></div><b>{{ selectedIds.includes(topic.id)?'✓':'' }}</b>
          </button>
        </div>
        <div v-else class="empty-topics"><p>根据当前人设生成5个不同内容角度</p><el-button type="primary" data-action="generate-topics" @click="generateTopics">生成选题</el-button></div>
        <div class="batch-actions"><el-button :disabled="selectedIds.length!==1" @click="generateCurrent">生成当前文案</el-button><el-button type="primary" data-action="generate-selected-copywriting" :loading="batchRunning" :disabled="!selectedIds.length" @click="generateSelected">生成所选文案（{{ selectedIds.length }}）</el-button></div>
        <div v-if="batchRunning || progress.completed" class="batch-progress"><div><strong>批量生成进度</strong><span>{{ progress.completed }}/{{ progress.total }}，成功 {{ progress.succeeded }}，失败 {{ progress.failed }}</span></div><el-progress :percentage="progress.total?Math.round(progress.completed/progress.total*100):0" /></div>
      </template>

      <div v-else class="custom-box"><el-input v-model="customTitle" placeholder="文案标题/选题" /><el-input v-model="customText" type="textarea" :rows="10" maxlength="1000" show-word-limit placeholder="粘贴自己的完整口播文案" /><el-button type="primary" @click="addCustom">加入待检查文案</el-button></div>

      <section class="results"><header><div><strong>待检查文案</strong><span>逐条修改、筛查后收进文案库</span></div><el-tag>{{ reviewProjects.length }} 条</el-tag></header>
        <article v-for="project in reviewProjects" :key="project.id" class="project-card" :class="{failed:project.status==='failed'}">
          <div class="project-title"><el-input v-model="project.mainTitle" maxlength="6" /><strong>{{ project.topicTitle }}</strong><el-tag :type="project.status==='failed'?'danger':'warning'">{{ project.status==='failed'?'生成失败':'待检查' }}</el-tag></div>
          <template v-if="project.status==='failed'"><p class="error">{{ project.errorMessage }}</p><el-button type="primary" @click="retry(project)">重新生成</el-button></template>
          <template v-else><el-input v-model="project.text" type="textarea" :rows="9" maxlength="1000" show-word-limit />
            <div v-if="project.complianceIssues.length" class="issues">发现 {{ project.complianceIssues.length }} 处风险词，请人工修改后重新检查。</div>
            <div class="project-actions"><el-button @click="saveProject(project)">保存修改</el-button><el-button @click="checkProject(project)">AI违禁词检查</el-button><el-button type="primary" @click="collect(project)">收进文案库</el-button></div>
          </template>
        </article>
        <el-empty v-if="!reviewProjects.length" description="还没有待检查文案" />
      </section>
    </section>
  </div>
</template>

<style scoped>
.workspace{padding:26px;display:grid;gap:22px}.selectors{display:grid;grid-template-columns:260px 220px;gap:16px}.selectors label{display:grid;gap:7px;color:var(--text-muted)}.mode-tabs{display:grid;grid-template-columns:1fr 1fr;gap:10px}.mode-tabs button{height:48px;border:1px solid var(--border);border-radius:14px;background:#fff;font-weight:700}.mode-tabs .active{color:var(--brand-yellow);background:var(--brand-black)}.topic-header,.results>header,.project-title,.project-actions,.batch-actions,.batch-progress>div{display:flex;align-items:center;justify-content:space-between;gap:12px}.topic-header span,.results header span{display:block;margin-top:4px;color:var(--text-muted);font-size:13px}.topic-list{display:grid;gap:10px}.topic-list button{display:grid;grid-template-columns:34px 1fr 28px;gap:14px;align-items:center;padding:15px;border:1px solid transparent;border-radius:14px;text-align:left;background:var(--surface-muted)}.topic-list button>span{width:30px;height:30px;display:grid;place-items:center;border-radius:50%;color:#fff;background:#111}.topic-list button small{display:block;margin-top:4px;color:var(--text-muted)}.topic-list button.selected{border-color:var(--brand-yellow);background:#171714;color:#fff}.topic-list button.selected small{color:#ccc}.topic-list button.selected b{color:var(--brand-yellow)}.empty-topics{min-height:180px;display:grid;place-content:center;justify-items:center;border:1px dashed var(--border);border-radius:16px;color:var(--text-muted)}.batch-actions{justify-content:center}.batch-progress{padding:16px;border-radius:14px;background:#fff9c9}.custom-box{display:grid;gap:14px}.results{display:grid;gap:15px;padding-top:20px;border-top:1px solid var(--border)}.project-card{display:grid;gap:13px;padding:18px;border:1px solid var(--border);border-radius:16px;background:#fff}.project-card.failed{border-color:#ffb4ac;background:#fff7f6}.project-title{justify-content:flex-start}.project-title .el-input{width:180px}.project-title strong{flex:1}.project-actions{justify-content:flex-end}.error,.issues{color:#b42318}.issues{padding:10px;border-radius:10px;background:#fff1ef}@media(max-width:850px){.selectors{grid-template-columns:1fr}.project-title{align-items:stretch;flex-direction:column}.project-title .el-input{width:100%}}
</style>
