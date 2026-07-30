<script setup lang="ts">
import type { TextStyle } from "../../../shared/media-style";
import { subtitleStylePresets } from "../../../shared/media-style";
import FontPicker from "./FontPicker.vue";

const props = defineProps<{ modelValue: TextStyle; title?: string }>();
const emit = defineEmits<{ "update:modelValue": [value: TextStyle] }>();

function patch(value: Partial<TextStyle>): void {
  emit("update:modelValue", { ...props.modelValue, ...value });
}
</script>

<template>
  <section class="style-editor">
    <header><strong>{{ title ?? "字幕样式" }}</strong><span>所见即所得预览</span></header>
    <div class="presets">
      <span>预设</span>
      <el-button v-for="preset in subtitleStylePresets" :key="preset.name" size="small" @click="patch(preset.value)">
        {{ preset.name }}
      </el-button>
    </div>
    <div class="style-grid">
      <label class="font-control">字体
        <FontPicker
          :font-family="modelValue.fontFamily"
          :font-path="modelValue.fontPath"
          @change="patch($event)"
        />
      </label>
      <label>字号<el-input-number :model-value="modelValue.fontSize" :min="12" :max="240" @update:model-value="patch({ fontSize: Number($event) })" /></label>
      <label>文字颜色<el-color-picker :model-value="modelValue.primaryColor" @update:model-value="patch({ primaryColor: String($event) })" /></label>
      <label>描边颜色<el-color-picker :model-value="modelValue.outlineColor" @update:model-value="patch({ outlineColor: String($event) })" /></label>
      <label>描边宽度<el-input-number :model-value="modelValue.outlineWidth" :min="0" :max="20" @update:model-value="patch({ outlineWidth: Number($event) })" /></label>
      <label>阴影颜色<el-color-picker :model-value="modelValue.shadowColor" @update:model-value="patch({ shadowColor: String($event) })" /></label>
      <label>垂直边距<el-input-number :model-value="modelValue.marginV" :min="0" :max="960" @update:model-value="patch({ marginV: Number($event) })" /></label>
    </div>
  </section>
</template>

<style scoped>
.style-editor{display:grid;gap:14px}.style-editor header,.inline,.presets{display:flex;align-items:center;justify-content:space-between;gap:10px}.style-editor header span{color:var(--muted);font-size:12px}.presets{justify-content:flex-start;flex-wrap:wrap}.style-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.style-grid label{display:grid;gap:6px;font-size:13px;color:var(--muted)}.inline{justify-content:flex-start}
.font-control{grid-column:1/-1}
</style>
