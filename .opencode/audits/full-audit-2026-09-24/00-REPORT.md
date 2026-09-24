# Full Audit 2026-09-24 — Pass 8 Synthesis (00-REPORT)

- Date: 2026-09-24
- Repo: /home/michael/devin/opencode-workspace/sinaicamps
- Mode: READ-ONLY synthesis. No source modified, no D1 writes, no deploy.
- Spec: `.opencode/agents/tmp/2026-09-24-pass8-synthesis.md`
- Inputs: `01-surface.md`, `02-routes.md`, `03-flows.md`, `04-data-integrity.md`, `05-security.md`, `06-frontend.md`, `07-inconsistencies.md` (all 7 present, no gap)
- Method: Read-only dedupe of passes 1–7, severity assignment, falsification review. No live probes.

> Note on wording: backend/frontend identifiers that contain the common r-word for sign-up are paraphrased below (for example sign-up schema, alias mount fn, sign-up page) while file paths and line numbers stay exact so every item remains traceable.

## Summary

- Total confirmed findings (F): **51**
- P0 (prod-down / cross-tenant / money loss): **4**
- P1 (silent failure / revenue / wrong data shown): **17**
- P2 (gap / contract drift / convention-only guard): **18**
- P3 (debt / docs / cosmetic / transitional): **12**
- UNVERIFIED hypotheses (U): **14 grouped items** (need runtime or DB check, not counted as findings)
- Zero-finding categories: **none** — all six categories (BROKEN / MISSING / MISPLACED / INCONSISTENT / DEAD / UNGUARDED) have at least one finding.
- Zero confirmed cross-tenant read bypasses (Pass 5 verdict holds; two observations remain UNVERIFIED, see U-003/U-004).

## Top 10 (most severe first)

1. F-001 [P0] Payout create header plus line links not atomic — double-batch risk — `backend/src/api/admin-payouts.js:123-130`
2. F-002 [P0] Record-payment ledger INSERT and order UPDATE not batched — `backend/src/api/orders.js:1287-1303`
3. F-003 [P0] Revenue reports join on always-NULL column, empty aggregates despite 119 rows — `backend/src/api/reports.js:167,265`
4. F-004 [P0] Status flip to paid leaves amount Paid at zero — `backend/src/api/orders.js:533-535`
5. F-005 [P1] Intention-id persist after order commit, throw leaves order without intention — `backend/src/api/reservations.js:501-503` + `backend/src/api/storefront.js:406-408`
6. F-006 [P1] Reservation items batch and POS mirror batch split — `backend/src/api/reservations.js:428-429`
7. F-007 [P1] Storefront Paymob failure status kept only in JSON, DB stays pending — `backend/src/api/storefront.js:389-403`
8. F-008 [P1] Storefront admin orders reads booking table, not storefront orders — `backend/src/api/storefront.js:800-809`
9. F-009 [P1] POS race compensation swallows its own failure — `backend/src/routes/pos/index.js:752-753`
10. F-010 [P1] POS promo failure silent, sale at full price with no signal — `backend/src/routes/pos/index.js:503-505`

## Findings by Category

Categories: BROKEN (wrong result on exercised path) / MISSING (absent write, guard, index, endpoint, UI branch) / MISPLACED (logic in wrong table or layer) / INCONSISTENT (dual names, formats, contracts, duplicated logic) / DEAD (unused column, export, stub, transitional mirror) / UNGUARDED (missing check allows bad state, silent catch, manual-only validation).

- BROKEN (15): F-001, F-002, F-003, F-004, F-005, F-006, F-007, F-012, F-013, F-014, F-016, F-017, F-018, F-020, F-021, F-047 (16 total; F-047 is P3 cosmetic but still wrong output)
- MISSING (10): F-011, F-015, F-024, F-025, F-028, F-030, F-031, F-048, F-049, F-008? No, F-008 is MISPLACED. Corrected MISSING list: F-011, F-015, F-024, F-025, F-028, F-030, F-031, F-048, F-049
- MISPLACED (1): F-008
- INCONSISTENT (10): F-019, F-033, F-034, F-035, F-036, F-040, F-041, F-042, F-043, F-051
- DEAD (4): F-039, F-044, F-045, F-046
- UNGUARDED (11): F-009, F-010, F-022, F-023, F-026, F-027, F-029, F-032, F-037, F-038, F-050

Recount for accuracy (51 total):
BROKEN: F-001, F-002, F-003, F-004, F-005, F-006, F-007, F-012, F-013, F-014, F-016, F-017, F-018, F-020, F-021, F-047 = 16
MISSING: F-011, F-015, F-024, F-025, F-028, F-030, F-031, F-048, F-049 = 9
MISPLACED: F-008 = 1
INCONSISTENT: F-019, F-033, F-034, F-035, F-036, F-040, F-041, F-042, F-043, F-051 = 10
DEAD: F-039, F-044, F-045, F-046 = 4
UNGUARDED: F-009, F-010, F-022, F-023, F-026, F-027, F-029, F-032, F-037, F-038, F-050 = 11
16+9+1+10+4+11 = 51. Zero-finding categories: none.

## Findings by Area

- payouts / money lifecycle: F-001, F-028
- payments / ledger: F-002, F-039
- reports / analytics: F-003, F-016
- orders / booking core: F-004, F-011, F-012, F-020, F-025 (convert touches orders)
- reservations / public booking: F-005, F-006, F-021
- storefront: F-007, F-008
- pos terminal: F-009, F-010
- onboarding / tenants: F-013, F-014
- admin-ui: F-015, F-016, F-032, F-048
- public-ssr / pages: F-017, F-018, F-047
- money math / pricing: F-019, F-033, F-041
- services: F-022, F-023, F-024
- crm / leads: F-025, F-026, F-027
- db-schema / indexes: F-011, F-020, F-029, F-030, F-031, F-045, F-050, F-051
- api-contract / validation / routing: F-034, F-035, F-036, F-037, F-038, F-040, F-042, F-043, F-044, F-046, F-049

---

## Findings (F-001 onwards, most severe first)

### F-001 [P0 | BROKEN] Payout create header plus line links not atomic — area payouts — `backend/src/api/admin-payouts.js:123-130`
- Evidence: `INSERT marketplace_payouts (pending)` via single `run()` at 123-126 then per-payment `UPDATE marketplace_payments SET payout_id` via parallel `run()` at 128-130 with no `batch()` wrapping both.
- Impact: Crash between header and links leaves pending payout with zero links while eligible rows stay `payout_id NULL` and can be re-batched into a second payout, a manual-review-only double-pay window.
- Falsification: Read shows no `DB.batch()` wrapping both steps while pay at 233-238 and cancel at 275-280 are single batches, so the split is real and not a misread.
- Fix direction: Wrap header INSERT and all line UPDATEs in one atomic batch so either all links land or none do.

### F-002 [P0 | BROKEN] Record-payment ledger and order totals not batched — area payments — `backend/src/api/orders.js:1287-1303`
- Evidence: `INSERT INTO payment_records` at 1287-1295 via `run()` then `UPDATE orders SET amount_paid / payment_status` at 1297-1303 via a second `run()` with no batch.
- Impact: Worker crash or isolate eviction between the two leaves a ledger row without the `amount_paid` flip so `total minus paid` disagrees with the ledger sum and later overpay guards misfire.
- Falsification: Contrast `PATCH /:id/status` at 502-531 which batches order plus room, proving batching is the house pattern and its absence here is an omission.
- Fix direction: Persist the ledger row and the order totals flip in one batch keyed by the idempotency key.

### F-003 [P0 | BROKEN] Revenue aggregates join on always-NULL column — area reports — `backend/src/api/reports.js:167,265` + `backend/src/routes/pos/index.js:687-693`
- Evidence: Writer INSERTs `(id, tenant_id, order_id, …)` and never binds `transaction_id` while readers join `pos_transactions o ON o.id = ti.transaction_id` at reports 167 (top-products) and 265 (revenue-breakdown), and local tally shows 119 of 119 `transaction_id IS NULL` with zero writers and two readers.
- Impact: Both endpoints return empty aggregates in production despite 119 joinable rows via `order_id`, so revenue and top-product views are silently blank.
- Falsification: The 10 other `transaction_id` hits are gateway variables in `paymob.js` and `paymob-webhook.js`, not this column, and the FK list shows `order_id` equals `pos_transactions.id`, so the join key is confirmed wrong.
- Fix direction: Join item aggregates on `order_id` and add an index on that live join key.

### F-004 [P0 | BROKEN] Status-driven paid leaves amount at zero — area orders — `backend/src/api/orders.js:533-535` + `backend/src/api/orders.js:1212-1214`
- Evidence: `PATCH /orders/:id/status` flips `payment_status` to paid when the state map says paid but assigns no `amount_paid`, a gap the file itself documents near 1212-1214.
- Impact: Status-driven paid orders report paid with `amount_paid` zero, breaking revenue, balance, and payout eligibility reads that trust the amount.
- Falsification: Read both blocks shows no amount assignment in the status handler while the record-payment path sets both, so the divergence is confirmed.
- Fix direction: Keep amount and status flips on one path so paid always implies a matching amount.

### F-005 [P1 | BROKEN] Intention persist after commit can 500 without intention — area reservations/storefront — `backend/src/api/reservations.js:501-503` + `backend/src/api/storefront.js:406-408`
- Evidence: Order plus items already committed via `batch()` at reservations 357 and 428-429 (storefront snapshot batch at 292-334) before `UPDATE orders SET payment_intent_id` at 501-503 (storefront 406-408), and a throw there returns 500 `Failed to create reservation` at 518-520.
- Impact: Guest is charged nothing yet sees failure while the order and items persist with no Paymob intention, so retry creates a duplicate or an orphan pending order.
- Falsification: `grep intention` shows only create plus webhook persist with no retry-intention endpoint, and steps 10 to 14 sit inside one try whose batches already committed, so no compensation exists.
- Fix direction: Expose a safe re-attach for payment intention on an existing order reference.

### F-006 [P1 | BROKEN] Reservation items and POS mirror in separate batches — area reservations — `backend/src/api/reservations.js:428-429` vs `:357`
- Evidence: Two sequential `await DB.batch()` calls, one for `order_items` at 403-410 and one for `pos_transactions` mirror at 413-424, with no shared transaction.
- Impact: Second batch failure orphans meal items without a POS mirror or vice versa, and totals diverge because meal totals are added inside the item batch.
- Falsification: D1 batch atomicity is per call only, and no rollback of the first batch exists on second failure, so the orphan window is real.
- Fix direction: Commit order items and their POS mirror rows in one atomic batch.

### F-007 [P1 | BROKEN] Storefront Paymob failure not stored — area storefront — `backend/src/api/storefront.js:389-403`
- Evidence: The catch block returns `paymentStatus payment_failed` only in JSON with no `UPDATE storefront_orders`, unlike the reservation path which persists `payment_failed` at `reservations.js:481-483`, so a later `GET /orders` still shows pending.
- Impact: Operators cannot distinguish never-attempted pending from failed-at-gateway pending and guests retry blindly.
- Falsification: Read shows a direct return inside catch with no UPDATE, and the contrast path proves persistence was intended elsewhere.
- Fix direction: Persist gateway failure status on the storefront order before returning the fallback envelope.

### F-008 [P1 | MISPLACED] Storefront admin orders reads wrong table — area storefront — `backend/src/api/storefront.js:800-809`
- Evidence: `GET /admin/orders` under the storefront admin section runs `SELECT * FROM orders WHERE tenant_id` while storefront orders live in `storefront_orders`.
- Impact: Storefront orders are invisible in their own admin list and staff must use session-scoped reads or the webhook ledger instead.
- Falsification: Read of the SQL under the storefront admin section confirms the table name, and storefront checkout writes only `storefront_orders`, so the mismatch is not a naming alias.
- Fix direction: Point the storefront admin orders read at the storefront order tables.

### F-009 [P1 | UNGUARDED] POS race compensation swallows failure — area pos — `backend/src/routes/pos/index.js:752-753`
- Evidence: Short-deduction compensation runs `await batch(compensate).catch(()=>{})` with no retry or rethrow while the normal batch at 713 propagates errors.
- Impact: Failed compensation leaves the orphan order it was meant to delete, with stock partly restored and sale rows partly removed.
- Falsification: Read shows the preceding DELETE statements are the only orphan cleanup and the empty catch removes the only error signal.
- Fix direction: Surface compensation failure loudly and leave the order marked for manual review instead of silent success.

### F-010 [P1 | UNGUARDED] POS promo failure proceeds at full price silently — area pos — `backend/src/routes/pos/index.js:503-505`
- Evidence: Promo lookup wrapped in bare `catch {}` with comment never fail the order, and response at 818-821 carries `appliedPromotions` with no promo-error field.
- Impact: Terminal cannot tell no promo from promo system down, so guests overpay silently during promo outages.
- Falsification: Read shows no warning field in the response shape and no log-to-terminal path, so the silence is structural.
- Fix direction: Add an explicit promo-unavailable flag to the sale response when the lookup fails.

### F-011 [P1 | MISSING] Order line writes omit project id — area orders — `backend/src/api/orders.js:762,824` + `backend/src/api/reservations.js:404`
- Evidence: All three INSERT column lists lack `project_id` while local DDL shows `project_id TEXT NOT NULL` with no default and no triggers on `order_items`, and `0111` relaxes to nullable on applied envs.
- Impact: Locally any order with items aborts on NOT NULL and on relaxed envs the same writes accumulate NULL project rows that defeat the backfill intent.
- Falsification: `PRAGMA table_info` shows no default and `sqlite_master` shows no triggers that could fill the column, so no hidden filler exists.
- Fix direction: Bind project id on every order-item INSERT from the parent order scope.

### F-012 [P1 | BROKEN] Order payment status NULL defeats default and filters — area orders — `backend/src/api/orders.js:746-749` + `backend/src/api/inbox.js:78`
- Evidence: Create path binds `payment_status || null` so the DDL default pending never fires, local tally shows 23 of 24 NULL, and inbox filters `payment_status = ?` which NULL rows never match.
- Impact: Almost all orders are invisible to every status filter while `orders.js:1299` tolerates NULL via fallback, hiding the drift from most reads.
- Falsification: Code read proves the default cannot fire when NULL is bound explicitly, and the inbox predicate confirms NULL exclusion in SQL semantics.
- Fix direction: Stop binding NULL for payment status so the column default applies consistently.

### F-013 [P1 | BROKEN] Onboarding setup completion split across writes — area onboarding — `backend/src/api/onboarding.js:221-245`
- Evidence: Profile UPDATE at 221-227 then tenant activate plus token clear then admin activate then auto-login token across four `run()` calls with no batch.
- Impact: Crash after tenant activate but before admin activate leaves a live tenant whose admin cannot log in with no reuse token.
- Falsification: Read shows four awaits and the file itself notes the token is cleared, while signup at 98-128 uses one batch, proving atomicity was possible.
- Fix direction: Complete tenant activation and admin activation in one atomic batch.

### F-014 [P1 | BROKEN] Super-admin tenant create split across writes — area tenants — `backend/src/api/tenants.js:213-244`
- Evidence: `INSERT tenants active` at 213-225 via `run()` then `INSERT admins active` at 234-244 via a second `run()` with no batch and a required admin password check at 229-231 between them.
- Impact: Crash between the two leaves an admin-less active tenant that passes the public active filter at 109 and 168.
- Falsification: Contrast onboarding signup batch at `onboarding.js:98-128` shows the safe pattern, and no cleanup of the orphan tenant exists on admin INSERT failure.
- Fix direction: Create tenant and its first admin rows atomically.

### F-015 [P1 | MISSING] Health panel has no error branch — area admin-ui — `app/src/components/admin/SystemHealthPanel.tsx:23-24,61-69,98-136`
- Evidence: Destructure takes only `data` and `isLoading` with `?? unknown`, `?? N/A`, and `metrics ?? []` fallbacks, and full 174-line read shows no `error`, `isError`, toast, EmptyState, or retry string.
- Impact: Backend outage renders unknown and all-zero charts with no message or retry, indistinguishable from healthy-but-idle.
- Falsification: Full-file string search confirms absence of error handling, so the gap is verified rather than a read-window miss.
- Fix direction: Render an explicit error state with retry when health or metrics queries fail.

### F-016 [P1 | BROKEN] Reports ignore selected camp scope — area admin-ui — `app/src/components/admin/ReportsPanel.tsx:22,28-34`
- Evidence: Props accept `campIds` and `camps` at 22 but the three report queries at 28-34 send only date params with no camp or project argument and transforms at 48-80 narrow display fields only.
- Impact: Selecting camp A versus B shows identical tenant-wide occupancy, revenue, and bookings, misleading multi-camp operators.
- Falsification: Lines 22-34 positively show the prop is accepted but unused in query args, though use below line 80 was not fully traced and is tracked as U-012.
- Fix direction: Scope report queries by the selected camp ids or remove the scope control.

### F-017 [P1 | BROKEN] Server failure shown as branded not-found — area public-ssr — `app/src/pages/book.astro:15-22,46-47` + siblings `menu.astro:18-27,54` + `camp/[id]/menu.astro:20-29,41` + `storefront/*.astro:15-18,38-40`
- Evidence: `try { ssrFetch } catch` leaves tenant null and the template renders `forbidden || !tenant` as ZoneGuard 404, verified full-read on `book.astro` 58 lines with grep parity on siblings.
- Impact: Stopping the backend turns valid tenant pages into not-found pages, so operators misdiagnose outage as bad URL.
- Falsification: Positive on the full-read file and sibling grep hits for the same catch plus guard pattern, with per-file line parity beyond grep tracked as unverified tail.
- Fix direction: Distinguish fetch failure from missing tenant and render an outage with retry.

### F-018 [P1 | BROKEN] Marketplace failure renders silent empty grid — area public-ssr — `app/src/pages/camps.astro:20-31,102`
- Evidence: Catch assigns `tenants = []` with console-only logging and renders `CampsSection tenants={[]} ssrRendered={false}` at 102 with no error banner or retry in the page.
- Impact: Blocking the public tenant list returns 200 with hero plus empty grid, hiding the outage from visitors and operators.
- Falsification: Page fully read 105 lines confirms no error UI in the page, though downstream empty handling inside `CampsSection` was not opened and is tracked as U-012.
- Fix direction: Show a load-failure state with retry when the directory fetch fails.

### F-019 [P1 | INCONSISTENT] Money rounding differs by path — area money — `backend/src/routes/pos/index.js:433,465,543-544` + `backend/src/api/orders.js:718-720` vs `backend/src/api/storefront.js:212,252` + `backend/src/api/reservations.js:297,401`
- Evidence: POS and order-create round `qty times unit price` via `Math.round times 100 over 100` while storefront cart add and reservation meal totals multiply unrounded, and Paymob converts via `Math.round effectiveTotal times 100` at `reservations.js:459` and `storefront.js:369` with the signed cross-check at `paymob-webhook.js:124-125`.
- Impact: Identical carts can total a cent apart across endpoints and trip the fail-closed amount gate into manual review with capture skipped.
- Falsification: Read of both rounded and unrounded sites confirms the same concept with different rounding, with no shared helper and no penny fixture run.
- Fix direction: Route every money multiplication through one shared rounding helper.

### F-020 [P1 | BROKEN] Live DB still has NOT NULL plus SET NULL conflict — area db-schema — `backend/migrations/0111_fix_project_id_set_null_contradiction.sql:1-18` + live `PRAGMA table_info(order_items)`
- Evidence: Local ledger head is `0110` so `0111` and `0112` and `0113` are not applied, and live DDL still shows `order_items.project_id TEXT NOT NULL` with `ON DELETE SET NULL`, a combination file `0111` fixes at the file level.
- Impact: Any local project delete hitting a NOT NULL child fails instead of nulling, and the local copy disagrees with file HEAD about 11 tables.
- Falsification: Live `PRAGMA` treated as authoritative over file text with the skew reported, and `0111:41-43` documents the DROP interplay, so the env-only breakage is confirmed locally.
- Fix direction: Apply pending migrations to the local copy and gate deploys on live DDL diff.

### F-021 [P1 | BROKEN] Booking redirect points at missing page — area reservations — `backend/src/api/reservations.js:477`
- Evidence: `redirectionUrl` uses `origin/booking/reference/confirmation` while `grep confirmation app/src/pages` returns only `storefront/order/[orderNumber]/confirmation.astro` with no booking route file.
- Impact: Guests finishing a booking follow a dead confirmation link after payment setup, breaking trust at the money moment.
- Falsification: Page search confirms absence of the target file, unlike the storefront path at `storefront.js:387` which points at an existing page.
- Fix direction: Point the booking redirect at an existing confirmation route.

### F-022 [P2 | UNGUARDED] Service assignment accepts any worker and any status — area services — `backend/src/api/services.js:300-315`
- Evidence: Handler SELECTs only the booking at 307-309 then UPDATEs `assigned_worker_id` with only presence check and no worker existence, tenant, or terminal-status guard.
- Impact: Bookings can be assigned to unknown workers or to completed and canceled bookings with no error.
- Falsification: Contrast item-create at 165-168 which verifies definition ownership, proving the check pattern exists but was not applied here.
- Fix direction: Validate worker identity and booking status before assignment.

### F-023 [P2 | UNGUARDED] Service reviews need no completed booking — area services — `backend/src/api/services.js:385-404`
- Evidence: Handler verifies the item at 394-397 but never reads `service_bookings`, and `booking_id` is optional passthrough at 402 with only rating range checked.
- Impact: Fake five-star reviews need no booking, poisoning marketplace trust signals.
- Falsification: Read confirms no booking lookup exists in the review path, so the gap is structural rather than a missed branch.
- Fix direction: Require proof of a completed booking for the reviewed item.

### F-024 [P2 | MISSING] Availability slots never consumed — area services — `backend/src/api/services.js:246-264` vs `:335-352,:355`
- Evidence: Booking guard checks `service_bookings` same item plus date equality at 247-255 while slots live in `service_availability` with only insert at 335 and manual delete at 355 and no UPDATE or DELETE on booking.
- Impact: Slot inventory and double-book prevention are disjoint systems, so slots overbook silently.
- Falsification: File-wide search shows no write to the availability table from the booking path, confirming the disconnect.
- Fix direction: Consume or lock the matching availability slot inside the booking write.

### F-025 [P2 | MISSING] Lead convert has no single call — area crm — `backend/src/api/leads.js:152-174` + `backend/src/api/crm.js:158-191` + `backend/src/api/orders.js:698-874`
- Evidence: Status flip plus contact create plus order create are three independent HTTP calls, and `grep convert` returns only the status enum at `leads.js:38` and a report counter at `admin-reports.js:163` with no cross-table handler.
- Impact: Interrupt between calls leaves converted lead with no contact or order, or an order with a still-new lead, while reports count converted regardless.
- Falsification: No handler writes across leads to contacts to orders in one batch, so partial convert is unavoidable on failure.
- Fix direction: Provide one convert call that flips status and creates contact and order together.

### F-026 [P2 | UNGUARDED] Opportunity lead reference never checked — area crm — `backend/src/api/crm.js:326-355`
- Evidence: Handler destructures `leadId` and INSERTs `leadId || null` with no `SELECT crm_leads`, unlike `POST /crm/leads` which checks contact at 269-272.
- Impact: Dangling lead ids accumulate and later joins silently drop opportunity context.
- Falsification: Read shows no existence check in the 326-355 block, so the contrast proves omission rather than style.
- Fix direction: Verify the referenced lead belongs to the tenant before insert.

### F-027 [P2 | UNGUARDED] Lead and opportunity moves have no transition guard — area crm — `backend/src/api/crm.js:293-312,357-376`
- Evidence: Both PATCHes do direct `UPDATE SET status` or stage after existence check with no machine, allowing new to won directly, while `crm_tasks` at 449-452 and orders status enforce transitions.
- Impact: Pipelines can skip required stages with no audit trail of skipped work.
- Falsification: Read confirms absence of a transition table in both blocks while sibling paths show the house pattern.
- Fix direction: Enforce a legal-transition map on lead and opportunity moves.

### F-028 [P2 | MISSING] Payouts have no reconcile or auto-settle — area payouts — `backend/src/api/admin-payouts.js:30-74` + `backend/src/api/financials.js:500-512` + `backend/wrangler.toml`
- Evidence: Tenant history at `financials.js:500-512` is SELECT only, `grep reconcile` returns no handler, and `wrangler.toml` plus `scheduled(` search show zero cron or queue bindings with only an in-memory scheduledReports Map.
- Impact: Captured-but-never-batched, mismatch-acked, and settled rows are only observable via lists, and payouts never auto-create or settle without manual clicks.
- Falsification: Ledger idempotence via `WHERE NOT EXISTS order_reference` is confirmed, but no writer closes the loop for mismatches or aging captured rows.
- Fix direction: Add a tenant-visible reconcile write for mismatches and aging captures.

### F-029 [P2 | UNGUARDED] Line and mapping tables scoped by join only — area db-schema — schema `order_items` + `cart_items` + `invoice_lines` + `payroll_lines` + `purchase_order_lines` + `storefront_order_items` + `ticket_comments` + `pos_stores` + `pos_organizations`
- Evidence: None of the seven line tables carries `tenant_id` and neither store nor org table does, so isolation depends on joining the parent while `0105:179-184` explicitly leaves store-to-project binding convention-only with one local mapping row.
- Impact: Any query missing the parent or mapping join leaks cross-tenant rows with no DDL backstop, and `order_items` is the hottest such table.
- Falsification: DDL reads confirm absence of the column and Pass 5 shows the guard-then-read pattern is correct but convention-only, with store readers not exhaustively audited.
- Fix direction: Add tenant scoping tests for every line-table read path.

### F-030 [P2 | MISSING] Many FKs lack indexes including hot paths — area db-schema — live `sqlite_master` parse, 31 MISSes
- Evidence: Unindexed FKs include `orders.customer_id`, `orders.table_id`, `pos_transactions.table_id`, `project_tags` both keys, `storefront_orders.customer_id`, `tickets.contact_id`, plus zero indexes at all on `leave_types` and none on junction tables `marketplace_project_categories` and `product_camps`.
- Impact: Tenant deletes and common joins degrade to scans and locale tables join without index support as traffic grows.
- Falsification: Regex over 200 plus index definitions confirms no covering index for the listed keys, with hot-path misses triaged separately from quiet tables.
- Fix direction: Add indexes on the hot-path FKs first, then cover the remaining FKs.

### F-031 [P2 | MISSING] Live join key has no index while dead key has two — area db-index — `pos_transaction_items` indexes `idx_pos_transaction_items_transaction`, `idx_pos_tx_items_tx`
- Evidence: Both indexes cover always-NULL `transaction_id` while every codebase join uses `order_id` per `0105:84-87` and POS reads, and index-SQL parse shows no index containing `order_id` on this table.
- Impact: Every items-to-header join does a full scan per header despite two wasted indexes.
- Falsification: Composite coverage check over all index SQL rules out hidden coverage, so the miss is confirmed.
- Fix direction: Replace the dead-column indexes with an index on the live join key.

### F-032 [P2 | UNGUARDED] Bulk count shown without success check — area frontend — `app/src/components/admin/RoomsPanel.tsx:301-302` + `MenuPanel` bulk path
- Evidence: `RoomsPanel` reads `res.count` directly to toast `0 products created` as success without checking `res.success`, and `apiFetch` at `api.ts:177-270` throws on non-OK but returns parsed JSON otherwise so a 200 with `success false` passes through.
- Impact: Partial bulk failure shows a success toast with zero count and no error branch.
- Falsification: Static read of the count use is verified while backend 200-with-false semantics remain backend-unverified and tracked separately.
- Fix direction: Gate bulk toasts on the success flag before showing the count.

> Spelling note: the panel filename above uses the r-word prefix for the admin sign-up area in the actual tree; the line reference is exact.

### F-033 [P2 | INCONSISTENT] Nightly pricing loop duplicated — area pricing — `backend/src/api/reservations.js:153-213` vs `backend/src/api/orders.js:290-337`
- Evidence: Both blocks share setHours-normalized day compare, start and end window, summer and winter month branches, and override-map accumulation at reservations 206-208 and orders 330-332 with identical `while currentDate < checkOut` shape.
- Impact: Seasonal or override fixes can land in only one copy and the two endpoints will price the same stay differently.
- Falsification: Statement-for-statement read confirms duplication while the rate-fetch heads at orders 270-300 were not fully compared and remain a tail.
- Fix direction: Extract one shared pricing module imported by both routers.

### F-034 [P2 | INCONSISTENT] Dual scope key with backfill equivalence — area scope-key — `backend/migrations/0100_add_project_id_nullable.sql:66,78,14,16` + `backend/migrations/0105_backfill_order_items_project_id.sql:39,44,49-67` + `backend/src/api/reservations.js:155` + `backend/src/api/tags.js:19-20`
- Evidence: Fourteen tables gain `project_id` while retaining `camp_id`, backfill sets `project_id = camp_id` or `COALESCE camp_id` tenant default, and room membership resolves via `r.camp_id = c.id` join in reservations while tags and meta scope by path `projectId`.
- Impact: A later `camp_id` update that misses `project_id` silently splits scope so the two paths disagree on ownership and pricing.
- Falsification: Migration author ledger at `0100:13-28` confirms dual columns as transitional state, and both code paths are load-bearing, so the hazard is live rather than historical.
- Fix direction: Freeze new code on the project key with fallback to the legacy join only for pre-backfill rows.

### F-035 [P2 | INCONSISTENT] Wire amount and total names drift — area api-contract — `backend/src/routes/registry.js:513,3013,548` + `backend/src/api/orders.js:306,358` + `backend/src/api/reservations.js:94,99`
- Evidence: Paid sum appears as `amountPaid` in order schemas and `paidAmount` in POS detail, and the same calculate-price value is internal `totalPrice` to wire `total_price` in orders 304-358 versus `totalPrice` envelope in `registry.js:548` with a separate `totalAmount` and `total_amount` pair in reservations duplicate response.
- Impact: Clients must handle four spellings for two money facts and typed codegen drifts from runtime responses.
- Falsification: Same-file schema reads confirm same-semantics duplication rather than two different fields.
- Fix direction: Enforce one wire name per money fact and keep storage names DB-only.

### F-036 [P2 | INCONSISTENT] Timestamps and day strings in three forms — area dates — `backend/src/api/storefront.js:627` vs `backend/src/api/categories.js:83` vs `backend/src/api/orders.js:737-738` + `backend/src/routes/pos/index.js:439,953,972` vs `backend/src/api/reports.js:74,79`
- Evidence: Catalog writes mix JS ISO strings and SQL `datetime now` (37 ISO hits versus about 100 datetime hits), day truncation mixes `slice 0 10` and `split T` with SQL `date created_at`, and POS builds space-form datetimes while record-payment stores full ISO.
- Impact: Lexicographic compare of mixed `T` versus space forms can misorder and timezone midnight edges can shift day buckets.
- Falsification: Grep verifies all spellings coexist while lexicographic compare occurrence and timezone parity were not traced and remain tails.
- Fix direction: Write DB timestamps one way and expose ISO only at the API boundary.

### F-037 [P2 | UNGUARDED] Many writes validate manually without schema — area validation — `backend/src/api/services.js` assign plus availability plus pricing plus reviews + `backend/src/api/orders.js` checkin plus checkout plus course plus tip plus split + `backend/src/api/admin-reports.js` generate plus schedule + `backend/src/routes/pos/index.js` shifts + `backend/src/api/pos-barcode.js` + `backend/src/api/orders.js:400,347-359`
- Evidence: Each path has presence, allowlist, range, or numeric checks but no zod schema, for example shift open uses `parseFloat openingCash || 0` with negative check and barcode uses `if (!code)` before a bound lookup.
- Impact: Low injection risk because SQL is bound, but business-rule drift and weak date and email shape checks let malformed ranges through to confusing 400 or 500 paths.
- Falsification: Bound-query reads confirm injection safety while range and format leniency such as availability date strings degrading to string compare remains a robustness gap.
- Fix direction: Attach schemas to the listed manual-write paths without changing accepted happy-path shapes.

### F-038 [P2 | UNGUARDED] Specific mounts must stay before bare mount — area routing — `backend/src/index.js:799-826` + `backend/src/api/meal-plans.js:5-9`
- Evidence: Canonical `campsRoutes` is deliberately mounted after `links` at 680-683, `items` at 689-692, `meta` at 759-761, `tags` at 771-773, and `meal-plans` at 795-796 with a keep-last comment warning a bare wildcard would overwrite them.
- Impact: A future mount in the wrong order can silently swallow sibling project sub-routes.
- Falsification: Author comments in both files document the hazard, and prefix comparison shows products, rooms, and rateplans share the same module without a handler-table cross-check.
- Fix direction: Add a mount-order test that fails if the bare project mount precedes specific sub-mounts.

### F-039 [P2 | DEAD] Legacy payment calls are permanent stubs — area payments — `backend/src/api/financials.js:440-457`
- Evidence: `process-payment` plus `confirm-payment` always return 501 with a Paymob-redirect message.
- Impact: Any client still on the legacy mock gets a hard failure with no forwarding to the real checkout.
- Falsification: Handler bodies are unconditional 501 with no DB or env access, so reachability has no side effect beyond the error.
- Fix direction: Remove or forward the legacy payment stubs and update callers.

### F-040 [P3 | INCONSISTENT] Error bodies and statuses vary for same condition — area errors — `backend/src/api/storefront.js:108` vs `backend/src/api/orders.js:966` vs `backend/src/api/audit.js:172` vs `backend/src/api/admin.js:143` + `backend/src/middleware/requireAuth.js:65-72` + `backend/src/index.js:434,897,906,387,394`
- Evidence: Missing tenant has four spellings across 400 and 401, token failures have five spellings, scope denials mix partition versus role strings, and 404 mixes endpoint-missing with tenant-missing.
- Impact: Clients cannot branch reliably on message text and logs group the same condition under many strings.
- Falsification: All cited sites fire on the identical predicate with different bodies, with one POS-refresh divergence documented as intentional and client-branching lock-in untraced.
- Fix direction: Canonicalize one message plus status per condition behind the shared error helper.

### F-041 [P3 | INCONSISTENT] Money boundary and coercion style varies — area money-style — `backend/src/services/paymob.js:10,93` + `backend/migrations/0009_financials.sql:62-63` + `backend/src/api/reservations.js:164` vs `backend/src/api/orders.js:1260` + `backend/src/api/orders.js:1135,1156`
- Evidence: Storage is REAL while the Paymob boundary is integer cents with `Math.round times 100` conversions at reservations 459 and storefront 369, coercion mixes `parseFloat x || 0` with `Number x || 0`, and split and tip repeat the same rounding formula with renamed vars at five sites.
- Impact: Style drift only today because the boundary placement is correct, but prefix-parsing versus strict coercion can diverge on odd stored strings.
- Falsification: Boundary docs and grep-verified conversions confirm correct placement, with stored-value divergence and round-trip parity untraced.
- Fix direction: Funnel conversions through one cents helper and one coercion helper.

### F-042 [P3 | INCONSISTENT] Admin checks in two styles plus dormant ranks — area auth-style — `backend/src/api/admin.js:85` vs `backend/src/api/tenants.js:89` + `backend/src/middleware/requireAuth.js:56-63,170-171,186-188` + `backend/src/api/pos-tables.js:78`
- Evidence: Central `requireAuth roles super_admin` gates coexist with inline role equality checks and `includes role` lists while `ROLE_RANKS` sits dormant by author comment, and scope mismatch has lenient versus equals semantics in one branch.
- Impact: Role meaning can only change in many files at once and new code may mix the two models.
- Falsification: Central gate and inline path both read-verified with one soft-elevation site known-intentional and remaining compat lock-in untraced.
- Fix direction: Keep exact-membership for now and migrate all role checks together in one later pass.

### F-043 [P3 | INCONSISTENT] Tenant resolved in two stacks with key mismatch — area tenant-resolution — `backend/src/middleware/tenant.js:8-12,27` vs `app/src/middleware/tenant.ts:100-134,155,183` + `backend/src/middleware/resolveScope.js:151-205` + `backend/src/index.js:138`
- Evidence: Backend resolves query `tenant_id` or header `x-tenant-id` or host against id, subdomain, or custom domain while frontend resolves apex, localhost query `tenant`, subdomain split, and custom-domain strips differently, and SSR sends the header for projects plus products while one service comment calls scope the only source of truth.
- Impact: Localhost and staging host mapping can disagree between stacks and CORS advertises a header the code comments deprecate.
- Falsification: Both resolver functions fully read confirm different localhost keys and staging handling, with two precedence sub-paths only grep-verified.
- Fix direction: Document one precedence table and converge dev keys on the backend as source of truth.

### F-044 [P3 | DEAD] Mirror surfaces kept for deprecation windows — area routing — `backend/src/api/camps-alias.js:1-45` + `backend/src/index.js:641,823-826,908-936` + `backend/src/routes/registry.js:3449`
- Evidence: Same `campsRoutes` instance serves canonical projects plus sunset alias with Deprecation and Sunset headers to 2026-10-23, and every `/api` path is also served under `/api/v1` via rewrite with Sunset on unversioned until 2026-11-21 while SSR already calls `/api/v1`.
- Impact: Two full surfaces to maintain until the dates pass, with no live fork today.
- Falsification: Full alias file and rewrite block read confirm transitional mirrors with dated kill switches rather than accidental forks.
- Fix direction: Delete each mirror after its sunset date and keep the canonical prefix.

### F-045 [P3 | DEAD] Unused columns with zero backend refs — area schema — live DDL `pos_products` brand plus supplier plus variant plus SEO pair + `orders` requested times pair + `pos_users` commission plus two-factor
- Evidence: Columns exist in live DDL with zero hits in `backend/src` while controls `supplier_name` in `inventory.js:150`, `compare_price` in `storefront.js:85`, and `short_description` with 15 refs prove the sweep works, and `variant_id` is 119 of 119 NULL with zero nonzero discounts.
- Impact: Schema noise and migration weight with no runtime effect today.
- Falsification: Backend-zero is candidate-only until a frontend `api.ts` grep confirms no direct reads, since the frontend reaches data only through the API.
- Fix direction: Confirm no client reads then drop the dead columns in one migration.

### F-046 [P3 | DEAD] Client exports with no in-app callers — area frontend — `app/src/lib/api.ts:706,2060,2069,2073,2078,2082,2086`
- Evidence: Name grep over `app/src` returns only definition lines for public tenant list, automation toggle, Workers AI analyze, embeddings, and three durable-state helpers, while controls marketplace listings and bulk products show live callers.
- Impact: Dead surface ships to the client bundle and suggests features that hit honest 503 stubs.
- Falsification: `tests`, E2E, and scripts outside `app/src` were not searched, so dead-in-repo is unverified and tracked as U-012.
- Fix direction: Remove or adopt the seven exports after a repo-wide caller search.

### F-047 [P3 | BROKEN] Contact success double-encodes name — area public-ui — `app/src/pages/contact.astro:111-116,158`
- Evidence: Local encoder returns entity string and the same line assigns `successBox.textContent` to escaped text, so `Ada and Co` renders with a literal entity.
- Impact: Cosmetic only, success names show encoded entities.
- Falsification: Static sink plus encoder on the same line verifies the bug with no backend envelope involved.
- Fix direction: Pass raw text to the text sink without pre-escaping.

### F-048 [P3 | MISSING] Billing error has no toast or retry — area admin-ui — `app/src/components/admin/BillingPanel.tsx:49,53-65`
- Evidence: Error branch renders only a static Card `Unable to load billing information` with no toast or retry control in the read window.
- Impact: Transient billing failures look permanent and give operators no one-click retry.
- Falsification: Inline-only rendering verified while toast absence beyond line 80 was not fully swept and remains a tail.
- Fix direction: Add a retry control and error toast to the billing error branch.

### F-049 [P3 | MISSING] Audit writes have no retry or dead-letter — area observability — `backend/src/api/audit.js:88-92` + `backend/src/api/orders.js:1305-1307`
- Evidence: `logAudit` catches and returns null with only `console.error`, and callers document best-effort by design.
- Impact: Lost audit rows are undetectable because reads show no gap signal.
- Falsification: Catch-and-null read confirms best-effort with no queue or replay path anywhere in the file.
- Fix direction: Buffer failed audit rows for retry or dead-letter review.

### F-050 [P3 | UNGUARDED] Tenant delete lifecycle rests on convention — area lifecycle — schema FKs: about 60 CASCADE to tenants plus `admins` and `feedback` SET NULL plus `projects.tenant_id` NO ACTION
- Evidence: Hard tenant delete cascades across about 60 child tables while admins detach into NULL scope (16 such rows locally read as platform scope) and projects block the delete, with only soft-delete `deleted_at` convention guarding the wipe.
- Impact: One hard delete is a mass wipe or a silent privilege-scope change with no DB-level guard.
- Falsification: FK rows directly read confirm the three behaviors, while full auth-scope proof for detached admins is unverified and tracked as U-011.
- Fix direction: Forbid hard tenant deletes except through a reviewed wipe workflow.

### F-051 [P3 | INCONSISTENT] Schema smells without DDL guards — area schema — `rooms_new.tenant_id` nullable no FK with index + invoices plus payments plus subscriptions no CHECK + `0107:144-149` profit margin absent live
- Evidence: Camp-scoped tenant id is the only such key without an FK, status-to-money and status-to-date coherence has no CHECK anywhere, and live DDL lacks the declared generated margin column while storefront code already tolerates both shapes.
- Impact: Dangling rooms, incoherent invoice and subscription states, and migration-to-DB skew are all possible with no DDL backstop.
- Falsification: Live DDL treated as authoritative over file text, and the skew is reported rather than reconciled, with prod coherence for empty tables vacuous locally.
- Fix direction: Add the missing FK, CHECKs, and migration-diff gate in one schema-hardening pass.

---

## UNVERIFIED Hypotheses (confirm or deny, no severity)

- U-001 Hardcoded store 1 FK status — `backend/src/api/reservations.js:419` uses `store_id 1` while POS resolves the real store at `routes/pos/index.js:624-629`. Confirm: inspect seeded `pos_stores` ids plus FK clauses via read-only `PRAGMA foreign_key_list(pos_transactions)` and a SELECT for id 1. Deny: show a seed or guard that always provides store 1 or proves the column is unchecked.
- U-002 Customer dedupe race — `reservations.js:109-151` find-or-create by email and phone with no cited UNIQUE guard. Confirm: read `customers` DDL for UNIQUE or index on email and phone. Deny: show a UNIQUE constraint or atomic upsert that makes double INSERT impossible.
- U-003 Public menu keyed by path id — `backend/src/api/meal-plans.js:17-44` has no tenant predicate. Confirm: product decision that path-id keying is accepted public-menu behavior or change it to scope-plus-id like `meals.js:101-103`. Deny: show a hidden scope check outside the read window.
- U-004 Onboarding token entropy and PII — `backend/src/api/onboarding.js:148-184` returns email plus profile on token knowledge. Confirm: grep `onboarding_token` generation and prove UUID entropy plus expiry and single-use burn at 206-209. Deny: show low-entropy or reusable tokens that would make harvest feasible.
- U-005 Astro health shape — `app/src/pages/api/health.ts` not read. Confirm: read the file and record auth, tenant, validation, and envelope cells. Deny: not applicable, file read closes it.
- U-006 Meal-schedule GET and DELETE input handling — only POST schema at `meal-schedules.js:89` confirmed. Confirm: read the file tail and record query and path validation. Deny: show schemas that were missed by grep.
- U-007 Order payments list shape — handler tail past `orders.js:1220` partly unread. Confirm: read 1181-1220 fully and record shape and paging. Deny: show the shape is already fenced by the tenant existence guard.
- U-008 POS tables in-router admin gate — mount comment at `index.js:784-787` claims role gating inside router with schemas grep-confirmed only. Confirm: read `pos-tables.js` fully and cite the mutation gate. Deny: show the gate is missing and mutations rely only on mount scope.
- U-009 Pillar read filters and report params — write schemas confirmed for financials, HR, supply, CRM while GET filters plus `admin-reports.js` generate `parameters` and `format` consumption per template not traced. Confirm: trace each GET filter to bound use and each report template param use. Deny: show allowlist coverage already constrains them.
- U-010 Empty-table invariants in production — invoices versus payments and subscriptions status versus dates vacuous locally with no DDL coherence guard. Confirm: seed or staging run with rows plus trace the write paths. Deny: show code-level guards that enforce coherence without DDL.
- U-011 Privilege and looseness tails — tenant delete detaching admins to NULL scope, `rooms_new.tenant_id` looseness reliance, store readers missing the mapping join, and `camp_id` column with 43 of 43 NULL. Confirm: auth-scope test for detached admins plus exhaustive reader grep for mapping joins. Deny: show role logic keys on role rather than NULL tenant and all readers join correctly.
- U-012 Frontend tails — `ReportsPanel campIds` use below line 80, `CampsSection` empty handling for `[]`, index fallback when tenant fetch returns null versus throws, Dashboard middle-section error handling, seven dead exports repo-wide callers, route-existence for public tenant path and automation toggle verbs, and 200-with-false bulk semantics. Confirm: targeted greps plus reads listed in Pass 6 follow-ups. Deny: show downstream use or callers that close each tail.
- U-013 Format parity tails — lexicographic compare of mixed timestamp forms, JS versus SQL day truncation timezone edges, space versus ISO round-trip, penny fixture for rounded versus unrounded paths, stored coercion divergence, `project_id` versus `camp_id` row divergence query, lenient scope call sites, and POS-users precedence agreement. Confirm: fixture queries plus call-site enumeration from Pass 7. Deny: show a shared helper or test that already pins parity.
- U-014 Runtime-only flows and env state — wizard click order, receipt print after POS create, Broadcaster delivery guarantees, and local ledger head `0110` versus files `0111` to `0113` not applied. Confirm: browser trace plus staging migration apply and live DDL diff. Deny: show UI order docs or delivery polling that already covers the window.

## Self-Assessment

- Confidence: **Medium-High** on the P0 and P1 core (multi-pass agreement with file and line evidence plus local DB reads for data items), **Medium** overall because all passes were static plus local read-only DB with no live traffic, no browser repro, and several tails explicitly marked U rather than asserted.
- Why: Top money and report breaks have two independent signals (code path plus local tally or cross-file contrast), while schema and frontend tails depend on single-file reads or truncated greps and are therefore down-weighted to P2, P3, or U.
- NOT audited: live production D1 rows and traffic, KV write quota behavior, R2 media bytes, Broadcaster fan-out under load, Astro production SSR, POS hardware print, Paymob live webhook retries, migration apply of `0111` to `0113` on a staging copy, E2E browser flows, dependency CVEs, secrets handling beyond scope gates, and performance or bundle analysis.
- Next: run the U confirm and deny checks in order U-001, U-002, U-004, U-011, U-010, then U-012 to U-014; apply pending migrations to a staging copy with a live DDL diff; add atomic-batch and scope tests for F-001, F-002, F-003, F-011, and F-038 before any cleanup of P3 debt.

## Method Notes

- Pass 8 commands: no shell, no DB writes, no deploy. Synthesis used Read of the spec at `.opencode/agents/tmp/2026-09-24-pass8-synthesis.md` plus Read of all seven files in `.opencode/audits/full-audit-2026-09-24/` (01 plus 02 plus 03 plus 04 plus 05 plus 06 plus 07). No source files opened beyond those audit inputs except to verify cited lines already present in the inputs.
- Pass methods inherited: Pass 1 mount and table tally via full read of `backend/src/index.js` (938 lines), `app/src/lib/api.ts` (2664 lines), hooks, pages, and migrations; Pass 2 full read of `index.js` plus `response.js`, `resolveScope.js`, `requireAuth.js`, `tenant.js` with grep over 30 plus handler files; Pass 3 step tables with Read and Grep per flow F1 to F8; Pass 4 live DDL inspection via Python `sqlite3` opened `mode=ro` on the miniflare copy plus `PRAGMA table_info`, `foreign_key_list`, `foreign_key_check`, and SELECT-only drift queries; Pass 5 mount enumeration plus per-GET predicate reads and cookie, CORS, and token-source greps; Pass 6 `app/src` greps for fetch, escape, toast, empty, project filter, query hooks, ZoneGuard, and viewport plus sampled full-file reads; Pass 7 Read plus Grep sweeps only because the ripgrep backend returned `spawn rg EACCES`.
- Inaccessible items: live production D1 and KV, production logs and tail (needs backend config flag), Paymob live retries, browser runtime repro, `tests` and E2E caller search for dead exports, file tails listed as U (meal-schedules tail, order payments tail, pos-tables body, pillar read filters, report template params, CampsSection, tenant middleware null-versus-throw), and prod data for empty tables (invoices, payments, subscriptions, carts, storefront, services, HR, journals, tickets, stock).
- Gaps: none in inputs (all 01 to 07 present). Analysis gaps are the 14 U items above, each with an exact file plus query or grep to close it.
- Evidence style: inline snippets only, no patch blocks, fix guidance limited to one sentence per finding per spec.
