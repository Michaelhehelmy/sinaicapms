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

### Layer 2: `escHtml()` in Astro templates (server-side)

All user data rendered in Astro templates is escaped via `escHtml()` from `app/src/lib/utils.ts`:

```astro
<h1>{escHtml(camp.name)}</h1>
<p>{escHtml(camp.description)}</p>
```

65+ usages across the frontend — every user-facing field is escaped.

### Layer 3: `sanitizeInput()` middleware (backend, defense-in-depth)

The `sanitizeInput` middleware in `backend/src/middleware/sanitize.js` strips dangerous patterns from request bodies before storage:

- `<script>` tags (and variants like `<script/`, `<sc<script>ript>`)
- `on*` event handlers (`onclick=`, `onerror=`, etc.)
- `javascript:` protocol URLs

This middleware is mounted on `/api/*` in `backend/src/index.js` and applies to all POST/PUT/PATCH requests.

### Layer 4: Migration 0076 (data sanitization)

Migration `0076_sanitize_user_data.sql` sanitizes any existing XSS payloads in user-generated text fields (`meta_value`, `description`, `notes`, `comment`, `review`) using SQLite `REPLACE()` functions.

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

### Backend middleware

`backend/src/middleware/sanitize.js` — applied to all `/api/*` POST/PUT/PATCH requests:

```javascript
// Strips <script> tags, on* handlers, javascript: URLs from string values
export function sanitizeInput() { ... }
```

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
4. **Monitor for XSS payloads** in user-generated content — the sanitize middleware is defense-in-depth, not a guarantee.
5. **Review new endpoints** for CORS compliance — never set CORS headers outside `hono/cors`.
6. **Use parameterized queries** exclusively — never interpolate user input into SQL strings.

---

*Last updated: 2026-08-26 — Audit resolution (Task 4: CSRF Documentation)*
