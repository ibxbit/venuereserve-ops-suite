import request from "supertest";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createFakeDb } from "../backend/tests/helpers/fake-db.js";

let fakeDb;

vi.mock("../backend/src/db.js", () => ({
  get db() {
    return fakeDb;
  },
}));

function seedState() {
  return {
    users: [
      {
        id: "member-1",
        full_name: "Member One",
        email: "member@example.com",
        role: "member",
        status: "active",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    sessions: [
      {
        id: "sess-1",
        user_id: "member-1",
        role: "member",
        token: "token-member",
        expires_at: new Date(Date.now() + 60 * 60000),
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    user_permissions: [],
    booking_exception_requests: [],
    audit_trails: [],
  };
}

describe("API tests", () => {
  beforeEach(() => {
    fakeDb = createFakeDb(seedState());
  });

  test("returns 401 + JSON for unauthenticated dashboard", async () => {
    const { createApp } = await import("../backend/src/app.js");
    const app = createApp().callback();

    const response = await request(app).get("/api/v1/me/dashboard");

    expect(response.status).toBe(401);
    expect(response.body).toEqual(
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  test("enforces RBAC with 403 for manager-only workflow", async () => {
    const { createApp } = await import("../backend/src/app.js");
    const app = createApp().callback();

    const response = await request(app)
      .post("/api/v1/booking-exceptions/req-1/decision")
      .set("Authorization", "Bearer token-member")
      .send({ decision: "approved", decision_reason: "ok" });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("forbidden");
  });

  test("persists booking exception rows without external dependencies", async () => {
    const { createApp } = await import("../backend/src/app.js");
    const app = createApp().callback();

    const createResponse = await request(app)
      .post("/api/v1/booking-exceptions")
      .set("Authorization", "Bearer token-member")
      .send({
        user_id: "member-1",
        resource_id: "resource-1",
        start_time: "2026-04-02T10:00:00.000Z",
        end_time: "2026-04-02T10:30:00.000Z",
        request_reason: "Need exception",
      });

    expect(createResponse.status).toBe(201);

    const listResponse = await request(app)
      .get("/api/v1/booking-exceptions")
      .set("Authorization", "Bearer token-member")
      .query({ user_id: "member-1" });

    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body)).toBe(true);
    expect(listResponse.body.length).toBe(1);
  });

  test("returns 400 + JSON message for invalid request payload", async () => {
    const { createApp } = await import("../backend/src/app.js");
    const app = createApp().callback();

    const response = await request(app)
      .post("/api/v1/booking-exceptions")
      .set("Authorization", "Bearer token-member")
      .send({ user_id: "member-1" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({ error: expect.any(String) }),
    );
  });
});
