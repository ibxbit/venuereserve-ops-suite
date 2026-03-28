import request from "supertest";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { appendFinancialLog } from "../../src/services/financial-log-service.js";
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
};

function parseChallengeAnswer(text) {
  const match = String(text || "").match(/What is\s+(\d+)\s*\+\s*(\d+)\?/i);
  if (!match) return null;
  return String(Number(match[1]) + Number(match[2]));
}

function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatLocalClock(date) {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function buildSeed() {
  const now = Date.now();
  const baseStart = new Date(now + 24 * 60 * 60000);
  baseStart.setMinutes(0, 0, 0);
  const conflictStart = new Date(baseStart.getTime() + 2 * 60 * 60000);
  const conflictEnd = new Date(conflictStart.getTime() + 60 * 60000);

  return {
    users: [
      {
        id: "member-a",
        full_name: "Member A",
        email: "member-a@example.com",
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
        email: "member-b@example.com",
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
        expires_at: new Date(now + 60 * 60000),
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "sess-member-b",
        user_id: "member-b",
        role: "member",
        token: TOKENS.memberB,
        expires_at: new Date(now + 60 * 60000),
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "sess-front",
        user_id: "staff-front",
        role: "front-desk",
        token: TOKENS.frontDesk,
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
    reservations: [
      {
        id: "res-b",
        user_id: "member-b",
        resource_id: "room-1",
        start_time: conflictStart,
        end_time: conflictEnd,
        status: "booked",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    booking_exception_requests: [],
    orders: [
      {
        id: "order-a",
        user_id: "member-a",
        total_amount: 80,
        state: "pending_payment",
        status: "pending_payment",
        payment_method: "cash",
        order_group_id: "grp-a",
        fulfillment_path: "front_desk_pickup",
        expires_at: new Date(now + 30 * 60000),
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
        expires_at: new Date(now + 30 * 60000),
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
        status: "issued",
        reason: "late",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    refunds: [],
    catalog_items: [
      {
        id: "cat-1",
        sku: "SKU-1",
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

describe("acceptance security upgrades", () => {
  beforeEach(() => {
    fakeDb = createFakeDb(buildSeed());
  });

  test("member cannot PUT/DELETE other users orders and fines; staff can", async () => {
    const { createApp } = await import("../../src/app.js");
    const app = createApp().callback();

    const memberOrderPut = await request(app)
      .put("/api/v1/orders/order-b")
      .set("Authorization", `Bearer ${TOKENS.memberA}`)
      .send({ notes: "tamper" });
    const memberFineDelete = await request(app)
      .delete("/api/v1/fines/fine-b")
      .set("Authorization", `Bearer ${TOKENS.memberA}`);

    expect(memberOrderPut.status).toBe(403);
    expect(memberFineDelete.status).toBe(403);

    const staffOrderPut = await request(app)
      .put("/api/v1/orders/order-b")
      .set("Authorization", `Bearer ${TOKENS.frontDesk}`)
      .send({ notes: "staff update" });
    const staffFineDelete = await request(app)
      .delete("/api/v1/fines/fine-b")
      .set("Authorization", `Bearer ${TOKENS.frontDesk}`);

    expect(staffOrderPut.status).toBe(200);
    expect(staffFineDelete.status).toBe(204);
  });

  test("booking exception lifecycle supports approved override path", async () => {
    const { createApp } = await import("../../src/app.js");
    const app = createApp().callback();
    const conflictStart = new Date(fakeDb.__state.reservations[0].start_time);
    const conflictEnd = new Date(fakeDb.__state.reservations[0].end_time);

    const requestRes = await request(app)
      .post("/api/v1/booking-exceptions")
      .set("Authorization", `Bearer ${TOKENS.memberA}`)
      .send({
        user_id: "member-a",
        resource_id: "room-1",
        start_time: conflictStart.toISOString(),
        end_time: conflictEnd.toISOString(),
        request_reason: "Need this slot",
      });
    expect(requestRes.status).toBe(201);

    const decisionRes = await request(app)
      .post(`/api/v1/booking-exceptions/${requestRes.body.id}/decision`)
      .set("Authorization", `Bearer ${TOKENS.manager}`)
      .send({
        decision: "approved",
        decision_reason: "manager approved",
      });
    expect(decisionRes.status).toBe(200);
    expect(decisionRes.body.status).toBe("approved");

    const reservationRes = await request(app)
      .post("/api/v1/reservations")
      .set("Authorization", `Bearer ${TOKENS.memberA}`)
      .send({
        user_id: "member-a",
        resource_id: "room-1",
        start_time: conflictStart.toISOString(),
        end_time: conflictEnd.toISOString(),
        exception_request_id: requestRes.body.id,
      });

    expect(reservationRes.status).toBe(201);
    expect(reservationRes.body.user_id).toBe("member-a");
  });

  test("availability returns plain-language conflicts and alternatives", async () => {
    const { createApp } = await import("../../src/app.js");
    const app = createApp().callback();
    const start = new Date(fakeDb.__state.reservations[0].start_time);
    const date = formatLocalDate(start);
    const clock = formatLocalClock(start);

    const response = await request(app)
      .get("/api/v1/availability")
      .set("Authorization", `Bearer ${TOKENS.memberA}`)
      .query({
        resource_id: "room-1",
        date,
        duration_minutes: 30,
        start_time: clock,
      });

    expect(response.status).toBe(200);
    expect(response.body.requested).toBeTruthy();
    expect(response.body.requested.available).toBe(false);
    expect(response.body.requested.conflicts.length).toBeGreaterThan(0);
    expect(response.body.requested.conflicts[0]).toMatch(
      /Occupancy overlap|Capacity exceeded|cleaning buffer/i,
    );
    expect(Array.isArray(response.body.alternatives)).toBe(true);
    expect(response.body.alternatives.length).toBeGreaterThan(0);
  });

  test("anti-replay validates invalid and out-of-window timestamps", async () => {
    const { createApp } = await import("../../src/app.js");
    const app = createApp().callback();

    const invalid = await request(app)
      .post("/api/v1/auth/register")
      .set("x-request-timestamp", "not-a-number")
      .send({
        full_name: "Replay A",
        email: "replay-a@example.com",
        password: "StrongPass123",
      });
    expect(invalid.status).toBe(400);

    const stale = await request(app)
      .post("/api/v1/auth/register")
      .set("x-request-timestamp", String(Math.floor(Date.now() / 1000) - 9999))
      .send({
        full_name: "Replay B",
        email: "replay-b@example.com",
        password: "StrongPass123",
      });
    expect(stale.status).toBe(401);
  });

  test("payment method validation and masking persistence", async () => {
    const { createApp } = await import("../../src/app.js");
    const app = createApp().callback();

    const invalidMethod = await request(app)
      .post("/api/v1/commerce/orders/order-a/pay")
      .set("Authorization", `Bearer ${TOKENS.memberA}`)
      .send({
        idempotency_key: "pay-invalid-method",
        payment_method: "crypto",
        manual_reference: "1111",
      });
    expect(invalidMethod.status).toBe(400);

    const ok = await request(app)
      .post("/api/v1/commerce/orders/order-a/pay")
      .set("Authorization", `Bearer ${TOKENS.memberA}`)
      .send({
        idempotency_key: "pay-valid-mask",
        payment_method: "card_terminal",
        manual_reference: "4111-2222-3333-4444",
      });
    expect(ok.status).toBe(200);
    expect(ok.body.last_four).toBe("4444");
    expect(ok.body.masked_reference).toMatch(/\*+4444$/);

    const payment = fakeDb.__state.order_payments[0];
    expect(payment.payment_method).toBe("card_terminal");
    expect(payment.last_four).toBe("4444");
    expect(payment.masked_reference).toMatch(/\*+4444$/);
  });

  test("captcha-required reporting and moderation decision flow", async () => {
    const { createApp } = await import("../../src/app.js");
    const app = createApp().callback();

    fakeDb.__state.community_settings[0].captcha_required = true;

    const blockedPost = await request(app)
      .post("/api/v1/community/posts")
      .set("Authorization", `Bearer ${TOKENS.memberA}`)
      .send({ content: "hello", device_fingerprint: "dev-1" });
    expect(blockedPost.status).toBe(400);

    const postChallenge = await request(app)
      .post("/api/v1/community/captcha/challenge")
      .set("Authorization", `Bearer ${TOKENS.memberA}`)
      .send({ device_fingerprint: "dev-1" });
    const postAnswer = parseChallengeAnswer(postChallenge.body.challenge_text);
    expect(postChallenge.status).toBe(201);

    const post = await request(app)
      .post("/api/v1/community/posts")
      .set("Authorization", `Bearer ${TOKENS.memberA}`)
      .send({
        content: "member post",
        device_fingerprint: "dev-1",
        captcha_challenge_id: postChallenge.body.id,
        captcha_answer: postAnswer,
      });
    expect(post.status).toBe(201);

    const reportChallenge = await request(app)
      .post("/api/v1/community/captcha/challenge")
      .set("Authorization", `Bearer ${TOKENS.memberB}`)
      .send({ device_fingerprint: "dev-2" });
    const reportAnswer = parseChallengeAnswer(
      reportChallenge.body.challenge_text,
    );
    expect(reportChallenge.status).toBe(201);

    const report = await request(app)
      .post(`/api/v1/community/posts/${post.body.id}/report`)
      .set("Authorization", `Bearer ${TOKENS.memberB}`)
      .send({
        reason: "abuse",
        device_fingerprint: "dev-2",
        captcha_challenge_id: reportChallenge.body.id,
        captcha_answer: reportAnswer,
      });
    expect(report.status).toBe(201);

    const decision = await request(app)
      .post(`/api/v1/community/moderation/reports/${report.body.id}/decision`)
      .set("Authorization", `Bearer ${TOKENS.manager}`)
      .send({
        decision: "ban_user",
        reason: "policy violation",
        ban_duration_hours: 24,
      });

    expect(decision.status).toBe(200);
    expect(fakeDb.__state.community_bans.length).toBe(1);
    expect(fakeDb.__state.community_bans[0].user_id).toBe("member-a");
  });

  test("financial log chain links previous hash across sequential entries", async () => {
    const first = await appendFinancialLog({
      entryType: "payment",
      referenceType: "order",
      referenceId: "order-a",
      amount: 80,
      paymentMethod: "cash",
      metadata: { seq: 1 },
    });
    const second = await appendFinancialLog({
      entryType: "refund",
      referenceType: "order",
      referenceId: "order-a",
      amount: -10,
      paymentMethod: "cash",
      metadata: { seq: 2 },
    });

    expect(fakeDb.__state.financial_logs).toHaveLength(2);
    expect(second.previous_hash).toBe(first.entry_hash);
    expect(second.entry_hash).toBeTruthy();
  });
});
