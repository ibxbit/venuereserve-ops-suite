import { randomUUID } from "crypto";
import { db } from "../db.js";

export async function writeAudit({
  entity,
  entityId,
  action,
  payload,
  actorUserId = null,
}) {
  await db("audit_trails").insert({
    id: randomUUID(),
    entity,
    entity_id: entityId,
    action,
    payload_json: JSON.stringify(payload ?? {}),
    actor_user_id: actorUserId,
    created_at: new Date(),
  });
}
