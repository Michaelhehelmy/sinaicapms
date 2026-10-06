---
title: "SinaiCamps — API Contract"
aliases:
  - API_CONTRACT
  - API Contract
tags:
  - type/contract
  - audience/developer
  - domain/api
  - domain/backend
  - status/current
created: 2026-08-13
updated: 2026-10-06
relates-to:
  - "[[API_SURFACE]]"
  - "[[API_SURFACE_MAP]]"
  - "[[02-api/README]]"
  - "[[ARCHITECTURE]]"
  - "[[COMPONENT_CATALOG]]"
  - "[[security-guide]]"
code-references:
  - "app/src/lib/api.ts:1-2838"
  - "app/src/lib/api.ts:121-214"
  - "backend/src/routes/registry.js:1-3494"
  - "backend/src/utils/response.js:11-87"
  - "backend/src/middleware/requireAuth.js:68-172"
  - "backend/src/middleware/resolveScope.js:83-131"
  - "backend/src/middleware/tenant.js:5"
  - "backend/src/api/auth.js:104-179"
  - "app/src/lib/utils.ts:3"
  - "endpoint: GET /api/openapi.json → backend/src/index.js:477"
verified: never
---

# SinaiCamps — API Contract

## 1. The contract lives in the client

The **single source of truth** for the frontend↔backend contract is `app/src/lib/api.ts` — a typed client with **~276 exported functions** covering every endpoint the frontend uses. The backend mirrors it: every route registered in `backend/src/routes/registry.js` and every handler in `backend/src/api/**` / `backend/src/routes/pos/**`.

**Rule**: if a frontend feature needs data, add a function to `api.ts` (or extend one), and make the backend handler match its shape. Never inline raw `fetch` calls in components (the admin SPA migration to TanStack Query removed the last ones).

## 2. Generated types + OpenAPI

- `backend/openapi.json` — generated OpenAPI 3 document describing the API surface.
- `npm run gen:openapi` (in `backend/`) — regenerate it via `vite-node scripts/generate-openapi.js`.
- `npm run gen:types` (in `app/`) — regenerate `app/src/lib/api-types.ts` from `openapi.json` via `openapi-typescript`.

Live document: the Worker serves the schema at `/api/openapi.json`.

## 3. Auth model

Two distinct token worlds:

| World | Token | Header | Scope |
| --- | --- | --- | --- |
| Admin dashboard | JWT (`env.JWT_SECRET`) | `Authorization: Bearer <jwt>` | Admin/owner panel, RBAC hierarchy: `admin` > `staff` |
| POS terminal | `pos_token` (per organization) | `Authorization: Bearer <pos_token>` | POS routes: products, cart, orders, shifts |

- `env.JWT_SECRET` has **no fallback** — the Worker throws immediately if unset. Set it in `wrangler.toml` `[vars]` (dev) and as a secret (prod).
- Registration (`/api/auth/register`) + login issue JWTs; POS login issues `pos_token`s.
- Tenant resolution happens in middleware (`backend/src/middleware/tenant.js`); frontend zone resolution in `app/src/lib/routeZones.ts`.

## 4. Response envelope

Success responses are camelCased JSON (keys converted via `toCamel` in `backend/src/utils/response.js`):

```json
{ "id": 1, "campName": "Bedouin Star", "isActive": true }
```

Error responses use a stable envelope:

```json
{ "success": false, "error": "Human-readable message", "errors": [{ "field": "name", "message": "Required" }] }
```

- `errors` (Zod field errors) is appended only when present.
- Public reads are cached at the HTTP layer: `Cache-Control: public, max-age=300, stale-while-revalidate=600` (availability checks use 60s). This is header-level only — **no KV caching**, so it does not consume the free-plan KV write quota.

## 5. Key endpoint groups

| Group | Base path | Notes |
| --- | --- | --- |
| Auth | `/api/auth/*` | register, login, refresh, reset |
| Camps | `/api/camps*` | listing, detail, search; admin CRUD |
| Tenants | `/api/tenant/*`, `/api/tenants*` | branding, home data, settings |
| Categories / Meals | `/api/categories*`, `/api/meals*` | marketplace + tenant menu |
| Orders | `/api/orders*`, `/api/availability*` | booking orders, room availability |
| Admin | `/api/admin/*` | dashboard, reports, staff, settings |
| POS | `/api/pos/*` | login, products, cart, checkout, shift |
| System | `/api/openapi.json`, `/api/health` | schema + health |

Exact paths, methods, and payloads: see `backend/openapi.json` (source of truth) and the route registry in `backend/src/routes/registry.js`.

## 6. Contract rules (enforced by review)

1. All request/response field names **snake_case on the wire for requests**, camelCase in responses (`toCamel` handles the mapping; `toSnake` for incoming params).
2. Response helpers add the security headers (nosniff, X-Frame-Options DENY, HSTS, Referrer-Policy, Permissions-Policy, CSP) — do not bypass them.
3. Never set CORS headers in response helpers — `hono/cors` in `index.js` is the single source of truth.
4. Public endpoints must remain cache-safe; anything user-specific must use `private`/`no-store` semantics if caching is added.
5. Frontend components must render user data through `escHtml()` (in `app/src/lib/utils.ts`).

## 7. Auth status semantics — 401 vs 403

Single gate: `backend/src/middleware/requireAuth.js` (plus `resolveScope.js` on
project/tenant-context routes). Checks run in this order — signature →
token-type → realm → role → activity → tenant scope (`evaluate`, requireAuth.js) —
so the FIRST failure wins. Individual gates may override a message/status
per key; the codes below are the defaults.

**401 — authentication failed (who you are is unknown or stale):**

| Case | Message | Where |
| --- | --- | --- |
| No/broken `Authorization` header | `Missing or invalid Authorization header` | every gated route |
| Bad signature, expired session, or wrong token type (e.g. a `refresh` token on an access gate) | `Session expired or invalid signature` | every gated route (POS refresh gate overrides via `typeMismatch` → `Invalid token type`) |
| Account deactivated (`is_active` / `deleted_at` probe) | `Account deactivated` | every gated route, re-checked on each request |
| No tenant context to scope against | `Unauthorized: missing tenant context` | `resolveScope` routes (orders, camps, reservations, storefront, promotions, supply, upload, inbox, categories, POS barcode, stream-token, paymob webhook) |

**403 — authorization denied (identity is valid, access is not):**

| Case | Message | Affected endpoints |
| --- | --- | --- |
| Realm mismatch — POS token on an admin route (or admin token on a POS route); checked BEFORE the activity probe so it never surfaces as 401 | `Forbidden: POS sessions are not allowed to access admin routes` | all `realm: 'admin'` routes hit with a POS token; all `realm: 'pos'` routes (`/api/pos/*`) hit with an admin token; SSE `GET /api/stream/orders` rejects POS sessions and non-admin roles with 403 |
| Role not in the gate's allow-list (evaluated after realm, zero DB round-trips) | `Forbidden: Insufficient permissions` | role-gated routes: `super_admin`-only platform surface (`/api/admin/*`, platform settings), `/api/pos-users` gate (`super_admin`/`admin`), stream-credential mint (`admin`/`super_admin`) |
| Tenant scope denial — token `tenantId` claim differs from the route tenant, or a non-`super_admin` token carries a null/empty `tenantId` claim (`super_admin` is exempt) | `Forbidden: Access denied to this tenant partition` | all default `requireTenant: true` tenant routes; cross-tenant access (admin of tenant A calling tenant B) always lands here, never on data |
| Project scope mismatch | `Forbidden: project scope mismatch` | `resolveScope` routes called with a project context outside the caller's scope (orders, camps, reservations, …) |

Rule of thumb for clients: **401 → re-authenticate** (login/refresh); **403 → do not retry** with the same identity (wrong realm, role, tenant, or project — switch context or escalate to an authorized role).
