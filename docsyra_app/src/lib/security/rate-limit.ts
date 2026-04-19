import { getRequestContext } from "@cloudflare/next-on-pages";

type RateLimitOptions = {
  limit: number;
  windowMs: number;
  route: string;
};

function getClientIP(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for") ||
    "unknown"
  );
}

export async function rateLimit(
  request: Request,
  key: string | null,
  options: RateLimitOptions,
) {
  const { env } = getRequestContext();
  const db = env.DB;

  const identifier = key || getClientIP(request);
  const now = Date.now();

  const existing = await db
    .prepare(
      "SELECT count, window_start FROM rate_limits WHERE key = ? AND route = ?",
    )
    .bind(identifier, options.route)
    .first<{ count: number; window_start: number }>();

  if (!existing) {
    await db
      .prepare(
        `INSERT INTO rate_limits (key, route, count, window_start)
         VALUES (?, ?, 1, ?)`,
      )
      .bind(identifier, options.route, now)
      .run();

    return;
  }

  const { count, window_start } = existing;

  if (now - window_start > options.windowMs) {
    await db
      .prepare(
        `UPDATE rate_limits
         SET count = 1, window_start = ?
         WHERE key = ? AND route = ?`,
      )
      .bind(now, identifier, options.route)
      .run();

    return;
  }

  if (count >= options.limit) {
    throw new Error("Too many requests. Try again later.");
  }

  await db
    .prepare(
      `UPDATE rate_limits
       SET count = count + 1
       WHERE key = ? AND route = ?`,
    )
    .bind(identifier, options.route)
    .run();
}
