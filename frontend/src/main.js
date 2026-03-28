import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import { getActiveRole, hasPermission } from "./auth/roles.js";
import { routes } from "./router.js";
import "./styles.css";

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  const permission = to.meta?.permission;
  if (!permission) return true;
  const role = getActiveRole();
  if (hasPermission(role, permission)) return true;
  return "/access-denied";
});

createApp(App).use(router).mount("#app");
