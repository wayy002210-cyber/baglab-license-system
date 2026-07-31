<script setup lang="ts">
import type { TextStyle } from "../../../shared/media-style";
import { subtitleStylePresets } from "../../../shared/media-style";
import FontPicker from "./FontPicker.vue";

const props = defineProps<{ modelValue: TextStyle; title?: string }>();
const emit = defineEmits<{ "update:modelValue": [value: TextStyle] }>();

function patch(value: Partial<TextStyle>): void {
  emit("update:modelValue", { ...props.modelValue, ...value });
}

function patchColor(
  key: "primaryColor" | "outlineColor" | "shadowColor",
  value: unknown
): void {
  if (typeof value === "string" && value.startsWith("#")) patch({ [key]: value });
}

function toggleOutline(enabled: boolean): void {
  patch({ outlineWidth: enabled ? Math.max(2, props.modelValue.outlineWidth) : 0 });
}

function toggleShadow(enabled: boolean): void {
  patch(enabled
    ? { shadowColor: "#40000000", shadowX: 2, shadowY: 2 }
    : { shadowColor: "#00000000", shadowX: 0, shadowY: 0 });
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
      <label>文字颜色<el-color-picker :model-value="modelValue.primaryColor" @update:model-value="patchColor('primaryColor',$event)" /></label>
      <label>描边（可选）<el-switch :model-value="modelValue.outlineWidth > 0" active-text="开启" inactive-text="关闭" @update:model-value="toggleOutline(Boolean($event))" /></label>
      <label v-if="modelValue.outlineWidth > 0">描边颜色<el-color-picker :model-value="modelValue.outlineColor" @update:model-value="patchColor('outlineColor',$event)" /></label>
      <label>描边宽度<el-input-number :model-value="modelValue.outlineWidth" :min="0" :max="20" @update:model-value="patch({ outlineWidth: Number($event) })" /></label>
      <label>阴影（可选）<el-switch :model-value="Boolean(modelValue.shadowX || modelValue.shadowY)" active-text="开启" inactive-text="关闭" @update:model-value="toggleShadow(Boolean($event))" /></label>
      <label v-if="modelValue.shadowX || modelValue.shadowY">阴影颜色<el-color-picker :model-value="modelValue.shadowColor" @update:model-value="patchColor('shadowColor',$event)" /></label>
      <label>垂直边距<el-input-number :model-value="modelValue.marginV" :min="0" :max="960" @update:model-value="patch({ marginV: Number($event) })" /></label>
      <label>横向位置 X<el-input-number :model-value="modelValue.positionX" :min="0" :max="1080" @update:model-value="patch({ positionX: Number($event) })" /></label>
      <label>纵向位置 Y<el-input-number :model-value="modelValue.positionY" :min="0" :max="1920" @update:model-value="patch({ positionY: Number($event) })" /></label>
    </div>
  </section>
</template>

<style scoped>
.style-editor{display:grid;gap:14px;padding-top:4px}.style-editor header,.inline,.presets{display:flex;align-items:center;justify-content:space-between;gap:10px}.style-editor header span{color:var(--muted);font-size:12px}.presets{justify-content:flex-start;flex-wrap:wrap}.style-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.style-grid label{display:grid;align-content:start;gap:7px;min-width:0;font-size:13px;color:var(--muted)}.style-grid :deep(.el-input-number){width:100%}.inline{justify-content:flex-start}
.font-control{grid-column:1/-1}
@media(max-width:520px){.style-grid{grid-template-columns:1fr}.font-control{grid-column:auto}}
</style>
