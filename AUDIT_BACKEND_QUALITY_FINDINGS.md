# Backend Code Quality Audit — Findings Report

- **Task**: `audit-t2-backend-quality` (`.opencode/agents/tmp/2026-09-05-audit-t2-backend-quality.md`)
- **Date**: 2026-09-05
- **Scope**: All `backend/src/api/*.js` (55), `backend/src/middleware/*.js` (7), `backend/src/utils/*.js` (5), `backend/src/services/*.js` (3), `backend/src/routes/registry.js` + `backend/src/routes/pos/index.js`, `backend/src/index.js`, `backend/src/durable/broadcaster.js`
- **Mode**: READ-ONLY. No source modified. Cross-checked against `app/src/lib/api.ts` (frontend client, 2491 lines) and `app/src/lib/api-types.ts` (generated wire spec mirror).
- **Version under test**: Hono 4.12.31 (behavioral verification run against same version)

---

## 1. Summary

| Scope | Modules/Dirs | Reviewed |
|---|---|---|
| API route modules | 55 | 55 (all, systematic scan + deep read of ~20) |
| Middleware | 7 | 7 (all read; 4 full, 3 via targeted analysis) |
| Utils | 5 | 5 (contract files read; helpers re-derived from call sites) |
| Services | 3 | 3 (paymob, emailService, paymentConfig) |
| Routes | 2 | 2 (`registry.js` spec generator, `pos/index.js`) |
| Durable Objects | 1 | 1 (broadcaster.js full read) |
| Entrypoint | 1 | 1 (index.js full read) |
| Frontend cross-ref | `api.ts` + `api-types.ts` | endpoint-by-endpoint spot check (38 endpoint groups) |

**Findings by severity**

| Severity | Count |
|---|---|
| High | 1 |
| Medium | 5 |
| Low | 5 |
| **Total** | **11** |

---

## 2. Findings Table

| # | Severity | File:Line | Description | Evidence |
|---|----------|-----------|-------------|----------|
| F1 | **High** | `backend/src/middleware/sanitize.js:87` (mounted `backend/src/index.js:143`) | `sanitizeInput()` is a silent **no-op** on Hono 4.12.31. It reassigns `c.req = new Request(...)`; `Context#req` is a getter-only accessor, so this throws `TypeError: Cannot set property 'req' of #<Context> which has only a getter` — swallowed by the `catch {}` at line 93, so the *original unsanitized body* proceeds. Zero XSS sanitization ever runs, yet every mutating JSON request is cloned + parsed once more in middleware, then parsed again by the handler. | `c.req = new Request(c.req.raw, {...})` inside `try { } catch { }`; verified empirically: request body round-trips with **original** content (status 200). Whole-module premise ("sanitize at the storage boundary") is false in practice. |
| F2 | Medium | `backend/src/api/admin-settings.js:150` | PUT `/api/admin/settings` returns **raw Zod `issues`** instead of `validationError(parsed)`: `jsonResponse({ success:false, error:'Invalid settings data', errors: parsed.error.issues }, 400)`. `issues` keys are snake_case paths (e.g. `feature_flags`) with non-catalog messages — never the documented `error`/`errors[{field,message}]` shape. Field-level errors are lost; the client shows only the generic string. | Exact line: `return jsonResponse({ success: false, error: 'Invalid settings data', errors: parsed.error.issues }, 400);` — compare `backend/src/utils/errors.js` `validationError()` (camelCase `field` + catalog messages). |
| F3 | Medium | `backend/src/api/admin-subscriptions.js:141` | PUT `/api/admin/subscriptions/:id` same contract break as F2. | `return jsonResponse({ success: false, error: 'Invalid subscription data', errors: parsed.error.issues }, 400);` |
| F4 | Medium | `backend/src/api/admin-payouts.js:78` | POST `/api/admin/payouts` routes Zod failure through `errorResponse('Validation failed', 400, parsed.error.issues)` — raw issues as `errors`, generic `error` string, no camelCase field mapping. | `return errorResponse('Validation failed', 400, parsed.error.issues);` |
| F5 | Medium | Pagination envelope dialect divergence vs. shared `paginationEnvelope` (`backend/src/utils/pagination.js`: `{ data, total, page, pageSize, hasMore }`) | At least 5 distinct list/aggregate shapes exist across modules; frontend list components must special-case per endpoint, and `api-types.ts` cannot rely on one envelope. | `storefront.js:90` → `{ items, total, page, limit }` (parses `limit`, no `hasMore`); `inventory.js:40,81-89` → `{ data, items, total, page, pageSize, hasMore }` with `data` mirroring `items` (documented Phase-3 convergence, but still divergent); `pos-tables.js:127` → `{ sections, total }` (documented as intentional grouping, low concern); `admin-settings.js:229` → `{ data: list, total: list.length }`; `admin-payouts.js:58-62` → `{ data, total, totalNet }` (aggregate). Conformant modules exist: `admin-storefront.js:75`, `audit.js:151`, `orders.js:626`, `leads.js:142`, `admin-payouts.js:166`. |
| F6 | Medium | `backend/src/api/meal-plans.js` (whole file) + `backend/src/index.js:700-737` | **Duplicated meal-plan logic between an unmounted router and an inline copy.** `mealPlansRoutes` (43 lines) is imported only by `backend/tests/meal-plans.test.js:10`; it is **not mounted** in `index.js`. `index.js:705-737` inlines the same project → `tenant_org_mapping` → `pos_products` SELECTs for `/api/projects/:id/meal-plans`. The test suite exercises code that never runs in production. | Import graph: `grep -rn "meal-plans"` → only `backend/tests/meal-plans.test.js:10`. Inline duplicate at `index.js:709-731`. |
| F7 | Medium | `backend/src/api/inventory.js:108-117`, `marketplace.js:141-167`, `upload.js:84-100`, `priceOverrides.js:60-104` | Mutating handlers validated **manually** (inline `if (!x) return errorResponse(...)`) instead of the codebase-wide Zod `safeParse` convention. System scan of all 55 modules shows these as the only mutating modules with 0 `safeParse` hits. All four *are* validated — no entirely-unvalidated mutation handler found — but error shape/messages are inconsistent with Eco-system. Marketplace POST /reviews is additionally a **public write with no rate limit** (public scope mount at `index.js:219` area), an abuse vector for review spam. | `inventory.js`: `if (!product_id || typeof adjustment !== 'number')`; `marketplace.js:147`: `if (!project_id || !rating || rating < 1 || rating > 5)`; `priceOverrides.js:68-90`: per-entry string/int checks; `upload.js`: manual extension/size allowlist. Scan: `safeParse` count = 0 in these four. |
| F8 | Medium | `backend/src/api/priceOverrides.js:76-98` | Bulk upsert loop executes one `DELETE`/`INSERT ... ON CONFLICT` **per entry without `DB.batch()`**. If entry N fails validation, entries 1..N-1 are already committed while the handler returns 400 → **partial write / non-atomic mutation**. Violates the checklist requirement "writes atomic where multi-statement". Contrast: `inventory.js` adjustment uses batch + guarded conditional `UPDATE`; `orders.js`, `reservations.js`, `routes/pos/index.js` batch. | Loop: `for (const entry of overrides) { ... await env.DB.prepare(...).run(); }` with mid-loop `return errorResponse(...)`. |
| F9 | Low | `backend/src/api/admin-users.js` (97 lines), `backend/src/api/admin-stats.js` (155 lines) | **Dead modules** — both self-document as "DEAD CODE — not mounted in index.js" and are referenced only by the comment block at `backend/src/index.js:11-14`. `handleAdminStatsRoute` is exported but never imported by any router; legacy `admin.js` catch-all covers the stats/admins surface. Unused surface adds audit noise and dead-export risk. | Top-of-file comments in both; `grep` for imports → none in `index.js` or any router. |
| F10 | Low | `backend/src/routes/pos/index.js:34` | The only `TODO/FIXME` in `backend/src`: "TODO: Add tip_amount column to pos_transactions and persist it." Track as an issue or implement; it's the sole unresolved marker in the backend. | `TODO: Add tip_amount column...` |
| F11 | Low | `backend/src/api/storefront.js:76` + `backend/src/api/financials.js:141` (exchange-rates) | Informational: (a) storefront product list (`/products`) filters `deleted_at IS NULL` but **not** `is_active = 1` — inconsistent with inventory/admin low-stock queries (`is_active = 1`); verify intent. (b) `GET /api/financials/exchange-rates` has **no frontend caller** in `app/src` (checked all `.ts/.tsx/.astro`) — orphaned endpoint. | `storefront.js:76`: `WHERE tenant_id = ? AND deleted_at IS NULL` (no `is_active`); exhaustively greps show `exchange-rates` only in `api-types.ts` (generated mirror). |

**SSE Durable Object (`backend/src/durable/broadcaster.js`) — reviewed, no connection leak found.**

- Lifecycle is clean: `openStream` cancels clear the interval, delete the connection from the per-tenant `Set`, drop an empty channel, and resolve the `waitUntil` keep-alive promise — the DO does not pin the event past disconnect.
- Heartbeat cadence (`: ping` every 25 s, `http://connect`+) matches the logbook contract; eviction (oldest-first at `MAX_CONNECTIONS_PER_TENANT=100`) and broadcast loop both prune cancelled connections.
- No `Access-Control-*` headers emitted — correct (hono/cors is the single source of truth).
- Minor notes (informational, not raised as findings): the initial `controller.enqueue` in `start()` is not try/catch-wrapped (throw would 500 a fresh SSE request); `parseTenantId` accepts any ≤128-char id, so DO-instance creation is attacker-influenceable (standard DO model; only a concern if the stream route ever skips tenant resolution).

---

## 3. Explicit Checklist

| # | Checklist item | Verdict | Details |
|---|---|---|---|
| 1 | EVERY handler uses `jsonResponse(data, status)` / `errorResponse(message, status, errors)` — never passing Hono `c` as first arg | ✅ **PASS** | Full-repo grep for `jsonResponse(c,` / `errorResponse(c,` / `validationError(c,` = **0 matches**. Raw `Response`/`c.json` returns exist only in `rateLimit.js` (middleware — correct), CSV/blob/stream endpoints (`admin-audit.js:177`, `admin-performance.js:207`, `admin-reports.js:253/263`, `upload.js:153`) and `broadcaster.js` (Durable Object — correct). |
| 2 | Zod 400s routed through `validationError(parsed)` (not raw `errorResponse`/`jsonResponse`) | ⚠️ **PARTIAL** | **3 violations**: `admin-settings.js:150`, `admin-subscriptions.js:141`, `admin-payouts.js:78` (F2-F4). All remaining 100+ `safeparse` sites route via `validationError` (e.g. `pos-tables.js:46`, `tags.js`, `storefront.js:146`). |
| 3 | Input validated (Zod `safeParse`) on every POST/PUT/PATCH/DELETE | ⚠️ **PARTIAL** | No handler is *entirely* unvalidated, but 4 modules use hand-rolled checks instead of Zod (F7): `inventory.js` POST `/adjustments`, `marketplace.js` POST `/reviews`, `upload.js` POST `/`, `priceOverrides.js` PUT `/`. Every other mutating handler routes `safeParse` (55-module scan). |
| 4 | DB writes atomic where multi-statement (`DB.batch()`) + guarded-INSERT pattern | ⚠️ **PARTIAL** | `DB.batch()` present in 10 files (`inventory.js`, `orders.js`, `reservations.js`, `routes/pos/index.js`, `tags.js`, `softDelete.js`, `meta.js`, `admin.js`, `admin-performance.js`, `admin-stats.js`) — atomic multi-write flows confirmed (logged INSERT + guarded conditional `UPDATE` stock in `inventory.js`; order + items + auditchain in `orders.js`/pos). **Not applied**: `priceOverrides.js:76-98` per-entry write loop (F8). |
| 5 | Tenant scoping: modules querying DB scoped by tenant; flag any global/marketplace query that should be tenant-scoped | ✅ **PASS (spot-checked)** | Tenant/org scoping is pervasive and correct: every pillar module references `tenant_id`/`organization_id` in `WHERE` (`financials` 30, `crm` 27, `supply` 39, `hr` 27, `services` 30, `ai` 20, `orders` 51, `reservations` 12, `leads` 5, `inbox` 10, plus `pos-tables`, `priceOverrides`, `storefront` — all led by `getScope(c)` / `resolveScope`). Deliberately global queries are scoped to their surface and correct (super-admin pillar `overview`s, marketplace directory filters `status='active' AND onboarding_status='completed'` at `marketplace.js:25`, public signup at `onboarding.js:43`). POS dual model (`organization_id`) is routed through `tenant_org_mapping` (`inventory.js:34-36`). No mis-scoped global query found. |
| 6 | Dead code: unused exports/imports, legacy `handleXRoute` remnants, TODO/FIXME | ⚠️ **PARTIAL** | Dead modules `admin-users.js` / `admin-stats.js` (F9); the only TODO is `routes/pos/index.js:34` (F10). All legacy `handleXRoute` functions in `index.js` are **live** (tenants, super-admin, health, performance, reports, auth, admin) — no import-only ghosts. Note: AGENTS.md documents "routes/pos/ (8 modules)" but the repo now has a single `routes/pos/index.js` (1088 lines) — docs drift, not a code defect. |
| — | Duplicated logic that should be extracted | ⚠️ | F6 (meal-plans inline-vs-router) is the concrete case. Poster child for a shared `services/` helper: `tenant_org_mapping → organization_id` resolution is re-implemented in `inventory.js:34`, `index.js:717`, `meal-plans.js`, `reports.js` — a small `getOrgId(DB, tenantId)` util would unify it (Low suggestion). |

---

## 4. Frontend ↔ Backend Cross-Reference (step 5 of brief)

- **All frontend-called endpoints exist on the backend.** Endpoint-by-endpoint spot check of 38 endpoint groups in `app/src/lib/api.ts` against the `index.js` mount list found **no stub/orphaned client call** — everything resolves: `/admin/reports/generate|scheduled` (catch-all at `index.js:273-274`), `/auth/auto-login` (sub-dispatch at `auth.js:466-498`), `/ai/state/sessions|sync`, `/ai/workers-ai/*`, `/reports/seasonal|low-stock`, `/services/*`, `/storefront/admin/*`, `/financials/process-payment|confirm-payment`, `/tenant/billing`, `/inbox/read`, `/marketplace/reviews`, `/storefront/cart*`.
- **One orphaned backend endpoint (no frontend caller)**: `GET /api/financials/exchange-rates` (`financials.js:141`) — present only in the generated mirror (`api-types.ts`), no call site in `app/src`.
- **Positive note**: versioned cutover is clean — `/api/v1` is rewritten once at the entrypoint (`index.js:804-817`, single registration, no duplicated mounts); unversioned alias carries `Deprecation`/`Sunset` for the transition window. Deprecated aliases (`/contact` → `/leads`, `POST /api/pos/auth/login` → `/api/auth/pos-login`) are documented in `api-types.ts` and stamped with sunset headers.

---

## 5. Recommended Fix Order

1. **F1 (`sanitizeInput` no-op)** — remove the middleware or rework it to sanitize at the handler boundary (it cannot replace `c.req`; drop the try/catch if kept). Highest impact: restores the stated XSS defense and removes a wasted body parse per mutation.
2. **F2-F4** — replace the 3 deviating validation-return sites with `validationError(parsed)` to restore the documented `{field,message}` wire shape.
3. **F6** — mount `mealPlansRoutes` in `index.js` and delete the inline copy (the test currently covers dead code).
4. **F8** — wrap the `priceOverrides` upsert loop in `DB.batch()` (or pre-validate all entries before writing) to make it atomic.
5. **F5 / F7** — adopt `paginationEnvelope` everywhere (kill `items`/`limit` dialects) and move the 4 hand-rolled validators to Zod schemas.
6. **F9-F11** — delete or archive the dead modules, track the `tip_amount` TODO, and reconcile the `is_active`/`exchange-rates` notes.

---

## 6. Methodology Notes

- Backend unit/integration suites (`backend/tests/`) were read for behavior context only and **not modified**; `backend/migrations/` untouched.
- All severity calls are quality/convention-focused (no auth bypass, no data-loss, no unvalidated mutation handler found). The Hono `c.req` behavior in F1 was verified behaviorally against the exact installed version (4.12.31): assignment throws, error swallows, original body round-trips.