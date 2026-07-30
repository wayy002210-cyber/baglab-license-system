<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { EditPen, MagicStick } from "@element-plus/icons-vue";
import PageIntro from "../components/PageIntro.vue";
import TopicPicker from "../components/copywriting/TopicPicker.vue";
import CompliancePanel from "../components/copywriting/CompliancePanel.vue";
import {
  createEmptyDraft,
  useCreationDraft
} from "../composables/useCreationDraft";
import { createOperationState } from "../lib/operation-state";
import {
  toCopywritingContext,
  toCopywritingGenerationInput
} from "../copywriting/copywriting-request";

type Persona = Awaited<ReturnType<typeof window.autocut.listPersonas>>[number];
type ComplianceIssue = Awaited<
  ReturnType<typeof window.autocut.checkCopywritingCompliance>
>["issues"][number];

const router = useRouter();
const draftState = useCreationDraft();
const personas = ref<Persona[]>([]);
const modelSettings = ref({
  defaultModel: "deepseek-v3",
  temperature: 0.7,
  candidateModels: ["deepseek-v3", "qwen-plus"]
});
const mode = ref<"ai" | "custom">("ai");
const topicOperation = createOperationState();
const scriptOperation = createOperationState();
const complianceOperation = createOperationState();
const loadingTopics = computed(() => topicOperation.busy.value);
const generating = computed(() => scriptOperation.busy.value);
const checking = computed(() => complianceOperation.busy.value);
const disclaimer = ref("风险提示仅用于内容检查，不构成法律结论。");
const initialized = ref(false);

const currentPersona = computed(
  () =>
    personas.value.find(
      (persona) => persona.id === draftState.draft.value.personaId
    ) ?? null
);
const copywriting = computed(() => draftState.draft.value.copywriting);
const characterCount = computed(
  () => copywriting.value?.text.replace(/\s/g, "").length ?? 0
);

function initializeCopywriting(): void {
  if (draftState.draft.value.copywriting) return;
  draftState.draft.value.copywriting = {
    model: modelSettings.value.defaultModel,
    temperature: modelSettings.value.temperature,
    topics: [],
    selectedTopicId: null,
    text: "",
    complianceIssues: []
  };
}

async function load(): Promise<void> {
  const [loadedPersonas, loadedSettings] = await Promise.all([
    window.autocut.listPersonas(),
    window.autocut.getCopyModelSettings(),
    draftState.load()
  ]);
  personas.value = loadedPersonas;
  modelSettings.value = loadedSettings;
  if (!draftState.draft.value.personaId) {
    draftState.draft.value.personaId =
      loadedPersonas.find((persona) => persona.isDefault)?.id ??
      loadedPersonas[0]?.id ??
      null;
  }
  initializeCopywriting();
  initialized.value = true;
}

async function referenceScripts(): Promise<string[]> {
  const persona = currentPersona.value;
  if (!persona) return [];
  const scripts = await window.autocut.searchReferenceScripts({
    industry: persona.industry,
    query:
      copywriting.value?.topics.find(
        (topic) => topic.id === copywriting.value?.selectedTopicId
      )?.title ?? "",
    limit: 3
  });
  return scripts.map((script) => script.content);
}

function contextInput(persona: Persona) {
  return toCopywritingContext(
    persona,
    copywriting.value?.model ?? modelSettings.value.defaultModel
  );
}

async function generateTopics(): Promise<void> {
  const persona = currentPersona.value;
  if (!persona || !copywriting.value) {
    ElMessage.warning("请先选择人设档案");
    return;
  }
  try {
    await topicOperation.run(async () => {
      const result = await window.autocut.generateTopics({
        ...contextInput(persona),
        referenceScripts: await referenceScripts()
      });
      copywriting.value!.topics = result.topics;
      copywriting.value!.selectedTopicId = null;
      copywriting.value!.complianceIssues = [];
      await draftState.saveImmediate();
    }, {
      phase: "requesting",
      progress: 45,
      message: "正在通过百炼生成 5 个选题",
      fallback: "生成选题失败"
    });
  } catch {
    const failure = topicOperation.error.value;
    if (failure) ElMessage.error(`${failure.title}：${failure.action}`);
  }
}

function selectTopic(id: string): void {
  if (!copywriting.value) return;
  copywriting.value.selectedTopicId = id;
}

async function generateScript(): Promise<void> {
  const persona = currentPersona.value;
  const state = copywriting.value;
  const topic = state?.topics.find(
    (candidate) => candidate.id === state.selectedTopicId
  );
  if (!persona || !state || !topic) {
    ElMessage.warning("请先选择一个选题");
    return;
  }
  try {
    await scriptOperation.run(async () => {
      const result = await window.autocut.generateCopywriting({
        ...toCopywritingGenerationInput(
          contextInput(persona),
          persona.bannedWords
        ),
        referenceScripts: await referenceScripts(),
        topic: topic.title,
        minLength: 200,
        maxLength: 1000
      });
      const currentState = copywriting.value;
      if (!currentState) {
        throw new Error("当前文案草稿已失效，请重新生成");
      }
      currentState.text = result.text;
      currentState.complianceIssues = [];
      await draftState.saveImmediate();
    }, {
      phase: "requesting",
      progress: 45,
      message: "正在生成完整口播文案",
      fallback: "生成文案失败"
    });
  } catch {
    const failure = scriptOperation.error.value;
    if (failure) ElMessage.error(`${failure.title}：${failure.action}`);
  }
}

async function checkCompliance(): Promise<void> {
  const persona = currentPersona.value;
  const state = copywriting.value;
  if (!persona || !state?.text.trim()) {
    ElMessage.warning("请先填写或生成文案");
    return;
  }
  try {
    await complianceOperation.run(async () => {
      const result = await window.autocut.checkCopywritingCompliance({
        text: state.text,
        personaBannedWords: persona.bannedWords
      });
      state.complianceIssues = result.issues;
      disclaimer.value = result.disclaimer;
      await draftState.saveImmediate();
    }, {
      phase: "processing",
      progress: 65,
      message: "正在检查平台与广告法风险词",
      fallback: "违禁词检查失败"
    });
  } catch {
    const failure = complianceOperation.error.value;
    if (failure) ElMessage.error(`${failure.title}：${failure.action}`);
  }
}

function applySuggestion(issue: ComplianceIssue): void {
  const state = copywriting.value;
  if (!state) return;
  if (state.text.slice(issue.start, issue.end) !== issue.term) {
    ElMessage.warning("文案已经变化，请重新检查后再替换");
    return;
  }
  state.text =
    state.text.slice(0, issue.start) +
    issue.suggestion +
    state.text.slice(issue.end);
  state.complianceIssues = [];
  draftState.scheduleSave();
}

async function goToAudio(): Promise<void> {
  if (!copywriting.value) return;
  if (characterCount.value < 200 || characterCount.value > 1000) {
    ElMessage.warning("口播文案请控制在 200–1000 字");
    return;
  }
  const previousStage = draftState.draft.value.stage;
  draftState.draft.value.stage = "audio";
  try {
    await draftState.saveImmediate();
    ElMessage.success("文案已保存，正在进入音频制作");
    await router.push("/audio");
  } catch (error) {
    draftState.draft.value.stage = previousStage;
    ElMessage.error(
      `文案保存失败：${
        error instanceof Error ? error.message : "请稍后重试"
      }`
    );
  }
}

watch(
  () => draftState.draft.value,
  () => {
    if (initialized.value) draftState.scheduleSave();
  },
  { deep: true }
);

onMounted(load);
</script>

<template>
  <div class="page copy-page">
    <PageIntro
      title="文案生成"
      description="结合人设档案生成选题和口播稿，也可以直接粘贴自己的完整文案"
    />
    <section class="surface creation-card">
      <header class="creation-toolbar">
        <div class="context-selectors">
          <label>
            人设档案
            <el-select v-model="draftState.draft.value.personaId">
              <el-option
                v-for="persona in personas"
                :key="persona.id"
                :label="persona.name"
                :value="persona.id"
              />
            </el-select>
          </label>
          <label>
            文案模型
            <el-select v-if="copywriting" v-model="copywriting.model">
              <el-option
                v-for="model in modelSettings.candidateModels"
                :key="model"
                :label="model"
                :value="model"
              />
            </el-select>
          </label>
        </div>
        <el-tag v-if="currentPersona" effect="plain">
          {{ currentPersona.name }} · {{ currentPersona.industry || "未设置行业" }}
        </el-tag>
      </header>

      <div class="mode-tabs">
        <button
          type="button"
          :class="{ active: mode === 'ai' }"
          @click="mode = 'ai'"
        >
          <el-icon><MagicStick /></el-icon>
          AI 自动选题
        </button>
        <button
          type="button"
          :class="{ active: mode === 'custom' }"
          @click="mode = 'custom'"
        >
          <el-icon><EditPen /></el-icon>
          自定义文案
        </button>
      </div>

      <section
        v-if="topicOperation.phase.value !== 'idle'"
        class="operation-feedback"
        :class="{ failed: topicOperation.phase.value === 'error' }"
      >
        <div>
          <strong>{{ topicOperation.error.value?.title || topicOperation.message.value }}</strong>
          <p v-if="topicOperation.error.value">
            {{ topicOperation.error.value.detail }} {{ topicOperation.error.value.action }}
          </p>
          <p v-else>生成过程通常需要 10–60 秒，请不要关闭软件。</p>
        </div>
        <el-progress
          v-if="topicOperation.phase.value !== 'error'"
          :percentage="topicOperation.progress.value"
          :indeterminate="topicOperation.busy.value"
          :duration="2"
        />
        <el-button
          v-else
          type="primary"
          @click="topicOperation.retry().catch(() => undefined)"
        >
          重试生成
        </el-button>
      </section>
      <TopicPicker
        v-if="mode === 'ai' && copywriting"
        :topics="copywriting.topics"
        :selected-id="copywriting.selectedTopicId"
        :loading="loadingTopics"
        @select="selectTopic"
        @refresh="generateTopics"
      />
      <div
        v-if="mode === 'ai' && copywriting && !copywriting.topics.length"
        class="empty-topics"
      >
        <p>根据当前人设生成 5 个不同内容角度。</p>
        <el-button type="primary" :loading="loadingTopics" @click="generateTopics">
          生成选题
        </el-button>
      </div>
      <div v-if="mode === 'ai'" class="center-action">
        <el-button
          data-action="generate-copywriting"
          type="primary"
          :loading="generating"
          :disabled="!copywriting?.selectedTopicId"
          @click="generateScript"
        >
          生成完整文案
        </el-button>
      </div>

      <section
        v-if="scriptOperation.phase.value !== 'idle'"
        class="operation-feedback"
        :class="{ failed: scriptOperation.phase.value === 'error' }"
      >
        <div>
          <strong>{{ scriptOperation.error.value?.title || scriptOperation.message.value }}</strong>
          <p v-if="scriptOperation.error.value">
            {{ scriptOperation.error.value.detail }} {{ scriptOperation.error.value.action }}
          </p>
          <p v-else>正在生成完整口播文案，通常需要 10–60 秒，请不要关闭软件。</p>
        </div>
        <el-progress
          v-if="scriptOperation.phase.value !== 'error'"
          :percentage="scriptOperation.progress.value"
          :indeterminate="scriptOperation.busy.value"
          :duration="2"
        />
        <el-button
          v-else
          type="primary"
          @click="scriptOperation.retry().catch(() => undefined)"
        >
          重试生成完整文案
        </el-button>
      </section>

      <section v-if="copywriting" class="editor-section">
        <div class="section-title">
          <div>
            <h3>文案与编辑</h3>
            <p>生成结果可继续手动修改，系统会自动保存草稿</p>
          </div>
          <span :class="{ invalid: characterCount < 200 || characterCount > 1000 }">
            {{ characterCount }} / 1000
          </span>
        </div>
        <textarea
          v-model="copywriting.text"
          rows="15"
          maxlength="1000"
          placeholder="生成文案，或在这里粘贴自己的完整口播稿"
        />
        <div class="editor-actions">
          <span
            class="save-state"
            :class="{ failed: draftState.saveStatus.value === 'failed' }"
          >
            {{
              draftState.saveStatus.value === "saving"
                ? "正在保存草稿…"
                : draftState.saveStatus.value === "saved"
                  ? "草稿已保存"
                  : draftState.saveStatus.value === "failed"
                    ? `保存失败：${draftState.saveError.value}`
                    : "修改后自动保存"
            }}
          </span>
          <div>
            <el-button :loading="checking" @click="checkCompliance">
              AI 违禁词检查
            </el-button>
            <el-button
              type="primary"
              :loading="draftState.saving.value"
              @click="goToAudio"
            >
              保存并进入音频制作
            </el-button>
          </div>
        </div>
      </section>

      <CompliancePanel
        v-if="copywriting?.complianceIssues.length"
        :issues="copywriting.complianceIssues"
        :disclaimer="disclaimer"
        @apply="applySuggestion"
      />
    </section>
  </div>
</template>

<style scoped>
.creation-card {
  max-width: 1240px;
  padding: 26px;
  display: grid;
  gap: 22px;
}
.creation-toolbar,
.section-title,
.editor-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.context-selectors {
  display: grid;
  grid-template-columns: 260px 220px;
  gap: 14px;
}
label {
  display: grid;
  gap: 7px;
  color: var(--text-muted);
  font-size: 13px;
}
.save-state{font-size:12px;color:var(--text-muted)}.save-state.failed{color:var(--el-color-danger)}
.mode-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.mode-tabs button {
  min-height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: #fff;
}
.mode-tabs .active {
  color: var(--brand-yellow);
  border-color: var(--brand-black);
  background: var(--brand-black);
}
.empty-topics {
  min-height: 190px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 12px;
  border: 1px dashed var(--border);
  border-radius: 16px;
  color: var(--text-muted);
}
.center-action {
  display: flex;
  justify-content: center;
}
.operation-feedback {
  display: grid;
  gap: 12px;
  padding: 16px 18px;
  border: 1px solid #f1d400;
  border-radius: 14px;
  background: #fffbe0;
}
.operation-feedback.failed {
  border-color: #f2b8b5;
  background: #fff4f3;
}
.operation-feedback strong,
.operation-feedback p {
  margin: 0;
}
.operation-feedback p {
  margin-top: 4px;
  color: var(--text-muted);
  font-size: 13px;
}
.editor-section {
  display: grid;
  gap: 12px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
}
.section-title h3,
.section-title p {
  margin: 0;
}
.section-title p {
  margin-top: 4px;
  color: var(--text-muted);
  font-size: 12px;
}
.section-title span {
  color: var(--text-muted);
}
.section-title .invalid {
  color: var(--warning);
}
textarea {
  width: 100%;
  min-height: 320px;
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: 14px;
  resize: vertical;
  line-height: 1.8;
}
@media (max-width: 900px) {
  .context-selectors {
    grid-template-columns: 1fr;
  }
}
</style>
