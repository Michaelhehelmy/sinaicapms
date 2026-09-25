# P4 Staging Walkthrough — POS Isolation (live)

> ## RETRY 2026-09-25 — verdict: BLOCKED at STEP 4 (spec `.opencode/agents/tmp/2026-09-24-p4-retry.md`)
>
> - Steps 1–3 PASS with exact numbers (below). STEP 4 sell-3-cash FAILS: `POST /api/pos/orders`
>   → `500 {"success":false,"error":"Failed to create order"}` (reproduced ×2). Live `wrangler tail`
>   on `campmaster-backend-staging` captured the worker-side cause verbatim:
>   `[POS CREATE ORDER ERROR] D1_ERROR: table pos_transactions has no column named tip_amount: SQLITE_ERROR`.
> - Root cause: `backend/src/routes/pos/index.js` sale INSERT lists `tip_amount`, but NO migration ever
>   added that column to `pos_transactions` (`tip_amount` exists only on the `orders` booking table —
>   `0002_orders.sql:38`, `legacy/0075` alters `orders`). The LOCAL dev D1
>   (`miniflare-D1DatabaseObject/*.sqlite`) also lacks it (40 cols, no `tip_amount`), so EVERY POS sale
>   on this tree is broken — staging now, prod on next deploy. No source/deploy touched per spec (STOP).
> - State left clean: shift `sh_0c4df529-c18` closed (expected 100 / actual 100 / discrepancy 0);
>   P4TEST stock still 10; today `pos_transactions` for tenant = 0. Steps 5–8 NOT RUN.
> - Remediation: migration adding `tip_amount` to `pos_transactions` (or drop it from the INSERT) +
>   a unit test pinning the sale INSERT column shape vs the real schema + `./deploy.sh --staging`,
>   then re-run this spec.
>
> ### Retry gate numbers (every figure exact)
>
> | Gate | Number |
> |------|--------|
> | `GET /pos` | 200 · 664 ms |
> | Login → shell | ok (`Test POS`), 0 page errors |
> | `pos-project-name` elements | 1, text `Acacia Main Camp`; body contains `Acacia Main Camp` = true |
> | D1 ledger head | `0119_pos_shifts_store_id.sql` (Phase 4 deployed) |
> | `pos_shifts` scope column | present (`store_id INTEGER`, 11 cols) |
> | Token `projectId` claim | `camp_fdcd2ef9-855` (storeId 2, tenantId `acaciacamp`) |
> | STEP 2 open shift | `sh_0c4df529-c18`, opening 100; D1: exactly 1 open, store_id 2, cashier 7 |
> | STEP 3 pre-sale stock | P4TEST `p4test_B9278A0D8A36` == **10** exact; same-name rows across projects: 1 (single-project tenant) |
> | STEP 4 sale attempts | 2 × `500 Failed to create order`; post-sale stock **10** (unchanged); today txns **0** |
> | Cleanup close | expected 100 / actual 100 / discrepancy **0** (in-budget; first close curl landed despite a tool-side error, retry got `No active shift found` — consistent) |
> | Mutations performed | open 1, successful sales 0 (2 failed, zero writes), close 1; D1 otherwise SELECT-only |
> | Screenshots | `p4-r2-01-login.png` (logged-in shell WITH project name) |
>
> ### Prior run (2026-09-25, spec `2026-09-24-p4-walkthrough.md`) — BLOCKED at STEP 1, staging stale — kept below.

- Date: 2026-09-25
- Spec: `.opencode/agents/tmp/2026-09-24-p4-walkthrough.md` (steps 1–10, in order, stop at first failure)
- Target: `https://acacia.staging.sinaicamps.com` — tenant `acaciacamp` ("Acacia Camp")
- POS account: `testpos` (cashier, id 7) — login per STEP 1 (no other credential use)
- Admin fallback (`admin.test@acaciacamp.com`): NOT used — walkthrough stopped before any admin step
- Harness: repo `playwright@1.61.1` + system chrome
  `/home/michael/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome`
  (`--no-sandbox --disable-gpu --disable-dev-shm-usage`); `waitUntil: domcontentloaded`
- Mutation budget (spec): ONLY open-shift / sell-3-cash / close-shift. Anything else ⇒ STOP.
- D1 access: `campmaster-db-staging` (`4a9e6e45-…`) via `wrangler d1 execute --env staging --remote`,
  SELECT-only. Zero D1 writes performed in this run.

## STEP 1 — GET /pos, POS login, shell + project-name gate → FAIL (STALE)

| # | Assertion | Result |
|---|-----------|--------|
| 1.1 | `GET /pos` reachable | PASS — HTTP 200, 0.787 s, 8297 bytes; `<title>💳 SinaiCamps POS</title>`, roots `pos-root` + `pos-app-root` |
| 1.2 | Login shell hydrates | PASS — `pos-login` rendered; `pos-identifier`/`pos-password`/`pos-signin-btn` present |
| 1.3 | `testpos` login succeeds | PASS — post-login surface is the terminal shell directly (no project picker); `pos-user-name` = `Test POS`; zero page errors |
| 1.4 | Shell shows the project name (Phase 4d gate) | **FAIL — `pos-project-name` element count = 0; full body text contains `Acacia Main Camp` = false** |
| Verdict | `shell ✓ + project name ✗` | **STOP per spec: "staging stale — Phase 4 not deployed."** |

- Shot: `p4-01-login.png` (logged-in shell: sidebar `SinaiCamps / POS Terminal`, nav
  Dashboard/Products/Orders/Tables/Kitchen/Shift, `Test POS` footer, `Open Cash Drawer`
  overlay — no project label anywhere).

### Freshness evidence (all read-only, exact numbers)

1. **D1 migration ledger HEAD = `0113_add_orders_customer_index.sql`** (27 rows). Local tree runs
   through `0119_pos_shifts_store_id.sql` → **6 migrations missing on staging:
   0114, 0115, 0116, 0117, 0118 (4a default store), 0119 (4e shift store)**.
   Staging deploy predates Phase 4a–4f AND the audit fixes (P0/U-002/U-011).
2. **`pos_shifts` has 10 columns and NO store/project scope column**:
   `id, tenant_id, cashier_id, status, opening_time, closing_time, opening_cash,`
   `expected_closing_cash, actual_closing_cash, notes` — migration 0119 not applied, so the
   STEP 2/3 "scope col" check could never pass on this backend.
3. **Login session carries no project binding (pre-4c/4d)**. Persisted `pos_user` keys (9):
   `id, username, email, firstName, lastName, role, organizationId, storeId, taxRate`
   (`taxRate` = 0.1). Absent: `tenantId, projectId, activeProjectId, activeProjectName`.
   Access-token claims present: `sub, userId, tenantId, organizationId, storeId, role, posType,
   userType, type, iat, exp`. Absent: **`projectId`** (the 4c claim). Hence the 4d sidebar can
   only render nothing — observed.
4. **Catalog state**: tenant owns exactly **1 project** (`camp_fdcd2ef9-855`, `Acacia Main Camp`,
   active) and exactly **6 products, all `type='room'`, `SUM(stock_quantity) = 0`,
   `MAX(stock_quantity) = 0`**. Rows with `stock_quantity >= 3`: **0**. Any `stock_quantity > 0`:
   **0**. (The single-project shape is also why no picker appeared — consistent with either
   generation of frontend; assertions 1–3 above are what date it.)
5. **Shifts**: `pos_shifts` rows for `tenant_id='acaciacamp'`: **0** (clean slate, no open shift).
6. OpenAPI parity note (non-proving, recorded for honesty): staging vs local `openapi.json` =
   **87 paths each, set-diff empty**; `PosShift` props identical (6). Phase 4 added no new
   paths and no shift-schema fields (store travels in the token claim), so path parity does
   NOT contradict the ledger/session evidence above.

## STEP 2 — Open shift → NOT RUN (blocked on STEP 1)

Not attempted. Predictive read-only notes (not results): zero open shifts exist, so an open
would not collide; but the staging `pos_shifts` row would carry no store scope (no column),
failing the "verify one open shift + scope col" assertion by construction.

## STEP 3 — Pick camp product + pre-sale stock queries → NOT RUN (blocked on STEP 1)

Pre-sale queries executed read-only as recon (numbers exact, no sale made):
- Top-5 by stock (org 2): 5 of the 6 `Walk Tent / Probe Tent / Probe Tent2` room rows, every one
  `stock_quantity = 0`, `selling_price = 100`.
- Same-name-across-projects for the candidate name: all 6 rows named `Walk Tent`/`Probe Tent*`
  sit in the tenant's single project (`camp_id` NULL or `camp_fdcd2ef9-855`); cross-project
  same-name rows: **0** (single-project tenant — expected).
- Shot `p4-03`: not taken (no product picked; nothing sellable — see STEP 4 note).

## STEP 4 — Sell 3 cash → NOT RUN (blocked on STEP 1)

Would-be blocker recorded read-only: **no product on the tenant has `stock_quantity >= 3`**
(all six are 0), and the POS sale path is stock-guarded (400 + rollback on insufficient stock),
so a qty-3 cash sale could not succeed on current staging data. Restocking is a write outside
the mutation budget ⇒ correctly not attempted. Shots `p4-04` / `p4-05`: not taken.

## STEP 5 — Cross-project SKU check → NOT RUN (blocked on STEP 1)

Single-project tenant: cross-project SKU presence = **ABSENT** (0 second projects, 0 shared SKUs).
Per spec shape this is `ABSENT + flag`: flag = staging catalog holds only zero-stock room rows;
re-check after a Phase-4 staging deploy + merchandised (stocked) catalog.

## STEP 6 — Close shift → NOT RUN (blocked on STEP 1)

No shift was opened (STEP 2 not run) ⇒ nothing to close. Discrepancy: N/A. Shot `p4-06`:
not taken.

## STEP 7 — Legacy token compat → NOT RUN (blocked on STEP 1)

Recorded instead as unit-test pointer (per spec's NOT-TESTABLE allowance):
`backend/tests/phase4c-pos-token-project.test.js` (10 tests) covers legacy no-claim tokens
(tenant-default scope, NULL-store 403, stale-claim distrust) — hermetic, green at the 4g exit
report (27/27 gate tests). Live staging proof deferred to a post-deploy re-run.

## STEP 8 — Cross-tenant leak (foreign order ⇒ 404/403, never 200+row) → NOT RUN (blocked on STEP 1)

Unit-test pointer: `backend/tests/phase4f-transactions-project.test.js` GATE 5
(A products 1 + 0 B rows, B order by id via A token = 404, 2 global open shifts / A sees 1).
Live staging proof deferred to a post-deploy re-run. No foreign-order request was sent from
this run (no admin login performed).

## STEP 9 — This report. STEP 10 — BLOCKED commit + push (single commit, logbook folded).

## Gate numbers (every figure exact, sources above)

| Gate | Number |
|------|--------|
| `GET /pos` | 200 · 0.787 s · 8297 B |
| Login → shell | ok (`Test POS`), 0 page errors |
| `pos-project-name` elements | **0** |
| Body contains `Acacia Main Camp` | **false** |
| Tenant projects | 1 (`camp_fdcd2ef9-855`) |
| Tenant products | 6, all `type='room'`, `SUM/MAX(stock) = 0` |
| Products with stock ≥ 3 | **0** |
| Open shifts (tenant) | 0 |
| D1 ledger head | 0113 (27 rows); missing 0114–0119 (**6**) |
| `pos_shifts` scope column | **absent** (10 cols, no store/project) |
| `pos_transactions.project_id` column | present (nullable, since 0100 — schema only, untested live) |
| Session `pos_user` keys | 9 listed; `projectId` et al **absent** |
| Token `projectId` claim | **absent** |
| Mutations performed | **0** (no shift opened, no sale, no close; D1 SELECT-only) |
| Screenshots | 1 of 7 (`p4-01-login.png`); p4-02…p4-06 + p4-05 not taken (steps not run) |

## Verdict: BLOCKED at STEP 1 — staging stale, Phase 4 not deployed

Remediation: run `./deploy.sh --staging` (applies 0114–0119 + ships the 4a–4f worker and 4d
frontend), stock at least one cash product (qty ≥ 3), then re-run this exact 10-step spec.
No suite was touched by this run (browser + SELECT-only D1; zero source/test edits).
