<script setup lang="ts">
import { computed } from "vue";
import previewBackground from "../../assets/subtitle-preview-background.jpg";
import type { TextStyle } from "../../../shared/media-style";
import { wrapSubtitlePreview } from "../../../shared/subtitle-layout";

const props = withDefaults(defineProps<{
  subtitleStyle: TextStyle;
  titleStyle: TextStyle;
  title?: string;
  subtitle?: string;
  showBackground?: boolean;
}>(), { showBackground: true });

const previewSubtitle = computed(() => wrapSubtitlePreview(
  props.subtitle || "这里预览口播字幕效果",
  {
    fontSize: props.subtitleStyle.fontSize,
    scale: props.subtitleStyle.scale,
    letterSpacing: props.subtitleStyle.letterSpacing,
    outlineWidth: props.subtitleStyle.outlineWidth
  }
).join("\n"));

function css(style: TextStyle) {
  const cssColor = (value: string) => /^#[0-9a-f]{8}$/i.test(value)
    ? `#${value.slice(3)}${value.slice(1, 3)}`
    : value;
  const outline = Math.max(0, style.outlineWidth / 3);
  const edges = outline > 0
    ? [[-1,0],[1,0],[0,-1],[0,1],[-.7,-.7],[.7,-.7],[-.7,.7],[.7,.7]]
      .map(([x,y]) => `${x! * outline}px ${y! * outline}px 0 ${cssColor(style.outlineColor)}`)
    : [];
  const shadow = style.shadowX || style.shadowY
    ? [`${style.shadowX / 3}px ${style.shadowY / 3}px ${style.shadowBlur / 3}px ${cssColor(style.shadowColor)}`]
    : [];
  return {
    color: cssColor(style.primaryColor),
    fontFamily: style.fontFamily,
    fontSize: `${Math.max(13, style.fontSize / 4.25)}px`,
    fontWeight: style.bold ? "800" : "400",
    fontStyle: style.italic ? "italic" : "normal",
    textDecoration: style.underline ? "underline" : "none",
    letterSpacing: `${style.letterSpacing / 4}px`,
    lineHeight: `${1.25 + style.lineSpacing / 100}`,
    opacity: style.opacity / 100,
    textShadow: [...edges, ...shadow].join(",") || "none",
    left: `${style.positionX / 1080 * 100}%`,
    top: `${style.positionY / 1920 * 100}%`,
    transform: `translate(-50%, -50%) scale(${style.scale / 100})`
  };
}
</script>
<template>
  <div class="phone-canvas" :class="{ plain: !showBackground }" :style="showBackground ? { backgroundImage: `url(${previewBackground})` } : undefined">
    <div class="title" :style="css(titleStyle)">{{ title || "袋研官矩阵混剪" }}</div>
    <div class="subtitle" :style="css(subtitleStyle)">{{ previewSubtitle }}</div>
  </div>
</template>
<style scoped>
.phone-canvas{position:relative;width:300px;aspect-ratio:9/16;border:8px solid #111;border-radius:30px;background-position:center;background-size:cover;overflow:hidden;box-shadow:0 18px 36px rgba(0,0,0,.16)}
.phone-canvas::after{content:"";position:absolute;inset:0;background:rgba(0,0,0,.08)}
.phone-canvas.plain{background:linear-gradient(145deg,#363636,#171717)}
.title,.subtitle{position:absolute;z-index:1;width:calc(100% - 32px);text-align:center;white-space:pre-line;overflow-wrap:anywhere}
</style>
