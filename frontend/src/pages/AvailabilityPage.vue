<script setup>
import { computed, onMounted, ref } from "vue";
import {
  createBookingException,
  fetchAvailability,
  fetchList,
} from "../services/api.js";

const resources = ref([]);
const rows = ref([]);
const alternatives = ref([]);
const requested = ref(null);
const dayRule = ref(null);
const errorMessage = ref("");
const notice = ref("");
const loading = ref(false);
const exceptionReason = ref("");
const requestedExceptionId = ref("");

const form = ref({
  resource_id: "",
  user_id: "member-local",
  date: new Date().toISOString().slice(0, 10),
  start_time: "09:00",
  duration_minutes: 30,
});

const conflictRows = computed(() =>
  rows.value.filter((slot) => !slot.available),
);

async function loadResources() {
  const result = await fetchList("resources");
  resources.value = result.data || [];
  if (!form.value.resource_id && resources.value.length) {
    form.value.resource_id = resources.value[0].id;
  }
}

async function browse() {
  if (!form.value.resource_id) {
    errorMessage.value = "Select a resource first.";
    return;
  }

  loading.value = true;
  errorMessage.value = "";
  notice.value = "";
  try {
    const data = await fetchAvailability({
      resourceId: form.value.resource_id,
      date: form.value.date,
      durationMinutes: Number(form.value.duration_minutes),
      userId: form.value.user_id,
      startTime: form.value.start_time,
    });
    rows.value = data.slots || [];
    alternatives.value = data.alternatives || [];
    requested.value = data.requested;
    dayRule.value = data.day_rule || null;
  } catch (error) {
    const details = error?.response?.data?.details;
    if (Array.isArray(details) && details.length) {
      errorMessage.value = details.map((item) => item.message).join(" ");
    } else {
      errorMessage.value =
        error?.response?.data?.error ||
        "Could not load availability from local API.";
    }
    rows.value = [];
    alternatives.value = [];
    requested.value = null;
    dayRule.value = null;
  }
  loading.value = false;
}

function applyAlternative(isoTime) {
  const date = new Date(isoTime);
  form.value.start_time = date.toTimeString().slice(0, 5);
}

async function requestException() {
  if (!requested.value || requested.value.available) {
    errorMessage.value =
      "Only conflicting requested slots can be sent for exception approval.";
    return;
  }
  if (!exceptionReason.value.trim()) {
    errorMessage.value = "Enter reason text for manager approval.";
    return;
  }

  errorMessage.value = "";
  try {
    const created = await createBookingException({
      user_id: form.value.user_id,
      resource_id: form.value.resource_id,
      start_time: requested.value.start_time,
      end_time: requested.value.end_time,
      request_reason: exceptionReason.value.trim(),
      payload: {
        conflicts: requested.value.conflicts,
        date: form.value.date,
        preferred_start: form.value.start_time,
        duration_minutes: Number(form.value.duration_minutes),
      },
    });
    requestedExceptionId.value = created.id;
    notice.value = `Exception request submitted (${created.id}). Waiting manager decision.`;
    exceptionReason.value = "";
  } catch (error) {
    errorMessage.value =
      error?.response?.data?.error || "Could not submit exception request.";
  }
}

onMounted(async () => {
  await loadResources();
  if (form.value.resource_id) {
    await browse();
  }
});
</script>

<template>
  <section class="page">
    <h2>Availability Browser</h2>
    <p>
      Browse by date and time, inspect plain-language conflict reasons, and use
      suggested alternatives or manual adjustments.
    </p>

    <form class="panel" @submit.prevent="browse">
      <div class="grid">
        <label>
          <span>Resource</span>
          <select v-model="form.resource_id">
            <option
              v-for="resource in resources"
              :key="resource.id"
              :value="resource.id"
            >
              {{ resource.name }} ({{ resource.type }})
            </option>
          </select>
        </label>
        <label>
          <span>Member/User ID</span>
          <input v-model="form.user_id" type="text" />
        </label>
        <label>
          <span>Date</span>
          <input v-model="form.date" type="date" />
        </label>
        <label>
          <span>Preferred Start</span>
          <input v-model="form.start_time" type="time" />
        </label>
        <label>
          <span>Duration (minutes)</span>
          <input
            v-model="form.duration_minutes"
            type="number"
            step="30"
            min="30"
            max="240"
          />
        </label>
      </div>
      <button type="submit">Browse availability</button>
    </form>

    <p v-if="loading" class="badge">
      <span class="spinner" />
      Loading availability...
    </p>
    <p v-if="notice" class="badge">{{ notice }}</p>
    <p v-if="errorMessage" class="badge muted">{{ errorMessage }}</p>

    <div v-if="dayRule" class="panel">
      <h3>Calendar Rule</h3>
      <p v-if="dayRule.source === 'holiday'">
        Holiday: {{ dayRule.holiday_name }}
        <span v-if="dayRule.is_closed">(Closed)</span>
        <span v-else>({{ dayRule.open_time }} - {{ dayRule.close_time }})</span>
      </p>
      <p v-else>
        Standard hours: {{ dayRule.open_time }} - {{ dayRule.close_time }}
      </p>
      <p v-if="dayRule.notes">{{ dayRule.notes }}</p>
    </div>

    <div v-if="requested" class="panel">
      <h3>Requested Slot</h3>
      <p>
        {{ requested.start_time }} - {{ requested.end_time }}
        <strong>{{ requested.available ? "Available" : "Conflict" }}</strong>
      </p>
      <ul v-if="!requested.available" class="plain-list">
        <li v-for="reason in requested.conflicts" :key="reason">
          {{ reason }}
        </li>
      </ul>
      <div v-if="requested && !requested.available" class="grid">
        <label>
          <span>Exception reason (for manager approval)</span>
          <input v-model="exceptionReason" type="text" />
        </label>
      </div>
      <button
        v-if="requested && !requested.available"
        type="button"
        @click="requestException"
      >
        Request manager exception
      </button>
      <p v-if="requestedExceptionId">Request ID: {{ requestedExceptionId }}</p>
    </div>

    <div v-if="alternatives.length" class="panel">
      <h3>Suggested Alternatives</h3>
      <div class="grid">
        <button
          v-for="slot in alternatives"
          :key="slot.start_time"
          class="secondary"
          type="button"
          @click="applyAlternative(slot.start_time)"
        >
          {{ slot.start_time.slice(11, 16) }} -
          {{ slot.end_time.slice(11, 16) }}
        </button>
      </div>
      <p>
        Pick one suggestion above, then browse again or manually adjust time and
        duration.
      </p>
    </div>

    <div class="panel">
      <h3>Conflict Highlights</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>start</th>
              <th>end</th>
              <th>status</th>
              <th>explanation</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="slot in conflictRows" :key="slot.start_time">
              <td>{{ slot.start_time }}</td>
              <td>{{ slot.end_time }}</td>
              <td>conflict</td>
              <td>{{ slot.conflicts.join(" ") }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
