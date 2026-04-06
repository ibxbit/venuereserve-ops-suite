<script setup>
import { computed, onMounted, ref } from "vue";
import {
  fetchAuditTrails,
  fetchDailyReconciliation,
  fetchList,
  fetchSecurityEvents,
  fetchShiftReconciliation,
  submitShiftClose,
} from "../services/api.js";
import {
  getApiErrorMessage,
  hasActiveAction,
  releaseActionLock,
  withActionLock,
} from "../utils/client-helpers.js";

const actionLock = ref({
  load: false,
  daily: false,
  shiftClose: false,
  shiftLookup: false,
});

const message = ref("");
const error = ref("");
const dailyReport = ref(null);
const shiftRows = ref([]);
const auditRows = ref([]);
const securityRows = ref([]);
const financialRows = ref([]);

const auditFilters = ref({
  entity: "",
  action: "",
  actorUserId: "",
});

const dailyDate = ref(new Date().toISOString().slice(0, 10));
const shiftLookupKey = ref("");
const shiftCloseForm = ref({
  shift_key: "",
  shift_start: "",
  shift_end: "",
  counted_total: 0,
  notes: "",
});

const hasBusyAction = computed(() => hasActiveAction(actionLock));

const anomalyAlerts = computed(() => {
  const severeSecurity = securityRows.value.filter((event) =>
    ["critical", "error"].includes(String(event.severity || "").toLowerCase()),
  );
  const tamperedRows = verifyFinancialLogChain(financialRows.value);
  const varianceFlags = shiftRows.value.filter((row) => row.variance_flag);

  return [
    ...severeSecurity.map((event) => ({
      id: `sec-${event.id}`,
      text: `[${event.severity}] ${event.event_type} (${event.created_at})`,
    })),
    ...tamperedRows.map((row) => ({
      id: `log-${row.id}`,
      text: `Potential log chain mismatch at financial log ${row.id}`,
    })),
    ...varianceFlags.map((row) => ({
      id: `variance-${row.id}`,
      text: `Shift ${row.shift_key} flagged variance $${row.variance_amount}`,
    })),
  ];
});

function verifyFinancialLogChain(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return [];
  const sorted = [...rows].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const mismatches = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (!current.previous_hash || current.previous_hash !== previous.entry_hash) {
      mismatches.push(current);
    }
  }
  return mismatches;
}

async function loadCoreViews() {
  if (!withActionLock(actionLock, "load")) return;
  error.value = "";
  try {
    const [audit, security, financial] = await Promise.all([
      fetchAuditTrails({
        page: 1,
        perPage: 50,
        entity: auditFilters.value.entity,
        action: auditFilters.value.action,
        actorUserId: auditFilters.value.actorUserId,
      }),
      fetchSecurityEvents({ page: 1, perPage: 50 }),
      fetchList("financial-logs", { page: 1, perPage: 80 }),
    ]);
    auditRows.value = audit.data || [];
    securityRows.value = security.data || [];
    financialRows.value = financial.data || [];
  } catch (err) {
    error.value = getApiErrorMessage(err, "Could not load operations audit data.");
  }
  releaseActionLock(actionLock, "load");
}

async function loadDailyReport() {
  if (!withActionLock(actionLock, "daily")) return;
  error.value = "";
  try {
    dailyReport.value = await fetchDailyReconciliation(dailyDate.value);
  } catch (err) {
    error.value = getApiErrorMessage(err, "Could not load daily reconciliation.");
  }
  releaseActionLock(actionLock, "daily");
}

async function closeShift() {
  if (!withActionLock(actionLock, "shiftClose")) return;
  error.value = "";
  message.value = "";

  if (!shiftCloseForm.value.shift_key.trim()) {
    error.value = "Shift key is required.";
    releaseActionLock(actionLock, "shiftClose");
    return;
  }
  if (!shiftCloseForm.value.shift_start || !shiftCloseForm.value.shift_end) {
    error.value = "Shift start and end are required.";
    releaseActionLock(actionLock, "shiftClose");
    return;
  }

  try {
    const row = await submitShiftClose({
      shift_key: shiftCloseForm.value.shift_key.trim(),
      shift_start: shiftCloseForm.value.shift_start,
      shift_end: shiftCloseForm.value.shift_end,
      counted_total: Number(shiftCloseForm.value.counted_total || 0),
      notes: shiftCloseForm.value.notes,
    });
    message.value = `Shift closed with variance $${row.variance_amount}.`;
    shiftLookupKey.value = row.shift_key;
    await Promise.all([lookupShift(), loadCoreViews(), loadDailyReport()]);
  } catch (err) {
    error.value = getApiErrorMessage(err, "Could not close shift.");
  }
  releaseActionLock(actionLock, "shiftClose");
}

async function lookupShift() {
  if (!withActionLock(actionLock, "shiftLookup")) return;
  error.value = "";
  try {
    if (!shiftLookupKey.value.trim()) {
      shiftRows.value = [];
      releaseActionLock(actionLock, "shiftLookup");
      return;
    }
    shiftRows.value = await fetchShiftReconciliation(shiftLookupKey.value.trim());
  } catch (err) {
    error.value = getApiErrorMessage(err, "Could not load shift reconciliation history.");
  }
  releaseActionLock(actionLock, "shiftLookup");
}

onMounted(async () => {
  await Promise.all([loadCoreViews(), loadDailyReport()]);
});
</script>

<template>
  <section class="page">
    <h2>Operations Audit and Reconciliation</h2>
    <p>
      Review variance flags, daily and shift reconciliation, audit trails, security
      events, and tamper-evident financial chain health.
    </p>

    <p v-if="hasBusyAction" class="badge">Loading or submitting audit controls...</p>
    <p v-if="message" class="badge">{{ message }}</p>
    <p v-if="error" class="badge muted">{{ error }}</p>

    <div class="panel">
      <h3>Anomaly Alerts</h3>
      <p v-if="!anomalyAlerts.length">No active anomaly flags in the current view.</p>
      <ul v-else class="plain-list">
        <li v-for="item in anomalyAlerts" :key="item.id">{{ item.text }}</li>
      </ul>
    </div>

    <div class="panel">
      <h3>Daily Reconciliation</h3>
      <div class="grid">
        <label>
          <span>Date</span>
          <input v-model="dailyDate" type="date" />
        </label>
      </div>
      <button class="secondary" :disabled="hasBusyAction" @click="loadDailyReport">
        {{ actionLock.daily ? "Loading daily report..." : "Load daily report" }}
      </button>
      <div v-if="dailyReport" class="result-block">
        <p>Date: {{ dailyReport.date }}</p>
        <p>Overall total: ${{ dailyReport.overall_total }}</p>
        <ul class="plain-list">
          <li v-for="row in dailyReport.totals_by_method" :key="row.payment_method">
            {{ row.payment_method }} - ${{ row.total }}
          </li>
        </ul>
      </div>
    </div>

    <form class="panel" @submit.prevent="closeShift">
      <h3>Shift Close Submission</h3>
      <div class="grid">
        <label>
          <span>Shift key</span>
          <input v-model="shiftCloseForm.shift_key" type="text" />
        </label>
        <label>
          <span>Shift start</span>
          <input v-model="shiftCloseForm.shift_start" type="datetime-local" />
        </label>
        <label>
          <span>Shift end</span>
          <input v-model="shiftCloseForm.shift_end" type="datetime-local" />
        </label>
        <label>
          <span>Counted total</span>
          <input v-model="shiftCloseForm.counted_total" type="number" min="0" step="0.01" />
        </label>
        <label>
          <span>Notes</span>
          <input v-model="shiftCloseForm.notes" type="text" />
        </label>
      </div>
      <button :disabled="hasBusyAction" type="submit">
        {{ actionLock.shiftClose ? "Submitting close..." : "Submit shift close" }}
      </button>
    </form>

    <div class="panel">
      <h3>Shift Reconciliation History</h3>
      <div class="grid">
        <label>
          <span>Shift key</span>
          <input v-model="shiftLookupKey" type="text" />
        </label>
      </div>
      <button class="secondary" :disabled="hasBusyAction" @click="lookupShift">
        {{ actionLock.shiftLookup ? "Loading shift rows..." : "Load shift history" }}
      </button>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>shift</th>
              <th>expected</th>
              <th>counted</th>
              <th>variance</th>
              <th>flag</th>
              <th>counted at</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in shiftRows" :key="row.id">
              <td>{{ row.shift_key }}</td>
              <td>${{ row.expected_total }}</td>
              <td>${{ row.counted_total }}</td>
              <td>${{ row.variance_amount }}</td>
              <td>{{ row.variance_flag ? "flagged" : "ok" }}</td>
              <td>{{ row.counted_at }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <h3>Audit Trail Browser</h3>
      <div class="grid">
        <label>
          <span>Entity</span>
          <input v-model="auditFilters.entity" type="text" />
        </label>
        <label>
          <span>Action</span>
          <input v-model="auditFilters.action" type="text" />
        </label>
        <label>
          <span>Actor user ID</span>
          <input v-model="auditFilters.actorUserId" type="text" />
        </label>
      </div>
      <button class="secondary" :disabled="hasBusyAction" @click="loadCoreViews">Refresh audit trails</button>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>created</th>
              <th>entity</th>
              <th>action</th>
              <th>entity id</th>
              <th>actor</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in auditRows" :key="row.id">
              <td>{{ row.created_at }}</td>
              <td>{{ row.entity }}</td>
              <td>{{ row.action }}</td>
              <td>{{ row.entity_id }}</td>
              <td>{{ row.actor_user_id || "system" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <h3>Security Event Browser</h3>
      <button class="secondary" :disabled="hasBusyAction" @click="loadCoreViews">Refresh security events</button>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>time</th>
              <th>severity</th>
              <th>event type</th>
              <th>source</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in securityRows" :key="row.id">
              <td>{{ row.created_at }}</td>
              <td>{{ row.severity }}</td>
              <td>{{ row.event_type }}</td>
              <td>{{ row.source_ip || "n/a" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
