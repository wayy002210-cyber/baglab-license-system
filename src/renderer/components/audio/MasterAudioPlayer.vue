<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import type { CreationDraft } from "../../../shared/contracts";

type Segment = CreationDraft["audioSegments"][number];
const props = defineProps<{ segments: Segment[] }>();
const playing = ref(false);
const activeIndex = ref(0);
const elapsed = ref(0);
let player: HTMLAudioElement | null = null;

const playable = computed(() =>
  props.segments.filter((segment) => segment.status === "ready" && segment.audioPath)
);
const totalDuration = computed(() =>
  playable.value.reduce((total, segment) => total + (segment.durationSec ?? 0), 0)
);
const percentage = computed(() =>
  totalDuration.value > 0 ? Math.min(100, Math.round(elapsed.value / totalDuration.value * 100)) : 0
);

function stop(reset = true): void {
  if (player) {
    player.pause();
    player.currentTime = 0;
    player = null;
  }
  playing.value = false;
  if (reset) {
    activeIndex.value = 0;
    elapsed.value = 0;
  }
}

async function playAt(index: number): Promise<void> {
  const segment = playable.value[index];
  if (!segment) return stop();
  activeIndex.value = index;
  player = new Audio(`autocut-media://voice/${segment.id}`);
  const previousDuration = playable.value
    .slice(0, index)
    .reduce((total, item) => total + (item.durationSec ?? 0), 0);
  player.addEventListener("timeupdate", () => {
    elapsed.value = previousDuration + (player?.currentTime ?? 0);
  });
  player.addEventListener("ended", () => void playAt(index + 1), { once: true });
  playing.value = true;
  await player.play();
}

async function toggle(): Promise<void> {
  if (playing.value) return stop(false);
  stop();
  await playAt(0);
}

function replay(): void {
  stop();
  void playAt(0);
}

onBeforeUnmount(() => stop());
</script>

<template>
  <div class="master-player" :class="{ disabled: !playable.length }">
    <button type="button" :disabled="!playable.length" @click="toggle">
      {{ playing ? "暂停" : "播放" }}
    </button>
    <div>
      <el-progress :percentage="percentage" :show-text="false" />
      <small>
        {{ playing ? `正在播放第 ${activeIndex + 1} 段` : playable.length ? "点击播放整篇配音" : "生成完成后可试听" }}
      </small>
    </div>
    <button type="button" :disabled="!playable.length" @click="replay">重新播放</button>
  </div>
</template>

<style scoped>
.master-player{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:14px}.master-player>div{display:grid;gap:5px}.master-player small{color:#b9b9af}.master-player button{height:36px;padding:0 15px;border:1px solid #555;border-radius:10px;background:#2b2b27;color:#fff}.master-player button:disabled{opacity:.45}
</style>
