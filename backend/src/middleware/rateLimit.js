/**
 * Rate limiting middleware — KV-backed with fail-closed behavior.
 *
 * Uses Cloudflare KV (RATE_LIMIT_KV binding) for distributed rate limiting.
 * Falls back to in-memory per-isolate tracking if KV is unavailable.
 * Fail-closed: if rate limit check fails, deny the request.
 *
 * Set RATE_LIMIT_KV_ENABLED="false" to force the in-memory fallback even when
 * the KV binding exists (e.g. when the account's KV write quota is exhausted).
 */

export const rateLimitMiddleware = (options = { windowMs: 60000, max: 100 }) => {
  return async (c, next) => {
    if (c.env && c.env.ENVIRONMENT === 'test') {
      await next();
      return;
    }

    // Use cf-connecting-ip only (Cloudflare-populated, not spoofable)
    const ip = c.req.header('cf-connecting-ip') || 'unknown';
    const path = c.req.path;
    const windowSec = Math.ceil(options.windowMs / 1000);

    // KV-backed rate limiting (distributed across all isolates).
    // RATE_LIMIT_KV_ENABLED="false" forces the in-memory fallback below.
    if (c.env && c.env.RATE_LIMIT_KV && c.env.RATE_LIMIT_KV_ENABLED !== 'false') {
      try {
        const windowKey = `${ip}:${path}:${Math.floor(Date.now() / options.windowMs)}`;
        const current = await c.env.RATE_LIMIT_KV.get(windowKey);
        const count = current ? parseInt(current, 10) : 0;

        if (count >= options.max) {
          return c.json({ error: 'Too many requests' }, 429);
        }

        await c.env.RATE_LIMIT_KV.put(windowKey, (count + 1).toString(), {
          expirationTtl: windowSec * 2,
        });

        await next();
        return;
      } catch (err) {
        console.error('KV rate limit error:', err);
        // Fail-closed: deny on error
        return c.json({ error: 'Rate limit check failed' }, 429);
      }
    }

    // Fallback: in-memory per-isolate (not distributed, but better than nothing)
    try {
      const ipPathKey = `${ip}:${path}`;
      const now = Date.now();

      if (!globalThis._rateLimitMap) globalThis._rateLimitMap = new Map();
      const map = globalThis._rateLimitMap;

      let record = map.get(ipPathKey);
      if (!record || now > record.resetTime) {
        record = { count: 0, resetTime: now + options.windowMs };
      }
      record.count++;
      map.set(ipPathKey, record);

      // Cleanup stale entries periodically
      if (map.size > 10000) {
        for (const [key, val] of map) {
          if (now > val.resetTime) map.delete(key);
        }
      }

      if (record.count > options.max) {
        return c.json({ error: 'Too many requests' }, 429);
      }

      await next();
    } catch (err) {
      console.error('In-memory rate limit error:', err);
      // Fail-closed: deny on error
      return c.json({ error: 'Rate limit check failed' }, 429);
    }
  };
};
