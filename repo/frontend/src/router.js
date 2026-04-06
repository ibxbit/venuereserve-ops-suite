import AccessDeniedPage from "./pages/AccessDeniedPage.vue";
import AccountStandingPage from "./pages/AccountStandingPage.vue";
import AuditTrailsPage from "./pages/AuditTrailsPage.vue";
import AvailabilityPage from "./pages/AvailabilityPage.vue";
import CatalogItemsPage from "./pages/CatalogItemsPage.vue";
import CommerceCartPage from "./pages/CommerceCartPage.vue";
import CommunityFeedPage from "./pages/CommunityFeedPage.vue";
import EntityPage from "./pages/EntityPage.vue";
import ExceptionApprovalsPage from "./pages/ExceptionApprovalsPage.vue";
import FinesPage from "./pages/FinesPage.vue";
import LoginPage from "./pages/LoginPage.vue";
import ModerationConsolePage from "./pages/ModerationConsolePage.vue";
import OperationsAuditPage from "./pages/OperationsAuditPage.vue";
import OrdersPage from "./pages/OrdersPage.vue";
import RefundsPage from "./pages/RefundsPage.vue";
import ReservationsPage from "./pages/ReservationsPage.vue";
import ResourcesPage from "./pages/ResourcesPage.vue";
import RoleDashboardPage from "./pages/RoleDashboardPage.vue";
import UsersPage from "./pages/UsersPage.vue";
import { getActiveRole, hasPermission } from "./auth/roles.js";
import { AUTH_TOKEN_KEY } from "./services/api.js";

export const routes = [
  { path: "/login", component: LoginPage },
  { path: "/", component: RoleDashboardPage },
  {
    path: "/availability",
    component: AvailabilityPage,
    meta: { permission: "reservations.read" },
  },
  {
    path: "/account-standing",
    component: AccountStandingPage,
    meta: { permission: "users.read" },
  },
  {
    path: "/checkout",
    component: CommerceCartPage,
    meta: { permission: "orders.read" },
  },
  {
    path: "/community",
    component: CommunityFeedPage,
    meta: { permission: "community.read" },
  },
  {
    path: "/moderation",
    component: ModerationConsolePage,
    meta: { permission: "community.moderate" },
  },
  {
    path: "/operations-audit",
    component: OperationsAuditPage,
    meta: { permission: "reports.financial" },
  },
  {
    path: "/exception-approvals",
    component: ExceptionApprovalsPage,
    meta: { permission: "users.write" },
  },
  {
    path: "/users",
    component: UsersPage,
    meta: { permission: "users.read" },
  },
  {
    path: "/catalog-items",
    component: CatalogItemsPage,
    meta: { permission: "orders.read" },
  },
  {
    path: "/fines",
    component: FinesPage,
    meta: { permission: "orders.read" },
  },
  {
    path: "/user-permissions",
    component: EntityPage,
    props: { entity: "user-permissions" },
    meta: { permission: "users.read" },
  },
  {
    path: "/cash-drawer-counts",
    component: EntityPage,
    props: { entity: "cash-drawer-counts" },
    meta: { permission: "reports.financial" },
  },
  {
    path: "/security-events",
    component: EntityPage,
    props: { entity: "security-events", readOnly: true },
    meta: { permission: "reports.security" },
  },
  {
    path: "/financial-logs",
    component: EntityPage,
    props: { entity: "financial-logs", readOnly: true },
    meta: { permission: "reports.financial" },
  },
  {
    path: "/coupons",
    component: EntityPage,
    props: { entity: "coupons" },
    meta: { permission: "orders.read" },
  },
  {
    path: "/resources",
    component: ResourcesPage,
    meta: { permission: "resources.read" },
  },
  {
    path: "/reservations",
    component: ReservationsPage,
    meta: { permission: "reservations.read" },
  },
  {
    path: "/orders",
    component: OrdersPage,
    meta: { permission: "orders.read" },
  },
  {
    path: "/refunds",
    component: RefundsPage,
    meta: { permission: "refunds.read" },
  },
  {
    path: "/resource-blocks",
    component: EntityPage,
    props: { entity: "resource-blocks" },
    meta: { permission: "resources.read" },
  },
  {
    path: "/reservation-blacklists",
    component: EntityPage,
    props: { entity: "reservation-blacklists" },
    meta: { permission: "users.read" },
  },
  {
    path: "/holiday-rules",
    component: EntityPage,
    props: { entity: "holiday-rules" },
    meta: { permission: "resources.read" },
  },
  {
    path: "/community-rules",
    component: EntityPage,
    props: { entity: "community-rules" },
    meta: { permission: "community.moderate" },
  },
  {
    path: "/community-settings",
    component: EntityPage,
    props: { entity: "community-settings" },
    meta: { permission: "community.moderate" },
  },
  {
    path: "/community-bans",
    component: EntityPage,
    props: { entity: "community-bans" },
    meta: { permission: "community.moderate" },
  },
  {
    path: "/audit-trails",
    component: AuditTrailsPage,
    meta: { permission: "audit.read" },
  },
  { path: "/access-denied", component: AccessDeniedPage },
];

export function installRouteGuards(router) {
  router.beforeEach((to) => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (to.path !== "/login" && !token) {
      return "/login";
    }
    if (to.path === "/login" && token) {
      return "/";
    }

    const permission = to.meta?.permission;
    if (!permission) return true;
    const role = getActiveRole();
    if (hasPermission(role, permission)) return true;
    return "/access-denied";
  });
}
