<script setup>
import { computed, onMounted, ref } from "vue";
import {
  decideBookingException,
  fetchBookingExceptions,
} from "../services/api.js";
import {
  getApiErrorMessage,
  hasActiveAction,
  releaseActionLock,
  withActionLock,
} from "../utils/client-helpers.js";

const rows = ref([]);
const loading = ref(false);
const notice = ref("");
const error = ref("");
const decisionReason = ref({});
const actionLock = ref({
  load: false,
  decide: false,
});

const hasActionInProgress = computed(() => hasActiveAction(actionLock));

async function loadPending() {
  if (!withActionLock(actionLock, "load")) return;
  loading.value = true;
  error.value = "";
  try {
    rows.value = await fetchBookingExceptions({ status: "pending" });
  } catch (err) {
    error.value = getApiErrorMessage(err, "Could not load pending exceptions.");
  }
  loading.value = false;
  releaseActionLock(actionLock, "load");
}

async function decide(id, decision) {
  if (!withActionLock(actionLock, "decide")) return;
  const reason = String(decisionReason.value[id] || "").trim();
  if (!reason) {
    error.value = "Decision reason is required.";
    releaseActionLock(actionLock, "decide");
    return;
  }

  error.value = "";
  notice.value = "";
  try {
    await decideBookingException(id, {
      decision,
      decision_reason: reason,
    });
    notice.value = `Request ${id} ${decision}.`;
    await loadPending();
  } catch (err) {
    error.value = getApiErrorMessage(err, "Could not submit decision.");
  }
  releaseActionLock(actionLock, "decide");
}

onMounted(async () => {
  await loadPending();
});
</script>

<template>
  <section class="page">
    <h2>Booking Exception Approvals</h2>
    <p>
      Managers review exception requests and submit justification for each
      decision.
    </p>
    <p v-if="loading" class="badge">Loading pending requests...</p>
    <p v-if="notice" class="badge">{{ notice }}</p>
    <p v-if="error" class="badge muted">{{ error }}</p>

    <div class="panel">
      <button class="secondary" :disabled="hasActionInProgress" @click="loadPending">
        {{ actionLock.load ? "Refreshing..." : "Refresh pending" }}
      </button>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>request id</th>
              <th>user</th>
              <th>resource</th>
              <th>time range</th>
              <th>reason</th>
              <th>decision reason</th>
              <th>actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id">
              <td>{{ row.id }}</td>
              <td>{{ row.user_id }}</td>
              <td>{{ row.resource_id }}</td>
              <td>{{ row.start_time }} - {{ row.end_time }}</td>
              <td>{{ row.request_reason }}</td>
              <td>
                <input v-model="decisionReason[row.id]" type="text" />
              </td>
              <td>
                <button class="secondary" :disabled="hasActionInProgress" @click="decide(row.id, 'approved')">
                  Approve
                </button>
                <button class="danger" :disabled="hasActionInProgress" @click="decide(row.id, 'rejected')">
                  Reject
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
