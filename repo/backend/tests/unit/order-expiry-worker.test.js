import { describe, expect, test, vi } from "vitest";
import {
  expireUnpaidOrders,
  startOrderExpiryWorker,
} from "../../src/services/order-expiry-worker.js";
import { createFakeDb } from "../helpers/fake-db.js";

function seed() {
  const now = Date.now();
  return {
    orders: [
      {
        id: "order-expired",
        user_id: "u1",
        state: "pending_payment",
        status: "pending_payment",
        expires_at: new Date(now - 20 * 60000),
        cancelled_at: null,
        cancelled_reason: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "order-active",
        user_id: "u1",
        state: "pending_payment",
        status: "pending_payment",
        expires_at: new Date(now + 20 * 60000),
        cancelled_at: null,
        cancelled_reason: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    order_holds: [
      {
        id: "hold-1",
        order_id: "order-expired",
        hold_type: "reservation",
        reference_id: "res-1",
        quantity: 1,
        status: "held",
        created_at: new Date(),
      },
    ],
    order_state_events: [],
    catalog_items: [],
  };
}

describe("order expiry worker", () => {
  test("expires overdue unpaid orders idempotently", async () => {
    const fakeDb = createFakeDb(seed());
    const first = await expireUnpaidOrders({ db: fakeDb, now: new Date() });
    const second = await expireUnpaidOrders({ db: fakeDb, now: new Date() });

    expect(first.expired_count).toBe(1);
    expect(first.order_ids).toEqual(["order-expired"]);
    expect(second.expired_count).toBe(0);
  });

  test("scheduler triggers sweep and can stop safely", async () => {
    vi.useFakeTimers();
    const fakeDb = createFakeDb(seed());
    const logger = { info: vi.fn(), error: vi.fn() };

    const worker = startOrderExpiryWorker({
      db: fakeDb,
      logger,
      intervalMs: 60000,
      batchSize: 20,
    });

    await vi.advanceTimersByTimeAsync(61000);
    worker.stop();
    vi.useRealTimers();

    const expired = fakeDb.__state.orders.find((row) => row.id === "order-expired");
    expect(expired?.state).toBe("expired");
  });
});
