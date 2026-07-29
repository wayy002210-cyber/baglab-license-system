<script setup lang="ts">
import {
  Calendar,
  Collection,
  DataAnalysis,
  Files,
  Setting,
  User,
  VideoCamera,
  VideoPlay
} from "@element-plus/icons-vue";

const modules = [
  { label: "工作台", path: "/", icon: DataAnalysis },
  { label: "账号档案", path: "/personas", icon: User },
  { label: "素材中心", path: "/assets", icon: Files },
  { label: "镜头模板", path: "/templates", icon: Collection },
  { label: "任务中心", path: "/tasks", icon: VideoPlay },
  { label: "发布账号", path: "/publish-accounts", icon: VideoCamera },
  { label: "发布排期", path: "/schedule", icon: Calendar },
  { label: "系统设置", path: "/settings", icon: Setting }
] as const;
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand__mark">A</div>
        <div>
          <strong>AUTOCUT</strong>
          <small>智能混剪工作台</small>
        </div>
      </div>
      <nav aria-label="主导航">
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
        <span class="status-dot" />
        本地服务
      </div>
    </aside>
    <section class="workspace">
      <header class="topbar">
        <div>
          <p>全自动内容生产</p>
          <h1>AUTOCUT STUDIO</h1>
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
  background: #f4f7fc;
  color: #18243d;
}
.sidebar {
  margin: 18px 0 18px 18px;
  padding: 22px 16px;
  border-radius: 24px;
  background: linear-gradient(180deg, #233653, #17263f);
  color: #dce6f7;
  display: flex;
  flex-direction: column;
  box-shadow: 0 18px 45px rgba(23, 38, 63, 0.2);
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 2px 10px 24px;
}
.brand__mark {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: #5b8def;
  color: white;
  font-weight: 800;
}
.brand strong,
.brand small {
  display: block;
}
.brand small {
  margin-top: 3px;
  color: #91a4c2;
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
  color: #aebdd4;
  text-decoration: none;
}
.nav-item:hover,
.nav-item.router-link-active {
  background: rgba(91, 141, 239, 0.2);
  color: #fff;
}
.sidebar__footer {
  margin-top: auto;
  padding: 12px;
  font-size: 13px;
  color: #91a4c2;
}
.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 7px;
  border-radius: 50%;
  background: #4fd69c;
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
