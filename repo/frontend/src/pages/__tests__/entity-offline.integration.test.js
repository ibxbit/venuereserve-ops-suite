import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, test, vi } from "vitest";
import UsersPage from "../UsersPage.vue";

const api = vi.hoisted(() => ({
  checkInReservation: vi.fn(),
  createEntity: vi.fn(),
  deleteEntity: vi.fn(),
  fetchList: vi.fn(),
  getCachedList: vi.fn(),
  markNoShows: vi.fn(),
  setCachedList: vi.fn(),
  syncQueue: vi.fn(),
}));

vi.mock("../../services/api.js", () => api);

describe("Entity offline and edge-state integration", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("studio-active-role", "manager");

    api.syncQueue.mockResolvedValue(undefined);
    api.checkInReservation.mockResolvedValue({ forbidden: false, offline: false, data: { status: "checked_in" } });
    api.markNoShows.mockResolvedValue({ forbidden: false, offline: false, data: { marked_count: 0 } });
    api.getCachedList.mockReturnValue([{ id: "cached-1" }]);
    api.setCachedList.mockImplementation(() => {});
    api.createEntity.mockResolvedValue({ data: { id: "local-row" }, queued: true, forbidden: false });
    api.deleteEntity.mockResolvedValue({ queued: true, forbidden: false });
  });

  test("shows offline state and queued create/delete notices", async () => {
    api.fetchList.mockResolvedValue({
      data: [{ id: "row-1" }],
      offline: true,
      forbidden: false,
    });

    const wrapper = mount(UsersPage);
    await flushPromises();

    expect(wrapper.text()).toContain("Offline mode: showing cached records");

    await wrapper.find("form").trigger("submit.prevent");
    await flushPromises();
    expect(wrapper.text()).toContain("Saved to local queue");

    const deleteButton = wrapper
      .findAll("button")
      .find((node) => node.text().includes("Delete"));
    await deleteButton.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Delete operation queued for later sync");
  });

  test("transitions from offline to online across reload", async () => {
    api.fetchList
      .mockResolvedValueOnce({
        data: [{ id: "row-offline" }],
        offline: true,
        forbidden: false,
      })
      .mockResolvedValueOnce({
        data: [{ id: "row-online" }],
        offline: false,
        forbidden: false,
      });

    const offlineWrapper = mount(UsersPage);
    await flushPromises();
    expect(offlineWrapper.text()).toContain("Offline mode: showing cached records");

    offlineWrapper.unmount();

    const onlineWrapper = mount(UsersPage);
    await flushPromises();
    expect(onlineWrapper.text()).not.toContain("Offline mode: showing cached records");
  });

  test("shows forbidden state for restricted access", async () => {
    api.fetchList.mockResolvedValue({ data: [], offline: false, forbidden: true });

    const wrapper = mount(UsersPage);
    await flushPromises();

    expect(wrapper.text()).toContain("Access is restricted for the active role");
  });
});
