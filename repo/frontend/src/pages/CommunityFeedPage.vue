<script setup>
import { computed, onMounted, ref } from "vue";
import {
  createCommunityCaptchaChallenge,
  createCommunityPost,
  fetchList,
  fetchCommunityFeed,
  fetchMyCommunityReports,
  reportCommunityPost,
} from "../services/api.js";
import {
  getApiErrorMessage,
  hasActiveAction,
  releaseActionLock,
  withActionLock,
} from "../utils/client-helpers.js";

const feed = ref([]);
const reports = ref([]);
const message = ref("");
const error = ref("");

const postForm = ref({
  content: "",
  parent_post_id: "",
  device_fingerprint: "local-device-1",
  captcha_challenge_id: "",
  captcha_answer: "",
});

const reportReasonByPost = ref({});
const reportCaptchaByPost = ref({});
const reportCaptchaAnswerByPost = ref({});
const currentChallenge = ref(null);
const throttleSettings = ref(null);
const actionLock = ref({
  feed: false,
  reports: false,
  postCaptcha: false,
  submitPost: false,
  reportCaptcha: false,
  submitReport: false,
});

const hasActionInProgress = computed(() => hasActiveAction(actionLock));

const throttleNotes = computed(() => {
  if (!throttleSettings.value) return [];
  const row = throttleSettings.value;
  return [
    `Posts per hour: ${Number(row.max_posts_per_hour || 0)}`,
    `Per-device limit: ${Number(row.max_device_posts_per_hour || 0) || "not enforced"}`,
    `Per-IP limit: ${Number(row.max_ip_posts_per_hour || 0) || "not enforced"}`,
    `CAPTCHA required: ${row.captcha_required ? "yes" : "no"}`,
  ];
});

async function loadFeed() {
  if (!withActionLock(actionLock, "feed")) return;
  try {
    feed.value = await fetchCommunityFeed();
  } catch (err) {
    error.value = getApiErrorMessage(err, "Could not load community feed.");
  }
  releaseActionLock(actionLock, "feed");
}

async function loadReports() {
  if (!withActionLock(actionLock, "reports")) return;
  try {
    reports.value = await fetchMyCommunityReports();
  } catch (err) {
    error.value = getApiErrorMessage(err, "Could not load report status.");
  }
  releaseActionLock(actionLock, "reports");
}

async function loadModerationSettings() {
  try {
    const result = await fetchList("community-settings", { page: 1, perPage: 1 });
    throttleSettings.value = result.data?.[0] || null;
  } catch {
    throttleSettings.value = null;
  }
}

async function getPostCaptcha() {
  if (!withActionLock(actionLock, "postCaptcha")) return;
  try {
    currentChallenge.value = await createCommunityCaptchaChallenge({
      device_fingerprint: postForm.value.device_fingerprint,
    });
    postForm.value.captcha_challenge_id = currentChallenge.value.id;
  } catch (err) {
    error.value = getApiErrorMessage(err, "Could not create CAPTCHA challenge.");
  }
  releaseActionLock(actionLock, "postCaptcha");
}

async function submitPost() {
  if (!withActionLock(actionLock, "submitPost")) return;
  error.value = "";
  message.value = "";
  if (!postForm.value.content.trim()) {
    error.value = "Post content is required.";
    releaseActionLock(actionLock, "submitPost");
    return;
  }
  try {
    const row = await createCommunityPost({
      content: postForm.value.content,
      parent_post_id: postForm.value.parent_post_id || null,
      device_fingerprint: postForm.value.device_fingerprint,
      captcha_challenge_id: postForm.value.captcha_challenge_id,
      captcha_answer: postForm.value.captcha_answer,
    });
    message.value =
      row.status === "held"
        ? "Post submitted and held for moderation review."
        : "Post published.";
    postForm.value.content = "";
    postForm.value.parent_post_id = "";
    postForm.value.captcha_answer = "";
    currentChallenge.value = null;
    await loadFeed();
    await loadReports();
  } catch (err) {
    error.value = getApiErrorMessage(err, "Failed to submit post.");
  }
  releaseActionLock(actionLock, "submitPost");
}

async function getReportCaptcha(postId) {
  if (!withActionLock(actionLock, "reportCaptcha")) return;
  try {
    const challenge = await createCommunityCaptchaChallenge({
      device_fingerprint: postForm.value.device_fingerprint,
    });
    reportCaptchaByPost.value = {
      ...reportCaptchaByPost.value,
      [postId]: challenge,
    };
  } catch (err) {
    error.value = getApiErrorMessage(err, "Could not create report CAPTCHA.");
  }
  releaseActionLock(actionLock, "reportCaptcha");
}

async function submitReport(postId) {
  if (!withActionLock(actionLock, "submitReport")) return;
  error.value = "";
  message.value = "";
  if (!String(reportReasonByPost.value[postId] || "").trim()) {
    error.value = "Report reason is required.";
    releaseActionLock(actionLock, "submitReport");
    return;
  }
  try {
    const row = await reportCommunityPost(postId, {
      reason: reportReasonByPost.value[postId],
      device_fingerprint: postForm.value.device_fingerprint,
      captcha_challenge_id: reportCaptchaByPost.value[postId]?.id,
      captcha_answer: reportCaptchaAnswerByPost.value[postId],
    });
    message.value = `Report submitted with status: ${row.status}`;
    await loadReports();
  } catch (err) {
    error.value = getApiErrorMessage(err, "Failed to report post.");
  }
  releaseActionLock(actionLock, "submitReport");
}

onMounted(async () => {
  await Promise.all([loadFeed(), loadReports(), loadModerationSettings()]);
});
</script>

<template>
  <section class="page">
    <h2>Community Feed</h2>
    <p>
      Members can post, reply, and report content with local moderation
      safeguards.
    </p>

    <div v-if="throttleNotes.length" class="panel">
      <h3>Posting and Report Safeguards</h3>
      <ul class="plain-list">
        <li v-for="note in throttleNotes" :key="note">{{ note }}</li>
      </ul>
    </div>

    <p v-if="message" class="badge">{{ message }}</p>
    <p v-if="error" class="badge muted">{{ error }}</p>

    <form class="panel" @submit.prevent="submitPost">
      <h3>Create Post or Reply</h3>
      <div class="grid">
        <label>
          <span>Content</span>
          <input v-model="postForm.content" type="text" />
        </label>
        <label>
          <span>Reply to Post ID (optional)</span>
          <input v-model="postForm.parent_post_id" type="text" />
        </label>
        <label>
          <span>Device Fingerprint</span>
          <input v-model="postForm.device_fingerprint" type="text" />
        </label>
      </div>

      <div class="grid">
        <label>
          <span>Captcha Challenge</span>
          <input
            :value="currentChallenge?.challenge_text || ''"
            type="text"
            disabled
          />
        </label>
        <label>
          <span>Captcha Answer</span>
          <input v-model="postForm.captcha_answer" type="text" />
        </label>
      </div>

      <button type="button" class="secondary" :disabled="hasActionInProgress" @click="getPostCaptcha">
        Get CAPTCHA
      </button>
      <button :disabled="hasActionInProgress" type="submit">
        {{ actionLock.submitPost ? "Submitting..." : "Submit" }}
      </button>
    </form>

    <div class="panel">
      <h3>Feed</h3>
      <div v-for="post in feed" :key="post.id" class="result-block">
        <p>
          <strong>{{ post.user_id }}</strong> — {{ post.content }}
        </p>
        <p>Status: {{ post.status }}</p>

        <div class="grid">
          <label>
            <span>Report reason</span>
            <input v-model="reportReasonByPost[post.id]" type="text" />
          </label>
          <label>
            <span>Report CAPTCHA</span>
            <input
              :value="reportCaptchaByPost[post.id]?.challenge_text || ''"
              type="text"
              disabled
            />
          </label>
          <label>
            <span>Captcha answer</span>
            <input v-model="reportCaptchaAnswerByPost[post.id]" type="text" />
          </label>
        </div>
        <button class="secondary" :disabled="hasActionInProgress" @click="getReportCaptcha(post.id)">
          Get report CAPTCHA
        </button>
        <button :disabled="hasActionInProgress" @click="submitReport(post.id)">
          {{ actionLock.submitReport ? "Reporting..." : "Report" }}
        </button>

        <div v-if="post.replies?.length">
          <p><strong>Replies</strong></p>
          <ul class="plain-list">
            <li v-for="reply in post.replies" :key="reply.id">
              {{ reply.user_id }}: {{ reply.content }}
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div class="panel">
      <h3>My Reports</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>report id</th>
              <th>post id</th>
              <th>status</th>
              <th>reason</th>
              <th>resolution</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in reports" :key="row.id">
              <td>{{ row.id }}</td>
              <td>{{ row.post_id }}</td>
              <td>{{ row.status }}</td>
              <td>{{ row.reason }}</td>
              <td>{{ row.resolution_note || "pending review" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
