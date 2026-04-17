// True no-mock API test suite: community router endpoints.
//
// Covers:
//   GET /community/feed, GET /community/reports/mine,
//   POST /community/captcha/challenge,
//   POST /community/posts, POST /community/posts/:id/report,
//   GET /community/moderation/queue,
//   POST /community/moderation/posts/:id/decision,
//   POST /community/moderation/reports/:id/decision.

import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  authHeader,
  getDb,
  resetRealDb,
  setupRealDb,
  userIdsByRole,
} from "../../backend/tests/helpers/real-db-harness.js";

let app;

beforeAll(async () => {
  await setupRealDb();
  const { createApp } = await import("../../backend/src/app.js");
  app = createApp().callback();
});

beforeEach(async () => {
  await resetRealDb();
});

async function insertPost(opts = {}) {
  const db = await getDb();
  const id = randomUUID();
  const now = new Date();
  await db("community_posts").insert({
    id,
    user_id: opts.userId || userIdsByRole.member,
    parent_post_id: null,
    content: opts.content || "Hello world",
    status: opts.status || "published",
    hold_reason: null,
    flag_count: 0,
    author_ip: "127.0.0.1",
    device_fingerprint: "test-device",
    published_at: now,
    created_at: now,
    updated_at: now,
  });
  return id;
}

async function insertReport({ postId, reporter = userIdsByRole["member-2"] } = {}) {
  const db = await getDb();
  const id = randomUUID();
  const now = new Date();
  await db("community_reports").insert({
    id,
    post_id: postId,
    reporter_user_id: reporter,
    reason: "spam",
    status: "open",
    created_at: now,
    updated_at: now,
  });
  return id;
}

describe("GET /api/v1/community/feed (no-mock)", () => {
  test("returns data array and pagination", async () => {
    await insertPost();
    const response = await request(app)
      .get("/api/v1/community/feed")
      .set(authHeader("member"));
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeGreaterThanOrEqual(1);
    expect(response.body.pagination.page).toBe(1);
  });
});

describe("GET /api/v1/community/reports/mine (no-mock)", () => {
  test("returns array for reporter", async () => {
    const postId = await insertPost({ userId: userIdsByRole["member-2"] });
    await insertReport({ postId, reporter: userIdsByRole.member });
    const response = await request(app)
      .get("/api/v1/community/reports/mine")
      .set(authHeader("member"))
      .set("x-actor-user-id", userIdsByRole.member);
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
  });
});

describe("POST /api/v1/community/captcha/challenge (no-mock)", () => {
  test("returns challenge id and text", async () => {
    const response = await request(app)
      .post("/api/v1/community/captcha/challenge")
      .set(authHeader("member"))
      .send({});
    expect(response.status).toBe(201);
    expect(typeof response.body.id).toBe("string");
    expect(response.body.challenge_text).toMatch(/\+/);
  });
});

describe("POST /api/v1/community/posts (no-mock)", () => {
  test("creates post for member", async () => {
    const response = await request(app)
      .post("/api/v1/community/posts")
      .set(authHeader("member"))
      .send({ content: "hello" });
    expect(response.status).toBe(201);
    expect(response.body.content).toBe("hello");
    expect(response.body.status).toBe("published");
  });

  test("returns 400 when content missing", async () => {
    const response = await request(app)
      .post("/api/v1/community/posts")
      .set(authHeader("member"))
      .send({});
    expect(response.status).toBe(400);
  });
});

describe("POST /api/v1/community/posts/:id/report (no-mock)", () => {
  test("creates report for post", async () => {
    const postId = await insertPost({ userId: userIdsByRole["member-2"] });
    const response = await request(app)
      .post(`/api/v1/community/posts/${postId}/report`)
      .set(authHeader("member"))
      .send({ reason: "spam" });
    expect(response.status).toBe(201);
    expect(response.body.post_id).toBe(postId);
    expect(response.body.reason).toBe("spam");
  });

  test("returns 404 for unknown post", async () => {
    const response = await request(app)
      .post("/api/v1/community/posts/unknown/report")
      .set(authHeader("member"))
      .send({ reason: "spam" });
    expect(response.status).toBe(404);
  });
});

describe("GET /api/v1/community/moderation/queue (no-mock)", () => {
  test("returns held_posts and reports arrays", async () => {
    const response = await request(app)
      .get("/api/v1/community/moderation/queue")
      .set(authHeader("moderator"));
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.held_posts)).toBe(true);
    expect(Array.isArray(response.body.reports)).toBe(true);
  });

  test("returns 403 for member", async () => {
    const response = await request(app)
      .get("/api/v1/community/moderation/queue")
      .set(authHeader("member"));
    expect(response.status).toBe(403);
  });
});

describe("POST /api/v1/community/moderation/posts/:id/decision (no-mock)", () => {
  test("moderator accepts a held post", async () => {
    const postId = await insertPost({ status: "held" });
    const response = await request(app)
      .post(`/api/v1/community/moderation/posts/${postId}/decision`)
      .set(authHeader("moderator"))
      .send({ decision: "accept", reason: "ok" });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("published");
  });

  test("returns 400 for invalid decision", async () => {
    const postId = await insertPost({ status: "held" });
    const response = await request(app)
      .post(`/api/v1/community/moderation/posts/${postId}/decision`)
      .set(authHeader("moderator"))
      .send({ decision: "bogus", reason: "ok" });
    expect(response.status).toBe(400);
  });
});

describe("POST /api/v1/community/moderation/reports/:id/decision (no-mock)", () => {
  test("moderator resolves a report", async () => {
    const postId = await insertPost({ userId: userIdsByRole["member-2"] });
    const reportId = await insertReport({ postId });
    const response = await request(app)
      .post(`/api/v1/community/moderation/reports/${reportId}/decision`)
      .set(authHeader("moderator"))
      .send({ decision: "accept", reason: "valid report" });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("accepted");
  });
});
