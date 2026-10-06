# SinaiCamps — Security Audit Findings

**Audit type:** Read-only automated + manual review of the Cloudflare Worker backend
**Date:** 2026-09-05
**Scope:** `backend/src/**` (Hono Worker), `backend/wrangler.toml`, deploy surface (`deploy.sh`, `.env.example`, git-secret hygiene). No source code modified.
**Method:** Full back-end source review (55 API modules, middleware, POS routes, Durable Object), SQL-interpolation sweep, auth/scoping matrix, secret-hygiene scan, rate-limit coverage map.

> Security-critical checks (auth, RBAC, tenant scoping, SQL, secrets, crypto) were performed; this is NOT a full functional audit. Findings are advisory. Severity reflects exploitability *within the current threat model* — a multi-tenant B2B SaaS on Cloudflare edge.

---

## Executive Summary

The back end is a Hono Worker with a single auth gate (`requireAuth`), acceptably clean ORM usage (values always bound; dynamic `SET`/`WHERE` fragments are whitelist-literal except **one SQL injection** in the onboarding module), strong POS pricing safeguards (prices derived server-side, quantities capped, atomic stock decrement), and a solid Paymob webhook (HMAC + tenant-scoped idempotent apply). No secrets are committed; bcrypt cost 12; CORS is correctly scoped.

The material exposures cluster around **the public onboarding flow** (SQL injection reachable by token holders, unverified *active* admin signup, error-message leakage, login tokens returned in HTTP bodies) and **public read endpoints leaking sensitive columns** (`cost_price`), plus **feature flags that exist but are never enforced** (no captcha, no 2FA despite a `FEATURE_TWO_FACTOR_AUTH` flag).

---

## Severity Summary

| # | Severity | Finding | Location |
|---|----------|---------|----------|
| 1 | **HIGH** | SQL injection via dynamic `SET` column names — `POST /api/onboarding/tenant` | `backend/src/api/onboarding.js:237-252` |
| 2 | **MEDIUM** | `cost_price` + all columns exposed on public storefront product reads | `backend/src/api/storefront.js:76,99-100` |
| 3 | **MEDIUM** | Client-controlled pricing on public reservation create | `backend/src/api/reservations.js:29,228` |
| 4 | **MEDIUM** | Feature flags unused; no captcha; no 2FA ever implemented | `backend/wrangler.toml [vars]`, `auth.js`, `admin-settings.js` |
| 5 | **MEDIUM** | Public signup mints live, loginnable, unverified admin (is_active=1, 6-char min password) | `backend/src/api/onboarding.js:22,87-90` |
| 6 | **MEDIUM** | Inconsistent tenant scoping column (`tenant_id` vs `organization_id`) across POS/storefront modules | `pos-barcode.js:21`, `admin-supply.js:31`, `routes/pos/index.js:47,107,550,606,730` |
| 7 | LOW | Weak `Math.random()` order references (collision → wrong-order payment match on webhook) | `reservations.js:51`, `orders.js:176`, `paymob-webhook.js:193` |
| 8 | LOW | Forgot-password account-enumeration timing oracle | `backend/src/api/auth.js` forgot-password route |
| 9 | LOW | Internal error detail leaked in signup 500 | `backend/src/api/onboarding.js:105` |
| 10 | LOW | Onboarding + auto-login bearer tokens returned in HTTP bodies; `onboarding_token` never rotated/cleared | `backend/src/api/onboarding.js:101,211`, `onboarding route lookups` |
| 11 | LOW | Stripe webhook secret compare is `!==` (timing); mock path | `backend/src/api/payments.js` |
| 12 | LOW/INFO | Upload validation by extension + declared MIME only (no magic bytes); nosniff mitigates stored-XSS | `backend/src/api/upload.js` |
| 13 | INFO | Rate-limit budgets are per-isolate/in-memory (KV disabled); policies keyed on path only | `backend/wrangler.toml`, `middleware/rateLimit.js` |
| 14 | INFO | Public endpoints fall back to 100/min default budget | `middleware/rateLimit.js` policy table |
| 15 | INFO | SSE `?token=` carries 24h admin JWT in query string (access-log leak) | `durable/broadcaster.js:62`, `index.js` |
| 16 | INFO | `/api/openapi.json` public (schema disclosure) | `backend/src/index.js` |
| 17 | INFO | Storefront cart POST is admin-gated (public shoppers blocked) AND queries dropped `pos_products.price` column → broken endpoint | `storefront.js:150`, `migrations/0042` |
| 18 | INFO | `admin-health.js` returns randomized mock metrics; `admin-stats.js`/`admin-users.js` appear unmounted/legacy | `admin-health.js:105-117` |

---

## Findings Detail

### 1. [HIGH] SQL injection — `POST /api/onboarding/tenant` (dynamic SET column names)

`backend/src/api/onboarding.js:220-258` — `/api/onboarding/tenant` does **not** validate its body with zod (unlike `/onboarding/setup` on line 150-157 which uses `.strip()`). It destructures `const { token, ...fields } = body` and builds the UPDATE from **arbitrary client-supplied keys**:

```js
for (const [key, value] of Object.entries(fields)) {
  if (value !== undefined && value !== null && value !== '') {
    updates.push(`${key} = ?`);   // ← key is attacker-controlled SQL fragment
    bindArgs.push(value);
  }
}
...
`UPDATE tenants SET ${updates.join(', ')} WHERE id = ?`
```

Values are bound (safe), but column **names are not**. A key such as `"status = 'suspended', subdomain"` yields `SET status = 'suspended', subdomain = ?` — a valid multi-column update; keys can also inject comments/subqueries. Impact is arbitrary `UPDATE tenants` (status, subdomain, custom_domain, branding, …) for any row the attacker can identify.

**Precondition (why not Critical):** the attacker must present a valid `onboarding_token`. Tokens are `crypto.randomUUID()` — hard to guess. However, the token is exposed in **two HTTP response bodies** (`onboarding.js:101` — returned to every signup caller; `onboarding.js:211` setup response) and is **never invalidated or rotated** once onboarding completes (the `WHERE onboarding_token = ?` lookups on lines 116, 161, 228 remain valid for the life of the tenant). Any leaked/stale token therefore grants persistent tenant-row tampering.

**Recommendation:**
- Reuse a zod `.strip()` schema with an explicit whitelist of allowed keys (mirroring `setupSchema`).
- Clear `onboarding_token` on completion (and add an expiry column).
- Stop returning the raw token in response bodies.

### 2. [MEDIUM] Public storefront leaks `cost_price` via `SELECT *`

`backend/src/api/storefront.js:64-104` — `GET /api/storefront/products` and `GET /api/storefront/products/:id` run under `storefrontPublicScope` (`resolveScope({ public: true })`, verified in `index.js:763`) — **no auth**. Both use:

```sql
SELECT * FROM pos_products WHERE tenant_id = ? ...
```

`pos_products.cost_price` (business margin) is returned to any anonymous visitor, along with every other internal column. The POS and barcode surfaces correctly project explicit columns (`routes/pos/index.js:107`, `pos-barcode.js:21`).

**Recommendation:** replace `SELECT *` with an explicit column projection that omits `cost_price`.

### 3. [MEDIUM] Client-controlled pricing on public reservations

`backend/src/api/reservations.js` — public `POST /api/public/reservations` accepts `orderItemSchema.unit_price: z.number().min(0)` (line 29) and uses it verbatim to compute the order total (line 228):

```js
effectiveTotal += orderItems.reduce((sum, it) => sum + it.quantity * it.unit_price, 0);
```

Rate cover on `/api/public/*` is the **default 100/min** budget (INFO #14). A caller can create arbitrarily cheap orders. Reserve client-supplied `unit_price` for genuinely free-form items (meal plans are priced server-side); for known products derive price from `pos_products.selling_price`.

### 4. [MEDIUM] Feature flags are window dressing; no captcha; no 2FA

- `FEATURE_USER_REGISTRATION`, `FEATURE_FORGOT_PASSWORD`, `FEATURE_TWO_FACTOR_AUTH` in `wrangler.toml [vars]` have **zero code usages** (grep confirmed). Registration and forgot-password are permanently live.
- `platform_settings.feature_flags` blob (`admin-settings.js:57-76`, toggled at `/api/admin/settings/feature-flags/:id`) is likewise **never read** by the rest of the app — toggling it only mutates a JSON blob.
- **No captcha / Turnstile / rate-tightening on `/api/auth/register` or `/api/public/signup`** beyond the global `/api/auth/*` 30/min.
- **No 2FA/TOTP exists anywhere** (grep confirmed) despite the flag.

**Recommendation:** implement the intended gates (2FA for platform/tenant admins; captcha or invite-only signup) or remove the flags to avoid a false sense of control.

### 5. [MEDIUM] Public signup creates an ACTIVE, loginnable admin — no verification

`backend/src/api/onboarding.js:87-90`:

```js
`INSERT INTO admins (id, tenant_id, email, password_hash, role, first_name, last_name, is_active, ...) VALUES (?, ?, ?, ?, 'admin', ?, ?, 1, ...)`
```

Contrast with `auth.js:313` (`/api/auth/register`): `is_active = 0` + admin approval + requires a valid tenant. Signup requirements are also weaker (`password: z.string().min(6)` line 22, vs 8+ on other paths). Combined with no captcha (#4), a scripted attacker can mint an unlimited number of **live** loginnable tenant admins. The "Check your email for next steps" message (line 102) is not backed by any email-send — verification is effectively nonexistent.

### 6. [MEDIUM] Mixed tenant-scoping column (`tenant_id` vs `organization_id`)

The refined model: `pos_products` carries both `tenant_id` TEXT and `organization_id` INTEGER. Modules are inconsistent about which they scope on:
- `tenant_id`: `pos-barcode.js:21`, `admin-storefront.js:26-31`, `admin-supply.js:31`, `storefront.js:76,100,150`, reservations flows.
- `organization_id` (resolved to tenant via `tenant_org_mapping`, with fallback): `routes/pos/index.js:47,107,131,550,606,730`.

If a tenant's `tenant_id` and its organization's resolved tenant diverge (legacy/pre-onboarding rows, `tenant_org_mapping` gaps), queries silently return no rows **or overlap across tenants**. POS auth even logs "tenant_org_mapping lookup failed, using organization_id" (`routes/pos/index.js:54`). Risk: data isolation degrades to best-effort. Since both columns are `NOT NULL`, the practical risk is mis-scoped reads/writes for org-bearing modules. **Recommendation:** scope every query on the same column and add a check constraint `tenant_id = (SELECT tenant_id FROM tenant_org_mapping WHERE organization_id = organization_id)` (or backfill `tenant_org_mapping` from the POS-org ID used at onboarding).

### 7. [LOW] Weak order references from `Math.random()`

`reservations.js:51` / `orders.js:176`:

```js
Math.random().toString(36).substring(2, 8).toUpperCase()  // 6 chars base-36 ≈ 2.2B space, non-crypto
```

Stored as `reference` and used by the Paymob webhook to **locate the order to mark paid** (`paymob-webhook.js:193`). Predictable + collision-prone references raise the odds a webhook callback matches the wrong order. Use `crypto.randomUUID()` or a crypto-derived short digest, and add a UNIQUE constraint.

### 8. [LOW] Forgot-password timing oracle

`auth.js` forgot-password returns the same message for existing and non-existing accounts, but the existing-account branch performs a DB lookup + (POST-)work (hash/email attempt) while the not-found branch returns early — an attacker can time the difference. Mitigated in practice by the built-in **per-IP 5/15-min limiter** (`auth.js:55-72`) and the global 30/min. Recommended: constant-work path (e.g., hash a random value when the account is absent).

### 9. [LOW] Signup leaks internal errors

`onboarding.js:105`: `errorResponse('Signup failed: ' + (e.message || 'Unknown error'), 500)` surfaces D1/SQL internals to the client (also creating partial state when the pos_organizations insert fails after the tenant row was already written). Log server-side; respond generically.

### 10. [LOW] Bearer tokens travel in HTTP bodies and are never rotated

- `onboarding_token` → returned to the client at signup (`onboarding.js:101`) and is the sole auth for four endpoints (`/onboarding/status/:token`, `/onboarding/setup`, `/onboarding/tenant`, plus any future consumers).
- `auto_login_token` — a **24-hour, passwordless login token** exchangeable for a session at `auth.js:477` (`WHERE auto_login_token = ?`) — is returned in the setup response body (`onboarding.js:211`).
- Both are only as safe as the HTTP response path (logs, proxies, browser history, referrers). Combined with #1 and #5, the signup→setup flow concentrates long-lived bearer credentials in cleartext response bodies.

### 11. [LOW] Stripe webhook secret compared with `!==`

`backend/src/api/payments.js` uses a plain `!==` comparison for the Stripe webhook secret (timing + non-constant-time). Mitigations: endpoint is behind the `/api/payments*` 20/min policy and the Stripe path is effectively inert unless `PM_ENABLED === 'true'` (the real, enabled path is Paymob-HMAC via `paymob-webhook.js`, which uses `subtle.importKey`/constant-time verify). Use a timing-safe compare if Stripe is ever enabled.

### 12. [LOW/INFO] Uploads: extension + declared MIME only

`upload.js` whitelists jpg/jpeg/png/webp/gif, enforces 8MB, strongly validates the R2 key (`sanitizeMediaKey`), and the public media GET sets `X-Content-Type-Options: nosniff`. No magic-byte/decode verification of the file content. `nosniff` makes same-origin HTML-in-image exploitation impractical; consider a content check (e.g., decode on the worker) for defense-in-depth.

---

## Infra / Config notes (INFO)

- **#13 — Rate limiter is per-isolate.** `RATE_LIMIT_KV_ENABLED="false"` (`wrangler.toml`) forces the in-memory map (fail-closed on KV error; cleaned at >10k entries). Budgets are therefore **not shared across isolates** — a distributed attacker amortizes across workers. Policy keys are path-only (GET and POST share one budget — conservative, fine).
- **#14 — Default 100/min for `/api/public/*`, `/api/storefront*`, `/api/camps*`, `/api/marketplace`.** Only `/api/auth/*` (30), POS login (15), `/api/tenants` (5/5m), `/api/admin*` (20), `/api/payments*` (20), `/api/leads|contact` (10) are tuned. Public reservation/cart abuse is only lightly bounded.
- **#15 — SSE token in query string.** `GET /connect?token=` passes a 24h admin JWT via URL (`broadcaster.js:62`). Fine functionally; leaks into access logs/referrers. Prefer a short-lived one-time ticket checked by the route before proxying.
- **#16 — `/api/openapi.json` is public** (schema/type disclosure; harmless but unnecessary).
- **#17 — Storefront cart is admin-gated and broken.** `storefrontScope` (index.js:767-774) requires admin auth for *every* non-public-GET, so anonymous shoppers cannot add-to-cart — and when an admin does, `storefront.js:150` selects `price` from `pos_products`, a column **dropped in migration 0042** → `unit_price` = undefined → NaN totals. Integration/functionality gap, not a vulnerability.
- **#18 — `admin-health.js:105-117` returns randomized mock metrics** on a super-admin endpoint; `admin-stats.js`/`admin-users.js` appear unmounted/legacy. Clean up to avoid confusion.

---

## Positive controls verified (no action needed)

- **RBAC:** single `requireAuth` gate (realm `admin`/`pos`, role sets, `requireTenant`, per-request DB `is_active` re-check — deactivated admins lose access immediately); `resolveScope` three modes; `super_admin` may only override tenant via `?tenantId=` by design; all `/api/admin/*` and `/api/admin/settings` behind super-admin gates; `pos-users.js` `scopeTenant` correctly hard-scopes tenant admins to their own org.
- **SQL:** values always bound; all dynamic `SET` builders (storefront.js, supply.js, invoices, etc.) use hardcoded `'col = ?'` guarded by zod `.strip()`; all admin-pillar `WHERE` builders (admin-hr/crm/financials/payouts/supply/users/audit/subscriptions, marketplace, camps) use literal `col = ?` + bound values. **The only injection found is #1.**
- **Passwords:** bcrypt cost 12 everywhere; `rehashIfNeeded` on login; reset tokens are single-use crypto UUIDs.
- **POS ordering:** prices derived from `pos_products.selling_price`; quantity int 1–9999; atomic conditional stock decrement; order id `crypto.randomUUID()`; idempotency dedupe on `(key, tenant_id, cashier_id)`; batch insert with compensation. Server-side pricing is the correct pattern — replicate it in reservations (#3).
- **Paymob webhook:** HMAC-SHA-256 verified against the raw body read once; order lookup scoped `WHERE reference = ?` then state-guarded update (`id = ? AND tenant_id = ? AND order_state_id = 'pending'`); ledger insert is `INSERT … SELECT … WHERE NOT EXISTS` — idempotent and tenant-scoped.
- **Uploads:** extension allowlist, size cap, R2 key regex, nosniff.
- **Secrets hygiene:** no hardcoded secrets in `backend/src` or `wrangler.toml [vars]`; `.env`/`.dev.vars` gitignored; Paymob secrets via `wrangler secret put`; no `console.*` of tokens or secrets (only error messages/stack traces in non-production).
- **CORS:** `^https://[^.]+\.sinaicamps\.com$` (rejects `evil-sinaicamps.com`); `hono/cors` is the single source of truth.
- **Routing:** unmatched `/api/*` → 404 (no 401-before-404 info leak); `/api/v1/*` alias rewrites before dispatch; global `app.onError` returns a generic message.

---

## Recommended priority order

1. **#1** — Whitelist the keys in `/api/onboarding/tenant` (zod `.strip()`), clear/expire `onboarding_token`.
2. **#2** — Project storefront product columns (drop `cost_price`) on public reads.
3. **#5** — Require verification (or `is_active=0` + approval) for `/public/signup`; raise password minimum to 8.
4. **#3** — Derive reservation line-item prices from DB for known SKUs.
5. **#4** — Wire or remove the feature flags; add captcha on register/signup.
6. **#6** — Unify tenant scoping on a single column.
7. **#7–#10** — Crypto randomness for references, constant-time forgot-password, stop leaking error details and tokens in bodies.