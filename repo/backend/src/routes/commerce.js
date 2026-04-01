import Router from "@koa/router";
import { randomUUID } from "crypto";
import { db } from "../db.js";
import {
  assertOwnerOrStaff,
  requirePermission,
} from "../middleware/authorize.js";
import { writeAudit } from "../services/audit-service.js";
import {
  assertLocalTender,
  buildQuote,
  createStateEvent,
  derivePostPaymentState,
  extractLastFour,
  fulfillmentPaths,
  maskReference,
  nowPlusMinutes,
  orderStates,
  releaseOrderHolds,
  reserveInventoryHold,
  reserveReservationHolds,
  toMoney,
  toNumber,
  transitionOrderState,
  withIdempotency,
} from "../services/commerce-service.js";
import { appendFinancialLog } from "../services/financial-log-service.js";

function assertIdempotencyKey(ctx, operation) {
  const key =
    String(ctx.get("x-idempotency-key") || "").trim() ||
    String(ctx.request.body?.idempotency_key || "").trim();
  if (!key) {
    ctx.throw(400, `${operation} requires client idempotency key`);
  }
  return key;
}

export const commerceRouter = new Router();

function resolveActorScopedUserId(ctx, requestedUserId) {
  if (ctx.state.actorRole !== "member") {
    return requestedUserId || null;
  }

  const actorUserId = ctx.state.actorUserId;
  if (!actorUserId) {
    ctx.throw(401, "authentication required");
  }

  const requested = String(requestedUserId || "").trim();
  if (requested && requested !== actorUserId) {
    ctx.throw(403, "members can only act on their own user_id");
  }

  return actorUserId;
}

commerceRouter.get(
  "/commerce/catalog",
  requirePermission("orders.read"),
  async (ctx) => {
    const rows = await db("catalog_items")
      .where({ is_active: true })
      .orderBy("name", "asc");
    ctx.body = rows;
  },
);

commerceRouter.get(
  "/commerce/coupons",
  requirePermission("orders.read"),
  async (ctx) => {
    const rows = await db("coupons")
      .where({ is_active: true })
      .orderBy("code", "asc");
    ctx.body = rows;
  },
);

commerceRouter.post(
  "/commerce/cart/quote",
  requirePermission("orders.read"),
  async (ctx) => {
    const body = ctx.request.body || {};
    const scopedInput = {
      ...body,
      user_id: resolveActorScopedUserId(ctx, body.user_id),
    };
    ctx.body = await buildQuote(scopedInput);
  },
);

commerceRouter.post(
  "/commerce/checkout",
  requirePermission("orders.write"),
  async (ctx) => {
    const idempotencyKey = assertIdempotencyKey(ctx, "checkout");
    const response = await withIdempotency({
      operation: "checkout",
      idempotencyKey,
      statusCode: 201,
      run: async () => {
        const input = ctx.request.body || {};
        const scopedInput = {
          ...input,
          user_id: resolveActorScopedUserId(ctx, input.user_id),
        };
        const quote = await buildQuote(scopedInput);
        const mode = String(scopedInput.split_mode || "auto_split");
        const now = new Date();
        const expiresAt = nowPlusMinutes(15);

        const createSingleMergedOrder = mode === "merge_all";
        const orderGroups = createSingleMergedOrder
          ? [
              {
                fulfillment_path: fulfillmentPaths.MIXED,
                items: quote.lines,
                subtotal_amount: quote.subtotal_amount,
                discount_amount: quote.discount_amount,
                total_amount: quote.total_amount,
              },
            ]
          : quote.fulfillment_groups;

        const orderGroupId = randomUUID();
        const createdOrders = [];

        await db.transaction(async (trx) => {
          await trx("order_groups").insert({
            id: orderGroupId,
            user_id: quote.user_id,
            status: "submitted",
            subtotal_amount: quote.subtotal_amount,
            discount_amount: quote.discount_amount,
            total_amount: quote.total_amount,
            coupon_code: quote.applied_coupon?.code || null,
            metadata_json: JSON.stringify({ split_mode: mode }),
            created_at: now,
            updated_at: now,
          });

          for (const group of orderGroups) {
            const orderId = randomUUID();
            await trx("orders").insert({
              id: orderId,
              user_id: quote.user_id,
              total_amount: group.total_amount,
              status: orderStates.PENDING_PAYMENT,
              state: orderStates.PENDING_PAYMENT,
              payment_method: "cash",
              notes: `Checkout via unified cart (${group.fulfillment_path})`,
              order_group_id: orderGroupId,
              fulfillment_path: group.fulfillment_path,
              coupon_code: quote.applied_coupon?.code || null,
              metadata_json: JSON.stringify({
                split_mode: mode,
                item_count: group.items.length,
              }),
              expires_at: expiresAt,
              created_at: now,
              updated_at: now,
            });

            for (const line of group.items) {
              await trx("order_items").insert({
                id: randomUUID(),
                order_id: orderId,
                catalog_item_id: line.catalog_item_id,
                item_name: line.item_name,
                category: line.category,
                quantity: line.quantity,
                unit_price: line.unit_price,
                subtotal_amount: line.subtotal_amount,
                discount_amount: line.discount_amount,
                total_amount: line.total_amount,
                fulfillment_path: line.fulfillment_path,
                metadata_json: JSON.stringify({ sku: line.sku }),
                created_at: now,
                updated_at: now,
              });

              await reserveInventoryHold({ trx, orderId, line });
            }

            await reserveReservationHolds({
              trx,
              orderId,
              reservationHoldIds: scopedInput.reservation_hold_ids,
            });

            await createStateEvent({
              trx,
              orderId,
              fromState: null,
              toState: orderStates.PENDING_PAYMENT,
              eventType: "checkout_created",
              reason: "Order created and awaiting local payment",
              idempotencyKey,
              actorUserId: ctx.state.actorUserId,
              payload: { total_amount: group.total_amount },
            });

            createdOrders.push({
              id: orderId,
              fulfillment_path: group.fulfillment_path,
              subtotal_amount: group.subtotal_amount,
              discount_amount: group.discount_amount,
              total_amount: group.total_amount,
              state: orderStates.PENDING_PAYMENT,
              expires_at: expiresAt,
            });
          }
        });

        await writeAudit({
          entity: "orders",
          entityId: orderGroupId,
          action: "checkout",
          payload: {
            quote,
            split_mode: mode,
            created_orders: createdOrders,
            idempotency_key: idempotencyKey,
          },
          actorUserId: ctx.state.actorUserId,
        });

        return {
          order_group_id: orderGroupId,
          split_mode: mode,
          orders: createdOrders,
          summary: {
            subtotal_amount: quote.subtotal_amount,
            discount_amount: quote.discount_amount,
            total_amount: quote.total_amount,
            coupon_code: quote.applied_coupon?.code || null,
          },
        };
      },
    });

    ctx.status = response.statusCode;
    ctx.body = response.body;
  },
);

commerceRouter.post(
  "/commerce/orders/:id/pay",
  requirePermission("orders.write"),
  async (ctx) => {
    const idempotencyKey = assertIdempotencyKey(ctx, "order_pay");
    const orderId = ctx.params.id;
    const response = await withIdempotency({
      operation: `order_pay:${orderId}`,
      idempotencyKey,
      statusCode: 200,
      run: async () => {
        const method = String(ctx.request.body?.payment_method || "").trim();
        assertLocalTender(method);
        const manualReference = String(
          ctx.request.body?.manual_reference || "",
        ).trim();
        const lastFour = extractLastFour(manualReference);
        const maskedReference = maskReference(manualReference);

        const order = await db("orders").where({ id: orderId }).first();
        if (!order) ctx.throw(404, "order not found");
        assertOwnerOrStaff(ctx, order.user_id);
        if (order.state !== orderStates.PENDING_PAYMENT) {
          ctx.throw(409, `order is not payable in state ${order.state}`);
        }

        const now = new Date();
        const nextState = derivePostPaymentState(order);

        await db.transaction(async (trx) => {
          await transitionOrderState({
            trx,
            order,
            toState: orderStates.PAID,
            eventType: "payment_received",
            reason: `Paid via ${method}`,
            idempotencyKey,
            actorUserId: ctx.state.actorUserId,
            payload: {
              method,
              masked_reference: maskedReference,
              last_four: lastFour,
            },
          });

          await trx("order_payments").insert({
            id: randomUUID(),
            order_id: orderId,
            payment_method: method,
            amount: order.total_amount,
            status: "captured",
            masked_reference: maskedReference,
            last_four: lastFour,
            created_at: now,
            updated_at: now,
          });

          await trx("orders").where({ id: orderId }).update({
            payment_method: method,
            paid_at: now,
            payment_reference_masked: maskedReference,
            payment_last_four: lastFour,
            updated_at: now,
          });

          await transitionOrderState({
            trx,
            order,
            toState: nextState,
            eventType:
              nextState === orderStates.ACTIVE
                ? "instant_activation"
                : "awaiting_pickup",
            reason:
              nextState === orderStates.ACTIVE
                ? "Instant activation completed"
                : "Ready for front-desk pickup",
            idempotencyKey,
            actorUserId: ctx.state.actorUserId,
            payload: {},
          });

          await appendFinancialLog({
            trx,
            entryType: "payment",
            referenceType: "order",
            referenceId: orderId,
            amount: Number(order.total_amount || 0),
            paymentMethod: method,
            shiftKey: String(ctx.request.body?.shift_key || "").trim() || null,
            metadata: {
              masked_reference: maskedReference,
              last_four: lastFour,
            },
          });
        });

        await writeAudit({
          entity: "orders",
          entityId: orderId,
          action: "pay",
          payload: {
            payment_method: method,
            masked_reference: maskedReference,
            last_four: lastFour,
            idempotency_key: idempotencyKey,
          },
          actorUserId: ctx.state.actorUserId,
        });

        return {
          order_id: orderId,
          payment_method: method,
          state: nextState,
          masked_reference: maskedReference,
          last_four: lastFour,
        };
      },
    });

    ctx.status = response.statusCode;
    ctx.body = response.body;
  },
);

commerceRouter.post(
  "/commerce/orders/:id/cancel",
  requirePermission("orders.write"),
  async (ctx) => {
    const idempotencyKey = assertIdempotencyKey(ctx, "order_cancel");
    const orderId = ctx.params.id;
    const reason = String(
      ctx.request.body?.reason || "cancelled by operator",
    ).trim();

    const response = await withIdempotency({
      operation: `order_cancel:${orderId}`,
      idempotencyKey,
      statusCode: 200,
      run: async () => {
        const order = await db("orders").where({ id: orderId }).first();
        if (!order) ctx.throw(404, "order not found");
        assertOwnerOrStaff(ctx, order.user_id);
        if (order.state !== orderStates.PENDING_PAYMENT) {
          ctx.throw(409, `order cannot be cancelled from state ${order.state}`);
        }

        await db.transaction(async (trx) => {
          await transitionOrderState({
            trx,
            order,
            toState: orderStates.CANCELLED,
            eventType: "manual_cancel",
            reason,
            idempotencyKey,
            actorUserId: ctx.state.actorUserId,
            payload: {},
          });
          await releaseOrderHolds({ trx, orderId: order.id });
        });

        await writeAudit({
          entity: "orders",
          entityId: order.id,
          action: "cancel",
          payload: { reason, idempotency_key: idempotencyKey },
          actorUserId: ctx.state.actorUserId,
        });

        return { order_id: order.id, state: orderStates.CANCELLED, reason };
      },
    });

    ctx.status = response.statusCode;
    ctx.body = response.body;
  },
);

commerceRouter.post(
  "/commerce/orders/expire-unpaid",
  requirePermission("orders.write"),
  async (ctx) => {
    const now = new Date();
    const targets = await db("orders")
      .where({ state: orderStates.PENDING_PAYMENT })
      .andWhere("expires_at", "<", now)
      .orderBy("expires_at", "asc");

    const expiredIds = [];
    for (const order of targets) {
      await db.transaction(async (trx) => {
        await transitionOrderState({
          trx,
          order,
          toState: orderStates.EXPIRED,
          eventType: "auto_expire",
          reason: "Unpaid for 15 minutes",
          idempotencyKey: null,
          actorUserId: ctx.state.actorUserId,
          payload: {},
        });
        await releaseOrderHolds({ trx, orderId: order.id });
      });
      expiredIds.push(order.id);
    }

    await writeAudit({
      entity: "orders",
      entityId: "batch",
      action: "expire_unpaid",
      payload: { count: expiredIds.length, ids: expiredIds },
      actorUserId: ctx.state.actorUserId,
    });

    ctx.body = { expired_count: expiredIds.length, order_ids: expiredIds };
  },
);

commerceRouter.post(
  "/commerce/orders/:id/transition",
  requirePermission("orders.write"),
  async (ctx) => {
    const idempotencyKey = assertIdempotencyKey(ctx, "order_transition");
    const orderId = ctx.params.id;
    const toState = String(ctx.request.body?.to_state || "").trim();
    const reason = String(ctx.request.body?.reason || "").trim() || null;

    const response = await withIdempotency({
      operation: `order_transition:${orderId}`,
      idempotencyKey,
      statusCode: 200,
      run: async () => {
        const order = await db("orders").where({ id: orderId }).first();
        if (!order) ctx.throw(404, "order not found");
        assertOwnerOrStaff(ctx, order.user_id);

        await db.transaction(async (trx) => {
          await transitionOrderState({
            trx,
            order,
            toState,
            eventType: "manual_transition",
            reason,
            idempotencyKey,
            actorUserId: ctx.state.actorUserId,
            payload: {},
          });
          if (
            toState === orderStates.CANCELLED ||
            toState === orderStates.EXPIRED
          ) {
            await releaseOrderHolds({ trx, orderId: order.id });
          }
        });

        await writeAudit({
          entity: "orders",
          entityId: order.id,
          action: "transition",
          payload: {
            to_state: toState,
            reason,
            idempotency_key: idempotencyKey,
          },
          actorUserId: ctx.state.actorUserId,
        });

        return { order_id: order.id, state: toState, reason };
      },
    });

    ctx.status = response.statusCode;
    ctx.body = response.body;
  },
);

commerceRouter.post(
  "/commerce/orders/:id/split",
  requirePermission("orders.write"),
  async (ctx) => {
    const idempotencyKey = assertIdempotencyKey(ctx, "order_split");
    const orderId = ctx.params.id;
    const response = await withIdempotency({
      operation: `order_split:${orderId}`,
      idempotencyKey,
      statusCode: 200,
      run: async () => {
        const order = await db("orders").where({ id: orderId }).first();
        if (!order) ctx.throw(404, "order not found");
        assertOwnerOrStaff(ctx, order.user_id);
        const items = await db("order_items").where({ order_id: order.id });
        if (!items.length) {
          ctx.throw(400, "order has no items to split");
        }

        const groupsMap = new Map();
        for (const item of items) {
          const key = item.fulfillment_path || fulfillmentPaths.INSTANT;
          const group = groupsMap.get(key) || [];
          group.push(item);
          groupsMap.set(key, group);
        }
        if (groupsMap.size <= 1) {
          return {
            message: "order already single fulfillment path",
            order_id: order.id,
          };
        }

        const now = new Date();
        const created = [];
        await db.transaction(async (trx) => {
          for (const [path, groupItems] of groupsMap.entries()) {
            const subtotal = toMoney(
              groupItems.reduce(
                (sum, row) => sum + toNumber(row.subtotal_amount),
                0,
              ),
            );
            const discount = toMoney(
              groupItems.reduce(
                (sum, row) => sum + toNumber(row.discount_amount),
                0,
              ),
            );
            const total = toMoney(
              groupItems.reduce(
                (sum, row) => sum + toNumber(row.total_amount),
                0,
              ),
            );

            const newOrderId = randomUUID();
            await trx("orders").insert({
              id: newOrderId,
              user_id: order.user_id,
              total_amount: total,
              status: order.state,
              state: order.state,
              payment_method: order.payment_method,
              notes: `Split from order ${order.id}`,
              order_group_id: order.order_group_id,
              fulfillment_path: path,
              coupon_code: order.coupon_code,
              metadata_json: JSON.stringify({ split_from_order_id: order.id }),
              expires_at: order.expires_at,
              paid_at: order.paid_at,
              cancelled_at: order.cancelled_at,
              cancelled_reason: order.cancelled_reason,
              payment_reference_masked: order.payment_reference_masked,
              payment_last_four: order.payment_last_four,
              created_at: now,
              updated_at: now,
            });

            for (const item of groupItems) {
              await trx("order_items").where({ id: item.id }).update({
                order_id: newOrderId,
                updated_at: now,
              });
            }

            created.push({
              id: newOrderId,
              fulfillment_path: path,
              subtotal_amount: subtotal,
              discount_amount: discount,
              total_amount: total,
              state: order.state,
            });
          }

          await trx("orders").where({ id: order.id }).del();
        });

        await writeAudit({
          entity: "orders",
          entityId: order.id,
          action: "split",
          payload: { created_orders: created, idempotency_key: idempotencyKey },
          actorUserId: ctx.state.actorUserId,
        });

        return { split_from_order_id: order.id, created_orders: created };
      },
    });

    ctx.status = response.statusCode;
    ctx.body = response.body;
  },
);

commerceRouter.post(
  "/commerce/orders/merge",
  requirePermission("orders.write"),
  async (ctx) => {
    const idempotencyKey = assertIdempotencyKey(ctx, "order_merge");
    const response = await withIdempotency({
      operation: "order_merge",
      idempotencyKey,
      statusCode: 200,
      run: async () => {
        const orderIds = Array.isArray(ctx.request.body?.order_ids)
          ? ctx.request.body.order_ids.map((id) => String(id)).filter(Boolean)
          : [];
        if (orderIds.length < 2) {
          ctx.throw(400, "at least two order_ids are required");
        }

        const orders = await db("orders").whereIn("id", orderIds);
        if (orders.length !== orderIds.length) {
          ctx.throw(400, "one or more orders not found");
        }

        const userId = orders[0].user_id;
        if (orders.some((order) => order.user_id !== userId)) {
          ctx.throw(400, "orders must belong to same user");
        }
        assertOwnerOrStaff(ctx, userId);

        const paths = [
          ...new Set(orders.map((order) => order.fulfillment_path)),
        ];
        if (paths.length > 1) {
          ctx.throw(400, "orders must share same fulfillment path to merge");
        }
        const states = [...new Set(orders.map((order) => order.state))];
        if (states.length > 1) {
          ctx.throw(400, "orders must share same state to merge");
        }

        const items = await db("order_items").whereIn("order_id", orderIds);
        if (!items.length) {
          ctx.throw(400, "selected orders do not contain items");
        }

        const now = new Date();
        const subtotal = toMoney(
          items.reduce((sum, row) => sum + toNumber(row.subtotal_amount), 0),
        );
        const discount = toMoney(
          items.reduce((sum, row) => sum + toNumber(row.discount_amount), 0),
        );
        const total = toMoney(
          items.reduce((sum, row) => sum + toNumber(row.total_amount), 0),
        );

        const mergedOrderId = randomUUID();
        await db.transaction(async (trx) => {
          await trx("orders").insert({
            id: mergedOrderId,
            user_id: userId,
            total_amount: total,
            status: states[0],
            state: states[0],
            payment_method: orders[0].payment_method,
            notes: `Merged from orders: ${orderIds.join(", ")}`,
            order_group_id: orders[0].order_group_id,
            fulfillment_path: paths[0],
            coupon_code: orders[0].coupon_code,
            metadata_json: JSON.stringify({ merged_from_order_ids: orderIds }),
            expires_at: orders[0].expires_at,
            paid_at: orders[0].paid_at,
            cancelled_at: orders[0].cancelled_at,
            cancelled_reason: orders[0].cancelled_reason,
            payment_reference_masked: orders[0].payment_reference_masked,
            payment_last_four: orders[0].payment_last_four,
            created_at: now,
            updated_at: now,
          });

          await trx("order_items").whereIn("order_id", orderIds).update({
            order_id: mergedOrderId,
            updated_at: now,
          });

          await trx("orders").whereIn("id", orderIds).del();
        });

        await writeAudit({
          entity: "orders",
          entityId: mergedOrderId,
          action: "merge",
          payload: {
            merged_from_order_ids: orderIds,
            idempotency_key: idempotencyKey,
          },
          actorUserId: ctx.state.actorUserId,
        });

        return {
          merged_order_id: mergedOrderId,
          merged_from_order_ids: orderIds,
          subtotal_amount: subtotal,
          discount_amount: discount,
          total_amount: total,
        };
      },
    });

    ctx.status = response.statusCode;
    ctx.body = response.body;
  },
);
