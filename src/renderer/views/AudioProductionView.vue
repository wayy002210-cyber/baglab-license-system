<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import PageIntro from "../components/PageIntro.vue";
import VoiceLibrary from "../components/audio/VoiceLibrary.vue";
import VoiceCloneDialog from "../components/audio/VoiceCloneDialog.vue";
import AudioSegmentList from "../components/audio/AudioSegmentList.vue";
import { useCreationDraft } from "../composables/useCreationDraft";
import { segmentCopywriting, stableHash } from "../audio/segment-copywriting";
import type { CreationDraft } from "../../shared/contracts";

type Segment = CreationDraft["audioSegments"][number];
const router = useRouter();
const state = useCreationDraft();
const voices = ref<Array<{ voiceId: string; name: string; kind: string }>>([]);
const capabilities = ref<Awaited<
  ReturnType<typeof window.autocut.getVoiceCapabilities>
> | null>(null);
const model = ref("speech-2.8-hd");
const showClone = ref(false);
const generatingId = ref<string | null>(null);
const previewUrl = ref("");

const ready = computed(
  () =>
    state.draft.value.audioSegments.length > 0 &&
    state.draft.value.audioSegments.every((item) => item.status === "ready")
);
const voice = computed(() => state.draft.value.voice);

function parameterHash(): string {
  return stableHash(JSON.stringify({ model: model.value, ...voice.value }));
}

function rebuildSegments(): void {
  const text = state.draft.value.copywriting?.text ?? "";
  const existing = new Map(
    state.draft.value.audioSegments.map((item) => [
      `${item.textHash}:${item.parameterHash}`,
      item
    ])
  );
  const params = parameterHash();
  state.draft.value.audioSegments = segmentCopywriting(text).map((item, index) => {
    const textHash = stableHash(item.text);
    return (
      existing.get(`${textHash}:${params}`) ?? {
        id: `segment-${index}-${textHash}`,
        index,
        ...item,
        textHash,
        parameterHash: params,
        audioPath: null,
        durationSec: null,
        status: "pending" as const,
        errorMessage: null
      }
    );
  });
}

async function load(): Promise<void> {
  const [, loadedVoices, loadedCapabilities] = await Promise.all([
    state.load(),
    window.autocut.listVoices(),
    window.autocut.getVoiceCapabilities()
  ]);
  voices.value = loadedVoices;
  capabilities.value = loadedCapabilities;
  model.value = loadedCapabilities.models[0] ?? model.value;
  if (!state.draft.value.voice) {
    state.draft.value.voice = {
      voiceId: loadedVoices[0]?.voiceId ?? "",
      source: "system",
      emotion: "calm",
      speed: 1,
      volume: 1,
      pitch: 0,
      languageBoost: "Chinese"
    };
  }
  rebuildSegments();
}

async function generate(segment: Segment): Promise<void> {
  if (!voice.value?.voiceId) {
    ElMessage.warning("请先选择音色");
    return;
  }
  generatingId.value = segment.id;
  segment.status = "generating";
  try {
    const result = await window.autocut.synthesizeVoice({
      text: segment.text,
      voiceId: voice.value.voiceId,
      model: model.value,
      emotion: voice.value.emotion,
      speed: voice.value.speed,
      volume: voice.value.volume,
      pitch: voice.value.pitch,
      languageBoost: voice.value.languageBoost
    });
    segment.audioPath = result.audioPath;
    segment.durationSec = segment.durationSec ?? 1;
    segment.textHash = stableHash(segment.text);
    segment.parameterHash = parameterHash();
    segment.status = "ready";
    segment.errorMessage = null;
    await state.saveImmediate();
  } catch (error) {
    segment.status = "failed";
    segment.errorMessage = error instanceof Error ? error.message : "配音生成失败";
  } finally {
    generatingId.value = null;
  }
}

async function generateAll(): Promise<void> {
  rebuildSegments();
  for (const segment of state.draft.value.audioSegments) {
    if (segment.status !== "ready") await generate(segment);
  }
}

async function audition(): Promise<void> {
  if (!voice.value?.voiceId) return;
  previewUrl.value = await window.autocut.previewVoice({
    text: "你好，我是袋研官，这是当前音色的试听效果。",
    voiceId: voice.value.voiceId,
    model: model.value,
    emotion: voice.value.emotion,
    speed: voice.value.speed,
    volume: voice.value.volume,
    pitch: voice.value.pitch
  });
}

function addClone(item: { voiceId: string; name: string; kind: string }): void {
  voices.value.push(item);
  if (voice.value) {
    voice.value.voiceId = item.voiceId;
    voice.value.source = "clone";
  }
}

async function next(): Promise<void> {
  state.draft.value.stage = "editing";
  await state.saveImmediate();
  await router.push("/templates");
}

onMounted(load);
</script>

<template>
  <div class="page audio-page">
    <PageIntro title="音频制作" description="选择或克隆音色，将完整文案拆分为可单独试听、重试和缓存的口播音频。" />
    <section v-if="voice" class="audio-grid surface">
      <div class="audio-main">
        <VoiceLibrary v-model="voice.voiceId" :voices="voices" @audition="audition" />
        <div class="control-grid">
          <label>声音模型<el-select v-model="model"><el-option v-for="item in capabilities?.models" :key="item" :label="item" :value="item" /></el-select></label>
          <label>情感<el-select v-model="voice.emotion"><el-option v-for="item in capabilities?.emotions" :key="item" :label="item" :value="item" /></el-select></label>
          <label>语速 {{ voice.speed.toFixed(1) }}x<el-slider v-model="voice.speed" :min="0.5" :max="2" :step="0.1" /></label>
          <label>人声音量 {{ voice.volume.toFixed(1) }}<el-slider v-model="voice.volume" :min="0" :max="3" :step="0.1" /></label>
          <label>音调 {{ voice.pitch }}<el-slider v-model="voice.pitch" :min="-12" :max="12" :step="1" /></label>
        </div>
        <audio v-if="previewUrl" :src="previewUrl" controls autoplay />
        <AudioSegmentList :segments="state.draft.value.audioSegments" :generating-id="generatingId" @generate="generate" />
      </div>
      <aside class="audio-actions">
        <h3>声音工作台</h3>
        <el-button class="wide" @click="showClone = true">声音克隆</el-button>
        <el-button class="wide" @click="audition">配音预览</el-button>
        <el-button class="wide" type="primary" @click="generateAll">逐段生成全部配音</el-button>
        <p>{{ state.draft.value.audioSegments.filter(item => item.status === "ready").length }} / {{ state.draft.value.audioSegments.length }} 段已完成</p>
        <el-button class="wide next" type="primary" :disabled="!ready" @click="next">进入镜头剪辑</el-button>
      </aside>
    </section>
    <VoiceCloneDialog v-model="showClone" :default-model="model" @completed="addClone" />
  </div>
</template>

<style scoped>
.audio-grid{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:24px;padding:24px}.audio-main{display:grid;gap:22px}.audio-actions{border-left:1px solid var(--line);padding-left:22px}.wide{width:100%;margin:0 0 12px}.next{margin-top:28px}.control-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.control-grid label{display:grid;gap:8px;color:var(--muted)}.section-heading{display:flex;justify-content:space-between}.section-heading div{display:grid;gap:4px}.section-heading small{color:var(--muted)}.voice-chips{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}.voice-chips button{padding:12px 16px;border:1px solid var(--line);border-radius:12px;background:white}.voice-chips button.active{background:#111;color:#fff;border-color:#111}.voice-chips span{display:block;font-size:11px;color:#888}.segment-card{display:grid;grid-template-columns:32px 1fr auto auto auto;gap:10px;align-items:center;border:1px solid var(--line);border-radius:14px;padding:12px;margin-top:10px}.segment-index{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:var(--brand);color:#111;font-weight:800}.clone-form{display:grid;gap:12px}.path-row{display:flex;gap:10px}@media(max-width:980px){.audio-grid{grid-template-columns:1fr}.audio-actions{border-left:0;border-top:1px solid var(--line);padding:18px 0 0}.control-grid{grid-template-columns:1fr}}
</style>
