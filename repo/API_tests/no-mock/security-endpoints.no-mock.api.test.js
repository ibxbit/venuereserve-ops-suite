// True no-mock API test suite: security router endpoints.
//
// Covers:
//   POST /auth/register, POST /auth/login,
//   GET /security/events, PUT /security/users/:id/permissions,
//   GET /user-permissions, GET /user-permissions/:id,
//   GET /financial-logs, GET /financial-logs/:id,
//   POST /fines (direct security route, path overlaps with CRUD),
//   POST /refunds/:id/process,
//   GET /reconciliation/daily,
//   POST /reconciliation/shift-close,
//   GET /reconciliation/shift/:shiftKey.

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

describe("POST /api/v1/auth/register (no-mock)", () => {
  test("creates a member account", async () => {
    const email = `new-${randomUUID()}@test.local`;
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({
        full_name: "New User",
        email,
        password: "SecurePass1234",
      });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ role: "member", email });
  });

  test("rejects privileged role registration with 400", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({
        full_name: "Admin attempt",
        email: `admin-${randomUUID()}@test.local`,
        password: "SecurePass1234",
        role: "manager",
      });
    expect(response.status).toBe(400);
  });

  test("rejects duplicate email with 409", async () => {
    const email = `dup-${randomUUID()}@test.local`;
    await request(app)
      .post("/api/v1/auth/register")
      .send({ full_name: "A", email, password: "AnotherPass!" });
    const second = await request(app)
      .post("/api/v1/auth/register")
      .send({ full_name: "B", email, password: "AnotherPass!" });
    expect(second.status).toBe(409);
  });
});

describe("POST /api/v1/auth/login (no-mock)", () => {
  test("returns token on successful login", async () => {
    const email = `login-${randomUUID()}@test.local`;
    await request(app)
      .post("/api/v1/auth/register")
      .send({ full_name: "L", email, password: "SecurePass1234" });
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: "SecurePass1234" });
    expect(response.status).toBe(200);
    expect(typeof response.body.token).toBe("string");
    expect(response.body.role).toBe("member");
  });

  test("returns 401 with invalid credentials", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "nobody@test.local", password: "wrong" });
    expect(response.status).toBe(401);
  });
});

describe("GET /api/v1/security/events (no-mock)", () => {
  test("returns 200 with data/pagination for manager", async () => {
    const response = await request(app)
      .get("/api/v1/security/events")
      .set(authHeader("manager"));
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  test("returns 403 for member", async () => {
    const response = await request(app)
      .get("/api/v1/security/events")
      .set(authHeader("member"));
    expect(response.status).toBe(403);
  });
});

describe("PUT /api/v1/security/users/:id/permissions (no-mock)", () => {
  test("manager grants permission", async () => {
    const response = await request(app)
      .put(`/api/v1/security/users/${userIdsByRole.member}/permissions`)
      .set(authHeader("manager"))
      .send({ permission_key: "users.read", is_allowed: true });
    expect(response.status).toBe(200);
    expect(response.body.permission_key).toBe("users.read");
    expect(response.body.is_allowed).toBe(true);
  });

  test("member cannot mutate permissions (403)", async () => {
    const response = await request(app)
      .put(`/api/v1/security/users/${userIdsByRole.member}/permissions`)
      .set(authHeader("member"))
      .send({ permission_key: "users.read", is_allowed: true });
    expect(response.status).toBe(403);
  });
});

describe("GET /api/v1/user-permissions (no-mock)", () => {
  test("returns empty set initially for manager", async () => {
    const response = await request(app)
      .get("/api/v1/user-permissions")
      .set(authHeader("manager"));
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
  });
});

describe("GET /api/v1/user-permissions/:id (no-mock)", () => {
  test("returns persisted permission row", async () => {
    const put = await request(app)
      .put(`/api/v1/security/users/${userIdsByRole.member}/permissions`)
      .set(authHeader("manager"))
      .send({ permission_key: "users.read", is_allowed: true });
    expect(put.status).toBe(200);
    const db = await getDb();
    const row = await db("user_permissions").first();
    const response = await request(app)
      .get(`/api/v1/user-permissions/${row.id}`)
      .set(authHeader("manager"));
    expect(response.status).toBe(200);
    expect(response.body.permission_key).toBe("users.read");
  });

  test("returns 404 for unknown id", async () => {
    const response = await request(app)
      .get("/api/v1/user-permissions/does-not-exist")
      .set(authHeader("manager"));
    expect(response.status).toBe(404);
  });
});

describe("GET /api/v1/financial-logs (no-mock)", () => {
  test("returns list envelope", async () => {
    const response = await request(app)
      .get("/api/v1/financial-logs")
      .set(authHeader("manager"));
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
  });
});

describe("GET /api/v1/financial-logs/:id (no-mock)", () => {
  test("returns 404 for unknown id", async () => {
    const response = await request(app)
      .get("/api/v1/financial-logs/unknown")
      .set(authHeader("manager"));
    expect(response.status).toBe(404);
  });
});

describe("POST /api/v1/fines (no-mock) - route precedence uses CRUD handler", () => {
  // The CRUD router registers /fines first, so POST /fines hits the CRUD path.
  // The security router also defines POST /fines but it is shadowed by the CRUD
  // route. We assert the CRUD path behavior here.
  test("manager creates a fine via /fines path", async () => {
    const response = await request(app)
      .post("/api/v1/fines")
      .set(authHeader("manager"))
      .send({
        user_id: userIdsByRole.member,
        amount: 7.5,
        status: "issued",
        reason: "late cancel",
      });
    expect(response.status).toBe(201);
    expect(response.body.reason).toBe("late cancel");
  });
});

describe("POST /api/v1/refunds/:id/process (no-mock)", () => {
  test("processes an approved refund", async () => {
    const db = await getDb();
    const orderId = randomUUID();
    const refundId = randomUUID();
    const now = new Date();
    await db("orders").insert({
      id: orderId,
      user_id: userIdsByRole.member,
      total_amount: 20,
      status: "paid",
      state: "paid",
      payment_method: "cash",
      created_at: now,
      updated_at: now,
    });
    await db("refunds").insert({
      id: refundId,
      order_id: orderId,
      amount: 5,
      reason: "goodwill",
      status: "requested",
      created_at: now,
      updated_at: now,
    });
    const response = await request(app)
      .post(`/api/v1/refunds/${refundId}/process`)
      .set(authHeader("manager"))
      .send({ decision: "approved" });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("approved");
  });

  test("returns 404 for unknown refund", async () => {
    const response = await request(app)
      .post("/api/v1/refunds/nope/process")
      .set(authHeader("manager"))
      .send({ decision: "approved" });
    expect(response.status).toBe(404);
  });
});

describe("GET /api/v1/reconciliation/daily (no-mock)", () => {
  test("returns totals_by_method for manager with date", async () => {
    const response = await request(app)
      .get("/api/v1/reconciliation/daily?date=2026-04-17")
      .set(authHeader("manager"));
    expect(response.status).toBe(200);
    expect(response.body.date).toBe("2026-04-17");
    expect(Array.isArray(response.body.totals_by_method)).toBe(true);
  });
});

describe("POST /api/v1/reconciliation/shift-close (no-mock)", () => {
  test("returns 201 with variance info", async () => {
    const response = await request(app)
      .post("/api/v1/reconciliation/shift-close")
      .set(authHeader("manager"))
      .send({
        shift_key: `SHIFT-${randomUUID().slice(0, 6)}`,
        shift_start: new Date().toISOString(),
        shift_end: new Date(Date.now() + 3600_000).toISOString(),
        counted_total: 0,
      });
    expect(response.status).toBe(201);
    expect(response.body.variance_flag === true || response.body.variance_flag === false).toBe(true);
  });
});

describe("GET /api/v1/reconciliation/shift/:shiftKey (no-mock)", () => {
  test("returns array for authorized user", async () => {
    const response = await request(app)
      .get("/api/v1/reconciliation/shift/SHIFT-NONE")
      .set(authHeader("manager"));
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});
