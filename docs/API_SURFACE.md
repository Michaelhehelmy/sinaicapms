---
title: "SinaiCamps Business API Surface"
aliases:
tags:
  - type/reference
  - audience/developer
  - domain/api
  - status/live
created: 2026-08-31
updated: 2026-10-06
relates-to:
  - "[[API_SURFACE_MAP]]"
  - "[[API_CONTRACT]]"
  - "[[02-api/README]]"
  - "[[README]]"
code-references:
  - "backend/src/routes/registry.js"
  - "backend/src/index.js"
  - "backend/openapi.json"
  - "app/src/lib/api.ts"
  - "app/src/hooks/useQueryHooks.ts"
  - "backend/src/api/storefront.js"
  - "backend/src/api/crm.js"
  - "backend/migrations/0006_crm.sql"
  - "backend/migrations/legacy/0028_create_new_tables.sql:77"
  - "backend/migrations/legacy/0063_rename_camps_to_projects.sql"
  - "docs/02-api/API_SURFACE_MAP.md"
  - "docs/02-api/API_CONTRACT.md"
verified: never
---
# SinaiCamps Business API Surface

Complete mapping of all business-domain API endpoints, frontend functions, backend handlers, database tables, and React Query hooks.

> Registry scope: `backend/src/routes/registry.js` is the 88-path / 128-method OpenAPI *definition* subset (definition layer only — runtime dispatch is unchanged); this document covers the full runtime surface. Re-verified against the runtime routers (`backend/src/api/*`, mounts in `backend/src/index.js`), `app/src/lib/api.ts`, and `app/src/hooks/useQueryHooks.ts`. A `—` cell means the route is runtime-real but no client wrapper/hook was found — never invented.
>
> **The per-domain index below is a HAND-MAINTAINED roll-up and it has drifted from its own source.** `[[API_SURFACE_MAP]]` holds **311 endpoint rows over 214 distinct paths** (measured 2026-10-06); this table's Endpoints column **sums to 284** while its own Total row claimed "~278", and it is **short in 9 of 39 domains** — Meals 6→11, Services 17→21, Financial 14→17, HR 12→15, Supply Chain 14→15, CRM 14→17, Super Admin — Pillars 20→30, Upload & Media 2→3, Tenant Billing 1→2. The DB Tables column names **13 tables that do not exist** (marked inline below). **The map is the authority; re-derive from it rather than from this summary.**
---

The full per-domain mapping tables — endpoint → `app/src/lib/api.ts` function → backend handler
→ database tables → React Query hook — now live in **`API_SURFACE_MAP.md`**, split out of this
file on 2026-10-06 so that both documents stay under the 500-line threshold. Nothing was dropped:
every table below the old "## Camps / Projects" heading is in the map file, unchanged.

## Per-domain index — Summary Statistics

| Domain | Endpoints | Frontend Functions | DB Tables |
|--------|-----------|-------------------|-----------|
| Camps/Projects | 5 | 5 | 2 (`projects`, `product_camps`) |
| Products | 6 | 6 | 2 (`products`, `categories`) — `product_lang` **exists only in the excluded `legacy/` folder** |
| Rooms | 7 | 4 | 1 (`rooms_new`) |
| Rate Plans | 5 | 5 | 1 (`rate_plans_new`) |
| Orders | 14 | 13 | 5 (`orders`, `customers`, `order_state`, `order_items`, `payment_records`) — `order_meal_plans` **does not exist in any SQL verb in either lineage** (`git log -S 'order_meal_plans' -- backend/` → 0 commits) |
| Meals | 6 | 6 | 3 (`meals`, `meal_lang`, `meal_categories`) |
| Meal Categories | 5 | 5 | 2 (`meal_categories`, `meal_categories_lang`) |
| Meal Schedules | 5 | 5 | 1 (`meal_schedules`) |
| Promotions | 5 | 5 | 1 (`promotions`) |
| Services | 17 | 17 | 5 (`service_definitions`, `service_items`, `service_bookings`, `service_reviews`, `service_availability`) |
| Inbox | 3 | 3 | 4 (`leads`, `orders`, `inbox_reads`, `inbox`) |
| Tags | 7 | 7 | 2 (`tags`, `project_tags`) |
| Meta | 4 | 4 | 2 (`tenant_meta`, `project_meta`) |
| Categories | 5 | 5 | 2 (`categories`, `category_lang`) |
| Reports | 10 | 7 | 5 (`orders`, `rooms_new`, `order_items`, `pos_transactions`, `pos_products`) |
| Inventory | 3 | 3 | 2 (`inventory_adjustments`, `pos_products`) |
| Marketplace | 5 | 5 | 3 (`marketplace_reviews`, `marketplace_categories`, `marketplace_project_categories`) |
| Planning | 5 | 5 | 1 (`plans_new`) |
| Financial | 14 | 14 | 8 (`accounts`, `journals`, `journal_entries`, `entry_lines`, `invoices`, `invoice_lines`, `payments`, `tax_rates`) |
| HR | 12 | 12 | 7 (`employees`, `leave_types`, `leave_requests`, `payroll_runs`, `payroll_lines`, `job_posts`, `applicants`) |
| Supply Chain | 14 | 14 | 8 (`warehouses`, `stock_quant`, `stock_transfers`, `purchase_orders`, `purchase_order_lines`, `boms`, `bom_lines`, `manufacturing_orders`) |
| CRM | 14 | 14 | 2 (`crm_leads`, `crm_tasks`) — `crm_contacts`, `crm_opportunities`, `crm_tickets`, `crm_knowledge_articles` **do not exist** (0 commits in `backend/`). The `crm_*` family is not uniformly fictional: `crm_leads` and `crm_tasks` are real (`0006_crm.sql`) |
| Storefront | 20 | 20 | 2 (`blog_categories`, `pos_products`) — `storefront_pages`, `storefront_blog_posts`, `storefront_cart` **do not exist** (0 commits in `backend/`). The real storefront tables are `pages`, `blog_posts`, `blog_categories`, `carts`, `cart_items`, `storefront_orders`, `storefront_order_items` (`backend/migrations/0010_storefront.sql:9,23,40,49,58,69,84`), written by `backend/src/api/storefront.js` |
| AI | 20 | 20 | **0** — `ai_predictions`, `ai_price_rules`, `ai_automation_rules`, `ai_automation_logs` **all four do not exist** (`git log -S` over `backend/` returns 0 commits for each). The AI endpoints are D1-backed but not AI-table-backed; see `docs/05-operations/AUDIT_MASTER_FINDINGS.md` |
| Super Admin — Pillars | 20 | 20 | 6 (`invoices`, `employees`, `warehouses`, `pos_products`, `platform_settings`, `tenant_subscriptions`) — `crm_contacts` and `ai_predictions` **do not exist** |
| Super Admin — Users & Stats | 4 | 4 | 4 (`admins`, `tenants`, `projects`, `rooms_new`) |
| Auth | 9 | 8 | 3 (`admins`, `tenants`, `pos_users`) |
| Settings | 2 | 2 | 1 (`tenants`) |
| POS — Auth | 2 | — | 3 (`pos_users`, `pos_organizations`, `tenant_org_mapping`) |
| POS — Products/Orders/Dashboard | 5 | — | 6 (`pos_transactions`, `pos_transaction_items`, `pos_products`, `order_discounts`, `pos_tables`, `pos_organizations`) |
| POS — Shifts | 3 | — | 2 (`pos_shifts`, `pos_transactions`) |
| POS — Tables | 7 | — | 1 (`pos_tables`) |
| POS — Barcode | 1 | — | 1 (`pos_products`) |
| POS — User Mgmt | 5 | — | 2 (`pos_users`, `pos_stores`) |
| Upload & Media | 2 | — | 1 (R2 bucket) |
| Payments (retired) | 1 | — | 0 (mutates nothing) |
| Onboarding | 4 | — | 3 (`tenants`, `admins`, `pos_organizations`) |
| Leads | 4 | 4 | 1 (`leads`) |
| Price Overrides | 3 | — | 2 (`price_overrides`, `pos_products`) |
| Tenant Billing | 1 | 1 | 4 (`tenant_subscriptions`, `subscription_plans`, `orders`, `pos_users`) |
| **Total** | **284** (column sum; the map holds **311 rows / 214 paths**) | **243** (column sum) | **77 real** of the 90 names listed below — **13 do not exist** |

> **The old Total row read `~278 / ~220+ / ~65 unique tables` and every one of the
> three was wrong in a different direction**: `~278` did not match its own column
> (284), `~220+` did not match its own column (243), and `~65 unique tables`
> contradicted the map's 84 distinct names while the file itself names 90. So the
> Total row now carries **column sums and no headline total** — the columns are a
> hand-maintained roll-up whose source is `[[API_SURFACE_MAP]]`, which carries its
> own measured header. **Derive from the map, not from here.**
>
> Four more cells were pure **arithmetic** errors where every name listed IS real
> (Services said 4 and listed 5; Financial 7 beside 8; Supply Chain 7 beside 8;
> Marketplace 4 beside 3) — corrected by counting, and every one of those tables
> verified present in the applied lineage. **Count the names you list; a count
> beside a list that disagrees with it is the cheapest defect in the vault to find
> and the easiest to ship.**
>
> The 13 names above that exist nowhere in the applied lineage:
> `ai_automation_logs`, `ai_automation_rules`, `ai_predictions`, `ai_price_rules`,
> `crm_contacts`, `crm_knowledge_articles`, `crm_opportunities`, `crm_tickets`,
> `storefront_blog_posts`, `storefront_cart`, `storefront_pages`,
> `order_meal_plans` — plus `product_lang`, which exists **only** in the excluded
> `backend/migrations/legacy/` folder (`legacy/0028_create_new_tables.sql:77`) and
> was dropped there. **This is the same 15-table finding `[[API_SURFACE_MAP]]`
> already records; it simply had a second carrier in this summary, which batch 1
> did not touch.**
