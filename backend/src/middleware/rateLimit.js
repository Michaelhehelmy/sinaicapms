/**
 * Rate limiting middleware — KV-backed with fail-closed behavior.
 *
 * Uses Cloudflare KV (RATE_LIMIT_KV binding) for distributed rate limiting.
 * Falls back to in-memory per-isolate tracking if KV is unavailable.
 * Fail-closed: if rate limit check fails, deny the request.
 *
 * Set RATE_LIMIT_KV_ENABLED="false" to force the in-memory fallback even when
 * the KV binding exists (e.g. when the account's KV write quota is exhausted).
 *
 * Phase 4 (T2): a single declarative policy table (RATE_LIMIT_POLICIES +
 * policyLimiter) replaces the scattered explicit rateLimitMiddleware mounts.
 * Entries are matched in declaration order; first match wins. Keys may be
 * prefixed with an HTTP method (`POST /api/tenants`) or method-less globs
 * (`/api/admin*` → path prefix). The `default` entry covers everything else.
 */

const WINDOW_UNITS = { s: 1000, m: 60000, h: 3600000 };

function windowToMs(window = '1m') {
  const m = /^(\d+)([smh])$/.exec(String(window));
  return m ? Number(m[1]) * WINDOW_UNITS[m[2]] : 60000;
}

export const RATE_LIMIT_POLICIES = {
  // Phase 9: consolidated POS login keeps its stricter brute-force budget on
  // the new /api/auth surface. MUST stay above '/api/auth/*' — entries match
  // in declaration order and the first hit wins.
  'POST /api/auth/pos-login': { max: 15 },
  '/api/auth/*': { max: 30, window: '1m' },
  'POST /api/tenants': { max: 5, window: '5m' },
  'GET /api/tenants*': { max: 60 },
  '/api/admin*': { max: 20 },
  '/api/payments*': { max: 20 },
  'POST /api/pos/auth/login': { max: 15 },
  // Phase 5: silent-refresh loops can burst at shift start; aligned with /api/auth/*.
  'POST /api/pos/auth/refresh': { max: 30 },
  // Every other POS path — must stay BELOW the more-specific auth entries.
  '/api/pos/*': { max: 60 },
  '/api/leads': { max: 10 },
  '/api/contact': { max: 10 },
  default: { max: 100 },
};

export const policyLimiter = (policies = RATE_LIMIT_POLICIES) => {
  const compiled = [];
  for (const [key, policy] of Object.entries(policies)) {
    if (key === 'default') continue;
    const parsed = /^(GET|POST|PUT|DELETE|PATCH)\s+(.+)$/.exec(key);
    const pattern = parsed ? parsed[2] : key;
    compiled.push({
      method: parsed ? parsed[1] : null,
      prefix: pattern.endsWith('*'),
      base: pattern.endsWith('*') ? pattern.slice(0, -1) : pattern,
      run: rateLimitMiddleware({ windowMs: windowToMs(policy.window), max: policy.max }),
    });
  }
  const fallback = rateLimitMiddleware({
    windowMs: windowToMs(policies.default?.window),
    max: policies.default?.max ?? 100,
  });

  return async (c, next) => {
    // SSE streams are exempt from request counting (long-lived connections).
    if (c.req.path.startsWith('/api/stream/')) {
      await next();
      return;
    }
    for (const entry of compiled) {
      if (entry.method && c.req.method !== entry.method) continue;
      const hit = entry.prefix ? c.req.path.startsWith(entry.base) : c.req.path === entry.base;
      if (hit) return entry.run(c, next);
    }
    return fallback(c, next);
  };
};

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
