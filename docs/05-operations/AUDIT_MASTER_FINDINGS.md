# SinaiCamps — Master Audit Report (8-domain deep dive)

**Date:** 2026-09-05
**Mode:** READ-ONLY across all 8 audits. No source, test, or migration file was modified.
**Depth:** ~1,660 lines of findings across 8 domain reports (this file consolidates them).

| Report | Findings |
|---|---|
| `AUDIT_SECURITY_FINDINGS.md` | 1 HIGH · 5 MEDIUM · 6 LOW · ~6 INFO |
| `AUDIT_BACKEND_QUALITY_FINDINGS.md` | 1 HIGH · 5 MEDIUM · 5 LOW |
| `AUDIT_DATABASE_FINDINGS.md` | 2 P1 · 2 P2 · 3 P3 (+ green migration chain) |
| `AUDIT_FRONTEND_FINDINGS.md` | 3 MED · ~13 LOW/INFO (+ 3 historically-dangerous bugs confirmed fixed) |
| `AUDIT_TEST_COVERAGE_FINDINGS.md` | 11 untested modules · 1 regression · 230 masked tests |
| `AUDIT_E2E_GAPS_FINDINGS.md` | 23 panels zero-coverage · 8 high-risk endpoint gaps |
| `AUDIT_PERFORMANCE_FINDINGS.md` | 8 N+1/loop incidents · 2 index gaps · bundle/island issues |
| `AUDIT_TS_DEPS_FINDINGS.md` | 426 tsc errors · 0 critical CVEs · 2 prod-sensitive advisories |

---

# PART 1 — TOP PRIORITY FINDINGS (deploy-blocking / money / data-integrity)

## P0.1 🔴 CRITICAL-PATH: SQL injection — `POST /api/onboarding/tenant`
- **Where:** `backend/src/api/onboarding.js:237-252`
- **What:** Body keys are interpolated as SQL column names (`updates.push(\`${key} = ?\`)`) with no zod validation; only values are bound. Attacker-controlled keys = arbitrary `UPDATE tenants`.
- **Mitigating precondition:** requires a valid `onboarding_token`, which IS returned to clients in HTTP bodies (`onboarding.js:101`, `:211`) and is **never rotated/cleared** after onboarding — so any stale/leaked token grants persistent tenant-row tampering.
- **Fix (task):** zod `.strip()` whitelist schema (mirror `setupSchema`), clear `onboarding_token` on completion, add expiry.

## P0.2 🔴 HIGH: `sanitizeInput()` is a silent no-op — zero XSS sanitization actually runs
- **Where:** `backend/src/middleware/sanitize.js:87` mounted at `backend/src/index.js:143`
- **What:** `c.req = new Request(...)` throws on Hono 4.12.31 (`Context#req` is getter-only); `catch {}` swallows it → **original unsanitized body proceeds**. Every mutating request is also cloned+parsed twice for nothing.
- **Fix (task):** remove the middleware, or implement genuine at-handler sanitization; drop the swallowing try/catch.

## P0.3 🔴 HIGH: Public storefront leaks `cost_price` (and `SELECT *` on public reads)
- **Where:** `backend/src/api/storefront.js:76,99-100` — `GET /api/storefront/products` + `/products/:id` are **unauthenticated** and use `SELECT *` exposing `pos_products.cost_price` (business margin) to any visitor.
- **Fix (task):** explicit column projection omitting `cost_price`.

## P0.4 🔴 HIGH: `orders.kitchen_status` CHECK omits `'canceled'` → PATCH /api/orders/:id/kitchen-status 500s
- **Where:** `backend/migrations/0069_restaurant_tables.sql:47` (also `pos_transactions.kitchen_status` at `:55`) vs code `orders.js:515-569` + zod `'canceled'`.
- **What:** Frontend cancel-kitchen-ticket always ends in a SQLite CHECK violation → generic 500. Unit tests pass because they mock the UPDATE (never enforce the real CHECK).
- **Fix (task):** new migration relaxing the CHECK to include `'canceled'`; keep code/zod in sync. Also add a real (non-mocked) DB-level test.

## P0.5 🔴 HIGH: `/api/services/public/:slug` queries columns that don't exist on `tenants`
- **Where:** `backend/src/api/services.js:440` — `SELECT id, name FROM tenants WHERE slug = ? AND is_active = 1`; `tenants` has **neither column**. Mounted at `index.js:509` → every hit 500s.
- **Fix (task):** resolve against `service_definitions.slug` (or `tenants.subdomain/custom_domain`).

## P0.6 🔴 HIGH: Public signup mints live, loginnable, unverified admins
- **Where:** `backend/src/api/onboarding.js:87-90` — `is_active = 1`, `password: z.string().min(6)`, no email verification (the "Check your email" message sends nothing), no captcha.
- **Fix (task):** `is_active = 0` + approval (mirror `/api/auth/register`), password min 8, add Turnstile/captcha (see P1.4) or invite-only.

---

# PART 2 — P1 / MEDIUM consolidated backlog (fix order)

| # | Area | Severity | Finding | Location |
|---|---|---|---|---|
| M1 | Security | MED | Client-controlled pricing on public reservations (`unit_price` accepted verbatim into totals) | `reservations.js:29,228` |
| M2 | Security | MED | Mixed tenant-scoping column (`tenant_id` vs `organization_id`) across POS/storefront modules — isolation degrades to best-effort | `pos-barcode.js:21`, `admin-supply.js:31`, `routes/pos/index.js:47,107,550…` |
| M3 | Security | MED | Feature flags are window dressing: `FEATURE_USER_REGISTRATION`/`FEATURE_TWO_FACTOR_AUTH` have zero code usages; no captcha; no 2FA exists | `wrangler.toml [vars]`, `admin-settings.js:57-76` |
| M4 | Backend | MED | 3 super-admin endpoints return raw Zod `issues` instead of `validationError(parsed)` → broken `{field,message}` wire shape | `admin-settings.js:150`, `admin-subscriptions.js:141`, `admin-payouts.js:78` |
| M5 | Backend | MED | `meal-plans.js` router is unmounted; `index.js:700-737` inlines a duplicate — tests cover code that never runs | `meal-plans.js`, `index.js:700-737` |
| M6 | Backend | MED | `priceOverrides.js` bulk upsert is non-atomic (per-entry writes, mid-loop 400 = partial write) | `priceOverrides.js:76-98` |
| M7 | Backend | MED | 5 pagination envelope dialects (`{data,total,page,pageSize,hasMore}` vs `{items,total,page,limit}` etc.) — frontend special-cases per endpoint | `storefront.js:90`, `inventory.js:40`, `admin-settings.js:229`, `admin-payouts.js:58-62` |
| M8 | Backend | MED | 4 modules hand-roll validation instead of Zod `safeParse` (inconsistent error shape); marketplace review POST is a public write with no rate limit | `inventory.js:108`, `marketplace.js:141`, `upload.js:84`, `priceOverrides.js:60` |
| M9 | DB | P1 | `pos_customers.name` generated column silently lost in migration 0040 rebuild (dormant today — no readers) | `0040:16-62` vs `0016:5` |
| M10 | DB | P1 | Admin audit filters/docs omit `'order'`/`'pos_table'` entity types (DB CHECK allows them, API 400s) | `admin-audit.js:31`, `audit.js:36,66-70` |
| M11 | Frontend | MED | 4th public island (`MarketplaceDirectory client:load`) beyond documented 3; sibling `/camps` is fully SSR | `app/src/pages/marketplace.astro:14` |
| M12 | Frontend | MED | Raw `fetch()` + bare `localStorage` in admin component (T13 deviation, justified for blob but out of contract) | `app/src/components/admin/AuditLogPanel.tsx:85-86` |
| M13 | Frontend | MED | Unlabeled search input on tenant menu (a11y) | `app/src/components/public/TenantMenu.tsx:289` |
| M14 | Perf | MED | **N+1 double loop on POS order create** (per item → per recipe → per ingredient stock) — hot write path | `routes/pos/index.js:542-565` |
| M15 | Perf | MED | N+1 reads on financials list + public services catalog | `financials.js:239-244`, `services.js:451-456` |
| M16 | Perf | MED | Sequential in-loop writes could be `DB.batch` (no abort semantics) | `supply.js:399-417,547-558`, `hr.js:383-389` |
| M17 | Perf | MED | Index gaps: `leave_balances (tenant_id, year)`; `pos_stores (organization_id)` | `hr.js:326-330`, `pos/index.js:585` |
| M18 | Perf | MED | `SystemHealthPanel` 369KB lazy chunk (recharts — its ONLY consumer) blows the 300KB/js budget | `app/src/components/ui/LineChart.tsx`, `AdminApp.tsx:60+` |
| M19 | Perf | MED | AnalyticsPanel fires all 8 report queries on mount; 8-way `loading` OR gates the whole panel | `AnalyticsPanel.tsx:90-123` |
| M20 | Tests | MED | **11 backend modules with zero test coverage** (all super-admin mirrors: admin-ai/crm/hr/supply/storefront/audit/health/performance/reports/subscriptions/users) | `backend/src/api/admin-*.js` |
| M21 | Tests | MED | Regression: `tests/core/migration-integrity.test.js` — 20 unsafe `DROP TABLE` (no `IF EXISTS`) in 11 migrations | `0014/0039/0040/0042/0046/0047/0054/0069/0091` |
| M22 | Tests | MED | Live integration suite can't pass clean-checkout (403 no seeded Super Admin) → **230 tests masked** | `tests/globalSetup.ts`, `vitest.integration.config.ts` |

---

# PART 3 — E2E coverage gaps (highest business risk first)

| Risk | Gap | Evidence |
|---|---|---|
| **CRITICAL** | **Online payment confirmation has zero happy-path E2E**: create-intent → confirm → webhook (Stripe + Paymob public-reservations webhook). Only a 401 negative test exists. Money path untested. | `api-comprehensive.spec.ts:34` |
| HIGH | **Payout lifecycle fully unexercised** (eligible → create → pay → cancel; all 5 `/api/admin/payouts` routes) + `super_financials` panel | no spec references |
| HIGH | **Public booking funnel never converts into a server-side order** — guest flow stops at WhatsApp/Copy-Summary | `public/booking-submission.spec.ts` |
| HIGH | **Order mutation semantics untested**: state transitions, cancel, delete all stop at "modal opens" | `admin-orders.spec.ts:56,111,132` |
| MED | Low-stock journey (threshold → alert → replenish → clears panel) untested | `supermarket-flow.spec.ts:step2` (load only) |
| MED | SSE live broadcast (Durable Object `BROADCASTER`) never exercised with a real EventSource — inbox/kitchen push relies on polling in tests | `inbox.spec.ts` |
| MED | **10 tenant panels with zero E2E**: calendar, analytics, staff, financials, hr, supply, crm, storefront, ai, billing | panel×spec matrix (§b) |
| MED | **13 of 16 super panels have no real assertion** (navigation/deep-dive click tabs but cap at 8 and assert content-area-visible only) | `navigation.spec.ts`, `deep-dive.spec.ts:164` |
| LOW | Promotion CRUD, tenant hard-delete via UI, shift-close edge cases (unpaid orders / double-close / reconciliation mismatch) | §(c)/(d) |

---

# PART 4 — TypeScript & dependency debt

| Area | Verdict |
|---|---|
| `tsc --noEmit` | **426 errors**: 97 src (90 non-story) + 329 tests + 7 stories. 77% is test-fixture debt |
| Worst src hotspots | `TenantPerformancePanel.tsx` (22), `SystemHealthPanel.tsx` (20), `SuperReportsPanel.tsx` (10), `SubscriptionsPanel.tsx` (9), `AuditLogPanel.tsx` (7) — all nullable-shape/implicit-any on untyped query results |
| `src/lib/api-types.ts` | ✅ clean (0 errors) |
| TS escape hatches | 0 × `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck`; only 3 `eslint-disable` |
| `any` | 107 substring matches; **`HRPanel.tsx` = 36 (34%)** — dominant concentration |
| Strictness | `strict: true` via `astro/tsconfigs/strict`, actively enforcing |
| React types | runtime `react@19.2.8` vs `@types/react` 18.3.x — types a full major behind |
| npm audit | **0 critical** all 3 manifests |
| Prod-sensitive advisories | **`hono` 4.12.31 → 4 advisories** (incl. `memo()` SSR cross-user disclosure) fixed in ≥4.12.34 — patch-only; **`astro` → REMEDIATED on `feat/astro-7`** (5.18.2 → **7.3.1** clears its SSRF/XSS HIGHs; `@astrojs/cloudflare` 12→**14.3.0** clears the SSRF/image-binding advisory) |
| Transitive pattern | every manifest: `wrangler → miniflare → undici/ws` (dev-only) |
| Outdated majors | ✅ astro 5→7 **and** @astrojs/cloudflare 12→14 **done** on `feat/astro-7`; remaining: vite 6→8, TS 5→7, storybook 8→10, eslint 9→10, zod 3→4 (backend), hono-zod-openapi/zod-to-openapi majors, vitest 4→5, jsdom 25→30, better-sqlite3 12→13 |

---

# PART 5 — GREEN LIGHTS (verified healthy — do not regress)

**Security/RBAC**
- Single `requireAuth` gate; per-request DB `is_active` re-check; tenant admins hard-scoped; super-admin `?tenantId=` override by design.
- All other dynamic `SET`/`WHERE` builders use hardcoded `'col = ?'` + bound values — the onboarding injection is the **only** one.
- Paymob webhook: HMAC-SHA-256 verified on raw body, tenant-scoped, idempotent ledger INSERT.
- POS pricing is server-side (`pos_products.selling_price`), quantity capped, atomic stock decrement, idempotency dedupe.
- bcrypt cost 12; no secrets committed; CORS regex `^https://[^.]+\.sinaicamps\.com$` correct; `hono/cors` single source of truth.

**Database**
- 91/91 migrations sequential & fully applied; `PRAGMA foreign_key_check` = 0 violations.
- ~167 indexes cover every hot query — only 2 real gaps (M17).
- Generated `pos_users.name` intact; booking lifecycle uses two-L `'cancelled'`, kitchen one-L `'canceled'` — the only spelling mismatch is the CHECK bug (P0.4).

**Frontend**
- The 3 historically-dangerous bugs are **confirmed fixed and holding**: T3 render-loop (super-admin crash), T5 toast deferral (`useQueryHooks.ts:142-144`), 8-digit-hex hydration landmine.
- Zero `dangerouslySetInnerHTML`; `escHtml()` used 67×, `normalizeAssetUrl()` 39× — user data escaping contract holds.
- T13 migration held: raw `fetch` data loads eliminated except the justified blob download (M12).
- No render-phase setState; no prop mutation; strict-mode zone guards all use template ternaries.

**Tests**
- Backend unit **1,988/1,988 pass** (72 files) · Frontend unit **3,489/3,489 pass** (137 files) · Root unit **158/158 pass** (10 files).
- Expansion pillars: backend 225 tests / 7 files, frontend 528 tests / 14 files — all pass, **zero weak-test patterns** (no `.skip`, `.only`, `expect(true)` padding).
- E2E suite: 850+ passing specs covering POS shift lifecycle, cash checkout, and admin CRUD for rooms/meals/rateplans (strongest).
- Coverage thresholds configured (backend functions 100/lines 99; frontend functions 99/lines 99).

**Performance/Architecture**
- 4-layer isolation intact: **0 direct D1/KV references in `app/src`**.
- `KV_CACHE.put` = 0; rate-limit KV path correctly disabled (free-plan quota exhaustive).
- SSE broadcaster has zero DB access, poll-free, correct heartbeat/eviction.
- `DB.batch` already used in 27 places; response-header split correct (`no-store` vs `public, max-age`).

---

# PART 6 — RECOMMENDED FIX SEQUENCE (proposed — needs your go-ahead)

**Wave 1 — Security & correctness fires (deploy-blocking)**
1. P0.1 Onboarding SQL injection → zod `.strip()` whitelist + clear token
2. P0.2 Remove/fix `sanitizeInput` no-op middleware
3. P0.3 Storefront column projection (drop `cost_price`)
4. P0.4 `orders.kitchen_status` CHECK migration + real DB-level test
5. P0.5 `services.js` slug lookup fix
6. P0.6 Signup verification + password 8 + captcha (or invite-only)

**Wave 2 — Data integrity & quality**
7. M1 Server-side pricing on reservations (derive from `pos_products.selling_price`)
8. M9 `pos_customers.name` restoration migration (when readers exist)
9. M10 audit entity-type filter/docs fix
10. M21 `IF EXISTS` on 20 DROP TABLE statements
11. M4 raw-Zod → `validationError` (3 sites)
12. M5 mount meal-plans router / delete inline copy
13. M6 `priceOverrides` atomic batch

**Wave 3 — Performance & frontend**
14. M14 POS order-create N+1 flatten (2 queries + JS map)
15. M17 index migration (`leave_balances`, `pos_stores`)
16. M15/M16 IN-queries + `DB.batch` for financials/services/supply/hr
17. M11 `/marketplace` island → `client:visible` or SSR fold
18. M18 recharts split/swap (SystemHealthPanel 369KB)
19. M19 AnalyticsPanel per-tab `enabled`-gating
20. M12 `exportAuditLog()` in `lib/api.ts` (T13 contract)
21. M13 TenantMenu aria-label

**Wave 4 — Debt & coverage**
22. M20 unit tests for 11 super-admin modules (use `admin-financials-unit.test.js` as template)
23. M22 seed step for integration suite (unmask 230 tests)
24. M2 tenant-scoping unification (add CHECK constraint via `tenant_org_mapping`)
25. M8 Zod for 4 hand-rolled validators + rate-limit marketplace reviews
26. M7 pagination envelope unification
27. tsc: fix 5 src hotspots (97 → ~0 src errors), then test-fixture debt (329)
28. React 18 typings → 19 typings; `hono` ≥4.12.34 patch; ✅ **astro 7.x upgrade EXECUTED on `feat/astro-7`** (7.3.1 + @astrojs/cloudflare 14.3.0 + @astrojs/react 6.0.5, Pages→Workers deploy; see `ASTRO_DEPLOY_CUTOVER.md`)
29. E2E: online-payment happy path, payout lifecycle, public-booking→order conversion, 23 blind panels
30. Sweep: delete 9 dead frontend files, dead modules (`admin-users.js`/`admin-stats.js`), dead table `tenant_usage`, `key={index}` lists, a11y label pass, `Math.random()` refs → crypto

**Deferred/decision items**
- `s-maxage`/cache-rule for public catalogue (D7) — browser-only caching is currently the documented intent.
- `FEATURE_*` flags — wire 2FA/captcha or remove the flags.
- TS 7 upgrade — plan as a dedicated migration task (astro 7.x already done).
- Staging/prod deploy remains blocked on user re-running `wrangler login` (Cloudflare OAuth) — audit changes are report-only, nothing pending deploy.