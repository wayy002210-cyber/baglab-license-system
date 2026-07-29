<script setup lang="ts">
import type { TextStyle } from "../../../shared/media-style";
import SubtitleStyleEditor from "./SubtitleStyleEditor.vue";
defineProps<{ modelValue: TextStyle }>();
defineEmits<{ "update:modelValue": [value: TextStyle] }>();
</script>
<template>
  <SubtitleStyleEditor title="顶部标题样式" :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" />
</template>
