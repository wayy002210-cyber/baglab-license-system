<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { Key, Monitor, VideoCamera } from "@element-plus/icons-vue";
import PageIntro from "../components/PageIntro.vue";

const status = reactive({ bailian: false, minimax: false });
const secrets = reactive({ bailian: "", minimax: "" });
const saving = ref<"bailian" | "minimax" | null>(null);

async function loadStatus(): Promise<void> {
  Object.assign(status, await window.autocut.credentialStatus());
}

async function save(name: "bailian" | "minimax"): Promise<void> {
  if (!secrets[name].trim()) {
    ElMessage.warning("请输入 API Key");
    return;
  }
  saving.value = name;
  try {
    await window.autocut.setCredential(name, secrets[name]);
    secrets[name] = "";
    await loadStatus();
    ElMessage.success("凭据已安全保存到 Windows 凭据库");
  } finally {
    saving.value = null;
  }
}

async function clear(name: "bailian" | "minimax"): Promise<void> {
  await window.autocut.deleteCredential(name);
  await loadStatus();
  ElMessage.success("凭据已清除");
}

async function exportDiagnostics(): Promise<void> {
  const path = await window.autocut.exportDiagnostics();
  if (path) ElMessage.success(`诊断包已导出：${path}`);
}

onMounted(loadStatus);
</script>

<template>
  <div class="page">
    <PageIntro
      title="系统设置"
      description="配置媒体输出与 AI 服务；敏感凭据不会写入数据库或日志"
    />
    <section class="settings-grid">
      <article class="surface settings-card">
        <header>
          <div class="settings-icon"><el-icon><Key /></el-icon></div>
          <div>
            <h3>AI 服务凭据</h3>
            <p>通过 Windows Credential Manager 加密保存</p>
          </div>
        </header>
        <div class="credential">
          <div class="credential__title">
            <strong>阿里云百炼</strong>
            <el-tag :type="status.bailian ? 'success' : 'info'">
              {{ status.bailian ? "已配置" : "未配置" }}
            </el-tag>
          </div>
          <el-input
            v-model="secrets.bailian"
            type="password"
            show-password
            placeholder="输入 DashScope API Key"
          >
            <template #append>
              <el-button :loading="saving === 'bailian'" @click="save('bailian')">保存</el-button>
            </template>
          </el-input>
          <el-button v-if="status.bailian" text type="danger" @click="clear('bailian')">
            清除已保存凭据
          </el-button>
        </div>
        <div class="credential">
          <div class="credential__title">
            <strong>MiniMax</strong>
            <el-tag :type="status.minimax ? 'success' : 'info'">
              {{ status.minimax ? "已配置" : "未配置" }}
            </el-tag>
          </div>
          <el-input
            v-model="secrets.minimax"
            type="password"
            show-password
            placeholder="输入 MiniMax API Key"
          >
            <template #append>
              <el-button :loading="saving === 'minimax'" @click="save('minimax')">保存</el-button>
            </template>
          </el-input>
          <el-button v-if="status.minimax" text type="danger" @click="clear('minimax')">
            清除已保存凭据
          </el-button>
        </div>
      </article>

      <article class="surface settings-card">
        <header>
          <div class="settings-icon"><el-icon><VideoCamera /></el-icon></div>
          <div>
            <h3>默认成片规格</h3>
            <p>首版固定为平台通用竖屏格式</p>
          </div>
        </header>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="画布">1080 × 1920</el-descriptions-item>
          <el-descriptions-item label="帧率">30 fps</el-descriptions-item>
          <el-descriptions-item label="视频">H.264</el-descriptions-item>
          <el-descriptions-item label="音频">AAC</el-descriptions-item>
        </el-descriptions>
      </article>

      <article class="surface settings-card">
        <header>
          <div class="settings-icon"><el-icon><Monitor /></el-icon></div>
          <div>
            <h3>本地服务</h3>
            <p>只监听 127.0.0.1，并使用随机会话令牌</p>
          </div>
        </header>
        <el-alert
          title="Renderer 无法直接访问 Node、数据库或系统凭据"
          type="success"
          :closable="false"
          show-icon
        />
      </article>
      <article class="surface settings-card">
        <header>
          <div class="settings-icon"><el-icon><Monitor /></el-icon></div>
          <div>
            <h3>故障诊断</h3>
            <p>导出脱敏日志与任务元数据，不包含密钥、Cookie 或任务快照</p>
          </div>
        </header>
        <el-button type="primary" plain @click="exportDiagnostics">
          导出诊断包
        </el-button>
      </article>
    </section>
  </div>
</template>

<style scoped>
.settings-grid {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 18px;
  align-items: start;
}
.settings-card {
  padding: 24px;
}
.settings-card:first-child {
  grid-row: span 2;
}
header {
  display: flex;
  gap: 13px;
  align-items: center;
  margin-bottom: 22px;
}
.settings-icon {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  color: #5b8def;
  background: #eaf1ff;
  font-size: 20px;
}
header h3,
header p {
  margin: 0;
}
header p {
  margin-top: 4px;
  color: #8995a7;
  font-size: 12px;
}
.credential {
  margin-top: 20px;
  padding: 18px;
  border: 1px solid #e7ebf2;
  border-radius: 15px;
  background: #fafbfd;
}
.credential__title {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
}
@media (max-width: 1050px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }
}
</style>
