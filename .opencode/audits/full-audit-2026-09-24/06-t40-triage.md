# T40 triage — Phase 5 admin source-table mismatch (2026-09-27)

Diagnose-only. No source, migration, D1, KV, or deploy change in this commit.
Spec: `.opencode/agents/tmp/2026-09-27-t40.md`.

## 1. Read chain (verbatim)

### 1a. OrdersPanel query call

`app/src/components/admin/OrdersPanel.tsx:59-61`:

```tsx
const { data: ordersRes, isLoading, isFetching } = useOrdersQuery(
  projectFilter === 'all' ? undefined : { projectType: projectFilter },
);
```

`app/src/hooks/useQueryHooks.ts:214-224`:

```ts
export function useOrdersQuery(params?: Record<string, string>) {
  ...
    queryFn: () => api.getOrders(params) as Promise<api.Paginated<Order>>,
```

`app/src/lib/api.ts:375-378`:

```ts
export function getOrders(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<Schemas['PaginatedOrders']>(`/orders${qs}`);
}
```

⇒ OrdersPanel calls **`GET /orders`** (optional `?projectType=`).

### 1b. GET /orders read table

`backend/src/api/orders.js:679` (count):

```sql
SELECT COUNT(*) as total FROM orders WHERE tenant_id = ?
```

`backend/src/api/orders.js:682-692` (data):

```sql
SELECT o.id, o.tenant_id, o.camp_id, o.room_id, o.customer_id,
    o.order_state_id, o.check_in_date, o.check_out_date,
    o.number_of_people, o.total_amount, o.amount_paid,
    o.payment_status, o.reference, o.created_at,
    c.first_name as customer_first_name, c.last_name as customer_last_name,
    r.name as room_name, osi.name as state_name
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN rooms_new r ON r.id = o.room_id
    LEFT JOIN order_state_lang osi ON osi.order_state_id = o.order_state_id AND osi.lang = 'en'
    WHERE o.tenant_id = ?
```

(`?projectType=` only adds an `EXISTS` predicate over `order_items`/`projects`,
orders.js:702-709 — it narrows rows, it does not change the source table.)

⇒ **Table: `orders`** (booking/reservation table).

### 1c. GET /storefront/orders read table

`backend/src/api/storefront.js:460`:

```sql
SELECT id, reference AS orderNumber, total_amount AS totalAmount, status, created_at AS createdAt FROM storefront_orders WHERE tenant_id = ?
```

⇒ **Table: `storefront_orders`**.

### 1d. POST /storefront/checkout write table

`backend/src/api/storefront.js:326-330` (header):

```sql
INSERT INTO storefront_orders
  (id, tenant_id, reference, session_id, total_amount, status, payment_status, notes, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, 'pending', 'pending', 'Storefront checkout', datetime('now'), datetime('now'))
```

`backend/src/api/storefront.js:336-338` (per line):

```sql
INSERT INTO storefront_order_items
  (id, order_id, product_id, product_name, quantity, unit_price, total_price, project_id)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
```

plus `DELETE FROM cart_items WHERE cart_id = ?` (line 355), one atomic batch.

⇒ **Tables: `storefront_orders` + `storefront_order_items`**.

### 1e. Profit tab read table

`app/src/components/admin/ReportsPanel.tsx:38` → `useProfitReportQuery`
(useQueryHooks.ts:878) → `api.getProfitReport` (api.ts:651-659) →
**`GET /reports/profit`** → `backend/src/api/reports.js:387-442`:

```sql
SELECT oi.project_id as project_id,
       COALESCE(p.name, 'Unassigned') as project_name,
       ...
       SUM(oi.total_price) as revenue,
       COUNT(*) as line_count,
       COUNT(DISTINCT oi.order_id) as order_count
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
LEFT JOIN projects p ON p.id = oi.project_id
WHERE o.tenant_id = ? AND o.created_at >= ? AND date(o.created_at) <= ? AND o.order_state_id != 'cancelled'
...
```

(zero references to `storefront_*` anywhere in reports.js.)

⇒ **Tables: `order_items` + `orders`** (booking tables).

### 1f. Supporting evidence (read-only)

- Paymob webhook (`backend/src/api/paymob-webhook.js:227-324`) treats the two
  tables as separate domains by design: tries
  `FROM orders WHERE reference = ?` first (line 231), then
  `FROM storefront_orders WHERE reference = ?` (line 299). No unification.
- `GET /storefront/admin/orders` (storefront.js:824-833) reads
  `SELECT * FROM orders` — the booking table, despite the storefront path
  prefix. Its only client, `useStorefrontOrdersQuery` (useQueryHooks.ts:1558-1568),
  has **zero consumers** in `app/src` (grep-verified). No admin surface reads
  `storefront_orders` at all.
- storefront.js:344-348 (5c comment) already records the verdict that rewriting
  the unified checkout into `orders/` "would balloon into booking semantics +
  webhook/record-payment (forbidden)".

## 2. Answers

- Checkout writes table: **`storefront_orders`** (+ `storefront_order_items`).
- OrdersPanel calls endpoint reading table: **`GET /orders`** reading **`orders`**.
- Same table? **NO.**
- Admin sees unified (storefront-checkout) order in OrdersPanel? **NO.**
- Profit tab reads tables: **`order_items` JOIN `orders`**. Same as checkout
  write table? **NO.** Admin sees storefront revenue in profit tab? **NO.**

## 3. Recommendation: Option A (union read)

**Pick A — union read in the admin GET /orders and GET /reports/profit paths.**
Option B (canonical `orders` write) is rejected.

Justification:

1. Shape incompatibility. `orders` carries booking semantics: `camp_id`,
   `room_id`, `check_in/out_date`, guest upsert, the race-safe overlap-guarded
   INSERT (orders.js:799-818), the order-lifecycle state machine
   (PATCH /:id/status, 409 on illegal transitions), record-payment as the sole
   writer of `amount_paid`/`payment_status`, kitchen mirrors, and the SSE
   `new-booking` broadcast. A shop cart has no room/stay — forcing it into
   `orders` needs NULL/fake room/camp, breaking `validateOrder`
   (camp/room/guest required), the overlap guard, and lifecycle invariants.
2. Additive + reversible. Union read touches read paths only; the checkout
   write path, both Paymob webhook branches, and the marketplace_payments ledger
   stay byte-identical. No migration, no backfill — both tables keep full
   history and old + new rows surface immediately.
3. B's blast radius. Canonical-write requires schema relaxation on `orders`
   (nullable room/camp/dates), rewriting validateOrder/overlap/lifecycle/
   record-payment guards to exempt roomless rows, webhook + ledger changes, and
   a one-time backfill of all historical `storefront_orders` → `orders`
   (+ lines → `order_items` with synthetic project tags) — plus dual-write or
   redirect during cutover, without which old rows stay invisible anyway.

Migration/backfill consequences:

- **A: NO migration, NO backfill.** Follow-up work is read-normalization only:
  storefront rows lack room/guest/date columns (NULL mapping in the union),
  pagination over UNION, and extending the `?projectType=` predicate to
  `storefront_order_items.project_id` (stamped since 5c) — owner-gated next commit.
- **B (rejected):** would need N+1 migration (nullable booking columns on
  `orders`), a backfill script `storefront_*` → `orders`/`order_items`,
  webhook/ledger updates, and regression risk on every booking invariant above.

## 4. STOP

Fix is the next commit, owner-gated. **NO CODE FIX in this commit** — docs note
only (triage file + logbook fold).
