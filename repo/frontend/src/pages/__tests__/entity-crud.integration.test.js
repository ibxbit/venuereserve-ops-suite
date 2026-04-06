import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, test, vi } from "vitest";
import AuditTrailsPage from "../AuditTrailsPage.vue";
import CatalogItemsPage from "../CatalogItemsPage.vue";
import FinesPage from "../FinesPage.vue";
import OrdersPage from "../OrdersPage.vue";
import RefundsPage from "../RefundsPage.vue";
import ReservationsPage from "../ReservationsPage.vue";
import ResourcesPage from "../ResourcesPage.vue";
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

const writeEnabledPages = [
  { name: "reservations", component: ReservationsPage, entity: "reservations" },
  { name: "orders", component: OrdersPage, entity: "orders" },
  { name: "refunds", component: RefundsPage, entity: "refunds" },
  { name: "catalog-items", component: CatalogItemsPage, entity: "catalog-items" },
  { name: "fines", component: FinesPage, entity: "fines" },
  { name: "users", component: UsersPage, entity: "users" },
  { name: "resources", component: ResourcesPage, entity: "resources" },
];

describe("Entity CRUD integration coverage", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("studio-active-role", "manager");

    api.syncQueue.mockResolvedValue(undefined);
    api.checkInReservation.mockResolvedValue({
      data: { status: "checked_in" },
      forbidden: false,
      offline: false,
    });
    api.markNoShows.mockResolvedValue({
      data: { marked_count: 0 },
      forbidden: false,
      offline: false,
    });
    api.getCachedList.mockReturnValue([]);
    api.fetchList.mockResolvedValue({
      data: [{ id: "row-1", status: "booked" }],
      offline: false,
      forbidden: false,
    });
    api.createEntity.mockResolvedValue({
      data: { id: "row-new" },
      queued: false,
      forbidden: false,
    });
    api.deleteEntity.mockResolvedValue({ queued: false, forbidden: false });
  });

  for (const page of writeEnabledPages) {
    test(`${page.name} page supports load/create/delete flow`, async () => {
      const wrapper = mount(page.component);
      await flushPromises();

      expect(api.fetchList).toHaveBeenCalledWith(page.entity);

      const form = wrapper.find("form");
      expect(form.exists()).toBe(true);
      await form.trigger("submit.prevent");
      await flushPromises();

      expect(api.createEntity).toHaveBeenCalledWith(page.entity, expect.any(Object));

      const deleteButton = wrapper
        .findAll("button")
        .find((node) => node.text().includes("Delete"));
      expect(deleteButton).toBeTruthy();

      await deleteButton.trigger("click");
      await flushPromises();

      expect(api.deleteEntity).toHaveBeenCalledWith(page.entity, "row-1");
    });
  }

  test("audit trails page is read-only", async () => {
    const wrapper = mount(AuditTrailsPage);
    await flushPromises();

    expect(api.fetchList).toHaveBeenCalledWith("audit-trails");
    expect(wrapper.find("form").exists()).toBe(false);
    const deleteButton = wrapper
      .findAll("button")
      .find((node) => node.text().includes("Delete"));
    expect(deleteButton).toBeUndefined();
  });
});
