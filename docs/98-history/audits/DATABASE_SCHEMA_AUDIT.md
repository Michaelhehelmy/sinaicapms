# Database Schema Audit — SinaiCamps

**Date:** 2026-08-22
**Author:** @db agent (tmp audit task)
**Status:** Informational / Decision Support
**Scope:** Full inventory of every live table, dead-table census, duplicate-pair analysis, FK graph, tenant-scoping matrix, index review, and a phased unification plan.

---

## 0. Executive Summary

| Metric | Value |
|---|---|
| User tables in live DB | **65** (+ `_cf_METADATA`, `d1_migrations` system tables) |
| Tables actually referenced by backend SQL (`backend/src/**`) | **31** |
| Zero-SQL-reference ("dead") tables still in the DB | **31** |
| Quasi-dead tables (1 vestigial ref each) | **3** (`products`, `pos_categories`, `product_camps`) |
| Views | 1 (`v_tenant_org`) |
| Triggers | 5 (2 harmless, 3 write to or block dropping of dead tables) |
| Minimal unified schema | **~24–26 tables** |

**Headline findings:**

1. **48% of the database is dead weight.** 31 of 65 tables have zero SQL references anywhere in the backend. They are the residue of three overlapping schema generations: the 0001 "CampMaster Pro" core, the 0010 enterprise-POS schema (~30 tables, only ~8 ever queried), and the 0028 QloApps-style booking schema.
2. **`SCHEMA_DIRECTION_PLAN.md` (P1-8) is directionally correct but stale in two places:** (a) migration **0045 already dropped** its Batch-1 legacy tables (`room_types`, `rooms`, `rate_plans`, `reservations`, `expenses`, `pos_payments`) — but *not* `financial_*`, `revenue`, or `plans`; (b) its "winner" for the product catalog has since been **overturned by migration 0054**: the backend reads `pos_products` exclusively and `rooms_new`/`rate_plans_new` now FK to `pos_products(id)`. The 0028 `products` table is empty in production and survives only as an FK-target mirror shim.
3. **The rename-swap pattern has burned us twice in production** (0042 → broken child FKs repaired across 0046/0047; 0054 pending locally because of D1 quirks). Any unification plan must treat `ALTER TABLE … RENAME` as the single most dangerous operation available on D1.
4. **One camp per tenant is now law** (0053): `camps.tenant_id` is UNIQUE and room-type ownership moved into `pos_products.camp_id`. The `product_camps` junction is read-compat-only pending deletion.
5. **Three parallel category systems** (`categories`, `meal_categories`, `pos_categories`) and **two menu-item stores** (`meals` vs `pos_products type='menu'`) remain the largest unresolved semantic duplication — merging them is a product decision, not just a cleanup.

---

## Methodology

Findings below were produced from four independent evidence sources, cross-checked against each other:

1. **Migration ledger** — all 54 files in `backend/migrations/` read end-to-end (`0001_init.sql` … `0054_fix_room_rate_plan_fk_to_pos_products.sql`).
2. **Live schema introspection** — local D1 dev database at
   `backend/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite`
   via Python `sqlite3`: full table list, row counts, `PRAGMA foreign_key_list`, `PRAGMA index_list/index_info`.
   ⚠️ The ledger shows **53/54 migrations applied locally — 0054 is pending LOCALLY**, so the local DB's `rooms_new.product_id` / `rate_plans_new.product_id` FKs still point at `products(id)` there. Production is already correct: per AGENT_LOGBOOK (2026-08-21 session), migration 0054 was **applied and verified in production on 2026-08-21** — only local dev lags.
3. **SQL-context code scan** — regex over `backend/src/**/*.js` matching table names only in SQL positions (`FROM |JOIN |INTO |UPDATE |TABLE |REFERENCES`). Plain-text name matches (URLs like `/api/products`, handler names like `handleProductsRoute`) were excluded — a naive grep over-counts by 2–10× for common names.
4. **Consumer surface check** — frontend endpoint families extracted from `app/src/lib/api.ts` (30 endpoint families), plus admin panel list (`app/src/components/admin/*`), to confirm no UI feature depends on any "dead" domain (expenses/financial/revenue have no frontend consumers).

> **Note on "references":** A table is called **active** if backend source executes SQL naming it; **quasi-dead** if exactly one vestigial/compat reference exists; **dead** if zero references exist in `backend/src` (tests may still build their own copies — flagged where relevant).

---

## 1. Current Schema Analysis

### 1.1 Live state snapshot (local D1, 2026-08-22)

```
User tables:            65
Views:                  v_tenant_org                     (migration 0041)
Triggers:               update_users_timestamp           (pos_users, active, harmless)
                        update_products_timestamp        (pos_products, active, harmless)
                        update_customers_timestamp       (pos_customers — DEAD target)
                        update_customer_stats_after_order(pos_transactions → writes pos_customers — DEAD target)
                        update_inventory_after_movement  (pos_stock_movements → pos_inventory — both DEAD)
Migrations applied:     53 / 54   (0054 pending LOCALLY)
d1_migrations rows:     53
Row-count hotspots:     pos_shifts 45 · admins 45 · leads 36 · pos_transactions/items 41 · rooms_new 28 · rate_plans_new 29
Empty-but-alive tables: 40+ (see §2)
Tenants:                acaciacamp, michaelshouse, marketplace (type='camp' each)
Camps:                  acaciacamp→tenant acaciacamp, michaelshouse→tenant michaelshouse (one-per-tenant holds)
```

### 1.2 Ownership model

There are **three schema generations fused into one database**:

| Generation | Migration(s) | Intent | Fate |
|---|---|---|---|
| **G1 — CampMaster Pro core** | 0001–0009 (+branding 0003–0008) | Multi-tenant camp management: camps/rooms/reservations/staff/expenses/inventory/meals/finance | Mostly **dropped** (0019–0023, 0045). Survivors: `tenants`, `camps`, `leads` |
| **G2 — Enterprise POS** | 0010–0018, 0013 | Vietnamese-retail-flavored POS: orgs/stores/variants/stock/loyalty/gamification/promotions | **~70% dead.** Survivors: `pos_users`, `pos_products`, `pos_transactions(+items)`, `pos_shifts`(0035), `pos_recipe_ingredients`(0020), `pos_organizations`, `pos_stores` |
| **G3 — Booking-only rebuild** | 0028–0034 | QloApps-style booking: products/_lang, rooms_new, rate_plans_new, orders, order_state(_lang), customers, meal_*(_lang), plans_new | Largely **active**, but its `products` catalog lost to G2's `pos_products` (0054); several sub-tables never used |

Cross-generation bridges added later: `tenant_org_mapping` + `v_tenant_org` (0041), `price_overrides` (0048), `inbox_reads` (0049), `idempotency_key` (0050), `tenants.type` (0052), `camps` one-per-tenant (0053).

### 1.3 Complete table inventory (all 65 user tables)

Legend: **Refs** = SQL-context hits in `backend/src` (files × hits abbreviated). Status: 🟢 active · 🟡 quasi (single compat ref) · 🔴 dead (0 refs).

#### Core & Marketplace (G1 survivors)

| Table | Refs | Purpose / ownership notes |
|---|---|---|
| 🟢 `tenants` | tenants.js(9), admin.js(8), auth.js(2), camps.js(1), pos-users.js(1), middleware/tenant.js(1), index.js(1) | Tenant registry = branding + contact + passphrases (bcrypt, flags-only exposure) + `menu_config` JSON (0026) + `currency` (0030) + `type` CHECK('camp','supermarket','transportation','other') (0052). Root host uses synthetic `marketplace` row (excluded from directories since 2026-08-11). |
| 🟢 `camps` | camps.js(22), admin.js(7), others.js(5), reports.js(3), orders.js(3), inbox.js(1), meal-schedules.js(2) | Camp entity. Since **0053**: `UNIQUE idx_camps_one_per_tenant(tenant_id)` → tenant ≙ camp. Convention: `camps.id == tenants.id` for real tenants. |
| 🟢 `leads` | inbox.js(4), leads.js(5) | Public contact/booking inquiries. Extended by 0032 (subject/message/source/status), indexed 0033, read-tracking 0049 (`is_read`,`read_at`). All seed rows purged by 0051; E2E residue only. |

#### Auth & identity

| Table | Refs | Notes |
|---|---|---|
| 🟢 `admins` | auth.js(12), admin.js(17), sharedAuth.js(3), tenants.js(5), index.js(1) | Admin-panel auth (0028). roles: `super_admin`/`admin`; `tenant_id NULL` = super admin. bcrypt. Seeded superadmin (0029). Replaced G1 `users` (dropped 0019) *for the panel* — POS kept its own table. |
| 🟢 `pos_users` | pos-users.js(13), routes/pos/index.js(5) | POS terminal + staff accounts (0010 + 0016/0019/0023 patches). **Gotchas:** `name` is GENERATED (`first_name||' '||last_name`); `organization_id INTEGER NOT NULL`; `tenant_id TEXT` nullable; dual hash support (`$sha256$` prefix auto-upgrade); `deleted_at` soft-delete; `camp_id/salary/hire_date` merged from G1 `staff` (0023). |
| 🟢 `password_reset_tokens` | auth.js(6) | Forgot/reset flow (created originally inline in auth.js; now a real table). |

#### Booking domain (G3)

| Table | Refs | Notes |
|---|---|---|
| 🟢 `orders` | orders.js (≈15 statements), reports.js, inbox.js | Reservations (replaces G1 `reservations`, dropped 0045). FKs: `room_id→rooms_new RESTRICT`, `customer_id→customers SET NULL`, `order_state_id→order_state RESTRICT`, `camp_id→camps CASCADE`, `tenant_id→tenants CASCADE`. Unique `reference`. Availability overlap queries rely on `idx_orders_tenant_room_dates` (0038). Reports compute revenue from `orders.total_amount` — **not** from the dead `revenue` table. |
| 🟢 `rooms_new` | camps.js(13), orders.js(8), admin.js(3), inbox.js(1), reports.js(2) | Physical rooms. `product_id` FK → **`products`(local) / `pos_products`(post-0054)** RESTRICT; `camp_id→camps CASCADE`; `tenant_id` added 0044 (nullable, default 'acaciacamp'). Rebuilt by 0054 (pending locally). |
| 🟢 `rate_plans_new` | camps.js(7), admin.js(2), orders.js(1) | Seasonal pricing per product. Same 0054 FK story. `season CHECK IN ('summer','winter','all')`. |
| 🟢 `customers` | orders.js(3+) | Booking guest CRM (find-or-create by email/phone within tenant during order create). |
| 🟢 `order_state` | orders.js(4) | Status lookup seeded en+ar (0029): pending/confirmed/checked_in/checked_out/cancelled. Global lookup — intentionally NOT tenant-scoped. |
| 🟢 `order_state_lang` | orders.js(2), reports.js(1) | i18n names joined `AND lang='en'`. |
| 🟢 `price_overrides` | priceOverrides.js(4), orders.js(1) | Per-product per-night pinned price (0048). Scoped by joining **pos_products** (code comment claiming "products join" is stale). `UNIQUE(product_id,date)`; `product_id` declared INTEGER but actual ids are TEXT — SQLite affinity tolerates, flag as cosmetic debt. |

#### Catalog (the contested middle)

| Table | Refs | Notes |
|---|---|---|
| 🟢 `pos_products` | camps.js(12), admin.js(4), orders.js(2), categories.js(1), inventory.js(2), priceOverrides.js(3), registry.js(2), routes/pos/* | THE catalog (0010, slimmed by 0042 rebuild which dropped `price`,`reorder_level`,`category`). `type CHECK('room','menu','buffet','retail')`. Room types live here since 0021/0045; ownership via `camp_id` authoritative since **0053** (soft FK, no REFERENCES clause — rebuild deferred). Generated `profit_margin`. Trigger `update_products_timestamp` live. 13 indexes. |
| 🟡 `products` | camps.js ×1 (`ensureProductInProductsTable`) | G3 room-type table (0028). Empty in production; 1 mirror row locally. Sole purpose: satisfy old `rooms_new/rate_plans_new FK→products` **before 0054 applies**. Best-effort INSERT OR IGNORE shim wrapped in try/catch — retained DELIBERATELY as belt-and-suspenders even though 0054 is verified in production (logbook 2026-08-21). Removal is an explicit team decision, not routine cleanup. |
| 🟡 `product_camps` | camps.js(5), admin.js(2) | Junction product↔camp (created 0021 replacing `room_type_camps`). Kept after 0053 **only for read-compat**; `pos_products.camp_id` is source of truth; new code must not use the junction. Drop in follow-up B2. |
| 🟢 `categories` | categories.js(7), admin.js(2) | Hierarchical category tree (0028). `tenant_id` nullable since 0031 — NULL = global/shared by design. |
| 🟢 `category_lang` | categories.js(5) | i18n names/descriptions/SEO per category. |

#### Menu domain (G3)

| Table | Refs | Notes |
|---|---|---|
| 🟢 `meals` | meals.js(7), admin.js(2), meal-schedules.js(2), tenants.js(1) | Menu items v2 (0028 recreation after 0020 dropped meals-v1 into `pos_products type='menu'`). `has_meals` computed flag in tenant.me counts this table. |
| 🟢 `meal_lang` | meals.js(5), meal-schedules.js(1) | i18n names/descriptions. |
| 🟢 `meal_categories` | meal-categories.js(7), meals.js(2), admin.js(2) | Menu category headers. |
| 🟢 `meal_categories_lang` | meal-categories.js(5), meals.js(2) | i18n names. |
| 🟢 `meal_schedules` | meal-schedules.js(4) | Meal planner grid. FK `meal_id→meals` (fixed 0037 from wrong `pos_products` target). Best-covered table index-wise (0035+0038). |

#### Planning

| Table | Refs | Notes |
|---|---|---|
| 🟢 `plans_new` | others.js(5), admin.js(2) | Activity/event schedule per camp. `tenant_id` added 0044. Legacy twin `plans` still exists, dead. Rename candidate. |

#### POS transactions (G2 survivors)

| Table | Refs | Notes |
|---|---|---|
| 🟢 `pos_transactions` | routes/pos/index.js(11), pos-users.js(1) | Sales. Scoping duality: `tenant_id TEXT` AND `organization_id/store_id INTEGER` (bind `posUser.tenantId` vs `.organizationId` — never mix). Tax from `pos_organizations.tax_rate` (T3 fix); dashboard day-boundary from `pos_organizations.timezone`. Split payments `amount_cash/amount_card` (0036); `idempotency_key` partial-unique (0050). Trigger `update_customer_stats_after_order` fires on completed inserts → **writes dead `pos_customers`**. |
| 🟢 `pos_transaction_items` | routes/pos/index.js(4) | Line items. FK to pos_transactions + pos_products (repaired 0046 after 0042 rename-swap broke it). |
| 🟢 `pos_shifts` | routes/pos/index.js(5) | Cashier open/close shifts (0035). Composite covering index for open-shift check (0038). |
| 🟢 `pos_recipe_ingredients` | routes/pos/index.js(1) | Recipe BOM: meal(product) → ingredient(product), both FK→pos_products (repaired 0047). Tenant column present. |

#### POS org bridge (semi-active)

| Table | Refs | Notes |
|---|---|---|
| 🟢 `pos_organizations` | routes/pos/index.js(3), pos-users.js(2) | **Not dead** despite plan-doc claim: supplies `tax_rate` (per-order tax), `timezone` (dashboard day boundary), org lookups for staff mgmt. FK parent of pos_users/pos_products/pos_transactions/tenant_org_mapping — cannot drop without major rebuilds anyway. |
| 🟢 `pos_stores` | pos-users.js(2), routes/pos/index.js(1) | Store lookup for staff creation. FK parent of pos_users.store_id, pos_transactions.store_id. |
| 🟢 `tenant_org_mapping` | pos-users.js(3), inventory.js(1), camps.js(1), routes/pos/index.js(1) | Bridge `tenants.id ↔ pos_organizations.id` (0041), UNIQUE both sides + view `v_tenant_org`. This IS the tenant-scoping answer for POS-side integer keys. |

#### Inbox

| Table | Refs | Notes |
|---|---|---|
| 🟢 `inbox_reads` | inbox.js(3), registry.js(1) | Read-acks for bookings (leads carry their own flags). PK `(tenant_id, ref_type, ref_id)` = tenant-safe by construction (0049). |

#### Lookups (no direct refs, required)

| Table | Notes |
|---|---|
| `languages` | Seeded en/ar (0029). FK target of all four `_lang` tables + `category_lang`. Keep. |

#### Quasi-active oddity

| Table | Notes |
|---|---|
| 🟡 `pos_categories` | Single consumer: `inventory.js` low-stock listing LEFT JOINs it for a display name (`pc.name AS category`). One-line code change makes it droppable. Note `backend/tests/inventory-low-stock.test.js` builds its own schema including this table and asserts the join. |

---

## 2. Dead Table Analysis (31 tables, zero backend SQL references)

### 2.1 Already dropped by earlier migrations (for completeness)

`users`(0019) · `inventory`, `meal_ingredients`, `meals`-v1(0020) · `room_type_camps`(0021) · `staff`(0023) · `reservations`, `rooms`, `rate_plans`, `room_types`, `camps_new`, `category`, `expenses`, `loyalty_transactions`, `pos_payments`(0045). These do **not** exist anymore; they appear in old code comments only. The plan doc's Batch-1 list is therefore half-done: **0045 executed its first five DROPs but skipped `financial_accounts`, `financial_transactions`, and never included `revenue`/`plans`.**

### 2.2 Dead-table census — still alive today

#### Group A — G1 finance/planning remnants (4 tables)

| Table | Rows (local) | Why it's dead | Drop notes |
|---|---|---|---|
| 🔴 `plans` | 0 | Superseded by `plans_new`; seed rows purged by 0051 | Leaf — drop freely |
| 🔴 `revenue` | 0 | Revenue reporting computes from `orders.total_amount` (`reports.js`) since the P0 rewrite | Leaf — drop freely |
| 🔴 `financial_accounts` | 0 | No consumer; frontend has no finance panel | Parent of `financial_transactions` — drop **after** child |
| 🔴 `financial_transactions` | 0 | Same | Child — drop first |

#### Group B — G3 booking schema, never wired up (5 tables)

| Table | Rows | Why it's dead | Drop notes |
|---|---|---|---|
| 🔴 `order_return_detail` | 0 | Refund line items; no refunds feature shipped | References products/rooms_new/order_return — drop before parents |
| 🔴 `order_return` | 0 | Refund requests; zero refs | Drop after detail, before state |
| 🔴 `order_return_state` | 3 | Seeded by 0029 but never queried | Drop last of the three (inbound FK from order_return) |
| 🔴 `product_lang` | 0 | i18n for `products`, which itself lost to `pos_products` | Leaf (nothing references it) |
| 🔴 `product_camps_new` | 0 | 0028 accidentally created a *second* junction alongside 0021's `product_camps`; this one was never referenced | Leaf |

#### Group C — G2 enterprise-POS residue (22 tables)

All created in 0010 unless noted; all zero refs. None has any inbound FK from an active table except where flagged:

| Table | Rows | Notes / entanglement |
|---|---|---|
| 🔴 `pos_achievements` | 0 | Parent of `pos_user_achievements` (both dead) |
| 🔴 `pos_user_achievements` | 0 | Drop before achievements |
| 🔴 `pos_gamification_stats` | 0 | Gamification was stubbed out (staff.js returns 501) |
| 🔴 `pos_analytics_daily` | 0 | Analytics computed live instead |
| 🔴 `pos_audit_logs` | 0 | Never written |
| 🔴 `pos_activity_logs` | 0 | Rebuilt with FK+tenant_id (0017→0039→0040) for nothing; zero writers |
| 🔴 `pos_brands` | 0 | `pos_products.brand_id` is a soft column (FKs dropped in 0042 rebuild) |
| 🔴 `pos_suppliers` | 0 | Same as brands |
| 🔴 `pos_categories` | 0 | ⚠️ **quasi-dead**: one LEFT JOIN in `inventory.js` low-stock + mirrored in `backend/tests/inventory-low-stock.test.js` (which builds its own schema). Fix code+test first, then drop |
| 🔴 `pos_customer_addresses` | 0 | Child of pos_customers |
| 🔴 `pos_loyalty_programs` | 0 | Loyalty never shipped |
| 🔴 `pos_loyalty_transactions` | 0 | Recreated by 0015 for FK hygiene, still unused |
| 🔴 `pos_promotions` | 0 | Promotions never shipped |
| 🔴 `pos_promotion_usage` | 0 | Child of promotions |
| 🔴 `pos_product_variants` | 0 | Inbound FKs only from other dead tables (inventory/stock_movements/adjustment_items); rebuilt 0047 |
| 🔴 `pos_stock_adjustment_items` | 0 | Generated cols (`difference`,`cost_impact`) — exclude from any INSERT…SELECT |
| 🔴 `pos_stock_adjustments` | 0 | Parent of adjustment_items |
| 🔴 `pos_inventory_logs` | 0 | Rebuilt twice (0039, 0040, 0047) — still zero writers |
| 🔴 `pos_staff_stats` | 0 | Rebuilt twice (0016→0039→0040) — staff.js reads stats live from pos_transactions instead |
| 🔴 `pos_user_sessions` | 0 | Legacy login once wrote here best-effort (Track C Phase 2.2); current auth.js has **zero** references — sessions are JWT-only now |
| 🔴 `pos_customers` | 0 | ⚠️ **FK-entangled with ACTIVE `pos_transactions.customer_id`** + two triggers (see §2.3). POS checkout never binds customer_id (grep: zero matches in `routes/pos/index.js`) |
| 🔴 `pos_inventory` | 0 | ⚠️ **trigger-entangled**: `update_inventory_after_movement` writes it |
| 🔴 `pos_stock_movements` | 0 | ⚠️ **hosts that trigger**; both sides dead |

### 2.3 Entanglements that block naive drops

```
update_customer_stats_after_order  ON pos_transactions INSERT → UPDATE pos_customers   (dead target on ACTIVE table)
update_customers_timestamp         ON pos_customers UPDATE      → self-touch            (dies with table)
update_inventory_after_movement    ON pos_stock_movements INSERT → UPDATE pos_inventory (dead ↔ dead)
pos_transactions.customer_id ──FK(NO ACTION)──▶ pos_customers
```

Consequences:
1. Dropping `pos_customers` requires: drop both triggers → rebuild `pos_transactions` without the customer_id FK (rename-swap or create-copy-swap). `customer_id` column itself may stay (nullable, unbound) if you want to avoid touching the hot path — dropping just the FK constraint is enough.
2. Dropping `pos_inventory`/`pos_stock_movements` requires dropping `update_inventory_after_movement` **first** (0047 lesson: live triggers referencing renamed/dropped tables abort `ALTER TABLE … RENAME`).
3. Every completed POS sale currently executes a pointless `UPDATE pos_customers …` via trigger #1 — pure overhead until removed.

### 2.4 Answer to key question #1 — "Which tables are truly dead?"

**Truly dead (zero refs, zero blockers): 27**
`plans`, `revenue`, `financial_accounts`, `financial_transactions`,
`order_return`, `order_return_detail`, `order_return_state`, `product_lang`, `product_camps_new`,
`pos_achievements`, `pos_user_achievements`, `pos_gamification_stats`, `pos_analytics_daily`, `pos_audit_logs`,
`pos_activity_logs`, `pos_brands`, `pos_suppliers`, `pos_customer_addresses`, `pos_loyalty_programs`,
`pos_loyalty_transactions`, `pos_promotions`, `pos_promotion_usage`, `pos_product_variants`,
`pos_stock_adjustment_items`, `pos_stock_adjustments`, `pos_inventory_logs`, `pos_staff_stats`

**Dead but code-blocked: 4**
`pos_customers` (FK from pos_transactions + 2 triggers) · `pos_inventory` (trigger) · `pos_stock_movements` (trigger host) · `pos_categories` (one JOIN + one test)

**Quasi-dead (one compat ref each): 3**
`products` (mirror shim in camps.js — kept deliberately as belt-and-suspenders despite 0054 being live in production) · `product_camps` (read-compat junction per 0053) · *(counted above)*

---

## 3. Duplicate Table Analysis

| # | Cluster | Members | Verdict |
|---|---|---|---|
| D1 | **Product catalog** | `pos_products` (G2) vs `products` (G3) vs `room_types` (G1, dropped) | **Resolved → `pos_products`.** 0054 repointed rooms/rate-plans FKs (**verified in production 2026-08-21**; local pending); backend reads pos_products exclusively. Residue: apply 0054 locally; `ensureProductInProductsTable` shim retained by design (belt-and-suspenders) — optional later: remove shim + drop `products`, `product_lang`, `product_camps_new`. |
| D2 | **Camp membership** | `product_camps` junction vs `pos_products.camp_id` (vs dead `product_camps_new`) | **Resolved → `camp_id`** (0053 made it source of truth; junction = read-compat). Follow-up B2: switch last readers, then drop junction. With one-camp-per-tenant the junction is redundant *by definition* (camp_id is functionally determined). |
| D3 | **Menu items** | `meals(+meal_lang)` (G3) vs `pos_products type='menu'` (G2) | **OPEN duplication — highest-risk merge.** 0020 merged meals-v1 into pos_products, then 0028 recreated `meals` for the booking menu. Today: public menu page + meal_schedules + `has_meals` flag read `meals`; POS sells from pos_products type='menu'. Options in §7 Phase C. |
| D4 | **Categories ×3** | `categories(+category_lang)` vs `meal_categories(+lang)` vs `pos_categories` | Partially resolvable: `pos_categories` → drop (fix one JOIN). `categories` vs `meal_categories`: different UIs (listing wizard vs menu planner); consolidation optional — could unify behind `categories(parent_id)` tree later. Not blocking. |
| D5 | **Customers** | `customers` (booking CRM) vs `pos_customers` (POS CRM) | **Resolved → `customers`.** pos_customers dies via §2.3 procedure. If POS ever needs walk-in customers, reuse `customers`. |
| D6 | **Auth/users** | `admins` vs `pos_users` | **Intentional split — keep both.** Panel accounts vs terminal/staff accounts with different columns (org/store/camp/salary/generated name). Both bcrypt; sharedAuth middleware already abstracts verification. Do NOT merge schemas; merge at middleware level if needed. |
| D7 | **Reservations naming** | `reservations` (dropped) vs `orders` | Resolved → orders. |
| D8 | **Plans naming** | `plans` (dead) vs `plans_new` | Rename pending (§7 Phase R). |
| D9 | **Rooms/rate-plans naming** | legacy dropped vs `_new` suffix tables | Rename pending (§7 Phase R) — highest mechanical risk due to rename-swap. |
| D10 | **Finance** | `financial_accounts/transactions/revenue/expenses` (all dead) | No successor exists. If finance returns, design fresh against orders/pos_transactions; do not resurrect these. |

---

## 4. Relationship Analysis (FK graph)

### 4.1 Active-core ER sketch

```
tenants ──┬─◀ camps (UNIQUE tenant_id)          tenants ◀─ leads
          │        │
          │        ├─◀ meal_schedules ──▶ meals ─▶ meal_categories
          │        │                          └▶ meal_lang / meal_categories_lang
          │        ├─◀ plans_new
          │        └─◀ rooms_new ──RESTRICT──▶ pos_products ◀─ price_overrides
          │                 ▲                      │  │
          │                 │                      │  └──◀ pos_recipe_ingredients (self-BOM)
          ├──◀ rate_plans_new ─────────────────────┘
          ├──◀ orders ──RESTRICT room_id──▶ rooms_new ; order_state_id──▶ order_state(+lang)
          │        └──SET NULL customer_id──▶ customers
          ├──◀ admins (SET NULL tenant_id = super admin)
          ├──◀ pos_shifts
          ├──◀ pos_users (tenant_id nullable)
          ├──◀ pos_transaction(_items) (tenant_id TEXT)
          └──◀ tenant_org_mapping ──▶ pos_organizations ──▶ pos_stores
                                                            │
              pos_users.store_id / pos_transactions.store_id ┘
inbox_reads: standalone side table keyed (tenant_id, ref_type, ref_id)
password_reset_tokens: auth.js-managed
```

### 4.2 Facts extracted from `PRAGMA foreign_key_list` (live DB)

1. **Tenant cascade root:** every core child cascades on `tenants` delete — except `admins` (`ON DELETE SET NULL`, deliberate so super-admins survive).
2. **`plans_new` has NO tenant_id FK** — only `camp_id→camps CASCADE`. Its `tenant_id` (added 0044) is a denormalized query column with no constraint. Same pattern for `rooms_new.tenant_id`.
3. **`pos_products` lost ALL declared FKs** in the 0042 rebuild — `organization_id/category_id/brand_id/supplier_id/camp_id/tenant_id` are soft references. Only indexes enforce lookup paths.
4. **RESTRICT edges to respect in deletion flows:** `orders.room_id→rooms_new` and `rooms_new.product_id→(products|pos_products)`. Code already deletes orders before rooms (orders.js cascade handler).
5. **`pos_shifts.cashier_id` has no FK** (0035 created it tenant-FK-only). `pos_transactions.cashier_id` also FK-free since 0014 (deliberate — cashiers may be deleted while keeping sales history).
6. **Generated columns present:** `pos_users.name`, `pos_products.profit_margin`, (+ dead-table ones). Any future copy/rebuild must exclude them from INSERT…SELECT lists (0047 lesson).
7. **Junction inventory:** `room_type_camps` (dropped) → `product_camps` (compat) → `product_camps_new` (dead) → implicit `pos_products.camp_id` (authoritative). One junction survived three generations of churn.
8. **i18n pattern:** four active `_lang` pairs (category, meal, meal_categories, order_state) + dead product_lang. All FK→`languages(code)` CASCADE. The pattern works; `languages` must be kept even though it has zero direct queries.
9. **View:** `v_tenant_org` = trivial projection of `tenant_org_mapping`; keep or drop with the mapping decision.
10. **Orphan risk history:** 0042's rename left six child tables pointing at a ghost `pos_products_old` (fixed 0046/0047). Current `PRAGMA foreign_key_check` on local DB: clean — but re-run after EVERY rename migration.

---

## 5. Tenant Scoping Audit (key question #4)

Four coexisting scoping mechanisms. The rule of thumb: **TEXT world keys on `tenant_id`, INTEGER POS world keys on `organization_id`, bridged by `tenant_org_mapping`/`v_tenant_org`.**

| Mechanism | Tables | Notes |
|---|---|---|
| `tenant_id TEXT FK→tenants` | camps¹, leads, admins², customers³, meal_categories³, meals³, meal_schedules³, orders³, rooms_new⁴, rate_plans_new⁴, plans_new⁴, pos_shifts, pos_transactions, pos_transaction_items, pos_recipe_ingredients, inbox_reads⁵ | ¹UNIQUE since 0053 · ²nullable ⇒ super-admin · ³CASCADE · ⁴column added 0044, **no FK declared** on tenant_id for rooms/plans variants — denormalized query aid · ⁵part of PK `(tenant_id, ref_type, ref_id)` |
| `organization_id INTEGER` (+`store_id`) | pos_users (NOT NULL), pos_products (soft, FK-less since 0042), pos_transactions (duplicates tenant_id!), tenant_org_mapping | Bind `posUser.organizationId` for store-level POS queries; never mix with `tenantId` in the same WHERE |
| `camp_id` | rooms_new, rate_plans_new, orders, plans_new, meal_schedules, pos_products.camp_id | Since 0053, `camp_id` ≈ tenant identity (one camp per tenant); prefer tenant_id for authorization filters, camp_id for entity ownership |
| Global / shared | `languages`, `order_state(+_lang)`, `categories` (NULL tenant = shared), `price_overrides` (scoped transitively via pos_products join) | Intentionally unscoped |

**Verdict:** scoping is *conventional* but consistent where it matters. Two hygiene items: (a) `plans_new.tenant_id` and `rooms_new.tenant_id` lack FK constraints — acceptable, but document; (b) `pos_transactions` carrying BOTH `tenant_id` and `organization_id` is the one true dual-write surface — the code convention (bind one, never both) is currently enforced only by discipline. Consider a CHECK or a code comment contract in `routes/pos/index.js`.

**Answer to Q4:** every active table is tenant-scoped either directly (`tenant_id`), via the org bridge (`organization_id` + mapping), via `camp_id` under the one-per-tenant invariant, or is deliberately global (lookups/i18n). No active table leaks across tenants structurally; `inbox_reads` is safe by PK construction.

---

## 6. Index Analysis (key question #5)

### 6.1 What exists (deliberate work already done)

| Migration | Index | Serves |
|---|---|---|
| 0038 | `idx_orders_tenant_room_dates(tenant_id, room_id, check_in_date, check_out_date)` | Availability overlap queries (the hottest query in the app) |
| 0035 | Composite covering index on `pos_shifts` | Open-shift-for-user lookup |
| 0038 | Composite on `meal_schedules` + `pos_transactions(org, created_at)` | Planner grid; dashboard day-boundary rollups |
| 0050 | Partial UNIQUE `pos_transactions.idempotency_key WHERE idempotency_key IS NOT NULL` | Duplicate-submit protection |
| 0053 | UNIQUE `idx_camps_one_per_tenant(camps.tenant_id)` | One-camp-per-tenant invariant |
| 0033 | Lead indexes (status/created-at family) | Inbox sorting/filtering |
| 0034 | Base indexes on rooms_new / rate_plans_new / catalog tables | CRUD paths |
| — | `pos_products`: 13 indexes (type, camp_id, tenant_id, organization_id, is_active, …) | Catalog browsing + admin filters |

### 6.2 Gaps & recommendations

> ⚠️ **SQLite does not auto-index FK child columns** (unlike Postgres/MySQL). Any FK used in a JOIN/WHERE needs an explicit index.

1. **`customers(tenant_id, email)` / `(tenant_id, phone)`** — find-or-create runs on every order creation. *Verify then add.*
2. **`pos_transaction_items(transaction_id)`** — receipt/detail fetch per transaction. *Verify with EXPLAIN QUERY PLAN; add if scanning.*
3. **`pos_recipe_ingredients(product_id)` + `(ingredient_product_id)`** — BOM explosion both directions.
4. **`price_overrides`** — already covered by `UNIQUE(product_id, date)`; no action.
5. **Dead-table indexes are pure bloat** — dozens of indexes across the 31 dead tables inflate schema size and (marginally) write cost on those tables. They vanish with the Phase B drops; do not tune them.

Verification recipe (local):

```bash
python3 - <<'PY'
import sqlite3,glob
db=sqlite3.connect(glob.glob('backend/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite')[0])
for t,c in [('customers','tenant_id,email'),('pos_transaction_items','transaction_id'),('pos_recipe_ingredients','product_id')]:
    print(t,[i[1] for i in db.execute(f'PRAGMA index_list({t})')])
    print('  cols:',[r[-1] for r in db.execute(f'PRAGMA index_info({t})')] if False else '')
PY
```

Remote equivalent: `npx wrangler d1 execute campmaster-backend --remote --config backend/wrangler.toml --command "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='customers'"`.

---

## 7. Unification Plan (key questions #2 & #6)

> **Prime directive (from SCHEMA_DIRECTION_PLAN.md, validated by this audit):** the destination is a booking-only schema whose catalog is `pos_products`, scoped by `tenant_id`/`camp_id` under one-camp-per-tenant. Every phase below moves toward it without big-bang rewrites.

### D1 migration ground-rules (learned the hard way — 0042/0046/0047/0054)

1. Never rely on `ALTER TABLE … RENAME` to fix child FKs — it broke production once (six ghost references) and cost three repair migrations. Prefer **create-copy-swap**: `CREATE new → INSERT…SELECT (excluding generated cols) → DROP old → ALTER new RENAME`.
2. **Drop triggers before touching their subjects** — live triggers referencing renamed/dropped tables abort the DDL.
3. `PRAGMA foreign_keys` is not controllable on D1; use `PRAGMA defer_foreign_keys='ON'` inside the same batch when reorder is unavoidable.
4. Run `PRAGMA foreign_key_check` as the final statement of every structural migration.
5. Generated columns must be excluded from `INSERT … SELECT` column lists.
6. Migrations are append-only (`d1_migrations` ledger); next numbers start at **0055**. Never edit an applied file.

### Phase 0 — Preconditions *(no schema change)*
- Apply pending **0054** locally (**production side already done**: applied + verified 2026-08-21 per AGENT_LOGBOOK); then confirm via `foreign_key_list` that `rooms_new.product_id` / `rate_plans_new.product_id` → `pos_products(id)` in **both** environments.
- Keep `ensureProductInProductsTable()` in place until B2 step 3 is explicitly approved — it is intentional defense-in-depth, not dead code.
- Record pre-drop row counts of all 31 dead tables as evidence (expect all zero except `order_return_state`=3, `products`=1).

### Phase A — Trigger cleanup *(migration 0055 — trivial, immediate win)*
```sql
DROP TRIGGER IF EXISTS update_customer_stats_after_order; -- stops dead UPDATE per completed sale
DROP TRIGGER IF EXISTS update_inventory_after_movement;   -- unlocks pos_inventory/stock_movements drops
DROP TRIGGER IF EXISTS update_customers_timestamp;        -- dies with pos_customers anyway
```
Keep `update_users_timestamp` and `update_products_timestamp` (active, harmless). Risk: none — all three targets are dead tables.

### Phase B — Dead drops
- **B1 (migration 0056):** drop the 27 Tier-A tables, child-before-parent:
  `financial_transactions → financial_accounts`; `order_return_detail → order_return → order_return_state`;
  `pos_user_achievements → pos_achievements`; `pos_promotion_usage → pos_promotions`;
  `pos_stock_adjustment_items → pos_stock_adjustments`; then leaves: `plans, revenue, product_lang, product_camps_new,
  pos_gamification_stats, pos_analytics_daily, pos_audit_logs, pos_activity_logs, pos_brands, pos_suppliers,
  pos_customer_addresses, pos_loyalty_programs, pos_loyalty_transactions, pos_product_variants,
  pos_inventory_logs, pos_staff_stats, pos_user_sessions`.
- **B2 (migration 0057 + one-line code change + test tweak):**
  1. `inventory.js`: replace `LEFT JOIN pos_categories pc` display-name join with `'' AS category` (or reuse `categories` if desired) → update `tests/inventory-low-stock.test.js` fixture → **DROP `pos_categories`**.
  2. Switch remaining `product_camps` readers to `pos_products.camp_id` → **DROP `product_camps`**.
  3. OPTIONAL / needs sign-off: remove the `ensureProductInProductsTable` shim in `camps.js` → **DROP `products`**. The team currently retains this shim deliberately as belt-and-suspenders (logbook 2026-08-21); treat removal as reversing that decision once local/prod parity is confirmed.
- **B3 (migration 0058, medium risk — touches hot table):** rebuild `pos_transactions` via create-copy-swap **without the `customer_id` FK** (keep or drop the nullable column — recommend keep, zero code reads it today but receipts may want it later) → **DROP `pos_customers`**. Alternative accepted-risk option: defer B3 indefinitely; after Phase A the only cost of `pos_customers` is its own existence.

### Phase C — Menu unification decision *(product call, not a chore)*
- **Option 1 — document the split (recommended):** `meals(+lang,schedules)` = guest-facing menu planner; `pos_products type='menu'` = sellable POS items. Zero migration. Cost: staff must enter items twice when both surfaces are used.
- **Option 2 — full merge:** retarget `meal_schedules.meal_id → pos_products(id)`, convert `meals` to a filtered VIEW, repoint `has_meals` counting and public menu queries. Touches public pages, meal APIs, schedules, and a live FK — high blast radius. Only worth it if double-entry becomes an operational pain.

### Phase D — Optional consolidations
- Fold `order_state_lang` into `order_state.name_en/name_ar` JSON or plain columns (drops 1 table + 1 join).
- Same treatment possible for the other three `_lang` pairs if i18n ambitions stay frozen (English-only product).
- Consider moving `pos_organizations.tax_rate/timezone` onto `tenants` long-term, letting the org bridge become pure plumbing (do **not** attempt while pos_users/transactions still FK to organizations).

### Phase R — Rename normalization *(deliberately deferred)*
`rooms_new→rooms`, `rate_plans_new→rate_plans`, `plans_new→plans`. Cosmetic; given the rename-swap incident history and D1 constraints, **defer until there's a forcing function** (e.g., D1 ships safer ALTER semantics or a major version boundary). If ever attempted: create-copy-swap only, one table per migration, `foreign_key_check` mandatory.

### Resulting minimal schema
Post Phases A–B: **31 active tables** (the ones listed in §1.3 minus `products`, `product_camps`, `pos_categories`, `pos_customers`). Phases C/D optionally shave toward ~24–26 by folding `_lang` tables and the state lookup — all flagged as product decisions, none required for correctness.

---

## 8. Risk Assessment (key question #3)

| ID | Risk | L×I | Mitigation |
|---|---|---|---|
| R1 | Rename-swap breaks child FKs (recurred 0042→0046/0047; blocks 0054 locally) | M × H | Ban plain renames in new work; create-copy-swap; `foreign_key_check` after every structural migration |
| R2 | Local/remote drift (0054 pending locally; prod verified 2026-08-21): local tests exercise stale FK targets while prod runs fixed ones; shim try/catch would swallow divergence symptoms | M × M | Phase 0 gate: apply 0054 locally before any drop; keep shim until parity confirmed |
| R3 | Test fixtures build private schemas that drift from reality (`inventory-low-stock.test.js` recreates `pos_categories`) | M × L | Update tests in the same PR as B2; prefer fixtures derived from latest migration files |
| R4 | Dropping a table some forgotten reader uses (dynamic SQL, future branch) | L × M | Evidence-based census (§1–2) + grep again at drop time + staging deploy first |
| R5 | Trigger dropped while sale in flight | L × N | SQLite DDL is atomic per statement; worst case one missed stats-update to a table nobody reads |
| R6 | Data loss from drops | L × N | All candidates empty except 3 seeded lookup rows + 1 mirror row; capture COUNT(*) evidence in the migration PR description |
| R7 | `orders.room_id` RESTRICT surprises deletion flows after room-table churn | L × M | Existing code deletes orders first; keep that invariant in any rooms refactor |
| R8 | Dual scoping misuse on `pos_transactions` (mixing tenant_id/organization_id binds) | M × M | Documented convention + code comment contract; optional CHECK later |

**Overall:** Phases 0/A/B1 are near-zero risk. B2 is low with the included code/test changes. B3 is the only step touching a hot table — schedule in a quiet window. Phase C-Option-2 is the only genuinely dangerous item and is avoidable.

---

## 9. Key Questions — Consolidated Answers

1. **Truly dead tables?** 27 freely droppable + 4 code-blocked (`pos_customers`, `pos_inventory`, `pos_stock_movements`, `pos_categories`) + 3 quasi-compat (`products`, `product_camps`, + `pos_categories` overlaps) — details §2.4.
2. **Duplicate clusters & winners?** Catalog→`pos_products`; camp membership→`pos_products.camp_id`; customers→`customers`; auth→intentional split (`admins`/`pos_users`); reservations→`orders`; finance→nothing (design fresh if ever needed); menu items→**OPEN** (meals vs pos_products, Phase C).
3. **Orphaned/broken relationships?** Historical ghosts repaired (0046/0047); current `foreign_key_check` clean locally. Structural quirks: `plans_new`/`rooms_new` tenant_id unconstrained; `pos_products` fully FK-less since 0042; `cashier_id` columns FK-free by design; junction lineage `room_type_camps→product_camps→(product_camps_new)→camp_id`.
4. **Tenant scoping?** Complete and sound via four mechanisms (§5); one hygiene item (dual keys on `pos_transactions`).
5. **Indexes?** Hot paths covered by deliberate migrations (0033/0034/0035/0038/0050/0053); three candidate additions pending EXPLAIN verification (§6.2); dead-table indexes disappear with Phase B.
6. **Recommended path?** Phases 0 → A → B1 → B2 → (B3 scheduled) → decide C → optional D → defer R (§7). Total: ~4 small migrations, 2 tiny code edits, 1 test tweak.

---

## Appendix A — Verification commands used

```bash
# Live schema introspection (sqlite3 CLI unavailable in this environment)
python3 -c "import sqlite3; ..."   # sqlite_master dump, PRAGMA table_info/foreign_key_list/index_list
# SQL-context reference scan
rg -n "FROM\s+\w+|JOIN\s+\w+|INSERT\s+INTO\s+\w+|UPDATE\s+\w+|REFERENCES\s+\w+" backend/src
# Pending-migration check
ls backend/migrations | tail -3     # 0054 newest; local d1_migrations shows 53 rows
```

## Appendix B — Sources

- `backend/migrations/*.sql` (54 files, read in full)
- Local D1 snapshot `backend/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite`
- `backend/src/**` (SQL-context scans), `app/src/lib/api.ts` endpoint families, admin panel component list
- `SCHEMA_DIRECTION_PLAN.md`, `AGENT_LOGBOOK.md` (T13/T15 entries, P0 rewrite notes), `.opencode/prompts/{project-context,safety-rules}.md`

*End of audit. Next actions require human sign-off: approve Phase ordering (esp. B3 timing and Phase C option) before any migration file is drafted.*


