---
title: "Analytics & Reports Guide"
aliases:
tags:
  - type/guide
  - audience/tenant-admin
  - domain/guides
  - domain/analytics
  - status/live
created: 2026-08-25
updated: 2026-10-06
relates-to:
  - "[[08-guides/README]]"
  - "[[02-api/API_SURFACE_MAP]]"
  - "[[03-frontend/COMPONENT_CATALOG]]"
code-references:
  - "backend/src/api/reports.js:29"
  - "backend/src/api/admin-reports.js:192"
  - "backend/src/index.js:315"
  - "app/src/components/admin/ReportsPanel.tsx"
  - "app/src/components/admin/AnalyticsPanel.tsx"
  - "backend/src/api/reports.js:61"
  - "backend/src/api/reports.js:106"
  - "backend/src/api/reports.js:274"
  - "backend/src/api/reports.js:348"
  - "backend/src/api/reports.js:471"
  - "backend/src/api/reports.js:537-539"
  - "backend/src/api/admin-reports.js:16-79"
  - "backend/src/api/admin-reports.js:249-278"
  - "backend/src/api/admin-reports.js:282-324"
  - "backend/src/routes/pos/index.js:24"
  - "backend/src/services/paymentConfig.js:41-44"
  - "app/src/components/admin/SuperReportsPanel.tsx"
  - "app/src/components/admin/SettingsPanel.tsx"
  - "backend/src/index.js:483-486"
verified: never
---
# Analytics & Reports Guide

This guide covers the analytics dashboard in SinaiCamps — metrics, revenue breakdown, customer insights, and data export.

---

## Two surfaces, not one

The "analytics dashboard" is actually **two admin panels**, and they read different
endpoints:

| Panel | Nav | Endpoints | What it can do |
|---|---|---|---|
| **Reports** | `reports` | `/api/reports/{occupancy,revenue,bookings,profit}` | four read-only tabs over the tenant's own ledger |
| **Analytics** | `analytics` | `/api/reports/{revenue-breakdown,customer-metrics,seasonal}` | date-window pickers (7/14/30/90 days, `AnalyticsPanel.tsx:19-22`) over the same tenant |

Template exports and schedules are a **third**, separate surface — and it is
super-admin only (see [Scheduled Reports](#scheduled-reports)).

---

## Dashboard Tabs Overview

The **Reports** panel (`app/src/components/admin/ReportsPanel.tsx:17-21`) has
exactly **four** tabs, and each maps to one `GET /api/reports/*` route:

| Tab | Endpoint |
|-----|----------|
| **occupancy** | `GET /api/reports/occupancy` (`reports.js:29`) |
| **revenue** | `GET /api/reports/revenue` (`reports.js:61`) |
| **bookings** | `GET /api/reports/bookings` (`reports.js:106`) |
| **profit** | `GET /api/reports/profit` (`reports.js:471`) — labelled *Profit by Project*; it is server-only by design, `ReportsPanel.tsx:24,62-63` records that a client `useOrdersQuery` leg was removed because it double-counted |

`/api/reports/revenue-breakdown`, `/customer-metrics` and `/seasonal` have **no
Reports tab** — they are the **Analytics** panel's endpoints.

---

## Revenue Breakdown

Everything here comes from one endpoint: `GET /api/reports/revenue-breakdown`
(`backend/src/api/reports.js:274`). It accepts `?days=` (default **30**) and
returns exactly **three** keys (`reports.js:337-342`).

### By Product Type — `by_product_type`

`reports.js:287-303` groups POS + storefront line revenue by **`pos_products.type`**,
unioning `pos_transaction_items` and `storefront_order_items` (disjoint status
vocabularies, so no double count). `type` is the **product** enum —
`room | menu | buffet | retail` (`backend/src/api/camps.js:96`) — not a
channel and not a pillar:

| Bucket | What it is |
|---|---|
| **room** | Room/bed-type product sales through the POS or the shop |
| **menu** | Menu-item sales |
| **buffet** | Buffet sales |
| **retail** | Retail / shop sales |

Each row is `{ type, revenue, order_count }`. **There is no percentage column
and no trend line** — compute the share yourself from `revenue`.

Room *stays* are **not** in this key. `accommodation` (`reports.js:328-334`) is a
separate booking-channel total over `orders` headers, and the code comment at
`:324-327` records that this split was audited and is deliberate: folding shop
lines into `accommodation` would mislabel product revenue as accommodation while
keeping the wire key. It returns `{ revenue, order_count }`.

### By Payment Method — `by_payment_method`

`reports.js:311-323` groups over `pos_transactions.payment_method` **plus a
synthetic `storefront` bucket**. The POS method vocabulary is
`cash | card | split | folio` (`backend/src/routes/pos/index.js:24`, defaulting
to `cash` at `:673`); `storefront_orders` has no `payment_method` column, so the
shop leg projects the literal `'storefront'` (the Paymob/online channel) and
shop revenue is never silently dropped or mislabeled as a POS method.

So the buckets are: whatever POS method values exist, `unknown` for a NULL POS
method (`COALESCE(lines.method,'unknown')`), and `storefront`. **Do not render
this as a fixed Cash / Card / Split triad** — `folio` and `storefront` are real
buckets.

Each row is `{ method, revenue, count }` (here `count` is a row count, not a
distinct order count).

Online Paymob settlement is a separate switch: `paymentConfig.js:41-44` reads a
DB blob and falls back to `env.PM_ENABLED === 'true'`, and `PM_ENABLED` ships as
`"false"` in both `[vars]` and `[env.staging.vars]` (`backend/wrangler.toml:77`,
`:105`). With it off there is no online payment leg at all, so none of the
`storefront` bucket is populated by it.

### Time-Based Analysis

There is **no weekly or monthly grouping and no picker for one.**
`GET /api/reports/revenue` (`reports.js:61`) takes `?days=` (default 30) or
`?start=` + `?end=`, and always returns:

- `summary` — `{ total_revenue, total_collected, total_outstanding, total_orders }`
  over `orders` headers, cancelled excluded (`reports.js:78-86`)
- `details` — **daily** rows `{ date, total, count }`, `GROUP BY date(created_at)`
  (`reports.js:72-77`)

Weekly and monthly views live elsewhere: `/revenue-breakdown` is windowed by
`?days=`, `/seasonal` (`reports.js:418`) is monthly over the last 12 months, and
`/profit` (`reports.js:471`) takes `?start=`/`?end=`/`?days=` **plus `?projectId`**
for the per-project figure the Reports tab shows.

---

## Customer Metrics

`GET /api/reports/customer-metrics` (`backend/src/api/reports.js:348`) returns
exactly **six** keys — `days`, `total_customers`, `new_customers`,
`repeat_customers`, `avg_order_value`, `avg_collected` (`reports.js:404-411`).

| Metric | Description |
|--------|-------------|
| **Total Customers** | All registered guests |
| **New Customers** | First-time guests in the period |
| **Repeat Customers** | Returning guests (2+ visits) |
| **Average Order Value (AOV)** | Mean transaction amount — `avg_order_value` is cross-channel (bookings UNION shop); `avg_collected` is bookings-only by construction, because `storefront_orders` has no `amount_paid` |

## Planned — not yet implemented
These features are designed but not built. See [[unimplemented#advanced-analytics]] for status.

---

## Exporting Data

### Export Options

**There is no tenant-facing export at all.** `backend/src/api/reports.js` and
`backend/src/api/admin-reports.js` register **no** `/export` route, and the
tenant `ReportsPanel.tsx` contains no export control. If you are looking for
"Export" on a report tab, it is not shipped.

What exists is the super-admin template pipeline: `GET /api/admin/reports` (and
`/available`) list `REPORT_TEMPLATES`, `POST /api/admin/reports/generate` runs
one, and `GET /api/admin/reports/jobs/:id` returns the result. There is no UI
for a tenant admin to reach it — the client wrappers are consumed only by
`SuperReportsPanel.tsx`.

What a template may *claim* to emit is metadata, and it is not uniform:
`REPORT_TEMPLATES` (`admin-reports.js:16-79`) declares `formats: ['csv','pdf']`
on **5 of 7** templates (`revenue_by_tenant` `:24`, `tenant_performance` `:32`,
`occupancy_report` `:43`, `inventory_value` `:59`, `crm_pipeline` `:69`) and
`['csv']` only on `employee_headcount` (`:51`) and `system_health` (`:77`).

**No PDF is ever produced.** `pdf` appears nowhere in `backend/src` outside those
five declaration lines, and the job download handler (`admin-reports.js:249-278`)
branches on `job.format === 'csv'` → a real CSV attachment, **anything else** → a
JSON envelope. So a `format: 'pdf'` request returns JSON. The formats array is a
declaration the code does not yet honour; read it as intent, not as output.

### Scheduled Reports

**There is no UI path for this in the tenant panel.** "Settings → Reports" does
not exist: `SettingsPanel.tsx` contains no `Report` or `schedule` reference at
all. The endpoints are real and they are **super-admin only** —
`admin-reports.js:6` scopes the module to `roles: ['super_admin']` and `:190`
states it in prose — and the only consumer of the five client wrappers is
`SuperReportsPanel.tsx`.

What the API accepts, if you call it directly:

1. `POST /api/admin/reports/schedule` with `{ reportId, schedule, parameters?, recipients? }`
   (`admin-reports.js:282`). `schedule` is required and must be
   `daily|weekly|monthly`; `reportId` must name a live template.
2. `GET /api/admin/reports/scheduled` · `DELETE /api/admin/reports/scheduled/:id`
   (`:313`, `:320`) to list and remove schedules.

**A schedule never fires.** `scheduledReports` is a module-level `new Map()`
(`admin-reports.js:84`) with `lastRunAt: null` and no timer, no queue and no
sweep over it — and `reportJobs` (`:83`) is the same shape. Both are
**per-isolate, in-memory and lost on worker restart**. There is no email
delivery: `recipients` is stored and never read.

### API Access

For programmatic access to analytics data — all ten are tenant-scoped
(`reportsScope` + `tenantAwareLimiter`, `backend/src/index.js:483-486`) and all
ten are `GET`:

| Endpoint | Handler |
|---|---|
| `GET /api/reports/occupancy` | `reports.js:29` |
| `GET /api/reports/revenue` | `reports.js:61` |
| `GET /api/reports/bookings` | `reports.js:106` |
| `GET /api/reports/top-products` | `reports.js:162` |
| `GET /api/reports/kitchen-performance` | `reports.js:206` |
| `GET /api/reports/low-stock` | `reports.js:248` |
| `GET /api/reports/revenue-breakdown` | `reports.js:274` |
| `GET /api/reports/customer-metrics` | `reports.js:348` |
| `GET /api/reports/seasonal` | `reports.js:418` |
| `GET /api/reports/profit` | `reports.js:471` |

Any other path answers 404 with this exact list in the message
(`reports.js:537-539`) — that fallthrough is the fastest way to confirm you have the
right surface, and the list is the endpoint inventory. `/profit` is tenant-scoped
*and* per-project: it accepts `?projectId` and unions three legs
(`order_items`, `folio_charges`, `storefront_order_items`), excluding voided
folios (`reports.js:489-500`).
