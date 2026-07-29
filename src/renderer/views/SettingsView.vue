<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { Key, Monitor, VideoCamera } from "@element-plus/icons-vue";
import PageIntro from "../components/PageIntro.vue";

type MediaSettings = Awaited<ReturnType<typeof window.autocut.getMediaSettings>>;
const credentialStatus = reactive({ bailian: false, minimax: false });
const secrets = reactive({ bailian: "", minimax: "" });
const savingCredential = ref<"bailian" | "minimax" | null>(null);
const savingMedia = ref(false);
const media = reactive<MediaSettings>({
  outputDirectory: "", workDirectory: "", encoder: "auto",
  videoBitrateMbps: 8, fontFamily: "Microsoft YaHei",
  bgmPath: null, bgmVolume: 0.16
});

async function load(): Promise<void> {
  Object.assign(credentialStatus, await window.autocut.credentialStatus());
  Object.assign(media, await window.autocut.getMediaSettings());
}
async function saveCredential(name: "bailian" | "minimax"): Promise<void> {
  if (!secrets[name].trim()) return void ElMessage.warning("请输入 API Key");
  savingCredential.value = name;
  try {
    await window.autocut.setCredential(name, secrets[name]);
    secrets[name] = ""; await load();
    ElMessage.success("凭据已安全保存到 Windows Credential Manager");
  } finally { savingCredential.value = null; }
}
async function clearCredential(name: "bailian" | "minimax"): Promise<void> {
  await window.autocut.deleteCredential(name); await load();
  ElMessage.success("凭据已清除");
}
async function selectPath(kind: "output" | "work" | "bgm"): Promise<void> {
  const path = await window.autocut.selectSettingsPath(kind);
  if (!path) return;
  if (kind === "output") media.outputDirectory = path;
  else if (kind === "work") media.workDirectory = path;
  else media.bgmPath = path;
}
async function saveMedia(): Promise<void> {
  savingMedia.value = true;
  try {
    Object.assign(media, await window.autocut.saveMediaSettings({ ...media }));
    ElMessage.success("媒体设置已保存");
  } finally { savingMedia.value = false; }
}
async function exportDiagnostics(): Promise<void> {
  const path = await window.autocut.exportDiagnostics();
  if (path) ElMessage.success(`诊断包已导出：${path}`);
}
onMounted(load);
</script>

<template>
  <div class="page">
    <PageIntro title="系统设置" description="配置媒体输出、AI 服务和脱敏诊断" />
    <section class="settings-grid">
      <article class="surface settings-card">
        <header><div class="settings-icon"><el-icon><Key /></el-icon></div><div><h3>AI 服务凭据</h3><p>密钥仅保存在 Windows 凭据库</p></div></header>
        <div v-for="name in (['bailian','minimax'] as const)" :key="name" class="credential">
          <div class="credential-title">
            <strong>{{ name === "bailian" ? "阿里云百炼" : "MiniMax" }}</strong>
            <el-tag :type="credentialStatus[name] ? 'success' : 'info'">{{ credentialStatus[name] ? "已配置" : "未配置" }}</el-tag>
          </div>
          <el-input v-model="secrets[name]" type="password" show-password placeholder="输入 API Key">
            <template #append><el-button :loading="savingCredential === name" @click="saveCredential(name)">保存</el-button></template>
          </el-input>
          <el-button v-if="credentialStatus[name]" link type="danger" @click="clearCredential(name)">清除凭据</el-button>
        </div>
      </article>

      <article class="surface settings-card media-card">
        <header><div class="settings-icon"><el-icon><VideoCamera /></el-icon></div><div><h3>成片与媒体</h3><p>1080×1920 / 30fps / H.264 + AAC</p></div></header>
        <el-form label-position="top">
          <el-form-item label="成片目录"><el-input v-model="media.outputDirectory"><template #append><el-button @click="selectPath('output')">选择</el-button></template></el-input></el-form-item>
          <el-form-item label="工作目录"><el-input v-model="media.workDirectory"><template #append><el-button @click="selectPath('work')">选择</el-button></template></el-input></el-form-item>
          <div class="form-row">
            <el-form-item label="编码器"><el-select v-model="media.encoder"><el-option label="自动检测" value="auto" /><el-option label="NVIDIA NVENC" value="h264_nvenc" /><el-option label="Intel QSV" value="h264_qsv" /><el-option label="AMD AMF" value="h264_amf" /><el-option label="CPU libx264" value="libx264" /></el-select></el-form-item>
            <el-form-item label="码率 Mbps"><el-input-number v-model="media.videoBitrateMbps" :min="1" :max="50" /></el-form-item>
          </div>
          <el-form-item label="字幕字体"><el-input v-model="media.fontFamily" /></el-form-item>
          <el-form-item label="背景音乐"><el-input :model-value="media.bgmPath || ''" readonly><template #append><el-button @click="selectPath('bgm')">选择</el-button></template></el-input></el-form-item>
          <el-form-item label="BGM 音量"><el-slider v-model="media.bgmVolume" :min="0" :max="1" :step="0.01" /></el-form-item>
          <el-button type="primary" :loading="savingMedia" @click="saveMedia">保存媒体设置</el-button>
        </el-form>
      </article>

      <article class="surface settings-card">
        <header><div class="settings-icon"><el-icon><Monitor /></el-icon></div><div><h3>故障诊断</h3><p>不包含密钥、Cookie 或任务快照</p></div></header>
        <el-button type="primary" plain @click="exportDiagnostics">导出脱敏诊断包</el-button>
      </article>
    </section>
  </div>
</template>

<style scoped>
.settings-grid{display:grid;grid-template-columns:1fr 1.4fr;gap:18px;align-items:start}.settings-card{padding:24px}.media-card{grid-row:span 2}header{display:flex;gap:13px;align-items:center;margin-bottom:22px}.settings-icon{width:42px;height:42px;display:grid;place-items:center;border-radius:12px;color:#5b8def;background:#eaf1ff;font-size:20px}header h3,header p{margin:0}header p{margin-top:4px;color:#8995a7;font-size:12px}.credential{margin-top:16px;padding:16px;border:1px solid #e7ebf2;border-radius:15px;background:#fafbfd}.credential-title{display:flex;justify-content:space-between;margin-bottom:12px}.form-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}.el-select{width:100%}@media(max-width:1050px){.settings-grid{grid-template-columns:1fr}.media-card{grid-row:auto}}
</style>
