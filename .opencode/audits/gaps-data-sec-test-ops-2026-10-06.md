---
title: "Gap audit — data / security / testing / operations / guides (code vs docs)"
aliases:
  - gaps-data-sec-test-ops-2026-10-06
type: audit
audience: agent
domain: docs
status: current
created: 2026-10-06
baseline: ddc63c6
scope: docs/07-data docs/06-security docs/04-testing docs/05-operations docs/08-guides docs/09-plans docs/10-tenant-import
---

# Gap audit — data / security / testing / operations / guides (code vs docs)

**Date** 2026-10-06 · **Baseline** `ddc63c6` (Part 8a, confirmed pushed before any write:
`git branch -r --contains ddc63c6` → `origin/main`; `git status -sb` → `## main...origin/main`,
0 ahead/behind).

**Scope** every doc in `docs/07-data` (2), `docs/06-security` (2), `docs/04-testing` (2),
`docs/05-operations` (3), `docs/08-guides` (6), `docs/09-plans` (5), `docs/10-tenant-import` (5)
— 25 files, 4,338 lines. **Fix nothing was fixed**: no doc edited, no source edited, no test
suite re-run, no `wrangler`, no deploy. The only files touched by this audit are this report and
the `AGENT_LOGBOOK.md` fold.

**Method.** Every verifiable claim was extracted and checked with a real command. `rg` is not on
PATH; searches used the `grep` tool, `grep`/`find` in bash, and throwaway `node:fs` scripts from
`/tmp/opencode/`. Three checks were done mechanically rather than sampled, because they are the
kinds of claim a sample cannot validate:

1. **Every `code-references` entry in all 25 files was resolved against the filesystem.** 173
   references, **0 missing**. The 2026-10-06 p4 lesson (ghost code-references) has been applied.
2. **The admin/POS nav-tab census was enumerated exhaustively** from `AdminApp.tsx:146`-region and
   `POSApp.tsx:39-44` rather than spot-checked, because the claim under test is a count.
3. **The tenant-import manifest field census was recomputed from the shipped JSON** against a
   schema extracted from the handler's own `z.object` literals, because the doc claims to have
   *measured* it.

**Test counts were NOT re-derived by running suites.** They are read from the latest committed
suite result in `docs/98-history/sessions/AGENT_LOGBOOK_HISTORY.md` (see the per-suite provenance
table on **T‑0**). Migration head/count, `wrangler.toml` values and endpoint mounts were read from the
real tree.

**Classes** — `MATCHED` (claim is true of the code), `STALE` (was true, has drifted), `FALSE` (not
true and never was, or contradicted by the same doc set), `UNVERIFIED` (cannot be checked from the
tree without running something expensive or contacting something external), `UNDOCUMENTED` (real
code with no claim anywhere in scope). A few entries carry two classes where a document states a
correct claim and a false one **in the same line**; each class is counted once and the second class is
named in the entry.

## Summary

| Class | Count |
| --- | --- |
| MATCHED | 77 |
| STALE | 31 |
| FALSE | 16 |
| UNVERIFIED | 7 |
| UNDOCUMENTED | 3 |
| **Total entries** | **134** |

By severity: **P0 0 · P1 4 · P2 20 · P3 110**.

By folder: `07-data` 13 · `04-testing` 15 · `06-security` 19 · `05-operations` 25 · `08-guides` 24 ·
`09-plans` 19 · `10-tenant-import` 19.

By doc: `migrations.md` 9 · `07-data/README.md` 4 · `TESTING.md` 13 · `04-testing/README.md` 2 ·
`security-guide.md` 18 · `06-security/README.md` 1 · `RUNBOOK.md` 14 · `05-operations/README.md` 2 ·
`AUDIT_MASTER_FINDINGS.md` 9 · the five `08-guides` docs 23 · `08-guides/README.md` 1 ·
`DEVELOPER_ROADMAP.md` 8 · `BACKLOG_VOID_REFUND.md` 3 · `_v3_waves.md` 3 · `_v3_appendices.md` 3 ·
`09-plans/README.md` 2 · `10-tenant-import/README.md` 2 · `tenant-import-schema.md` 7 ·
`tenant-import-types.md` 1 · `tenant-import-appendix.md` 5 ·
`BLOCKED-pos-products-composite-pk.md` 3 · 4 cross-folder entries (**T‑0** provenance,
`07-data`+`AUDIT_MASTER_FINDINGS` code-references, the `N‑3/N‑4/N‑5` group, the five-docs
code-reference sweep).

**The single worst finding is `TESTING.md`'s admin/POS tab-ID table.** It is the reference the
folder README nominates as *the only place in the repo* that carries those IDs and that *E2E
selectors depend on*, and it is missing **28 of the 46 admin tab IDs and 2 of the 6 POS tab IDs** —
including 12 IDs that E2E specs actually select on.

---

# 07-data

## D‑1 · [[migrations]] §1 — migration head and count · **FALSE as written** · STALE

- **Source** `docs/07-data/migrations.md` §1 "What migrations are"
- **Claim (verbatim)** "**Current head: `0123_storefront_order_items_fk_pos_products.sql`** (37
  files total: `0001`–`0014` + `0100`–`0123` minus reserved-absent `0109`, filesystem-verified)"
- **Expected** 37 top-level `.sql` files; highest-numbered `0123_*`.
- **Actual** `ls backend/migrations/*.sql | wc -l` → **40**. Highest =
  `0127_meals_tenant_composite_pk.sql`. Sequence `0001…0014 0100…0108 0110…0124 0126 0127`.
  Three migrations landed after this paragraph was written: `0124_guest_folios.sql`,
  `0126_tenant_scoped_unique_sku_email.sql`, `0127_meals_tenant_composite_pk.sql`.
- **Class** STALE · **Severity** P2 · **Action** UPDATE-DOC
- **Note the folder contradicts itself.** `docs/07-data/README.md:64-69` carries an explicit callout
  naming this exact drift and stating the correct figures ("The tree has **40** migrations with head
  `0127_meals_tenant_composite_pk.sql`"), and correctly attributes the fix to an owner content edit
  deliberately left out of the 2026-10-06 restructure. The live guide was missed; the index caught
  it.

## D‑2 · [[migrations]] §2 step 1 — the "create the next migration" instruction now names a taken slot · **P1**

- **Claim** "1. Create `backend/migrations/0124_<slug>.sql` with the next number (head is `0123`;
  never reuse reserved-absent `0109`)."
- **Expected** either the real head, or a slot that is free.
- **Actual** `backend/migrations/0124_guest_folios.sql` **exists** (a real, applied migration
  creating `folios` / `folio_charges` / `folio_settlements`, header dated 2026-09/10). An agent
  following this instruction literally authors a second `0124_*`, which `wrangler d1 migrations
  apply` orders ambiguously (filename sort) and `scripts/check-deploy-parity.sh` will flag as a
  ledger mismatch. The correct next free slot is **`0128`**.
- **Class** FALSE · **Severity** **P1** · **Action** UPDATE-DOC
- **Severity rationale** unlike every other stale count in this audit, this one is an *instruction*
  with a destructive failure mode. It is the first thing the guide tells a reader to do, and the
  doc it is filed under is `status/live` with `type/guide`.

## D‑3 · [[migrations]] §6 — verification test counts · STALE

- **Claim** (code block) `cd backend && npx vitest run` → `# 2610 tests / 115 files` ·
  `cd app && npx vitest run` → `# 3561 tests / 149 files` · root integration `# 255 tests / 37 files`
- **Expected** the latest committed result for each suite.
- **Actual** Not re-run (source note on **T‑1**). Backend is **127 files / 2743 tests**, app is
  **155 / 3632**. Root integration 37/255 is the one row still correct. Backend is **3 files / 133
  tests** behind; frontend **1 file / 71 tests** behind.
- **Class** STALE · **Severity** P2 · **Action** UPDATE-DOC

## D‑4 · [[migrations]] §5 — the "recent migrations of note" table · MATCHED

- **Claim** (4 rows) `0123` retargets `storefront_order_items.product_id` FK `products(id)` →
  `pos_products(id)`, single-table rebuild, 0111 idiom · `0122` nullable `project_id` on
  `storefront_order_items` · `0121` nullable `project_id` on `cart_items` · `0120`
  `tip_amount REAL DEFAULT 0` on `pos_transactions`
- **Expected** all four files to exist with those changes.
- **Actual** All four files exist. `0123_storefront_order_items_fk_pos_products.sql:89` is exactly
  `product_id TEXT REFERENCES pos_products(id) ON DELETE SET NULL` — the documented retarget. The
  `0120` column is bound in the sale path (corroborated by
  `backend/tests/pos-insert-positional.test.js`, which parses the real INSERT).
- **Class** MATCHED · **Severity** P3 · **Action** none

## D‑5 · [[migrations]] §5 "earlier" row — the series range understates by one

- **Claim** "`0100`–`0118` project-scoping series (+ `0111` SET NULL idiom)"
- **Expected** the project-scoping series ends at 0118.
- **Actual** `backend/migrations/0119_pos_shifts_store_id.sql` is part of the same project-scoping
  work (POS shifts get `store_id`), and `DEVELOPER_ROADMAP.md` T20 groups `0118`+`0119`+`0120`
  together as "Phase 4 project-scoping". The series runs 0100–0119.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC

## D‑6 · [[migrations]] §3 — the four schema gotchas · MATCHED

- **Claim** `pos_users.name` GENERATED (`first_name || ' ' || last_name`), insert first/last only ·
  `pos_users.organization_id` `INTEGER NOT NULL`, every INSERT must include it ·
  `pos_transactions` references staff via `cashier_id` not `staff_id` · `ALTER TABLE ADD COLUMN`
  cannot add NOT NULL without a DEFAULT.
- **Expected** all four in the live lineage head.
- **Actual** All four. `0126_tenant_scoped_unique_sku_email.sql:224` carries
  `name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED`; `organization_id
  INTEGER NOT NULL DEFAULT 1`; the `pos_transactions` column list (`0112:333`) names `cashier_id`.
- **Class** MATCHED · **Severity** P3 · **Action** none

## D‑7 · [[migrations]] §4 — the free-plan KV trap · MATCHED

- **Claim** `RATE_LIMIT_KV_ENABLED="false"` in `backend/wrangler.toml` `[vars]`, keep it ·
  `cachedJsonResponse` uses only `Cache-Control`, no KV writes.
- **Expected** the flag in `[vars]`; zero KV writes on the response path.
- **Actual** `backend/wrangler.toml:56` `RATE_LIMIT_KV_ENABLED = "false"` (`[vars]`), `:97`
  (`[env.staging.vars]`). `grep -rn "KV_CACHE.put" backend/src` → **0 hits**. The rate limiter's KV
  branch is the only KV writer and it is disabled.
- **Class** MATCHED · **Severity** P3 · **Action** none

## D‑8 · [[migrations]] §2 — the `db-migration` skill and both apply commands · MATCHED

- **Claim** "Use the **`db-migration` skill** (`.opencode/skills/database/db-migration/SKILL.md`)" ·
  `npx wrangler d1 migrations apply <DB_NAME> --local --config backend/wrangler.toml` · "`./deploy.sh`
  applies migrations during deploy".
- **Expected** the skill file and both commands to be real.
- **Actual** The skill file exists. `backend/wrangler.toml:14-18` is a real `[[d1_databases]]` block
  with `database_name = "campmaster-db"`, so the named DB resolves. `deploy.sh:375-376` applies
  migrations (`echo y | npx wrangler d1 migrations apply $D1_NAME --remote $ENV_FLAG`).
- **Class** MATCHED · **Severity** P3 · **Action** none

## D‑9 · [[migrations]] §1 — the legacy-folder statement · MATCHED

- **Claim** "The pre-squash `0001`–`0099` lineage is archived in `backend/migrations/legacy/`
  (+ README) — archaeology only, wrangler scans the top level and ignores it."
- **Expected** 99 legacy files, a README, and a top-level-only scan.
- **Actual** `ls backend/migrations/legacy/*.sql | wc -l` → **99**; `backend/migrations/legacy/README.md`
  exists; `backend/wrangler.toml:18` `migrations_dir = "migrations"` (top level, non-recursive by
  wrangler's own semantics) and `scripts/check-deploy-parity.sh` inventories top-level `*.sql` only.
- **Class** MATCHED · **Severity** P3 · **Action** none

## D‑10 · [[07-data/README]] §Concepts — the six load-bearing authoring rules · MATCHED

- **Claim** additive/idempotent DDL · SQLite cannot drop an index-backed constraint so a re-scoped
  `UNIQUE` needs a table rebuild · rebuilds need the `PRAGMA defer_foreign_keys` bracket ·
  **`PRAGMA table_info` hides generated columns — use `table_xinfo`** · every query tenant-scoped ·
  free-plan traps are data-layer traps.
- **Expected** each rule to be reflected in the tree, not just asserted.
- **Actual** `table_xinfo` is used exactly where the rule says it must be:
  `backend/tests/tenant-scoped-uniqueness.test.js:76-78` ("table_xinfo also reports GENERATED
  columns (hidden = 3 for STORED)") and `backend/tests/meals-tenant-composite-pk.test.js:85`. The
  defer-pragma bracket is real and used (`0111`, `0115`, `0126` all rebuild). `RATE_LIMIT_KV_ENABLED`
  and the D1 row-read cap are the two documented traps (**RUNBOOK** §9a).
- **Class** MATCHED · **Severity** P3 · **Action** none

## D‑11 · [[07-data/README]] §Concepts — the lineage range glosses a deliberate gap

- **Claim** "the live top level (`0001`–`0014` + `0100`–`0127`) is what wrangler scans"
- **Expected** the two ranges to be accurate as ranges.
- **Actual** Accurate as ranges, but it reads as contiguous. `0125` is **absent and deliberately so**
  (the same fact `docs/01-architecture/ARCHITECTURE.md` §5 documents with its reason). A reader who
  takes the range as contiguous will conclude a migration is missing.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC

## D‑12 · [[07-data/README]] — the migration-head drift callout · **MATCHED, and correct** · control entry

- **Claim** "⚠️ **Migration-head drift is still live.** … The tree has **40** migrations with head
  `0127_meals_tenant_composite_pk.sql`."
- **Expected** 40 files, head `0127_meals_tenant_composite_pk.sql`, and `0127` named as the archive
  blocker.
- **Actual** Exactly 40; `0127_meals_tenant_composite_pk.sql` is present and is the highest-numbered.
  `backend/migrations/0127_meals_tenant_composite_pk.sql:4-6` declares itself "⚠️ PENDING-APPLY. This
  file is committed but NOT applied to any database." — so "head" here means *present in the tree*,
  which is the reading the file's own `code-references` block uses.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Why this entry exists** it is the control for **D‑1**/**D‑2**: the folder's index carries the
  correct head and the correct slot, so the guide's errors are not a folder-wide ignorance — they
  are one unrefreshed file, and the folder already knows it.

## D‑13 · [[migrations]] §1 — the head claim does not carry the pending-apply caveat · UNDOCUMENTED

- **Source** `docs/07-data/migrations.md` §1 vs `backend/migrations/0127_meals_tenant_composite_pk.sql`
- **Claim (gap)** No doc in `docs/07-data` states that `0127` is committed but **not applied**, or
  that `0124`/`0126`/`0127` post-date the guide.
- **Actual** `0127`'s own header says it plainly ("PENDING-APPLY … Owner command (never run by an
  agent)"), and `tenant-import-schema.md` §"Why the array caps stay at 200" and the appendix both
  reason *about* `0127` as a landed change ("**Reusable across tenants since 0127**"), which is only
  true once it is applied. Nothing in `07-data` carries the distinction between *the head in the
  tree* and *the head in the ledger*.
- **Class** UNDOCUMENTED · **Severity** P2 · **Action** UPDATE-DOC

---

# 04-testing

## T‑0 · Test-count provenance for this audit

**No suite was re-run.** Every count below is compared against the latest result committed to
`docs/98-history/sessions/AGENT_LOGBOOK_HISTORY.md`:

| Suite | Latest committed result | Logbook source |
| --- | --- | --- |
| `cd backend && npx vitest run` | **127 files / 2743 tests PASS** | `a2-saga-status` (2026-10-02), re-confirmed same day by `a7-workstream-closure` (line 9684) |
| `cd app && npx vitest run` | **155 files / 3632 tests PASS** | `tenant-outage-vs-404` (2026-10-03, line 9695) |
| `npx vitest run --config vitest.integration.config.ts` | **37 files / 255 tests PASS** | `full-gate 23:19 run` (2026-09-09, line 9278); 262-registered corroborated by the 2026-09-06 heading `ROOT INTEGRATION PHASE: GREEN (262/0, 37 files)` (line 9103) |
| `CI=true npx playwright test` | **919 passed / 0 failed / 15 skipped** (per-project, 2026-09-06) | market/tenant/admin/auth/cross-cutting/pos/public/routing breakdown, line 9195 region |

`cd monitor && npx vitest run` → 7 files / 191 tests (`mon-probe-selfcheck`, 2026-10-03) — listed for
completeness; no monitor suite is claimed in this folder's scope.

## T‑1 · [[TESTING]] suite table — backend and frontend rows · STALE

- **Claim** "| Backend unit | `cd backend && npx vitest run` | **2610 tests / 115 files** |" ·
  "| Frontend unit | `cd app && npx vitest run` | **3561 tests / 149 files** |"
- **Expected** the latest committed result for each.
- **Actual** Backend **2743 / 127**, frontend **3632 / 155** (**T‑0**). Backend is 3 files / 133
  tests behind; frontend 1 file / 71 tests behind. The header of the very table these sit under
  says "Suites and counts (verified)".
- **Class** STALE · **Severity** P2 · **Action** UPDATE-DOC

## T‑2 · [[TESTING]] suite table — the E2E row is two months and one generation stale · STALE

- **Claim** "| E2E | `CI=true npx playwright test` | **566 total / 552 gate passed, 14
  env-skipped** |"
- **Expected** the latest committed full gate.
- **Actual** **919 passed / 0 failed / 15 skipped** (**T‑0**), from the 2026-09-06 per-project run.
  The 566/552/14 figure traces to `AGENT_LOGBOOK_HISTORY.md:6630` — **2026-08-12**, "CLEAN RE-RUN
  (verified 2026-08-12, ~07:10) … 552 passed / 0 failed / 14 skipped (17.8m), 566 total". So the row
  is a verbatim, correctly-transcribed result from two months and roughly 350 tests ago.
- **Class** STALE · **Severity** P2 · **Action** UPDATE-DOC
- **Worse than the arithmetic** the number is not just wrong, it is *wrong in the direction that
  understates*: a reader sizing the E2E gate reads 566 where the suite now runs 919+.

## T‑3 · [[TESTING]] suite table — root integration row · MATCHED

- **Claim** "| Root integration | `npx vitest run` | **255 tests / 37 files** (262 registered; 7
  dropped by the documented 30-min `/api/auth` login-limit flake) |"
- **Expected** 255 passing / 37 files, and a 262-registered figure with a 7-test explanation.
- **Actual** **255 / 37** PASS (`AGENT_LOGBOOK_HISTORY.md:9278`, 2026-09-09). The 262-registered and
  7-dropped halves are independently corroborated by the 2026-09-06 heading at line 9103
  ("ROOT INTEGRATION PHASE: GREEN (262/0, 37 files)"). This is the **only** suite row in the whole
  folder that is still correct.
- **Class** MATCHED · **Severity** P3 · **Action** none

## T‑4 · [[TESTING]] "Writing tests" — the two file counts · STALE

- **Claim** "**Unit**: Vitest. Backend tests live in `backend/` (**115 files**); frontend in `app/`
  (**149 files**, colocated or under `app/src/**/__tests__`)."
- **Expected** 115 backend test files, 149 frontend.
- **Actual** Backend is **127** files, frontend **155** (**T‑0**) — the same drift as **T‑1**, stated
  a second time so a single correction does not fix the doc.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC

## T‑5 · [[TESTING]] §"Quick reference: all admin panel tab IDs" — **28 of 46 admin IDs and 2 of 6 POS IDs are missing** · **P1**

- **Claim** Three tables: "Super Admin (**3 tabs**)": `super_dashboard`, `super_tenants`,
  `super_reservations`. "Tenant Admin (**15 tabs**)": `dashboard`, `camps`, `rooms`, `rateplans`,
  `reservations`, `inbox`, `calendar`, `meals`, `menu-planner`, `menu`, `planning`, `reports`,
  `low-stock`, `staff`, `settings`. "POS (**4 tabs**)": `dashboard`, `products`, `orders`, `shift`.
- **Expected** every nav tab in the app to appear.
- **Actual** The nav arrays were enumerated exhaustively, not sampled:
  `app/src/components/admin/AdminApp.tsx` carries **46** `{ id: '…', label: … }` entries —
  **29 tenant** and **17 super**. `app/src/components/pos/POSApp.tsx:39-44` carries **6** POS views.
  Every documented ID exists in code (0 documented-but-missing), so this is incompleteness, not
  invention. Missing:
  - **14 tenant IDs** — `cashdesk`, `folios`, `analytics`, `promotions`, `services`,
    `service-bookings`, `financials`, `hr`, `supply`, `crm`, `storefront`, `ai`, `billing`, `import`
  - **14 super IDs** — `super_feedback`, `super_users`, `super_settings`, `super_audit`,
    `super_subscriptions`, `super_financials`, `super_hr`, `super_supply`, `super_crm`,
    `super_storefront`, `super_ai`, `super_reports`, `super_health`, `super_performance`
  - **2 POS views** — `tables`, `kitchen`
- **Class** STALE · **Severity** **P1** · **Action** UPDATE-DOC
- **Severity rationale** the table's own purpose is stated twice — as the reference E2E selectors
  "depend on", and as the "only place in the repo" carrying these IDs (**T‑6**). A reader using it
  to find a tab finds 39% of them, and the missing set is precisely the post-T13 feature areas.
  Twelve of the missing IDs are actually selected on by E2E specs (verified: `'analytics'`,
  `'billing'`, `'crm'`, `'financials'`, `'hr'`, `'promotions'`, `'service-bookings'`, `'storefront'`,
  `'supply'`, `'super_audit'`, `'super_health'`, `'super_performance'` all appear quoted in
  `tests/e2e/**`), so the dependency the README asserts is real *and* the table cannot service it.

## T‑6 · [[04-testing/README]] — "Admin tab IDs live only here" · **FALSE**

- **Claim** "**Admin tab IDs live only here** — the 3 super-admin / 15 tenant-admin / 4 POS tab IDs
  are the only place in the repo that carries them; E2E selectors depend on this table staying put."
- **Expected** no other place in the repo enumerates them.
- **Actual** `AdminApp.tsx` carries all 46 and `POSApp.tsx` carries all 6, by definition — they are
  the source the table transcribes. The counts (3/15/4) are the stale half (**T‑5**).
- **Class** FALSE · **Severity** **P1** · **Action** UPDATE-DOC
- **Severity rationale** this is the sentence that makes the stale table authoritative. It tells a
  reader the table cannot drift from the code because nothing else carries the data — which is the
  opposite of the situation, and the reason the drift went unnoticed.

## T‑7 · [[04-testing/README]] — env-skipped count · STALE

- **Claim** "**Env-skipped tests are counted, not hidden** — 14 tests skip on missing env."
- **Expected** 14.
- **Actual** **15** in the latest committed full gate (**T‑0**). The 14 traces to the 2026-08-12 run
  (line 6630) — the same stale source as **T‑2**.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC
- **Note** `docs/01-architecture/ARCHITECTURE.md` §7 says 15 and `docs/01-architecture/QUICK_START.md`
  §4 says 14, per Part 8a entries **A‑21**/**Q‑4**. So the vault now carries 14 and 15 for the same
  suite in two different folders, and this is one of the two places 14 survives.

## T‑8 · [[TESTING]] §"Ground truth" — two gitignored paths and a moved file · STALE

- **Claim** "`test-results/.last-run.json` records the previous run's results. If
  `tests/e2e/results/*` disagree with `AGENT_LODBOOK.md`, the `.last-run.json` and the full log are
  authoritative."
- **Expected** both paths to be locatable, and `AGENT_LOGBOOK.md` to hold the suite results.
- **Actual** **Both artifact paths are gitignored and absent from the tree** —
  `git check-ignore` confirms `tests/e2e/results/` matches `.gitignore:14`, and `.gitignore:10`
  ignores `test-results/`; `ls test-results/` returns an empty directory. The advice is correct as
  operator practice but points at nothing a reader can inspect. And **`AGENT_LOGBOOK.md` no longer
  holds suite results**: it is now the 188-line reference tier, and the append-only history with
  every suite result moved to `docs/98-history/sessions/AGENT_LOGBOOK_HISTORY.md` in the 2026-10-06
  restructure (Part 8a **A‑21** records the same dangling pointer in `ARCHITECTURE.md`).
- **Class** STALE · **Severity** P2 · **Action** UPDATE-DOC

## T‑9 · [[TESTING]] §E2E specifics — "boots both servers" · MATCHED

- **Claim** "The E2E suite **boots both servers** (backend + frontend) itself in CI mode."
- **Expected** two `webServer` entries.
- **Actual** `playwright.config.ts:98-121` has exactly two: `:106-107`
  `cd backend && npx wrangler d1 migrations apply campmaster-db --local && npx wrangler dev --port
  8787 --local` and `:116` `cd app && npx astro dev --port 4320 --host`, both `reuseExistingServer:
  true`, `timeout: 240_000`. The `:100-105` comment independently documents the blank-D1 trap
  `tests/globalSetup.ts` shares.
- **Class** MATCHED · **Severity** P3 · **Action** none

## T‑10 · [[TESTING]] §Port hygiene · MATCHED

- **Claim** `4320 = frontend (Astro dev/preview)`, `8787 = backend (wrangler dev)`
- **Expected** the same two ports the config uses.
- **Actual** `playwright.config.ts:4` `const UNIFIED_PORT = 4320`; `:108` `port: BACKEND_PORT`
  driven by the `:107` `--port 8787`. Both match.
- **Class** MATCHED · **Severity** P3 · **Action** none

## T‑11 · [[TESTING]] §Tenant page `load` hang · MATCHED

- **Claim** "Tenant E2E pages can hang on `load` in `astro dev` because logo/favicon point at a dead
  `localhost:8001`. Specs use `page.goto(url, { waitUntil: 'domcontentloaded' })` — keep this
  convention in new specs."
- **Expected** both the cause and the convention.
- **Actual** The convention is real and applied in `tests/e2e/**` (e.g. `routing/zone-exclusivity.spec.ts`).
  The `localhost:8001` cause is the repo's own operational guidance (`AGENTS.md` §3) and is
  corroborated by `AGENT_LOGBOOK_HISTORY.md:9695`, which records `Retry-After`/503 work on the same
  tenant pages.
- **Class** MATCHED · **Severity** P3 · **Action** none

## T‑12 · [[TESTING]] §CI checks before shipping · MATCHED

- **Claim** Five ordered gates: backend unit · app unit · root integration · `cd app && npm run build`
  · `CI=true npx playwright test` with a passed/failed/skipped figure.
- **Expected** all five real; the build script real.
- **Actual** `app/package.json` has a `build` script; the three vitest commands are real;
  `npx playwright test` is the config's `testDir`. The figure on the last line is stale (**T‑2**).
- **Class** MATCHED (the five gates) / STALE (the figure) · **Severity** P3 · **Action** UPDATE-DOC

## T‑13 · [[TESTING]] §Cross-cutting manual steps 32–34 · UNVERIFIED

- **Claim** Three numbered manual procedures (auth/security, responsive, error handling), 7 + 5 + 4
  actions.
- **Expected** no automatable form.
- **Actual** These are by construction manual checklists; nothing in the tree can confirm or deny
  that step 32.1 redirects to login. The steps themselves are consistent with the zone/auth model
  (`/admin` guarded, JWT in `localStorage` via `app/src/lib/session.ts:52`).
- **Class** UNVERIFIED · **Severity** P3 · **Action** DEFER
- **Credit** the folder README states the risk correctly — "Not automatable, and skipped silently
  is the same as passed unless you do them" — which is the right framing and the reason this is not
  a defect.

## T‑14 · [[04-testing/README]] — "verified counts, not remembered counts" · FALSE as stated

- **Claim** "**Verified counts, not remembered counts** — the suite table is filesystem-verified and
  dated. A count in this file is a claim with a date on it."
- **Expected** the suite table to carry a date or a producing commit per count.
- **Actual** `TESTING.md`'s table carries **no date and no commit** on any of its four rows, and the
  file's front matter says `verified: never`. `docs/01-architecture/ARCHITECTURE.md` §7 — which made
  the opposite design choice, "each row is labelled with its producing commit, which is exactly why
  the drift is visible rather than authoritative" (Part 8a **A‑20**) — does the labelling this README
  claims for it. The 566/552/14 row (**T‑2**) is a **2026-08-12** result with nothing in the file
  saying so.
- **Class** FALSE · **Severity** P2 · **Action** UPDATE-DOC
- **Severity rationale** this is a meta-claim about the folder's own reliability, and it is the
  reason **T‑1**/**T‑2**/**T‑4** could rot unnoticed for two months. The claim is what a reader would
  use to decide *not* to re-run a suite; it should not be there unless each count carries its date.

## T‑15 · All `code-references` across both files · MATCHED

- **Claim** `playwright.config.ts`, `vitest.integration.config.ts`, `scripts/run-all-tests.sh`,
  `tests/e2e/specs/`, `tests/e2e/pages/`, `tests/e2e/fixtures/`, `backend/tests/`, `app/tests/`
- **Expected** every path to exist.
- **Actual** **9 / 9 resolve.** `scripts/run-all-tests.sh` (10,115 B) exists, as do all three E2E
  directories and both test roots.
- **Class** MATCHED · **Severity** P3 · **Action** none

---

# 06-security

## S‑1 · [[security-guide]] §Rate Limiting — the mount point and line reference · MATCHED

- **Claim** "a declarative policy table (`RATE_LIMIT_POLICIES` in
  `backend/src/middleware/rateLimit.js`) evaluated by `policyLimiter`, mounted once as
  `app.use('/api/*', policyLimiter())` in `backend/src/index.js:147`"
- **Expected** that exact line.
- **Actual** `backend/src/index.js:147` is `app.use('/api/*', policyLimiter());`, preceded by the
  three-line comment at `:143-146` that says "One ordered policy table (RATE_LIMIT_POLICIES)
  replaces every previously scattered explicit rateLimitMiddleware mount. First matching entry wins;
  SSE streams are exempted inside policyLimiter." `RATE_LIMIT_POLICIES` is at `rateLimit.js:25`,
  `policyLimiter` at `:113`.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Note** this is the same line `06-security/README.md` cites in its front matter, and it is right.

## S‑2 · [[security-guide]] §Rate Limiting — "the second, tenant-scoped layer … is mounted on 7 prefixes" · **FALSE** · P2

- **Claim** "**A second, tenant-scoped layer** (`tenantAwareLimiter`) is mounted on 7 prefixes
  (`/api/tenants/:tenantId/meta/*`, `/api/tenants/import/*`, `/api/admin/*`,
  `/api/tenant/billing/*`, `/api/pos/*`, `/api/reports/*`, `/api/inventory/*`)"
- **Expected** 7 `app.use(…, tenantAwareLimiter())` mounts.
- **Actual** **36.** `grep -oE "app\.use\('[^']*', tenantAwareLimiter\(\)\)" backend/src/index.js`
  returns 36 distinct mounts. The 7 named are the **first 7 in declaration order** — the list grew
  by 29 and was never re-counted. Full set: `/api/tenants/:tenantId/meta/*`,
  `/api/tenants/import/*`, `/api/admin/*`, `/api/tenant/billing/*`, `/api/pos/*`, `/api/reports/*`,
  `/api/inventory/*`, `/api/price-overrides/*`, `/api/plans/*`, `/api/meal-categories/*`,
  `/api/categories/*`, `/api/meals/*`, `/api/promotions/*`, `/api/services/*`, `/api/inbox/*`,
  `/api/leads/*`, `/api/me/*`, `/api/products/*`, `/api/rooms/*`, `/api/rateplans/*`,
  `/api/projects/links/*`, `/api/projects/items/*`, `/api/orders/*`, `/api/folios/*`,
  `/api/upload/*`, `/api/projects/:projectId/meta/*`, `/api/tags/*`,
  `/api/projects/:projectId/tags/*`, `/api/audit/*`, `/api/pos-tables/*`, `/api/financials/*`,
  `/api/hr/*`, `/api/supply/*`, `/api/crm/*`, `/api/storefront/*`, `/api/ai/*`.
- **Class** FALSE · **Severity** **P2** · **Action** UPDATE-DOC
- **Severity rationale** 7 vs 36 understates the tenant-scoped rate-limit surface by 5×, and this is
  the layer that makes per-tenant limiting real. An auditor sizing blast radius reads 7.
- **Cross-doc** `docs/01-architecture/ARCHITECTURE.md` §4 carries the *same* 7-prefix figure (Part
  8a **A‑16**), and the security guide's own §Verification note repeats it a second time
  ("plus a second tenant-scoped layer on 7 prefixes"). **This is now a three-site defect**, and the
  security guide is the one an auditor is most likely to read.

## S‑3 · [[security-guide]] §Rate Limiting — the policy-table size · STALE

- **Claim** "a ~20-entry ordered policy table keyed `${cf}:${path}`"
- **Expected** ~20 entries.
- **Actual** `RATE_LIMIT_POLICIES` (`rateLimit.js:25-97`) holds **23 non-`default` entries plus
  `default`** — lines 33, 34, 35, 36, 37, 38, 39, 41, 43, 44, 45, 46, 49, 51, 56, 85, 86, 87, 88, 92,
  93, 94, 95 and the `default` at 96.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC
- **Credit** "~20" is a fair reading of 23, and the doc's insistence on naming the *mechanism*
  (first-match-wins, per-entry `envKey`, mid-path vs trailing `*`) is what makes the table auditable
  at all. Only the number is loose.

## S‑4 · [[security-guide]] §Rate Limiting — all nine named per-surface budgets · MATCHED

- **Claim** "`GET /api/marketplace*` 300/min, `GET|HEAD /api/media*` 300/min, `GET
  /api/availability` 120/min, `/api/pos/*` 60/min, `/api/auth/*` 30/min (dial `RATE_LIMIT_LOGIN`),
  `/api/admin*` 20/min, `POST /api/tenants` 5/5min, `POST /api/feedback` 6/min, `GET
  /api/orders/status/*` 5/min"
- **Expected** all nine verbatim.
- **Actual** All nine, verbatim, at `rateLimit.js:85`, `:92`+`:93`, `:88`, `:43`, `:34` (with
  `envKey: 'RATE_LIMIT_LOGIN'`), `:37`, `:35`, `:46`, `:51`. The doc's parenthetical claims are also
  right: `default` is `{ max: 100, envKey: 'RATE_LIMIT_API' }` (`:96`) and `readLimitInt` falls back
  to the hardcoded `max` on a non-positive or unparseable value (`:105-111`).
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Credit** nine specific numbers, quoted with their entries, all correct — this is what an auditor
  needs and it is rarer than it should be.

## S‑5 · [[security-guide]] §Rate Limiting — exemption, mint budget, test bypass, tenant key · MATCHED

- **Claim** (four) SSE `GET /api/stream/orders` is skipped inside `policyLimiter`; `POST
  /api/stream/token` is **not** exempt (10/min); both limiters no-op when
  `env.ENVIRONMENT === 'test'`; the tenant key is `t:<ip>:<tenantId>:<path>` and it no-ops for
  callers with no resolved tenant.
- **Expected** all four.
- **Actual** `rateLimit.js:153` `if (c.req.path === '/api/stream/orders')` with the `:151-152`
  comment "the mint endpoint (POST /api/stream/token) is NOT exempt"; `:56`
  `'POST /api/stream/token': { max: 10, window: '1m' }`; `:172` and `:271`
  `if (c.env && c.env.ENVIRONMENT === 'test')`; `:285`
  `makeKey: (ip, path) => \`t:${ip}:${scope.tenantId}:${path}\``. Fail-closed is confirmed at `:211`
  and `:246` (`429 Rate limit check failed`).
- **Class** MATCHED · **Severity** P3 · **Action** none

## S‑6 · [[security-guide]] §Rate Limiting — "100 requests/minute is only the fallback bucket" · MATCHED

- **Claim** "'100 requests/minute' is only the fallback bucket. It is the `default` entry, used by any
  path no other entry claims."
- **Expected** a `default` entry at 100/min with first-match-wins semantics.
- **Actual** `rateLimit.js:96` `default: { max: 100, envKey: 'RATE_LIMIT_API' }`; `:118`
  `if (key === 'default') continue;` in the compile loop, so `default` is reached only when no entry
  matched. `:13` states the ordering contract.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Why this entry exists** it is the single most load-bearing correction the 2026-10-02 pass made
  to this file (Verification note item 2: "Rate limiting was documented as '100 requests/minute per
  IP'"), and it held.

## S‑7 · [[security-guide]] §CORS Policy — the whole block · MATCHED

- **Claim** CORS configured "in exactly one place — `backend/src/index.js:123–141`, the global
  `hono/cors` middleware"; async origin function; wildcard regex compiled once at module load;
  `maxAge: 86400`; **no** `credentials: true`; custom domains cached for
  `CUSTOM_DOMAIN_CACHE_TTL = 5 * 60 * 1000`; returning `null` omits the headers; and the
  single-source-of-truth rule extending to Durable Objects.
- **Expected** the cited line range and every auditor's note.
- **Actual** `index.js:123` `app.use('*', cors({`; `:125` `origin: async (origin, _c) => {`; `:127`
  wildcard-regex loop; `:130` `EXACT_ORIGINS.includes(origin)`; `:132-134` the cached custom-domain
  lookup; `:138-140` `allowMethods` (six verbs) / `allowHeaders` (`Content-Type`, `x-tenant-id`,
  `Authorization`) / `maxAge: 86400`; `:141` `}));`. **The cited range 123–141 is exact**, and no
  `credentials` key appears anywhere in it. The 5-minute TTL is real (`_customDomainCacheTime` +
  the helper ending at `:121`).
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Credit** the four auditor's notes (single-segment wildcard so `a.b.sinaicamps.com` does not
  match; up-to-5-minute staleness for a newly registered domain; no credentials flag needed for
  bearer auth; `null` vs `false` is what omits the headers) are each correct and each is the kind of
  thing a reader would otherwise get wrong. This is the strongest section in the folder.

## S‑8 · [[security-guide]] §XSS Layer 2 — the escHtml census, all four rows and every line · MATCHED

- **Claim** (table) `app/src/lib/utils.ts:3` 1 hit (canonical def) · `CampsSection.astro` 12
  (1 **local** def at `:195` + 11 call sites into `grid.innerHTML`) · `HRPanel.tsx` 4 (1 import + 3
  calls at `:302/:303/:307` feeding a `document.write` template at `:354`) · `MarketplaceHome.astro` 1
  (1 **local** def at `:201`, currently unreferenced) — "**18** `escHtml` hits remain, all KEEP".
- **Expected** 18 total, split 1/12/4/1, at those exact lines.
- **Actual** `grep -rn "escHtml" app/src` returns **18** lines in exactly those four files:
  `utils.ts:3` (1) · `CampsSection.astro` 12 (`:195` local def, then `:276 :277 :279 :281 :285 :288
  :289 :290 :291 :295 :296` = 11 call sites) · `HRPanel.tsx` 4 (`:14` import, `:302 :303 :307`) ·
  `MarketplaceHome.astro:201` (1). Every line number in the doc's table is exact, and the
  `MarketplaceHome.astro` def is genuinely unreferenced by any call site.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Credit** naming the two *local* shadow definitions — and the consequence, spelled out in the
  prose ("a fix to `utils.ts` does **not** reach them") — is the single most useful sentence in the
  document. It converts a function-level finding into a file-level risk.

## S‑9 · [[security-guide]] §Known safe patterns — `dangerouslySetInnerHTML`, `set:html`, backend `escHtml` · MATCHED

- **Claim** "Zero instances [of `dangerouslySetInnerHTML`] in `app/src`" · "Exactly 3 [ `set:html` ]
  sites, all JSON-LD `JSON.stringify` (PublicLayout, TenantLanding via `sanitizeForJsonLd`, camps
  page)" · "Backend `escHtml()` … defined in `backend/src/utils/response.js:108` and covered by
  `backend/tests/response.test.js`, but **no module under `backend/src` calls it** … Do not read its
  presence as an active defence."
- **Expected** 0 / 3 / an unused-but-tested export.
- **Actual** `grep -rn "dangerouslySetInnerHTML" app/src | wc -l` → **0**. `grep -rn "set:html" app/src`
  → exactly 3: `layouts/PublicLayout.astro:163`,
  `components/public/TenantLanding.astro:98` (inside `sanitizeForJsonLd(jsonLd)`), `pages/camps.astro:84`
  — the three files named. `response.js:108` is `export function escHtml(str) {`; the only other
  `escHtml` occurrences under `backend/` are `backend/tests/response.test.js:2,159-173` (the unit
  test) and two **comments** at `api/camps.js:285-286` ("Do NOT escHtml() here — escape at render
  time, not storage time") plus one at `index.js:153`. Zero real callers.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Credit** "Do not read its presence as an active defence" is the correct verdict on an exported-
  but-uncalled function, and it is the kind of sentence that stops a reviewer ticking a box.

## S‑10 · [[security-guide]] §XSS Layers 3 and 4 — no sanitisation middleware, no scrub-on-write · MATCHED

- **Claim** Layer 3: Zod `.strip()` at the boundary; "the old `sanitizeInput` middleware was removed
  rather than left as a false defense: since Hono 4.12 it had been a silent no-op (getter-only
  `c.req`) … see the removal note in `backend/src/index.js`". Layer 4: `0076_sanitize_user_data.sql`
  "exists **only** under `backend/migrations/legacy/` (99 files there, excluded from the applied
  lineage — `scripts/check-deploy-parity.sh` inventories top-level `backend/migrations/*.sql` only)".
- **Expected** no `sanitize.js`; the removal note present; `0076` only in legacy.
- **Actual** `ls backend/src/middleware/` → `rateLimit.js`, `requireAuth.js`, `resolveScope.js`,
  `sharedAuth.js`, `tenant.js`. **No `sanitize.js`.** `backend/src/index.js:149-154` carries the
  removal note verbatim ("sanitizeInput middleware REMOVED. It was a silent no-op since Hono 4.12
  (c.req is getter-only — reassignment threw inside try/catch and the original body passed through
  untouched)"). `legacy/0076_sanitize_user_data.sql` exists; a top-level `0076*` does not.
  `legacy/` holds 99 files.
- **Class** MATCHED · **Severity** P3 · **Action** none

## S‑11 · [[security-guide]] §Authentication — both token worlds · MATCHED

- **Claim** Admin tokens from `POST /api/auth/login` with `role: 'admin'` or `'super_admin'`, scoped
  via `tenantId`; POS tokens from `POST /api/pos/auth/login` with `posType: 'pos'`, scoped via
  `organizationId`; tokens stateless; stored client-side in `localStorage`; transmitted as
  `Authorization: Bearer`; cross-tenant access blocked; scope denial returns **403**, not 401.
- **Expected** all of it.
- **Actual** `backend/src/routes/pos/index.js:240-246` builds the POS claim set —
  `organizationId: user.organization_id`, `storeId`, `projectId`, `role`, `posType: 'pos'`,
  `userType: 'org'` — and `:370` sets `posType: 'pos'` on the refresh token. POS login is mounted at
  `routes/pos/index.js:278` `pos.post('/auth/login', …)`, reached as `/api/pos/auth/login` via
  `index.js:339`. Admin auth is `index.js:213` `app.all('/api/auth/*', …)` → `handleAuthRoute`.
  Token storage is `app/src/lib/session.ts:52,63,74` (`window.localStorage.getItem/setItem/removeItem`).
  The 403/401 split matches Part 8a **C‑7** exactly.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **UNDOCUMENTED (P3)** there is a **second** POS login entry the guide does not mention:
  `POST /api/auth/pos-login` (`index.js:211`, `handlePosLoginRequest`), which
  `API_SURFACE_MAP.md` documents as "POS cashier login via admin host". Same handler, different
  mount; the guide reads as if `/api/pos/auth/login` is the only POS credential path.

## S‑12 · [[security-guide]] §CSRF Resistance — the whole argument · MATCHED

- **Claim** Inherently CSRF-resistant because auth is a header, not an ambient cookie; the
  cookie-migration counterfactual would void the exemption.
- **Expected** the architecture to match.
- **Actual** Consistent with **S‑11**: `Authorization: Bearer` + `localStorage`, no auth cookie, and
  `response.js` never sets one. The three-mechanism table and the "if switching to cookie-based auth:
  ADD anti-CSRF token implementation" status block are both present and correct as stated
  architecture documentation.
- **Class** MATCHED · **Severity** P3 · **Action** none

## S‑13 · [[security-guide]] §CSRF table — "All API requests use JSON bodies" · STALE

- **Claim** "| `Content-Type: application/json` | **Defense-in-depth** | **All API requests use JSON
  bodies.** Simple cross-origin form submissions can only send
  `application/x-www-form-urlencoded`, `multipart/form-data`, or `text/plain`. |"
- **Expected** every mutating API to take JSON.
- **Actual** **`POST /api/upload` accepts `application/octet-stream`** with a `?filename=` query —
  `backend/src/api/upload.js:84` documents that path, alongside the multipart branch, with the
  ≤8 MB cap (`:7`) and the five MIME types (`:15-19`). A cross-origin `<form enctype="multipart/
  form-data">` can therefore reach it, so the third mechanism's stated basis does not hold for the
  one endpoint where a file is expected.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC
- **Severity rationale** low, because the primary defence (bearer header, no cookie) is unaffected —
  the request still arrives without the JWT. But the sentence says **all**, and an auditor reading a
  "defense-in-depth" row wants the exceptions.

## S‑14 · [[security-guide]] §Input Sanitization — no sanitize middleware, Zod, `.bind()` · MATCHED

- **Claim** "`backend/src/middleware/sanitize.js` is absent from disk and no `sanitizeInput` mount
  exists" · Zod `.strip()` · parameterized `.prepare().bind()`, never interpolation.
- **Expected** all three.
- **Actual** Both halves confirmed (**S‑10**). `.bind()` discipline: the repo's own safety rules
  (`AGENTS.md` §2) mandate it and `toSnake`/`.strip()` are at `response.js:27` and across the
  schemas; the doc's code examples are illustrative, not quoted from a file.
- **Class** MATCHED · **Severity** P3 · **Action** none

## S‑15 · [[security-guide]] §Free-plan caveat — the flag in both envs · MATCHED

- **Claim** "Currently set to `RATE_LIMIT_KV_ENABLED="false"` (in-memory per-isolate fallback) in
  both `[vars]` and `[env.staging.vars]`." And Recommendation 3: keep it.
- **Expected** both, `"false"`.
- **Actual** `backend/wrangler.toml:56` `[vars]` and `:97` `[env.staging.vars]`, both `"false"`. The
  surrounding comment (`:53-55`) states the 1,000/day rationale and the "re-enable once quota is no
  longer exhausted or the plan is upgraded" condition, so the doc and the config agree on both the
  value and the reason.
- **Class** MATCHED · **Severity** P3 · **Action** none

## S‑16 · [[security-guide]] — two stale pre-restructure paths · STALE

- **Claim** §Token lifecycle: "Full matrix: `docs/API_CONTRACT.md` §7 (sourced from
  `backend/src/middleware/requireAuth.js` `DEFAULT_MESSAGES`)". §XSS Layer 2: "full inventory:
  `docs/audit-2026-09-30-eschtml-inventory.md`".
- **Expected** both paths to resolve.
- **Actual** Neither. `docs/API_CONTRACT.md` → **no such file**; the doc is at
  `docs/02-api/API_CONTRACT.md`. `docs/audit-2026-09-30-eschtml-inventory.md` → **no such file**; it
  is at `docs/98-history/worksheets/audit-2026-09-30-eschtml-inventory.md`. Both *targets* are real
  and both *claims* are correct — the prose paths were not converted in the 2026-10-06 restructure
  (which fixed *wikilinks* but left these two markdown-path citations).
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC

## S‑17 · [[security-guide]] §Verification note — the three corrections it claims made · MATCHED

- **Claim** (dated 2026-10-02) that CORS was rebuilt from a static array, rate limiting from
  "100 requests/minute per IP", and the backend-`escHtml` row from "present, applied at render
  time" — and that the drift was in those three places, "not" the XSS section.
- **Expected** all three corrections to have landed and the XSS section to be unchanged since
  `fcd0e40`.
- **Actual** All three landed and all three hold (**S‑7**, **S‑6**, **S‑9**). The XSS section's own
  figures (**S‑8**) are still exact, which is what the note asserts about it. The one defect the
  note introduced is the 7-prefix figure (**S‑2**), repeated in both the section and the note.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Credit** a verification note that names what it changed, when, and what it deliberately left
  alone is the best mechanism in this vault for keeping a doc honest. **S‑2** is what happens when
  the note is written once and never re-verified.

## S‑18 · [[security-guide]] — the fix/regression SHAs it pins · UNVERIFIED

- **Claim** "Fix commit `af1d69b` unwrapped all 46 A/B/E call sites (inner expressions
  byte-identical); 18 `escHtml` hits remain, all KEEP" and "Regression test
  `app/tests/unit/tenant-name-escape.test.tsx` (commit `09ff710`)"
- **Expected** both SHAs to resolve and the regression test to exist.
- **Actual** `app/tests/unit/tenant-name-escape.test.tsx` **exists**, and
  `AGENT_LOGBOOK_HISTORY.md:9637-9638` independently records both commits with the exact counts
  ("unwrapped all 46 A/B/E lines per inventory table … 153 files / 3606 passed", then "+1 file/+5 →
  154 files / 3611 passed" for `09ff710`). The remaining-18 figure is re-verified directly
  (**S‑8**). The "byte-identical inner expressions" property cannot be re-derived from the tree
  without diffing against `af1d69b`.
- **Class** UNVERIFIED (the byte-identical claim) / MATCHED (both SHAs and the test) ·
  **Severity** P3 · **Action** DEFER

## S‑19 · [[06-security/README]] §Concepts — all seven · MATCHED

- **Claim** Seven bullets: JWT HS256 + no-fallback `JWT_SECRET` · CSRF exemption with its
  counterfactual · XSS as four layers with layer 2 narrow by design and **no scrub-on-write** ·
  rate limiting fails closed with the free-plan caveat called out · CORS owned by one place · no
  sanitisation middleware (Zod + `.bind()`) · recommendations plus a dated verification note.
- **Expected** each bullet traceable to the guide or the code.
- **Actual** All seven are real and every one is corroborated by an entry above: **S‑1/S‑2/S‑5**,
  **S‑11/S‑12**, **S‑8/S‑9/S‑10**, **S‑7**, **S‑14**, **S‑17**. The `env.JWT_SECRET` no-fallback
  rule is in `sharedAuth.js:15` (`algorithm: 'HS256'`) with no default in the sign/verify path
  (Part 8a **C‑4**). The three front-matter code-references — `requireAuth.js`, `rateLimit.js`,
  `tenant.js`, `index.js:147`, `utils.ts:3`, `routeZones.ts` — **all 6 resolve**.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Why this entry exists** the index is the best-written doc in this scope: it says *"a defence that
  is documented as 'not used here' is a decision, and a decision needs a record"* in its Overview.
  That is the standard the rest of the vault's indexes should meet.

---

# 05-operations

## O‑1 · [[RUNBOOK]] §2 — the full environment/resource map · **MATCHED, every value exact**

- **Claim** (table) Frontend `sinaicamps.com` / `staging.sinaicamps.com` · POS tenant-only with
  branded 404 on apex · Worker names `campmaster-backend` / `campmaster-marketplace` (and the
  `-staging` variants) · D1 `campmaster-db` / `campmaster-db-staging` · **`database_id`
  `1008d7ef-c64a-4594-a500-2e09e07e0e12` / `40f944f2-2d50-42b5-91bd-e629585c428c`** · R2
  `campmaster-media` / `campmaster-media-staging` · KV bindings `KV_CACHE`, `RATE_LIMIT_KV` in both.
- **Expected** all twelve values against `backend/wrangler.toml`.
- **Actual** Every one matches. `backend/wrangler.toml:1` `campmaster-backend`, `:93`
  `campmaster-backend-staging`; `:16-17` `campmaster-db` +
  `database_id = "1008d7ef-c64a-4594-a500-2e09e07e0e12"`; `:126-127` `campmaster-db-staging` +
  `database_id = "40f944f2-2d50-42b5-91bd-e629585c428c"`; `:34` `campmaster-media`; `:140`
  `campmaster-media-staging`; `:21`/`:131` `KV_CACHE`, `:25`/`:135` `RATE_LIMIT_KV`.
  `app/wrangler.toml:2` `campmaster-marketplace`, `:33` `campmaster-marketplace-staging`,
  `:24-25` the `API_BACKEND` service binding to `campmaster-backend` — which is also what §6's
  "roll back backend first" reasoning depends on.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Credit** two full UUIDs transcribed correctly, plus the runbook's own instruction that "if the
  file and this table disagree, the file wins" — that clause is why this entry exists and why it
  passed.

## O‑2 · [[RUNBOOK]] §3 — both preflight entry points and the ack-prod refusal · MATCHED

- **Claim** `./deploy.sh --preflight --staging` · `./scripts/deploy-preflight.sh --staging --live` ·
  `./scripts/check-deploy-parity.sh --production --live --ack-prod`; "Without `--ack-prod` the script
  refuses (exit 2) and contacts nothing."
- **Expected** both scripts, all three flags, and the exit code.
- **Actual** `deploy.sh:61-66` implements `--preflight` with `[ "${2:-}" = "--staging" ]` →
  `PREFLIGHT_EXTRA=("--staging")` and `--live` (`:12` header).
  `scripts/deploy-preflight.sh:48-50` parses `--staging|--production|prod`, `--live`, `--ack-prod`.
  `scripts/check-deploy-parity.sh:45-50` parses the same, `:50` exits **2** on an unknown argument,
  and `:97-99` prints `REFUSED: live production contact requires explicit --ack-prod.` then
  `exit 2`. Both scripts exist and are executable.
- **Class** MATCHED · **Severity** P3 · **Action** none

## O‑3 · [[RUNBOOK]] §3 — the four preflight gates · MATCHED

- **Claim** Gates [1] fresh non-empty `backups/campmaster-*.sql` (<24h) · [2] parity via
  `scripts/check-deploy-parity.sh` (ledger head/count, file-vs-ledger, table counts; exit 1 on
  mismatch) · [3] `wrangler.toml` `database_id` match for both envs + `[env.staging]` present ·
  [4] migration file inventory (top-level `*.sql`, `legacy/` excluded).
- **Expected** all four implemented.
- **Actual** `scripts/deploy-preflight.sh:104` `pass "staging database_id $STAGING_DB_ID present"`,
  `:106` `fail "staging database_id $STAGING_DB_ID NOT found in backend/wrangler.toml"`, `:108-109`
  `grep -q '^\[env\.staging\]'` → pass/fail. Gate [4]'s top-level-only rule is confirmed by the
  **D‑9** check (wrangler `migrations_dir = "migrations"`, legacy excluded). Gate [2]'s
  file-vs-ledger behaviour is `check-deploy-parity.sh`'s stated contract (`:13-24` header).
- **Class** MATCHED · **Severity** P3 · **Action** none

## O‑4 · [[RUNBOOK]] §4 — all six deploy flags · MATCHED

- **Claim** `./deploy.sh` (production), `--staging`, `--backend`, `--frontend`, `--migrate`,
  `--no-health`, `--rollback <id>`.
- **Expected** each flag handled.
- **Actual** `deploy.sh:31` `MODE="${1:-full}"`; `:39-40` `--staging` → `DEPLOY_ENV="staging"`;
  `:42-44` `--no-health`; `:45-55` `--rollback` with `[ "${2:-}" = "--staging" ]`;
  `:496` `--backend`, `:502` `--frontend`, `:508` `--migrate`, `:516` `--rollback`. The header block
  at `:7-15` documents all seven including `--preflight`.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Note** `--migrate` and `--frontend` are also **front-matter code-references of
  `DEVELOPER_ROADMAP.md`** T15's deploy-flags claim; that claim is corroborated here.

## O‑5 · [[RUNBOOK]] §4 — "takes a D1 export automatically and aborts on empty backup or failed Worker deploy" · MATCHED

- **Claim** as quoted.
- **Expected** an export step that aborts.
- **Actual** `deploy.sh:359` `BACKUP_FILE="$SCRIPT_DIR/backups/campmaster-$(date +%Y%m%d-%H%M%S).sql"`;
  `:360` `if retry "npx wrangler d1 export $D1_NAME --remote --output '$BACKUP_FILE'" …`; `:365`
  "(d1 export reported success but produced no data)"; `:369`
  `log "❌ D1 backup failed after 3 attempts — aborting deploy to prevent data loss"`. The filename
  pattern in gate [1] of §3 (`backups/campmaster-*.sql`) matches this exactly.
- **Class** MATCHED · **Severity** P3 · **Action** none

## O‑6 · [[RUNBOOK]] §4a — "Record BOTH version IDs" and the generated-wrangler wrinkle · MATCHED

- **Claim** `npx wrangler versions list --config backend/wrangler.toml [--env staging]` and the same
  for `app/wrangler.toml`; "the frontend is built and deployed from the **generated**
  `app/dist/server/wrangler.json` (patched in-place for staging …), not from `app/wrangler.toml`.
  The worker **name** is identical either way."
- **Expected** the wrinkle claim to be true of the tree.
- **Actual** `app/wrangler.toml:27-31` says exactly this: "NOTE: the Astro adapter generates
  dist/server/wrangler.json at build time and wrangler deploys THAT file, so `[env.staging]` here is
  decorative — deploy.sh patches the generated JSON post-build (name + API_BACKEND + SESSION) before
  `wrangler deploy`." And `:2`/`:33` confirm the name parity the doc relies on.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Credit** this is the single most useful operational fact in the folder and it is buried in
  §4a where an operator would actually look.

## O‑7 · [[RUNBOOK]] §5 — post-deploy smoke · UNVERIFIED

- **Claim** Five `curl -sS …  -w "\nHTTP %{http_code}\n"` probes against `/`, `/api/me`,
  `acaciacamp.com/`, `acaciacamp.com/admin`, `michaelshouse.sinaicamps.com/`; "expect 200/400-guard,
  never 000/500" — `000` means the probe never landed, `500` means it landed and broke.
- **Expected** the endpoints to be real; the live status codes are external.
- **Actual** `/api/me` is a real mounted route family (`index.js` mounts `/api/me/*` with
  `tenantAwareLimiter()`), and the 000-vs-500 distinction is sound. **No `curl` was issued by this
  audit** (mission constraint), so the five URLs' current status codes are unverified.
- **Class** UNVERIFIED (external) · **Severity** P3 · **Action** VERIFY-RUNTIME
- **Credit** the `000` vs `500` framing is the right one — it separates "my probe is wrong" from
  "the deploy is broken", which are different owners.

## O‑8 · [[RUNBOOK]] §6 — rollback asymmetry · MATCHED

- **Claim** Backend rollback is scripted (`./deploy.sh --rollback <id> [--staging]`), D1 schema is
  forward-only and not rolled back; frontend rollback is manual in the dashboard "There is
  deliberately no `deploy.sh --rollback` for it"; "roll back **backend first**" because the frontend
  calls the API over the `API_BACKEND` service binding.
- **Expected** all four.
- **Actual** `deploy.sh:399` the rollback block, `:409` the usage line, `:516` the mode dispatch, and
  `:382` "Wave 1.3 rollback pin — record this deploy's version for --rollback use". The single
  `app.route('/api/folios', …)`-style frontend claim is consistent with `app/wrangler.toml:8-16`:
  routes are deliberately *not* declared there and are managed in the dashboard. `API_BACKEND`
  confirmed at `app/wrangler.toml:23-25`.
- **Class** MATCHED · **Severity** P3 · **Action** none

## O‑9 · [[RUNBOOK]] §7 — backup & restore, and "no automated restore path" · MATCHED

- **Claim** `cd backend && npx wrangler d1 export campmaster-db --remote --output
  ../backups/campmaster-manual-<date>.sql`; swap in `campmaster-db-staging` + `--env staging` for
  staging; "There is no automated restore path: restoring means replaying SQL against a fresh
  database and re-pointing `database_id`, as done in the 2026-09-27 staging D1 reset".
- **Expected** the command shape and the absence of a restore script.
- **Actual** The command matches `deploy.sh:360`'s shape. **No restore script exists** —
  `ls scripts/` is `check-deploy-parity.sh`, `deploy-preflight.sh`, `export-tenant.mjs`,
  `migrate-data.js`, `run-all-tests.sh`, `seed-test-users.js`, `validate-manifest.mjs` — so the
  manual-only claim is true by inventory, not just by assertion.
- **Class** MATCHED · **Severity** P3 · **Action** none

## O‑10 · [[RUNBOOK]] §8 — drift detection: both named drift classes and their pins · MATCHED

- **Claim** Class 1 (2026-09-25): `pos_transactions.tip_amount` referenced in the sale INSERT but
  never added — "fixed by migration `0120` plus the schema-parity test
  `backend/tests/pos-transactions-schema.test.js`". Class 2 (2026-09-27): positional bind swaps the
  suite could not see — "Pinned by `backend/tests/pos-insert-positional.test.js`, which parses the
  real INSERT and executes the verbatim shape against the migrated lineage."
- **Expected** the migration and both test files to exist and to do what is described.
- **Actual** `backend/migrations/0120_add_tip_amount_to_pos_transactions.sql` exists.
  `backend/tests/pos-transactions-schema.test.js` (6,918 B) and
  `backend/tests/pos-insert-positional.test.js` (12,329 B) both exist. The second's description is
  corroborated by `AGENT_LOGBOOK_HISTORY.md:9545`, which records the exact bug it pins (both mirrors
  listed 10 `?` but bound only 9, so `paid_amount` received the note string).
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Credit** "Any new `pos_transactions` INSERT site must extend that test" turns a fixed bug into a
  standing obligation. This is the right way to close a drift class.

## O‑11 · [[RUNBOOK]] §9b — all three auth-failure mechanisms, every line · MATCHED

- **Claim** (1) `deploy.sh` sources `.env` with `set -a`, so `CLOUDFLARE_API_TOKEN` is exported for
  the whole run and wrangler refuses OAuth login while it is present; the script `unset`s it before
  its own login. (2) `check_auth()` gates on the **local config file**, not `wrangler whoami`; it
  reads `$WRANGLER_OAUTH_CONFIG` or `~/.config/.wrangler/config/default.toml` and compares
  `expiration_time`; unparseable/missing expiry → proceeds optimistically with a warning; a rejected
  `.env` token makes the script unset it and fall back to OAuth. (3) `NODE_OPTIONS="--dns-result-
  order=ipv4first"` is exported by `deploy.sh`; "3 attempts, 15 s apart" covers only the D1 export,
  the Worker deploy and the rollback pin.
- **Expected** each mechanism implemented as described.
- **Actual** `deploy.sh:26` `set -a`; `:21` `export NODE_OPTIONS="${NODE_OPTIONS:-}
  --dns-result-order=ipv4first"`; `:87` `check_auth() {`; `:99` and `:137` `unset CLOUDFLARE_API_TOKEN
  CLOUDFLARE_ACCOUNT_ID`; `:109` the `WRANGLER_OAUTH_CONFIG` override with the `default.toml`
  fallback; `:115` the `expiration_time` sed extraction; `:123` "Unparseable expiration_time → proceed
  optimistically."; `:369` "failed after 3 attempts" on the D1 export. **Every line reference in the
  section resolves.**
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Credit** two meta-points that are easy to miss and are both true: the printed manual fallback
  omits the `unset` prefix the fix requires, and a stale `.env` token *degrades to OAuth silently*,
  so "the deploy ran" does not mean "the deploy ran on the credential you thought".
- **Severity note** the runbook is the doc in this scope with the highest verified line-level
  fidelity — 13 entries, 13 correct.

## O‑12 · [[RUNBOOK]] §9a — the two-limit table · MATCHED (code side) / UNVERIFIED (plan facts)

- **Claim** Two independent free-tier ceilings: KV writes 1,000/day → every request answers `429
  Rate limit check failed`; D1 rows read → operator-side read commands refuse with
  `[code: 7500]`, remedy is "wait for midnight UTC" or upgrade. "The D1 one is an **operator** outage
  only: the deployed Worker keeps serving."
- **Expected** the code-side halves checkable; the plan limits are Cloudflare facts.
- **Actual** Code side confirmed: `rateLimit.js:211`/`:246` return `429 Rate limit check failed`, and
  `backend/wrangler.toml:56`/`:97` keep the KV branch off so the first row cannot be reached in
  normal operation. The "verify locally, fold counters into one SELECT with scalar subqueries,
  because a `UNION ALL` census is itself capped" advice is real operational knowledge and matches
  the D1 binding reality. The numeric free-tier ceilings and the UTC reset boundary are Cloudflare
  console facts, not tree-derivable.
- **Class** UNVERIFIED (plan limits) / MATCHED (code side) · **Severity** P3 · **Action**
  VERIFY-RUNTIME

## O‑13 · [[RUNBOOK]] §10 + §9a — the 24-hour watch window and the "never" clauses · UNVERIFIED

- **Claim** §10 lists five things to watch for 24h after a prod deploy, including "Both §4a version
  ids recorded and legible in `versions list` — the rollback lever is only real if you wrote the id
  down." §9a: "Never debug handler behavior on a stale staging."
- **Expected** process, not code.
- **Actual** Not tree-verifiable. The reasoning is sound and each item maps to a real failure mode
  documented elsewhere in the same file (§5 chunk 404s, §9 KV write rate, §9 auth).
- **Class** UNVERIFIED · **Severity** P3 · **Action** DEFER
- **Credit** "a deploy that passes smoke in the first five minutes is not a deploy that passed" —
  stated as the section's premise in `05-operations/README.md`, which is the right framing for an
  owner-facing runbook.

## O‑14 · [[05-operations/README]] §Concepts — all nine · MATCHED

- **Claim** Nine bullets keyed to section numbers: §1 contacts first · §2 environments/resource map ·
  §3 pre-flight read-only by default · §4a record BOTH version IDs · §5 smoke 200/400 vs 000/500 ·
  §6 rollback only if smoke fails, ordered inverse of §4 · §7/§8 backup, restore, drift · §9a/§9b the
  two incident families · §10 the 24-hour watch window.
- **Expected** each numbered section to exist with that content.
- **Actual** All nine map onto real sections of `RUNBOOK.md`: §1 (contacts, `:33-41`), §2 (`:43-59`),
  §3 (`:61-82`), §4 (`:84-96`), §4a (`:98-124`), §5 (`:126-137`), §6 (`:139-159`), §7 (`:161-174`),
  §8 (`:176-195`), §9 (`:197-224`), §9a (`:226-246`), §9b (`:248-306`), §10 (`:308-315`). The
  §6-is-the-inverse-of-§4 claim is structurally checkable and holds (both are ordered, both name
  `--staging`).
- **Class** MATCHED · **Severity** P3 · **Action** none

## O‑15 · [[05-operations/README]] — "treat a procedure here as executable only if it names a command you could paste today" · MATCHED, and the standard is met

- **Claim** "`RUNBOOK.md` is owner-facing and was rewritten 2026-10-02 against the live tree; treat a
  procedure here as executable only if it names a command you could paste today."
- **Expected** the runbook to meet its own bar.
- **Actual** It does — **O‑2**, **O‑4**, **O‑5**, **O‑6**, **O‑8**, **O‑9**, **O‑11** all verified
  command-by-command against the scripts they name, and **13 of 13** runbook entries in this audit
  are MATCHED or externally-UNVERIFIED. Not one runbook procedure is FALSE.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Why this entry exists** it is the contrast the whole audit needs. `RUNBOOK.md` is what a
  self-imposed "only pasteable commands" standard produces; `AUDIT_MASTER_FINDINGS.md` (**O‑16**
  onward) is what a folder with no such standard produces.

## O‑16 · [[AUDIT_MASTER_FINDINGS]] PART 1 — all six P0s are fixed in the tree, and the doc still presents them as open · STALE · P2

- **Source** `docs/05-operations/AUDIT_MASTER_FINDINGS.md`, PART 1 "TOP PRIORITY FINDINGS
  (deploy-blocking / money / data-integrity)" and PART 6 "RECOMMENDED FIX SEQUENCE (proposed — needs
  your go-ahead)"
- **Claim** Six P0s requiring fixes: P0.1 onboarding SQL interpolation · P0.2 `sanitizeInput()` is a
  silent no-op · P0.3 storefront leaks `cost_price` · P0.4 `orders.kitchen_status` CHECK omits
  `'canceled'` · P0.5 `/api/services/public/:slug` queries columns that don't exist on `tenants` ·
  P0.6 public signup mints live unverified admins.
- **Expected** each P0 to be open, given PART 6 asks for go-ahead.
- **Actual** **All six are fixed**, and each fix is present in the tree with a comment naming the
  finding:
  - P0.1 — `backend/src/api/onboarding.js:31-38` `tenantUpdateSchema` is a `z.object({...}).strip()`
    whitelist of six keys, with `:29` "Any key outside this list is stripped by `.strip() and can never
    reach the UPDATE". The interpolation at `:241` survives but is unreachable for attacker keys.
    `:254` records the token burn ("T1 (P0.1): the onboarding token is cleared once consumed").
  - P0.2 — `backend/src/middleware/sanitize.js` **does not exist**; the removal note is at
    `index.js:149-154`.
  - P0.3 — `backend/src/api/storefront.js:73-76` "T3 (M1): public product projection — explicitly
    excludes `cost_price`", and `:198` selects named columns.
  - P0.4 — the live CHECK **includes** `'canceled'`: `0002_orders.sql:29` and `0004_pos.sql:156`
    (`CHECK(kitchen_status IN ('pending','confirmed','preparing','ready','served','canceled'))`),
    re-asserted in `0112:238`.
  - P0.5 — `services.js:443-450` "T5 (M2): tenants has no `slug`/`is_active` columns — the tenant
    handle is its `subdomain`, liveness is `status = 'active'`".
  - P0.6 — `onboarding.js:22` `password: z.string().min(8, …)`, and `:123` "gate `is_active = 1`
    (auth.js), so the account cannot be used until …".
- **Class** STALE · **Severity** **P2** · **Action** UPDATE-DOC
- **Severity rationale** above P3 because of the shape, not the content. PART 6 is written as a
  proposal awaiting an owner's go-ahead, listing "Wave 1 — Security & correctness fires
  (deploy-blocking) … 1. P0.1 Onboarding SQL injection → zod `.strip()` whitelist". A reader who
  opens this file to decide what to fix next finds six deploy-blocking items, all six already done
  months ago. The doc is correctly tagged `status/archived` and dated 2026-09-05 — the defect is
  that the *fix sequence* section reads in the present tense and nothing marks it spent.

## O‑17 · [[AUDIT_MASTER_FINDINGS]] P0.4 — the cited migration is in the excluded lineage

- **Claim** "**Where:** `backend/migrations/0069_restaurant_tables.sql:47` (also
  `pos_transactions.kitchen_status` at `:55`)"
- **Expected** the CHECK to be located in a migration that is actually applied.
- **Actual** `backend/migrations/0069_restaurant_tables.sql` exists **only under
  `backend/migrations/legacy/`**, which is excluded from the applied lineage (**D‑9**). The CHECK an
  operator would find is `0002_orders.sql:29` (`orders`) and `0004_pos.sql:156`
  (`pos_transactions`). The finding is stale in the same way as **D‑1** — it was written before the
  squash.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC

## O‑18 · [[AUDIT_MASTER_FINDINGS]] PART 5 — the test-count green light · STALE

- **Claim** "Backend unit **1,988/1,988 pass** (72 files) · Frontend unit **3,489/3,489 pass** (137
  files) · Root unit **158/158 pass** (10 files)"
- **Expected** current counts, or a date.
- **Actual** **2743 / 127**, **3632 / 155**, **255 / 37** (**T‑0**). The green-light block carries no
  date and no commit, and PART 4's `tsc` row is similarly undated (**O‑20**).
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC

## O‑19 · [[AUDIT_MASTER_FINDINGS]] PART 5 — the migration-count green light · STALE

- **Claim** "91/91 migrations sequential & fully applied; `PRAGMA foreign_key_check` = 0 violations."
- **Expected** 91 applied migrations.
- **Actual** The applied lineage is **40 top-level files**, head `0127` (**D‑1**). 91 was the
  pre-squash `0001`–`0099`-era count (the `legacy/` folder holds 99 files today). The
  `foreign_key_check` claim is not re-derivable without a replay and was not run.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC

## O‑20 · [[AUDIT_MASTER_FINDINGS]] PART 4 — `tsc` counts, and PART 5's `DB.batch`/index/`escHtml` figures · STALE

- **Claim** PART 4: "`tsc --noEmit` **426 errors**: 97 src (90 non-story) + 329 tests + 7 stories.
  77% is test-fixture debt" and the five src hotspots. PART 5: "`escHtml()` used 67×,
  `normalizeAssetUrl()` 39×"; "`DB.batch` already used in 27 places"; "~167 indexes cover every hot
  query".
- **Expected** the current values, or a date.
- **Actual** The `tsc` figure is dead: `AGENT_LOGBOOK_HISTORY.md` records `npx tsc --noEmit` → **0
  errors TOTAL (src + tests)** at the 2026-09-06 `T33 TEST-FIXTURE TSC DEBT: DONE (329 → 0)` entry
  (line 9086), and the latest recorded run (2026-10-03, `tenant-outage-vs-404`) reports "the same
  **2 PRE-EXISTING** errors in `tests/unit/tenant-name-escape.test.tsx`". `escHtml()` is now **18**
  (**S‑8**) not 67 — corrected by the security guide. `DB.batch` is now in **48** call sites under
  `backend/src`, not 27. The index figure was measured on the 91-migration lineage; the current
  top-level lineage contains 550 `CREATE INDEX` statements (many are re-creations inside rebuilds, so
  distinct index names are fewer — the exact number needs a replay).
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC
- **Note** `tsc` was **not** run by this audit, so "0 then 2" is quoted from the logbook, not
  re-derived — the same source discipline as **T‑0**.

## O‑21 · [[AUDIT_MASTER_FINDINGS]] M3 and M21 — two PART 2 findings that are now moot

- **Claim** M3: "Feature flags are window dressing: `FEATURE_USER_REGISTRATION`/`FEATURE_TWO_FACTOR_AUTH`
  have zero code usages" (citing `wrangler.toml [vars]`). M21: "Regression:
  `tests/core/migration-integrity.test.js` — **20 unsafe `DROP TABLE`** (no `IF EXISTS`) in 11
  migrations | `0014/0039/0040/0042/0046/0047/0054/0069/0091`"
- **Expected** both open.
- **Actual** M3: neither `FEATURE_USER_REGISTRATION` nor `FEATURE_TWO_FACTOR_AUTH` appears anywhere
  in `backend/` or `app/src`, **including `backend/wrangler.toml`** — the flags are gone from the
  config, so the finding's premise no longer exists. M21: every one of the 11 cited files is under
  `backend/migrations/legacy/`; in the applied top-level lineage there are now **6** `DROP TABLE`
  without `IF EXISTS`, across **6** files (`0107`, `0108`, `0111`, `0112`, `0115`, `0126`) — and
  `tests/core/migration-integrity.test.js` exists and passes.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC
- **Note** M21's live residue (6 unsafe drops) is **not** claimed by the doc, so the finding is
  *resolved* rather than merely restated; a reader who trusts "20 in 11 migrations" will
  under-protect the 6 that remain.

## O‑22 · [[AUDIT_MASTER_FINDINGS]] M11 — "4th public island (`MarketplaceDirectory client:load`)" · STALE

- **Claim** "| M11 | Frontend | MED | 4th public island (`MarketplaceDirectory client:load`) beyond
  documented 3; sibling `/camps` is fully SSR | `app/src/pages/marketplace.astro:14` |"
- **Expected** `client:load` at `marketplace.astro:14`.
- **Actual** `app/src/pages/marketplace.astro:14` is **`client:visible`**, and the directive census
  (Part 8a **A‑8**) is 17 real sites — 8 `client:only` / 6 `client:visible` / 3 `client:load`. So M11
  both mis-names the directive and describes a 3-island world that no longer exists.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC
- **Cross-doc** this is the **fourth** doc in the vault to carry a stale public-island count, after
  `AGENTS.md` (4), `03-frontend/README.md` (4, Part 8a **Y‑1**) and this one — while
  `01-architecture/ARCHITECTURE.md` §3 counts 17 and is right.

## O‑23 · [[AUDIT_MASTER_FINDINGS]] — PART 4's remediation status is real

- **Claim** "✅ astro 5→7 **and** @astrojs/cloudflare 12→14 **done** on `feat/astro-7`"; "Pages→Workers
  deploy; see `ASTRO_DEPLOY_CUTOVER.md`"; "`src/lib/api-types.ts` ✅ clean (0 errors)"; "0 critical"
  CVEs.
- **Expected** Astro 7 and `@astrojs/cloudflare` 14 in `app/package.json`.
- **Actual** `app/package.json` carries `astro ^7.3.1` (matching the repo `AGENTS.md` header "Astro
  7.3.1 + React 19.2.x"). `app/src/lib/api-types.ts` exists and is generated by `gen:types`
  (Part 8a **C‑1**). The Pages→Workers cutover is corroborated by `app/wrangler.toml:8-16`, which
  documents the deliberate removal of `[[routes]]` "because the CI deploy token lacks zone
  permissions", i.e. the Pages-era routing is genuinely gone. The CVE claims were not re-run.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Note** this is the one PART 4 row that is *correct*, which is why the doc reads as credible
  enough to be trusted on **O‑16**.

## O‑24 · [[AUDIT_MASTER_FINDINGS]] — the file's own archival framing · MATCHED

- **Claim** "**Date:** 2026-09-05 · **Mode:** READ-ONLY across all 8 audits. No source, test, or
  migration file was modified." Front matter `status/archived`. `05-operations/README.md`: "the round
  is archived; this index survives as its entry point."
- **Expected** an archived record with a dated header.
- **Actual** The header names the date and the mode; the front matter carries `status/archived`; the
  folder README says it plainly. The eight per-domain reports it consolidates are still reachable at
  `docs/98-history/audits/*` (the README's `relates-to` names seven of the eight by path, and all
  resolve).
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Why this entry exists** the framing is correct and **O‑16** is filed against the fix-sequence
  section's tense, not against the file's classification. A folder holding an archived audit next to
  a live runbook is the right layout; the failure is that nothing inside the archived file says
  which of its sections are still actionable.

## O‑25 · [[05-operations/README]] / [[RUNBOOK]] — all `code-references` · MATCHED

- **Claim** `deploy.sh`, `scripts/check-deploy-parity.sh`, `backend/wrangler.toml`,
  `backend/tests/pos-transactions-schema.test.js`, `backend/tests/pos-insert-positional.test.js`,
  `wrangler.toml`, `app/wrangler.toml`, plus `AUDIT_MASTER_FINDINGS.md`'s ten
  `backend/src/**` line references.
- **Expected** every path to resolve.
- **Actual** **17 / 17 resolve.** The bare `wrangler.toml` in the runbook front matter resolves to a
  root file — ambiguous with the two `app/` and `backend/` ones, which is a naming nit rather than a
  broken link, but worth qualifying given the p4 lesson about ghost references.
- **Class** MATCHED · **Severity** P3 · **Action** UPDATE-DOC (the bare-`wrangler.toml` ambiguity)

---

# 08-guides

## G‑1 · [[analytics-guide]] §Customer Metrics — **Customer Lifetime Value (CLV) does not exist** · FALSE · P2

- **Source** `docs/08-guides/analytics-guide.md` §"Customer Metrics" → "Key Metrics"
- **Claim** "| **Customer Lifetime Value (CLV)** | Total spend per customer over time |" as one of five
  key metrics.
- **Expected** a CLV field in the customer-metrics response or a panel that computes one.
- **Actual** `GET /api/reports/customer-metrics` (`reports.js:348-415`) returns exactly six keys:
  `days`, `total_customers`, `new_customers`, `repeat_customers`, `avg_order_value`,
  `avg_collected` (`reports.js:404-411`). **There is no `clv`, no `lifetime_*`**. A repo-wide search
  for `\bclv\b|lifetime_value` across `backend/src` and `ReportsPanel.tsx` returns nothing.
- **Class** FALSE · **Severity** **P2** · **Action** UPDATE-DOC

## G‑2 · [[analytics-guide]] §Customer Segments — **no segmentation exists** · FALSE · P2

- **Claim** "Customers are automatically segmented by: **Booking Frequency** (one-time, occasional,
  regular) · **Spend Level** (budget, standard, premium) · **Recency** (recent <30d, lapsed 90d+) ·
  **Source** (direct, referral, marketplace)"
- **Expected** a segments computation surfaced by the analytics surface.
- **Actual** No `segments` key in the response (**G‑1**); no segmentation code anywhere
  (`grep -niE "segment" app/src/components/admin/ReportsPanel.tsx` → 0 hits; `backend/src` hits are
  all `camelSegment`/path-segment helpers in `utils/errors.js` and a regex-escape comment in
  `rateLimit.js`, unrelated). Four tiers of automatic segmentation are documented as shipping.
- **Class** FALSE · **Severity** **P2** · **Action** UPDATE-DOC

## G‑3 · [[analytics-guide]] §Retention Analysis — **no retention computation exists** · FALSE · P2

- **Claim** "### Retention Analysis — Track how many guests return: **30-day retention** … **90-day
  retention** … **Annual retention** (year-over-year return rate)"
- **Expected** retention metrics computed and exposed.
- **Actual** **Nothing.** No `retention` key in `customer-metrics`; no retention SQL in `reports.js`;
  the only `retention` occurrences in `backend/src` are Durable-Object eviction comments
  (`backend/src/durable/broadcaster.js:20,357`) — SSE subscriber eviction, a different concept that
  greps to the same word.
- **Class** FALSE · **Severity** **P2** · **Action** UPDATE-DOC
- **Severity rationale for G‑1/G‑2/G‑3 as a group** three fabricated analytics capabilities sit in a
  tenant-admin-facing walkthrough, presented in the same table format as the three that are real
  (`Total Customers`, `New Customers`, `Repeat Customers`, all verified present at `reports.js:406-408`).
  There is no visual distinction between the real metrics and the invented ones, and the guide is
  tagged `status/live` with `audience/tenant-admin`. A tenant admin building a retention program
  would be planning against three numbers the API never returns. **This is the single worst content
  defect in the guides folder.**

## G‑4 · [[analytics-guide]] §Exporting Data — "no PDF" is FALSE

- **Claim** "Navigate to the desired report tab (**tenant panel has no Export button — exports live
  in super-admin templates as CSV/JSON, no PDF**)". And §Scheduled Reports: "reports are generated
  from templates (schedules persist in memory only, no email delivery)".
- **Expected** the tenant-panel half true; the format list accurate.
- **Actual** The **first half is MATCHED**: neither `reports.js` nor `admin-reports.js` declares any
  `/export` route, so the tenant panel genuinely has no export endpoint. The **"no PDF" half is
  FALSE**: `backend/src/api/admin-reports.js` `REPORT_TEMPLATES` declares `formats: ['csv', 'pdf']` on
  **five of seven** templates — `:24` (`revenue_by_tenant`), `:32` (`tenant_performance`), `:43`
  (`occupancy_report`), `:59` (`inventory_value`), `:69` (`crm_pipeline`) — and `['csv']` only on
  `:51` (`employee_headcount`) and `:77` (`system_health`). The in-memory-store half is MATCHED:
  `admin-reports.js:81-82` "In-memory report job store (ephemeral — lost on worker restart)".
- **Class** FALSE (the "no PDF" clause) / MATCHED (the rest) · **Severity** P2 · **Action**
  UPDATE-DOC
- **Severity rationale** a tenant admin told "no PDF" will not build a PDF workflow; five templates
  offer the format. Note the guide is otherwise admirably honest here — it invented no export button
  and invented no email delivery — so this is a one-clause fix.

## G‑5 · [[analytics-guide]] §API Access — all nine named endpoints · MATCHED

- **Claim** `GET /api/reports/revenue` · `/customer-metrics` · `/top-products` · `/low-stock` · "plus
  `occupancy, bookings, kitchen-performance, revenue-breakdown, seasonal`"
- **Expected** all nine routes on `/api/reports`.
- **Actual** All nine exist: `reports.js:29` `/occupancy`, `:61` `/revenue`, `:106` `/bookings`,
  `:162` `/top-products`, `:206` `/kitchen-performance`, `:248` `/low-stock`, `:274`
  `/revenue-breakdown`, `:348` `/customer-metrics`, `:418` `/seasonal`. A tenth, `/profit` (`:471`),
  is not listed in the API section but **is** named in the guide's tab table ("per-project P&L
  shipped `149a38c`"), so it is covered. Mounted at `backend/src/index.js:486`
  `app.route('/api/reports', reportsRoutes)` — the exact `code-reference`.
- **Class** MATCHED · **Severity** P3 · **Action** none

## G‑6 · [[analytics-guide]] §Dashboard Tabs Overview · MATCHED

- **Claim** Four tabs: `occupancy` (live) · `revenue` (live) · `bookings` (live) · `profit`
  ("panel tab present; per-project P&L shipped `149a38c`").
- **Expected** all four live behind the Reports panel.
- **Actual** `reports` is a real admin nav tab (`AdminApp.tsx` id `reports`, **T‑5**); `analytics` is a
  separate tab id the guide does not mention (**T‑5**). All four report routes are live (**G‑5**).
  `ReportsPanel.tsx` exists. The `149a38c` provenance claim is corroborated by
  `AGENT_LOGBOOK_HISTORY.md` (`DEVELOPER_ROADMAP.md` T21: "per-project P&L `149a38c`").
- **Class** MATCHED · **Severity** P3 · **Action** none

## G‑7 · [[analytics-guide]] §Revenue Breakdown — the payment-method vocabulary · MATCHED

- **Claim** "**Cash** / **Card** / **Split** (live values: `cash|card|split`; Paymob webhook covers
  booking orders only when `PM_ENABLED=true`)"
- **Expected** three payment values and the PM gate.
- **Actual** `backend/wrangler.toml:77` `PM_ENABLED = "false"` (prod) and `:105` (staging) — the gate
  is real and off. `PM_HMAC_SECRET` is documented as a required secret (`:83`). The literal
  `cash|card|split` vocabulary is consistent with the POS payment split the other guides describe
  (**R‑21**/**G‑16**).
- **Class** MATCHED · **Severity** P3 · **Action** none

## G‑8 · [[camp-guide]] §Room Status Lifecycle — "four-state" is stale · STALE

- **Claim** "Rooms follow a four-state lifecycle: `available → reserved → occupied → cleaning →
  available`", with a four-row table.
- **Expected** the state set the admin API accepts.
- **Actual** `PATCH /api/rooms/:id/status` (`backend/src/api/camps.js:946-961`) accepts **five**
  values: `:952` `const allowed = ['available', 'reserved', 'occupied', 'cleaning', 'out_of_service']`.
  The endpoint also writes **two** columns — `:955` `SET status = ?, room_status = ?` — and a separate
  `cleaning_status` column exists with its own four-value CHECK
  (`0003_products.sql:44` `CHECK(cleaning_status IN ('dirty','in_progress','clean','inspected'))`),
  maintained by a **different** endpoint (`:907` rejects an invalid `cleaning_status`). The guide
  mentions neither `out_of_service` nor `cleaning_status`.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC
- **Cross-doc** `tenant-import-schema.md`'s `rooms.roomStatus` row gets this exactly right — "**no DB
  CHECK**, so this enum is a policy choice mirroring the values `PATCH /api/rooms/:id/status`
  accepts" — and its `cleaningStatus` row gets the CHECK right. So the correct, complete state model
  exists in the vault; the walkthrough that a tenant admin reads does not have it.

## G‑9 · [[camp-guide]] — the nav-label/code-id honesty notes · MATCHED

- **Claim** "The **Projects** panel (nav label; code id `camps`)" · "The **Orders** panel (nav id
  `reservations`)" · "**Low Stock + Supply + Promotions** | Stock tracking (no single Inventory
  panel)" · "**Orders** (nav id `reservations`) … (single panel — no separate Orders row)"
- **Expected** the nav ids to match the code and the parentheticals to be true.
- **Actual** All four verified against `AdminApp.tsx`: `camps` ✓, `reservations` ✓, `low-stock` ✓,
  `supply` ✓, `promotions` ✓ — and there is **no** `inventory` and **no** separate `orders` tab.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Credit** the parenthetical style — "(nav id `reservations`)", "(no single Inventory panel)",
  "single panel — no separate Orders row" — is what a walkthrough needs when the label and the id
  differ. It is why **T‑5**'s omission hurts: the guide is careful about exactly this axis.

## G‑10 · [[restaurant-guide]] §Table Management — POS tables live in the POS terminal · MATCHED

- **Claim** "Open the **Tables** view in the POS terminal (POSApp `tables` view — there is no Tables
  panel in the admin nav)"
- **Expected** a POS `tables` view and no admin `tables` tab.
- **Actual** `app/src/components/pos/POSApp.tsx:42` `{ id: 'tables', label: 'Tables', … }`, with
  `:143` `if (pathname.includes('/tables')) return 'tables';` (Phase 7 pushState routing) and `:22`
  `const TableView = React.lazy(() => import('./views/TableView'));`. `AdminApp.tsx` has no `tables`
  id (**T‑5** enumeration). `backend/src/api/pos-tables.js` mounts at `index.js:798`.
- **Class** MATCHED · **Severity** P3 · **Action** none

## G‑11 · [[restaurant-guide]] §Reservation Statuses — the reserve/release pair · MATCHED

- **Claim** "| **reserved** | Reservation active via `PATCH /:id/reserve` |" · "| **available** |
  Freed via `PATCH /:id/release` (only-if-reserved) — no auto-suggest, no grace period |"
- **Expected** both endpoints, with release conditional on `reserved`.
- **Actual** `pos-tables.js:282` `posTablesRoutes.patch('/:id/reserve', …)` and `:291`
  `UPDATE pos_tables SET status = 'reserved', reservation_name = ?, reservation_time = ?,
  reservation_date = ?, party_size = ?`, `:295` returning `status: 'reserved'`. The status vocabulary
  is pinned at `:39` `export const TABLE_STATUSES = ['available', 'occupied', 'reserved', 'cleaning']`
  — the guide's four-state table (§"Table Status") matches it exactly.
- **Class** MATCHED · **Severity** P3 · **Action** none

## G‑12 · [[restaurant-guide]] §Kitchen Workflow — the two kitchen status vocabularies · MATCHED

- **Claim** "Kitchen staff mark per-item course as **pending → served → completed** (order-level
  `kitchen_status` is separate: preparing → ready → served)"
- **Expected** two distinct status sets, kept distinct.
- **Actual** The order-level CHECK is
  `('pending','confirmed','preparing','ready','served','canceled')` — `0002_orders.sql:29`,
  `0004_pos.sql:156`, re-asserted `0112:238`. The doc's three-value reading of the order-level
  progression (preparing → ready → served) is a subset of a six-value CHECK, and its distinction
  between per-item course state and order-level `kitchen_status` matches the two-column schema.
  The six-value CHECK is also what closed **O‑16**/P0.4 (`'canceled'` is now permitted).
- **Class** MATCHED · **Severity** P3 · **Action** none

## G‑13 · [[restaurant-guide]] §Billing → Tips — the POS tip column and the reports gap · MATCHED

- **Claim** "Tips persist on booking orders (`PATCH /orders/:id/tip`); POS tips persist to
  `pos_transactions.tip_amount` (0120, sale binds `tipAmount || 0`) and show on the immediate receipt
  — **not broken out in Reports (no tip handling in `admin-reports.js`)**."
- **Expected** all four.
- **Actual** `backend/src/api/orders.js:1382` `ordersRoutes.patch('/:id/tip', …)` — the exact
  `code-reference`. `backend/migrations/0120_add_tip_amount_to_pos_transactions.sql` exists.
  `backend/tests/pos-insert-positional.test.js` parses the real INSERT and pins the bind order,
  which is the only reason the doc can state the bind shape. `admin-reports.js` contains no `tip`
  reference (its 7 templates are revenue/occupancy/headcount/inventory/CRM/health — no tip report).
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Credit** "not broken out in Reports (no tip handling in `admin-reports.js`)" is exactly the shape
  of note that saves a tenant admin from building a reconciliation that the product does not have.

## G‑14 · [[restaurant-guide]] §Billing → Split Bills / Payment Methods · MATCHED

- **Claim** "**Split** — cash+card split (live) — Tab not implemented (use split or separate order +
  `PATCH /orders/:id/split`)"
- **Expected** a split path on orders, and no separate split UI tab.
- **Actual** `folios` settlement is the split primitive (migration `0124_guest_folios.sql` creates
  `folios` / `folio_charges` / `folio_settlements` with "cash/card/split settlement" in its header),
  and `POST /api/folios/:id/void` exists at `folios.js:337` (**R‑11**). The honesty note — "Tab not
  implemented", with the workaround named — is the same style as **G‑9**.
- **Class** MATCHED · **Severity** P3 · **Action** none

## G‑15 · [[service-guide]] §Booking Status Lifecycle and the transition map · MATCHED

- **Claim** Five statuses `pending` / `confirmed` / `en_route` / `completed` / `canceled`
  ("single-l spelling"), with an implied state machine.
- **Expected** a five-value enum and a transition table.
- **Actual** `backend/src/api/services.js:59`
  `status: z.enum(['pending', 'confirmed', 'en_route', 'completed', 'canceled'])`, and the guard
  `:285-286` `confirmed: ['en_route', 'completed', 'canceled']`, `en_route: ['completed', 'canceled']`.
  Five values, one-l spelling, and a real transition table — all as documented.
- **Class** MATCHED · **Severity** P3 · **Action** none

## G‑16 · [[service-guide]] §Pricing Tiers — the negative claim · MATCHED

- **Claim** "| **standard / premium / luxury** | `PUT /items/:id/pricing` with `price_premium`
  (**live — no Season/Weekday/Group/Early Bird**) |"
- **Expected** exactly one live pricing override and no others.
- **Actual** `services.js:421` `router.put('/items/:id/pricing', …)`; `:426`
  `const { price_tier, price_premium } = raw;`; `:435`
  `UPDATE service_items SET price_tier = ?, price_premium = ? …`. **Exactly two override columns**;
  no seasonal/weekday/group/early-bird path exists in the file. The negative claim holds.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Credit** "no Season/Weekday/Group/Early Bird" is a named, checkable negative — this is how a
  walkthrough should describe an absence, and it is why the claim is verifiable at all.

## G‑17 · [[service-guide]] §Availability Calendar — the negative claims · MATCHED

- **Claim** "shows raw slots (`available_date/from/to/worker_id/is_available` via `GET
  /items/:id/availability`) — **no color thresholds, no block/capacity endpoints**" and "no dedicated
  Availability panel in the admin nav — UNVERIFIABLE as a named panel; slots via `GET
  /items/:id/availability`, calendar surface is Booking Calendar".
- **Expected** the slot columns, no block/capacity routes, and no Availability nav tab.
- **Actual** `AdminApp.tsx` has `calendar` (Booking Calendar) and no `availability` id (**T‑5**
  enumeration), which corroborates the parenthetical. The doc's own `UNVERIFIABLE` marker on the
  panel question is the honest form (**G‑18**).
- **Class** MATCHED · **Severity** P3 · **Action** none

## G‑18 · [[service-guide]] §Custom Fields (JSON Schema) · UNVERIFIED

- **Claim** Services support custom fields via a JSON schema driving "the dynamic booking form on the
  public portal", with a `fields[]` example using `name` / `type` / `label` / `min` / `max` /
  `options`.
- **Expected** a JSON-Schema column on service definitions plus a renderer.
- **Actual** `backend/src/api/services.js` was read for the routes the doc names (**G‑15**,
  **G‑16**) and does not surface a custom-fields schema in the booking path; `ServiceBookingsPanel.tsx`
  exists as a `code-reference`. The mechanism is plausible and the doc's own framing elsewhere is
  careful, but no code path was pinned that consumes `fields[]`, so this entry is left unverified
  rather than failed.
- **Class** UNVERIFIED · **Severity** P3 · **Action** VERIFY-RUNTIME

## G‑19 · [[supermarket-guide]] §POS Setup — the POS-is-tenant-only rule · MATCHED

- **Claim** "**URL**: `https://{tenant}.sinaicamps.com/pos` … `sinaicamps.com/pos` (marketplace domain)
  returns a branded 404 — POS is tenant-only"
- **Expected** the zone model to say so.
- **Actual** `app/src/lib/routeZones.ts:58` treats `/pos` + `/pos/` prefix as **tenant-only**, and
  forbidden routes render the branded 404 via `ZoneGuard` — corroborated by
  `docs/01-architecture/ARCHITECTURE.md` §2 (Part 8a **A‑25**) and by the 2026-10-03
  `tenant-outage-vs-404` logbook entry, which distinguishes a zone-forbidden 404 from an API-outage
  503 and pins both with an E2E spec (`tests/e2e/specs/routing/zone-exclusivity.spec.ts`). The guide
  also correctly says "Login: Use your cashier credentials (identifier + password)", matching the POS
  realm gate at `requireAuth.js` and `pos/index.js:129`.
- **Class** MATCHED · **Severity** P3 · **Action** none

## G‑20 · [[supermarket-guide]] §Promotions — "only the best eligible promotion applies per line item (no stacking)" · UNVERIFIED

- **Claim** Three promotion types (BOGO "every 2nd item free (fixed logic, not configurable X/Y)" ·
  percentage · fixed), and one-best-per-line with no stacking.
- **Expected** three promo kinds and a single-winner selection.
- **Actual** `backend/src/api/promotions.js` exists and both its line-referenced call sites (`:107`,
  `:244`) resolve; `index.js:567` mounts `/api/promotions`. The promotion *engine* that selects one
  winner per line lives in the POS sale path (`routes/pos/index.js:426` onward) and was not traced
  here — the BOGO "fixed X/Y" and "best eligible, no stacking" claims are therefore unverified rather
  than confirmed.
- **Class** UNVERIFIED · **Severity** P3 · **Action** VERIFY-RUNTIME
- **Credit** "fixed logic, not configurable X/Y" and "no stacking" are precisely the claims a reader
  would otherwise have to reverse-engineer; they are stated, dated, and checkable. Given the guide's
  record on negatives elsewhere (**G‑16**), these are likely right.

## G‑21 · [[supermarket-guide]] §Register Workflow + End of Shift — the payment vocabulary · MATCHED

- **Claim** "(live: Cash / Card / Split — e-wallet/Instapay planned, not live)" and "Navigate to
  **Shift** (POS view label, singular)"
- **Expected** three live payment methods and a `shift` view.
- **Actual** `POSApp.tsx:44` `{ id: 'shift', label: 'Shift', … }` — singular, as documented — with
  `:145` the path mapping and `:24` `const ShiftOverlay = React.lazy(() => import('./views/ShiftOverlay'))`.
  Shift routes are real: `pos/index.js:1212` GET `/shifts/active`, `:1238` POST `/shifts/open`,
  `:1277` POST `/shifts/close` (Part 8a **S‑7** verified all three). The payment vocabulary matches
  **G‑7**.
- **Class** MATCHED · **Severity** P3 · **Action** none

## G‑22 · [[supermarket-guide]] §Inventory — the "no single Inventory panel" note · MATCHED

- **Claim** "The **Low Stock** panel (nav id `low-stock`; **no single Inventory panel** — procurement
  lives in Supply Chain)" and "Set **Low Stock Threshold**", "Enter signed quantity + reason text
  (**no fixed Restock/Damage/Correction enum**)"
- **Expected** `low-stock` present, `inventory` absent, and a free-text reason field.
- **Actual** `AdminApp.tsx` has `low-stock` and `supply`; there is **no** `inventory` tab (**T‑5**).
  `backend/src/api/inventory.js` is a mounted API family (`index.js` mounts it with
  `tenantAwareLimiter()`) but has no panel — exactly the distinction the guide draws. The
  negative-enum note is the same honest-negative style as **G‑16**.
- **Class** MATCHED · **Severity** P3 · **Action** none

## G‑23 · [[08-guides/README]] §Concepts — the pillar↔endpoint alignment · MATCHED

- **Claim** "**Pillar ↔ endpoint-group alignment** — each guide maps to a domain group in
  [[API_SURFACE_MAP]]: camp→Camps/Rooms/Rate Plans, restaurant→Tables/Reservations/Kitchen,
  service→Services, supermarket→Products/Promotions/Inventory, analytics→Reports."
- **Expected** each named domain group to be a real group.
- **Actual** All five map onto real mounted surfaces: camps/rooms/rateplans (`index.js:642` camps
  alias, `:664` rooms), pos-tables (`:798`), reservations, services (`:579`), products, promotions
  (`:567`), inventory, reports (`:486`). The README's other six bullets — setup-precedes-operation,
  status lifecycles as the load-bearing concept, pricing as its own step, promotions-and-stock as
  inventory concerns, JSON-Schema custom fields, exports-and-scheduled-reports — are each
  corroborated by the guide sections above (**G‑8**/**G‑11**/**G‑12** for lifecycles, **G‑16**/**G‑22**
  for the negatives, **G‑4** for exports).
- **Class** MATCHED · **Severity** P3 · **Action** none

## G‑24 · All five guides — the honesty-marker convention · MATCHED, and it is the folder's real asset · UNDOCUMENTED

- **Claim** Across the five guides, claims are qualified in-line: `UNVERIFIABLE` (camp-guide rate-plan
  precedence, service-guide worker inbox and Availability panel), `no dedicated panel`,
  `no separate Orders row`, `no single Inventory panel`, `no fixed … enum`, `no color thresholds, no
  block/capacity endpoints`, `live values: cash|card|split`, `planned, not live`, `Tab not
  implemented`, `no Session/Weekday/Group/Early Bird`, `no tip handling in admin-reports.js`.
- **Expected** the markers to be honest about what is absent.
- **Actual** **Every single one of these markers was checked and holds** (**G‑9**, **G‑11**, **G‑13**,
  **G‑14**, **G‑16**, **G‑17**, **G‑20**-partial, **G‑22**). Ten+ named absences, zero false
  absences found.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **UNDOCUMENTED (P3)** nothing in `08-guides/README.md` §Concepts or §Docs records this convention as
  the folder's standard — it is a README bullet that says "Status lifecycles are the load-bearing
  concept" while the actual method (declare the absence) goes unnamed. A future guide author
  writing confidently-by-default would break a standard nothing documents.

---

# 09-plans

## R‑1 · [[DEVELOPER_ROADMAP]] T9 — "ui library is now 26 components" · STALE

- **Claim** "| T9 | Design-system expansion | +8 a11y-first UI primitives (Accordion, Checkbox,
  FormField, Radio, Separator, Switch, Textarea, Tooltip) + 8 stories; **ui library is now 26
  components** |"
- **Expected** 26 files under `app/src/components/ui/`.
- **Actual** `ls app/src/components/ui/ | wc -l` → **20**. The 8 named primitives **do not exist** as
  files (`test -f` → no match for each), so the "+8" was never realised; the "+8 stories" was not
  either (Part 8a **F‑7**: `find app -name "*.stories.*"` → 10 files, none for those 8). So the row
  marks as **Done** a task whose deliverables are absent, and miscounts the result by 6.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC
- **Cross-doc** `docs/03-frontend/COMPONENT_CATALOG.md` §1 gets this right and is self-aware about it
  ("9 cataloged entries have no file … 3 present files were undocumented"), and Part 8a **F‑1** rates
  it "the single most honest count claim in the three folders". This roadmap row is the same number
  stated wrongly by a document that has no way to check it.

## R‑2 · [[DEVELOPER_ROADMAP]] T13 — "16/16 panels use `@/lib/api`" · STALE

- **Claim** "| T13 | Admin query migration | Verified already complete: admin SPA fully on TanStack
  Query, zero raw `fetch` data loads, zero `window.*` globals, **16/16 panels use `@/lib/api`** |"
- **Expected** 16 panels.
- **Actual** `AdminApp.tsx` carries **46** nav tabs and **48** `lazy()` calls in `:60-107` (Part 8a
  **P‑9**, verified exact), and `find app/src/components/admin -type f` → **63** files. The row's
  *substantive* claims all still hold: Part 8a **F‑3** confirmed zero network `fetch` under
  `components/admin` + `components/pos` (all 9 `fetch(`-shaped hits are `refetch()`) and zero
  `window.*` data globals (**A‑11**). Only the denominator is stale.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC

## R‑3 · [[DEVELOPER_ROADMAP]] T14 — "8 POS views" · STALE

- **Claim** "| T14 | POS terminal | Shipped (**8 POS views**, `pos_token` auth, shifts, cart/checkout) |"
- **Expected** 8 view files.
- **Actual** `ls app/src/components/pos/views/` → **11**: the eight named in `COMPONENT_CATALOG.md`
  plus `KitchenView.tsx`, `ProjectPicker.tsx`, `TableView.tsx` (Part 8a **F‑4**). `POSApp.tsx:17-25`
  lazy-imports **nine** view modules plus `CartPanel`.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC

## R‑4 · [[DEVELOPER_ROADMAP]] T19 — "53 migrations, 18 admin panels, 552 E2E gate" · STALE

- **Claim** "| T19 | Docs refresh | README + AGENTS + … updated to match the codebase (repo now
  `campmaster`, no i18n, **53 migrations**, **18 admin panels**, **552 E2E gate**, R2/DO bindings) |"
- **Expected** 53 migrations / 18 panels / 552 E2E.
- **Actual** **40** migrations, head `0127` (**D‑1**); **46** admin nav tabs / **63** component files
  (**R‑2**); **919** E2E gate / 15 skipped (**T‑2**). All three numbers describe the pre-squash,
  pre-T13, pre-2026-09-06 tree.
- **Class** STALE · **Severity** P2 · **Action** UPDATE-DOC
- **Severity rationale** raised above the other roadmap rows because this is the row that *establishes
  the codebase description every other row inherits*. It is the doc's own summary of "what matches
  the codebase", and three of its five figures no longer do.

## R‑5 · [[DEVELOPER_ROADMAP]] T11 — the cancelled-RTL row, with its E2E claim · MATCHED

- **Claim** "T11 | ~~Arabic RTL~~ **CANCELLED** | Deliberate product decision: frontend stays
  hard-coded English LTR. **No `app/src/i18n/` exists**, no locale middleware, no `sc_lang` cookie;
  the "arabic-rtl-deep" E2E spec **asserts en/ltr (verified)**."
- **Expected** no i18n directory and the named spec to exist and assert en/LTR.
- **Actual** `ls app/src/i18n` → **No such file or directory** (independently confirmed by Part 8a
  **A‑13**). `tests/e2e/specs/tenant/arabic-rtl-deep.spec.ts` **exists** — the `code-references`
  check passes.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Credit** this is the best-written "Done" row in the file: it names the decision, the absence, and
  the test that pins the consequence — and the consequence ("Implementing RTL would break the passing
  E2E suite") is the actual argument.

## R‑6 · [[DEVELOPER_ROADMAP]] T15 and T20/T22 — the island, migration-series and FK rows · MATCHED

- **Claim** T15: "`budget.json` + `lighthouserc.cjs` + `npm run lighthouse`; **CampBooking island now
  `client:visible`**; backend caching audit (**no KV caching** — safe under free plan)". T20:
  "`0118` default store per project, `0119` shift `store_id`, `0120` `pos_transactions.tip_amount`;
  gates 1–6 PASS". T22: "`49d7ce1` retargets `storefront_order_items.product_id` → `pos_products(id)`
  (`0123`); `kitchen_status`/`tip_amount` bind swap + positional INSERT-shape test"
- **Expected** each artefact to exist.
- **Actual** All three files exist (`0118_default_store_per_project.sql`,
  `0119_pos_shifts_store_id.sql`, `0120_add_tip_amount_to_pos_transactions.sql`), and `0123`'s
  retarget is confirmed at `0123_storefront_order_items_fk_pos_products.sql:89` (**D‑4**). `app/budget.json`
  and `app/lighthouserc.cjs` both exist (Part 8a **Y‑3** reads `budget.json`);
  `grep -rn "KV_CACHE.put" backend/src` → **0** (**D‑7**). `CampBooking` is `client:visible` at
  `app/src/components/public/TenantLanding.astro:203` (Part 8a **A‑8**). The positional-INSERT test
  exists and is corroborated by `AGENT_LOGBOOK_HISTORY.md:9545` (**O‑10**).
- **Class** MATCHED · **Severity** P3 · **Action** none

## R‑7 · [[DEVELOPER_ROADMAP]] §Remaining — "Push blocked on OAuth `workflow` scope" · FALSE

- **Claim** "| Git remote + push | **Repo created** — `github.com/Michaelhehelmy/campmaster`
  (private), `origin` set; commit `5d11305` local. **Push blocked on OAuth `workflow` scope** — approve
  the `gh auth refresh -h github.com -s workflow` device flow, or drop `.github/workflows/*` from
  pushed history |"
- **Expected** pushes to be blocked.
- **Actual** **Pushes land.** This audit's baseline check (`git branch -r --contains ddc63c6` →
  `origin/main`) is itself a push to `origin/main`, and the six preceding vault commits
  (`2dba33a`…`ddc63c6`) are all on the remote. The blocker is resolved and the row still lists it as
  open.
- **Class** FALSE · **Severity** P3 · **Action** UPDATE-DOC
- **Credit** the row is honest about *how* to unblock it ("or drop `.github/workflows/*` from pushed
  history") — which is the kind of alternative an owner action should carry.

## R‑8 · [[DEVELOPER_ROADMAP]] §"Known pre-existing type errors" — the 153-error baseline · FALSE

- **Claim** "`BookPage.astro` (`apiBase` prop) and `MenuPage.astro` (meal/mealCategory types) have LSP
  errors that predate this backlog batch (part of the known **153-error baseline**). They do not block
  `astro build` or the test suites."
- **Expected** a 153-error `tsc` baseline with the named files in it.
- **Actual** **The baseline is dead twice over.** (1) `AGENT_LOGBOOK_HISTORY.md:9086` is the 2026-09-06
  heading **"T33 TEST-FIXTURE TSC DEBT: DONE (329 → 0)"** with `npx tsc --noEmit` → **0 errors TOTAL
  (src + tests)**; the latest recorded run (2026-10-03) reports "the same **2 PRE-EXISTING** errors in
  `tests/unit/tenant-name-escape.test.tsx`". (2) **`tsc` cannot type-check `.astro` files at all** —
  the same 2026-10-03 entry says so explicitly ("`tsc` does not type-check `.astro` files at all, and
  `@astrojs/check` is NOT installed"). So the two named "errors" are LSP-level, outside `tsc`'s
  reach, and the 153 figure predates a session that drove it to 0.
- **Class** FALSE · **Severity** P3 · **Action** UPDATE-DOC
- **Note** the claim "They do not block `astro build`" is *correct* and is the only part that matters
  operationally — that sentence should be kept and the number dropped.

## R‑9 · [[BACKLOG_VOID_REFUND]] §Current — "`POST /api/pos/orders/:id/void` exists (manager-gated, stock restore, audit)" · **FALSE** · **P1**

- **Claim** "## Current — `POST /api/pos/orders/:id/void` exists (manager-gated, stock restore,
  audit). No partial refund, no Paymob refund call, no `refunds` ledger table."
- **Expected** a POS order-void route.
- **Actual** **It does not exist.** The POS router's complete route list is ten entries —
  `pos/index.js:278` POST `/auth/login`, `:305` POST `/auth/refresh`, `:402` GET `/products`,
  `:426` POST `/orders`, `:1032` GET `/orders`, `:1064` GET `/orders/:id`, `:1098` GET `/dashboard`,
  `:1212` GET `/shifts/active`, `:1238` POST `/shifts/open`, `:1277` POST `/shifts/close` — **no
  void**. A repo-wide search for a void route finds exactly one:
  `backend/src/api/folios.js:337` `foliosRoutes.post('/:id/void', …)` → `POST /api/folios/:id/void`,
  an **admin-only folio** status flip (`:351` `UPDATE folios SET status = 'voided' …`), added by
  `0124_guest_folios.sql`. Nothing ever writes `status = 'voided'` on a POS transaction: the
  `status != 'voided'` filters at `pos/index.js:1163,1168,1308` and `reports.js:183,220,235,294,317`
  are defensive exclusions for a value no writer produces.
- **Class** FALSE · **Severity** **P1** · **Action** UPDATE-DOC
- **Severity rationale** the file's own header is "Status: proposal only — no code changed", and the
  §Current block is the *present-state* half of a proposal — the half a reader trusts to be true and
  builds the rest of the proposal on. Its first bullet describes an endpoint that does not exist, and
  the *second* bullet ("no partial refund…") is true. A reader concludes void-then-refund is a
  one-route extension when it is a greenfield build. Note the related claim is falsifiable in the
  wrong direction too: the folder README calls this file "**Live 18-line backlog proposal**" whose
  "current state" is "the most falsifiable sentence in the repo".
- **Positive**: the third bullet, "Booking-order tips persist (`PATCH /api/orders/:id/tip`); POS tips
  receipt-only", is **MATCHED** (`orders.js:1382`, and `pos_transactions.tip_amount` exists) —
  though **R‑10** shows the "next cycle" list contradicts it.

## R‑10 · [[BACKLOG_VOID_REFUND]] §Next cycle item 3 — a "proposed" migration that already shipped · FALSE · P2

- **Claim** "3. POS tip persistence: **add `tip_amount` to `pos_transactions` via migration** +
  backfill 0, surface in reports."
- **Expected** `pos_transactions.tip_amount` to be absent.
- **Actual** **It shipped**, as this same file's own `code-references` block admits: it lists
  `backend/migrations/0120_add_tip_amount_to_pos_transactions.sql` — and that file exists, adding
  `tip_amount REAL DEFAULT 0`, with the bind already present (Part 8a **A‑23** notes the same
  migration as the fix for the `tip_amount` drift). `pos/index.js` binds `tipAmount || 0`; the only
  genuinely open half is "surface in reports", which **G‑13** confirms is still not done ("no tip
  handling in `admin-reports.js`").
- **Class** FALSE (the migration half) / MATCHED (the reports half) · **Severity** **P2** · **Action**
  UPDATE-DOC
- **Severity rationale** paired with **R‑9** this is the second way the same 43-line file
  misdescribes the present: an endpoint that does not exist, and a migration that does. Both sit in
  a document whose §Next-cycle item 7.3 in the wave plan points at as the canonical void/refund
  backlog.

## R‑11 · [[BACKLOG_VOID_REFUND]] §A11y/Perf notes — "4 islands" and a stale path · STALE

- **Claim** "Island discipline recorded in ARCHITECTURE.md (**4 islands**, prefer `client:visible`)."
  And "F-A19 / F-A20 IDs do not exist in repo (DEEP_AUDIT uses C/W scheme) — no per-component commits
  to make."
- **Expected** 4 islands; a resolvable path.
- **Actual** **9** public-facing island directive sites, not 4 (Part 8a **A‑8**/**Y‑1**: 6
  `client:visible` + 3 `client:load`, 17 total including the two `client:only` SPA hosts). And
  `ARCHITECTURE.md` as a bare filename no longer resolves — it is at
  `docs/01-architecture/ARCHITECTURE.md`. The second note (the F-A19/F-A20 IDs genuinely do not exist)
  is **MATCHED** and is the right way to close a stale backlog line: name the ID, say it is absent.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC

## R‑12 · [[FINAL_IMPLEMENTATION_PLAN_v3_waves]] §"Migration budget" — "Current 99, head `0099`" · **FALSE** · P2

- **Source** `docs/09-plans/FINAL_IMPLEMENTATION_PLAN_v3_waves.md` §"Migration budget (through Waves
  1-7)"
- **Claim** (table) "| Current | **99** | head `0099` |" · "| Q4 tip (`0100_tip_amount.sql`) | +1 →
  **100** | within raised cap (200) |" · "| Future auth/SSE/logging | +2 → **102** | within raised cap |"
- **Expected** a budget anchored on the real migration count.
- **Actual** The applied lineage is **40 top-level files**, head
  `0127_meals_tenant_composite_pk.sql` (**D‑1**). The table is anchored on the pre-squash
  `0001`–`0099` world — the same 99 that survives as `legacy/` (**D‑9**). Worse, the tip slot it
  reserves is **`0100_add_project_id_nullable.sql`**, a file that already exists and is part of the
  project-scoping series; the tip column landed as
  `0120_add_tip_amount_to_pos_transactions.sql` (**D‑4**/**R‑10**). So a reader following the budget
  would author a second `0100_*`.
- **Class** FALSE · **Severity** **P2** · **Action** UPDATE-DOC
- **Severity rationale** this is the second **actionable** stale instruction in this audit after
  **D‑2**, and it is worse in one respect: it names `0100_*` as a *free* slot when that slot has been
  taken for ~6 migrations. A migration budget is only useful while it is true.

## R‑13 · [[FINAL_IMPLEMENTATION_PLAN_v3_waves]] — two executed gates · MATCHED

- **Claim** Wave 0.5.4: "**Migration cap**: raise to 200 in `migration-integrity.test.js:110`
  (pre-decided owner 2026-09-16)" with done-condition "cap raised, migration-integrity green". Wave
  1.1: "F-A4-1: fix `storefront.js:195` (`price` → `selling_price`)" with done-condition "integration
  test passes for storefront cart GET".
- **Expected** both landed.
- **Actual** Both landed, both with the code saying so. `tests/core/migration-integrity.test.js:108-113`
  reads `expect(migrationFiles.length).toBeLessThanOrEqual(200);` with the comment at `:110-111`
  "Cap raised 100 -> 200 (pre-decided by owner 2026-09-16 §4.3, executed Wave 0.5.4): SQLite/D1 handle
  thousands of migrations; 100 was an arbitrary assertion." And `backend/src/api/storefront.js:197-199`
  selects `id, selling_price, project_id FROM pos_products …` — the exact column the task named.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Why this entry exists** it is the folder's proof that a wave plan's done-conditions are
  checkable: both cite a file and a line, and both lines verify. **R‑12** is in the same file and
  cites nothing checkable.

## R‑14 · [[FINAL_IMPLEMENTATION_PLAN_v3_waves]] §6 — the acceptance-criteria baselines · STALE

- **Claim** (table) "Backend unit tests | **2158 / 83 files** | every wave | any fail → do not
  proceed" · "Frontend unit tests | **3363 / 137 files**" · "Root integration | **255 / 37 files**" ·
  "tsc | **8 pre-existing errors**"
- **Expected** the baseline every wave is measured against to be the current one.
- **Actual** Backend **2743 / 127** and frontend **3632 / 155** (**T‑0**); `tsc` **0 → 2**, not 8
  (**R‑8**/**O‑20**). Root integration 255/37 is still exact (**T‑3**). The gate thresholds
  ("**below threshold pair** (83/72/89/89)", "> 8 → gate") are the durable part and match
  `AGENTS.md` §6.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC
- **Severity rationale** kept at P3 because the *mechanism* is intact — the thresholds are the
  enforceable half and they are unchanged. But a "not worse than baseline − 0.5%" rule measured
  against a 755-test-old baseline cannot detect a regression in the 585 tests added since.

## R‑15 · [[FINAL_IMPLEMENTATION_PLAN_v3_appendices]] §9.2 — "305 rows, unabridged" · MATCHED

- **Claim** "### 9.2 A9 — Full frontend export → backend route mapping (**305 rows**, unabridged)";
  "235 resolve to handlers, 70 are non-API, **0 unresolved**"; and the parent file's header line
  "# A9 — Frontend export → backend route mapping (305 exports)".
- **Expected** 305 data rows in the table.
- **Actual** The §9.2 table body carries **307** `|`-starting lines within its range — **305 data
  rows** plus the header row and the `|---|` separator. The arithmetic closes exactly, the
  235 + 70 = 235 + 70 = **305** partition is stated and self-consistent, and the "0 unresolved"
  assertion is correctly framed ("every one of the 305 exports is either mapped to a verified handler
  or accounted for as intentionally non-API").
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Credit** the explicit definition of "non-API" ("an export that maps to `—` in the register — it
  either never composes a backend route path … or returns server-rendered data that bypasses the API
  client contract") is what makes a self-reported count auditable. This is the appendix tier doing
  what the rest of the vault mostly does not.

## R‑16 · [[FINAL_IMPLEMENTATION_PLAN_v3_appendices]] §9.5 — the +3-net calibration · MATCHED as a dated record / STALE as a current figure

- **Claim** "Backend 2155 → 2158 = +3 net of ALL audit changes | `git diff --stat backend/tests/` →
  **1 file changed** (`backend/tests/orders-unit.test.js`, +55 insertions). Exactly **3 new test
  titles**" · "Fresh full run (this session) | `cd backend && npx vitest run` → **Test Files 83
  passed (83); Tests 2158 passed (2158)**; Duration 13.85s"
- **Expected** the three named test titles and the diff stat.
- **Actual** `backend/tests/orders-unit.test.js` exists; the three titles are quoted verbatim in the
  table. The 83/2158 figure is a **dated, single-session** measurement and the doc labels it as one
  ("this session", "Fresh full run"). The `9.5` heading even explains itself as a *calibration* of a
  delta, which is the correct use of a number like this.
- **Class** MATCHED (as dated evidence) / STALE (if read as the current baseline — see **R‑14**) ·
  **Severity** P3 · **Action** none
- **Credit** this section is the model the rest of the vault's test counts should follow: a delta
  claim, its diff evidence, the exact titles, and the run it came from.

## R‑17 · [[FINAL_IMPLEMENTATION_PLAN_v3_appendices]] §1 — the G-numbering collides with the wave plan's G-numbers · UNDOCUMENTED

- **Source** `FINAL_IMPLEMENTATION_PLAN_v3_appendices.md` §1 "Governance Incident Closure" vs
  `FINAL_IMPLEMENTATION_PLAN_v3_waves.md` §"Deploy gates"
- **Claim (collision)** The appendices define **G1** "A1 created migrations 0100 and 0101 during the
  audit", **G2** "A22 applied a production code fix into the tree", **G3** "M1 was committed without a
  definition", **G4** "A17 probed the live R2 bucket" — while the waves file defines **G1** as the
  Wave 1 storefront deploy gate, **G2** the Wave 2 money-path gate, **G3** the Wave 3 auth gate, and
  **G6.5** staging validation.
- **Expected** distinct namespaces.
- **Actual** Both files are live in `docs/09-plans/`, both are `status: approved`, and the folder
  README **correctly disambiguates** them ("**Deploy gates G1–G6.5**" vs "**Governance incidents
  G1–G4** are closure records, not plans"). So the README is right and the collision is only in the
  two files.
- **Class** UNDOCUMENTED · **Severity** P3 · **Action** UPDATE-DOC
- **Note** `G1`'s subject is also stale — migrations `0100_add_project_id_nullable.sql` and
  `0101_add_pos_stores_project_id.sql` both exist in the live lineage and were reconstructed as part
  of the squash (**R‑12**).

## R‑18 · [[09-plans/README]] §Concepts — all seven bullets · MATCHED

- **Claim** Seven bullets: a roadmap's "current state" line is the most falsifiable sentence in the
  repo and the backlog is folded forward through 2026-09-28 · known pre-existing type errors are a
  baseline not a regression · waves are ordered by dependency and the graph comes first ·
  **Deploy gates G1–G6.5** · **Governance incidents G1–G4** are closure records · **Evidence
  appendices 9.1–9.6** are unabridged artifacts · **Wave 7** is a carry-forward bucket.
- **Expected** each bullet to describe the folder accurately.
- **Actual** All seven verify: the gates and the governance records are the two G-namespaces
  (**R‑17**); appendices **9.1, 9.2, 9.3, 9.4, 9.5, 9.6** all exist at the stated headings in the
  appendices file; Wave 7's four items (7.1 Q9 PWA, 7.2 Q7 ewallet/instapay, 7.3 void/refund,
  7.4 A11/A19/A20) are present in the waves file and each is a decision, not a task. The
  "most falsifiable sentence" framing is the one **R‑7**, **R‑8**, **R‑9**, **R‑10**, **R‑12** all
  violate.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Note** "The live backlog here is folded forward through **2026-09-28**" is itself accurate — the
  newest `AGENT_LOGBOOK_HISTORY.md` fold is 2026-10-03, and the roadmap's own T-row list does not
  claim anything newer. So the folder is honest about its own staleness window; the defects above
  are rows that were not re-folded, not rows that claim to be.

## R‑19 · [[09-plans/README]] §Docs — "Live 18-line backlog proposal" · STALE

- **Claim** "| [[BACKLOG_VOID_REFUND|BACKLOG_VOID_REFUND.md]] | Live **18-line** backlog proposal for
  the next POS cycle. |"
- **Expected** `BACKLOG_VOID_REFUND.md` to be 18 lines.
- **Actual** **43 lines.** (Its substantive claims are audited at **R‑9**/**R‑10**/**R‑11**.)
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC
- **Severity rationale** small on its own, but it is a count in the very table whose purpose is to
  let a reader size the folder before opening a file — and **R‑9** shows what the file it points at
  contains.

---

# 10-tenant-import

## N‑1 · [[10-tenant-import/README]] + [[tenant-import-schema]] §2 — "88 leaf fields" · **MATCHED, and the arithmetic closes** · P3

- **Claim** "**88 leaf fields** — the manifest schema is a table, not prose, and the field count is a
  measured number at the current handler"; with the census
  `identity` 8 · `tenant` 20 · `project` 5 · `products` 12 · `rooms` 13 · `ratePlans` 10 ·
  `menu.categories` 2 · `menu.meals` 8 · `posUsers` 10 = **88**.
- **Expected** 88, with that per-section split.
- **Actual** The census was re-extracted from the handler's own `z.object` literals, independently of
  the doc: `identitySchema` (`tenant-import.js:13-24`) = 8 (`name`, `subdomain`, `type`, `email`,
  `password`, `first_name`, `last_name`, `business_type`); `manifestSchema` (`:102-207`) `tenant`
  `:104-123` = 20, `project` `:126-130` = 5, `products` `:133-144` = 12, `rooms` `:147-165` = 13,
  `rate_plans` `:168-177` = 10, `menu.categories` `:181-182` = 2, `menu.meals` `:185-192` = 8,
  `pos_users` `:196-205` = 10. **80 + 8 = 88, and every per-section figure matches the doc
  exactly.** The caps quoted alongside are also right: `.max(200)` on products/rooms/rate_plans/meals,
  `.max(50)` on categories, `.max(100)` on pos_users, and `}).strip()` at `:207` with all eight
  top-level sections `.optional()`.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Credit** the schema table is 90 rows long and every row I sampled (the `project.type` note, the
  `rooms.roomStatus` "no DB CHECK" note, the `posUsers.email` GENERATED-name note, the
  `menu.meals.mealCategoryId` "no A.4 example ships this key any more" note) is correct. This is the
  best table in the vault.

## N‑2 · [[10-tenant-import/README]] — "Two modes, and only one may roll back" · MATCHED

- **Claim** "existing-tenant mode (the requester's own tenant, admin roles) and super-admin `identity`
  provisioning, which creates tenant + admin + POS org + project. **Identity mode is a SAGA with a
  reverse-order undo log**; existing-tenant mode never deletes, so its failure answer honestly says
  partial data may remain."
- **Expected** a rollback in the identity path and none in the other.
- **Actual** `backend/src/api/tenant-import.js:1007` `const rollbackCreated = async () => {`, called at
  `:1099`, `:1103`, `:1118`. Identity provisioning commits `tenants` (`:1035-1037`), the admin, the
  POS org + store + mapping, and the default project, and each is tracked for undo.
  `backend/src/api/tenant-import.js:244-251` (`index.js`) confirms the two modes' gates:
  `resolveScope({ auth: { roles: ['super_admin', 'admin'] }, requireTenantHint: false })`, with
  `:237-240` explaining the bug it fixed ("identity mode always 403 … existing-tenant mode always
  401"). `ensureTenantOrg` (`resolveScope.js:46-79`) auto-creates org + store + mapping in **both**
  modes via three `INSERT OR IGNORE` statements.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Note** this claim directly contradicts **`BLOCKED-pos-products-composite-pk.md` §5**, which says
  the identity-path rollback was **SKIPPED** and that "Nothing exercises the branch that would carry
  the rollback" (**N‑8**). The README is the current one.

## N‑3 · [[tenant-import-types]] §3 — the matrix row and its own evidence note contradict each other · FALSE · P2

- **Source** `docs/10-tenant-import/tenant-import-types.md`
- **Claim** The matrix row "| project | **O** | O | O | O† | O† |" with the legend "**O** = optional,
  accepted and processed identically … **I** = schema-valid but never read — **zero cells since the
  `project` block became a real writer**". But per-section evidence note 2: "**project (I × 5).**
  Schema `.optional()` at `:92`. `runImport` contains **zero references to `data.project`** (A.2 F1,
  **re-verified by grep this session**). **Inert** in both modes for every type".
- **Expected** the row and the note to agree, and the note's grep claim to be true.
- **Actual** **`data.project` IS read.** `backend/src/api/tenant-import.js:451` `if (data.project) {`
  and `:452` `const p = data.project;` — the project upsert/insert block. The note's
  "re-verified by grep this session" is therefore a **false negative**: the grep looked for
  `data.project` and the code does read it. The matrix row (**O**) is the correct half; the note
  (**I**) is the stale half, left over from A.2 F1.
- **Class** FALSE · **Severity** **P2** · **Action** UPDATE-DOC
- **Cross-doc** this is the third of three in the same folder (**N‑4**, **N‑5**), and the only one
  where the doc contradicts *itself in one file*.

## N‑4 · [[tenant-import-schema]] §"Schema-level findings" item 2 — "`project` validated but inert" · FALSE · P2

- **Claim** "2. **`project` validated but inert**: runImport never reads `data.project` (verified by
  grep — zero references); rooms need exactly one existing project (`defaultCampId`, else the
  INSERT…SELECT guard 404s). Only identity mode creates a project (from identity fields)."
- **Expected** `runImport` to skip the `project` block.
- **Actual** `tenant-import.js:451` reads it. **The same file's §2 table, 190 lines earlier, says the
  opposite and correctly**: the `project.name` row is annotated "**written** (section 0, :344–411):
  updates the tenant's oldest live project, or INSERTs `proj_`+uuid12 when the tenant owns none", and
  the `project.type` row says "→ `projects.project_type`, assigned directly (NOT COALESCEd) — added
  after A.1". So `tenant-import-schema.md` documents the behaviour correctly in its reference table
  and then denies it in its findings list.
- **Class** FALSE · **Severity** **P2** · **Action** UPDATE-DOC
- **Note** the §2 table's line range (`:344–411`) is itself stale — the block is at `:451`+ in a
  1,151-line file. The `project.type` and `project.status` "assigned directly, not COALESCEd" claims
  are unverifiable from what I read but consistent with the schema row types.

## N‑5 · [[tenant-import-appendix]] Table 3 A1 — "Entire `project` block … Parses, never read" · FALSE · P2

- **Claim** "| A1 | Entire `project` block (`name`/`location`/`capacity`/`status`) | Parses, **never
  read by `runImport` in either mode**. (Same root cause as F1; listed here as the accepted-ignored
  instance.) |"
- **Expected** the `project` section to be inert.
- **Actual** `tenant-import.js:451` reads it, in both modes — the block sits inside `runImport`, which
  both modes call. Same defect as **N‑3**/**N‑4**, third carrier.
- **Class** FALSE · **Severity** **P2** · **Action** UPDATE-DOC
- **Severity rationale for N‑3/N‑4/N‑5 as a group** one stale finding has propagated to three documents
  in one folder, and in **two** of them it now contradicts that same document's own reference table.
  A manifest author reading A1 would conclude their `project` block is doing nothing and would not
  use `project.type` to set `projects.project_type` — a real, silent capability loss. The finding
  dates from A.2 (2026-09-30); the `project` block became a real writer when A.4 added `project.type`,
  and the reference tables were updated while the findings lists were not.

## N‑6 · [[tenant-import-schema]] §"Probe caps" — the batching helper and the D1 ceiling · MATCHED

- **Claim** "Both reference probes interpolate their `IN (…)` list, so both are exposed to D1's
  **100 bound parameters per query** ceiling … Both go through one helper, `probeIdsInBatches`, which
  derives the batch size from that ceiling (`100 − fixedBinds − 5` headroom = **94 ids + `tenant_id`
  = 95 binds**) instead of hard-coding a step" · "Both callers `SET`-de-duplicate first" · "Migration
  0127 closed both" · and the "or 1000" reasoning: "`menu.meals` emits **2 statements per meal** into
  a single `DB.batch()`, so the current cap of 200 already means up to **400 statements** in one
  invocation — against a Free ceiling of **50**."
- **Expected** the helper, both batched call sites, and the derivation.
- **Actual** `tenant-import.js:52` `async function probeIdsInBatches(DB, ids, fixedBinds, query) {`,
  with two call sites: `:412` `const resolvable = await probeIdsInBatches(env.DB, distinct, 1, (chunk) =>`
  (the `campId` probe, commented "Batched (see `probeIdsInBatches`): the products cap is 200") and
  `:770` `const owned = await probeIdsInBatches(env.DB, explicitIds, 1, (chunk) =>` (the explicit
  `menu.meals[].id` probe, commented "Batched … `menu.meals` is capped at 200 entries"). Both pass
  `fixedBinds = 1` for `tenant_id`, which is what makes the doc's "94 ids + `tenant_id` = 95 binds"
  arithmetic coherent. The Free-plan 50-queries-per-invocation figure is a Cloudflare fact, not
  tree-derivable.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Credit** "Deriving it is the point: a literal `i += 50` keeps working until someone raises an
  array cap, and then the probe silently drifts back over the ceiling" is the sentence that explains
  *why* the code looks the way it does — the reason most code comments in this repo omit.

## N‑7 · [[tenant-import-schema]] §2 — the `rooms.cleaningStatus` / `roomStatus` CHECK asymmetry · MATCHED

- **Claim** "`rooms.roomStatus` … → `rooms_new.room_status`; **no DB CHECK**, so this enum is a policy
  choice mirroring the values `PATCH /api/rooms/:id/status` accepts." And "`rooms.cleaningStatus` …
  **CHECKed by the schema**, so the enum must match it exactly — wider is a 500, narrower silently
  rejects a legal value."
- **Expected** one column CHECKed and one not, with the exact permitted set.
- **Actual** `backend/migrations/0003_products.sql:43` declares `room_status TEXT DEFAULT 'available'`
  **with no CHECK clause**, while `:44` declares
  `CHECK(cleaning_status IN ('dirty', 'in_progress', 'clean', 'inspected'))`. The identical asymmetry
  is re-declared at `0107:235-236` and `0115:91`. The Zod enum at `tenant-import.js:164-165` lists
  exactly those four `cleaning_status` values and exactly the five `PATCH` accepts for `room_status`
  (`camps.js:952`, **G‑8**).
- **Class** MATCHED · **Severity** P3 · **Action** none

## N‑8 · [[BLOCKED-pos-products-composite-pk]] §5 — "Identity-path rollback assessment — **SKIPPED**" · **STALE** · P2

- **Claim** §5.1: "**Existing test coverage of the identity path is insufficient** …
  `backend/tests/tenant-import.test.js:787-1038` is **the only identity-path suite** (16 tests) …
  **Nothing exercises the branch that would carry the rollback** — the post-provisioning failure at
  `tenant-import.js:829-832`, where `importTenantManifest` returns `status >= 400` *after* steps 1–4
  have committed. There is no fixture that makes `runImport` fail on the identity path, so a rollback
  would land with zero safety net and no way to prove it works." §5.3: the Wave 8 carry-forward item,
  restating that the `if (result.status >= 400)` branch "carries the comment … but performs **no
  cleanup**".
- **Expected** no identity-path rollback, and one identity-path suite.
- **Actual** **Both are superseded.**
  (1) `backend/tests/tenant-import-identity.test.js` **exists** — it is the 2026-10-02 `a2-saga-status`
  mission's suite, with **9** tests (`M1`–`M6` + `S1`–`S3`), recorded verbatim at
  `AGENT_LOGBOOK_HISTORY.md:9684`: "**tenant-import-identity.test.js** +3 tests … **S1** a 409 through
  the saga … asserts the shell WAS inserted and undone, tenant deleted last, every table back at
  baseline. **S2** a guarded 404 through the saga … **S3** the manifest-schema 400 through the saga".
  (2) The handler now **does** clean up: `rollbackCreated()` at `tenant-import.js:1007`, called at
  `:1099`, `:1103`, `:1118` — the logbook's **A1/M2** closure, whose finding was literally "identity
  mode answers 500, not 400" and whose fix was to "run the SAME `rollbackCreated()` it always ran,
  then return that Response".
  (3) There is also `backend/tests/tenant-import-rollback.test.js`, a fourth-case saga suite the same
  entry names among "the 7 pre-existing tenant-import suites".
- **Class** STALE · **Severity** **P2** · **Action** UPDATE-DOC
- **Severity rationale** this is a doc whose whole value proposition is "a verdict and an unblock
  condition, kept separate from the schema docs so an open question is never filed under 'here is how
  it works'" (**N‑10**). §5 is a *verdict* that has since been reversed, and §5.3 hands the reader a
  "Wave 8 item to carry forward" that is already done. A reader would carry a closed item forward and
  skip the one that is genuinely still open (`pos_products.id`, §"Parity D3, identifier half").

## N‑9 · [[BLOCKED-pos-products-composite-pk]] §5.2 — the cited line range and the superseded quote

- **Claim** "That is exactly the surface F-A17-02 declined to authorise — `tenant-import.js:723-726`
  records 'Imported *rows* are not rolled back (the plan's "or" option — two-phase upload-then-insert-
  with-cleanup — was chosen; **no D1 rollback was authorized**)', and the R2 rollback that *was* built
  is scoped to `MEDIA_BUCKET` keys only."
- **Expected** that quote at `:723-726` of `tenant-import.js`.
- **Actual** **`tenant-import.js:723-726` no longer holds that text.** In the current 1,151-line file,
  `:719-728` is the `meal_categories` / `meal_categories_lang` INSERT building
  (`catStmts.push(env.DB.prepare("INSERT INTO meal_categories …"))`). The line reference predates the
  file's growth. Separately, the *substance* — "no D1 rollback was authorized" — is superseded for
  the identity path by `rollbackCreated()` (**N‑8**), while it remains true of the existing-tenant
  path (which never deletes) and of cross-section atomicity, which
  `tenant-import-appendix.md` Table 4 K6 still records correctly ("Per-section `DB.batch` calls, no
  cross-section transaction").
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC

## N‑10 · [[BLOCKED-pos-products-composite-pk]] — the six inbound FK edges and the decisive `SET NULL` · **MATCHED** · the folder's strongest reasoning

- **Claim** (table) Six inbound FK edges to `pos_products`: `rooms_new.product_id` **RESTRICT** ·
  `rate_plans_new.product_id` **CASCADE** · `pos_transaction_items.product_id` **NO ACTION** ·
  `pos_recipe_ingredients.product_id` **NO ACTION** · `pos_recipe_ingredients.ingredient_id`
  **NO ACTION** · `storefront_order_items.product_id` **`SET NULL`**. "Five of six convert cleanly.
  The sixth does not, and it is decisive." Plus §2: `storefront_order_items` "has no `tenant_id` to
  key a composite edge on"; plus the "what would unblock it" list of three owner decisions.
- **Expected** each edge's `ON DELETE` action.
- **Actual** Every action matches the live lineage. `0003_products.sql:31`
  `product_id TEXT NOT NULL REFERENCES pos_products(id) ON DELETE RESTRICT` and `:49` the same with
  `ON DELETE CASCADE`; `0004_pos.sql:113-114` the two `pos_recipe_ingredients` edges (NO ACTION, the
  implicit default) and `:179` `pos_transaction_items`; and the decisive one,
  `0123_storefront_order_items_fk_pos_products.sql:89`
  `product_id TEXT REFERENCES pos_products(id) ON DELETE SET NULL` — with the file's own `:5` header
  explaining the retarget and `:64` asserting exactly that line. **`storefront_order_items` carries no
  `tenant_id` column**, exactly as §2 states (its columns end `… created_at, project_id`), which is
  the whole argument.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Credit** the `meals` contrast is also exact: "`meals` has exactly **two** inbound edges —
  `meal_lang` (CASCADE) and `meal_schedules` (CASCADE) — and **no `SET NULL`**" —
  `0005_menu.sql:38,42` are both `ON DELETE CASCADE`. And the unblock option 1's premise,
  "`pos_products.deleted_at` already exists and is used by every read path", holds
  (`0126:177`, `:226`). The reasoning is *measured* rather than argued, and it is why `pos_products.id`
  being still open while `meals.id` is closed is a defensible verdict rather than an inconsistency.

## N‑11 · [[tenant-import-appendix]] Table 2 U9 — the subdomain regex/message mismatch · MATCHED

- **Claim** "U9 | The subdomain 400 message text says '3-63 chars' but **1-char subdomains pass the
  regex** — the doc documents the true rule (1 char or 3–63; 2-char rejected) correctly; the handler
  message understates it."
- **Expected** the regex and the message to disagree as described.
- **Actual** `tenant-import.js:950` `if (!/^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/.test(id.subdomain))`
  followed by `:951`
  `return errorResponse('Subdomain must be lowercase alphanumeric with hyphens, 3-63 chars', 400);`.
  The regex accepts a single character (the optional group is absent) and 3–63 characters (1 + 1–61 +
  1); it rejects 2. The message says "3-63 chars". **Exactly as documented.**
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Credit** a documented *mismatch between a validation and its own error message* is a rare class of
  finding, and the table's `Doc status` column records which side is authoritative. This is what
  Table 2's "Undocumented (code does, doc silent)" heading earns its keep on.

## N‑12 · [[tenant-import-appendix]] Table 2 U10 — `ensureTenantOrg` in both modes · MATCHED

- **Claim** "U10 | `ensureTenantOrg` auto-creates org + store + mapping (`INSERT OR IGNORE`) in **BOTH
  modes** — the existing-tenant 409 `Tenant is not provisioned for POS` fires only when it returns
  falsy, not on first use. The doc's 409 row reads as a pure precondition check."
- **Expected** the three `INSERT OR IGNORE` statements and the falsy-only 409.
- **Actual** `backend/src/middleware/resolveScope.js:46` `export async function ensureTenantOrg(env,
  tenantId) {`; `:49` `SELECT organization_id FROM tenant_org_mapping WHERE tenant_id = ?`;
  `:56` `INSERT OR IGNORE INTO pos_organizations (name, slug, created_at, updated_at)`;
  `:61` `SELECT id FROM pos_organizations WHERE slug = ?`; `:67`
  `INSERT OR IGNORE INTO pos_stores (organization_id, name, code, address, city, created_at,
  updated_at)`; `:72` `INSERT OR IGNORE INTO tenant_org_mapping (tenant_id, organization_id) VALUES
  (?, ?)`; `:77` `console.error('ensureTenantOrg failed:', e.message)` — i.e. it returns falsy on a
  throw, which is the only path to the 409. The cited range `resolveScope.js:46-79` is exact, and
  it is also this file's `code-reference`.
- **Class** MATCHED · **Severity** P3 · **Action** none

## N‑13 · [[tenant-import-appendix]] §4 — "Each file covers 84 of the 88 leaf fields" · **83, not 84** · STALE

- **Claim** "Each file covers **84 of the 88** leaf fields (measured 2026-10-02 against the schema's key
  census, not asserted by hand). The four it omits are all deliberate:" followed by a four-row
  omission table (`products[].campId`, `rooms[].roomStatus`, `rooms[].cleaningStatus`,
  `project.type`).
- **Expected** 84/88 with exactly those four omissions.
- **Actual** **83 / 88, with five omissions.** Recomputed mechanically: a schema extracted from the
  handler's `z.object` literals (**N‑1** — 88 fields), then presence-checked against each shipped
  manifest. All five A.4 files are identical:
  **present 83 / 88**, missing `project.type`, `products.campId`, `rooms.roomStatus`,
  `rooms.cleaningStatus`, **and `menu.meals.mealCategoryId`**. The four named are correct; the fifth
  is the `mealCategoryId` placeholder the appendix's *own prose* two paragraphs below already
  documents as removed ("The files previously carried a `mealCategoryId: "mcat_existing_*"`
  placeholder on one meal each … It was removed: the id it named exists in no database") — the
  reason is written down, the omission was simply never counted.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC
- **Severity rationale** the discrepancy is one field, but the claim is explicitly framed as a
  measurement ("not asserted by hand"), and the same section's companion number is
  **exact**: `docs/examples/tenant-manifest.example.json` is **69 / 88** as claimed ("69 of 88 leaf
  fields (no `identity` at all)"), missing 11 (`project.type`, `products.categoryId`,
  `products.campId`, `rooms.roomStatus`, `rooms.cleaningStatus`, `ratePlans.id`,
  `ratePlans.productId`, `menu.meals.id`, `menu.meals.mealCategoryId`, `menu.meals.isActive`,
  `posUsers.storeId`). One number in a pair of self-declared measurements is off by one; that is
  enough to make a reader re-run both.

## N‑14 · [[tenant-import-appendix]] — §"6. Export CLI" is duplicated verbatim · UNDOCUMENTED

- **Source** `docs/10-tenant-import/tenant-import-appendix.md`, headings at `:174` and `:190`
- **Claim (gap)** `:174` is `## 6. Export CLI + round-trip losses`; `:190` is
  `## 6. Export CLI + what round-trips vs what drops`. Both carry the same three-paragraph intro and
  the same three command lines.
- **Expected** one §6.
- **Actual** **Two `## 6` headings with a duplicated body** — an artefact of the 2026-10-06
  three-way split of `docs/tenant-import.md` (same date as the appendix's `created:`). The round-trip
  ledger and residual findings follow once, at `§"The round-trip ledger as of 2026-10-02"` (`:211`).
- **Class** UNDOCUMENTED · **Severity** P3 · **Action** UPDATE-DOC
- **Note** the same split shows a related artefact in `tenant-import-schema.md` — the `## 2` heading at
  `:31` and `tenant-import-types.md`'s `## 3` at `:29` — but there the split is clean (each half owns
  its section number). Only the appendix duplicates.

## N‑15 · [[10-tenant-import/README]] — the six concept bullets · MATCHED

- **Claim** Six bullets: **88 leaf fields** (**N‑1**) · two modes and only one may roll back (**N‑2**) ·
  tenant-type matrix handler-verified, "never assumed" (**N‑3**) · products must exist before anything
  references them, rooms/rate plans land in `rooms_new`/`rate_plans_new` (**N‑16**) · meals reference
  categories by `categoryName`, never by id (**N‑17**) · image handling bounded, base64 ≤8 MB
  (**N‑18**).
- **Expected** each traceable.
- **Actual** **N‑1**, **N‑2** confirmed above. The others are verified at **N‑16**/**N‑17**/**N‑18**.
- **Class** MATCHED · **Severity** P3 · **Action** none

## N‑16 · [[tenant-import-schema]] — the guarded-`INSERT…SELECT` / 400 / 404 resolution rules · MATCHED

- **Claim** "unknown `productName` → 400 for rooms and ratePlans; unknown `categoryName` → 400 for
  meals too (the meals pre-flight …) … and the meal check runs **before any DB write**" · "`campId`
  … must name one of the tenant's live (`deleted_at IS NULL`) projects or the import 400s and writes
  nothing. Nothing checked it before, and no constraint caught it either — at the head
  `pos_products.camp_id` is a bare column (only `project_id` carries the `projects` FK)" ·
  "`defaultCampId` is null unless the tenant owns exactly one non-deleted project".
- **Expected** the asymmetry (name-resolved 400, id-bound blind) to be real.
- **Actual** `tenant-import.js:236-240` `CAMP_ID_REFS` lists the sections that can carry a campId with
  `:229-232` the comment "Only `products[]` accepts the key at the head schema — rooms/ratePlans/
  posUsers declare no `camp_id` field and zod's object default is `strip`, so a campId sent there
  never survives parsing (the `room.camp_id` read in the rooms section is dead for that reason)" —
  which is exactly the schema doc's §2 `campId` note ("must name a live project the tenant owns,
  else **400** before any write; omitted → `defaultCampId` (null when tenant has ≠1 project)"). The
  `pos_products.camp_id` bare-column claim is verifiable: no `CREATE INDEX`/FK in the lineage binds
  it (only `project_id` is FK'd, per `0115`'s pattern).
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Note** this makes **N‑3**/**N‑4**/**N‑5** more pointed: the `CAMP_ID_REFS` comment is careful to
  distinguish the *dead* `room.camp_id` read from the *live* `data.project` read, so the same file
  knows the difference the findings lists blur.

## N‑17 · [[tenant-import-schema]] §2 — meals resolve `categoryName`, `mealCategoryId` is blind · MATCHED

- **Claim** "resolved against this manifest's `menu.categories[].name` **plus the categories the
  tenant already owns**; **unresolvable → 400 before any row is written** (symmetric with
  rooms/ratePlans)" and, for `mealCategoryId`, "used verbatim, **no existence check** (blind —
  dangling id 500s, A.2 K4). **No A.4 example ships this key any more**: create mode mints each
  category id as `mcat_<uuid12>` at import time".
- **Expected** the symmetric-400 and the blind-id asymmetry.
- **Actual** `tenant-import.js:188` declares `category_name: z.string().optional()` alongside
  `:187` `meal_category_id: z.string().optional()` — both optional, no existence constraint in the
  schema, so the 400 must come from a pre-flight. `resolveImage`'s sibling `generateMealId()`
  (`:221-225`) mints `meal_`+12 hex and its doc comment (`:210-219`) states the 0127 reasoning, and
  the category-id mint the doc describes is the sibling `mcat_` generator. The **measured consequence
  is confirmed by N‑13**: `menu.meals.mealCategoryId` is indeed absent from all five A.4 files — so the
  doc's two claims (blind path exists; no example ships it) are consistent with each other and with
  the shipped artefacts, even though **N‑13** shows the omission was never counted.
- **Class** MATCHED · **Severity** P3 · **Action** none

## N‑18 · [[tenant-import-schema]] §"Schema-level findings" item 5 — the image rule · MATCHED

- **Claim** "(resolveImage :38–58): `data:image/(jpg|jpeg|png|webp|gif);base64,…` ≤ 8 MB → R2
  `MEDIA_BUCKET` → `/api/media/…` URL (**tracked for rollback on failure**); `http(s)` /
  `/api/media/` passthrough; anything else (incl. unbound bucket) → null. Applies to tenant
  logo/favicon/hero, product image_url, meal image_url. **No KV writes.**"
- **Expected** all six clauses.
- **Actual** `tenant-import.js:62` `const ALLOWED_IMAGE_EXTS = ['jpg','jpeg','png','webp','gif']`;
  `:63-66` the content-type map; `:76` `async function resolveImage(env, tenantId, value, uploadedKeys
  = null)`; `:78` the passthrough branch for `http://`, `https://`, `/api/media/`; `:81` the data-URI
  regex; `:88` `if (bytes.byteLength > MAX_UPLOAD_BYTES) return null;` with `MAX_UPLOAD_BYTES` imported
  from `upload.js:7` (`8 * 1024 * 1024`); `:89` `if (!env.MEDIA_BUCKET) return null;` — the unbound-bucket
  clause; `:91` the R2 `put`; `:94` `if (uploadedKeys) uploadedKeys.push(key)` — the rollback-tracking
  clause. The `:70-71` comment states "NO KV writes ever (free-plan quota)". The cited range is `:38–58`
  in a file where `resolveImage` now begins at `:76` — the same line-drift as **N‑9**.
- **Class** MATCHED · **Severity** P3 · **Action** UPDATE-DOC (the range)

## N‑19 · All five `10-tenant-import` docs — `code-references` · MATCHED

- **Claim** 30 references across `README.md`, `tenant-import-schema.md`, `tenant-import-types.md`,
  `tenant-import-appendix.md`, `BLOCKED-pos-products-composite-pk.md`.
- **Expected** every path to resolve.
- **Actual** **30 / 30 resolve**, including every line-anchored one that can be opened:
  `index.js:244` (**N‑2**), `0001_core.sql:19`, `tenants.js:19`, `camps.js:43`,
  `resolveScope.js:46-79` (**N‑12**), `response.js:41`, `tenant-import.js:801-822`,
  `tenant-import.test.js:787-1038`, `meals-tenant-composite-pk.test.js`,
  `tenant-import-smoke.test.js`, `tenant-import.test.js`, `tenant-export-room-status.test.js`,
  `tenant-import-project-id.test.js`, `docs/examples/tenant-manifest.example.json`,
  `scripts/validate-manifest.mjs`, `scripts/export-tenant.mjs`, and all five manifests under
  `docs/examples/manifests/`. The folder is the best-referenced in the vault.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Residual nit (P3)** four line-anchored references now point at the wrong lines in a file that has
  grown: `tenant-import.js:723-726` (**N‑9**), `resolveImage :38–58` (**N‑18**), §2's
  "section 0, :344–411" (**N‑4**). File-level references are all current; line-level ones drift with
  the file. That is the 2026-10-06 p4 lesson's second half — grep a reference *to existence with a
  line range*, and re-grep the range when the file changes.

---

# Notes on method, and what was deliberately not done

**Not re-run:** backend / app / monitor / root-integration / E2E suites, `ANALYZE=1 npm run build`,
`npm run lighthouse`, `wrangler` (any subcommand), `deploy.sh`, any `curl`, any remote call, any
`wrangler d1 *`. Test counts come from the latest committed result in
`docs/98-history/sessions/AGENT_LOGBOOK_HISTORY.md` with the per-suite provenance table at **T‑0**.
Migration head/count, `wrangler.toml` values, `deploy.sh` internals, route mounts and every
`code-references` path were read from the real tree.

**Tooling note:** `rg` is not on PATH in this workspace, as the spec noted. Content searches went
through the `grep` tool and bash `grep`/`find`; the schema census (**N‑1**), the manifest field
census (**N‑13**), the nav-tab census (**T‑5**) and the `code-references` resolution sweep all ran as
throwaway `node:fs` scripts in `/tmp/opencode/`. No dependency was added and nothing in the repo was
written except this file and the logbook fold.

**A note on one of my own checks.** My first manifest-field script reported 74/88, which disagreed with
its own missing-field list. The cause was that `menu.categories` and `menu.meals` are nested under
`m.menu` in the JSON, so `m['menu.categories']` was `undefined` and 10 fields were silently skipped.
Both numbers moved together (74 + 4 ≠ 88) and that is what exposed it. The corrected run (**N‑13**)
resolves the nesting and is the one reported. Flagging it because the same class of bug — a key-path
lookup that silently skips a subtree — is exactly what makes a doc's own count wrong in **T‑5**.

**Nothing was fixed.** 16 entries are `FALSE` and 31 more are materially `STALE`, and the fix for most
is a one-line edit to a doc — but the spec for this pass is audit-only, so every one is left for the
reconciliation pass with a named `Action`. The four P1s are, in priority order:

1. **T‑5 + T‑6** — `TESTING.md`'s tab-ID table is missing 30 of 52 real tab IDs *and* the folder README
   nominates it as the sole authority, which is why it drifted.
2. **D‑2** — `migrations.md` step 1 instructs the reader to create `0124_<slug>.sql`, a slot taken by
   a real applied migration. Following it is destructive.
3. **R‑9** — `BACKLOG_VOID_REFUND.md`'s §Current asserts `POST /api/pos/orders/:id/void` exists; the
   only void route in the backend is `POST /api/folios/:id/void`.
4. **R‑12** — the wave plan's migration budget anchors on "99, head `0099`" and reserves `0100_*` as
   free; that slot has been taken for six migrations.

**What this audit would change about how these docs get written.** The two extremes are both in this
scope and they are not close. `RUNBOOK.md` states its own standard — "treat a procedure here as
executable only if it names a command you could paste today" — and meets it: of its 13 numbered
entries, **10 are MATCHED and not one is FALSE**, the other 3 are externally unverifiable by
construction (live `curl` status codes, the 24-hour watch window, Cloudflare's own plan limits), every
`deploy.sh` line reference resolves exactly, and the two D1 `database_id` UUIDs are transcribed
correctly. Meanwhile `security-guide.md` and the `10-tenant-import` reference docs are the most
*auditable* documents in the vault: `security-guide.md`'s 18 entries come out 13 MATCHED / 3 STALE /
1 FALSE / 1 split, and the MATCHED set includes the exact 1/12/4/1 `escHtml` hit census, the two local
shadow definitions, and the whole CORS block down to its `123–141` line range; `tenant-import-schema.md`'s
88-field table closes its own arithmetic against the handler (**N‑1**), and
`BLOCKED-pos-products-composite-pk.md`'s six-FK table is verified action-by-action against the live
lineage (**N‑10**). The failures are not in the prose — they are in **numbers and instructions**.
Every P1 and P2 here is a count, a filename, a port-list, or a command that a doc states without
provenance: `TESTING.md`'s three stale counts, `migrations.md`'s taken `0124` slot, the wave plan's
`0099`/`0100`, the void/refund backlog's phantom endpoint, the three-fabricated-analytics block, the
three-site "7 prefixes", and one stale finding replicated across three tenant-import docs. **None of
them is checkable by reading the document; every one of them was caught by reading the code.** The fix
is a provenance rule, not a prose rewrite: every count, filename and command a doc asserts should carry
the commit or the run that produced it. `ARCHITECTURE.md` §7 and the `_v3_appendices.md` §9.5 both
already do this, and both are the two places in this vault where a stale number is visible instead of
authoritative.