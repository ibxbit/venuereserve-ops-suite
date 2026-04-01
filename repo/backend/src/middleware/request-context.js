import { normalizeRole } from "../auth/roles.js";
import { db } from "../db.js";

export async function requestContext(ctx, next) {
  const authHeader = String(ctx.get("authorization") || "").trim();
  const bearerPrefix = "bearer ";
  ctx.state.actorUserId = null;
  ctx.state.actorRole = normalizeRole("member");

  if (authHeader.toLowerCase().startsWith(bearerPrefix)) {
    const token = authHeader.slice(bearerPrefix.length).trim();
    if (token) {
      const session = await db("sessions")
        .where({ token })
        .andWhere("expires_at", ">", new Date())
        .first();
      if (session) {
        ctx.state.actorUserId = session.user_id;
        ctx.state.actorRole = normalizeRole(session.role);
      }
    }
  }

  await next();
}
