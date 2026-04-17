// Real-DB test harness used by the no-mock API test suite.
//
// This harness does NOT use vi.mock. It configures the real `db.js` module to
// point at an in-memory better-sqlite3 instance by setting
// `process.env.TEST_DB_CLIENT=better-sqlite3` BEFORE the app or db modules are
// first imported. Tests then import the real app, the real db, the real
// services and run real HTTP requests through supertest.
//
// Usage:
//   import { setupRealDb, resetRealDb, tokensByRole } from "./real-db-harness.js";
//   beforeAll(async () => { await setupRealDb(); });
//   beforeEach(async () => { await resetRealDb(); });

import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

// Force sqlite for tests BEFORE any imports of db.js.
process.env.TEST_DB_CLIENT = process.env.TEST_DB_CLIENT || "better-sqlite3";
process.env.TEST_DB_FILENAME = process.env.TEST_DB_FILENAME || ":memory:";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationsDir = path.resolve(__dirname, "..", "..", "migrations");

const backendEmails = {
  manager: "manager@real-db.test",
  "front-desk": "frontdesk@real-db.test",
  moderator: "moderator@real-db.test",
  auditor: "auditor@real-db.test",
  member: "member@real-db.test",
  "member-2": "member2@real-db.test",
};

export const rolesByKey = {
  manager: "manager",
  "front-desk": "front-desk",
  moderator: "moderator",
  auditor: "auditor",
  member: "member",
  "member-2": "member",
};

export const tokensByRole = {};
export const userIdsByRole = {};

let dbInstance = null;
let migrated = false;

async function importDb() {
  const mod = await import("../../src/db.js");
  dbInstance = mod.db;
  return mod.db;
}

async function runMigrations(db) {
  if (migrated) return;
  await db.migrate.latest({
    directory: migrationsDir,
    loadExtensions: [".cjs"],
    disableTransactions: true,
  });
  migrated = true;
}

function knownTableNames() {
  // Ordered children-first, then parents, so deleting respects FK constraints.
  return [
    "order_payments",
    "order_state_events",
    "order_holds",
    "order_items",
    "refunds",
    "idempotency_keys",
    "orders",
    "order_groups",
    "fines",
    "attendance_history",
    "reservation_overrides",
    "reservation_blacklists",
    "resource_blocks",
    "booking_exception_requests",
    "reservations",
    "community_reports",
    "community_bans",
    "community_posts",
    "captcha_challenges",
    "community_rules",
    "community_settings",
    "cash_drawer_counts",
    "financial_logs",
    "security_events",
    "user_permissions",
    "sessions",
    "holiday_rules",
    "account_standing_policies",
    "catalog_items",
    "coupons",
    "audit_trails",
    "resources",
    "users",
  ];
}

const preservedBaselineTables = new Set([
  "knex_migrations",
  "knex_migrations_lock",
]);

async function truncateAll(db) {
  for (const table of knownTableNames()) {
    if (preservedBaselineTables.has(table)) continue;
    try {
      await db(table).del();
    } catch (err) {
      const message = String(err?.message || "");
      if (/no such table/i.test(message)) {
        // Table doesn't exist yet (pre-migration); ignore.
        continue;
      }
      throw err;
    }
  }
}

async function seedUsersAndSessions(db) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60000);
  Object.keys(tokensByRole).forEach((k) => delete tokensByRole[k]);
  Object.keys(userIdsByRole).forEach((k) => delete userIdsByRole[k]);

  for (const [key, role] of Object.entries(rolesByKey)) {
    const userId = randomUUID();
    await db("users").insert({
      id: userId,
      full_name: `Seeded ${key}`,
      email: backendEmails[key],
      phone: null,
      status: "active",
      role,
      password_salt: "test-salt",
      password_hash: "test-hash",
      failed_login_attempts: 0,
      locked_until: null,
      last_failed_login_at: null,
      created_at: now,
      updated_at: now,
    });
    const token = `token-${key}-${randomUUID().slice(0, 8)}`;
    await db("sessions").insert({
      id: randomUUID(),
      user_id: userId,
      role,
      token,
      created_at: now,
      expires_at: expiresAt,
    });
    tokensByRole[key] = token;
    userIdsByRole[key] = userId;
  }
}

async function seedResource(db, overrides = {}) {
  const now = new Date();
  const id = overrides.id || randomUUID();
  await db("resources").insert({
    id,
    name: overrides.name || "Studio Room A",
    type: overrides.type || "studio",
    capacity: overrides.capacity ?? 10,
    is_active:
      overrides.is_active === undefined || overrides.is_active === null
        ? 1
        : overrides.is_active
          ? 1
          : 0,
    booking_window_days: 30,
    min_duration_minutes: 30,
    max_duration_minutes: 240,
    early_check_in_minutes: 10,
    late_check_in_grace_minutes: 15,
    allow_slot_stitching: 1,
    created_at: now,
    updated_at: now,
  });
  return id;
}

async function seedCatalog(db) {
  const now = new Date();
  await db("catalog_items").insert({
    id: randomUUID(),
    sku: "YOGA_MAT",
    name: "Yoga Mat",
    category: "gear",
    base_price: 25.0,
    currency: "USD",
    fulfillment_path: "awaiting_pickup",
    is_active: 1,
    metadata_json: "{}",
    created_at: now,
    updated_at: now,
  });
  await db("coupons").insert({
    id: randomUUID(),
    code: "SAVE10",
    name: "Flat $10 off",
    discount_type: "fixed",
    discount_value: 10,
    min_subtotal: 0,
    max_discount: null,
    applies_to_category: null,
    is_active: 1,
    starts_at: null,
    ends_at: null,
    created_at: now,
    updated_at: now,
  });
}

async function seedStandingPolicy(db) {
  const rows = await db("account_standing_policies").count({ c: "id" }).first();
  if (Number(rows?.c || 0) > 0) return;
  const now = new Date();
  await db("account_standing_policies").insert({
    id: "default-standing-policy",
    name: "Default Standing Policy",
    lookback_days: 30,
    low_score_threshold: 60,
    no_show_limit: 2,
    no_show_penalty_points: 25,
    check_in_reward_points: 2,
    peak_start_time: "17:00:00",
    peak_end_time: "20:00:00",
    is_active: 1,
    created_at: now,
    updated_at: now,
  });
}

async function seedCommunitySettings(db) {
  const rows = await db("community_settings").count({ c: "id" }).first();
  if (Number(rows?.c || 0) > 0) return;
  const now = new Date();
  await db("community_settings").insert({
    id: randomUUID(),
    max_posts_per_hour: 10,
    max_device_posts_per_hour: null,
    max_ip_posts_per_hour: null,
    captcha_required: 0,
    auto_hold_report_threshold: 3,
    created_at: now,
    updated_at: now,
  });
}

export async function setupRealDb() {
  const db = await importDb();
  await runMigrations(db);
  await truncateAll(db);
  await seedUsersAndSessions(db);
  await seedStandingPolicy(db);
  await seedCommunitySettings(db);
  await seedCatalog(db);
  return db;
}

export async function resetRealDb() {
  const db = await importDb();
  await truncateAll(db);
  await seedUsersAndSessions(db);
  await seedStandingPolicy(db);
  await seedCommunitySettings(db);
  await seedCatalog(db);
  return db;
}

export async function getDb() {
  if (!dbInstance) await importDb();
  return dbInstance;
}

export function authHeader(role) {
  const token = tokensByRole[role];
  if (!token) {
    throw new Error(`No seeded token for role key: ${role}`);
  }
  return { Authorization: `Bearer ${token}` };
}

export { seedResource };
