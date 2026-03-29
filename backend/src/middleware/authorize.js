import { hasPermission } from "../auth/roles.js";
import { db } from "../db.js";

export function requireAuthenticated(ctx, next) {
  if (!ctx.state.actorUserId) {
    ctx.throw(401, "authentication required");
  }
  return next();
}

export function requirePermission(permission) {
  return async function authorize(ctx, next) {
    if (!ctx.state.actorUserId) {
      ctx.throw(401, "authentication required");
    }

    const roleAllowed = hasPermission(ctx.state.actorRole, permission);
    const override = await db("user_permissions")
      .where({
        user_id: ctx.state.actorUserId,
        permission_key: permission,
      })
      .orderBy("updated_at", "desc")
      .first();

    if (override) {
      const isAllowed =
        override.is_allowed === true ||
        override.is_allowed === 1 ||
        override.is_allowed === "1";
      if (!isAllowed) {
        ctx.throw(403, "forbidden");
      }
      await next();
      return;
    }

    if (!roleAllowed) {
      ctx.throw(403, "forbidden");
    }

    await next();
  };
}

export function assertOwnerOrStaff(ctx, ownerId) {
  const actorRole = ctx.state.actorRole;
  const actorUserId = ctx.state.actorUserId;
  const isStaff = ["manager", "front-desk"].includes(actorRole);
  if (!isStaff && actorUserId !== ownerId) {
    ctx.throw(403, "you do not have permission to modify this resource");
  }
}
