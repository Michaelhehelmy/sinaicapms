# T40 profit grain verification (2026-09-28)

Read-only. No source, migration, D1, KV, or deploy change in this commit.
Spec: `.opencode/agents/tmp/2026-09-27-t40pv.md`. Parent triage: `06-t40-triage.md`, design: `07-t40-design.md`, walkthrough: RUN T40 in `.opencode/audits/walkthrough/P5-STAGING-WALKTHROUGH.md`.

Baseline: `6637e69` (`test(staging): T40 fix walkthrough — PASS`) confirmed via `git rev-parse HEAD`.

## 1. Staging D1 reads (read-only, REMOTE)

DB: `campmaster-db-staging` (`40f944f2-2d50-42b5-91bd-e629585c428c`) via `npx wrangler d1 execute --remote`. Both report `rows_written: 0`.

Tenant: `tenant_a2d040ea-3b1` (subdomain `acaciacamp`, active).

### 1a. Header grain — `storefront_orders`

Command:

```sql
SELECT id, reference, tenant_id, total_amount, project_id, status, payment_status FROM storefront_orders WHERE tenant_id='tenant_a2d040ea-3b1' ORDER BY created_at DESC LIMIT 10;
```

Raw output (verbatim, trimmed to results):

```json
[
  {
    "id": "30d9da91-48d5-4b11-8c3e-aaa7bb7bd520",
    "reference": "ORD-6SJU3V",
    "tenant_id": "tenant_a2d040ea-3b1",
    "total_amount": 1550,
    "project_id": null,
    "status": "pending",
    "payment_status": "pending"
  },
  {
    "id": "2cb3872d-52b4-453e-90b0-033fade38e54",
    "reference": "ORD-6S4R6R",
    "tenant_id": "tenant_a2d040ea-3b1",
    "total_amount": 1550,
    "project_id": null,
    "status": "pending",
    "payment_status": "pending"
  }
]
```

Meta: `rows_read: 4, rows_written: 0`.

Fact: 2 header rows x 1550 = **3100**; `project_id` NULL on both (mixed orders per 5c).

### 1b. Line grain — `storefront_order_items` JOIN `storefront_orders` + `projects`

Command:

```sql
SELECT soi.order_id, so.reference, soi.product_name, soi.quantity, soi.unit_price, soi.total_price, soi.project_id, p.name AS project_name, p.project_type FROM storefront_order_items soi JOIN storefront_orders so ON so.id=soi.order_id LEFT JOIN projects p ON p.id=soi.project_id WHERE so.tenant_id='tenant_a2d040ea-3b1' ORDER BY so.reference, soi.total_price DESC;
```

Raw output (verbatim, trimmed to results):

```json
[
  { "order_id": "2cb3872d-52b4-453e-90b0-033fade38e54", "reference": "ORD-6S4R6R", "product_name": "Beach Tent", "quantity": 1, "unit_price": 1500, "total_price": 1500, "project_id": "proj_27709a3f-f50", "project_name": "Acacia Camp", "project_type": "camp" },
  { "order_id": "2cb3872d-52b4-453e-90b0-033fade38e54", "reference": "ORD-6S4R6R", "product_name": "P5 Restaurant Meal", "quantity": 1, "unit_price": 50, "total_price": 50, "project_id": "camp_e323b315-725", "project_name": "Acacia Restaurant", "project_type": "restaurant" },
  { "order_id": "30d9da91-48d5-4b11-8c3e-aaa7bb7bd520", "reference": "ORD-6SJU3V", "product_name": "Beach Tent", "quantity": 1, "unit_price": 1500, "total_price": 1500, "project_id": "proj_27709a3f-f50", "project_name": "Acacia Camp", "project_type": "camp" },
  { "order_id": "30d9da91-48d5-4b11-8c3e-aaa7bb7bd520", "reference": "ORD-6SJU3V", "product_name": "P5 Restaurant Meal", "quantity": 1, "unit_price": 50, "total_price": 50, "project_id": "camp_e323b315-725", "project_name": "Acacia Restaurant", "project_type": "restaurant" }
]
```

Meta: `rows_read: 15, rows_written: 0`.

Fact: 4 lines, per order 1500 camp + 50 restaurant; line-level totals: Camp 3000 (2 lines), Restaurant 100 (2 lines), grand **3100** (4 lines, 2 orders).

## 2. $3,100 correctness verdict

Panel (RUN T40 screenshot `p5-t40-03-admin-profit.png`): **Unassigned $3,100.00 / 2 lines / 2 orders; Total $3,100.00**.

Verdict: **Total $3,100 CORRECT** — header SUM (1550 + 1550) equals line SUM (1500 + 50 x 2). Grain is **header, not line-level**: 2 lines / 2 orders = one header-grain line per order into Unassigned (header `project_id` NULL, §1a), versus D1 line truth of 4 lines (Camp 3000 / Restaurant 100). Mechanism is the shipped `f002dd1` contract: union list (`GET /orders`, orders.js:762-771) carries no `items`, so `storefrontLeg` (ReportsPanel.tsx:246-262) falls to the header-grain fallback (`projectId: r.projectId ?? null`, `totalPrice: Number(r.totalAmount)`); per-project attribution exists only at line level via detail API (`GET /orders/:id` embeds `items`).

## 3. Profit SQL (verbatim) + JOIN-vs-header answer

Grep: `SUM\(oi.total_price\)|FROM order_items` in `backend/src` hits `backend/src/api/reports.js:413,416,425,428` only; zero `storefront_*` references in reports.js (triage §1e).

Verbatim (`backend/src/api/reports.js:409-422`, by-project):

```sql
SELECT oi.project_id as project_id,
        COALESCE(p.name, 'Unassigned') as project_name,
        COALESCE(p.project_type, 'unassigned') as project_type,
        SUM(oi.total_price) as revenue,
        COUNT(*) as line_count,
        COUNT(DISTINCT oi.order_id) as order_count
 FROM order_items oi
 JOIN orders o ON o.id = oi.order_id
 LEFT JOIN projects p ON p.id = oi.project_id
 WHERE o.tenant_id = ? AND o.created_at >= ? AND date(o.created_at) <= ? AND o.order_state_id != 'cancelled'
 GROUP BY oi.project_id
 ORDER BY revenue DESC
```

Verbatim (total, reports.js:424-431):

```sql
SELECT COALESCE(SUM(oi.total_price), 0) as total_revenue,
        COUNT(*) as total_lines,
        COUNT(DISTINCT oi.order_id) as total_orders
 FROM order_items oi
 JOIN orders o ON o.id = oi.order_id
 WHERE o.tenant_id = ? AND o.created_at >= ? AND date(o.created_at) <= ? AND o.order_state_id != 'cancelled'
```

Answer: **JOIN, not header** — line grain over `order_items oi JOIN orders o` (revenue `SUM(oi.total_price)`, `GROUP BY oi.project_id`); it never reads header `orders.total_amount`. Backend stays booking-only (f002dd1 message verbatim); the storefront leg is frontend-merged.

## 4. Design §5 exact quote + header/per-project/silent verdict

Exact quote (`07-t40-design.md:192-198`, A5):

> - **A5 — Single-table-only filter fields?** `?status=` → `orders.order_state_id` ONLY
>   (orders.js:695-700; needs shop-leg mapping decision §4.3); `?sessionId=`/`?userId=` →
>   `storefront_orders.session_id`/`customer_id` ONLY (storefront.js:463-464, customer
>   surface, not admin). NOT single-table: `?projectType=` (EXISTS over
>   order_items+projects OR orders.camp_id+projects, :702-709), profit window/projectId
>   (order_items JOIN orders + projects, reports.js:405-407), client `campIds`/`paymentStatus`
>   (row-field filters, OrdersPanel.tsx:84-90). Search: no `?q=` anywhere — nothing to preserve.

Verdict: **silent on storefront grain** — §5 documents the booking profit shape as JOIN (per-project line grain) and never specifies header vs line for the storefront leg; the storefront line-grain spec lives in §3/§4.5 (open exclusion predicate §4.4), and the shipped header-grain fallback is a `f002dd1` frontend contract, not a §5 mandate.

## 5. STOP

Verification only. **NO CODE FIX** — no recommendation beyond the facts above.
