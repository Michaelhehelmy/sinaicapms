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
  - "[[docs/02-api/README]]"
  - "[[docs/README]]"
code-references:
  - "backend/src/routes/registry.js"
  - "backend/src/index.js"
  - "app/src/lib/api.ts"
  - "app/src/hooks/useQueryHooks.ts"
verified: never
---
# SinaiCamps Business API Surface

Complete mapping of all business-domain API endpoints, frontend functions, backend handlers, database tables, and React Query hooks.

> Registry scope: `backend/src/routes/registry.js` is the 88-path OpenAPI *definition* subset (definition layer only — runtime dispatch is unchanged); this document covers the full runtime surface. Re-verified against the runtime routers (`backend/src/api/*`, mounts in `backend/src/index.js`), `app/src/lib/api.ts`, and `app/src/hooks/useQueryHooks.ts`. A `—` cell means the route is runtime-real but no client wrapper/hook was found — never invented.
---

The full per-domain mapping tables — endpoint → `app/src/lib/api.ts` function → backend handler
→ database tables → React Query hook — now live in **`API_SURFACE_MAP.md`**, split out of this
file on 2026-10-06 so that both documents stay under the 500-line threshold. Nothing was dropped:
every table below the old "## Camps / Projects" heading is in the map file, unchanged.

## Per-domain index — Summary Statistics

| Domain | Endpoints | Frontend Functions | DB Tables |
|--------|-----------|-------------------|-----------|
| Camps/Projects | 5 | 5 | 2 (`projects`, `product_camps`) |
| Products | 6 | 6 | 3 (`products`, `product_lang`, `categories`) |
| Rooms | 7 | 4 | 1 (`rooms_new`) |
| Rate Plans | 5 | 5 | 1 (`rate_plans_new`) |
| Orders | 14 | 13 | 6 (`orders`, `customers`, `order_state`, `order_items`, `order_meal_plans`, `payment_records`) |
| Meals | 6 | 6 | 3 (`meals`, `meal_lang`, `meal_categories`) |
| Meal Categories | 5 | 5 | 2 (`meal_categories`, `meal_categories_lang`) |
| Meal Schedules | 5 | 5 | 1 (`meal_schedules`) |
| Promotions | 5 | 5 | 1 (`promotions`) |
| Services | 17 | 17 | 4 (`service_definitions`, `service_items`, `service_bookings`, `service_reviews`, `service_availability`) |
| Inbox | 3 | 3 | 4 (`leads`, `orders`, `inbox_reads`, `inbox`) |
| Tags | 7 | 7 | 2 (`tags`, `project_tags`) |
| Meta | 4 | 4 | 2 (`tenant_meta`, `project_meta`) |
| Categories | 5 | 5 | 2 (`categories`, `category_lang`) |
| Reports | 10 | 7 | 5 (`orders`, `rooms_new`, `order_items`, `pos_transactions`, `pos_products`) |
| Inventory | 3 | 3 | 2 (`inventory_adjustments`, `pos_products`) |
| Marketplace | 5 | 5 | 4 (`marketplace_reviews`, `marketplace_categories`, `marketplace_project_categories`) |
| Planning | 5 | 5 | 1 (`plans_new`) |
| Financial | 14 | 14 | 7 (`accounts`, `journals`, `journal_entries`, `entry_lines`, `invoices`, `invoice_lines`, `payments`, `tax_rates`) |
| HR | 12 | 12 | 7 (`employees`, `leave_types`, `leave_requests`, `payroll_runs`, `payroll_lines`, `job_posts`, `applicants`) |
| Supply Chain | 14 | 14 | 7 (`warehouses`, `stock_quant`, `stock_transfers`, `purchase_orders`, `purchase_order_lines`, `boms`, `bom_lines`, `manufacturing_orders`) |
| CRM | 14 | 14 | 6 (`crm_contacts`, `crm_leads`, `crm_opportunities`, `crm_tasks`, `crm_tickets`, `crm_knowledge_articles`) |
| Storefront | 20 | 20 | 5 (`storefront_pages`, `storefront_blog_posts`, `blog_categories`, `pos_products`, `storefront_cart`) |
| AI | 20 | 20 | 4 (`ai_predictions`, `ai_price_rules`, `ai_automation_rules`, `ai_automation_logs`) |
| Super Admin — Pillars | 20 | 20 | 8 (`invoices`, `employees`, `warehouses`, `crm_contacts`, `pos_products`, `ai_predictions`, `platform_settings`, `tenant_subscriptions`) |
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
| **Total** | **~278** | **~220+** | **~65 unique tables** |
