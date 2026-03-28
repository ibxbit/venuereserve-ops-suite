import { logger } from "../utils/logger.js";

function redactText(input) {
  let text = String(input || "");
  const patterns = [
    /(password\s*[=:]\s*)([^\s,;]+)/gi,
    /(token\s*[=:]\s*)([^\s,;]+)/gi,
    /(secret\s*[=:]\s*)([^\s,;]+)/gi,
    /(key\s*[=:]\s*)([^\s,;]+)/gi,
    /([A-Z_]*PASSWORD\s*=\s*)([^\s,;]+)/g,
    /([A-Z_]*SECRET\s*=\s*)([^\s,;]+)/g,
    /([A-Z_]*TOKEN\s*=\s*)([^\s,;]+)/g,
    /([A-Z_]*KEY\s*=\s*)([^\s,;]+)/g,
    /(authorization\s*:\s*bearer\s+)([^\s,;]+)/gi,
  ];
  for (const pattern of patterns) {
    text = text.replace(pattern, "$1[REDACTED]");
  }
  return text;
}

function redactValue(value) {
  if (value == null) return value;
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, redactValue(nested)]),
    );
  }
  return value;
}

export async function errorHandler(ctx, next) {
  try {
    await next();
  } catch (error) {
    const status = Number(error.status || 500);
    ctx.status = status;

    if (status >= 500) {
      ctx.body = { error: "Internal server error" };
      logger.error(
        {
          error: {
            name: error.name,
            status: error.status,
            message: redactText(error.message),
            stack: redactText(error.stack),
            details: redactValue(error.details),
          },
          path: ctx.path,
          method: ctx.method,
        },
        "Unhandled server error",
      );
      return;
    }

    const body = {
      error: error.message || "Request failed",
    };
    if (error.details) {
      body.details = error.details;
    }
    ctx.body = body;
  }
}
