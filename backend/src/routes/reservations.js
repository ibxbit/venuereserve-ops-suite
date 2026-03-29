import Router from "@koa/router";
import { randomUUID } from "crypto";
import { isManagerRole } from "../auth/roles.js";
import { db } from "../db.js";
import {
  assertOwnerOrStaff,
  requirePermission,
} from "../middleware/authorize.js";
import {
  appendAttendanceEvent,
  findApprovedOverride,
  getActiveStandingPolicy,
  isPeakHour,
  markOverrideUsed,
  recalculateAccountStanding,
} from "../services/account-standing-service.js";
import { writeAudit } from "../services/audit-service.js";
import {
  THIRTY_MINUTES,
  addMinutes,
  detectSchedulingConflicts,
  ensurePolicy,
  ensureReservationShape,
  getCalendarDayRule,
  intervalsOverlap,
  listActiveReservations,
  listBlacklistEntries,
  listResourceBlocks,
  parseDateAtTime,
  stitchIfNeeded,
  toDate,
  validateWithResource,
} from "../services/reservation-service.js";

async function getReservationOr404(id) {
  const row = await db("reservations").where({ id }).first();
  if (!row) {
    const error = new Error("reservation not found");
    error.status = 404;
    throw error;
  }
  return row;
}

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

async function getApprovedExceptionRequest(
  exceptionRequestId,
  reservationPayload,
) {
  if (!exceptionRequestId) return null;
  const row = await db("booking_exception_requests")
    .where({ id: exceptionRequestId, status: "approved" })
    .first();
  if (!row) return null;

  const sameUser = row.user_id === reservationPayload.user_id;
  const sameResource = row.resource_id === reservationPayload.resource_id;
  const overlaps = intervalsOverlap(
    reservationPayload.start_time,
    reservationPayload.end_time,
    new Date(row.start_time),
    new Date(row.end_time),
  );

  if (!sameUser || !sameResource || !overlaps) {
    return null;
  }

  return row;
}

function ensureManagerActor(ctx) {
  if (!isManagerRole(ctx.state.actorRole)) {
    ctx.throw(403, "manager role is required");
  }
}

async function enforcePeakHourStandingRestriction({ reservationPayload }) {
  const policy = await getActiveStandingPolicy();
  if (!isPeakHour(reservationPayload.start_time, policy)) {
    return null;
  }

  const standing = await recalculateAccountStanding(reservationPayload.user_id);
  const lowStanding = standing.score < policy.low_score_threshold;
  const noShowRestricted =
    standing.attendanceSummary.no_show_count >= policy.no_show_limit;

  if (!lowStanding && !noShowRestricted) {
    return null;
  }

  const approvedOverride = await findApprovedOverride({
    userId: reservationPayload.user_id,
    resourceId: reservationPayload.resource_id,
    start: reservationPayload.start_time,
    end: reservationPayload.end_time,
  });

  if (approvedOverride) {
    return { policy, standing, approvedOverride };
  }

  const reasons = [];
  if (lowStanding) {
    reasons.push(
      `standing score ${standing.score} is below threshold ${policy.low_score_threshold}`,
    );
  }
  if (noShowRestricted) {
    reasons.push(
      `${standing.attendanceSummary.no_show_count} no-shows in ${policy.lookback_days} days exceeds limit ${policy.no_show_limit}`,
    );
  }

  const error = new Error(
    "peak-hour booking requires manager override due to account standing",
  );
  error.status = 409;
  error.details = [
    {
      code: "account_standing_restriction",
      message:
        "This user is blocked from peak-hour booking unless a manager override is approved.",
    },
    ...reasons.map((text) => ({
      code: "account_standing_detail",
      message: text,
    })),
  ];
  throw error;
}

function parseOverridePayload(payload) {
  if (!payload.user_id || !payload.start_time || !payload.end_time) {
    const error = new Error("user_id, start_time and end_time are required");
    error.status = 400;
    throw error;
  }

  const start = toDate(payload.start_time);
  const end = toDate(payload.end_time);
  if (!start || !end || start >= end) {
    const error = new Error("invalid override time range");
    error.status = 400;
    throw error;
  }

  return {
    user_id: payload.user_id,
    resource_id: payload.resource_id || null,
    start_time: start,
    end_time: end,
    reason: payload.reason || null,
    status: "approved",
  };
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export const reservationRouter = new Router();

reservationRouter.get(
  "/reservations",
  requirePermission("reservations.read"),
  async (ctx) => {
    const page = parsePositiveInt(ctx.query.page, 1);
    const perPage = Math.min(parsePositiveInt(ctx.query.per_page, 20), 100);
    const offset = (page - 1) * perPage;
    const status = String(ctx.query.status || "").trim();
    const resourceId = String(ctx.query.resource_id || "").trim();
    const userIdFilter = String(ctx.query.user_id || "").trim();

    const query = db("reservations").orderBy("start_time", "asc");
    const countQuery = db("reservations").count({ total: "id" });

    if (status) {
      query.where({ status });
      countQuery.where({ status });
    }
    if (resourceId) {
      query.where({ resource_id: resourceId });
      countQuery.where({ resource_id: resourceId });
    }

    if (ctx.state.actorRole === "member") {
      if (!ctx.state.actorUserId) {
        ctx.throw(400, "x-actor-user-id is required for member scope");
      }
      if (userIdFilter && userIdFilter !== ctx.state.actorUserId) {
        ctx.throw(403, "members can only filter their own reservations");
      }
      query.where({ user_id: ctx.state.actorUserId });
      countQuery.where({ user_id: ctx.state.actorUserId });
    } else if (userIdFilter) {
      query.where({ user_id: userIdFilter });
      countQuery.where({ user_id: userIdFilter });
    }

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

reservationRouter.get(
  "/reservations/:id",
  requirePermission("reservations.read"),
  async (ctx) => {
    const row = await getReservationOr404(ctx.params.id);
    if (
      ctx.state.actorRole === "member" &&
      row.user_id !== ctx.state.actorUserId
    ) {
      ctx.throw(403, "forbidden");
    }
    ctx.body = row;
  },
);

reservationRouter.get(
  "/calendar/day-rules",
  requirePermission("reservations.read"),
  async (ctx) => {
    const dateText = String(ctx.query.date || "").trim();
    if (!dateText) {
      ctx.throw(400, "date is required");
    }
    const date = new Date(`${dateText}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      ctx.throw(400, "invalid date format");
    }

    const dayRule = await getCalendarDayRule(date);
    ctx.body = dayRule;
  },
);

reservationRouter.get(
  "/booking-exceptions",
  requirePermission("reservations.read"),
  async (ctx) => {
    const status = String(ctx.query.status || "").trim();
    const userId = String(ctx.query.user_id || "").trim();
    const scopedUserId = resolveActorScopedUserId(ctx, userId);

    const query = db("booking_exception_requests").orderBy(
      "created_at",
      "desc",
    );
    if (status) query.where({ status });
    if (scopedUserId) query.where({ user_id: scopedUserId });

    ctx.body = await query.limit(400);
  },
);

reservationRouter.post(
  "/booking-exceptions",
  requirePermission("reservations.write"),
  async (ctx) => {
    const body = ctx.request.body || {};
    const userId = resolveActorScopedUserId(ctx, body.user_id);
    if (!userId || !body.resource_id || !body.start_time || !body.end_time) {
      ctx.throw(
        400,
        "user_id, resource_id, start_time and end_time are required",
      );
    }
    if (!String(body.request_reason || "").trim()) {
      ctx.throw(400, "request_reason is required");
    }

    const start = toDate(body.start_time);
    const end = toDate(body.end_time);
    if (!start || !end || start >= end) {
      ctx.throw(400, "invalid exception time range");
    }

    const now = new Date();
    const row = {
      id: randomUUID(),
      user_id: userId,
      resource_id: body.resource_id,
      start_time: start,
      end_time: end,
      status: "pending",
      request_reason: String(body.request_reason).trim(),
      decision_reason: null,
      decision_by_user_id: null,
      decided_at: null,
      payload_json: JSON.stringify(body.payload || {}),
      created_at: now,
      updated_at: now,
    };

    await db("booking_exception_requests").insert(row);
    await writeAudit({
      entity: "booking_exception_requests",
      entityId: row.id,
      action: "request",
      payload: row,
      actorUserId: ctx.state.actorUserId,
    });

    ctx.status = 201;
    ctx.body = row;
  },
);

reservationRouter.post(
  "/booking-exceptions/:id/decision",
  requirePermission("users.write"),
  async (ctx) => {
    ensureManagerActor(ctx);

    const current = await db("booking_exception_requests")
      .where({ id: ctx.params.id })
      .first();
    if (!current) {
      ctx.throw(404, "booking exception request not found");
    }
    if (current.status !== "pending") {
      ctx.throw(400, "booking exception request is already decided");
    }

    const decision = String(ctx.request.body?.decision || "")
      .trim()
      .toLowerCase();
    if (!decision || !["approved", "rejected"].includes(decision)) {
      ctx.throw(400, "decision must be approved or rejected");
    }

    const reason = String(ctx.request.body?.decision_reason || "").trim();
    if (!reason) {
      ctx.throw(400, "decision_reason is required");
    }

    const now = new Date();
    const updatePayload = {
      status: decision,
      decision_reason: reason,
      decision_by_user_id: ctx.state.actorUserId,
      decided_at: now,
      updated_at: now,
    };

    await db("booking_exception_requests")
      .where({ id: ctx.params.id })
      .update(updatePayload);
    const updated = await db("booking_exception_requests")
      .where({ id: ctx.params.id })
      .first();

    await writeAudit({
      entity: "booking_exception_requests",
      entityId: updated.id,
      action: decision,
      payload: {
        request_reason: updated.request_reason,
        decision_reason: updated.decision_reason,
        decision_by_user_id: updated.decision_by_user_id,
      },
      actorUserId: ctx.state.actorUserId,
    });

    ctx.body = updated;
  },
);

reservationRouter.get(
  "/availability",
  requirePermission("reservations.read"),
  async (ctx) => {
    const resourceId = String(ctx.query.resource_id || "").trim();
    const dateText = String(ctx.query.date || "").trim();
    const durationMinutes = Number(
      ctx.query.duration_minutes || THIRTY_MINUTES,
    );
    const userId = resolveActorScopedUserId(
      ctx,
      String(ctx.query.user_id || ctx.state.actorUserId || "").trim(),
    );
    const requestedTime = String(ctx.query.start_time || "").trim();

    if (!resourceId || !dateText || !userId) {
      ctx.throw(400, "resource_id, date, and user_id are required");
    }

    const resource = await db("resources")
      .where({ id: resourceId, is_active: true })
      .first();
    if (!resource) {
      ctx.throw(404, "resource not found or inactive");
    }

    const policy = ensurePolicy(resource);
    if (durationMinutes < policy.minDurationMinutes) {
      ctx.throw(
        400,
        `minimum duration is ${policy.minDurationMinutes} minutes`,
      );
    }
    if (durationMinutes > policy.maxDurationMinutes) {
      ctx.throw(
        400,
        `maximum duration is ${policy.maxDurationMinutes} minutes`,
      );
    }
    if (durationMinutes % THIRTY_MINUTES !== 0) {
      ctx.throw(400, "duration_minutes must be in 30-minute increments");
    }

    const dayRule = await getCalendarDayRule(new Date(`${dateText}T00:00:00`));
    if (dayRule.is_closed) {
      ctx.body = {
        resource_id: resourceId,
        date: dateText,
        duration_minutes: durationMinutes,
        day_rule: dayRule,
        slots: [],
        requested: null,
        alternatives: [],
      };
      return;
    }

    const browseStart = parseDateAtTime(
      dateText,
      dayRule.open_time.slice(0, 5),
    );
    const browseEnd = parseDateAtTime(dateText, dayRule.close_time.slice(0, 5));
    if (!browseStart || !browseEnd) {
      ctx.throw(400, "invalid date format");
    }

    const queryFrom = addMinutes(browseStart, -15);
    const queryTo = addMinutes(browseEnd, 15 + durationMinutes);
    const [activeReservations, resourceBlocks, blacklistEntries] =
      await Promise.all([
        listActiveReservations({
          resourceId,
          from: queryFrom,
          to: queryTo,
        }),
        listResourceBlocks({
          resourceId,
          from: queryFrom,
          to: queryTo,
        }),
        listBlacklistEntries({
          userId,
          resourceId,
          from: browseStart,
          to: queryTo,
        }),
      ]);

    const slots = [];
    for (
      let cursor = new Date(browseStart);
      cursor.getTime() + durationMinutes * 60000 <= browseEnd.getTime();
      cursor = addMinutes(cursor, THIRTY_MINUTES)
    ) {
      const start = new Date(cursor);
      const end = addMinutes(start, durationMinutes);
      const conflicts = detectSchedulingConflicts({
        start,
        end,
        resource,
        activeReservations,
        resourceBlocks,
        blacklistEntries,
      });

      slots.push({
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        available: conflicts.length === 0,
        conflicts: conflicts.map((item) => item.message),
      });
    }

    let requested = null;
    if (requestedTime) {
      const requestedStart = parseDateAtTime(dateText, requestedTime);
      if (!requestedStart) {
        ctx.throw(400, "invalid start_time format");
      }
      const requestedEnd = addMinutes(requestedStart, durationMinutes);
      const conflicts = detectSchedulingConflicts({
        start: requestedStart,
        end: requestedEnd,
        resource,
        activeReservations,
        resourceBlocks,
        blacklistEntries,
      });
      requested = {
        start_time: requestedStart.toISOString(),
        end_time: requestedEnd.toISOString(),
        available: conflicts.length === 0,
        conflicts: conflicts.map((item) => item.message),
      };
    }

    const availableSlots = slots.filter((slot) => slot.available);
    const alternatives = requested
      ? availableSlots
          .sort((left, right) => {
            const requestedStartMs = new Date(requested.start_time).getTime();
            const leftDelta = Math.abs(
              new Date(left.start_time).getTime() - requestedStartMs,
            );
            const rightDelta = Math.abs(
              new Date(right.start_time).getTime() - requestedStartMs,
            );
            return leftDelta - rightDelta;
          })
          .slice(0, 6)
      : availableSlots.slice(0, 6);

    ctx.body = {
      resource_id: resourceId,
      date: dateText,
      duration_minutes: durationMinutes,
      day_rule: dayRule,
      slots,
      requested,
      alternatives,
    };
  },
);

reservationRouter.get(
  "/account-standing-policy",
  requirePermission("users.read"),
  async (ctx) => {
    const policy = await getActiveStandingPolicy();
    ctx.body = policy;
  },
);

reservationRouter.put(
  "/account-standing-policy/:id",
  requirePermission("users.write"),
  async (ctx) => {
    ensureManagerActor(ctx);
    const active = await getActiveStandingPolicy();
    const next = {
      lookback_days: ctx.request.body?.lookback_days ?? active.lookback_days,
      low_score_threshold:
        ctx.request.body?.low_score_threshold ?? active.low_score_threshold,
      no_show_limit: ctx.request.body?.no_show_limit ?? active.no_show_limit,
      no_show_penalty_points:
        ctx.request.body?.no_show_penalty_points ??
        active.no_show_penalty_points,
      check_in_reward_points:
        ctx.request.body?.check_in_reward_points ??
        active.check_in_reward_points,
      peak_start_time:
        ctx.request.body?.peak_start_time ?? active.peak_start_time,
      peak_end_time: ctx.request.body?.peak_end_time ?? active.peak_end_time,
      updated_at: new Date(),
    };

    await db("account_standing_policies")
      .where({ id: ctx.params.id })
      .update(next);
    const updated = await db("account_standing_policies")
      .where({ id: ctx.params.id })
      .first();
    if (!updated) {
      ctx.throw(404, "standing policy not found");
    }

    await writeAudit({
      entity: "account_standing_policies",
      entityId: ctx.params.id,
      action: "update",
      payload: next,
      actorUserId: ctx.state.actorUserId,
    });

    ctx.body = updated;
  },
);

reservationRouter.get(
  "/account-standing/:userId",
  requirePermission("users.read"),
  async (ctx) => {
    const user = await db("users").where({ id: ctx.params.userId }).first();
    if (!user) {
      ctx.throw(404, "user not found");
    }

    const standing = await recalculateAccountStanding(ctx.params.userId);
    const policy = standing.policy;
    const isRestrictedForPeak =
      standing.score < policy.low_score_threshold ||
      standing.attendanceSummary.no_show_count >= policy.no_show_limit;

    ctx.body = {
      user_id: ctx.params.userId,
      standing_score: standing.score,
      no_show_count_lookback: standing.attendanceSummary.no_show_count,
      check_in_count_lookback: standing.attendanceSummary.check_in_count,
      lookback_days: policy.lookback_days,
      peak_restricted: isRestrictedForPeak,
      thresholds: {
        low_score_threshold: policy.low_score_threshold,
        no_show_limit: policy.no_show_limit,
      },
    };
  },
);

reservationRouter.get(
  "/attendance-history",
  requirePermission("users.read"),
  async (ctx) => {
    const page = parsePositiveInt(ctx.query.page, 1);
    const perPage = Math.min(parsePositiveInt(ctx.query.per_page, 20), 100);
    const offset = (page - 1) * perPage;
    const userId = String(ctx.query.user_id || "").trim();
    const eventType = String(ctx.query.event_type || "").trim();
    const query = db("attendance_history").orderBy("event_time", "desc");
    const countQuery = db("attendance_history").count({ total: "id" });
    if (userId) {
      query.where({ user_id: userId });
      countQuery.where({ user_id: userId });
    }
    if (eventType) {
      query.where({ event_type: eventType });
      countQuery.where({ event_type: eventType });
    }

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

reservationRouter.get(
  "/reservation-overrides",
  requirePermission("users.read"),
  async (ctx) => {
    const userId = String(ctx.query.user_id || "").trim();
    const status = String(ctx.query.status || "").trim();
    const query = db("reservation_overrides").orderBy("created_at", "desc");
    if (userId) {
      query.where({ user_id: userId });
    }
    if (status) {
      query.where({ status });
    }
    const rows = await query;
    ctx.body = rows;
  },
);

reservationRouter.post(
  "/reservation-overrides",
  requirePermission("users.write"),
  async (ctx) => {
    ensureManagerActor(ctx);
    const parsed = parseOverridePayload(ctx.request.body || {});
    const row = {
      id: randomUUID(),
      ...parsed,
      approved_by_user_id: ctx.state.actorUserId,
      created_at: new Date(),
      updated_at: new Date(),
    };

    await db("reservation_overrides").insert(row);

    await writeAudit({
      entity: "reservation_overrides",
      entityId: row.id,
      action: "approve",
      payload: row,
      actorUserId: ctx.state.actorUserId,
    });

    ctx.status = 201;
    ctx.body = row;
  },
);

reservationRouter.post(
  "/reservations",
  requirePermission("reservations.write"),
  async (ctx) => {
    const scopedBody = {
      ...(ctx.request.body || {}),
      user_id: resolveActorScopedUserId(ctx, ctx.request.body?.user_id),
    };
    const parsed = ensureReservationShape(scopedBody);
    const exceptionRequestId = String(
      ctx.request.body?.exception_request_id || "",
    ).trim();
    let approvedException = null;
    let policy;

    try {
      ({ policy } = await validateWithResource({ reservationPayload: parsed }));
    } catch (error) {
      approvedException = await getApprovedExceptionRequest(
        exceptionRequestId,
        parsed,
      );
      if (!approvedException) {
        throw error;
      }

      const resource = await db("resources")
        .where({ id: parsed.resource_id, is_active: true })
        .first();
      if (!resource) {
        throw error;
      }
      policy = ensurePolicy(resource);
    }

    const standingGate = await enforcePeakHourStandingRestriction({
      reservationPayload: parsed,
    });
    const now = new Date();
    const row = {
      id: randomUUID(),
      ...parsed,
      created_at: now,
      updated_at: now,
    };

    await db("reservations").insert(row);

    let finalRow = row;
    finalRow = await stitchIfNeeded({
      reservation: row,
      policy,
      actorUserId: ctx.state.actorUserId,
      writeAudit,
    });

    if (standingGate?.approvedOverride) {
      await markOverrideUsed(standingGate.approvedOverride.id);
    }

    await writeAudit({
      entity: "reservations",
      entityId: finalRow.id,
      action: "create",
      payload: {
        requested_reservation_id: row.id,
        final_reservation_id: finalRow.id,
        used_override_id: standingGate?.approvedOverride?.id || null,
        booking_exception_request_id: approvedException?.id || null,
        reservation: finalRow,
      },
      actorUserId: ctx.state.actorUserId,
    });

    ctx.status = 201;
    ctx.body = finalRow;
  },
);

reservationRouter.put(
  "/reservations/:id",
  requirePermission("reservations.write"),
  async (ctx) => {
    const existing = await getReservationOr404(ctx.params.id);
    assertOwnerOrStaff(ctx, existing.user_id);
    const scopedBody = {
      ...(ctx.request.body || {}),
      user_id: resolveActorScopedUserId(
        ctx,
        ctx.request.body?.user_id || existing.user_id,
      ),
    };
    const parsed = ensureReservationShape(scopedBody);
    const exceptionRequestId = String(
      ctx.request.body?.exception_request_id || "",
    ).trim();
    let approvedException = null;

    try {
      await validateWithResource({
        reservationPayload: parsed,
        ignoreReservationId: ctx.params.id,
      });
    } catch (error) {
      approvedException = await getApprovedExceptionRequest(
        exceptionRequestId,
        parsed,
      );
      if (!approvedException) {
        throw error;
      }
    }

    const standingGate = await enforcePeakHourStandingRestriction({
      reservationPayload: parsed,
    });

    const updatePayload = {
      ...parsed,
      updated_at: new Date(),
    };

    await db("reservations").where({ id: ctx.params.id }).update(updatePayload);

    if (standingGate?.approvedOverride) {
      await markOverrideUsed(standingGate.approvedOverride.id);
    }

    const row = await getReservationOr404(ctx.params.id);

    await writeAudit({
      entity: "reservations",
      entityId: ctx.params.id,
      action: "update",
      payload: {
        ...updatePayload,
        used_override_id: standingGate?.approvedOverride?.id || null,
        booking_exception_request_id: approvedException?.id || null,
      },
      actorUserId: ctx.state.actorUserId,
    });

    ctx.body = row;
  },
);

reservationRouter.delete(
  "/reservations/:id",
  requirePermission("reservations.write"),
  async (ctx) => {
    const existing = await getReservationOr404(ctx.params.id);
    assertOwnerOrStaff(ctx, existing.user_id);
    await db("reservations").where({ id: ctx.params.id }).del();

    await writeAudit({
      entity: "reservations",
      entityId: ctx.params.id,
      action: "delete",
      payload: existing,
      actorUserId: ctx.state.actorUserId,
    });

    ctx.status = 204;
  },
);

reservationRouter.post(
  "/reservations/:id/check-in",
  requirePermission("reservations.write"),
  async (ctx) => {
    const reservation = await getReservationOr404(ctx.params.id);
    assertOwnerOrStaff(ctx, reservation.user_id);
    if (reservation.status !== "booked") {
      ctx.throw(400, "only booked reservations can be checked in");
    }
    const resource = await db("resources")
      .where({ id: reservation.resource_id })
      .first();
    if (!resource) {
      ctx.throw(400, "resource not found");
    }

    const policy = ensurePolicy(resource);
    const now = new Date();
    const start = new Date(reservation.start_time);
    const earlyAllowedAt = new Date(
      start.getTime() - policy.earlyCheckInMinutes * 60000,
    );
    const graceUntil = new Date(
      start.getTime() + policy.lateCheckInGraceMinutes * 60000,
    );

    if (now < earlyAllowedAt) {
      ctx.throw(
        400,
        `check-in opens ${policy.earlyCheckInMinutes} minutes before start time`,
      );
    }

    if (now > graceUntil) {
      await db("reservations").where({ id: reservation.id }).update({
        status: "no_show",
        updated_at: now,
      });
      await appendAttendanceEvent({
        userId: reservation.user_id,
        reservationId: reservation.id,
        eventType: "no_show",
        actorUserId: ctx.state.actorUserId,
        eventTime: now,
      });
      await recalculateAccountStanding(reservation.user_id);
      await writeAudit({
        entity: "reservations",
        entityId: reservation.id,
        action: "mark_no_show",
        payload: { checked_at: now.toISOString() },
        actorUserId: ctx.state.actorUserId,
      });
      ctx.body = { status: "no_show", message: "late check-in grace exceeded" };
      return;
    }

    await db("reservations").where({ id: reservation.id }).update({
      status: "checked_in",
      updated_at: now,
    });

    await appendAttendanceEvent({
      userId: reservation.user_id,
      reservationId: reservation.id,
      eventType: "check_in",
      actorUserId: ctx.state.actorUserId,
      eventTime: now,
    });
    await recalculateAccountStanding(reservation.user_id);

    await writeAudit({
      entity: "reservations",
      entityId: reservation.id,
      action: "check_in",
      payload: { checked_at: now.toISOString() },
      actorUserId: ctx.state.actorUserId,
    });

    ctx.body = { status: "checked_in" };
  },
);

reservationRouter.post(
  "/reservations/mark-no-shows",
  requirePermission("reservations.write"),
  async (ctx) => {
    const now = new Date();
    const candidates = await db("reservations as r")
      .join("resources as res", "res.id", "r.resource_id")
      .select(
        "r.id",
        "r.user_id",
        "r.start_time",
        "res.late_check_in_grace_minutes as late_grace",
      )
      .where("r.status", "booked");

    const markIds = candidates
      .filter((row) => {
        const grace = Number(row.late_grace || 15);
        const cutoff = new Date(
          new Date(row.start_time).getTime() + grace * 60000,
        );
        return now > cutoff;
      })
      .map((row) => row.id);

    if (markIds.length) {
      await db("reservations").whereIn("id", markIds).update({
        status: "no_show",
        updated_at: now,
      });

      const markedRows = candidates.filter((row) => markIds.includes(row.id));
      for (const row of markedRows) {
        await appendAttendanceEvent({
          userId: row.user_id,
          reservationId: row.id,
          eventType: "no_show",
          actorUserId: ctx.state.actorUserId,
          eventTime: now,
        });
      }

      const uniqueUsers = [...new Set(markedRows.map((row) => row.user_id))];
      for (const userId of uniqueUsers) {
        await recalculateAccountStanding(userId);
      }
    }

    await writeAudit({
      entity: "reservations",
      entityId: "batch",
      action: "mark_no_show_batch",
      payload: { count: markIds.length, ids: markIds },
      actorUserId: ctx.state.actorUserId,
    });

    ctx.body = { marked_count: markIds.length };
  },
);
