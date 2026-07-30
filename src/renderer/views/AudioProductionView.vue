<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import PageIntro from "../components/PageIntro.vue";
import VoiceLibrary from "../components/audio/VoiceLibrary.vue";
import VoiceCloneDialog from "../components/audio/VoiceCloneDialog.vue";
import MasterAudioPlayer from "../components/audio/MasterAudioPlayer.vue";
import { useCreationDraft } from "../composables/useCreationDraft";
import {
  buildMasterAudioSegment,
  masterAudioParameterHash
} from "../audio/master-audio";
import {
  emotionOptions,
  selectPreferredVoices,
  voiceDisplayName
} from "../audio/voice-labels";

const router = useRouter();
const state = useCreationDraft();
const voices = ref<Array<{ voiceId: string; name: string; kind: string }>>([]);
const capabilities = ref<Awaited<
  ReturnType<typeof window.autocut.getVoiceCapabilities>
> | null>(null);
const model = ref("speech-2.8-hd");
const showClone = ref(false);
const generating = ref(false);
const generationError = ref("");
const playingVoiceId = ref<string | null>(null);
let auditionPlayer: HTMLAudioElement | null = null;

const voice = computed(() => state.draft.value.voice);
const masterAudio = computed(() => state.draft.value.audioSegments[0] ?? null);
const ready = computed(
  () =>
    state.draft.value.audioSegments.length === 1 &&
    masterAudio.value?.status === "ready" &&
    Boolean(masterAudio.value.audioPath) &&
    Boolean(masterAudio.value.durationSec)
);
const generationPercentage = computed(() =>
  generating.value ? 55 : ready.value ? 100 : generationError.value ? 0 : 0
);

function syncMasterAudio(): void {
  if (!voice.value) return;
  const text = state.draft.value.copywriting?.text.trim() ?? "";
  if (!text) {
    state.draft.value.audioSegments = [];
    return;
  }
  const expected = buildMasterAudioSegment(text, voice.value, model.value);
  const current = state.draft.value.audioSegments;
  if (
    current.length === 1 &&
    current[0].textHash === expected.textHash &&
    current[0].parameterHash === expected.parameterHash
  ) {
    return;
  }
  state.draft.value.audioSegments = [expected];
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
    ElMessage.warning(
      "在线音色列表暂时不可用，已保留默认音色和声音克隆功能"
    );
  }
  voices.value = selectPreferredVoices(loadedVoices).map((item) => ({
    ...item,
    name: voiceDisplayName(item)
  }));
  capabilities.value = loadedCapabilities;
  model.value = loadedCapabilities.models[0] ?? model.value;
  if (!state.draft.value.voice) {
    state.draft.value.voice = {
      voiceId: voices.value[0]?.voiceId ?? "",
      source: "system",
      emotion: "calm",
      speed: 1,
      volume: 1,
      pitch: 0,
      languageBoost: "Chinese"
    };
  }
  syncMasterAudio();
}

async function generateMasterAudio(): Promise<void> {
  if (!voice.value?.voiceId) {
    ElMessage.warning("请先选择音色");
    return;
  }
  const text = state.draft.value.copywriting?.text.trim() ?? "";
  if (!text) {
    ElMessage.warning("没有可配音的完整文案，请先完成文案");
    return;
  }
  const segment = buildMasterAudioSegment(text, voice.value, model.value);
  segment.status = "generating";
  state.draft.value.audioSegments = [segment];
  generating.value = true;
  generationError.value = "";
  try {
    const result = await window.autocut.synthesizeVoice({
      text,
      voiceId: voice.value.voiceId,
      model: model.value,
      emotion: voice.value.emotion,
      speed: voice.value.speed,
      volume: voice.value.volume,
      pitch: voice.value.pitch,
      languageBoost: voice.value.languageBoost
    });
    segment.audioPath = result.audioPath;
    segment.durationSec = result.durationSec;
    segment.parameterHash = masterAudioParameterHash(voice.value, model.value);
    segment.status = "ready";
    segment.errorMessage = null;
    await state.saveImmediate();
    ElMessage.success("整篇配音生成成功，可以试听确认");
  } catch (error) {
    segment.status = "failed";
    segment.errorMessage =
      error instanceof Error ? error.message : "整篇配音生成失败";
    generationError.value = segment.errorMessage;
    await state.saveImmediate().catch(() => undefined);
    ElMessage.error(
      `配音生成失败：${segment.errorMessage}。请检查 MiniMax 密钥、余额和网络后重试`
    );
  } finally {
    generating.value = false;
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
    const previewUrl = await window.autocut.previewVoice({
      text: "你好，我是袋研官，这是当前音色的试听效果。",
      voiceId,
      model: model.value,
      emotion: voice.value.emotion,
      speed: voice.value.speed,
      volume: voice.value.volume,
      pitch: voice.value.pitch
    });
    auditionPlayer = new Audio(previewUrl);
    auditionPlayer.addEventListener(
      "ended",
      () => {
        playingVoiceId.value = null;
        auditionPlayer = null;
      },
      { once: true }
    );
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
    syncMasterAudio();
  }
}

function invalidateAudio(): void {
  syncMasterAudio();
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
    <PageIntro
      title="音频制作"
      description="选择或克隆音色，对完整脚本一次性生成一条连续口播音频。"
    />
    <section v-if="voice" class="audio-grid surface">
      <header class="master-workbench">
        <div>
          <small>整篇配音</small>
          <strong>
            {{
              ready
                ? "整篇配音已经生成，可以试听确认"
                : generating
                  ? "正在生成整篇配音，请勿关闭软件"
                  : "确认参数后生成整篇配音"
            }}
          </strong>
          <p>
            {{
              masterAudio?.durationSec
                ? `音频时长 ${masterAudio.durationSec.toFixed(1)} 秒`
                : "全文只生成一次，不再逐段调用"
            }}
          </p>
        </div>
        <MasterAudioPlayer :segments="state.draft.value.audioSegments" />
        <el-button
          data-action="generate-master-audio"
          type="primary"
          :loading="generating"
          @click="generateMasterAudio"
        >
          {{ ready ? "重新生成整篇配音" : "确认并生成整篇配音" }}
        </el-button>
        <el-progress
          class="generation-progress"
          :percentage="generationPercentage"
          :status="generationError ? 'exception' : ready ? 'success' : undefined"
        />
      </header>

      <div class="audio-main">
        <VoiceLibrary
          v-model="voice.voiceId"
          :voices="voices"
          :playing-id="playingVoiceId"
          @update:model-value="invalidateAudio"
          @audition="audition"
        />
        <div class="audio-toolbar">
          <div>
            <strong>声音克隆</strong>
            <p>上传自己的声音样本，训练专属音色并加入上方音色卡片。</p>
          </div>
          <el-button type="primary" @click="showClone = true">
            上传声音样本并进行声音克隆
          </el-button>
        </div>
        <div class="control-grid">
          <label>
            情感
            <el-select v-model="voice.emotion" @change="invalidateAudio">
              <el-option
                v-for="item in emotionOptions.filter((option) =>
                  capabilities?.emotions.includes(option.value)
                )"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </label>
          <label>
            语速 {{ voice.speed.toFixed(1) }}x
            <el-slider
              v-model="voice.speed"
              :min="0.5"
              :max="2"
              :step="0.1"
              @change="invalidateAudio"
            />
          </label>
          <label>
            音调 {{ voice.pitch }}
            <el-slider
              v-model="voice.pitch"
              :min="-12"
              :max="12"
              :step="1"
              @change="invalidateAudio"
            />
          </label>
        </div>
        <p v-if="generationError" class="generation-error">
          {{ generationError }}。请检查 MiniMax 密钥、账户余额和网络后重试。
        </p>
      </div>

      <aside class="audio-actions">
        <h3>声音工作台</h3>
        <el-button class="wide" @click="showClone = true">
          上传声音样本
        </el-button>
        <el-button
          class="wide"
          type="primary"
          :loading="generating"
          @click="generateMasterAudio"
        >
          生成整篇配音
        </el-button>
        <p>{{ ready ? "整篇音频已就绪" : "等待生成整篇音频" }}</p>
        <el-button
          class="wide next"
          type="primary"
          :disabled="!ready"
          @click="next"
        >
          进入镜头剪辑
        </el-button>
      </aside>
    </section>
    <VoiceCloneDialog
      v-model="showClone"
      :default-model="model"
      @completed="addClone"
    />
  </div>
</template>

<style scoped>
.audio-grid{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:24px;padding:28px}.master-workbench{grid-column:1/-1;display:grid;grid-template-columns:minmax(260px,1fr) minmax(240px,420px) auto;align-items:center;gap:22px;padding:20px;border-radius:18px;background:#171714;color:#fff}.master-workbench>div{display:grid;gap:5px}.master-workbench small,.master-workbench p{color:#b9b9af}.master-workbench p{margin:0}.generation-progress{grid-column:1/-1}.audio-main{display:grid;gap:22px}.audio-actions{border-left:1px solid var(--line);padding-left:22px}.wide{width:100%;margin:0 0 12px}.next{margin-top:28px}.control-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.control-grid label{display:grid;gap:8px;color:var(--muted)}.audio-toolbar{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:18px;border-radius:16px;background:#fff8bf}.audio-toolbar p{margin:4px 0 0;color:var(--muted);font-size:13px}.generation-error{padding:10px 12px;border-radius:10px;color:#b42318;background:#fff0ef}@media(max-width:980px){.audio-grid{grid-template-columns:1fr}.master-workbench{grid-template-columns:1fr}.audio-actions{border-left:0;border-top:1px solid var(--line);padding:18px 0 0}.control-grid{grid-template-columns:1fr}.audio-toolbar{align-items:stretch;flex-direction:column}}
</style>
