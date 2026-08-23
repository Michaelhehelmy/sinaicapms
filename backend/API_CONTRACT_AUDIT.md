# API Contract Audit — Unified API Suite Merge Plan

> **Scope**: full read of `backend/src/index.js`, all 18 `backend/src/api/*` modules, `backend/src/routes/pos/index.js`, `backend/src/utils/{response,errors,pagination}.js`, `backend/src/middleware/{tenant,sharedAuth}.js`, `app/src/lib/api.ts`, `app/src/lib/api-types.ts` (generated from `backend/openapi.json` v2.1.0 — 70 paths, 107 schemas), plus usage analysis of every `app/src/lib/api.ts` export across `app/src`.
>
> **Purpose**: produce the merge plan for collapsing the current multi-dispatch, mixed-convention API into ONE unified suite without breaking the 552-gate E2E suite, 1,082 backend unit tests, or 1,465 frontend unit tests.

---

## 1. Current API Analysis

### 1.1 Routing architecture — TWO dispatchers coexist

The Worker (`backend/src/index.js`) mixes two routing styles:

**Style A — explicit Hono routes** (registered BEFORE the catch-all):

| Mount | Handler | Dispatch style |
|---|---|---|
| `app.all('/api/auth/*')` | `handleAuthRoute` | manual `path[2]` switch |
| `POST/GET /api/tenants`, `GET /api/tenants/*` | `handleTenants` | manual path parsing |
| `app.all('/api/admin', '/api/admin/*')` | `handleAdminRoute` | manual `path[2]` switch |
| `app.post('/api/payments/*')` ×4 | `handleCreatePaymentIntent` / `handleConfirmPayment` / `handleStripeWebhook` | one handler per route |
| `app.route('/api/pos', posRoutes)` | Hono sub-app (`routes/pos/index.js`) | **idiomatic Hono** (`pos.get/post`) |
| `app.post('/api/contact')`, `app.post('/api/leads')` | `handleLeadsRoute` | manual |
| `app.all('/api/meal-schedules', '/api/meal-schedules/*')` | `handleMealSchedulesRoute` | manual |
| `app.all('/api/pos-users', '/api/pos-users/*')` | `handlePosUsersRoute` | manual |
| `GET /api/stream/orders` | Broadcaster DO proxy | direct |
| `GET /api/openapi.json` | `buildOpenApiDocument()` | static |

**Style B — manual catch-all dispatcher** `app.all('/api/*')` (index.js:316–399): resolves tenant, runs an inline JWT gate for non-public paths, then routes by `path.startsWith(...)` prefix matching to plain `(request, env, tenantId)` handlers: `me`, `reports`, `inventory`, `camps`, `products`, `rooms`, `rateplans`, `price-overrides`, `orders`, `availability`, `meals`, `meal-categories`, `categories`, `plans`, `leads`, `inbox`, `upload`, `media`.

Consequences of Style B: no 405 semantics (a `PATCH /api/camps/x` hits the handler's fall-through `405` only because each handler ends with one), no param extraction, and every module re-implements its own path/method parsing.

### 1.2 Endpoint inventory — method × auth × tenant scoping

Auth tiers: **P**ublic · **A**uth (any active admin JWT, tenant-partition enforced) · **SA** super-admin only · **POS** (POS-session JWT, `posType==='pos'`). Tenant context resolved by `getTenant()`: `?tenant_id=` → `x-tenant-id` header → hostname (www-stripped; localhost → none).

#### Public (no JWT)
| Endpoint | Notes |
|---|---|
| `GET /api/me` | graceful `{id:null,…}` when no tenant context |
| `PUT/PATCH /api/me` | **NOT public** — falls through catch-all auth gate (public list matches GET only) |
| `GET /api/tenants`, `GET /api/tenants/public` | public field subset; SA token unlocks private fields + admin join; `marketplace` row excluded |
| `GET /api/tenants/{id}` | id/subdomain/custom_domain lookup, www-normalized |
| `GET /api/camps`, `/api/camps/{id}` | marketplace host ⇒ cross-tenant read |
| `GET /api/products`, `/api/rooms`, `/api/rateplans`, `/api/meals`, `/api/categories`, `/api/meal-categories` | GET only |
| `GET /api/availability` | 60s cache |
| `POST /api/orders` | guest booking (validateOrder enforces capacity/overlap/past-date rules) |
| `GET /api/orders/status/{ref}` | public tracking by reference |
| `GET /api/orders/calculate-price` | server-side pricing engine (override > rate plan > base) |
| `POST /api/leads`, `POST /api/contact` | both funnel into `handleLeadsRoute`; lead may have NULL tenant_id |
| `GET /api/media/{key…}` | R2 stream; sanitized key embeds tenantId |
| `POST /api/auth/login·register·forgot-password·reset-password·refresh·logout` | rate-limited 30/min; forgot has extra in-memory 5/15min/IP |
| `POST /api/pos/auth/login` | identifier = email OR username; 15/min |
| `POST /api/payments/webhook` | guarded by `x-webhook-secret` header, not JWT |

#### Auth-required + tenant-scoped (catch-all gate unless noted)
| Endpoint group | Methods | Notes |
|---|---|---|
| `/api/camps` | POST, PUT, DELETE | one-camp-per-tenant guard (409) |
| `/api/products` | POST, PUT, DELETE | writes `pos_products` (type='room'); mirrors FK into `products` |
| `/api/rooms` | POST, PUT, DELETE | INSERT..SELECT guards foreign camp/product ids |
| `/api/rateplans` | POST, PUT, DELETE | delete blocked when orders reference product |
| `/api/orders` | GET list (paginated), GET {id}, PUT, DELETE, `PATCH /{id}/status`, `POST /bulk-delete` | SSE `new-booking` broadcast on create; delete frees room when no other active orders |
| `/api/meals` `/api/meal-categories` `/api/categories` `/api/plans` | full CRUD | meals use `meal_lang` upsert |
| `/api/meal-schedules` | GET, POST, DELETE | explicit route w/ identical inline gate |
| `/api/price-overrides` | GET, PUT (bulk upsert), DELETE | strict YYYY-MM-DD validation |
| `/api/leads` | GET (paginated), PUT /{id} status, DELETE /{id} | |
| `/api/inbox` | GET (paginated + unread), `PATCH /read`, `DELETE /{kind}/{id}` | booking deletion → 400 by design |
| `/api/upload` | POST multipart/raw octet-stream ≤8 MB | returns `/api/media/{key}` |
| `/api/reports/occupancy·revenue·bookings` | GET | |
| `/api/inventory/low-stock` | GET | paginated `{items,…}` keyed differently |
| `/api/me` | PUT/PATCH | tenant branding + optional admin account update |
| `/api/pos-users` | GET (paginated), POST, PATCH /{id}, DELETE /{id} (soft), POST /{id}/reset-password | roles admin+SA; SA may pass `?tenantId=`; auto-provisions org/store/mapping |
| `/api/payments/create-intent`, `/create-checkout`, `/confirm` | POST | explicit routes; POS sessions rejected; **inconsistent tenant-missing status**: 404 (intent/confirm) vs 401 (checkout) |

#### Super-admin only
| Endpoint | Methods | Notes |
|---|---|---|
| `/api/admin/stats` | GET | cross-tenant counters |
| `/api/admin/tenants` | GET (paginated, excludes `marketplace`) | |
| `/api/admin/tenants/{id}` | PUT/PATCH, DELETE (cascade) | |
| `/api/admin/tenants/bulk/{suspend·activate·delete}` | POST | ⚠️ cascade misses `meal_schedules`, `meal_lang`, `inbox_reads`, `price_overrides`, `pos_users`, `orders` of type POS — orphan risk |
| `/api/admin/admins` | GET (paginated), POST (upsert-by-email) | cannot touch super_admins |
| `/api/admin/admins/{id}` | PUT/PATCH, DELETE | |

#### POS realm (`posType==='pos'`, org-scoped)
`POST /api/pos/auth/login` · `GET /products` (org-scoped, LIMIT none) · `POST /orders` (Zod, split-payment sum check, recipe stock deduction w/ batch + race compensation, idempotency-key dedup) · `GET /orders` (**hardcoded LIMIT 100**) · `GET /orders/:id` · `GET /dashboard` (TZ-aware day boundaries) · `GET /shifts/active` · `POST /shifts/open` · `POST /shifts/close`.

**Realm isolation is bidirectional and enforced twice**: POS tokens are rejected by every admin gate (`decoded.posType === 'pos'` → 403), and `posAuth` rejects non-POS tokens. On the client, `apiFetch` silently switches token (`pos_token` vs `sinaicamps_token`) based on the `/pos/` endpoint prefix — implicit and load-bearing (see §6).

#### Routes absent from openapi.json
1. `GET /api/stream/orders?tenantId=&token=` — SSE hub (header-or-query JWT, admin roles only). **Intentionally excluded** from the OpenAPI document per the T8 design note (`routes/registry.js:22`) — streaming responses aren't modeled; this is a documented decision, not drift.
2. `GET /api/tenants/public` — served by the same handler as `/api/tenants` but has no spec entry of its own.
3. `PATCH /api/me` — implemented (`PUT ∪ PATCH` accepted) but the registry declares `put` only (`registry.js:1516`).

### 1.3 Rate limits (per-isolate in-memory fallback in prod — `RATE_LIMIT_KV_ENABLED="false"`)

| Scope | Limit |
|---|---|
| `/api/auth/*` | 30/min |
| `POST /api/tenants` | 5/5min |
| `GET /api/tenants*` | 60/min |
| `/api/admin/*` | 20/min |
| `/api/payments/*` (incl. webhook) | 20/min |
| `/api/pos/auth/login` · `/api/pos/*` | 15/min · 60/min |
| `POST /api/leads`, `POST /api/contact` | 10/min |
| catch-all `/api/*` | 100/min |
| forgot-password (in-handler) | 5/15min/IP |

---

## 2. Request/Response Schema Analysis

### 2.1 Case convention (the T3 boundary contract)
- **Responses**: every success/error goes through `jsonResponse`/`cachedJsonResponse` → deep `toCamel`. The wire is camelCase end-to-end. `errorResponse(msg, status, errors?)` emits `{success:false, error, errors?}` (single-word keys unchanged).
- **Requests**: SPLIT. Snake-native schemas (camps, products, rooms, rateplans, orders, meals, meal-categories, categories, plans, leads, inbox-read, tenants, meal-schedules, admin, pos-users) are parsed as `schema.safeParse(toSnake(await request.json()))` — clients send camelCase, internals stay snake. **Camel-native schemas that must NEVER be `toSnake`-wrapped**: `auth.js` (login/register/forgot/reset/change/refresh — `tenantId`, `currentPassword`…), `payments.js` (`orderId`, `paymentIntentId`), `routes/pos/index.js` (`posOrderSchema`: `productId`, `amountCash`, `idempotencyKey`).
- Validation failures return `{success:false, error:"msg; msg", errors:[{field,message}]}` where `field` is the camelCase wire key with numeric indices preserved (`items.0.mealId`); locked message fragments: `"Required"` for missing fields, `"Invalid enum"` prefix for enums (root tests assert these verbatim).

### 2.2 Zod coverage is uneven
- Fully validated: camps/products/rooms/rateplans (`.strip()` everywhere), orders (+status patch), meals, meal-categories, categories, plans, meal-schedules, leads, inbox-read, tenants (create + me-update), admin (tenant update, bulk, admin create/update), pos-users (create/patch/reset), payments (intent/confirm), POS orders.
- **Not validated by Zod**: POS login (`if (!identifier || !password)`), POS shift open/close (`parseFloat(body.openingCash)`), price-overrides PUT (manual checks — strict date regex, integer prices), orders `bulk-delete` (manual `Array.isArray(ids)`), tenants search params, pagination params (clamped defensively in `parsePagination`).

### 2.3 Response shapes — four competing conventions
| Convention | Endpoints |
|---|---|
| Bare array | products, rooms, rateplans, meals, meal-categories, categories, plans, meal-schedules, POS products, POS orders, tenants list |
| Pagination envelope `{data,total,page,pageSize,hasMore}` | orders list, leads, admin/tenants, admin/admins, pos-users, inbox (+`unread`), inventory low-stock (keys `items` instead of `data`!) |
| Mutation ack `{success:true, id?, …}` | most POST/PUT/DELETE |
| Domain object | `/api/me`, `/api/auth/me`, camp/order detail, availability, reports, POS dashboard/shifts, calculate-price `{total_price}` |

Legacy stragglers: `GET /api/camps?limit=` still honors raw `limit`/`offset`; POS orders caps at `LIMIT 100` with no page params; tenants list has **zero** pagination despite being the super-admin directory.

### 2.4 Generated contract (`openapi.json` ↔ `api-types.ts`)
- Registry-generated spec v2.1.0, servers `https://sinaicamps.com`; 70 paths, 107 component schemas; `api.ts` imports only `components['schemas']`.
- Drift found: 3 undocumented live routes (§1.2); `create-checkout` is a byte-for-byte duplicate of `create-intent` with zero frontend callers; spec omits `PATCH /api/me`; spec does not model the `errors[]` field on 400s nor the `unread` extension on inbox envelope (types carry them ad hoc).

---

## 3. Frontend API Client Analysis (`app/src/lib/api.ts`)

### 3.1 Transport kernel (`apiFetch`)
- Base resolution: localhost→`:8787/api`; `*.sinaicamps.com`→same-origin `/api`; anything else (custom domains)→`https://sinaicamps.com/api`.
- Headers: `Content-Type: application/json`, `x-tenant-id: <getTenantId()>`, `Authorization: Bearer <token>` — **token chosen by endpoint prefix** (`/pos/` → `pos_token`, else `sinaicamps_token`).
- Extras: in-flight GET dedup keyed `tenant:endpoint`; T7 silent refresh (single-flight `_refreshPromise`, retry once, admin realm only); 401 wipes realm-specific localStorage; non-JSON error bodies raise generic errors.
- Escapes the kernel deliberately: `upload()` (multipart boundary), `refreshAccessToken()` (must not self-refresh).

### 3.2 Per-concern consumption map
| Concern | How it calls the API |
|---|---|
| **Admin SPA** | TanStack Query via `hooks/useQueryHooks.ts` (~50 hooks wrapping `api.getCamps/getOrders/...` + mutations with invalidation). Legacy `useAdminData.ts` still feeds the shell. `TenantDrilldown` flips module-level `setTenantScope()` so `getTenantId()` targets the drilled tenant. `InboxPanel` calls `api.updateLead` directly. |
| **POS views** | Direct function calls (`posLogin`, `posGetProducts`, `posCreateOrder`, `posGetActiveShift/OpenShift/CloseShift`, `posGetOrders`, `posGetDashboard`). Zero React Query. |
| **Public islands** | `ReservationSummary.tsx:181` raw-fetches `${apiBase}/leads`; `contact.astro:141` raw-fetches `/contact`; `CampBooking` receives SSR props (no client fetch); marketplace home grid is an inline script hitting `/tenants/public?search=…`. |
| **SSR (Astro)** | `middleware/tenant.ts` `resolveApiFetcher` prefers the `API_BACKEND` service binding (`binding.fetch('https://campmaster-backend/api…')`) to dodge Cloudflare same-zone 1042, falling back to cross-origin fetch; pages consume via `Astro.locals.API_FETCH`. Raw JSON only — wire is already camelCase. |
| **SSE** | `lib/sse.ts` builds `EventSource(`${API_BASE}/stream/orders?tenantId&token`)` (query-param JWT because EventSource can't set headers). |

### 3.3 Dead exports (defined, imported nowhere outside api.ts) — verified by grep
- **Backend-less stubs (7)**: `posCreateProduct`, `posUpdateProduct`, `posDeleteProduct`, `posGetCustomers`, `posGetInventory`, `posGetStaff`, `posGetReports` — target routes that **do not exist** on the Worker.
- **Live-backend but uncalled (28)**: `getCamp`, `getOrderStatus`, `updateOrderStatus`, `bulkDeleteOrders`, `calculatePrice`, `getCategory/saveCategory/deleteCategory`, `getMeal`, `getPlan`, `getTenants`, `getTenantsPublic` (callers use raw fetch/SSR instead), `createTenant`, `deleteAdminTenant`, `bulkSuspendTenants/bulkActivateTenants/bulkDeleteTenants`, `saveLead/getLeads/deleteLead`, `createPaymentIntent/confirmPayment`, `posGetOrder`, plus all six backward-compat aliases (`getReservations`, `saveReservation`, `deleteReservation`, `getRoomTypes`, `saveRoomType`, `deleteRoomType`).

---

## 4. Contract Gaps

### 4.1 Frontend calls with no backend handler
| Client fn | Target | Reality |
|---|---|---|
| `posCreateProduct` | `POST /api/pos/products` | 404 (falls to `pos.use('*', posAuth)` then Hono 404) |
| `posUpdateProduct` | `PUT /api/pos/products/:id` | 404 |
| `posDeleteProduct` | `DELETE /api/pos/products/:id` | 404 |
| `posGetCustomers` | `GET /api/pos/customers` | 404 |
| `posGetInventory` | `GET /api/pos/inventory` | 404 (tenant-admin twin exists at `/api/inventory/low-stock`) |
| `posGetStaff` | `GET /api/pos/staff` | 404 (twin exists at `/api/pos-users`) |
| `posGetReports` | `GET /api/pos/reports` | 404 (twin exists at `/api/reports/*`) |

None are imported by any view → **safe to delete outright** rather than implement. If POS ever needs them, the twins above are the canonical sources.

### 4.2 Backend routes with no frontend caller
- `POST /api/payments/create-checkout` — exact alias of `create-intent`; delete candidate.
- `GET /api/orders/status/:ref`, `PATCH /api/orders/:id/status`, `bulk-delete`, `calculatePrice`, bulk tenant actions, payments intent/confirm, `getTenantsPublic` wrapper — all have working backends but are currently reached through other code paths (SSR, raw fetch, or simply unused features). Keep the endpoints; prune the client wrappers only after confirming product intent.

### 4.3 Spec-vs-behavior drift (must fix before any merge)
1. `PATCH /api/me` implemented but not in the registry (PUT only) — add the patch route.
2. `/api/tenants/public` has no spec entry — document it or alias it to the tenants list operation.
3. Decide `create-checkout`'s fate (remove or alias-document).
4. Document the `errors[]` 400 extension and inbox `unread` field in the schema definitions.
5. Payment-route tenant-missing status inconsistency: 404 vs 401 for the same precondition.
6. Inventory low-stock uses `items` as the data key while every other paginated endpoint uses `data`.

(SSE `/api/stream/orders` is excluded from the spec **by design** per T8 — see §1.2.)

### 4.4 Behavioral inconsistencies a unification must resolve
- Three pagination dialects (envelope / bare array / legacy `limit`/`offset` + hardcoded LIMITs).
- `calculate-price` returns `{total_price: 0}` (HTTP 200) on missing params instead of 400.
- POS login/shift endpoints bypass Zod while their admin siblings use it.
- `GET /api/me` is public yet `PUT/PATCH` needs the full gate — same "resource," two tiers.
- Leads POST tolerates absent tenant (NULL tenant_id rows) while every other write demands one.
- Admin bulk/single tenant delete cascades skip `meal_schedules`, `meal_lang`, `inbox_reads`, `price_overrides`, `price_overrides`-adjacent tables and `pos_users` (soft-deletable) → orphaned rows.

---

## 5. Unification Plan (step-by-step merge strategy)

Guiding rule from T3/T4 history: **normalize at the boundary, never blanket-convert**, and land each phase behind the existing test suites (root + backend + app) before proceeding.

**Phase 0 — Contract freeze & truth restoration (no behavior change)**
1. Update `routes/registry.js` so openapi.json matches reality (add PATCH /me + /api/tenants/public; drop or alias create-checkout; add `errors[]` + `unread` to schemas — leave SSE excluded per T8). Run `npm run gen:openapi && npm run gen:types`.
2. Delete the 7 backend-less POS stubs + 6 compat aliases from `api.ts` (grep-verified dead). Re-run app suite.

**Phase 1 — Response normalization (backward-compatible)**
3. Introduce `ok(data)` / `created({id})` helpers in `utils/response.js` that wrap `jsonResponse`; mechanically migrate mutation acks to a single shape `{success:true, id?}`.
4. Migrate inventory low-stock key `items` → `data` (keep `items` mirrored for one release; drop after E2E green).
5. Make `calculate-price` return 400 on missing params (update the one SSR caller; check tests).

**Phase 2 — Pagination convergence**
6. Apply `parsePagination` + `paginationEnvelope` to ALL list endpoints: products, rooms, rateplans, meals, meal-categories, categories, plans, meal-schedules, POS orders (replace LIMIT 100), tenants list (both public and admin variants).
7. Transition device: accept `?raw=1` (or honor `Accept: application/json; profile=legacy-array`) for one release so SSR/islands can be flipped file-by-file; then remove. Update the ~14 affected TanStack Query hooks + inline home-grid script in the same commit as the flag removal.

**Phase 3 — Router consolidation (kill the catch-all)**
8. Convert every Style-B module into an idiomatic Hono sub-router exactly like `routes/pos/index.js` (param extraction via `c.req.param`, real 405s). Mount under the existing paths first — URLs unchanged.
9. Replace the five copies of the inline JWT gate (index.js catch-all, meal-schedules, pos-users, admin, payments) with ONE composed middleware: `requireTenant → requireAuth (verifyJWT + is_active DB check) → forbidPosSession → requireRole('admin'|'super_admin') → requireTenantPartition`. `sharedAuth.authMiddleware` already implements 80% of this — extend, don't rewrite. Preserve exact status codes/messages asserted today (401 missing-header / expired; 403 POS-block; 403 partition; 401 deactivated).
10. Keep route-registration ORDER: auth/tenants/admin/payments/pos/contact/meal-schedules/pos-users/stream → **openapi.json static** → catch-all (temporarily retained as 404 logger until Phase 4 lands).

**Phase 4 — Realm & resource consolidation**
11. Fold the two token realms into one issuer: POS login moves to `POST /api/auth/pos-login` issuing the same HS256 token shape with `posType:'pos'`; `posAuth` becomes `requireRole` + `requirePosType`. Then delete the `/pos/`-prefix token switch in `apiFetch` in favor of an explicit `realm` argument per call site.
12. Merge duplicate resources: `/rateplans` → nested `/camps/{id}/rate-plans` (or keep flat but rename in spec), `/pos-users` ↔ staff, `/inventory/low-stock` under `/reports` or a `/inventory` router, `/contact` folded into `POST /leads?source=contact` (already the same handler).
13. Fix the admin cascade deletes (add the missed tables) before exposing delete in any new unified UI.

**Phase 5 — Versioning & cutover**
14. Adopt **URL-major versioning**: mount the consolidated routers at `/api/v1/*` and keep unversioned `/api/*` as an alias layer (thin `route('/api/v1', v1App)` + legacy aliases) so SSR bindings, E2E configs, and the service-binding fetcher keep working during migration.
15. Deprecation policy: additive fields anytime; breaking shape changes require a major bump + `Sunset` header on the legacy path for one release cycle; minor rev tracked in `openapi.json` `info.version`.
16. Regenerate `api-types.ts`, flip `API_BASE` construction to include the version segment, remove legacy aliases, done.

### Answers to the key questions
1. **Public vs auth vs tenant-scoped** — see §1.2 tables; short form: reads of catalog/availability/tracking/lead-submit/tenant-directory are public; every write + list-of-record is admin-JWT + tenant-partition; `/api/admin/*` is SA-only; `/api/pos/*` is a second realm with org scoping.
2. **Frontend calls without backend handlers** — the 7 POS stubs in §4.1 (all dead code).
3. **Pagination** — one envelope `{data,total,page,pageSize,hasMore}`, `page≥1`, `pageSize∈[1,200]` default 50 (existing `pagination.js`), applied to every collection including tenants and POS orders; `total` always reflects the current filter (the T6 fix pattern); inbox additionally carries `unread`.
4. **Error responses** — single envelope `{success:false, error:string, errors?:[{field,message}]}` (already true for ~all paths via `errorResponse`); codify: 400 validation (with `errors[]`), 400 business rule, 401 missing/expired/deactivated, 403 POS-block/partition/role, 404 not-found, 409 conflicts (duplicate email/subdomain/camp), 413 oversize upload, 429 rate-limited, 500 opaque in production. Never attach `errors[]` to non-Zod failures.
5. **Minimal endpoint set** — ~48 routes: 9 auth (+pos-login), 8 tenancy/admin (directory, tenant CRUD, bulk, stats, admins CRUD, me), 11 catalog (camps, rooms, products, rate-plans, price-overrides×3, categories, meals, meal-categories, meal-schedules, plans — each with list+mutate compressed), 8 bookings (orders×5 verbs, calculate-price, status lookup, availability), 3 payments, 3 CRM (leads feed, inbox read/delete merged into leads+bookings via inbox), 4 ops (reports×3→1 param'd, inventory low-stock), 3 infra (upload, media stream, stream/orders) + openapi.json. Everything else in today's surface is either duplication (`create-checkout`), a legacy alias (`room_types` era), or dead.
6. **Versioning** — URL-major `/api/v1` with an unversioned compatibility alias (Phase 5), additive-only minors, machine-checked by regenerating `api-types.ts` in CI whenever `openapi.json` changes.

---

## 6. Risk Assessment

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | **Test-string lock-in**: root `tests/unit` asserts verbatim Zod fragments (`"Required"`, `"Invalid enum"`); E2E asserts page copy fed by API shapes. Any envelope/message change ripples. | High | Land phases independently; run all three suites (`backend`, `app`, root) per phase — backend-green alone was proven insufficient (T4 lesson). |
| 2 | **Case-boundary traps**: `toSnake`-wrapping auth/payments/POS camel-native schemas breaks them; stripping the choke-point `toCamel` breaks SSR. | High | Only normalize *inside* `utils/response.js`; never wrap the three camel-native modules; keep `snakeToCamel` deleted on the frontend. |
| 3 | **Token-realm switch is implicit**: removing the `/pos/` prefix check in `apiFetch` before call sites pass an explicit realm would send cashier tokens to admin routes (silent 403 loops) or vice-versa. | High | Phase 4 step 11 must change call sites and transport in one commit; cover with a jsdom test asserting header choice. |
| 4 | **Route-order regressions**: `openapi.json` static route and `/api/stream/orders` must precede any catch-all; Hono wildcards need `/*` syntax. Moving to sub-routers can shadow SSE or the spec. | Medium-High | Snapshot-test the route table (method+path → expected handler class) after Phase 3. |
| 5 | **Dual tenant columns**: `pos_products.organization_id` (INTEGER) vs `pos_transactions`/`pos_shifts.tenant_id` (TEXT); POS merge mistakes corrupt scoping. | High | Keep `posUser.tenantId` vs `.organizationId` discipline; unit tests asserting bind args (pattern used in tenants/admin tests). |
| 6 | **Same-zone fetch 1042**: SSR depends on the `API_BACKEND` service binding; changing `API_BASE`/versioned paths must update `resolveApiFetcher` and the binding's URL rewriting together or prod camp pages 302→/404 again. | High | Extend `app/tests/unit/middleware-tenant.test.ts` to the versioned base before deploy; verify staging with `./deploy.sh --staging`. |
| 7 | **Pagination flip breaks consumers silently**: SSR grids, sitemap generation, and the home filter script iterate arrays today; envelopes would render `[object Object]`. | Medium | Use the transitional `raw=1` flag; grep all consumers of each converted list before removing the flag. |
| 8 | **Rate-limiter state**: prod runs the in-memory fallback (KV quota protection); consolidating routes changes which limiter bucket a request falls into (e.g. moving `/contact` under `/leads`). | Low-Medium | Re-map buckets explicitly in the unified router config; keep fail-closed behavior. |
| 9 | **Cache headers**: converting a `cachedJsonResponse` endpoint to `jsonResponse` (or vice versa) silently changes CDN caching (300s SWR vs no-store). | Medium | Preserve the cache decorator per endpoint in the router table; add a header-assertion smoke test. |
| 10 | **Cascade deletes incomplete**: unified delete flows will surface orphans (`meal_schedules`, `inbox_reads`, `price_overrides`, `meal_lang`, POS users) that bulk-delete already creates today. | Medium | Fix cascades in Phase 1 (pre-merge hygiene), add referential sweep test on a seeded D1 local DB (`PRAGMA foreign_key_check`). |
| 11 | **Stripe webhook purity**: webhook body must never be case-normalized or re-signed; wrapping it in new middleware chains risks adding CORS/CSP headers that break signature handling assumptions. | High | Webhook keeps a dedicated lane (secret-header auth, no tenant resolution) in the unified design. |
| 12 | **Generated-type skew**: forgetting `gen:types` after registry edits makes `api.ts` compile against stale schemas — TS baseline is already 153 errors, so new drift hides easily. | Medium | CI gate: regenerate and `git diff --exit-code backend/openapi.json app/src/lib/api-types.ts`. |

**Overall verdict**: the merge is very feasible because the hard parts (camelCase choke point, structured errors, pagination helper, shared auth primitives) already exist and are used by most modules. The dangerous surface is concentrated in (a) the catch-all's duplicated auth gates, (b) the implicit POS token switch, and (c) test-string coupling — all addressed explicitly in Phases 3–4 with ordered mitigations above.
