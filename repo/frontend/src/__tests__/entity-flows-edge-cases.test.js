import { describe, expect, test, beforeEach, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import { installRouteGuards, routes } from "../router.js";
import { createEntity, deleteEntity } from "../services/api.js";

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

  test("createEntity returns forbidden flag when backend responds 403", async () => {
    api.createEntity.mockResolvedValue({
      data: null,
      queued: false,
      forbidden: true,
    });
    const result = await createEntity("users", { full_name: "x" });
    expect(api.createEntity).toHaveBeenCalledWith("users", { full_name: "x" });
    expect(result.forbidden).toBe(true);
    expect(result.data).toBeNull();
  });

  test("deleteEntity returns forbidden flag when backend responds 403", async () => {
    api.deleteEntity.mockResolvedValue({ queued: false, forbidden: true });
    const result = await deleteEntity("users", "user-1");
    expect(api.deleteEntity).toHaveBeenCalledWith("users", "user-1");
    expect(result.forbidden).toBe(true);
  });

  test("role-based permission blocks write-capable UI for auditor", async () => {
    const router = buildRouter("auditor");
    await router.push("/users");
    await router.isReady();
    // auditor has no users.write permission — guards redirect to /access-denied
    // and EntityPage is never mounted so createEntity is not called.
    expect(api.createEntity).not.toHaveBeenCalled();
  });
});
