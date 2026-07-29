import { createRouter, createWebHashHistory } from "vue-router";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", component: () => import("./views/DashboardView.vue") },
    { path: "/personas", component: () => import("./views/PersonasView.vue") },
    { path: "/assets", component: () => import("./views/AssetsView.vue") },
    { path: "/templates", component: () => import("./views/TemplatesView.vue") },
    { path: "/tasks", component: () => import("./views/TasksView.vue") },
    {
      path: "/publish-accounts",
      component: () => import("./views/PublishAccountsView.vue")
    },
    { path: "/schedule", component: () => import("./views/ScheduleView.vue") },
    { path: "/settings", component: () => import("./views/SettingsView.vue") }
  ]
});
