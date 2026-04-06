<script setup>
import { computed, onMounted, ref } from "vue";
import {
  decideCommunityPost,
  decideCommunityReport,
  fetchCommunityModerationQueue,
  fetchList,
} from "../services/api.js";
import {
  getApiErrorMessage,
  hasActiveAction,
  releaseActionLock,
  withActionLock,
} from "../utils/client-helpers.js";

const queue = ref({ held_posts: [], reports: [] });
const settings = ref([]);
const rules = ref([]);
const bans = ref([]);
const decisionReasonById = ref({});
const banHoursByReport = ref({});
const message = ref("");
const error = ref("");
const actionLock = ref({
  queue: false,
  policy: false,
  postDecision: false,
  reportDecision: false,
});

const hasActionInProgress = computed(() => hasActiveAction(actionLock));
const moderationSettings = computed(() => settings.value[0] || null);

const moderationThresholdNotes = computed(() => {
  const policy = moderationSettings.value;
  if (!policy) return [];
  return [
    `Posts per user per hour: ${Number(policy.max_posts_per_hour || 0)}`,
    `Posts per device per hour: ${Number(policy.max_device_posts_per_hour || 0) || "not enforced"}`,
    `Posts per IP per hour: ${Number(policy.max_ip_posts_per_hour || 0) || "not enforced"}`,
    `CAPTCHA required: ${policy.captcha_required ? "yes" : "no"}`,
    `Auto-hold threshold: ${Number(policy.auto_hold_report_threshold || 0)} reports`,
  ];
});

async function loadQueue() {
  if (!withActionLock(actionLock, "queue")) return;
  try {
    queue.value = await fetchCommunityModerationQueue();
  } catch (err) {
    error.value = getApiErrorMessage(err, "Could not load moderation queue.");
  }
  releaseActionLock(actionLock, "queue");
}

async function loadModerationPolicy() {
  if (!withActionLock(actionLock, "policy")) return;
  try {
    const [settingsResult, rulesResult, bansResult] = await Promise.all([
      fetchList("community-settings", { page: 1, perPage: 1 }),
      fetchList("community-rules", { page: 1, perPage: 200 }),
      fetchList("community-bans", { page: 1, perPage: 200 }),
    ]);
    settings.value = settingsResult.data || [];
    rules.value = rulesResult.data || [];
    bans.value = bansResult.data || [];
  } catch (err) {
    error.value = getApiErrorMessage(
      err,
      "Could not load moderation throttle and ban policy.",
    );
  }
  releaseActionLock(actionLock, "policy");
}

async function decidePost(postId, decision) {
  if (!withActionLock(actionLock, "postDecision")) return;
  error.value = "";
  message.value = "";
  try {
    await decideCommunityPost(postId, {
      decision,
      reason: decisionReasonById.value[postId] || "Reviewed by moderator",
    });
    message.value = `Post ${postId} ${decision}ed.`;
    await loadQueue();
  } catch (err) {
    error.value = getApiErrorMessage(err, "Post decision failed.");
  }
  releaseActionLock(actionLock, "postDecision");
}

async function decideReport(reportId, decision) {
  if (!withActionLock(actionLock, "reportDecision")) return;
  error.value = "";
  message.value = "";
  try {
    await decideCommunityReport(reportId, {
      decision,
      reason: decisionReasonById.value[reportId] || "Reviewed by moderator",
      ban_duration_hours:
        decision === "ban_user"
          ? Number(banHoursByReport.value[reportId] || 24)
          : undefined,
    });
    message.value = `Report ${reportId} decision saved.`;
    await loadQueue();
    await loadModerationPolicy();
  } catch (err) {
    error.value = getApiErrorMessage(err, "Report decision failed.");
  }
  releaseActionLock(actionLock, "reportDecision");
}

onMounted(async () => {
  await Promise.all([loadQueue(), loadModerationPolicy()]);
});
</script>

<template>
  <section class="page">
    <h2>Moderation Console</h2>
    <p>Review held posts and reports, then accept, reject, or ban users.</p>
    <p v-if="actionLock.queue || actionLock.policy" class="badge">Loading moderation data...</p>
    <p v-if="message" class="badge">{{ message }}</p>
    <p v-if="error" class="badge muted">{{ error }}</p>

    <div class="panel">
      <h3>Moderation Throttles and Safeguards</h3>
      <button class="secondary" :disabled="hasActionInProgress" @click="loadModerationPolicy">
        Refresh policy
      </button>
      <ul class="plain-list">
        <li v-for="note in moderationThresholdNotes" :key="note">{{ note }}</li>
      </ul>
      <p>
        Active allowlist rules:
        {{ rules.filter((row) => row.rule_type === "allowlist" && row.is_active).length }}
        | Active blocklist rules:
        {{ rules.filter((row) => row.rule_type === "blocklist" && row.is_active).length }}
      </p>
      <p>Current active bans (temporary/permanent): {{ bans.length }}</p>
    </div>

    <div class="panel">
      <h3>Held Posts</h3>
      <button class="secondary" :disabled="hasActionInProgress" @click="loadQueue">Refresh queue</button>
      <div v-for="post in queue.held_posts" :key="post.id" class="result-block">
        <p>
          <strong>{{ post.user_id }}</strong> — {{ post.content }}
        </p>
        <p>Hold reason: {{ post.hold_reason || "none" }}</p>
        <label>
          <span>Decision reason</span>
          <input v-model="decisionReasonById[post.id]" type="text" />
        </label>
        <button class="secondary" :disabled="hasActionInProgress || actionLock.postDecision" @click="decidePost(post.id, 'accept')">
          {{ actionLock.postDecision ? "Accepting..." : "Accept" }}
        </button>
        <button class="danger" :disabled="hasActionInProgress || actionLock.postDecision" @click="decidePost(post.id, 'reject')">
          {{ actionLock.postDecision ? "Rejecting..." : "Reject" }}
        </button>
      </div>
    </div>

    <div class="panel">
      <h3>Reports</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>report id</th>
              <th>post id</th>
              <th>reason</th>
              <th>decision reason</th>
              <th>ban duration h</th>
              <th>actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="report in queue.reports" :key="report.id">
              <td>{{ report.id }}</td>
              <td>{{ report.post_id }}</td>
              <td>{{ report.reason }}</td>
              <td>
                <input v-model="decisionReasonById[report.id]" type="text" />
              </td>
              <td>
                <input
                  v-model="banHoursByReport[report.id]"
                  type="number"
                  min="1"
                />
              </td>
              <td>
                <button
                  class="secondary"
                  :disabled="hasActionInProgress || actionLock.reportDecision"
                  @click="decideReport(report.id, 'accept')"
                >
                  {{ actionLock.reportDecision ? "Accepting..." : "Accept" }}
                </button>
                <button
                  class="secondary"
                  :disabled="hasActionInProgress || actionLock.reportDecision"
                  @click="decideReport(report.id, 'reject')"
                >
                  {{ actionLock.reportDecision ? "Rejecting..." : "Reject" }}
                </button>
                <button
                  class="danger"
                  :disabled="hasActionInProgress || actionLock.reportDecision"
                  @click="decideReport(report.id, 'ban_user')"
                >
                  {{ actionLock.reportDecision ? "Banning..." : "Ban" }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
