<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { Key, Monitor, Reading, VideoCamera } from "@element-plus/icons-vue";
import PageIntro from "../components/PageIntro.vue";
import ReferenceScriptsPanel from "../components/copywriting/ReferenceScriptsPanel.vue";

type MediaSettings = Awaited<ReturnType<typeof window.autocut.getMediaSettings>>;
const credentialStatus = reactive({ bailian: false, minimax: false });
const secrets = reactive({ bailian: "", minimax: "" });
const savingCredential = ref<"bailian" | "minimax" | null>(null);
const savingMedia = ref(false);
const savingCopyModel = ref(false);
const testingBailian = ref(false);
const bailianHealth = ref<"unknown" | "connected" | "failed">("unknown");
const referenceScripts = ref<
  Awaited<ReturnType<typeof window.autocut.listReferenceScripts>>
>([]);
const copyModel = reactive({
  defaultModel: "deepseek-v3",
  temperature: 0.7,
  candidateModels: ["deepseek-v3", "qwen-plus"]
});
const media = reactive<MediaSettings>({
  outputDirectory: "", workDirectory: "", encoder: "auto",
  videoBitrateMbps: 8, fontFamily: "Microsoft YaHei",
  bgmPath: null, bgmVolume: 0.16
});

async function load(): Promise<void> {
  const [credentials, mediaSettings, copySettings, scripts] = await Promise.all([
    window.autocut.credentialStatus(),
    window.autocut.getMediaSettings(),
    window.autocut.getCopyModelSettings(),
    window.autocut.listReferenceScripts()
  ]);
  Object.assign(credentialStatus, credentials);
  Object.assign(media, mediaSettings);
  Object.assign(copyModel, copySettings);
  referenceScripts.value = scripts;
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
async function testBailian(): Promise<void> {
  testingBailian.value = true;
  try {
    await window.autocut.testBailianConnection(copyModel.defaultModel);
    bailianHealth.value = "connected";
    ElMessage.success(`百炼连接正常，模型 ${copyModel.defaultModel} 可调用`);
  } catch (error) {
    bailianHealth.value = "failed";
    ElMessage.error(error instanceof Error ? error.message : "百炼连接测试失败");
  } finally {
    testingBailian.value = false;
  }
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
async function saveCopyModel(): Promise<void> {
  savingCopyModel.value = true;
  try {
    Object.assign(
      copyModel,
      await window.autocut.saveCopyModelSettings({
        ...copyModel,
        candidateModels: [...copyModel.candidateModels]
      })
    );
    ElMessage.success("文案模型设置已保存");
  } finally {
    savingCopyModel.value = false;
  }
}
async function createReferenceScript(
  input: Parameters<typeof window.autocut.createReferenceScript>[0]
): Promise<void> {
  await window.autocut.createReferenceScript(input);
  referenceScripts.value = await window.autocut.listReferenceScripts();
  ElMessage.success("参考脚本已加入本地脚本库");
}
async function deleteReferenceScript(id: string): Promise<void> {
  await window.autocut.deleteReferenceScript(id);
  referenceScripts.value = referenceScripts.value.filter(
    (script) => script.id !== id
  );
}
async function updateReferenceScript(
  id: string,
  input: Parameters<typeof window.autocut.updateReferenceScript>[1]
): Promise<void> {
  await window.autocut.updateReferenceScript(id, input);
  referenceScripts.value = await window.autocut.listReferenceScripts();
  ElMessage.success("参考脚本已更新");
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
          <el-button v-if="name === 'bailian' && credentialStatus.bailian" :loading="testingBailian" @click="testBailian">测试百炼与当前模型</el-button>
          <el-tag v-if="name === 'bailian' && bailianHealth !== 'unknown'" :type="bailianHealth === 'connected' ? 'success' : 'danger'">{{ bailianHealth === "connected" ? "连接正常" : "连接失败" }}</el-tag>
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

      <article class="surface settings-card copy-card">
        <header>
          <div class="settings-icon"><el-icon><Reading /></el-icon></div>
          <div>
            <h3>文案模型与参考脚本</h3>
            <p>通过百炼调用通义或 DeepSeek，优秀脚本仅保存在本机</p>
          </div>
        </header>
        <el-form label-position="top">
          <div class="form-row">
            <el-form-item label="默认模型">
              <el-select
                v-model="copyModel.defaultModel"
                allow-create
                filterable
              >
                <el-option
                  v-for="model in copyModel.candidateModels"
                  :key="model"
                  :label="model"
                  :value="model"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="创作温度">
              <el-input-number
                v-model="copyModel.temperature"
                :min="0"
                :max="2"
                :step="0.1"
              />
            </el-form-item>
          </div>
          <el-form-item label="候选模型">
            <el-select
              v-model="copyModel.candidateModels"
              multiple
              allow-create
              filterable
              default-first-option
            />
          </el-form-item>
          <el-button
            type="primary"
            :loading="savingCopyModel"
            @click="saveCopyModel"
          >
            保存文案模型
          </el-button>
        </el-form>
        <el-divider />
        <ReferenceScriptsPanel
          :scripts="referenceScripts"
          @create="createReferenceScript"
          @update="updateReferenceScript"
          @delete="deleteReferenceScript"
        />
      </article>

      <article class="surface settings-card">
        <header><div class="settings-icon"><el-icon><Monitor /></el-icon></div><div><h3>故障诊断</h3><p>不包含密钥、Cookie 或任务快照</p></div></header>
        <el-button type="primary" plain @click="exportDiagnostics">导出脱敏诊断包</el-button>
      </article>
    </section>
  </div>
</template>

<style scoped>
.settings-grid{display:grid;grid-template-columns:1fr 1.4fr;gap:18px;align-items:start}.settings-card{padding:24px}.media-card{grid-row:span 2}.copy-card{grid-column:1 / -1}header{display:flex;gap:13px;align-items:center;margin-bottom:22px}.settings-icon{width:42px;height:42px;display:grid;place-items:center;border-radius:12px;color:var(--brand-black);background:var(--brand-yellow);font-size:20px}header h3,header p{margin:0}header p{margin-top:4px;color:var(--text-muted);font-size:12px}.credential{margin-top:16px;padding:16px;border:1px solid var(--border);border-radius:15px;background:var(--surface-muted)}.credential-title{display:flex;justify-content:space-between;margin-bottom:12px}.form-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}.el-select{width:100%}@media(max-width:1050px){.settings-grid{grid-template-columns:1fr}.media-card{grid-row:auto}.copy-card{grid-column:auto}}
</style>
