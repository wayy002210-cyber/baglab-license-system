<script setup lang="ts">
import { onMounted, ref } from "vue";
import {
  Calendar,
  Collection,
  DataAnalysis,
  EditPen,
  Files,
  Microphone,
  Setting,
  User,
  VideoCamera,
  VideoPlay
} from "@element-plus/icons-vue";
import logoUrl from "../assets/bag-lab-avatar.png";
import { PRODUCT_NAME } from "../../shared/product-copy";

const buildId = ref("");

const modules = [
  { label: "工作台", path: "/", icon: DataAnalysis },
  { label: "账号档案", path: "/personas", icon: User },
  { label: "素材中心", path: "/assets", icon: Files },
  { label: "文案生成", path: "/copywriting", icon: EditPen },
  { label: "音频制作", path: "/audio", icon: Microphone },
  { label: "镜头剪辑", path: "/templates", icon: Collection },
  { label: "任务中心", path: "/tasks", icon: VideoPlay },
  { label: "发布账号", path: "/publish-accounts", icon: VideoCamera },
  { label: "发布排期", path: "/schedule", icon: Calendar },
  { label: "系统设置", path: "/settings", icon: Setting }
] as const;

onMounted(async () => {
  try {
    buildId.value = await window.autocut.getBuildId();
  } catch {
    buildId.value = "";
  }
});
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar" data-sticky="true">
      <div class="brand">
        <img class="brand__mark" :src="logoUrl" alt="袋研官" />
        <div>
          <strong>袋研官</strong>
          <small>矩阵混剪工作台</small>
        </div>
      </div>
      <nav class="sidebar__nav" aria-label="主导航">
        <RouterLink
          v-for="item in modules"
          :key="item.path"
          :to="item.path"
          class="nav-item"
        >
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>
      <div class="sidebar__footer">
        <div>
          <span class="status-dot" />
          本地服务
        </div>
        <small v-if="buildId">Build {{ buildId }}</small>
      </div>
    </aside>
    <section class="workspace">
      <header class="topbar">
        <div>
          <p>全自动内容生产</p>
          <h1>{{ PRODUCT_NAME }}</h1>
        </div>
        <el-tag type="success" effect="light" round>本地模式</el-tag>
      </header>
      <main class="page-content">
        <RouterView />
      </main>
    </section>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 236px minmax(0, 1fr);
  background: var(--page-bg);
  color: var(--brand-black);
}
.sidebar {
  position: sticky;
  top: 18px;
  height: calc(100vh - 36px);
  max-height: calc(100vh - 36px);
  margin: 18px 0 18px 18px;
  padding: 22px 16px;
  border-radius: 24px;
  background: var(--brand-black);
  color: #fff;
  display: flex;
  flex-direction: column;
  box-shadow: 0 18px 45px rgba(16, 16, 16, 0.16);
}
.sidebar__nav {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 2px 10px 24px;
}
.brand__mark {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  object-fit: cover;
}
.brand strong,
.brand small {
  display: block;
}
.brand small {
  margin-top: 3px;
  color: #b7b7b7;
}
nav {
  display: grid;
  gap: 7px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  color: #c9c9c9;
  text-decoration: none;
}
.nav-item:hover,
.nav-item.router-link-active {
  background: var(--brand-yellow);
  color: var(--brand-black);
}
.sidebar__footer {
  margin-top: auto;
  padding: 12px;
  font-size: 13px;
  color: #aaa;
}
.sidebar__footer small {
  display: block;
  margin-top: 6px;
  color: #777;
  word-break: break-all;
}
.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 7px;
  border-radius: 50%;
  background: var(--brand-yellow);
}
.workspace {
  min-width: 0;
  padding: 18px 28px 28px;
}
.topbar {
  height: 76px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.topbar p,
.topbar h1 {
  margin: 0;
}
.topbar p {
  color: #8794a9;
  font-size: 12px;
}
.topbar h1 {
  margin-top: 4px;
  font-size: 19px;
  letter-spacing: 0.04em;
}
.page-content {
  min-height: calc(100vh - 122px);
}
@media (max-width: 900px) {
  .app-shell {
    grid-template-columns: 78px minmax(0, 1fr);
  }
  .sidebar {
    padding-inline: 10px;
  }
  .brand > div:last-child,
  .nav-item span,
  .sidebar__footer {
    display: none;
  }
  .nav-item {
    justify-content: center;
  }
}
</style>
