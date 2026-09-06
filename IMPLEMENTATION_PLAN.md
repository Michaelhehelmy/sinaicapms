# SinaiCamps — Full Implementation Plan (post-audit remediation)

**Source:** 8 read-only audits (2026-09-05) + `AUDIT_MASTER_FINDINGS.md`
**Date:** 2026-09-05
**Mode:** This is the execution plan. Each task below has a dedicated tmp agent brief in `.opencode/agents/tmp/2026-09-05-fix-*.md`. No task starts until the plan is approved.

---

## 1. Principles

- **One task = one agent.** Every task below is atomic: a single domain, a clear shipped artifact, a verifiable done-condition.
- **Test-guard everything.** Each task's done-condition includes the relevant suite (`cd backend && npx vitest run`, `cd app && npx vitest run`, targeted specs). No task may reduce a green suite.
- **Migrations are sequential.** Tasks that create migrations are assigned the next free numbers (0092…) and must apply locally (`wrangler d1 migrations apply --local`) before the task is done. Migration-edit tasks (T10) touch already-applied files — edit only, do not re-apply.
- **No scope creep.** A task touches only the files listed in its Scope. Cross-file changes found during execution are logged to `AGENT_LOGBOOK.md`, not absorbed.
- **Report-only items stay reported.** Decision items (Section 6) are NOT tasks until the user decides.

## 2. Execution protocol per task

1. Read `AGENT_LOGBOOK.md` + the relevant audit report section.
2. Implement within Scope.
3. Run the verification command in the done-condition.
4. Update the tmp file `status: done`, append a logbook entry, delete the tmp file.

## 3. Task index (execution order = wave order)

### WAVE 1 — Security & correctness fires (6 tasks) — do first, in order

| ID | Task | Files (primary) | Done-condition |
|---|---|---|---|
| T1 | Fix onboarding SQL injection | `backend/src/api/onboarding.js`, `backend/tests/onboarding.test.js` | `POST /api/onboarding/tenant` accepts whitelisted keys only; `onboarding_token` cleared on completion; backend suite green |
| T2 | Remove/rework `sanitizeInput` no-op | `backend/src/middleware/sanitize.js`, `backend/src/index.js` | No `c.req =` reassignment remains; behavior verified (unsanitized input no longer silently passes through a broke "sanitizer"); backend suite green |
| T3 | Storefront column projection | `backend/src/api/storefront.js`, tests | Public `GET /api/storefront/products` + `/:id` never return `cost_price`; tests updated; suite green |
| T4 | Relax `kitchen_status` CHECK (+ real DB test) | `backend/migrations/0092_*.sql`, `backend/tests/pos-tables.test.js` | Migration 0092 with `'canceled'` added; new DB-level test (real CHECK, not mocked) passes; suite green |
| T5 | Fix `/api/services/public/:slug` | `backend/src/api/services.js:440`, tests | Route returns 200 for a valid definition slug; no nonexistent `tenants.slug/is_active` queries; suite green |
| T6 | Harden public signup | `backend/src/api/onboarding.js`, tests | Signup creates `is_active = 0` admin (approval flow mirroring `auth.js:313`), password min 8; tests updated; suite green |

### WAVE 2 — Data integrity & API quality (10 tasks)

| ID | Task | Files (primary) | Done-condition |
|---|---|---|---|
| T7 | Server-side reservation pricing | `backend/src/api/reservations.js:29,228`, tests | Known-SKU line items priced from `pos_products.selling_price`; client `unit_price` ignored for known SKUs; tests updated |
| T8 | Restore `pos_customers.name` generated column | `backend/migrations/0093_*.sql` | Migration applied locally; `PRAGMA table_xinfo('pos_customers')` shows `name` hidden=3 |
| T9 | Audit entity-type filter gap | `backend/src/api/admin-audit.js:31`, `backend/src/api/audit.js:36,66-70,9-18` | `GET` audit APIs accept `'order'`/`'pos_table'`; docs updated; tests updated |
| T10 | `DROP TABLE IF EXISTS` cleanup | 11 migration files (0014/0039/0040/0042/0046/0047/0054/0069/0091) | 20 statements gain `IF EXISTS`; `npx vitest run tests/core/migration-integrity.test.js` passes |
| T11 | Validation wire shape | `admin-settings.js:150`, `admin-subscriptions.js:141`, `admin-payouts.js:78` | 3 endpoints route through `validationError(parsed)`; suites green |
| T12 | Mount meal-plans router, delete inline dup | `backend/src/index.js:700-737`, `backend/src/api/meal-plans.js` | `mealPlansRoutes` mounted; inline copy removed; meal-plans + index tests green |
| T13 | Atomic priceOverrides upsert | `backend/src/api/priceOverrides.js:76-98` | Bulk upsert atomic (pre-validate-all or `DB.batch`); failure test proves no partial write |
| T14 | Unify tenant scoping column | POS/storefront/barcode modules + `tenant_org_mapping` | Scoping matrix produced; all modules scope on one column; cross-module isolation tests pass |
| T15 | Zod for 4 hand-rolled validators + review rate-limit | `inventory.js`, `marketplace.js`, `upload.js`, `priceOverrides.js` + `rateLimit.js` policy | All 4 use `safeParse`; marketplace reviews route under a rate-limit policy; tests updated |
| T16 | Unify pagination envelope | `storefront.js:90`, `inventory.js:40`, `admin-settings.js:229`, `admin-payouts.js:58-62` + `app/src/lib/api.ts` | All list endpoints return `{data,total,page,pageSize,hasMore}`; frontend consumers updated; suites green |

### WAVE 3 — Performance & frontend polish (9 tasks)

| ID | Task | Files (primary) | Done-condition |
|---|---|---|---|
| T17 | Flatten POS order-create N+1 | `backend/src/routes/pos/index.js:542-565` | Order create drops to ~2 queries total (recipes IN + stock IN, map in JS); POS tests green |
| T18 | Add missing indexes | `backend/migrations/0094_*.sql` | Migration adds `leave_balances(tenant_id,year)` + `pos_stores(organization_id)`; applied locally |
| T19 | IN-queries + DB.batch on pillar modules | `financials.js:239`, `services.js:451`, `supply.js:399/547`, `hr.js:383` | N+1 loops removed / batchable writes batched; pillar tests green |
| T20 | Fix 4th public island | `app/src/pages/marketplace.astro:14` | MarketplaceDirectory `client:visible` (or SSR fold); only 3 islands remain; marketplace E2E green |
| T21 | Split recharts out of SystemHealthPanel | `app/src/components/ui/LineChart.tsx`, `SystemHealthPanel.tsx` | SystemHealthPanel lazy chunk < 300 KB; admin tests green |
| T22 | AnalyticsPanel per-tab query gating | `app/src/components/admin/AnalyticsPanel.tsx:90-123` | Mount only fires active-tab queries; per-section skeletons; tests updated |
| T23 | AuditLog export through `@/lib/api` | `app/src/lib/api.ts`, `app/src/components/admin/AuditLogPanel.tsx:85-86` | `exportAuditLog()` exists; raw `fetch` + bare `localStorage` removed from the panel; tests green |
| T24 | Accessibility label pass | `app/src/components/public/TenantMenu.tsx:289`, `SignupPage.tsx`, `MenuPlannerPanel.tsx:316` | Search input labeled; signup labels associated; `aria-label` replaces `title`; a11y tests green |
| T25 | Crypto order references | `backend/src/api/reservations.js:51`, `backend/src/api/orders.js:176` | `Math.random()` refs replaced with crypto-derived refs; tests updated |

### WAVE 4 — Debt, coverage & dependencies (12 tasks)

| ID | Task | Files (primary) | Done-condition |
|---|---|---|---|
| T26 | Delete 9 dead frontend files | `ui/{BarChart,BulkActions,ChartCard,DateRangePicker,ExportButton,MetricCard,PieChart}.tsx`, `hooks/{useApiError,useFilterState}.ts` + orphaned tests | Files removed; their only-referencing tests removed/adjusted; app suite green |
| T27 | Delete dead backend modules + dead table | `admin-users.js`, `admin-stats.js`, `backend/migrations/0095_*.sql` | Grep confirms unmounted; modules removed; `tenant_usage` dropped via guarded migration; suites green |
| T28 | Stable list keys | `ReservationSummary.tsx`, `FinancialPanel.tsx`, `SupplyPanel.tsx`, `AIPanel.tsx`, `BillingPanel.tsx`, `ReportsPanel.tsx` | Mutable data lists keyed by entity id; app tests green |
| T29 | Unit tests: 5 expansion super mirrors | `backend/tests/unit/admin-{ai,crm,hr,supply,storefront}-unit.test.js` (new) | 5 new test files following `admin-financials-unit.test.js` pattern; backend suite green |
| T30 | Unit tests: remaining 6 super modules | `backend/tests/unit/admin-{audit,health,performance,reports,subscriptions,users}-unit.test.js` (new) | 6 new test files; backend suite green |
| T31 | Integration suite seed step | `tests/globalSetup.ts` / seed script | Integration suite runs green from clean checkout (or documented seed script); 230 skipped tests unmasked |
| T32 | Fix 90 src tsc errors | 5 hotspots + remaining src files | `cd app && npx tsc --noEmit`: 0 errors in `src/` |
| T33 | Fix 329 test-fixture tsc errors | `app/tests/**` | `cd app && npx tsc --noEmit`: 0 errors total |
| T34 | Dependency remediation | `backend/package.json` (hono), `app/package.json` (`@types/react` 19) | `hono >= 4.12.34`; `@types/react`/`@types/react-dom` 19.x; npm audit prod-critical cleared; suites green |
| T35 | E2E: money paths | new specs (payments create-intent→confirm→webhook; payouts lifecycle) | New specs pass in CI E2E run |
| T36 | E2E: booking conversion + order mutations | new specs | Public booking funnel creates server order; state/cancel/delete asserted; specs pass |
| T37 | E2E: 23 blind panels smoke | new spec (nav ids × panel mounts) | Every tenant/super panel with zero coverage has a load+content assertion; specs pass |
| T38 | E2E: ops journeys | new specs (low-stock replenish; SSE EventSource; shift-close edge cases) | Specs pass |

**Total: 38 atomic tasks** (6 backend-only migrations+edits across T4/T8/T10/T18/T27 — numbering assigned at execution).

## 4. Migration number map (assigned at execution, in dependency order)

| Task | File | Contents |
|---|---|---|
| T4 | `0092_kitchen_status_canceled.sql` | Rebuild `orders`+`pos_transactions` kitchen_status CHECK (+ `'canceled'`) |
| T8 | `0093_pos_customers_name_restore.sql` | Rebuild `pos_customers` restoring generated `name` |
| T18 | `0094_index_gaps.sql` | `leave_balances(tenant_id,year)`, `pos_stores(organization_id)` |
| T27 | `0095_drop_tenant_usage.sql` | `DROP TABLE IF EXISTS tenant_usage` + index cleanup |

All must keep the migration-integrity test green (`IF EXISTS` discipline), apply cleanly locally, and stay sequential (no gaps).

## 5. Verification protocol

- Backend: `cd backend && npx vitest run` (expect ≥ 1988 tests after additions)
- Frontend: `cd app && npx vitest run` (expect ≥ 3489 tests)
- Root: `npx vitest run` (must return to green after T10 — migration-integrity)
- Migration integrity: `npx vitest run tests/core/migration-integrity.test.js`
- tsc gates: T32/T33 (`cd app && npx tsc --noEmit`)
- E2E: `CI=true npx playwright test <new-spec>` per task; full gate at wave end
- Dependency: `npm audit --json` in root/backend/app; `npm outdated` diff

## 6. Decision items (NOT tasks — need user call)

| # | Item | Options | Blocked by |
|---|---|---|---|
| D1 | Captcha / 2FA / `FEATURE_*` flags | (a) wire Turnstile on register/signup (skill available), (b) implement 2FA for admins, (c) delete flags | Product intent |
| D2 | astro 7.x upgrade | Dedicated migration task (astro 7 + vite 8 + TS 7 + storybook 10 + eslint 10 + zod 4) — likely 1-2 days, full-suite risk | Schedule; 9 prod advisories motivate it but 5.18.2 is not exploitable in current deployment posture |
| D3 | Edge caching of public catalogue | Add `s-maxage`/cache-rule for `/api/tenants/public`, camps, availability OR document browser-only intent | Product decision |
| D4 | Real-money E2E | Online payment specs need gateway test keys in CI | Paymob/Stripe test credentials |

## 7. Risk register

| Risk | Mitigation |
|---|---|
| Migration edits (T10) diverge from applied local state | Files-only edit; verify via migration-integrity test + fresh scratch apply, never re-run applied migrations |
| T14 scoping change breaks legacy rows | Produce the scoping matrix first; backfill `tenant_org_mapping`; run multi-tenant isolation tests |
| T33 (329 test-fixture errors) is long-tail churn | Independent, touch-tests-only; do after T32; can be split into per-file PRs |
| T34 React-19 typings surface new tsc errors | Run tsc after bump; fix within T34 scope; do not block on D2 |
| E2E tasks environment-sensitive (wrangler dev resilience) | Follow the documented constraints (`waitUntil: 'domcontentloaded'`, unique toast text, seed cleanup); run per-spec, then full gate |
| Parallel tasks sharing `index.js`/tests files | Wave order is sequential by design; never start T(n+2) while T(n) touches the same file |

## 8. Definition of done for the whole program

- All 38 tasks `status: done` and tmp files cleaned.
- Green: backend ≥ 1988, frontend ≥ 3489, root, E2E full gate.
- `AUDIT_MASTER_FINDINGS.md` P1/P2 items closed or explicitly deferred with owner+reason.
- Logbook updated with every task + lessons learned.