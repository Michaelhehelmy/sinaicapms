---
title: "SinaiCamps — Master Audit Report (8-domain deep dive)"
aliases:
tags:
  - type/audit
  - audience/owner
  - audience/developer
  - domain/operations
  - domain/audit
  - status/archived
created: 2026-09-06
updated: 2026-10-06
relates-to:
  - "[[05-operations/README]]"
  - "[[98-history/audits/AUDIT_SECURITY_FINDINGS]]"
  - "[[98-history/audits/AUDIT_BACKEND_QUALITY_FINDINGS]]"
  - "[[98-history/audits/AUDIT_DATABASE_FINDINGS]]"
  - "[[98-history/audits/AUDIT_FRONTEND_FINDINGS]]"
  - "[[98-history/audits/AUDIT_TEST_COVERAGE_FINDINGS]]"
  - "[[98-history/audits/AUDIT_E2E_GAPS_FINDINGS]]"
  - "[[98-history/audits/README]]"
code-references:
  - "backend/src/api/onboarding.js:22,31-38,149,259,292-295"
  - "backend/src/index.js:149"
  - "backend/src/api/storefront.js:73-76"
  - "backend/migrations/0002_orders.sql:29"
  - "backend/migrations/0004_pos.sql:156"
  - "backend/src/api/orders.js:515-569"
  - "backend/src/api/services.js:443-450"
  - "backend/src/api/pos-barcode.js:21"
  - "backend/src/api/admin-supply.js:31"
  - "backend/src/api/admin-settings.js:57-76"
  - "backend/src/api/admin-subscriptions.js:141"
  - "backend/src/api/admin-payouts.js:78"
  - "backend/src/api/meal-plans.js"
  - "app/src/pages/marketplace.astro:14"
  - "app/vitest.config.ts:35-40"
  - "backend/vitest.config.ts:21-30"
  - "tests/core/migration-integrity.test.js:76-91"
verified: never
---
# SinaiCamps — Master Audit Report (8-domain deep dive)

**Date:** 2026-09-05
**Mode:** READ-ONLY across all 8 audits. No source, test, or migration file was modified.
**Depth:** ~1,660 lines of findings across 8 domain reports (this file consolidates them).

> ## Status as of 2026-10-06 — read this before the findings
>
> **Everything below is a 2026-09-05 record and is kept verbatim.** Parts of it are
> superseded, and an archived audit that reads in the present tense becomes a work
> queue. This block says which parts, with the evidence:
>
> | Section | Status |
> |---|---|
> | **PART 1 — all six P0s** | ✅ **Fixed in-tree.** Every one has a fix in the code with a comment naming the finding: P0.1 `onboarding.js:31-38` (zod `.strip()` whitelist) + token cleared at `:259`; P0.2 `sanitize.js` deleted, removal note at `index.js:149`; P0.3 `storefront.js:73-76` explicit public projection; P0.4 CHECK now includes `'canceled'` at `0002_orders.sql:29` / `0004_pos.sql:156`; P0.5 `services.js:443-450` resolves `subdomain` + `status`; P0.6 `onboarding.js:22` `min(8)` + `is_active` gate at `:123`. |
> | **PART 2 — M3** | ⚪ **Moot** — `FEATURE_USER_REGISTRATION` / `FEATURE_TWO_FACTOR_AUTH` no longer exist in `backend/` or `app/src`, `backend/wrangler.toml` included. |
> | **PART 2 — M11** | ⚠️ **Wrong** — `marketplace.astro:14` is `client:visible`, not `client:load`, and the public-island world is 9 sites, not 3+1. See `ARCHITECTURE.md` §3. |
> | **PART 2 — M21** | ✅ **Resolved** — see the corrected row; the applied lineage has **2** unsafe `DROP TABLE` statements and the gate's regex also matches SQL comments. |
> | **PART 4 — `tsc --noEmit`** | ⚠️ **Superseded** — 426 → **0** on 2026-09-06 (`T33 TEST-FIXTURE TSC DEBT: DONE`), and 2 pre-existing as of 2026-10-03. The row also predates `tsc`'s inability to see `.astro` at all. |
> | **PART 4 — coverage thresholds** | ⚠️ **Backend half wrong** — see the corrected row. |
> | **PART 5 — test counts** | ⚠️ **Superseded** — three runs stale, and no commit was named. See the corrected rows. |
> | **PART 5 — migration count** | ⚠️ **Superseded** — the applied lineage is 40 top-level files, head `0127`; 91 was the pre-squash count and 99 is the excluded `legacy/` size. |
> | **PART 5 — `escHtml` / `DB.batch` / indexes** | ⚠️ **Superseded** — see the corrected rows. |
> | **PART 6 — the fix sequence** | ✅ **Wave 1 is spent** (all six P0s above). Waves 2–4 were executed as Wave 3 / Wave 4 exit reports in [[98-history/sessions/AGENT_LOGBOOK_HISTORY]]. The section is kept as the record of what was proposed. |
>
> **The eight per-domain reports this consolidates** are at [[98-history/audits/README]]. Nothing
> here is an open work queue; the live operational document is [[RUNBOOK]].

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
- ✅ **FIXED (T1)** — `- **Where:**` was `backend/src/api/onboarding.js:237-252`; the fix is the `tenantUpdateSchema` whitelist at `:31-38` (`z.object({…}).strip()`), applied at `:292-295`, and the token is cleared on completion at `:259`.
- **What:** Body keys are interpolated as SQL column names (`updates.push(\`${key} = ?\`)`) with no zod validation; only values are bound. Attacker-controlled keys = arbitrary `UPDATE tenants`.
- **Mitigating precondition:** requires a valid `onboarding_token`, which IS returned to clients in HTTP bodies (`onboarding.js:149`) and is **never rotated/cleared** after onboarding — so any stale/leaked token grants persistent tenant-row tampering.
- **Fix (task):** zod `.strip()` whitelist schema (mirror `setupSchema`), clear `onboarding_token` on completion, add expiry.

## P0.2 🔴 HIGH: `sanitizeInput()` is a silent no-op — zero XSS sanitization actually runs
- ✅ **DONE** — `- **Where:**` was `backend/src/middleware/sanitize.js:87` mounted at `backend/src/index.js:143`; **the file is deleted** and the removal note is at `index.js:149`.
- **What:** `c.req = new Request(...)` throws on Hono 4.12.31 (`Context#req` is getter-only); `catch {}` swallows it → **original unsanitized body proceeds**. Every mutating request is also cloned+parsed twice for nothing.
- **Fix (task):** remove the middleware, or implement genuine at-handler sanitization; drop the swallowing try/catch.

## P0.3 🔴 HIGH: Public storefront leaks `cost_price` (and `SELECT *` on public reads)
- ✅ **FIXED (T3)** — `- **Where:**` was `backend/src/api/storefront.js:76,99-100`; the public path now selects `PUBLIC_PRODUCT_COLUMNS` (`:73-76`), an explicit projection that omits `cost_price`.
- **What:** `GET /api/storefront/products` + `/products/:id` are **unauthenticated** and use `SELECT *` exposing `pos_products.cost_price` (business margin) to any visitor.
- **Fix (task):** explicit column projection omitting `cost_price`.

## P0.4 🔴 HIGH: `orders.kitchen_status` CHECK omits `'canceled'` → PATCH /api/orders/:id/kitchen-status 500s
- ✅ **FIXED** — the cited `backend/migrations/0069_restaurant_tables.sql:47` **exists only under `backend/migrations/legacy/`**, the excluded pre-squash lineage. The CHECK an operator finds today is `backend/migrations/0002_orders.sql:29` (`orders`) and `backend/migrations/0004_pos.sql:156` (`pos_transactions`), and both already include `'canceled'`.
- **What:** Frontend cancel-kitchen-ticket always ends in a SQLite CHECK violation → generic 500. Unit tests pass because they mock the UPDATE (never enforce the real CHECK).
- **Fix (task):** new migration relaxing the CHECK to include `'canceled'`; keep code/zod in sync. Also add a real (non-mocked) DB-level test.

## P0.5 🔴 HIGH: `/api/services/public/:slug` queries columns that don't exist on `tenants`
- ✅ **FIXED (T5)** — `- **Where:**` was `backend/src/api/services.js:440`; the query is now `services.js:443-450` (`WHERE subdomain = ? AND status = 'active' AND (deleted_at IS NULL OR deleted_at = '')`).
- **What:** `SELECT id, name FROM tenants WHERE slug = ? AND is_active = 1`; `tenants` has **neither column**. Mounted at `index.js:509` → every hit 500s.
- **Fix (task):** resolve against `service_definitions.slug` (or `tenants.subdomain/custom_domain`).

## P0.6 🔴 HIGH: Public signup mints live, loginnable, unverified admins
- ✅ **FIXED (T6)** — `- **Where:**` was `backend/src/api/onboarding.js:87-90`; password is now `z.string().min(8)` at `:22` and the admin row is INSERTed **inactive** at `:123`, flipped by the setup flow.
- **What:** `is_active = 1`, `password: z.string().min(6)`, no email verification (the "Check your email" message sends nothing), no captcha.
- **Fix (task):** `is_active = 0` + approval (mirror `/api/auth/register`), password min 8, add Turnstile/captcha (see P1.4) or invite-only.

---

# PART 2 — P1 / MEDIUM consolidated backlog (fix order)

| # | Area | Severity | Finding | Location |
|---|---|---|---|---|
| M1 | Security | MED | Client-controlled pricing on public reservations (`unit_price` accepted verbatim into totals) | `reservations.js:29,228` |
| M2 | Security | MED | Mixed tenant-scoping column (`tenant_id` vs `organization_id`) across POS/storefront modules — isolation degrades to best-effort | `pos-barcode.js:21`, `admin-supply.js:31`, `routes/pos/index.js:47,107,550…` |
| M3 | Security | MED | ⚪ **MOOT (2026-10-06)** — ~~Feature flags are window dressing: `FEATURE_USER_REGISTRATION`/`FEATURE_TWO_FACTOR_AUTH` have zero code usages~~ — neither flag exists anywhere in `backend/` or `app/src`, `backend/wrangler.toml [vars]` included, so the premise is gone. **No 2FA and no captcha exist**, which is the part still worth knowing. | was `wrangler.toml [vars]`, `admin-settings.js:57-76` |
| M4 | Backend | MED | 3 super-admin endpoints return raw Zod `issues` instead of `validationError(parsed)` → broken `{field,message}` wire shape | `admin-settings.js:150`, `admin-subscriptions.js:141`, `admin-payouts.js:78` |
| M5 | Backend | MED | `meal-plans.js` router is unmounted; `index.js:700-737` inlines a duplicate — tests cover code that never runs | `meal-plans.js`, `index.js:700-737` |
| M6 | Backend | MED | `priceOverrides.js` bulk upsert is non-atomic (per-entry writes, mid-loop 400 = partial write) | `priceOverrides.js:76-98` |
| M7 | Backend | MED | 5 pagination envelope dialects (`{data,total,page,pageSize,hasMore}` vs `{items,total,page,limit}` etc.) — frontend special-cases per endpoint | `storefront.js:90`, `inventory.js:40`, `admin-settings.js:229`, `admin-payouts.js:58-62` |
| M8 | Backend | MED | 4 modules hand-roll validation instead of Zod `safeParse` (inconsistent error shape); marketplace review POST is a public write with no rate limit | `inventory.js:108`, `marketplace.js:141`, `upload.js:84`, `priceOverrides.js:60` |
| M9 | DB | P1 | `pos_customers.name` generated column silently lost in migration 0040 rebuild (dormant today — no readers) | `0040:16-62` vs `0016:5` |
| M10 | DB | P1 | Admin audit filters/docs omit `'order'`/`'pos_table'` entity types (DB CHECK allows them, API 400s) | `admin-audit.js:31`, `audit.js:36,66-70` |
| M11 | Frontend | MED | ⚠️ **WRONG (2026-10-06)** — ~~4th public island (`MarketplaceDirectory client:load`) beyond documented 3~~. `app/src/pages/marketplace.astro:14` is **`client:visible`**, and the public-facing census is **9 island sites** (6 `client:visible` + 3 `client:load`) plus 8 `client:only` SPA hosts — see `ARCHITECTURE.md` §3. The "documented 3" world no longer exists; "fix it" below is therefore moot. | `app/src/pages/marketplace.astro:14` |
| M12 | Frontend | MED | Raw `fetch()` + bare `localStorage` in admin component (T13 deviation, justified for blob but out of contract) | `app/src/components/admin/AuditLogPanel.tsx:85-86` |
| M13 | Frontend | MED | Unlabeled search input on tenant menu (a11y) | `app/src/components/public/TenantMenu.tsx:289` |
| M14 | Perf | MED | **N+1 double loop on POS order create** (per item → per recipe → per ingredient stock) — hot write path | `routes/pos/index.js:542-565` |
| M15 | Perf | MED | N+1 reads on financials list + public services catalog | `financials.js:239-244`, `services.js:451-456` |
| M16 | Perf | MED | Sequential in-loop writes could be `DB.batch` (no abort semantics) | `supply.js:399-417,547-558`, `hr.js:383-389` |
| M17 | Perf | MED | Index gaps: `leave_balances (tenant_id, year)`; `pos_stores (organization_id)` | `hr.js:326-330`, `pos/index.js:585` |
| M18 | Perf | MED | `SystemHealthPanel` 369KB lazy chunk (recharts — its ONLY consumer) blows the 300KB/js budget | `app/src/components/ui/LineChart.tsx`, `AdminApp.tsx:60+` |
| M19 | Perf | MED | AnalyticsPanel fires all 8 report queries on mount; 8-way `loading` OR gates the whole panel | `AnalyticsPanel.tsx:90-123` |
| M20 | Tests | MED | **11 backend modules with zero test coverage** (all super-admin mirrors: admin-ai/crm/hr/supply/storefront/audit/health/performance/reports/subscriptions/users) | `backend/src/api/admin-*.js` |
| M21 | Tests | MED | ✅ **RESOLVED (2026-10-06), with a residue worth knowing** — ~~20 unsafe `DROP TABLE` (no `IF EXISTS`) in 11 migrations: `0014/0039/0040/0042/0046/0047/0054/0069/0091`~~. **All eleven cited files live in the excluded `backend/migrations/legacy/` lineage, and every one of their drops uses `IF EXISTS`.** In the applied top-level lineage there are exactly **2** unsafe statements — `0108_add_meals_project_id.sql:68` (drops the `_0108_project_guard` helper the same file creates) and `0115_rooms_new_tenant_not_null_fk.sql:108` (drops `rooms_new`) — so nothing can fail on a clean lineage. The gate that polices this, `tests/core/migration-integrity.test.js:76-91`, greps the **raw file text**, so 4 SQL `--` comments (`0107:53`, `0111:42`, `0112:374`, `0126:96`) also match and its `expect(unsafeDrops.length).toBe(0)` counts 6, not 2. | was `0014/0039/0040/0042/0046/0047/0054/0069/0091`; now `0108:68`, `0115:108` |
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
| `tsc --noEmit` | ⚠️ **SUPERSEDED (2026-10-06): 426 errors → 0.** The `T33 TEST-FIXTURE TSC DEBT: DONE (329 → 0)` entry (2026-09-06, `AGENT_LOGBOOK_HISTORY.md`) records `npx tsc --noEmit` → **0 errors total, src + tests**; the newest recorded run (2026-10-03, `88f307a`) reports the same **2 pre-existing** errors in `app/tests/unit/tenant-name-escape.test.tsx`. **And `tsc` never saw most of this file's src debt anyway** — it does not type-check `.astro`, and `@astrojs/check` is not installed here (`npx astro check` prompts, so it is never run). |
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
| Coverage thresholds | ⚠️ **BACKEND HALF WRONG (2026-10-06).** Configured thresholds are `backend/vitest.config.ts:21-30` = **83 statements / 72 branches / 89 functions / 89 lines** (re-baselined 2026-09 to the measured floor, per that file's own comment) — **not** "functions 100 / lines 99". The frontend half was right: `app/vitest.config.ts:35-40` = 95 / 80 / 99 / 99. **A configured threshold is not a passing gate**: the 2026-10-02 workstream-closure log records the `app` gate **red** on 3 of 4 (94.58 stmts vs 95, 94.86 funcs vs 99, 95.65 lines vs 99; branches pass 83.85 vs 80) and byte-identically red at both ends of that wave, i.e. pre-existing. Plain `npx vitest run` does not evaluate them. |

---

# PART 5 — GREEN LIGHTS (verified healthy — do not regress)

**Security/RBAC**
- Single `requireAuth` gate; per-request DB `is_active` re-check; tenant admins hard-scoped; super-admin `?tenantId=` override by design.
- All other dynamic `SET`/`WHERE` builders use hardcoded `'col = ?'` + bound values — the onboarding injection is the **only** one.
- Paymob webhook: HMAC-SHA-256 verified on raw body, tenant-scoped, idempotent ledger INSERT.
- POS pricing is server-side (`pos_products.selling_price`), quantity capped, atomic stock decrement, idempotency dedupe.
- bcrypt cost 12; no secrets committed; CORS regex `^https://[^.]+\.sinaicamps\.com$` correct; `hono/cors` single source of truth.

**Database**
- ⚠️ **SUPERSEDED (2026-10-06):** ~~91/91 migrations sequential & fully applied~~ — the applied lineage is **40 top-level `.sql` files, head `0127_meals_tenant_composite_pk.sql`** (`find backend/migrations -maxdepth 1 -name '*.sql' | wc -l`). 91 was the pre-squash `0001`–`0099`-era count; **99** is the size of the excluded `backend/migrations/legacy/` folder. **`PRAGMA foreign_key_check` = 0 violations is not re-derivable from the repository** — it needs a replay, and no replay was run for this correction.
- ⚠️ **SUPERSEDED (2026-10-06):** ~~~167 indexes cover every hot query~~ — measured on the 91-file lineage. The applied lineage contains **550 `CREATE INDEX` statements**, many of them re-creations inside the rebuild idiom, so the distinct-index count needs a replay too. The *finding* (only 2 real gaps, M17) was never re-measured.
- Generated `pos_users.name` intact; booking lifecycle uses two-L `'cancelled'`, kitchen one-L `'canceled'` — the only spelling mismatch was the CHECK bug (P0.4), now fixed.

**Frontend**
- The 3 historically-dangerous bugs are **confirmed fixed and holding**: T3 render-loop (super-admin crash), T5 toast deferral (`useQueryHooks.ts:142-144`), 8-digit-hex hydration landmine.
- ⚠️ **SUPERSEDED (2026-10-06):** ~~Zero `dangerouslySetInnerHTML`; `escHtml()` used 67×, `normalizeAssetUrl()` 39×~~ — `escHtml()` is now **18** hits under `app/src` (`grep -rn escHtml app/src | wc -l`), because `af1d69b` unwrapped the A/B/E category sites; `normalizeAssetUrl()` was not re-counted. The conclusion still holds: user data escaping is enforced at the render boundary, and `docs/06-security/security-guide.md` §Layer 2 is the current inventory.
- T13 migration held: raw `fetch` data loads eliminated except the justified blob download (M12). The deliberate non-`apiFetch` call sites are now documented in `docs/02-api/API_SURFACE_MAP.md` with their reasons.
- No render-phase setState; no prop mutation; strict-mode zone guards all use template ternaries.

**Tests**
- ⚠️ **SUPERSEDED (2026-10-06), three runs stale and no commit named:** ~~Backend unit 1,988/1,988 pass (72 files) · Frontend unit 3,489/3,489 pass (137 files) · Root unit 158/158 pass (10 files)~~. The newest **committed** results are backend **127 files / 2743 tests** (`9e58dae`), frontend **155 / 3632** (`88f307a`), root integration **37 / 255**, root unit **11 files**. `ARCHITECTURE.md` §7 is the canonical table; quote a count with the commit that produced it.
- Expansion pillars: backend 225 tests / 7 files, frontend 528 tests / 14 files — all pass, **zero weak-test patterns** (no `.skip`, `.only`, `expect(true)` padding).
- E2E suite: 850+ passing specs covering POS shift lifecycle, cash checkout, and admin CRUD for rooms/meals/rateplans (strongest). The last recorded full gate is **919 passed / 0 failed / 15 env-skipped** (2026-09-06, per-project).
- ⚠️ **SUPERSEDED (2026-10-06):** ~~Coverage thresholds configured (backend functions 100/lines 99; frontend functions 99/lines 99)~~ — see the corrected PART 4 row: backend is 83/72/89/89, and the frontend gate is currently red on 3 of 4.

**Performance/Architecture**
- 4-layer isolation intact: **0 direct D1/KV references in `app/src`**.
- `KV_CACHE.put` = 0; rate-limit KV path correctly disabled (free-plan quota exhaustive).
- SSE broadcaster has zero DB access, poll-free, correct heartbeat/eviction.
- ⚠️ **SUPERSEDED (2026-10-06):** ~~`DB.batch` already used in 27 places~~ — **38 call sites** under `backend/src` today (`grep -rn "DB\.batch(" backend/src | wc -l`); the direction is the point, and it is unchanged.
- response-header split correct (`no-store` vs `public, max-age`).

---

# PART 6 — RECOMMENDED FIX SEQUENCE (proposed — needs your go-ahead)

> ⚠️ **SPENT — do not work this list (2026-10-06).** Wave 1 is complete: all six P0s are
> fixed in the tree (see PART 1's per-finding markers and the status block at the top).
> Waves 2–4 shipped as the Wave 3 / Wave 4 exit reports recorded in
> [[98-history/sessions/AGENT_LOGBOOK_HISTORY]]. The list is kept as the record of what
> was proposed on 2026-09-05; the *ordering* is history, and items 10 (M21), 17 (M11) and
> 27 (tsc) are now moot for the reasons in PART 2 and PART 4. **The live question is not
> "what is next in this sequence" — nothing here is — it is whatever
> [[05-operations/RUNBOOK|RUNBOOK.md]] §8 drift detection turns up next.**

**Wave 1 — Security & correctness fires (deploy-blocking)** — ✅ all six shipped
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
- ⚪ `FEATURE_*` flags — wire 2FA/captcha or remove the flags. **Resolved by removal (2026-10-06):** neither flag exists in the tree any more (see M3). **2FA and captcha still do not exist** — that half of the decision is unanswered.
- TS 7 upgrade — plan as a dedicated migration task (astro 7.x already done).
- ~~Staging/prod deploy remains blocked on user re-running `wrangler login` (Cloudflare OAuth)~~ — **no longer true as of 2026-10-06.** Staging validation was satisfied (2026-09-27 `chore(staging): point env.staging at reset D1`) and the production cutover ran ([[98-history/deploys/PROD-DEPLOY-CHECKLIST-2026-09-22]]). The OAuth-failure *procedures* still belong in [[05-operations/RUNBOOK|RUNBOOK.md]] §9b; the blocker itself does not.