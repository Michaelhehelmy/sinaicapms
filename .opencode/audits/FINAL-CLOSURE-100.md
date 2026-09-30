# FINAL-CLOSURE-100 — Guest Folio Mission Closure (2026-09-30)

- Date: 2026-09-30 UTC
- Spec: `.opencode/agents/tmp/2026-09-30-fc3.md` (task `folio-c3-closure`, commit 11)
- Baseline confirmed: `0484e7c` == `origin/main` (`git ls-remote origin HEAD`
  == `0484e7c1c9141c08c44da9c447ea42da0ee1dcd2` == `git rev-parse HEAD`)
  before any write; tracked tree clean apart from pre-existing untracked
  spec/scratch. No source touched, no deploy.sh, no prod writes, no D1/KV writes.

## 1. Session (commit chain — all pushed)

| # | SHA | Subject |
|---|-----|---------|
| 1 | `4e01c92` | docs(audit): guest folio discovery |
| 2 | `4296992` | feat(folio): schema + migration 0124 |
| 3 | `19417ac` | feat(folio): lifecycle endpoints |
| 4 | `4234361` | feat(folio): auto-post from check-in and POS |
| 5 | `25a9023` | feat(admin): guest folio panel + receipt |
| 6 | `deaf23e` | feat(pos): charge to folio |
| 7 | `ff68a91` | feat(reports): folio attribution — no double count |
| 8 | `92ad650` | test(staging): guest folio walkthrough — PASS |
| 9 | `c32d822` | test: full suite after folio (C.1) |
| 10 | `0484e7c` | test(staging): folio cross-tenant probe — PASS (C.2) |
| 11 | this commit | docs(audit): FINAL-CLOSURE-100 (C.3) |

Chain verified via `git log --oneline` on `origin/main`; C.1 (`c32d822`) and
C.2 (`0484e7c`) bodies carry their tails/verdicts verbatim (see §5).

## 2. Code (what shipped — source diff, commits 2–7)

- `backend/migrations/0124_guest_folios.sql` — `folios` + `folio_charges` +
  `folio_settlements`, 7 indexes, status/source/method CHECKs, amount>0,
  cash+card≈amount ±0.01, projects FK SET NULL, folio FKs CASCADE.
  Local-only `:memory:` proof: idempotent re-apply, 5/5 CHECKs fail-closed,
  cascade to 0.
- `backend/src/api/folios.js` (NEW, mounted `/api/folios` in `index.js`) — 7
  endpoints: create / list(+counts) / detail(+charges+settlements) /
  add-charge / void-charge (soft, zero DELETEs) / settle / void (admin-only).
  Tenant predicates → cross-tenant 404 never 403; every multi-write in
  `DB.batch`; camelCase wire; zero KV writes.
- `orders.js` — check-in auto-posts room charges per night (rounding dust on
  last night, response gains `folio_id`); checkout gates on open folio with
  total>0 → 400 `Settle the folio before checking out`.
- `routes/pos/index.js` — `POST /orders` accepts `folioId` (404 unknown, 409
  closed), appends one `restaurant` charge per line (discounted totals, tax
  stays on POS txn) in the SAME batch; `paymentMethod: 'folio'` enum mapping.
- Admin `FoliosPanel` + `FolioDetail` + `FolioReceipt` (printable,
  project-grouped, split legs, paid/balance); 7 `useQueryHooks` folio hooks.
- POS `CartPanel` — `Charge to folio` toggle + open-folio picker + fail-fast
  toast; post-success invalidates `['admin','folios']` keys.
- `reports.js` profit ONLY — booking leg `NOT EXISTS` non-voided folio for
  the order (stay counts via folio leg, never twice); NEW folio leg
  (voided-excluded, `fc.folio_id` DISTINCT key, `?projectId=` narrows all 3).

## 3. Observability (monitor worker — code-complete, deploy owner-side)

- Commits on main: scaffold `c40a78e` → schema `55e715e` → cron/alerts
  `b4799ef` → API/dashboard `fe63735` → tests `5c8fc66` (32/32, gates PASS)
  → README `d305e5a` → reporter `9dd8c8f` → db-id `f5d7b77`
  (database_id `81de335f-a729-4511-a9e8-57a6882c6932`, owner-created
  `campmaster-monitor-db`) → cookie login `49e1360` → PIN login `7abc899`
  (6-digit keypad, D1 5-fails/5min gate, 12h/90d trust) → PIN README
  `bf98382` (auto-clear §3).
- Deploy state: UNKNOWN from repo evidence — no deploy runs under tmp-agent
  scope (forbidden), no version/traffic proof in-repo. Owner messages are the
  deploy source of truth; code side is frozen and green (monitor suite 38/38
  at `7abc899`).

## 4. Folio (staging proofs — both PASS)

- B.8 walkthrough (`92ad650`,
  `.opencode/audits/walkthrough/FOLIO-STAGING-WALKTHROUGH.md`): 11/11 steps
  PASS on acacia tenant. Numerics exact: booking total **3000** → check-in
  folio `folio_7b1929c1-5ea` open 3000 (2×1500 room) → POS folio sale
  (`ord_555ff5a0-eb3`, 1× P4TEST 5) **3005** → manual spa 200 **3205** →
  void **3005** (soft-void stamped, row retained) → cash settle **settled**,
  exactly 1 settlement Σ 3005 → receipt $3,005.00/$3,005.00/$0.00, 0 page
  errors → checkout 200 room freed → profit Camp **3005** (3 lines/1 order) /
  Restaurant 0 / total **3005** vs 0-baseline (voided 200 excluded,
  stay `order_items` 0). State left clean: 0 open folios. Screenshots
  `folio-01-folios-table.png`, `folio-02-receipt.png`.
- C.2 x-tenant (`0484e7c`,
  `.opencode/audits/full-audit-2026-09-24/15-folio-x-tenant.md`): PASS
  **404/200/403/404** — P1 acacia→testb folio 404 `Folio not found`; P2
  testb→own (seed `folio_f829ea0e-2b7`) 200; P3 acacia+testb hint list 403
  `Forbidden: Access denied to this tenant partition`; P4 acacia POST settle
  on testb folio 404, no write. 1 disclosed seed (testb's own row, left by
  design); JWTs shredded; 0 foreign rows disclosed.
- Staging D1 ledger head **0124** (`0124_guest_folios.sql`, B.8 D1-verified);
  filesystem head 0124. No staging writes in C.1/C.3; C.2 wrote exactly 1
  seed row (disclosed).

## 5. Suites (C.1 evidence, still current — proven, not re-run)

C.1 commit `c32d822` body verbatim:

```text
Backend tail:
 Test Files 119 passed (119)
 Tests 2642 passed (2642)
Frontend tail:
 Test Files 153 passed (153)
 Tests 3606 passed (3606)
```

Still-current proof (read-only): `git diff --stat c32d822..0484e7c --
backend/src app/src tests` is EMPTY — the only delta is the C.2 audit doc +
1 logbook line, so no code path the suites cover has changed since green.
Mission deltas vs pre-folio baseline (2026-09-29: backend 116/2623, app
151/3597): backend **+3 files / +19 tests** (folios 9, autopost 5,
reports-folio 5), frontend **+2 files / +9 tests** (admin-folios 5,
pos-folio 4); 0 collateral red at every step (STOP budget untouched).

## 6. Deferred (known, out of scope)

- Prod deploy + smoke (owner runs `./deploy.sh`; checklist §7).
- Restaurant-leg walkthrough needs a store-2-bound cashier (user write, was
  out of B.8 budget — B.8 used the in-scope Camp SKU; mechanics identical).
- B.8 obs: staging `versions list` lags live build (endpoint behavior is
  source of truth); `acacia.staging` host unresolvable for UI login (API
  login + session seed is the workaround).
- C.2 seed `folio_f829ea0e-2b7` (testb, open, total 0) remains by design.

## 7. Prod checklist (owner-gated; tmp agents forbidden from deploy.sh)

- [ ] Backup prod D1 before deploy (0123-rebuild precedent: restore-from-backup
  is the only rollback for rebuild-class migrations).
- [ ] `./deploy.sh` applies **[0121, 0122, 0123, 0124]** — prod ledger last
  verified head **0120** (2026-09-29 evidence,
  `11-prod-migration-gap-0121-0123.md`); no fresh prod read performed this
  mission → treat fresh head as UNKNOWN, plan for 4 pending.
- [ ] Verify prod ledger head = 0124 post-deploy.
- [ ] Smoke: unauth `GET /api/folios` → 401 (mounted); authed list → 200
  envelope; 1 booking→check-in→settle→checkout cycle on a test tenant.

## 8. Recommendation: HOLD (staging READY, prod cutover pending)

`HOLD` — not on code quality (staging is fully READY: 11/11 walkthrough,
4/4 x-tenant, 6248/6248 unit tests, 0 open folios, ledger 0124), but because
prod still sits at ledger 0120 with 4 migrations unapplied and zero prod
smoke evidence. Flip to READY the moment the §7 checklist (backup → deploy
→ head 0124 → smoke) is owner-executed and logged. No code changes needed.

## Mutations this step

Docs only: NEW this file + 1 `AGENT_LOGBOOK.md` fold line. No source, no
deploy.sh, no D1/KV writes, no logins. Rollback = revert single commit.
