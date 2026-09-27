# Phase 5 Unified Cart — Exit Report (six gates)

- Date: 2026-09-27
- Baseline confirmed pushed: `149a38c` — local `main` HEAD == `origin/main` == `149a38c`
  (verified via `git log origin/main..HEAD` empty + `git status -sb` on `main`; `git show` 149a38c = `feat(reports): per-project P&L split`).
- Evidence source: step commit messages 5a–5f + gate test files, re-verified read-only
  (hermetic better-sqlite3 in-memory, zero D1/KV writes). No numbers invented.
- Re-verification this session: `cd backend && npx vitest run`
  `tests/cart-items-project-id.test.js tests/order-items-project-id.test.js`
  `tests/checkout-unified.test.js tests/profit-report.test.js`
  → **4 files passed, 15 tests passed, 0 failed** (5 + 2 + 4 + 4).
- Re-verification this session: `cd app && npx vitest run`
  `tests/unit/storefront-confirmation.test.tsx tests/unit/OrdersPanel.test.tsx`
  `tests/unit/admin/ReportsPanel.test.tsx`
  → **3 files passed, 73 tests passed, 0 failed** (14 + 21 + 38).

## Gate 1 — Unified cart (step 5a, commit `2f4e7af`) → PASS

- Suite at close: 111 files / 2592 tests, 0 failed (targeted 3 files: 56 passed).
- Migration `0121_add_cart_items_project_id.sql` (next-free; 0109 stays RESERVED-but-absent):
  nullable `project_id TEXT REFERENCES projects(id) ON DELETE SET NULL` + `idx_cart_items_project`, cart_items only.
- Every add-to-cart path stamps server-side from the owning `pos_products.project_id`
  (never client — `addToCartSchema` strips unknown keys); carts header INSERT stamps the
  creating line's project; re-add UPDATE re-stamps (heals legacy NULLs).
- Gate test `backend/tests/cart-items-project-id.test.js` (5 tests), real 0121 file replayed
  onto pre-0121 stub then 5a-shaped INSERTs:
  rows=`[{"product_id":"meal_prod","project_id":"proj_meal"},{"product_id":"room_prod","project_id":"proj_room"}]`
  distinct=2 nulls=0 ⇒ 2 rows, both `project_id` NOT NULL, distinct.
- Collateral: exactly 5 test-only mock regexes updated to the extended SELECT
  (4 `storefront-unit.test.js` + 1 `storefront-scope-unit.test.js:71`); payloads untouched.
- Re-run this session: 5/5 passed.

## Gate 2 — Single order, multi-project lines (step 5c, commit `93a672a`) → PASS

- Suite at close: 113 files / 2598 tests, 0 failed (baseline 5b: 112/2594; +1 file/+4 tests, zero collateral).
- Migration `0122_add_storefront_order_items_project_id.sql`: nullable `project_id` +
  `idx_storefront_order_items_project` on `storefront_order_items` only
  (header `storefront_orders.project_id` already 0100, stays NULL for mixed orders —
  no single header project exists; line-level scoping reads the LINES).
- Gate test `backend/tests/checkout-unified.test.js` (4 tests), real router + real SQLite, Paymob mocked:
  cart 1 room (200) + 1 meal (50) ⇒ response 1 `orderId` string, `totalAmount`=250;
  DB 1 `storefront_orders` row (total 250) + 2 lines `[{room_prod,proj_camp},{meal_prod,proj_rest}]`
  distinct=2 nulls=0; cart cleanup in batch; legacy NULL cart lines heal via the
  `pos_products` fallback (still NOT NULL).
- NOT-BLOCKED verdict recorded: rewriting the `storefront_orders` path into `orders/`
  would balloon into booking semantics + webhook + record-payment (all FORBIDDEN for 5c).
- Re-run this session: 4/4 passed.

## Gate 3 — Single Paymob intention (step 5c, commit `93a672a`) → PASS

- Same gate test file (`backend/tests/checkout-unified.test.js`): `paymobEnabled=true`,
  `paymobIntention.clientSecret` truthy, `createPaymobIntention` ×1
  (`amountCents`=25000, `orderRef`=orderNumber); intention id persisted to the order row.
- The single `createPaymobIntention` call (never looped) is untouched; duplicate POSTs
  dedupe via idempotency/UNIQUE reference, never a second intention (5.0 discovery answers 4/4 hold).
- Re-run this session: covered by the same 4/4 passed.

## Gate 4 — Admin filter (step 5e, commit `b7a529b`) → PASS

- Suites at close: app 149 files / 3554 passed 0 failed; backend 113 files / 2600 passed 0 failed
  (first full run: exactly 2 breaks, both the openapi artifact-sync cause — registry-source fix,
  within the ≤3 budget, no STOP).
- Server narrow (chosen over client filter — trivial + additive, no N+1): `GET /api/orders`
  gains optional `?projectType=` with a line-level EXISTS predicate on BOTH count and data
  queries — an order matches when ANY line belongs to a same-tenant project of that type
  (`order_items.project_id` JOIN `projects`, stamped server-side since 5b); legacy untagged
  orders match via their booking project (`orders.camp_id` JOIN `projects`).
- Gate tests: `app/tests/unit/OrdersPanel.test.tsx` +4 — Camp ⇒ 1 row REF-A +
  hook `{projectType:'camp'}`; Restaurant ⇒ same REF-A row + `{projectType:'restaurant'}`
  (line-level proof); All ⇒ 2 rows + legacy paramless call. `backend/tests/orders-unit.test.js` +2
  (predicate on both prepares + 4 restaurant binds + no raw interpolation; absent param ⇒ no trace).
  `app/tests/unit/api-extended.test.ts` +1 (projectType in request URL).
- Root integration full-config: 52 failed BUT proven pre-existing — identical failures on the
  orders-relevant files with this change stashed on pristine `afe89ee` (AGENTS.md full-config flake).
- Re-run this session: `OrdersPanel.test.tsx` 21/21 passed (incl. the 4 gate tests).

## Gate 5 — Reports split (step 5f, commit `149a38c`) → PASS

- Suites at close: app 149 files / 3561 passed 0 failed (baseline 5e 149/3554; +7, zero collateral);
  backend 114 files / 2604 passed 0 failed (baseline 5e 113/2600; +1 file/+4 tests, zero collateral).
- `GET /api/reports/profit` (server grouping, mirrors revenue/bookings window logic):
  line-grain `SUM(oi.total_price)`/COUNT grouped by `order_items.project_id`
  (stamped server-side since 5b; backfilled 0105; NOT NULL 0106), tenant scope via the
  parent-order join, cancelled excluded, optional `?projectId=`/`project_id` narrow,
  NULL-project lines in an explicit `Unassigned` bucket, tenant total over the same filter
  so footer-SUM == tenant aggregate by construction (design §7.3 acceptance).
- Gate test `backend/tests/profit-report.test.js` (4 tests), real router + real SQLite:
  numeric gate 250 ⇒ Accommodation 200 + Restaurant 50 + sum 250 with
  `total.totalRevenue` == 250; `projectId` narrow ⇒ 1 row + total 50;
  NULL line ⇒ Unassigned bucket + footer 260; 500 on DB error.
- Frontend: `ReportsPanel` 4th option `Profit by Project` + `profit-total` footer;
  `app/tests/unit/admin/ReportsPanel.test.tsx` +6 (200/50/250 + footer; footer SUM == aggregate;
  empty state; error toast; revenue still renders).
- Root integration reports per-file: 6 failed BUT proven pre-existing — identical 6
  (5 tenant REP-01/02/04/05/06 fixture-setup + 1 core occupancy) with the same 4 passes
  on pristine `b7a529b` with this change stashed (zero `/profit` involvement).
- Re-run this session: `profit-report.test.js` 4/4 + `admin/ReportsPanel.test.tsx` 38/38 passed.

## Gate 6 — Legacy compat (steps 5b `1b86a9c` + 5d `afe89ee` + 5f) → PASS

- Suite at close (5b): 112 files / 2594 tests, 0 failed (baseline 5a: 111/2592; +1 file/+2 tests,
  zero collateral — no existing test touched).
- `grep INSERT INTO order_items backend/src` = exactly 3 source sites, all stamped; NULL only
  when the source has no project AND no parent project (documented per site): generic
  client-supplied items (`orderItemSchema` strips unknown keys, `reference_id` NULL by design,
  `orders.project_id` never stamped on that path — 5c owns checkout) bind NULL explicitly;
  meal-plan paths stamp `product.project_id` server-side, NULL only for legacy untagged rows.
- Gate test `backend/tests/order-items-project-id.test.js` (2 tests), real routers + real SQLite:
  orders rows=`[{addon,NULL},{meal_a,proj_meal_a},{meal_b,proj_meal_b}]`,
  reservations rows=`[{meal_a,proj_meal_a},{meal_b,proj_meal_b}]` — mixed-origin checkout
  carries correct project_ids; every INSERT text carries `project_id`.
- Confirmation (5d, suites app 149/3549 + backend 113/2598, +14 tests zero collateral):
  null-tag + unknown-tag lines ⇒ single Legacy bucket (`Legacy` + `Unassigned`,
  flat 1 title + 2 lines, one total); directory failure ⇒ fail-soft all-Legacy;
  no snapshot ⇒ legacy header rendering byte-identical.
- Profit (5f): NULL line ⇒ Unassigned bucket + footer 260 (nothing silently dropped).
- Re-run this session: 2/2 + 14/14 passed.

## Verdict

Six gates, six PASS. All numbers harvested from pushed step commits 5a–5f and their gate tests;
15/15 backend + 73/73 frontend gate tests re-run green in this session. No gate required invention.
No source touched by this report (docs record only); no `deploy.sh`; no KV/D1 writes.
Rollback = revert single commit.
