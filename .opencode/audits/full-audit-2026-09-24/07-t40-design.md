# T40 design — union projection + list contract (2026-09-28)

Design-only. No source, migration, D1, KV, or deploy change in this commit.
Spec: `.opencode/agents/tmp/2026-09-27-t40d.md`. Parent triage: `06-t40-triage.md`
(Option A — union read; Option B rejected there).

## 1. State + DDL source

- Baseline: `f7e6b2c` (`docs(audit): T40 triage — Phase 5 admin source-table mismatch`) confirmed `git rev-parse HEAD`.
- DDL reads: **REMOTE staging D1** (`campmaster-db-staging`, `40f944f2-…`)
  via `wrangler d1 execute --remote` (read-only `SELECT name, sql FROM sqlite_master …`;
  `rows_written: 0`). Local-miniflare fallback NOT used.
- List-contract reads: code only (OrdersPanel.tsx, DataTable.tsx, orders.js GET /,
  storefront.js GET /orders + /admin/orders, reports.js GET /profit, pagination.js).

### 1a. Staging `orders` DDL (remote, verbatim, trimmed to columns)

`id TEXT PK, tenant_id TEXT NOT NULL, camp_id TEXT → projects(id) NULLABLE,
room_id TEXT NOT NULL → rooms_new(id), customer_id TEXT → customers(id) NULLABLE,
order_state_id TEXT NOT NULL → order_state(id), check_in_date TEXT NOT NULL,
check_out_date TEXT NOT NULL, number_of_people INT dflt 1, total_amount REAL NOT NULL dflt 0,
amount_paid REAL dflt 0, payment_method TEXT, payment_status TEXT dflt 'pending',
reference TEXT UNIQUE NOT NULL, invoice_date TEXT, notes TEXT,
created_at DATETIME dflt CURRENT_TIMESTAMP, updated_at DATETIME,
table_id TEXT → pos_tables(id) NULLABLE,
kitchen_status TEXT dflt 'pending' CHECK(pending/confirmed/preparing/ready/served/canceled),
early_checkin INT dflt 0, late_checkout INT dflt 0, requested_checkin/checkout_time TEXT,
adult_count dflt 1, child_count dflt 0, extra_guest_charge REAL dflt 0, split_count dflt 1,
tip_amount REAL dflt 0, tip_method TEXT, payment_intent_id TEXT, paymob_transaction_id TEXT,
paymob_paid_at TEXT, verified_by TEXT, project_id TEXT → projects(id) NULLABLE`

### 1b. Staging `storefront_orders` DDL (remote, verbatim)

`id TEXT PK, tenant_id TEXT NOT NULL → tenants(id), customer_id TEXT → customers(id) NULLABLE,
reference TEXT UNIQUE NOT NULL, session_id TEXT, total_amount REAL dflt 0,
currency TEXT dflt 'EGP', status TEXT dflt 'pending', payment_status TEXT dflt 'pending',
notes TEXT, created_at TEXT dflt CURRENT_TIMESTAMP, updated_at TEXT,
payment_intent_id TEXT, paymob_transaction_id TEXT, paymob_paid_at TEXT,
project_id TEXT → projects(id) NULLABLE` (0100; NULL for mixed orders per 5c)

### 1c. Line tables (remote, for the profit-leg + `?projectType=` mirror)

- `order_items`: `id PK, order_id NOT NULL → orders(id) CASCADE, type dflt 'room_night',
  reference_id TEXT, name TEXT NOT NULL, quantity dflt 1, unit_price dflt 0,
  total_price dflt 0, created_at, split_group dflt 1, course_number dflt 0,
  course_status dflt 'pending' CHECK, project_id NULLABLE → projects(id)` (stamped since 5b)
- `storefront_order_items`: `id PK, order_id NOT NULL → storefront_orders(id) CASCADE,
  product_id → pos_products(id) SET NULL` (0123 retarget; was stale `products(id)`),
  `product_name TEXT NOT NULL, quantity dflt 1, unit_price dflt 0, total_price dflt 0,
  created_at, project_id NULLABLE → projects(id)` (0122; stamped since 5c)
- `customers` (shared join target of BOTH headers): `id PK, tenant_id NOT NULL,
  first_name, last_name, email, phone, created_at, updated_at`
  (storefront guest checkout leaves `customer_id` NULL → panel already renders 'N/A')

## 2. OrdersPanel list contract (code reads)

Source: `app/src/components/admin/OrdersPanel.tsx` + `app/src/components/ui/DataTable.tsx`
+ `backend/src/api/orders.js:665-718` + `backend/src/utils/pagination.js`.

### 2a. Columns rendered (DataTable, OrdersPanel.tsx:222-271)

| # | FE key | Header | Sortable (DataTable `sortable: true`) | Display derivation |
|---|--------|--------|---------------------------------------|--------------------|
| 1 | `reference` | Ref # | YES | `o.reference \|\| o.id`, sliced to 12 chars |
| 2 | `customerFirstName` + `customerLastName` | Guest | no | joined with space, else 'N/A' |
| 3 | `campId` | Camp | no | `campNameMap[o.campId] ?? 'N/A'` (client, from useCampsQuery) |
| 4 | `roomId` | Room | no | `roomMap[o.roomId]?.name ?? 'N/A'` (client, from useRoomsQuery) |
| 5 | `checkInDate` | Check-in | YES | `formatDate(o.checkInDate)` |
| 6 | `checkOutDate` | Check-out | YES | `formatDate(o.checkOutDate)` |
| 7 | `totalAmount` | Total | YES | `formatCurrency(o.totalAmount \|\| 0)` |
| 8 | `orderStateId` / `stateName` | Status | no | Badge variant by `orderStateId`, label `stateName \|\| orderStateId` |

Row actions: View (detail modal) / State (PATCH /:id/status lifecycle) / Del (DELETE).
Stats bar (OrdersPanel.tsx:92-103): total/pending/confirmed/checked_in counts + revenue
= SUM(totalAmount) over `paymentStatus === 'paid'` rows.

### 2b. Detail modal fields (GET /orders/:id, orders.js:741-759)

`reference, stateName/orderStateId, customerFirstName/LastName, customerEmail,
customerPhone, roomId→room name, checkInDate, checkOutDate, numberOfPeople,
totalAmount, amountPaid, paymentMethod, notes` + Record-payment entry point.
(List rows carry only the §2a subset — modal MUST fetch full detail; OrdersPanel.tsx:75-79.)

### 2c. Sort

- Server: fixed `ORDER BY o.created_at DESC` (orders.js:714). No sort params exist.
- Client: DataTable local `sortKey/sortDir` state (DataTable.tsx:102,191-205) over the
  4 sortable columns only (§2a). Union keeps server `created_at DESC`; client sort untouched.

### 2d. Pagination

- GET /orders: `parsePagination` (pagination.js:21-33) — `?page=` (dflt 1) / `?pageSize=`
  (dflt 50, clamp [1,200]) → `LIMIT ? OFFSET ?` (orders.js:714-715) + envelope
  `{ data, total, page, pageSize, hasMore }` (pagination.js:43-50). `total` = COUNT(*) over
  the CURRENT filter (count query mirrors every predicate, orders.js:679-709).
- GET /storefront/orders (storefront.js:451-472) and GET /storefront/admin/orders (:824-833):
  NO pagination (full list, no LIMIT). Union design: ONE `LIMIT ? OFFSET ?` over the UNION
  + ONE union-shaped COUNT so `total`/`hasMore` stay exact.

### 2e. Search / filter fields

- Search: NONE — no `?q=`/`?search=` param on any of the three list endpoints. No search
  contract to preserve.
- Server-side: `?status=` → `orders.order_state_id = ?` exact (orders.js:695-700);
  `?projectType=` → EXISTS over `order_items.project_id → projects.project_type` OR legacy
  `orders.camp_id → projects.project_type` (orders.js:702-709, 5e; omitted = legacy SQL).
- Client-side (OrdersPanel.tsx:84-90): `campIds` (`o.campId` include) + `statusFilter`
  (`o.paymentStatus` paid/unpaid/partial).
- Profit (reports.js:387-442): `?days=`/`?start=`/`?end=` window + optional `?projectId=`;
  aggregate (GROUP BY, `ORDER BY revenue DESC`), NO pagination.

## 3. FULL projection table — every admin-list column mapped or NULL-marked

Discriminator (new, union-only, not stored): `source = 'booking' | 'storefront'`.
Lifecycle-gating rule (design constraint): State / Del / Record-payment actions fire ONLY on
`source = 'booking'` rows (lifecycle, DELETE route, and record-payment are booking-table
writers; storefront rows are read-only in the panel until an owner-gated follow-up says otherwise).

| Admin-list column (FE key) | `orders` leg source | `storefront_orders` leg source | NULL-marked? |
|---|---|---|---|
| `id` | `o.id` | `so.id` | — |
| `source` (discriminator) | `'booking'` literal | `'storefront'` literal | — |
| `tenant_id` | `o.tenant_id` | `so.tenant_id` | — |
| `reference` | `o.reference` | `so.reference` | — (both UNIQUE NOT NULL, §5 A1/A2) |
| `customerFirstName` | `c.first_name` (LEFT JOIN customers) | `c.first_name` (same LEFT JOIN, `so.customer_id`) | NULL-able → panel 'N/A' (guest checkout) |
| `customerLastName` | `c.last_name` | `c.last_name` | NULL-able → panel 'N/A' |
| `customerEmail` (detail) | `c.email` | `c.email` | NULL-able → 'N/A' |
| `customerPhone` (detail) | `c.phone` | `c.phone` | NULL-able → 'N/A' |
| `campId` | `o.camp_id` | NULL (shop cart has no booking project) | **NULL** — project scoping for shop rows is line-level via `storefront_order_items.project_id` (§4.3) |
| `roomId` | `o.room_id` | NULL (no room/stay) | **NULL** → panel 'N/A' |
| `room_name` (display) | `r.name` (LEFT JOIN rooms_new) | NULL | **NULL** → panel 'N/A' |
| `checkInDate` | `o.check_in_date` | NULL (no stay dates) | **NULL** (`formatDate` guard needed — owner-gated UI follow-up) |
| `checkOutDate` | `o.check_out_date` | NULL | **NULL** (same guard) |
| `numberOfPeople` (detail) | `o.number_of_people` | NULL | **NULL** |
| `totalAmount` | `o.total_amount` | `so.total_amount` | — |
| `amountPaid` (detail) | `o.amount_paid` | NULL (`storefront_orders` HAS NO amount column) | **NULL** — paid-ness for shop rows reads from `payment_status` only; record-payment forbidden on shop rows |
| `paymentMethod` (detail) | `o.payment_method` | NULL (no such column) | **NULL** → 'N/A' |
| `paymentStatus` (filter+stats) | `o.payment_status` | `so.payment_status` | — (same vocabulary; stats SUM-over-paid works on both legs) |
| `orderStateId` | `o.order_state_id` | `so.status` passthrough | — values differ (`checked_in/…` vs shop `pending/…`); Badge defaults neutral for unknown |
| `stateName` | `osi.name` (LEFT JOIN order_state_lang, lang='en') | `so.status` raw | shop leg has no lang join — label = raw status |
| `notes` (detail) | `o.notes` | `so.notes` | — |
| `created_at` (sort key) | `o.created_at` | `so.created_at` | — (both legs ORDER BY created_at DESC today, §5 A3) |
| `table_id`, `kitchen_status`, `early_checkin`, `late_checkout`, `requested_*_time`, `adult_count`, `child_count`, `extra_guest_charge`, `split_count`, `tip_amount`, `tip_method`, `payment_intent_id`, `paymob_*`, `verified_by`, `invoice_date` | `o.*` (detail-capable, not list-rendered) | n/a | **NULL** — booking-semantics columns, no shop equivalent by design (5c verdict) |
| `currency` | n/a (booking leg implies EGP) | `so.currency` | booking leg NULL / constant — display decision owner-gated |

Line-level (profit union, reports.js shape): booking leg `order_items oi JOIN orders o`
(line grain: `oi.project_id → projects`, revenue `SUM(oi.total_price)`, cancelled excluded
via `o.order_state_id != 'cancelled'`) UNION shop leg
`storefront_order_items soi JOIN storefront_orders so` (same grain: `soi.project_id`,
revenue `SUM(soi.total_price)`). Shop-leg exclusion predicate is the ONE open design point
(§4.4): `storefront_orders` has no `order_state_id` — candidates are
`so.payment_status != 'cancelled'`-style status gate vs `so.status`, owner-gated.

## 4. Union-read design (owner-gated next commit — NOT implemented here)

1. **GET /orders**: `SELECT <§3 columns> FROM orders o <3 LEFT JOINs> WHERE o.tenant_id = ?`
   UNION ALL `SELECT <§3 columns, NULLs as marked> FROM storefront_orders so
   LEFT JOIN customers c … WHERE so.tenant_id = ?`, wrapped for a single
   `ORDER BY created_at DESC LIMIT ? OFFSET ?`; COUNT = same UNION as scalar subquery total.
   Envelope `{ data, total, page, pageSize, hasMore }` byte-identical.
2. **Write paths untouched**: POST /checkout, both Paymob webhook branches, record-payment,
   lifecycle PATCH, marketplace_payments ledger — byte-identical (triaged §3 justification).
3. **`?status=`**: booking leg keeps `o.order_state_id = ?`; shop-leg mapping
   (`so.status = ?` passthrough vs ignore) owner-gated — current panel sends `?status=` NEVER
   (statusFilter is client-side), so default-safe is booking-leg-only until decided.
4. **`?projectType=`**: mirror the EXISTS predicate onto the shop leg via 5c-stamped
   `storefront_order_items.project_id → projects.project_type`
   (header `storefront_orders.project_id` stays out — NULL for mixed orders, 5c).
5. **GET /reports/profit**: add the §3 line-grain shop leg; `Unassigned` bucket covers NULL
   `project_id` on BOTH legs (5f idiom); footer-SUM == aggregate invariant kept.
6. **No migration, no backfill** (both tables keep full history; old + new rows surface
   immediately). Read-normalization follow-ups: NULL date/room guards in panel + detail modal
   shop-leg shape + `?status=`/exclusion-predicate decisions (§4.3/§4.4).

## 5. Answers (list contract)

- **A1 — `orders` has a `reference` field? YES.** `reference TEXT UNIQUE NOT NULL`
  (staging remote DDL §1a; read path orders.js:682-692 selects `o.reference`).
- **A2 — `storefront_orders` has a `reference` field? YES.** `reference TEXT UNIQUE NOT NULL`
  (staging remote DDL §1b; checkout writes it storefront.js:326-330; customer endpoint
  aliases it `orderNumber`, :460).
- **A3 — Sort order? `created_at DESC` on ALL THREE list reads**: GET /orders
  `ORDER BY o.created_at DESC` (orders.js:714); GET /storefront/orders
  `ORDER BY created_at DESC` (storefront.js:466); GET /storefront/admin/orders
  `ORDER BY created_at DESC` (:830). Profit is an aggregate (`ORDER BY revenue DESC`,
  reports.js:421 — not a list). Union keeps `ORDER BY created_at DESC`.
- **A4 — Pagination LIMIT/OFFSET?** GET /orders: YES — `?page=`/`?pageSize=` (dflt 50,
  max 200) → `LIMIT ? OFFSET ?` + `{ data, total, page, pageSize, hasMore }` envelope
  (pagination.js:21-50; orders.js:677,714-717; `total` mirrors the filter, :679-709).
  GET /storefront/orders + /admin/orders: NO pagination (full-list). Union: ONE
  LIMIT/OFFSET over the UNION + union-shaped COUNT (§4.1).
- **A5 — Single-table-only filter fields?** `?status=` → `orders.order_state_id` ONLY
  (orders.js:695-700; needs shop-leg mapping decision §4.3); `?sessionId=`/`?userId=` →
  `storefront_orders.session_id`/`customer_id` ONLY (storefront.js:463-464, customer
  surface, not admin). NOT single-table: `?projectType=` (EXISTS over
  order_items+projects OR orders.camp_id+projects, :702-709), profit window/projectId
  (order_items JOIN orders + projects, reports.js:405-407), client `campIds`/`paymentStatus`
  (row-field filters, OrdersPanel.tsx:84-90). Search: no `?q=` anywhere — nothing to preserve.

## 6. STOP

Fix (union read per §4) is the next commit, owner-gated. **NO CODE FIX in this commit** —
docs note only (this file + logbook fold).
