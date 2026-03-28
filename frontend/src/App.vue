<script setup>
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  getActiveRole,
  hasPermission,
  roleOptions,
  setActiveRole,
} from "./auth/roles.js";

const selectedRole = ref(getActiveRole());
const router = useRouter();
const route = useRoute();

const navItems = [
  { to: "/", label: "Role Dashboard", permission: null },
  {
    to: "/availability",
    label: "Availability",
    permission: "reservations.read",
  },
  {
    to: "/checkout",
    label: "Checkout",
    permission: "orders.read",
  },
  {
    to: "/community",
    label: "Community Feed",
    permission: "community.read",
  },
  {
    to: "/moderation",
    label: "Moderation",
    permission: "community.moderate",
  },
  {
    to: "/account-standing",
    label: "Account Standing",
    permission: "users.read",
  },
  {
    to: "/exception-approvals",
    label: "Exception Approvals",
    permission: "users.write",
  },
  {
    to: "/catalog-items",
    label: "Catalog",
    permission: "orders.read",
  },
  {
    to: "/fines",
    label: "Fines",
    permission: "orders.read",
  },
  {
    to: "/user-permissions",
    label: "Permissions",
    permission: "users.read",
  },
  {
    to: "/cash-drawer-counts",
    label: "Reconciliation",
    permission: "reports.financial",
  },
  {
    to: "/security-events",
    label: "Security Events",
    permission: "reports.security",
  },
  {
    to: "/financial-logs",
    label: "Financial Logs",
    permission: "reports.financial",
  },
  {
    to: "/coupons",
    label: "Coupons",
    permission: "orders.read",
  },
  { to: "/users", label: "Users", permission: "users.read" },
  { to: "/resources", label: "Resources", permission: "resources.read" },
  {
    to: "/reservations",
    label: "Reservations",
    permission: "reservations.read",
  },
  { to: "/orders", label: "Orders", permission: "orders.read" },
  { to: "/refunds", label: "Refunds", permission: "refunds.read" },
  {
    to: "/resource-blocks",
    label: "Resource Blocks",
    permission: "resources.read",
  },
  {
    to: "/reservation-blacklists",
    label: "Blacklists",
    permission: "users.read",
  },
  {
    to: "/holiday-rules",
    label: "Holiday Rules",
    permission: "resources.read",
  },
  {
    to: "/community-rules",
    label: "Community Rules",
    permission: "community.moderate",
  },
  {
    to: "/community-settings",
    label: "Community Settings",
    permission: "community.moderate",
  },
  {
    to: "/community-bans",
    label: "Community Bans",
    permission: "community.moderate",
  },
  { to: "/audit-trails", label: "Audit Trails", permission: "audit.read" },
];

const visibleNavItems = computed(() => {
  return navItems.filter(
    (item) =>
      !item.permission || hasPermission(selectedRole.value, item.permission),
  );
});

function onRoleChange(event) {
  const role = event.target.value;
  setActiveRole(role);
  selectedRole.value = role;
  const requiredPermission = route.meta?.permission;
  if (requiredPermission && !hasPermission(role, requiredPermission)) {
    router.push("/");
  }
  window.dispatchEvent(new Event("studio-role-changed"));
}
</script>

<template>
  <div class="layout">
    <aside class="sidebar">
      <h1>Studio Manager</h1>
      <p>Offline-first local platform</p>
      <label class="role-selector">
        <span>Active Role</span>
        <select :value="selectedRole" @change="onRoleChange">
          <option
            v-for="option in roleOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>
      <nav>
        <RouterLink
          v-for="item in visibleNavItems"
          :key="item.to"
          :to="item.to"
        >
          {{ item.label }}
        </RouterLink>
      </nav>
    </aside>

    <main class="content">
      <RouterView />
    </main>
  </div>
</template>
