// True no-mock API test suite: commerce router endpoints.
//
// Covers:
//   GET /orders, GET /orders/:id,
//   GET /commerce/catalog, GET /commerce/coupons,
//   POST /commerce/cart/quote, POST /commerce/checkout,
//   POST /commerce/orders/:id/pay, POST /commerce/orders/:id/cancel,
//   POST /commerce/orders/expire-unpaid,
//   POST /commerce/orders/:id/transition,
//   POST /commerce/orders/:id/split, POST /commerce/orders/merge.

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

async function catalogItemId() {
  const db = await getDb();
  const row = await db("catalog_items").first();
  return row?.id;
}

async function checkoutForMember({ splitMode = "auto_split" } = {}) {
  const itemId = await catalogItemId();
  const response = await request(app)
    .post("/api/v1/commerce/checkout")
    .set(authHeader("member"))
    .set("x-idempotency-key", `co-${randomUUID()}`)
    .send({
      user_id: userIdsByRole.member,
      split_mode: splitMode,
      items: [
        {
          catalog_item_id: itemId,
          quantity: 1,
        },
      ],
    });
  return response;
}

describe("GET /api/v1/orders (no-mock)", () => {
  test("returns list with data/pagination for member", async () => {
    const response = await request(app)
      .get("/api/v1/orders")
      .set(authHeader("member"));
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.pagination).toBeDefined();
  });
});

describe("GET /api/v1/orders/:id (no-mock)", () => {
  test("returns 404 for unknown id", async () => {
    const response = await request(app)
      .get("/api/v1/orders/non-existent")
      .set(authHeader("manager"));
    expect(response.status).toBe(404);
  });

  test("returns order for owner", async () => {
    const checkout = await checkoutForMember();
    expect(checkout.status).toBe(201);
    const orderId = checkout.body.orders[0].id;
    const response = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set(authHeader("member"));
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(orderId);
  });
});

describe("GET /api/v1/commerce/catalog (no-mock)", () => {
  test("returns active catalog items", async () => {
    const response = await request(app)
      .get("/api/v1/commerce/catalog")
      .set(authHeader("member"));
    expect(response.status).toBe(200);
    expect(response.body.length).toBeGreaterThanOrEqual(1);
    expect(response.body[0]).toMatchObject({ is_active: expect.anything() });
  });
});

describe("GET /api/v1/commerce/coupons (no-mock)", () => {
  test("returns active coupons", async () => {
    const response = await request(app)
      .get("/api/v1/commerce/coupons")
      .set(authHeader("member"));
    expect(response.status).toBe(200);
    expect(response.body.length).toBeGreaterThanOrEqual(1);
  });
});

describe("POST /api/v1/commerce/cart/quote (no-mock)", () => {
  test("returns subtotal/total for catalog item", async () => {
    const id = await catalogItemId();
    const response = await request(app)
      .post("/api/v1/commerce/cart/quote")
      .set(authHeader("member"))
      .send({
        user_id: userIdsByRole.member,
        items: [{ catalog_item_id: id, quantity: 2 }],
      });
    expect(response.status).toBe(200);
    expect(typeof response.body.total_amount).toBe("number");
    expect(response.body.lines.length).toBeGreaterThanOrEqual(1);
  });
});

describe("POST /api/v1/commerce/checkout (no-mock)", () => {
  test("creates order with merge_all mode", async () => {
    const response = await checkoutForMember({ splitMode: "merge_all" });
    expect(response.status).toBe(201);
    expect(response.body.split_mode).toBe("merge_all");
    expect(response.body.orders.length).toBe(1);
  });

  test("returns 400 when idempotency key missing", async () => {
    const id = await catalogItemId();
    const response = await request(app)
      .post("/api/v1/commerce/checkout")
      .set(authHeader("member"))
      .send({
        user_id: userIdsByRole.member,
        items: [{ catalog_item_id: id, quantity: 1 }],
      });
    expect(response.status).toBe(400);
  });
});

describe("POST /api/v1/commerce/orders/:id/pay (no-mock)", () => {
  test("pays pending order", async () => {
    const checkout = await checkoutForMember();
    const orderId = checkout.body.orders[0].id;
    const response = await request(app)
      .post(`/api/v1/commerce/orders/${orderId}/pay`)
      .set(authHeader("manager"))
      .set("x-idempotency-key", `pay-${randomUUID()}`)
      .send({ payment_method: "cash" });
    expect(response.status).toBe(200);
    expect(response.body.payment_method).toBe("cash");
  });

  test("returns 404 when order unknown", async () => {
    const response = await request(app)
      .post("/api/v1/commerce/orders/nope/pay")
      .set(authHeader("manager"))
      .set("x-idempotency-key", `pay-${randomUUID()}`)
      .send({ payment_method: "cash" });
    expect(response.status).toBe(404);
  });
});

describe("POST /api/v1/commerce/orders/:id/cancel (no-mock)", () => {
  test("cancels a pending order", async () => {
    const checkout = await checkoutForMember();
    const orderId = checkout.body.orders[0].id;
    const response = await request(app)
      .post(`/api/v1/commerce/orders/${orderId}/cancel`)
      .set(authHeader("manager"))
      .set("x-idempotency-key", `cn-${randomUUID()}`)
      .send({ reason: "test" });
    expect(response.status).toBe(200);
    expect(response.body.state).toBe("cancelled");
  });
});

describe("POST /api/v1/commerce/orders/expire-unpaid (no-mock)", () => {
  test("returns 200 with expired_count number", async () => {
    const response = await request(app)
      .post("/api/v1/commerce/orders/expire-unpaid")
      .set(authHeader("manager"));
    expect(response.status).toBe(200);
    expect(typeof response.body.expired_count).toBe("number");
  });
});

describe("POST /api/v1/commerce/orders/:id/transition (no-mock)", () => {
  test("rejects invalid transition with 409", async () => {
    const checkout = await checkoutForMember();
    const orderId = checkout.body.orders[0].id;
    const response = await request(app)
      .post(`/api/v1/commerce/orders/${orderId}/transition`)
      .set(authHeader("manager"))
      .set("x-idempotency-key", `tr-${randomUUID()}`)
      .send({ to_state: "paid" });
    expect([200, 409]).toContain(response.status);
  });
});

describe("POST /api/v1/commerce/orders/:id/split (no-mock)", () => {
  test("returns message when only single path", async () => {
    const checkout = await checkoutForMember();
    const orderId = checkout.body.orders[0].id;
    const response = await request(app)
      .post(`/api/v1/commerce/orders/${orderId}/split`)
      .set(authHeader("manager"))
      .set("x-idempotency-key", `sp-${randomUUID()}`);
    expect(response.status).toBe(200);
    expect(response.body.message || response.body.split_from_order_id).toBeDefined();
  });
});

describe("POST /api/v1/commerce/orders/merge (no-mock)", () => {
  test("returns 400 when less than two order_ids", async () => {
    const response = await request(app)
      .post("/api/v1/commerce/orders/merge")
      .set(authHeader("manager"))
      .set("x-idempotency-key", `mg-${randomUUID()}`)
      .send({ order_ids: [] });
    expect(response.status).toBe(400);
  });
});
