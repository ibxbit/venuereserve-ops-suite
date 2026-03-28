import Router from "@koa/router";
import { randomUUID } from "crypto";
import { db } from "../db.js";
import { requirePermission } from "../middleware/authorize.js";
import { writeAudit } from "../services/audit-service.js";

function pickFields(payload, allowedFields) {
  return allowedFields.reduce((acc, field) => {
    if (Object.hasOwn(payload, field) && payload[field] !== undefined) {
      acc[field] = payload[field];
    }
    return acc;
  }, {});
}

function normalizeRecord(record) {
  if (!record) return record;
  const normalized = { ...record };
  const booleanFields = [
    "is_active",
    "allow_slot_stitching",
    "is_closed",
    "is_permanent",
    "captcha_required",
  ];

  for (const field of booleanFields) {
    if (typeof normalized[field] === "number") {
      normalized[field] = Boolean(normalized[field]);
    }
  }
  return normalized;
}

export function buildCrudRouter({
  entityName,
  tableName,
  allowedFields,
  permissions,
}) {
  const router = new Router();
  const memberScopedEntities = new Set([
    "reservations",
    "orders",
    "refunds",
    "fines",
  ]);
  const staffRoles = new Set(["manager", "front-desk", "moderator", "auditor"]);

  function assertMutationAccess(ctx, row) {
    if (!memberScopedEntities.has(entityName)) return;
    const isStaff = staffRoles.has(ctx.state.actorRole);
    if (!isStaff && row.user_id !== ctx.state.actorUserId) {
      ctx.throw(403, "forbidden");
    }
  }

  router.get(
    `/${entityName}`,
    requirePermission(permissions.list),
    async (ctx) => {
      const query = db(tableName).orderBy("created_at", "desc");
      if (
        ctx.state.actorRole === "member" &&
        memberScopedEntities.has(entityName)
      ) {
        if (!ctx.state.actorUserId) {
          ctx.throw(400, "x-actor-user-id is required for member scope");
        }
        query.where({ user_id: ctx.state.actorUserId });
      }
      const rows = await query;
      ctx.body = rows.map(normalizeRecord);
    },
  );

  router.get(
    `/${entityName}/:id`,
    requirePermission(permissions.read),
    async (ctx) => {
      const row = await db(tableName).where({ id: ctx.params.id }).first();
      if (!row) {
        ctx.throw(404, `${entityName.slice(0, -1)} not found`);
      }
      if (memberScopedEntities.has(entityName)) {
        const isStaff = staffRoles.has(ctx.state.actorRole);
        if (!isStaff && row.user_id !== ctx.state.actorUserId) {
          ctx.throw(403, "forbidden");
        }
      }
      ctx.body = normalizeRecord(row);
    },
  );

  router.post(
    `/${entityName}`,
    requirePermission(permissions.create),
    async (ctx) => {
      const payload = pickFields(ctx.request.body || {}, allowedFields);
      const now = new Date();
      const row = {
        id: randomUUID(),
        ...payload,
        created_at: now,
        updated_at: now,
      };

      await db(tableName).insert(row);
      await writeAudit({
        entity: entityName,
        entityId: row.id,
        action: "create",
        payload: row,
        actorUserId: ctx.state.actorUserId,
      });

      ctx.status = 201;
      ctx.body = normalizeRecord(row);
    },
  );

  router.put(
    `/${entityName}/:id`,
    requirePermission(permissions.update),
    async (ctx) => {
      const existing = await db(tableName).where({ id: ctx.params.id }).first();
      if (!existing) {
        ctx.throw(404, `${entityName.slice(0, -1)} not found`);
      }
      assertMutationAccess(ctx, existing);

      const payload = pickFields(ctx.request.body || {}, allowedFields);
      const updatePayload = {
        ...payload,
        updated_at: new Date(),
      };

      await db(tableName).where({ id: ctx.params.id }).update(updatePayload);

      const row = await db(tableName).where({ id: ctx.params.id }).first();

      await writeAudit({
        entity: entityName,
        entityId: ctx.params.id,
        action: "update",
        payload: updatePayload,
        actorUserId: ctx.state.actorUserId,
      });

      ctx.body = normalizeRecord(row);
    },
  );

  router.delete(
    `/${entityName}/:id`,
    requirePermission(permissions.delete),
    async (ctx) => {
      const existing = await db(tableName).where({ id: ctx.params.id }).first();
      if (!existing) {
        ctx.throw(404, `${entityName.slice(0, -1)} not found`);
      }
      assertMutationAccess(ctx, existing);

      await db(tableName).where({ id: ctx.params.id }).del();

      await writeAudit({
        entity: entityName,
        entityId: ctx.params.id,
        action: "delete",
        payload: existing,
        actorUserId: ctx.state.actorUserId,
      });

      ctx.status = 204;
    },
  );

  return router;
}
