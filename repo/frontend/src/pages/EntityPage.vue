<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { getActiveRole, hasPermission } from "../auth/roles.js";
import {
  checkInReservation,
  createEntity,
  deleteEntity,
  fetchList,
  getCachedList,
  markNoShows,
  setCachedList,
  syncQueue,
} from "../services/api.js";

const props = defineProps({
  entity: { type: String, required: true },
  readOnly: { type: Boolean, default: false },
});

const labels = {
  users: "Users",
  "catalog-items": "Catalog Items",
  coupons: "Coupons",
  fines: "Fines",
  "user-permissions": "User Permissions",
  "cash-drawer-counts": "Cash Drawer Counts",
  "security-events": "Security Events",
  "financial-logs": "Financial Logs",
  resources: "Resources",
  reservations: "Reservations",
  orders: "Orders",
  refunds: "Refunds",
  "resource-blocks": "Resource Blocks",
  "reservation-blacklists": "Reservation Blacklists",
  "holiday-rules": "Holiday Rules",
  "community-rules": "Community Rules",
  "community-settings": "Community Settings",
  "community-bans": "Community Bans",
  "audit-trails": "Audit Trails",
};

const templateByEntity = {
  users: { full_name: "", email: "", phone: "", status: "active" },
  "catalog-items": {
    sku: "",
    name: "",
    category: "membership_new",
    base_price: 0,
    currency: "USD",
    fulfillment_path: "instant_activation",
    is_active: true,
    metadata_json: "{}",
  },
  coupons: {
    code: "",
    name: "",
    discount_type: "fixed",
    discount_value: 0,
    min_subtotal: 0,
    max_discount: 0,
    applies_to_category: "",
    is_active: true,
    starts_at: "",
    ends_at: "",
  },
  fines: {
    user_id: "",
    reservation_id: "",
    amount: 0,
    status: "issued",
    reason: "",
    issued_by_user_id: "",
    paid_order_id: "",
  },
  "user-permissions": {
    user_id: "",
    permission_key: "",
    is_allowed: true,
    granted_by_user_id: "",
  },
  "cash-drawer-counts": {
    shift_key: "",
    shift_start: "",
    shift_end: "",
    expected_total: 0,
    counted_total: 0,
    variance_amount: 0,
    variance_flag: false,
    counted_by_user_id: "",
    notes: "",
    counted_at: "",
  },
  "security-events": {},
  "financial-logs": {},
  resources: {
    name: "",
    type: "room",
    capacity: 1,
    is_active: true,
    booking_window_days: 30,
    min_duration_minutes: 30,
    max_duration_minutes: 240,
    early_check_in_minutes: 10,
    late_check_in_grace_minutes: 15,
    allow_slot_stitching: true,
  },
  reservations: {
    user_id: "",
    resource_id: "",
    start_time: "",
    end_time: "",
    exception_request_id: "",
    status: "booked",
    notes: "",
  },
  orders: {
    user_id: "",
    total_amount: 0,
    status: "pending",
    payment_method: "cash",
    notes: "",
  },
  refunds: {
    order_id: "",
    amount: 0,
    reason: "",
    status: "requested",
    processed_at: "",
  },
  "resource-blocks": {
    resource_id: "",
    start_time: "",
    end_time: "",
    reason: "",
    is_active: true,
  },
  "reservation-blacklists": {
    user_id: "",
    resource_id: "",
    blocked_from: "",
    blocked_until: "",
    reason: "",
    is_active: true,
  },
  "holiday-rules": {
    holiday_date: "",
    name: "",
    is_closed: false,
    open_time: "08:00:00",
    close_time: "14:00:00",
    notes: "",
    is_active: true,
  },
  "community-rules": {
    rule_type: "blocklist",
    target_type: "keyword",
    value: "",
    is_active: true,
  },
  "community-settings": {
    max_posts_per_hour: 10,
    max_device_posts_per_hour: 0,
    max_ip_posts_per_hour: 0,
    captcha_required: true,
    auto_hold_report_threshold: 3,
  },
  "community-bans": {
    user_id: "",
    source_report_id: "",
    reason: "",
    is_permanent: false,
    expires_at: "",
    created_by_user_id: "",
  },
  "audit-trails": {},
};

const title = computed(() => labels[props.entity] || props.entity);
const formState = ref({ ...(templateByEntity[props.entity] || {}) });
const rows = ref([]);
const isOffline = ref(false);
const isForbidden = ref(false);
const queueNotice = ref("");

const visibleFields = computed(() => Object.keys(formState.value));
const fieldTypesByEntity = {
  resources: {
    capacity: "number",
    booking_window_days: "number",
    min_duration_minutes: "number",
    max_duration_minutes: "number",
    early_check_in_minutes: "number",
    late_check_in_grace_minutes: "number",
    is_active: "checkbox",
    allow_slot_stitching: "checkbox",
  },
  "catalog-items": {
    base_price: "number",
    is_active: "checkbox",
  },
  coupons: {
    discount_value: "number",
    min_subtotal: "number",
    max_discount: "number",
    is_active: "checkbox",
    starts_at: "datetime-local",
    ends_at: "datetime-local",
  },
  fines: {
    amount: "number",
  },
  "user-permissions": {
    is_allowed: "checkbox",
  },
  "cash-drawer-counts": {
    shift_start: "datetime-local",
    shift_end: "datetime-local",
    expected_total: "number",
    counted_total: "number",
    variance_amount: "number",
    variance_flag: "checkbox",
    counted_at: "datetime-local",
  },
  reservations: {
    start_time: "datetime-local",
    end_time: "datetime-local",
  },
  orders: {
    total_amount: "number",
  },
  refunds: {
    amount: "number",
    processed_at: "datetime-local",
  },
  "resource-blocks": {
    start_time: "datetime-local",
    end_time: "datetime-local",
    is_active: "checkbox",
  },
  "reservation-blacklists": {
    blocked_from: "datetime-local",
    blocked_until: "datetime-local",
    is_active: "checkbox",
  },
  "holiday-rules": {
    holiday_date: "date",
    is_closed: "checkbox",
    is_active: "checkbox",
  },
  "community-rules": {
    is_active: "checkbox",
  },
  "community-settings": {
    max_posts_per_hour: "number",
    max_device_posts_per_hour: "number",
    max_ip_posts_per_hour: "number",
    captcha_required: "checkbox",
    auto_hold_report_threshold: "number",
  },
  "community-bans": {
    is_permanent: "checkbox",
    expires_at: "datetime-local",
  },
};
const writePermissionByEntity = {
  users: "users.write",
  "catalog-items": "resources.write",
  coupons: "resources.write",
  fines: "orders.write",
  "user-permissions": "users.write",
  "cash-drawer-counts": "reports.financial",
  "security-events": "reports.security",
  "financial-logs": "reports.financial",
  resources: "resources.write",
  reservations: "reservations.write",
  orders: "orders.write",
  refunds: "refunds.write",
  "resource-blocks": "resources.write",
  "reservation-blacklists": "users.write",
  "holiday-rules": "resources.write",
  "community-rules": "community.moderate",
  "community-settings": "community.moderate",
  "community-bans": "community.moderate",
  "audit-trails": "audit.read",
};
const canWrite = computed(() => {
  if (props.readOnly) return false;
  const permission = writePermissionByEntity[props.entity];
  return hasPermission(getActiveRole(), permission);
});
const canCheckInReservations = computed(() => {
  return (
    props.entity === "reservations" &&
    hasPermission(getActiveRole(), "reservations.write")
  );
});
const tableColumns = computed(() => {
  if (!rows.value.length) return [];
  return Object.keys(rows.value[0]).slice(0, 8);
});

function inputType(field) {
  const byEntity = fieldTypesByEntity[props.entity] || {};
  if (byEntity[field]) return byEntity[field];
  if (field.includes("amount")) return "number";
  return "text";
}

function normalizePayload(payload) {
  const byEntity = fieldTypesByEntity[props.entity] || {};
  const normalized = { ...payload };
  for (const field of Object.keys(byEntity)) {
    if (!Object.hasOwn(normalized, field)) continue;
    if (byEntity[field] === "number") {
      normalized[field] = Number(normalized[field]);
    }
    if (byEntity[field] === "checkbox") {
      normalized[field] = Boolean(normalized[field]);
    }
  }
  return normalized;
}

async function load() {
  const result = await fetchList(props.entity);
  if (result.forbidden) {
    isForbidden.value = true;
    rows.value = [];
    isOffline.value = false;
    return;
  }
  isForbidden.value = false;
  rows.value = result.data;
  isOffline.value = result.offline;
}

async function addRecord() {
  const payload = normalizePayload(formState.value);
  const result = await createEntity(props.entity, payload);

  if (result.forbidden) {
    queueNotice.value = "Current role cannot create records in this section.";
    return;
  }

  if (result.queued) {
    queueNotice.value =
      "Saved to local queue; will sync when API is reachable.";
    const cached = getCachedList(props.entity);
    const optimistic = [{ id: `local-${Date.now()}`, ...payload }, ...cached];
    setCachedList(props.entity, optimistic);
    rows.value = optimistic;
  } else {
    queueNotice.value = "";
    await load();
  }

  formState.value = { ...(templateByEntity[props.entity] || {}) };
}

async function removeRecord(id) {
  const result = await deleteEntity(props.entity, id);
  if (result.forbidden) {
    queueNotice.value = "Current role cannot delete records in this section.";
    return;
  }
  if (result.queued) {
    queueNotice.value = "Delete operation queued for later sync.";
  }
  rows.value = rows.value.filter((row) => row.id !== id);
  setCachedList(props.entity, rows.value);
}

async function runCheckIn(id) {
  const result = await checkInReservation(id);
  if (result.forbidden) {
    queueNotice.value = "Current role cannot perform check-ins.";
    return;
  }
  if (result.offline) {
    queueNotice.value =
      "Check-in requires backend connectivity on local network.";
    return;
  }
  queueNotice.value =
    result.data.status === "no_show"
      ? "Late grace exceeded. Reservation marked as no-show."
      : "Reservation checked in.";
  await load();
}

async function runMarkNoShows() {
  const result = await markNoShows();
  if (result.forbidden) {
    queueNotice.value = "Current role cannot run no-show marking.";
    return;
  }
  if (result.offline) {
    queueNotice.value = "No-show marking requires backend connectivity.";
    return;
  }
  queueNotice.value = `Marked ${result.data.marked_count} reservation(s) as no-show.`;
  await load();
}

async function handleRoleChanged() {
  queueNotice.value = "";
  await load();
}

onMounted(async () => {
  await syncQueue();
  await load();
  window.addEventListener("studio-role-changed", handleRoleChanged);
});

onBeforeUnmount(() => {
  window.removeEventListener("studio-role-changed", handleRoleChanged);
});
</script>

<template>
  <section class="page">
    <h2>{{ title }}</h2>
    <p v-if="isForbidden" class="badge muted">
      Access is restricted for the active role.
    </p>
    <p v-if="isOffline" class="badge">Offline mode: showing cached records.</p>
    <p v-if="queueNotice" class="badge muted">{{ queueNotice }}</p>

    <form v-if="canWrite" class="panel" @submit.prevent="addRecord">
      <h3>Add {{ title.slice(0, -1) }}</h3>
      <div class="grid">
        <label v-for="field in visibleFields" :key="field">
          <span>{{ field }}</span>
          <input
            v-if="inputType(field) !== 'checkbox'"
            v-model="formState[field]"
            :type="inputType(field)"
          />
          <input v-else v-model="formState[field]" type="checkbox" />
        </label>
      </div>
      <button type="submit">Save</button>
    </form>

    <div v-if="canCheckInReservations" class="panel">
      <h3>Check-In Operations</h3>
      <button @click="runMarkNoShows">Mark expired arrivals as no-show</button>
    </div>

    <div class="panel">
      <h3>Records</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th v-for="column in tableColumns" :key="column">{{ column }}</th>
              <th v-if="canWrite || canCheckInReservations">actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id">
              <td v-for="column in tableColumns" :key="`${row.id}-${column}`">
                {{ row[column] }}
              </td>
              <td v-if="canWrite || canCheckInReservations">
                <button
                  v-if="canCheckInReservations && row.status === 'booked'"
                  class="secondary"
                  @click="runCheckIn(row.id)"
                >
                  Check in
                </button>
                <button
                  v-if="canWrite"
                  class="danger"
                  @click="removeRecord(row.id)"
                >
                  Delete
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
