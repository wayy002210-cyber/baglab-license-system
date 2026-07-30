<script setup lang="ts">
import { voiceKindLabel } from "../../audio/voice-labels";
defineProps<{
  voices: Array<{ voiceId: string; name: string; kind: string }>;
  modelValue: string;
}>();
defineEmits<{ "update:modelValue": [value: string]; audition: [] }>();
</script>

<template>
  <section class="voice-library">
    <div class="section-heading">
      <div><strong>选择音色</strong><small>系统音色与已克隆音色</small></div>
      <el-button @click="$emit('audition')">音色试听</el-button>
    </div>
    <el-select
      :model-value="modelValue"
      placeholder="请选择音色"
      @update:model-value="$emit('update:modelValue', $event)"
    >
      <el-option
        v-for="voice in voices"
        :key="voice.voiceId"
        :label="voice.name"
        :value="voice.voiceId"
      />
    </el-select>
    <div class="voice-chips">
      <button
        v-for="voice in voices"
        :key="voice.voiceId"
        type="button"
        :class="{ active: voice.voiceId === modelValue }"
        @click="$emit('update:modelValue', voice.voiceId)"
      >
        {{ voice.name }}
        <span>{{ voiceKindLabel(voice.kind) }}</span>
      </button>
    </div>
  </section>
</template>
