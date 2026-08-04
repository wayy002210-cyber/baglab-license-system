<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { ElMessage } from "element-plus";

const props = defineProps<{ fontFamily: string; fontPath: string | null; sampleText?: string }>();
const emit = defineEmits<{ change: [font: { fontFamily: string; fontPath: string | null }] }>();
const fonts = ref<Awaited<ReturnType<typeof window.autocut.listSystemFonts>>>([]);
const loading = ref(false);
const previewUnavailable = ref(false);
const loadedFontPaths = new Set<string>();
const selected = computed({
  get: () => props.fontPath ?? `family:${props.fontFamily}`,
  set: (value: string) => {
    const font = fonts.value.find((item) => item.path === value);
    if (font) emit("change", { fontFamily: font.family, fontPath: font.path });
  }
});
async function load() {
  loading.value = true;
  try {
    fonts.value = await window.autocut.listSystemFonts();
    await loadPreviewFont(props.fontFamily, props.fontPath);
  }
  catch { ElMessage.warning("无法读取本机字体库，将继续使用当前字体"); }
  finally { loading.value = false; }
}
async function loadPreviewFont(family: string, path: string | null) {
  previewUnavailable.value = false;
  if (!path || loadedFontPaths.has(path)) return;
  try {
    const source = `url("autocut-media://font?path=${encodeURIComponent(path)}")`;
    const face = await new FontFace(family, source).load();
    document.fonts.add(face);
    loadedFontPaths.add(path);
  } catch {
    previewUnavailable.value = true;
  }
}
async function choose() {
  const font = await window.autocut.selectAndProbeFont();
  if (font) emit("change", { fontFamily: font.family, fontPath: font.path });
}
onMounted(load);
watch(() => [props.fontFamily, props.fontPath] as const, ([family, path]) => {
  void loadPreviewFont(family, path);
});
</script>
<template>
  <div class="font-picker">
    <div class="row">
      <el-select v-model="selected" filterable :loading="loading" placeholder="搜索本机已安装字体">
        <el-option :label="fontFamily" :value="`family:${fontFamily}`" />
        <el-option v-for="font in fonts" :key="font.id" :label="`${font.displayName} · ${font.extension.toUpperCase()}`" :value="font.path">
          <span :style="{ fontFamily: font.family }">{{ font.displayName }}</span>
        </el-option>
      </el-select>
      <el-button @click="choose">选择本地字体文件</el-button>
    </div>
    <div class="preview" :style="{ fontFamily }">{{ sampleText || "袋研官矩阵混剪 · 字体效果预览 123" }}</div>
    <small v-if="previewUnavailable">该旧式字体可用于成片，但浏览器预览引擎无法显示，请以导出效果为准</small>
    <small v-else>已扫描系统字体与当前用户字体，支持 TTF / OTF / TTC / OTC / FON / FNT</small>
  </div>
</template>
<style scoped>
.font-picker{display:grid;gap:9px}.row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}.preview{min-height:54px;display:grid;place-items:center;padding:10px;border:1px solid var(--border);border-radius:10px;background:#f7f7f5;color:#111;font-size:20px;text-align:center}.font-picker small{color:var(--text-muted)}
</style>
