# Folio B.1 Discovery — Guest Folio Read-Only Audit

- task: folio-b1-discovery (parent: Guest folio 2026-09-30 — B.1 discovery)
- date: 2026-09-30
- HEAD: `bf98382` (`docs(monitor): PIN login instructions`, branch `main`)
- scope: read-only — `orders.js` (booking/checkin/checkout), `storefront.js` checkout,
  `routes/pos/index.js` sale, `payments.js` record-payment, `reports.js` profit UNION
  (post-`3bcab82`/`0b17105`). No source touched, no `deploy.sh`.

## Q1 — Stay location

The stay lives on the booking `orders` row: `camp_id` + `room_id` + `check_in_date` /
`check_out_date` + `order_state_id` lifecycle (`pending → confirmed → checked_in →
checked_out`, `cancelled` terminal).

- `backend/migrations/0002_orders.sql:9-17` — `orders(id, tenant_id, camp_id, room_id,
  customer_id, order_state_id NOT NULL, check_in_date NOT NULL, check_out_date NOT NULL, …)`
- `backend/src/api/orders.js:475-481` — `LEGAL_TRANSITIONS` (`pending: [confirmed,
  cancelled]`, `confirmed: [checked_in, cancelled]`, `checked_in: [checked_out,
  cancelled]`, terminal `checked_out/cancelled`)
- `backend/src/api/orders.js:894-908` — guarded `INSERT INTO orders (…) SELECT … WHERE
  NOT EXISTS (overlap … AND order_state_id != 'cancelled')`, 409 on `meta.changes === 0`
- `backend/src/api/orders.js:268` — advisory overlap predicate mirrors the guard exactly

## Q2 — Checked-in state shape

`order_state_id = 'checked_in'` (via `PATCH /orders/:id/status`, legal only from
`confirmed`) PLUS the operational check-in write (`PATCH /orders/:id/checkin`:
`early_checkin/adult_count/child_count/room_id`) and the room side-effect
(`rooms_new.room_status = 'occupied'`, legacy `status` kept in sync).

- `backend/src/api/orders.js:494-598` — `PATCH /:id/status` (404 unknown id, 400 unknown
  status / storefront id, 409 illegal transition, paid-state flip needs settled
  `amount_paid` first per F-004)
- `backend/src/api/orders.js:488-492` — `ROOM_STATUS_BY_ORDER_STATUS` (`confirmed →
  reserved`, `checked_in → occupied`, `checked_out → cleaning`; `pending` untouched)
- `backend/src/api/orders.js:1166-1239` — `PATCH /:id/checkin` (tenant-scoped load,
  atomic available-room claim, A22-01 cross-tenant room-takeover guard at `:1202-1208`,
  batch order update + `room_status='occupied'` at `:1221-1233`)
- `backend/src/api/orders.js:1241-1271` — `PATCH /:id/checkout` (optional `$25`
  `late_checkout` charge, frees room to `available` + `cleaning_status='dirty'`)
- `backend/src/api/reports.js:37-45` — occupancy counts `checked_in + confirmed` overlapping today

## Q3 — Open-stay restaurant linkage today

There is NO open-stay → restaurant charge linkage. The only booking↔POS bridge is
one-directional at creation: `meal_plans[]` on `POST /orders` stamps `order_items`
(`type='meal_plan'`, server-derived `project_id`) and mirrors one `pos_transactions`
header per product (`order_number 'MP-'+reference`, `payment_method 'booking'`,
`payment_status 'completed'`); the POS sale itself carries no stay FK.

- `backend/src/api/orders.js:943-1049` — meal-plan block (org mapping, cross-tenant
  product guard, `pos_stores` runtime lookup — never hardcoded id — `order_items` +
  mirror batch, `total_amount` bump)
- `backend/src/routes/pos/index.js:420-950` — `POST /orders` sale (tenant/org/store/
  cashier/project/table scope, promotions, atomic stock + header + items batch) —
  header columns at `:764-782` have NO `order_id`/stay FK
- `backend/src/api/orders.js:1374-1400` — `GET /:id/payments` reads `payment_records`
  (booking orders only); `backend/src/api/orders.js:1461-1467` — record-payment rejects
  storefront ids with 400
- `backend/src/api/storefront.js:287-358` — `POST /checkout` writes `storefront_orders`
  (`status/payment_status 'pending'`) + `storefront_order_items` + cart cleanup in one
  batch; Paymob intention after, `payment_intent_id` persisted at `:430-432`

## Q4 — Schema gaps for folio

`folio` appears nowhere in schema or code (only the explicit non-goal comment
`backend/src/api/orders.js:1418` — record-payment touches "no folio, no state machine").
Gaps to close for a real folio:

1. No folio/ledger header table (no `folio`, `guest_stay_charges`, or equivalent).
2. No stay FK on charge tables: `pos_transactions` / `pos_transaction_items` /
   `storefront_orders` / `storefront_order_items` carry `tenant_id` (+ org/store/project)
   but nothing pointing at `orders.id`.
3. `payment_records` (`backend/migrations/0110_create_payment_records.sql:36-59`) is
   booking-only (`order_id REFERENCES orders(id)`, `method cash|card|split`, legs sum
   ±0.01) — POS/storefront payments never land here.
4. `storefront_orders` has NO `payment_method` / NO `amount_paid` (REMOTE DDL-confirmed,
   reports.js T40 comments) — paid-ness reads from `payment_status` only; webhook
   (`backend/src/api/paymob-webhook.js:317-324`) flips `payment_status → 'paid'` and
   never touches `status` (stays `'pending'` forever — logbook 2026-09-28).
5. No balance column anywhere — balance is derived `total_amount − amount_paid`
   (migration `0110:11-12`); folio aging/buckets do not exist.

## Q5 — Profit UNION shape + double-count risk

`GET /api/reports/profit` (`backend/src/api/reports.js:471-529`, post-`3bcab82`/
`0b17105`) aggregates UNION ALL line grain over both item tables on persisted
`total_price`: booking leg `order_items ⨝ orders` (tenant + window + `!= 'cancelled'`
in-leg) + storefront leg `storefront_order_items ⨝ storefront_orders` (tenant via
`so.tenant_id` — items table carries NO `tenant_id` — + window + `!= 'cancelled'`
mirror), single outer `LEFT JOIN projects` with explicit `'Unassigned'` bucket, footer
total over the SAME union (footer-SUM == aggregate by construction), optional
`?projectId=` narrows both legs.

- `backend/src/api/reports.js:489-498` — leg SQL; `:500-518` — by-project + total over
  the same inner union
- `3bcab82` — introduced the UNION (booking-only before was the bug: zero
  `storefront_*` refs in reports.js)
- `0b17105` — removed the client `mergeProfitSources` leg (`ReportsPanel.tsx`) that
  double-counted server-union + client-merge (staging `6200` vs `3100`, commit
  `cb88355`); profit is server-only since
- Double-count risk note: legs are disjoint by construction — product namespaces never
  overlap (`order_items` booking lines vs `storefront_order_items` shop lines; POS
  `pos_transaction_items` are NOT in this union — they surface via `/top-products` and
  `revenue-breakdown`), and status vocabs never overlap (booking `cancelled` vs shop
  `pending`, webhook flips `payment_status` only). Residual watch-item: `COUNT(DISTINCT
  order_id)` spans the union — safe only while booking `ord_*` ids and storefront UUIDs
  cannot collide (true today: `orders.js:880` `ord_+12` vs `storefront.js:318` full
  `crypto.randomUUID()`); a future id-scheme merge would need namespacing.

## Files read (verbatim)

- `backend/src/api/orders.js` (full, 1647 lines — booking CRUD, status machine,
  kitchen-status, union list/detail, checkin/checkout, record-payment, availability)
- `backend/src/api/storefront.js:287-447` (checkout), `:451-472` (customer orders)
- `backend/src/routes/pos/index.js:420-950` (sale), `:952-1016` (order reads)
- `backend/src/api/payments.js:1-49` (retired mock-Stripe, 501 — real money moves via
  `orders.js` record-payment + `paymob-webhook.js`)
- `backend/src/api/reports.js:453-529` (profit UNION), `:150-203` (top-products UNION),
  `:274-345` (revenue-breakdown UNION)
- `backend/migrations/0002_orders.sql:9-40`, `0110_create_payment_records.sql`,
  `paymob-webhook.js:317-324`, `git show 3bcab82/0b17105 --stat`
