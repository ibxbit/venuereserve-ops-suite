import Router from "@koa/router";
import { randomUUID } from "crypto";
import { db } from "../db.js";
import { antiReplay } from "../middleware/anti-replay.js";
import { requirePermission } from "../middleware/authorize.js";
import { appendFinancialLog } from "../services/financial-log-service.js";
import {
  clearFailedLogin,
  generateSalt,
  hashPassword,
  logSecurityEvent,
  maskSensitive,
  recordFailedLogin,
  verifyPassword,
} from "../services/security-service.js";
import { writeAudit } from "../services/audit-service.js";
import { requiredNumber, requiredString } from "../utils/validation.js";

function toDate(value, field) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new Error(`${field} must be a valid date`);
    error.status = 400;
    throw error;
  }
  return date;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export const securityRouter = new Router();

securityRouter.post(
  "/auth/register",
  antiReplay({ optional: true }),
  async (ctx) => {
    const body = ctx.request.body || {};
    const fullName = requiredString(body.full_name, "full_name", { max: 120 });
    const email = requiredString(body.email, "email", {
      max: 160,
    }).toLowerCase();
    const password = requiredString(body.password, "password", {
      min: 8,
      max: 200,
    });
    const requestedRole = String(body.role || "")
      .trim()
      .toLowerCase();
    if (requestedRole && requestedRole !== "member") {
      ctx.throw(400, "public registration can only create member accounts");
    }

    const existing = await db("users").where({ email }).first();
    if (existing) {
      ctx.throw(409, "email already exists");
    }

    const salt = generateSalt();
    const passwordHash = hashPassword(password, salt);
    const now = new Date();

    const user = {
      id: randomUUID(),
      full_name: fullName,
      email,
      phone: body.phone || null,
      status: "active",
      role: "member",
      password_salt: salt,
      password_hash: passwordHash,
      failed_login_attempts: 0,
      locked_until: null,
      last_failed_login_at: null,
      created_at: now,
      updated_at: now,
    };

    await db("users").insert(user);
    await logSecurityEvent({
      eventType: "auth_register",
      severity: "info",
      userId: user.id,
      sourceIp: ctx.ip,
    });

    ctx.status = 201;
    ctx.body = {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
    };
  },
);

securityRouter.post(
  "/auth/login",
  antiReplay({ optional: true }),
  async (ctx) => {
    const body = ctx.request.body || {};
    const email = requiredString(body.email, "email", {
      max: 160,
    }).toLowerCase();
    const password = requiredString(body.password, "password", {
      min: 1,
      max: 200,
    });

    const user = await db("users").where({ email }).first();
    if (!user) {
      await logSecurityEvent({
        eventType: "login_failed_unknown_user",
        severity: "warning",
        sourceIp: ctx.ip,
        details: { email: maskSensitive(email) },
      });
      ctx.throw(401, "invalid credentials");
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      await logSecurityEvent({
        eventType: "login_rejected_locked",
        severity: "warning",
        userId: user.id,
        sourceIp: ctx.ip,
      });
      ctx.throw(423, "account is temporarily locked");
    }

    const ok = verifyPassword(password, user.password_salt, user.password_hash);
    if (!ok) {
      await recordFailedLogin(user, ctx.ip);
      ctx.throw(401, "invalid credentials");
    }

    await clearFailedLogin(user, ctx.ip);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60000);
    const token = randomUUID();
    await db("sessions").insert({
      id: randomUUID(),
      user_id: user.id,
      token,
      role: user.role || "member",
      created_at: now,
      expires_at: expiresAt,
    });

    ctx.body = {
      user_id: user.id,
      full_name: user.full_name,
      role: user.role || "member",
      token,
      token_expires_at: expiresAt,
      actor_headers: {
        "x-actor-user-id": user.id,
        "x-user-role": user.role || "member",
      },
    };
  },
);

securityRouter.get(
  "/security/events",
  requirePermission("reports.security"),
  async (ctx) => {
    const severity = String(ctx.query.severity || "").trim();
    const eventType = String(ctx.query.event_type || "").trim();
    const page = parsePositiveInt(ctx.query.page, 1);
    const perPage = Math.min(parsePositiveInt(ctx.query.per_page, 20), 100);
    const offset = (page - 1) * perPage;

    const query = db("security_events").orderBy("created_at", "desc");
    const countQuery = db("security_events").count({ total: "id" });
    if (severity) query.where({ severity });
    if (eventType) query.where({ event_type: eventType });
    if (severity) countQuery.where({ severity });
    if (eventType) countQuery.where({ event_type: eventType });

    const [{ total = 0 } = { total: 0 }, rows] = await Promise.all([
      countQuery,
      query.limit(perPage).offset(offset),
    ]);

    ctx.body = {
      data: rows,
      pagination: {
        page,
        per_page: perPage,
        total: Number(total || 0),
      },
    };
  },
);

securityRouter.put(
  "/security/users/:id/permissions",
  requirePermission("users.write"),
  async (ctx) => {
    const user = await db("users").where({ id: ctx.params.id }).first();
    if (!user) {
      ctx.throw(404, "user not found");
    }

    const permissionKey = requiredString(
      ctx.request.body?.permission_key,
      "permission_key",
      { max: 120 },
    );
    const isAllowed = Boolean(ctx.request.body?.is_allowed);
    const actor = ctx.state.actorUserId || null;
    const now = new Date();

    const existing = await db("user_permissions")
      .where({ user_id: user.id, permission_key: permissionKey })
      .first();

    if (existing) {
      await db("user_permissions").where({ id: existing.id }).update({
        is_allowed: isAllowed,
        granted_by_user_id: actor,
        updated_at: now,
      });
    } else {
      await db("user_permissions").insert({
        id: randomUUID(),
        user_id: user.id,
        permission_key: permissionKey,
        is_allowed: isAllowed,
        granted_by_user_id: actor,
        created_at: now,
        updated_at: now,
      });
    }

    await writeAudit({
      entity: "user_permissions",
      entityId: user.id,
      action: "permission_change",
      payload: {
        permission_key: permissionKey,
        is_allowed: isAllowed,
      },
      actorUserId: actor,
    });

    await logSecurityEvent({
      eventType: "permission_change",
      severity: "info",
      userId: user.id,
      sourceIp: ctx.ip,
      details: { permission_key: permissionKey, is_allowed: isAllowed },
    });

    ctx.body = {
      user_id: user.id,
      permission_key: permissionKey,
      is_allowed: isAllowed,
    };
  },
);

securityRouter.post(
  "/fines",
  requirePermission("orders.write"),
  antiReplay({ optional: true }),
  async (ctx) => {
    const userId = requiredString(ctx.request.body?.user_id, "user_id", {
      max: 36,
    });
    const amount = requiredNumber(ctx.request.body?.amount, "amount", {
      min: 0.01,
    });
    const reason = requiredString(ctx.request.body?.reason, "reason", {
      max: 255,
    });
    const reservationId = ctx.request.body?.reservation_id
      ? requiredString(ctx.request.body?.reservation_id, "reservation_id", {
          max: 36,
        })
      : null;

    const now = new Date();
    const fine = {
      id: randomUUID(),
      user_id: userId,
      reservation_id: reservationId,
      amount,
      status: "issued",
      reason,
      issued_by_user_id: ctx.state.actorUserId || null,
      paid_order_id: null,
      created_at: now,
      updated_at: now,
    };
    await db("fines").insert(fine);

    await appendFinancialLog({
      entryType: "fine_issued",
      referenceType: "fine",
      referenceId: fine.id,
      amount,
      paymentMethod: null,
      shiftKey: String(ctx.request.body?.shift_key || "").trim() || null,
      metadata: { user_id: userId, reason },
    });

    await writeAudit({
      entity: "fines",
      entityId: fine.id,
      action: "create",
      payload: fine,
      actorUserId: ctx.state.actorUserId,
    });

    ctx.status = 201;
    ctx.body = fine;
  },
);

securityRouter.post(
  "/refunds/:id/process",
  requirePermission("refunds.write"),
  antiReplay({ optional: true }),
  async (ctx) => {
    const refund = await db("refunds").where({ id: ctx.params.id }).first();
    if (!refund) {
      ctx.throw(404, "refund not found");
    }
    const decision = requiredString(ctx.request.body?.decision, "decision", {
      max: 20,
    }).toLowerCase();
    if (!["approved", "rejected"].includes(decision)) {
      ctx.throw(400, "decision must be approved or rejected");
    }

    const now = new Date();
    await db("refunds").where({ id: refund.id }).update({
      status: decision,
      processed_at: now,
      updated_at: now,
    });

    if (decision === "approved") {
      await appendFinancialLog({
        entryType: "refund",
        referenceType: "refund",
        referenceId: refund.id,
        amount: -Math.abs(Number(refund.amount || 0)),
        paymentMethod: null,
        shiftKey: String(ctx.request.body?.shift_key || "").trim() || null,
        metadata: { order_id: refund.order_id },
      });
    }

    await writeAudit({
      entity: "refunds",
      entityId: refund.id,
      action: `process_${decision}`,
      payload: {
        decision,
        processed_at: now,
      },
      actorUserId: ctx.state.actorUserId,
    });

    ctx.body = {
      id: refund.id,
      status: decision,
      processed_at: now,
    };
  },
);

securityRouter.get(
  "/reconciliation/daily",
  requirePermission("reports.financial"),
  async (ctx) => {
    const dateText = requiredString(ctx.query.date, "date", { max: 20 });
    const dayStart = toDate(`${dateText}T00:00:00`, "date");
    const dayEnd = toDate(`${dateText}T23:59:59.999`, "date");

    const totals = await db("financial_logs")
      .select("payment_method")
      .sum({ total: "amount" })
      .where("created_at", ">=", dayStart)
      .andWhere("created_at", "<=", dayEnd)
      .groupBy("payment_method");

    const overall = totals.reduce(
      (sum, row) => sum + Number(row.total || 0),
      0,
    );

    ctx.body = {
      date: dateText,
      totals_by_method: totals.map((row) => ({
        payment_method: row.payment_method || "unknown",
        total: Number(row.total || 0),
      })),
      overall_total: Number(overall.toFixed(2)),
    };
  },
);

securityRouter.post(
  "/reconciliation/shift-close",
  requirePermission("reports.financial"),
  antiReplay({ optional: true }),
  async (ctx) => {
    const shiftKey = requiredString(ctx.request.body?.shift_key, "shift_key", {
      max: 80,
    });
    const shiftStart = toDate(ctx.request.body?.shift_start, "shift_start");
    const shiftEnd = toDate(ctx.request.body?.shift_end, "shift_end");
    if (shiftStart >= shiftEnd) {
      ctx.throw(400, "shift_start must be before shift_end");
    }
    const countedTotal = requiredNumber(
      ctx.request.body?.counted_total,
      "counted_total",
      { min: 0 },
    );

    const expectedRow = await db("financial_logs")
      .sum({ total: "amount" })
      .where("created_at", ">=", shiftStart)
      .andWhere("created_at", "<=", shiftEnd)
      .andWhere((builder) => {
        builder.where({ shift_key: shiftKey }).orWhereNull("shift_key");
      })
      .first();

    const expectedTotal = Number(expectedRow?.total || 0);
    const variance = Number((countedTotal - expectedTotal).toFixed(2));
    const varianceFlag = Math.abs(variance) > 5;
    const now = new Date();

    const row = {
      id: randomUUID(),
      shift_key: shiftKey,
      shift_start: shiftStart,
      shift_end: shiftEnd,
      expected_total: expectedTotal,
      counted_total: countedTotal,
      variance_amount: variance,
      variance_flag: varianceFlag,
      counted_by_user_id: ctx.state.actorUserId || null,
      notes: ctx.request.body?.notes || null,
      counted_at: now,
      created_at: now,
      updated_at: now,
    };
    await db("cash_drawer_counts").insert(row);

    await appendFinancialLog({
      entryType: "reconciliation",
      referenceType: "shift",
      referenceId: row.id,
      amount: variance,
      paymentMethod: "cash",
      shiftKey,
      metadata: {
        expected_total: expectedTotal,
        counted_total: countedTotal,
        variance_flag: varianceFlag,
      },
    });

    await writeAudit({
      entity: "cash_drawer_counts",
      entityId: row.id,
      action: "create",
      payload: row,
      actorUserId: ctx.state.actorUserId,
    });

    ctx.status = 201;
    ctx.body = row;
  },
);

securityRouter.get(
  "/reconciliation/shift/:shiftKey",
  requirePermission("reports.financial"),
  async (ctx) => {
    const rows = await db("cash_drawer_counts")
      .where({ shift_key: ctx.params.shiftKey })
      .orderBy("counted_at", "desc");
    ctx.body = rows;
  },
);
