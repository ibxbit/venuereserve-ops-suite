// True no-mock API test suite: direct endpoints on apiRouter.
//
// This file intentionally does NOT use vi.mock. It boots the real app,
// hits real routes through supertest, and persists via the real db layer
// (backed by an in-memory better-sqlite3 instance for deterministic CI).
//
// Covers: /health, /me/dashboard, /audit-trails, /audit-trails/:id,
//         /reports/financial, /reports/security, /reports/community.

import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  authHeader,
  getDb,
  resetRealDb,
  setupRealDb,
  tokensByRole,
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

describe("GET /api/v1/health (no-mock)", () => {
  test("returns 200 and status=ok", async () => {
    const response = await request(app).get("/api/v1/health");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "ok",
      service: "studio-backend",
    });
    expect(typeof response.body.timestamp).toBe("string");
  });
});

describe("GET /api/v1/me/dashboard (no-mock)", () => {
  test("returns 401 when unauthenticated", async () => {
    const response = await request(app).get("/api/v1/me/dashboard");
    expect(response.status).toBe(401);
    expect(response.body.error).toBeDefined();
  });

  test("returns role + permissions + dashboard for authenticated member", async () => {
    const response = await request(app)
      .get("/api/v1/me/dashboard")
      .set(authHeader("member"));
    expect(response.status).toBe(200);
    expect(response.body.role).toBe("member");
    expect(Array.isArray(response.body.permissions)).toBe(true);
    expect(response.body.dashboard.title).toMatch(/Member/i);
  });

  test("returns manager role for manager token", async () => {
    const response = await request(app)
      .get("/api/v1/me/dashboard")
      .set(authHeader("manager"));
    expect(response.status).toBe(200);
    expect(response.body.role).toBe("manager");
    expect(response.body.permissions).toContain("audit.read");
  });
});

describe("GET /api/v1/audit-trails (no-mock)", () => {
  test("returns 403 for member (no audit.read)", async () => {
    const response = await request(app)
      .get("/api/v1/audit-trails")
      .set(authHeader("member"));
    expect(response.status).toBe(403);
  });

  test("returns 200 with data/pagination for manager", async () => {
    const db = await getDb();
    const now = new Date();
    await db("audit_trails").insert({
      id: randomUUID(),
      entity: "users",
      entity_id: userIdsByRole.member,
      action: "create",
      payload_json: "{}",
      actor_user_id: userIdsByRole.manager,
      created_at: now,
    });
    const response = await request(app)
      .get("/api/v1/audit-trails")
      .set(authHeader("manager"));
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeGreaterThanOrEqual(1);
    expect(response.body.pagination).toMatchObject({ page: 1 });
  });
});

describe("GET /api/v1/audit-trails/:id (no-mock)", () => {
  test("returns 404 for unknown id to manager", async () => {
    const response = await request(app)
      .get("/api/v1/audit-trails/non-existent")
      .set(authHeader("manager"));
    expect(response.status).toBe(404);
  });

  test("returns 200 with the row when it exists", async () => {
    const db = await getDb();
    const id = randomUUID();
    await db("audit_trails").insert({
      id,
      entity: "users",
      entity_id: userIdsByRole.member,
      action: "update",
      payload_json: "{}",
      actor_user_id: userIdsByRole.manager,
      created_at: new Date(),
    });
    const response = await request(app)
      .get(`/api/v1/audit-trails/${id}`)
      .set(authHeader("manager"));
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(id);
    expect(response.body.entity).toBe("users");
    expect(response.body.action).toBe("update");
  });
});

describe("GET /api/v1/reports/financial (no-mock)", () => {
  test("returns 403 for member", async () => {
    const response = await request(app)
      .get("/api/v1/reports/financial")
      .set(authHeader("member"));
    expect(response.status).toBe(403);
  });

  test("returns zeroed metrics for manager on empty dataset", async () => {
    const response = await request(app)
      .get("/api/v1/reports/financial")
      .set(authHeader("manager"));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      orders_count: 0,
      orders_total: 0,
      refunds_count: 0,
      refunds_total: 0,
    });
    expect(typeof response.body.generated_at).toBe("string");
  });
});

describe("GET /api/v1/reports/security (no-mock)", () => {
  test("returns 403 for member", async () => {
    const response = await request(app)
      .get("/api/v1/reports/security")
      .set(authHeader("member"));
    expect(response.status).toBe(403);
  });

  test("returns 200 with timeframe and action_counts for manager", async () => {
    const response = await request(app)
      .get("/api/v1/reports/security")
      .set(authHeader("manager"));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ timeframe: "30_days" });
    expect(Array.isArray(response.body.action_counts)).toBe(true);
  });
});

describe("GET /api/v1/reports/community (no-mock)", () => {
  test("returns 403 for member", async () => {
    const response = await request(app)
      .get("/api/v1/reports/community")
      .set(authHeader("member"));
    expect(response.status).toBe(403);
  });

  test("returns 200 with user_status_breakdown and reservation_status_breakdown for manager", async () => {
    const response = await request(app)
      .get("/api/v1/reports/community")
      .set(authHeader("manager"));
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.user_status_breakdown)).toBe(true);
    expect(Array.isArray(response.body.reservation_status_breakdown)).toBe(
      true,
    );
  });
});
