<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import PageIntro from "../components/PageIntro.vue";
import VoiceLibrary from "../components/audio/VoiceLibrary.vue";
import VoiceCloneDialog from "../components/audio/VoiceCloneDialog.vue";
import AudioSegmentList from "../components/audio/AudioSegmentList.vue";
import MasterAudioPlayer from "../components/audio/MasterAudioPlayer.vue";
import { useCreationDraft } from "../composables/useCreationDraft";
import { segmentCopywriting, stableHash } from "../audio/segment-copywriting";
import {
  emotionOptions,
  voiceDisplayName
} from "../audio/voice-labels";
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
const playingVoiceId = ref<string | null>(null);
let auditionPlayer: HTMLAudioElement | null = null;
const totalGenerating = ref(false);
const totalError = ref("");

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
  const [, loadedCapabilities] = await Promise.all([
    state.load(),
    window.autocut.getVoiceCapabilities()
  ]);
  let loadedVoices: Array<{ voiceId: string; name: string; kind: string }> = [];
  try {
    loadedVoices = await window.autocut.listVoices();
  } catch {
    loadedVoices = [
      {
        voiceId: state.draft.value.voice?.voiceId || "male-qn-qingse",
        name: state.draft.value.voice?.voiceId
          ? `已选音色 · ${state.draft.value.voice.voiceId}`
          : "青涩男声（默认）",
        kind: state.draft.value.voice?.source || "system"
      }
    ];
    ElMessage.warning("在线音色列表暂时不可用，已保留默认音色和声音克隆功能");
  }
  voices.value = loadedVoices.map((item) => ({
    ...item,
    name: voiceDisplayName(item)
  }));
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
  totalGenerating.value = true;
  totalError.value = "";
  try {
    rebuildSegments();
    for (const segment of state.draft.value.audioSegments) {
      if (segment.status !== "ready") await generate(segment);
    }
    const failed = state.draft.value.audioSegments.filter(
      (segment) => segment.status === "failed"
    );
    if (failed.length) {
      totalError.value = `${failed.length} 段配音生成失败`;
      ElMessage.error("整篇配音未完成，请检查失败段落后重试");
    } else {
      await state.saveImmediate();
      ElMessage.success("整篇配音生成成功，可以播放试听");
    }
  } catch (error) {
    totalError.value =
      error instanceof Error ? error.message : "批量配音生成失败";
  } finally {
    totalGenerating.value = false;
  }
}

async function audition(voiceId: string): Promise<void> {
  if (!voice.value) return;
  if (auditionPlayer) {
    auditionPlayer.pause();
    auditionPlayer.currentTime = 0;
    auditionPlayer = null;
  }
  if (playingVoiceId.value === voiceId) {
    playingVoiceId.value = null;
    return;
  }
  voice.value.voiceId = voiceId;
  playingVoiceId.value = voiceId;
  try {
    previewUrl.value = await window.autocut.previewVoice({
      text: "你好，我是袋研官，这是当前音色的试听效果。",
      voiceId: voice.value.voiceId,
      model: model.value,
      emotion: voice.value.emotion,
      speed: voice.value.speed,
      volume: voice.value.volume,
      pitch: voice.value.pitch
    });
    auditionPlayer = new Audio(previewUrl.value);
    auditionPlayer.addEventListener("ended", () => {
      playingVoiceId.value = null;
      auditionPlayer = null;
    }, { once: true });
    await auditionPlayer.play();
  } catch (error) {
    playingVoiceId.value = null;
    auditionPlayer = null;
    ElMessage.error(
      error instanceof Error ? error.message : "当前音色试听失败"
    );
  }
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
      <header class="master-workbench">
        <div>
          <small>整篇配音</small>
          <strong>{{ ready ? "整篇配音已经生成，可以试听确认" : "确认参数后生成整篇配音" }}</strong>
          <p>{{ state.draft.value.audioSegments.filter(item => item.status === "ready").length }} / {{ state.draft.value.audioSegments.length }} 段已完成</p>
        </div>
        <MasterAudioPlayer :segments="state.draft.value.audioSegments" />
        <el-button type="primary" :loading="totalGenerating" @click="generateAll">
          {{ ready ? "重新生成整篇配音" : "确认并生成整篇配音" }}
        </el-button>
      </header>
      <div class="audio-main">
        <VoiceLibrary
          v-model="voice.voiceId"
          :voices="voices"
          :playing-id="playingVoiceId"
          @audition="audition"
        />
        <div class="audio-toolbar">
          <div>
            <strong>声音与情感设置</strong>
            <p>上传自己的声音样本，或选择官方音色完成整篇配音。</p>
          </div>
          <el-button type="primary" @click="showClone = true">
            上传声音样本并进行声音克隆
          </el-button>
        </div>
        <div class="control-grid">
          <label>情感<el-select v-model="voice.emotion"><el-option v-for="item in emotionOptions.filter(option => capabilities?.emotions.includes(option.value))" :key="item.value" :label="item.label" :value="item.value" /></el-select></label>
          <label>语速 {{ voice.speed.toFixed(1) }}x<el-slider v-model="voice.speed" :min="0.5" :max="2" :step="0.1" /></label>
          <label>音调 {{ voice.pitch }}<el-slider v-model="voice.pitch" :min="-12" :max="12" :step="1" /></label>
        </div>
        <AudioSegmentList :segments="state.draft.value.audioSegments" :generating-id="generatingId" @generate="generate" />
      </div>
      <aside class="audio-actions">
        <h3>声音工作台</h3>
        <el-button class="wide" @click="showClone = true">上传声音样本</el-button>
        <el-button class="wide" type="primary" :loading="totalGenerating" @click="generateAll">逐段生成全部配音</el-button>
        <el-progress
          :percentage="state.draft.value.audioSegments.length ? Math.round(state.draft.value.audioSegments.filter(item => item.status === 'ready').length / state.draft.value.audioSegments.length * 100) : 0"
          :status="totalError ? 'exception' : ready ? 'success' : undefined"
        />
        <p v-if="totalError" class="generation-error">
          {{ totalError }}，请检查 MiniMax 密钥、网络或当前音色后重试。
        </p>
        <p>{{ state.draft.value.audioSegments.filter(item => item.status === "ready").length }} / {{ state.draft.value.audioSegments.length }} 段已完成</p>
        <el-button class="wide next" type="primary" :disabled="!ready" @click="next">进入镜头剪辑</el-button>
      </aside>
    </section>
    <VoiceCloneDialog v-model="showClone" :default-model="model" @completed="addClone" />
  </div>
</template>

<style scoped>
.audio-grid{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:24px;padding:28px}.master-workbench{grid-column:1/-1;display:grid;grid-template-columns:minmax(260px,1fr) minmax(240px,420px) auto;align-items:center;gap:22px;padding:20px;border-radius:18px;background:#171714;color:#fff}.master-workbench>div{display:grid;gap:5px}.master-workbench small,.master-workbench p{color:#b9b9af}.master-workbench p{margin:0}.audio-main{display:grid;gap:22px}.audio-actions{border-left:1px solid var(--line);padding-left:22px}.wide{width:100%;margin:0 0 12px}.next{margin-top:28px}.control-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.control-grid label{display:grid;gap:8px;color:var(--muted)}.audio-toolbar{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:18px;border-radius:16px;background:#fff8bf}.audio-toolbar p{margin:4px 0 0;color:var(--muted);font-size:13px}.generation-error{padding:10px 12px;border-radius:10px;color:#b42318;background:#fff0ef}.section-heading{display:flex;justify-content:space-between}.section-heading div{display:grid;gap:4px}.section-heading small{color:var(--muted)}.segment-card{display:grid;grid-template-columns:32px 1fr auto auto auto;gap:10px;align-items:center;border:1px solid var(--line);border-radius:14px;padding:12px;margin-top:10px}.segment-index{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:var(--brand);color:#111;font-weight:800}.clone-form{display:grid;gap:12px}.path-row{display:flex;gap:10px}@media(max-width:980px){.audio-grid{grid-template-columns:1fr}.master-workbench{grid-template-columns:1fr}.audio-actions{border-left:0;border-top:1px solid var(--line);padding:18px 0 0}.control-grid{grid-template-columns:1fr}.audio-toolbar{align-items:stretch;flex-direction:column}}
</style>
