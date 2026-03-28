import request from "supertest";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createFakeDb } from "../helpers/fake-db.js";

let fakeDb;

vi.mock("../../src/db.js", () => ({
  get db() {
    return fakeDb;
  },
}));

describe("auth and RBAC APIs", () => {
  beforeEach(() => {
    fakeDb = createFakeDb({
      users: [
        {
          id: "u-locked",
          email: "locked@example.com",
          full_name: "Locked",
          role: "member",
          password_salt: "salt",
          password_hash:
            "7de2f99f9f96f70f2fbdbca8f92d5600b2867e20f44794f4f9ac1a53fef31ebfd036ec24bc2bb05ae3f06ed7f5475fd0cfe70642ddce13f366be4e647131f8fe",
          failed_login_attempts: 8,
          locked_until: new Date(Date.now() + 5 * 60000),
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
      sessions: [
        {
          id: "sess-member",
          user_id: "u1",
          role: "member",
          token: "token-member",
          expires_at: new Date(Date.now() + 60 * 60000),
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
      security_events: [],
      audit_trails: [],
      account_standing_policies: [],
      reservations: [],
      resources: [],
      orders: [],
      refunds: [],
      community_posts: [],
      community_reports: [],
      community_bans: [],
      community_rules: [],
      community_settings: [
        {
          id: "community-default-settings",
          max_posts_per_hour: 10,
          captcha_required: false,
          auto_hold_report_threshold: 3,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
      captcha_challenges: [],
    });
  });

  test("register and login flow returns token", async () => {
    const { createApp } = await import("../../src/app.js");
    const app = createApp().callback();

    const register = await request(app).post("/api/v1/auth/register").send({
      full_name: "Alice",
      email: "alice@example.com",
      password: "StrongPass123",
    });
    expect(register.status).toBe(201);

    const login = await request(app).post("/api/v1/auth/login").send({
      email: "alice@example.com",
      password: "StrongPass123",
    });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
  });

  test("duplicate email returns 409", async () => {
    const { createApp } = await import("../../src/app.js");
    const app = createApp().callback();

    await request(app).post("/api/v1/auth/register").send({
      full_name: "A",
      email: "dup@example.com",
      password: "StrongPass123",
    });
    const second = await request(app).post("/api/v1/auth/register").send({
      full_name: "B",
      email: "dup@example.com",
      password: "StrongPass123",
    });
    expect(second.status).toBe(409);
  });

  test("invalid credentials returns 401", async () => {
    const { createApp } = await import("../../src/app.js");
    const app = createApp().callback();
    const response = await request(app).post("/api/v1/auth/login").send({
      email: "missing@example.com",
      password: "x",
    });
    expect(response.status).toBe(401);
  });

  test("locked account returns 423", async () => {
    const { createApp } = await import("../../src/app.js");
    const app = createApp().callback();
    const response = await request(app).post("/api/v1/auth/login").send({
      email: "locked@example.com",
      password: "anything",
    });
    expect(response.status).toBe(423);
  });

  test("member blocked from moderator queue endpoint", async () => {
    const { createApp } = await import("../../src/app.js");
    const app = createApp().callback();
    const response = await request(app)
      .get("/api/v1/community/moderation/queue")
      .set("Authorization", "Bearer token-member");
    expect(response.status).toBe(403);
  });
});
