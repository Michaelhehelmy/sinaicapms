# SinaiCamps — Performance & Architecture Audit Findings

- **Date:** 2026-09-05
- **Scope:** READ-ONLY audit. No source files were modified.
- **Versions:** Astro 5.18.x + React 19.2.x + Tailwind v4 (frontend) · Hono on Cloudflare Workers + D1 + KV (backend).
- **How it was verified:** static reads of `backend/src`, `app/src`, and `app/budget.json`; grep of KV/isolation invariants; bundle audit of `app/dist/_astro` (raw + gzip transferSize); index + row-count inventory of the local D1 database (`backend/.wrangler/state/v3/d1/...` — 105 tables via read-only sqlite; **small dev data volumes**: e.g. `orders`=0, `pos_transactions`=12, `tenants`=15, `projects`=18 rows). Severity assumes production volumes, not current local row counts.

---

## A. Query Pattern Findings (file : line · issue · severity)

| # | Location | Issue | Severity |
|---|---|---|---|
| A1 | `backend/src/routes/pos/index.js:542-565` | **N+1 (double loop) on order create.** For each ordered item: 1× `SELECT pos_recipe_ingredients`, then per recipe: 1× `SELECT pos_products` stock — up to `1 + recipes-per-item` awaits per line, all sequential. | **MEDIUM** (hot POS write path) |
| A2 | `backend/src/api/financials.js:239-244` | **N+1 read.** Per journal entry: 1× `SELECT entry_lines LEFT JOIN accounts`. Replace with one `WHERE entry_id IN (...)` query or a single JOIN, then group in JS. | MEDIUM (admin financial list) |
| A3 | `backend/src/api/services.js:451-456` | **N+1 read on the public catalog.** Per service definition: 1× `SELECT service_items`. One IN-query covers all. | MEDIUM (public-facing) |
| A4 | `backend/src/api/supply.js:399-417` | **Sequential write+read per PO line.** Per line: UPDATE purchase_order_lines → SELECT stock_quant → UPDATE/INSERT stock_quant (≤3 round-trips/line). These are conditional-free per-row mutations → batchable via `DB.batch`. | MEDIUM-LOW (admin supply) |
| A5 | `backend/src/api/supply.js:547-558` | **N+1 write path.** Per BOM component on MO-complete: 1× SELECT stock_quant then 1× UPDATE (both sequential in-loop). | LOW-MEDIUM |
| A6 | `backend/src/api/hr.js:383-389` | **Sequential per-employee payroll insert.** Each `INSERT INTO payroll_lines` awaits individually → `DB.batch` of N inserts. | MEDIUM-LOW |
| A7 | `backend/src/api/inbox.js:119-131` | **4 independent sequential SELECTs** (page query, count query, `unreadLeads`, `unreadBookings`) on the admin inbox fetch. The two unread counts and the page+count pair are independent → `Promise.all`. | LOW-MEDIUM |
| A8 | `backend/src/api/marketplace.js:45-63` | Count query then data query run sequentially (independent), plus **2 correlated subqueries per project row** (`review_count`, `avg_rating`, lines 53-54). | LOW (tiny dataset; still the pattern that scales poorly with camps) |
| A9 | `backend/src/api/admin-audit.js:152-154` | CSV export pulls up to `LIMIT 10000` full audit rows (incl. `old_values`/`new_values` JSON blobs) into one in-memory response each request. Fine at current scale; cap/stream if it grows. | LOW |
| A10 | `backend/src/routes/pos/index.js:585-586` | `SELECT … FROM pos_stores WHERE organization_id = ?` — **no index** (see C2). | MEDIUM-LOW (see C) |
| A11 | `backend/src/api/hr.js:326-330` | `SELECT lb.* … WHERE lb.tenant_id = ? AND lb.year = ?` — **no index on leave_balances.tenant_id** (see C1). | MEDIUM (see C) |
| A12 | `app/src/components/admin/AnalyticsPanel.tsx:90-123` | **All 8 report queries fire on mount regardless of active tab**; `loading` is the OR of all 8 (line 99) and gates the WHOLE panel behind one spinner (line 123). The default `overview` tab only needs revenue+occupancy (+top products). Suggest `enabled`-gating per tab + per-section skeleton loaders. | MEDIUM (user-perceived blank on every panel open) |
| A13 | `app/src/components/admin/ReportsPanel.tsx:33-37` | All 3 report queries run on mount although only the active `reportType` is rendered; `loading` is per-type but the other two queries are wasted until tab switch. | LOW-MEDIUM |
| A14 | `backend/src/middleware/rateLimit.js:92-113` | KV-backed path does **1 KV write (put) per request** → ~2 ops/request (get+put). With the free-plan 1,000 writes/day, enabling `RATE_LIMIT_KV_ENABLED` exhausts quota in a few hundred requests. **Correctly disabled today** (`"false"` in `wrangler.toml`); the per-isolate in-memory fallback (lines 115-146) is the right trade-off — kept as-is, no change. | INFO (by design) |

**Top-priority reads worth profiling (already correctly served):** room/POS availability and product lookups ride on good indexes (`idx_orders_tenant_room_dates`, `idx_pos_products_*`); `DB.batch` is already used in 27 places (orders, reservations, pos, admin stats, tags, meta) — the patterns above are the notable exceptions, not the norm.

**Checked and cleared (NOT N+1):**
`orders.js:276` (in-memory `overrideMap`), `pos/index.js:390` (in-memory `productMap`), `meta.js:93` (`foldMeta` in-memory), `ai.js:244` (in-memory daily bucket), `pos-tables.js:120` (in-memory section grouping), `hr.js:364-372` (payroll math in-memory), `orders.js:788` & `reservations.js:240` (meal-plan loops build batch statements / use maps), `camps.js:664` (single optional lookup).

---

## B. N+1 / Loop-Query Inventory

Confirmed incidents (ranked):

| Severity | Location | Pattern | Fix |
|---|---|---|---|
| MEDIUM | `pos/index.js:542-565` | double loop: per-item → per-recipe ingredient rows → per-ingredient product stock | 1× all recipes for tenant → 1× `IN()` stock query → map in JS |
| MEDIUM | `financials.js:239-244` | per-entry `SELECT entry_lines JOIN accounts` | single `IN (…)` or JOIN + JS group |
| MEDIUM | `services.js:451-456` | per-service-def `SELECT service_items` | single `IN (…)` |
| MEDIUM-LOW | `supply.js:547-558` | per-BOM-component stock SELECT + UPDATE | `DB.batch` |
| MEDIUM-LOW | `hr.js:383-389` | per-payroll-line INSERT | `DB.batch` |
| MEDIUM-LOW | `supply.js:399-417` | per-PO-line UPDATE + stock SELECT + UPDATE | `DB.batch` (no conditional abort needed) |
| LOW | `marketplace.js:53-54` | correlated subqueries per row | pre-aggregated GROUP BY join or app-side map |

---

## C. Index Gaps

Verified against actual D1 `sqlite_master` (read-only), tied to real query clauses. **Gap → fix:**

| # | Table (rows) | Missing index | Query it serves | Severity |
|---|---|---|---|---|
| C1 | `leave_balances` (0) | `(tenant_id, year)` | `hr.js:326-335` `WHERE lb.tenant_id = ? AND lb.year = ?` (+optional `employee_id`); table already carries `tenant_id` | MEDIUM |
| C2 | `pos_stores` (1) | `(organization_id)` | `pos/index.js:585-586` `WHERE organization_id = ?`; only autoindex on `code` exists | MEDIUM-LOW |
| C3 | `service_availability` (0) | `(service_item_id, available_date)` composite | `services.js:322` filter on both + `ORDER BY available_date` | LOW (empty; add when feature fills) |
| C4 | `marketplace_project_categories` (0) | none at all (junction, 2 cols) | `marketplace.js:35` `JOIN … ON mpc.project_id = p.id AND mpc.category_id = ?` | LOW |
| C5 | `tenants` (15) | no `(status, onboarding_status)` composite | `marketplace.js:25` `WHERE status='active' AND onboarding_status='completed'` | LOW (15 rows) |

**Verified covered (no action):** `promotions` `(tenant_id, is_active)` — serves `pos/index.js:428` & `promotions.js:113`; `pos_products` org/tenant/active variants — serve all product/stock paths incl. `capacity` lookups; `orders` (tenant_room_dates, tenant_state, tenant_date, dates, state, room, camp, payment_status) — serve availability, state filtering, listings; `order_items` (order_id) — serves `SELECT * WHERE order_id` fetches; `order_discounts`, `pos_transactions` (tenant_date, cashier, status); `projects` (tenant_deleted, tenant_type_status, unique tenant+slug); `meals` (tenant_id), `categories` (tenant_id), `stock_quant` (product_id, tenant_id), `warehouses` (tenant_id), `stock_transfers` (tenant, status), `product_camps`, `marketplace_reviews` (project_id, is_approved, tenant_id), `bom_lines` (bom_id), `rate_plans_new`/`price_overrides` (product-window lookups OK).

---

## D. Caching & KV Verdict

- ✅ **No KV cache writes.** `KV_CACHE.put` — **0 matches** across `backend/src`. KV quota (free plan: 1,000 writes/day) untouched, consistent with the logbook rule "KV_CACHE bound but never written".
- ✅ **Rate-limit KV path correctly disabled.** The KV path does a `put()` per request (≈2 KV ops/request) and would exhaust the free-plan quota; `RATE_LIMIT_KV_ENABLED=false` in `wrangler.toml` forces the in-memory fallback. Keep disabled unless on a paid plan. In-memory limiter is per-isolate, so it is **not distributed** — accepted trade-off given the quota constraint (document in logbook).
- ✅ **Response header split is correct.** `jsonResponse` → `Cache-Control: no-store` (`utils/response.js:48`); `cachedJsonResponse` → `public, max-age=${maxAge}, stale-while-revalidate=${maxAge*2}` + `Vary: x-tenant-id` (`utils/response.js:71-72`). Availability correctly uses `maxAge=60` (`orders.js:1187,1194`); catalogue/list endpoints use the 300 s default.
- ⚠️ **Edge-caching caveat (INFO):** `cachedJsonResponse` has no `s-maxage`/`cf` directive — it drives **browser** caching + stale-while-revalidate only. Cloudflare's edge will **not** cache these JSON responses unless a Cache Rule/Cache Everything is configured for those paths. If response-cache hit ratios are a goal for the public catalogue (`/api/tenants/public`, camps, availability, categories), add `s-maxage` or target a cache rule — and keep `Vary: x-tenant-id` so tenant-scoped payloads never leak cross-tenant.
- ✅ **SSE isolation:** `backend/src/durable/broadcaster.js` has **no DB access at all** and no per-connection polling — pure in-memory fan-out with a 25 s `: ping` heartbeat kept alive via `state.ctx.waitUntil` and eviction at 100 conns/tenant. `Cache-Control: no-cache` on the stream. PASS.

---

## E. Frontend Bundle & Island Findings

Built output `app/dist/_astro` (raw → gzip transferSize):

| Chunk | Role | Raw | gzip | Note |
|---|---|---|---|---|
| `SystemHealthPanel.*.js` | lazy admin panel | **368,898 B** | 108,437 B | **biggest chunk in app; exceeds the 300 KB/js budget** |
| `client.*.js` | admin SPA shared client | 184,766 B | 57,601 B | part of every admin route initial load |
| `index.DqD_kL6S.css` | global stylesheet | 99,309 B | 16,757 B | at the 100 KB/ss budget line |
| `index.astro_…_lang.*.js` | home inline script | 56,306 B | 16,232 B | largest single page script |
| `BookingCalendar.*.js` | island-ish | 36,585 B | 11,659 B | |

- **E1 (MEDIUM)** `SystemHealthPanel` (174-line source) is 369 KB because it is the **only** consumer of `recharts` (`app/src/components/ui/LineChart.tsx:1-9`), so the whole charting library lands in that one lazy chunk. It is code-split via `React.lazy` (`AdminApp.tsx:60+`), so initial admin load is unaffected, but it blows the per-chunk budget the moment that panel opens. Swap `LineChart` for a lightweight SVG renderer (Analytics/Reports already hand-roll bar charts) or move recharts to a small shared chunk.
- **E2 (LOW)** `client.*.js` (185 KB) + global CSS (99 KB) ≈ 284 KB raw on every admin first paint before any lazy panel loads. Under aggregate budgets, but the SPA shell is the single heaviest line — worth re-checking React runtime/`tanstack-query` duplication as the panel set grows.
- **E3 (LOW)** Island count exceeds the documented 3: `TenantLanding.astro:203` (`client:visible`), `BookPage.astro:45` (`client:load`), `MenuPage.astro:48` (`client:load`) are the approved set — but `app/src/pages/marketplace.astro:14` adds a **4th**: `<MarketplaceDirectory client:load />` (chunk `MarketplaceDirectory.*.js`, 9,347 B). The sibling route `/camps` (`camps.astro`) renders the same grid **fully server-side** (`CampsSection.astro`, `await ssrFetch('/tenants/public')`). Marketing-page hydrally → recommend `client:visible` or fold `/marketplace` into the SSR template to keep the island budget.
- **E4 (INFO)** AnalyticsPanel/ReportsPanel ship embedded SVG charts (no chart lib) — good; keep that pattern and don't add recharts elsewhere.

---

## F. Architecture Isolation Verdict

- ✅ **4-layer contract intact.** Grep of `env.DB` / `KV_CACHE` / `D1Database` across `app/src` (**.ts/.tsx/.astro) → **0 matches**. The frontend touches D1/KV only through `@/lib/api` (`app/src/lib/api.ts`). Admin SPA is TanStack Query-driven; `window.*` cross-file globals are absent. No `hono/cors` duplication in response helpers (`response.js` comment, logbook H2) — single CORS source in `index.js`.
- ✅ **Realtime path clean**: SSE fan-out is Durable-Object–resident, DB-free, poll-free (Section D).
- ⚠️ **Only documented trade-off:** per-isolate in-memory rate limiting (not distributed) is deliberate, quota-driven, fail-closed (429 on KV error). Acceptable as-is; revisit only with a KV-plan upgrade or a storage-backed strategy.

---

## Recommended Order of Work

1. **A1 (POS order create N+1)** — highest business-impact path, self-contained fix (2 queries + JS map), matches the existing `DB.batch`/map patterns already in the codebase.
2. **C1 + C2** — add `(tenant_id, year)` on `leave_balances` and `(organization_id)` on `pos_stores` via a new migration (the `db-migration` skill pattern).
3. **A2 / A3 (financials + public services IN-queries)** — remove N+1 reads on list endpoints.
4. **A4/A5/A6** — switch sequential in-loop write chains to `DB.batch` (no conditional-abort semantics involved).
5. **A12/A13 (panel over-fetch)** — `enabled`-gate report queries per tab; per-section skeletons instead of the 8-way `loading` OR.
6. **E1/E3** — recharts split/swap; `/marketplace` island consolidation.
7. **D (edge cache)** — decide if `s-maxage`/cache-rule is wanted for the public catalogue; otherwise document browser-only intent.