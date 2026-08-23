# SinaiCamps — Unified Architecture Plan

> **Sources** (read in full): `app/FRONTEND_UNIFICATION_AUDIT.md` · `backend/BACKEND_UNIFICATION_AUDIT.md` · `backend/DATABASE_SCHEMA_AUDIT.md` · `backend/AUTH_SYSTEM_AUDIT.md` · `backend/API_CONTRACT_AUDIT.md`
> **Date**: 2026-08-22 · **Method**: synthesis of five layer audits into ONE sequenced, dependency-ordered roadmap
> **Guiding principles**: **ONE frontend** · **ONE backend** · strangler-pattern migration · backward compatible at every step
> **Verification gates**: every phase ships only behind green suites — backend `npx vitest run` (~1082 tests / 36 files) + root integration `npx vitest run` (169 / 10) + frontend `cd app && npx vitest run` (~1465–1469 / 74) + E2E `CI=true npx playwright test` (552 passing / 14 env-skipped). Run all three vitest suites together per phase (logbook T4 lesson).

---

## 1. Executive Summary

SinaiCamps is already **one codebase with one deployment pipeline**, but it behaves like five systems accreted over three product generations:

| Layer | Today | Target |
|---|---|---|
| **Frontend** | 4 concerns (+1 hidden: auth micro-pages): Marketplace SSR, Tenant Public SSR + 3 islands, Admin SPA (hash router), POS SPA (full-reload nav, dead QueryClientProvider). Two parallel auth realms share `apiFetch` via a `/pos/` prefix heuristic; Admin runs two data layers simultaneously. | **One unified frontend**: a single Astro deployment where Admin + POS converge into ONE authenticated SPA surface sharing one session store (`lib/session.ts`), one data layer (TanStack Query everywhere), one navigation kernel (`lib/navigation.ts`, zero full-reload navs), and shared shell components. Public pages remain server-rendered inside that same single app because zone guards are load-bearing server-side (multi-tenancy/SEO) — a literal mega-SPA mount was evaluated and rejected on evidence (audit F7: bundle-neutral). |
| **Backend** | One Worker (`campmaster-backend`) but TWO dispatch paradigms: explicit Hono routes vs an 18-branch catch-all at `index.js:316–399`; `sharedAuth.authMiddleware` exists but was never mounted — ~13 hand-copied gate sites diverge silently; rate-limit gaps; a 401-vs-403 ordering quirk. | **One backend**: single dispatch style (every module a Hono sub-router; catch-all reduced to plain 404), ONE auth gate (`requireAuth({realm, roles?, requireTenant?, allowQueryToken?})`), one scope resolver (`resolveScope`), one declarative rate-limit policy table closing gaps without new KV writes. |
| **Database** | 65 user tables live; only 31 referenced by backend SQL; 31 dead (zero refs); 3 quasi-dead; three generations fused; triggers fire against dead tables. | **One clean database**: ~31 tables after cleanup phases A/B (optionally 24–26 after optional C/D consolidations); zero triggers targeting dead tables; zero FKs into dropped tables; `PRAGMA foreign_key_check` clean as the final statement of every structural migration. |
| **Auth** | Not really two systems — two user stores + one shared JWT engine wrapped in ~11 hand-copied divergent gates (G1–G11); role collision on `'admin'`; deactivation gap G1–G8; refresh asymmetry (admin stateless 7-day rotation, POS none). | **One logical auth system**: realm-tagged tokens v2 (`userType` claim), the single `requireAuth` choke point enforcing domain pairing BEFORE role evaluation, extended RBAC hierarchy covering POS roles, POS session-lifecycle parity via refresh tokens, and one frontend session kernel with legacy-key seeding (no mass logout). Physical table merge of `admins`/`pos_users` explicitly NOT scheduled (history: migration 0019 merged → 0028 reversed). |
| **API contract** | Responses camelCase end-to-end via a `toCamel` choke point, but requests are split snake/camel; FOUR competing response shapes; THREE pagination dialects; drift between implementation and `openapi.json`; ~41 dead client exports. | **One contract**: camelCase wire both directions for NEW schemas (existing camel-native request schemas stay byte-compat), one response taxonomy normalized through `ok()`/`created()` helpers, one pagination envelope behind a transitional `raw=1` flag, registry/type regeneration CI-gated, URL-major versioning `/api/v1` with an unversioned alias during cutover. |

**Method**: strangler pattern. Every change lands byte-compatible first (legacy keys seeded, `raw=1` transition flags, unversioned aliases, verbatim error fragments preserved), old paths are removed only after their replacements prove green in staging (`./deploy.sh --staging` before production).

**Total effort**: ≈ **220 hours ≈ 27–28 working days ≈ 5–6 weeks sequential**, reducible to ~4 calendar weeks using the two parallel tracks identified in §12.

---

## 2. Current State Analysis

### 2.1 Frontend — four concerns (+ one hidden)

| Concern | Surface | Router | Data layer | Auth realm |
|---|---|---|---|---|
| Marketplace public | SSR Astro pages (`index.astro`, `/camps`, `/camp/[id]/*`) | server routes | none (SSR fetch via `API_BACKEND` service binding) | anonymous |
| Tenant public | SSR Astro pages + exactly 3 islands (CampBooking `client:visible`, ReservationSummary + TenantMenu `client:load`) | server + islands | islands use `apiFetch` | anonymous |
| Admin SPA | `admin/[...rest]` host, hash router (`#tab=`) | client | TanStack Query **+ legacy `useAdminData` layer simultaneously** | `sinaicamps_token` |
| POS SPA | `pos/[...rest]` host, path-detect boot | **client-side nav by full page reloads** | **dead QueryClientProvider — zero React Query usage** | `pos_token` |
| Auth micro-pages (hidden 5th) | login/register/forgot/reset × realms | server pages | forms | both |

**Findings F1–F7**:

- **F1** — POS navigates by full page reloads (`window.location.href = posUrl(...)`)
- **F2** — POS ships a dead `QueryClientProvider`; zero React Query usage despite the provider
- **F3** — Two parallel auth realms share `apiFetch` via a `/pos/` prefix heuristic (`pos_token` vs `sinaicamps_token`)
- **F4** — Admin runs two data layers simultaneously (legacy `useAdminData`/cached-data hooks + TanStack Query)
- **F5** — 9 of 26 `components/ui/` components are story-only dead code
- **F6** — Three pages violate the zone-guard pattern with the `return Astro.redirect('/404')` frontmatter anti-pattern: `book.astro:24`, `menu.astro:32`, `camp/[id]/book.astro:26`. Correct form: template ternary `{ forbidden ? <ZoneGuard /> : (...) }`, skip tenant fetch when forbidden, never redirect before the guard renders.
- **F7** — Bundle impact of unification ≈ neutral — React runtime (184 KB) becomes a shared chunk; total client JS ~700 KB either way

**Hygiene debt**: `TOKEN_KEY` triplicated (`api.ts:34`, `auth.tsx:40`, `AdminApp.tsx:41`); `pos/login` missing ToastProvider; `CampBooking.tsx:246` `${primaryColor}08` 8-digit-hex hydration bug; junk empty dir `pages/camp/"[id]"`; `ReservationSummary` raw-fetches `/leads` bypassing `apiFetch`; duplicate luminance helpers in TenantLanding + 4 pages; stale E2E spec `tests/e2e/specs/auth/tenant-admin-login.spec.ts` expects the pre-0028 `pos_token` world.

### 2.2 Backend

- Bindings: `DB` (D1), `KV_CACHE`, `RATE_LIMIT_KV`, `MEDIA_BUCKET` (R2), `BROADCASTER` (Durable Object).
- **Paradigm A** — explicit Hono routes. POS is a true sub-router with `pos.use('/*', posAuth)`. Other modules use `app.all()` delegating to legacy path-parsing handlers.
- **Paradigm B** — manual catch-all dispatcher `app.all('/api/*')` at `index.js:316–399`: public allowlist + ordered if-chain of path prefixes → 18 handler functions.
- `sharedAuth.authMiddleware` implements ~80% of the gate but **was never mounted**; ~13 inline duplication sites: payments ×3 (`index.js:123–166`), meal-schedules ×2 (`:192–227`), pos-users ×2 (`:230–257`), stream/orders header-or-query variant (`:277–294`), catch-all (`:340–365`); plus handler-level gates (`admin.js:55–68`, `tenants.js:74–87` soft-detect, `pos-users.js:134–148` double-parse).
- **Defects**:
  - No rate limiting on meal-schedules, pos-users, stream-orders (registered *before* the catch-all so its default 100/min never sees them).
  - Catch-all ordering quirk `index.js:353–359`: the `admins.is_active` lookup runs BEFORE the posType rejection, so a POS token hitting an admin route gets a misleading **401 "Account deactivated"** instead of the intended **403 "Forbidden: Access denied to this tenant partition"**.
  - Dead `tenantMiddleware` exported, never mounted.
  - `create-checkout` byte-for-byte alias of `create-intent` with zero callers.
  - `sendBookingConfirmationEmail` tested but never called.
- Both JWT realms share secret, algorithm, and sign/verify code via `sharedAuth.js` (`@tsndr/cloudflare-worker-jwt` HS256; `env.JWT_SECRET` throws immediately if unset — no fallback).

### 2.3 Database

- Census: **65 user tables live → only 31 referenced by backend SQL → 31 dead (zero refs) → 3 quasi-dead** (`products` mirror shim kept alive by `ensureProductInProductsTable`, `product_camps` junction kept for read-compat, `pos_categories` referenced by one LEFT JOIN in `inventory.js`). Minimal unified target: **~24–26 tables**.
- Three generations fused: G1 CampMaster Pro core (`0001–0009`), G2 Enterprise POS (`0010–0018`, ~70% dead), G3 Booking-only rebuild (`0028–0034`).
- **Winners resolved**:
  - Catalog → `pos_products` (0054 repointed `rooms_new`/`rate_plans_new` FKs; verified production 2026-08-21, local pending application).
  - Camp membership → `pos_products.camp_id` (0053 `UNIQUE camps.tenant_id` = one-camp-per-tenant law).
  - Customers → `customers` (`pos_customers` dead but FK-entangled).
  - Reservations → `orders`.
  - Auth split → intentional: `admins` + `pos_users` (do NOT merge schemas; unify at middleware level per audit D6).
- **OPEN duplication**: `meals`(+`meal_lang`) vs `pos_products type='menu'` — recommended resolution: Option 1, document the split (meals = per-day kitchen planning; pos_products = sellable menu items), zero migration.
- **Entanglements blocking naive drops**:
  - Trigger `update_customer_stats_after_order` ON `pos_transactions` INSERT → UPDATEs `pos_customers` (**dead target on an ACTIVE table** — live write-path hazard).
  - Trigger `update_customers_timestamp` ON `pos_customers` UPDATE (dies with its table).
  - Trigger pair `update_inventory_after_movement` ON `pos_stock_movements` INSERT → `pos_inventory` (dead↔dead).
  - FK `pos_transactions.customer_id` (NO ACTION) → `pos_customers`.
  - `pos_categories` LEFT JOIN in `inventory.js` + test fixture builds its own schema copy.
- **D1 ground rules** (from logbook + DB audit): create-copy-swap, never RENAME-swap (0042 broke production; 0046/0047 repaired); drop triggers BEFORE touching their subjects (0047 lesson); `PRAGMA defer_foreign_keys='ON'`; `PRAGMA foreign_key_check` as the final statement of every structural migration; exclude generated columns from INSERT…SELECT lists; migrations append-only starting 0055.
- **Index gaps**: `customers(tenant_id,email)`, `customers(tenant_id,phone)`, `pos_transaction_items(transaction_id)`, `pos_recipe_ingredients(product_id)`, `pos_recipe_ingredients(ingredient_product_id)`.

### 2.4 Auth

- Two user stores (`admins`, `pos_users`) + ONE shared JWT engine wrapped in ~11 hand-copied divergent gates **G1–G11**.
- **Role collision**: `'admin'` means tenant administrator (`admins.role` CHECK `super_admin|admin`) AND store administrator (`pos_users.role` DEFAULT `'cashier'`). Current `ROLE_HIERARCHY {super_admin:10, admin:4}` lacks POS roles entirely — they rank 0 silently.
- **Asymmetric domain detection**: "is POS?" = presence of `posType==='pos'`; "is admin?" = absence-of-posType + role claim.
- **Real bug — deactivation gap**: G1–G8 (payments ×3, meal-schedules ×2, pos-users ×2, SSE stream) never check `is_active`; deactivated accounts keep working until 24h token expiry. G11 (`posAuth`) is strictest: checks `is_active ∧ deleted_at IS NULL` every request.
- **Refresh asymmetry**: admin = stateless 7-day refresh, rotation without revocation; POS = none.
- **History**: migration 0019 merged users INTO `pos_users`; reversed by 0028 creating dedicated `admins` ("replaces pos_users for auth"). Physical merge is proven to fail — unify logically instead.

### 2.5 API contract

- Responses camelCase end-to-end via the `toCamel` choke point in `jsonResponse`/`cachedJsonResponse` (`utils/response.js`). Requests are SPLIT: snake-native schemas wrapped in `toSnake` vs camel-native schemas NEVER wrapped (`auth.js` loginSchema `.strip()`, `payments.js` `orderId`/`paymentIntentId`, `routes/pos/index.js` posOrderSchema `productId`/`amountCash`/`idempotencyKey`).
- Validation failures `{success:false, error:"msg; msg", errors:[{field,message}]}`; locked fragments `"Required"` and `"Invalid enum"` asserted verbatim by root tests.
- **Four competing response shapes**: bare array / pagination envelope `{data,total,page,pageSize,hasMore}` / mutation ack `{success:true,id?}` / domain object.
- **Three pagination dialects**: envelope / bare array / legacy limit+offset, plus hardcoded LIMITs (POS orders LIMIT 100; tenants list zero pagination).
- Dead exports: 7 backend-less POS stubs (`posCreateProduct`, `posUpdateProduct`, `posDeleteProduct`, `posGetCustomers`, `posGetInventory`, `posGetStaff`, `posGetReports`) + 28 uncalled live-backend exports + 6 compat aliases (`getReservations/saveReservation/deleteReservation/getRoomTypes/saveRoomType/deleteRoomType`).
- Contract drift: PATCH `/api/me` implemented but registry declares PUT only; GET `/api/tenants/public` undocumented; create-checkout alias undecided; `errors[]` not modeled; inbox unread count unmodeled; payments tenant-missing returns 404-vs-401 inconsistently; inventory list keyed `items` vs envelope `data`; calculate-price returns `{total_price:0}` HTTP 200 instead of 400 on missing params; cascade deletes miss `meal_schedules`, `meal_lang`, `inbox_reads`, `price_overrides` (`pos_users` soft-deletable).
- SSE excluded from `openapi.json` BY DESIGN (T8, `routes/registry.js:22`).

### 2.6 Cross-cutting constraints (AGENT_LOGBOOK)

- Verbatim strings asserted by tests: `"Required"`, `"Invalid enum"`, `"Account deactivated"`, `"Invalid POS session"`, `"Forbidden: Access denied to this tenant partition"`.
- KV free-plan quota 1,000 writes/day: `RATE_LIMIT_KV_ENABLED="false"` (in-memory fallback); **no new KV writes anywhere in this plan**; read caching stays header-only.
- Dual-column scoping: `organization_id INTEGER` (POS world) vs `tenant_id TEXT` (world) — never mix binds; bridge = `tenant_org_mapping` / `v_tenant_org`.
- `pos_users.name` is GENERATED (`first_name || ' ' || last_name`) — INSERT `first_name`/`last_name` only; `organization_id INTEGER NOT NULL` required in ALL inserts.
- tsc baseline currently 153 pre-existing errors (do not regress).
- Hono wildcards require `/*` syntax, not `/path*`.
- `wrangler tail --config backend/wrangler.toml`; staging verification via `./deploy.sh --staging`.

---

## 3. Target State Analysis

### 3.1 ONE frontend (definition + success criteria)

One Astro project/deployment/runtime kernel where all four concerns share the same primitives. The literal "single mega-SPA mount" was evaluated and **rejected on evidence**: zone guards must stay server-side (per-tenant branding, SEO, marketplace/tenant isolation), and F7 shows bundle gains are neutral anyway. What converges is the *runtime kernel*:

1. One session store — `lib/session.ts` owns ALL token storage; admin and POS sessions coexist as separate realms in one store; existing localStorage keys seeded so no user is logged out.
2. One data layer — TanStack Query everywhere it's needed (POS included); the legacy cached-data hook layer deleted; one QueryClient policy with concern-namespaced keys and `queryClient.clear()` on auth transitions.
3. One navigation model — `lib/navigation.ts` pushState routing inside SPA surfaces; zero full-reload navigations; admin hash URLs parsed for deep-link compat during migration.
4. Shared shell — `components/shell/{AppSidebar,AppTopbar,MobileBottomNav,LoginForm}` driven by per-concern nav configs; one LoginForm with a `realm` prop preserving existing testids.

**Success criteria**: TOKEN_KEY triplication gone; F1–F4 findings closed; E2E suite fully green; total client JS ≤ current ~700 KB; all three islands unchanged in behavior.

### 3.2 ONE backend (definition + success criteria)

Already one Worker; converge the internals:

1. One dispatch style — every module a mounted Hono sub-router; catch-all reduced to a plain 404.
2. One auth gate — `requireAuth` factory replaces ~13 inline sites byte-compat; realm checked FIRST (fixes the 401-vs-403 quirk); deactivation checked on every authenticated request (fixes the gap).
3. One scope resolver — `resolveScope(c, decoded)`; kills the silent `String(organization_id)` fallback at `routes/pos/index.js:82–93`.
4. One rate-limit policy table — declarative, closes meal-schedules/pos-users/stream-orders gaps with ZERO new KV writes.

**Success criteria**: no inline Authorization-header parsing outside `requireAuth`; every route class rate-limited; `grep 'Bearer'` outside sharedAuth returns nothing; catch-all gone.

### 3.3 ONE database (definition + success criteria)

~31 tables post phases A/B (24–26 optionally after C/D); winners already locked.

**Success criteria**: every remaining table has ≥1 backend SQL reference; no trigger targets a dropped/dead table; no FK references a dropped table; `PRAGMA foreign_key_check` clean at the end of every structural migration; index gaps closed.

### 3.4 Backward compatibility guarantees (plan-wide)

- Byte-compat auth responses during gate replacement (same status codes/bodies, including verbatim fragments).
- Legacy localStorage keys seeded into the new session store — no mass logout.
- `raw=1` query flag preserves the legacy pagination shape while consumers migrate.
- Unversioned `/api/*` alias retained while `/api/v1` rolls out; `Sunset` headers announce removals.
- Frontend compat aliases deleted only after a full release cycle of zero calls.

---

## 4. Unified Frontend Architecture

### 4.1 Component hierarchy (target)

```
app/src/
├── lib/
│   ├── session.ts        NEW  multi-realm session store (owns ALL storage; seeds legacy keys)
│   ├── navigation.ts     NEW  ~60-line pushState router (hash-fallback parsing)
│   ├── api.ts            apiFetch consumes session.ts; TOKEN_KEY duplicates deleted
│   ├── rbac.ts           single-source ROLE_HIERARCHY constant (frontend half)
│   └── routeZones.ts     UNCHANGED (zone model remains source of truth)
├── components/
│   ├── shell/
│   │   ├── AppSidebar.tsx       NEW shared sidebar (nav-config prop)
│   │   ├── AppTopbar.tsx        NEW shared topbar
│   │   ├── MobileBottomNav.tsx  NEW shared mobile bottom nav
│   │   └── LoginForm.tsx        NEW realm-prop login form (testids preserved)
│   ├── ui/               16 surviving primitives; icons promoted to ui/icons.tsx
│   ├── pos/              views refactored onto shared shell + TanStack Query
│   ├── admin/            panels off legacy hooks onto Query
│   └── public/           marketplace/tenant zones unchanged
└── pages/
    ├── admin/[...rest]/  SPA host (unchanged mount strategy)
    ├── pos/[...rest]/    SPA host (unchanged mount strategy)
    └── …public SSR pages with template-ternary zone guards
```

### 4.2 Routing model

- Astro SSR outer shell + server-side zone guards UNCHANGED (multi-tenancy + SEO depend on them). Fix the three F6 violations to template ternaries.
- SPA surfaces navigate via `lib/navigation.ts` (pushState). POS first (kills reload navs), then admin (`#tab=` hash → path, with hash fallback parsing so old deep links resolve).
- E2E specs update in the SAME commits as the route changes they exercise.

### 4.3 State management

- ONE QueryClient per SPA surface at root; concern-namespaced keys: `['pos', …]`, `['admin', …]`, tenant-scoped `['tenant', tenantId, …]`.
- `queryClient.clear()` on EVERY auth transition (login/logout/realm switch) — prevents cross-realm cache bleed (this is why POS's dead provider must not simply be "turned on" naively).
- TenantDrilldown's bespoke per-tenant fresh client replaced by tenant-scoped keys.
- ReservationSummary switched from raw fetch to `apiFetch`.

### 4.4 Shared-kernel inventory (new/changed files)

| Artifact | Kind | Notes |
|---|---|---|
| `lib/session.ts` | NEW | Multi-realm store; seeds `sinaicamps_token`/`pos_token` legacy keys; emits change events consumed by apiFetch |
| `lib/navigation.ts` | NEW | pushState router ~60 LOC; hash-fallback parsing |
| `lib/rbac.ts` | NEW | Extended hierarchy constant (see §7.3) |
| `components/shell/*` | NEW ×4 | AppSidebar, AppTopbar, MobileBottomNav, LoginForm(realm) |
| `ui/icons.tsx` | PROMOTE | From story-only to real export |
| legacy `useAdminData`/useCachedData layer | DELETE | After panels migrate |
| 9 dead ui/ components | DELETE | Phase 0 |

---

## 5. Unified Backend Architecture

### 5.1 Route structure (target)

Every module becomes a true Hono sub-router mounted at `index.js`; Paradigm-B handlers convert module-by-module until the catch-all contains nothing but the final 404. Order-sensitive rules preserved:

- `/orders/status/:ref` and `/orders/calculate-price` registered BEFORE `/orders/:id`;
- Hono wildcard syntax `/*` (never `/path*`);
- `openapi.json` static route before any dynamic fallback; upload/media LAST.

### 5.2 Middleware chain (target)

```
requireTenant → requireAuth({realm:'admin'|'pos', roles?, requireTenant?, allowQueryToken?})
             → forbidPosSession()/forbidAdminSession()   (where applicable)
             → requireRole(minRank)
             → scopeTenant(resolveScope semantics)
```

Gate policy: **realm discrimination FIRST** (a POS token on an admin route yields the intended 403 partition message, never the misleading 401 "Account deactivated"), then credential re-validation (`is_active ∧ deleted_at IS NULL` on EVERY authenticated request), then role, then scope.

`requireAuth` options: `{realm:'admin'|'pos', roles?:string[], requireTenant?:boolean, allowQueryToken?:boolean}` (the last covers SSE `?token=`).

### 5.3 Minimal shared kernel (8 modules)

| Module | Exports |
|---|---|
| `sharedAuth.js` | signToken, verifyToken, hashPassword, verifyPassword, rehashIfNeeded (extended to `pos_users` in Phase 5) |
| `requireAuth.js` (NEW) | the gate factory |
| `tenant.js` | getTenant |
| `rateLimit.js` | rateLimit(policyName) |
| `response.js` | jsonResponse, errorResponse, cachedJsonResponse, toCamel, toSnake |
| `errors.js` | validationError (locked fragments `"Required"`, `"Invalid enum"`) |
| `pagination.js` | parsePagination, paginationEnvelope → `{data,total,page,pageSize,hasMore}` |
| `broadcasterClient.js` | broadcastEvent(env, tenantId, event); orgService.ensureTenantOrg centralization |

### 5.4 Rate-limit policy table (zero new KV writes)

| Route class | Policy |
|---|---|
| `/api/auth/*` | 30/min |
| POST `/api/tenants` | 5/5min |
| GET `/api/tenants*` | 60/min |
| `/api/admin*` | 20/min |
| `/api/payments*` | 20/min |
| POST `/api/pos/auth/login` | 15/min |
| other `/api/pos/*` | 60/min |
| `/api/leads`, `/api/contact` | 10/min |
| meal-schedules, pos-users (gap closed) | 60/min |
| stream/orders (SSE) | exempt — BROADCASTER DO caps connections |
| default (catch-all remainder) | 100/min |

Forgot-password retains its extra per-IP 5/15min limiter. In-memory fallback remains the storage engine (`RATE_LIMIT_KV_ENABLED="false"`).

### 5.5 Scope resolution

`resolveScope(c, decoded)`:
- `super_admin` ⇒ `?tenantId` override allowed, else cross-tenant;
- admin ⇒ hard-scope to own tenant;
- POS ⇒ ignore request hints entirely; trust the token's `(organization_id ↔ tenant_id)` pair resolved via `tenant_org_mapping`.

Kills the silent fallback `String(organization_id)` at `routes/pos/index.js:82–93`. Super-admin bypass matrix PRESERVED: T9 drill-down scopeTenant semantics, `'marketplace'` pseudo-tenant, SSE `?token=` (`allowQueryToken:true`). Marketplace cross-tenant access codified as READS ONLY.

---

## 6. Unified Database Schema

### 6.1 Census & trajectory

```
65 live tables
 ├─ 31 active (referenced by backend SQL)
 ├─ 31 dead   (zero refs)      → dropped in Phase 2 (migration 0056)
 └─  3 quasi-dead             → dropped in Phase 2 (migration 0057 + code edits)
        ↓ Phases A+B
     ~31 tables                → optional C/D folds → 24–26
```

### 6.2 Winner map (already resolved)

| Domain | Winner | Disposition of losers |
|---|---|---|
| Catalog | `pos_products` | `rooms_new`/`rate_plans_new` FKs repointed by 0054 (verified prod 2026-08-21; apply locally in Phase 0 preconditions) |
| Camp membership | `pos_products.camp_id` | `camps` constrained to one-camp-per-tenant by 0053 UNIQUE(`tenant_id`) |
| Customers | `customers` | `pos_customers` dropped in Phase 2-B3 after FK rebuild |
| Reservations | `orders` | legacy reservation tables among Tier-A drops |
| Auth | `admins` + `pos_users` (INTENTIONAL SPLIT) | never merged again (0019→0028 history); unified logically at middleware level |

### 6.3 Target core schema (~26 tables, grouped)

- **Tenancy/platform**: `tenants`, `admins`, `tenant_org_mapping`(+view `v_tenant_org`), `organizations`(POS world), platform config/meta.
- **Catalog & menu**: `pos_products`, `pos_categories`(until 0057 drop decision completes → then category lives on product rows), `pos_recipes`, `pos_recipe_ingredients`, `meals`+`meal_lang` (kitchen planning — documented split from sellable menu items).
- **Bookings/orders**: `orders`, `order_items`, `price_overrides`, `leads`, `contact messages` table, `inbox_reads`.
- **POS operations**: `pos_transactions`, `pos_transaction_items`, `pos_shifts`, `pos_stock_movements`, `pos_payment_methods`.
- **CRM**: `customers`, `feedback`.
- **Ops/support**: `users`(staff directory where still referenced), media/metadata tables referenced by R2 flows.
*(Exact member list per the DB audit's Tier tables; the plan defers naming each of the 27 Tier-A tables to migration 0056 which enumerates them child-before-parent.)*

### 6.4 Relationships & scoping bridge

- World side: TEXT `tenant_id` columns; POS side: INTEGER `organization_id`. Bridge: `tenant_org_mapping` / view `v_tenant_org`. NEVER mix binds in one query (logbook rule).
- `pos_transactions.customer_id` FK → `pos_customers` must be REMOVED before `pos_customers` can drop (Phase 2-B3 rebuild via create-copy-swap).

### 6.5 Index additions (Phase 2)

`customers(tenant_id,email)`, `customers(tenant_id,phone)`, `pos_transaction_items(transaction_id)`, `pos_recipe_ingredients(product_id)`, `pos_recipe_ingredients(ingredient_product_id)`.

### 6.6 OPEN decisions (owner: product)

1. Menu duplication `meals`(+`meal_lang`) vs `pos_products type='menu'` — recommendation: document the split, zero migration.
2. `products` mirror shim removal requires explicit sign-off (touches `ensureProductInProductsTable` write path).
3. Optional `_lang` folds (D) deferred until a translation feature forces them.
4. Renames (`rooms_new→rooms`, `rate_plans_new→rate_plans`) deferred behind a forcing function; cosmetic only.

---

## 7. Unified Auth System

### 7.1 JWT v2 claims (backward compatible)

```jsonc
{
  "sub": "<user id>",            // kept
  "userId": "<user id>",          // kept alongside sub (both realms read userId today)
  "role": "super_admin|admin|manager|cashier",
  "userType": "platform|org",     // NEW canonical realm tag (v2)
  "posType": "pos",               // legacy tag — EMITTED AND ACCEPTED during transition
  "tenantId": "<text>",           // world identity (admins)
  "organizationId": 123,          // POS identity (pos_users)
  "jti": "<uuid>",                // optional NOW; enables revocation LATER
  "exp": ..., "iat": ...
}
```

Verifiers accept BOTH `userType` and legacy `posType` throughout the transition; issuance switches to v2 in Phase 1, consumption completes in Phase 5.

### 7.2 The one gate

`requireAuth({realm:'admin'|'pos', roles?, requireTenant?, allowQueryToken?})` — order of checks: signature → realm match → `is_active ∧ deleted_at IS NULL` (deactivation-gap fix) → role rank → tenant scope. Replaces all ~13 inline sites byte-compat (identical status codes + verbatim bodies, e.g. `"Account deactivated"` stays exact).

### 7.3 Role hierarchy (single source, both ends)

```
super_admin:100 > admin:80 > manager:50 > cashier:30
```

Domain pairing enforced INSIDE `requireAuth` BEFORE role evaluation (an org user can never satisfy an admin-role requirement and vice versa). Frontend mirrors the constant in `lib/rbac.ts`.

### 7.4 Tenant scoping canonical rule

Every identity resolves EXACTLY ONE tenantId at token issuance. Super-admin bypass matrix preserved (§5.5). Marketplace cross-tenant = READS ONLY.

### 7.5 Session lifecycle parity

- POS gains refresh: POST `/api/pos/auth/refresh` (rotating refresh, short access TTL option).
- `rehashIfNeeded` extended to `pos_users`.
- Step 2 (post-plan): D1-backed REVOCABLE `refresh_tokens` table `(id, user_type, user_id, tenant_id, token_hash SHA-256, jti, expires_at, revoked_at, replaced_by_jti, created_at)` — enables logout-everywhere and theft response; admin rotation-no-revocation retires then.
- Physical merge of `admins`/`pos_users` NOT scheduled (proven failure 0019→0028); logical unification only.

---

## 8. Unified API Contract

### 8.1 Case convention

Responses camelCase end-to-end (unchanged, `toCamel` choke point). Requests: NEW schemas camel-native; EXISTING camel-native request schemas (auth, payments, POS orders) remain unwrapped byte-compat. No mass rename of request payloads.

### 8.2 Response taxonomy (normalized, four shapes kept)

| Shape | Helper | Example routes |
|---|---|---|
| Domain object | `ok(data)` | GET /api/me, GET /api/orders/:id |
| Collection | `ok(paginationEnvelope)` | lists (converged in 8.4) |
| Mutation ack | `created(id?)` / `{success:true,id?}` | POST/PATCH/DELETE |
| Error | `validationError(...)` / `errorResponse` | all |

Normalization work: inventory `items` key mirrored as `data`; calculate-price returns HTTP 400 on missing params instead of `{total_price:0}` 200.

### 8.3 Error contract

`{success:false, error:"msg; msg", errors:[{field,message}]}` with LOCKED fragments `"Required"`, `"Invalid enum"`, plus auth fragments above. Registry adds the `errors[]` model.

### 8.4 Pagination convergence

`parsePagination` + `paginationEnvelope` everywhere; transitional `?raw=1` returns the legacy shape while consumers migrate; hardcoded LIMITs (POS orders 100) become configurable page sizes; tenants list gains pagination.

### 8.5 Endpoint set (≈48 routes)

| Group | Count | Notes |
|---|---|---|
| Auth | 9 | incl. NEW POST `/api/auth/pos-login` consolidation target (Phase 9) |
| Tenancy/admin | 8 | registry documents PATCH `/api/me` + GET `/api/tenants/public` |
| Catalog | 11 | products/categories/recipes/meals |
| Bookings | 8 | orders + availability + calculate-price(400 fix) |
| Payments | 3 | create-intent; create-checkout alias decided (remove) |
| CRM | 3 | leads (absorbs `/contact` as `source=contact`), feedback, inbox(+unread modeled) |
| Ops | 4 | shifts, stock, reports, uploads/media |
| Infra | 2 + openapi.json | health, sitemap data; SSE documented OUTSIDE OpenAPI by design (T8) |

Dead exports: delete 7 backend-less POS stubs + 28 uncalled exports + 6 compat aliases in Phase 0/9 (aliases only after a release cycle of zero calls).

### 8.6 Versioning

Mount consolidated routers at `/api/v1/*`; keep unversioned `/api/*` alias during cutover; `Sunset` headers announce deprecations. CRITICAL: versioned paths and the SSR fetcher must be updated TOGETHER — SSR depends on the `API_BACKEND` service binding (same-zone fetch 1042 fix, deployed 7df7aba4); mismatching them reproduces prod camp-page 302→/404. CI regenerates types from `openapi.json` and fails on drift.

---

## 9. Migration Plan (Phases 0–9)

> Merge map: FE = Frontend audit · BE = Backend audit · DB = Database audit · AU = Auth audit · API = Contract audit. Each master phase cites its source phases. Every phase ends with ALL FOUR suites green (three vitest + E2E) and a staging deploy.

### Phase 0 — Baseline & Hygiene (FE-P0 + BE-P0 + DB-P0 + AU-P0 + API-P0) — ~20h
1. Record baselines (test counts, tsc=153 errors, bundle sizes) in AGENT_LOGBOOK.
2. Pin contract tests around locked fragments and the four response shapes.
3. FE hygiene: delete junk dir `pages/camp/"[id]"`, delete 9 dead ui/ comps, fix 3 zone-guard violations (template ternaries), fix CampBooking hex bug, add ToastProvider to pos/login, dedupe luminance helpers.
4. BE hygiene: delete dead `tenantMiddleware`; decide+remove `create-checkout` alias; remove or wire `sendBookingConfirmationEmail` (decision: remove, tested-only); register missing routes in registry truth pass (PATCH /api/me, GET /api/tenants/public).
5. API truth: delete 7 backend-less POS stubs from `api.ts`; regenerate openapi.json/types.
6. DB preconditions: apply migration 0054 locally; verify FK targets in BOTH environments.
7. Update stale E2E spec `tests/e2e/specs/auth/tenant-admin-login.spec.ts` to the post-0028 world.

### Phase 1 — One Auth Gate (BE-P1 = AU-P1) — ~24h
1. Introduce `requireAuth` factory; token issuance adds `userType` (v2) alongside legacy claims.
2. Replace ~13 inline sites BYTE-COMPAT (payments ×3, meal-schedules ×2, pos-users ×2, stream/orders, catch-all, admin.js, tenants.js, pos-users.js handler gates).
3. Realm-first ordering fixes the 401-vs-403 quirk; every-request `is_active ∧ deleted_at` fixes the deactivation gap.
4. Exit: zero inline Authorization parsing outside sharedAuth/requireAuth; verbatim strings intact.

### Phase 2 — Database Cleanup (DB-A + DB-B1 + DB-B2) — ~14h [PARALLEL TRACK]
1. Migration **0055** (trigger hygiene): DROP `update_customer_stats_after_order`, `update_inventory_after_movement`, `update_customers_timestamp`; KEEP `update_users_timestamp`, `update_products_timestamp`.
2. Migration **0056**: drop the 27 Tier-A dead tables child-before-parent.
3. Migration **0057** + code edits: fix `inventory.js` LEFT JOIN + test fixture → drop `pos_categories`; switch `product_camps` readers → drop it; OPTIONAL sign-off → remove `ensureProductInProductsTable` shim → drop `products`.
4. Add the five missing indexes (§6.5). Every migration ends with `PRAGMA foreign_key_check`.
5. Deferred separately: DB-B3 (`pos_customers` drop needs `pos_transactions` rebuild — schedule with a maintenance window).

### Phase 3 — Contract Normalization (API-P1 + API-P2) — ~22h
1. `ok()`/`created()` helpers adopted; inventory `items` mirrored to `data`; calculate-price → 400.
2. Pagination convergence via `parsePagination`/`paginationEnvelope`; `?raw=1` transition flag; tenants list paginated; POS LIMIT 100 configurable.
3. Complete cascade deletes (add `meal_schedules`, `meal_lang`, `inbox_reads`, `price_overrides`).
4. Model `errors[]` + inbox unread in registry; regenerate types.

### Phase 4 — Router Consolidation & Middleware Unification (BE-P2 + BE-P4 + BE-P5 = API-P3) — ~36h
1. Convert Paradigm-B modules to Hono sub-routers one module at a time; catch-all shrinks to 404. Honor route-order rules (§5.1).
2. Declarative rate-limit table mounted (§5.4) — closes gaps, zero KV writes.
3. `resolveScope` formalized; kill `String(organization_id)` fallback; `ensureTenantOrg` centralized; marketplace READS-ONLY codified.

### Phase 5 — Token Contract v2 & Session Lifecycle Parity (BE-P3 = AU-P2) — ~16h
1. All issuance on v2 claims; consumers stop reading `posType`.
2. POS refresh endpoint + rotating refresh; `rehashIfNeeded` covers `pos_users`; optional shorter POS access TTL.
3. Design doc committed for the future revocable `refresh_tokens` table (implementation post-plan).

### Phase 6 — Frontend Session Kernel & Data-Layer Convergence (FE-P1 + FE-P2 = AU-P3 + AU-P4) — ~30h
1. Ship `lib/session.ts` (multi-realm, legacy-key seeding); apiFetch consumes it; TOKEN_KEY triplication deleted.
2. POS onto TanStack Query (namespaced keys, `queryClient.clear()` on auth transitions, remove dead-provider smell properly); admin panels off legacy hooks; TenantDrilldown bespoke client removed via tenant-scoped keys; ReservationSummary via apiFetch.
3. Single-source RBAC constant both ends.

### Phase 7 — Navigation Unification (FE-P3) — ~22h
1. Ship `lib/navigation.ts`; convert POS navs first (kill reloads); then admin `#tab=` hash→path with fallback parsing.
2. E2E specs updated in the same commits.

### Phase 8 — Shell Consolidation & Component Cleanup (FE-P4) — ~18h
1. Build `components/shell/{AppSidebar,AppTopbar,MobileBottomNav,LoginForm(realm)}`; adopt in POS then admin; preserve testids.
2. Promote `ui/icons.tsx`; adopt shared Modal in POS overlays (ReceiptModal, ShiftOverlay).

### Phase 9 — Realm/Resource Consolidation & Versioned Cutover (API-P4 + API-P5) — ~18h
1. Optional merges: POS login → POST `/api/auth/pos-login`; `/contact` → POST `/leads?source=contact`.
2. Mount consolidated routers at `/api/v1/*` + keep unversioned alias; update `resolveApiFetcher` IN THE SAME DEPLOY (1042 constraint); `Sunset` header policy.
3. Delete compat aliases after one release cycle of zero calls; final registry/type regen + docs.

---

## 10. Risk Assessment

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Gate replacement changes a status/body byte → silent client breakage | Med | High | Byte-compat mandate; contract tests pinned in Phase 0; verbatim fragments asserted |
| R2 | D1 migration breaks production (0042 precedent) | Low-Med | Critical | Create-copy-swap only; triggers dropped first; `foreign_key_check` final statement; stage → verify → prod |
| R3 | Cross-realm cache bleed when POS adopts React Query | Med | High | Namespaced keys + `queryClient.clear()` on ALL auth transitions |
| R4 | Mass logout during session-kernel swap | Med | Medium | Legacy-key seeding; both key names written during transition window |
| R5 | `/api/v1` cutover breaks SSR camp pages (1042 regression) | Med | High | `resolveApiFetcher` updated in SAME deploy; staging camp-page smoke before prod |
| R6 | Rate-limit activation blocks legit traffic (gaps newly enforced) | Low | Medium | Conservative table (§5.4); in-memory fallback retained; monitor via tail (`--config backend/wrangler.toml`) |
| R7 | KV quota exhaustion | Low | High | Plan adds ZERO KV writes; read caching stays header-only |
| R8 | Test-suite drift masks regressions across the three suites | Med | High | Run root+backend+app together every phase (T4); baselines recorded Phase 0 |
| R9 | `pos_categories`/fixture coupling discovered late | Med | Low | Pre-identified (inventory.js join + fixture builds own schema); handled inside 0057 |
| R10 | Role-hierarchy change alters authorization outcomes unexpectedly | Low | High | Pairing enforced inside requireAuth; mapping table unit-tested; super-admin matrix explicitly preserved |
| R11 | Scope-tightening (killing `String(organization_id)` fallback) surfaces latent tenant leaks | Med | Medium | Treat surfaced failures as bugs to fix, not reasons to revert; log + audit during Phase 4 |
| R12 | Effort overrun on Phase 4 (largest phase) | Med | Medium | Module-by-module conversion; each module independently shippable |

---

## 11. Effort Estimation

| Phase | Scope | Hours | ≈ Days |
|---|---|---|---|
| 0 | Baseline & Hygiene (all layers) | 20 | 2.5 |
| 1 | One Auth Gate | 24 | 3 |
| 2 | Database Cleanup (A/B1/B2) | 14 | 1.75 *(parallel track)* |
| 3 | Contract Normalization | 22 | 2.75 |
| 4 | Router Consolidation & Middleware Unification | 36 | 4.5 |
| 5 | Token v2 & Session-Lifecycle Parity | 16 | 2 |
| 6 | Frontend Session Kernel & Data Convergence | 30 | 3.75 |
| 7 | Navigation Unification | 22 | 2.75 |
| 8 | Shell Consolidation | 18 | 2.25 |
| 9 | Versioned Cutover & Consolidations | 18 | 2.25 |
| **Total** | | **≈220** | **≈27.5 dev-days** |

Calendar: **5–6 weeks sequential**; **~4 weeks** with Track A (backend phases 0–5) overlapping Track B (DB phase 2, then frontend phases 6–8) per §12. Excludes DB-B3 maintenance-window item and post-plan `refresh_tokens` build. Estimates assume one senior dev familiar with the codebase; add ~25% otherwise.

---

## 12. Dependencies

### Dependency graph

```
Phase 0 (baseline/hygiene)
   ├──→ Phase 1 (auth gate) ──→ Phase 4 (routers+middleware) ──→ Phase 5 (token v2) ──┐
   │              │                                                                    │
   │              └───────────────────────→ Phase 9 (v1 cutover) ←─────────────────────┘
   ├──→ Phase 2 (DB cleanup)  [parallel track]
   └──→ Phase 3 (contract normalization) ──→ Phase 4
                                                 │
Phase 1 ──→ Phase 6 (session kernel + data) ──→ Phase 7 (navigation) ──→ Phase 8 (shells)
```

### Ordering rules (what must precede what)

1. **Phase 0 first** — contract tests + baselines make every later phase safely verifiable; DB preconditions (0054 applied locally) gate migration 0055.
2. **Phase 1 → Phase 5**: token v2 consumption completes only after every consumer sits behind requireAuth.
3. **Phase 1 → Phase 6**: frontend session kernel consumes the stabilized realm semantics.
4. **Phase 3 → Phase 4**: normalization helpers exist before routers consolidate onto them.
5. **Phase 4 → Phase 9**: versioning mounts CONSOLIDATED routers, not the catch-all.
6. **Phase 6 → Phase 7 → Phase 8**: session store before navigation kernel before shells (each builds on the prior).
7. **Phase 2 independent** of Phases 1/3/4 except: DB-B3 (`pos_customers` drop) waits for a maintenance window and MUST land before or with any feature writing new FKs into `pos_customers` (none planned).
8. **E2E spec updates ride WITH the phase that changes the behavior they assert** (never batched later).
9. **Compat deletions** (aliases, legacy hook layer, unversioned alias removal) always follow a full release cycle of zero observed calls.

### Parallel tracks

- **Track A (backend)**: 0 → 1 → 3 → 4 → 5 → 9
- **Track B (db/frontend)**: 2 (after 0) ∥ then 6 → 7 → 8 (after 1)
- Join points: Phase 9 requires 4+5 done; Phase 8 completion + Phase 5 done unlock final type regen/docs in 9.

---

## Appendix A — Verification commands

```bash
cd backend && npx vitest run          # ~1082 tests / 36 files
npx vitest run                        # root integration 169 tests / 10 files
cd app && npx vitest run              # ~1465–1469 tests / 74 files
CI=true npx playwright test           # 552 passing / 14 env-skipped
./deploy.sh --staging                 # staging verification before production
wrangler tail --config backend/wrangler.toml
```

## Appendix B — Locked strings (do not change during migration)

`"Required"` · `"Invalid enum"` · `"Account deactivated"` · `"Invalid POS session"` · `"Forbidden: Access denied to this tenant partition"`

## Appendix C — Source-audit phase merge map

| Master phase | Source audits |
|---|---|
| 0 | FE-P0 · BE-P0 · DB-P0 · AU-P0 · API-P0 |
| 1 | BE-P1 = AU-P1 |
| 2 | DB-A + DB-B1 + DB-B2 (B3 deferred) |
| 3 | API-P1 + API-P2 |
| 4 | BE-P2 + BE-P4 + BE-P5 = API-P3 |
| 5 | BE-P3 = AU-P2 |
| 6 | FE-P1 + FE-P2 = AU-P3 + AU-P4 |
| 7 | FE-P3 |
| 8 | FE-P4 |
| 9 | API-P4 + API-P5 (+ BE-P6 registry/docs closure) |
