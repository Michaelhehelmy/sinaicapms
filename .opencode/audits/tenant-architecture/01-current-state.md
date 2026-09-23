# Tenant Architecture — Phase 1: Current State (tenant-side only)

- Scope: tenant-side only. Marketplace is excluded except where explicitly noted out-of-scope (the deliberate cross-tenant marketplace read in `camps.js`, the `marketplace` id exclusions in `tenants.js` and migration `0041`, and the zone-model note in Section 3).
- Date: 2026-09-23.
- Method: read-only. Migration files in `backend/migrations/`, handler and middleware source in `backend/src/`, plus read-only spot-checks in `app/src/components/admin/` for the reports question. No source files edited, no migrations applied, no D1 writes.
- Row counts: live `SELECT COUNT(*)` against staging D1 (`campmaster-db`) via `wrangler d1 execute campmaster-db --env staging --remote` on 2026-09-23, listed at the end of Section 1. Only seed/minimal rows exist on staging; all operational tables are empty.
- Sources: raw drafts `/tmp/opencode/t1-entity-model.md` (Section 1), `/tmp/opencode/t2-scoping.md` (Section 2), `/tmp/opencode/t3-projcamp.md` (Section 3), `/tmp/opencode/t4-posmenu.md` (Section 4), `/tmp/opencode/t5-gaps.md` (Sections 5–7). Every table and claim carries a `file:line` or migration citation; missing tables are reported as findings, not invented.

---

## 1. Entity Model

> Task lists "26 tables" but names **27** — all 27 are covered below.
> DB: `campmaster-db` (`backend/wrangler.toml:16-17`).
> Legend: ✅ exists live · ❌ does not exist (verdict + proof) · ⚠️ exists but empty/deprecated.

### Existence verdicts first (the 4 non-existent tables)

| Table | Verdict | Proof |
|---|---|---|
| `camps` | ❌ DROPPED — renamed to `projects` | Data copied `camps→projects` (`0063_rename_camps_to_projects.sql:51-60`); `DROP TABLE IF EXISTS camps` (`0063:126`). Absent from staging `sqlite_master` list |
| `camps_new` | ❌ NEVER EXISTED | Zero `CREATE TABLE camps_new` in any migration (full `CREATE TABLE` grep 0001–0099); sole reference is no-op guard `DROP TABLE IF EXISTS camps_new` (`0045_drop_dead_tables.sql:13`); zero refs in `backend/src`, `app/src`; absent from staging |
| `product_camps_new` | ❌ DROPPED — accidental 2nd junction, never used | Created `0028_create_new_tables.sql:92-96`; dropped `0056_drop_dead_tables.sql:70` ("accidental second junction from 0028, never used"); absent from staging. Live junction is `product_camps` (staging: 0 rows), created `0021_room_types_to_pos_products.sql:9-14` |
| `order_meal_plans` | ❌ NEVER EXISTED | `grep -rn "order_meal_plans" backend/migrations backend/src app/src tests/*.test.js tests/unit tests/pos` → zero matches; absent from staging |

### Entity rows (23 live tables)

#### 1.1 `tenants` ✅ (staging: 3 rows)

- Key columns: `id TEXT PK`, `subdomain UNIQUE`, `custom_domain UNIQUE`, `name`, `status` (`0001_init.sql:7-17`); `+ type` (`0052_add_tenants_type.sql:11`), `+ business_type/latitude/longitude/deleted_at/meta_version` (`0059_add_tenant_columns.sql:16,19-20,23,26`), `+ updated_at` (`0068_fix_triggers_and_promotions.sql:28`)
- tenant_id: N/A (is the tenant root) · project_id/camp_id: ABSENT
- FKs: none (referenced BY: `projects`, `rooms_new`, `rate_plans_new`, `orders`, `products`, `meal_categories`, `meals`, `meal_schedules`, `pos_shifts`, `pos_tables`, `promotions`, `service_definitions`, `service_items`, `tenant_org_mapping`)
- Defining migration: `backend/migrations/0001_init.sql:7`

#### 1.2 `projects` ✅ (staging: 1 row)

- Key columns: `id TEXT PK`, `tenant_id TEXT NOT NULL → tenants(id)`, `slug`, `project_type DEFAULT 'camp'`, `status`, `UNIQUE(tenant_id, slug)` (`0063_rename_camps_to_projects.sql:26-46`); `+ min_stay/max_stay` (`0067_add_room_status_lifecycle.sql:52-53`); `+ meal_plan_category_id` (`0070_add_meal_plan_category.sql:3`)
- tenant_id: `tenant_id` · project_id/camp_id: ABSENT (it IS the project; children point at it via `camp_id`/`project_id`)
- FKs: → `tenants(id)`; referenced BY `rooms_new.camp_id` (`0066:24`), `meal_schedules.camp_id` (`0066:64`), `orders.camp_id` (`0066:104`), `plans_new.camp_id` (`0066:167`), `rate_plans_new.camp_id` (`0091_rate_plans_camp_id.sql:24`), `service_items.project_id` (`0072:24`), `project_links.project_id_a/b` (`0085:14-15`), `project_items.project_id` (`0086:13`)
- Defining migration: `backend/migrations/0063_rename_camps_to_projects.sql:26` (copy from `camps`: `:51-60`)

#### 1.3 `camps` ❌ — see verdicts (defined `0001_init.sql:20-31`, extended `0060_add_camp_columns.sql:17,20,23-24,27,30,33,36`, one-per-tenant index `0053_camp_ownership.sql:44`, dropped `0063:126`)

#### 1.4 `camps_new` ❌ — see verdicts (never created)

#### 1.5 `products` ✅ ⚠️ quasi-dead mirror shim, staging: 0 rows

- Key columns: `id TEXT PK`, `tenant_id → tenants CASCADE`, `category_id → categories SET NULL`, `sku`, `base_price`, `capacity`, `image_url`, `is_active` (`0028_create_new_tables.sql:61-72`)
- tenant_id: `tenant_id` · project_id/camp_id: ABSENT
- FKs: → `tenants(id)`, `categories(id)`; referenced BY nothing live (`rooms_new`/`rate_plans_new` repointed to `pos_products` in `0054`)
- Note: deliberately kept per `0056` header ("quasi-dead mirror shim … removal needs explicit sign-off"); `0054:3-4` confirms real product data lives in `pos_products`
- Defining migration: `backend/migrations/0028_create_new_tables.sql:61`

#### 1.6 `product_camps_new` ❌ — see verdicts (defined `0028:92-96`, dropped `0056:70`)

#### 1.7 `rooms_new` ✅ (staging: 0 rows)

- Key columns: `id TEXT PK`, `camp_id`, `product_id → pos_products(id) RESTRICT`, `name`, `status`, `bed_type`, `max_guests`, `base_price`, `tenant_id TEXT` (nullable) (`0066_fix_camps_fk_references.sql:22-37` live shape)
- tenant_id: `tenant_id` (nullable; added `0044_add_tenant_id_to_rooms_plans.sql:10`, backfilled `'acaciacamp'` `:12`) · camp_id: `camp_id → projects(id) ON DELETE SET NULL` (`0066:24`) · project_id: ABSENT
- Lineage: created `0028:101-115` (`camp_id → camps CASCADE`, `product_id → products RESTRICT`); rebuilt `0054:18-33` (`product_id → pos_products`); rebuilt `0066:22-49` (`camp_id → projects SET NULL`); `+ room_status` (`0067:27`), `+ cleaning_status` (`0075:10-11`)
- FKs: → `projects(id)` (via `camp_id`), → `pos_products(id)`; referenced BY `orders.room_id` (`0066:105`)
- Defining migration: `backend/migrations/0028_create_new_tables.sql:101` (live shape: `0066:22`)

#### 1.8 `rate_plans_new` ✅ (staging: 0 rows)

- Key columns: `id TEXT PK`, `tenant_id → tenants CASCADE`, `product_id → pos_products CASCADE`, `camp_id → projects SET NULL`, `name`, `season` (NO check), `price_per_night` (`0091_rate_plans_camp_id.sql:20-34` live shape)
- tenant_id: `tenant_id` · camp_id: `camp_id` (added `0091:24`, backfilled from `pos_products.camp_id` `0091:40-45`) · project_id: ABSENT
- Lineage: created `0028:120-133` (with `season CHECK`, `product_id → products`); rebuilt `0054:54-67` (`product_id → pos_products`); rebuilt `0091:20-48` (+ `camp_id`, season CHECK dropped for UI values `peak`/`off`)
- Defining migration: `backend/migrations/0028_create_new_tables.sql:120` (live shape: `0091:20`)

#### 1.9 `orders` ✅ (staging: 0 rows)

- Key columns: `id TEXT PK`, `tenant_id → tenants CASCADE`, `camp_id → projects SET NULL` (nullable), `room_id → rooms_new RESTRICT`, `customer_id → customers SET NULL`, `order_state_id → order_state RESTRICT`, `reference UNIQUE`, amounts/dates (`0066:101-121` live base)
- tenant_id: `tenant_id` · camp_id: `camp_id` · project_id: ABSENT
- Lineage: created `0028:186-205` (`camp_id → camps CASCADE NOT NULL`); rebuilt `0066:101-137` (`camp_id → projects SET NULL`); `+ table_id` (`0069:46`), `+ kitchen_status` (`0069:47`, `canceled` added `0092:49`); `+ early_checkin/late_checkout/requested_*` (`0075:14-17`), `+ adult/child/extra_guest` (`0075:20-22`), `+ split_count` (`0075:79`), `+ tip_amount/tip_method` (`0075:82-83`)
- FKs: → `tenants`, `projects` (via `camp_id`), `rooms_new`, `customers`, `order_state`, `pos_tables` (via `table_id`); referenced BY `order_items.order_id`
- Defining migration: `backend/migrations/0028_create_new_tables.sql:186` (live shape: `0066:101`)

#### 1.10 `order_items` ✅ (staging: 0 rows)

- Key columns: `id TEXT PK`, `order_id → orders CASCADE`, `type DEFAULT 'room_night'`, `reference_id`, `name`, `quantity`, `unit_price`, `total_price` (`0067:34-44`); `+ split_group` (`0069:48`); `+ course_number/course_status` (`0075:67-69`)
- tenant_id: ABSENT (isolation via `order_id → orders.tenant_id`) · camp_id/project_id: ABSENT
- FKs: → `orders(id)`; referenced BY nothing
- Defining migration: `backend/migrations/0067_add_room_status_lifecycle.sql:34`

#### 1.11 `order_meal_plans` ❌ — see verdicts (never created, zero repo matches)

#### 1.12 `pos_organizations` ✅ (staging: 1 row)

- Key columns: `id INTEGER PK AUTOINCREMENT`, `name`, `slug UNIQUE`, locale/currency/settings (`0010_pos_integration.sql:13-36`)
- tenant_id: ABSENT (bridged via `tenant_org_mapping`: `0041_create_tenant_org_mapping.sql:10-17`, view `0041:38-40`) · camp_id/project_id: ABSENT
- FKs: none declared; referenced BY `pos_stores.organization_id` (`0010:58`), `pos_users.organization_id` (`0010:96`), `pos_products.organization_id` (`0010:224`), `pos_transactions.organization_id` (`0010:456`)
- Defining migration: `backend/migrations/0010_pos_integration.sql:13`

#### 1.13 `pos_stores` ✅ (staging: 1 row)

- Key columns: `id INTEGER PK AUTOINCREMENT`, `organization_id → pos_organizations`, `name`, `code UNIQUE`, `manager_id → pos_users` (`0010:38-60`)
- tenant_id: ABSENT · camp_id/project_id: ABSENT
- FKs: → `pos_organizations(id)`, `pos_users(id)` (manager)
- Defining migration: `backend/migrations/0010_pos_integration.sql:38`

#### 1.14 `pos_products` ✅ (staging: 0 rows)

- Key columns: `id TEXT PK`, `tenant_id TEXT DEFAULT 'acaciacamp'`, `organization_id INTEGER DEFAULT 1`, `sku UNIQUE`, `name`, prices, `type CHECK(room,menu,buffet,retail)`, `stock_quantity`, `camp_id TEXT` (soft, NO references clause), `capacity` (`0042_cleanup_pos_products.sql:29-74` live shape)
- tenant_id: `tenant_id TEXT` · camp_id: `camp_id TEXT` soft FK — source of truth for room-type ownership per `0053:21-25,50-53` · project_id: ABSENT · `organization_id INTEGER → pos_organizations`
- Lineage: created `0010:183-225`; `+ camp_id` (`0020_unify_inventory.sql:7`); `+ capacity` (`0021:7`); rebuilt `0042:29-108` (dropped `price/reorder_level/category`); `+ variant_of/variant_attributes` (`0075:33-34`), `+ supplier_name` (`0075:58`)
- Referenced BY: `rooms_new.product_id` (`0066:25`), `rate_plans_new.product_id` (`0091:23`), `pos_transaction_items.product_id` (`0046:33`)
- Defining migration: `backend/migrations/0010_pos_integration.sql:183` (live shape: `0042:29`)

#### 1.15 `pos_transactions` ✅ (staging: 0 rows)

- Key columns: `id TEXT PK`, `tenant_id TEXT DEFAULT 'tenant_1'`, `organization_id INTEGER`, `store_id INTEGER`, `order_number UNIQUE`, `customer_id → pos_customers`, `cashier_id TEXT` (**not** `staff_id`), amounts, `payment_status` (`0014_remove_cashier_foreign_key.sql:8-46` live base)
- tenant_id: `tenant_id TEXT` · camp_id/project_id: ABSENT
- Lineage: created `0010:422-462` (`cashier_id INTEGER → pos_users`); rebuilt `0014:8-67` (dropped pos_users FKs, `cashier_id TEXT`); `+ order_status` (`0013_pos_inventory_logs.sql:4`); `+ amount_cash/amount_card` (`0036:4-5`); `+ idempotency_key` (`0050:2`); `+ table_id` (`0069:54`), `+ kitchen_status DEFAULT 'confirmed'` (`0069:55`, `canceled` added `0092:155` + index `0092:194`)
- FKs: → `pos_organizations`, `pos_stores`, `pos_customers`, `pos_tables` (via `table_id`); referenced BY `pos_transaction_items.order_id`
- Defining migration: `backend/migrations/0010_pos_integration.sql:422` (live shape: `0014:8`)

#### 1.16 `pos_transaction_items` ✅ (staging: 0 rows)

- Key columns: `id TEXT PK`, `tenant_id TEXT DEFAULT 'tenant_1'`, `order_id → pos_transactions`, `transaction_id`, `product_id TEXT → pos_products`, `variant_id`, qty/price/totals (`0046_repair_pos_transaction_items_fk.sql:16-34` live shape)
- tenant_id: `tenant_id TEXT` · camp_id/project_id: ABSENT
- Lineage: created `0010:464-482`; recreated `0015_relink_transactions_foreign_key.sql:19`; repaired `0046:16-48` (FK was pointing at dropped `pos_products_old` after `0042` rename — SQLite-RENAME gotcha)
- Defining migration: `backend/migrations/0010_pos_integration.sql:464` (live shape: `0046:16`)

#### 1.17 `pos_users` ✅ (staging: 1 row)

- Key columns: `id INTEGER PK AUTOINCREMENT`, `organization_id INTEGER NOT NULL`, `store_id`, `username/email UNIQUE`, `password_hash`, `first_name/last_name NOT NULL`, `name GENERATED(first_name||' '||last_name)`, `role DEFAULT 'cashier'`, `tenant_id TEXT`, `camp_id TEXT`, `status`, `deleted_at` (base `0010:66-98`)
- tenant_id: `tenant_id TEXT` (added `0019_unify_users.sql:6`; nullable) · camp_id: `camp_id TEXT` soft (added `0023_merge_staff.sql:5`, backfilled from `staff` `:9`) · project_id: ABSENT
- Gotchas: `name` GENERATED — INSERT `first_name`/`last_name` only (`0016_pos_staff_stats_and_name_fields.sql:4`); `organization_id NOT NULL` on ALL inserts; `+ deleted_at` (`0019:7`), `+ last_login` (`0019:39`), `+ status` (`0019:45`)
- FKs: → `pos_organizations(id)`, `pos_stores(id)`; referenced BY `pos_stores.manager_id`
- Defining migration: `backend/migrations/0010_pos_integration.sql:66`

#### 1.18 `pos_shifts` ✅ (staging: 1 row)

- Key columns: `id TEXT PK`, `tenant_id → tenants CASCADE`, `cashier_id TEXT` (NO fk clause), `status DEFAULT 'open'`, `opening/closing_time`, `opening/expected/actual_closing_cash` (`0035_shifts_and_schedules.sql:4-16`)
- tenant_id: `tenant_id` · camp_id/project_id: ABSENT
- Defining migration: `backend/migrations/0035_shifts_and_schedules.sql:4`

#### 1.19 `pos_tables` ✅ (staging: 0 rows)

- Key columns: `id TEXT PK`, `tenant_id → tenants CASCADE`, `name`, `capacity`, `status CHECK(available,occupied,reserved,cleaning)`, `section` (`0069_restaurant_tables.sql:34-42`); `+ reservation_name/time/date/party_size` (`0075:72-75`)
- tenant_id: `tenant_id` · camp_id/project_id: ABSENT
- FKs: → `tenants(id)`; referenced BY `orders.table_id` (`0069:46`), `pos_transactions.table_id` (`0069:54`)
- Defining migration: `backend/migrations/0069_restaurant_tables.sql:34`

#### 1.20 `meals` ✅ (staging: 0 rows)

- Key columns: `id TEXT PK`, `tenant_id → tenants CASCADE`, `meal_category_id → meal_categories CASCADE NOT NULL`, `price`, `image_url`, `is_active` (`0028:257-266`)
- tenant_id: `tenant_id` · camp_id/project_id: ABSENT
- Lineage: v1 created `0001:151-159` (free-text `category`), DROPPED `0020_unify_inventory.sql:87`; v2 created `0028:257`
- FKs: → `tenants`, `meal_categories`; referenced BY `meal_lang.meal_id` (`0028:272`), `meal_schedules.meal_id` (`0037:15`, `0066:71`)
- Defining migration: `backend/migrations/0028_create_new_tables.sql:257`

#### 1.21 `meal_categories` ✅ (staging: 0 rows)

- Key columns: `id TEXT PK`, `tenant_id → tenants CASCADE`, `position` (`0028:236-242`)
- tenant_id: `tenant_id` · camp_id/project_id: ABSENT
- FKs: → `tenants(id)`; referenced BY `meals.meal_category_id`
- Defining migration: `backend/migrations/0028_create_new_tables.sql:236`

#### 1.22 `meal_lang` ✅ (staging: 0 rows)

- Key columns: `meal_id → meals CASCADE`, `lang → languages CASCADE`, `name`, `description`, PK(`meal_id`,`lang`) (`0028:271-277`)
- tenant_id: ABSENT (via `meals.tenant_id`) · camp_id/project_id: ABSENT
- Defining migration: `backend/migrations/0028_create_new_tables.sql:271`

#### 1.23 `meal_schedules` ✅ (staging: 0 rows)

- Key columns: `id TEXT PK`, `tenant_id NOT NULL → tenants CASCADE`, `camp_id → projects SET NULL` (nullable), `date`, `meal_id → meals CASCADE`, `package_type`, `max_servings` (`0066:61-72` live shape)
- tenant_id: `tenant_id` · camp_id: `camp_id` · project_id: ABSENT
- Lineage: created `0035:19-31` (`camp_id → camps NOT NULL`, **`meal_id → pos_products` — wrong**); rebuilt `0037:4-24` (`meal_id → meals`); rebuilt `0066:61-82` (`camp_id → projects SET NULL`)
- Defining migration: `backend/migrations/0035_shifts_and_schedules.sql:19` (live shape: `0066:61`)

#### 1.24 `inventory_adjustments` ✅ (staging: 0 rows)

- Key columns: `id TEXT PK DEFAULT hex(randomblob(16))`, `tenant_id TEXT NOT NULL` (NO fk clause), `product_id TEXT NOT NULL` (NO fk clause), `adjustment INTEGER`, `reason DEFAULT 'manual'`, `reference`, `notes`, `created_by TEXT` (`0075:37-47`)
- tenant_id: `tenant_id` (unconstrained — no `REFERENCES`) · camp_id/project_id: ABSENT
- Defining migration: `backend/migrations/0075_business_enhancements.sql:37`

#### 1.25 `promotions` ✅ (staging: 0 rows)

- Key columns: `id TEXT PK`, `tenant_id → tenants CASCADE`, `name`, `type CHECK(percentage,fixed,bogo)`, `value`, `applies_to/applies_to_id`, `min_purchase`, `day_of_week`, `start/end_date`, `is_active` (`0068:43-57`)
- tenant_id: `tenant_id` · camp_id/project_id: ABSENT
- Note: DISTINCT from `pos_promotions` (`0010:580`, dropped `0056:46`); this is the current engine
- Defining migration: `backend/migrations/0068_fix_triggers_and_promotions.sql:43`

#### 1.26 `service_definitions` ✅ (staging: 0 rows)

- Key columns: `id TEXT PK hex`, `tenant_id → tenants CASCADE`, `slug`, `name`, `fields_schema JSON`, `is_active`, `UNIQUE(tenant_id, slug)` (`0072_dynamic_services.sql:6-17`)
- tenant_id: `tenant_id` · camp_id/project_id: ABSENT
- FKs: → `tenants(id)`; referenced BY `service_items.service_definition_id`
- Defining migration: `backend/migrations/0072_dynamic_services.sql:6`

#### 1.27 `service_items` ✅ (staging: 0 rows) — ONLY table in scope with a literal `project_id` column

- Key columns: `id TEXT PK hex`, `tenant_id → tenants CASCADE`, `service_definition_id → service_definitions CASCADE`, `project_id → projects SET NULL` (nullable), `name`, `base_price`, `status` (`0072:20-32`); `+ price_tier/price_premium` (`0075:94-96`)
- tenant_id: `tenant_id` · project_id: `project_id` (`0072:24`) · camp_id: ABSENT
- Defining migration: `backend/migrations/0072_dynamic_services.sql:20`

### Staging row counts (2026-09-23, read-only `d1 execute --remote`)

`tenants` 3 · `projects` 1 · `products` 0 · `rooms_new` 0 · `rate_plans_new` 0 · `orders` 0 · `order_items` 0 · `pos_organizations` 1 · `pos_stores` 1 · `pos_products` 0 · `pos_transactions` 0 · `pos_transaction_items` 0 · `pos_users` 1 · `pos_shifts` 1 · `pos_tables` 0 · `meals` 0 · `meal_categories` 0 · `meal_lang` 0 · `meal_schedules` 0 · `inventory_adjustments` 0 · `promotions` 0 · `service_definitions` 0 · `service_items` 0 (+ context: `admins` 3, `product_camps` 0). Only seed/minimal rows exist on staging; all operational tables are empty.

---

## 2. How Things Are Scoped Today

### 2.0 How scope is derived (resolveScope) — no project/camp scope exists

`backend/src/middleware/resolveScope.js` is the single source of truth (file header, lines 1–28).
Three modes (lines 84–211):

- `{ public: true }` (lines 103–115): best-effort `getTenant()` only, `scope = { tenantId | null, user: null }`. Never auths.
- default admin realm (lines 192–210): resolve tenant hint FIRST via `getTenant()`; missing hint on a
  protected route fails fast `401 'Unauthorized: missing tenant context'` (lines 193–197, byte-compat
  with the legacy catch-all guard); then `requireAuth({ realm: 'admin' })` enforces token-scope, and
  the effective scope is stored (`c.set('scope', { tenantId, user })`, lines 207–208).
- `{ dualRealm: true }` (lines 120–188): accepts admin AND POS tokens. POS branch (lines 153–163)
  resolves `organization_id → tenant_id` via `tenant_org_mapping`:
  `SELECT tenant_id FROM tenant_org_mapping WHERE organization_id = ?`
  (`backend/src/middleware/resolveScope.js:157-159`); fallback is `String(organizationId)` when no
  mapping row (same convention as `resolveOrgTenantId` in `backend/src/routes/pos/index.js:43-51`).
  Admin branch (lines 164–182) resolves from header/query then enforces strict equality
  (`decoded.tenantId !== tenantId` → 403, lines 179–181).

Effective tenantId rule (lines 203–205):
`queryOverride (super_admin ?tenantId= only) || tenantHint || user.tenantId || null`.
`requireAuth` step 5 (`backend/src/middleware/requireAuth.js:185-190`): non-super_admin tokens are
`'equals'`-scoped — claim must equal `ctx.tenantId`, else `403 'Forbidden: Access denied to this tenant partition'`.
**There is NO project/camp dimension in scope.** `campId`/`projectId` appear only as optional per-query
filters inside handlers (e.g. `roomsRoutes` `?campId=`, `camps.js:734/741-744`; `project-items` `?projectId=`,
`project-items.js:153/159-162`). Super-admin drilldown is `?tenantId=` query override only.

`getTenant` (`backend/src/middleware/tenant.js:5-35`): hint = `?tenant_id=` query param OR
`x-tenant-id` header OR hostname (query wins); strips leading `www.`; `localhost`/bare IP → null;
exact-match lookup only, ACTIVE tenants only:
`SELECT id FROM tenants WHERE (id = ? OR subdomain = ? OR custom_domain = ?) AND status = 'active'`
(`backend/src/middleware/tenant.js:26-28`).

Scope-adjacent middleware notes:
- Rate limiter: global `policyLimiter` keys `${ip}:${path}` on `cf-connecting-ip` only
  (`backend/src/middleware/rateLimit.js:182/187`); KV-backed, fail-closed 429 on KV error (lines 208–212);
  `RATE_LIMIT_KV_ENABLED="false"` forces the in-memory fallback (lines 192, 215+). The per-tenant
  limiter `tenantAwareLimiter` (lines 269–288) keys `t:${ip}:${scope.tenantId}:${path}` (line 285) from
  the VERIFIED scope (never the raw header), and is mounted immediately after each `resolveScope` mount
  in `index.js` (e.g. `backend/src/index.js:230,306,341,483,490,…`); unauthed/public-branch requests pass
  through to the global bucket (lines 277–280). Tenant component cannot be spoofed via header rotation.
- CORS: single source of truth is `hono/cors` in `backend/src/index.js:121-139`. Response helpers MUST
  NOT set per-response CORS (project rule; no `Access-Control-*` strings in `utils/response.js` path).
- `tenant_org_mapping` is read in middleware (`resolveScope.js:46,158`), POS auth
  (`routes/pos/index.js:46`), and ~8 API modules
  (`meal-plans.js:30`, `reservations.js:390`, `orders.js:771`, `camps.js:549,598`,
  `inventory.js:47`, `pos-users.js:87`, `tenant-import.js` provisioning) — always as the
  tenant↔org bridge, never as a data-table scope filter itself. Auto-provisioning lives in
  `ensureTenantOrg` (`resolveScope.js:43-77`, `INSERT OR IGNORE` on `pos_organizations`/`pos_stores`/
  `tenant_org_mapping`).

### 2.1 tenants — scoped-by: neither (identity root; PK/lookup-key access)

Filter column: none (row addressed by `id`/`subdomain`/`custom_domain`/`onboarding_token`).
```sql
-- backend/src/api/tenants.js:109
SELECT ... FROM tenants WHERE 1=1 AND status = 'active' AND tenants.id != 'marketplace'
```
Detail lookup is `WHERE (id = ? OR subdomain = ? OR custom_domain = ?) AND status = 'active'`
(`tenants.js:168`; same shape in `middleware/tenant.js:27`). Super-admin list drops the status filter
(`tenants.js:102-107`). Tenants are the scope anchor, not a scoped table. (`marketplace` exclusion noted as out-of-scope.)

### 2.2 projects — scoped-by: tenant_id

```sql
-- backend/src/api/camps.js:218
SELECT * FROM projects WHERE tenant_id = ? AND deleted_at IS NULL
```
Cross-tenant marketplace read is the deliberate exception, noted out-of-scope (`camps.js:208-209/216-217`,
`CROSS_TENANT_SELECT ... GROUP BY c.tenant_id`). Single-row guard form:
`SELECT id FROM projects WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`
(`others.js:70`, also `meal-schedules.js:73`, `camps.js:433`).

### 2.3 camps — unscoped in code: legacy name, zero SELECTs in backend/src

Evidence: `grep "FROM camps"` over `backend/src` returns exactly one hit, a comment in
`backend/src/routes/registry.js:285` ("Wire rows: `SELECT * FROM camps` …"). All live code reads
`projects` (see §2.2). Per Section 1 context the table was renamed to `projects` (migration 0063); Section 1 owns DDL proof.

### 2.4 camps_new — unscoped in code: zero references in backend/src

Evidence: `grep "camps_new"` over `backend/src` → no files found. No SELECT/INSERT/DELETE touches it
in handler code. (Section 1 confirms never-created via migrations.)

### 2.5 products (bare, non-pos) — scoped-by: neither (write-only FK mirror; no direct reads)

No `FROM products` SELECT exists in `backend/src` (grep `FROM products ` → no files found). The table is
only maintained as an FK target for `rooms_new`/`rate_plans_new` via best-effort mirror:
```sql
-- backend/src/api/camps.js:21-25 (identical copy in tenant-import.js:169-173)
INSERT OR IGNORE INTO products (id, tenant_id, category_id, sku, base_price, capacity, image_url, is_active, created_at, updated_at)
SELECT id, tenant_id, category_id, sku, selling_price, capacity, image_url, is_active, created_at, updated_at
FROM pos_products WHERE id = ? AND tenant_id = ?
```
Reads that need product data always hit `pos_products` with `tenant_id = ?` (§2.14). Code comment states
the reason verbatim (`camps.js:13-14`): "`rooms_new` and `rate_plans_new` still have FK → products(id),
so we mirror on write to satisfy the constraint."

### 2.6 product_camps_new — unscoped in code: zero references in backend/src

Evidence: `grep "product_camps_new"` over `backend/src` → no files found. Only the legacy
`product_camps` junction is referenced, and only for cleanup:
`DELETE FROM product_camps WHERE product_id = ?` (`camps.js:690,716`) and cascade
`DELETE FROM product_camps WHERE product_id IN (SELECT id FROM pos_products WHERE tenant_id = ?)`
(`admin.js:69`). Code comment (`camps.js:565`): "product_camps junction is legacy (0053:
pos_products.camp_id is the …)". (Section 1 confirms DDL status: dropped.)

### 2.7 rooms_new — scoped-by: camp_id (tenant enforced via projects JOIN; no direct tenant_id read)

`rooms_new` carries no tenant predicate in any read; every tenant-aware read joins `projects`:
```sql
-- backend/src/api/camps.js:738
SELECT r.* FROM rooms_new r JOIN projects c2 ON r.camp_id = c2.id WHERE c2.tenant_id = ? AND c2.deleted_at IS NULL
```
Optional second dimension: `AND r.camp_id = ?` when `?campId=` is passed (`camps.js:741-744`).
Ownership-checked variants: `SELECT r.id FROM rooms_new r JOIN projects c2 ON r.camp_id = c2.id
WHERE c2.tenant_id = ? AND r.id = ?` (`camps.js:808,856`); delete/update via
`... WHERE id = ? AND camp_id IN (SELECT id FROM projects WHERE tenant_id = ?)` (`camps.js:867`).
Cross-check from orders: `SELECT r.product_id FROM rooms_new r JOIN projects c ON r.camp_id = c.id
WHERE r.id = ? AND c.tenant_id = ?` (`orders.js:260`; same shape `reservations.js:155`).

### 2.8 rate_plans_new — scoped-by: both (tenant_id direct + camp_id/product guard)

Direct tenant column read:
```sql
-- backend/src/api/orders.js:272 (identical in reservations.js:167)
SELECT price_per_night, start_date, end_date, season FROM rate_plans_new WHERE tenant_id = ? AND product_id = ? ORDER BY season DESC, price_per_night DESC
```
List adds the product/camp guard (`camps.js:950-955`):
`SELECT rp.* FROM rate_plans_new rp JOIN pos_products p ON p.id = rp.product_id AND p.tenant_id = rp.tenant_id
WHERE rp.tenant_id = ? AND p.deleted_at IS NULL
AND (p.camp_id IS NULL OR p.camp_id IN (SELECT id FROM projects WHERE tenant_id = ? AND deleted_at IS NULL))`.
Mutation guard: `SELECT product_id FROM rate_plans_new WHERE id = ? AND tenant_id = ?` (`camps.js:1045`);
delete `DELETE FROM rate_plans_new WHERE tenant_id = ? AND id = ?` (`camps.js:1056`).

### 2.9 orders (booking orders) — scoped-by: tenant_id

```sql
-- backend/src/api/orders.js:608
SELECT COUNT(*) as total FROM orders WHERE tenant_id = ?
```
Data form (`orders.js:611-621`): `... FROM orders o LEFT JOIN customers ... LEFT JOIN rooms_new r ...
WHERE o.tenant_id = ?`. Single-row: `SELECT id, order_state_id, room_id FROM orders WHERE tenant_id = ? AND id = ?`
(`orders.js:461`); delete cascade guards `inbox_reads`/`orders` by `tenant_id` (`orders.js:938-939`).

### 2.10 order_items — scoped-by: neither direct (tenant via order_id FK; NO tenant_id column)

Code states it verbatim twice (`orders.js:1070,1076,1134`):
```sql
-- backend/src/api/orders.js:1071-1073 (comment at 1070: "order_items has no tenant_id column — tenant isolation is via order_id FK")
UPDATE order_items SET ${updates.join(', ')} WHERE id = ? AND order_id = ?
```
Read form: `SELECT * FROM order_items WHERE order_id = ? ORDER BY created_at ASC, id ASC` (`orders.js:653`);
inserts carry no tenant value (`orders.js:745,807`). Tenant safety depends on the caller first proving
`orders.id` belongs to the tenant (e.g. `orders.js:461`).

### 2.11 order_meal_plans — unscoped in code: table never referenced in backend/src

Evidence: `grep "order_meal_plans"` over `backend/src` → no files found. Meal-plan lines are stored as
`order_items` rows with `type='meal_plan'`:
`INSERT INTO order_items (id, order_id, type, reference_id, name, quantity, unit_price, total_price, created_at)
VALUES (?, ?, 'meal_plan', ?, ?, ?, ?, ?, datetime('now'))` (`orders.js:806-808`; same shape
`reservations.js:404-406`). (Section 1 confirms the table does not exist in DDL.)

### 2.12 pos_organizations — scoped-by: neither (scope ROOT; addressed by PK id)

```sql
-- backend/src/routes/pos/index.js:62-63
SELECT tax_rate FROM pos_organizations WHERE id = ?
```
No `tenant_id` predicate anywhere on this table; the org row is resolved FROM the tenant
(`tenant_org_mapping`) or auto-provisioned (`ensureTenantOrg`, `resolveScope.js:43-77`), then used as
a bind value elsewhere. Timezone read is the same shape (`pos/index.js:910`).

### 2.13 pos_stores — scoped-by: organization_id

```sql
-- backend/src/api/pos-users.js:190-192
SELECT id FROM pos_stores WHERE organization_id = ? LIMIT 1
```
Same shape in `tenant-import.js:441` and `pos/index.js:626`. No `tenant_id` predicate on stores in code;
tenant reachability is org-mediated.

### 2.14 pos_products — scoped-by: BOTH (tenant_id TEXT read dimension + organization_id INTEGER write/co-read dimension)

Canonical read:
```sql
-- backend/src/routes/pos/index.js:306-312
SELECT id, sku, name, description, selling_price, cost_price, category_id,
       type, image_url, is_active, stock_quantity
FROM pos_products
WHERE tenant_id = ? AND deleted_at IS NULL AND is_active = 1
ORDER BY name
```
Same tenant shape: `pos-barcode.js:21`, `storefront.js:121,145`, `inventory.js:123,142`,
`priceOverrides.js:92`, `camps.js:24,765`. DUAL-COLUMN GOTCHA: the row also carries
`organization_id INTEGER`; two read paths filter on it instead —
low-stock (`inventory.js:60-66`): `FROM pos_products p WHERE p.organization_id = ? AND p.deleted_at IS NULL
AND p.is_active = 1 AND p.stock_quantity <= p.min_stock_level`; meal-plans browse
(`meal-plans.js:39-43`): `FROM pos_products WHERE category_id = ? AND organization_id = ? AND is_active = 1`.
Writes set BOTH: `INSERT INTO pos_products (id, tenant_id, organization_id, ...) VALUES (?, ?, ?, ...)`
(`tenant-import.js:259-260`; `camps.js:554,616`).

### 2.15 pos_transactions — scoped-by: tenant_id reads; BOTH on write (tenant_id TEXT + organization_id INTEGER + store_id)

```sql
-- backend/src/routes/pos/index.js:850
SELECT COUNT(*) AS total FROM pos_transactions WHERE tenant_id = ?
```
Row form: `... FROM pos_transactions t LEFT JOIN pos_users u ON u.id = t.cashier_id WHERE t.tenant_id = ?`
(`pos/index.js:856-860`); single: `WHERE t.id = ? AND t.tenant_id = ?` (`pos/index.js:881`);
idempotency: `WHERE idempotency_key = ? AND tenant_id = ? AND cashier_id = ?` (`pos/index.js:343`).
DUAL-COLUMN GOTCHA: INSERT writes the org/store dimensions too (`pos/index.js:654-660`):
`INSERT INTO pos_transactions (id, tenant_id, organization_id, store_id, order_number, cashier_id, ...
VALUES (?, ?, ?, ?, ?, ?, 'completed', ...)`, and the admin-created meal-plan mirror uses
`(id, tenant_id, organization_id, store_id, ...)` with literal `store_id=1` (`orders.js:817-822`).
Shift math filters `WHERE tenant_id = ? AND cashier_id = ? ... AND status != 'voided'` (`pos/index.js:967-1000`).

### 2.16 pos_transaction_items — scoped-by: tenant_id (+ order_id)

```sql
-- backend/src/routes/pos/index.js:889-893
SELECT ti.*, p.name AS product_name, p.sku
FROM pos_transaction_items ti
LEFT JOIN pos_products p ON p.id = ti.product_id
WHERE ti.order_id = ? AND ti.tenant_id = ?
```
Same shape at `pos/index.js:350-354`. INSERT carries both (`pos/index.js:689-691`):
`(id, tenant_id, order_id, product_id, quantity, unit_price, subtotal, tax_amount, total_amount, ...)`.

### 2.17 pos_users — scoped-by: BOTH, organization_id primary (INTEGER) + tenant_id TEXT mirror

List scope is `organization_id`, resolved from the tenant via mapping (`pos-users.js:85-91,121`):
```sql
-- backend/src/api/pos-users.js:133 (+148: SELECT COUNT(*) AS total FROM pos_users pu WHERE ${whereClause})
-- conditions built at pos-users.js:133: ['pu.organization_id = ?', 'pu.deleted_at IS NULL']
SELECT ... FROM pos_users pu WHERE pu.organization_id = ? AND pu.deleted_at IS NULL ...
```
DUAL-COLUMN GOTCHA: INSERT writes both (`pos-users.js:207-211`):
`INSERT INTO pos_users (organization_id, tenant_id, username, email, password_hash, first_name, last_name, ...)
VALUES (?, ?, ?, ...)`. Per-row guards use `AND organization_id = ?`
(`pos-users.js:220,235,257,279,303`); GOTCHA: `pos_users.name` is GENERATED
(`first_name || ' ' || last_name`) — inserts must use `first_name`/`last_name` only (project rule).
`tenant-billing.js:49` bridges it: `... FROM pos_users WHERE organization_id IN
(SELECT organization_id FROM tenant_org_mapping WHERE tenant_id = ?) AND is_active = 1`.

### 2.18 pos_shifts — scoped-by: tenant_id (+ cashier_id)

```sql
-- backend/src/routes/pos/index.js:1020-1024
SELECT id, status, opening_time, opening_cash, expected_closing_cash, notes
FROM pos_shifts
WHERE tenant_id = ? AND cashier_id = ? AND status = 'open'
ORDER BY opening_time DESC LIMIT 1
```
Existence guard identical (`pos/index.js:1050`); INSERT carries both
(`pos/index.js:1058-1059`): `(id, tenant_id, cashier_id, status, opening_time, opening_cash, notes)`.
Note: `cashier_id` is TEXT (`String(posUser.userId)`, `pos/index.js:1017`) while `pos_transactions`
references staff via `cashier_id` (project rule: never `staff_id`).

### 2.19 pos_tables — scoped-by: tenant_id

```sql
-- backend/src/api/pos-tables.js:112-117
SELECT id, tenant_id, name, capacity, status, section
FROM pos_tables
WHERE tenant_id = ?
ORDER BY section IS NULL, section, name
```
Mutation guards: `UPDATE pos_tables SET status = ? WHERE tenant_id = ? AND id = ?` (`pos-tables.js:232`);
`DELETE FROM pos_tables WHERE tenant_id = ? AND id = ?` (`pos-tables.js:263`); POS-side check
`SELECT id FROM pos_tables WHERE id = ? AND tenant_id = ?` (`pos/index.js:512`).

### 2.20 meals — scoped-by: tenant_id

```sql
-- backend/src/api/meals.js:43-52
SELECT m.id, m.tenant_id, m.meal_category_id, m.price, m.image_url, m.is_active, m.created_at,
       ml.name, ml.description,
       mc.id AS category_id, mcl.name AS category_name
FROM meals m
LEFT JOIN meal_lang ml ON ml.meal_id = m.id AND ml.lang = 'en'
LEFT JOIN meal_categories mc ON mc.id = m.meal_category_id
LEFT JOIN meal_categories_lang mcl ON mcl.meal_category_id = mc.id AND mcl.lang = 'en'
WHERE m.tenant_id = ?
```
Single: `... WHERE m.tenant_id = ? AND m.id = ?` (`meals.js:67`); guards
`SELECT id FROM meals WHERE id = ? AND tenant_id = ?` (`meals.js:156`; also `meal-schedules.js:67`).

### 2.21 meal_categories — scoped-by: tenant_id

```sql
-- backend/src/api/meal-categories.js:33-39
SELECT mc.id, mc.tenant_id, mc.position, mc.created_at, mcl.name
FROM meal_categories mc
LEFT JOIN meal_categories_lang mcl ON mcl.meal_category_id = mc.id AND mcl.lang = 'en'
WHERE mc.tenant_id = ?
ORDER BY mc.position ASC, mc.id ASC
```
Guard: `SELECT id FROM meal_categories WHERE id = ? AND tenant_id = ?` (`meal-categories.js:96`);
delete `DELETE FROM meal_categories WHERE id = ? AND tenant_id = ?` (`meal-categories.js:138`).

### 2.22 meal_lang — scoped-by: neither direct (child of meals; reached via meal_id FK, no tenant predicate)

No tenant-filtered SELECT on `meal_lang` exists in code. Only touch is the cascade delete after a
tenant-checked meal delete:
```sql
-- backend/src/api/meals.js:209-217 (guard at meals.js:203: SELECT id FROM meals WHERE id = ? AND tenant_id = ?)
DELETE FROM meal_schedules WHERE meal_id = ?
...
DELETE FROM meal_lang WHERE meal_id = ?
...
DELETE FROM meals WHERE tenant_id = ? AND id = ?
```
Reads join it under a tenant-filtered parent (`meals.js:48`: `LEFT JOIN meal_lang ml ON ml.meal_id = m.id ...
WHERE m.tenant_id = ?`). So: unscoped in code as a table, tenant-safe only transitively.

### 2.23 meal_schedules — scoped-by: BOTH (tenant_id + camp_id)

```sql
-- backend/src/api/meal-schedules.js:24-33
SELECT ms.id, ms.tenant_id, ms.camp_id, c.name AS camp_name,
       ms.date, ms.meal_id, ml.name AS meal_name,
       ms.package_type, ms.max_servings, ms.created_at
FROM meal_schedules ms
LEFT JOIN projects c ON c.id = ms.camp_id
LEFT JOIN meals m ON m.id = ms.meal_id
LEFT JOIN meal_lang ml ON ml.meal_id = m.id AND ml.lang = 'en'
WHERE ms.tenant_id = ?
-- optional: AND ms.camp_id = ?  (meal-schedules.js:36-39)
```
Create verifies both parents same-tenant (`meal-schedules.js:66-75`); delete guard
`DELETE FROM meal_schedules WHERE id = ? AND tenant_id = ?` (`meal-schedules.js:100`).

### 2.24 inventory_adjustments — scoped-by: tenant_id

```sql
-- backend/src/api/inventory.js:103-109
SELECT ia.*, p.name as product_name
FROM inventory_adjustments ia
JOIN pos_products p ON ia.product_id = p.id
WHERE ia.tenant_id = ?
ORDER BY ia.created_at DESC LIMIT 100
```
INSERT carries it (`inventory.js:130-131`): `(id, tenant_id, product_id, adjustment, reason, reference, notes)`.
The guarded product check is tenant-first (`inventory.js:123`):
`SELECT id, stock_quantity FROM pos_products WHERE id = ? AND tenant_id = ?`.

### 2.25 promotions — scoped-by: tenant_id

```sql
-- backend/src/api/promotions.js:113
SELECT * FROM promotions WHERE tenant_id = ?
```
(+ `AND is_active = 1` for public callers, `promotions.js:115-117`; POS mirror at
`routes/pos/index.js:442`: `SELECT * FROM promotions WHERE tenant_id = ? AND is_active = 1`.)
Cross-check form: `SELECT id, category_id FROM pos_products WHERE id IN (...) AND tenant_id = ?`
(`promotions.js:264`); delete `DELETE FROM promotions WHERE id = ? AND tenant_id = ?` (`promotions.js:230`).

### 2.26 service_definitions — scoped-by: tenant_id

```sql
-- backend/src/api/services.js:83-85
SELECT * FROM service_definitions WHERE tenant_id = ? ORDER BY created_at DESC
```
Mutation guard: `UPDATE service_definitions SET ... WHERE id = ? AND tenant_id = ?` (`services.js:124`);
soft-delete `... SET is_active = 0 ... WHERE id = ? AND tenant_id = ?` (`services.js:135`).

### 2.27 service_items — scoped-by: BOTH (tenant_id + project_id)

Tenant read with definition join:
```sql
-- backend/src/api/services.js:146-152
SELECT si.*, sd.name as definition_name, sd.slug as definition_slug
FROM service_items si
JOIN service_definitions sd ON si.service_definition_id = sd.id
WHERE si.tenant_id = ?
ORDER BY si.created_at DESC
```
`project_id` is a first-class optional column: INSERT carries it (`services.js:171-173`):
`(id, tenant_id, service_definition_id, project_id, name, description, base_price, meta_data, status)`;
create verifies the definition is same-tenant (`services.js:166-167`); row guards are
`WHERE id = ? AND tenant_id = ?` (`services.js:191,202,239,323,340,395,431,435`).

### Appendix — scoping-adjacent tables seen in code but outside the 26

- `categories` (POS/ordering taxonomy): tenant-nullable — `WHERE c.tenant_id IS NULL OR c.tenant_id = ?`
  (`categories.js:43`); single-row `WHERE c.id = ? AND (c.tenant_id IS NULL OR c.tenant_id = ?)` (`categories.js:61`).
- `price_overrides`: no own tenant column; scoped via product —
  `FROM price_overrides po JOIN pos_products p ON p.id = po.product_id WHERE p.tenant_id = ? AND po.product_id = ?`
  (`priceOverrides.js:59-62`); write guard `SELECT id FROM pos_products WHERE id = ? AND tenant_id = ?`
  (`priceOverrides.js:92`).
- `project_links`: `WHERE pl.tenant_id = ?` + optional `(pl.project_id_a = ? OR pl.project_id_b = ?)`
  (`project-links.js:103-108`); create requires both endpoints same-tenant (`project-links.js:141-143`).
- `project_items`: `WHERE pi.tenant_id = ?` + optional `AND pi.project_id = ?` (`project-items.js:157-162`).
- `tenant_org_mapping`: the bridge — `WHERE tenant_id = ?` (admin→org) vs `WHERE organization_id = ?`
  (POS→tenant); never user-filtered.

---

## 3. Project vs Camp Confusion

### 3.1 What is a PROJECT in current code

- A **row in the `projects` table**, the renamed successor of `camps`. `backend/migrations/0063_rename_camps_to_projects.sql:26-46` creates `projects(id TEXT PK, tenant_id TEXT NOT NULL REFERENCES tenants(id), name, slug, project_type DEFAULT 'camp', status DEFAULT 'active', location, latitude, longitude, start_date, end_date, capacity, description, gallery_images, meta_version, deleted_at, created_at, updated_at, UNIQUE(tenant_id, slug))`.
- The pre-rename unified columns were staged on `camps` first: `backend/migrations/0060_add_camp_columns.sql:17-36` (`slug`, `project_type DEFAULT 'camp'`, `latitude/longitude`, `deleted_at`, `meta_version`, `gallery_images`, `description`), with the header comment at `0060:12` stating "camps table will be renamed to projects in Phase 6".
- The canonical `project_type` vocabulary is `camp | supermarket | transportation | restaurant | custom` — `backend/src/api/camps.js:43`. Tenant `type` is kept in sync with it plus legacy `other` — `backend/src/api/tenants.js:14-19`.
- New project types get typed inventory via **`project_items`** (migration `0086:10-23`: `project_items(tenant_id, project_id REFERENCES projects(id), item_type DEFAULT 'product', …)`; item types `vehicle/product/menu_item/service/custom` — `backend/src/api/project-items.js:34`), and cross-project relations via **`project_links`** (migration `0085:11-20`: `project_links(tenant_id, project_id_a REFERENCES projects(id), project_id_b REFERENCES projects(id), link_type, …)`, same-tenant enforcement — `backend/src/api/project-links.js:141-143`).
- Secondary project-scoped tables: `project_meta(project_id)` (`0063:76-82`), `project_tags(project_id)` (`0063:104-108`), `crm_tasks.project_id` (nullable, no FK — `0081:46`), `service_items.project_id` (`backend/src/api/services.js:171-173`).
- API surface for projects proper: `GET/POST /api/projects/links` + `DELETE /:id` (`backend/src/api/project-links.js:94,119,169`; mounted at `/api/projects/links` — `backend/src/index.js:678-681`), `GET/POST/PUT/DELETE /api/projects/items` (`backend/src/api/project-items.js:146,181,215,256`; mounted — `backend/src/index.js:687-690`), `GET /api/projects/:id/meal-plans` (`backend/src/api/meal-plans.js:19-23`, mounted — `backend/src/index.js:793-794`), `/api/projects/:projectId/meta` + `/tags` (`backend/src/index.js:751-771`).
- Frontend mirrors: `getProjectMeta/setProjectMeta/updateProjectMeta/deleteProjectMeta` → `/projects/:id/meta` (`app/src/lib/api.ts:1022-1048`), `getProjectItems/saveProjectItem/deleteProjectItem` → `/projects/items` (`app/src/lib/api.ts:1108-1129`), `getProjectLinks/createProjectLink/deleteProjectLink` → `/projects/links` (`app/src/lib/api.ts:1162-1178`), `getProjectTags/addProjectTags/removeProjectTag` → `/projects/:id/tags` (`app/src/lib/api.ts:1206-1222`).

### 3.2 What is a CAMP in current code

- **There is no `camps` table anymore.** `0063:122-126` drops `room_type_camps` then `DROP TABLE IF EXISTS camps`, after copying every row `camps → projects` (`0063:51-60`, same `id`s; `created_at/updated_at` intentionally not copied — `0063:61-63`).
- "Camp" today is three things, none of them a table:
  1. **A `projects` row with `project_type = 'camp'`** (the default — `backend/src/api/camps.js:312` binds `project_type || 'camp'`; schema default `0063:31`).
  2. **The `/api/camps` + `/camps` route/vocabulary**, which still serves the `projects` table (see §3.4).
  3. **The `camp_id` column name** retained on the operational tables (see §3.3).
- `0053` (pre-rename) defined the original ownership doctrine: "One camp per tenant — camps own all sub-entities" (`0053:1`), `camps.tenant_id UNIQUE` (`0053:44`), room types point at their camp via `pos_products.camp_id` (`0053:50-53`), and `rooms_new / rate_plans_new / orders / plans_new` "already carry camp_id — no change" (`0053:8-9`). That doctrine assumed `tenant == its one camp` (`0053:10-11`).
- The one-camp-per-tenant unique index **died with the rename** and was deliberately not recreated: "The original one-camp-per-tenant unique index (idx_camps_one_per_tenant, migration 0053) was dropped when the `camps` table was renamed to `projects` in migration 0063. The per-tenant uniqueness guarantee is now UNIQUE(tenant_id, slug)" — `backend/src/api/camps.js:290-293`. Multi-project tenants are now supported; product creation 400s without `camp_id` when a tenant has >1 project (`backend/src/api/camps.js:531-537`).
- Tenant branding lives on **`tenants`**, not on the camp/project row: `POST /api/tenants/import` branding update writes `tenants SET name/logo_url/…` (`backend/src/api/tenant-import.js:212-244`); `GET /api/me` selects branding from `tenants` (`backend/src/api/tenants.js:270-274`). `tenants.type` defaults to `'camp'` (`backend/src/api/tenants.js:220`).
- Zone model (noted, marketplace side out-of-scope): `/camps`, `/camp`, `/camp/*` are marketplace-only; `/book`, `/menu`, `/rooms` (and `/pos/*`, `/storefront/*`) are tenant-only — `app/src/lib/routeZones.ts:59-70`.

### 3.3 Same row or not + who owns rooms / orders (reservations) / meals

**Same row or not: SAME ROW — `camps` was renamed to `projects`, both tables do not coexist.** Proof chain: `0063:51-60` copies all `camps` rows into `projects` preserving `id`; `0063:122-126` drops `camps`; `0066:1-11` states "After migration 0063 renamed camps → projects" and rebuilds the four leftover FKs (`rooms_new.camp_id`, `meal_schedules.camp_id`, `orders.camp_id`, `plans_new.camp_id`, all originally `REFERENCES camps(id)` per `0028`/`0037`/`0054`) to `REFERENCES projects(id) ON DELETE SET NULL` (`0066:22-24`, `0066:61-72`, `0066:101-121`, `0066:164-178`). **No compatibility view, alias, or trigger recreates `camps`**: no `CREATE VIEW … camps` exists anywhere in `backend/migrations/*.sql` or `backend/src` (verified by grep; only `tags: ['camps']` OpenAPI tag strings remain — `backend/src/routes/registry.js:677-720`). The old `trg_camps_updated_at` (`0060:39-42`) was dropped in `0061:25` and replaced by `trg_projects_updated_at` (`0066:215-222`).

Ownership (all via the retained `camp_id` column now FK'd to `projects(id)`):

| Entity | Owner column → target | Citation |
|---|---|---|
| Physical rooms (`rooms_new`) | `rooms_new.camp_id → projects(id) ON DELETE SET NULL` | `0066:22-24`; reads always join `projects`: `camps.js:738` (`JOIN projects c2 … WHERE c2.tenant_id`), `camps.js:782-786` (guarded `INSERT … SELECT FROM projects c3`), `camps.js:899-902` (availability join) |
| Reservations (`orders` = reservations; `0028` header "orders – Reservations") | `orders.camp_id → projects(id) ON DELETE SET NULL` + `orders.room_id → rooms_new(id) RESTRICT` | `0066:101-121`; create binds `room.camp_id` as the order's `camp_id` — `backend/src/api/reservations.js:335-350`; delete-room blocked by existing orders — `camps.js:862-865` |
| Rate plans (`rate_plans_new`) | `camp_id` **derived from the product's camp** (`p.camp_id`), not chosen directly | `camps.js:972-979` (`INSERT … SELECT p.camp_id FROM pos_products`), resync on update — `camps.js:1028-1033` |
| Room-type products (`pos_products`) | `pos_products.camp_id` (soft FK, no REFERENCES clause — `0053:21-25`) is the source of truth since 0053 | backfill `0053:50-53`; product create validates `camp_id` against tenant's `projects` — `camps.js:522-538`; junction `product_camps` is legacy/never read, kept empty — `camps.js:565-566, 687-691`; `admin.js:69` still deletes its residue on tenant wipe |
| Activity plans (`plans_new`) | `plans_new.camp_id → projects(id) ON DELETE SET NULL` | `0066:164-178`; CRUD joins `projects` — `backend/src/api/others.js:44,53,70-77,116-117,129` |
| Meals (`meals`) | **Owned by TENANT, not by camp/project**: `meals(tenant_id)` with NO `camp_id` | `0001:151-160` (`meals(id, tenant_id, …)`, FK tenant only); current reads filter `m.tenant_id = ?` — `backend/src/api/meals.js:44-67`; writes scope `tenant_id` — `meals.js:85,121,156,169,217` |
| Meal service (`meal_schedules`) | `meal_schedules.camp_id → projects(id)` (the per-camp serving of a tenant meal) | `0066:61-72` (FK rebuild); origin `0037:7-14` (`camp_id REFERENCES camps(id)`) |
| Per-project typed inventory (`project_items`) | `project_items.project_id → projects(id) CASCADE` | `0086:10-23`; tenant+project gate — `project-items.js:193-197` |

Tenant-import handler (manifest → tables):
- Default camp resolution: single live project or null — `tenant-import.js:199-203` (`SELECT id FROM projects WHERE tenant_id …`; `defaultCampId = length === 1 ? id : null`).
- Products land in `pos_products` with `camp_id = item.camp_id || defaultCampId` — `tenant-import.js:257-268`.
- **Rooms land in `rooms_new`** via the same tenant-guarded `INSERT … SELECT FROM projects c3` as the API — `tenant-import.js:312-327` (comment `── 3. Rooms → rooms_new ──` at `:290`).
- **Rate plans land in `rate_plans_new`** with `camp_id` taken from `p.camp_id` — `tenant-import.js:350-363` (comment `── 4. Rate plans → rate_plans_new ──` at `:338`).
- Referenced products **are resolved by `productName`** against imported + pre-existing tenant products — `tenant-import.js:248-288` (`productNameToId` map + `SELECT id, name FROM pos_products WHERE tenant_id`), rooms `product_name` fallback — `:294-298` (400 on unknown), rate plans identical — `:341-346`.
- Meals reference categories by **`categoryName`** — schema `tenant-import.js:132-147`; `docs/tenant-import.md:73-79` documents rooms/rate_plans/productName/404 semantics; sample `docs/examples/tenant-manifest.example.json` exists (with `docs/examples/acacia-manifest.json`).

### 3.4 Code that treats project and camp interchangeably (verbatim)

1. **Router named `campsRoutes` serving `projects`** — `backend/src/api/camps.js:194` (`const campsRoutes = new Hono()`), comment `0063 rename of camps` at `camps.js:144-148`, mounted at `/api/camps` — `backend/src/index.js:636-639` (`app.use('/api/camps', catalogScope); app.route('/api/camps', campsRoutes)`).
2. **SQL alias `c`/`c2`/`c3` = projects-but-called-camp**: `camps.js:147-148` ``CROSS_TENANT_SELECT = "SELECT c.*, … FROM projects c LEFT JOIN …"``; `camps.js:738` `FROM rooms_new r JOIN projects c2`; `camps.js:784` `FROM projects c3`; `backend/src/api/inbox.js:55` `LEFT JOIN projects c ON c.id = o.camp_id`; `backend/src/api/reservations.js:155` `JOIN projects c ON …`.
3. **Variable/function names say camp, table says projects**: `camps.js:253` `const campId = c.req.param('id')`; `camps.js:523`/`654` `const { results: campCheck } = … FROM projects …` + `return errorResponse('Camp not found', 404)` (`:527`, `:658`); `camps.js:521` `let productCampId`; `camps.js:606` `const tenantCampId`; `tenant-import.js:203` `const defaultCampId` (holds a **projects.id**); `camps.js:242-246` `function publicCampProjection`, `camps.js:224-240` `PUBLIC_CAMP_KEYS`; `camps.js:105` `camp_id: … 'Camp ID is required'` validating against `projects`.
4. **User-facing strings say Camp for project rows**: `errorResponse('Camp not found', 404)` — `camps.js:260,346,427,435,527,658,789`; `A room with name … already exists in this camp` — `camps.js:773,819`; `camp_id is required when a tenant has multiple projects` — `camps.js:535`.
5. **ID prefix `camp_` for project rows**: `camps.js:306` `const cid = id || 'camp_' + crypto.randomUUID()… // ('camp_' prefix kept for URL/back-compat)`.
6. **Comments explicitly equating them**: `camps.js:94-95` "One-camp-per-tenant (0053): room types point at their camp via camp_id"; `camps.js:517-520` "Room types belong to a camp/project"; `camps.js:459-460` "0053: camp membership comes from pos_products.camp_id"; `camps.js:437` "trg_camps_updated_at died with the 0063 rename"; `camps.js:290-293` (one-camp index dropped at rename); `docs/tenant-import.md:59-64` "tenant's default project for camp scoping … create a camp via the Camps [API]".
7. **Frontend `api.ts` splits the vocabulary by endpoint age**: legacy `getCamps/getCamp/saveCamp/deleteCamp` → `/camps` — `app/src/lib/api.ts:288-310` — vs new `getProjectMeta/getProjectItems/getProjectLinks/getProjectTags` → `/projects/…` — `api.ts:1022-1048,1108-1178,1206-1222`; stale generic types still say camp (`campId/campName` in financial/HR/supply/CRM/AI payloads — `api.ts:1991-2161`).
8. **`admin.js` counts projects as camps**: `(SELECT COUNT(*) FROM projects WHERE deleted_at IS NULL) as total_camps` — `backend/src/api/admin.js:108`, while wipe deletes `rooms_new/plans_new` via `camp_id IN (SELECT id FROM projects …)` (`admin.js:67,72-73`).
9. **Meal-plan route nests a tenant-level concept under a project id**: `GET /api/projects/:id/meal-plans` looks up `projects` then serves POS products by the project's `meal_plan_category_id` — `meal-plans.js:19-43`.

---

## 4. POS / Menu / Stock Scoping

### 4a. POS org scoping — tenant vs project vs camp vs store, and where the mapping happens

**Dual multi-tenancy model.** Core tables scope on `tenant_id TEXT`
(e.g. `'acaciacamp'`); POS tables scope on `organization_id INTEGER` (e.g. `1`).
Stated verbatim in `backend/migrations/0041_create_tenant_org_mapping.sql:1-5`:

```sql
-- Bridges the dual multi-tenancy model:
--   Core tables use tenant_id TEXT (e.g., 'acaciacamp')
--   POS tables use organization_id INTEGER (e.g., 1)
```

**The junction table** (`backend/migrations/0041_create_tenant_org_mapping.sql:10-17`):

```sql
CREATE TABLE IF NOT EXISTS tenant_org_mapping (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id     TEXT    NOT NULL UNIQUE,
  organization_id INTEGER NOT NULL UNIQUE,
  created_at    TEXT    DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id)     REFERENCES tenants(id)           ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES pos_organizations(id) ON DELETE CASCADE
);
```

Both columns are `UNIQUE` — the mapping is **1 tenant : 1 POS organization**.
Backfill (`0041:23-27`) pins every pre-existing tenant to org 1 (excluding the `marketplace` id — out-of-scope):

```sql
INSERT OR IGNORE INTO tenant_org_mapping (tenant_id, organization_id)
SELECT t.id, 1
FROM   tenants t
WHERE  t.id != 'marketplace'
  AND  EXISTS (SELECT 1 FROM pos_organizations WHERE id = 1);
```

Reverse-lookup index (`0041:32-33`) and convenience view (`0041:38-40`):

```sql
CREATE VIEW IF NOT EXISTS v_tenant_org AS
SELECT tenant_id, organization_id
FROM   tenant_org_mapping;
```

**Who creates the mapping — `ensureTenantOrg`.**
Canonical implementation
`backend/src/middleware/resolveScope.js:43-77` (moved verbatim from
`api/pos-users.js`; re-exported at `backend/src/api/pos-users.js:8-11`):

```js
'SELECT organization_id FROM tenant_org_mapping WHERE tenant_id = ?'
```

```sql
INSERT OR IGNORE INTO pos_organizations (name, slug, created_at, updated_at)
VALUES (?, ?, datetime('now'), datetime('now'))
```

```js
'SELECT id FROM pos_organizations WHERE slug = ?'
```

```sql
INSERT OR IGNORE INTO pos_stores (organization_id, name, code, address, city, created_at, updated_at)
VALUES (?, ?, ?, 'N/A', 'N/A', datetime('now'), datetime('now'))
```

```sql
INSERT OR IGNORE INTO tenant_org_mapping (tenant_id, organization_id) VALUES (?, ?)
```

Slug convention (`resolveScope.js:50`): `('org_' + tenantId)` sanitized; store
is `tenantId + ' Store'` / `'ST_' + tenantId` (`resolveScope.js:64-66`).
Idempotent (`INSERT OR IGNORE`), returns `organization_id` or `null`
(`resolveScope.js:48,61,72`). Callers:

- `backend/src/api/pos-users.js:85-91` — `resolveOrganization()` reads the
  mapping first, provisions on miss:
  `'SELECT organization_id FROM tenant_org_mapping WHERE tenant_id = ?'`
  then `return await ensureTenantOrg(env, tenantId);`
- `backend/src/api/tenant-import.js:194` and `:575` — manifest import and
  super-admin `identity` provisioning call
  `ensureTenantOrg(env, tenantId)` / `ensureTenantOrg(c.env, newTenantId)`.
- `backend/src/api/onboarding.js:98-128` — self-service signup provisions
  tenant + admin + POS org + store + mapping in ONE batch, resolving the
  auto-increment id by slug subquery:
  `INSERT INTO tenant_org_mapping (tenant_id, organization_id) VALUES (?, (SELECT id FROM pos_organizations WHERE slug = ?))`
  (`onboarding.js:124-127`).

**Which login path uses the mapping.** POS login never takes a tenant hint —
it resolves `organization_id → tenant_id` through the table.
`backend/src/routes/pos/index.js:43-56` (`resolveOrgTenantId`):

```sql
SELECT tenant_id FROM tenant_org_mapping WHERE organization_id = ?
```

Fallback is `String(organization_id)` (`index.js:51`); failures warn and fall
back (`index.js:52-55`). Used at `index.js:137` (login:
`const tenantId = await resolveOrgTenantId(env, user.organization_id);`) and
`index.js:256` (refresh, same call). The login credential lookup itself is
org-blind (`index.js:111-116`):

```sql
SELECT id, organization_id, store_id, username, email, first_name, last_name,
       password_hash, role, is_active
FROM pos_users
WHERE (email = ? OR username = ?) AND deleted_at IS NULL
```

The issued token then carries **all three POS scope axes**
(`index.js:145-154`, refresh `index.js:261-270`):
`tenantId` (mapped), `organizationId`, `storeId`, plus `posType: 'pos'`.
`posAuth` (`index.js:73-99`) enforces `decoded.posType === 'pos'`
(`index.js:81`), rejects refresh tokens (`index.js:87-89`), and re-checks
`SELECT is_active FROM pos_users WHERE id = ? AND deleted_at IS NULL`
(`index.js:91-93`).

**Tenant vs project vs camp vs store — what each one is:**

| Axis | Table / column | Meaning |
|---|---|---|
| tenant | `tenants.id` (TEXT) | Top-level owner. Everything admin-side filters `WHERE tenant_id = ?`. |
| POS organization | `pos_organizations.id` (INTEGER) | 1:1 with tenant via mapping. Owns stores, users, products. |
| store | `pos_stores.organization_id` (`0010:38-60`) | Physical outlet under one org. `pos_users.store_id`, `pos_transactions.store_id` stamp it; it is NOT a tenant boundary. |
| camp / project | `projects` row (`tenant_id` + `deleted_at`) | A camp site. Products point at it via `pos_products.camp_id`; bookings via `orders.camp_id`, rooms via `rooms_new.camp_id`. |

No `camp_id`/`project_id` exists on `pos_organizations`, `pos_stores`,
`pos_users`, or `pos_transactions` — the POS realm does not subdivide by camp.
Store resolution inside `POST /api/pos/orders` (`index.js:623-629`) proves the
hierarchy (store is derived from org, never from camp):

```sql
SELECT id FROM pos_stores WHERE organization_id = ? LIMIT 1
```

(`storeId = posUser.storeId` when set, else the org's first store, else `1`.)
Likewise `pos_users` creation defaults a missing `store_id` to the org's first
store (`backend/src/api/pos-users.js:188-194`), because `pos_transactions`
has an FK on `store_id`. The admin-side `GET /api/pos-users` list filters on
the org dimension (`pos-users.js:133`): `pu.organization_id = ?`.

**Dual-realm (shared) routes** resolve POS tokens the same way
(`backend/src/middleware/resolveScope.js:153-163`):

```js
'SELECT tenant_id FROM tenant_org_mapping WHERE organization_id = ?'
```

while admin tokens use the header/query tenant hint (`resolveScope.js:164-182`).

### 4b. Menu scoping — meals per tenant / project / camp / shared, plus the two leak tests

**Schema: meals are per-tenant, categorized, with NO camp/project/shared
column.** `backend/migrations/0001_init.sql:151-159`:

```sql
CREATE TABLE meals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  selling_price REAL,
  description TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
```

Current shape `backend/migrations/0028_create_new_tables.sql:257-266`:

```sql
CREATE TABLE IF NOT EXISTS meals (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    meal_category_id TEXT NOT NULL REFERENCES meal_categories(id) ON DELETE CASCADE,
    price REAL NOT NULL DEFAULT 0,
    image_url TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT
);
```

Categories are likewise per-tenant (`0028:236-242`):
`meal_categories(id, tenant_id REFERENCES tenants(id) ...)`.
There is no `camp_id`, `project_id`, `is_shared`, or `is_global` column on
`meals` or `meal_categories` anywhere in `backend/migrations/`.

**Reads are tenant-filtered, never camp-filtered.**
`backend/src/api/meals.js:43-52` (GET `/api/meals` — "full menu for this tenant"):

```sql
SELECT m.id, m.tenant_id, m.meal_category_id, m.price, m.image_url, m.is_active, m.created_at,
       ml.name, ml.description,
       mc.id AS category_id, mcl.name AS category_name
FROM meals m
LEFT JOIN meal_lang ml ON ml.meal_id = m.id AND ml.lang = 'en'
LEFT JOIN meal_categories mc ON mc.id = m.meal_category_id
LEFT JOIN meal_categories_lang mcl ON mcl.meal_category_id = mc.id AND mcl.lang = 'en'
WHERE m.tenant_id = ?
```

Single-meal read (`meals.js:59-68`):

```sql
WHERE m.tenant_id = ? AND m.id = ?
```

Categories (`backend/src/api/meal-categories.js:33-39`, `:50-55`):

```sql
WHERE mc.tenant_id = ?
```

```sql
WHERE mc.id = ? AND mc.tenant_id = ?
```

**Mutations verify ownership before writing** (`meals.js:155-158`,
`meals.js:202-205`):

```sql
SELECT id FROM meals WHERE id = ? AND tenant_id = ?
```

with writes double-filtered (`meals.js:162-176`, `meals.js:216-218`):

```sql
DELETE FROM meals WHERE tenant_id = ? AND id = ?
```

Tenant wipe cascades by tenant (`backend/src/api/admin.js:77-79`):

```sql
DELETE FROM meal_schedules WHERE meal_id IN (SELECT id FROM meals WHERE tenant_id = ?)
DELETE FROM meal_lang WHERE meal_id IN (SELECT id FROM meals WHERE tenant_id = ?)
DELETE FROM meals WHERE tenant_id = ?
```

**Leak test 1 — cross-tenant menu leak: NO LEAK (predicate blocks it).**
Tenant B calling `GET /api/meals` binds `tenantId = B` into
`WHERE m.tenant_id = ?` (`meals.js:51-52`), so rows with `tenant_id = A` can
never match. `GET /:id`, `PUT`, `DELETE` with A's meal id hit the ownership
check `SELECT id FROM meals WHERE id = ? AND tenant_id = ?` (`meals.js:156`,
`meals.js:203`) → zero rows → `404 'Meal not found'` (`meals.js:158`,
`meals.js:205`). Same for categories → `404 'Meal category not found'`
(`meal-categories.js:56`).

**Leak test 2 — "camp X shows the restaurant menu": TRUE at tenant grain,
camp assignment lives in `meal_schedules`, not `meals`.** There is deliberately
no `WHERE camp_id` on any `meals` query — every camp in a tenant sees the same
full tenant menu. Per-camp-per-day serving is the `meal_schedules` table
(`camp_id + meal_id + tenant_id`). List (`backend/src/api/meal-schedules.js:24-33`):

```sql
SELECT ms.id, ms.tenant_id, ms.camp_id, c.name AS camp_name,
       ms.date, ms.meal_id, ml.name AS meal_name,
       ms.package_type, ms.max_servings, ms.created_at
FROM meal_schedules ms
LEFT JOIN projects c ON c.id = ms.camp_id
LEFT JOIN meals m ON m.id = ms.meal_id
LEFT JOIN meal_lang ml ON ml.meal_id = m.id AND ml.lang = 'en'
WHERE ms.tenant_id = ?
```

with optional camp/date narrowing (`meal-schedules.js:36-47`):
`AND ms.camp_id = ?`, `AND ms.date >= ?`, `AND ms.date <= ?`.
Creation verifies **both** halves belong to the caller (`meal-schedules.js:66-75`):

```sql
SELECT id FROM meals WHERE id = ? AND tenant_id = ?
```

```sql
SELECT id FROM projects WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
```

(404 `'Meal not found'` / `'Camp not found'` otherwise.) So the accurate
statement is: a camp shows the tenant menu **filtered through that camp's
`meal_schedules` rows**; the `meals` table itself is camp-agnostic.

Related but distinct: the booking-flow "restaurant menu" (`meal-plans.browse`
convention) reads **POS products**, not `meals`
(`backend/src/api/meal-plans.js:39-43`):

```sql
SELECT id, name, selling_price, description, image_url
FROM pos_products
WHERE category_id = ? AND organization_id = ?
```

where the category comes from the camp's own column
(`meal-plans.js:21-23`
`SELECT tenant_id, meal_plan_category_id FROM projects WHERE id = ? ...`,
column added in `backend/migrations/0070_add_meal_plan_category.sql:3`:
`ALTER TABLE projects ADD COLUMN meal_plan_category_id TEXT;`)
and the org from
`SELECT organization_id FROM tenant_org_mapping WHERE tenant_id = ?`
(`meal-plans.js:29-31`).

### 4c. Stock granularity — per product / store / org / tenant, and two stores sharing a tenant

**Canonical answer: stock is ONE integer per `pos_products` row
(`stock_quantity`), i.e. per product per tenant (dual-written per org). There
is no per-store and no per-tenant-aggregate stock.**

Column history: introduced by
`backend/migrations/0011_pos_schema_patches.sql:5`:

```sql
ALTER TABLE pos_products ADD COLUMN stock_quantity INTEGER DEFAULT 0;
```

current definition `backend/migrations/0042_cleanup_pos_products.sql:69`
(inside the `pos_products_new` rebuild, `0042:29-74`):

```sql
stock_quantity INTEGER DEFAULT 0,
```

alongside the dual scope columns (`0042:31-32`):

```sql
tenant_id TEXT NOT NULL DEFAULT 'acaciacamp',
organization_id INTEGER NOT NULL DEFAULT 1,
```

**The per-store inventory tables are dead and dropped.** `0010` created
`pos_inventory(organization_id, store_id, product_id, variant_id, ...)` with
`UNIQUE(store_id, product_id, variant_id)` (`0010:250-270`) and
`pos_stock_movements` (`0010:272-295`), but migration 0056 dropped both:

```sql
DROP TABLE IF EXISTS pos_inventory;
DROP TABLE IF EXISTS pos_stock_movements;
```

(`backend/migrations/0056_drop_dead_tables.sql:53-54`; header `0056:11-14`
confirms they had zero backend references after the 0055 trigger drop).
No live handler queries `pos_inventory` or `pos_stock_movements` — the only
remaining mentions are the 0047 FK-repair rebuild and audit docs. All live
stock reads/writes target `pos_products.stock_quantity` directly.

Verbatim live queries:

- Low-stock list (`backend/src/api/inventory.js:59-66`, `inventory.js:73-82`)
  resolves the org first, then reads products by org:

```sql
SELECT organization_id FROM tenant_org_mapping WHERE tenant_id = ?
```

```sql
SELECT COUNT(*) AS count
FROM pos_products p
WHERE p.organization_id = ?
  AND p.deleted_at IS NULL
  AND p.is_active = 1
  AND p.stock_quantity <= p.min_stock_level
```

```sql
SELECT p.id, p.name, p.stock_quantity, p.min_stock_level, p.unit
FROM pos_products p
WHERE p.organization_id = ?
  AND p.deleted_at IS NULL
  AND p.is_active = 1
  AND p.stock_quantity <= p.min_stock_level
ORDER BY (p.stock_quantity * 1.0 / NULLIF(p.min_stock_level, 0)) ASC
LIMIT ? OFFSET ?
```

- Manual adjustment guard (`inventory.js:122-136`) — ownership on the tenant
  dimension plus a negative-stock guard inside the UPDATE:

```sql
SELECT id, stock_quantity FROM pos_products WHERE id = ? AND tenant_id = ?
```

```sql
UPDATE pos_products SET stock_quantity = stock_quantity + ?, updated_at = CURRENT_TIMESTAMP
WHERE id = ? AND tenant_id = ? AND stock_quantity + ? >= 0
```

(`400 'Adjustment would result in negative stock'` when `meta.changes === 0`,
`inventory.js:138-140`; re-read at `inventory.js:142`:
`SELECT stock_quantity FROM pos_products WHERE id = ? AND tenant_id = ?`.)

- Reorder suggestions (`inventory.js:150-156`) read by tenant:

```sql
SELECT p.id, p.name, p.stock_quantity, p.reorder_point, p.min_stock_level, p.supplier_name,
       (p.reorder_point - p.stock_quantity) as suggested_order_qty
FROM pos_products p
WHERE p.tenant_id = ? AND p.is_active = 1 AND p.deleted_at IS NULL
  AND p.stock_quantity <= p.reorder_point
ORDER BY (p.stock_quantity * 1.0 / NULLIF(p.reorder_point, 0)) ASC
```

- POS sale deduction (`backend/src/routes/pos/index.js:587-590`,
  `index.js:645-649`) — bulk ingredient-stock read, then atomic conditional
  deduction (same `>= ?` pattern so concurrent terminals can never drive stock
  negative):

```sql
SELECT id, name, stock_quantity FROM pos_products
WHERE id IN (${ingPlaceholders}) AND tenant_id = ?
```

```sql
UPDATE pos_products SET stock_quantity = stock_quantity - ?
WHERE id = ? AND tenant_id = ? AND stock_quantity >= ?
```

with post-batch race compensation (`index.js:729-760`: re-add applied
deductions via
`UPDATE pos_products SET stock_quantity = stock_quantity + ? WHERE id = ?`,
then `DELETE FROM pos_transaction_items WHERE order_id = ?` and
`DELETE FROM pos_transactions WHERE id = ?`, returning `400 'Insufficient
stock … (stock changed under concurrent checkout)'`).

**Two stores, same tenant: they SHARE one stock number.** The deduction
`WHERE` clause contains `id + tenant_id + stock_quantity >= ?` and **no
`store_id`** (`index.js:646-648`). Store appears only as a stamp on the sale
row (`index.js:623-629` store resolution;
`INSERT INTO pos_transactions (id, tenant_id, organization_id, store_id, …)`,
`index.js:652-672`). Consequence: a sale on store A and a sale on store B of
the same org decrement the same `pos_products.stock_quantity` row; either
terminal can trigger the low-stock inbox alert (`index.js:770-773`
`SELECT id, name, stock_quantity, min_stock_level FROM pos_products WHERE id
IN (…) AND tenant_id = ?`, alert when `0 < qty <= min_stock_level`,
`index.js:776-792`).

Dimension note: low-stock reads by `organization_id` (`inventory.js:62`) while
adjustments/reorder/POS read by `tenant_id` — safe only because product create
dual-writes both 1:1 (`backend/src/api/camps.js:548-563`:
`SELECT organization_id FROM tenant_org_mapping WHERE tenant_id = ?`, then
`INSERT INTO pos_products (id, tenant_id, organization_id, … camp_id, …)`).
`GET /api/inventory/low-stock` with no mapping row returns an empty page
(`inventory.js:46-54`).

### 4d. Orders duality — camp booking vs POS restaurant order

**They are two different concepts in two different tables with different
lifecycles. The ONLY place they touch is the meal-plan bridge, which writes
one row into each.**

#### Camp booking → `orders` (+ `order_items`)

Handler: `POST /api/orders`
(`backend/src/api/orders.js:681-857`); public variant `POST /api/reservations`
(`backend/src/api/reservations.js:280-430`, same guarded pattern plus a
reference-dedupe). The write is a race-safe guarded insert
(`orders.js:719-734` — comment at `orders.js:710-718` explains why a naive
SELECT+INSERT batch would NOT be safe):

```sql
INSERT INTO orders (id, tenant_id, camp_id, room_id, customer_id, order_state_id, check_in_date, check_out_date, number_of_people, total_amount, amount_paid, payment_method, payment_status, reference, notes, created_at, updated_at)
SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM orders
   WHERE tenant_id = ? AND room_id = ?
     AND (check_in_date < ? AND check_out_date > ?)
     AND order_state_id != 'cancelled'
)
```

`meta.changes === 0` → `409 'Room no longer available'` (`orders.js:736-738`).
Line items (`order_items`, tenant isolation via the `order_id` FK — noted at
`orders.js:1070`, `orders.js:1076`, `orders.js:1134`) are persisted only AFTER
the guarded insert succeeds (`orders.js:740-758`), including meal-plan items
with `type = 'meal_plan'` (`orders.js:806-812`):

```sql
INSERT INTO order_items (id, order_id, type, reference_id, name, quantity, unit_price, total_price, created_at)
VALUES (?, ?, 'meal_plan', ?, ?, ?, ?, ?, datetime('now'))
```

Booking lifecycle is a stay state machine
(`orders.js:430-436`):
`pending → confirmed → checked_in → checked_out` (`cancelled` from any
non-terminal step), enforced at `PATCH /:id/status` (`orders.js:449-524`),
and it drives `rooms_new.room_status`
(`orders.js:443-447`, `orders.js:491-512`). A separate kitchen sub-state lives
on the same row (`orders.table_id`, `orders.kitchen_status`, added by
`backend/migrations/0069_restaurant_tables.sql:46-48`;
`KITCHEN_TRANSITIONS` at `orders.js:535-541`;
`PATCH /:id/kitchen-status` at `orders.js:551-599` with tenant-scoped check
`SELECT id, kitchen_status FROM orders WHERE tenant_id = ? AND id = ?`,
`orders.js:562-564`).

A plain camp booking (no `meal_plans`) writes **only** `orders` (+ `order_items`
+ `customers`) and never touches `pos_transactions`.

#### POS restaurant order → `pos_transactions` (+ `pos_transaction_items`)

Handler: `POST /api/pos/orders`
(`backend/src/routes/pos/index.js:320-836`). Product ownership is tenant-scoped
(`index.js:397-400`):

```sql
SELECT id, selling_price, name, category_id FROM pos_products
WHERE id IN (${placeholders}) AND tenant_id = ?
```

(unknown/foreign id → `400 'Product … not found'`, `index.js:406-408`).
Optional dine-in table is tenant-scoped (`index.js:511-513`):

```sql
SELECT id FROM pos_tables WHERE id = ? AND tenant_id = ?
```

The commit batch (`index.js:631-710`) runs: conditional stock deductions
(§4c), then the sale row (`index.js:652-672`):

```sql
INSERT INTO pos_transactions
  (id, tenant_id, organization_id, store_id, order_number, cashier_id,
   status, subtotal, tax_amount, tax_rate, total_amount,
   paid_amount, payment_method, payment_status, notes,
    amount_cash, amount_card, idempotency_key, table_id, kitchen_status,
    tip_amount, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
```

(status/payment literals `'completed'`, kitchen starts at `'pending'`),
then the dine-in side effect in the SAME batch (`index.js:678-684`):

```sql
UPDATE pos_tables SET status = 'occupied' WHERE id = ? AND tenant_id = ?
```

then one `pos_transaction_items` row per line item (`index.js:686-694`):

```sql
INSERT INTO pos_transaction_items
  (id, tenant_id, order_id, product_id, quantity, unit_price, subtotal, tax_amount, total_amount, created_at, updated_at)
 VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, datetime('now'), datetime('now'))
```

Staff reference is `cashier_id` (the live POS user id string), never
`staff_id`. Reads are tenant-scoped (`index.js:849-851`,
`index.js:877-882`, `index.js:888-893`):

```sql
SELECT COUNT(*) AS total FROM pos_transactions WHERE tenant_id = ?
```

```sql
SELECT t.*, u.username AS cashier_name
FROM pos_transactions t
LEFT JOIN pos_users u ON u.id = t.cashier_id
WHERE t.id = ? AND t.tenant_id = ?
```

A plain POS sale writes **only** `pos_transactions` /
`pos_transaction_items` (+ stock deduction) and never touches `orders`.

#### The bridge (meal plans attached to a booking)

When `meal_plans[]` is present, the booking handler ALSO inserts one
kitchen-bound `pos_transactions` row per meal line — the single documented
cross-touch, in both entry points:

- `backend/src/api/orders.js:814-828`:

```sql
INSERT INTO pos_transactions
 (id, tenant_id, organization_id, store_id, order_number, cashier_id,
  status, subtotal, tax_amount, tax_rate, total_amount,
  paid_amount, payment_method, payment_status, notes,
  kitchen_status, created_at, updated_at)
 VALUES (?, ?, ?, 1, ?, ?, 'completed', ?, 0, 0, ?, ?, 'booking', 'completed', ?, 'confirmed', datetime('now'), datetime('now'))
```

(`cashier_id = 'system'`, `store_id = 1`, `payment_method = 'booking'`,
`kitchen_status = 'confirmed'`, order number `'MP-' + reference`,
`orders.js:823-827`.)
- `backend/src/api/reservations.js:412-425`: identical statement.

Both sides guard the product set against the tenant's own org
(`orders.js:770-785`):

```sql
SELECT organization_id FROM tenant_org_mapping WHERE tenant_id = ?
```

```sql
SELECT id, name, selling_price FROM pos_products
WHERE id IN (${placeholders}) AND organization_id = ?
```

with `400 'One or more meal plan products were not found in this
organization'` when any id is foreign/unknown (`orders.js:786-791`), and
`400 'Meal plan products are unavailable for this tenant'` with no mapping
(`orders.js:774-776`). The booking total is bumped by the meal-plan sum
(`orders.js:831-835`
`UPDATE orders SET total_amount = total_amount + ? WHERE id = ?`).

Summary table:

| | Camp booking | POS restaurant order |
|---|---|---|
| Table | `orders` (+ `order_items`) | `pos_transactions` (+ `pos_transaction_items`) |
| Handler | `POST /api/orders` (`api/orders.js:681`), `POST /api/reservations` (`api/reservations.js:333`) | `POST /api/pos/orders` (`routes/pos/index.js:320`) |
| Guard | `WHERE NOT EXISTS` overlap → 409 (`orders.js:719-738`) | conditional stock `stock_quantity >= ?` → 400 + compensation (`pos/index.js:640-760`) |
| Lifecycle | stay states + room side effects (`orders.js:430-524`) | `completed` sale + table→occupied (`pos/index.js:652-684`) |
| Lists | `SELECT COUNT(*) … FROM orders WHERE tenant_id = ?` (`orders.js:608`) | `SELECT COUNT(*) … FROM pos_transactions WHERE tenant_id = ?` (`pos/index.js:849-851`) |
| Cross-touch | only via meal_plans → one `pos_transactions` row per line (`orders.js:814-828`) | never writes `orders` |

Reporting keeps the duality explicit (`backend/src/api/reports.js:261-282`):
POS revenue by product type/payment from `pos_transactions*` plus a separate
`accommodation` aggregate `FROM orders WHERE tenant_id = ? …`.

---

## 5. Owner Model

1. A **tenant is the customer/owner account** (e.g. Acacia) — the identity and billing root held in the `tenants` table.
2. A tenant owns **N projects** — one row per project in the `projects` table, each carrying that tenant's `tenant_id`.
3. Each project has a type that determines its **sellable unit types**: a camp sells room-nights, a restaurant sells meals/menu items, a supermarket sells retail products, a transportation project sells seats/trips, a custom project sells service items.
4. A **single-camp tenant is a single project**: one tenant row, one `projects` row with `project_type = 'camp'`.
5. A **camp + restaurant tenant is two projects**: one `projects` row of type camp and one `projects` row of type restaurant, both under the same tenant.
6. **Shared lists** are tenant-level catalogs visible to every project of that tenant (one menu catalogue, one product catalogue, one staff roster shared by the camp and the restaurant).
7. **Isolated lists** are per-project records that must never cross projects (rooms belong to the camp project, bookings belong to the camp project, serving schedules belong to the project being served, revenue belongs to the project that earned it).
8. Analogy: a **multi-brand operation on one shared ERP with a separate P&L per project** — one back office, one shared catalogue layer, but each project/brand closes its own books.

---

## 6. Gaps (current code vs the Section 5 shape)

### G6.1 Tenant isolation without project isolation

Isolation in current code stops at the tenant. `resolveScope` builds `scope = { tenantId, user }`
(`backend/src/middleware/resolveScope.js:207-208`) and `requireAuth` enforces claim-equals-tenant
(`backend/src/middleware/requireAuth.js:185-190`); there is no project/camp dimension in scope.
`camp_id`/`project_id` appear only as optional per-query filters inside handlers
(e.g. `roomsRoutes` `?campId=`, `backend/src/api/camps.js:734/741-744`;
`project-items` `?projectId=`, `backend/src/api/project-items.js:153/159-162`).
Consequence: any authenticated caller inside the tenant can read or mutate any project of that
tenant by passing (or omitting) the optional filter. Against Section 5 bullets 5/7: the
camp project and the restaurant project of one tenant are not separated anywhere in the
request path.

### G6.2 Camp A sees restaurant B's menu (tenant-grain menu read)

`GET /api/meals` returns the full tenant menu with no camp predicate
(`backend/src/api/meals.js:43-52`, Section 2 §2.20 / Section 4 §4b):

```sql
SELECT m.id, m.tenant_id, m.meal_category_id, m.price, m.image_url, m.is_active, m.created_at,
       ml.name, ml.description,
       mc.id AS category_id, mcl.name AS category_name
FROM meals m
LEFT JOIN meal_lang ml ON ml.meal_id = m.id AND ml.lang = 'en'
LEFT JOIN meal_categories mc ON mc.id = m.meal_category_id
LEFT JOIN meal_categories_lang mcl ON mcl.meal_category_id = mc.id AND mcl.lang = 'en'
WHERE m.tenant_id = ?
```

Camp A and restaurant B are the same tenant, so both see the identical menu. The `meals` table
has no `camp_id`/`project_id` column anywhere in `backend/migrations/` (Section 4 §4b); per-camp serving
lives only in `meal_schedules` (`backend/src/api/meal-schedules.js:24-33`, optional
`AND ms.camp_id = ?` at `:36-39`). Against Section 5 bullet 7: meal isolation per project does
not exist at the catalogue level.

### G6.3 Restaurant B's POS sees camp A's rooms (tenant-grain POS product read)

The POS sale product lookup is tenant-scoped with no camp predicate
(`backend/src/routes/pos/index.js:397-400`, Section 4 §4d):

```sql
SELECT id, selling_price, name, category_id FROM pos_products
WHERE id IN (${placeholders}) AND tenant_id = ?
```

The canonical product list is the same shape (`backend/src/routes/pos/index.js:306-312`, Section 2 §2.14):

```sql
SELECT id, sku, name, description, selling_price, cost_price, category_id,
       type, image_url, is_active, stock_quantity
FROM pos_products
WHERE tenant_id = ? AND deleted_at IS NULL AND is_active = 1
ORDER BY name
```

Any POS terminal of the tenant can sell any product of the tenant, including room-type products
(`pos_products.type CHECK(room,...)`, `camp_id` soft FK per `0053:21-25`) that belong to camp A.
`pos_organizations`, `pos_stores`, `pos_users`, and `pos_transactions` carry no
`camp_id`/`project_id` at all (Section 4 §4a) — the POS realm does not subdivide by camp.
Against Section 5 bullets 5/7: the restaurant project's till and the camp project's inventory
are one shared pool.

### G6.4 Reports: tenant-only today, per-project verdict = not available (one unused exception)

Verdict: every tenant-facing aggregation groups by tenant, date, state, type, or product —
never by project — with exactly one exception (`by_camp`) that the dashboard panel ignores.

Tenant-only examples (all `WHERE tenant_id = ?`, no project split):

```sql
-- backend/src/api/reports.js:78-84 (revenue, GROUP BY date)
SELECT date(created_at) as date, SUM(total_amount) as total, COUNT(*) as count
FROM orders
WHERE tenant_id = ? AND created_at >= ? AND date(created_at) <= ? AND order_state_id != 'cancelled'
GROUP BY date(created_at)
ORDER BY date ASC
```

```sql
-- backend/src/api/reports.js:278-282 (revenue-breakdown accommodation, single tenant row)
SELECT SUM(total_amount) as revenue, COUNT(*) as order_count
FROM orders WHERE tenant_id = ? AND created_at >= ? AND order_state_id != 'cancelled'
```

The same tenant-grain holds for bookings-by-state (`reports.js:123-129`, `GROUP BY osi.name`),
revenue by product type (`reports.js:261-267`, `GROUP BY p.type`), by payment method
(`reports.js:271-276`, `GROUP BY payment_method`), kitchen performance (`reports.js:192-216`,
`GROUP BY kitchen_status` / date), seasonal (`reports.js:349-368`, `GROUP BY month`),
top-products (`reports.js:161-174`, `GROUP BY p.id`), and customer metrics (`reports.js:306-328`).

The one per-project-shaped split is the bookings `by_camp` series
(`backend/src/api/reports.js:131-137`):

```sql
SELECT c.name as camp_name, COUNT(*) as count, SUM(o.total_amount) as revenue
FROM orders o
JOIN projects c ON c.id = o.camp_id
WHERE o.tenant_id = ? AND o.created_at >= ? AND date(o.created_at) <= ?
GROUP BY c.id
```

But `ReportsPanel` accepts `campIds`/`camps` props and never uses them for report queries
(`app/src/components/admin/ReportsPanel.tsx:22,32-34` — `useOccupancyReportQuery()`,
`useRevenueReportQuery(dateParams)`, `useBookingsReportQuery(dateParams)` take no camp
parameter), and its bookings memo renders `byState` only (`ReportsPanel.tsx:76-86`), dropping
`by_camp`. So per-project revenue is computed by exactly one endpoint and displayed nowhere.
Panels that DO split per camp today do it client-side (`DashboardPanel.tsx:42-43`,
`RoomsPanel.tsx:133-134` filter fetched tenant rows by `campIds`), which is display filtering,
not scoped querying. Super-admin templates aggregate per tenant as well
(`backend/src/api/admin-reports.js:96-105`, `GROUP BY t.id, t.name`), except the cross-tenant
occupancy template which already groups per project (`admin-reports.js:120-131`,
`GROUP BY p.tenant_id, t.name, p.name`) — the only per-project aggregation in the codebase,
and it is super-admin-only. Against Section 5 bullet 8: a separate P&L per project cannot be
produced from current tenant-facing reports.

---

## 7. Five Hardest Questions

1. If the camp and the restaurant are two projects with separate P&L, which dimension carries
   the split on the POS side — given `pos_stores` is resolved from the org, never from the camp
   (`SELECT id FROM pos_stores WHERE organization_id = ? LIMIT 1`,
   `backend/src/routes/pos/index.js:623-629`, Section 4 §4a), and `pos_organizations`, `pos_stores`,
   `pos_users`, `pos_transactions` carry no `camp_id`/`project_id` at all?
2. Which table is the restaurant project's menu — `meals`, read per tenant with no camp predicate
   (`WHERE m.tenant_id = ?`, `backend/src/api/meals.js:43-52`, Section 4 §4b), or `pos_products`,
   browsed per organization plus the camp's own `meal_plan_category_id`
   (`WHERE category_id = ? AND organization_id = ?`, `backend/src/api/meal-plans.js:39-43`,
   category from `SELECT tenant_id, meal_plan_category_id FROM projects WHERE id = ?`,
   `meal-plans.js:21-23`, Section 4 §4b) — and what happens to the landing-page menu duality when the
   two catalogues disagree?
3. A guest books a room and charges dinner to the same bill: is that one order or two — given
   camp bookings live in `orders` (`POST /api/orders`, `backend/src/api/orders.js:681-857`)
   and restaurant sales live in `pos_transactions` (`POST /api/pos/orders`,
   `backend/src/routes/pos/index.js:320-836`), and the only cross-touch is the meal-plan bridge
   writing one row into each (`INSERT INTO pos_transactions ... VALUES (?, ?, ?, 1, ?, ?, ...)`
   with `cashier_id = 'system'`, `store_id = 1`, `backend/src/api/orders.js:814-828`, Section 4 §4d)?
4. What is the stock granularity for per-project isolation — given stock is one integer per
   `pos_products` row shared by all stores of the org (the deduction `WHERE` holds
   `id + tenant_id + stock_quantity >= ?` with no `store_id`,
   `backend/src/routes/pos/index.js:646-648`, Section 4 §4c), and the per-store tables `pos_inventory`
   / `pos_stock_movements` were dropped (`backend/migrations/0056_drop_dead_tables.sql:53-54`)?
5. What defines a project's P&L when POS revenue has no camp column — given revenue groups by
   date (`GROUP BY date(created_at)`, `backend/src/api/reports.js:78-84`), the accommodation
   aggregate is a single tenant row (`backend/src/api/reports.js:278-282`), the only per-project
   split (`by_camp`, `GROUP BY c.id`, `reports.js:131-137`) is dropped by the panel that fetches
   it (`ReportsPanel.tsx:76-86` renders `byState` only), and the sole per-project aggregation in
   the codebase is super-admin-only (`GROUP BY p.tenant_id, t.name, p.name`,
   `backend/src/api/admin-reports.js:120-131`)?
