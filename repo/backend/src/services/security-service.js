import { randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { db } from "../db.js";

const MAX_FAILED_LOGINS = 8;
const LOCK_MINUTES = 15;

export function hashPassword(password, salt) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return hash;
}

export function verifyPassword(password, salt, storedHash) {
  const computed = hashPassword(password, salt);
  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(String(storedHash || ""), "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function generateSalt() {
  return randomUUID().replace(/-/g, "");
}

export function maskSensitive(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (text.length <= 4) return "****";
  return `${"*".repeat(text.length - 4)}${text.slice(-4)}`;
}

export async function logSecurityEvent({
  eventType,
  severity = "info",
  userId = null,
  sourceIp = null,
  details = {},
  alerted = false,
}) {
  await db("security_events").insert({
    id: randomUUID(),
    event_type: eventType,
    severity,
    user_id: userId,
    source_ip: sourceIp,
    details_json: JSON.stringify(details || {}),
    alerted,
    created_at: new Date(),
  });
}

export async function recordFailedLogin(user, sourceIp) {
  const attempts = Number(user.failed_login_attempts || 0) + 1;
  const now = new Date();
  const updatePayload = {
    failed_login_attempts: attempts,
    last_failed_login_at: now,
    updated_at: now,
  };

  let locked = false;
  if (attempts >= MAX_FAILED_LOGINS) {
    locked = true;
    updatePayload.locked_until = new Date(now.getTime() + LOCK_MINUTES * 60000);
  }

  await db("users").where({ id: user.id }).update(updatePayload);
  await logSecurityEvent({
    eventType: locked ? "login_locked" : "login_failed",
    severity: locked ? "high" : "warning",
    userId: user.id,
    sourceIp,
    details: {
      attempts,
      lock_minutes: locked ? LOCK_MINUTES : 0,
    },
    alerted: locked,
  });
}

export async function clearFailedLogin(user, sourceIp) {
  await db("users").where({ id: user.id }).update({
    failed_login_attempts: 0,
    locked_until: null,
    updated_at: new Date(),
  });

  await logSecurityEvent({
    eventType: "login_success",
    severity: "info",
    userId: user.id,
    sourceIp,
  });
}
