---
title: "Security Guide"
aliases:
tags:
  - type/guide
  - audience/developer
  - domain/security
  - status/live
created: 2026-08-26
updated: 2026-10-06
relates-to:
  - "[[06-security/README]]"
  - "[[02-api/API_CONTRACT]]"
  - "[[98-history/audits/AUDIT_SECURITY_FINDINGS]]"
  - "[[98-history/audits/AUTH_SYSTEM_AUDIT]]"
  - "[[98-history/worksheets/audit-2026-09-30-eschtml-inventory]]"
code-references:
  - "backend/src/middleware/requireAuth.js"
  - "app/src/lib/utils.ts:3"
  - "app/src/components/public/CampsSection.astro"
  - "app/src/components/admin/HRPanel.tsx"
  - "app/src/components/public/MarketplaceHome.astro"
  - "app/tests/unit/tenant-name-escape.test.tsx"
  - "backend/src/index.js:147"
  - "backend/migrations/legacy/0076_sanitize_user_data.sql"
  - "scripts/check-deploy-parity.sh"
  - "backend/src/utils/response.js:108"
verified: never
---
# Security Guide

This document covers the security architecture and defensive measures implemented in SinaiCamps.

---

## Table of Contents

- [Authentication](#authentication)
- [CSRF Resistance](#csrf-resistance)
- [XSS Prevention](#xss-prevention)
- [Rate Limiting](#rate-limiting)
- [CORS Policy](#cors-policy)
- [Input Sanitization](#input-sanitization)
- [Security Recommendations](#security-recommendations)

---

## Authentication

SinaiCamps uses **JWT (HS256) Bearer tokens** for authentication:

- **Admin tokens**: Issued by `POST /api/auth/login` with `role: 'admin'` or `role: 'super_admin'`. Scoped to a tenant via `tenantId` claim.
- **POS tokens**: Issued by `POST /api/pos/auth/login` with `posType: 'pos'`. Scoped via `organizationId` claim.
- **Token storage**: Client-side `localStorage` — tokens are never stored in cookies.
- **Token transmission**: `Authorization: Bearer <token>` header on every authenticated request.

### Token lifecycle
- Tokens are stateless (no server-side session store).
- Role-based access control (RBAC) enforced in `backend/src/middleware/requireAuth.js`.
- Cross-tenant access blocked: admin tokens are bound to a single `tenantId`.
- **Scope denial returns 403, not 401**: a valid token with the wrong tenant/project scope (`scopeDenied`), a POS↔admin realm mismatch, or insufficient role returns `403 Forbidden`. `401` is only for missing/invalid/expired tokens, deactivated accounts, or missing tenant context. Full matrix: `docs/API_CONTRACT.md` §7 (sourced from `backend/src/middleware/requireAuth.js` `DEFAULT_MESSAGES`).

---

## CSRF Resistance

**SinaiCamps is inherently resistant to CSRF attacks** due to its authentication architecture.

### Why CSRF doesn't apply

| Mechanism | CSRF Risk | Explanation |
|-----------|-----------|-------------|
| Bearer tokens in `Authorization` header | **None** | Browsers do NOT auto-attach `Authorization` headers in cross-origin form submissions or `<img>` tags. An attacker-controlled `<form action="https://api.sinaicamps.com/api/camps">` will NOT include the JWT. |
| No cookies for auth | **None** | CSRF relies on the browser auto-attaching cookies. Since SinaiCamps stores tokens in `localStorage` (not cookies), there is nothing for the browser to auto-send. |
| `Content-Type: application/json` | **Defense-in-depth** | All API requests use JSON bodies. Simple cross-origin form submissions can only send `application/x-www-form-urlencoded`, `multipart/form-data`, or `text/plain`. |

### Comparison: Cookie-based auth (risky)

If SinaiCamps ever migrated to cookie-based sessions:
1. The browser WOULD auto-attach session cookies on cross-origin requests.
2. An attacker page could submit forms to the API.
3. **This would require anti-CSRF tokens.**

### Current status

```
✅  Bearer token in Authorization header — NOT auto-sent by browsers
✅  No session cookies — nothing for CSRF to exploit
✅  JSON content-type — additional defense layer
⚠️  If switching to cookie-based auth: ADD anti-CSRF token implementation
```

---

## XSS Prevention

SinaiCamps uses a **defense-in-depth** approach to prevent Cross-Site Scripting:

### Layer 1: React auto-escaping (client-side)

React automatically escapes all JSX expressions. User data rendered as `{user.name}` is safe — React converts `<script>` to `&lt;script&gt;`.

### Layer 2: `escHtml()` — raw-HTML pipelines ONLY (never in framework expressions)

`escHtml()` (canonical def `app/src/lib/utils.ts:3`) is used ONLY where a hand-built HTML string is inserted as raw HTML (`innerHTML` / `document.write`). It must NEVER wrap an Astro `{...}` or React `{...}` expression — both frameworks auto-escape, so wrapping double-escapes (`Michael's House` renders as `Michael&#39;s House`).

Rule: sink auto-escapes (Astro/React expression) or is plain text (WhatsApp/`wa.me` message, `textContent`, clipboard) → raw value, no wrapper. Sink is raw HTML (`innerHTML`, `document.write`, `set:html`) → `escHtml()` every interpolated value.

```astro
<h1>{camp.name}</h1>              <!-- ✅ Astro auto-escapes -->
<p>{camp.description}</p>         <!-- ✅ no wrapper -->
```

```javascript
grid.innerHTML = '<h3>' + escHtml(t.name) + '</h3>';  // ✅ raw-HTML sink needs escHtml
```

When to use which (full inventory: `docs/audit-2026-09-30-eschtml-inventory.md`):

| Category | Sink | Action |
|----------|------|--------|
| A — Astro `{...}` expression | framework auto-escapes | REMOVE wrapper |
| B — React `{...}` expression | framework auto-escapes | REMOVE wrapper |
| C — `set:html` raw-HTML insertion | raw HTML | KEEP (zero escHtml sites — all 3 `set:html` are JSON-LD `JSON.stringify`) |
| D — manual HTML string → `innerHTML` / `document.write` | raw HTML | KEEP |
| E — plain-text sink (WhatsApp/`wa.me`, `textContent`) | plain text | REMOVE wrapper |

Fix commit `af1d69b` unwrapped all 46 A/B/E call sites (inner expressions byte-identical); 18 `escHtml` hits remain, all KEEP. Re-counted 2026-10-02, and the 18 are worth naming because **two of the three definitions are local, not the canonical import**:

| File | Hits | Which |
|---|---|---|
| `app/src/lib/utils.ts:3` | 1 | the canonical definition (`export function escHtml`) |
| `app/src/components/public/CampsSection.astro` | 12 | 1 **local** `function escHtml` (:195) + 11 call sites feeding `grid.innerHTML` — category D |
| `app/src/components/admin/HRPanel.tsx` | 4 | 1 import + 3 calls (:302/:303/:307) whose values are interpolated into a `document.write` print template (:354) — category D |
| `app/src/components/public/MarketplaceHome.astro` | 1 | 1 **local** `function escHtml` (:201), currently unreferenced by any call site |

A local def is not the canonical one: two components each carry their own copy
of the same five-entity escape map, so a fix to `utils.ts` does **not** reach
them. Regression test `app/tests/unit/tenant-name-escape.test.tsx` (commit
`09ff710`) pins single-escaping on the fixed `{…}` pattern.

### Layer 3: Zod validation at the API boundary

All API endpoints validate input with Zod schemas (unknown fields stripped via `.strip()`). Malformed input is rejected with a clean JSON error before it reaches storage. Stored user content is never mutated at the storage boundary — it is escaped at the presentation boundary (Layers 1–2). The old `sanitizeInput` middleware was removed rather than left as a false defense: since Hono 4.12 it had been a silent no-op (getter-only `c.req`), so no pattern-stripping layer exists — see the removal note in `backend/src/index.js` (T2).

### Layer 4: No scrub-on-write layer (by design)

There is no stored-content scrub: user content keeps its original bytes in D1 and is escaped at render (Layers 1–2). Earlier revisions of this guide cited a one-time `0076_sanitize_user_data.sql` scrub as if it were part of the schema. It is not: the file exists **only** under `backend/migrations/legacy/` (99 files there, excluded from the applied lineage — `scripts/check-deploy-parity.sh` inventories top-level `backend/migrations/*.sql` only), and a one-time scrub could not stop new payloads anyway, so render-time escaping is the guarantee.

### Known safe patterns

| Pattern | Status | Explanation |
|---------|--------|-------------|
| `dangerouslySetInnerHTML` | ✅ Not used | Zero instances in `app/src` (re-grepped 2026-10-02) |
| `set:html` | ✅ Safe | Exactly 3 sites, all JSON-LD `JSON.stringify` (PublicLayout, TenantLanding via `sanitizeForJsonLd`, camps page) — no user value is interpolated raw |
| `innerHTML` in Astro / client scripts | ✅ Safe | Skeleton/loading markup, or hand-built HTML strings that run every interpolated value through `escHtml()` |
| Backend `escHtml()` | ⚠️ **Exported but unused** | It is defined in `backend/src/utils/response.js:108` and covered by `backend/tests/response.test.js`, but **no module under `backend/src` calls it** (only comments reference it, telling writers *not* to escape at storage time). The backend serves JSON; it has no render step. Do not read its presence as an active defence. |

---

## Rate Limiting

Rate limiting is a **declarative policy table** (`RATE_LIMIT_POLICIES` in
`backend/src/middleware/rateLimit.js`) evaluated by `policyLimiter`, mounted
once as `app.use('/api/*', policyLimiter())` in `backend/src/index.js:147`.

- **Key**: `cf-connecting-ip` header (cannot be spoofed — Cloudflare strips
  `x-forwarded-for`) **+ the request path** — the bucket is `${ip}:${path}`,
  so two different endpoints never share a budget.
- **Matching**: entries are tried **in declaration order and the first hit
  wins**, so a broad prefix listed above a specific path silently swallows it.
  A key may carry an HTTP method (`POST /api/tenants`) or be a method-less
  glob (`/api/admin*` = path prefix). A `*` in the **middle** of a key
  (`GET /api/projects/*/meal-plans`) compiles to a regex matching exactly one
  path segment; a trailing `*` keeps `startsWith` semantics.
- **"100 requests/minute" is only the fallback bucket.** It is the `default`
  entry, used by any path no other entry claims. Real per-surface budgets
  include `GET /api/marketplace*` 300/min, `GET|HEAD /api/media*` 300/min,
  `GET /api/availability` 120/min, `/api/pos/*` 60/min, `/api/auth/*` 30/min
  (dial `RATE_LIMIT_LOGIN`), `/api/admin*` 20/min, `POST /api/tenants` 5/5min,
  `POST /api/feedback` 6/min, `GET /api/orders/status/*` 5/min. Most entries
  carry an `envKey` so ops can retune one surface without touching the global
  dial (`readLimitInt`; a non-positive or unparseable value falls back to the
  hardcoded `max`).
- **A second, tenant-scoped layer** (`tenantAwareLimiter`) is mounted on 7
  prefixes (`/api/tenants/:tenantId/meta/*`, `/api/tenants/import/*`,
  `/api/admin/*`, `/api/tenant/billing/*`, `/api/pos/*`, `/api/reports/*`,
  `/api/inventory/*`) with key `t:<ip>:<tenantId>:<path>` and its own
  `RATE_LIMIT_TENANT` dial. It **no-ops for callers with no resolved tenant**
  — an anonymous or tenant-less token is not credited to any tenant bucket.
- **Failure mode**: **fails closed** — a KV error answers
  `429 Rate limit check failed` (not allowed through). An ordinary over-limit
  answers `429 Too many requests`.
- **Exempt**: long-lived SSE `GET /api/stream/orders` is skipped inside
  `policyLimiter`. The mint endpoint `POST /api/stream/token` is **not** exempt
  (10/min) — that is what bounds token acquisition by IP.
- **Test bypass**: both limiters no-op when `env.ENVIRONMENT === 'test'`.
- **Configuration**: `RATE_LIMIT_KV_ENABLED` env var in `backend/wrangler.toml`

### ⚠️ Free-plan caveat

Cloudflare free plan = **1,000 KV writes/day**. The KV branch of the limiter
does one `get` + one `put` **per request**, so API traffic exhausts that quota
quickly. Currently set to `RATE_LIMIT_KV_ENABLED="false"` (in-memory
per-isolate fallback) in both `[vars]` and `[env.staging.vars]`. Only enable KV
rate limiting on a paid plan with sufficient write quota.

---

## CORS Policy

CORS is configured in exactly one place — `backend/src/index.js:123–141`, the
global `hono/cors` middleware. The allowlist is **not** a static array; it is an
**async origin function**, which matters when you audit it:

```javascript
const DEFAULT_ORIGINS = [
  'http://localhost:8000', 'http://localhost:8001',
  'http://localhost:4320', 'http://localhost:5173',
  'https://sinaicamps.com', 'https://*.sinaicamps.com',
];

app.use('*', cors({
  origin: async (origin, _c) => {
    if (!origin) return null;                       // same-origin / non-browser
    for (const { regex } of WILDCARD_ORIGINS) {      // '*.sinaicamps.com' → /^https:\/\/[^.]+\.sinaicamps\.com$/
      if (regex.test(origin)) return origin;
    }
    if (EXACT_ORIGINS.includes(origin)) return origin;
    try {                                           // registered custom domains
      const customDomains = await getAllowedCustomDomains(_c.env);
      if (customDomains.includes(new URL(origin).hostname)) return origin;
    } catch {}
    return null;                                    // no match → no CORS headers
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'x-tenant-id', 'Authorization'],
  maxAge: 86400,
}));
```

Auditor's notes:

- **`https://*.sinaicamps.com` is a single-segment wildcard**, compiled once at
  module load into a `RegExp` (never recompiled per request). Because `*` is
  translated to `[^.]+`, `https://a.b.sinaicamps.com` does **not** match — only
  one label deep. `staging.sinaicamps.com` matches by virtue of that wildcard,
  not by being listed.
- **Tenant custom domains are allowed dynamically** from the registered set,
  cached in-isolate for `CUSTOM_DOMAIN_CACHE_TTL = 5 * 60 * 1000`. A tenant's
  domain is therefore allowed up to 5 minutes after registration, and an
  unregistered origin is rejected immediately.
- **There is no `credentials: true`.** Auth is a Bearer header (Layer above),
  so cookies are never in play and the flag is neither needed nor set.
- **`maxAge: 86400`** lets browsers cache the preflight for a day.
- Returning `null` (not `false`, not `''`) is what makes `hono/cors` omit the
  `Access-Control-*` headers entirely.

**Rule**: No individual route or middleware should set CORS headers — this
`hono/cors` mount is the single source of truth. Response helpers must NOT
duplicate CORS settings, and `Access-Control-*` must not be added by a Durable
Object or any other sub-response either.

---

## Input Sanitization

### Backend validation (no sanitize middleware)

No sanitize middleware exists — `backend/src/middleware/sanitize.js` is absent from disk and no `sanitizeInput` mount exists in `backend/src/index.js` (removed; see XSS Prevention Layer 3). Boundary defense is Zod schema validation (below), not pattern-stripping.

### Zod validation

All API endpoints validate input with Zod schemas:

```javascript
const campCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  // ...
}).strip();  // .strip() removes unknown fields
```

### SQL injection prevention

All database queries use parameterized statements via D1's `.bind()`:

```javascript
// ✅ Safe — parameterized
await env.DB.prepare('SELECT * FROM camps WHERE id = ?').bind(campId).all();

// ❌ Never — string interpolation
await env.DB.prepare(`SELECT * FROM camps WHERE id = '${campId}'`).all();
```

---

## Security Recommendations

1. **Never store JWT in cookies** — keep using `localStorage` + `Authorization` header to maintain CSRF resistance.
2. **Rotate JWT secrets** periodically — `env.JWT_SECRET` has no fallback; if compromised, all tokens are valid.
3. **Keep `RATE_LIMIT_KV_ENABLED="false"`** on the free plan — KV writes/day quota will cause API outage if enabled.
4. **Monitor for XSS payloads** in user-generated content — render-time escaping (Astro/React auto-escape + `escHtml()` in raw-HTML pipelines only) is the guarantee, not input scrubbing.
5. **Review new endpoints** for CORS compliance — never set CORS headers outside `hono/cors`.
6. **Use parameterized queries** exclusively — never interpolate user input into SQL strings.

---

## Verification note (2026-10-02)

This pass **verified, not rewrote**, the escHtml guidance added by `fcd0e40`:
the raw-HTML-only rule, the A–E category table, the 46-unwrapped / 18-remaining
counts, fix SHA `af1d69b` and regression test `09ff710` all still match the
tree. Only the parts that had drifted were patched, and the drift was **not**
in the XSS section — it was in three places the previous pass never covered:

1. **CORS was documented as a two-element static array** (with
   `credentials: true`). It has been an async origin function with a
   wildcard-regex list, a dynamically cached custom-domain allowlist and
   `maxAge: 86400`, and no credentials flag. A reader auditing the allowlist
   from the old text would have audited the wrong thing.
2. **Rate limiting was documented as "100 requests/minute per IP"** with a KV
   note. The limiter is a ~20-entry ordered policy table keyed
   `${ip}:${path}` with per-entry env dials, plus a second tenant-scoped layer
   on 7 prefixes — "100/min" is only the fallback bucket, and
   first-match-wins ordering is a real footgun.
3. **"Backend `escHtml()` — present, applied at render time"** was false in
   both halves: the export exists and is unit-tested, but nothing under
   `backend/src` calls it, and the backend has no render step.

*Last updated: 2026-10-02 — CORS + rate-limiting sections rebuilt against
`backend/src/index.js:123–141` and `backend/src/middleware/rateLimit.js`;
escHtml/known-patterns table re-verified against the tree (escHtml guidance
itself unchanged since `fcd0e40`, 2026-09-30: raw-HTML-only + A–E table, fix
SHA `af1d69b`, regression test `09ff710`).*
