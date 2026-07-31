<script setup lang="ts">
import type { TextStyle } from "../../../shared/media-style";
defineProps<{ subtitleStyle: TextStyle; titleStyle: TextStyle; title?: string; subtitle?: string }>();
function css(style: TextStyle) {
  return {
    color: style.primaryColor,
    fontFamily: style.fontFamily,
    fontSize: `${Math.max(13, style.fontSize / 4.25)}px`,
    WebkitTextStroke: `${Math.max(0, style.outlineWidth / 3)}px ${style.outlineColor}`,
    textShadow:
      style.shadowX || style.shadowY
        ? `${style.shadowX / 3}px ${style.shadowY / 3}px 1px ${style.shadowColor}`
        : "none",
    left: `${style.positionX / 1080 * 100}%`,
    top: `${style.positionY / 1920 * 100}%`,
    transform: "translate(-50%, -50%)"
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
.phone-canvas{position:relative;width:252px;aspect-ratio:9/16;border:8px solid #111;border-radius:30px;background:linear-gradient(145deg,#363636,#171717);overflow:hidden;box-shadow:0 18px 36px rgba(0,0,0,.16)}.phone-canvas::before{content:"9:16 成片预览";position:absolute;inset:48% 0 auto;text-align:center;color:#777;font-size:12px}.title,.subtitle{position:absolute;z-index:1;width:calc(100% - 32px);text-align:center;font-weight:800;line-height:1.28;word-break:break-word}
</style>
