import { createHash, randomUUID } from "crypto";
import { db } from "../db.js";

export function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

export function computeChainHash({ previousHash, payload }) {
  return createHash("sha256")
    .update(String(previousHash || "GENESIS"))
    .update("|")
    .update(stableStringify(payload))
    .digest("hex");
}

export async function appendFinancialLog({
  trx = null,
  entryType,
  referenceType,
  referenceId,
  amount,
  paymentMethod = null,
  shiftKey = null,
  metadata = {},
}) {
  const runner = trx || db;
  const previous = await runner("financial_logs")
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .first();
  const previousHash = previous?.entry_hash || null;
  const now = new Date();

  const payload = {
    entry_type: entryType,
    reference_type: referenceType,
    reference_id: referenceId,
    amount: Number(amount || 0),
    payment_method: paymentMethod,
    shift_key: shiftKey,
    metadata,
    created_at: now.toISOString(),
  };
  const entryHash = computeChainHash({ previousHash, payload });

  const row = {
    id: randomUUID(),
    entry_type: entryType,
    reference_type: referenceType,
    reference_id: referenceId,
    amount: Number(amount || 0),
    payment_method: paymentMethod,
    shift_key: shiftKey,
    metadata_json: JSON.stringify(metadata || {}),
    previous_hash: previousHash,
    entry_hash: entryHash,
    created_at: now,
  };

  await runner("financial_logs").insert(row);
  return row;
}
