# Phase 4 POS Isolation — Exit Report (six gates)

- Date: 2026-09-25
- Baseline confirmed pushed: `4c81e58` — local `main` HEAD == `origin/main` == `4c81e58`
  (verified via `git ls-remote origin main`; `git rev-parse main` / `origin/main` identical).
- Evidence source: step commit messages + gate test files, re-verified read-only
  (hermetic better-sqlite3 in-memory, zero D1/KV writes). No numbers invented.
- Re-verification this session: `cd backend && npx vitest run`
  `tests/phase4b-products-project.test.js tests/phase4c-pos-token-project.test.js`
  `tests/phase4e-shifts-store.test.js tests/phase4f-transactions-project.test.js`
  → **4 files passed, 27 tests passed, 0 failed** (6 + 10 + 4 + 7).

## Gate 1 — Stock isolation (step 4b, commit `6a9e1e1`) → PASS

- Suite at close: 104 files / 2558 tests, 0 failed (baseline 103/2552, +6 new, zero red).
- Gate test `backend/tests/phase4b-products-project.test.js` (6 tests), real better-sqlite3 + real router:
  - Seed Camp Cola stock 10 (camp1) + Rest Cola stock 5 (rest1); sell 3 via Camp store
    ⇒ 200, total 16.5 (15 + 10% org tax); Camp stock EXACTLY 7, Rest stock EXACTLY 5.
  - Bulk-read binds `['prod_camp','t1','camp1']`; deduction binds `[3,'prod_camp','t1','camp1',3]`.
  - 1 low-stock inbox row (7 ≤ min 10); keyed replay ⇒ `deduplicated:true`, stock stays 4.
  - Cross-project (Camp cashier orders prod_rest) ⇒ 400 product-not-found; stocks 10/5
    bit-identical, zero transactions.
  - Oversell 5-of-2 ⇒ 400 race-guard; stocks 2/50 restored exact; add-back binds
    `[5,'ing1','t1','camp1']`.
  - Legacy NULL token ⇒ tenant-wide list, zero `project_id` in SQL.

## Gate 2 — Shift isolation (step 4e, commit `11374ed`) → PASS

- Suite at close: 106 files / 2572 tests, 0 failed (baseline 105/2568, +4 new, zero red).
- Gate test `backend/tests/phase4e-shifts-store.test.js` (4 tests), real better-sqlite3 + real router:
  - Camp open 100 + cash sales 75 (50+25; voided 30 and same-cashier cross-store decoy 1000
    excluded) ⇒ expected 175, actual 175, discrepancy 0.
  - Rest open 200 + cash sales 40 ⇒ expected 240, actual 240, discrepancy 0.
  - Closes independent (Rest still active after Camp close; Camp inactive after its close);
    till-math binds carry `store_id = ?`.
  - Same-store guard: stale other-store shift doesn't block; second same-store open 400;
    row bound to store 1.
  - Legacy NULL-store token: INSERT store NULL, close 50+20=70.
  - Migration `0119_pos_shifts_store_id.sql` real-file replay: CAST backfill 7→1,
    NULL-store/gone cashiers stay NULL.

## Gate 3 — Legacy-backfill count (step 4f, commit `4c81e58`) → PASS

- Gate test `backend/tests/phase4f-transactions-project.test.js`, hermetic count query:
  `SELECT project_id, COUNT(*) AS n FROM pos_transactions GROUP BY project_id`
  ⇒ `{ NULL: 2, pA1: 1 }` — exact.
- NULL ids + documented reasons, zero unexplained NULLs (test pins the map):
  - `txn_legacy_null` — pre-4f backfill residual (tenant-wide token era).
  - `<legacy sale id>` — legacy NULL-scope sale (no store binding, no home tag, no tenant default).
- Tagged row `project_id = 'pA1'` is exactly the scoped sale.
- Live staging count skipped: no `CLOUDFLARE_API_TOKEN` in env (read-only probe refused
  without creds; recorded in the 4f commit message, not retried here).

## Gate 4 — Token compat (step 4c, commit `49f1721`) → PASS

- Suite at close: 105 files / 2568 tests, 0 failed (baseline 104/2558, +10 new, zero red).
- Gate test `backend/tests/phase4c-pos-token-project.test.js` (10 tests),
  real better-sqlite3 + real gates:
  - Legacy no-claim token `GET /products` ⇒ 200 `[prod_default]`, read binds `[t1, p_default]`
    (default scope, not tenant-wide).
  - New claim token GET ⇒ 200 camp-only; POST same-project ⇒ 200; POST cross-project ⇒ 400
    product-not-found.
  - NULL-store login/refresh ⇒ 403 store-assignment, zero tokens minted.
  - Refresh distrusts stale claim (re-resolves tenant+project; reassignment re-issues
    corrected claims).
  - Claim-vs-record mismatch: POST ⇒ 403 project scope mismatch on BOTH posAuth and
    dualRealm; GET degrades to the record's project.
  - dualRealm legacy ⇒ 200 with `scope.projectId` = tenant default.

## Gate 5 — Cross-tenant counts (step 4f, commit `4c81e58`) → PASS

- Gate test `backend/tests/phase4f-transactions-project.test.js`, exact counts (A cashier,
  B decoys live):
  - A products list = 1 row (`prodA1`) + 0 B rows.
  - A orders total = 1; B order by id via A token = 404.
  - A active shift = A's own (B open shift on store 21 present globally: 2 open shifts,
    A sees 1).
  - B sale stamps `pB`; A list still 1.

## Gate 6 — Rollback safety (step 4f, commit `4c81e58`) → PASS

- Code-only revert of `4c81e58`. Column `pos_transactions.project_id` additive since
  migration 0100; no schema change, no backfill, no KV writes (free-plan quota),
  no D1 writes (all probes hermetic in-memory), no `deploy.sh`.
- Same single-commit revert property recorded for 4b (no schema change), 4c (no migration),
  4e (additive forward-only 0119; DROP COLUMN follow-up documented in the 0119 header).

## Verdict

Six gates, six PASS. All numbers harvested from pushed step commits and their gate tests;
27/27 gate tests re-run green in this session. No gate required invention.
