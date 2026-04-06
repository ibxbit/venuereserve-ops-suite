import request from "supertest";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createFakeDb } from "../helpers/fake-db.js";

const TOKENS = {
  memberA: "token-member-a",
  memberB: "token-member-b",
  staffFront: "token-staff-front",
  manager: "token-manager",
};

let fakeDb;

vi.mock("../../src/db.js", () => ({
  get db() {
    return fakeDb;
  },
}));

function seedBase() {
  return {
    users: [
      {
        id: "member-a",
        full_name: "Member A",
        email: "a@example.com",
        role: "member",
        status: "active",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "member-b",
        full_name: "Member B",
        email: "b@example.com",
        role: "member",
        status: "active",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "staff-front",
        full_name: "Front Desk",
        email: "fd@example.com",
        role: "front-desk",
        status: "active",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    reservations: [
      {
        id: "res-b",
        user_id: "member-b",
        resource_id: "room-1",
        start_time: new Date(Date.now() + 3600000),
        end_time: new Date(Date.now() + 5400000),
        status: "booked",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    resources: [
      {
        id: "room-1",
        name: "Room 1",
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
    orders: [
      {
        id: "order-b",
        user_id: "member-b",
        total_amount: 80,
        state: "pending_payment",
        status: "pending_payment",
        payment_method: "cash",
        order_group_id: "grp-1",
        fulfillment_path: "instant_activation",
        expires_at: new Date(Date.now() - 20 * 60000),
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    order_items: [
      {
        id: "item-1",
        order_id: "order-b",
        catalog_item_id: "cat-class-pack-10",
        item_name: "10-Class Pack",
        category: "class_pack",
        quantity: 1,
        unit_price: 80,
        subtotal_amount: 80,
        discount_amount: 0,
        total_amount: 80,
        fulfillment_path: "instant_activation",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    order_groups: [
      {
        id: "grp-1",
        user_id: "member-b",
        status: "submitted",
        subtotal_amount: 80,
        discount_amount: 0,
        total_amount: 80,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    catalog_items: [
      {
        id: "cat-class-pack-10",
        sku: "CLSPACK-10",
        name: "10-Class Pack",
        category: "class_pack",
        base_price: 80,
        currency: "USD",
        fulfillment_path: "instant_activation",
        is_active: true,
        inventory_on_hand: 0,
        inventory_reserved: 0,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    coupons: [],
    idempotency_keys: [],
    order_state_events: [],
    order_holds: [],
    order_payments: [],
    financial_logs: [],
    refunds: [],
    audit_trails: [],
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
    attendance_history: [],
    reservation_overrides: [],
    resource_blocks: [],
    reservation_blacklists: [],
    holiday_rules: [],
    booking_exception_requests: [],
    community_posts: [],
    community_reports: [],
    community_bans: [],
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
    captcha_challenges: [],
    sessions: [
      {
        id: "sess-member-a",
        user_id: "member-a",
        role: "member",
        token: TOKENS.memberA,
        expires_at: new Date(Date.now() + 60 * 60000),
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "sess-member-b",
        user_id: "member-b",
        role: "member",
        token: TOKENS.memberB,
        expires_at: new Date(Date.now() + 60 * 60000),
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "sess-front",
        user_id: "staff-front",
        role: "front-desk",
        token: TOKENS.staffFront,
        expires_at: new Date(Date.now() + 60 * 60000),
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "sess-manager",
        user_id: "staff-front",
        role: "manager",
        token: TOKENS.manager,
        expires_at: new Date(Date.now() + 60 * 60000),
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    security_events: [],
    cash_drawer_counts: [],
    user_permissions: [],
  };
}

describe("critical business/API flows", () => {
  beforeEach(() => {
    fakeDb = createFakeDb(seedBase());
  });

  test("member A cannot delete member B reservation (IDOR 403)", async () => {
    const { createApp } = await import("../../src/app.js");
    const app = createApp().callback();
    const response = await request(app)
      .delete("/api/v1/reservations/res-b")
      .set("Authorization", `Bearer ${TOKENS.memberA}`);
    expect(response.status).toBe(403);
  });

  test("front-desk can delete any member reservation", async () => {
    const { createApp } = await import("../../src/app.js");
    const app = createApp().callback();
    const response = await request(app)
      .delete("/api/v1/reservations/res-b")
      .set("Authorization", `Bearer ${TOKENS.staffFront}`);
    expect(response.status).toBe(204);
  });

  test("member A cannot pay member B order (IDOR 403)", async () => {
    const { createApp } = await import("../../src/app.js");
    const app = createApp().callback();
    const response = await request(app)
      .post("/api/v1/commerce/orders/order-b/pay")
      .set("Authorization", `Bearer ${TOKENS.memberA}`)
      .send({
        idempotency_key: "pay-key-1",
        payment_method: "cash",
        manual_reference: "1234567890",
      });
    expect(response.status).toBe(403);
  });

  test("commerce checkout->pay idempotency deduplicates pay request", async () => {
    const { createApp } = await import("../../src/app.js");
    const app = createApp().callback();

    const checkout = await request(app)
      .post("/api/v1/commerce/checkout")
      .set("Authorization", `Bearer ${TOKENS.memberA}`)
      .send({
        idempotency_key: "checkout-1",
        user_id: "member-a",
        items: [{ catalog_item_id: "cat-class-pack-10", quantity: 1 }],
      });
    expect(checkout.status).toBe(201);
    const orderId = checkout.body.orders[0].id;

    const first = await request(app)
      .post(`/api/v1/commerce/orders/${orderId}/pay`)
      .set("Authorization", `Bearer ${TOKENS.memberA}`)
      .send({
        idempotency_key: "pay-dup-1",
        payment_method: "cash",
        manual_reference: "1111222233334444",
      });
    const second = await request(app)
      .post(`/api/v1/commerce/orders/${orderId}/pay`)
      .set("Authorization", `Bearer ${TOKENS.memberA}`)
      .send({
        idempotency_key: "pay-dup-1",
        payment_method: "cash",
        manual_reference: "1111222233334444",
      });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.order_id).toBe(second.body.order_id);
    expect(first.body.state).toBe(second.body.state);
  });

  test("reservation lines can be quoted and checked out in unified cart", async () => {
    const { createApp } = await import("../../src/app.js");
    const app = createApp().callback();

    const reservation = {
      id: "res-a",
      user_id: "member-a",
      resource_id: "room-1",
      start_time: new Date(Date.now() + 4 * 60 * 60000),
      end_time: new Date(Date.now() + 5 * 60 * 60000),
      status: "booked",
      created_at: new Date(),
      updated_at: new Date(),
    };
    fakeDb.__state.reservations.push(reservation);

    const quote = await request(app)
      .post("/api/v1/commerce/cart/quote")
      .set("Authorization", `Bearer ${TOKENS.memberA}`)
      .send({
        user_id: "member-a",
        reservation_lines: [{ reservation_id: reservation.id }],
      });
    expect(quote.status).toBe(200);
    expect(quote.body.lines.some((line) => line.category === "reservation")).toBe(
      true,
    );

    const checkout = await request(app)
      .post("/api/v1/commerce/checkout")
      .set("Authorization", `Bearer ${TOKENS.memberA}`)
      .send({
        idempotency_key: "checkout-reservation-1",
        user_id: "member-a",
        reservation_lines: [{ reservation_id: reservation.id }],
      });
    expect(checkout.status).toBe(201);
    expect(checkout.body.orders.length).toBeGreaterThan(0);
  });

  test("expire unpaid sweep marks overdue pending orders", async () => {
    const { createApp } = await import("../../src/app.js");
    const app = createApp().callback();

    const response = await request(app)
      .post("/api/v1/commerce/orders/expire-unpaid")
      .set("Authorization", `Bearer ${TOKENS.manager}`);

    expect(response.status).toBe(200);
    expect(response.body.expired_count).toBeGreaterThanOrEqual(1);
  });

  test("community throttle enforces max 10 posts/hour", async () => {
    const { createApp } = await import("../../src/app.js");
    const app = createApp().callback();

    for (let i = 0; i < 10; i += 1) {
      const ok = await request(app)
        .post("/api/v1/community/posts")
        .set("Authorization", `Bearer ${TOKENS.memberA}`)
        .send({ content: `post-${i}`, device_fingerprint: "dev-a" });
      expect(ok.status).toBe(201);
    }

    const blocked = await request(app)
      .post("/api/v1/community/posts")
      .set("Authorization", `Bearer ${TOKENS.memberA}`)
      .send({ content: "post-11", device_fingerprint: "dev-a" });

    expect(blocked.status).toBe(429);
  });

  test("community feed author filter only returns selected author posts", async () => {
    fakeDb.__state.community_posts.push(
      {
        id: "post-a",
        user_id: "member-a",
        parent_post_id: null,
        content: "alpha",
        status: "published",
        flag_count: 0,
        created_at: new Date("2026-03-27T10:00:00Z"),
        updated_at: new Date("2026-03-27T10:00:00Z"),
      },
      {
        id: "post-b",
        user_id: "member-b",
        parent_post_id: null,
        content: "beta",
        status: "published",
        flag_count: 0,
        created_at: new Date("2026-03-27T10:01:00Z"),
        updated_at: new Date("2026-03-27T10:01:00Z"),
      },
    );

    const { createApp } = await import("../../src/app.js");
    const app = createApp().callback();
    const response = await request(app)
      .get("/api/v1/community/feed")
      .set("Authorization", `Bearer ${TOKENS.memberA}`)
      .query({ author_id: "member-a" });

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBe(1);
    expect(response.body.data[0].user_id).toBe("member-a");
  });

  test("reconciliation shift-close flags variance over $5", async () => {
    fakeDb.__state.financial_logs.push(
      {
        id: "fin-1",
        amount: 100,
        shift_key: "shift-a",
        created_at: new Date("2026-03-27T09:00:00"),
      },
      {
        id: "fin-2",
        amount: 20,
        shift_key: "shift-a",
        created_at: new Date("2026-03-27T10:00:00"),
      },
    );

    const { createApp } = await import("../../src/app.js");
    const app = createApp().callback();
    const response = await request(app)
      .post("/api/v1/reconciliation/shift-close")
      .set("Authorization", `Bearer ${TOKENS.manager}`)
      .send({
        shift_key: "shift-a",
        shift_start: "2026-03-27T08:00:00",
        shift_end: "2026-03-27T11:00:00",
        counted_total: 130,
      });

    expect(response.status).toBe(201);
    expect(response.body.variance_amount).toBe(10);
    expect(response.body.variance_flag).toBe(true);
  });
});
