import { randomUUID } from "crypto";
import { db } from "../db.js";

const DEFAULT_POLICY = {
  id: "default-standing-policy",
  name: "Default Standing Policy",
  is_active: true,
  lookback_days: 30,
  low_score_threshold: 60,
  no_show_limit: 2,
  no_show_penalty_points: 25,
  check_in_reward_points: 2,
  peak_start_time: "17:00:00",
  peak_end_time: "20:00:00",
};

function clampScore(value) {
  return Math.max(0, Math.min(100, value));
}

function parseTimeStringToMinutes(timeText) {
  const [hoursText, minutesText] = String(timeText || "00:00:00").split(":");
  const hours = Number(hoursText || 0);
  const minutes = Number(minutesText || 0);
  return hours * 60 + minutes;
}

function toEventCutoffDate(days) {
  const now = new Date();
  return new Date(now.getTime() - Number(days || 30) * 24 * 60 * 60000);
}

function extractNoShowCount(rows) {
  const noShowRow = rows.find((row) => row.event_type === "no_show");
  return Number(noShowRow?.count || 0);
}

function extractCheckInCount(rows) {
  const checkInRow = rows.find((row) => row.event_type === "check_in");
  return Number(checkInRow?.count || 0);
}

export function normalizeStandingPolicy(policy) {
  const base = policy || DEFAULT_POLICY;
  return {
    id: base.id,
    name: base.name,
    is_active: Boolean(base.is_active),
    lookback_days: Number(base.lookback_days || 30),
    low_score_threshold: Number(base.low_score_threshold || 60),
    no_show_limit: Number(base.no_show_limit || 2),
    no_show_penalty_points: Number(base.no_show_penalty_points || 25),
    check_in_reward_points: Number(base.check_in_reward_points || 2),
    peak_start_time: base.peak_start_time || "17:00:00",
    peak_end_time: base.peak_end_time || "20:00:00",
  };
}

export async function getActiveStandingPolicy() {
  const row = await db("account_standing_policies")
    .where({ is_active: true })
    .orderBy("updated_at", "desc")
    .first();
  return normalizeStandingPolicy(row);
}

export async function getAttendanceSummary(userId, policy) {
  const cutoff = toEventCutoffDate(policy.lookback_days);
  const rows = await db("attendance_history")
    .select("event_type")
    .count({ count: "id" })
    .where({ user_id: userId })
    .andWhere("event_time", ">=", cutoff)
    .groupBy("event_type");

  return {
    no_show_count: extractNoShowCount(rows),
    check_in_count: extractCheckInCount(rows),
  };
}

export function calculateStandingScore({ policy, attendanceSummary }) {
  const deductions =
    attendanceSummary.no_show_count * policy.no_show_penalty_points;
  const rewards =
    attendanceSummary.check_in_count * policy.check_in_reward_points;
  return clampScore(100 - deductions + rewards);
}

export async function recalculateAccountStanding(userId) {
  const policy = await getActiveStandingPolicy();
  const attendanceSummary = await getAttendanceSummary(userId, policy);
  const score = calculateStandingScore({ policy, attendanceSummary });
  const now = new Date();

  await db("users").where({ id: userId }).update({
    standing_score: score,
    standing_last_calculated_at: now,
    updated_at: now,
  });

  return {
    user_id: userId,
    score,
    attendanceSummary,
    policy,
  };
}

export async function appendAttendanceEvent({
  userId,
  reservationId,
  eventType,
  actorUserId,
  eventTime = new Date(),
  metadata = {},
}) {
  await db("attendance_history").insert({
    id: randomUUID(),
    user_id: userId,
    reservation_id: reservationId,
    event_type: eventType,
    event_time: eventTime,
    metadata_json: JSON.stringify(metadata || {}),
    actor_user_id: actorUserId || null,
    created_at: new Date(),
  });
}

function overlaps(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

export function isPeakHour(date, policy) {
  const minutes = date.getHours() * 60 + date.getMinutes();
  const start = parseTimeStringToMinutes(policy.peak_start_time);
  const end = parseTimeStringToMinutes(policy.peak_end_time);

  if (start <= end) {
    return minutes >= start && minutes < end;
  }
  return minutes >= start || minutes < end;
}

export async function findApprovedOverride({ userId, resourceId, start, end }) {
  const rows = await db("reservation_overrides")
    .where({ user_id: userId, status: "approved" })
    .whereNull("used_at")
    .where((builder) => {
      builder.whereNull("resource_id").orWhere({ resource_id: resourceId });
    })
    .where("start_time", "<", end)
    .andWhere("end_time", ">", start)
    .orderBy("created_at", "asc");

  return (
    rows.find((row) =>
      overlaps(start, end, new Date(row.start_time), new Date(row.end_time)),
    ) || null
  );
}

export async function markOverrideUsed(overrideId) {
  await db("reservation_overrides").where({ id: overrideId }).update({
    used_at: new Date(),
    updated_at: new Date(),
  });
}
