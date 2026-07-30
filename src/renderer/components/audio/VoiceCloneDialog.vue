<script setup lang="ts">
import { reactive, ref } from "vue";
import { ElMessage } from "element-plus";

const props = defineProps<{ modelValue: boolean; defaultModel: string }>();
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  completed: [voice: { voiceId: string; name: string; kind: string }];
}>();
const form = reactive({
  samplePath: "",
  voiceId: "",
  previewText: "你好，我是袋研官，这是我的声音试听。",
  needNoiseReduction: true,
  needVolumeNormalization: true
});
const metadata = ref<Awaited<
  ReturnType<typeof window.autocut.validateVoiceSample>
> | null>(null);
const busy = ref(false);
const phase = ref<"idle" | "validating" | "uploading" | "completed" | "error">("idle");
const errorMessage = ref("");

async function chooseSample(): Promise<void> {
  phase.value = "validating";
  errorMessage.value = "";
  try {
    const path = await window.autocut.selectVoiceSample();
    if (!path) return void (phase.value = "idle");
    form.samplePath = path;
    metadata.value = await window.autocut.validateVoiceSample(path);
    phase.value = "idle";
  } catch (error) {
    phase.value = "error";
    errorMessage.value =
      error instanceof Error ? error.message : "声音样本校验失败";
    ElMessage.error(`${errorMessage.value}，请更换 10 秒至 5 分钟的清晰人声文件。`);
  }
}

async function clone(): Promise<void> {
  busy.value = true;
  phase.value = "uploading";
  errorMessage.value = "";
  try {
    const result = await window.autocut.cloneVoice({
      ...form,
      model: props.defaultModel,
      languageBoost: "Chinese"
    });
    emit("completed", {
      voiceId: result.voiceId,
      name: `我的音色 · ${result.voiceId}`,
      kind: "clone"
    });
    emit("update:modelValue", false);
    ElMessage.success("声音克隆完成，可立即用于配音");
    phase.value = "completed";
  } catch (error) {
    phase.value = "error";
    errorMessage.value =
      error instanceof Error ? error.message : "声音克隆失败";
    ElMessage.error(`${errorMessage.value}，请检查 MiniMax 密钥后重试。`);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="声音克隆"
    width="620px"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="clone-form">
      <label>声音样本（MP3 / M4A / WAV，10 秒至 5 分钟）</label>
      <div class="path-row">
        <el-input v-model="form.samplePath" readonly />
        <el-button @click="chooseSample">选择声音素材</el-button>
      </div>
      <el-tag v-if="metadata" type="success">
        已通过校验 · {{ metadata.durationSec.toFixed(1) }} 秒 ·
        {{ (metadata.sizeBytes / 1024 / 1024).toFixed(1) }} MB
      </el-tag>
      <el-progress
        v-if="phase === 'validating' || phase === 'uploading'"
        :percentage="phase === 'validating' ? 30 : 70"
        :indeterminate="true"
        :duration="2"
      />
      <p v-if="phase === 'uploading'" class="clone-status">
        正在上传样本并创建克隆音色，通常需要 10–60 秒。
      </p>
      <p v-if="phase === 'error'" class="clone-error">
        {{ errorMessage }}。请更换声音样本或检查 MiniMax 配置后重试。
      </p>
      <label>自定义音色 ID</label>
      <el-input v-model="form.voiceId" placeholder="例如 BagLabVoice01" />
      <label>试听文本</label>
      <el-input v-model="form.previewText" type="textarea" />
      <el-checkbox v-model="form.needNoiseReduction">自动降噪</el-checkbox>
      <el-checkbox v-model="form.needVolumeNormalization">音量归一化</el-checkbox>
    </div>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="busy"
        :disabled="!metadata || form.voiceId.length < 8"
        @click="clone"
      >
        开始克隆
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.clone-form {
  display: grid;
  gap: 14px;
}
.path-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
}
.clone-status,
.clone-error {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
}
.clone-status {
  background: #fff8bf;
}
.clone-error {
  color: #b42318;
  background: #fff0ef;
}
</style>
