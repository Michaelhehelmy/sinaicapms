# Backend Unification Audit — SinaiCamps API

> **Date**: 2026-08-22 · **Author**: tmp agent (`ox-alpha`)
> **Scope**: Full read of `backend/src` to determine how all routes can be unified into ONE coherent backend architecture (single dispatch pattern, single auth contract, single middleware chain).
> **Companion docs**: `backend/API_CONTRACT_AUDIT.md` (wire-contract audit), `app/FRONTEND_UNIFICATION_AUDIT.md` (frontend counterpart).
> **Sources read**: `src/index.js`, `src/api/{auth,admin,camps,orders,meals,leads,inbox,payments,tenants,pos-users,upload,reports,inventory,priceOverrides,others,meal-schedules}.js`, `src/routes/pos/index.js`, `src/middleware/{tenant,rateLimit,sharedAuth,auth}.js`, `src/services/emailService.js`, `src/durable/broadcaster.js`, `src/utils/{response,errors,pagination}.js`, `wrangler.toml`.

---

## 0. Executive Summary

The backend is **already one Worker** (`campmaster-backend`) — the 2026-07-10 "Backend Merge" collapsed the separate POS worker into this one Hono app. What is *not* unified is everything above the socket:

1. **Two routing paradigms coexist** — explicit Hono routes for auth/payments/admin/POS vs a manual catch-all dispatcher (`app.all('/api/*')`, `index.js:316`) that re-implements routing as an 18-branch `if (path.startsWith(...))` chain feeding handlers that parse URL segments by hand.
2. **One shared auth middleware exists but is never used.** `sharedAuth.authMiddleware` implements ~80% of the required gate, yet every mounted route hand-inlines its own JWT check — **9 near-identical inline gate blocks** across `index.js` plus handler-level re-verification in `admin.js`, `tenants.js`, and `pos-users.js` (the last parses the *same token twice per request*).
3. **Admin JWT and POS JWT already share secret, algorithm, sign/verify code** — they differ only in payload profile and identity table. Realm separation is enforced in both directions via the `posType: 'pos'` discriminator.
4. Concrete defects found during the read: two routes with **no rate limiting** (`meal-schedules`, `pos-users`), an **ordering quirk** where POS tokens get `401 Account deactivated` instead of the intended `403` on catch-all paths, a dead `tenantMiddleware`, a byte-identical duplicate payment endpoint (`create-checkout`), and an email function (`sendBookingConfirmationEmail`) that is tested but never called.

Unification = converging on ONE pattern (POS-style Hono sub-routers + a parameterized `requireAuth` factory), not moving code between servers. A 6-phase strangler plan follows; each phase is independently shippable.

---

## 1. Current Architecture Analysis

### 1.1 The single-Worker reality

```
Cloudflare Worker "campmaster-backend" (backend/wrangler.toml)
├── Bindings: DB (D1 campmaster-db) · KV_CACHE (bound, NEVER written)
│             RATE_LIMIT_KV (disabled via RATE_LIMIT_KV_ENABLED="false")
│             MEDIA_BUCKET (R2 campmaster-media) · BROADCASTER (Durable Object)
├── Routes:   sinaicamps.com/api/* and *.sinaicamps.com/api/*
└── Entry:    src/index.js (Hono app, exports Broadcaster DO class for wrangler)
```

Layer contract (per AGENTS.md): Frontend → `/api/*` (this Worker) → D1/KV/R2/DO. The frontend never touches storage directly. CORS is set **only** by `hono/cors` in `index.js:76-94` (dynamic origin allowlist: static list + precompiled wildcard regexes + custom domains queried from D1 with a 5-minute in-isolate cache).

### 1.2 Two dispatch paradigms

**Paradigm A — explicit Hono routes** (used by ~half the surface):

| Mount | Style |
| --- | --- |
| `/api/pos` | True Hono sub-router (`routes/pos/index.js`) with its own `posAuth` middleware via `pos.use('/*', posAuth)` |
| `/api/auth/*`, `/api/admin*`, `/api/tenants*`, `/api/payments*`, `/api/contact`, `/api/leads`, `/api/meal-schedules*`, `/api/pos-users*`, `/api/stream/orders` | Single wildcard `app.all(...)` delegating to a legacy handler function that re-parses `url.pathname.split('/')` internally |

**Paradigm B — manual catch-all dispatcher** (`index.js:316-399`): rate-limits at 100/min, checks a hard-coded public-path allowlist, resolves tenant, inlines a JWT gate (with an extra `admins.is_active` DB check), then dispatches through an ordered if-chain of path prefixes to 18 handler functions (`camps`, `products`, `rooms`, `rateplans`, `price-overrides`, `orders`, `availability`, `meals`, `meal-categories`, `categories`, `plans`, `leads`/`contact`, `inbox`, `upload`, `media`, `reports`, `inventory`, `me`).

Consequences: mounting order is load-bearing (explicit routes shadow the catch-all), auth logic exists in ~10 variants, and adding a route requires touching up to four places (mount, allowlist, if-chain, registry.js OpenAPI doc).

### 1.3 Module inventory & responsibilities

| Module | Responsibility | Notes / smells |
| --- | --- | --- |
| `src/index.js` (414 L) | CORS, per-prefix rate limits, route mounting, SSE proxy, Broadcaster DO export, catch-all dispatcher | Contains **9 inline copy-pasted auth gates** (§4.3) |
| `src/api/auth.js` | Admin login/refresh/logout/me/register/forgot/reset/change-password against `admins`; Zod schemas; ad-hoc forgot-password limiter | Re-exports `verifyJWT = verifyToken`; imports from `sharedAuth` (good) but keeps its own `getJwtSecret` duplicate |
| `src/api/admin.js` | Super-admin: stats, tenants CRUD + bulk suspend/activate/delete, admins CRUD | Self-gates (super_admin + `is_active`); tenant cascade-delete misses `meal_schedules`, `meal_lang`, `inbox_reads`, `price_overrides`, `pos_users`, `leads`, `customers` |
| `src/api/camps.js` | Camps / products / rooms / rate-plans CRUD; marketplace cross-tenant reads; FK-mirror helper `ensureProductInProductsTable` | One-camp-per-tenant guard (409); product creation resolves `organization_id` via `tenant_org_mapping` with fallback `1` |
| `src/api/orders.js` | Orders CRUD, `calculate-price`, public status lookup, bulk-delete, PATCH status, `handleAvailability`; customer upsert; overlap validation; **`broadcastNewBooking`** SSE producer | Public POST `/api/orders` is the booking funnel — must stay unauthenticated |
| `src/api/meals.js` | Meals CRUD incl. `meal_lang` UPSERT (M2 ownership checks) | — |
| `src/api/leads.js` | Public POST lead/contact + authenticated list/update/delete; **`broadcastNewLead`** producer | Tenant optional on create (public form may have no context) |
| `src/api/inbox.js` | Unified leads+bookings feed (UNION ALL of two arms), unread totals, PATCH read (leads column vs `inbox_reads` side table), DELETE lead-only | Auth delegated entirely to the catch-all gate |
| `src/api/payments.js` | Mock Stripe: create-intent, confirm, webhook (secret-header auth) | `create-checkout` is a **byte-for-byte alias** of create-intent with zero callers |
| `src/api/tenants.js` | Public tenant directory/detail (super-admin elevation adds private fields), POST create tenant (+ default admin), `handleMe` GET/PUT | Soft-detects super_admin per request (optional-auth pattern unique to this module) |
| `src/api/pos-users.js` | Staff management CRUD over `pos_users` (admin realm); `scopeTenant()` (?tenantId override for super_admin); **`ensureTenantOrg()`** auto-provisioning org/store/mapping | Re-verifies the JWT the wrapper already verified (double parse); no rate limit |
| `src/api/upload.js` | R2 upload (multipart or octet-stream, 8 MB, ext allowlist, key embeds tenantId) + public sanitized media stream | Auth comes from the catch-all gate |
| `src/api/reports.js` | Read-only occupancy/revenue reports | GET-only, guarded by catch-all |
| `src/api/inventory.js` | Low-stock report (org-scoped via mapping) | Returns `{ items }` envelope while every other list uses `{ data }` |
| `src/api/priceOverrides.js` | Per-night price overrides CRUD | **GET is not public** (unlike other catalog reads) |
| `src/api/others.js` | `plans_new` CRUD | Name gives zero hints — candidate for rename under unification |
| `src/api/meal-schedules.js` | Meal schedule CRUD | No internal auth (wrapper gate only); no rate limit |
| `src/routes/pos/index.js` (748 L) | POS sub-app: login, products, orders (idempotency, split payments, recipe stock deduction w/ batch commit + race compensation), dashboard (timezone/DST-correct day bounds), shifts open/close/active | The **model citizen**: real router + middleware. Owns `posAuth`. Dual-column scoping (`organization_id` INTEGER for catalog, `tenant_id` TEXT for transactions/shifts) |
| `src/middleware/tenant.js` | `getTenant(request, env)` — query `?tenant_id` → `x-tenant-id` header → hostname (www-stripped; localhost→null); exact match id/subdomain/custom_domain | `tenantMiddleware` exported but **never mounted anywhere** (dead) |
| `src/middleware/rateLimit.js` | KV-backed limiter keyed `${ip}:${path}:${window}`, fail-closed; in-memory fallback; `ENVIRONMENT==='test'' bypass | Currently forced in-memory (`RATE_LIMIT_KV_ENABLED="false"`) due to free-plan KV write quota |
| `src/middleware/sharedAuth.js` | **Single source of truth**: `generateToken`/`verifyToken`/`extractToken`, bcrypt(+legacy `$sha256$`+auto-rehash) password helpers, `getUserById` (admins), `authMiddleware` Hono gate, role hierarchy | `authMiddleware` implements most of the gate but is **never mounted**; hierarchy omits POS roles |
| `src/middleware/auth.js` | Pure re-export shim of sharedAuth | Delete after importers are updated |
| `src/services/emailService.js` | `sendEmail` (Resend if key else console log), `sendPasswordResetEmail` (used by auth.js), `sendBookingConfirmationEmail` (**zero production call sites** — wired nowhere, unit-tested anyway) | — |
| `src/durable/broadcaster.js` | `Broadcaster` DO: per-tenant SSE hub (`/connect` stream + `/broadcast` fan-out), 25 s heartbeat kept alive via `ctx.waitUntil`, max 100 conns/tenant (evict oldest), sets **no** CORS headers | Lives in `durable/`, not `services/` |
| `src/utils/response.js` | `toCamel`/`toSnake`, `jsonResponse` (camelCase choke point + security headers, **no CORS**), `cachedJsonResponse` (public reads, 300 s default / 60 s availability), `errorResponse` envelope | — |
| `src/utils/errors.js` | Structured Zod 400s: `{ success:false, error, errors:[{field,message}] }`, camelCase field paths, locked `"Required"`/`"Invalid enum"` fragments (tests assert them verbatim) | — |
| `src/utils/pagination.js` | `parsePagination` / `paginationEnvelope` (`{ data, total, page, pageSize, hasMore }`) | inventory's low-stock deviates with `items` |
| `src/routes/registry.js` | OpenAPI source of truth → served at `/api/openapi.json`; SSE excluded by design | Must be regenerated after any mount change |

---

## 2. Route Inventory

Legend — **Auth**: `none` = public · `A-JWT` = admin-realm Bearer JWT (from `admins`) · `P-JWT` = POS-realm Bearer JWT (from `pos_users`) · `SA` = super_admin role enforced · **Scope**: how the tenant boundary is drawn.
RL = effective rate limit (requests/min unless noted). "—" = none applied (gap).

### 2.1 Explicitly mounted (before the catch-all)

| # | Endpoint | Method(s) | RL | Auth | Scope / notes |
| -- | --- | --- | -- | --- | --- |
| 1 | `/` | GET | — | none | HTML status page |
| 2 | `/api/auth/login` | POST | 30 | none | Optional body `tenantId` resolved id/subdomain/custom_domain; super_admin = `tenant_id IS NULL`; bcrypt verify + `$sha256$` auto-rehash; issues access+refresh |
| 3 | `/api/auth/refresh` | POST | 30 | refresh JWT (`type==='refresh'` only) | Stateless silent refresh: new access **and** refresh; rejects access & POS tokens via type check |
| 4 | `/api/auth/logout` | POST | 30 | none | No-op success (stateless design) |
| 5 | `/api/auth/me` | GET | 30 | A-JWT | Identity from `admins.tenant_id`; active check |
| 6 | `/api/auth/register` | POST | 30 | none | Creates `is_active=0` admin (pending approval); tenant required |
| 7 | `/api/auth/forgot-password` | POST | 30 **+ ad-hoc 5/15 min/IP** | none | Second limiter is a private in-memory Map inside auth.js (duplicate of rateLimit.js concept); reset tokens in `password_reset_tokens` (max 5 live/user); email via emailService |
| 8 | `/api/auth/reset-password` | POST | 30 | reset token (DB) | Single-use, 1 h expiry |
| 9 | `/api/auth/change-password` | POST | 30 | A-JWT | Self-service |
| 10 | `/api/tenants` | POST | **5 / 5 min** | SA (+active) | Creates tenant + default admin (`admin_password` mandatory) |
| 11 | `/api/tenants` | GET | 60 | none (SA elevates) | Directory excludes root `marketplace` row; SA sees private fields + admin join |
| 12 | `/api/tenants/:key` | GET | 60 | none (SA elevates) | Lookup by id/subdomain/custom_domain, `www.` normalized |
| 13 | `/api/admin/stats` | GET | 20 | SA +active | Cross-tenant aggregates |
| 14 | `/api/admin/tenants` | GET | 20 | SA | Paginated directory (excl. marketplace) |
| 15 | `/api/admin/tenants/:id` | PUT/PATCH | 20 | SA | Incl. tenant-admin account upsert |
| 16 | `/api/admin/tenants/:id` | DELETE | 20 | SA | Cascade delete — **incomplete** (see §1.3 admin row) |
| 17 | `/api/admin/tenants/bulk/:action` | POST | 20 | SA | `suspend` / `activate` / `delete` |
| 18 | `/api/admin/admins` | GET/POST | 20 | SA | Cross-tenant admin accounts; POST refuses to overwrite `super_admin`s |
| 19 | `/api/admin/admins/:id` | DELETE, PUT/PATCH | 20 | SA | Cannot modify/delete `super_admin` |
| 20 | `/api/payments/create-intent` | POST | 20 | A-JWT, POS rejected, partition check | Tenant from `getTenant` → **404 when missing** (vs 401 elsewhere) |
| 21 | `/api/payments/create-checkout` | POST | 20 | identical | Dead alias of #20 |
| 22 | `/api/payments/confirm` | POST | 20 | same as #20 | Marks order paid |
| 23 | `/api/payments/webhook` | POST | 20 (prefix only, deliberate S-C2) | `x-webhook-secret` header | Order updated under its **own** tenant_id |
| 24 | `/api/pos/auth/login` | POST | 15 | none | identifier = email OR username vs `pos_users` (`deleted_at IS NULL`); org→tenant via `tenant_org_mapping`; returns taxRate from `pos_organizations`; issues **access token only** |
| 25 | `/api/pos/products` | GET | 60 | P-JWT (`posType==='pos'` + active/not-deleted) | `organization_id` scoped |
| 26 | `/api/pos/orders` | POST | 60 | P-JWT | Idempotency-key dedupe; split-payment sum validation (±$0.01); recipe ingredient deduction with atomic conditional updates + post-batch compensation; writes `pos_transactions`/`items` (`tenant_id` TEXT) |
| 27 | `/api/pos/orders` | GET | 60 | P-JWT | Latest 100, `tenant_id` scoped |
| 28 | `/api/pos/orders/:id` | GET | 60 | P-JWT | With items |
| 29 | `/api/pos/dashboard` | GET | 60 | P-JWT | Org-timezone DST-correct day boundaries, fallback UTC day |
| 30 | `/api/pos/shifts/active` | GET | 60 | P-JWT | Per cashier |
| 31 | `/api/pos/shifts/open` | POST | 60 | P-JWT | Blocks double-open |
| 32 | `/api/pos/shifts/close` | POST | 60 | P-JWT | Expected cash = opening + Σ cash sales since opening |
| 33 | `/api/contact` | POST | 10 | none | Optional tenant; fires `new-lead` SSE |
| 34 | `/api/leads` | POST | 10 | none | Same handler as #33 |
| 35 | `/api/meal-schedules` (+`/*`) | ALL | **— (gap)** | A-JWT inline, POS rejected, partition | Wrapper-gated only |
| 36 | `/api/pos-users` (+`/*`) | ALL | **— (gap)** | A-JWT inline ×2 (!), roles `admin`/`super_admin`, POS rejected | `scopeTenant()`: SA may pass `?tenantId=`; admin hard-scoped; auto-provisions POS org |
| 37 | `/api/stream/orders` | GET | **— (gap)** | A-JWT from header **or** `?token=` (EventSource), roles admin/super_admin | Requires `?tenantId=`; proxies to BROADCASTER DO `/connect`; long-lived SSE passthrough |
| 38 | `/api/openapi.json` | GET | — | none | Static doc from registry |

### 2.2 Catch-all dispatched (`app.all('/api/*')`, RL 100)

Public allowlist (no auth):

| # | Endpoint | Method | Scope / notes |
| -- | --- | --- | --- |
| 39 | `/api/me` | GET | Tenant branding; graceful `{id:null}` without context; `has_meals` computed |
| 40 | `/api/availability*` | GET | Room availability NOT EXISTS query; cached 60 s |
| 41 | `/api/camps*` | GET | Marketplace host ⇒ cross-tenant listing (`GROUP BY tenant_id`) |
| 42 | `/api/products*` | GET | Reads unified `pos_products` (`deleted_at IS NULL`); image fallback from `images` JSON |
| 43 | `/api/rooms*` | GET | Via camps join |
| 44 | `/api/rateplans*` | GET | — |
| 45 | `/api/meals*` | GET | `meal_lang` en joins |
| 46 | `/api/categories*` | GET | — |
| 47 | `/api/meal-categories*` | GET | — |
| 48 | `/api/orders` | **POST** | PUBLIC booking funnel: capacity + overlap validation, customer upsert, reference generation, `new-booking` SSE |
| 49 | `/api/orders/status/:ref` | GET | Public status by reference code |
| 50 | `/api/orders/calculate-price` | GET | Precedence: override > rate-plan > base price |
| 51 | `/api/media/*` | GET | Public R2 stream; strict key sanitizer; immutable cache |

Authenticated remainder (A-JWT + `admins.is_active` + tenant partition):

| # | Endpoint | Methods | Notes |
| -- | --- | --- | --- |
| 52 | `/api/camps*`, `/api/products*`, `/api/rooms*`, `/api/rateplans*` | POST/PUT/DELETE | One-camp-per-tenant 409; conditional INSERTs enforce ownership; FK mirror for `products` table |
| 53 | `/api/price-overrides*` | ALL | **GET gated too** (inconsistent with sibling catalogs) |
| 54 | `/api/orders*` (rest) | GET/PUT/PATCH/DELETE | List paginated envelope; PATCH status-only; bulk-delete restores room status batch-wise |
| 55 | `/api/meals*`, `/api/categories*`, `/api/meal-categories*` | non-GET | Ownership-checked mutations |
| 56 | `/api/plans*` | ALL | `plans_new` CRUD |
| 57 | `/api/leads` (+`/contact`) | GET/PUT/DELETE | POST is public (also mounted explicitly at #33/34) |
| 58 | `/api/inbox*` | GET/PATCH/DELETE | Unified feed; lead-only delete |
| 59 | `/api/upload` | POST | Multipart/octet → R2 `media/{tenantId}/{uuid}.{ext}`, ≤8 MB, image ext allowlist |
| 60 | `/api/reports/:type` | GET | occupancy / revenue |
| 61 | `/api/inventory/low-stock` | GET | Empty page when tenant has no POS org |

**Catch-all ordering quirk (defect):** at `index.js:353-359` the `admins.is_active` lookup runs **before** the `posType === 'pos'` rejection. A POS token hitting any protected catch-all route therefore gets `401 "Account deactivated"` (its integer `pos_users.id` matches nothing in `admins`) instead of the correct `403` returned by explicitly-mounted gates. Unification should make realm-rejection precede the active-check everywhere.

---

## 3. Auth System Analysis

### 3.1 The two realms side by side

| Property | Admin realm | POS realm |
| --- | --- | --- |
| Login endpoint | `POST /api/auth/login` | `POST /api/pos/auth/login` |
| Identity table | `admins` (TEXT ids `adm_*`) | `pos_users` (INTEGER PK; token carries `String(id)`) |
| Identifier | email | email OR username |
| Secret / algorithm | `env.JWT_SECRET`, HS256 (`@tsndr/cloudflare-worker-jwt`) | **identical** |
| Sign/verify functions | `sharedAuth.generateToken` / `verifyToken` | **identical** |
| Token claims | `sub`, `userId`, `tenantId` (NULL ⇒ super_admin), `email`, `role` (`super_admin`\|`admin`), `type` (`access`\|`refresh`) | `sub`/`userId`, `tenantId` (via `tenant_org_mapping`, fallback `String(organization_id)`), `organizationId` (INTEGER), `storeId`, `role` (`cashier`\|`manager`\|`admin`…), `posType:'pos'`, implicit `type:'access'` |
| TTL | 24 h access / 7 d refresh | 24 h access, **no refresh token** (terminals hard-re-login daily) |
| Refresh flow | `/api/auth/refresh`, stateless silent rotation | none |
| Session revocation | `admins.is_active` re-checked on every gate + refresh | `pos_users.is_active AND deleted_at IS NULL` re-checked in `posAuth` |
| Password hashing | bcrypt cost 12; legacy `$sha256$` auto-upgrades on login (`rehashIfNeeded` targets **admins table only**) | Same bcrypt helpers; **no legacy-hash upgrade path for pos_users** |
| Email claim in token | yes | **no** |
| Registration | self-serve → inactive until approved | provisioned by admins via `/api/pos-users` |

### 3.2 Realm separation (both directions, already sound)

- Admin gates reject POS tokens: `decoded.posType === 'pos'` → `403` (present at every admin gate).
- POS `posAuth` requires `decoded.posType !== 'pos'` fail → `401 "Invalid POS session"`; a stolen admin token is useless at `/api/pos/*`.
- The frontend mirrors this with the load-bearing `/pos/` prefix switch inside `apiFetch` (documented in both prior audits).

Because both realms already share secret + algorithm + minting code, the token formats differ **only** in payload profile. There is exactly one discriminator today (`posType`), and it works.

### 3.3 Where the gates actually live (duplication census)

Inline gate blocks in `index.js`: payments ×3 (`:123-136`, `:138-151`, `:153-166`), meal-schedules ×2 (`:192-209`, `:210-227`), pos-users ×2 (`:230-243`, `:244-257`), stream/orders ×1 (`:277-294`, header-or-query variant), catch-all ×1 (`:340-365`). Handler-level gates: `admin.js:55-68`, `tenants.js:74-87` (soft detection), `pos-users.js:134-148` (**re-parses the same token the wrapper just verified**). Total ≈ **13 sites**, at least 5 distinct textual variants.

Meanwhile `sharedAuth.authMiddleware:182-220` verifies the JWT, requires a role claim, rejects POS tokens, loads the user and checks `is_active` — i.e., it covers ~80% of the gate — but it lacks tenant-partition enforcement and **zero mounted routes use it**. It is exported, re-exported by `middleware/auth.js`, and ignored.

---

## 4. Middleware Analysis

### 4.1 Tenant resolution (`middleware/tenant.js`)

- `getTenant(request, env)`: precedence `?tenant_id` → `x-tenant-id` header → hostname (www stripped; localhost/127.x → null); exact match on `tenants.id/subdomain/custom_domain`.
- Used correctly by index.js, but as a **function call inside each gate**, not middleware. `tenantMiddleware` (`:33-39`) is dead code.
- Special case living in handlers, not middleware: `isMarketplaceTenant()` (`camps.js:98`) turns marketplace-host requests into cross-tenant **read-only** catalog queries. Any request-supplied tenant hint is trusted for *reads* here — safe only because these paths are public catalog data.

### 4.2 Rate limiting (`middleware/rateLimit.js`)

- KV-backed distributed limiter, key `${cf-connecting-ip}:${path}:${windowIndex}`; **fail-closed** (KV error ⇒ 429); in-memory per-isolate fallback; whole thing bypassed when `ENVIRONMENT==='test'`; currently forced into fallback mode by `RATE_LIMIT_KV_ENABLED="false"` (free plan = 1,000 KV writes/day — a write per request caused a full API outage historically).
- Effective policy matrix: see §2 RL column. **Gaps:** `/api/meal-schedules*` and `/api/pos-users*` are registered before the catch-all, so its 100/min limiter never sees them; `/api/stream/orders` has none either.
- One-off duplicate: the forgot-password Map limiter inside `auth.js:56-75` re-implements the concept with different semantics (keyed `fp:${ip}`, survives across routes because it's module-global).

### 4.3 Shared vs unique — summary

| Concern | Shared today | Unique / duplicated |
| --- | --- | --- |
| Token sign/verify | `sharedAuth` (both realms) | — |
| Password hashing | `sharedAuth` (both realms) | Legacy-hash upgrade only wired for admins |
| Bearer extraction/parsing | `extractToken` exists | Hand-rolled at ~13 sites anyway |
| Active-user check | `getUserById` (admins) / inline SQL (pos_users) | Two different tables + predicates; catch-all variant has wrong ordering (§2 quirk) |
| Role model | `ROLE_HIERARCHY` {super_admin:10, admin:4} | POS roles absent; `hasRolePermission` unused by gates |
| Tenant scoping | `getTenant` | Partition check inlined per site; `scopeTenant()` generalization only exists in pos-users.js |
| Rate limiting | one factory | Ad-hoc forgot-password Map; two unprotected prefixes |
| Response/validation | `utils/response.js`, `utils/errors.js` | Consistent — keep as-is |

---

## 5. Service Layer Analysis

### 5.1 `emailService.js`

| Function | Production callers | Status |
| --- | --- | --- |
| `sendEmail` | via wrappers | Core transport: Resend API when `RESEND_API_KEY` set, else console log (non-prod logs always) |
| `sendPasswordResetEmail` | `auth.js:386` | Live |
| `sendBookingConfirmationEmail` | **none** | Tested (`email-service.test.js`) but never invoked — obvious candidate to wire into `POST /api/orders` / payment confirm during unification |

Realm-neutral: takes `env`, no tenant coupling beyond recipient. Fully shareable as-is.

### 5.2 `Broadcaster` Durable Object (`src/durable/broadcaster.js` — *not* services/)

- One instance per tenant (`BROADCASTER.idFromName(tenantId)`); in-memory channel registry; `GET /connect` emits `{"type":"connected"}` + 25 s ping comments (interval pinned alive via `state.ctx.waitUntil`); `POST /broadcast` fans out JSON events; caps 100 connections/tenant (oldest evicted); deliberately sets **no** CORS headers.
- Producers (fire-and-forget, never fail the request): `broadcastNewBooking` (orders.js:50), `broadcastNewLead` (leads.js:39).
- Consumer: `GET /api/stream/orders` — admin realm only, forwards to `/connect`.
- **Shared infrastructure, single-realm consumption today**: POS transactions emit no events. Unification opportunity: emit `new-pos-sale` from `POST /api/pos/orders` through the same helper so admin dashboards get live POS activity.

### 5.3 Shared-vs-unique verdict

Both services are already realm-agnostic and belong in the minimal shared kernel (§6 Phase 1). The only gaps are wiring gaps (booking email unused; POS events missing), not architectural ones.

---

## 6. Unification Plan

Target state: **one dispatch style** (explicit Hono routers, like POS), **one parameterized auth middleware**, **one rate-limit policy table**, **one scope resolver**. Strangler approach — every phase ships green tests independently.

### Phase 0 — Baseline & hygiene (no behavior change)
1. Capture baselines: `cd backend && npx vitest run` (~1082/36), root suite (169/10), `app` suite (1469/74), E2E count (552 passing / 14 env-skipped).
2. Delete dead code: `tenantMiddleware`, `POST /api/payments/create-checkout` (verified alias, zero callers), `middleware/auth.js` shim *after* importers migrate.
3. Decide fate of `sendBookingConfirmationEmail` (wire into order confirm, or delete with its tests).

### Phase 1 — One auth gate (`requireAuth` factory) ← highest value, lowest risk
1. Create `src/middleware/requireAuth.js`:
   ```js
   requireAuth({ realm: 'admin'|'pos', roles?: string[], requireTenant?: boolean,
                 allowQueryToken?: boolean })
   ```
   Behavior: `extractToken` → `verifyToken` → **realm policy first** (fixes the §2 ordering quirk) → load active identity from the realm's table (`admins.is_active` vs `pos_users.is_active AND deleted_at IS NULL`) → role check via extended hierarchy (add cashier/manager levels) → tenant partition: `decoded.role !== 'super_admin' && decoded.tenantId !== tenantId ⇒ 403`; `c.set('user'|'posUser')`, `c.set('tenantId')`.
2. Replace all 13 duplication sites (§3.3) with the factory. Keep **every status code and message string byte-identical** (root/backend tests assert verbatim fragments like `"Required"`, `"Invalid enum"`, `"Account deactivated"`).
3. Keep `sharedAuth` as the only place token/password primitives live; delete `auth.js`'s duplicate `getJwtSecret`.

### Phase 2 — Convert Paradigm-B handlers to Hono sub-routers (strangler, one module at a time)
1. For each `src/api/*.js` handler, build a sibling router (pattern proven by `routes/pos/index.js`): declare public vs protected per-route (`router.get('/camps', publicHandler)` vs `router.post('/camps', requireAuth({...}), handler)`), replacing the public-path allowlist array.
2. Mount explicitly in index.js; delete the corresponding catch-all branch. Mind Hono specificity: register `/orders/status/:ref` and `/orders/calculate-price` before `/orders/:id`; wildcards must be `/*` syntax (logbook gotcha).
3. The catch-all shrinks branch-by-branch until it is just `404`. `/api/upload` and `/api/media` move last (media streaming must remain a bare passthrough).
4. Rename `others.js` → `plans.js` opportunistically.

### Phase 3 — Token contract v2 (realm-tagged)
1. Mint tokens as `{ ..., realm: 'admin'|'pos', ...profile }`; **continue honoring `posType`** for the transition window (verifiers accept either; issuer emits both fields).
2. Add POS refresh tokens using the existing `/api/auth/refresh` flow made realm-aware (reload `pos_users`, respect `deleted_at`); terminals opt in gradually — old 24-h-only tokens stay valid.
3. Extend `rehashIfNeeded` (or add `rehashPosUserIfNeeded`) so legacy hashes upgrade in the POS realm too.
4. Merge role hierarchies into one map: super_admin(10) > admin(6) > manager(4) > cashier(2), with realm-scoped route requirements.

### Phase 4 — Rate-limit normalization
1. Replace scattered `app.use(prefix, rateLimit(...))` calls with one declarative policy table consumed at mount time; close the §2 gaps (meal-schedules ≈ 60/min, pos-users ≈ 30/min, stream/orders: leave unlimited but cap concurrent DO connections instead — already capped at 100/tenant).
2. Port the forgot-password limiter onto the shared factory (keep 5/15 min semantics; document that keys differ from the generic limiter).
3. Constraint: do **not** introduce new KV writes (free-plan quota). Enabling distributed mode later must be a config flip only (`RATE_LIMIT_KV_ENABLED`).

### Phase 5 — Scope resolution formalization
1. Extract `resolveScope(c, decoded)` generalizing `pos-users.scopeTenant()`: super_admin ⇒ `?tenantId` override else cross-tenant; admin ⇒ hard-scope to decoded tenant; POS ⇒ ignore request hints entirely, trust token's `(tenantId, organizationId)` pair.
2. Move `ensureTenantOrg` + organization resolution into `src/services/orgService.js` (currently duplicated between pos-users.js and camps.js product creation with divergent fallbacks: provisioning vs silent `1`).
3. Codify marketplace rule: request-resolved `marketplace` grants **cross-tenant READS ONLY** on catalog endpoints; never on mutations, never for POS.

### Phase 6 — Contract alignment & cleanup
1. Update `routes/registry.js` for every moved route; run `npm run gen:openapi`; in `app` run `npm run gen:types`; reconcile `api-types.ts` consumers.
2. Fix known contract drift while touching files (each behind its own test update): payments 404-vs-401 on missing tenant; `priceOverrides` GET gating; inventory `items` vs `data` pagination key; incomplete tenant cascade-delete.
3. Emit `new-pos-sale` SSE from POS checkout via a shared `broadcastEvent(env, tenantId, event)` helper.
4. Update AGENTS.md / AGENT_LOGBOOK.md persistent learnings.

---

## 7. Risk Assessment

| # | Risk | Likelihood | Impact | Mitigation |
| -- | --- | --- | --- | --- |
| 1 | **Route shadowing/order regressions** when leaving the catch-all (e.g. `/orders/status/:ref` swallowed by `/orders/:id`) | High | High | Convert one module per PR; E2E + integration suites per merge; explicit route-order unit test asserting resolution of ambiguous paths |
| 2 | **Verbatim wire contracts break** — tests assert exact messages/statuses ("Account deactivated", "Tenant not found", Zod `"Required"`/`"Invalid enum"` fragments) | High | Medium | Byte-compat mandate in Phases 1–2; grep-driven message inventory before edits; run root + backend + app suites together (logbook lesson) |
| 3 | **Fixing the 401-vs-403 ordering quirk changes observable behavior** (some test or client may depend on the accidental 401) | Medium | Low | Change deliberately with a changelog entry; align on explicit-route behavior (403) which is what every other gate already does |
| 4 | **Marketplace cross-tenant reads regress** into tenant-scoped empty lists | Medium | High | Dedicated regression specs hitting `/api/camps` etc. with marketplace context before/after |
| 5 | **Dual-column scoping mistakes** (`organization_id` INTEGER vs `tenant_id` TEXT) when centralizing POS scoping | Medium | High | Never blanket-replace; keep the pair atomic in `resolveScope`; logbook gotcha is explicit |
| 6 | **SSE breaks** if wrapped by buffering/response-modifying middleware | Medium | High | `/api/stream/*` stays outside any response-transforming layer; heartbeat/E2E spec as guard |
| 7 | **Stripe webhook corrupted** by case-normalization or auth wrapping | Low | High | Webhook keeps raw-body handling + secret-header auth; add a test forbidding `toSnake` on that path |
| 8 | **Rate-limit behavior shifts** (test bypass, fail-closed semantics, in-memory mode) | Medium | Medium | Preserve `ENVIRONMENT==='test'` bypass and fail-closed; policy table only remaps limits, not mechanics |
| 9 | **KV write-quota regression** if someone "fixes" rate limiting by enabling KV | Medium | High | Document constraint in wrangler.toml comment + plan; CI check greps for `RATE_LIMIT_KV_ENABLED="true"` |
| 10 | **Import cycles / orphaned re-exports** when moving `verifyJWT` out of api/auth.js (admin.js, tenants.js import it today) | Medium | Low | Point all importers at `sharedAuth` first (Phase 1), delete aliases last; `node --check` + full vitest |
| 11 | **In-flight tokens lack the new `realm` claim** during deploy window | Certain | Low | Verifiers accept `posType` XOR `realm`; no forced logout; remove acceptance only in a later release |
| 12 | **Frontend contract drift** (100+ functions in `app/src/lib/api.ts`, generated types, TanStack hooks, POS direct calls) | Medium | High | No URL changes in Phases 0–2 by design; Phase 3–6 regenerate types and coordinate with the frontend unification plan |
| 13 | **Mock-based unit tests assert positional `prepare()` calls**; removing the double-verification in pos-users shifts call indexes | High | Medium | Expect mechanical test churn in `pos-users`/`admin` suites; update mocks alongside (documented lesson from C2/C3 work) |
| 14 | **JWT_SECRET absence** throws mid-request (no fallback by design) | Low | Medium | Keep behavior; ensure new middleware surfaces the same failure mode rather than swallowing |

---

## 8. Answers to the Key Questions

**Q1 — Can POS auth and Admin auth share the same JWT structure?**
Yes, and they effectively already do: same secret (`env.JWT_SECRET`), same HS256 algorithm, same `generateToken`/`verifyToken` from `sharedAuth`. The differences are payload profile only (identity table, `email` presence, org/store claims, refresh support) plus one discriminator (`posType`). Formalize as a discriminated union — add `realm: 'admin'|'pos'`, keep accepting `posType` during transition, extend the role hierarchy to cover cashier/manager. Nothing about the signature scheme needs to change, so no mass logout is required.

**Q2 — Can POS routes and Admin routes share the same middleware?**
Yes, once the two genuinely realm-specific steps are parameterized: (a) **identity loading** — `admins WHERE id=? AND is_active=1` vs `pos_users WHERE id=? AND is_active=1 AND deleted_at IS NULL`; (b) **scope key** — tenant partition vs `(tenantId, organizationId)` pair. A single `requireAuth({ realm, roles, requireTenant })` factory replaces `authMiddleware`, `posAuth`, and all 13 inline sites; `posAuth` collapses into it with `realm:'pos'`. Everything upstream (extraction, verification, realm rejection, active check) is identical and belongs in one place.

**Q3 — Minimal set of shared utilities needed?**
Eight modules: (1) `sharedAuth.js` — token sign/verify/extract + password hash/verify/rehash; (2) new `requireAuth.js` — the gate factory; (3) `tenant.js::getTenant`; (4) `rateLimit.js`; (5) `response.js` — jsonResponse/errorResponse/cachedJsonResponse/toCamel/toSnake; (6) `errors.js` — validationError; (7) `pagination.js`; (8) a small `broadcasterClient` (`broadcastEvent(env, tenantId, event)`) plus `orgService.ensureTenantOrg`. Everything else (all handler logic) stays module-local. Notably, `sendBookingConfirmationEmail` and `tenantMiddleware` are *not* in the minimal set (dead/unused).

**Q4 — How should rate limiting work in a unified backend?**
One `rateLimitMiddleware` factory (keep current mechanics: ip+path+window key, fail-closed, test bypass) applied from a **single declarative policy table** at mount time, so every route's limit is visible in one place. Close today's gaps (meal-schedules, pos-users); exempt long-lived SSE from request counting and rely on the DO's 100-connections cap. Fold the ad-hoc forgot-password limiter into the same factory with its stricter policy. Critically: stay on in-memory mode while `RATE_LIMIT_KV_ENABLED="false"` (free-plan 1,000 writes/day) — the design must let distributed KV come back as pure configuration.

**Q5 — How should tenant scoping work for POS vs Admin routes?**
Admin realm: resolve tenant from request context (`getTenant`); enforce partition (`decoded.tenantId === tenantId` unless `super_admin`); generalize `scopeTenant()` so super_admin may override with `?tenantId=` (the pos-users precedent); marketplace context grants cross-tenant READS ONLY on catalog endpoints. POS realm: **never** trust request-supplied tenant hints — the terminal's tenant/org pair comes exclusively from verified token claims (resolved at login via `tenant_org_mapping`), because devices authenticate per-cashier and any request-context shortcut would enable cross-tenant transactions. The dual-column reality (`tenant_id` TEXT for transactions/shifts, `organization_id` INTEGER for catalog) is preserved inside one `resolveScope` return shape.

**Q6 — Migration path from current to unified?**
Strangler, six independently shippable phases (details §6): **0** baseline + dead-code removal → **1** `requireAuth` factory replacing the 13 inline gates (pure refactor, byte-identical responses, fixes the ordering quirk) → **2** convert Paradigm-B handlers to explicit Hono sub-routers one module at a time until the catch-all is a 404 (POS already proves the pattern) → **3** realm-tagged token contract with dual acceptance + optional POS refresh → **4** declarative rate-limit policy table closing gaps without new KV writes → **5** formalized scope resolver + org service → **6** registry/OpenAPI/type regeneration, contract-drift fixes, SSE event parity, docs/logbook. Gate every phase on the full backend + root + app suites, and E2E (`CI=true npx playwright test`) before declaring done.

---

## Appendix A — Inline auth gate locations (for Phase 1 execution)

| Site | File:Lines | Variant notes |
| --- | --- | --- |
| create-intent | index.js:123-136 | tenant 404 on missing |
| create-checkout | index.js:138-151 | alias of above |
| confirm | index.js:153-166 | alias of above |
| meal-schedules | index.js:192-209 | tenant 404 on missing |
| meal-schedules/* | index.js:210-227 | exact duplicate |
| pos-users | index.js:230-243 | allows admin role; SA may omit tenant |
| pos-users/* | index.js:244-257 | exact duplicate |
| stream/orders | index.js:270-306 | header **or** `?token=`; role check admin/super_admin |
| catch-all | index.js:316-399 | adds `admins.is_active` **before** POS rejection (quirk) |
| admin handler | admin.js:55-68 | SA-only + active check |
| tenants soft-detect | tenants.js:74-87 | optional auth elevation |
| pos-users handler | pos-users.js:134-148 | second parse of same token |

## Appendix B — Test suites to keep green per phase

```bash
cd backend && npx vitest run          # ~1082 tests / 36 files
npx vitest run                        # root integration, 169 / 10
cd app && npx vitest run              # 1469 / 74
CI=true npx playwright test           # 552 passing / 14 env-skipped
```

Root tests assert verbatim Zod fragments (`"Required"`, `"Invalid enum"` prefix) — run root + app suites together whenever error envelopes could shift.
