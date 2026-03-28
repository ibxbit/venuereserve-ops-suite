<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { getActiveRole, getRoleLabel, hasPermission } from "../auth/roles.js";
import { fetchReport, fetchRoleDashboard } from "../services/api.js";

const loading = ref(true);
const role = ref(getActiveRole());
const roleInfo = ref(null);
const reportCards = ref([]);

function loadRole() {
  role.value = getActiveRole();
}

async function handleRoleChanged() {
  loadRole();
  await loadDashboard();
}

function listReportTypes(activeRole) {
  const reportTypes = [];
  if (hasPermission(activeRole, "reports.financial"))
    reportTypes.push("financial");
  if (hasPermission(activeRole, "reports.security"))
    reportTypes.push("security");
  if (hasPermission(activeRole, "reports.community"))
    reportTypes.push("community");
  return reportTypes;
}

function metricsForCard(card) {
  if (!card?.data || card.data.unavailable) return [];
  const entries = Object.entries(card.data).filter(([, value]) => {
    return typeof value === "number" || typeof value === "string";
  });
  return entries.slice(0, 6).map(([key, value]) => ({ key, value }));
}

async function loadDashboard() {
  loading.value = true;
  roleInfo.value = null;
  reportCards.value = [];

  try {
    roleInfo.value = await fetchRoleDashboard();
  } catch {
    roleInfo.value = {
      role: role.value,
      dashboard: {
        title: `${getRoleLabel(role.value)} Dashboard`,
        highlights: [
          "Local mode active. Dashboard metadata unavailable while API is offline.",
        ],
      },
      permissions: [],
    };
  }

  const reportTypes = listReportTypes(role.value);
  const reports = [];
  for (const type of reportTypes) {
    try {
      const data = await fetchReport(type);
      reports.push({ type, data });
    } catch {
      reports.push({ type, data: { unavailable: true } });
    }
  }
  reportCards.value = reports;
  loading.value = false;
}

onMounted(async () => {
  await loadDashboard();
  window.addEventListener("studio-role-changed", handleRoleChanged);
});

onBeforeUnmount(() => {
  window.removeEventListener("studio-role-changed", handleRoleChanged);
});
</script>

<template>
  <section class="page">
    <h2>{{ roleInfo?.dashboard?.title || "Role Dashboard" }}</h2>
    <p v-if="loading" class="badge">
      <span class="spinner" />
      Loading role dashboard...
    </p>

    <div v-if="roleInfo && !loading" class="panel">
      <h3>Role Focus</h3>
      <ul class="plain-list">
        <li v-for="item in roleInfo.dashboard.highlights" :key="item">
          {{ item }}
        </li>
      </ul>
    </div>

    <div v-if="roleInfo && !loading" class="panel">
      <h3>Granted Permissions</h3>
      <p>{{ roleInfo.permissions.join(", ") || "No active permissions" }}</p>
    </div>

    <div v-if="reportCards.length" class="tiles">
      <article v-for="card in reportCards" :key="card.type" class="tile">
        <h3>{{ card.type }} report</h3>
        <p v-if="card.data.unavailable">
          Unavailable in offline mode or blocked by policy.
        </p>
        <div v-else class="stats-grid">
          <div
            v-for="metric in metricsForCard(card)"
            :key="`${card.type}-${metric.key}`"
            class="stat-card"
          >
            <p class="stat-label">{{ metric.key }}</p>
            <p class="stat-value">{{ metric.value }}</p>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>
