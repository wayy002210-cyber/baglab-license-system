<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import PageIntro from "../components/PageIntro.vue";
import VoiceLibrary from "../components/audio/VoiceLibrary.vue";
import VoiceCloneDialog from "../components/audio/VoiceCloneDialog.vue";
import { emotionLabel, selectPreferredVoices, voiceDisplayName } from "../audio/voice-labels";

type Voice = { voiceId: string; name: string; kind: string };
type Settings = Awaited<ReturnType<typeof window.autocut.getVoiceSettings>>;

const settings = reactive<Settings>({
  voiceId: "", source: "system", model: "speech-2.8-hd", emotion: "calm",
  speed: 1, volume: 1, pitch: 0, languageBoost: "Chinese"
});
const voices = ref<Voice[]>([]);
const capabilities = ref<Awaited<ReturnType<typeof window.autocut.getVoiceCapabilities>> | null>(null);
const loading = ref(true);
const saving = ref(false);
const showClone = ref(false);
const playingVoiceId = ref<string | null>(null);
let player: HTMLAudioElement | null = null;

const emotions = computed(() => capabilities.value?.emotions ?? ["calm"]);

function stopPreview(): void {
  player?.pause();
  if (player) player.currentTime = 0;
  player = null;
  playingVoiceId.value = null;
}

function chooseVoice(id: string): void {
  settings.voiceId = id;
  const selected = voices.value.find((item) => item.voiceId === id);
  settings.source = selected?.kind === "clone" ? "clone" : "system";
}

async function audition(id: string): Promise<void> {
  if (playingVoiceId.value === id) return stopPreview();
  stopPreview();
  chooseVoice(id);
  playingVoiceId.value = id;
  try {
    const url = await window.autocut.previewVoice({
      text: "你好，我是袋研官，这是当前音色的试听效果。", voiceId: id,
      model: settings.model, emotion: settings.emotion, speed: settings.speed,
      volume: settings.volume, pitch: settings.pitch
    });
    player = new Audio(url);
    player.addEventListener("ended", stopPreview, { once: true });
    await player.play();
  } catch (error) {
    stopPreview();
    ElMessage.error(error instanceof Error ? error.message : "音色试听失败，请检查 MiniMax 配置和网络");
  }
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const [stored, caps, loadedVoices] = await Promise.all([
      window.autocut.getVoiceSettings(), window.autocut.getVoiceCapabilities(),
      window.autocut.listVoices().catch(() => [] as Voice[])
    ]);
    Object.assign(settings, stored);
    capabilities.value = caps;
    voices.value = selectPreferredVoices(loadedVoices).map((item) => ({ ...item, name: voiceDisplayName(item) }));
    if (!voices.value.some((item) => item.voiceId === settings.voiceId)) {
      voices.value.unshift({ voiceId: settings.voiceId, name: `已选音色 · ${settings.voiceId}`, kind: settings.source });
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "声音设置加载失败");
  } finally {
    loading.value = false;
  }
}

async function save(): Promise<void> {
  if (!settings.voiceId) return void ElMessage.warning("请先选择一个音色");
  saving.value = true;
  try {
    Object.assign(settings, await window.autocut.saveVoiceSettings({ ...settings }));
    ElMessage.success("声音设置已保存，创建任务时会写入任务快照");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "声音设置保存失败");
  } finally {
    saving.value = false;
  }
}

function addClone(item: Voice): void {
  voices.value.unshift(item);
  chooseVoice(item.voiceId);
}

onMounted(load);
onBeforeUnmount(stopPreview);
</script>

<template>
  <div class="page audio-settings-page" v-loading="loading">
    <PageIntro title="音频设置" description="统一设置任务使用的音色、情感和声音参数。配音会在任务中心开始合成后生成。" />
    <section class="surface settings-card">
      <header class="settings-header">
        <div><strong>默认声音配置</strong><small>修改只影响之后创建的任务，已有任务快照不会改变</small></div>
        <div class="header-actions">
          <el-button @click="showClone = true">克隆我的声音</el-button>
          <el-button data-action="save-voice-settings" type="primary" :loading="saving" @click="save">保存声音设置</el-button>
        </div>
      </header>

      <VoiceLibrary :voices="voices" :model-value="settings.voiceId" :playing-id="playingVoiceId"
        @update:model-value="chooseVoice" @audition="audition" />

      <div class="parameter-panel">
        <label>情感
          <el-select v-model="settings.emotion">
            <el-option v-for="item in emotions" :key="item" :label="emotionLabel(item)" :value="item" />
          </el-select>
        </label>
        <label>语速 {{ settings.speed.toFixed(1) }}x
          <el-slider v-model="settings.speed" :min="0.5" :max="2" :step="0.1" />
        </label>
        <label>音调 {{ settings.pitch }}
          <el-slider v-model="settings.pitch" :min="-12" :max="12" :step="1" />
        </label>
      </div>
      <p class="pipeline-note">任务中心流水线：生成逐镜头配音 → 选择素材 → 编排镜头 → 编码成片</p>
    </section>
    <VoiceCloneDialog v-model="showClone" :default-model="settings.model" @completed="addClone" />
  </div>
</template>

<style scoped>
.audio-settings-page{display:grid;gap:22px}.settings-card{padding:28px;display:grid;gap:28px}.settings-header{display:flex;justify-content:space-between;align-items:center;gap:20px}.settings-header>div:first-child{display:grid;gap:5px}.settings-header small{color:var(--text-muted)}.header-actions{display:flex;gap:10px}.parameter-panel{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px 34px;padding:24px;border-radius:18px;background:#f7f7f3}.parameter-panel label{display:grid;gap:12px;font-weight:650}.pipeline-note{margin:0;padding:14px 18px;border-radius:12px;background:#fff8bf;color:#514900}@media(max-width:800px){.settings-header{align-items:flex-start;flex-direction:column}.parameter-panel{grid-template-columns:1fr}}
</style>
