import { hasPermission } from "../auth/roles.js";

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
    if (!hasPermission(ctx.state.actorRole, permission)) {
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
