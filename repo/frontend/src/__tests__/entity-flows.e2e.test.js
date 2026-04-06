import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import App from "../App.vue";
import { installRouteGuards, routes } from "../router.js";

const api = vi.hoisted(() => ({
  AUTH_TOKEN_KEY: "studio-auth-token",
  checkInReservation: vi.fn(),
  createEntity: vi.fn(),
  deleteEntity: vi.fn(),
  fetchAuditTrails: vi.fn(),
  fetchDailyReconciliation: vi.fn(),
  fetchList: vi.fn(),
  fetchReport: vi.fn(),
  fetchRoleDashboard: vi.fn(),
  fetchSecurityEvents: vi.fn(),
  fetchShiftReconciliation: vi.fn(),
  getCachedList: vi.fn(),
  markNoShows: vi.fn(),
  setCachedList: vi.fn(),
  submitShiftClose: vi.fn(),
  syncQueue: vi.fn(),
  clearStoredActorUserId: vi.fn(),
  clearStoredAuthToken: vi.fn(),
}));

vi.mock("../services/api.js", () => api);

function buildRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes,
  });
  installRouteGuards(router);
  return router;
}

describe("Entity flows e2e-style routing coverage", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("studio-auth-token", "token-local");
    localStorage.setItem("studio-active-role", "manager");

    api.syncQueue.mockResolvedValue(undefined);
    api.fetchRoleDashboard.mockResolvedValue({
      dashboard: { title: "Dashboard", highlights: [] },
      permissions: [],
    });
    api.fetchReport.mockResolvedValue({});
    api.fetchList.mockResolvedValue({
      data: [{ id: "row-1", status: "booked" }],
      offline: false,
      forbidden: false,
    });
    api.createEntity.mockResolvedValue({ data: { id: "row-new" }, queued: false, forbidden: false });
    api.deleteEntity.mockResolvedValue({ queued: false, forbidden: false });
    api.getCachedList.mockReturnValue([]);
    api.setCachedList.mockImplementation(() => {});
    api.checkInReservation.mockResolvedValue({ forbidden: false, offline: false, data: { status: "checked_in" } });
    api.markNoShows.mockResolvedValue({ forbidden: false, offline: false, data: { marked_count: 0 } });
  });

  test("all required entity routes render dedicated views", async () => {
    const requiredRoutes = [
      "/reservations",
      "/orders",
      "/refunds",
      "/catalog-items",
      "/fines",
      "/audit-trails",
      "/users",
      "/resources",
    ];

    const router = buildRouter();
    await router.push(requiredRoutes[0]);
    await router.isReady();
    const wrapper = mount(App, {
      global: { plugins: [router] },
    });
    await flushPromises();

    for (const path of requiredRoutes) {
      await router.push(path);
      await flushPromises();
      expect(wrapper.find("h2").exists()).toBe(true);
    }
  });

  test("users route supports create and delete through full app shell", async () => {
    const router = buildRouter();
    await router.push("/users");
    await router.isReady();
    const wrapper = mount(App, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const form = wrapper.find("form");
    expect(form.exists()).toBe(true);
    await form.trigger("submit.prevent");
    await flushPromises();
    expect(api.createEntity).toHaveBeenCalledWith("users", expect.any(Object));

    const deleteButton = wrapper
      .findAll("button")
      .find((node) => node.text().includes("Delete"));
    await deleteButton.trigger("click");
    await flushPromises();
    expect(api.deleteEntity).toHaveBeenCalledWith("users", "row-1");
  });
});
