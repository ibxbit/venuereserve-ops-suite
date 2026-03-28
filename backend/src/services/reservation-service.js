import { db as defaultDb } from "../db.js";

export const THIRTY_MINUTES = 30;

export function toDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

export function diffMinutes(start, end) {
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return value === "1" || value === "true";
  return false;
}

function toConflictMessage(code) {
  switch (code) {
    case "capacity_exceeded":
      return "Capacity exceeded for this resource at the selected time.";
    case "occupancy_overlap":
      return "Occupancy overlap with an existing reservation.";
    case "cleaning_buffer":
      return "Required 15-minute cleaning buffer is not available.";
    case "blocked_resource":
      return "Resource is blocked and unavailable in this time range.";
    case "blacklist_restriction":
      return "Member is restricted by blacklist policy for this reservation.";
    default:
      return "Reservation conflicts with current scheduling rules.";
  }
}

function compareByStartTime(a, b) {
  return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
}

function areAdjacent(left, right) {
  return (
    new Date(left.end_time).getTime() === new Date(right.start_time).getTime()
  );
}

function isThirtyMinuteSlot(reservation) {
  const start = new Date(reservation.start_time);
  const end = new Date(reservation.end_time);
  return diffMinutes(start, end) === THIRTY_MINUTES;
}

function formatDateKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function parseClockOnDate(date, clockText) {
  const [hours, minutes, seconds] = String(clockText || "00:00:00")
    .split(":")
    .map((part) => Number(part || 0));
  const value = new Date(date);
  value.setHours(hours || 0, minutes || 0, seconds || 0, 0);
  return value;
}

export function parseDateAtTime(dateText, timeText) {
  if (!dateText || !timeText) return null;
  const normalizedTime = timeText.length === 5 ? `${timeText}:00` : timeText;
  const date = new Date(`${dateText}T${normalizedTime}`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

export function ensureReservationShape(payload) {
  if (!payload.user_id || !payload.resource_id) {
    const error = new Error("user_id and resource_id are required");
    error.status = 400;
    throw error;
  }

  const start = toDate(payload.start_time);
  const end = toDate(payload.end_time);
  if (!start || !end || start >= end) {
    const error = new Error("invalid reservation time range");
    error.status = 400;
    throw error;
  }

  return {
    user_id: payload.user_id,
    resource_id: payload.resource_id,
    start_time: start,
    end_time: end,
    status: payload.status || "booked",
    notes: payload.notes || null,
  };
}

export function ensurePolicy(resource) {
  return {
    bookingWindowDays: Number(resource.booking_window_days || 30),
    minDurationMinutes: Number(resource.min_duration_minutes || 30),
    maxDurationMinutes: Number(resource.max_duration_minutes || 240),
    earlyCheckInMinutes: Number(resource.early_check_in_minutes || 10),
    lateCheckInGraceMinutes: Number(resource.late_check_in_grace_minutes || 15),
    allowSlotStitching: Boolean(resource.allow_slot_stitching),
  };
}

export function enforceRuleWindow(start, now, policy) {
  const latest = new Date(
    now.getTime() + policy.bookingWindowDays * 24 * 60 * 60000,
  );
  if (start > latest) {
    const error = new Error(
      `booking exceeds ${policy.bookingWindowDays}-day window`,
    );
    error.status = 400;
    throw error;
  }
}

export function enforceRuleDuration(start, end, policy) {
  const minutes = diffMinutes(start, end);
  if (minutes < policy.minDurationMinutes) {
    const error = new Error(
      `minimum duration is ${policy.minDurationMinutes} minutes`,
    );
    error.status = 400;
    throw error;
  }
  if (minutes > policy.maxDurationMinutes) {
    const error = new Error(
      `maximum duration is ${policy.maxDurationMinutes} minutes`,
    );
    error.status = 400;
    throw error;
  }
  if (minutes % THIRTY_MINUTES !== 0) {
    const error = new Error("reservation duration must be in 30-minute slots");
    error.status = 400;
    throw error;
  }
}

export function intervalsOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

export async function listActiveReservations({
  resourceId,
  from,
  to,
  ignoreReservationId = null,
  db = defaultDb,
}) {
  const query = db("reservations")
    .where({ resource_id: resourceId })
    .whereIn("status", ["booked", "checked_in"])
    .where((builder) => {
      builder.where("start_time", "<", to).andWhere("end_time", ">", from);
    });

  if (ignoreReservationId) {
    query.whereNot({ id: ignoreReservationId });
  }

  return query;
}

export async function listResourceBlocks({
  resourceId,
  from,
  to,
  db = defaultDb,
}) {
  return db("resource_blocks")
    .where({ resource_id: resourceId })
    .where((builder) => {
      builder.where({ is_active: true }).orWhere({ is_active: 1 });
    })
    .where((builder) => {
      builder.where("start_time", "<", to).andWhere("end_time", ">", from);
    });
}

export async function listBlacklistEntries({
  userId,
  resourceId,
  from,
  to,
  db = defaultDb,
}) {
  return db("reservation_blacklists")
    .where({ user_id: userId })
    .where((builder) => {
      builder.whereNull("resource_id").orWhere({ resource_id: resourceId });
    })
    .where((builder) => {
      builder.where({ is_active: true }).orWhere({ is_active: 1 });
    })
    .where("blocked_from", "<", to)
    .where((builder) => {
      builder.whereNull("blocked_until").orWhere("blocked_until", ">", from);
    });
}

export function detectSchedulingConflicts({
  start,
  end,
  resource,
  activeReservations,
  resourceBlocks,
  blacklistEntries,
}) {
  const conflicts = [];

  const overlaps = activeReservations.filter((row) =>
    intervalsOverlap(
      start,
      end,
      new Date(row.start_time),
      new Date(row.end_time),
    ),
  );
  const capacity = Number(resource.capacity || 1);
  if (overlaps.length > 0) {
    if (capacity <= 1) {
      conflicts.push("occupancy_overlap");
    } else if (overlaps.length >= capacity) {
      conflicts.push("capacity_exceeded");
    }
  }

  const bufferMinutes = 15;
  const hasCleaningBufferConflict = activeReservations.some((row) => {
    const existingStart = new Date(row.start_time);
    const existingEnd = new Date(row.end_time);
    const expandedStart = new Date(
      existingStart.getTime() - bufferMinutes * 60000,
    );
    const expandedEnd = new Date(existingEnd.getTime() + bufferMinutes * 60000);
    const directOverlap = intervalsOverlap(
      start,
      end,
      existingStart,
      existingEnd,
    );
    if (directOverlap) return false;
    return intervalsOverlap(start, end, expandedStart, expandedEnd);
  });
  if (hasCleaningBufferConflict) {
    conflicts.push("cleaning_buffer");
  }

  const hasBlockedResource = resourceBlocks.some((row) =>
    intervalsOverlap(
      start,
      end,
      new Date(row.start_time),
      new Date(row.end_time),
    ),
  );
  if (hasBlockedResource) {
    conflicts.push("blocked_resource");
  }

  const hasBlacklistRestriction = blacklistEntries.some((row) => {
    const blockedFrom = new Date(row.blocked_from);
    const blockedUntil = row.blocked_until
      ? new Date(row.blocked_until)
      : new Date("9999-12-31T23:59:59.999Z");
    return intervalsOverlap(start, end, blockedFrom, blockedUntil);
  });
  if (hasBlacklistRestriction) {
    conflicts.push("blacklist_restriction");
  }

  return [...new Set(conflicts)].map((code) => ({
    code,
    message: toConflictMessage(code),
  }));
}

export async function getCalendarDayRule(date, db = defaultDb) {
  const key = formatDateKey(date);
  const holiday = await db("holiday_rules")
    .where({ holiday_date: key, is_active: true })
    .first();

  if (holiday) {
    return {
      date: key,
      source: "holiday",
      holiday_name: holiday.name,
      notes: holiday.notes || null,
      is_closed: toBoolean(holiday.is_closed),
      open_time: holiday.open_time,
      close_time: holiday.close_time,
    };
  }

  return {
    date: key,
    source: "standard",
    holiday_name: null,
    notes: null,
    is_closed: false,
    open_time: "06:00:00",
    close_time: "22:00:00",
  };
}

export async function enforceOperatingHours(start, end, db = defaultDb) {
  const dayRule = await getCalendarDayRule(start, db);
  if (dayRule.is_closed) {
    const error = new Error(
      `resource is unavailable on ${dayRule.date} (${dayRule.holiday_name || "holiday"})`,
    );
    error.status = 409;
    error.details = [
      {
        code: "holiday_closed",
        message: "The studio is closed on this holiday.",
      },
    ];
    throw error;
  }

  const openAt = parseClockOnDate(start, dayRule.open_time);
  const closeAt = parseClockOnDate(start, dayRule.close_time);
  if (start < openAt || end > closeAt) {
    const label =
      dayRule.source === "holiday" ? "holiday schedule" : "operating hours";
    const error = new Error(
      `reservation is outside ${label} (${dayRule.open_time} - ${dayRule.close_time})`,
    );
    error.status = 409;
    error.details = [
      {
        code: "outside_operating_hours",
        message: `Booking must be within ${dayRule.open_time} and ${dayRule.close_time}.`,
      },
    ];
    throw error;
  }

  return dayRule;
}

export async function validateWithResource({
  reservationPayload,
  ignoreReservationId = null,
  db = defaultDb,
}) {
  const resource = await db("resources")
    .where({ id: reservationPayload.resource_id, is_active: true })
    .first();
  if (!resource) {
    const error = new Error("resource not found or inactive");
    error.status = 400;
    throw error;
  }

  const policy = ensurePolicy(resource);
  const now = new Date();

  await enforceOperatingHours(
    reservationPayload.start_time,
    reservationPayload.end_time,
    db,
  );

  enforceRuleWindow(reservationPayload.start_time, now, policy);
  enforceRuleDuration(
    reservationPayload.start_time,
    reservationPayload.end_time,
    policy,
  );

  const from = new Date(reservationPayload.start_time.getTime() - 15 * 60000);
  const to = new Date(reservationPayload.end_time.getTime() + 15 * 60000);
  const [activeReservations, resourceBlocks, blacklistEntries] =
    await Promise.all([
      listActiveReservations({
        resourceId: reservationPayload.resource_id,
        from,
        to,
        ignoreReservationId,
        db,
      }),
      listResourceBlocks({
        resourceId: reservationPayload.resource_id,
        from,
        to,
        db,
      }),
      listBlacklistEntries({
        userId: reservationPayload.user_id,
        resourceId: reservationPayload.resource_id,
        from: reservationPayload.start_time,
        to: reservationPayload.end_time,
        db,
      }),
    ]);

  const conflicts = detectSchedulingConflicts({
    start: reservationPayload.start_time,
    end: reservationPayload.end_time,
    resource,
    activeReservations,
    resourceBlocks,
    blacklistEntries,
  });

  if (conflicts.length) {
    const error = new Error(conflicts[0].message);
    error.status = 409;
    error.details = conflicts;
    throw error;
  }

  return { resource, policy };
}

export async function stitchIfNeeded({
  reservation,
  policy,
  actorUserId,
  writeAudit,
  db = defaultDb,
}) {
  if (!policy.allowSlotStitching) return reservation;
  if (!isThirtyMinuteSlot(reservation)) return reservation;

  const candidates = await db("reservations")
    .where({
      resource_id: reservation.resource_id,
      user_id: reservation.user_id,
    })
    .whereIn("status", ["booked"])
    .orderBy("start_time", "asc");

  const chain = candidates.filter((row) => {
    const startsOrEndsInside =
      new Date(row.end_time).getTime() >=
        new Date(reservation.start_time).getTime() - THIRTY_MINUTES * 60000 &&
      new Date(row.start_time).getTime() <=
        new Date(reservation.end_time).getTime() + THIRTY_MINUTES * 60000;
    return startsOrEndsInside;
  });

  if (chain.length <= 1) return reservation;

  const sorted = [...chain].sort(compareByStartTime);
  for (let index = 1; index < sorted.length; index += 1) {
    if (
      !isThirtyMinuteSlot(sorted[index - 1]) ||
      !isThirtyMinuteSlot(sorted[index])
    ) {
      return reservation;
    }
    if (!areAdjacent(sorted[index - 1], sorted[index])) {
      return reservation;
    }
  }

  const stitchedStart = new Date(sorted[0].start_time);
  const stitchedEnd = new Date(sorted[sorted.length - 1].end_time);
  const stitchedDuration = diffMinutes(stitchedStart, stitchedEnd);
  if (stitchedDuration > policy.maxDurationMinutes) {
    return reservation;
  }

  const keeper = sorted[0];
  const removeIds = sorted.slice(1).map((item) => item.id);

  await db.transaction(async (trx) => {
    await trx("reservations").where({ id: keeper.id }).update({
      start_time: stitchedStart,
      end_time: stitchedEnd,
      updated_at: new Date(),
    });

    if (removeIds.length) {
      await trx("reservations").whereIn("id", removeIds).del();
    }
  });

  if (typeof writeAudit === "function") {
    await writeAudit({
      entity: "reservations",
      entityId: keeper.id,
      action: "stitch",
      payload: {
        keeper_id: keeper.id,
        removed_ids: removeIds,
        start_time: stitchedStart,
        end_time: stitchedEnd,
      },
      actorUserId,
    });
  }

  return db("reservations").where({ id: keeper.id }).first();
}
