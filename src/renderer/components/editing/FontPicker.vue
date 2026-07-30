<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";

const props = defineProps<{
  fontFamily: string;
  fontPath: string | null;
  sampleText?: string;
}>();
const emit = defineEmits<{
  change: [font: { fontFamily: string; fontPath: string | null }];
}>();

const fonts = ref<Awaited<ReturnType<typeof window.autocut.listSystemFonts>>>([]);
const loading = ref(false);
const selectedPath = computed({
  get: () => props.fontPath ?? `family:${props.fontFamily}`,
  set: (value: string) => {
    const font = fonts.value.find((item) => item.path === value);
    if (font) emit("change", { fontFamily: font.family, fontPath: font.path });
  }
});

async function loadFonts(): Promise<void> {
  loading.value = true;
  try {
    fonts.value = await window.autocut.listSystemFonts();
  } catch {
    ElMessage.warning("无法读取本机字体库，已继续使用当前字体");
  } finally {
    loading.value = false;
  }
}

async function chooseFile(): Promise<void> {
  const font = await window.autocut.selectAndProbeFont();
  if (font) emit("change", { fontFamily: font.family, fontPath: font.path });
}

onMounted(loadFonts);
</script>

<template>
  <div class="font-picker">
    <div class="font-row">
      <el-select
        v-model="selectedPath"
        filterable
        :loading="loading"
        placeholder="搜索本机已安装字体"
      >
        <el-option
          :label="fontFamily"
          :value="`family:${fontFamily}`"
        />
        <el-option
          v-for="font in fonts"
          :key="font.id"
          :label="font.displayName"
          :value="font.path"
        >
          <span :style="{ fontFamily: font.family }">{{ font.displayName }}</span>
        </el-option>
      </el-select>
      <el-button @click="chooseFile">选择本地字体文件</el-button>
    </div>
    <div class="font-preview" :style="{ fontFamily }">
      {{ sampleText || "袋研官矩阵混剪 · 字体效果预览 123" }}
    </div>
  </div>
</template>

<style scoped>
.font-picker {
  display: grid;
  gap: 10px;
}
.font-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}
.font-preview {
  min-height: 54px;
  display: grid;
  place-items: center;
  padding: 10px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: #111;
  background: #f7f7f5;
  font-size: 20px;
  text-align: center;
}
</style>
