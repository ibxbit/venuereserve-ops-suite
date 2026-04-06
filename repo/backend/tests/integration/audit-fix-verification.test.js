import request from "supertest";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createFakeDb } from "../helpers/fake-db.js";

// Vitest hoisted mock requires variables to start with 'mock'
const mockFakeDb = createFakeDb();

vi.mock("../../src/db.js", () => ({
  db: Object.assign((table) => mockFakeDb(table), {
    raw: (...args) => mockFakeDb.raw(...args),
    transaction: (...args) => mockFakeDb.transaction(...args),
  }),
}));

// Now import app - must be after mock
const { app } = await import("../../src/app.js");

const TOKENS = {
  member: "token-member",
  manager: "token-manager",
  attacker: "token-attacker",
};

describe("Audit Fix Verification (TASK-46)", () => {
  beforeEach(async () => {
    // Reset the state of the shared mock db
    const state = mockFakeDb.__state;
    Object.keys(state).forEach(key => delete state[key]);
    
    Object.assign(state, {
      users: [
        { id: "u-member", role: "member", email: "m@test.com" },
        { id: "u-manager", role: "manager", email: "mgr@test.com" },
        { id: "u-attacker", role: "member", email: "atk@test.com" },
      ],
      sessions: [
        { user_id: "u-member", role: "member", token: TOKENS.member, expires_at: new Date(Date.now() + 1e9) },
        { user_id: "u-manager", role: "manager", token: TOKENS.manager, expires_at: new Date(Date.now() + 1e9) },
        { user_id: "u-attacker", role: "member", token: TOKENS.attacker, expires_at: new Date(Date.now() + 1e9) },
      ],
      user_permissions: [
        { id: "p-1", user_id: "u-member", permission_key: "reservations.write", is_allowed: true, created_at: new Date() },
      ],
      orders: [
        { id: "o-1", user_id: "u-member", total_amount: 100, state: "pending_payment", created_at: new Date() },
        { id: "o-2", user_id: "u-attacker", total_amount: 50, state: "pending_payment", created_at: new Date() },
      ],
      financial_logs: [
        { id: "l-1", entry_type: "payment", amount: 100, entry_hash: "abc", created_at: new Date() },
      ],
    });
  });

  describe("F-001: Privilege Escalation Prevention", () => {
    test("Generic POST /user-permissions is disabled (should return 404 or 405)", async () => {
      const res = await request(app.callback())
        .post("/api/v1/user-permissions")
        .set("Authorization", `Bearer ${TOKENS.member}`)
        .send({ user_id: "u-member", permission_key: "users.write", is_allowed: true });
      
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    test("Only managers can mutate permissions via security endpoint", async () => {
      const res = await request(app.callback())
        .put("/api/v1/security/users/u-member/permissions")
        .set("Authorization", `Bearer ${TOKENS.member}`)
        .send({ permission_key: "users.write", is_allowed: true });
      
      expect(res.status).toBe(403);
    });

    test("Managers can READ permissions via new GET route", async () => {
      const res = await request(app.callback())
        .get("/api/v1/user-permissions")
        .set("Authorization", `Bearer ${TOKENS.manager}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });
  });

  describe("F-002: Order State Bypass Prevention", () => {
    test("Generic POST /orders is disabled", async () => {
      const res = await request(app.callback())
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${TOKENS.member}`)
        .send({ user_id: "u-member", total_amount: 0, state: "paid" });
      
      expect(res.status).toBe(404);
    });

    test("GET /orders enforces ownership for members", async () => {
      const res = await request(app.callback())
        .get("/api/v1/orders")
        .set("Authorization", `Bearer ${TOKENS.member}`);
      
      expect(res.status).toBe(200);
      const ids = res.body.data.map(o => o.id);
      expect(ids).toContain("o-1");
      expect(ids).not.toContain("o-2");
    });

    test("POST /commerce/checkout blocks forged user_id", async () => {
      const res = await request(app.callback())
        .post("/api/v1/commerce/checkout")
        .set("Authorization", `Bearer ${TOKENS.attacker}`)
        .send({
          user_id: "u-member",
          items: [],
          split_mode: "merge_all",
          idempotency_key: "test-idemp-1"
        });
      
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/members can only act on their own user_id/);
    });
  });

  describe("F-003: Financial Log Integrity", () => {
    test("Generic mutation of financial-logs is disabled", async () => {
      const res = await request(app.callback())
        .delete("/api/v1/financial-logs/l-1")
        .set("Authorization", `Bearer ${TOKENS.manager}`);
      
      expect(res.status).toBe(404);
    });

    test("Manager can READ financial logs", async () => {
      const res = await request(app.callback())
        .get("/api/v1/financial-logs")
        .set("Authorization", `Bearer ${TOKENS.manager}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });
});
