import { describe, expect, test } from "vitest";
import AuditTrailsPage from "../AuditTrailsPage.vue";
import CatalogItemsPage from "../CatalogItemsPage.vue";
import FinesPage from "../FinesPage.vue";
import OrdersPage from "../OrdersPage.vue";
import RefundsPage from "../RefundsPage.vue";
import ReservationsPage from "../ReservationsPage.vue";
import ResourcesPage from "../ResourcesPage.vue";
import UsersPage from "../UsersPage.vue";
import { routes } from "../../router.js";

function routeByPath(path) {
  return routes.find((route) => route.path === path);
}

describe("Entity route to dedicated component mapping", () => {
  test("maps prompt-required entity routes to dedicated files", () => {
    expect(routeByPath("/reservations")?.component).toBe(ReservationsPage);
    expect(routeByPath("/orders")?.component).toBe(OrdersPage);
    expect(routeByPath("/refunds")?.component).toBe(RefundsPage);
    expect(routeByPath("/catalog-items")?.component).toBe(CatalogItemsPage);
    expect(routeByPath("/fines")?.component).toBe(FinesPage);
    expect(routeByPath("/audit-trails")?.component).toBe(AuditTrailsPage);
    expect(routeByPath("/users")?.component).toBe(UsersPage);
    expect(routeByPath("/resources")?.component).toBe(ResourcesPage);
  });
});
