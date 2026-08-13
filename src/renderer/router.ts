import { createRouter, createWebHashHistory } from "vue-router";
import { useLicenseStore } from "./license/store";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/activate", component: () => import("./views/ActivationView.vue"), meta: { public: true } },
    { path: "/", component: () => import("./views/DashboardView.vue") },
    { path: "/personas", component: () => import("./views/PersonasView.vue") },
    { path: "/assets", component: () => import("./views/AssetsView.vue") },
    {
      path: "/copywriting",
      component: () => import("./views/CopywritingView.vue")
    },
    {
      path: "/audio",
      component: () => import("./views/AudioProductionView.vue")
    },
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
router.beforeEach(async(to)=>{const license=useLicenseStore();if(!license.status)await license.initialize();if(to.meta.public)return license.allowed?"/":true;return license.allowed?true:"/activate"});
