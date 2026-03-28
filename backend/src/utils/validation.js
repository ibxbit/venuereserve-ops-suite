export function requiredString(value, field, { min = 1, max = 1000 } = {}) {
  const text = String(value || "").trim();
  if (!text) {
    const error = new Error(`${field} is required`);
    error.status = 400;
    throw error;
  }
  if (text.length < min) {
    const error = new Error(`${field} must be at least ${min} characters`);
    error.status = 400;
    throw error;
  }
  if (text.length > max) {
    const error = new Error(`${field} must be at most ${max} characters`);
    error.status = 400;
    throw error;
  }
  return text;
}

export function requiredNumber(value, field, { min = null, max = null } = {}) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    const error = new Error(`${field} must be a number`);
    error.status = 400;
    throw error;
  }
  if (min !== null && parsed < min) {
    const error = new Error(`${field} must be >= ${min}`);
    error.status = 400;
    throw error;
  }
  if (max !== null && parsed > max) {
    const error = new Error(`${field} must be <= ${max}`);
    error.status = 400;
    throw error;
  }
  return parsed;
}
