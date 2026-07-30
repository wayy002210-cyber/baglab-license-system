<script setup lang="ts">
import { computed, ref } from "vue";
import { voiceKindLabel } from "../../audio/voice-labels";

const props = defineProps<{
  voices: Array<{ voiceId: string; name: string; kind: string }>;
  modelValue: string;
  playingId: string | null;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: string];
  audition: [voiceId: string];
}>();
const query = ref("");
const filteredVoices = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  if (!keyword) return props.voices;
  return props.voices.filter(
    (voice) =>
      voice.name.toLowerCase().includes(keyword) ||
      voice.voiceId.toLowerCase().includes(keyword)
  );
});

function audition(voiceId: string): void {
  emit("update:modelValue", voiceId);
  emit("audition", voiceId);
}
</script>

<template>
  <section class="voice-library">
    <div class="section-heading">
      <div>
        <strong>选择你的声音</strong>
        <small>官方音色与已克隆音色；每次试听都从头播放</small>
      </div>
      <el-input v-model="query" clearable placeholder="搜索音色" />
    </div>
    <div class="voice-cards">
      <article
        v-for="voice in filteredVoices"
        :key="voice.voiceId"
        data-voice-card
        class="voice-card"
        :class="{
          selected: voice.voiceId === modelValue,
          playing: voice.voiceId === playingId
        }"
        @click="$emit('update:modelValue', voice.voiceId)"
      >
        <span class="wave">▥</span>
        <div>
          <small>{{ voiceKindLabel(voice.kind) }}</small>
          <strong>{{ voice.name }}</strong>
        </div>
        <button type="button" @click.stop="audition(voice.voiceId)">
          {{ voice.voiceId === playingId ? "停止试听" : "开始试听" }}
        </button>
      </article>
    </div>
    <p v-if="!filteredVoices.length" class="empty">没有匹配的音色</p>
  </section>
</template>

<style scoped>
.voice-library{display:grid;gap:16px}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:18px}.section-heading>div{display:grid;gap:4px}.section-heading small,.voice-card small,.empty{color:var(--text-muted)}.section-heading .el-input{width:260px}.voice-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}.voice-card{min-height:116px;padding:17px;display:grid;grid-template-columns:42px 1fr;gap:13px;border:1px solid var(--border);border-radius:18px;background:var(--surface);cursor:pointer;transition:.18s ease}.voice-card.selected{border:2px solid var(--brand-yellow);box-shadow:0 8px 24px rgba(21,21,18,.08)}.voice-card.playing{background:#171714;color:#fff}.voice-card>div{display:grid;align-content:center;gap:4px}.wave{width:42px;height:42px;display:grid;place-items:center;border-radius:13px;background:var(--brand-yellow);color:#111;font-size:20px}.voice-card button{grid-column:1/-1;height:34px;border:0;border-radius:10px;background:#f1f1ed;color:#111;cursor:pointer}.voice-card.playing button{background:var(--brand-yellow)}.empty{text-align:center;padding:20px}
</style>
