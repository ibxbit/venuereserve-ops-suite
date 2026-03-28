import Router from "@koa/router";
import { getDashboardForRole, getPermissionsForRole } from "../auth/roles.js";
import { db } from "../db.js";
import {
  requireAuthenticated,
  requirePermission,
} from "../middleware/authorize.js";
import { commerceRouter } from "./commerce.js";
import { communityRouter } from "./community.js";
import { buildCrudRouter } from "./crud-router.js";
import { reservationRouter } from "./reservations.js";
import { securityRouter } from "./security.js";

export const apiRouter = new Router({ prefix: "/api/v1" });

apiRouter.get("/health", async (ctx) => {
  await db.raw("SELECT 1");
  ctx.body = {
    status: "ok",
    service: "studio-backend",
    timestamp: new Date().toISOString(),
  };
});

apiRouter.get("/me/dashboard", requireAuthenticated, async (ctx) => {
  const permissions = getPermissionsForRole(ctx.state.actorRole);
  const dashboard = getDashboardForRole(ctx.state.actorRole);

  ctx.body = {
    role: ctx.state.actorRole,
    permissions,
    dashboard,
  };
});

const resources = [
  {
    entityName: "users",
    tableName: "users",
    allowedFields: ["full_name", "email", "phone", "status", "role"],
    permissions: {
      list: "users.read",
      read: "users.read",
      create: "users.write",
      update: "users.write",
      delete: "users.write",
    },
  },
  {
    entityName: "resources",
    tableName: "resources",
    allowedFields: [
      "name",
      "type",
      "capacity",
      "is_active",
      "booking_window_days",
      "min_duration_minutes",
      "max_duration_minutes",
      "early_check_in_minutes",
      "late_check_in_grace_minutes",
      "allow_slot_stitching",
    ],
    permissions: {
      list: "resources.read",
      read: "resources.read",
      create: "resources.write",
      update: "resources.write",
      delete: "resources.write",
    },
  },
  {
    entityName: "catalog-items",
    tableName: "catalog_items",
    allowedFields: [
      "sku",
      "name",
      "category",
      "base_price",
      "currency",
      "fulfillment_path",
      "is_active",
      "metadata_json",
    ],
    permissions: {
      list: "orders.read",
      read: "orders.read",
      create: "resources.write",
      update: "resources.write",
      delete: "resources.write",
    },
  },
  {
    entityName: "coupons",
    tableName: "coupons",
    allowedFields: [
      "code",
      "name",
      "discount_type",
      "discount_value",
      "min_subtotal",
      "max_discount",
      "applies_to_category",
      "is_active",
      "starts_at",
      "ends_at",
    ],
    permissions: {
      list: "orders.read",
      read: "orders.read",
      create: "resources.write",
      update: "resources.write",
      delete: "resources.write",
    },
  },
  {
    entityName: "community-rules",
    tableName: "community_rules",
    allowedFields: ["rule_type", "target_type", "value", "is_active"],
    permissions: {
      list: "community.moderate",
      read: "community.moderate",
      create: "community.moderate",
      update: "community.moderate",
      delete: "community.moderate",
    },
  },
  {
    entityName: "community-settings",
    tableName: "community_settings",
    allowedFields: [
      "max_posts_per_hour",
      "max_device_posts_per_hour",
      "max_ip_posts_per_hour",
      "captcha_required",
      "auto_hold_report_threshold",
    ],
    permissions: {
      list: "community.moderate",
      read: "community.moderate",
      create: "community.moderate",
      update: "community.moderate",
      delete: "community.moderate",
    },
  },
  {
    entityName: "community-bans",
    tableName: "community_bans",
    allowedFields: [
      "user_id",
      "source_report_id",
      "reason",
      "is_permanent",
      "expires_at",
      "created_by_user_id",
    ],
    permissions: {
      list: "community.moderate",
      read: "community.moderate",
      create: "community.moderate",
      update: "community.moderate",
      delete: "community.moderate",
    },
  },
  {
    entityName: "security-events",
    tableName: "security_events",
    allowedFields: [
      "event_type",
      "severity",
      "user_id",
      "source_ip",
      "details_json",
      "alerted",
    ],
    permissions: {
      list: "reports.security",
      read: "reports.security",
      create: "reports.security",
      update: "reports.security",
      delete: "reports.security",
    },
  },
  {
    entityName: "financial-logs",
    tableName: "financial_logs",
    allowedFields: [
      "entry_type",
      "reference_type",
      "reference_id",
      "amount",
      "payment_method",
      "shift_key",
      "metadata_json",
      "previous_hash",
      "entry_hash",
      "created_at",
    ],
    permissions: {
      list: "reports.financial",
      read: "reports.financial",
      create: "reports.financial",
      update: "reports.financial",
      delete: "reports.financial",
    },
  },
  {
    entityName: "fines",
    tableName: "fines",
    allowedFields: [
      "user_id",
      "reservation_id",
      "amount",
      "status",
      "reason",
      "issued_by_user_id",
      "paid_order_id",
    ],
    permissions: {
      list: "orders.read",
      read: "orders.read",
      create: "orders.write",
      update: "orders.write",
      delete: "orders.write",
    },
  },
  {
    entityName: "user-permissions",
    tableName: "user_permissions",
    allowedFields: [
      "user_id",
      "permission_key",
      "is_allowed",
      "granted_by_user_id",
    ],
    permissions: {
      list: "users.read",
      read: "users.read",
      create: "users.write",
      update: "users.write",
      delete: "users.write",
    },
  },
  {
    entityName: "cash-drawer-counts",
    tableName: "cash_drawer_counts",
    allowedFields: [
      "shift_key",
      "shift_start",
      "shift_end",
      "expected_total",
      "counted_total",
      "variance_amount",
      "variance_flag",
      "counted_by_user_id",
      "notes",
      "counted_at",
    ],
    permissions: {
      list: "reports.financial",
      read: "reports.financial",
      create: "reports.financial",
      update: "reports.financial",
      delete: "reports.financial",
    },
  },
  {
    entityName: "orders",
    tableName: "orders",
    allowedFields: [
      "user_id",
      "total_amount",
      "status",
      "state",
      "payment_method",
      "notes",
      "order_group_id",
      "fulfillment_path",
      "coupon_code",
      "metadata_json",
      "expires_at",
      "paid_at",
      "cancelled_at",
      "cancelled_reason",
      "payment_reference_masked",
      "payment_last_four",
    ],
    permissions: {
      list: "orders.read",
      read: "orders.read",
      create: "orders.write",
      update: "orders.write",
      delete: "orders.write",
    },
  },
  {
    entityName: "refunds",
    tableName: "refunds",
    allowedFields: ["order_id", "amount", "reason", "status", "processed_at"],
    permissions: {
      list: "refunds.read",
      read: "refunds.read",
      create: "refunds.write",
      update: "refunds.write",
      delete: "refunds.write",
    },
  },
  {
    entityName: "resource-blocks",
    tableName: "resource_blocks",
    allowedFields: [
      "resource_id",
      "start_time",
      "end_time",
      "reason",
      "is_active",
    ],
    permissions: {
      list: "resources.read",
      read: "resources.read",
      create: "resources.write",
      update: "resources.write",
      delete: "resources.write",
    },
  },
  {
    entityName: "reservation-blacklists",
    tableName: "reservation_blacklists",
    allowedFields: [
      "user_id",
      "resource_id",
      "blocked_from",
      "blocked_until",
      "reason",
      "is_active",
    ],
    permissions: {
      list: "users.read",
      read: "users.read",
      create: "users.write",
      update: "users.write",
      delete: "users.write",
    },
  },
  {
    entityName: "holiday-rules",
    tableName: "holiday_rules",
    allowedFields: [
      "holiday_date",
      "name",
      "is_closed",
      "open_time",
      "close_time",
      "notes",
      "is_active",
    ],
    permissions: {
      list: "resources.read",
      read: "resources.read",
      create: "resources.write",
      update: "resources.write",
      delete: "resources.write",
    },
  },
];

for (const resource of resources) {
  const crudRouter = buildCrudRouter(resource);
  apiRouter.use(crudRouter.routes());
  apiRouter.use(crudRouter.allowedMethods());
}

apiRouter.use(reservationRouter.routes());
apiRouter.use(reservationRouter.allowedMethods());
apiRouter.use(commerceRouter.routes());
apiRouter.use(commerceRouter.allowedMethods());
apiRouter.use(communityRouter.routes());
apiRouter.use(communityRouter.allowedMethods());
apiRouter.use(securityRouter.routes());
apiRouter.use(securityRouter.allowedMethods());

apiRouter.get("/audit-trails", requirePermission("audit.read"), async (ctx) => {
  const rows = await db("audit_trails").orderBy("created_at", "desc");
  ctx.body = rows;
});

apiRouter.get(
  "/audit-trails/:id",
  requirePermission("audit.read"),
  async (ctx) => {
    const row = await db("audit_trails").where({ id: ctx.params.id }).first();
    if (!row) {
      ctx.throw(404, "audit trail not found");
    }
    ctx.body = row;
  },
);

apiRouter.get(
  "/reports/financial",
  requirePermission("reports.financial"),
  async (ctx) => {
    const orderMetrics = await db("orders")
      .count({ orders_count: "id" })
      .sum({ orders_total: "total_amount" })
      .first();
    const refundMetrics = await db("refunds")
      .count({ refunds_count: "id" })
      .sum({ refunds_total: "amount" })
      .first();

    ctx.body = {
      generated_at: new Date().toISOString(),
      orders_count: Number(orderMetrics.orders_count || 0),
      orders_total: Number(orderMetrics.orders_total || 0),
      refunds_count: Number(refundMetrics.refunds_count || 0),
      refunds_total: Number(refundMetrics.refunds_total || 0),
    };
  },
);

apiRouter.get(
  "/reports/security",
  requirePermission("reports.security"),
  async (ctx) => {
    const recentActions = await db("audit_trails")
      .select("action")
      .count({ count: "id" })
      .where("created_at", ">=", db.raw("DATE_SUB(NOW(), INTERVAL 30 DAY)"))
      .groupBy("action");

    ctx.body = {
      generated_at: new Date().toISOString(),
      timeframe: "30_days",
      action_counts: recentActions.map((item) => ({
        action: item.action,
        count: Number(item.count || 0),
      })),
    };
  },
);

apiRouter.get(
  "/reports/community",
  requirePermission("reports.community"),
  async (ctx) => {
    const userStats = await db("users")
      .select("status")
      .count({ count: "id" })
      .groupBy("status");
    const reservationStats = await db("reservations")
      .select("status")
      .count({ count: "id" })
      .groupBy("status");

    ctx.body = {
      generated_at: new Date().toISOString(),
      user_status_breakdown: userStats.map((item) => ({
        status: item.status,
        count: Number(item.count || 0),
      })),
      reservation_status_breakdown: reservationStats.map((item) => ({
        status: item.status,
        count: Number(item.count || 0),
      })),
    };
  },
);
