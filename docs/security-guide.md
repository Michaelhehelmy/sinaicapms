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

Fix commit `af1d69b` unwrapped all 46 A/B/E call sites (inner expressions byte-identical); 18 `escHtml` hits remain, all KEEP (CampsSection D `innerHTML` pipeline + HRPanel D `document.write` lines + defs). Regression test `app/tests/unit/tenant-name-escape.test.tsx` (commit `09ff710`) pins single-escaping.

### Layer 3: Zod validation at the API boundary

All API endpoints validate input with Zod schemas (unknown fields stripped via `.strip()`). Malformed input is rejected with a clean JSON error before it reaches storage. Stored user content is never mutated at the storage boundary — it is escaped at the presentation boundary (Layers 1–2). The old `sanitizeInput` middleware was removed rather than left as a false defense: since Hono 4.12 it had been a silent no-op (getter-only `c.req`), so no pattern-stripping layer exists — see the removal note in `backend/src/index.js` (T2).

### Layer 4: No scrub-on-write layer (by design)

There is no stored-content scrub: user content keeps its original bytes in D1 and is escaped at render (Layers 1–2). (Earlier revisions of this guide cited a one-time `0076_sanitize_user_data.sql` scrub — no such file exists in the current `backend/migrations/` lineage, and a one-time scrub cannot stop new payloads, so render-time escaping is the guarantee.)

### Known safe patterns

| Pattern | Status | Explanation |
|---------|--------|-------------|
| `dangerouslySetInnerHTML` | ✅ Not used | Zero instances in any React component |
| `innerHTML` in Astro | ✅ Safe | Used only for skeleton/loading HTML or client-side JS that uses `escHtml()` |
| Backend `escHtml()` | ✅ Present | In `backend/src/utils/response.js`, applied at render time |

---

## Rate Limiting

Rate limiting uses **Cloudflare KV** for distributed tracking:

- **Key**: `cf-connecting-ip` header (cannot be spoofed — Cloudflare strips `x-forwarded-for`)
- **Default limits**: 100 requests/minute per IP
- **Failure mode**: **Fails closed** — if KV is unavailable, requests are rejected with 429 (not allowed through)
- **Configuration**: `RATE_LIMIT_KV_ENABLED` env var in `backend/wrangler.toml`

### ⚠️ Free-plan caveat

Cloudflare free plan = **1,000 KV writes/day**. A KV write per API request exhausts this quota quickly. Currently set to `RATE_LIMIT_KV_ENABLED="false"` (in-memory fallback). Only enable KV rate limiting on a paid plan with sufficient write quota.

---

## CORS Policy

CORS is configured exclusively in `backend/src/index.js` via `hono/cors`:

```javascript
import { cors } from 'hono/cors';

app.use('*', cors({
  origin: ['https://sinaicamps.com', 'https://staging.sinaicamps.com'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-tenant-id'],
  credentials: true,
}));
```

**Rule**: No individual route or middleware should set CORS headers — `hono/cors` is the single source of truth. Response headers must NOT duplicate CORS settings.

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

*Last updated: 2026-09-30 — escHtml correction (Step 4: Layer 2 defense-layer claim replaced with raw-HTML-only guidance + A–E table; fix SHA af1d69b, regression test 09ff710)*
