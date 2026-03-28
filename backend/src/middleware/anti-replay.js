const WINDOW_SECONDS = Number(process.env.ANTI_REPLAY_WINDOW_SECONDS || 300);

export function antiReplay({ optional = true } = {}) {
  return async function antiReplayMiddleware(ctx, next) {
    const raw = String(ctx.get("x-request-timestamp") || "").trim();
    if (!raw) {
      if (optional) {
        await next();
        return;
      }
      ctx.throw(400, "x-request-timestamp header is required");
    }

    const timestamp = Number(raw);
    if (Number.isNaN(timestamp)) {
      ctx.throw(400, "x-request-timestamp must be unix seconds");
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const delta = Math.abs(nowSeconds - timestamp);
    if (delta > WINDOW_SECONDS) {
      ctx.throw(401, "request timestamp outside anti-replay window");
    }

    await next();
  };
}
