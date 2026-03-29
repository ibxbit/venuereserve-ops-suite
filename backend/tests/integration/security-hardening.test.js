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
  memberA: "token-member-a",
  memberB: "token-member-b",
  frontDesk: "token-front-desk",
  manager: "token-manager",
  expired: "token-expired",
};

function seedBase() {
  return {
    users: [
      {
        id: "member-a",
        full_name: "Member A",
        email: "a@example.com",
        role: "member",
        status: "active",
        password_salt: "salt-a",
        password_hash:
          "52be079f966003d39f5135f40cc33867d9915cb00fa370a8d41528cdc4cd95be4d7fd23af4432b74117f2ff0624bd5cfa387b7306ec278ebd7f20b2455db2960",
        failed_login_attempts: 0,
        locked_until: null,
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
      {
        id: "manager-a",
        full_name: "Manager",
        email: "manager@example.com",
        role: "manager",
        status: "active",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
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
        token: TOKENS.frontDesk,
        expires_at: new Date(Date.now() + 60 * 60000),
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "sess-manager",
        user_id: "manager-a",
        role: "manager",
        token: TOKENS.manager,
        expires_at: new Date(Date.now() + 60 * 60000),
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "sess-expired",
        user_id: "member-a",
        role: "member",
        token: TOKENS.expired,
        expires_at: new Date(Date.now() - 60 * 60000),
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    reservations: [
      {
        id: "res-a",
        user_id: "member-a",
        resource_id: "room-1",
        start_time: new Date(Date.now() + 8 * 60 * 60000),
        end_time: new Date(Date.now() + 9 * 60 * 60000),
        status: "booked",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "res-b",
        user_id: "member-b",
        resource_id: "room-1",
        start_time: new Date(Date.now() + 10 * 60 * 60000),
        end_time: new Date(Date.now() + 11 * 60 * 60000),
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
        id: "order-a",
        user_id: "member-a",
        total_amount: 80,
        state: "pending_payment",
        status: "pending_payment",
        payment_method: "cash",
        order_group_id: "grp-a",
        fulfillment_path: "instant_activation",
        expires_at: new Date(Date.now() + 30 * 60000),
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "order-b",
        user_id: "member-b",
        total_amount: 80,
        state: "pending_payment",
        status: "pending_payment",
        payment_method: "cash",
        order_group_id: "grp-b",
        fulfillment_path: "instant_activation",
        expires_at: new Date(Date.now() + 30 * 60000),
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    refunds: [
      {
        id: "refund-b",
        order_id: "order-b",
        user_id: "member-b",
        amount: 10,
        reason: "test",
        status: "pending",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    fines: [
      {
        id: "fine-b",
        user_id: "member-b",
        reservation_id: "res-b",
        amount: 5,
        reason: "late",
        status: "issued",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    order_items: [
      {
        id: "item-1",
        order_id: "order-a",
        catalog_item_id: "cat-1",
        item_name: "Class Pack",
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
    order_groups: [],
    catalog_items: [
      {
        id: "cat-1",
        sku: "CLS-1",
        name: "Class Pack",
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
    security_events: [],
    user_permissions: [],
    cash_drawer_counts: [],
  };
}

describe("security hardening", () => {
  beforeEach(() => {
    fakeDb = createFakeDb(seedBase());
  });

  test("protected endpoints reject missing token with 401", async () => {
    const { createApp } = await import("../../src/app.js");
    const app = createApp().callback();

    const a = await request(app).get("/api/v1/reservations");
    const b = await request(app).post("/api/v1/commerce/checkout").send({});

    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
  });

  test("invalid and expired bearer tokens return 401", async () => {
    const { createApp } = await import("../../src/app.js");
    const app = createApp().callback();

    const invalid = await request(app)
      .get("/api/v1/reservations")
      .set("Authorization", "Bearer not-a-token");
    const expired = await request(app)
      .get("/api/v1/reservations")
      .set("Authorization", `Bearer ${TOKENS.expired}`);

    expect(invalid.status).toBe(401);
    expect(expired.status).toBe(401);
  });

  test("registration rejects privileged role and standard registration remains member", async () => {
    const { createApp } = await import("../../src/app.js");
    const app = createApp().callback();

    const escalated = await request(app).post("/api/v1/auth/register").send({
      full_name: "Mallory",
      email: "mallory@example.com",
      password: "StrongPass123",
      role: "manager",
    });
    expect(escalated.status).toBe(400);

    const register = await request(app).post("/api/v1/auth/register").send({
      full_name: "Alice",
      email: "alice2@example.com",
      password: "StrongPass123",
    });
    expect(register.status).toBe(201);
    expect(register.body.role).toBe("member");

    const login = await request(app).post("/api/v1/auth/login").send({
      email: "alice2@example.com",
      password: "StrongPass123",
    });
    expect(login.status).toBe(200);
    expect(login.body.role).toBe("member");
  });

  test("member cannot read other member records by id while staff can", async () => {
    const { createApp } = await import("../../src/app.js");
    const app = createApp().callback();

    const resRead = await request(app)
      .get("/api/v1/reservations/res-b")
      .set("Authorization", `Bearer ${TOKENS.memberA}`);
    const orderRead = await request(app)
      .get("/api/v1/orders/order-b")
      .set("Authorization", `Bearer ${TOKENS.memberA}`);
    const refundRead = await request(app)
      .get("/api/v1/refunds/refund-b")
      .set("Authorization", `Bearer ${TOKENS.memberA}`);
    const fineRead = await request(app)
      .get("/api/v1/fines/fine-b")
      .set("Authorization", `Bearer ${TOKENS.memberA}`);

    expect(resRead.status).toBe(403);
    expect(orderRead.status).toBe(403);
    expect(refundRead.status).toBe(403);
    expect(fineRead.status).toBe(403);

    const staffReservation = await request(app)
      .get("/api/v1/reservations/res-b")
      .set("Authorization", `Bearer ${TOKENS.frontDesk}`);
    const staffOrder = await request(app)
      .get("/api/v1/orders/order-b")
      .set("Authorization", `Bearer ${TOKENS.frontDesk}`);

    expect(staffReservation.status).toBe(200);
    expect(staffOrder.status).toBe(200);
  });

  test("member payload user_id tampering is rejected for reservations and checkout", async () => {
    const { createApp } = await import("../../src/app.js");
    const app = createApp().callback();

    const badReservation = await request(app)
      .post("/api/v1/reservations")
      .set("Authorization", `Bearer ${TOKENS.memberA}`)
      .send({
        user_id: "member-b",
        resource_id: "room-1",
        start_time: new Date(Date.now() + 12 * 60 * 60000).toISOString(),
        end_time: new Date(Date.now() + 13 * 60 * 60000).toISOString(),
      });
    expect(badReservation.status).toBe(403);

    const okReservation = await request(app)
      .post("/api/v1/reservations")
      .set("Authorization", `Bearer ${TOKENS.memberA}`)
      .send({
        resource_id: "room-1",
        start_time: new Date(Date.now() + 24 * 60 * 60000).toISOString(),
        end_time: new Date(Date.now() + 25 * 60 * 60000).toISOString(),
      });
    expect(okReservation.status).toBe(201);
    expect(okReservation.body.user_id).toBe("member-a");

    const badCheckout = await request(app)
      .post("/api/v1/commerce/checkout")
      .set("Authorization", `Bearer ${TOKENS.memberA}`)
      .send({
        idempotency_key: "tamper-1",
        user_id: "member-b",
        items: [{ catalog_item_id: "cat-1", quantity: 1 }],
      });
    expect(badCheckout.status).toBe(403);

    const okCheckout = await request(app)
      .post("/api/v1/commerce/checkout")
      .set("Authorization", `Bearer ${TOKENS.memberA}`)
      .send({
        idempotency_key: "ok-checkout-1",
        items: [{ catalog_item_id: "cat-1", quantity: 1 }],
      });
    expect(okCheckout.status).toBe(201);
  });

  test("member data isolation and idempotency key rejection paths", async () => {
    const { createApp } = await import("../../src/app.js");
    const app = createApp().callback();

    const reservations = await request(app)
      .get("/api/v1/reservations")
      .set("Authorization", `Bearer ${TOKENS.memberA}`);
    const orders = await request(app)
      .get("/api/v1/orders")
      .set("Authorization", `Bearer ${TOKENS.memberA}`);

    expect(reservations.status).toBe(200);
    expect(orders.status).toBe(200);
    expect(
      reservations.body.data.every((row) => row.user_id === "member-a"),
    ).toBe(true);
    expect(orders.body.data.every((row) => row.user_id === "member-a")).toBe(
      true,
    );

    const checkoutMissingKey = await request(app)
      .post("/api/v1/commerce/checkout")
      .set("Authorization", `Bearer ${TOKENS.memberA}`)
      .send({
        items: [{ catalog_item_id: "cat-1", quantity: 1 }],
      });
    expect(checkoutMissingKey.status).toBe(400);

    const payMissingKey = await request(app)
      .post("/api/v1/commerce/orders/order-a/pay")
      .set("Authorization", `Bearer ${TOKENS.memberA}`)
      .send({
        payment_method: "cash",
        manual_reference: "1234",
      });
    expect(payMissingKey.status).toBe(400);
  });

  test("authorization matrix on security routes and sanitized 500 errors", async () => {
    const { createApp } = await import("../../src/app.js");
    const app = createApp().callback();

    const memberDenied = await request(app)
      .get("/api/v1/security/events")
      .set("Authorization", `Bearer ${TOKENS.memberA}`);
    const managerAllowed = await request(app)
      .get("/api/v1/security/events")
      .set("Authorization", `Bearer ${TOKENS.manager}`);

    expect(memberDenied.status).toBe(403);
    expect(managerAllowed.status).toBe(200);

    fakeDb.raw = async () => {
      throw new Error("DB_PASSWORD=super-secret");
    };
    const health = await request(app).get("/api/v1/health");
    expect(health.status).toBe(500);
    expect(health.body.error).toBe("Internal server error");
    expect(JSON.stringify(health.body)).not.toContain("super-secret");
  });
});
