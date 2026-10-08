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
  - "app/src/lib/api.ts:150,1273,1558,2688 (the four deliberate raw fetches)"
  - "app/src/lib/api.ts:121-214"
  - "backend/src/routes/registry.js:1-3494 (128 createRoute calls)"
  - "backend/openapi.json (88 paths / 128 methods)"
  - "backend/src/index.js:164 (GET /healthz), :477 (GET /api/openapi.json)"
  - "backend/src/utils/response.js:11-87"
  - "backend/src/middleware/requireAuth.js:58-63,143-163,68-172"
  - "backend/src/middleware/resolveScope.js:83-131"
  - "backend/src/middleware/tenant.js:5"
  - "backend/src/api/auth.js:104-179"
  - "app/src/lib/rbac.ts:7-20"
  - "app/src/components/admin/AdminApp.tsx:146 (nav id 'staff', not a rank)"
  - "app/src/lib/utils.ts:3"
  - "endpoint: GET /api/openapi.json → backend/src/index.js:477"
verified: never
---

# SinaiCamps — API Contract

## 1. The contract lives in the client

The **single source of truth** for the frontend↔backend contract is `app/src/lib/api.ts` — a typed client with **287 exported functions and 60 exported types** over 2,838 lines (`grep -cE "^export (async )?function |^export const " app/src/lib/api.ts` → 287), covering every endpoint the frontend uses.

**The backend does *not* mirror it** (re-measured 2026-10-06). The OpenAPI definition layer in `backend/src/routes/registry.js` registers **128 method-pairs over 88 paths** — a *deliberately partial* layer covering auth, camps/products/rooms/rateplans, orders, meals, media, the POS core and the admin tenant/payout surface. Resolving every `Endpoint`+`Method` row of `API_SURFACE_MAP.md` against `backend/openapi.json` resolves **38 of 268** method-pairs over **29 of 183** distinct paths, and **15 top-level families have zero registry rows at all** — `admin` (30 map rows), `services` (21), `ai` (20), `storefront` (20), `crm` (17), `financials` (17), `hr` (15), `supply` (15), `tags` (7), `projects` (6), `marketplace` (5), `promotions` (5), `meta` (4), `settings` (2), `tenant` (1). Note `/api/projects*` is absent outright; the registry carries the sunset alias `/api/camps` instead.

`backend/openapi.json` is **not stale** and neither is the registry: parsing all `createRoute` calls in `routes/registry.js` yields exactly **128** method-pairs, and set-differencing against `openapi.json` gives **0 missing / 0 extra in both directions**. The artefact is a faithful render of a smaller definition layer — so the fix for a gap here is to **add a `createRoute` entry**, never to regenerate and never to trust the map's coverage column.

**Rule**: if a frontend feature needs data, add a function to `api.ts` (or extend one), and make the backend handler match its shape. Never inline raw `fetch` calls in components (the admin SPA migration to TanStack Query removed the last ones — `grep -rn "fetch('" app/src/components/admin app/src/components/pos` returns 0).

**Three `api.ts` functions bypass `apiFetch` with a raw `fetch`, on purpose** — do not "fix" them:

| Function | Line | Why it cannot go through `apiFetch` |
|---|---|---|
| `upload(file)` | `app/src/lib/api.ts:1273` | multipart `FormData`; `apiFetch` always sets `Content-Type: application/json`, which would destroy the multipart boundary |
| `exportAuditLog(params?)` | `app/src/lib/api.ts:1558` | the endpoint returns `text/csv`, which `apiFetch` would try to JSON-parse |
| `exportAdminPerformance(format)` | `app/src/lib/api.ts:2688` | `?format=` stream export (`csv`/`json`), same non-JSON reason |

A fourth deliberate raw `fetch` lives *inside* the fetch helper itself: `refreshAccessToken` (`app/src/lib/api.ts:150`) talks to `/api/auth/refresh` (and `/api/pos/auth/refresh`) directly, because routing the refresh through `apiFetch` would recurse on its own 401 path (`apiFetch`'s silent-retry is at `:207`/`:230`).

## 2. Generated types + OpenAPI

- `backend/openapi.json` — generated OpenAPI 3 document rendering the **88 paths / 128 methods** declared in `backend/src/routes/registry.js`. It is a *partial* view of the API, not the whole of it — see §1 for what it does and does not cover.
- `npm run gen:openapi` (in `backend/`) — regenerate it via `vite-node scripts/generate-openapi.js`.
- `npm run gen:types` (in `app/`) — regenerate `app/src/lib/api-types.ts` from `openapi.json` via `openapi-typescript`.

Live document: the Worker serves the schema at `/api/openapi.json`.

## 3. Auth model

Two distinct token worlds:

| World | Token | Header | Scope |
| --- | --- | --- | --- |
| Admin dashboard | JWT (`env.JWT_SECRET`) | `Authorization: Bearer <jwt>` | Admin/owner panel. RBAC ranks are `super_admin` 100 > `admin` 80 > `manager` 50 > `cashier` 30 — `ROLE_HIERARCHY` in `app/src/lib/rbac.ts:7-12`, mirrored verbatim by `ROLE_RANKS` in `backend/src/middleware/requireAuth.js:58-63`. **There is no `staff` rank** (`roleAtLeast()` treats any unknown role, including `undefined`, as failing); `staff` exists only as an admin nav-tab id in `AdminApp.tsx:146`, a UI grouping rather than a permission level |
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
| System | `/api/openapi.json`, `/healthz` | schema (Worker-served at `backend/src/index.js:477`) + health (`/healthz` at `:164`, DB connectivity + version). **There is no `/api/health`** — it appears in no route and in no `openapi.json` path |

Exact paths, methods, and payloads: `backend/src/routes/registry.js` is the **definition layer of record** (it self-describes as the contract's single source of truth at `:1`, and `openapi.json` is its faithful render — §1). `API_SURFACE_MAP.md` is the **coverage** record: it lists what the frontend reaches, which is a strict superset of what the registry declares. For an endpoint's live shape, read the handler in `backend/src/api/**` or `backend/src/routes/pos/**` — the registry may not mention it.

## 6. Contract rules (enforced by review)

1. All request/response field names **snake_case on the wire for requests**, camelCase in responses (`toCamel` handles the mapping; `toSnake` for incoming params).
2. Response helpers add the security headers (nosniff, X-Frame-Options DENY, HSTS, Referrer-Policy, Permissions-Policy, CSP) — do not bypass them.
3. Never set CORS headers in response helpers — `hono/cors` in `index.js` is the single source of truth.
4. Public endpoints must remain cache-safe; anything user-specific must use `private`/`no-store` semantics if caching is added.
5. Frontend components must render user data through `escHtml()` (in `app/src/lib/utils.ts`).

## 7. Auth status semantics — 401 vs 403

Single gate: `backend/src/middleware/requireAuth.js` (plus `resolveScope.js` on
project/tenant-context routes). Checks run in this order — signature → **null-tenant
hard guard** → token-type → realm → role → activity → tenant scope (`evaluate`,
`requireAuth.js:143`) — so the FIRST failure wins. Individual gates may override a
message/status per key; the codes below are the defaults.

The null-tenant guard (`:150-163`) is easy to miss because it is numbered `1b` in the
source: any token whose `role !== 'super_admin'` and whose `tenantId` claim is
null/empty is denied with `scopeDenied` (403) **before** the token-type check and with
zero DB round-trips. It is a hard guard, not a fallback — a legacy type-less token
that would otherwise pass `1.5` is rejected at `1b` first.

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
