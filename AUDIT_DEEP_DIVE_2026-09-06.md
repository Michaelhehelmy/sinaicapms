# SinaiCamps — Deep-Dive Audit #2 (2026-09-06)

Six parallel read-only audit streams (security · backend API contract · database/schema · frontend a11y/UX · test coverage · spec-parity/ops). Everything from AUDIT_*_FINDINGS.md (audit #1, remediated via T1–T38) was re-verified first. Uncommitted working tree = 224 files; nothing below is deployed to prod until the ship step (H1).

---

## 1. HEADLINE — Ship integrity (highest priority)

### H1 [P0] THE ENTIRE REMEDIATION IS UNCOMMITTED AND NEVER DEPLOYED
- `git status`: 27 files modified/deleted under `backend/src` (incl. deletions `admin-stats.js`, `admin-users.js`, `middleware/sanitize.js`), 9 historical migrations post-edited (`DROP TABLE` → `DROP TABLE IF EXISTS`, e.g. 0014/0039/0040/0042/0046/0047/0054/0066/0069), **5 new migrations untracked** (0091_rate_plans_camp_id, 0092_kitchen_status_canceled, 0093_pos_customers_name_restore, 0094_index_gaps, 0095_drop_tenant_usage). HEAD is still `d575a71` (from before the consolidated test phase).
- **Confirmed against prod**: `campmaster-db` D1 ledger ends at **0091** (applied 2026-09-05); live `orders` + `pos_transactions` CHECK still lacks `'canceled'`; `idx_orders_customer` absent live even though the local 0092 file declares it → the local DB ran a different 0092 than the file on disk.
- Consequences:
  - Prod **still 500s** on admin kitchen-status cancel (`orders.js:522-574,591` writes `'canceled'` against a CHECK that lacks it) — the original P0.4 bug is live on prod.
  - Prod does NOT have the security/money/db fixes from T26–T38 (and partially T1–T25, since deploys were blocked on `wrangler login` the entire time).
  - A fresh CI/prod migration from git is **unreproducible** today (0091–0095 exist only in the working tree).
- Fix: commit everything in logical commits → deploy (requires `wrangler login`) → verify `0092` applied + `PRAGMA foreign_key_check` = 0 on prod.
- Rule going forward: never post-edit an applied migration; the local 0092/0093 need a scratch-DB re-apply to expose their actual applied SQL, and trusted-committed file copies must match prod.

---

## 2. P0 — Dead code with user-facing breakage

### P0-A Payout admin panel is dead end-to-end
- FE `app/src/lib/api.ts:2316-2350` calls `/admin/financials/payouts*` (+ `:id/paid`), but BE mounts the router at `/admin/payouts` (`backend/src/index.js:260`) with `:id/pay` (`admin-payouts.js:226`). All six calls fall into the `handleSuperAdminRoute` 404 (`Admin endpoint not found`). SuperFinancialsPanel payout tab renders nothing useful in any build.
- Fix: choose one contract (point FE at `/admin/payouts` + `:id/pay`, or remount BE) + add an E2E that exercises the *panel*, not just the API (current `payouts.spec.ts` hits the API directly — that's why it's green).

### P0-B `/api/storefront/checkout` + `/api/storefront/orders` are 500s on real schema
- `backend/src/api/storefront.js:293` INSERTs `orders(order_number, customer_email, status, …)` — those columns don't exist (`order_state`/`reference`/`customer_id` are the real lineage; see migration 0028). `:300` inserts `order_items(product_id, product_name)` — also nonexistent. `:324-325` lists orders by `customer_email` — 500.
- Unit tests pass only because the mock SQL-routes the queries. First real storefront checkout = server error.
- Fix: write through `reference`/`findOrCreateCustomer` per the booking lineage, wrap in `db.batch()`, or gate the route until the storefront schema exists.

### P0-C `/api/payments/*` all 500: `payment_intents` table never existed
- `backend/src/api/payments.js:62,96,120` INSERT/SELECT/UPDATE `payment_intents`; zero DDL in all 95 migrations; not in live schema.
- Legacy Stripe-era code, now superseded by Paymob (`PM_ENABLED`). Routes still mounted (`index.js:300-318`).
- **Decision needed**: add the table in a migration (and guard confirm on `status='created'`) or delete the routes if Paymob-only is the product decision.

---

## 3. P1 — Money-safety & error-semantics

### Money/atomicity
- **Payout approve double-approve race** — `admin-payouts.js:221-232`: SELECT → check `status==='pending'` → `UPDATE SET status='paid' WHERE id=?` with **no `AND status='pending'`**, then unbatched `Promise.all` per-payment settles. Two concurrent approves both pass → double-settle + duplicated decisions. Fix: guarded UPDATE + `meta.changes===1` → 409, wrap payout+payments in `db.batch()`.
- **Shift close double-close race** — `pos/index.js:1095-1100`: guardless `UPDATE … SET status='closed' WHERE id=?`. Same fix pattern.
- **Storefront checkout not atomic** — `storefront.js:292-305`: 3 sequential awaits (order → items → cart delete), no batch; `COUNT(*)+1` order sequence is race-prone and unconstrained.
- **Money stored as REAL** — `orders.total_amount` etc. REAL; mixed with `pos_transactions DECIMAL(12,2)`. No cents discipline; float drift in reports/payout totals. Stop adding REAL money columns; document cents-or-DECIMAL.
- **Orders hard-DELETEd, no tombstone** — `orders.js:394,933`, `pos/index.js:739` deletes `pos_transactions` on void despite `void_reason/voided_by/voided_at` columns existing. Money/booking lineage vanishes; no audit row.

### Server-error semantics (breaks 5xx telemetry + retries)
- **`errorResponse` defaults to status 400** (`response.js:87`) — 128 catch blocks (`errorResponse('Failed to …')`) surface DB/worker failures as **400**, never 5xx**. A DB-down produces `400 { success:false }` on every screen. Fix: default 500 + sweep to explicit codes.
- **Envelope drift**: four 405 fallbacks (`admin-subscriptions.js:279`, `admin-audit.js:190`, `admin-settings.js:274`, `tenant-billing.js:89`) and the rate limiter (`rateLimit.js:102/114/141/148`) return `{ error }` **without `success:false`** (T4 wire contract violation).
- **`GET /api/tenants` with no tenant context returns success-shaped 200** `{ id:null, message:'No tenant context provided', … }` (`tenants.js:267`) instead of 400/404 envelope.

### Security
- **`/api/tenants` super-admin branch leaks credentials** — `tenants.js:141-171` returns `tenants.*` incl. `admin_passphrase`/`hacker_passphrase`/`onboarding_token` through `cachedJsonResponse` → **`Cache-Control: public`**. Dead, weak, uniform creds confirmed in prod DB. Fix: explicit projection + `private, no-store`.
- **Signup error leak NOT fixed** — `onboarding.js:121` still leaks `e.message` (prior P0.6 finding: partial). Also no captcha, no email verification; `onboarding_token` + 24h `auto_login_token` returned in signup/setup bodies; email-uniqueness gap → account-squatting DoS.

### Frontend (P1 UX/a11y)
- **11 admin panels have zero inline error/retry state** (toast-only on failure): Analytics, Financial, Supply, CRM, Storefront, AI, HR, Services, Promotions, MenuPlanner, BookingCalendar. `useApiError` is dead (0 importers). Fix: shared `ErrorState`/retry wrapper.
- **`aria-live="assertive"` on every toast** (`Toast.tsx:161-162` `role="alert"` for all types) — screen readers get aggressively interrupted by routine info toasts. Use `role="status"`/polite for info/success.

### Ops/CI
- **Backend coverage gate fails and CI never runs it** — `backend/vitest.config.ts` thresholds branches 85 / functions 100 / lines 99 / statements 99; measured reality ~76/93/92/87 (reservations.js 59.86% lines, admin-financials.js 52.17%). CI (`ci.yml`) runs `npx vitest run` without `--coverage` → the declared quality bar is unmet AND unenforced. Fix: re-baseline thresholds + add a CI coverage step (or add the missing tests first).
- **npm audit (app): 5 HIGH** — `astro <=7.0.9` (direct dep, 2 majors behind), `js-yaml`, `nanoid`, `undici`, `ws`. Backend: 0.

---

## 4. P2 — Quality, hygiene, drift

- **Migration register integrity**: 9 historical files post-edited (benign semantics, but breaks immutability rule + reproducibility until committed).
- **`/storefront/blog` NaN-unsafe + envelope-less**: `storefront.js:349-369` re-implements pagination with raw `parseInt` (no `Number.isFinite`) → `?page=abc` → `NaN LIMIT/OFFSET` → 500; returns bare array, not T16 `{data,total,page,pageSize,hasMore}`.
- **POS order detail still `SELECT t.*`** (`routes/pos/index.js:867`) despite the main list fix (orders.js:604). Same bloat/breaking-columns risk.
- **Dead backend surface (no FE consumer)**: order split (`orders.js:1086,1107`), POS barcode lookup (`pos-barcode.js`), storefront CMS reads (`/storefront/blog…`, `/pages/:slug`), `POST /api/contact` legacy alias. Fix: wire or sunset.
- **`openapi.json` lags** — 84 paths documented vs ~231 mounted; specs for orders items/storefront products/admin subscriptions absent. Blocking trustworthy `api-types.ts` regeneration.
- **Islands rule drift**: 4 public islands now (added `MarketplaceDirectory client:visible` `marketplace.astro:14`) — AGENTS.md rule says 3.
- **A11y P2s**: `DataTable` sortable headers + clickable rows are mouse-only (no tabIndex/role/onKeyDown); `FormModal` has no focus trap (10+ forms); `TenantMenu.tsx:72-75,153-185` rgba-on-arbitrary-background text w/o WCAG contrast computation; low-stock contrast; `CampBooking` meal-plan steppers unlabeled; `Badge` remove-button unlabeled.
- **Timer/listener**: Toast auto-dismiss timers untracked (`Toast.tsx:112-114,149`); `MarketplaceDirectory` debounce explicitly leaks (`:61-64`).
- **Reduced motion**: only 2 guards; global.css keyframes + Modal/Toast/FormModal animations unguarded. Add global `prefers-reduced-motion: reduce` block.
- **Raw fetch in 2 inline scripts** outside the typed client (`contact.astro:136`, `MarketplaceHome.astro:239`).
- **Dead components/tests**: 9 prior dead components still dead (BarChart, BulkActions, ChartCard, DateRangePicker, ExportButton, MetricCard, PieChart, useApiError, useFilterState); `useApiError.test.ts` asserts the retired sync-toast behavior.
- **Datetime/format mixing**: ISO `T…Z` bound into payout columns vs `datetime('now')` space-format elsewhere; `date('now')` UTC boundary in `reports.js:43-44` flips occupancy ~2h after Egypt midnight.
- **Email uniqueness case-sensitive** (BINARY collation) on `admins.email`/`pos_users.email`; no `(tenant, name)` uniqueness on products.
- **Docs drift (AGENTS.md/README)**: admin panels 18→43 files; POS views 8→10; islands 3→4; migrations 53→96; E2E counts stale (README 566 vs AGENTS 929 vs actual `playwright --list` 935).
- **Dead config**: 13 `[vars]` keys never read (`RATE_LIMIT_LOGIN`, `RATE_LIMIT_API`, `MAX_LOGIN_ATTEMPTS`, `LOCKOUT_DURATION`, `SESSION_TIMEOUT`, `DEFAULT_CURRENCY`, `DEFAULT_TAX_RATE`, `LOG_LEVEL`, 5 `FEATURE_*` flags) — rate limiter uses hardcoded in-memory defaults; `STRIPE_WEBHOOK_SECRET` read in code but defined nowhere; `.env.example` documents `PUBLIC_API_URL`/`PUBLIC_STRIPE_KEY` nothing reads (api.ts hardcodes base URL).
- **Concourse `console.*` in prod paths** (7 in paymob-webhook.js incl. `e.stack`, pos/index.js:854) — bypass observability filtering.
- **No CI typecheck**: ci.yml runs vitest only; no `tsc --noEmit`, no lint, no audit.

---

## 5. P3 — Minor

- SSE JWT in query string; uploads no magic-bytes check; Stripe `!==` compare (inert, dead mock); per-isolate in-memory rate limits (coarser under load); forgot-password timing oracle still present; `escHtml` applied to an *attribute* (`TenantLanding.astro:242`) — wrong tool for `javascript:` URI defense; no LICENSE/CHANGELOG; deploy.sh rollback only pre-deploy (no post-failure rollback automation).

---

## 6. Verified-fixed (local tree) — do not regress

SQLi onboarding ✅ · cost_price leak ✅ · client-controlled pricing ✅ · signup `is_active` = 0 ✅ · `pos_customers.name` STORED generated (0093) ✅ · `audit_log.entity_type` CHECK + filters (0095-era) ✅ · orphan tables dropped (0095) ✅ · index gaps 0094 present ✅ · tenant/org scoping on money queries ✅ · `Math.random` order refs → `ORD-[0-9A-Z]{6}` ✅ · FK enforcement is REAL on D1 (prior "decorative" verdict wrong; 0 violations live) ✅ · POS sale + inventory adjust are exemplary batched atomicity ✅ · soft-delete filtering disciplined (84 call sites) ✅ · zone guards 10/10 correct ✅ · tsc 0 errors ✅ · raw-fetch discipline inside React ✅.

---

## 7. Recommended fix sequence (needs your go-ahead)

1. **Ship integrity (blocking)**: commit 224 files in logical commits → `wrangler login` (user) → deploy → verify prod 0092 applied + kitchen-status cancel works + `PRAGMA foreign_key_check` = 0.
2. **P0-A/B/C**: payout FE/BE contract + panel E2E · storefront checkout schema/batch fix · payments routes decision (migrate `payment_intents` vs delete).
3. **Money-safety**: payout approve + shift close status guards (+batch) · storefront checkout batch · money-format policy.
4. **Error semantics**: `errorResponse` default 500 sweep · `success:false` on 405/rate-limit · tenants no-ctx 400 · `/api/tenants` projection + `no-store`.
5. **Reliability/UX**: `/storefront/blog` parsePagination · POS SELECT projection · 11-panel ErrorState · toast live-region tiers · island consolidation · a11y P2s · timers · reduced-motion.
6. **Quality/ops**: coverage threshold re-baseline + CI coverage + CI typecheck · astro/npm audit · dead vars cleanup · docs sweep (AGENTS/README) · openapi regen · dead-route sunset per decision · logging hygiene.