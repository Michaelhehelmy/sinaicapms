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
  // `envKey` dials the entry's max via env at request time (see
  // readLimitInt); the hardcoded `max` is the fallback when the env var is
  // absent/invalid. The deliberately-stricter login sub-buckets below stay
  // hardcoded so the RATE_LIMIT_LOGIN dial cannot weaken them.
  'POST /api/auth/pos-login': { max: 15 },
  '/api/auth/*': { max: 30, window: '1m', envKey: 'RATE_LIMIT_LOGIN' },
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
  'POST /api/feedback': { max: 6, window: '1m' },
  // T15 (M8): public review submission is floodable spam — bound it; no
  // broader `/api/marketplace*` prefix exists (default covers the rest).
  'POST /api/marketplace/reviews': { max: 10, window: '1m' },
  // M4: public order-status lookup is read-only but still abuseable — modest cap.
  'GET /api/orders/status/*': { max: 5, window: '1m' },
  // Wave 3.4a (F-A16-02): short-lived single-use stream-token mint. Per-IP
  // budget (the limiter keys on cf-connecting-ip, not per-user — honest
  // caveat): every EventSource (re)connect mints once, so 10/min covers
  // backoff reconnects while still bounding token spam.
  'POST /api/stream/token': { max: 10, window: '1m' },
  // ── Wave 3.5b: explicit budgets for the six PUBLIC surfaces. Before this
  // they all relied on the generic `/api/*` default (100/min/IP, single
  // RATE_LIMIT_API dial). Limits are keyed `ip:path` (per-IP-per-PATH), so no
  // surface ever "shared" a bucket with another path — the real gap was that
  // each public surface carried the same generic 100 + blanket dial. Now each
  // group declares its own budget and its own env dial (see readLimitInt), so
  // ops can tune one surface without touching the global default.
  //   • Paymob webhook (P1, the real fix): webhook calls arrive FROM Paymob's
  //     shared egress IPs — one path, one bucket, many tenants' callbacks, all
  //     behind the same cf-connecting-ip. Under the default 100 that path could
  //     genuinely throttle high-volume payment traffic. It now gets a DEDICATED
  //     budget (60/min, dial RATE_LIMIT_PAYMOB) decoupled from RATE_LIMIT_API.
  //     HMAC is verified INSIDE handlePaymobWebhook (signature = auth), so this
  //     cap is defense-in-depth; ops can effectively exempt the path by dialing
  //     RATE_LIMIT_PAYMOB high.
  //   • ORDERING INVARIANT: `POST /api/public/signup` and
  //     `POST /api/public/paymob/webhook` are EXACT-path entries and MUST stay
  //     above any future broad `/api/public*` glob, else onboarding's prefix
  //     would swallow them. (Today no broad /api/public glob exists; the shared
  //     `/api/public/*` mount also serves reservations, which intentionally
  //     stays on the default bucket — not one of the six 3.5b groups.)
  //   • `GET /api/marketplace*` (300) is the read directory group
  //     (index/categories/:tenantSlug/review reads); `POST /api/marketplace/
  //     reviews` above stays its own tighter 10/1m flood cap (method-qualified
  //     key, untouched).
  //   • `GET /api/projects/*/meal-plans` uses a MID-path wildcard — see
  //     policyLimiter (trailing-`*` entries keep exact startsWith semantics;
  //     only non-trailing `*` compiles to a regex).
  'GET /api/marketplace*': { max: 300, window: '1m', envKey: 'RATE_LIMIT_MARKETPLACE' },
  '/api/onboarding*': { max: 20, window: '1m', envKey: 'RATE_LIMIT_ONBOARDING' },
  'POST /api/public/signup': { max: 5, window: '1m', envKey: 'RATE_LIMIT_SIGNUP' },
  'GET /api/availability': { max: 120, window: '1m', envKey: 'RATE_LIMIT_AVAILABILITY' },
  // Media GET/HEAD share one read budget for the same path (the limiter key is
  // `${ip}:${path}`, method-less — method-qualified entries route to the same
  // underlying bucket, which is exactly what a coherent asset-read group wants).
  'GET /api/media*': { max: 300, window: '1m', envKey: 'RATE_LIMIT_MEDIA' },
  'HEAD /api/media*': { max: 300, window: '1m', envKey: 'RATE_LIMIT_MEDIA' },
  'GET /api/projects/*/meal-plans': { max: 120, window: '1m', envKey: 'RATE_LIMIT_MEAL_PLANS' },
  'POST /api/public/paymob/webhook': { max: 60, window: '1m', envKey: 'RATE_LIMIT_PAYMOB' },
  default: { max: 100, envKey: 'RATE_LIMIT_API' },
};

/**
 * Resolve a per-request rate-limit override from env vars.
 * Applies to any policy flagged with an `envKey` (e.g. RATE_LIMIT_LOGIN /
 * RATE_LIMIT_API). Falls back to the policy's hardcoded `max` when the var is
 * absent, empty, or not a positive integer.
 */
function readLimitInt(env, key, fallback) {
  if (!key || !env) return fallback;
  const raw = env[key];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const policyLimiter = (policies = RATE_LIMIT_POLICIES) => {
  // Escape a literal path segment for use inside a RegExp (mid-path `*` only).
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const compiled = [];
  for (const [key, policy] of Object.entries(policies)) {
    if (key === 'default') continue;
    const parsed = /^(GET|POST|PUT|DELETE|PATCH|HEAD)\s+(.+)$/.exec(key);
    const pattern = parsed ? parsed[2] : key;
    // Wave 3.5b: patterns may carry a mid-path wildcard (`*` NOT at the end,
    // e.g. `GET /api/projects/*/meal-plans`) which compiles to a RegExp with
    // `*` matching exactly one path segment. Trailing-`*` entries keep the
    // existing startsWith semantics so `/api/admin*` still matches
    // `/api/admin/health` — those two meanings are byte-compatible with the
    // pre-3.5b table.
    const midWildcard = pattern.includes('*') && !pattern.endsWith('*');
    const re = midWildcard
      ? new RegExp('^' + pattern.split('*').map(escapeRe).join('[^/]+') + '$')
      : null;
    compiled.push({
      method: parsed ? parsed[1] : null,
      prefix: pattern.endsWith('*'),
      base: pattern.endsWith('*') ? pattern.slice(0, -1) : pattern,
      re,
      run: rateLimitMiddleware({
        windowMs: windowToMs(policy.window),
        max: policy.max,
        envKey: policy.envKey,
      }),
    });
  }
  const fallback = rateLimitMiddleware({
    windowMs: windowToMs(policies.default?.window),
    max: policies.default?.max ?? 100,
    envKey: policies.default?.envKey,
  });

  return async (c, next) => {
    // Long-lived SSE streams are exempt from request counting. The mint
    // endpoint (POST /api/stream/token) is NOT exempt — it hits the policy
    // entry above, which is what bounds token acquisition by IP.
    if (c.req.path === '/api/stream/orders') {
      await next();
      return;
    }
    for (const entry of compiled) {
      if (entry.method && c.req.method !== entry.method) continue;
      const hit = entry.re
        ? entry.re.test(c.req.path)
        : entry.prefix
          ? c.req.path.startsWith(entry.base)
          : c.req.path === entry.base;
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

    // Per-request env override (e.g. RATE_LIMIT_LOGIN / RATE_LIMIT_API) with
    // the policy's hardcoded max as fallback.
    const max = readLimitInt(c.env, options.envKey, options.max);

    // Use cf-connecting-ip only (Cloudflare-populated, not spoofable)
    const ip = c.req.header('cf-connecting-ip') || 'unknown';
    const path = c.req.path;
    // Optional key builder (Wave 3.5 / F-A18-09): the per-tenant limiter
    // supplies a tenant-scoped key here; the global limiter keeps the default
    // `${ip}:${path}` composite so existing policy buckets are unchanged.
    const coreKey = options.makeKey ? options.makeKey(ip, path) : `${ip}:${path}`;
    const windowSec = Math.ceil(options.windowMs / 1000);

    // KV-backed rate limiting (distributed across all isolates).
    // RATE_LIMIT_KV_ENABLED="false" forces the in-memory fallback below.
    if (c.env && c.env.RATE_LIMIT_KV && c.env.RATE_LIMIT_KV_ENABLED !== 'false') {
      try {
        const windowKey = `${coreKey}:${Math.floor(Date.now() / options.windowMs)}`;
        const current = await c.env.RATE_LIMIT_KV.get(windowKey);
        const count = current ? parseInt(current, 10) : 0;

        if (count >= max) {
          return c.json({ success: false, error: 'Too many requests' }, 429);
        }

        await c.env.RATE_LIMIT_KV.put(windowKey, (count + 1).toString(), {
          expirationTtl: windowSec * 2,
        });

        await next();
        return;
      } catch (err) {
        console.error('KV rate limit error:', err);
        // Fail-closed: deny on error
        return c.json({ success: false, error: 'Rate limit check failed' }, 429);
      }
    }

    // Fallback: in-memory per-isolate (not distributed, but better than nothing)
    try {
      const ipPathKey = coreKey;
      const now = Date.now();

      if (!globalThis._rateLimitMap) globalThis._rateLimitMap = new Map();
      const map = globalThis._rateLimitMap;

      let record = map.get(ipPathKey);
      if (!record || now > record.resetTime) {
        record = { count: 0, resetTime: now + options.windowMs };
      }

      if (record.count >= max) {
        return c.json({ success: false, error: 'Too many requests' }, 429);
      }

      record.count++;
      map.set(ipPathKey, record);

      // Cleanup stale entries periodically
      if (map.size > 10000) {
        for (const [key, val] of map) {
          if (now > val.resetTime) map.delete(key);
        }
      }

      await next();
    } catch (err) {
      console.error('In-memory rate limit error:', err);
      // Fail-closed: deny on error
      return c.json({ success: false, error: 'Rate limit check failed' }, 429);
    }
  };
};

/**
 * Per-tenant rate limiter (Wave 3.5, audit F-A18-09).
 *
 * Composes the same KV/memory bucket machinery as `rateLimitMiddleware` but
 * keys on the VERIFIED tenant claim stamped by `resolveScope` /
 * `superAdminAuth` — `${ip}:tenant:${scope.tenantId}:${path}`. The tenant
 * component comes from the JWT (post-auth), never from the client-settable
 * `x-tenant-id` header, so rotating a spoofed header is inert (it cannot
 * mint fresh buckets).
 *
 * Mounted as a second `app.use()` line immediately after each authenticated
 * or mixed-visibility `resolveScope` mount (Shape 1): Hono runs middleware in
 * registration order, so the auth middleware's 401 short-circuit executes
 * first — a rejected request is NEVER debited against a tenant bucket — and a
 * request that never reached an authed surface (or rides a public branch that
 * set `scope.user` to null) passes through untouched, staying bounded by the
 * global `policyLimiter` mounted at `/api/*`.
 */
export const tenantAwareLimiter = (options = { windowMs: 60000, max: 100, envKey: 'RATE_LIMIT_TENANT' }) => {
  return async (c, next) => {
    if (c.env && c.env.ENVIRONMENT === 'test') {
      await next();
      return;
    }
    const scope = typeof c.get === 'function' ? c.get('scope') : null;
    // Only token-verified identities with a resolved tenant are credited.
    if (!scope || !scope.user || !scope.tenantId) {
      await next();
      return;
    }
    return rateLimitMiddleware({
      windowMs: options.windowMs,
      max: options.max,
      envKey: options.envKey,
      makeKey: (ip, path) => `t:${ip}:${scope.tenantId}:${path}`,
    })(c, next);
  };
};
