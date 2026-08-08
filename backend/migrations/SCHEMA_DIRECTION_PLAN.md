# Schema Direction Plan — P1-8

**Date:** 2026-07-19
**Author:** @db agent
**Status:** Decision Required

---

## 1. Background

The schema has accumulated 39 migrations. Migration 0028 created a "simplified booking-only schema" alongside the existing tables, but never completed the migration by dropping the legacy ones. This has left the database with **9 duplicate table pairs** — many of which are dead weight with zero code references.

Additionally, the original POS schema (migration 0010) introduced ~30 tables, of which only **6 are actively queried** in backend code. The remaining ~24 are dead.

---

## 2. Current Table Inventory

### 2A. Legacy Tables (migration 0001) — Still Exist in DB

| Table | Backend Refs | Status | Replaced By |
|-------|-------------|--------|-------------|
| `camps` | 35 | **ACTIVELY USED** | — (keep) |
| `tenants` | 20 | **ACTIVELY USED** | — (keep) |
| `leads` | 5 | **ACTIVELY USED** | — (keep) |
| `room_types` | 1 (buggy DELETE) | **DEAD** | `products` (0028) |
| `rooms` | 0 | **DEAD** | `rooms_new` (0028) |
| `rate_plans` | 0 | **DEAD** | `rate_plans_new` (0028) |
| `reservations` | 0 | **DEAD** | `orders` (0028) |
| `plans` | 0 | **DEAD** | `plans_new` (0028) |
| `expenses` | 0 | **DEAD** | — |
| `financial_accounts` | 0 | **DEAD** | — |
| `financial_transactions` | 0 | **DEAD** | — |
| `revenue` | 0 | **DEAD** | — |

**Note:** `users`, `staff`, `inventory`, `meal_ingredients`, and `room_type_camps` were already dropped in earlier migrations (0019–0023).

### 2B. New Tables (migration 0028) — Actively Used

| Table | Backend Refs | Purpose |
|-------|-------------|---------|
| `admins` | 33 | Auth (replaces pos_users for admin) |
| `products` | 12 | Room types (replaces room_types) |
| `product_lang` | 4 | Multilingual product names |
| `product_camps_new` | 8 | Product↔Camp junction |
| `rooms_new` | 27 | Physical rooms (FK→products) |
| `rate_plans_new` | 10 | Seasonal pricing (FK→products) |
| `customers` | 11 | Guest CRM |
| `orders` | 34 | Reservations (replaces reservations) |
| `categories` | 9 | Product categories |
| `category_lang` | 5 | Multilingual category names |
| `meal_categories` | 18 | Menu categories |
| `meal_categories_lang` | 7 | Multilingual menu category names |
| `meals` | 12 | Menu items |
| `meal_lang` | 6 | Multilingual meal names |
| `plans_new` | 7 | Activity plans |
| `order_state` | 6 | Reservation statuses |
| `order_state_lang` | 3 | Multilingual status names |

### 2C. New Tables (migration 0028) — Dead / Unused

| Table | Backend Refs |
|-------|-------------|
| `order_return_state` | 0 |
| `order_return` | 0 |
| `order_return_detail` | 0 |
| `languages` | 0 (FK only) |

### 2D. POS Tables (migration 0010) — Actively Used (6 of ~30)

| Table | Backend Refs | Purpose |
|-------|-------------|---------|
| `pos_users` | 5 | POS auth (cashiers/staff) |
| `pos_products` | 6 | POS retail/menu products |
| `pos_transactions` | 7 | POS sales |
| `pos_transaction_items` | 2 | POS line items |
| `pos_shifts` | 5 | Cashier shifts (added 0035) |
| `pos_recipe_ingredients` | 1 | Recipe deps (added 0020) |

### 2E. POS Tables (migration 0010) — Dead / Unused (24 tables)

| Table | Backend Refs |
|-------|-------------|
| `pos_organizations` | 0 (FK only) |
| `pos_stores` | 0 (FK only) |
| `pos_user_sessions` | 0 |
| `pos_audit_logs` | 0 |
| `pos_categories` | 0 (replaced by `categories`) |
| `pos_brands` | 0 |
| `pos_suppliers` | 0 |
| `pos_product_variants` | 0 |
| `pos_inventory` | 0 |
| `pos_stock_movements` | 0 |
| `pos_stock_adjustments` | 0 |
| `pos_stock_adjustment_items` | 0 |
| `pos_customers` | 0 (replaced by `customers`) |
| `pos_customer_addresses` | 0 |
| `pos_loyalty_programs` | 0 |
| `pos_loyalty_transactions` | 0 |
| `pos_payments` | 0 |
| `pos_achievements` | 0 |
| `pos_user_achievements` | 0 |
| `pos_gamification_stats` | 0 |
| `pos_analytics_daily` | 0 |
| `pos_promotions` | 0 |
| `pos_promotion_usage` | 0 |
| `pos_inventory_logs` | 0 (recreated in 0039) |
| `pos_staff_stats` | 0 (recreated in 0039) |
| `pos_activity_logs` | 0 (recreated in 0039) |

### 2F. Other Active Tables

| Table | Backend Refs | Added In |
|-------|-------------|----------|
| `meal_schedules` | 4 | 0035 |
| `password_reset_tokens` | 6 | Inline (auth.js) |

---

## 3. Duplicate Table Pairs

| # | Legacy Table | New Table | Purpose | Winner |
|---|-------------|-----------|---------|--------|
| 1 | `room_types` (0001) | `products` (0028) | Room type definitions | `products` — 12 active refs, multilingual |
| 2 | `rooms` (0001) | `rooms_new` (0028) | Physical rooms | `rooms_new` — 27 active refs |
| 3 | `rate_plans` (0001) | `rate_plans_new` (0028) | Seasonal pricing | `rate_plans_new` — 10 active refs |
| 4 | `reservations` (0001) | `orders` (0028) | Booking records | `orders` — 34 active refs |
| 5 | `plans` (0001) | `plans_new` (0028) | Activity plans | `plans_new` — 7 active refs |
| 6 | `pos_users` (0010) | `admins` (0028) | Auth/users | Split: `admins` for admin panel, `pos_users` for POS terminal |
| 7 | `pos_customers` (0010) | `customers` (0028) | Guest CRM | `customers` — 11 active refs |
| 8 | `pos_products` (0010) | `products` (0028) | Product catalog | Split: `pos_products` for POS retail, `products` for room types |
| 9 | `pos_categories` (0010) | `categories` (0028) | Product categories | `categories` — 9 active refs |

---

## 4. Options Analysis

### Option A: Finish Migrating to 0028 Schema & Drop Legacy Tables

**Approach:** Drop all dead/legacy tables, keep only the actively-used new tables.

#### Tables to Drop

**Group 1 — Dead legacy from 0001 (zero code refs):**
- `room_types` — only 1 buggy DELETE in camps.js (must fix code first)
- `rooms` — zero refs
- `rate_plans` — zero refs
- `reservations` — zero refs
- `plans` — zero refs
- `expenses` — zero refs
- `financial_accounts` — zero refs
- `financial_transactions` — zero refs
- `revenue` — zero refs

**Group 2 — Dead POS from 0010 (zero code refs):**
- `pos_organizations`
- `pos_stores`
- `pos_user_sessions`
- `pos_audit_logs`
- `pos_categories`
- `pos_brands`
- `pos_suppliers`
- `pos_product_variants`
- `pos_inventory`
- `pos_stock_movements`
- `pos_stock_adjustments`
- `pos_stock_adjustment_items`
- `pos_customers`
- `pos_customer_addresses`
- `pos_loyalty_programs`
- `pos_loyalty_transactions`
- `pos_payments`
- `pos_achievements`
- `pos_user_achievements`
- `pos_gamification_stats`
- `pos_analytics_daily`
- `pos_promotions`
- `pos_promotion_usage`

**Group 3 — Dead from 0028 (zero code refs):**
- `order_return_state`
- `order_return`
- `order_return_detail`

**Group 4 — Dead from 0039 (zero code refs):**
- `pos_inventory_logs`
- `pos_staff_stats`
- `pos_activity_logs`

#### Tables to Keep

**Core (0001):** `camps`, `tenants`, `leads`
**Booking (0028):** `admins`, `products`, `product_lang`, `product_camps_new`, `rooms_new`, `rate_plans_new`, `customers`, `orders`, `categories`, `category_lang`, `order_state`, `order_state_lang`, `languages`
**Meals (0028):** `meal_categories`, `meal_categories_lang`, `meals`, `meal_lang`
**Plans (0028):** `plans_new`
**POS (0010+):** `pos_users`, `pos_products`, `pos_transactions`, `pos_transaction_items`, `pos_shifts`, `pos_recipe_ingredients`
**Utility:** `meal_schedules`, `password_reset_tokens`

#### Code Changes Required

1. **Fix `camps.js` line 160:** Remove buggy `DELETE FROM room_types` — this table will be dropped.
2. **Fix `orders.js` line 156:** Change `order_states` → `order_state` (table name mismatch bug).
3. **No other code changes needed** — all actively-used tables are already the 0028 versions.

#### Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| FK constraint errors when dropping tables | **LOW** | Dead tables have no inbound FKs from active tables |
| Data loss from dropping unused tables | **NEGLIGIBLE** | All dropped tables have zero code references |
| Breaking POS auth | **LOW** | `pos_users` is kept; it's separate from `admins` |
| SQLite `DROP TABLE` fails mid-migration | **LOW** | Wrap in individual statements; non-critical |

#### Estimated Effort

- **Migration SQL:** 1 migration file (~100 lines of DROP statements)
- **Code fixes:** 2 one-line fixes (camps.js, orders.js)
- **Testing:** Run full test suite
- **Total:** ~1 hour

---

### Option B: Keep Legacy Tables & Deprecate 0028 Tables

**Approach:** Keep the legacy 0001/0010 tables, rewrite all backend code to use them, and drop the 0028 tables.

#### Tables to Migrate Data Into (Legacy)

- `room_types` ← `products` (where type='room')
- `rooms` ← `rooms_new`
- `rate_plans` ← `rate_plans_new`
- `reservations` ← `orders`
- `plans` ← `plans_new`
- `pos_customers` ← `customers`
- `pos_categories` ← `categories`

#### Tables to Drop

- All 0028 tables (products, product_lang, rooms_new, rate_plans_new, orders, customers, admins, categories, etc.)
- `languages`, `order_state`, `order_state_lang`

#### Code Changes Required

1. **Rewrite 34 `orders` references** in backend code to use `reservations`
2. **Rewrite 27 `rooms_new` references** to use `rooms`
3. **Rewrite 12 `products` references** to use `room_types`
4. **Rewrite 33 `admins` references** to use `users` (or merge back)
5. **Rewrite 11 `customers` references** to use `pos_customers`
6. **Rewrite all multilingual queries** — legacy tables don't have `_lang` tables
7. **Recreate all `product_lang`, `category_lang`, `meal_lang` join logic** — legacy schema has no i18n

#### Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Massive code rewrite | **HIGH** | ~180+ query rewrites across 8+ files |
| Loss of multilingual support | **CRITICAL** | Legacy tables have no _lang tables |
| Loss of proper FK relationships | **HIGH** | Legacy schema has weaker constraints |
| Data migration errors | **MEDIUM** | New schema has more columns than legacy |

#### Estimated Effort

- **Data migration SQL:** 3-5 migration files
- **Code rewrites:** 180+ query changes across 8+ files
- **Frontend changes:** Potentially needed if response shapes change
- **Testing:** Full regression suite
- **Total:** ~2-3 days

---

## 5. Recommendation: Option A

**Option A is overwhelmingly recommended** for these reasons:

1. **The code already uses the new tables.** 150+ backend references point to 0028 tables. Only 1 reference points to a legacy table (and it's a bug).

2. **Multilingual support.** The 0028 schema includes `_lang` tables for i18n. Legacy tables have no such structure. Dropping 0028 would lose this capability entirely.

3. **35+ dead tables.** Over half the database consists of tables with zero code references. These waste storage, confuse developers, and slow down D1 queries.

4. **Option B would require rewriting ~180 queries** across 8+ files, vs. Option A requiring 2 one-line code fixes.

5. **The `room_types` bug in camps.js:160** (`DELETE FROM room_types WHERE room_id IN (SELECT id FROM rooms_new ...)`) is incorrect anyway — `room_types` has no `room_id` column. This is dead code that silently fails.

---

## 6. Recommended Migration Plan (Option A)

### Phase 1: Fix Code Bugs (prerequisite)
1. Fix `camps.js:160` — remove the dead `DELETE FROM room_types` statement
2. Fix `orders.js:156` — change `order_states` → `order_state`

### Phase 2: Drop Dead Legacy Tables (migration 0041)
Drop all tables with zero code references in safe batches:

**Batch 1 — Dead 0001 legacy (9 tables):**
```sql
DROP TABLE IF EXISTS room_types;
DROP TABLE IF EXISTS rooms;
DROP TABLE IF EXISTS rate_plans;
DROP TABLE IF EXISTS reservations;
DROP TABLE IF EXISTS plans;
DROP TABLE IF EXISTS expenses;
DROP TABLE IF EXISTS financial_accounts;
DROP TABLE IF EXISTS financial_transactions;
DROP TABLE IF EXISTS revenue;
```

**Batch 2 — Dead 0010 POS (24 tables):**
```sql
DROP TABLE IF EXISTS pos_organizations;
DROP TABLE IF EXISTS pos_stores;
DROP TABLE IF EXISTS pos_user_sessions;
DROP TABLE IF EXISTS pos_audit_logs;
DROP TABLE IF EXISTS pos_categories;
DROP TABLE IF EXISTS pos_brands;
DROP TABLE IF EXISTS pos_suppliers;
DROP TABLE IF EXISTS pos_product_variants;
DROP TABLE IF EXISTS pos_inventory;
DROP TABLE IF EXISTS pos_stock_movements;
DROP TABLE IF EXISTS pos_stock_adjustments;
DROP TABLE IF EXISTS pos_stock_adjustment_items;
DROP TABLE IF EXISTS pos_customers;
DROP TABLE IF EXISTS pos_customer_addresses;
DROP TABLE IF EXISTS pos_loyalty_programs;
DROP TABLE IF EXISTS pos_loyalty_transactions;
DROP TABLE IF EXISTS pos_payments;
DROP TABLE IF EXISTS pos_achievements;
DROP TABLE IF EXISTS pos_user_achievements;
DROP TABLE IF EXISTS pos_gamification_stats;
DROP TABLE IF EXISTS pos_analytics_daily;
DROP TABLE IF EXISTS pos_promotions;
DROP TABLE IF EXISTS pos_promotion_usage;
```

**Batch 3 — Dead 0028 + 0039 (6 tables):**
```sql
DROP TABLE IF EXISTS order_return_detail;
DROP TABLE IF EXISTS order_return;
DROP TABLE IF EXISTS order_return_state;
DROP TABLE IF EXISTS pos_inventory_logs;
DROP TABLE IF EXISTS pos_staff_stats;
DROP TABLE IF EXISTS pos_activity_logs;
```

**Total: 39 tables dropped.**

### Phase 3: Rename _new Tables (migration 0042)
Rename the `_new` suffix tables to their final names:

| Current Name | New Name |
|-------------|----------|
| `rooms_new` | `rooms` |
| `rate_plans_new` | `rate_plans` |
| `product_camps_new` | `product_camps` |
| `plans_new` | `plans` |

This requires: CREATE new → INSERT SELECT → DROP old → RENAME (SQLite D1 limitation).

### Phase 4: Add Missing tenant_id to POS Tables (migration 0040 — already planned)

---

## 7. Final Schema After Cleanup

```
Core:
  tenants, camps, leads

Booking (0028):
  admins, products, product_lang, product_camps, rooms, rate_plans,
  customers, orders, order_state, order_state_lang,
  categories, category_lang, languages

Meals (0028):
  meals, meal_lang, meal_categories, meal_categories_lang, meal_schedules

Plans (0028):
  plans

POS:
  pos_users, pos_products, pos_transactions, pos_transaction_items,
  pos_shifts, pos_recipe_ingredients

Utility:
  password_reset_tokens
```

**Total: ~25 active tables** (down from ~64).
