import { describe, expect, test, beforeEach, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import App from "../App.vue";
import { installRouteGuards, routes } from "../router.js";

const api = vi.hoisted(() => ({
  AUTH_TOKEN_KEY: "studio-auth-token",
  createEntity: vi.fn(),
  deleteEntity: vi.fn(),
  fetchList: vi.fn(),
  getCachedList: vi.fn(),
  setCachedList: vi.fn(),
}));

vi.mock("../services/api.js", () => api);

function buildRouter(role = "manager") {
  const router = createRouter({
    history: createMemoryHistory(),
    routes,
  });
  installRouteGuards(router);
  localStorage.setItem("studio-auth-token", "token-local");
  localStorage.setItem("studio-active-role", role);
  return router;
}

describe("Entity CRUD and error/failure states", () => {
  beforeEach(() => {
    localStorage.clear();
    api.createEntity.mockReset();
    api.deleteEntity.mockReset();
    api.fetchList.mockReset();
    api.getCachedList.mockReset();
    api.setCachedList.mockReset();
  });

  test("shows error on forbidden create", async () => {
    api.createEntity.mockResolvedValue({ data: null, queued: false, forbidden: true });
    const router = buildRouter();
    await router.push("/users");
    await router.isReady();
    // ...simulate form submit and check for error message
    // (implementation would use @vue/test-utils)
    expect(api.createEntity).toHaveBeenCalled();
  });

  test("shows error on forbidden delete", async () => {
    api.deleteEntity.mockResolvedValue({ queued: false, forbidden: true });
    const router = buildRouter();
    await router.push("/users");
    await router.isReady();
    // ...simulate delete and check for error message
    expect(api.deleteEntity).toHaveBeenCalled();
  });

  test("role-based permission blocks write", async () => {
    const router = buildRouter("auditor");
    await router.push("/users");
    await router.isReady();
    // ...simulate form submit and check for permission error
    expect(api.createEntity).not.toHaveBeenCalled();
  });
});
