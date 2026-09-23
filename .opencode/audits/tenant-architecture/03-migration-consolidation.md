# Tenant Architecture — 03: Migration Inventory & Consolidation Proposal

- Date: 2026-09-23.
- Scope: docs and inventory only. No migration file was edited, no D1 writes, no code changes.
- Method: filesystem census (`ls backend/migrations/*.sql` = **109 files**: `0001`–`0108` + `0110`; `0109` intentionally skipped/reserved) + per-file statement-class scan + `wrangler d1 migrations list` on staging-remote and local.
- Parent docs: `01-current-state.md`, `02-proposed-design.md` (same folder).
- Invariant honored: **applied migrations are frozen** — never edited or merged in place (D1 `d1_migrations` ledger).

## §1. Applied-state ground truth (Part 2)

- Staging remote (`campmaster-db-staging --remote --env staging`): **only pending = `0110_create_payment_records.sql`**. Everything `0001`–`0108` is applied → **FROZEN**.
- Local (`campmaster-db --local`): identical — only `0110` pending.
- Pending (never applied anywhere, mergeable in principle): **`0110` only** (untracked file, pure `CREATE TABLE payment_records` + 2 indexes, zero data statements).
- Numbering note: `0109` does not exist on disk. Per the `0110` header it is RESERVED-but-absent (destructive camp-column drops slot) and must not be consumed by other work. A missing slot is harmless — D1 applies in lexicographic order. Do not backfill the number with unrelated work.

## §2. Full inventory (Part 1)

Class legend: **A** = additive DDL only (ADD COLUMN nullable / CREATE TABLE / CREATE INDEX, no data) · **D** = data change (INSERT/UPDATE/DELETE) · **C** = constraint/rebuild change (NOT NULL / FK / UNIQUE / table rebuild / DROP). State: **F** = frozen (applied staging+local) · **P** = pending.

| File | Purpose | Lines | Class | Tables touched (short) | State |
|---|---|---|---|---|---|
| 0001_init.sql | Init multi-tenant schema | 250 | A | tenants, camps, rooms, room_types, reservations, users, staff, ~18 tables | F |
| 0002_seed.sql | Seed sample tenants/camps/rooms/staff | 110 | D | same as 0001 (seed rows) | F |
| 0003_add_tenant_branding.sql | Tenant branding columns | 7 | A | tenants | F |
| 0004_seed_tenants.sql | Seed tenants | 59 | D | tenants, camps, room_types | F |
| 0005_rich_branding.sql | Rich branding columns + seed update | 33 | D | tenants | F |
| 0006_room_type_images.sql | Room-type images + Acacia data fix | 46 | D | room_types, rooms, tenants | F |
| 0007_admin_passphrase.sql | Admin passphrase column + seeds | 7 | D | tenants | F |
| 0008_hacker_passphrase.sql | Hacker passphrase column + seeds | 7 | D | tenants | F |
| 0009_user_username.sql | Username column + backfill | 6 | D | users | F |
| 0010_pos_integration.sql | Full POS schema (orgs/stores/products/tx) | 715 | A | pos_* (~25 tables) + indexes/triggers | F |
| 0011_pos_schema_patches.sql | POS schema patches | 9 | A | pos_categories, pos_products | F |
| 0012_seed_pos_defaults.sql | Seed POS defaults | 8 | D | pos seeds | F |
| 0013_pos_inventory_logs.sql | Inventory logs + order status | 17 | A | pos_inventory_logs, pos_transactions | F |
| 0014_remove_cashier_foreign_key.sql | Remove cashier FK (rebuild) | 89 | C | pos_transactions, pos_customers | F |
| 0015_relink_transactions_foreign_key.sql | Relink tx FKs (rebuilds) | 67 | C | pos_payments, pos_transaction_items, loyalty/promotion usage | F |
| 0016_pos_staff_stats_and_name_fields.sql | Staff stats + name fields | 18 | A | pos_users, pos_customers, pos_staff_stats | F |
| 0017_create_pos_activity_logs.sql | Activity logs table | 10 | A | pos_activity_logs | F |
| 0018_pos_customers_visit_fields.sql | Customer visit fields | 3 | A | pos_customers | F |
| 0019_unify_users.sql | Unify users into pos_users | 51 | D/C | pos_users (INSERT copy, DROP users) | F |
| 0020_unify_inventory.sql | Unify inventory into pos_products | 97 | D/C | pos_products, pos_recipe_ingredients (DROP legacy) | F |
| 0021_room_types_to_pos_products.sql | room_types → pos_products + sync triggers | 74 | D/C | pos_products, product_camps, room_types (DROP) | F |
| 0022_product_camps_indexes.sql | product_camps indexes | 3 | A | product_camps (2 indexes) | F |
| 0023_merge_staff.sql | staff → pos_users | 34 | D/C | pos_users (DROP staff) | F |
| 0024_add_indexes.sql | Perf indexes batch 1 | 11 | A | 10 indexes (camps/orders/pos/rooms) | F |
| 0025_additional_indexes.sql | Perf indexes batch 2 | 26 | A | 8 indexes (activity/logs/tx/sessions) | F |
| 0026_add_menu_config.sql | tenants.menu_config JSON + backfill | 87 | D | tenants | F |
| 0027_update_passphrases.sql | Rotate passphrases | 6 | D | tenants | F |
| 0028_create_new_tables.sql | Booking-only schema (admins/orders/meals/i18n) | 338 | A | admins, categories, meals, orders, rooms_new, rate_plans_new, plans_new + ~30 indexes | F |
| 0029_seed_data.sql | Seed new-schema data | 51 | D | new-schema seeds | F |
| 0030_add_tenant_currency.sql | tenants.currency | 2 | A | tenants | F |
| 0031_add_categories_tenant_id.sql | categories.tenant_id + backfill + index | 11 | D | categories | F |
| 0032_create_leads.sql | leads columns | 21 | A | leads | F |
| 0033_fix_leads_indexes.sql | leads indexes (fix after failed 0032) | 9 | A | leads (3 indexes) | F |
| 0034_rename_tenant_ids.sql | Rename tenant_1/2 → slugs (mass UPDATE) | 173 | D | ~30 tables (tenant_id rewrite) | F |
| 0035_shifts_and_schedules.sql | pos_shifts + meal_schedules | 37 | A | pos_shifts, meal_schedules + 4 indexes | F |
| 0036_split_payments_fields.sql | Split-payment fields | 5 | A | pos_transactions | F |
| 0037_fix_meal_schedule_fk.sql | meal_schedules FK → meals (rebuild) | 28 | C | meal_schedules | F |
| 0038_add_audit_indexes.sql | Audit-identified indexes | 80 | A | orders, meal_schedules, pos_products + 7 indexes | F |
| 0039_fix_p0_schema.sql | P0 schema fixes (rebuilds) | 113 | C | pos_activity/inventory/staff_stats (_new rebuilds) | F |
| 0040_add_tenant_id_pos.sql | tenant_id on POS tables (rebuilds) | 204 | D/C | pos_customers/activity/inventory/staff_stats + backfill | F |
| 0041_create_tenant_org_mapping.sql | tenant ↔ org mapping + seed | 40 | D | tenant_org_mapping | F |
| 0042_cleanup_pos_products.sql | Drop redundant pos_products cols (rebuild) | 139 | C | pos_products | F |
| 0043_seed_e2e_pos_user.sql | Seed E2E POS user | 18 | D | pos_users (test seed) | F |
| 0044_add_tenant_id_to_rooms_plans.sql | tenant_id on rooms/plans + backfill | 24 | D | rooms_new, plans_new (renamed rate_plans_new lineage) | F |
| 0045_drop_dead_tables.sql | Drop dead tables batch 1 | 19 | C | 9 DROPs | F |
| 0046_repair_pos_transaction_items_fk.sql | Repair tx-items FK (rebuild) | 50 | C | pos_transaction_items | F |
| 0047_repair_pos_child_fks.sql | Repair 6 POS child FKs (rebuilds) | 284 | C | pos_inventory/variants/recipes/movements/adjustments/logs | F |
| 0048_price_overrides.sql | price_overrides table | 28 | A | price_overrides | F |
| 0049_inbox.sql | inbox_reads + leads columns | 35 | A | inbox_reads, leads | F |
| 0050_add_pos_idempotency.sql | Tx idempotency UNIQUE | 4 | A | pos_transactions | F |
| 0051_remove_seed_data.sql | Delete all seed/mock data | 64 | D | 12 tables (DELETEs) | F |
| 0052_add_tenants_type.sql | tenants.type (marketplace listing) | 11 | A | tenants | F |
| 0053_camp_ownership.sql | One-camp-per-tenant UNIQUE + backfill | 57 | D | camps, pos_products | F |
| 0054_fix_room_rate_plan_fk_to_pos_products.sql | rooms/plans FK → pos_products (rebuilds) | 85 | C | rooms_new, rate_plans_new | F |
| 0055_trigger_hygiene.sql | Drop 3 dead triggers | 21 | C | triggers only | F |
| 0056_drop_dead_tables.sql | Drop Tier-A dead tables (30 DROPs) | 80 | C | 30 dead tables | F |
| 0057_quasi_dead_cleanup.sql | Quasi-dead cleanup + 3 indexes | 39 | C/A | DROPs + customers/tx-items indexes | F |
| 0058_add_meta_tables.sql | audit_log/project_meta/tenant_meta/tags | 89 | A | 5 new tables + indexes | F |
| 0059_add_tenant_columns.sql | Unified-schema tenants cols + trigger | 41 | D | tenants | F |
| 0060_add_camp_columns.sql | Unified-schema camps cols + trigger | 47 | A | camps | F |
| 0061_backfill_slugs_coords.sql | Backfill slugs/coords | 105 | D | camps | F |
| 0062_move_custom_fields_to_meta.sql | Custom fields → project_meta | 39 | D | project_meta | F |
| 0063_rename_camps_to_projects.sql | camps → projects (copy + drops) | 138 | D/C | projects, project_meta/tags (_new rebuilds; DROP camps) | F |
| 0064_drop_old_columns.sql | Drop post-rename old columns | 27 | C | projects | F |
| 0065_add_indexes.sql | Phase-7 index batch | 48 | A | 14 indexes (meta/projects/tenants) | F |
| 0066_fix_camps_fk_references.sql | Fix FKs → dropped camps (4 rebuilds) | 251 | C | orders, plans_new, rooms_new, meal_schedules + triggers | F |
| 0067_add_room_status_lifecycle.sql | Room lifecycle + order add-ons | 53 | A | rooms_new, order_items, projects | F |
| 0068_fix_triggers_and_promotions.sql | Tenants trigger fix + promotions + inbox | 74 | A/D | tenants, promotions, inbox | F |
| 0069_restaurant_tables.sql | pos_tables, kitchen status, split groups | 78 | D/C | pos_tables, orders, order_items, pos_transactions | F |
| 0070_add_meal_plan_category.sql | projects.meal_plan_category + index | 4 | A | projects | F |
| 0071_add_order_discounts.sql | order_discounts ledger | 23 | A | order_discounts | F |
| 0072_dynamic_services.sql | Service module (3 tables) | 55 | A | service_definitions/items/bookings | F |
| 0073_self_service_onboarding.sql | Onboarding token cols + index | 11 | A | tenants | F |
| 0074_add_performance_indexes.sql | Perf index mega-batch (~70) | 114 | A | ~70 indexes, all domains | F |
| 0075_business_enhancements.sql | Marketplace/reviews/subs/availability | 252 | A/D | 8 new tables + ALTERs + 2 seed INSERTs | F |
| 0076_sanitize_user_data.sql | XSS sanitize user fields | 92 | D | 10 tables (UPDATEs) | F |
| 0077_add_deferred_indexes.sql | 2 deferred indexes | 8 | A | rooms, service_bookings | F |
| 0078_financial_management.sql | Financials pillar (8 tables) | 132 | A | journals/entries/lines/invoices/payments/tax/fx | F |
| 0079_hr_payroll.sql | HR/payroll pillar (8 tables) | 123 | A | employees/leave/payroll/applicants/jobs | F |
| 0080_supply_chain.sql | Supply-chain pillar (8 tables) | 104 | A | warehouses/stock/POs/BOMs/manufacturing | F |
| 0081_crm_projects.sql | CRM pillar (9 tables) | 115 | A | contacts/crm_leads/opportunities/tickets/tasks/time/knowledge | F |
| 0082_ecommerce_cms.sql | Ecommerce/CMS (carts/pages/blog) | 69 | A | carts, cart_items, pages, blog_* | F |
| 0083_ai_intelligence.sql | AI pillar (4 tables) | 55 | A | predictions/price_rules/automation_* | F |
| 0084_platform_settings_subscriptions.sql | Platform settings + sub seed + ALTERs | 45 | D | platform_settings, tenant_subscriptions | F |
| 0085_project_links.sql | project_links + 3 indexes | 25 | A | project_links | F |
| 0086_project_items.sql | project_items + 2 indexes | 26 | A | project_items | F |
| 0087_order_payment_paymob.sql | Paymob fields on orders | 8 | A | orders | F |
| 0088_platform_settings_payment.sql | Payment cols on platform_settings | 29 | A | platform_settings | F |
| 0089_marketplace_payments_ledger.sql | marketplace_payments ledger | 35 | A | marketplace_payments | F |
| 0090_marketplace_payouts.sql | marketplace_payouts + ALTER ledger | 39 | A | marketplace_payouts, marketplace_payments | F |
| 0091_rate_plans_camp_id.sql | rate_plans camp_id bind (rebuild) | 54 | C | rate_plans_new | F |
| 0092_kitchen_status_canceled.sql | 'canceled' kitchen_status (2 rebuilds) | 201 | C | orders, pos_transactions | F |
| 0093_pos_customers_name_restore.sql | Restore name GENERATED col (rebuild) | 78 | C | pos_customers | F |
| 0094_index_gaps.sql | 2 verified index gaps | 14 | A | leave_balances, pos_stores | F |
| 0095_drop_tenant_usage.sql | DROP tenant_usage | 5 | C | tenant_usage | F |
| 0096_storefront_orders.sql | storefront_orders + items | 36 | A | storefront_orders, storefront_order_items | F |
| 0097_feedback.sql | feedback table | 32 | A | feedback | F |
| 0098_storefront_paymob.sql | Storefront Paymob cols | 8 | A | storefront_orders | F |
| 0099_normalize_marketplace_payouts_ids.sql | payouts ids TEXT (rebuild) | 72 | C | marketplace_payouts | F |
| 0100_add_project_id_nullable.sql | Phase-0: nullable project_id × 14 tables | 145 | A | 14 core tables (orders/items/pos_*/meals/rooms/plans/promotions/inv_adj/storefront) | F |
| 0101_add_pos_stores_project_id.sql | Phase-0: pos_stores.project_id nullable | 33 | A | pos_stores | F |
| 0102_add_order_items_project_id_nullable.sql | Phase-0: order_items.project_id nullable | 32 | A | order_items | F |
| 0103_add_carts_project_id.sql | Phase-0: carts.project_id (+ cart_items note) | 34 | A | carts | F |
| 0104_provision_default_projects.sql | Provision 1 default project/tenant | 66 | D | projects (INSERT…SELECT idempotent) | F |
| 0105_backfill_order_items_project_id.sql | Phase-1: backfill project_id × 15 UPDATEs | 217 | D | 15 tables (WHERE project_id IS NULL) | F |
| 0106_enforce_not_null_order_items.sql | NOT NULL order_items.project_id (rebuild) | 87 | C | order_items | F |
| 0107_enforce_not_null_other_tables.sql | NOT NULL × 10 tables + guards/indexes | 595 | C/D | 10 ENFORCE rebuilds + stay-nullable filtered indexes + guard cleanup | F |
| 0108_add_meals_project_id.sql | Phase-2 meals guard (assert-only) + top-up idx | 75 | A | meals, meal_categories, meal_schedules (guard; no schema change) | F |
| 0110_create_payment_records.sql | P35: payment_records ledger + 2 indexes | 62 | A | payment_records | P |

Total SQL lines on disk: ~8,058 (migrations) + headers. File count: **109**.

## §3. Merge candidates (rule application)

MERGE requires ALL of: same phase · additive-DDL only · no data change · no ordering dep · single rollback anyway. KEEP-SEPARATE on ANY of: data change · constraint-after-data dep · different phase · different feature · rollback granularity matters.

| Group | Migrations | Verdict | Merged filename (hypothetical) | Reason |
|---|---|---|---|---|
| 1 | 0100, 0101, 0102, 0103 | MERGEABLE **but FROZEN** | `0100_add_project_id_nullable.sql` | Same Phase-0, all nullable ADD COLUMN + lookup index, zero data, no ordering dep, one rollback anyway — the textbook merge. Applied to staging+local → **cannot merge in place**. |
| 2 | 0085, 0086 | MERGEABLE **but FROZEN** | `0085_project_scoping.sql` | Adjacent, same project-scoping feature, pure CREATE TABLE + indexes, no data. Applied → cannot merge in place. |
| 3 | 0089, 0090 | MERGEABLE **but FROZEN** | `0089_marketplace_payments.sql` | Same marketplace-payments feature, ledger then payouts (+1 ALTER). Applied → cannot merge in place. |
| 4 | 0007, 0008 | KEEP | — | Same-era tenants columns BUT both carry UPDATE seed backfills → data-change rule fires. |
| 5 | 0024, 0025 (+0074, 0077, 0094) | KEEP | — | All pure CREATE INDEX, but weeks apart / different audit phases → different-phase rule fires. |
| 6 | 0032, 0033 | KEEP | — | 0033 exists only because 0032 failed → ordering-dependency rule fires. |
| 7 | 0014, 0015 / 0046, 0047 / 0066 / 0091, 0092, 0093, 0099 | KEEP | — | Destructive table rebuilds with data copy; rollback granularity matters per table. |
| 8 | 0055, 0056, 0057 | KEEP | — | DROP TRIGGER / 30× DROP TABLE batches; destructive, rollback granularity matters. |
| 9 | 0058, 0059, 0060 | KEEP | — | Different phases (P1/P2/P3) + UPDATE/trigger data changes. |
| 10 | 0063, 0064 | KEEP | — | Rename-then-drop-old-columns ordering dependency. |
| 11 | 0104, 0105 | KEEP | — | Pure data changes (provision INSERT, 15× backfill UPDATE). |
| 12 | 0106, 0107 | KEEP | — | Constraint changes depending on the 0105 backfill (constraint-after-data rule). |
| 13 | 0096, 0097, 0098 | KEEP | — | Different feature areas (orders vs feedback vs Paymob). |
| 14 | 0078–0084 pillars | KEEP | — | One feature pillar each by design; independent rollback per pillar. |
| — | 0110 (pending, solo) | NO ACTION | — | Pure additive DDL but nothing else pending to merge with; ships standalone as-is. |

## §4. Final count

- **Before: 109 files** (`0001`–`0108` + `0110`; `0109` reserved-absent).
- **After (actionable now): 109 files. Merged away: 0.**
- **Theoretical (if history were rewritable, which it is not): 104 files** — Group 1 (4→1, −3) + Group 2 (2→1, −1) + Group 3 (2→1, −1). Documented for the record only.
- **Actionable merges (pending-only, in-place): 0.** The only pending file is `0110`, with no pending siblings.
- **Frozen merge candidates (already applied): 3 groups / 8 files** (Groups 1–3). Merging them would require a "consolidation migration" that is a functional no-op (the DDL already ran; the ledger already recorded each name). It would add a file, not remove history — net file count goes UP, runtime behavior unchanged. Not worth it.

## §5. Consolidation-migration vs in-place

- **Requires a new consolidation migration (0111+) because originals are applied: Groups 1–3.** Recommendation: **do not write one**. A consolidation migration cannot erase ledger entries `0100`–`0103` (or `0085/0086`, `0089/0090`); it can only add new no-op statements. Cost (review, staging verify, ledger noise) exceeds benefit (zero). The correct vehicle for history shrinkage is §6 bullet 2, not a no-op migration.
- **Can be done in place (pending only): nothing.** `0110` is the sole pending file; there is no pending cluster to consolidate. Ship it unchanged.

## §6. Recommended actions

| # | Action | Disposition |
|---|---|---|
| 1 | Groups 1–3 (0100–0103, 0085–0086, 0089–0090) | **SKIP** — frozen; no-op consolidation migration adds cost, not value. |
| 2 | History shrinkage (the actual over-split remedy) | **DEFER TO NEXT RELEASE** — at the next major release, squash `0001`–`0099` into a single `0001_baseline.sql` (generated from a pristine-apply dump + `d1_migrations` re-baseline on staging/prod together). That is the only mechanism that truly reduces file count without breaking the ledger invariant. Explicitly out of scope for this audit. |
| 3 | `0110_create_payment_records.sql` | **DO IT NOW** (unchanged) — ship as the next migration; no merge partners exist. |
| 4 | `0109` slot | **SKIP** (keep reserved) — do not consume for unrelated work; the destructive camp-column drops own that number when scheduled. |
| 5 | Going forward: one migration per phase-step, not per table | **DO IT NOW** (process rule) — the 0100–0103 split (one file per table) is the pattern to stop repeating. Future additive column rollouts across N tables ship as ONE file with N statements, with the 5 MERGE conditions (§3) as the pre-commit checklist. Data (provision/backfill) and constraint (NOT NULL) steps stay separate files, exactly as 0104/0105/0106–0107 already do. |

## §7. Answer to the owner's suspicion

The list is over-split in exactly **3 places** (8 files: Groups 1–3), and all 3 are already applied, so no file can be removed today. The Phase 0/1/2 workstream itself (0100–0108) is split **correctly**: additive schema (0100–0103) → provision (0104) → backfill (0105) → enforce (0106–0107) → guard (0108) is the data-before-constraint ordering the KEEP-SEPARATE rules demand — collapsing any of those steps would have risked enforcing NOT NULL over un-backfilled NULLs. Verdict: **nothing to merge now; fix the process (§6.5), schedule the baseline squash (§6.2), ship 0110.**
