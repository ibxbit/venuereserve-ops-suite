import { randomUUID } from "crypto";
import { db as defaultDb } from "../db.js";

export const fulfillmentPaths = {
  INSTANT: "instant_activation",
  PICKUP: "front_desk_pickup",
  MIXED: "mixed",
};

export const localTenderMethods = ["cash", "card_terminal", "gift_certificate"];

export const orderStates = {
  PENDING_PAYMENT: "pending_payment",
  PAID: "paid",
  ACTIVE: "active",
  AWAITING_PICKUP: "awaiting_pickup",
  FULFILLED: "fulfilled",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
};

export const allowedTransitions = {
  [orderStates.PENDING_PAYMENT]: [
    orderStates.PAID,
    orderStates.CANCELLED,
    orderStates.EXPIRED,
  ],
  [orderStates.PAID]: [orderStates.ACTIVE, orderStates.AWAITING_PICKUP],
  [orderStates.AWAITING_PICKUP]: [orderStates.FULFILLED],
  [orderStates.ACTIVE]: [],
  [orderStates.FULFILLED]: [],
  [orderStates.CANCELLED]: [],
  [orderStates.EXPIRED]: [],
};

export function toNumber(value) {
  return Number(value || 0);
}

export function toMoney(value) {
  return Math.round(toNumber(value) * 100) / 100;
}

export function nowPlusMinutes(minutes) {
  return new Date(Date.now() + minutes * 60000);
}

export function parseBoolean(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

export function extractLastFour(text) {
  const digits = String(text || "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.slice(-4).padStart(4, "0");
}

export function maskReference(text) {
  const cleaned = String(text || "").trim();
  if (!cleaned) return null;
  if (cleaned.length <= 4) return `****${cleaned}`;
  return `${"*".repeat(cleaned.length - 4)}${cleaned.slice(-4)}`;
}

export function isCouponActive(coupon) {
  if (!coupon || !parseBoolean(coupon.is_active)) return false;
  const now = new Date();
  if (coupon.starts_at && new Date(coupon.starts_at) > now) return false;
  if (coupon.ends_at && new Date(coupon.ends_at) < now) return false;
  return true;
}

export function buildEligibility(coupon, lines, subtotalAmount) {
  const eligibleLines = coupon.applies_to_category
    ? lines.filter((line) => line.category === coupon.applies_to_category)
    : [...lines];
  const eligibleSubtotal = toMoney(
    eligibleLines.reduce((sum, line) => sum + line.subtotal_amount, 0),
  );
  const thresholdBase = coupon.applies_to_category
    ? eligibleSubtotal
    : subtotalAmount;
  const meetsMin = thresholdBase >= toNumber(coupon.min_subtotal);
  return { eligibleLines, eligibleSubtotal, meetsMin };
}

export function computeCouponDiscount(coupon, eligibleSubtotal) {
  const value = toNumber(coupon.discount_value);
  let discount =
    coupon.discount_type === "fixed" ? value : eligibleSubtotal * (value / 100);
  if (coupon.max_discount !== null && coupon.max_discount !== undefined) {
    discount = Math.min(discount, toNumber(coupon.max_discount));
  }
  return toMoney(Math.min(discount, eligibleSubtotal));
}

export function distributeDiscount(lines, eligibleLines, totalDiscount) {
  const base = toMoney(
    eligibleLines.reduce((sum, line) => sum + line.subtotal_amount, 0),
  );
  if (!base || !totalDiscount) return lines;

  let assigned = 0;
  const eligibleSet = new Set(eligibleLines.map((line) => line.line_key));
  const lastEligibleKey = eligibleLines[eligibleLines.length - 1]?.line_key;
  return lines.map((line) => {
    if (!eligibleSet.has(line.line_key)) {
      return {
        ...line,
        discount_amount: 0,
        total_amount: line.subtotal_amount,
      };
    }
    const isLast = line.line_key === lastEligibleKey;
    const proportional = toMoney((line.subtotal_amount / base) * totalDiscount);
    const discount = isLast
      ? toMoney(totalDiscount - assigned)
      : Math.min(proportional, line.subtotal_amount);
    assigned = toMoney(assigned + discount);
    return {
      ...line,
      discount_amount: discount,
      total_amount: toMoney(line.subtotal_amount - discount),
    };
  });
}

export function groupByFulfillment(lines) {
  const map = new Map();
  for (const line of lines) {
    const bucket = map.get(line.fulfillment_path) || [];
    bucket.push(line);
    map.set(line.fulfillment_path, bucket);
  }
  return [...map.entries()].map(([fulfillment_path, items]) => ({
    fulfillment_path,
    items,
    subtotal_amount: toMoney(
      items.reduce((sum, item) => sum + item.subtotal_amount, 0),
    ),
    discount_amount: toMoney(
      items.reduce((sum, item) => sum + item.discount_amount, 0),
    ),
    total_amount: toMoney(
      items.reduce((sum, item) => sum + item.total_amount, 0),
    ),
  }));
}

export function validateCartInput(input) {
  if (!input?.user_id) {
    const error = new Error("user_id is required");
    error.status = 400;
    throw error;
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    const error = new Error("items is required");
    error.status = 400;
    throw error;
  }
}

export function assertTransition(fromState, toState, transitions) {
  const allowed = transitions[fromState] || [];
  if (!allowed.includes(toState)) {
    const error = new Error(
      `invalid transition from ${fromState} to ${toState}`,
    );
    error.status = 409;
    throw error;
  }
}

export async function withIdempotency({
  operation,
  idempotencyKey,
  statusCode,
  run,
  db = defaultDb,
}) {
  const existing = await db("idempotency_keys")
    .where({ operation, idempotency_key: idempotencyKey })
    .first();
  if (existing) {
    return {
      from_cache: true,
      statusCode: Number(existing.status_code || statusCode),
      body: JSON.parse(existing.response_json || "{}"),
    };
  }
  const body = await run();
  await db("idempotency_keys").insert({
    id: randomUUID(),
    operation,
    idempotency_key: idempotencyKey,
    status_code: statusCode,
    response_json: JSON.stringify(body),
    created_at: new Date(),
    expires_at: nowPlusMinutes(60 * 24 * 3),
  });
  return { from_cache: false, statusCode, body };
}

export async function buildQuote(input, db = defaultDb) {
  validateCartInput(input);

  const requestedItems = input.items
    .map((item) => ({
      catalog_item_id: String(item.catalog_item_id || "").trim(),
      quantity: Math.max(1, Number(item.quantity || 1)),
    }))
    .filter((item) => item.catalog_item_id);

  if (!requestedItems.length) {
    const error = new Error("at least one valid catalog_item_id is required");
    error.status = 400;
    throw error;
  }

  const itemIds = [
    ...new Set(requestedItems.map((item) => item.catalog_item_id)),
  ];
  const catalogRows = await db("catalog_items")
    .whereIn("id", itemIds)
    .andWhere({ is_active: true });
  const catalogMap = new Map(catalogRows.map((row) => [row.id, row]));

  const missing = itemIds.filter((id) => !catalogMap.has(id));
  if (missing.length) {
    const error = new Error(
      `catalog items not found or inactive: ${missing.join(", ")}`,
    );
    error.status = 400;
    throw error;
  }

  let lines = requestedItems.map((item, index) => {
    const catalog = catalogMap.get(item.catalog_item_id);
    const unitPrice = toNumber(catalog.base_price);
    const subtotal = toMoney(unitPrice * item.quantity);
    return {
      line_key: `${index}-${catalog.id}`,
      catalog_item_id: catalog.id,
      sku: catalog.sku,
      item_name: catalog.name,
      category: catalog.category,
      quantity: item.quantity,
      unit_price: unitPrice,
      subtotal_amount: subtotal,
      discount_amount: 0,
      total_amount: subtotal,
      fulfillment_path: catalog.fulfillment_path,
    };
  });

  const subtotalAmount = toMoney(
    lines.reduce((sum, line) => sum + line.subtotal_amount, 0),
  );

  let coupon = null;
  let appliedCoupon = null;
  let couponFailureReason = null;

  if (input.coupon_code) {
    coupon = await db("coupons")
      .whereRaw("LOWER(code) = ?", [String(input.coupon_code).toLowerCase()])
      .first();

    if (!coupon || !isCouponActive(coupon)) {
      couponFailureReason = "Coupon is invalid or inactive.";
    } else {
      const eligibility = buildEligibility(coupon, lines, subtotalAmount);
      if (!eligibility.eligibleLines.length) {
        couponFailureReason = "Coupon is not applicable to selected items.";
      } else if (!eligibility.meetsMin) {
        couponFailureReason = `Coupon requires minimum subtotal of ${toMoney(
          coupon.min_subtotal,
        )}.`;
      } else {
        const discount = computeCouponDiscount(
          coupon,
          eligibility.eligibleSubtotal,
        );
        lines = distributeDiscount(lines, eligibility.eligibleLines, discount);
        appliedCoupon = {
          code: coupon.code,
          name: coupon.name,
          discount_amount: discount,
        };
      }
    }
  }

  const discountAmount = toMoney(
    lines.reduce((sum, line) => sum + line.discount_amount, 0),
  );
  const totalAmount = toMoney(subtotalAmount - discountAmount);

  return {
    user_id: input.user_id,
    currency: "USD",
    lines,
    subtotal_amount: subtotalAmount,
    discount_amount: discountAmount,
    total_amount: totalAmount,
    applied_coupon: appliedCoupon,
    coupon_warning: couponFailureReason,
    fulfillment_groups: groupByFulfillment(lines),
  };
}

export async function createStateEvent({
  trx,
  orderId,
  fromState,
  toState,
  eventType,
  reason,
  idempotencyKey,
  actorUserId,
  payload,
}) {
  await trx("order_state_events").insert({
    id: randomUUID(),
    order_id: orderId,
    from_state: fromState,
    to_state: toState,
    event_type: eventType,
    reason: reason || null,
    idempotency_key: idempotencyKey || null,
    actor_user_id: actorUserId || null,
    payload_json: JSON.stringify(payload || {}),
    created_at: new Date(),
  });
}

export async function transitionOrderState({
  trx,
  order,
  toState,
  eventType,
  reason,
  idempotencyKey,
  actorUserId,
  payload,
  transitions = allowedTransitions,
}) {
  assertTransition(order.state, toState, transitions);
  const now = new Date();
  await trx("orders")
    .where({ id: order.id })
    .update({
      state: toState,
      status: toState,
      updated_at: now,
      cancelled_at:
        toState === orderStates.CANCELLED || toState === orderStates.EXPIRED
          ? now
          : order.cancelled_at,
      cancelled_reason:
        toState === orderStates.CANCELLED || toState === orderStates.EXPIRED
          ? reason || order.cancelled_reason
          : order.cancelled_reason,
    });

  await createStateEvent({
    trx,
    orderId: order.id,
    fromState: order.state,
    toState,
    eventType,
    reason,
    idempotencyKey,
    actorUserId,
    payload,
  });

  order.state = toState;
  order.status = toState;
  return toState;
}

export async function reserveInventoryHold({ trx, orderId, line }) {
  const catalog = await trx("catalog_items")
    .where({ id: line.catalog_item_id })
    .first();
  if (!catalog) {
    const error = new Error("catalog item not found");
    error.status = 400;
    throw error;
  }
  if (catalog.category !== "merchandise") return;

  const onHand = Number(catalog.inventory_on_hand || 0);
  const reserved = Number(catalog.inventory_reserved || 0);
  const available = onHand - reserved;
  if (line.quantity > available) {
    const error = new Error(`insufficient inventory for ${catalog.name}`);
    error.status = 409;
    throw error;
  }

  await trx("catalog_items")
    .where({ id: catalog.id })
    .update({
      inventory_reserved: reserved + line.quantity,
      updated_at: new Date(),
    });

  await trx("order_holds").insert({
    id: randomUUID(),
    order_id: orderId,
    hold_type: "inventory",
    reference_id: catalog.id,
    quantity: line.quantity,
    status: "held",
    metadata_json: JSON.stringify({ sku: catalog.sku }),
    created_at: new Date(),
    released_at: null,
  });
}

export async function reserveReservationHolds({
  trx,
  orderId,
  reservationHoldIds,
}) {
  if (!Array.isArray(reservationHoldIds)) return;
  for (const value of reservationHoldIds) {
    const reservationId = String(value || "").trim();
    if (!reservationId) continue;
    await trx("order_holds").insert({
      id: randomUUID(),
      order_id: orderId,
      hold_type: "reservation",
      reference_id: reservationId,
      quantity: 1,
      status: "held",
      metadata_json: JSON.stringify({}),
      created_at: new Date(),
      released_at: null,
    });
  }
}

export async function releaseOrderHolds({ trx, orderId }) {
  const holds = await trx("order_holds")
    .where({ order_id: orderId, status: "held" })
    .orderBy("created_at", "asc");

  for (const hold of holds) {
    if (hold.hold_type === "inventory") {
      const catalog = await trx("catalog_items")
        .where({ id: hold.reference_id })
        .first();
      if (catalog) {
        const nextReserved = Math.max(
          0,
          Number(catalog.inventory_reserved || 0) - Number(hold.quantity || 0),
        );
        await trx("catalog_items").where({ id: catalog.id }).update({
          inventory_reserved: nextReserved,
          updated_at: new Date(),
        });
      }
    }

    await trx("order_holds").where({ id: hold.id }).update({
      status: "released",
      released_at: new Date(),
    });
  }
}

export function assertLocalTender(method) {
  if (!localTenderMethods.includes(method)) {
    const error = new Error(
      `unsupported payment method; allowed: ${localTenderMethods.join(", ")}`,
    );
    error.status = 400;
    throw error;
  }
}

export function derivePostPaymentState(order) {
  if (
    order.fulfillment_path === fulfillmentPaths.PICKUP ||
    order.fulfillment_path === fulfillmentPaths.MIXED
  ) {
    return orderStates.AWAITING_PICKUP;
  }
  return orderStates.ACTIVE;
}
