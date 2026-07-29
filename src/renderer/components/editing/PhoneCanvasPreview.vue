<script setup lang="ts">
import type { TextStyle } from "../../../shared/media-style";
defineProps<{ subtitleStyle: TextStyle; titleStyle: TextStyle; title?: string; subtitle?: string }>();
function css(style: TextStyle) {
  return {
    color: style.primaryColor,
    fontFamily: style.fontFamily,
    fontSize: `${Math.max(12, style.fontSize / 4)}px`,
    WebkitTextStroke: `${Math.max(0, style.outlineWidth / 4)}px ${style.outlineColor}`,
    textShadow: `${style.shadowX / 4}px ${style.shadowY / 4}px ${style.shadowColor}`
  };
}
</script>
<template>
  <div class="phone-canvas">
    <div class="title" :style="css(titleStyle)">{{ title || "袋研官矩阵混剪" }}</div>
    <div class="subtitle" :style="css(subtitleStyle)">{{ subtitle || "这里预览口播字幕效果" }}</div>
  </div>
</template>
<style scoped>
.phone-canvas{position:relative;width:216px;aspect-ratio:9/16;border:8px solid #111;border-radius:28px;background:linear-gradient(145deg,#333,#111);overflow:hidden}.title,.subtitle{position:absolute;left:10px;right:10px;text-align:center;font-weight:800}.title{top:10%}.subtitle{bottom:9%}
</style>
