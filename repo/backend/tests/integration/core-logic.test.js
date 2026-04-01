import request from "supertest";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createFakeDb } from "../helpers/fake-db.js";

let fakeDb;

vi.mock("../../src/db.js", () => ({
  get db() {
    return fakeDb;
  },
}));

const TOKENS = {
  member: "token-member-a",
  manager: "token-manager-a",
};

function seedBase() {
  const now = Date.now();
  const holidayDate = new Date(now + 24 * 60 * 60000)
    .toISOString()
    .slice(0, 10);
  return {
    users: [
      {
        id: "member-a",
        full_name: "Member A",
        email: "member-a@example.com",
        role: "member",
        status: "active",
        standing_score: 100,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "manager-a",
        full_name: "Manager A",
        email: "manager-a@example.com",
        role: "manager",
        status: "active",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    sessions: [
      {
        id: "sess-member",
        user_id: "member-a",
        role: "member",
        token: TOKENS.member,
        expires_at: new Date(now + 60 * 60000),
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "sess-manager",
        user_id: "manager-a",
        role: "manager",
        token: TOKENS.manager,
        expires_at: new Date(now + 60 * 60000),
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    resources: [
      {
        id: "room-a",
        name: "Room A",
        type: "room",
        capacity: 1,
        is_active: true,
        booking_window_days: 30,
        min_duration_minutes: 30,
        max_duration_minutes: 240,
        early_check_in_minutes: 10,
        late_check_in_grace_minutes: 15,
        allow_slot_stitching: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    reservations: [
      {
        id: "existing-overlap",
        user_id: "member-a",
        resource_id: "room-a",
        start_time: new Date(now + 3 * 60 * 60000),
        end_time: new Date(now + 4 * 60 * 60000),
        status: "booked",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    holiday_rules: [
      {
        id: "holiday-closed-1",
        holiday_date: holidayDate,
        name: "Closed Day",
        notes: "Studio closed",
        is_active: true,
        is_closed: true,
        open_time: "00:00:00",
        close_time: "00:00:00",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    resource_blocks: [],
    reservation_blacklists: [],
    booking_exception_requests: [],
    reservation_overrides: [],
    attendance_history: [],
    account_standing_policies: [
      {
        id: "default-standing-policy",
        is_active: true,
        lookback_days: 30,
        low_score_threshold: 60,
        no_show_limit: 2,
        no_show_penalty_points: 25,
        check_in_reward_points: 2,
        peak_start_time: "17:00:00",
        peak_end_time: "20:00:00",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    catalog_items: [
      {
        id: "cat-merch-tee",
        sku: "TEE-1",
        name: "Tee",
        category: "merchandise",
        base_price: 50,
        currency: "USD",
        fulfillment_path: "front_desk_pickup",
        is_active: true,
        inventory_on_hand: 100,
        inventory_reserved: 0,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    coupons: [
      {
        id: "coupon-fixed",
        code: "SAVE10",
        name: "Save 10",
        discount_type: "fixed",
        discount_value: 10,
        max_discount: null,
        min_subtotal: 75,
        applies_to_category: null,
        is_active: true,
        starts_at: null,
        ends_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "coupon-pct",
        code: "PCT15",
        name: "Percent 15",
        discount_type: "percentage",
        discount_value: 15,
        max_discount: null,
        min_subtotal: 0,
        applies_to_category: null,
        is_active: true,
        starts_at: null,
        ends_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "coupon-cap",
        code: "PCT50CAP25",
        name: "Cap 25",
        discount_type: "percentage",
        discount_value: 50,
        max_discount: 25,
        min_subtotal: 0,
        applies_to_category: null,
        is_active: true,
        starts_at: null,
        ends_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    orders: [
      {
        id: "pending-1",
        user_id: "member-a",
        total_amount: 100,
        state: "pending_payment",
        status: "pending_payment",
        payment_method: "cash",
        fulfillment_path: "front_desk_pickup",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "expired-1",
        user_id: "member-a",
        total_amount: 100,
        state: "expired",
        status: "expired",
        payment_method: "cash",
        fulfillment_path: "front_desk_pickup",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    order_items: [],
    order_state_events: [],
    order_holds: [],
    order_payments: [],
    idempotency_keys: [],
    order_groups: [],
    financial_logs: [],
    refunds: [],
    audit_trails: [],
    security_events: [],
    cash_drawer_counts: [],
    community_posts: [],
    community_reports: [],
    community_rules: [],
    community_settings: [
      {
        id: "community-default-settings",
        max_posts_per_hour: 10,
        max_device_posts_per_hour: null,
        max_ip_posts_per_hour: null,
        captcha_required: false,
        auto_hold_report_threshold: 3,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    community_bans: [
      {
        id: "ban-a",
        user_id: "member-a",
        reason: "spam",
        is_permanent: true,
        expires_at: null,
        created_at: new Date(),
      },
    ],
    captcha_challenges: [],
  };
}

describe("core logic integration coverage", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-03-29T12:00:00Z"));
    fakeDb = createFakeDb(seedBase());
  });

  test("reservations: booking policy pass/fail checks", async () => {
    const { createApp } = await import("../../src/app.js");
    const app = createApp().callback();

    const success = await request(app)
      .post("/api/v1/reservations")
      .set("Authorization", `Bearer ${TOKENS.member}`)
      .send({
        user_id: "member-a",
        resource_id: "room-a",
        start_time: "2026-03-29T08:00:00.000Z",
        end_time: "2026-03-29T09:00:00.000Z",
      });
    expect(success.status).toBe(201);

    const windowRejected = await request(app)
      .post("/api/v1/reservations")
      .set("Authorization", `Bearer ${TOKENS.member}`)
      .send({
        user_id: "member-a",
        resource_id: "room-a",
        start_time: "2026-05-08T12:00:00.000Z",
        end_time: "2026-05-08T13:00:00.000Z",
      });
    expect(windowRejected.status).toBe(400);

    const durationRejected = await request(app)
      .post("/api/v1/reservations")
      .set("Authorization", `Bearer ${TOKENS.member}`)
      .send({
        user_id: "member-a",
        resource_id: "room-a",
        start_time: "2026-03-29T10:00:00.000Z",
        end_time: "2026-03-29T10:20:00.000Z",
      });
    expect(durationRejected.status).toBe(400);

    const conflictRejected = await request(app)
      .post("/api/v1/reservations")
      .set("Authorization", `Bearer ${TOKENS.member}`)
      .send({
        user_id: "member-a",
        resource_id: "room-a",
        start_time: "2026-03-29T15:10:00.000Z",
        end_time: "2026-03-29T15:40:00.000Z",
      });
    expect(conflictRejected.status).toBe(409);

    const holidayRejected = await request(app)
      .post("/api/v1/reservations")
      .set("Authorization", `Bearer ${TOKENS.member}`)
      .send({
        user_id: "member-a",
        resource_id: "room-a",
        start_time: "2026-03-30T10:00:00.000Z",
        end_time: "2026-03-30T10:30:00.000Z",
      });
    expect(holidayRejected.status).toBe(409);
  });

  test("commerce: fixed, percentage, and max-cap coupon pricing", async () => {
    const { createApp } = await import("../../src/app.js");
    const app = createApp().callback();

    const fixed = await request(app)
      .post("/api/v1/commerce/cart/quote")
      .set("Authorization", `Bearer ${TOKENS.member}`)
      .send({
        user_id: "member-a",
        coupon_code: "SAVE10",
        items: [{ catalog_item_id: "cat-merch-tee", quantity: 2 }],
      });
    expect(fixed.status).toBe(200);
    expect(fixed.body.discount_amount).toBe(10);
    expect(fixed.body.total_amount).toBe(90);

    const percentage = await request(app)
      .post("/api/v1/commerce/cart/quote")
      .set("Authorization", `Bearer ${TOKENS.member}`)
      .send({
        user_id: "member-a",
        coupon_code: "PCT15",
        items: [{ catalog_item_id: "cat-merch-tee", quantity: 2 }],
      });
    expect(percentage.status).toBe(200);
    expect(percentage.body.discount_amount).toBe(15);
    expect(percentage.body.total_amount).toBe(85);

    const maxCap = await request(app)
      .post("/api/v1/commerce/cart/quote")
      .set("Authorization", `Bearer ${TOKENS.member}`)
      .send({
        user_id: "member-a",
        coupon_code: "PCT50CAP25",
        items: [{ catalog_item_id: "cat-merch-tee", quantity: 2 }],
      });
    expect(maxCap.status).toBe(200);
    expect(maxCap.body.discount_amount).toBe(25);
    expect(maxCap.body.total_amount).toBe(75);
  });

  test("state machine: valid pending->paid and invalid expired->paid", async () => {
    const { createApp } = await import("../../src/app.js");
    const app = createApp().callback();

    const valid = await request(app)
      .post("/api/v1/commerce/orders/pending-1/transition")
      .set("Authorization", `Bearer ${TOKENS.manager}`)
      .send({
        idempotency_key: "transition-valid-1",
        to_state: "paid",
        reason: "manual approval",
      });
    expect(valid.status).toBe(200);
    expect(valid.body.state).toBe("paid");

    const invalid = await request(app)
      .post("/api/v1/commerce/orders/expired-1/transition")
      .set("Authorization", `Bearer ${TOKENS.manager}`)
      .send({
        idempotency_key: "transition-invalid-1",
        to_state: "paid",
        reason: "should fail",
      });
    expect(invalid.status).toBe(409);
  });

  test("moderation: banned user cannot post", async () => {
    const { createApp } = await import("../../src/app.js");
    const app = createApp().callback();

    const response = await request(app)
      .post("/api/v1/community/posts")
      .set("Authorization", `Bearer ${TOKENS.member}`)
      .send({ content: "hello", device_fingerprint: "device-1" });

    expect(response.status).toBe(403);
  });
});
