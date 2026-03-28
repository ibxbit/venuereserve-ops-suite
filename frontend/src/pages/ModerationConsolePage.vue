<script setup>
import { onMounted, ref } from "vue";
import {
  decideCommunityPost,
  decideCommunityReport,
  fetchCommunityModerationQueue,
} from "../services/api.js";

const queue = ref({ held_posts: [], reports: [] });
const decisionReasonById = ref({});
const banHoursByReport = ref({});
const message = ref("");
const error = ref("");

async function loadQueue() {
  queue.value = await fetchCommunityModerationQueue();
}

async function decidePost(postId, decision) {
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
    error.value = err?.response?.data?.error || "Post decision failed.";
  }
}

async function decideReport(reportId, decision) {
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
  } catch (err) {
    error.value = err?.response?.data?.error || "Report decision failed.";
  }
}

onMounted(async () => {
  await loadQueue();
});
</script>

<template>
  <section class="page">
    <h2>Moderation Console</h2>
    <p>Review held posts and reports, then accept, reject, or ban users.</p>
    <p v-if="message" class="badge">{{ message }}</p>
    <p v-if="error" class="badge muted">{{ error }}</p>

    <div class="panel">
      <h3>Held Posts</h3>
      <button class="secondary" @click="loadQueue">Refresh queue</button>
      <div v-for="post in queue.held_posts" :key="post.id" class="result-block">
        <p>
          <strong>{{ post.user_id }}</strong> — {{ post.content }}
        </p>
        <p>Hold reason: {{ post.hold_reason || "none" }}</p>
        <label>
          <span>Decision reason</span>
          <input v-model="decisionReasonById[post.id]" type="text" />
        </label>
        <button class="secondary" @click="decidePost(post.id, 'accept')">
          Accept
        </button>
        <button class="danger" @click="decidePost(post.id, 'reject')">
          Reject
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
                  @click="decideReport(report.id, 'accept')"
                >
                  Accept
                </button>
                <button
                  class="secondary"
                  @click="decideReport(report.id, 'reject')"
                >
                  Reject
                </button>
                <button
                  class="danger"
                  @click="decideReport(report.id, 'ban_user')"
                >
                  Ban
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
