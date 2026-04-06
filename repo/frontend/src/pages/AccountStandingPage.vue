<script setup>
import { computed, onMounted, ref } from "vue";
import {
  createReservationOverride,
  fetchAttendanceHistory,
  fetchAccountStanding,
  fetchReservationOverrides,
  fetchStandingPolicy,
  updateStandingPolicy,
} from "../services/api.js";
import {
  getApiErrorMessage,
  hasActiveAction,
  releaseActionLock,
  withActionLock,
} from "../utils/client-helpers.js";

const userId = ref("");
const standing = ref(null);
const policy = ref(null);
const overrides = ref([]);
const attendanceRows = ref([]);
const notice = ref("");
const error = ref("");
const actionLock = ref({
  lookup: false,
  policy: false,
  override: false,
  overridesLoad: false,
  attendanceLoad: false,
});

const hasActionInProgress = computed(() => hasActiveAction(actionLock));

const policyForm = ref({
  lookback_days: 30,
  low_score_threshold: 60,
  no_show_limit: 2,
  no_show_penalty_points: 25,
  check_in_reward_points: 2,
  peak_start_time: "17:00:00",
  peak_end_time: "20:00:00",
});

const overrideForm = ref({
  user_id: "",
  resource_id: "",
  start_time: "",
  end_time: "",
  reason: "",
});

function syncPolicyForm() {
  if (!policy.value) return;
  policyForm.value = {
    lookback_days: Number(policy.value.lookback_days || 30),
    low_score_threshold: Number(policy.value.low_score_threshold || 60),
    no_show_limit: Number(policy.value.no_show_limit || 2),
    no_show_penalty_points: Number(policy.value.no_show_penalty_points || 25),
    check_in_reward_points: Number(policy.value.check_in_reward_points || 2),
    peak_start_time: policy.value.peak_start_time || "17:00:00",
    peak_end_time: policy.value.peak_end_time || "20:00:00",
  };
}

async function loadPolicy() {
  policy.value = await fetchStandingPolicy();
  syncPolicyForm();
}

async function loadOverrides() {
  if (!withActionLock(actionLock, "overridesLoad")) return;
  try {
    overrides.value = await fetchReservationOverrides({
      userId: overrideForm.value.user_id || userId.value,
    });
  } catch (err) {
    error.value = getApiErrorMessage(err, "Could not load overrides.");
  }
  releaseActionLock(actionLock, "overridesLoad");
}

async function loadAttendance() {
  if (!withActionLock(actionLock, "attendanceLoad")) return;
  try {
    attendanceRows.value = await fetchAttendanceHistory(userId.value);
  } catch (err) {
    error.value = getApiErrorMessage(err, "Could not load attendance history.");
  }
  releaseActionLock(actionLock, "attendanceLoad");
}

async function lookupStanding() {
  if (!withActionLock(actionLock, "lookup")) return;
  error.value = "";
  notice.value = "";
  if (!userId.value) {
    error.value = "Enter a user ID first.";
    releaseActionLock(actionLock, "lookup");
    return;
  }
  try {
    standing.value = await fetchAccountStanding(userId.value);
    await loadAttendance();
  } catch (err) {
    error.value = getApiErrorMessage(err, "Could not fetch standing.");
  }
  releaseActionLock(actionLock, "lookup");
}

async function savePolicy() {
  if (!withActionLock(actionLock, "policy")) return;
  error.value = "";
  notice.value = "";
  if (!policy.value?.id) {
    error.value = "Standing policy is not loaded yet.";
    releaseActionLock(actionLock, "policy");
    return;
  }
  try {
    const updated = await updateStandingPolicy(policy.value.id, {
      lookback_days: Number(policyForm.value.lookback_days),
      low_score_threshold: Number(policyForm.value.low_score_threshold),
      no_show_limit: Number(policyForm.value.no_show_limit),
      no_show_penalty_points: Number(policyForm.value.no_show_penalty_points),
      check_in_reward_points: Number(policyForm.value.check_in_reward_points),
      peak_start_time: policyForm.value.peak_start_time,
      peak_end_time: policyForm.value.peak_end_time,
    });
    policy.value = updated;
    syncPolicyForm();
    notice.value = "Standing policy updated.";
  } catch (err) {
    error.value = getApiErrorMessage(err, "Could not update policy.");
  }
  releaseActionLock(actionLock, "policy");
}

async function approveOverride() {
  if (!withActionLock(actionLock, "override")) return;
  error.value = "";
  notice.value = "";
  if (!overrideForm.value.user_id || !overrideForm.value.start_time || !overrideForm.value.end_time) {
    error.value = "User ID, start time, and end time are required for overrides.";
    releaseActionLock(actionLock, "override");
    return;
  }
  if (!overrideForm.value.reason.trim()) {
    error.value = "Reason is required for override approvals.";
    releaseActionLock(actionLock, "override");
    return;
  }
  try {
    await createReservationOverride({
      user_id: overrideForm.value.user_id,
      resource_id: overrideForm.value.resource_id || null,
      start_time: overrideForm.value.start_time,
      end_time: overrideForm.value.end_time,
      reason: overrideForm.value.reason,
    });
    notice.value = "Override approved.";
    await loadOverrides();
  } catch (err) {
    error.value = getApiErrorMessage(err, "Could not approve override.");
  }
  releaseActionLock(actionLock, "override");
}

onMounted(async () => {
  await loadPolicy();
  await loadOverrides();
});
</script>

<template>
  <section class="page">
    <h2>Account Standing</h2>
    <p>
      Track standing scores (0-100), no-show history, and manager overrides for
      restricted peak-hour bookings.
    </p>

    <p v-if="notice" class="badge">{{ notice }}</p>
    <p v-if="error" class="badge muted">{{ error }}</p>

    <div class="panel">
      <h3>Lookup Member Standing</h3>
      <div class="grid">
        <label>
          <span>User ID</span>
          <input v-model="userId" type="text" />
        </label>
      </div>
      <button :disabled="hasActionInProgress" @click="lookupStanding">
        {{ actionLock.lookup ? "Calculating..." : "Calculate standing" }}
      </button>
      <div v-if="standing" class="result-block">
        <p>Standing score: {{ standing.standing_score }}</p>
        <p>
          No-shows in {{ standing.lookback_days }} days:
          {{ standing.no_show_count_lookback }}
        </p>
        <p>
          Peak-hour restricted: {{ standing.peak_restricted ? "Yes" : "No" }}
        </p>
      </div>
    </div>

    <form class="panel" @submit.prevent="savePolicy">
      <h3>Standing Policy (Manager)</h3>
      <div class="grid">
        <label>
          <span>Lookback days</span>
          <input v-model="policyForm.lookback_days" type="number" min="1" />
        </label>
        <label>
          <span>Low score threshold</span>
          <input
            v-model="policyForm.low_score_threshold"
            type="number"
            min="0"
            max="100"
          />
        </label>
        <label>
          <span>No-show limit</span>
          <input v-model="policyForm.no_show_limit" type="number" min="1" />
        </label>
        <label>
          <span>No-show penalty points</span>
          <input
            v-model="policyForm.no_show_penalty_points"
            type="number"
            min="0"
          />
        </label>
        <label>
          <span>Check-in reward points</span>
          <input
            v-model="policyForm.check_in_reward_points"
            type="number"
            min="0"
          />
        </label>
        <label>
          <span>Peak start</span>
          <input v-model="policyForm.peak_start_time" type="time" step="1" />
        </label>
        <label>
          <span>Peak end</span>
          <input v-model="policyForm.peak_end_time" type="time" step="1" />
        </label>
      </div>
      <button :disabled="hasActionInProgress" type="submit">
        {{ actionLock.policy ? "Saving..." : "Save policy" }}
      </button>
    </form>

    <form class="panel" @submit.prevent="approveOverride">
      <h3>Approve Peak-Hour Override (Manager)</h3>
      <div class="grid">
        <label>
          <span>User ID</span>
          <input v-model="overrideForm.user_id" type="text" />
        </label>
        <label>
          <span>Resource ID (optional)</span>
          <input v-model="overrideForm.resource_id" type="text" />
        </label>
        <label>
          <span>Start time</span>
          <input v-model="overrideForm.start_time" type="datetime-local" />
        </label>
        <label>
          <span>End time</span>
          <input v-model="overrideForm.end_time" type="datetime-local" />
        </label>
        <label>
          <span>Reason</span>
          <input v-model="overrideForm.reason" type="text" />
        </label>
      </div>
      <button :disabled="hasActionInProgress" type="submit">
        {{ actionLock.override ? "Approving..." : "Approve override" }}
      </button>
    </form>

    <div class="panel">
      <h3>Overrides</h3>
      <button class="secondary" :disabled="hasActionInProgress" @click="loadOverrides">
        Refresh list
      </button>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>user</th>
              <th>resource</th>
              <th>start</th>
              <th>end</th>
              <th>approved by</th>
              <th>used</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in overrides" :key="row.id">
              <td>{{ row.user_id }}</td>
              <td>{{ row.resource_id || "any" }}</td>
              <td>{{ row.start_time }}</td>
              <td>{{ row.end_time }}</td>
              <td>{{ row.approved_by_user_id }}</td>
              <td>{{ row.used_at || "pending" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <h3>Attendance History</h3>
      <button class="secondary" :disabled="hasActionInProgress" @click="loadAttendance">
        Refresh attendance
      </button>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>user</th>
              <th>reservation</th>
              <th>event</th>
              <th>time</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in attendanceRows" :key="row.id">
              <td>{{ row.user_id }}</td>
              <td>{{ row.reservation_id }}</td>
              <td>{{ row.event_type }}</td>
              <td>{{ row.event_time }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
