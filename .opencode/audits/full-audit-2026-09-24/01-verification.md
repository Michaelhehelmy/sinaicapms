# P0 Verification + U Triage — 2026-09-24 (01-verification)

- Mode: READ-ONLY. No source modified, no D1 writes (SELECT/PRAGMA + `mode=ro` only), no deploy, no fixes.
- Spec: `.opencode/agents/tmp/2026-09-24-verify-p0.md`
- Inputs: `00-REPORT.md` lines 78-100 (F-001..F-004) and 390-403 (U-001..U-014); verbatim source reads; read-only grep/sed; read-only python sqlite3 on the local miniflare copy.

---

## F-001

### F-001 [P0 | BROKEN] Payout create header plus line links not atomic — area payouts — `backend/src/api/admin-payouts.js:123-130`

**File:line + 15-line verbatim excerpt** (`backend/src/api/admin-payouts.js:117-131`):

```
    const totalAmount = payments.reduce((sum, p) => sum + p.net_amount, 0);
    const currency = payments[0].currency;
    const createdBy = c.env.user?.id ?? null;
    const payoutId = crypto.randomUUID().replace(/-/g, '');
    const now = new Date().toISOString();

    await db.prepare(`
      INSERT INTO marketplace_payouts (id, tenant_id, amount, currency, method, status, reference, notes, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
    `).bind(payoutId, tenantId, totalAmount, currency, method, reference ?? null, notes ?? null, createdBy, now).run();

    await Promise.all(paymentIds.map(pid =>
      db.prepare('UPDATE marketplace_payments SET payout_id = ? WHERE id = ?').bind(payoutId, pid).run()
    ));

```

**Exact INSERT-then-UPDATE sequence and order** (proven by read of lines 78-143):
1. `POST /` handler validates IDs (one SELECT at 92-96), then guards (tenant match 104, `captured` 107, `payout_id !== null` 110, channel 113).
2. Computes `totalAmount`, `payoutId`, `now` (117-121).
3. Step A — `await db.prepare('INSERT INTO marketplace_payouts ...').bind(...).run()` at 123-126 (single statement, awaited, NOT in any batch).
4. Step B — `await Promise.all(paymentIds.map(pid => db.prepare('UPDATE marketplace_payments SET payout_id = ? ...').run()))` at 128-130 (N parallel single statements, NOT in any batch).
5. Returns 201 with `{ payout, items: payments }` at 138 (note: `items` is the pre-link SELECT snapshot, not a re-read).

**Single-batch vs sequential-awaits verdict**: SEQUENTIAL AWAITS, no batch. Evidence: zero `db.batch(` calls between lines 78-143; the only `batch(` in the file are the pay handler (233) and cancel handler (275). Contrast pay (233-238) and cancel (275-280), both single `db.batch([...])` units with guarded first UPDATE + `meta.changes` race check (240, 282).

**Resume-pending-payout endpoint search result**: NO resume/retry/repair endpoint exists. Endpoint inventory is closed by the file header (lines 4-11: `GET /eligible`, `POST /`, `GET /`, `GET /:id`, `POST /:id/pay`, `POST /:id/cancel`) plus mount `['/admin/payouts', adminPayoutsRoutes]` (`backend/src/index.js:288`). Grep for `payout_id IS NULL` hits exactly one read site — the eligible query at line 37 (`WHERE mp.payment_status = 'captured' AND mp.payout_id IS NULL AND mp.channel = 'marketplace'`) — plus the cancel-path `SET payout_id = NULL` at line 278. No endpoint lists orphan pending payouts (`GET /` exposes `item_count` subquery at 165 but no zero-link filter), and no endpoint links unlinked rows into an existing pending payout.

**Exact reproduction (code path, no live crash injected)**: `POST /api/admin/payouts` with `{ tenantId, paymentIds: [2+ captured marketplace ids], method }` → Step A commits `marketplace_payouts(status='pending')` → isolate eviction/crash before/during Step B → payout row exists with zero (or partial, since Step B is `Promise.all` of independent UPDATEs — partial linkage is also possible) `marketplace_payments.payout_id` links → `GET /eligible?tenantId=` re-lists the still-`NULL` rows → second `POST /` creates a second pending payout over the same rows → both `POST /:id/pay` succeed independently (pay has no cross-payout overlap guard; it settles whatever `payout_id = ?` rows exist) → double-pay window.

**Falsification actually executed + raw output**:

Command 1: `grep -n "batch\|Promise.all\|\.run()\|\.all()\|\.first()" backend/src/api/admin-payouts.js`
Raw output:
```
5: *   GET  /eligible       — payments eligible for payout (captured + no batch + marketplace)
51:    `).bind(...binds, limit).all();
57:    `).bind(...binds).first();
64:      // eligible window, so the page is the single batch; totalNet is a
96:    `).bind(...paymentIds).all();
126:    `).bind(payoutId, tenantId, totalAmount, currency, method, reference ?? null, notes ?? null, createdBy, now).run();
128:    await Promise.all(paymentIds.map(pid =>
129:      db.prepare('UPDATE marketplace_payments SET payout_id = ? WHERE id = ?').bind(payoutId, pid).run()
160:    const countRow = await db.prepare(`SELECT COUNT(*) as cnt FROM marketplace_payouts p ${where}`).bind(...binds).first();
171:    `).bind(...binds, pageSize, offset).all();
187:    const payout = await db.prepare('SELECT * FROM marketplace_payouts WHERE id = ?').bind(id).first();
200:    `).bind(id).all();
216:    const payout = await db.prepare('SELECT * FROM marketplace_payouts WHERE id = ?').bind(id).first();
226:    const { results: items } = await db.prepare('SELECT * FROM marketplace_payments WHERE payout_id = ?').bind(id).all();
228:    // Single atomic batch: the guarded payout UPDATE is the concurrency lock
231:    // D1 batch always returns one result per statement, so changes 0 on the
233:    const batchResults = await db.batch([
240:    if ((batchResults?.[0]?.meta?.changes ?? 1) !== 1) {
260:    const payout = await db.prepare('SELECT * FROM marketplace_payouts WHERE id = ?').bind(id).first();
270:    const { results: items } = await db.prepare('SELECT id FROM marketplace_payments WHERE payout_id = ?').bind(id).all();
272:    // Guarded UPDATE (AND status='pending') in the same atomic batch as the
274:    // so this batch's first UPDATE hits 0 rows → 409 instead of double-cancel.
275:    const batchResults = await db.batch([
282:    if ((batchResults?.[0]?.meta?.changes ?? 1) !== 1) {
---END-F001-BATCH-GREP---
```
Reading: no `batch(` anywhere in the create path (78-143); the split `run()` (126) + `Promise.all(...run())` (128-130) is confirmed, and `batch(` appears ONLY at 233/275 (pay/cancel). The falsification hypothesis "create is secretly batched" is denied.

Command 2: `grep -rn "payout_id IS NULL\|payout_id.*NULL\|status.*pending.*payout\|resume\|retry.*payout\|rebatch\|re-batch" backend/src/api/admin-payouts.js backend/src/index.js` + `grep -n "admin/payouts\|admin-payouts" backend/src/index.js`
Raw output:
```
backend/src/api/admin-payouts.js:37:    let where = "WHERE mp.payment_status = 'captured' AND mp.payout_id IS NULL AND mp.channel = 'marketplace'";
backend/src/api/admin-payouts.js:278:        db.prepare('UPDATE marketplace_payments SET payout_id = NULL WHERE id = ?').bind(p.id)
---END-RESUME-GREP---
28:import adminPayoutsRoutes from './api/admin-payouts.js';
288:  ['/admin/payouts', adminPayoutsRoutes],
---END-MOUNT-GREP---
```
Reading: the only `payout_id IS NULL` read is the eligible query (the re-batch vector); no resume/retry endpoint exists. The falsification hypothesis "an existing endpoint repairs or blocks the orphan" is denied.

**Chain verdict (step-by-step, withdraw where unproven)**:
- (a) Header INSERT commits before any link UPDATE — PROVEN (123-126 awaited before 128-130).
- (b) Crash between (a) and link UPDATEs leaves `pending` payout with zero links — MECHANISM PROVEN, live crash NOT injected (read-only spec forbids fault injection); held as likely, not certain.
- (c) Eligible rows stay `payout_id NULL` (UPDATEs never ran; `Promise.all` also admits PARTIAL linkage, a worse sub-case: under-linked payout whose amount disagrees with linked sum) — PROVEN by code order + eligible predicate (line 37).
- (d) Same rows re-batchable into a second payout — PROVEN (eligible query has no exclusion for "already covered by a pending payout's amount"; create guard at 110 only rejects rows already linked, not rows whose value is already reserved).
- (e) Both payouts independently payable (double-pay) — PROVEN at code level (pay settles by `payout_id = ?` with no overlap guard); live money movement not executed.
- Nothing withdrawn: every code-level step is proven; only the live-crash trigger itself is unexecuted by design.

**Confidence**: certain (non-atomic split + re-batch vector + no-resume are all directly evidenced); the live double-pay incident itself is likely (requires the crash/eviction trigger, which was not injected).

**P0 verdict**: HOLD.

---

## F-002

### F-002 [P0 | BROKEN] Record-payment ledger and order totals not batched — area payments — `backend/src/api/orders.js:1287-1303`

**File:line + 15-line verbatim excerpt** (`backend/src/api/orders.js:1287-1301`):

```
    await c.env.DB.prepare(
      `INSERT INTO payment_records
         (id, tenant_id, order_id, amount, method, amount_cash, amount_card,
          received_by, approved_by, reference, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      paymentId, tenantId, orderId, amount, method, amountCash, amountCard,
      receivedBy, approvedBy || null, reference || null, notes || null
    ).run();

    const newPaid = Math.round((paidSoFar + amount) * 100) / 100;
    const isFull = newPaid + 0.01 >= total;
    const newStatus = isFull ? 'paid' : (order.payment_status || 'pending');

    await c.env.DB.prepare(
```

(lines 1301-1303 continue: `"UPDATE orders SET amount_paid = ?, payment_status = ?, payment_method = ?, updated_at = datetime('now') WHERE tenant_id = ? AND id = ?"` bound with `(newPaid, newStatus, method, tenantId, orderId)` via `.run()`.)

**Exact reproduction (code path)**: `POST /api/orders/:id/record-payment` with `{ amount, method }` (+ optional idempotency `id`) → idempotency re-check SELECT (1273-1280; only when client sends `id`) → ledger `INSERT INTO payment_records ... .run()` (1287-1295) → derive `newPaid`/`newStatus` (1297-1299) → `UPDATE orders SET amount_paid / payment_status / payment_method ... .run()` (1301-1303) → best-effort `logAudit` (1308-1327, explicitly swallows errors). Crash/eviction between the two `run()` calls leaves the ledger row without the totals flip (or, symmetrically, a retry without the idempotency key double-inserts the ledger while the overpay guard at 1264 reads the stale `amount_paid`).

**Falsification actually executed + raw output**:

Command: `sed -n '1287,1303p' backend/src/api/orders.js` (raw output is the excerpt above, ending):
```
    await c.env.DB.prepare(
      "UPDATE orders SET amount_paid = ?, payment_status = ?, payment_method = ?, updated_at = datetime('now') WHERE tenant_id = ? AND id = ?"
    ).bind(newPaid, newStatus, method, tenantId, orderId).run();
---END-SED-F002---
```

Command: `grep -n "batch\|\.run()" backend/src/api/orders.js` (filtered to the record-payment window and contrast sites):
```
531:    await c.env.DB.batch(stmts);
534:      await c.env.DB.prepare("UPDATE orders SET payment_status = 'paid' WHERE id = ?").bind(ordId).run();
752:    const [insertResult] = await c.env.DB.batch([insertStmt]);
774:      await c.env.DB.batch(itemStmts);
1295:    ).run();
1303:    ).bind(newPaid, newStatus, method, tenantId, orderId).run();
---END-ORDERS-BATCH-GREP--- (full grep ran; shown are the decisive lines: record-payment = two bare .run() at 1295+1303 with no batch between 1220-1330, while the status-flip path batches at 531)
```
Reading: no `batch(` between 1287-1303; the house pattern (batched order+room at 502-531) proves batching was available and omitted here. The falsification hypothesis "the two writes share a batch" is denied.

**Confidence**: certain.

**P0 verdict**: HOLD.

---

## F-003

### F-003 [P0 | BROKEN] Revenue aggregates join on always-NULL column — area reports — `backend/src/api/reports.js:167,265` + `backend/src/routes/pos/index.js:687-693`

**File:line + 15-line verbatim excerpt** (`backend/src/api/reports.js:161-175`, top-products reader):

```
    const { results } = await env.DB.prepare(
      `SELECT p.id, p.name, SUM(oi.quantity) as total_qty,
              SUM(oi.quantity * oi.unit_price) as total_revenue,
              COUNT(DISTINCT o.id) as order_count
       FROM pos_transaction_items oi
       JOIN pos_products p ON p.id = oi.product_id AND p.tenant_id = oi.tenant_id
       JOIN pos_transactions o ON o.id = oi.transaction_id AND o.tenant_id = oi.tenant_id
       WHERE oi.tenant_id = ?
         AND o.created_at >= ?
         AND o.status != 'voided'
       GROUP BY p.id, p.name
       ORDER BY total_qty DESC
       LIMIT ?`
    ).bind(tenantId, cutoffStr, limit).all();

```

Second reader, same defect (`backend/src/api/reports.js:262-266`, revenue-breakdown):

```
      `SELECT p.type, SUM(ti.quantity * ti.unit_price) as revenue, COUNT(DISTINCT o.id) as order_count
       FROM pos_transaction_items ti
       JOIN pos_products p ON p.id = ti.product_id AND p.tenant_id = ti.tenant_id
       JOIN pos_transactions o ON o.id = ti.transaction_id AND o.tenant_id = ti.tenant_id
       WHERE ti.tenant_id = ? AND o.created_at >= ? AND o.status != 'voided'
```

Sole writer (`backend/src/routes/pos/index.js:686-693`) — `transaction_id` is absent from the column list:

```
    for (const row of itemRows) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO pos_transaction_items
            (id, tenant_id, order_id, product_id, quantity, unit_price, subtotal, tax_amount, total_amount, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, datetime('now'), datetime('now'))`
        ).bind(row.id, row.tenantId, row.orderId, row.productId, row.quantity, row.unitPrice, row.subtotal, row.totalAmount)
```

**Exact reproduction (data path)**: POS sale commits `pos_transactions` + `pos_transaction_items(order_id=..., transaction_id=NULL)` → `GET /api/reports/top-products` and `GET /api/reports/revenue-breakdown` INNER JOIN `pos_transactions o ON o.id = oi.transaction_id` → NULL never joins → empty aggregates despite joinable rows via `order_id` (= `pos_transactions.id`, FK-declared).

**Falsification actually executed + raw output**:

Command 1: `grep -rn "transaction_id" backend/src --include="*.js"`
Raw output:
```
backend/src/api/paymob-webhook.js:255:             paymob_transaction_id = ?,
backend/src/api/paymob-webhook.js:260:        ).bind(parsed.transaction_id, orderRef, tenantId).run();
backend/src/api/paymob-webhook.js:277:                marketplace_fee, net_amount, currency, paymob_transaction_id,
backend/src/api/paymob-webhook.js:283:            pm.currency || 'EGP', parsed.transaction_id,
backend/src/api/paymob-webhook.js:291:          console.log(`[PAYMOB WEBHOOK] Booking order ${orderRef} marked paid (txn ${parsed.transaction_id})`);
backend/src/api/paymob-webhook.js:320:             paymob_transaction_id = ?,
backend/src/api/paymob-webhook.js:324:        ).bind(parsed.transaction_id, orderRef, tenantId).run();
backend/src/api/paymob-webhook.js:335:                marketplace_fee, net_amount, currency, paymob_transaction_id,
backend/src/api/paymob-webhook.js:341:            pm.currency || 'EGP', parsed.transaction_id,
backend/src/api/paymob-webhook.js:349:          console.log(`[PAYMOB WEBHOOK] Storefront order ${orderRef} marked paid (txn ${parsed.transaction_id})`);
backend/src/api/reports.js:167:       JOIN pos_transactions o ON o.id = oi.transaction_id AND o.tenant_id = oi.tenant_id
backend/src/api/reports.js:265:       JOIN pos_transactions o ON o.id = ti.transaction_id AND o.tenant_id = ti.tenant_id
backend/src/services/paymob.js:164: *             transaction_id: string|null }}
backend/src/services/paymob.js:172:      return { id: null, pending: null, success: null, amount_cents: null, order: null, hmac: null, transaction_id: null };
backend/src/services/paymob.js:176:      return { id: null, pending: null, success: null, amount_cents: null, order: null, hmac: null, transaction_id: null };
backend/src/services/paymob.js:187:    transaction_id: obj.id ? String(obj.id) : null,
---END-TXID-GREP---
```
Reading: zero writers of the `pos_transaction_items.transaction_id` column anywhere in `backend/src` (the 10 other hits are gateway `paymob_transaction_id`/parsed fields, not this column); exactly two readers (reports 167, 265). The falsification hypothesis "some other path binds transaction_id" is denied.

Command 2 (read-only sqlite, `mode=ro`, local miniflare copy):
```
null_tx: (119,)
total_items: (119,)
```
plus DDL `transaction_id TEXT,` (nullable, no default) and:
```
joinable_via_order_id: (119,)
```
Reading: 119/119 rows NULL (reproduces the "119 of 119" tally), and all 119 join via `order_id` — the join key is confirmed wrong, not the data. The falsification hypothesis "rows are missing/orphaned rather than mis-joined" is denied.

**Confidence**: certain.

**P0 verdict**: HOLD.

---

## F-004

### F-004 [P0 | BROKEN] Status-driven paid leaves amount at zero — area orders — `backend/src/api/orders.js:533-535` + `backend/src/api/orders.js:1212-1214`

**File:line + 15-line verbatim excerpt** (`backend/src/api/orders.js:521-535`, status-flip block):

```
          `UPDATE rooms_new SET status = 'available', room_status = 'available', updated_at = datetime('now')
           WHERE id = ?
             AND id NOT IN (
               SELECT DISTINCT room_id FROM orders
               WHERE tenant_id = ? AND room_id = ? AND id != ? AND order_state_id != 'cancelled'
             )`
        ).bind(existing.room_id, tenantId, existing.room_id, ordId)
      );
    }

    await c.env.DB.batch(stmts);

    if (state.paid) {
      await c.env.DB.prepare("UPDATE orders SET payment_status = 'paid' WHERE id = ?").bind(ordId).run();
    }
```

Self-documenting divergence (`backend/src/api/orders.js:1212-1214`, record-payment comment):

```
 // - Full payment (new paid total within a penny of total) flips
 //   payment_status='paid' AND sets amount_paid (unlike the admin status flip,
 //   which leaves amount_paid stale). order_state_id / room lifecycle are NOT
```

**Exact reproduction (code path)**: `PATCH /api/orders/:id/status` with `{ status: <state whose order_state.paid=1> }` on an order with `amount_paid=0` → lifecycle guard (487-497) → batched order+room flip (502-531) → `if (state.paid)` sets ONLY `payment_status='paid'` (533-535; no `amount_paid`, no tenant predicate on that UPDATE) → order reads paid with `amount_paid` zero → revenue/balance/payout-eligibility reads that trust the amount disagree with status.

**Falsification actually executed + raw output**:

Command: `grep -n "amount_paid" backend/src/api/orders.js`
Raw output (decisive lines):
```
534:       await c.env.DB.prepare("UPDATE orders SET payment_status = 'paid' WHERE id = ?").bind(ordId).run();
1213://   payment_status='paid' AND sets amount_paid (unlike the admin status flip,
1214://   which leaves amount_paid stale). order_state_id / room lifecycle are NOT
1302:      "UPDATE orders SET amount_paid = ?, payment_status = ?, payment_method = ?, updated_at = datetime('now') WHERE tenant_id = ? AND id = ?"
```
(full grep returned 20 hits: schema optionals at 30/52, reads at 370/389/630/683/706, INSERT at 737-748, PUT at 908-917, record-payment at 1255-1348; NONE assigns `amount_paid` inside `PATCH /:id/status` 466-541 except the absent one at 533-535.)
Reading: the status handler's only write after the batch is the amount-less flip at 534, while record-payment sets both at 1302; the file itself names the divergence at 1213-1214. The falsification hypothesis "the status path sets the amount somewhere (trigger/another statement)" is denied — no trigger mechanism exists in D1, and no second UPDATE is present.

**Confidence**: certain.

**P0 verdict**: HOLD.

---

## U-001..U-014 one-line triage

- U-001 Hardcoded store 1 FK status — confirm: `PRAGMA foreign_key_list(pos_transactions)` (read-only) + `SELECT id FROM pos_stores` on local `mode=ro` copy and read `reservations.js:413-424` (literal `store_id 1` in POS-mirror INSERT); deny: read `routes/pos/index.js:619-629` (fresh-DB fallback lookup + comment "Store id 1 was the pre-0051 seed store; on a fresh DB it does not exist"); best guess: likely real on fresh DBs (mirror path has no fallback), false-positive only where store 1 is seeded.
- U-002 Customer dedupe race — confirm: read-only DDL `SELECT sql FROM sqlite_master WHERE name='customers'` shows NO UNIQUE on email/phone (verified: `email TEXT, phone TEXT` plain); deny: find UNIQUE/upsert in `reservations.js:109-151` or migration; best guess: likely real (no DB guard; app-level find-or-create only).
- U-003 Public menu keyed by path id — confirm: read `meal-plans.js:17-44` (path `id` → project → `tenant_org_mapping` → `pos_products WHERE category_id=? AND organization_id=?`); deny: show a direct tenant predicate on the product read; best guess: likely false-positive as a vuln (tenant scoping exists via project→org indirection), open as a product decision (path-id keying vs scope-plus-id).
- U-004 Onboarding token entropy and PII — confirm: `grep -n "onboarding_token\|randomUUID" backend/src/api/onboarding.js` (generation `crypto.randomUUID()` at line 88; status handler returns email+profile at 148-184 verified by read; single-use burn `onboarding_token=NULL` at line 232); deny: show expiry on `onboarding_token` itself (only `auto_login_token` has 24h expiry at 241-245) or auth gate on status route; best guess: plausible real (UUIDv4 entropy OK; PII-on-token-knowledge + no token expiry is the residual risk).
- U-005 Astro health shape — confirm: read `app/src/pages/api/health.ts` (file exists, verified by `ls`); deny: n/a (file read closes it); best guess: open, one read away.
- U-006 Meal-schedule GET/DELETE validation — confirm: read `meal-schedules.js` head/tail (GET builds tenant-bound query; POST schema + tenant-scoped meal/camp checks verified at file mid-section); deny: show missed query/path schemas via `grep -n "schema\|safeParse\|z.object" backend/src/api/meal-schedules.js`; best guess: likely false-positive (tenant binds observed), tail read still owed.
- U-007 Order payments list shape — confirm: read `orders.js:1181-1197` (already read: tenant-scoped existence guard + `SELECT * ... ORDER BY created_at ASC, id ASC`, NO paging params); deny: show paging/fencing missed past line 1220; best guess: shape confirmed (unpaged full list = at most P2, not P0).
- U-008 POS tables in-router admin gate — confirm: read `backend/src/api/pos-tables.js:66-78` (in-router mutation gate: tenant context + `['admin','super_admin']` else 401/403, verified) and mount `index.js:784-787` (dual-scope + limiter); deny: show a mutation without the gate; best guess: likely false-positive (gate exists; note file lives at `src/api/pos-tables.js`, NOT `src/routes/pos/pos-tables.js` — the report path is wrong).
- U-009 Pillar read filters + report params — confirm: trace each pillar GET filter to bound use (`financials.js` has 20 GET/get hits) + each `admin-reports.js` template `parameters`/`format` consumer; deny: show allowlist coverage constraining them; best guess: open (write schemas confirmed only).
- U-010 Empty-table invariants in production — confirm: seed/staging run + trace write paths (locally `invoices:(0,)`, `payment_records:(0,)` verified vacuous); deny: show code-level coherence guards without DDL; best guess: open, needs seeded staging (locally untestable by construction).
- U-011 Privilege/looseness tails — confirm: `SELECT sql FROM sqlite_master WHERE name='rooms_new'` (verified: `tenant_id TEXT` nullable, no FK) + auth-scope test for detached admins + reader grep for mapping joins + `camp_id` NULL census (local `orders:(24, 0)` — 0 NULL camp_id, which disagrees with the report's "43 of 43 NULL" and needs a table/predicate check); deny: show role-keyed (not NULL-tenant-keyed) role logic + all readers joining correctly; best guess: mixed (rooms_new looseness confirmed; camp_id claim needs re-census).
- U-012 Frontend tails — confirm: targeted greps+reads (`ReportsPanel campIds` below line 80, `CampsSection` `[]` handling, index tenant-null-vs-throw, Dashboard mid-section errors, 7 dead-export caller search, public tenant path route-existence, automation toggle verbs, 200-with-false bulk semantics); deny: show downstream uses/callers per tail; best guess: open (all tails unread this pass).
- U-013 Format parity tails — confirm: fixture queries + call-site enumeration (mixed timestamp lexicographic compare, JS-vs-SQL day truncation TZ edges, space-vs-ISO round-trip, penny fixture, stored coercion, `project_id`-vs-`camp_id` divergence query, lenient scope call sites, POS-users precedence); deny: show shared helper/test pinning parity; best guess: open.
- U-014 Runtime-only flows + env state — confirm: browser trace (wizard click order, receipt print after POS create, Broadcaster delivery) + staging migration apply + live DDL diff (`0111`-`0113` vs local ledger head `0110`); deny: show UI-order docs/delivery polling covering the window; best guess: open (runtime-only by definition).

---

## Return summary

- P0 verdicts: F-001 HOLD (certain) / F-002 HOLD (certain) / F-003 HOLD (certain) / F-004 HOLD (certain). F-001 chain: INSERT-before-UPDATEs proven, no-batch proven, eligible re-batch vector proven (`payout_id IS NULL` sole reader), no resume endpoint proven (6-endpoint inventory closed); only the live crash trigger is unexecuted (read-only constraint), so the incident is likely while every code-level step is certain. Nothing withdrawn.
- Confidence list: F-001 certain / F-002 certain / F-003 certain / F-004 certain.
- File path: `.opencode/audits/full-audit-2026-09-24/01-verification.md` (this file).
