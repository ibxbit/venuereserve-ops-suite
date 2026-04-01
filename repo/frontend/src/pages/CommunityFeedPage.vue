<script setup>
import { onMounted, ref } from "vue";
import {
  createCommunityCaptchaChallenge,
  createCommunityPost,
  fetchCommunityFeed,
  fetchMyCommunityReports,
  reportCommunityPost,
} from "../services/api.js";

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

async function loadFeed() {
  feed.value = await fetchCommunityFeed();
}

async function loadReports() {
  reports.value = await fetchMyCommunityReports();
}

async function getPostCaptcha() {
  currentChallenge.value = await createCommunityCaptchaChallenge({
    device_fingerprint: postForm.value.device_fingerprint,
  });
  postForm.value.captcha_challenge_id = currentChallenge.value.id;
}

async function submitPost() {
  error.value = "";
  message.value = "";
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
  } catch (err) {
    error.value = err?.response?.data?.error || "Failed to submit post.";
  }
}

async function getReportCaptcha(postId) {
  const challenge = await createCommunityCaptchaChallenge({
    device_fingerprint: postForm.value.device_fingerprint,
  });
  reportCaptchaByPost.value = {
    ...reportCaptchaByPost.value,
    [postId]: challenge,
  };
}

async function submitReport(postId) {
  error.value = "";
  message.value = "";
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
    error.value = err?.response?.data?.error || "Failed to report post.";
  }
}

onMounted(async () => {
  await loadFeed();
  await loadReports();
});
</script>

<template>
  <section class="page">
    <h2>Community Feed</h2>
    <p>
      Members can post, reply, and report content with local moderation
      safeguards.
    </p>

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

      <button type="button" class="secondary" @click="getPostCaptcha">
        Get CAPTCHA
      </button>
      <button type="submit">Submit</button>
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
        <button class="secondary" @click="getReportCaptcha(post.id)">
          Get report CAPTCHA
        </button>
        <button @click="submitReport(post.id)">Report</button>

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
