// True no-mock API test suite: CRUD endpoints for all 14 resources.
//
// Does NOT use vi.mock. Exercises every combination of
//   GET /<entity>, GET /<entity>/:id, POST /<entity>,
//   PUT /<entity>/:id, DELETE /<entity>/:id
// under real route handlers, real middleware, and real db persistence.
//
// The test body parametrises across `resourceCases` below. The verifier
// (scripts/verify-test-coverage.mjs) credits each endpoint via the explicit
// declarations below, since template-literal paths cannot be statically
// resolved without an AST evaluator.
//
// @endpoint-coverage: GET /api/v1/users
// @endpoint-coverage: GET /api/v1/users/:id
// @endpoint-coverage: POST /api/v1/users
// @endpoint-coverage: PUT /api/v1/users/:id
// @endpoint-coverage: DELETE /api/v1/users/:id
// @endpoint-coverage: GET /api/v1/resources
// @endpoint-coverage: GET /api/v1/resources/:id
// @endpoint-coverage: POST /api/v1/resources
// @endpoint-coverage: PUT /api/v1/resources/:id
// @endpoint-coverage: DELETE /api/v1/resources/:id
// @endpoint-coverage: GET /api/v1/catalog-items
// @endpoint-coverage: GET /api/v1/catalog-items/:id
// @endpoint-coverage: POST /api/v1/catalog-items
// @endpoint-coverage: PUT /api/v1/catalog-items/:id
// @endpoint-coverage: DELETE /api/v1/catalog-items/:id
// @endpoint-coverage: GET /api/v1/coupons
// @endpoint-coverage: GET /api/v1/coupons/:id
// @endpoint-coverage: POST /api/v1/coupons
// @endpoint-coverage: PUT /api/v1/coupons/:id
// @endpoint-coverage: DELETE /api/v1/coupons/:id
// @endpoint-coverage: GET /api/v1/community-rules
// @endpoint-coverage: GET /api/v1/community-rules/:id
// @endpoint-coverage: POST /api/v1/community-rules
// @endpoint-coverage: PUT /api/v1/community-rules/:id
// @endpoint-coverage: DELETE /api/v1/community-rules/:id
// @endpoint-coverage: GET /api/v1/community-settings
// @endpoint-coverage: GET /api/v1/community-settings/:id
// @endpoint-coverage: POST /api/v1/community-settings
// @endpoint-coverage: PUT /api/v1/community-settings/:id
// @endpoint-coverage: DELETE /api/v1/community-settings/:id
// @endpoint-coverage: GET /api/v1/community-bans
// @endpoint-coverage: GET /api/v1/community-bans/:id
// @endpoint-coverage: POST /api/v1/community-bans
// @endpoint-coverage: PUT /api/v1/community-bans/:id
// @endpoint-coverage: DELETE /api/v1/community-bans/:id
// @endpoint-coverage: GET /api/v1/security-events
// @endpoint-coverage: GET /api/v1/security-events/:id
// @endpoint-coverage: POST /api/v1/security-events
// @endpoint-coverage: PUT /api/v1/security-events/:id
// @endpoint-coverage: DELETE /api/v1/security-events/:id
// @endpoint-coverage: GET /api/v1/fines
// @endpoint-coverage: GET /api/v1/fines/:id
// @endpoint-coverage: POST /api/v1/fines
// @endpoint-coverage: PUT /api/v1/fines/:id
// @endpoint-coverage: DELETE /api/v1/fines/:id
// @endpoint-coverage: GET /api/v1/cash-drawer-counts
// @endpoint-coverage: GET /api/v1/cash-drawer-counts/:id
// @endpoint-coverage: POST /api/v1/cash-drawer-counts
// @endpoint-coverage: PUT /api/v1/cash-drawer-counts/:id
// @endpoint-coverage: DELETE /api/v1/cash-drawer-counts/:id
// @endpoint-coverage: GET /api/v1/refunds
// @endpoint-coverage: GET /api/v1/refunds/:id
// @endpoint-coverage: POST /api/v1/refunds
// @endpoint-coverage: PUT /api/v1/refunds/:id
// @endpoint-coverage: DELETE /api/v1/refunds/:id
// @endpoint-coverage: GET /api/v1/resource-blocks
// @endpoint-coverage: GET /api/v1/resource-blocks/:id
// @endpoint-coverage: POST /api/v1/resource-blocks
// @endpoint-coverage: PUT /api/v1/resource-blocks/:id
// @endpoint-coverage: DELETE /api/v1/resource-blocks/:id
// @endpoint-coverage: GET /api/v1/reservation-blacklists
// @endpoint-coverage: GET /api/v1/reservation-blacklists/:id
// @endpoint-coverage: POST /api/v1/reservation-blacklists
// @endpoint-coverage: PUT /api/v1/reservation-blacklists/:id
// @endpoint-coverage: DELETE /api/v1/reservation-blacklists/:id
// @endpoint-coverage: GET /api/v1/holiday-rules
// @endpoint-coverage: GET /api/v1/holiday-rules/:id
// @endpoint-coverage: POST /api/v1/holiday-rules
// @endpoint-coverage: PUT /api/v1/holiday-rules/:id
// @endpoint-coverage: DELETE /api/v1/holiday-rules/:id

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

const resourceCases = [
  {
    entity: "users",
    tableName: "users",
    role: "manager",
    createPayload: () => ({
      full_name: "Unit Member",
      email: `crud-${randomUUID()}@test.local`,
      phone: "+1-555-0000",
      status: "active",
      role: "member",
    }),
    updatePayload: () => ({ status: "inactive" }),
    postExpectsKey: "email",
  },
  {
    entity: "resources",
    tableName: "resources",
    role: "manager",
    createPayload: () => ({
      name: `Studio Room ${randomUUID().slice(0, 4)}`,
      type: "studio",
      capacity: 5,
      is_active: true,
      booking_window_days: 30,
      min_duration_minutes: 30,
      max_duration_minutes: 240,
      early_check_in_minutes: 10,
      late_check_in_grace_minutes: 15,
      allow_slot_stitching: true,
    }),
    updatePayload: () => ({ capacity: 7 }),
    postExpectsKey: "name",
  },
  {
    entity: "catalog-items",
    tableName: "catalog_items",
    role: "manager",
    createPayload: () => ({
      sku: `SKU-${randomUUID().slice(0, 6)}`,
      name: "Protein Bar",
      category: "snack",
      base_price: 3.5,
      currency: "USD",
      fulfillment_path: "awaiting_pickup",
      is_active: true,
      metadata_json: "{}",
    }),
    updatePayload: () => ({ base_price: 4.0 }),
    postExpectsKey: "sku",
  },
  {
    entity: "coupons",
    tableName: "coupons",
    role: "manager",
    createPayload: () => ({
      code: `C-${randomUUID().slice(0, 6)}`,
      name: "Random Coupon",
      discount_type: "fixed",
      discount_value: 5,
      min_subtotal: 0,
      is_active: true,
    }),
    updatePayload: () => ({ is_active: false }),
    postExpectsKey: "code",
  },
  {
    entity: "community-rules",
    tableName: "community_rules",
    role: "manager",
    createPayload: () => ({
      rule_type: "blocklist",
      target_type: "keyword",
      value: `bad-${randomUUID().slice(0, 4)}`,
      is_active: true,
    }),
    updatePayload: () => ({ is_active: false }),
    postExpectsKey: "value",
  },
  {
    entity: "community-settings",
    tableName: "community_settings",
    role: "manager",
    createPayload: () => ({
      max_posts_per_hour: 15,
      captcha_required: false,
      auto_hold_report_threshold: 4,
    }),
    updatePayload: () => ({ max_posts_per_hour: 20 }),
    postExpectsKey: "max_posts_per_hour",
  },
  {
    entity: "community-bans",
    tableName: "community_bans",
    role: "manager",
    createPayload: () => ({
      user_id: userIdsByRole.member,
      reason: "trolling",
      is_permanent: false,
    }),
    updatePayload: () => ({ reason: "resolved" }),
    postExpectsKey: "reason",
  },
  {
    entity: "security-events",
    tableName: "security_events",
    role: "manager",
    createPayload: () => ({
      event_type: "test_event",
      severity: "info",
      user_id: userIdsByRole.member,
      source_ip: "127.0.0.1",
      details_json: "{}",
      alerted: false,
    }),
    updatePayload: () => ({ severity: "warning" }),
    postExpectsKey: "event_type",
  },
  {
    entity: "fines",
    tableName: "fines",
    role: "manager",
    createPayload: () => ({
      user_id: userIdsByRole.member,
      amount: 5.25,
      status: "issued",
      reason: "late cancel",
    }),
    updatePayload: () => ({ status: "paid" }),
    postExpectsKey: "reason",
  },
  {
    entity: "cash-drawer-counts",
    tableName: "cash_drawer_counts",
    role: "manager",
    createPayload: () => ({
      shift_key: `shift-${randomUUID().slice(0, 6)}`,
      shift_start: new Date().toISOString(),
      shift_end: new Date(Date.now() + 3600_000).toISOString(),
      expected_total: 100,
      counted_total: 100,
      variance_amount: 0,
      variance_flag: false,
      counted_by_user_id: userIdsByRole.manager,
      notes: "seed",
      counted_at: new Date().toISOString(),
    }),
    updatePayload: () => ({ notes: "adjusted" }),
    postExpectsKey: "shift_key",
  },
  {
    entity: "refunds",
    tableName: "refunds",
    role: "manager",
    createPayload: async () => {
      const db = await getDb();
      const orderId = randomUUID();
      const now = new Date();
      await db("orders").insert({
        id: orderId,
        user_id: userIdsByRole.member,
        total_amount: 20,
        status: "paid",
        state: "paid",
        payment_method: "cash",
        notes: "seeded",
        created_at: now,
        updated_at: now,
      });
      return {
        order_id: orderId,
        amount: 5,
        reason: "goodwill",
        status: "requested",
      };
    },
    updatePayload: () => ({ status: "approved" }),
    postExpectsKey: "order_id",
  },
  {
    entity: "resource-blocks",
    tableName: "resource_blocks",
    role: "manager",
    createPayload: async () => {
      const db = await getDb();
      const resourceId = randomUUID();
      const now = new Date();
      await db("resources").insert({
        id: resourceId,
        name: "Blocked Resource",
        type: "studio",
        capacity: 5,
        is_active: 1,
        booking_window_days: 30,
        min_duration_minutes: 30,
        max_duration_minutes: 240,
        early_check_in_minutes: 10,
        late_check_in_grace_minutes: 15,
        allow_slot_stitching: 1,
        created_at: now,
        updated_at: now,
      });
      return {
        resource_id: resourceId,
        start_time: new Date().toISOString(),
        end_time: new Date(Date.now() + 3600_000).toISOString(),
        reason: "maintenance",
        is_active: true,
      };
    },
    updatePayload: () => ({ reason: "resolved" }),
    postExpectsKey: "reason",
  },
  {
    entity: "reservation-blacklists",
    tableName: "reservation_blacklists",
    role: "manager",
    createPayload: () => ({
      user_id: userIdsByRole.member,
      blocked_from: new Date().toISOString(),
      blocked_until: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      reason: "abuse",
      is_active: true,
    }),
    updatePayload: () => ({ is_active: false }),
    postExpectsKey: "reason",
  },
  {
    entity: "holiday-rules",
    tableName: "holiday_rules",
    role: "manager",
    createPayload: () => ({
      holiday_date: "2026-12-25",
      name: "Christmas",
      is_closed: true,
      is_active: true,
    }),
    updatePayload: () => ({ name: "Holiday" }),
    postExpectsKey: "name",
  },
];

for (const spec of resourceCases) {
  describe(`CRUD /api/v1/${spec.entity} (no-mock)`, () => {
    test(`GET /api/v1/${spec.entity} returns 200 with data/pagination`, async () => {
      const response = await request(app)
        .get(`/api/v1/${spec.entity}`)
        .set(authHeader(spec.role));
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.pagination).toMatchObject({ page: 1 });
    });

    test(`POST /api/v1/${spec.entity} returns 201 and persists the row`, async () => {
      const payload = await spec.createPayload();
      const response = await request(app)
        .post(`/api/v1/${spec.entity}`)
        .set(authHeader(spec.role))
        .send(payload);
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        [spec.postExpectsKey]: payload[spec.postExpectsKey],
      });
      expect(typeof response.body.id).toBe("string");
    });

    test(`GET /api/v1/${spec.entity}/:id returns 200 for existing row`, async () => {
      const payload = await spec.createPayload();
      const created = await request(app)
        .post(`/api/v1/${spec.entity}`)
        .set(authHeader(spec.role))
        .send(payload);
      const id = created.body.id;
      const response = await request(app)
        .get(`/api/v1/${spec.entity}/${id}`)
        .set(authHeader(spec.role));
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(id);
    });

    test(`GET /api/v1/${spec.entity}/:id returns 404 for unknown id`, async () => {
      const response = await request(app)
        .get(`/api/v1/${spec.entity}/does-not-exist`)
        .set(authHeader(spec.role));
      expect(response.status).toBe(404);
    });

    test(`PUT /api/v1/${spec.entity}/:id updates fields`, async () => {
      const payload = await spec.createPayload();
      const created = await request(app)
        .post(`/api/v1/${spec.entity}`)
        .set(authHeader(spec.role))
        .send(payload);
      const id = created.body.id;
      const patch = spec.updatePayload();
      const response = await request(app)
        .put(`/api/v1/${spec.entity}/${id}`)
        .set(authHeader(spec.role))
        .send(patch);
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(id);
    });

    test(`DELETE /api/v1/${spec.entity}/:id removes the row`, async () => {
      const payload = await spec.createPayload();
      const created = await request(app)
        .post(`/api/v1/${spec.entity}`)
        .set(authHeader(spec.role))
        .send(payload);
      const id = created.body.id;
      const response = await request(app)
        .delete(`/api/v1/${spec.entity}/${id}`)
        .set(authHeader(spec.role));
      expect(response.status).toBe(204);
      const getResponse = await request(app)
        .get(`/api/v1/${spec.entity}/${id}`)
        .set(authHeader(spec.role));
      expect(getResponse.status).toBe(404);
    });
  });
}
