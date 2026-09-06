# SinaiCamps Database & Migration Audit — Findings

**Task:** `audit-t3-database` (read-only) | **Date:** 2026-09-05
**Scope:** `backend/migrations/*.sql` (91 files), local D1 state (`backend/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/9212…d1d8.sqlite`, read-only), `backend/src/**/*.js` query patterns.
**Constraint honored:** no schema or code was modified; findings only.

---

## 1. Migration chain summary

- **File count:** 91 (`0001_init.sql` → `0091_rate_plans_camp_id.sql`).
- **Numbering:** sequential, zero gaps, zero duplicates (verified programmatically; d1_migrations ledger count = 91 matches).
- **Applied state:** `wrangler d1 migrations list campmaster-db --local` → `✅ No migrations to apply!` (all 91 applied; local D1 is fully migrated).
- **Live schema size:** 105 tables (includes `d1_migrations` ledger and Cloudflare's `_cf_METADATA`).

### Migration register (001 → 091)

| # | File | What it does |
| --- | --- | --- |
| 001 | `0001_init.sql` | Initial schema (tenants, projects-era tables, FKs). |
| 002 | `0002_seed.sql` | Seed tenants. |
| 003 | `0003_add_tenant_branding.sql` | Branding/contact columns on `tenants`. |
| 004 | `0004_seed_tenants.sql` | Marketplace branding record. |
| 005 | `0005_rich_branding.sql` | Rich branding columns (`hero_image_url`, gallery…). |
| 006 | `0006_room_type_images.sql` | `room_types.image_url`. |
| 007 | `0007_admin_passphrase.sql` | `tenants.admin_passphrase`. |
| 008 | `0008_hacker_passphrase.sql` | `tenants.hacker_passphrase`. |
| 009 | `0009_user_username.sql` | `users.username`. |
| 010 | `0010_pos_integration.sql` | POS pillar: `pos_products`, `pos_users`, `pos_transactions`, `pos_customers`, triggers. |
| 011 | `0011_pos_schema_patches.sql` | Missing POS columns expected by the Hono codebase. |
| 012 | `0012_seed_pos_defaults.sql` | Default organization/store seed. |
| 013 | `0013_pos_inventory_logs.sql` | `pos_inventory_logs`; `pos_transactions.order_status`. |
| 014 | `0014_remove_cashier_foreign_key.sql` | Rebuild `pos_transactions` w/o `pos_users(id)` FK. |
| 015 | `0015_relink_transactions_foreign_key.sql` | FK hygiene on transaction children. |
| 016 | `0016_pos_staff_stats_and_name_fields.sql` | **Generated `name` column on `pos_users` and `pos_customers`**; `pos_staff_stats`. |
| 017 | `0017_create_pos_activity_logs.sql` | `pos_activity_logs`. |
| 018 | `0018_pos_customers_visit_fields.sql` | `pos_customers.last_visit`, `visit_count`. |
| 019 | `0019_unify_users.sql` | Merge `users` → `pos_users`. |
| 020 | `0020_unify_inventory.sql` | Merge inventory/meals → POS products. |
| 021 | `0021_room_types_to_pos_products.sql` | Accommodation columns on `pos_products`; `product_camps` junction. |
| 022 | `0022_product_camps_indexes.sql` | Junction indexes. |
| 023 | `0023_merge_staff.sql` | Staff merge into `pos_users` (camp_id, salary…); drops `staff`. |
| 024 | `0024_add_indexes.sql` | POS product tenant/type indexes. |
| 025 | `0025_additional_indexes.sql` | Auth/session/reporting indexes. |
| 026 | `0026_add_menu_config.sql` | `tenants.menu_config`. |
| 027 | `0027_update_passphrases.sql` | Marketplace passphrase rotation. |
| 028 | `0028_create_new_tables.sql` | Phase-1 new tables (`orders`, `rooms_new`, `plans_new`, `rate_plans_new`…). |
| 029 | `0029_seed_data.sql` | Languages, order states, default admin seeds. |
| 030 | `0030_add_tenant_currency.sql` | `tenants.currency`. |
| 031 | `0031_add_categories_tenant_id.sql` | Tenant-scope `categories`. |
| 032 | `0032_create_leads.sql` | `leads` table. |
| 033 | `0033_fix_leads_indexes.sql` | Idempotent lead index repair. |
| 034 | `0034_rename_tenant_ids.sql` | `tenant_1` → `acaciacamp` etc. |
| 035 | `0035_shifts_and_schedules.sql` | `pos_shifts`; meal schedules. |
| 036 | `0036_split_payments_fields.sql` | Split cash/card fields on `pos_transactions`. |
| 037 | `0037_fix_meal_schedule_fk.sql` | Rebuild `meal_schedules` FK. |
| 038 | `0038_add_audit_indexes.sql` | Audit + high-frequency composite indexes. |
| 039 | `0039_fix_p0_schema.sql` | P0: drop dangerous sync triggers. |
| 040 | `0040_add_tenant_id_pos.sql` | **Rebuilds `pos_customers` w/ explicit column list (loses generated `name` — see §6.3).** |
| 041 | `0041_create_tenant_org_mapping.sql` | Bridges dual multi-tenancy. |
| 042 | `0042_cleanup_pos_products.sql` | Drop 3 legacy product columns. |
| 043 | `0043_seed_e2e_pos_user.sql` | `cashier` user for E2E. |
| 044 | `0044_add_tenant_id_to_rooms_plans.sql` | Tenant-scope `rooms_new`/`plans_new`. |
| 045 | `0045_drop_dead_tables.sql` | First dead-table purge (defer FKs). |
| 046 | `0046_repair_pos_transaction_items_fk.sql` | Repair `pos_product`→`pos_products` rename fallout. |
| 047 | `0047_repair_pos_child_fks.sql` | Child FK repair after 0042. |
| 048 | `0048_price_overrides.sql` | Seasonal price overrides. |
| 049 | `0049_inbox.sql` | Unified inbox. |
| 050 | `0050_add_pos_idempotency.sql` | `pos_transactions.idempotency_key`. |
| 051 | `0051_remove_seed_data.sql` | Purge early seeds. |
| 052 | `0052_add_tenants_type.sql` | Marketplace-vs-tenant domain model. |
| 053 | `0053_camp_ownership.sql` | One-camp-per-tenant ownership. |
| 054 | `0054_fix_room_rate_plan_fk_to_pos_products.sql` | Room/rate-plan FK → `pos_products`. |
| 055 | `0055_trigger_hygiene.sql` | Drops 3 triggers targeting dead tables. |
| 056 | `0056_drop_dead_tables.sql` | Purges 30 zero-reference tables (documented in-file). |
| 057 | `0057_quasi_dead_cleanup.sql` | Drops `pos_categories` (last LEFT JOIN fixed first). |
| 058 | `0058_add_meta_tables.sql` | EAV meta tables (project_meta, tenant_meta…). |
| 059 | `0059_add_tenant_columns.sql` | Tenant expansion column batch. |
| 060 | `0060_add_camp_columns.sql` | Camp column batch **+ creates `trg_camps_updated_at`** (landmine, repaired in 0061). |
| 061 | `0061_backfill_slugs_coords.sql` | **Drops `trg_camps_updated_at` before backfill** (trigger referenced nonexistent `camps.updated_at`); backfills projected slugs + coords. |
| 062 | `0062_move_custom_fields_to_meta.sql` | Moves `notes` → `project_meta`; intentionally skips nonexistent `activities`. |
| 063 | `0063_rename_camps_to_projects.sql` | create-copy-swap rename camps → projects. |
| 064 | `0064_drop_old_columns.sql` | Destructive drops left **commented out** (Phase 8/9 guard). |
| 065 | `0065_add_indexes.sql` | Idempotent project/meta indexes. |
| 066 | `0066_fix_camps_fk_references.sql` | Rebuilds `rooms_new`, `meal_schedules`, `orders`, `plans_new` FKs → `projects(id)`. |
| 067 | `0067_add_room_status_lifecycle.sql` | Room status lifecycle columns. |
| 068 | `0068_fix_triggers_and_promotions.sql` | Trigger fixes; promotions. |
| 069 | `0069_restaurant_tables.sql` | `pos_tables`, **`orders.kitchen_status` (line 47)**, **`pos_transactions.kitchen_status` (line 55)**, audit_log entity_type relax. |
| 070 | `0070_add_meal_plan_category.sql` | Meal-plan category linkage. |
| 071 | `0071_add_order_discounts.sql` | Order discount ledger. |
| 072 | `0072_dynamic_services.sql` | Services (definitions/items/bookings). |
| 073 | `0073_self_service_onboarding.sql` | Onboarding columns/token. |
| 074 | `0074_add_performance_indexes.sql` | Cross-module performance indexes. |
| 075 | `0075_business_enhancements.sql` | Business modules enhancement (incl. `tenant_usage` — dead, §5). |
| 076 | `0076_sanitize_user_data.sql` | Strips `<script>`/event handlers from free text. |
| 077 | `0077_add_deferred_indexes.sql` | Indexes depending on 0075 columns. |
| 078 | `0078_financial_management.sql` | Chart of Accounts. |
| 079 | `0079_hr_payroll.sql` | HR & payroll. |
| 080 | `0080_supply_chain.sql` | Warehousing/purchasing. |
| 081 | `0081_crm_projects.sql` | CRM (contacts, opportunities). |
| 082 | `0082_ecommerce_cms.sql` | Carts, blog, pages. |
| 083 | `0083_ai_intelligence.sql` | Predictions. |
| 084 | `0084_platform_settings_subscriptions.sql` | Platform/subscription settings. |
| 085 | `0085_project_links.sql` | Cross-project links. |
| 086 | `0086_project_items.sql` | Per-project item inventory. |
| 087 | `0087_order_payment_paymob.sql` | Paymob tracking columns. |
| 088 | `0088_platform_settings_payment.sql` | Paymob config. |
| 089 | `0089_marketplace_payments_ledger.sql` | Marketplace payment ledger. |
| 090 | `0090_marketplace_payouts.sql` | Payout entity + linkage. |
| 091 | `0091_rate_plans_camp_id.sql` | Rate-plan camp scoping; season CHECK removed. |

---

## 2. Migration chain integrity

**Sequential, complete, all applied — except the well-known historical landmines, which the chain self-documents and repairs:**

1. **`trg_camps_updated_at` (0060) → dropped in 0061:** migration 0060 created a trigger whose body `UPDATE camps SET updated_at …` referenced a column that never existed in this lineage. 0061 explicitly drops it *before* running its own backfill `UPDATE`s (0061:8–14). Live check confirms **no `camps`-family triggers remain**.
2. **Nonexistent `camps.activities`:** 0062 intentionally omits the `activities` copy (header: "this schema lineage never had camps.activities") — correct behavior.
3. **0063 rename camps → projects** uses a create-copy-swap; 0064 leaves the destructive `DROP COLUMN notes/activities` **commented out** until code migration is complete — safe.
4. **0066 FK repair verified live** — the four repaired tables now reference `projects(id)`:
   - `rooms_new.camp_id` → `projects(id) ON DELETE SET NULL` ✓
   - `meal_schedules.camp_id` → `projects(id) ON DELETE SET NULL` ✓
   - `orders.camp_id` → `projects(id) ON DELETE SET NULL` ✓
   - `plans_new.camp_id` → `projects(id) ON DELETE SET NULL` ✓
   These are the only FK-path objects referencing projects from legacy tables; `PRAGMA foreign_key_check` ran clean afterward.
5. **Live triggers (7 total):**
   - `update_users_timestamp` (pos_users) — **unguarded self-update body** (see §6.6).
   - `update_products_timestamp` (pos_products) — **unguarded self-update body** (see §6.6).
   - `trg_rooms_new_updated_at`, `trg_projects_updated_at`, `trg_orders_updated_at`, `trg_plans_new_updated_at`, `trg_tenants_updated_at` — all guarded with `WHEN NEW.updated_at IS NULL OR NEW.updated_at = OLD.updated_at`.
   - Drops targeted by 0055/0056 (026-era `update_customer_stats_after_order`, `update_inventory_after_movement`, `update_customers_timestamp`) confirmed absent.
6. **No `CREATE TEMPORARY TABLE` anywhere in `backend/migrations/`** — the D1 `SQLITE_AUTH` TEMP-table landmine is not present.

**Chain verdict: green** (historical landmines are documented in-file and repaired; nothing broken remains in the lineage).

---

## 3. `PRAGMA foreign_key_check`

**Result on local D1: 0 violations.**

Run on the live local database (read-only). Both earlier safeguard migrations (0055 and 0056) also ran `PRAGMA foreign_key_check;` at their close.

---

## 4. Index analysis (verify-before-add)

44 frequently-queried tables indexed; ~167 named indexes + unique auto-indexes inspected. Every WHERE/JOIN column combination actually used in `backend/src` is covered by an index on the hot tables:

| Table | Hot query patterns (src) | Existing covering index | Verdict |
| --- | --- | --- | --- |
| `tenants` | `subdomain=?`, `id=?`, `custom_domain=?`, `onboarding_token=?`, `tenant_id=?` | `idx_tenants_subdomain/custom_domain(domain)/onboarding_token` + unique auto | ✅ covered (broken `slug` query — see §6.2) |
| `projects` | `(tenant_id, deleted_at IS NULL)`, `(tenant_id, slug)`, `deleted_at`, `(tenant_id, project_type, status)` | `idx_projects_tenant_deleted`, unique `(tenant_id,slug)`, `idx_projects_deleted`, `idx_projects_tenant_type_status` | ✅ covered |
| `orders` | `tenant_id`, `reference`, `(tenant_id,room_id,check_in<,check_out>)`, `(tenant_id,order_state_id)`, `(tenant_id,created_at)`, `room_id`, `camp_id`, `order_state_id` | `idx_orders_tenant`, `idx_orders_reference`, `idx_orders_tenant_room_dates`, `idx_orders_tenant_state`, `idx_orders_tenant_date`, `idx_orders_room`, `idx_orders_camp`, `idx_orders_state` | ✅ covered |
| `order_items` | `order_id`, `(id,order_id)`, bulk `(course_number,order_id)` | `idx_order_items_order(order_id)` | ✅ covered; **LOW:** composite `(order_id, course_number)` would speed the bulk course update (orders.js:1055) |
| `pos_products` | `organization_id`, `tenant_id`, `(is_active,tenant_id,type)`, `(tenant_id,type)`, `category_id`, `camp_id`, `barcode/sku` | `idx_pos_products_org/tenant/active_tenant/tenant_type/category/camp/barcode/sku` | ✅ covered |
| `pos_transactions` | `tenant_id`, `(tenant_id,created_at)`, `idempotency_key`, `cashier_id`, `order_number`, `status`, `customer_id` | `idx_orders_*` legacy equivalents + `idx_pos_tx_*` set + unique `order_number`/`idempotency_key` | ✅ covered |
| `pos_users` | `username`, `email`, `(email,username,tenant_id)`, `(tenant_id,role,deleted_at)`, `id=…and organization_id` | uniques + `idx_pos_users_email_username` + tenant/role indexes | ✅ covered |
| `pos_customers` | (no SELECT reads; only soft-delete `DELETE` — see §6.3) | `idx_pos_customers_tenant` | ✅ covered |
| `rooms_new` | `camp_id`, `status`, `room_status`, `tenant_id`, `product_id` | `idx_rooms_camp`, `idx_rooms_status`, `idx_rooms_new_room_status`, `idx_rooms_new_tenant_id`, `idx_rooms_new_product` | ✅ covered |
| `meal_schedules` | `(camp_id,date)`, `(tenant_id,date)`, `date`, `meal_id`, `tenant_id` | `idx_meal_schedules_camp_date`, `_tenant_date`, `_date`, `_meal`, `_tenant` | ✅ covered |
| `audit_log` | `(tenant_id ORDER BY created_at DESC)`, `(entity_type,entity_id)`, `created_at` | `idx_audit_log_tenant`, `idx_audit_log_entity`, `idx_audit_log_created` | ✅ covered; **LOW:** composite `(tenant_id, created_at)` would avoid a per-tenant temp sort |
| `marketplace_payments` | `(tenant_id,payment_status)`, `order_id`, `payout_id`, `(payment_status,captured_at)` | `idx_marketplace_payments_tenant/order/payout/status` | ✅ covered |
| `marketplace_payouts` | `(tenant_id,status)`, `(status,created_at)` | `idx_marketplace_payouts_tenant_status/status_created` | ✅ covered |

**Index verdict: no missing index needed for a real query.** Only two optional composites (both LOW) — list them only after verifiable load need arises (verify-before-add rule).

---

## 5. Orphan / legacy tables with zero backend references

Whole-`backend/src` regex scan (word-boundary, all 102 app tables):

| Table | Backend refs | Created by | Verdict |
| --- | --- | --- | --- |
| `tenant_usage` | **0** | `0075_business_enhancements.sql:219` (+2 indexes) | **DEAD** — never read or written by any API route or test. Candidate for a future purge migration. |
| `_cf_METADATA` | n/a | Cloudflare internal | System table — ignore. |

Historical context confirmed: the 30-table purge in `0056_drop_dead_tables.sql` and `pos_categories` in `0057` actually removed their targets (e.g., `financial_transactions`, `order_return*`, `pos_staff_stats`, `pos_activity_logs`, `pos_user_sessions`, `plans`, `revenue`, `pos_brands`, `pos_product_variants` — none present in the live schema). Two **deliberately-kept** shims flagged by 0056 remain and are still referenced:
- `products` (72 refs) — mirror shim `ensureProductInProductsTable`, retained by design.
- `product_camps` (7 refs) — read-compat junction from 0053, still queried.

---

## 6. CHECK constraint & schema-drift findings

### 6.1 🔴 `orders.kitchen_status` CHECK omits `'canceled'` → live 500 bug (PATCH /api/orders/:id/kitchen-status)

- **Migration:** `0069_restaurant_tables.sql:47` — `CHECK(kitchen_status IN ('pending','confirmed','preparing','ready','served'))` — **no `'canceled'`**. Same for `pos_transactions.kitchen_status` (`0069:55`).
- **Migration header (0069:14–16) promises**: "(any non-served state can also move to canceled)" — contradicted by its own column CHECK.
- **Code:** `orders.js:524–527` transition map treats `'canceled'` as legal from `pending/confirmed/preparing`; `orders.js:532–535` zod enum explicitly includes `'canceled'` with a comment saying it "must stay listed" (515–517: "per the 0069 column CHECK" — the CHECK does **not** contain it).
- **Sequence:** `PATCH /api/orders/:id/kitchen-status {"status":"canceled"}` → zod OK → transition map OK → `UPDATE orders SET kitchen_status='canceled'` (orders.js:569) → SQLite CHECK violation → generic 500 "Failed to update kitchen status".
- **Why tests are green:** `backend/tests/pos-tables.test.js:377–441` assert `pending/confirmed/preparing → canceled` is allowed, but the test DB **mocks** the UPDATE (never enforces the real CHECK). Mock-level tests cannot catch DB-level constraints.
- **Impact:** canceling a kitchen ticket from the frontend (consumed at `app/src/lib/api.ts:902`) is impossible → 500.
- **Fix (separate task):** either relax the CHECK to include `'canceled'` via a migration, or remove `'canceled'` from code/zod — do **both** consistently.

**Dormant twin:** `pos_transactions.kitchen_status` CHECK also omits `'canceled'`, but no code path writes it (INSERT stamps `'confirmed'`, routes/pos/index.js; no UPDATE ever targets it). Not a live bug — still a doc/commit inconsistency.

### 6.2 🔴 `/api/services/public/:slug` query references columns that don't exist on `tenants`

- **Code:** `services.js:440` — `SELECT id, name FROM tenants WHERE slug = ? AND is_active = 1`.
- **Schema:** `tenants` has **no `slug` column and no `is_active` column** (live columns: `subdomain`, `custom_domain`, `status`…) — verified via `PRAGMA table_info` (0–35) and confirmed no migration ever adds them.
- **Mount:** router mounted at `index.js:509` (`app.route('/api/services', servicesRoutes)`), so every hit errors (no such column) → 500 / Tenant not found path dead.
- **Root-cause clue:** `service_definitions` *does* have `slug` + `is_active` (autoindex plus `idx_service_defs_slug`), and the route's own payload is `definitions` — this looks like a copy-paste from an intended definition-by-slug lookup.
- **Fix (separate task):** resolve the slug against `service_definitions` (or `tenants.subdomain/custom_domain`), not non-existent `tenants.slug`.

### 6.3 🟠 `pos_customers.name` generated column silently lost in migration 0040

- **Created:** `0016:5` adds `name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED`.
- **Lost:** `0040_add_tenant_id_pos.sql` rebuilds `pos_customers` via create-copy-swap with an **explicit column list (0040:16–41) that omits `name`**; the data `INSERT` (0040:49–62) omits it too → `DROP TABLE` + rename destroys the generated column.
- **Live proof:** `PRAGMA table_xinfo('pos_customers')` = columns 0–27, **no `name`** (while `pos_users` keeps it — position 29, `hidden=3` = STORED generated).
- **Impact today: dormant** — `backend/src` never `SELECT`s from `pos_customers` at all (only 2 refs: a comment in softDelete.js:123 and the soft-delete `DELETE` at :175). If POS customer search/list is ever wired to this table, `name` must be restored.
- **`pos_users` (the important one) is fine:** `name` exists live; `POS_USER_SELECT` (pos-users.js:45–47) selects it; the only `INSERT INTO pos_users` (pos-users.js:206) correctly omits it (and omits `id`, since it's `INTEGER PRIMARY KEY AUTOINCREMENT` — the in-code comment about D1 text-id "datatype mismatch" is accurate).

### 6.4 🟠 `audit_log.entity_type` — schema is fine, API filters/docs lag it

- **DB CHECK (live):** `entity_type IN ('tenant','project','admin','order','pos_table')` — covers every write path: `pos-tables.js:93` (`'pos_table'`), `orders.js:578` (`'order'`), `audit.js:174` HTTP POST fence (`z.enum(AUDIT_ENTITY_TYPES)`), plus `'tenant'/'project'/'admin'`.
- **Gap:** GET filter schemas only allow 3 values — `admin-audit.js:31` `z.enum(['tenant','project','admin'])` and `audit.js:36` `AUDIT_ENTITY_TYPES = ['tenant','project','admin']`. Rows with `entity_type='order'`/`'pos_table'` **exist but cannot be queried** through the admin audit API (400).
- **Docs stale:** `audit.js` docblock (9–18) and JSDoc (66–70) still document the old 3-value CHECK/values.
- **Fix (separate task):** extend the filter enums + docs to include `'order'` and `'pos_table'`.

### 6.5 🟡 Verdict table for all other CHECK-constrained enums (checked vs code)

Matched (no gap):
- `order_items.course_status` CHECK `('pending','served','completed')` == code `validStatuses` (orders.js:1038) ✅
- `marketplace_payouts.status` CHECK `('pending','paid','failed','cancelled')` (two-L) == writes `admin-payouts.js:253` ✅
- `invoices.status` CHECK `('draft','sent','paid','overdue','canceled')` (one-L) == `financials.js:81` z.enum ✅
- `payments.method` CHECK `('cash','card','bank_transfer','stripe','other')` — writes only through API zod ✅
- `rooms_new.status`/`room_status` — **no CHECK** (free TEXT): the `'out_of_service'` write from `camps.js:829` is legal ✅
- `order_state` reference table seeds `pending/confirmed/checked_in/checked_out/cancelled` (two-L) == order-lifecycle writes (reservations.js:216/267, admin.js:108, payments.js:54/111) ✅
- `marketplace_payments.channel/payment_status`, `room cleaning_status`, `pos_products.type`, `accounts.type`, `employees.status/salary_type`, leave/crm/hr enums — code writes stay inside their CHECKs ✅

### 6.6 🟡 Trigger robustness (low)

`update_users_timestamp` (pos_users) and `update_products_timestamp` (pos_products) bodies UPDATE their own table with **no `WHEN` guard** (unlike the five `trg_*_updated_at` triggers). Safe today because recursive triggers are off (D1 default); they would recurse/error if `recursive_triggers` were ever enabled. They also unconditionally stamp `updated_at` even when the statement already set it — cosmetic.

---

## 7. Summary of required follow-ups (fix task — NOT performed here)

| # | Severity | Finding | Location |
| --- | --- | --- | --- |
| 1 | 🔴 P1 | `orders.kitchen_status` CHECK missing `'canceled'` → PATCH kitchen-status 500 | `0069:47` vs `orders.js:515–569` (+ mocked tests `pos-tables.test.js:377–441`) |
| 2 | 🔴 P1 | `services.js` queries nonexistent `tenants.slug`/`is_active` → `/api/services/public/:slug` dead | `services.js:440` (mount `index.js:509`) |
| 3 | 🟠 P2 | `pos_customers.name` generated column lost in 0040 rebuild (dormant — no readers today) | `0040:16–62` vs `0016:5` |
| 4 | 🟠 P2 | Admin audit filters + docs omit `'order'`/`'pos_table'` entity types (DB allows them) | `admin-audit.js:31`, `audit.js:36/66–70/9–18` |
| 5 | 🟡 P3 | Dead table `tenant_usage` (0075) — zero refs | `0075:219` |
| 6 | 🟡 P3 | Optional composite indexes: `order_items(order_id, course_number)`; `audit_log(tenant_id, created_at)` | orders.js:1055; admin-audit queries |
| 7 | 🟡 P3 | Unguarded self-update triggers on `pos_users`/`pos_products` (robustness only) | migrations 0010-era |

**Green lights:** migration chain 91/91 sequential & fully applied; `foreign_key_check` = 0 violations; hot-table index coverage complete; generated `pos_users.name` present with zero INSERT violating it; kitchen `'canceled'` is the *only* spelling mismatch (booking lifecycle correctly two-L `'cancelled'`, kitchen one-L `'canceled'` per 0069 header intent).