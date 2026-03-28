import AccessDeniedPage from "./pages/AccessDeniedPage.vue";
import AccountStandingPage from "./pages/AccountStandingPage.vue";
import AvailabilityPage from "./pages/AvailabilityPage.vue";
import CommerceCartPage from "./pages/CommerceCartPage.vue";
import CommunityFeedPage from "./pages/CommunityFeedPage.vue";
import EntityPage from "./pages/EntityPage.vue";
import ExceptionApprovalsPage from "./pages/ExceptionApprovalsPage.vue";
import ModerationConsolePage from "./pages/ModerationConsolePage.vue";
import RoleDashboardPage from "./pages/RoleDashboardPage.vue";

export const routes = [
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
    path: "/exception-approvals",
    component: ExceptionApprovalsPage,
    meta: { permission: "users.write" },
  },
  {
    path: "/users",
    component: EntityPage,
    props: { entity: "users" },
    meta: { permission: "users.read" },
  },
  {
    path: "/catalog-items",
    component: EntityPage,
    props: { entity: "catalog-items" },
    meta: { permission: "orders.read" },
  },
  {
    path: "/fines",
    component: EntityPage,
    props: { entity: "fines" },
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
    component: EntityPage,
    props: { entity: "resources" },
    meta: { permission: "resources.read" },
  },
  {
    path: "/reservations",
    component: EntityPage,
    props: { entity: "reservations" },
    meta: { permission: "reservations.read" },
  },
  {
    path: "/orders",
    component: EntityPage,
    props: { entity: "orders" },
    meta: { permission: "orders.read" },
  },
  {
    path: "/refunds",
    component: EntityPage,
    props: { entity: "refunds" },
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
    component: EntityPage,
    props: { entity: "audit-trails", readOnly: true },
    meta: { permission: "audit.read" },
  },
  { path: "/access-denied", component: AccessDeniedPage },
];
