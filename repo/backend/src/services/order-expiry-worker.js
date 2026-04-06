import { db as defaultDb } from "../db.js";
import { logger as defaultLogger } from "../utils/logger.js";
import {
  orderStates,
  releaseOrderHolds,
  transitionOrderState,
} from "./commerce-service.js";

export async function expireUnpaidOrders({
  db = defaultDb,
  actorUserId = null,
  now = new Date(),
  batchSize = 50,
  reason = "Unpaid for 15 minutes",
} = {}) {
  const pendingRows = await db("orders")
    .where({ state: orderStates.PENDING_PAYMENT })
    .andWhere("expires_at", "<", now)
    .orderBy("expires_at", "asc")
    .limit(Math.max(1, Number(batchSize || 50)));

  const expiredIds = [];

  for (const row of pendingRows) {
    await db.transaction(async (trx) => {
      const locked = await trx("orders")
        .where({ id: row.id, state: orderStates.PENDING_PAYMENT })
        .andWhere("expires_at", "<", now)
        .first();

      if (!locked) {
        return;
      }

      await transitionOrderState({
        trx,
        order: locked,
        toState: orderStates.EXPIRED,
        eventType: "auto_expire",
        reason,
        idempotencyKey: null,
        actorUserId,
        payload: {},
      });
      await releaseOrderHolds({ trx, orderId: locked.id });
      expiredIds.push(locked.id);
    });
  }

  return {
    expired_count: expiredIds.length,
    order_ids: expiredIds,
  };
}

export function startOrderExpiryWorker({
  db = defaultDb,
  logger = defaultLogger,
  intervalMs = 60000,
  batchSize = 50,
} = {}) {
  let timer = null;
  let running = false;

  async function runSweep() {
    if (running) return;
    running = true;
    try {
      const result = await expireUnpaidOrders({ db, batchSize });
      if (result.expired_count > 0) {
        logger.info(
          { expired_count: result.expired_count },
          "Order expiry worker completed sweep",
        );
      }
    } catch (error) {
      logger.error({ err: error }, "Order expiry worker sweep failed");
    } finally {
      running = false;
    }
  }

  timer = setInterval(runSweep, Math.max(5000, Number(intervalMs || 60000)));
  timer.unref?.();
  runSweep();

  return {
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    runSweep,
  };
}
