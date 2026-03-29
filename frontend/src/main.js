import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import { installRouteGuards, routes } from "./router.js";
import "./styles.css";

const router = createRouter({
  history: createWebHistory(),
  routes,
});

installRouteGuards(router);

createApp(App).use(router).mount("#app");
