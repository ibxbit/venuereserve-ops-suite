import { randomUUID } from "crypto";
import { db as defaultDb } from "../db.js";
import { generateSalt, hashPassword } from "./security-service.js";

const BASELINE_RESOURCES = [
  {
    id: "res-room-a",
    name: "Studio Room A",
    type: "room",
    capacity: 1,
    is_active: true,
    booking_window_days: 30,
    min_duration_minutes: 30,
    max_duration_minutes: 240,
    early_check_in_minutes: 10,
    late_check_in_grace_minutes: 15,
    allow_slot_stitching: true,
  },
  {
    id: "res-room-b",
    name: "Studio Room B",
    type: "room",
    capacity: 2,
    is_active: true,
    booking_window_days: 30,
    min_duration_minutes: 30,
    max_duration_minutes: 240,
    early_check_in_minutes: 10,
    late_check_in_grace_minutes: 15,
    allow_slot_stitching: true,
  },
];

// Demo-mode seed accounts (one per role) so QA/audit reviewers can sign in
// with documented credentials right after `docker-compose up`. Only seeded
// when `BOOTSTRAP_SEED_DEMO_ACCOUNTS` is enabled (defaults to true in
// docker-compose). Passwords are intentionally non-trivial; rotate them in
// any non-local environment.
const DEMO_ACCOUNT_PASSWORD = "DemoStudio123!";
const DEMO_ACCOUNTS = [
  {
    email: "demo-member@local.test",
    full_name: "Demo Member",
    role: "member",
  },
  {
    email: "demo-frontdesk@local.test",
    full_name: "Demo Front Desk",
    role: "front-desk",
  },
  {
    email: "demo-manager@local.test",
    full_name: "Demo Manager",
    role: "manager",
  },
  {
    email: "demo-moderator@local.test",
    full_name: "Demo Moderator",
    role: "moderator",
  },
  {
    email: "demo-auditor@local.test",
    full_name: "Demo Auditor",
    role: "auditor",
  },
];

function shouldSeedDemoAccounts() {
  const flag = String(process.env.BOOTSTRAP_SEED_DEMO_ACCOUNTS ?? "true")
    .trim()
    .toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

export const demoAccounts = DEMO_ACCOUNTS.map((account) => ({
  ...account,
  password: DEMO_ACCOUNT_PASSWORD,
}));

export async function runBootstrap({
  db = defaultDb,
  adminEmail,
  adminPassword,
  adminFullName = "Initial Studio Manager",
} = {}) {
  const email = String(adminEmail || "")
    .trim()
    .toLowerCase();
  if (!email) {
    throw new Error("bootstrap requires adminEmail");
  }
  if (!String(adminPassword || "").trim()) {
    throw new Error("bootstrap requires adminPassword");
  }

  return db.transaction(async (trx) => {
    const now = new Date();
    let resourcesCreated = 0;
    for (const resource of BASELINE_RESOURCES) {
      const existing = await trx("resources").where({ id: resource.id }).first();
      if (existing) continue;
      await trx("resources").insert({
        ...resource,
        created_at: now,
        updated_at: now,
      });
      resourcesCreated += 1;
    }

    let adminCreated = false;
    const existingUser = await trx("users").where({ email }).first();
    if (!existingUser) {
      const salt = generateSalt();
      await trx("users").insert({
        id: randomUUID(),
        full_name: adminFullName,
        email,
        phone: null,
        status: "active",
        role: "manager",
        password_salt: salt,
        password_hash: hashPassword(adminPassword, salt),
        failed_login_attempts: 0,
        locked_until: null,
        last_failed_login_at: null,
        standing_score: 100,
        standing_last_calculated_at: now,
        created_at: now,
        updated_at: now,
      });
      adminCreated = true;
    } else if (existingUser.role !== "manager") {
      await trx("users").where({ id: existingUser.id }).update({
        role: "manager",
        updated_at: now,
      });
    }

    let demoAccountsCreated = 0;
    if (shouldSeedDemoAccounts()) {
      for (const account of DEMO_ACCOUNTS) {
        const exists = await trx("users").where({ email: account.email }).first();
        if (exists) continue;
        const salt = generateSalt();
        await trx("users").insert({
          id: randomUUID(),
          full_name: account.full_name,
          email: account.email,
          phone: null,
          status: "active",
          role: account.role,
          password_salt: salt,
          password_hash: hashPassword(DEMO_ACCOUNT_PASSWORD, salt),
          failed_login_attempts: 0,
          locked_until: null,
          last_failed_login_at: null,
          standing_score: 100,
          standing_last_calculated_at: now,
          created_at: now,
          updated_at: now,
        });
        demoAccountsCreated += 1;
      }
    }

    return {
      resources_created: resourcesCreated,
      admin_created: adminCreated,
      admin_email: email,
      demo_accounts_created: demoAccountsCreated,
    };
  });
}
