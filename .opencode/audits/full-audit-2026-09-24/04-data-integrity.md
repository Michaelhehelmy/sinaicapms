# Pass 4 — Data Integrity Audit (2026-09-24)

Read-only. Method: live-DDL inspection + SELECT-only reads against the local
miniflare D1 copy
`backend/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/9212c2d93a7c1f389c84044f61f98a63279538cbc21123f36266d12a4326d1d8.sqlite`
(opened `mode=ro` via Python `sqlite3`, never written), cross-checked against
`backend/migrations/` (top-level + `legacy/`) and `backend/src/**/*.js`.
No source/migration modified, no DB writes issued (`PRAGMA foreign_key_check`
ran clean at end of session).

**Local DB migration state:** `d1_migrations` ledger = 111 entries, head
`0110_create_payment_records.sql`. Ledger names match `backend/migrations/legacy/`
era + top-level files. **0111/0112/0113 NOT applied locally** — live DDL still
shows the pre-0111 state (e.g. `order_items.project_id TEXT NOT NULL`, confirmed
via `PRAGMA table_info`). All "NOT NULL" statements below describe the LOCAL copy.

**Row-count census (106 tables + d1_migrations):** only 19 tables non-empty:
admins 84, customers 20, feedback 9, inventory_adjustments 512, leads 68,
orders 24, pos_organizations 45, pos_products 43, pos_shifts 156,
pos_stores 45, pos_transaction_items 119, pos_transactions 119, pos_users 43,
products 17, projects 11, rate_plans_new 32, rooms_new 161, tenants 8,
meals 5, meal_categories 3, meal_lang 5, order_state 5, order_state_lang 10,
languages 2, marketplace_categories 6, platform_settings 1, subscription_plans 4,
tenant_org_mapping 1. Everything else (invoices, payments, payment_records,
order_items, tenant_subscriptions, carts, storefront_*, service_*, HR/payroll,
CRM, journals, tickets, warehouses/stock, purchase_*) = 0 rows. Findings on
empty tables are schema-level (verdict noted).

---

## A. Spec drift queries (all 8 RAN — DB access available, none not-run)

| # | Check query (read-only) | Result count | Verdict |
|---|---|---|---|
| D1 | `orders.amount_paid` vs `SUM(payment_records.amount)` per order, tolerance 0.005 | **1 row**: `ord_261c79d6-d2b` paid 200.0 vs records 0 (payment_records table: 0 rows total) | **DRIFT (seed hygiene, LOW)** — `backend/src/api/orders.js:1287-1295` always INSERTs the record BEFORE updating `amount_paid` (`:1287` + `:1301-1303`), so the API path cannot produce this; the row bypassed the API (seed/probe insert). Falsification attempt: grepped for any other `payment_records` writer — only `orders.js:1288`. Same order also violates the paid-on-partial invariant (see §B). |
| D2 | `orders.total_amount` vs `SUM(order_items.total_price)` per order, tolerance 0.01 | **24/24 rows** (every order; `order_items`: 0 rows total) | **BY DESIGN, not drift** — `backend/src/api/orders.js:715-775` persists line items ONLY when the request supplies an `items` array (`:715` `Array.isArray(items)`, `:760` `if (orderItems.length > 0)`); plain room-night bookings carry the price on the header only. Falsified "missing items" by reading the write path. Residual risk: §B row 3 (new items omit `project_id`). |
| D3a | `pos_transactions.paid_amount` vs legs `amount_cash+amount_card`, tolerance 0.01 | **0 rows** | **PASS** — 119/119 consistent. Writer binds legs explicitly (`backend/src/routes/pos/index.js:667-668`). |
| D3b | `pos_transactions.total_amount` vs `SUM(items.total_amount)` joining `transaction_id=t.id OR order_id=t.id`, tolerance 0.05 | **119/119 rows**: header 165 vs items 150 (44 vs 40 on one row) | **EXPLAINED, not drift** — header `total = subtotal + tax` (`routes/pos/index.js:654-671`: subtotal 150, tax 15, total 165) while the line writer hard-binds line `tax_amount = 0` (`:689-692`, literal `0` in VALUES). Lines sum to the pre-tax subtotal by construction. Semantic note: line-level tax is unused — any future reader summing line tax gets 0. |
| D4 | `pos_products.stock_quantity` negatives / below-min | negatives **0**; below `min_stock_level` **23** | **PASS** — no negative stock (sale path uses atomic conditional deduction `stock_quantity >= ?`, `routes/pos/index.js:644-649`). 23 below-min rows are legitimate low-stock state (surfaced by `reports.js:240-242` low-stock query). |
| D5 | orphan `projects → tenants` (`LEFT JOIN tenants WHERE NULL`) | **0 rows** | **PASS**. |
| D6 | orders with `camp_id` set but `project_id` NULL/empty | **0 rows** | **PASS** (all 24 backfilled; consistent with `0105_backfill_order_items_project_id.sql:61-67` statement 4). |
| D7 | `invoices.status/paid_amount` vs `SUM(payments.amount)` | **0 rows (both tables empty)** | **RAN, VACUOUS** — no local rows to judge; invoice↔payment invariant UNVERIFIED for prod (no seed data; write path not traced this pass). |
| D8 | `tenant_subscriptions.status` vs `current_period_start/end` | **0 rows (table empty; `subscription_plans` has 4 rows)** | **RAN, VACUOUS** — same UNVERIFIED status as D7. Schema note: `status NOT NULL DEFAULT 'active'`, period columns nullable with no CHECK — nothing enforces status/date coherence at DDL level (no CHECK found in live DDL). |

Extra orphan/FK-value checks run (all SELECT-only, all 0 rows = PASS):
`pos_transaction_items→orders(order_id)` 0, `→products` 0, `orders→rooms_new`
0, `orders→customers` 0, `orders→order_state` 0, `orders→camp/project` 0,
`rooms/rate_plans→product/camp/project` 0, `meals→category` 0,
`pos_products→project` 0, `pos_users/pos_stores→organization` 0,
`admins→tenants` 0 (16 NULL-tenant rows are legit super-admins — FK is
`ON DELETE SET NULL`, `PRAGMA foreign_key_list(admins)`), `PRAGMA foreign_key_check`
empty.

---

## B. Per-table findings (paired drift, nullability, CASCADE, dead columns)

| Table(s) | Check query / static check | Count | Verdict + file:line + falsification |
|---|---|---|---|
| pos_transaction_items / pos_transactions / reports | `SELECT COUNT(*) FROM pos_transaction_items WHERE transaction_id IS NULL` → 119/119 NULL; grep `transaction_id` writes in `backend/src` → zero; `reports.js` joins on it | 119 NULL; 0 writers; 2 readers | **FAIL (HIGH) — dead-column join.** Writer `routes/pos/index.js:687-693` INSERTs `(id, tenant_id, order_id, …)` and never binds `transaction_id` (col provenance: `legacy/0015_relink_transactions_foreign_key.sql:19`). Readers `backend/src/api/reports.js:167` (`/top-products`) and `:265` (`/revenue-breakdown`) join `pos_transactions o ON o.id = oi/ti.transaction_id` → both endpoints return empty aggregates despite 119 joinable rows via `order_id`. Falsification: the 10 other `transaction_id` hits are `paymob.js`/`paymob-webhook.js` parsed-gateway variables, not this column (verified by reading `paymob.js:164-187`). Fix direction (not applied): join on `order_id` (= `pos_transactions.id`, FK `PRAGMA foreign_key_list(pos_transaction_items)` id 1). |
| pos_transaction_items | FK-index cross-check: `order_id → pos_transactions(id) ON DELETE NO ACTION` has no dedicated index; the two indexes on the table covering `transaction_id` (`idx_pos_transaction_items_transaction`, `idx_pos_tx_items_tx`) index the always-NULL column | 1 MISS + 2 wasted | **FAIL (MED) — index on dead column, none on live join.** Every items↔header join in the codebase uses `order_id` (`0105:84-87`, `0105:99`, all POS reads), which does a full scan per header. Falsified composite coverage by parsing all `sqlite_master` index SQL (regex over 200+ indexes) — no index contains `order_id` on this table. |
| order_items | INSERTs at `api/orders.js:762`, `:824`, `api/reservations.js:404` — column list has no `project_id`; local DDL `project_id TEXT NOT NULL` (no default) | 3 writers, 0 set it | **FAIL (MED) — write path incompatible with enforced column (locally); silent-NULL risk post-0111.** Locally (pre-0111) any order WITH items would abort on NOT NULL; on 0111-applied envs (`0111:117-131` relaxes to nullable) the same writes succeed but accumulate NULL-`project_id` rows, defeating the 0105/0106 backfill intent. Falsification attempt: checked for a DB default/trigger that could fill it — `PRAGMA table_info(order_items)` shows `dflt_value None`, and `sqlite_master` shows no triggers on `order_items`. |
| orders | `SELECT payment_status, COUNT(*) GROUP BY` → NULL 23, 'paid' 1; DDL default `'pending'` | 23/24 NULL | **DRIFT (MED) — nullable-by-write despite DEFAULT.** DDL default exists (live `PRAGMA` shows `dflt 'pending'`), but the create path binds `payment_status \|\| null` (`api/orders.js:746-749`), so the default never fires. Downstream: `api/inbox.js:78` filters `o.payment_status = ?` — NULL rows are invisible to every status filter; `orders.js:1299` `(order.payment_status \|\| 'pending')` tolerates it. Falsified "default applies" by code read. |
| orders | `payment_status='paid' AND amount_paid < total_amount` → 1 row (`ord_261c79d6-d2b`, 200/400) | 1 | **DRIFT (LOW)** — contradicts the API invariant "full payment flips to paid" (`api/orders.js:1297-1299` `isFull ? 'paid' : …`). Same seeded row as D1; not API-reachable (API sets `newPaid` from `paidSoFar + amount`). Seed-hygiene only. |
| pos_products (live DDL) vs 0107 | `PRAGMA table_info(pos_products)` — no `profit_margin` column; `0107:144-149` declares `profit_margin REAL GENERATED ALWAYS AS … STORED` | absent live | **DRIFT (LOW) — migration/DB skew on the local copy.** Either 0107's rebuild never applied to this miniflare copy or it was reverted; `api/storefront.js:74` comments that the storefront projection excludes `profit_margin`, so code already tolerates both shapes. Noted for the 0111/0112 apply run (P1-D gate must diff live DDL, per `0105:31-34`). |
| pos_users / pos_stores | `WHERE project_id IS NULL` → users 42/43, stores 44/45 | 42 + 44 | **PASS (documented).** Matches the migration's own expected residuals verbatim (`0105:216-217`: users 42 orphan `cascade-*` probe rows in unmapped orgs 3–46; stores 44 unmapped). Falsified by comparing counts to the documented gate. Genuine concern only if prod shows the same shape (probe leftovers vs real floaters). |
| rooms_new | `WHERE tenant_id IS NULL` → 0/161; `tenant_id` nullable, no FK, has `idx_rooms_new_tenant_id` | 0 NULL | **PASS with note.** Residual schema smell: `rooms_new.tenant_id` is the only camp-scoped `tenant_id` without an FK clause (nullable, unenforced) — deleting a tenant leaves rooms dangling where every sibling table CASCADEs. UNVERIFIED whether any code relies on the looseness. |
| tenants ↔ projects | `projects.tenant_id → tenants(id) ON DELETE NO ACTION` (only tenant-FK in the schema WITHOUT CASCADE/SET NULL) | schema-level | **NOTE (LOW).** Hard-deleting a tenant with projects aborts instead of cascading — fail-closed, arguably correct given `tenants.deleted_at` soft-delete convention. Falsified cascade-risk by reading the FK row directly. Inverse: ~60 tables CASCADE on tenant delete — a hard `DELETE FROM tenants` is a wipe; safety rests entirely on the soft-delete convention (no DB-level guard). |
| admins / feedback | `tenant_id … ON DELETE SET NULL`; `admins WHERE tenant_id IS NULL` → 16 | 16 NULL | **NOTE (LOW).** NULL-tenant admins read as super-admins (FK is SET NULL per `PRAGMA foreign_key_list(admins)`). Deleting a tenant silently detaches its admins into platform scope instead of removing them — confirm that is intended. Full auth-scope proof UNVERIFIED this pass. |
| orders / rooms_new | `RESTRICT` edges (`orders.room_id`, `orders.order_state_id`, `rooms_new.product_id`) | schema-level | **PASS.** Fail-closed deletes; 0111 header documents the DROP-TABLE interplay was handled (`0111:41-43`). |
| order_items (scope) | No `tenant_id` column (only `order_id` + `project_id`); same for `cart_items`, `invoice_lines`, `payroll_lines`, `purchase_order_lines`, `storefront_order_items`, `ticket_comments` | 7 tables | **NOTE (MED).** Tenant isolation for these tables is join-dependent (via parent). Every query must join the parent to scope — the safety-rules tenant-scoping requirement is enforced by convention here, not DDL. `order_items` is the hottest of the set. |
| pos_stores / pos_organizations | No `tenant_id` on either; store→tenant resolves via `tenant_org_mapping.organization_id` (1 mapping row locally) + nullable `project_id` | schema-level | **NOTE (MED).** Same convention-only scoping as above; `0105:179-184` explicitly declined to enforce store→project defaults ("convention-only binding"). Any store query missing the mapping join leaks cross-tenant. Readers not exhaustively audited this pass → UNVERIFIED. |
| pos_products dead columns | `brand_id`, `supplier_id`, `variant_of`, `seo_title`, `seo_description`: exist live (verified `PRAGMA`), **0 references** in `backend/src/**/*.js` | 5 cols, 0 refs | **DEAD CANDIDATES (LOW).** `supplier_name` (1 ref, `inventory.js:150` SELECT) and `compare_price` (1 ref, `storefront.js:85` projection) are live — used as the falsification control that the grep sweep works. `short_description` (15 refs) live. Drop-gate: confirm no frontend-direct reads (frontend goes through API, so backend-zero ≈ dead) — candidate, not proven, until a frontend `api.ts` grep confirms. |
| orders dead columns | `requested_checkin_time`, `requested_checkout_time`: exist live, 0 backend refs (`early_checkin` 3, `late_checkout` 4, `tip_method` 6, `payment_intent_id` 6 refs — all live) | 2 cols, 0 refs | **DEAD CANDIDATES (LOW)** — same frontend-confirmation caveat as above. |
| pos_users dead columns | `commission_rate`, `two_factor_secret`: exist live, 0 backend refs (`employee_id` 21 refs — live) | 2 cols, 0 refs | **DEAD CANDIDATES (LOW)** — `pos_users.camp_id` is 43/43 NULL with no writers found in `routes/pos/*` (repo-wide grep not run → UNVERIFIED, listed here only as a lead). |
| pos_transaction_items | `variant_id`: exists, 119/119 NULL; `discount_amount != 0` → 0 rows; `leads.room_type_id` non-null → 0 rows | all-empty | **UNUSED (LOW).** `variant_id`/`variant_of` pair suggests an unshipped variant feature; zero non-null values locally. Verdict UNVERIFIED for prod (empty dev tables can't prove non-use). |
| invoices / payments / tenant_subscriptions / carts / storefront / services / HR / journals / tickets / stock | All 0 rows locally | — | **Schema-only review this pass.** Nullability sane (`invoices.status DEFAULT 'draft'`, `payments.status DEFAULT 'pending'`, `tenant_subscriptions.status NOT NULL DEFAULT 'active'`); no CHECKs anywhere constraining status↔money/period coherence — those invariants live in code or nowhere (UNVERIFIED). |
| Junction/locale tables | `marketplace_project_categories`, `product_camps`: **no FK clauses, no indexes at all** in live DDL; `category_lang`, `meal_lang`, `meal_categories_lang`, `order_state_lang`: FKs exist, zero indexes | 6 tables | **FAIL (LOW) — missing FK indexes + unenforced junctions.** Full unindexed-FK list (parsed from live `sqlite_master`, 31 MISSes total): `accounts.parent_id`, `categories.parent_id`, `journal_entries.journal_id`, `leave_balances/leave_requests.leave_type_id`, `manufacturing_orders.bom_id`, `opportunities.lead_id`, `order_discounts.transaction_item_id`, `orders.table_id/customer_id`, `payroll_lines.employee_id`, `pos_stores.manager_id`, `pos_transactions.table_id`, `products.category_id`, `project_tags.{tag_id,project_id}`, `stock_transfers.{from,to}_warehouse_id`, `storefront_order_items.product_id`, `storefront_orders.customer_id`, `tenant_org_mapping.tenant_id`, `tickets.contact_id`, `time_entries.tenant_id`, `leave_types.tenant_id` (no indexes at all on `leave_types`), plus all four `*_lang` tables. Triaged: hot-path MISSes are `pos_transaction_items.order_id` (row 2 above), `orders.customer_id/table_id`, `pos_transactions.table_id`; the rest sit on empty/dev-quiet tables — real but low-blast-radius until those features get traffic. |

---

## C. CASCADE / SET NULL risk register (from live `PRAGMA foreign_key_list`, all 107 tables)

- **Tenant hard-delete = mass wipe (by design, convention-guarded):** ~60 child tables
  `ON DELETE CASCADE` to `tenants(id)`. Only `tenants.deleted_at` soft-delete
  convention stands between an admin action and data loss — no DB guard. (LOW / accepted?)
- **`projects.tenant_id` NO ACTION:** blocks tenant hard-delete while projects exist.
  Fail-closed; consistent with soft-delete. (OK)
- **`admins.tenant_id` + `feedback.tenant_id` SET NULL:** tenant delete detaches rows
  into NULL-tenant scope (16 such admins already). Confirm platform-scope-upgrade is
  intended. (LOW)
- **`order_items.order_id` / meal / lang / bookings CASCADE:** standard dependent cleanup. (OK)
- **NOT NULL + `ON DELETE SET NULL` contradiction:** fixed at file level by
  `0111_fix_project_id_set_null_contradiction.sql:1-18` (11 tables) — but 0111 is
  NOT applied to the local copy, so the contradiction is still LIVE locally
  (verified `PRAGMA`: `order_items.project_id NOT NULL … SET NULL`). Any local
  project delete hitting a NOT NULL child fails instead of nulling. (MED, env-only
  until 0111 applied; P1-D gate item.)

## D. Paired-table drift summary

| Pair | Result |
|---|---|
| orders ↔ payment_records | 1 seeded row drifts (D1); API path sound |
| orders ↔ order_items | 24/24 itemless by design (optional items); write-path `project_id` gap (§B row 3) |
| pos_transactions ↔ legs/items | legs exact; header-vs-lines delta = header tax by construction |
| pos_products stock | no negatives; 23 below-min = genuine low-stock |
| projects ↔ tenants | 0 orphans |
| orders camp↔project | 0 camp-without-project |
| invoices ↔ payments | vacuous (empty) |
| subscriptions status↔dates | vacuous (empty); no DDL coherence guard |

Method notes: every query above is `SELECT` (or `PRAGMA` read) against a
`mode=ro` URI; the `-wal`/`-shm` sidecars were read through the SQLite WAL
driver, never checkpointed or touched. Migration citations reference file HEAD
state; where live DDL disagrees with file text (profit_margin, 0111
non-application), the live DDL is treated as authoritative and the skew is
reported, not reconciled.
