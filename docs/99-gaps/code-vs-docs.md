---
title: "Code vs docs — STALE and FALSE claims"
aliases:
  - code-vs-docs
tags:
  - type/audit
  - audience/agent
  - domain/docs
  - status/live
created: 2026-10-06
updated: 2026-10-06
relates-to:
  - "[[99-gaps/README]]"
  - "[[unverified]]"
  - "[[unimplemented]]"
  - "[[code-vs-code]]"
  - "[[ARCHITECTURE]]"
  - "[[API_SURFACE_MAP]]"
  - "[[migrations]]"
  - "[[TESTING]]"
  - "[[security-guide]]"
  - "[[COMPONENT_CATALOG]]"
code-references:
  - "backend/migrations/0127_meals_tenant_composite_pk.sql"
  - "backend/migrations/legacy/0053_camp_ownership.sql"
  - "backend/migrations/legacy/0099_normalize_marketplace_payouts_ids.sql"
  - "backend/src/index.js"
  - "backend/src/middleware/rateLimit.js"
  - "backend/wrangler.toml"
  - "app/src/lib/api.ts"
  - "app/src/components/admin/AdminApp.tsx"
  - "app/src/lib/routeZones.ts"
  - "deploy.sh"
verified: 2026-10-06
---
# Code vs docs — STALE and FALSE claims

Every verifiable claim in ten of the vault's eleven domain folders, checked against the code and
filed here when it did not hold. These are the queued edits, with the `file:line` each one rests on,
so a reconciliation pass can work from a list instead of re-running two audits.

**That pass has now run** — see `## Status as of 2026-10-06` for the ledger and
[[code-vs-docs#Resolved]] for the closed entries, each with the commit that closed it. Entries are
never deleted from this note; a resolved one is *moved to a fixed state*, because a queue that forgets
what it caught cannot tell a reader whether a gap was closed or never seen.

Two source audits are consolidated here. Their full narrative lives outside the vault, in
`.opencode/audits/gaps-arch-api-frontend-2026-10-06.md` (audit A, baseline `dee3124`) and
`.opencode/audits/gaps-data-sec-test-ops-2026-10-06.md` (audit B, baseline `ddc63c6`). Entry text is
reproduced verbatim from them; this note adds only the totals, the ordering, entry #1, and the
provenance table.

`rg` is not on PATH in this workspace. Both audits used the `grep` tool and throwaway `node:fs`
scripts from `/tmp`; where a whole table could be checked mechanically it was, rather than sampled —
`API_SURFACE_MAP.md`'s 268 endpoint rows, all 249 `Frontend Function` names, all 195 `use*` hook
names, all 84 `DB Tables` names, the 46 admin + 6 POS nav-tab ids, the 88-field tenant-import schema
census, and every `code-references` entry in all 34 audited files.

## Status as of 2026-10-06

The reconciliation pass that followed these two audits has landed. **The owner chose FIX DOCS ONLY**,
so every entry closed below was closed by **editing the doc that made the claim** — 18 doc-fix commits,
`3b753e4` … `edb07db`, plus the `O‑7` probe `e731b11` — and **not one** by changing code. That is the
single most important fact about this table, and it is why `RESOLVED-CODE` is **0** rather than
`RESOLVED-DOC` being 0: several findings were *implementation* findings (a metric that does not
exist, a raw `fetch`, an unsafe `DROP TABLE`), and the pass closed them by making the docs stop
claiming them or by filing the code half as a queue item in [[code-vs-code]].

**Scope of the ledger.** Every row below is one *triaged* gap entry across the folder's four notes:
the **75** rows triage A produced for this note (73 class-bearing `###` entries + `Entry #1` + the
`D‑13` nested inside it), the **25** rows triage B+C produced for [[unimplemented]] (10) and
[[unverified]] (15), and the **6** new rows in [[code-vs-code]]. Entries carrying no action are
outside it: the seven `MATCHED`-only bodies under *Entries by folder* (`A‑6`, `A‑13`, `S‑7`, `P‑4`,
`P‑10`, `O‑25`, `N‑19`), the 112 foot controls, and `T‑0`, which is the provenance table every
test-count entry is measured against rather than a claim.

| Status | Count | Definition | Where |
|---|---|---|---|
| `RESOLVED-DOC` | **87** | the cited doc was corrected; the claim was wrong and the code was right | 71 here · 9 in [[unimplemented]] · 7 in [[unverified]] |
| `RESOLVED-REJECTED` | **1** | the alleged artefact never existed, so no doc edit was warranted | `A‑11`, in [[unimplemented]] |
| `DEFERRED` | **16** | real, or correct as labelled, and **owner-parked** rather than closed | 4 here · 6 in [[unverified]] · 6 in [[code-vs-code]] |
| `OPEN` | **2** | still undecidable from the tree, and no probe was authorised | `Q‑5`, `P‑6`, both in [[unverified]] |
| `RESOLVED-CODE` | **0** | closed by changing source — **none**, by owner decision | — |
| **Total triaged** | **106** | | |

**How the ledger divides by note.** This note holds **75** rows: 71 `RESOLVED-DOC` (moved to
[[code-vs-docs#Resolved]] at the foot, each with its fixing SHA), **4** `DEFERRED` (kept in place —
`G‑1`, `G‑2`, `G‑3` under `docs/08-guides` and `R‑16` under `docs/09-plans`), and **0** `OPEN`. So the
stale `STALE`/`FALSE` count of **80** this note opened with is a *pre-fix* census, not a queue length;
`## Totals` keeps it as the record of what the audits found.

**What the four `DEFERRED` rows in this note actually are** — the distinction matters, because
"deferred" here is not "we did not get to it":

- **`G‑1`, `G‑2`, `G‑3`** (`analytics-guide.md`: Customer Lifetime Value, automatic segmentation,
  30/90-day and annual retention). Three fabricated capabilities in a `status/live` +
  `audience/tenant-admin` guide, in the same table format as the three metrics that are real. The
  guide's claims were corrected in `0f0c09a`; the **features** the owner deferred on 2026-10-06
  (P3) and are now tracked, with design source and reason, in [[unimplemented#advanced-analytics]].
  The status is `DEFERRED` rather than `RESOLVED-DOC` precisely so the deferred work is not read as
  done: the doc no longer lies, and the metric still does not exist.
- **`R‑16`** (`FINAL_IMPLEMENTATION_PLAN_v3_appendices.md` §9.5, the +3-net calibration). A
  correctly-labelled *dated measurement*; `ae7162b` added a banner pointing at `ARCHITECTURE.md` §7
  and deliberately restated **no figure**, because updating the numbers would destroy the evidence
  the section exists to carry. `DEFER` is the source entry's own `Action`.

**What `OPEN` means here.** Both open rows are in [[unverified]] and neither was promoted to a
finding on the strength of "cannot check it here". `Q‑5` is a Cloudflare-console DNS fact the owner
chose to confirm himself rather than have probed. `P‑6` is four island byte figures against an
unpinned, gitignored `dist/` — `edb07db` removed the figures and stated why they are unverifiable
rather than picking a winner, and the structural half of the claim (four `client:visible` storefront
islands) is kept and re-verified. `O‑7` was the third `UNKNOWN` and is now **closed**: five
owner-approved GETs (`e731b11`) returned `200` on all five hosts, and the only imprecision was the
`RUNBOOK.md` §5 heading's "200/400-guard" phrasing, tightened in `b06990c` because `GET /api/me` is
public *by design* (`backend/src/index.js:616-617`). It is recorded as `RESOLVED-DOC`, **not** as a
defect.

**One residue the doc pass could not close, and did not pretend to.** `O‑21`'s M21 half claimed "20
unsafe `DROP TABLE` in 11 migrations", all eleven of which live in the excluded `legacy/` lineage.
The doc is corrected (`b06990c`), but the *applied* lineage's own residue is a **code** finding, and
this folder is not where code findings go. It is filed as six rows in [[code-vs-code]] — verified
`file:line` by `file:line`, `Severity` **P2**, `Action` `FIX-CODE`, deferred to **Wave 9** — together
with the code-side observation that the test which claims to police this
(`tests/core/migration-integrity.test.js:80`) greps raw file text and therefore counts SQL `--`
comments, so its `:90` assertion cannot pass as written. That finding is **recorded, not edited**.

## The three worst things in this note

1. **Entry #1**, below — three docs, three different migration counts, two of them issuing
   instructions computed from the wrong one.
2. **`S‑2` + `S‑3` + `S‑4`** — `API_SURFACE_MAP.md`'s Frontend Function, React Hook and DB Tables
   columns name **64 + 120 + 13** things that exist nowhere, sitting beside an Endpoint column where
   all 268 rows resolve (`S‑11`). The table is authoritative about the wire and invented about the
   code that calls it.
3. **`T‑5` + `T‑6`** — `TESTING.md`'s admin/POS tab-ID table is missing **28 of 46** admin IDs and
   **2 of 6** POS IDs, 12 of which E2E specs actually select on, and `04-testing/README.md` nominates
   that table as the only place in the repo carrying them.

*All three are now closed — see [[code-vs-docs#Resolved]] for the fixing commit on each.*

1. **Entry #1**, below — three docs, three different migration counts, two of them issuing
   instructions computed from the wrong one.
2. **`S‑2` + `S‑3` + `S‑4`** — `API_SURFACE_MAP.md`'s Frontend Function, React Hook and DB Tables
   columns name **64 + 120 + 13** things that exist nowhere, sitting beside an Endpoint column where
   all 268 rows resolve (`S‑11`). The table is authoritative about the wire and invented about the
   code that calls it.
3. **`T‑5` + `T‑6`** — `TESTING.md`'s admin/POS tab-ID table is missing **28 of 46** admin IDs and
   **2 of 6** POS IDs, 12 of which E2E specs actually select on, and `04-testing/README.md` nominates
   that table as the only place in the repo carrying them.

## Totals

Two source audits, consolidated here on 2026-10-06. Neither source was edited; every entry below is
copied from them verbatim, so no code citation was lost in consolidation.

| Class | Audit A · arch / api / frontend | Audit B · data / sec / test / ops / guides / plans / import | Combined |
| --- | --- | --- | --- |
| `MATCHED` — the claim is true of the code | 51 | 77 | **128** |
| `STALE` — was true, has drifted | 15 | 31 | **46** |
| `FALSE` — not true, and never was | 13 | 16 | **29** |
| `UNVERIFIED` — not checkable from the tree | 11 | 7 | **18** |
| `UNDOCUMENTED` — real code, no claim anywhere | 4 | 3 | **7** |
| **Total entries** | **94** | **134** | **228** |

| Severity | Audit A | Audit B | Combined |
| --- | --- | --- | --- |
| P0 | 0 | 0 | **0** |
| P1 | 4 | 4 | **8** |
| P2 | 22 | 20 | **42** |
| P3 | 68 | 110 | **178** |

Audit A = `docs/01-architecture` + `docs/02-api` + `docs/03-frontend` (9 files, 1,647 lines), baseline
`dee3124`, report `.opencode/audits/gaps-arch-api-frontend-2026-10-06.md`.
Audit B = `docs/07-data` + `docs/06-security` + `docs/04-testing` + `docs/05-operations` + `docs/08-guides`
+ `docs/09-plans` + `docs/10-tenant-import` (25 files, 4,338 lines), baseline `ddc63c6`, report
`.opencode/audits/gaps-data-sec-test-ops-2026-10-06.md`.

**Where the counts are filed.** `STALE` + `FALSE` = **80 entries**, in this note.
`UNVERIFIED` = **15 entries** in [[unverified]]. `UNDOCUMENTED` = **10 entries** in [[unimplemented]],
plus **F‑4** which is filed here because its dominant class is `STALE` and its `UNDOCUMENTED` line
travels with it. The remaining **112 `MATCHED` entries** are the *controls* the gap findings rest on —
they are reproduced at the foot of this note, in compact form, because a finding that quotes
"**A‑1**" or "**S‑7**" is only auditable if the entry it quotes is readable here too.

**Recount — and the three places the source totals disagree with their own entries.**

The source class tables above are the audits' own figures and are reproduced unchanged. Recounting
from the entry headings gives **218** entries, not 228, and the gap is worth recording because it is
itself an instance of the defect this folder exists to catch:

- Audit A's class table sums to 94 while its own by-doc breakdown and its entry headings both come to
  **83** (`ARCHITECTURE.md` 26 · `QUICK_START.md` 7 · `01-architecture/README.md` 1 · `API_CONTRACT.md` 11
  · `API_SURFACE_MAP.md` 11 · `02-api/README.md` 2 · `COMPONENT_CATALOG.md` 8 · `PERF_BASELINE.md` 14
  · `03-frontend/README.md` 3).
- Audit B has **135** entry headings against a reported 134 — the extra one is `T‑0`, the test-count
  provenance table, which carries no class.
- Neither audit counted the gap markers **nested inside a `MATCHED` entry**. Counting them as this
  consolidation does yields **13 `UNVERIFIED` items** (8 in audit A, 7 in audit B) and **10
  `UNDOCUMENTED` items** (5 in audit A, 5 in audit B), against the reported 11 / 7 and 4 / 3.
- Severity is reported per audit as audited; the per-entry `**Severity**` line below is the source
  entry's own figure, and where an entry carries two severities (a gap plus a `P3` nit) both are kept.

*As of the audits, 2026-10-06:* nothing was fixed. Both were explicitly read-only — no doc edited, no
source edited, no test suite re-run, no `wrangler`, no deploy, no remote call. **The fixes came later
and are recorded in `## Status as of 2026-10-06`; the census below is the audits', unchanged.**

## How to read an entry

Every entry carries the same six fields, in this order:

| Field | What it is |
|---|---|
| **Source** | the doc, by vault path, plus the section the claim lives in |
| **Claim** | the doc's own words, verbatim — including the number, the instruction or the negative claim being audited |
| **Expected** | what the claim asserts the code to be |
| **Actual** | what the code is, with `file:line` for every measurement |
| **Severity** | P0 / P1 / P2 / P3 |
| **Action** | `UPDATE-DOC`, `VERIFY-RUNTIME`, `DEFER`, or `none` |

`Origin` is this consolidation's line: which audit the entry came from, the baseline commit it was
checked against, and the source file. `Class` is the source audit's classification, kept verbatim
because a few entries carry **two** classes — a correct claim and a false one in the same line, or a
`MATCHED` body with an `UNDOCUMENTED` item appended. In those entries the second class is named in
the text and the entry is filed under the more consequential one.

**Severity** — `P1` means a reader acting on the doc breaks something (an instruction naming a taken
slot, a table an agent or a spec depends on) or is materially misled about a security-relevant
surface; `P2` a wrong number, path or capability in a doc a reader uses as a source of truth; `P3` a
stale citation, a count, a line range.

**Action** — `UPDATE-DOC` the doc is wrong and the fix is an edit; `VERIFY-RUNTIME` the claim is
checkable only by running something expensive or contacting something external; `DEFER` the claim is
correct as labelled and should not be "fixed"; `none` nothing to do.

## Test-count provenance (`T‑0`, audit B)

- **Origin** audit B entry `T‑0` — the only entry in either audit that carries **no class**, being a
  provenance table rather than a claim; reproduced here with the source table verbatim and one
  cross-reference paragraph added
- **Source** `docs/98-history/sessions/AGENT_LOGBOOK_HISTORY.md` (the latest committed suite results)
- **Action** none — this is the authority every test-count entry below is measured against

No suite was re-run by either audit. Every test-count claim below is compared against the latest
result committed to `docs/98-history/sessions/AGENT_LOGBOOK_HISTORY.md`:

| Suite | Latest committed result | Logbook source |
| --- | --- | --- |
| `cd backend && npx vitest run` | **127 files / 2743 tests PASS** | `a2-saga-status` (2026-10-02), re-confirmed same day by `a7-workstream-closure` (line 9684) |
| `cd app && npx vitest run` | **155 files / 3632 tests PASS** | `tenant-outage-vs-404` (2026-10-03, line 9695) |
| `npx vitest run --config vitest.integration.config.ts` | **37 files / 255 tests PASS** | `full-gate 23:19 run` (2026-09-09, line 9278); 262-registered corroborated by the 2026-09-06 heading `ROOT INTEGRATION PHASE: GREEN (262/0, 37 files)` (line 9103) |
| `CI=true npx playwright test` | **919 passed / 0 failed / 15 skipped** (per-project, 2026-09-06) | market/tenant/admin/auth/cross-cutting/pos/public/routing breakdown, line 9195 region |

`cd monitor && npx vitest run` → 7 files / 191 tests (`mon-probe-selfcheck`, 2026-10-03) — listed for
completeness; no monitor suite is claimed in these folders' scope.

Every test-count entry in this note (**A‑20**, **Q‑4**, **D‑3**, **T‑1**, **T‑2**, **T‑4**, **T‑7**,
**O‑18**, **R‑14**) is measured against this table, and `ARCHITECTURE.md` §7 is the only place in the
vault that carries the same figures with their producing commits — which is exactly why its drift is
visible rather than authoritative (**A‑20**).

---

# Entries by folder

**What is left here is what is still open.** Every `STALE`/`FALSE` finding whose carrier doc
was corrected in the 2026-10-06 reconciliation has moved to [[code-vs-docs#Resolved]] at the
foot of this note, each with the commit that fixed it — see `## Status as of 2026-10-06`
immediately above. What remains under each folder is:

- the **`DEFERRED`** rows (`G‑1`, `G‑2`, `G‑3` in `docs/08-guides`, `R‑16` in `docs/09-plans`)
  — claims that were *corrected as documentation* and whose underlying feature or measurement
  the owner parked, so the entry is closed as a defect but not as a question;
- the seven **`MATCHED`-only** bodies that sit at the end of a folder block because they are
  controls for another entry rather than findings in their own right (`A‑6`, `A‑13`, `S‑7`,
  `P‑4`, `P‑10`, `O‑25`, `N‑19`). These carry no action and are never triaged.

The `STALE`/`FALSE` class total this note opened with — **80 entries** — was the *pre-fix*
figure. It is not restated here, because every row of it is now either below in this
section or at the foot; `## Totals` keeps the original census as the record of what the
audits found.

## docs/01-architecture

<!-- 2 entries still in this folder: A‑6 · A‑13 -->

### A‑6 · [[ARCHITECTURE]] §5a — monitor targets

- **Origin** audit A entry `A‑6` · baseline `dee3124` · source `docs/01-architecture/ARCHITECTURE.md`
- **Source** `docs/01-architecture/ARCHITECTURE.md` — the section named in the heading above
- **Claim** "Targets | 5 public URLs, listed **in code** (`monitor/src/targets.js`), not in the DB.
  **No self-check target**: a Worker fetching a Worker through the same zone is answered with 522 …"
- **Expected** five targets; no self-check; the reasoning recorded in the source.
- **Actual** `monitor/src/targets.js:16-20` — `marketplace`, `api-public`, `acacia`, `michaelshouse`,
  `api-meals`, all `expect: 200`, `timeoutMs: 10000`. The removal note occupies lines 21–46 and states
  the 522 argument exactly as documented.
- **Class** MATCHED (content) with a line-range nit: the cited `monitor/src/targets.js:15-41` ends
- **Severity** P3 · **Action** UPDATE-DOC
  inside the comment block; the `TARGETS` array is lines **15–47**. · **Severity** P3 · **Action** UPDATE-DOC

### A‑13 · [[ARCHITECTURE]] §3 — no i18n

- **Origin** audit A entry `A‑13` · baseline `dee3124` · source `docs/01-architecture/ARCHITECTURE.md`
- **Source** `docs/01-architecture/ARCHITECTURE.md` — the section named in the heading above
- **Claim** "there is NO i18n system — the frontend is hard-coded English LTR (deliberate decision;
  see `DEVELOPER_ROADMAP.md`)"
- **Expected** no i18n directory; the roadmap file exists somewhere in the vault.
- **Actual** `ls app/src/i18n` → No such file or directory. `docs/09-plans/DEVELOPER_ROADMAP.md` exists.
- **Class** MATCHED (the vault-relative reference resolves; the bare filename is stale after the
- **Severity** P3 · **Action** UPDATE-DOC
  restructure) · **Severity** P3 · **Action** UPDATE-DOC

## docs/02-api

<!-- 1 entry still in this folder: S‑7 -->

### S‑7 · [[API_SURFACE_MAP]] — POS route table

- **Origin** audit A entry `S‑7` · baseline `dee3124` · source `docs/02-api/API_SURFACE_MAP.md`
- **Source** `docs/02-api/API_SURFACE_MAP.md` — the section named in the heading above
- **Claim** `/pos/auth/login`, `/pos/auth/refresh`, `/pos/products` GET, `/pos/orders` POST/GET,
  `/pos/orders/:id`, `/pos/dashboard`, `/pos/shifts/{active,open,close}`, all against `pos_*` tables with
  POS auth; orders "idempotent, with stock deduction + promo engine"; list is "paginated, `?raw=1` for
  legacy array".
- **Expected** all twelve routes.
- **Actual** All twelve registered in `backend/src/routes/pos/index.js`: `:278` POST `/auth/login`,
  `:305` POST `/auth/refresh`, `:402` GET `/products`, `:426` POST `/orders`, `:1032` GET `/orders`,
  `:1064` GET `/orders/:id`, `:1098` GET `/dashboard`, `:1212` GET `/shifts/active`, `:1238` POST
  `/shifts/open`, `:1277` POST `/shifts/close`. `?raw=1` confirmed at `:1040`
  (`url.searchParams.get('raw') === '1'`).
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none / UPDATE-DOC · **Severity** P3
- **Line-range nit** the code-reference `backend/src/routes/pos/index.js:127-248` does not contain any of
  these routes (they begin at `:278`). · **Action** UPDATE-DOC · **Severity** P3

## docs/03-frontend

<!-- 2 entries still in this folder: P‑4 · P‑10 -->

### P‑4 · [[PERF_BASELINE]] — the 2026-10-02 bundle snapshot · **verifiable, and verified**

- **Origin** audit A entry `P‑4` · baseline `dee3124` · source `docs/03-frontend/PERF_BASELINE.md`
- **Source** `docs/03-frontend/PERF_BASELINE.md` — the section named in the heading above
- **Claim** "## Historical snapshot 2026-10-02 (HEAD `921e871`, `ANALYZE=1`) … JS chunks **113** · Total JS
  (minified) **2168.8 KiB** (2,229,607 B raw / **582,829 B gzip**) · CSS 2 files, 106.8 KiB · Largest chunk
  **503.7 KiB** — `_astro/transformers.web.*.js` · Largest chunk, gzip 146,499 B" and the top-10 table
  (503.7 / 344.3 / 194.9 / 176.4 / 37.2 / 34.3 / 31.5 / 31.3 / 28.6 / 23.7).
- **Expected** the committed `app/dist/client/_astro/` to match, since the build output is in the tree.
- **Actual** Measured directly from `app/dist/client/_astro/`: **113** `.js` files; summed on-disk size
  **2,229,607 B** — **byte-exact**; largest chunk `transformers.web.D7wza9ne.js` at **503.7 KiB**;
  `RechartsLine.CM2YhkQa.js` **344.3 KiB**; `html2canvas.BIYKDK-B.js` **194.9 KiB**;
  `client.D3SnGAPC.js` **176.4 KiB**; `BookingCalendar.B66sQ4i4.js` **37.2 KiB**; **2** `.css` files at
  **106.9 KiB**. Top-5 sizes match the table to 0.1 KiB.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none / UPDATE-DOC.
- **One arithmetic nit (STALE, P3)** the raw figure 2,229,607 B equals **2177.4 KiB**, not the stated
  2168.8 KiB — an 8.6 KiB gap. The doc explains it (`The bundle-size-report plugin prints chunk.code.length
  (post-minify); the visualizer's renderedLength (pre-minify) is ~1.77× larger`), i.e. its KiB total is a
  different measurement from its byte total. Both are honest; stating them without the delta invites a
  reader to compute a contradiction. **Action** UPDATE-DOC.
- **This is the strongest evidence in the audit that the perf doc was measured rather than recalled.**

### P‑10 · [[PERF_BASELINE]] — the reverted `client:visible` experiment

- **Origin** audit A entry `P‑10` · baseline `dee3124` · source `docs/03-frontend/PERF_BASELINE.md`
- **Source** `docs/03-frontend/PERF_BASELINE.md` — the section named in the heading above
- **Claim** "Applied: `BookPage.astro:45` — `ReservationSummary`: `client:load` → `client:visible`;
  `MenuPage.astro:48` — `TenantMenu`: `client:load` → `client:visible` … Reverted (`git checkout --` both
  files, working tree clean). Frontend suite on the reverted tree: **154 files / 3611 tests PASS**." and
  "`client:load` and `client:visible` change *hydration timing*, not chunk emission … Any change of this
  class is structurally incapable of moving a chunk-size metric."
- **Expected** both files currently at `client:load` (the revert landed), and the finding's logic to hold.
- **Actual** **The revert is confirmed in the working tree**: `BookPage.astro:45` and `MenuPage.astro:48`
  are both `client:load`, which is also how `ARCHITECTURE.md` §3 counts them (**A‑8**, **A‑9**). The
  structural claim is independently supported: `app/dist/client/_astro/` has 113 chunks either way, and
  the emitted component chunk is not a function of the directive — `client:*` selects hydration timing.
- **Class** MATCHED (revert state + finding) · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none
- **STALE (P3)** the suite figure "154 files / 3611 tests" was the **baseline**, not the current count —
  the app suite is now **155 / 3632** (**A‑20**). The doc is describing a past run, which is correct for its
  purpose; it should say "baseline" the way the other dated figures do.
- **Credit** keeping a reverted experiment and its null result in the file, so it is not repeated blind,
  is the single most valuable thing in this document.

## docs/04-testing

<!-- every entry in this folder block is now RESOLVED or DEFERRED — see below -->

## docs/05-operations

<!-- 1 entry still in this folder: O‑25 -->

### O‑25 · [[05-operations/README]] / [[RUNBOOK]] — all `code-references` · MATCHED

- **Origin** audit B entry `O‑25` · baseline `ddc63c6` · source `docs/05-operations/RUNBOOK.md + AUDIT_MASTER_FINDINGS.md`
- **Source** `docs/05-operations/RUNBOOK.md + AUDIT_MASTER_FINDINGS.md` — the section named in the heading above
- **Claim** `deploy.sh`, `scripts/check-deploy-parity.sh`, `backend/wrangler.toml`,
  `backend/tests/pos-transactions-schema.test.js`, `backend/tests/pos-insert-positional.test.js`,
  `wrangler.toml`, `app/wrangler.toml`, plus `AUDIT_MASTER_FINDINGS.md`'s ten
  `backend/src/**` line references.
- **Expected** every path to resolve.
- **Actual** **17 / 17 resolve.** The bare `wrangler.toml` in the runbook front matter resolves to a
  root file — ambiguous with the two `app/` and `backend/` ones, which is a naming nit rather than a
  broken link, but worth qualifying given the p4 lesson about ghost references.
- **Class** MATCHED · **Severity** P3 · **Action** UPDATE-DOC (the bare-`wrangler.toml` ambiguity)
- **Severity** P3 · **Action** UPDATE-DOC (the bare-`wrangler.toml` ambiguity)

## docs/06-security

<!-- every entry in this folder block is now RESOLVED or DEFERRED — see below -->

## docs/07-data

<!-- every entry in this folder block is now RESOLVED or DEFERRED — see below -->

## docs/08-guides

<!-- 3 entries still in this folder: G‑1 · G‑2 · G‑3 -->

### G‑1 · [[analytics-guide]] §Customer Metrics — **Customer Lifetime Value (CLV) does not exist** · FALSE · P2

- **Origin** audit B entry `G‑1` · baseline `ddc63c6` · source `docs/08-guides/analytics-guide.md`
- **Source** `docs/08-guides/analytics-guide.md` §"Customer Metrics" → "Key Metrics"
- **Claim** "| **Customer Lifetime Value (CLV)** | Total spend per customer over time |" as one of five
  key metrics.
- **Expected** a CLV field in the customer-metrics response or a panel that computes one.
- **Actual** `GET /api/reports/customer-metrics` (`reports.js:348-415`) returns exactly six keys:
  `days`, `total_customers`, `new_customers`, `repeat_customers`, `avg_order_value`,
  `avg_collected` (`reports.js:404-411`). **There is no `clv`, no `lifetime_*`**. A repo-wide search
  for `\bclv\b|lifetime_value` across `backend/src` and `ReportsPanel.tsx` returns nothing.
- **Class** FALSE · **Severity** **P2** · **Action** UPDATE-DOC
- **Severity** P2 · **Action** UPDATE-DOC

### G‑2 · [[analytics-guide]] §Customer Segments — **no segmentation exists** · FALSE · P2

- **Origin** audit B entry `G‑2` · baseline `ddc63c6` · source `docs/08-guides/analytics-guide.md`
- **Source** `docs/08-guides/analytics-guide.md` — the section named in the heading above
- **Claim** "Customers are automatically segmented by: **Booking Frequency** (one-time, occasional,
  regular) · **Spend Level** (budget, standard, premium) · **Recency** (recent <30d, lapsed 90d+) ·
  **Source** (direct, referral, marketplace)"
- **Expected** a segments computation surfaced by the analytics surface.
- **Actual** No `segments` key in the response (**G‑1**); no segmentation code anywhere
  (`grep -niE "segment" app/src/components/admin/ReportsPanel.tsx` → 0 hits; `backend/src` hits are
  all `camelSegment`/path-segment helpers in `utils/errors.js` and a regex-escape comment in
  `rateLimit.js`, unrelated). Four tiers of automatic segmentation are documented as shipping.
- **Class** FALSE · **Severity** **P2** · **Action** UPDATE-DOC
- **Severity** P2 · **Action** UPDATE-DOC

### G‑3 · [[analytics-guide]] §Retention Analysis — **no retention computation exists** · FALSE · P2

- **Origin** audit B entry `G‑3` · baseline `ddc63c6` · source `docs/08-guides/analytics-guide.md`
- **Source** `docs/08-guides/analytics-guide.md` — the section named in the heading above
- **Claim** "### Retention Analysis — Track how many guests return: **30-day retention** … **90-day
  retention** … **Annual retention** (year-over-year return rate)"
- **Expected** retention metrics computed and exposed.
- **Actual** **Nothing.** No `retention` key in `customer-metrics`; no retention SQL in `reports.js`;
  the only `retention` occurrences in `backend/src` are Durable-Object eviction comments
  (`backend/src/durable/broadcaster.js:20,357`) — SSE subscriber eviction, a different concept that
  greps to the same word.
- **Class** FALSE · **Severity** **P2** · **Action** UPDATE-DOC
- **Severity** P2 · **Action** UPDATE-DOC
- **Severity rationale for G‑1/G‑2/G‑3 as a group** three fabricated analytics capabilities sit in a
  tenant-admin-facing walkthrough, presented in the same table format as the three that are real
  (`Total Customers`, `New Customers`, `Repeat Customers`, all verified present at `reports.js:406-408`).
  There is no visual distinction between the real metrics and the invented ones, and the guide is
  tagged `status/live` with `audience/tenant-admin`. A tenant admin building a retention program
  would be planning against three numbers the API never returns. **This is the single worst content
  defect in the guides folder.**

## docs/09-plans

<!-- 1 entry still in this folder: R‑16 -->

### R‑16 · [[FINAL_IMPLEMENTATION_PLAN_v3_appendices]] §9.5 — the +3-net calibration · MATCHED as a dated record / STALE as a current figure

- **Origin** audit B entry `R‑16` · baseline `ddc63c6` · source `docs/09-plans/FINAL_IMPLEMENTATION_PLAN_v3_appendices.md`
- **Source** `docs/09-plans/FINAL_IMPLEMENTATION_PLAN_v3_appendices.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none
  **Severity** P3 · **Action** none
- **Credit** this section is the model the rest of the vault's test counts should follow: a delta
  claim, its diff evidence, the exact titles, and the run it came from.

## docs/10-tenant-import

<!-- 1 entry still in this folder: N‑19 -->

### N‑19 · All five `10-tenant-import` docs — `code-references` · MATCHED

- **Origin** audit B entry `N‑19` · baseline `ddc63c6` · source `docs/10-tenant-import/ (all five docs)`
- **Source** `docs/10-tenant-import/ (all five docs)` — the section named in the heading above
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
- **Severity** P3 · **Action** none
- **Residual nit (P3)** four line-anchored references now point at the wrong lines in a file that has
  grown: `tenant-import.js:723-726` (**N‑9**), `resolveImage :38–58` (**N‑18**), §2's
  "section 0, :344–411" (**N‑4**). File-level references are all current; line-level ones drift with
  the file. That is the 2026-10-06 p4 lesson's second half — grep a reference *to existence with a
  line range*, and re-grep the range when the file changes.

---

# Matched controls

The 112 `MATCHED` entries the gap findings above quote by ID. Reproduced so a finding that says
"verified in **A‑1**" is auditable from this note alone; compact form — Source, Claim, Actual with
its citations, Class — with the narrative notes dropped. **None of these has an action.** The two
that look like defects are deliberate and correct: **A‑2** (the `0109`/`0125` gaps) and **P‑5** /
**T‑13** / **O‑13** (claims correctly labelled as unreproducible or manual).

## docs/01-architecture

### A‑1 · [[ARCHITECTURE]] §5 — migration lineage  · _control — MATCHED, no action_

- **Origin** audit A entry `A‑1` · baseline `dee3124` · source `docs/01-architecture/ARCHITECTURE.md`
- **Source** `docs/01-architecture/ARCHITECTURE.md` §5 "Database & migrations"
- **Claim (verbatim)** "At `dbcb382` that is **40 top-level `.sql` files**, head
  `0127_meals_tenant_composite_pk.sql`. It is *not* a contiguous range: `0001`–`0014`, then
  `0100`–`0127`."
- **Expected** 40 top-level `.sql` files; highest-numbered is `0127_*`; numbering runs 0001–0014 then
  0100–0127.
- **Actual** `ls backend/migrations/*.sql | wc -l` → **40**. Highest = `0127_meals_tenant_composite_pk.sql`.
  Sequence: `0001…0014 0100…0108 0110…0124 0126 0127` — exactly the two blocks claimed.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### A‑2 · [[ARCHITECTURE]] §5 — the two deliberate gaps  · _control — MATCHED, no action_

- **Origin** audit A entry `A‑2` · baseline `dee3124` · source `docs/01-architecture/ARCHITECTURE.md`
- **Source** `docs/01-architecture/ARCHITECTURE.md` — the section named in the heading above
- **Claim** "`0109` is **reserved-but-absent** … and `0125` was verified free and deliberately skipped
  when the D3 mission took `0126`. A gap in the ledger is normal and is not drift."
- **Expected** `0109*` and `0125*` absent from `backend/migrations/`.
- **Actual** `ls backend/migrations/0109*` → No such file. `ls backend/migrations/0125*` → No such file.
  The reason for `0109` is documented in `0110`'s own header, as claimed.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### A‑3 · [[ARCHITECTURE]] §5 — `legacy/` is out of lineage  · _control — MATCHED, no action_

- **Origin** audit A entry `A‑3` · baseline `dee3124` · source `docs/01-architecture/ARCHITECTURE.md`
- **Source** `docs/01-architecture/ARCHITECTURE.md` — the section named in the heading above
- **Claim** "`legacy/` (99 files, incl. the never-applied `0076_sanitize_user_data.sql`) … are
  **excluded** from the lineage — `scripts/check-deploy-parity.sh` inventories top-level `*.sql` only."
- **Expected** 99 files in `backend/migrations/legacy/`; `0076_sanitize_user_data.sql` among them; the
  parity script globs only the top level.
- **Actual** `ls backend/migrations/legacy/*.sql | wc -l` → **99**. `0076_sanitize_user_data.sql` present
  (`legacy/0076_sanitize_user_data.sql`). `scripts/check-deploy-parity.sh` (148 lines) inventories
  top-level only.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### A‑7 · [[ARCHITECTURE]] §5a — worker identity, cron, deploy exclusion  · _control — MATCHED, no action_

- **Origin** audit A entry `A‑7` · baseline `dee3124` · source `docs/01-architecture/ARCHITECTURE.md`
- **Source** `docs/01-architecture/ARCHITECTURE.md` — the section named in the heading above
- **Claim** "`campmaster-monitor` is a **separate Worker with its own bindings** … Cron `*/5 * * * *`
  … `deploy.sh` does **not** ship it."
- **Expected** name `campmaster-monitor`; `crons = ["*/5 * * * *"]`; no `monitor` reference in `deploy.sh`.
- **Actual** `monitor/wrangler.toml:1` `name = "campmaster-monitor"`; `:11-12`
  `crons = [ "*/5 * * * *" ]`; `grep -n "monitor" deploy.sh` → **zero hits**.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### A‑8 · [[ARCHITECTURE]] §3 — island directive census · **all three numbers correct**  · _control — MATCHED, no action_

- **Origin** audit A entry `A‑8` · baseline `dee3124` · source `docs/01-architecture/ARCHITECTURE.md`
- **Source** `docs/01-architecture/ARCHITECTURE.md` — the section named in the heading above
- **Claim** "re-counted 2026-10-02: **17 directive sites** — 8× `client:only` … 6× `client:visible` …
  3× `client:load` … (A raw `grep client:` over `app/src` reports 23 hits; 6 are code-comment mentions
  inside `Storefront*.tsx` / `PosShell.tsx` / `AdminShell.tsx`, not directives.)"
- **Expected** 17 real directives split 8/6/3; 23 raw grep hits of which 6 are comments.
- **Actual** Raw `grep -rn "client:"` over `app/src` → **23**. Of those, exactly 6 are JSDoc prose:
  `ShopCatalog.tsx:4`, `StorefrontCart.tsx:4`, `StorefrontCheckout.tsx:4`,
  `StorefrontConfirmation.tsx:4`, `PosShell.tsx:10`, `AdminShell.tsx:12`. The remaining **17** are real
  template attributes — `client:only` ×8 (`pages/admin/[...rest]/index.astro:7`,
  `pages/pos/login/index.astro:16`, `pages/pos/[...rest]/index.astro:16`,
  `pages/auth/forgot-password.astro:7`, `pages/auth/reset-password.astro:7`,
  `pages/onboarding.astro:7`, `pages/register/index.astro:7`, `pages/signup.astro:7`),
  `client:visible` ×6 (`components/public/TenantLanding.astro:203`,
  `pages/marketplace.astro:14`, `pages/storefront/index.astro:54`, `pages/storefront/cart.astro:52`,
  `pages/storefront/checkout.astro:53`,
  `pages/storefront/order/[orderNumber]/confirmation.astro:54`), `client:load` ×3
  (`components/public/BookPage.astro:45`, `components/public/MenuPage.astro:48`,
  `layouts/PublicLayout.astro:778`).
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none
- **Why this entry exists** the arithmetic is the kind that invites a false report, so it was checked
  twice. The four storefront *components* carry a comment mentioning `client:visible`; their real
  directives live in the four storefront `.astro` pages. Counting comments as directives would have
  produced 10/10/3 and a spurious finding.

### A‑9 · [[ARCHITECTURE]] §3 — `DebugFeedbackWidget` fix  · _control — MATCHED, no action_

- **Origin** audit A entry `A‑9` · baseline `dee3124` · source `docs/01-architecture/ARCHITECTURE.md`
- **Source** `docs/01-architecture/ARCHITECTURE.md` — the section named in the heading above
- **Claim** "`DebugFeedbackWidget` moved `client:visible` → `client:load` (PublicLayout only …) … This
  is why the split is **6 visible / 3 load** and not 7/2."
- **Expected** a `client:load` on the debug widget inside `PublicLayout.astro` only.
- **Actual** `app/src/layouts/PublicLayout.astro:778` → `client:load`. No `DebugFeedbackWidget` reference
  in `AdminShell`/`PosShell` template bodies.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### A‑10 · [[ARCHITECTURE]] §3 — design-system primitive count  · _control — MATCHED, no action_

- **Origin** audit A entry `A‑10` · baseline `dee3124` · source `docs/01-architecture/ARCHITECTURE.md`
- **Source** `docs/01-architecture/ARCHITECTURE.md` — the section named in the heading above
- **Claim** "**Design system**: 20 primitives in `app/src/components/ui/`"
- **Expected** 20 files.
- **Actual** `ls app/src/components/ui/ | wc -l` → **20**.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none
- **Cross-doc** `COMPONENT_CATALOG.md` §1 says the same 20 and accounts for them (26 rows − 9 with no
  file + 3 undocumented = 20). Internally consistent. Note the repo's `AGENTS.md` still says 26, but
  that file is out of this audit's scope.

### A‑12 · [[ARCHITECTURE]] §3 — image pipeline  · _control — MATCHED, no action_

- **Origin** audit A entry `A‑12` · baseline `dee3124` · source `docs/01-architecture/ARCHITECTURE.md`
- **Source** `docs/01-architecture/ARCHITECTURE.md` — the section named in the heading above
- **Claim** "`astro.config.mjs` uses `sharpImageService()` with
  `image.remotePatterns: [{ protocol: 'https' }]`. `SafeImage.astro` normalizes URLs, runs
  `getImage`, and falls back to a plain `<img>` on any error so pages never 500 on remote fetch
  failure."
- **Expected** both.
- **Actual** `app/astro.config.mjs:1` imports `sharpImageService`; `:46` `service: sharpImageService()`;
  `:47` `remotePatterns: [{ protocol: 'https' }]`. `SafeImage.astro:16` `import { getImage } from
  'astro:assets'`, `:60` `optimized = await getImage({`, `:69` `} catch {`, `:76` plain `<img>`.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### A‑14 · [[ARCHITECTURE]] §3 — AI split  · _control — MATCHED, no action_

- **Origin** audit A entry `A‑14` · baseline `dee3124` · source `docs/01-architecture/ARCHITECTURE.md`
- **Source** `docs/01-architecture/ARCHITECTURE.md` — the section named in the heading above
- **Claim** "deterministic math … stays server-side (D1-backed); model inference … runs client-side …
  (`app/src/lib/browser-ai.ts`, loaded lazily on the AI panel — never in the main bundle).
  `/api/ai/workers-ai/*` and `/api/ai/state/*` remain honest 503 stubs; no `AI`/`STATE_DO` binding
  exists."
- **Expected** all four.
- **Actual** `backend/src/api/ai.js` mounted at `/api/ai`; no `AI` or `STATE_DO` binding in
  `backend/wrangler.toml` (grep over all 149 lines → none). Lazy import at
  `app/src/lib/browser-ai.ts:237` (verified in A‑50).
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### A‑15 · [[ARCHITECTURE]] §4 — frontend role ladder  · _control — MATCHED, no action_

- **Origin** audit A entry `A‑15` · baseline `dee3124` · source `docs/01-architecture/ARCHITECTURE.md`
- **Source** `docs/01-architecture/ARCHITECTURE.md` — the section named in the heading above
- **Claim** "`ROLE_HIERARCHY` in `app/src/lib/rbac.ts` — `super_admin` 100 > `admin` 80 > `manager` 50 >
  `cashier` 30, and `roleAtLeast()` treats any unknown role (including undefined) as failing."
- **Expected** the four ranks and the fail-closed unknown behaviour.
- **Actual** `app/src/lib/rbac.ts:7-12` exactly those four keys; `:20`
  `return (ROLE_HIERARCHY[role ?? ''] ?? 0) >= (ROLE_HIERARCHY[minRole] ?? 0);` — an unknown role maps
  to 0, so it fails any positive minimum.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none
- **Cross-doc** `API_CONTRACT.md` §3 contradicts this. See entry **C‑3**.

### A‑17 · [[ARCHITECTURE]] §4 — CORS is an async allowlist  · _control — MATCHED, no action_

- **Origin** audit A entry `A‑17` · baseline `dee3124` · source `docs/01-architecture/ARCHITECTURE.md`
- **Source** `docs/01-architecture/ARCHITECTURE.md` — the section named in the heading above
- **Claim** "CORS is an **async** origin allowlist, not an array — wildcard regexes plus a 5-minute-cached
  tenant custom-domain lookup (`backend/src/index.js:123–141`)."
- **Expected** `origin` as a function, with a cached custom-domain lookup.
- **Actual** `backend/src/index.js:123` `app.use('*', cors({`; `:125` `origin: async (origin, _c) => {`;
  `:128` wildcard regex loop; `:130` `EXACT_ORIGINS.includes(origin)`; `:132-136`
  `getAllowedCustomDomains(_c.env)` behind a 5-min cache (`_customDomainCache`, see the helper ending
  at `:121`); `:138` `return null`. The cited range is exact.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### A‑19 · [[ARCHITECTURE]] §1 — `pos_users` schema rules  · _control — MATCHED, no action_

- **Origin** audit A entry `A‑19` · baseline `dee3124` · source `docs/01-architecture/ARCHITECTURE.md`
- **Source** `docs/01-architecture/ARCHITECTURE.md` — the section named in the heading above
- **Claim** "`pos_users.name` is a **generated column** (`first_name || ' ' || last_name`): INSERT with
  `first_name`/`last_name` only." and "`pos_users.organization_id` is `INTEGER NOT NULL` — every INSERT
  must include it."
- **Expected** both in the current lineage head.
- **Actual** `backend/migrations/0126_tenant_scoped_unique_sku_email.sql:224` (the latest `pos_users`
  rebuild) carries `name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED`;
  `:…` `organization_id INTEGER NOT NULL DEFAULT 1` (also `0004_pos.sql:36`).
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### A‑22 · [[ARCHITECTURE]] §7 — root-integration caveat  · _control — MATCHED, no action_

- **Origin** audit A entry `A‑22` · baseline `dee3124` · source `docs/01-architecture/ARCHITECTURE.md`
- **Source** `docs/01-architecture/ARCHITECTURE.md` — the section named in the heading above
- **Claim** "`tests/globalSetup.ts` boots `wrangler dev` and never applies migrations, so a fresh
  `.wrangler/state` is a blank DB and the suite 500s on `no such table`."
- **Expected** `playwright.config.ts` style local apply vs `globalSetup.ts` without one.
- **Actual** Consistent and corroborated: `playwright.config.ts:107` *does* apply migrations
  (`wrangler d1 migrations apply campmaster-db --local && npx wrangler dev`), while `tests/globalSetup.ts`
  is the root-integration path the doc names. Not re-run (pre-existing, out of scope).
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### A‑23 · [[ARCHITECTURE]] §5 — KV / R2 / SSE bindings  · _control — MATCHED, no action_

- **Origin** audit A entry `A‑23` · baseline `dee3124` · source `docs/01-architecture/ARCHITECTURE.md`
- **Source** `docs/01-architecture/ARCHITECTURE.md` — the section named in the heading above
- **Claim** "KV holds **only** rate-limit state (`RATE_LIMIT_KV`); `KV_CACHE` is bound but never written …
  R2 (`MEDIA_BUCKET` = `campmaster-media`) holds uploads … SSE is broadcast through the `BROADCASTER`
  Durable Object."
- **Expected** all four.
- **Actual** `backend/wrangler.toml`: `:21` `binding = "KV_CACHE"`, `:25` `binding = "RATE_LIMIT_KV"`,
  `:33-34` `binding = "MEDIA_BUCKET"` / `bucket_name = "campmaster-media"`, `:38-39` `name = "BROADCASTER"`.
  `KV_CACHE` is **only ever read** — `grep -rn "KV_CACHE.put" backend/src` → **0 hits**; the three uses
  are `admin-health.js:31,36` and `index.js:180,181,184`, all `.get`/existence checks.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none
- **Cross-doc** `[env.staging]` names the staging R2 bucket `campmaster-media-staging`
  (`backend/wrangler.toml:140`); the doc quotes the production name only. Acceptable shorthand.

### A‑24 · [[ARCHITECTURE]] §6 — deploy  · _control — MATCHED, no action_

- **Origin** audit A entry `A‑24` · baseline `dee3124` · source `docs/01-architecture/ARCHITECTURE.md`
- **Source** `docs/01-architecture/ARCHITECTURE.md` — the section named in the heading above
- **Claim** "`./deploy.sh` — deploys the backend Worker + D1 migrations, then builds/deploys the frontend
  to Cloudflare Workers … `./deploy.sh --staging` — same flow against the staging environment (validates
  `[env.staging]` … first)."
- **Expected** migrations then worker then frontend; a staging mode.
- **Actual** `deploy.sh:375-376` "Applying database migrations…" → `echo y | npx wrangler d1 migrations
  apply $D1_NAME --remote $ENV_FLAG`; `:379` `npx wrangler deploy --minify $ENV_FLAG`;
  `:39-40` `if [ "$MODE" = "--staging" ]; then DEPLOY_ENV="staging"`. `[env.staging]` exists at
  `backend/wrangler.toml:92`.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### A‑25 · [[ARCHITECTURE]] §2 — zone model  · _control — MATCHED, no action_

- **Origin** audit A entry `A‑25` · baseline `dee3124` · source `docs/01-architecture/ARCHITECTURE.md`
- **Source** `docs/01-architecture/ARCHITECTURE.md` — the section named in the heading above
- **Claim** (full table + bullet) system prefixes never forbidden; `/camps /camp /camp/*` marketplace-only;
  `/pos /pos/* /menu /book /rooms /storefront /storefront/*` tenant-only; forbidden → branded 404 via
  `ZoneGuard`; exact-path matching so `/bookings` is not forbidden.
- **Expected** all of it, read off `app/src/lib/routeZones.ts`.
- **Actual** `routeZones.ts:25-36` `SYSTEM_PREFIXES` = exactly the ten listed, in the documented order.
  `:55` `if (pathname === '/camps' || pathname === '/camp' || pathname.startsWith('/camp/')) return zone !==
  'marketplace'`. `:58` `/pos` + `startsWith('/pos/')` → tenant-only. `:61` `/menu` `/book` `/rooms` →
  tenant-only. `:64` `/storefront` + `startsWith('/storefront/')` → tenant-only. `:48` `resolveZone(_url,
  tenantId)` returns `'marketplace'` for empty id. Exact-path matching holds: `/bookings` matches none of
  the branches.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none
- **Note** `ARCHITECTURE.md` §2 correctly lists `/storefront`; the repo's `AGENTS.md` zone bullet omits it.
  Out of scope, but it is why the in-scope doc is the correct one.

### Q‑1 · §1/§3 — local run commands and ports  · _control — MATCHED, no action_

- **Origin** audit A entry `Q‑1` · baseline `dee3124` · source `docs/01-architecture/QUICK_START.md`
- **Source** `docs/01-architecture/QUICK_START.md` — the section named in the heading above
- **Claim** "Backend API (Hono on Workers, port 8787) … Frontend (Astro, port 4321 — Astro default) …
  Playwright's E2E webServer boots its own Astro instance on `:4320`".
- **Expected** 8787 / 4321 / 4320.
- **Actual** `playwright.config.ts:4` `const UNIFIED_PORT = 4320`; `:108` `port: BACKEND_PORT`;
  `:116-117` `command: 'cd app && npx astro dev --port 4320 --host'`, `port: UNIFIED_PORT`. 4321 is the
  Astro default and is what `app/package.json`'s `lighthouse` script targets
  (`http://localhost:4321 --budget-path=budget.json`).
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### Q‑2 · §2 — required env  · _control — MATCHED, no action_

- **Origin** audit A entry `Q‑2` · baseline `dee3124` · source `docs/01-architecture/QUICK_START.md`
- **Source** `docs/01-architecture/QUICK_START.md` — the section named in the heading above
- **Claim** "`JWT_SECRET` … **Yes** — no fallback; auth throws immediately if unset";
  "`RATE_LIMIT_KV_ENABLED` | `backend/wrangler.toml` `[vars]` | Keep `"false"`".
- **Expected** both.
- **Actual** `backend/wrangler.toml:56` `RATE_LIMIT_KV_ENABLED = "false"` in `[vars]` (and `:97` in
  `[env.staging.vars]`). `requireAuth.js` takes `env.JWT_SECRET` with no default and `verifyToken`
  fails without it; `AGENT_LOGBOOK.md` records `getJwtSecret()` throwing.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### Q‑3 · §5/§7 — build, lighthouse, codegen scripts  · _control — MATCHED, no action_

- **Origin** audit A entry `Q‑3` · baseline `dee3124` · source `docs/01-architecture/QUICK_START.md`
- **Source** `docs/01-architecture/QUICK_START.md` — the section named in the heading above
- **Claim** "`cd app && npm run build && npm run preview` … `cd app && npm run lighthouse` # audits
  http://localhost:4321 against budget.json"; "`cd backend && npm run gen:openapi` … `cd app && npm run
  gen:types`".
- **Expected** four scripts.
- **Actual** `app/package.json` `lighthouse`: `npx --yes lighthouse http://localhost:4321
  --budget-path=budget.json --only-categories=performance,accessibility,best-practices,seo …`.
  `gen:types`: `openapi-typescript ../backend/openapi.json -o src/lib/api-types.ts`.
  `backend/package.json` `gen:openapi`: `vite-node scripts/generate-openapi.js`
  (`backend/scripts/generate-openapi.js`, 14 lines).
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### Q‑7 · §3 — zone behaviour of localhost  · _control — MATCHED, no action_

- **Origin** audit A entry `Q‑7` · baseline `dee3124` · source `docs/01-architecture/QUICK_START.md`
- **Source** `docs/01-architecture/QUICK_START.md` — the section named in the heading above
- **Claim** "`localhost:4321` is the marketplace zone by default … `app/src/lib/routeZones.ts` is the
  single source of truth."
- **Expected** an empty tenant id resolving to marketplace.
- **Actual** `routeZones.ts:48` `resolveZone` returns `'marketplace'` when `tenantId` is falsy; the
  JSDoc at `:42-47` states exactly the localhost-without-`?tenant=` case.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### R‑1 · [[01-architecture/README]] — index concepts  · _control — MATCHED, no action_

- **Origin** audit A entry `R‑1` · baseline `dee3124` · source `docs/01-architecture/README.md`
- **Source** `docs/01-architecture/README.md` §Concepts
- **Claim** four-layer contract; zone model with the marketplace/tenant split and `ZoneGuard`; tenant
  isolation enforced twice; the KV free-plan trap; `monitor/` as a separate Worker; `deploy.sh` as the
  single deploy path.
- **Expected** each concept true.
- **Actual** All six verified against the sources cited in **A‑4**, **A‑16**, **A‑24**, **A‑25**. The
  monitor bullet says "its own storage" rather than naming D1, which is why it survives the A‑4 failure.
  Code-reference `deploy.sh:376-380` lands on the migrations-apply/deploy pair.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

## docs/02-api

### C‑4 · [[API_CONTRACT]] §3 — token worlds, JWT secret  · _control — MATCHED, no action_

- **Origin** audit A entry `C‑4` · baseline `dee3124` · source `docs/02-api/API_CONTRACT.md`
- **Source** `docs/02-api/API_CONTRACT.md` — the section named in the heading above
- **Claim** Two token worlds (admin JWT, POS `pos_token`), both via `Authorization: Bearer`; "`env.JWT_SECRET`
  has **no fallback** — the Worker throws immediately if unset."
- **Expected** both.
- **Actual** `backend/src/middleware/sharedAuth.js:15` `algorithm: 'HS256'`; POS realm is enforced by
  `requireAuth`'s `realm` option (`requireAuth.js:139` `realm = 'admin'`, and POS routes mounted under
  `/api/pos` at `index.js:339`). No fallback secret anywhere in the sign/verify path.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### C‑5 · [[API_CONTRACT]] §4 — response envelope + cache headers  · _control — MATCHED, no action_

- **Origin** audit A entry `C‑5` · baseline `dee3124` · source `docs/02-api/API_CONTRACT.md`
- **Source** `docs/02-api/API_CONTRACT.md` — the section named in the heading above
- **Claim** Success = camelCased JSON via `toCamel`; errors `{ success: false, error, errors? }` with
  `errors` appended only when present; "Public reads are cached at the HTTP layer: `Cache-Control: public,
  max-age=300, stale-while-revalidate=600` (availability checks use 60s). This is header-level only — **no
  KV caching**."
- **Expected** all four.
- **Actual** `response.js:64` `cachedJsonResponse(data, maxAge = 300, status = 200)`; `:71`
  `` `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 2}` `` → default 300/600 exactly.
  `:87-88` `errorResponse(message, status = 500, errors = undefined)` →
  `jsonResponse({ success: false, error: message, ...(errors ? { errors } : {}) }, status)` — matches the
  documented envelope including the conditional `errors`. Availability's 60s is real:
  `backend/src/api/orders.js:1709` and `:1714` both `cachedJsonResponse({…}, 60)`. Zero KV writes (A‑23).
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### C‑6 · [[API_CONTRACT]] §6 — contract rules  · _control — MATCHED, no action_

- **Origin** audit A entry `C‑6` · baseline `dee3124` · source `docs/02-api/API_CONTRACT.md`
- **Source** `docs/02-api/API_CONTRACT.md` — the section named in the heading above
- **Claim** (1) snake_case in requests / camelCase in responses, `toSnake` for incoming; (2) helpers add
  nosniff, X-Frame-Options DENY, HSTS, Referrer-Policy, Permissions-Policy, CSP; (3) never set CORS in
  helpers; (4) public endpoints cache-safe; (5) components render user data through `escHtml()`.
- **Expected** all five enforceable or stated.
- **Actual** (2) `response.js:45-52` sets all six; `cachedJsonResponse` at `:69-76` sets the same six.
  (3) `response.js:39-40` carries the explicit comment *"NOTE: CORS headers are handled by hono/cors in
  index.js. Do NOT duplicate them here."* (1) `toSnake` at `response.js:27`, applied at 28 documented
  Zod parse sites. (5) `app/src/lib/utils.ts:3` `export function escHtml` — but only **3** files under
  `app/src/components/` reference `escHtml`; the rule is stated as a contract, not a measured property,
  which is the right framing for it.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### C‑8 · [[API_CONTRACT]] §5 — key endpoint groups  · _control — MATCHED, no action_

- **Origin** audit A entry `C‑8` · baseline `dee3124` · source `docs/02-api/API_CONTRACT.md`
- **Source** `docs/02-api/API_CONTRACT.md` — the section named in the heading above
- **Claim** Auth `/api/auth/*`; Camps `/api/camps*`; Tenants `/api/tenant/*`, `/api/tenants*`;
  Categories/Meals; Orders `/api/orders*`, `/api/availability*`; Admin `/api/admin/*`; POS `/api/pos/*`;
  System.
- **Expected** each base path mounted.
- **Actual** All present. `index.js:255-257` `/api/tenants`, `:211` `/api/auth/pos-login`, `:339`
  `app.route('/api/pos', posRoutes)`, `:323` `app.route('/api/tenant/billing', …)`; `campsRoutes` mounted
  for `/api/projects` with `registerCampsAlias` at `:642` (`camps-alias.js:38` defines it).
  Note `/api/camps*` is a **sunset alias**, which `API_SURFACE_MAP.md` states and this table does not —
  see **S‑1**.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### C‑10 · [[API_CONTRACT]] §5 note on POS login  · _control — MATCHED, no action_

- **Origin** audit A entry `C‑10` · baseline `dee3124` · source `docs/02-api/API_CONTRACT.md`
- **Source** `docs/02-api/API_CONTRACT.md` — the section named in the heading above
- **Claim** (map) "`/auth/pos-login` | POST | `posLogin(identifier, password)` | `pos_users` | POS cashier
  login via admin host"
- **Expected** `posLogin` exported from `api.ts`, backend route present.
- **Actual** `backend/src/index.js:211` `app.post('/api/auth/pos-login', (c) => handlePosLoginRequest(c.req.raw,
  c.env));` ✓ and `posLogin` is exported from `api.ts` ✓ (present in the 286).
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### S‑1 · [[API_SURFACE_MAP]] — Camps section: canonical mount and the sunset alias  · _control — MATCHED, no action_

- **Origin** audit A entry `S‑1` · baseline `dee3124` · source `docs/02-api/API_SURFACE_MAP.md`
- **Source** `docs/02-api/API_SURFACE_MAP.md` — the section named in the heading above
- **Claim** "Canonical mount is `/api/projects` (`campsRoutes`, index.js); `/api/camps` is a sunset alias
  (`registerCampsAlias`). There is no `camps` table — the table is `projects` (0001_core.sql);
  camp↔product links live in `product_camps` (0003_products.sql). No `/:id/products` sub-routes exist at
  runtime (dropped)."
- **Expected** all four.
- **Actual** `index.js:642` `registerCampsAlias(app, { scope: catalogScope, limiter: tenantAwareLimiter });`
  with `camps-alias.js:38` defining it — the alias mechanism is exactly as described. `camps` is absent
  from the current lineage (`backend/migrations/0003_products.sql:22` creates `product_camps`, and the only
  `CREATE TABLE camps` is `backend/migrations/legacy/0001_init.sql:20`, i.e. excluded). `grep -rE
  "projects/:[a-zA-Z]+/products|/:id/products" backend/src` → **0 hits**, so the sub-routes are indeed gone.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### S‑8 · [[API_SURFACE_MAP]] — POS tables, barcode, POS users  · _control — MATCHED, no action_

- **Origin** audit A entry `S‑8` · baseline `dee3124` · source `docs/02-api/API_SURFACE_MAP.md`
- **Source** `docs/02-api/API_SURFACE_MAP.md` — the section named in the heading above
- **Claim** `/pos-tables` GET/POST, `/:id` PUT/DELETE, `/:id/status` PATCH, `/:id/reserve` PATCH,
  `/:id/release` PATCH; `/pos/products/barcode/:code` GET; `/pos-users` GET/POST, `/:id` PATCH/DELETE,
  `/:id/reset-password` POST with `super_admin`/`admin` gate.
- **Expected** all fourteen.
- **Actual** `backend/src/api/pos-tables.js`, `pos-barcode.js`, `pos-users.js` all exist and are mounted
  (`index.js:342` `app.route('/api/pos/products/barcode', posBarcodeRoutes)`); the gate is
  `pos-users.js:100` `roles: ['super_admin', 'admin']` — matching the documented role pair exactly.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### S‑9 · [[API_SURFACE_MAP]] — retired payments  · _control — MATCHED, no action_

- **Origin** audit A entry `S‑9` · baseline `dee3124` · source `docs/02-api/API_SURFACE_MAP.md`
- **Source** `docs/02-api/API_SURFACE_MAP.md` — the section named in the heading above
- **Claim** "> RETIRED: `POST /api/payments/webhook` now replies 501 … Real callbacks go to
  `POST /api/public/paymob/webhook` (HMAC-verified). `create-intent`/`confirm` no longer exist." and
  "`handleStripeWebhook` — RETIRED, always 501".
- **Expected** both.
- **Actual** `backend/src/api/payments.js:44` `export async function handleStripeWebhook() {` returning
  `:47` `501`; header comment at `:16-17` says it "is kept mounted at POST /api/auth…/payments/webhook (it
  is still advertised in routes/registry.js) but now replies 501". Mounted at `index.js:333`
  `app.post('/api/payments/webhook', …)`. Real callback at `index.js:745`
  `app.post('/api/public/paymob/webhook', …)`, and `paymob-webhook.js:140` "Public HMAC-verified Paymob
  server-to-server callback" with the signature procedure documented at `:145-149`. No `create-intent` or
  `confirm` route exists.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none
- **Credit** an explicit RETIRED banner plus the migration path (`/api/public/paymob/webhook`) is the
  right way to document a removed endpoint. This is the model the other columns in this file should follow.

### S‑11 · [[API_SURFACE_MAP]] — Endpoint column · **all 268 rows real**  · _control — MATCHED, no action_

- **Origin** audit A entry `S‑11` · baseline `dee3124` · source `docs/02-api/API_SURFACE_MAP.md`
- **Source** `docs/02-api/API_SURFACE_MAP.md` — the section named in the heading above
- **Claim** 268 endpoint rows across 28 groups.
- **Expected** each to resolve to a real route.
- **Actual** Every row resolves. Matching each `/api<endpoint>` against (a) `backend/openapi.json`'s 88
  paths, normalised for `:id` ↔ `{id}` and method, and (b) the 55 `app.route()` / `app.get|post|put|patch|delete()`
  mounts in `backend/src/index.js` as a prefix match: **268 / 268 covered**, 0 uncovered. (The 199 rows
  absent from `openapi.json` are all reached by the wildcard dispatcher — see C‑9.) Method mismatches
  against `openapi.json`, where the path does exist: 4, all three of them the S‑5 rows plus
  `PUT /api/meal-schedules/{id}`.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none
- **Why this entry exists** it is the control for S‑2/S‑3/S‑4. One automated pass over the same 268 rows
  cleared the endpoint column and failed the other three, which is what makes those three findings
  credible rather than a sampling artifact.

### X‑1 · [[02-api/README]] — "25 domain groups"  · _control — MATCHED, no action_

- **Origin** audit A entry `X‑1` · baseline `dee3124` · source `docs/02-api/README.md`
- **Source** `docs/02-api/README.md` §Concepts
- **Claim** "**Per-domain map** — `API_SURFACE_MAP.md` walks **25 domain groups**, each as
  endpoint → client function → handler → table → hook."
- **Expected** 25.
- **Actual** `grep -c "^## " docs/02-api/API_SURFACE_MAP.md` → **41** `##` sections. The subset carrying
  the 7-column endpoint→client→handler→table→hook tables is **28** (Camps/Projects through Settings); the
  remaining 13 are POS, upload, payments, onboarding, leads, price-overrides and super-admin blocks that
  use the 6-column variant without a Frontend Function column.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC
- **Severity** P3 · **Action** UPDATE-DOC
- **Note** 25 matches no grouping of the file. The number predates the POS/media/onboarding sections being
  folded in.

### X‑2 · [[02-api/README]] §Concepts — auth-model summary  · _control — MATCHED, no action_

- **Origin** audit A entry `X‑2` · baseline `dee3124` · source `docs/02-api/README.md`
- **Source** `docs/02-api/README.md` — the section named in the heading above
- **Claim** "**Auth model** — JWT (HS256) in `Authorization: Bearer`, tenant scope resolved server-side.
  401 means 'not authenticated', 403 means 'authenticated but not allowed' — the two are not
  interchangeable." and "**Response envelope** — errors are `errorResponse(message, status, errors)`;
  success is plain JSON."
- **Expected** HS256; the 401/403 distinction; the helper signature.
- **Actual** `backend/src/middleware/sharedAuth.js:15` `algorithm: 'HS256'` ✓. `response.js:87`
  `errorResponse(message, status = 500, errors = undefined)` — the documented 3-arg signature ✓. Success
  is plain JSON via `jsonResponse`/`ok`/`created`, with no success wrapper ✓. The 401/403 split matches
  C‑7 exactly.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none
- **Credit** "the two are not interchangeable" plus the "every endpoint answers the same shape so one client
  error path covers the whole surface" framing is the clearest statement of why the envelope exists
  anywhere in the vault.

## docs/03-frontend

### F‑1 · [[COMPONENT_CATALOG]] §1 — the ui/ census arithmetic  · _control — MATCHED, no action_

- **Origin** audit A entry `F‑1` · baseline `dee3124` · source `docs/03-frontend/COMPONENT_CATALOG.md`
- **Source** `docs/03-frontend/COMPONENT_CATALOG.md` — the section named in the heading above
- **Claim** "## 1. UI primitives — `components/ui/` (**20 actual**, 2026-09-21) > Truth 2026-09-21: 20
  files on disk. 9 cataloged entries have no file (Accordion, Checkbox, FormField, Radio, Separator,
  Switch, Tabs, Textarea, Tooltip). 3 present files were undocumented (LineChart, RechartsLine, icons)."
- **Expected** 20 files; the named 9 absent; the named 3 present-but-uncatalogued.
- **Actual** `ls app/src/components/ui/ | wc -l` → **20**. The 20 are: Badge, Button, Card, ConfirmDialog,
  DataTable, EmptyState, ErrorBoundary, FormModal, icons, Input, LineChart, LoadingSpinner, Modal,
  RechartsLine, SafeImage.astro, Select, Skeleton, StatCard, StatusTag, Toast. The table has 26 rows;
  26 − 9 named-absent = 17 present, + 3 named-undocumented = 20. **Every one of the 9 named-absent
  components is genuinely absent** (`test -f` per file → no match), and `LineChart.tsx`,
  `RechartsLine.tsx`, `icons.tsx` are all genuinely present and absent from the 26-row table.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none
- **Credit** this is the single most honest count claim in the three folders: it states the on-disk truth,
  names the nine ghosts, names the three undocumented files, and the arithmetic closes exactly. It is
  also tagged `status/needs-refresh` in front matter, which is correct about §2 and §3 (below) and wrong
  about §1.

### F‑3 · [[COMPONENT_CATALOG]] §2 — "no raw `fetch`, no `window.*` globals"  · _control — MATCHED, no action_

- **Origin** audit A entry `F‑3` · baseline `dee3124` · source `docs/03-frontend/COMPONENT_CATALOG.md`
- **Source** `docs/03-frontend/COMPONENT_CATALOG.md` — the section named in the heading above
- **Claim** "All data flows through **TanStack Query** (`useQueryHooks`/`useAdminData`) — no raw `fetch`,
  no `window.*` globals."
- **Expected** zero raw `fetch` and zero `window.*` data channels under admin.
- **Actual** `grep -rn "fetch(" app/src/components/admin app/src/components/pos` → 9 hits, **all of them
  `refetch()`** from TanStack Query (`InboxPanel.tsx:190,400`, `StaffPanel.tsx:335,372,418`,
  `LowStockPanel.tsx:54`, `pos/views/OrdersView.tsx:25`, `TableView.tsx:250`, `DashboardView.tsx:17`) — no
  network `fetch` at all. All 22 `window.*` occurrences are browser APIs, not channels (enumerated in
  **A‑11**). The T13 migration claim holds.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### F‑6 · [[COMPONENT_CATALOG]] §6 — layouts and pages  · _control — MATCHED, no action_

- **Origin** audit A entry `F‑6` · baseline `dee3124` · source `docs/03-frontend/COMPONENT_CATALOG.md`
- **Source** `docs/03-frontend/COMPONENT_CATALOG.md` — the section named in the heading above
- **Claim** "Layouts: `layouts/PublicLayout.astro`, `AdminLayout.astro`, `POSLayout.astro`. Pages:
  marketplace home (`index.astro`), `/camps`, `/camp/[id]/`, tenant pages, admin SPA host
  (`admin/[...rest]/`), POS SPA host (`pos/[...rest]/`)."
- **Expected** three layouts, the named pages present.
- **Actual** `ls app/src/layouts/` → exactly `AdminLayout.astro`, `POSLayout.astro`,
  `PublicLayout.astro`. `app/src/pages/admin/[...rest]/index.astro` and
  `app/src/pages/pos/[...rest]/index.astro` both exist (and both carry `client:only` at `:7` and `:16`).
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### F‑8 · [[COMPONENT_CATALOG]] §4 — public components + E2E dev-mode note  · _control — MATCHED, no action_

- **Origin** audit A entry `F‑8` · baseline `dee3124` · source `docs/03-frontend/COMPONENT_CATALOG.md`
- **Source** `docs/03-frontend/COMPONENT_CATALOG.md` — the section named in the heading above
- **Claim** "Zone-aware landing/browsing surfaces: `TenantLanding`, `MarketplaceHome`, `CampsSection`,
  `ZoneGuard`, `CampBooking`, `ReservationSummary`, `TenantMenu`, `BookPage`, `MenuPage`,
  `CampDetail`/`CampCard`, contact forms. Tenant pages hang on `load` in dev (logo/favicon → dead
  `localhost:8001`) — E2E uses `waitUntil: 'domcontentloaded'`."
- **Expected** all named files present.
- **Actual** All named components present under `app/src/components/public/` (verified against the
  directory listing while checking the `client:*` census in A‑8 and A‑11). `ZoneGuard.astro` and
  `TenantOutagePage.astro` are both there. The dev-hang note matches the repo's own operational
  guidance in `AGENTS.md`.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### P‑7 · [[PERF_BASELINE]] — the "all heavy vendors are lazy" diagram  · _control — MATCHED, no action_

- **Origin** audit A entry `P‑7` · baseline `dee3124` · source `docs/03-frontend/PERF_BASELINE.md`
- **Source** `docs/03-frontend/PERF_BASELINE.md` — the section named in the heading above
- **Claim** "each big chunk is referenced by exactly one `import()` site: `transformers.web ← await
  import('./transformers.web.*.js') in AIPanel.*` · `RechartsLine ← import('./RechartsLine.*.js') in
  LineChart → SystemHealthPanel` · `html2canvas ← await import('html2canvas') in DebugFeedbackWidget (only
  when a screenshot is taken)`"
- **Expected** all three dynamic edges present in source.
- **Actual** All three confirmed in source. `app/src/lib/browser-ai.ts:237`
  `const { pipeline: createPipeline } = await import('@huggingface/transformers');`;
  `app/src/components/ui/LineChart.tsx:12` `const RechartsLine = lazy(() => import('./RechartsLine'));`;
  `app/src/components/debug/DebugFeedbackWidget.tsx:111` `const mod = await import('html2canvas');`.
  LineChart.tsx also carries an explanatory comment at `:9-11` about the empty-state branch staying
  synchronous.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### P‑9 · [[PERF_BASELINE]] — "All 48 admin/super-admin panels are `React.lazy`"  · _control — MATCHED, no action_

- **Origin** audit A entry `P‑9` · baseline `dee3124` · source `docs/03-frontend/PERF_BASELINE.md`
- **Source** `docs/03-frontend/PERF_BASELINE.md` — the section named in the heading above
- **Claim** "**All 48** admin/super-admin panels are `React.lazy` (`AdminApp.tsx:60-107`), so each is its
  own chunk. The T13 migration did its job."
- **Expected** 48 `React.lazy` calls in that line range.
- **Actual** `sed -n '60,107p' app/src/components/admin/AdminApp.tsx | grep -c "lazy("` → **48**. The whole
  file contains exactly 48 `lazy(` occurrences and 48 distinct
  `lazy(() => import('…'))` targets, so the count is exact and the cited line range is exact.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none / UPDATE-DOC (in F‑2) to reconcile the three numbers explicitly.
- **Cross-doc conflict** 48 ≠ `COMPONENT_CATALOG.md` §2's "25 files" (F‑2) ≠ the 63 files actually on disk.
  The panel count (48) and the file count (63) measure different things — lazy-loaded panels vs all files
  including shells, modals and receipts — so this is a doc-set inconsistency rather than an error here.
  **Action** UPDATE-DOC (in F‑2) to reconcile the three numbers explicitly.

### P‑11 · [[PERF_BASELINE]] — bundle-analyzer substitution  · _control — MATCHED, no action_

- **Origin** audit A entry `P‑11` · baseline `dee3124` · source `docs/03-frontend/PERF_BASELINE.md`
- **Source** `docs/03-frontend/PERF_BASELINE.md` — the section named in the heading above
- **Claim** "the installed `vite-plugin-bundle-analyzer@0.0.1` turned out to be a no-op stub
  (`console.log('let build together')` — no analysis), so the gate uses `rollup-plugin-visualizer@7.0.1`
  instead."
- **Expected** the visualizer present, the stub analyzer absent.
- **Actual** `app/package.json` → `"rollup-plugin-visualizer": "^7.0.1"` present; no
  `vite-plugin-bundle-analyzer` dependency. `app/astro.config.mjs:11`
  `const { visualizer } = await import('rollup-plugin-visualizer');` behind the `ANALYZE === '1'` guard at
  `:10`.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none
- **Note** the stub's `console.log('let build together')` body cannot be re-verified — the package is no
  longer installed. The claim is historical and the conclusion (it was removed) is verifiable.

### P‑12 · [[PERF_BASELINE]] — ANALYZE gating  · _control — MATCHED, no action_

- **Origin** audit A entry `P‑12` · baseline `dee3124` · source `docs/03-frontend/PERF_BASELINE.md`
- **Source** `docs/03-frontend/PERF_BASELINE.md` — the section named in the heading above
- **Claim** "`ANALYZE=1` is gated in `app/astro.config.mjs`: it conditionally adds `rollup-plugin-visualizer`
  (treemap HTML report, gzip+brotli sizes) plus a small `bundle-size-report` plugin that prints per-chunk
  sizes to the console. Unset `ANALYZE` → plugin array is exactly `[tailwindcss()]`, unchanged from
  before."
- **Expected** both.
- **Actual** `astro.config.mjs:6` `const vitePlugins = [tailwindcss()];`; `:10`
  `if (process.env.ANALYZE === '1') {`; `:11` the visualizer dynamic import; `:21`
  `name: 'bundle-size-report'`; `:26` `console.log('\n[ANALYZE] chunks by size:')`. The `ANALYZE` branch is
  gated and the default array is exactly one plugin.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### P‑14 · [[PERF_BASELINE]] — Lighthouse targets "recorded as flags only"  · _control — MATCHED, no action_

- **Origin** audit A entry `P‑14` · baseline `dee3124` · source `docs/03-frontend/PERF_BASELINE.md`
- **Source** `docs/03-frontend/PERF_BASELINE.md` — the section named in the heading above
- **Claim** "**Targets:** flags only, **NOT enforced** this pass: CLS < 0.1, LCP < 2.5 s, TBT < 300 ms" …
  "Targets (CLS < 0.1, LCP < 2.5 s, TBT < 300 ms) are recorded as flags only — the LCP flag is NOT met on
  the dev baseline and is expected to improve on a production build. Not enforced this pass."
- **Expected** the "flags only" framing to be true.
- **Actual** `run.ts:52` `enforced: false`, and the committed baseline records the same. The LCP values
  (25.04 s, 22.72 s, 5.65 s) are all far above the 2.5 s target, which is consistent with the stated
  dev-server caveat.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none
- **Why this is the counterpart to P‑1** the Lighthouse section gets "not enforced" right and says so twice.
  The `app/budget.json` Status paragraph is the one that over-claims. That makes the fix local: the
  Status sentence, not the harness.

## docs/04-testing

### T‑3 · [[TESTING]] suite table — root integration row · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `T‑3` · baseline `ddc63c6` · source `docs/04-testing/TESTING.md`
- **Source** `docs/04-testing/TESTING.md` — the section named in the heading above
- **Claim** "| Root integration | `npx vitest run` | **255 tests / 37 files** (262 registered; 7
  dropped by the documented 30-min `/api/auth` login-limit flake) |"
- **Expected** 255 passing / 37 files, and a 262-registered figure with a 7-test explanation.
- **Actual** **255 / 37** PASS (`AGENT_LOGBOOK_HISTORY.md:9278`, 2026-09-09). The 262-registered and
  7-dropped halves are independently corroborated by the 2026-09-06 heading at line 9103
  ("ROOT INTEGRATION PHASE: GREEN (262/0, 37 files)"). This is the **only** suite row in the whole
  folder that is still correct.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### T‑9 · [[TESTING]] §E2E specifics — "boots both servers" · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `T‑9` · baseline `ddc63c6` · source `docs/04-testing/TESTING.md`
- **Source** `docs/04-testing/TESTING.md` — the section named in the heading above
- **Claim** "The E2E suite **boots both servers** (backend + frontend) itself in CI mode."
- **Expected** two `webServer` entries.
- **Actual** `playwright.config.ts:98-121` has exactly two: `:106-107`
  `cd backend && npx wrangler d1 migrations apply campmaster-db --local && npx wrangler dev --port
  8787 --local` and `:116` `cd app && npx astro dev --port 4320 --host`, both `reuseExistingServer:
  true`, `timeout: 240_000`. The `:100-105` comment independently documents the blank-D1 trap
  `tests/globalSetup.ts` shares.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### T‑10 · [[TESTING]] §Port hygiene · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `T‑10` · baseline `ddc63c6` · source `docs/04-testing/TESTING.md`
- **Source** `docs/04-testing/TESTING.md` — the section named in the heading above
- **Claim** `4320 = frontend (Astro dev/preview)`, `8787 = backend (wrangler dev)`
- **Expected** the same two ports the config uses.
- **Actual** `playwright.config.ts:4` `const UNIFIED_PORT = 4320`; `:108` `port: BACKEND_PORT`
  driven by the `:107` `--port 8787`. Both match.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### T‑11 · [[TESTING]] §Tenant page `load` hang · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `T‑11` · baseline `ddc63c6` · source `docs/04-testing/TESTING.md`
- **Source** `docs/04-testing/TESTING.md` — the section named in the heading above
- **Claim** "Tenant E2E pages can hang on `load` in `astro dev` because logo/favicon point at a dead
  `localhost:8001`. Specs use `page.goto(url, { waitUntil: 'domcontentloaded' })` — keep this
  convention in new specs."
- **Expected** both the cause and the convention.
- **Actual** The convention is real and applied in `tests/e2e/**` (e.g. `routing/zone-exclusivity.spec.ts`).
  The `localhost:8001` cause is the repo's own operational guidance (`AGENTS.md` §3) and is
  corroborated by `AGENT_LOGBOOK_HISTORY.md:9695`, which records `Retry-After`/503 work on the same
  tenant pages.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### T‑15 · All `code-references` across both files · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `T‑15` · baseline `ddc63c6` · source `docs/04-testing/TESTING.md + docs/04-testing/README.md`
- **Source** `docs/04-testing/TESTING.md + docs/04-testing/README.md` — the section named in the heading above
- **Claim** `playwright.config.ts`, `vitest.integration.config.ts`, `scripts/run-all-tests.sh`,
  `tests/e2e/specs/`, `tests/e2e/pages/`, `tests/e2e/fixtures/`, `backend/tests/`, `app/tests/`
- **Expected** every path to exist.
- **Actual** **9 / 9 resolve.** `scripts/run-all-tests.sh` (10,115 B) exists, as do all three E2E
  directories and both test roots.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

## docs/05-operations

### O‑1 · [[RUNBOOK]] §2 — the full environment/resource map · **MATCHED, every value exact**  · _control — MATCHED, no action_

- **Origin** audit B entry `O‑1` · baseline `ddc63c6` · source `docs/05-operations/RUNBOOK.md`
- **Source** `docs/05-operations/RUNBOOK.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none
- **Credit** two full UUIDs transcribed correctly, plus the runbook's own instruction that "if the
  file and this table disagree, the file wins" — that clause is why this entry exists and why it
  passed.

### O‑2 · [[RUNBOOK]] §3 — both preflight entry points and the ack-prod refusal · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `O‑2` · baseline `ddc63c6` · source `docs/05-operations/RUNBOOK.md`
- **Source** `docs/05-operations/RUNBOOK.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none

### O‑3 · [[RUNBOOK]] §3 — the four preflight gates · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `O‑3` · baseline `ddc63c6` · source `docs/05-operations/RUNBOOK.md`
- **Source** `docs/05-operations/RUNBOOK.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none

### O‑4 · [[RUNBOOK]] §4 — all six deploy flags · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `O‑4` · baseline `ddc63c6` · source `docs/05-operations/RUNBOOK.md`
- **Source** `docs/05-operations/RUNBOOK.md` — the section named in the heading above
- **Claim** `./deploy.sh` (production), `--staging`, `--backend`, `--frontend`, `--migrate`,
  `--no-health`, `--rollback <id>`.
- **Expected** each flag handled.
- **Actual** `deploy.sh:31` `MODE="${1:-full}"`; `:39-40` `--staging` → `DEPLOY_ENV="staging"`;
  `:42-44` `--no-health`; `:45-55` `--rollback` with `[ "${2:-}" = "--staging" ]`;
  `:496` `--backend`, `:502` `--frontend`, `:508` `--migrate`, `:516` `--rollback`. The header block
  at `:7-15` documents all seven including `--preflight`.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none
- **Note** `--migrate` and `--frontend` are also **front-matter code-references of
  `DEVELOPER_ROADMAP.md`** T15's deploy-flags claim; that claim is corroborated here.

### O‑5 · [[RUNBOOK]] §4 — "takes a D1 export automatically and aborts on empty backup or failed Worker deploy" · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `O‑5` · baseline `ddc63c6` · source `docs/05-operations/RUNBOOK.md`
- **Source** `docs/05-operations/RUNBOOK.md` — the section named in the heading above
- **Claim** as quoted.
- **Expected** an export step that aborts.
- **Actual** `deploy.sh:359` `BACKUP_FILE="$SCRIPT_DIR/backups/campmaster-$(date +%Y%m%d-%H%M%S).sql"`;
  `:360` `if retry "npx wrangler d1 export $D1_NAME --remote --output '$BACKUP_FILE'" …`; `:365`
  "(d1 export reported success but produced no data)"; `:369`
  `log "❌ D1 backup failed after 3 attempts — aborting deploy to prevent data loss"`. The filename
  pattern in gate [1] of §3 (`backups/campmaster-*.sql`) matches this exactly.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### O‑6 · [[RUNBOOK]] §4a — "Record BOTH version IDs" and the generated-wrangler wrinkle · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `O‑6` · baseline `ddc63c6` · source `docs/05-operations/RUNBOOK.md`
- **Source** `docs/05-operations/RUNBOOK.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none
- **Credit** this is the single most useful operational fact in the folder and it is buried in
  §4a where an operator would actually look.

### O‑8 · [[RUNBOOK]] §6 — rollback asymmetry · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `O‑8` · baseline `ddc63c6` · source `docs/05-operations/RUNBOOK.md`
- **Source** `docs/05-operations/RUNBOOK.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none

### O‑9 · [[RUNBOOK]] §7 — backup & restore, and "no automated restore path" · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `O‑9` · baseline `ddc63c6` · source `docs/05-operations/RUNBOOK.md`
- **Source** `docs/05-operations/RUNBOOK.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none

### O‑10 · [[RUNBOOK]] §8 — drift detection: both named drift classes and their pins · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `O‑10` · baseline `ddc63c6` · source `docs/05-operations/RUNBOOK.md`
- **Source** `docs/05-operations/RUNBOOK.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none
- **Credit** "Any new `pos_transactions` INSERT site must extend that test" turns a fixed bug into a
  standing obligation. This is the right way to close a drift class.

### O‑11 · [[RUNBOOK]] §9b — all three auth-failure mechanisms, every line · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `O‑11` · baseline `ddc63c6` · source `docs/05-operations/RUNBOOK.md`
- **Source** `docs/05-operations/RUNBOOK.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none
- **Credit** two meta-points that are easy to miss and are both true: the printed manual fallback
  omits the `unset` prefix the fix requires, and a stale `.env` token *degrades to OAuth silently*,
  so "the deploy ran" does not mean "the deploy ran on the credential you thought".
- **Severity note** the runbook is the doc in this scope with the highest verified line-level
  fidelity — 13 entries, 13 correct.

### O‑14 · [[05-operations/README]] §Concepts — all nine · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `O‑14` · baseline `ddc63c6` · source `docs/05-operations/README.md`
- **Source** `docs/05-operations/README.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none

### O‑15 · [[05-operations/README]] — "treat a procedure here as executable only if it names a command you could paste today" · MATCHED, and the standard is met  · _control — MATCHED, no action_

- **Origin** audit B entry `O‑15` · baseline `ddc63c6` · source `docs/05-operations/README.md`
- **Source** `docs/05-operations/README.md` — the section named in the heading above
- **Claim** "`RUNBOOK.md` is owner-facing and was rewritten 2026-10-02 against the live tree; treat a
  procedure here as executable only if it names a command you could paste today."
- **Expected** the runbook to meet its own bar.
- **Actual** It does — **O‑2**, **O‑4**, **O‑5**, **O‑6**, **O‑8**, **O‑9**, **O‑11** all verified
  command-by-command against the scripts they name, and **13 of 13** runbook entries in this audit
  are MATCHED or externally-UNVERIFIED. Not one runbook procedure is FALSE.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none
- **Why this entry exists** it is the contrast the whole audit needs. `RUNBOOK.md` is what a
  self-imposed "only pasteable commands" standard produces; `AUDIT_MASTER_FINDINGS.md` (**O‑16**
  onward) is what a folder with no such standard produces.

### O‑23 · [[AUDIT_MASTER_FINDINGS]] — PART 4's remediation status is real  · _control — MATCHED, no action_

- **Origin** audit B entry `O‑23` · baseline `ddc63c6` · source `docs/05-operations/AUDIT_MASTER_FINDINGS.md`
- **Source** `docs/05-operations/AUDIT_MASTER_FINDINGS.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none
- **Note** this is the one PART 4 row that is *correct*, which is why the doc reads as credible
  enough to be trusted on **O‑16**.

### O‑24 · [[AUDIT_MASTER_FINDINGS]] — the file's own archival framing · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `O‑24` · baseline `ddc63c6` · source `docs/05-operations/AUDIT_MASTER_FINDINGS.md`
- **Source** `docs/05-operations/AUDIT_MASTER_FINDINGS.md` — the section named in the heading above
- **Claim** "**Date:** 2026-09-05 · **Mode:** READ-ONLY across all 8 audits. No source, test, or
  migration file was modified." Front matter `status/archived`. `05-operations/README.md`: "the round
  is archived; this index survives as its entry point."
- **Expected** an archived record with a dated header.
- **Actual** The header names the date and the mode; the front matter carries `status/archived`; the
  folder README says it plainly. The eight per-domain reports it consolidates are still reachable at
  `docs/98-history/audits/*` (the README's `relates-to` names seven of the eight by path, and all
  resolve).
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none
- **Why this entry exists** the framing is correct and **O‑16** is filed against the fix-sequence
  section's tense, not against the file's classification. A folder holding an archived audit next to
  a live runbook is the right layout; the failure is that nothing inside the archived file says
  which of its sections are still actionable.

## docs/06-security

### S‑1 · [[security-guide]] §Rate Limiting — the mount point and line reference · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `S‑1` · baseline `ddc63c6` · source `docs/06-security/security-guide.md`
- **Source** `docs/06-security/security-guide.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none
- **Note** this is the same line `06-security/README.md` cites in its front matter, and it is right.

### S‑4 · [[security-guide]] §Rate Limiting — all nine named per-surface budgets · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `S‑4` · baseline `ddc63c6` · source `docs/06-security/security-guide.md`
- **Source** `docs/06-security/security-guide.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none
- **Credit** nine specific numbers, quoted with their entries, all correct — this is what an auditor
  needs and it is rarer than it should be.

### S‑5 · [[security-guide]] §Rate Limiting — exemption, mint budget, test bypass, tenant key · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `S‑5` · baseline `ddc63c6` · source `docs/06-security/security-guide.md`
- **Source** `docs/06-security/security-guide.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none

### S‑6 · [[security-guide]] §Rate Limiting — "100 requests/minute is only the fallback bucket" · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `S‑6` · baseline `ddc63c6` · source `docs/06-security/security-guide.md`
- **Source** `docs/06-security/security-guide.md` — the section named in the heading above
- **Claim** "'100 requests/minute' is only the fallback bucket. It is the `default` entry, used by any
  path no other entry claims."
- **Expected** a `default` entry at 100/min with first-match-wins semantics.
- **Actual** `rateLimit.js:96` `default: { max: 100, envKey: 'RATE_LIMIT_API' }`; `:118`
  `if (key === 'default') continue;` in the compile loop, so `default` is reached only when no entry
  matched. `:13` states the ordering contract.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none
- **Why this entry exists** it is the single most load-bearing correction the 2026-10-02 pass made
  to this file (Verification note item 2: "Rate limiting was documented as '100 requests/minute per
  IP'"), and it held.

### S‑7 · [[security-guide]] §CORS Policy — the whole block · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `S‑7` · baseline `ddc63c6` · source `docs/06-security/security-guide.md`
- **Source** `docs/06-security/security-guide.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none
- **Credit** the four auditor's notes (single-segment wildcard so `a.b.sinaicamps.com` does not
  match; up-to-5-minute staleness for a newly registered domain; no credentials flag needed for
  bearer auth; `null` vs `false` is what omits the headers) are each correct and each is the kind of
  thing a reader would otherwise get wrong. This is the strongest section in the folder.

### S‑8 · [[security-guide]] §XSS Layer 2 — the escHtml census, all four rows and every line · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `S‑8` · baseline `ddc63c6` · source `docs/06-security/security-guide.md`
- **Source** `docs/06-security/security-guide.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none
- **Credit** naming the two *local* shadow definitions — and the consequence, spelled out in the
  prose ("a fix to `utils.ts` does **not** reach them") — is the single most useful sentence in the
  document. It converts a function-level finding into a file-level risk.

### S‑9 · [[security-guide]] §Known safe patterns — `dangerouslySetInnerHTML`, `set:html`, backend `escHtml` · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `S‑9` · baseline `ddc63c6` · source `docs/06-security/security-guide.md`
- **Source** `docs/06-security/security-guide.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none
- **Credit** "Do not read its presence as an active defence" is the correct verdict on an exported-
  but-uncalled function, and it is the kind of sentence that stops a reviewer ticking a box.

### S‑10 · [[security-guide]] §XSS Layers 3 and 4 — no sanitisation middleware, no scrub-on-write · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `S‑10` · baseline `ddc63c6` · source `docs/06-security/security-guide.md`
- **Source** `docs/06-security/security-guide.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none

### S‑12 · [[security-guide]] §CSRF Resistance — the whole argument · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `S‑12` · baseline `ddc63c6` · source `docs/06-security/security-guide.md`
- **Source** `docs/06-security/security-guide.md` — the section named in the heading above
- **Claim** Inherently CSRF-resistant because auth is a header, not an ambient cookie; the
  cookie-migration counterfactual would void the exemption.
- **Expected** the architecture to match.
- **Actual** Consistent with **S‑11**: `Authorization: Bearer` + `localStorage`, no auth cookie, and
  `response.js` never sets one. The three-mechanism table and the "if switching to cookie-based auth:
  ADD anti-CSRF token implementation" status block are both present and correct as stated
  architecture documentation.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### S‑14 · [[security-guide]] §Input Sanitization — no sanitize middleware, Zod, `.bind()` · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `S‑14` · baseline `ddc63c6` · source `docs/06-security/security-guide.md`
- **Source** `docs/06-security/security-guide.md` — the section named in the heading above
- **Claim** "`backend/src/middleware/sanitize.js` is absent from disk and no `sanitizeInput` mount
  exists" · Zod `.strip()` · parameterized `.prepare().bind()`, never interpolation.
- **Expected** all three.
- **Actual** Both halves confirmed (**S‑10**). `.bind()` discipline: the repo's own safety rules
  (`AGENTS.md` §2) mandate it and `toSnake`/`.strip()` are at `response.js:27` and across the
  schemas; the doc's code examples are illustrative, not quoted from a file.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### S‑15 · [[security-guide]] §Free-plan caveat — the flag in both envs · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `S‑15` · baseline `ddc63c6` · source `docs/06-security/security-guide.md`
- **Source** `docs/06-security/security-guide.md` — the section named in the heading above
- **Claim** "Currently set to `RATE_LIMIT_KV_ENABLED="false"` (in-memory per-isolate fallback) in
  both `[vars]` and `[env.staging.vars]`." And Recommendation 3: keep it.
- **Expected** both, `"false"`.
- **Actual** `backend/wrangler.toml:56` `[vars]` and `:97` `[env.staging.vars]`, both `"false"`. The
  surrounding comment (`:53-55`) states the 1,000/day rationale and the "re-enable once quota is no
  longer exhausted or the plan is upgraded" condition, so the doc and the config agree on both the
  value and the reason.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### S‑17 · [[security-guide]] §Verification note — the three corrections it claims made · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `S‑17` · baseline `ddc63c6` · source `docs/06-security/security-guide.md`
- **Source** `docs/06-security/security-guide.md` — the section named in the heading above
- **Claim** (dated 2026-10-02) that CORS was rebuilt from a static array, rate limiting from
  "100 requests/minute per IP", and the backend-`escHtml` row from "present, applied at render
  time" — and that the drift was in those three places, "not" the XSS section.
- **Expected** all three corrections to have landed and the XSS section to be unchanged since
  `fcd0e40`.
- **Actual** All three landed and all three hold (**S‑7**, **S‑6**, **S‑9**). The XSS section's own
  figures (**S‑8**) are still exact, which is what the note asserts about it. The one defect the
  note introduced is the 7-prefix figure (**S‑2**), repeated in both the section and the note.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none
- **Credit** a verification note that names what it changed, when, and what it deliberately left
  alone is the best mechanism in this vault for keeping a doc honest. **S‑2** is what happens when
  the note is written once and never re-verified.

### S‑19 · [[06-security/README]] §Concepts — all seven · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `S‑19` · baseline `ddc63c6` · source `docs/06-security/README.md`
- **Source** `docs/06-security/README.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none
- **Why this entry exists** the index is the best-written doc in this scope: it says *"a defence that
  is documented as 'not used here' is a decision, and a decision needs a record"* in its Overview.
  That is the standard the rest of the vault's indexes should meet.

## docs/07-data

### D‑4 · [[migrations]] §5 — the "recent migrations of note" table · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `D‑4` · baseline `ddc63c6` · source `docs/07-data/migrations.md`
- **Source** `docs/07-data/migrations.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none

### D‑6 · [[migrations]] §3 — the four schema gotchas · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `D‑6` · baseline `ddc63c6` · source `docs/07-data/migrations.md`
- **Source** `docs/07-data/migrations.md` — the section named in the heading above
- **Claim** `pos_users.name` GENERATED (`first_name || ' ' || last_name`), insert first/last only ·
  `pos_users.organization_id` `INTEGER NOT NULL`, every INSERT must include it ·
  `pos_transactions` references staff via `cashier_id` not `staff_id` · `ALTER TABLE ADD COLUMN`
  cannot add NOT NULL without a DEFAULT.
- **Expected** all four in the live lineage head.
- **Actual** All four. `0126_tenant_scoped_unique_sku_email.sql:224` carries
  `name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED`; `organization_id
  INTEGER NOT NULL DEFAULT 1`; the `pos_transactions` column list (`0112:333`) names `cashier_id`.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### D‑7 · [[migrations]] §4 — the free-plan KV trap · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `D‑7` · baseline `ddc63c6` · source `docs/07-data/migrations.md`
- **Source** `docs/07-data/migrations.md` — the section named in the heading above
- **Claim** `RATE_LIMIT_KV_ENABLED="false"` in `backend/wrangler.toml` `[vars]`, keep it ·
  `cachedJsonResponse` uses only `Cache-Control`, no KV writes.
- **Expected** the flag in `[vars]`; zero KV writes on the response path.
- **Actual** `backend/wrangler.toml:56` `RATE_LIMIT_KV_ENABLED = "false"` (`[vars]`), `:97`
  (`[env.staging.vars]`). `grep -rn "KV_CACHE.put" backend/src` → **0 hits**. The rate limiter's KV
  branch is the only KV writer and it is disabled.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### D‑8 · [[migrations]] §2 — the `db-migration` skill and both apply commands · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `D‑8` · baseline `ddc63c6` · source `docs/07-data/migrations.md`
- **Source** `docs/07-data/migrations.md` — the section named in the heading above
- **Claim** "Use the **`db-migration` skill** (`.opencode/skills/database/db-migration/SKILL.md`)" ·
  `npx wrangler d1 migrations apply <DB_NAME> --local --config backend/wrangler.toml` · "`./deploy.sh`
  applies migrations during deploy".
- **Expected** the skill file and both commands to be real.
- **Actual** The skill file exists. `backend/wrangler.toml:14-18` is a real `[[d1_databases]]` block
  with `database_name = "campmaster-db"`, so the named DB resolves. `deploy.sh:375-376` applies
  migrations (`echo y | npx wrangler d1 migrations apply $D1_NAME --remote $ENV_FLAG`).
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### D‑9 · [[migrations]] §1 — the legacy-folder statement · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `D‑9` · baseline `ddc63c6` · source `docs/07-data/migrations.md`
- **Source** `docs/07-data/migrations.md` — the section named in the heading above
- **Claim** "The pre-squash `0001`–`0099` lineage is archived in `backend/migrations/legacy/`
  (+ README) — archaeology only, wrangler scans the top level and ignores it."
- **Expected** 99 legacy files, a README, and a top-level-only scan.
- **Actual** `ls backend/migrations/legacy/*.sql | wc -l` → **99**; `backend/migrations/legacy/README.md`
  exists; `backend/wrangler.toml:18` `migrations_dir = "migrations"` (top level, non-recursive by
  wrangler's own semantics) and `scripts/check-deploy-parity.sh` inventories top-level `*.sql` only.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### D‑10 · [[07-data/README]] §Concepts — the six load-bearing authoring rules · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `D‑10` · baseline `ddc63c6` · source `docs/07-data/README.md`
- **Source** `docs/07-data/README.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none

### D‑12 · [[07-data/README]] — the migration-head drift callout · **MATCHED, and correct** · control entry  · _control — MATCHED, no action_

- **Origin** audit B entry `D‑12` · baseline `ddc63c6` · source `docs/07-data/README.md`
- **Source** `docs/07-data/README.md` — the section named in the heading above
- **Claim** "⚠️ **Migration-head drift is still live.** … The tree has **40** migrations with head
  `0127_meals_tenant_composite_pk.sql`."
- **Expected** 40 files, head `0127_meals_tenant_composite_pk.sql`, and `0127` named as the archive
  blocker.
- **Actual** Exactly 40; `0127_meals_tenant_composite_pk.sql` is present and is the highest-numbered.
  `backend/migrations/0127_meals_tenant_composite_pk.sql:4-6` declares itself "⚠️ PENDING-APPLY. This
  file is committed but NOT applied to any database." — so "head" here means *present in the tree*,
  which is the reading the file's own `code-references` block uses.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none
- **Why this entry exists** it is the control for **D‑1**/**D‑2**: the folder's index carries the
  correct head and the correct slot, so the guide's errors are not a folder-wide ignorance — they
  are one unrefreshed file, and the folder already knows it.

## docs/08-guides

### G‑5 · [[analytics-guide]] §API Access — all nine named endpoints · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `G‑5` · baseline `ddc63c6` · source `docs/08-guides/analytics-guide.md`
- **Source** `docs/08-guides/analytics-guide.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none

### G‑6 · [[analytics-guide]] §Dashboard Tabs Overview · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `G‑6` · baseline `ddc63c6` · source `docs/08-guides/analytics-guide.md`
- **Source** `docs/08-guides/analytics-guide.md` — the section named in the heading above
- **Claim** Four tabs: `occupancy` (live) · `revenue` (live) · `bookings` (live) · `profit`
  ("panel tab present; per-project P&L shipped `149a38c`").
- **Expected** all four live behind the Reports panel.
- **Actual** `reports` is a real admin nav tab (`AdminApp.tsx` id `reports`, **T‑5**); `analytics` is a
  separate tab id the guide does not mention (**T‑5**). All four report routes are live (**G‑5**).
  `ReportsPanel.tsx` exists. The `149a38c` provenance claim is corroborated by
  `AGENT_LOGBOOK_HISTORY.md` (`DEVELOPER_ROADMAP.md` T21: "per-project P&L `149a38c`").
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### G‑7 · [[analytics-guide]] §Revenue Breakdown — the payment-method vocabulary · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `G‑7` · baseline `ddc63c6` · source `docs/08-guides/analytics-guide.md`
- **Source** `docs/08-guides/analytics-guide.md` — the section named in the heading above
- **Claim** "**Cash** / **Card** / **Split** (live values: `cash|card|split`; Paymob webhook covers
  booking orders only when `PM_ENABLED=true`)"
- **Expected** three payment values and the PM gate.
- **Actual** `backend/wrangler.toml:77` `PM_ENABLED = "false"` (prod) and `:105` (staging) — the gate
  is real and off. `PM_HMAC_SECRET` is documented as a required secret (`:83`). The literal
  `cash|card|split` vocabulary is consistent with the POS payment split the other guides describe
  (**R‑21**/**G‑16**).
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### G‑9 · [[camp-guide]] — the nav-label/code-id honesty notes · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `G‑9` · baseline `ddc63c6` · source `docs/08-guides/camp-guide.md`
- **Source** `docs/08-guides/camp-guide.md` — the section named in the heading above
- **Claim** "The **Projects** panel (nav label; code id `camps`)" · "The **Orders** panel (nav id
  `reservations`)" · "**Low Stock + Supply + Promotions** | Stock tracking (no single Inventory
  panel)" · "**Orders** (nav id `reservations`) … (single panel — no separate Orders row)"
- **Expected** the nav ids to match the code and the parentheticals to be true.
- **Actual** All four verified against `AdminApp.tsx`: `camps` ✓, `reservations` ✓, `low-stock` ✓,
  `supply` ✓, `promotions` ✓ — and there is **no** `inventory` and **no** separate `orders` tab.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none
- **Credit** the parenthetical style — "(nav id `reservations`)", "(no single Inventory panel)",
  "single panel — no separate Orders row" — is what a walkthrough needs when the label and the id
  differ. It is why **T‑5**'s omission hurts: the guide is careful about exactly this axis.

### G‑10 · [[restaurant-guide]] §Table Management — POS tables live in the POS terminal · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `G‑10` · baseline `ddc63c6` · source `docs/08-guides/restaurant-guide.md`
- **Source** `docs/08-guides/restaurant-guide.md` — the section named in the heading above
- **Claim** "Open the **Tables** view in the POS terminal (POSApp `tables` view — there is no Tables
  panel in the admin nav)"
- **Expected** a POS `tables` view and no admin `tables` tab.
- **Actual** `app/src/components/pos/POSApp.tsx:42` `{ id: 'tables', label: 'Tables', … }`, with
  `:143` `if (pathname.includes('/tables')) return 'tables';` (Phase 7 pushState routing) and `:22`
  `const TableView = React.lazy(() => import('./views/TableView'));`. `AdminApp.tsx` has no `tables`
  id (**T‑5** enumeration). `backend/src/api/pos-tables.js` mounts at `index.js:798`.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### G‑11 · [[restaurant-guide]] §Reservation Statuses — the reserve/release pair · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `G‑11` · baseline `ddc63c6` · source `docs/08-guides/restaurant-guide.md`
- **Source** `docs/08-guides/restaurant-guide.md` — the section named in the heading above
- **Claim** "| **reserved** | Reservation active via `PATCH /:id/reserve` |" · "| **available** |
  Freed via `PATCH /:id/release` (only-if-reserved) — no auto-suggest, no grace period |"
- **Expected** both endpoints, with release conditional on `reserved`.
- **Actual** `pos-tables.js:282` `posTablesRoutes.patch('/:id/reserve', …)` and `:291`
  `UPDATE pos_tables SET status = 'reserved', reservation_name = ?, reservation_time = ?,
  reservation_date = ?, party_size = ?`, `:295` returning `status: 'reserved'`. The status vocabulary
  is pinned at `:39` `export const TABLE_STATUSES = ['available', 'occupied', 'reserved', 'cleaning']`
  — the guide's four-state table (§"Table Status") matches it exactly.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### G‑12 · [[restaurant-guide]] §Kitchen Workflow — the two kitchen status vocabularies · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `G‑12` · baseline `ddc63c6` · source `docs/08-guides/restaurant-guide.md`
- **Source** `docs/08-guides/restaurant-guide.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none

### G‑13 · [[restaurant-guide]] §Billing → Tips — the POS tip column and the reports gap · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `G‑13` · baseline `ddc63c6` · source `docs/08-guides/restaurant-guide.md`
- **Source** `docs/08-guides/restaurant-guide.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none
- **Credit** "not broken out in Reports (no tip handling in `admin-reports.js`)" is exactly the shape
  of note that saves a tenant admin from building a reconciliation that the product does not have.

### G‑14 · [[restaurant-guide]] §Billing → Split Bills / Payment Methods · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `G‑14` · baseline `ddc63c6` · source `docs/08-guides/restaurant-guide.md`
- **Source** `docs/08-guides/restaurant-guide.md` — the section named in the heading above
- **Claim** "**Split** — cash+card split (live) — Tab not implemented (use split or separate order +
  `PATCH /orders/:id/split`)"
- **Expected** a split path on orders, and no separate split UI tab.
- **Actual** `folios` settlement is the split primitive (migration `0124_guest_folios.sql` creates
  `folios` / `folio_charges` / `folio_settlements` with "cash/card/split settlement" in its header),
  and `POST /api/folios/:id/void` exists at `folios.js:337` (**R‑11**). The honesty note — "Tab not
  implemented", with the workaround named — is the same style as **G‑9**.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### G‑15 · [[service-guide]] §Booking Status Lifecycle and the transition map · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `G‑15` · baseline `ddc63c6` · source `docs/08-guides/service-guide.md`
- **Source** `docs/08-guides/service-guide.md` — the section named in the heading above
- **Claim** Five statuses `pending` / `confirmed` / `en_route` / `completed` / `canceled`
  ("single-l spelling"), with an implied state machine.
- **Expected** a five-value enum and a transition table.
- **Actual** `backend/src/api/services.js:59`
  `status: z.enum(['pending', 'confirmed', 'en_route', 'completed', 'canceled'])`, and the guard
  `:285-286` `confirmed: ['en_route', 'completed', 'canceled']`, `en_route: ['completed', 'canceled']`.
  Five values, one-l spelling, and a real transition table — all as documented.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### G‑16 · [[service-guide]] §Pricing Tiers — the negative claim · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `G‑16` · baseline `ddc63c6` · source `docs/08-guides/service-guide.md`
- **Source** `docs/08-guides/service-guide.md` — the section named in the heading above
- **Claim** "| **standard / premium / luxury** | `PUT /items/:id/pricing` with `price_premium`
  (**live — no Season/Weekday/Group/Early Bird**) |"
- **Expected** exactly one live pricing override and no others.
- **Actual** `services.js:421` `router.put('/items/:id/pricing', …)`; `:426`
  `const { price_tier, price_premium } = raw;`; `:435`
  `UPDATE service_items SET price_tier = ?, price_premium = ? …`. **Exactly two override columns**;
  no seasonal/weekday/group/early-bird path exists in the file. The negative claim holds.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none
- **Credit** "no Season/Weekday/Group/Early Bird" is a named, checkable negative — this is how a
  walkthrough should describe an absence, and it is why the claim is verifiable at all.

### G‑17 · [[service-guide]] §Availability Calendar — the negative claims · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `G‑17` · baseline `ddc63c6` · source `docs/08-guides/service-guide.md`
- **Source** `docs/08-guides/service-guide.md` — the section named in the heading above
- **Claim** "shows raw slots (`available_date/from/to/worker_id/is_available` via `GET
  /items/:id/availability`) — **no color thresholds, no block/capacity endpoints**" and "no dedicated
  Availability panel in the admin nav — UNVERIFIABLE as a named panel; slots via `GET
  /items/:id/availability`, calendar surface is Booking Calendar".
- **Expected** the slot columns, no block/capacity routes, and no Availability nav tab.
- **Actual** `AdminApp.tsx` has `calendar` (Booking Calendar) and no `availability` id (**T‑5**
  enumeration), which corroborates the parenthetical. The doc's own `UNVERIFIABLE` marker on the
  panel question is the honest form (**G‑18**).
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### G‑19 · [[supermarket-guide]] §POS Setup — the POS-is-tenant-only rule · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `G‑19` · baseline `ddc63c6` · source `docs/08-guides/supermarket-guide.md`
- **Source** `docs/08-guides/supermarket-guide.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none

### G‑21 · [[supermarket-guide]] §Register Workflow + End of Shift — the payment vocabulary · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `G‑21` · baseline `ddc63c6` · source `docs/08-guides/supermarket-guide.md`
- **Source** `docs/08-guides/supermarket-guide.md` — the section named in the heading above
- **Claim** "(live: Cash / Card / Split — e-wallet/Instapay planned, not live)" and "Navigate to
  **Shift** (POS view label, singular)"
- **Expected** three live payment methods and a `shift` view.
- **Actual** `POSApp.tsx:44` `{ id: 'shift', label: 'Shift', … }` — singular, as documented — with
  `:145` the path mapping and `:24` `const ShiftOverlay = React.lazy(() => import('./views/ShiftOverlay'))`.
  Shift routes are real: `pos/index.js:1212` GET `/shifts/active`, `:1238` POST `/shifts/open`,
  `:1277` POST `/shifts/close` (Part 8a **S‑7** verified all three). The payment vocabulary matches
  **G‑7**.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### G‑22 · [[supermarket-guide]] §Inventory — the "no single Inventory panel" note · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `G‑22` · baseline `ddc63c6` · source `docs/08-guides/supermarket-guide.md`
- **Source** `docs/08-guides/supermarket-guide.md` — the section named in the heading above
- **Claim** "The **Low Stock** panel (nav id `low-stock`; **no single Inventory panel** — procurement
  lives in Supply Chain)" and "Set **Low Stock Threshold**", "Enter signed quantity + reason text
  (**no fixed Restock/Damage/Correction enum**)"
- **Expected** `low-stock` present, `inventory` absent, and a free-text reason field.
- **Actual** `AdminApp.tsx` has `low-stock` and `supply`; there is **no** `inventory` tab (**T‑5**).
  `backend/src/api/inventory.js` is a mounted API family (`index.js` mounts it with
  `tenantAwareLimiter()`) but has no panel — exactly the distinction the guide draws. The
  negative-enum note is the same honest-negative style as **G‑16**.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### G‑23 · [[08-guides/README]] §Concepts — the pillar↔endpoint alignment · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `G‑23` · baseline `ddc63c6` · source `docs/08-guides/README.md`
- **Source** `docs/08-guides/README.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none

## docs/09-plans

### R‑5 · [[DEVELOPER_ROADMAP]] T11 — the cancelled-RTL row, with its E2E claim · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `R‑5` · baseline `ddc63c6` · source `docs/09-plans/DEVELOPER_ROADMAP.md`
- **Source** `docs/09-plans/DEVELOPER_ROADMAP.md` — the section named in the heading above
- **Claim** "T11 | ~~Arabic RTL~~ **CANCELLED** | Deliberate product decision: frontend stays
  hard-coded English LTR. **No `app/src/i18n/` exists**, no locale middleware, no `sc_lang` cookie;
  the "arabic-rtl-deep" E2E spec **asserts en/ltr (verified)**."
- **Expected** no i18n directory and the named spec to exist and assert en/LTR.
- **Actual** `ls app/src/i18n` → **No such file or directory** (independently confirmed by Part 8a
  **A‑13**). `tests/e2e/specs/tenant/arabic-rtl-deep.spec.ts` **exists** — the `code-references`
  check passes.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none
- **Credit** this is the best-written "Done" row in the file: it names the decision, the absence, and
  the test that pins the consequence — and the consequence ("Implementing RTL would break the passing
  E2E suite") is the actual argument.

### R‑6 · [[DEVELOPER_ROADMAP]] T15 and T20/T22 — the island, migration-series and FK rows · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `R‑6` · baseline `ddc63c6` · source `docs/09-plans/DEVELOPER_ROADMAP.md`
- **Source** `docs/09-plans/DEVELOPER_ROADMAP.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none

### R‑13 · [[FINAL_IMPLEMENTATION_PLAN_v3_waves]] — two executed gates · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `R‑13` · baseline `ddc63c6` · source `docs/09-plans/FINAL_IMPLEMENTATION_PLAN_v3_waves.md`
- **Source** `docs/09-plans/FINAL_IMPLEMENTATION_PLAN_v3_waves.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none
- **Why this entry exists** it is the folder's proof that a wave plan's done-conditions are
  checkable: both cite a file and a line, and both lines verify. **R‑12** is in the same file and
  cites nothing checkable.

### R‑15 · [[FINAL_IMPLEMENTATION_PLAN_v3_appendices]] §9.2 — "305 rows, unabridged" · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `R‑15` · baseline `ddc63c6` · source `docs/09-plans/FINAL_IMPLEMENTATION_PLAN_v3_appendices.md`
- **Source** `docs/09-plans/FINAL_IMPLEMENTATION_PLAN_v3_appendices.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none
- **Credit** the explicit definition of "non-API" ("an export that maps to `—` in the register — it
  either never composes a backend route path … or returns server-rendered data that bypasses the API
  client contract") is what makes a self-reported count auditable. This is the appendix tier doing
  what the rest of the vault mostly does not.

### R‑18 · [[09-plans/README]] §Concepts — all seven bullets · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `R‑18` · baseline `ddc63c6` · source `docs/09-plans/README.md`
- **Source** `docs/09-plans/README.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none
- **Note** "The live backlog here is folded forward through **2026-09-28**" is itself accurate — the
  newest `AGENT_LOGBOOK_HISTORY.md` fold is 2026-10-03, and the roadmap's own T-row list does not
  claim anything newer. So the folder is honest about its own staleness window; the defects above
  are rows that were not re-folded, not rows that claim to be.

## docs/10-tenant-import

### N‑1 · [[10-tenant-import/README]] + [[tenant-import-schema]] §2 — "88 leaf fields" · **MATCHED, and the arithmetic closes** · P3  · _control — MATCHED, no action_

- **Origin** audit B entry `N‑1` · baseline `ddc63c6` · source `docs/10-tenant-import/README.md`
- **Source** `docs/10-tenant-import/README.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none
- **Credit** the schema table is 90 rows long and every row I sampled (the `project.type` note, the
  `rooms.roomStatus` "no DB CHECK" note, the `posUsers.email` GENERATED-name note, the
  `menu.meals.mealCategoryId` "no A.4 example ships this key any more" note) is correct. This is the
  best table in the vault.

### N‑2 · [[10-tenant-import/README]] — "Two modes, and only one may roll back" · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `N‑2` · baseline `ddc63c6` · source `docs/10-tenant-import/README.md`
- **Source** `docs/10-tenant-import/README.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none
- **Note** this claim directly contradicts **`BLOCKED-pos-products-composite-pk.md` §5**, which says
  the identity-path rollback was **SKIPPED** and that "Nothing exercises the branch that would carry
  the rollback" (**N‑8**). The README is the current one.

### N‑6 · [[tenant-import-schema]] §"Probe caps" — the batching helper and the D1 ceiling · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `N‑6` · baseline `ddc63c6` · source `docs/10-tenant-import/tenant-import-schema.md`
- **Source** `docs/10-tenant-import/tenant-import-schema.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none
- **Credit** "Deriving it is the point: a literal `i += 50` keeps working until someone raises an
  array cap, and then the probe silently drifts back over the ceiling" is the sentence that explains
  *why* the code looks the way it does — the reason most code comments in this repo omit.

### N‑7 · [[tenant-import-schema]] §2 — the `rooms.cleaningStatus` / `roomStatus` CHECK asymmetry · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `N‑7` · baseline `ddc63c6` · source `docs/10-tenant-import/tenant-import-schema.md`
- **Source** `docs/10-tenant-import/tenant-import-schema.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none

### N‑10 · [[BLOCKED-pos-products-composite-pk]] — the six inbound FK edges and the decisive `SET NULL` · **MATCHED** · the folder's strongest reasoning  · _control — MATCHED, no action_

- **Origin** audit B entry `N‑10` · baseline `ddc63c6` · source `docs/10-tenant-import/BLOCKED-pos-products-composite-pk.md`
- **Source** `docs/10-tenant-import/BLOCKED-pos-products-composite-pk.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none
- **Credit** the `meals` contrast is also exact: "`meals` has exactly **two** inbound edges —
  `meal_lang` (CASCADE) and `meal_schedules` (CASCADE) — and **no `SET NULL`**" —
  `0005_menu.sql:38,42` are both `ON DELETE CASCADE`. And the unblock option 1's premise,
  "`pos_products.deleted_at` already exists and is used by every read path", holds
  (`0126:177`, `:226`). The reasoning is *measured* rather than argued, and it is why `pos_products.id`
  being still open while `meals.id` is closed is a defensible verdict rather than an inconsistency.

### N‑11 · [[tenant-import-appendix]] Table 2 U9 — the subdomain regex/message mismatch · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `N‑11` · baseline `ddc63c6` · source `docs/10-tenant-import/tenant-import-appendix.md`
- **Source** `docs/10-tenant-import/tenant-import-appendix.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none
- **Credit** a documented *mismatch between a validation and its own error message* is a rare class of
  finding, and the table's `Doc status` column records which side is authoritative. This is what
  Table 2's "Undocumented (code does, doc silent)" heading earns its keep on.

### N‑12 · [[tenant-import-appendix]] Table 2 U10 — `ensureTenantOrg` in both modes · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `N‑12` · baseline `ddc63c6` · source `docs/10-tenant-import/tenant-import-appendix.md`
- **Source** `docs/10-tenant-import/tenant-import-appendix.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none

### N‑15 · [[10-tenant-import/README]] — the six concept bullets · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `N‑15` · baseline `ddc63c6` · source `docs/10-tenant-import/README.md`
- **Source** `docs/10-tenant-import/README.md` — the section named in the heading above
- **Claim** Six bullets: **88 leaf fields** (**N‑1**) · two modes and only one may roll back (**N‑2**) ·
  tenant-type matrix handler-verified, "never assumed" (**N‑3**) · products must exist before anything
  references them, rooms/rate plans land in `rooms_new`/`rate_plans_new` (**N‑16**) · meals reference
  categories by `categoryName`, never by id (**N‑17**) · image handling bounded, base64 ≤8 MB
  (**N‑18**).
- **Expected** each traceable.
- **Actual** **N‑1**, **N‑2** confirmed above. The others are verified at **N‑16**/**N‑17**/**N‑18**.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

### N‑16 · [[tenant-import-schema]] — the guarded-`INSERT…SELECT` / 400 / 404 resolution rules · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `N‑16` · baseline `ddc63c6` · source `docs/10-tenant-import/tenant-import-schema.md`
- **Source** `docs/10-tenant-import/tenant-import-schema.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none
- **Note** this makes **N‑3**/**N‑4**/**N‑5** more pointed: the `CAMP_ID_REFS` comment is careful to
  distinguish the *dead* `room.camp_id` read from the *live* `data.project` read, so the same file
  knows the difference the findings lists blur.

### N‑17 · [[tenant-import-schema]] §2 — meals resolve `categoryName`, `mealCategoryId` is blind · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `N‑17` · baseline `ddc63c6` · source `docs/10-tenant-import/tenant-import-schema.md`
- **Source** `docs/10-tenant-import/tenant-import-schema.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none

### N‑18 · [[tenant-import-schema]] §"Schema-level findings" item 5 — the image rule · MATCHED  · _control — MATCHED, no action_

- **Origin** audit B entry `N‑18` · baseline `ddc63c6` · source `docs/10-tenant-import/tenant-import-schema.md`
- **Source** `docs/10-tenant-import/tenant-import-schema.md` — the section named in the heading above
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
- **Severity** P3 · **Action** UPDATE-DOC (the range)


---

# Resolved

The 2026-10-06 reconciliation pass (**FIX DOCS ONLY** — the owner's decision, so every entry
below was closed by editing the doc that made the claim, and **not one** by changing code)
closed the following **71** `STALE`/`FALSE` findings from this note: **69** entry blocks filed
by folder below, plus **Entry #1** (the migration-head drift) which is not a `###` and whose
nested **D‑13** is counted inside it. Each carries the commit that fixed it. Nothing here was
deleted — the folder's own rule is that a queue which forgets what it caught cannot tell a
reader whether a gap was closed or never seen.

| Status | Count | What it means |
|---|---|---|
| `RESOLVED-DOC` | **71** | the cited doc was corrected; the claim was wrong, the code was right |
| `RESOLVED-REJECTED` | **1** | the alleged thing never existed — `A‑11`, filed in [[unimplemented]] |
| `DEFERRED` | **16** | owner-parked feature or measurement; 4 here, 6 in [[unverified]], 6 in [[code-vs-code]] |
| `OPEN` | **2** | still undecidable — `Q‑5`, `P‑6`, both in [[unverified]] |
| `RESOLVED-CODE` | **0** | no finding in any of the three notes was closed by a code change |
| **Total triaged** | **106** | 75 rows here · 25 in [[unimplemented]] + [[unverified]] · 6 in [[code-vs-code]] |

The seven `MATCHED`-only bodies still under *Entries by folder* and the 112 foot controls
are **outside** this ledger: they are the controls the findings quote by ID, they carry no
action, and the folder rule forbids filing a `MATCHED` entry as a gap.

## Entry #1 — the migration-head drift · `RESOLVED-DOC` 2026-10-06, all three carriers

> **RESOLVED-DOC 2026-10-06** — all three carriers corrected. `docs/07-data/migrations.md` §1 and
> `docs/07-data/README.md` in `1a1574c` *docs(07-data): fix 7 stale/false claims — gaps round 1*;
> repo-root `AGENTS.md` §2 in `8146c4e` *docs(AGENTS): fix migration head/count claim — gaps round 1*;
> `docs/98-history/sessions/WAVE6_EXIT_REPORT.md` in `310f582`
> *docs(98-history): annotate WAVE6 pre-squash counts — gaps round 1* — annotated, **not** rewritten,
> because that page is a dated 2026-09-21 record. The nested `D‑13` (head **in the tree** vs head
> **applied**) rode the same `1a1574c`.
>
> The entry text below is **verbatim** from the source audit, not rewritten here: the record is what
> the three docs *claimed* on 2026-10-06 beside what the tree *was*, and the reason this entry was
> filed first — that two of the three issue a *destructive* instruction computed from the wrong
> number — only reads as the finding it was if the wrong numbers stay legible.

**This is the first entry because it is the only gap with three independent carriers and a live
destructive consequence.** Every other entry is one doc disagreeing with the code. This one is three
docs disagreeing with each other *and* with the code, and two of them issue instructions computed from
the wrong number — so an agent that trusts any one of them authors a migration into a slot that has
been taken for months.

| Doc | Claim | Truth | Action |
|---|---|---|---|
| `AGENTS.md:70` §2 project-structure tree | 53 files, i.e. head `0053_camp_ownership.sql` | **40** files, head `0127_meals_tenant_composite_pk.sql` | `UPDATE-DOC` `AGENTS.md` — rewrite the tree's `migrations/` row to **40** files, head `0127`, and say `legacy/` = 99 |
| `docs/07-data/migrations.md:29` §1 | **"Current head: `0123_storefront_order_items_fk_pos_products.sql`** (37 files total: `0001`–`0014` + `0100`–`0123` minus reserved-absent `0109`, filesystem-verified" | **40** files, head `0127` — three migrations landed after this paragraph | `UPDATE-DOC` `migrations.md` §1 — 40 files / `0127_meals_tenant_composite_pk.sql`, and state the `0124`/`0126`/`0127` additions |
| `docs/98-history/sessions/WAVE6_EXIT_REPORT.md:23` | **"All 18 docs verified against code. Counts: 99 migrations (`0099_normalize_marketplace_payouts_ids.sql`)"** (repeated at `:27` and `:28`) | **40** files; 99 is the size of `legacy/` | `UPDATE-DOC` `WAVE6_EXIT_REPORT.md` — annotate the 99 as the pre-squash count that now lives in `legacy/`, keeping the 2026-09-21 record honest as of its own date |

- **Origin** consolidation entry, 2026-10-06 · the three carriers are named above · baselines `dee3124`
  (audit A) and `ddc63c6` (audit B) · re-verified directly against the tree for this entry
- **Source** `AGENTS.md` §2 · `docs/07-data/migrations.md` §1 "What migrations are" and §2 step 1 ·
  `docs/98-history/sessions/WAVE6_EXIT_REPORT.md` (header + Commits list)
- **Claim** three claims, quoted in the table above: 53 / `0053`, 37 / `0123`, 99 / `0099`
- **Expected** one migration ledger. Whichever number a doc states, it should be the number in
  `backend/migrations/`
- **Actual** `ls backend/migrations/*.sql | wc -l` → **40**. Highest-numbered:
  `0127_meals_tenant_composite_pk.sql`. Full sequence, all 40:
  `0001 0002 0003 0004 0005 0006 0007 0008 0009 0010 0011 0012 0013 0014 0100 0101 0102 0103 0104
  0105 0106 0107 0108 0110 0111 0112 0113 0114 0115 0116 0117 0118 0119 0120 0121 0122 0123 0124 0126
  0127` — the two blocks `0001`–`0014` then `0100`–`0127` with **`0109` and `0125` deliberately
  absent** (entry **A‑2**). There is **no top-level `0053*`** and **no top-level `0099*`**;
  `backend/migrations/legacy/` holds **99** files including `0053_camp_ownership.sql`,
  `0099_normalize_marketplace_payouts_ids.sql` and the never-applied
  `0076_sanitize_user_data.sql`, and is excluded from the lineage (entry **A‑3** / **D‑9**).
  `docs/07-data/migrations.md:37` §2 step 1 still instructs "Create
  `backend/migrations/0124_<slug>.sql` with the next number (head is `0123`)" while
  `backend/migrations/0124_guest_folios.sql` **exists** — entry **D‑2**, whose failure mode is
  destructive. `docs/09-plans/FINAL_IMPLEMENTATION_PLAN_v3_waves.md` reserves `0100_tip_amount.sql` as
  a free slot while `0100_add_project_id_nullable.sql` has been live for six migrations — entry
  **R‑12**.
- **The correct figures are already published in the vault**, twice, and both are right:
  `docs/01-architecture/ARCHITECTURE.md` §5 (**A‑1**: "40 top-level `.sql` files, head
  `0127_meals_tenant_composite_pk.sql`… It is *not* a contiguous range: `0001`–`0014`, then
  `0100`–`0127`") and `docs/07-data/README.md:64-69` (**D‑12**: "⚠️ **Migration-head drift is still
  live.** … The tree has **40** migrations with head `0127_meals_tenant_composite_pk.sql`"). The
  folder index caught it; the guide it indexes was missed. Keep the `07-data` callout until all three
  carriers are corrected, then delete it in the same commit that fixes the last one.
- **One distinction no doc carries** (`D‑13`): `0127`'s own header says **"⚠️ PENDING-APPLY. This
  file is committed but NOT applied to any database."** (`backend/migrations/0127_meals_tenant_composite_pk.sql:4-6`).
  So "head" means *highest in the tree*, not *applied*. Three docs state a head; none distinguishes
  the two meanings, and the tenant-import folder already reasons about `0127` as a landed change
  ("Reusable across tenants since 0127").
- **Class** STALE (all three claims — each was true of the pre-squash tree) → **FALSE in consequence**:
  the instructions derived from two of them (**D‑2**, **R‑12**) name slots that are taken
- **Severity** **P1**
- **Action** `UPDATE-DOC` — three separate edits, one per carrier, as itemised in the table above;
  then remove the `docs/07-data/README.md` drift callout
- **Controls** **A‑1**, **A‑2**, **A‑3**, **D‑9**, **D‑12** (all `MATCHED`) — reproduced under
  *Matched controls* below


## docs/01-architecture — 7 resolved

### A‑4 · [[ARCHITECTURE]] §5a — monitor D1 binding · **FALSE**

- **Origin** audit A entry `A‑4` · baseline `dee3124` · source `docs/01-architecture/ARCHITECTURE.md`
- **Source** `docs/01-architecture/ARCHITECTURE.md` — the section named in the heading above
- **Claim** "| D1 | `campmaster-monitor-db`, `migrations_dir = migrations` |"
- **Expected** a `[[d1_databases]]` binding in `monitor/wrangler.toml` naming `campmaster-monitor-db`
  with `migrations_dir = migrations`.
- **Actual** **`monitor/wrangler.toml` has no `[[d1_databases]]` block at all** (64 lines, full file
  read). Lines 14–21 say so explicitly: *"there is NO relational binding on this worker any more, and
  no `migrations/`"*. Storage is a single R2 bucket, `MONITOR_BUCKET` = `campmaster-monitor-media`
  (`monitor/wrangler.toml:39-41`). `monitor/migrations/` no longer exists and `monitor/src/db.js` was
  deleted. `campmaster-monitor-db` survives only as an orphaned Cloudflare resource the owner must delete
  manually.
- **Class** FALSE · **Severity** **P1** · **Action** UPDATE-DOC
- **Severity** P1 · **Action** UPDATE-DOC
- **Note** this is a *known* deferral, not a new discovery: the 2026-10-03 `mon-probe-selfcheck` logbook
  entry records it verbatim — *"the rest of that same `docs/ARCHITECTURE.md` monitor block still
  describes `D1 | campmaster-monitor-db, migrations_dir = migrations` … both untrue since the monitor's
  D1 migration completed (phases 1–7 …), i.e. this block has been describing a pre-R2 worker."*

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `3b753e4` *docs(01-architecture): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### A‑5 · [[ARCHITECTURE]] §5a — monitor retention wording · STALE

- **Origin** audit A entry `A‑5` · baseline `dee3124` · source `docs/01-architecture/ARCHITECTURE.md`
- **Source** `docs/01-architecture/ARCHITECTURE.md` — the section named in the heading above
- **Claim** "| Retention | cron-written tables are pruned (`checks` 14d, `reports` 30d, orphaned
  `alert_state`) |"
- **Expected** a daily prune over D1 tables named `checks` and `reports`, 14 and 30 days, plus
  orphaned alert state.
- **Actual** The day counts are still correct constants — `CHECKS_RETENTION_DAYS = 14`,
  `REPORTS_RETENTION_DAYS = 30` (`monitor/src/storage.js:48-49`), swept by `runRetention`
  (`monitor/src/index.js:1881-1882`). But the substrate is no longer tables: they are R2 objects under
  key prefixes `checks/<YYYY-MM-DD>/<HH-MM>.json` and `reports/…` (`monitor/wrangler.toml:26-27`).
  "tables" is a pre-R2 word for objects that no longer exist as tables.
- **Class** STALE · **Severity** P2 · **Action** UPDATE-DOC
- **Severity** P2 · **Action** UPDATE-DOC

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `3b753e4` *docs(01-architecture): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### A‑16 · [[ARCHITECTURE]] §4 — rate-limit policy table · prefix count FALSE

- **Origin** audit A entry `A‑16` · baseline `dee3124` · source `docs/01-architecture/ARCHITECTURE.md`
- **Source** `docs/01-architecture/ARCHITECTURE.md` — the section named in the heading above
- **Claim** "The limiter is a ~20-entry ordered policy table keyed `${cf-connecting-ip}:${path}` (first
  match wins) with per-entry env dials, plus a tenant-scoped second layer on **7 prefixes**; it keys on
  `cf-connecting-ip` only (not spoofable) and **fails closed** (429 on KV error)."
- **Expected** ~20 ordered entries; a tenant-scoped layer on 7 prefixes.
- **Actual** The table is `RATE_LIMIT_POLICIES` at `backend/src/middleware/rateLimit.js:25-112` — **23**
  entries (line range matches the doc's `rateLimit.js:25-113` code-reference), so "~20" is fair.
  First-match-wins confirmed by the header comment at `rateLimit.js:13`. Keying confirmed at
  `rateLimit.js:181-182`: `const ip = c.req.header('cf-connecting-ip') || 'unknown'`. Fail-closed
  confirmed at `:211` and `:246`: `c.json({ success: false, error: 'Rate limit check failed' }, 429)`.
  **The prefix count is wrong: the tenant-scoped second layer is mounted on 36 prefixes, not 7** —
  `grep -oE "app\.use\('/api/[^']*', tenantAwareLimiter\(\)\)"` over `backend/src/index.js` returns 36
  distinct mounts (`/api/admin/*`, `/api/ai/*`, `/api/audit/*`, `/api/categories/*`, `/api/crm/*`,
  `/api/financials/*`, `/api/folios/*`, `/api/hr/*`, `/api/inbox/*`, `/api/inventory/*`,
  `/api/leads/*`, `/api/meal-categories/*`, `/api/meals/*`, `/api/me/*`, `/api/orders/*`,
  `/api/plans/*`, `/api/pos-tables/*`, `/api/pos/*`, `/api/price-overrides/*`, `/api/products/*`,
  `/api/projects/items/*`, `/api/projects/links/*`, `/api/projects/:projectId/meta/*`,
  `/api/projects/:projectId/tags/*`, `/api/promotions/*`, `/api/rateplans/*`, `/api/reports/*`,
  `/api/rooms/*`, `/api/services/*`, `/api/storefront/*`, `/api/supply/*`, `/api/tags/*`,
  `/api/tenant/billing/*`, `/api/tenants/import/*`, `/api/tenants/:tenantId/meta/*`, `/api/upload/*`).
- **Class** FALSE (the 7-prefix figure) · **Severity** **P2** · **Action** UPDATE-DOC
- **Severity** P2 · **Action** UPDATE-DOC
- **Why it matters** 7 vs 36 understates the tenant-scoped surface by 5×, and this is the layer that makes
  multi-tenant rate limiting real. It was probably true when a handful of mounts existed and was never
  re-counted.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `3b753e4` *docs(01-architecture): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### A‑20 · [[ARCHITECTURE]] §7 — test-count table · three STALE rows

- **Origin** audit A entry `A‑20` · baseline `dee3124` · source `docs/01-architecture/ARCHITECTURE.md`
- **Source** `docs/01-architecture/ARCHITECTURE.md` — the section named in the heading above
- **Claim** (table) Backend unit **124** files / **2701** tests (`3f66503`) · Frontend unit **154** /
  **3611** (`09ff710`) · Monitor unit **7** / **72** (`921e871`) · Root integration **37** files /
  **255** registered.
- **Expected** the latest committed suite result for each suite.
- **Actual** Suites were **not** re-run (the mission says to read them, not to spend 90s+ per suite).
  Source: the latest suite result recorded per suite in
  `docs/98-history/sessions/AGENT_LOGBOOK_HISTORY.md` — `cd backend && npx vitest run` → **127 files /
  2743 tests** PASS (2026-10-02 `a2-saga-status`, re-confirmed same day by `a7-workstream-closure`);
  `cd app && npx vitest run` → **155 files / 3632 tests** PASS (2026-10-03 `tenant-outage-vs-404`);
  `cd monitor && npx vitest run` → **7 files / 191 tests** PASS (2026-10-03 `mon-probe-selfcheck`).
  So backend is **3 files / 42 tests** behind, frontend **1 file / 21 tests** behind, monitor **119
  tests** behind — monitor's count is off by more than 2×. Root integration 37/255 is the only row still
  current.
- **Class** STALE · **Severity** P2 · **Action** UPDATE-DOC
- **Severity** P2 · **Action** UPDATE-DOC
- **Mitigation already in the doc** each row is labelled with its producing commit, which is exactly why
  the drift is visible rather than authoritative. That design choice worked; it just needs a refresh.
- **Cross-doc** `QUICK_START.md` §4 carries a *third*, older set of numbers. See **Q‑4**.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `3b753e4` *docs(01-architecture): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### A‑21 · [[ARCHITECTURE]] §7 — E2E spec count and the `AGENT_LOGBOOK.md` pointer · STALE

- **Origin** audit A entry `A‑21` · baseline `dee3124` · source `docs/01-architecture/ARCHITECTURE.md`
- **Source** `docs/01-architecture/ARCHITECTURE.md` — the section named in the heading above
- **Claim** "`tests/e2e/` now holds 96 spec files across 8 Playwright projects (`marketplace`, `tenant`,
  `admin`, `auth`, `cross-cutting`, `pos`, `public`, `routing`)." and "The last full gate recorded in
  `AGENT_LOGBOOK.md` is 919 passed / 0 failed / 15 env-skipped (2026-09-06, per-project)."
- **Expected** 96 specs, 8 projects, and the gate figure still findable in `AGENT_LOGBOOK.md`.
- **Actual** `find tests/e2e -name "*.spec.ts" | wc -l` → **96**. Eight projects named exactly as listed,
  `playwright.config.ts:…`. **The gate figure is no longer in `AGENT_LOGBOOK.md`** — that file is 182
  lines and now holds only the persistent-learnings tier; the append-only task history (9,725 lines)
  moved to `docs/98-history/sessions/AGENT_LOGBOOK_HISTORY.md` in the 2026-10-06 restructure, and the
  919/0/15 line lives there. The pointer is dangling.
- **Class** STALE (pointer) · **Severity** P2 · **Action** UPDATE-DOC
- **Severity** P2 · **Action** UPDATE-DOC
- **Credit where due** the counts themselves are exact and the decision to publish *no* E2E total rather
  than a remembered one is the right call. Only the citation needs re-pointing.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `3b753e4` *docs(01-architecture): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### A‑26 · [[ARCHITECTURE]] — header provenance

- **Origin** audit A entry `A‑26` · baseline `dee3124` · source `docs/01-architecture/ARCHITECTURE.md`
- **Source** `docs/01-architecture/ARCHITECTURE.md` — the section named in the heading above
- **Claim** "Verified against `dbcb382` on 2026-10-02." while §5 in the same file says "At `dbcb382` that is
  **40 top-level `.sql` files**, head `0127`".
- **Expected** the named commit is an ancestor and its content matches the file.
- **Actual** `dbcb382` resolves in history, but the file has been edited since (the 0127 half was
  committed later) and HEAD is now `dee3124`. So the header names a commit that no longer matches the
  file's own §5, which cites the same commit for a number that commit did not have.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC
- **Severity** P3 · **Action** UPDATE-DOC

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `3b753e4` *docs(01-architecture): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### Q‑4 · §4 — test counts · **a third, older set** · STALE

- **Origin** audit A entry `Q‑4` · baseline `dee3124` · source `docs/01-architecture/QUICK_START.md`
- **Source** `docs/01-architecture/QUICK_START.md` — the section named in the heading above
- **Claim** (block) "backend unit: 2225 tests / 84 files · frontend unit: 3416 tests / 137 files · root
  integration: 255 tests / 37 files · E2E: 929 total / 919 gate (14 env-skipped)"
- **Expected** agreement with `ARCHITECTURE.md` §7 and with the logbook.
- **Actual** Latest committed results (`AGENT_LOGBOOK_HISTORY.md`, same source as **A‑20**): backend
  **127 / 2743**, frontend **155 / 3632**, monitor **7 / 191**. Root integration 37/255 is the one row
  still right. E2E: `ARCHITECTURE.md` §7 deliberately publishes **no** total, while this file still
  prints "929 total / 919 gate" and says **14** env-skipped where `ARCHITECTURE.md` says **15** — the two
  in-scope docs disagree with each other on a number neither can source.
- **Class** STALE · **Severity** P2 · **Action** UPDATE-DOC
- **Severity** P2 · **Action** UPDATE-DOC
- **Severity rationale** raised above P3 because this is not one drifted number in one doc: three
  different count sets for the same suites are live in the same folder, and the E2E total this file
  preserves is precisely the figure the sibling doc's design decision deleted for being unverifiable.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `3b753e4` *docs(01-architecture): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

## docs/02-api — 9 resolved

### C‑1 · [[API_CONTRACT]] §1 — exported function count · STALE

- **Origin** audit A entry `C‑1` · baseline `dee3124` · source `docs/02-api/API_CONTRACT.md`
- **Source** `docs/02-api/API_CONTRACT.md` — the section named in the heading above
- **Claim** "`app/src/lib/api.ts` — a typed client with **~276 exported functions** covering every
  endpoint the frontend uses."
- **Expected** ≈276.
- **Actual** `app/src/lib/api.ts` is **2,838 lines** (the `api.ts:1-2838` code-reference is exact).
  `export … function` declarations: **286**. Plus one exported const (`API_BASE`) → 287 exported
  callables/symbols. Plus 60 `export type|interface`.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC
- **Severity** P3 · **Action** UPDATE-DOC
- **Direction** the client has *grown* past the stated figure, so the claim understates coverage. The
  repo `README.md` was already corrected to "~290" by the same 2026-10-02 pass; this file was missed.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `0ce48fd` *docs(02-api): fix 13 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### C‑2 · [[API_CONTRACT]] §2 + §5 — generated types and the system row · **`/api/health` is FALSE**

- **Origin** audit A entry `C‑2` · baseline `dee3124` · source `docs/02-api/API_CONTRACT.md`
- **Source** `docs/02-api/API_CONTRACT.md` — the section named in the heading above
- **Claim** §2: "`backend/openapi.json` — generated OpenAPI 3 document … `npm run gen:openapi` …
  `npm run gen:types` … the Worker serves the schema at `/api/openapi.json`." §5 table, System row:
  "`/api/openapi.json`, `/api/health` | schema + health".
- **Expected** both endpoints exist; `/api/health` at that path.
- **Actual** `index.js:477` `app.get('/api/openapi.json', …)` ✓ and `backend/openapi.json` exists
  (OpenAPI 3.0.0, 88 paths, `servers[0] = https://sinaicamps.com`). **The health endpoint is `/healthz`,
  not `/api/health`** — `backend/src/index.js:164` `app.get('/healthz', async (c) => {` returning
  `{ status, version: '3.0.0', checks: { database, kv, r2 } }`. `grep -E "app\.(get|post)\('/(api/)?health"`
  returns that one line only. Neither `/healthz` nor `/api/openapi.json` appears in `openapi.json`.
- **Class** FALSE (the `/api/health` path) · **Severity** P2 · **Action** UPDATE-DOC
- **Severity** P2 · **Action** UPDATE-DOC
- **Severity rationale** a wrong URL in the one table a client author reads before wiring a monitor or
  an uptime check.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `0ce48fd` *docs(02-api): fix 13 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### C‑3 · [[API_CONTRACT]] §3 — RBAC hierarchy · **FALSE, and it contradicts [[ARCHITECTURE]]**

- **Origin** audit A entry `C‑3` · baseline `dee3124` · source `docs/02-api/API_CONTRACT.md`
- **Source** `docs/02-api/API_CONTRACT.md` — the section named in the heading above
- **Claim** "| Admin dashboard | JWT (`env.JWT_SECRET`) | `Authorization: Bearer <jwt>` | Admin/owner
  panel, RBAC hierarchy: `admin` > `staff` |"
- **Expected** a two-rank hierarchy naming `staff`.
- **Actual** **There is no `staff` role.** `app/src/lib/rbac.ts:7-12` is `super_admin: 100, admin: 80,
  manager: 50, cashier: 30`, mirroring `ROLE_RANKS` in `backend/src/middleware/requireAuth.js`. The
  string `'staff'` appears in the frontend only as a **nav-tab id** (`AdminApp.tsx:146` `{ id: 'staff',
  label: 'Staff', icon: IconStaff }`, `:437` `case 'staff':`) and a drilldown view name
  (`TenantDrilldown.tsx:35,160`) — a UI grouping over the `pos_users`-backed `StaffPanel`, not a rank.
- **Class** FALSE · **Severity** **P2** · **Action** UPDATE-DOC
- **Severity** P2 · **Action** UPDATE-DOC
- **Note** this exact error was found and fixed in `ARCHITECTURE.md` by the 2026-10-02 `a5` pass — whose
  logbook entry says *"**role hierarchy admin > staff** — there is no `staff` role"* — and left in place
  here. The two docs in this audit now disagree about the authorization model of the admin dashboard.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `0ce48fd` *docs(02-api): fix 13 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### C‑7 · [[API_CONTRACT]] §7 — 401 vs 403 · **all eleven strings verbatim**

- **Origin** audit A entry `C‑7` · baseline `dee3124` · source `docs/02-api/API_CONTRACT.md`
- **Source** `docs/02-api/API_CONTRACT.md` — the section named in the heading above
- **Claim** The 401/403 message table, and "Checks run in this order — signature → token-type → realm →
  role → activity → tenant scope (`evaluate`, requireAuth.js) — so the FIRST failure wins."
- **Expected** every message byte-identical, and the order.
- **Actual** **All eleven messages match verbatim**, in both files:
  `requireAuth.js:66` `'Missing or invalid Authorization header'` (401),
  `:67` `'Session expired or invalid signature'` (401),
  `:68` `'Forbidden: POS sessions are not allowed to access admin routes'` (403),
  `:69` `'Forbidden: Insufficient permissions'` (403),
  `:70` `'Account deactivated'` (401),
  `:71` `'Forbidden: Access denied to this tenant partition'` (403);
  `resolveScope.js:200` `'Forbidden: project scope mismatch'` (403),
  `:208,236` `'Unauthorized: missing tenant context'` (401),
  plus `'Invalid token type'` as the documented `typeMismatch` override. The role-scope claims hold:
  `pos-users.js:100` `roles: ['super_admin', 'admin']`; the SSE gate at `index.js:431-440` is
  `realm: 'admin'`, `roles: ['admin','super_admin']`, so POS sessions and non-admins get 403 as documented.
  **The stated order is incomplete**: `evaluate()` inserts a **1b NULL-tenant hard guard**
  (`requireAuth.js:160-163`, `if (decoded.role !== 'super_admin' && !decoded.tenantId) return
  deny(options, 'scopeDenied')`) *before* the token-type check, with a comment saying it runs "before
  type/realm/role checks". So the true order is signature → null-tenant → token-type → realm → role →
  activity → tenant.
- **Class** MATCHED (messages) + STALE (the order sentence) · **Severity** P3 · **Action** UPDATE-DOC
- **Severity** P3 · **Action** UPDATE-DOC
- **Credit** this is the most carefully written section in the three folders: every string is right, and
  the doc's own "Where" column points at real lines. The single omission is an *extra* gate, not a
  missing one — the doc errs toward understating the strictness of the gate, never toward overstating it.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `0ce48fd` *docs(02-api): fix 13 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### S‑2 · [[API_SURFACE_MAP]] — Frontend Function column · **64 of 249 do not exist** · **P1**

- **Origin** audit A entry `S‑2` · baseline `dee3124` · source `docs/02-api/API_SURFACE_MAP.md`
- **Source** `docs/02-api/API_SURFACE_MAP.md` — the section named in the heading above
- **Claim** 268 rows each naming a `Frontend Function` from `app/src/lib/api.ts`, e.g. `createCategory(data)`,
  `getSettings()`, `updateSettings(data)`, `getMarketplaceProjects(params?)`,
  `addCrmTicketComment(ticketId, content, internal?)`, `getPublicServices(slug)`, `createPlan(data)`.
- **Expected** every named export resolves in `app/src/lib/api.ts`.
- **Actual** 249 distinct function names are referenced across the section. **64 have no definition
  anywhere under `app/src`.** Verified two ways: (a) absence from the 287-symbol export set, and (b) a
  direct search for six spot-checks — `addCrmTicketComment`, `getSettings`, `updateSettings`,
  `getMarketplaceProjects`, `createPlan`, `getPublicServices` — across every `.ts`/`.tsx`/`.astro` file in
  `app/src`, which returned **nothing**. Full list of the 64: `addCrmTicketComment`, `adjustSupplyStock`,
  `assignServiceBooking`, `confirmSupplyTransfer`, `createAiAutomationRule`, `createAiPriceRule`,
  `createCategory`, `createCrmContact`, `createCrmKnowledgeArticle`, `createCrmLead`,
  `createCrmOpportunity`, `createCrmTask`, `createCrmTicket`, `createInventoryAdjustment`, `createPlan`,
  `createServiceAvailabilitySlot`, `createServiceDefinition`, `createServiceItem`,
  `createStorefrontBlogPost`, `createStorefrontPage`, `createSupplyBom`,
  `createSupplyManufacturingOrder`, `createSupplyPurchaseOrder`, `createSupplyTransfer`,
  `createSupplyWarehouse`, `deleteAiPriceRule`, `deleteInboxItem`, `deleteTag`, `getAiForecast`,
  `getInventoryAdjustments`, `getMarketplaceProjects`, `getMarketplaceReviews`,
  `getMarketplaceTenantProfile`, `getPublicServices`, `getReorderSuggestions`, `getServiceAvailability`,
  `getServiceBooking`, `getServiceDefinition`, `getServiceItem`, `getServiceReviews`, `getSettings`,
  `getTag`, `getTenantMeta`, `progressSupplyManufacturingOrder`, `receiveSupplyPurchaseOrder`,
  `setProjectTags`, `setTenantMeta`, `submitMarketplaceReview`, `submitServiceReview`, `updateAiPriceRule`,
  `updateCategory`, `updateCrmContact`, `updateCrmLeadStatus`, `updateCrmOpportunityStage`,
  `updateCrmTaskStatus`, `updatePlan`, `updateServiceBookingStatus`, `updateServiceDefinition`,
  `updateServiceItem`, `updateServicePricing`, `updateSettings`, `updateStorefrontBlogPost`,
  `updateStorefrontPage`, `updateTag`.
  They cluster by domain: all of Services (12), CRM (8), Supply (8), Financial (7), Tags (5), Meta (4),
  Storefront CMS (4), Inventory (3), AI (5), Marketplace (4), Plans (2), Categories (2).
- **Class** FALSE · **Severity** **P1** · **Action** UPDATE-DOC
- **Severity** P1 · **Action** UPDATE-DOC
- **Severity rationale** the Endpoint column of the same rows is real (S‑11), so a reader has no internal
  signal that this column is not. Following it produces TypeScript that will not compile, in 30+ domains.
  The correct fix is per-row: replace the name with `—`, or point at whatever the client actually calls.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `0ce48fd` *docs(02-api): fix 13 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### S‑3 · [[API_SURFACE_MAP]] — React Hook column · **120 of 195 do not exist** · **P1**

- **Origin** audit A entry `S‑3` · baseline `dee3124` · source `docs/02-api/API_SURFACE_MAP.md`
- **Source** `docs/02-api/API_SURFACE_MAP.md` — the section named in the heading above
- **Claim** 195 distinct `use*` names across the same rows, e.g. `useTagsQuery()`, `useCrmContactsQuery()`,
  `useStorefrontProductsQuery()`, `useSuperCRMOverviewQuery()`, `useTaxRatesQuery()`.
- **Expected** every named hook is exported from `app/src/hooks/`.
- **Actual** `app/src/hooks/` holds exactly five files: `useAdminData.ts`, `usePosQueries.ts`,
  `useQueryHooks.ts`, `useSseInbox.ts`, `useSseOrders.ts`. Enumerating every `export const|function` in
  all 632 exported `use*` symbols across `app/src/**/*.ts{,x}` (plus `export {}` blocks) leaves **120**
  of the 195 documented hooks unaccounted for, including every `useTag*`, `useStorefront*`,
  `useSuper*`, `useTax*`, `useFinancial*`, `useHr*`, `useSupply*`, `useCr*`, `useService*`,
  `useAi{Automation,Prediction,Price}*` and `useMarketplace*` hook. `useQueryHooks.ts` is 1,891 lines with
  113 top-level exports, and `useCrmContactsQuery` genuinely exists at `useQueryHooks.ts:1549` — which is
  why the sample count (75/195) looks plausible until you check all 195. Full 120-name list is
  reproducible with the method in S‑2.
- **Class** FALSE · **Severity** **P1** · **Action** UPDATE-DOC
- **Severity** P1 · **Action** UPDATE-DOC
- **Severity rationale** same as S‑2 and worse in one respect: the hooks file is the documented
  integration surface ("TanStack Query hooks generated per endpoint group"), so a reader concludes the
  generation is incomplete rather than that the table is wrong.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `0ce48fd` *docs(02-api): fix 13 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### S‑4 · [[API_SURFACE_MAP]] — DB Tables column · **13 of 84 tables do not exist** · **P1**

- **Origin** audit A entry `S‑4` · baseline `dee3124` · source `docs/02-api/API_SURFACE_MAP.md`
- **Source** `docs/02-api/API_SURFACE_MAP.md` — the section named in the heading above
- **Claim** 84 distinct table names in the `DB Tables` column, including `ai_predictions`,
  `ai_price_rules`, `ai_automation_rules`, `ai_automation_logs`, `crm_contacts`, `crm_leads`,
  `crm_opportunities`, `crm_tickets`, `crm_ticket_comments`, `crm_knowledge_articles`,
  `storefront_pages`, `storefront_cart`, `storefront_cart_items`, `storefront_blog_posts`.
- **Expected** each named table exists in the migration lineage.
- **Actual** Harvesting every `CREATE TABLE` from all 139 `.sql` files under `backend/migrations/`
  (40 top-level + 99 legacy) yields 199 distinct table names; **13 of the 84 claimed tables are in
  neither set**, and a wider `grep -rl "\b<table>\b" backend/migrations --include=*.sql` returns **0
  files** for each — so they appear under no SQL verb at all, in either lineage. The 13 are exactly:
  `ai_automation_logs`, `ai_automation_rules`, `ai_predictions`, `ai_price_rules`, `crm_contacts`,
  `crm_knowledge_articles`, `crm_opportunities`, `crm_ticket_comments`, `crm_tickets`,
  `storefront_blog_posts`, `storefront_cart`, `storefront_cart_items`, `storefront_pages`.
  (`crm_leads` *does* exist and is not in the failing set.)
- **Class** FALSE · **Severity** **P1** · **Action** UPDATE-DOC
- **Severity** P1 · **Action** UPDATE-DOC
- **Severity rationale** combined with S‑2 and S‑3 this means a third independent column of the same
  table is also unbacked. Three columns of asserted plumbing, none of the three cross-checkable against
  the code.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `0ce48fd` *docs(02-api): fix 13 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### S‑5 · [[API_SURFACE_MAP]] — `/products/:id` GET marked "OpenAPI-registered" · FALSE

- **Origin** audit A entry `S‑5` · baseline `dee3124` · source `docs/02-api/API_SURFACE_MAP.md`
- **Source** `docs/02-api/API_SURFACE_MAP.md` — the section named in the heading above
- **Claim** "| `/products/:id` | GET | — | `GET /api/products/:id` | `products`, `product_lang` | — |
  Get single product (**OpenAPI-registered**; no client wrapper/hook found) |"
- **Expected** a `get` operation on `/api/products/{id}` in `backend/openapi.json`.
- **Actual** `backend/openapi.json` → `/api/products/{id}` has operations **put, delete** only. No `get`.
  The same annotation error repeats twice more: `/rateplans/:id` GET is called "OpenAPI-registered" but
  `/api/rateplans/{id}` has **put, delete** only; and `/meal-schedules/:id` GET and PUT are both listed
  while `/api/meal-schedules/{id}` has **delete** only.
- **Class** FALSE · **Severity** P2 · **Action** UPDATE-DOC
- **Severity** P2 · **Action** UPDATE-DOC
- **Severity rationale** "OpenAPI-registered" is the annotation a reader uses to decide whether a route is
  documented or accidental. Three rows tell them the opposite of the truth.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `0ce48fd` *docs(02-api): fix 13 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### S‑6 · [[API_SURFACE_MAP]] — Marketplace rows list the `camps` table · **FALSE**

- **Origin** audit A entry `S‑6` · baseline `dee3124` · source `docs/02-api/API_SURFACE_MAP.md`
- **Source** `docs/02-api/API_SURFACE_MAP.md` — the section named in the heading above
- **Claim** "| `/marketplace/projects` | GET | `getMarketplaceProjects(params?)` | … | `camps`, `tenants`,
  `project_meta` |" and the two rows below it list `camps`.
- **Expected** `camps` to be a real table, or to be `projects`.
- **Actual** `camps` exists **only** in the excluded `legacy/` lineage — `legacy/0001_init.sql:20`
  `CREATE TABLE camps`, dropped by `legacy/0063_rename_camps_to_projects.sql:60`. No `FROM camps` /
  `JOIN camps` / `INTO camps` exists in `backend/src`; the only occurrence outside legacy is a *comment*,
  `backend/src/routes/registry.js:285` `// Wire rows: \`SELECT * FROM camps\``, and a comment in
  `backend/migrations/0104_provision_default_projects.sql:15`. **This file contradicts itself 200 lines
  earlier**: its own Camps section says "There is no `camps` table — the table is `projects`".
- **Class** FALSE · **Severity** **P1** · **Action** UPDATE-DOC
- **Severity** P1 · **Action** UPDATE-DOC

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `0ce48fd` *docs(02-api): fix 13 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

## docs/03-frontend — 8 resolved

### F‑2 · [[COMPONENT_CATALOG]] §2 — admin panel count · **STALE by 38 files** · **P1**

- **Origin** audit A entry `F‑2` · baseline `dee3124` · source `docs/03-frontend/COMPONENT_CATALOG.md`
- **Source** `docs/03-frontend/COMPONENT_CATALOG.md` — the section named in the heading above
- **Claim** "## 2. Admin — `components/admin/` (**25 files**) `AdminApp.tsx` + panels: `BookingCalendar`,
  `CampsPanel`, `DashboardPanel`, `InboxPanel`, `ListingWizard` (+ `PhotosStep`), `LowStockPanel`,
  `MealsPanel`, `MenuPanel`, `MenuPlannerPanel`, `OrdersPanel`, `PasswordPanel`, `PlanningPanel`,
  `RatePlansPanel`, `ReportsPanel`, `RoomsPanel`, `SettingsPanel`, `StaffPanel`, `SuperDashboardPanel`,
  `SuperOrdersPanel`, plus auth pages (`ForgotPasswordPage`, `RegisterPage`, `ResetPasswordPage`) and
  `icons.tsx`."
- **Expected** 25 files; every named file present.
- **Actual** `find app/src/components/admin -type f` → **63 files** (all `.tsx`). Every one of the 23 named
  components exists (verified individually), so the enumeration is correct — it is the *count* and the
  *coverage* that are wrong. **40 files are undocumented**, including every major feature area added
  since: `AIPanel`, `AnalyticsPanel`, `AuditLogPanel`, `BillingPanel`, `BrowserAIPanel`, `CashDeskPanel`,
  `CRMPanel`, `DynamicForm`, `FeedbackPanel`, `FinancialPanel`, `FolioDetail`, `FolioReceipt`, `FoliosPanel`,
  `HRPanel`, `PaymentReceipt`, `ProjectItemsPanel`, `PromotionsPanel`, `RecordPaymentModal`,
  `ServiceBookingsPanel`, `ServicesPanel`, `StorefrontPanel`, `SubscriptionsPanel`, `SuperAIPanel`,
  `SuperCRMPanel`, `SuperFinancialsPanel`, `SuperHRPanel`, `SuperReportsPanel`, `SuperStorefrontPanel`,
  `SuperSupplyPanel`, `SuperTenantsPanel`, `SupplyPanel`, `SystemHealthPanel`, `SystemSettingsPanel`,
  `TenantDrilldown`, `TenantImportPanel`, `TenantPerformancePanel`, `UsersPanel`, plus `AdminShell.tsx`
  (one of the two `client:only` shell islands, A‑8).
- **Class** STALE · **Severity** **P1** · **Action** UPDATE-DOC
- **Severity** P1 · **Action** UPDATE-DOC
- **Severity rationale** the front-matter tag already says `needs-refresh`, so the doc knows — but this is
  the layer-1 inventory a reader uses to find a panel, and 40 of 63 panels (64%) are invisible in it. Note
  that `PERF_BASELINE.md` (P‑9) counts "**All 48** admin/super-admin panels" as `React.lazy` from
  `AdminApp.tsx:60-107` — a number that contradicts both 25 and 63, and is the one that is actually
  right about the render graph. The doc set has three different answers and no reconciliation.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `8b01b00` *docs(03-frontend): fix 11 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### F‑4 · [[COMPONENT_CATALOG]] §3 — POS views count · STALE

- **Origin** audit A entry `F‑4` · baseline `dee3124` · source `docs/03-frontend/COMPONENT_CATALOG.md`
- **Source** `docs/03-frontend/COMPONENT_CATALOG.md` — the section named in the heading above
- **Claim** "## 3. POS — `components/pos/` (**8 views**) `CartPanel`, `DashboardView`, `LoginView`,
  `OrdersView`, `ProductsView`, `ReceiptModal`, `ShiftDashboard`, `ShiftOverlay` + supporting files."
- **Expected** 8 view files; the eight named present.
- **Actual** `ls app/src/components/pos/views/` → **11**: the eight named, plus **`KitchenView.tsx`**,
  **`ProjectPicker.tsx`**, **`TableView.tsx`**. (Total under `components/pos/` is 14 files: 11 views +
  `POSApp.tsx` + `PosShell.tsx` + `types.ts`.) `PosShell.tsx` is the second `client:only` island (A‑8).
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC
- **Severity** P3 · **Action** UPDATE-DOC
- **UNDOCUMENTED (P3)** the three extra views. `TableView.tsx` is the restaurant-table surface that
  `API_SURFACE_MAP.md` documents as `/pos-tables/*`, so its absence from the catalog means the POS table
  feature has no layer-1 entry point anywhere in scope.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `8b01b00` *docs(03-frontend): fix 11 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### F‑5 · [[COMPONENT_CATALOG]] §5 — hooks

- **Origin** audit A entry `F‑5` · baseline `dee3124` · source `docs/03-frontend/COMPONENT_CATALOG.md`
- **Source** `docs/03-frontend/COMPONENT_CATALOG.md` — the section named in the heading above
- **Claim** "## 5. Hooks — `hooks/` (**5**) `useAdminData`, `useApiError`, `useQueryHooks`, `useSseInbox`,
  `useSseOrders`."
- **Expected** 5 files; the five named present.
- **Actual** `ls app/src/hooks/ | wc -l` → **5**: `useAdminData.ts`, `usePosQueries.ts`, `useQueryHooks.ts`,
  `useSseInbox.ts`, `useSseOrders.ts`. **Four of the five names are right; `useApiError` does not exist**
  and `usePosQueries` — the entire POS data layer, a real 5th file — is not listed.
- **Class** STALE (one wrong name, one omission) · **Severity** P3 · **Action** UPDATE-DOC
- **Severity** P3 · **Action** UPDATE-DOC
- **Note** the `useApiError` error is a known repo-wide one: the 2026-10-02 `a5` logbook entry records it
  as *"REPORTED-NOT-FIXED … `AGENTS.md` §2 and `README.md` still list a `useApiError` hook that does not
  exist on disk"*. This file is a third carrier of the same phantom. It is P3 rather than P2 precisely
  because it is already documented as a known defect elsewhere — but that also means it has now survived
  three separate documentation passes.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `8b01b00` *docs(03-frontend): fix 11 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### F‑7 · [[COMPONENT_CATALOG]] §7 — stories · **all eight named stories do not exist** · **P2**

- **Origin** audit A entry `F‑7` · baseline `dee3124` · source `docs/03-frontend/COMPONENT_CATALOG.md`
- **Source** `docs/03-frontend/COMPONENT_CATALOG.md` — the section named in the heading above
- **Claim** "`stories/` mirrors the UI primitives — **8 new a11y stories were added with the T9 expansion
  (Checkbox, Radio, Switch, Textarea, FormField, Separator, Tooltip, Accordion)** alongside the
  pre-existing set."
- **Expected** 8 story files for those 8 components.
- **Actual** `find app -name "*.stories.*" -not -path "*/node_modules/*"` → **10 files** in
  `app/src/stories/`: `Badge`, `Button`, `Card`, `DataTable`, `EmptyState`, `Input`, `LoadingSpinner`,
  `Modal`, `StatCard`, `Toast`. **Not one of the eight named components has a story** — and per **F‑1**,
  none of the eight even has a source file, so a story for them could not exist. Every real story belongs
  to a component that *does* have a file.
- **Class** FALSE · **Severity** P2 · **Action** UPDATE-DOC
- **Severity** P2 · **Action** UPDATE-DOC
- **Severity rationale** the claim has a specific shape — a named PR-era deliverable with an exact
  component list — and every element of that shape is wrong. It also inverts the catalog's own honest §1
  finding ("these 9 have no file") by then claiming stories for them.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `8b01b00` *docs(03-frontend): fix 11 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### P‑1 · [[PERF_BASELINE]] header vs §Status — the TBT threshold contradicts itself · **FALSE**

- **Origin** audit A entry `P‑1` · baseline `dee3124` · source `docs/03-frontend/PERF_BASELINE.md`
- **Source** `docs/03-frontend/PERF_BASELINE.md`, header block and the `**Status**:` paragraph
- **Claim** (header) "TBT threshold is **300ms** in harness (`tests/lighthouse/run.ts`), **not 200ms**."
  vs (Status) "Active enforcement now lives in `app/budget.json` + `npm run lighthouse` (T15, 2026-08-13) —
  the same targets (**CLS < 0.1, LCP < 2.5 s, TBT < 200 ms**, resource sizes) are enforced there against a
  live preview URL."
- **Expected** the two paragraphs to agree.
- **Actual** Three separate facts, none matching the Status paragraph. (1) `tests/lighthouse/run.ts:52`
  `const LIGHTHOUSE_TARGETS = { cls: 0.1, lcpMs: 2500, tbtMs: 300, enforced: false };` — **300 ms**, and
  **`enforced: false`**. (2) `app/budget.json` (33 lines) contains **no CLS, LCP or TBT target at all** —
  only Lighthouse *resource* budgets: `script` 300, `stylesheet` 100, `image` 1500, `font` 400, `total`
  2500, all `metric: "transferSize"`. There is no 200 ms anywhere in `budget.json`. (3) The committed
  `tests/lighthouse/lighthouse-baseline.json` records `"targets":{"cls":0.1,"lcpMs":2500,"tbtMs":300,
  "enforced":false}` and `"note":"Dev/preview server baseline … Not enforced this pass."`
- **Class** FALSE · **Severity** **P2** · **Action** UPDATE-DOC
- **Severity** P2 · **Action** UPDATE-DOC
- **Severity rationale** "Active enforcement now lives in app/budget.json" is the sentence that tells an
  operator where the perf gate *is*. It is wrong about which metrics live there, wrong about the TBT
  number (200 vs the actual 300, which the same file's header corrects two paragraphs earlier), and wrong
  about `enforced: false` being "active". The file's own header is the accurate one — the doc contradicts
  itself, which is worse than either version being merely stale.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `8b01b00` *docs(03-frontend): fix 11 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### Y‑1 · [[03-frontend/README]] — "four public islands exist by design" · **FALSE**

- **Origin** audit A entry `Y‑1` · baseline `dee3124` · source `docs/03-frontend/README.md`
- **Source** `docs/03-frontend/README.md` §Concepts
- **Claim** "**Islands are rationed** — **four** public islands exist by design. `client:visible` for
  below-fold content, and adding an island is a deliberate cost, not a default."
- **Expected** 4 public islands.
- **Actual** **9** public-facing island directive sites, from the census in **A‑8**:
  `client:visible` ×6 — `CampBooking` inside `TenantLanding.astro:203`, `MarketplaceDirectory` in
  `marketplace.astro:14`, and the four storefront islands at `storefront/index.astro:54`,
  `storefront/cart.astro:52`, `storefront/checkout.astro:53`,
  `storefront/order/[orderNumber]/confirmation.astro:54`; `client:load` ×3 —
  `ReservationSummary` in `BookPage.astro:45`, `TenantMenu` in `MenuPage.astro:48`, and the debug-gated
  `DebugFeedbackWidget` in `PublicLayout.astro:778`. The 8 `client:only` sites are SPA hosts, not content
  islands. So the honest figures are **8** public content islands plus 1 debug-gated widget, or **9** if the
  debug widget counts.
- **Class** FALSE · **Severity** P2 · **Action** UPDATE-DOC
- **Severity** P2 · **Action** UPDATE-DOC
- **Severity rationale** the number 4 comes from the repo's `AGENTS.md`, which predates the storefront
  islands. `ARCHITECTURE.md` §3 in this same audit counts 17 total sites (6 visible / 3 load) and is
  right; this README is wrong in a way that would let the next agent add four more "since there are only
  four" — the exact failure the rationing rule exists to prevent. The "islands are rationed" *intent* is
  correct and worth keeping; only the count needs the storefronts folded in.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `8b01b00` *docs(03-frontend): fix 11 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### Y‑2 · [[03-frontend/README]] — "nothing fetches data outside `@/lib/api`"

- **Origin** audit A entry `Y‑2` · baseline `dee3124` · source `docs/03-frontend/README.md`
- **Source** `docs/03-frontend/README.md` — the section named in the heading above
- **Claim** "**Hooks are the data layer** — `useAdminData`, `useQueryHooks`, `useApiError`, `useSseInbox`,
  `useSseOrders`. The admin SPA runs entirely on TanStack Query; nothing fetches data outside `@/lib/api`."
- **Expected** the hook list to be the real one; no data fetch bypassing the client.
- **Actual** Three of the five names are right; `useApiError` does not exist and `usePosQueries` is
  missing — the same defect as **F‑5**. The TanStack Query / `@/lib/api` claim is confirmed by **F‑3**
  (zero network `fetch` under admin and pos; all 9 `fetch(`-shaped hits are `refetch()`).
- **Class** STALE (hook names) / MATCHED (the fetch claim) · **Severity** P3 · **Action** UPDATE-DOC
- **Severity** P3 · **Action** UPDATE-DOC

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `8b01b00` *docs(03-frontend): fix 11 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### Y‑3 · [[03-frontend/README]] — "app/budget.json holds the enforced limits"

- **Origin** audit A entry `Y‑3` · baseline `dee3124` · source `docs/03-frontend/README.md`
- **Source** `docs/03-frontend/README.md` — the section named in the heading above
- **Claim** "**Bundle budget** — `app/budget.json` holds the enforced limits; `PERF_BASELINE.md` records
  what browsers actually download, the top-15 chunks and the top-3 suspects."
- **Expected** `budget.json` to hold the enforced limits.
- **Actual** `app/budget.json` holds five Lighthouse **resource-size** budgets (`script` 300,
  `stylesheet` 100, `image` 1500, `font` 400, `total` 2500 KB, all `metric: "transferSize"`). It is
  genuinely consumed by the tool — `app/package.json`'s `lighthouse` script passes
  `--budget-path=budget.json` — so "enforced" is right **for resource sizes** and wrong as an unqualified
  statement: the CLS/LCP/TBT targets the sibling doc attributes to this file are in
  `tests/lighthouse/run.ts:52` and are `enforced: false`.
- **Class** STALE · **Severity** P2 · **Action** UPDATE-DOC
- **Severity** P2 · **Action** UPDATE-DOC
- **Note** this is the same defect as **P‑1** seen from the third doc that carries it. The
  `budget.json` → "CLS/LCP/TBT" → "200 ms" → "enforced" chain is stated three times across two folders and
  is wrong in each.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `8b01b00` *docs(03-frontend): fix 11 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

## docs/04-testing — 9 resolved

### T‑1 · [[TESTING]] suite table — backend and frontend rows · STALE

- **Origin** audit B entry `T‑1` · baseline `ddc63c6` · source `docs/04-testing/TESTING.md`
- **Source** `docs/04-testing/TESTING.md` — the section named in the heading above
- **Claim** "| Backend unit | `cd backend && npx vitest run` | **2610 tests / 115 files** |" ·
  "| Frontend unit | `cd app && npx vitest run` | **3561 tests / 149 files** |"
- **Expected** the latest committed result for each.
- **Actual** Backend **2743 / 127**, frontend **3632 / 155** (**T‑0**). Backend is 3 files / 133
  tests behind; frontend 1 file / 71 tests behind. The header of the very table these sit under
  says "Suites and counts (verified)".
- **Class** STALE · **Severity** P2 · **Action** UPDATE-DOC
- **Severity** P2 · **Action** UPDATE-DOC

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `a5cf366` *docs(04-testing): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### T‑2 · [[TESTING]] suite table — the E2E row is two months and one generation stale · STALE

- **Origin** audit B entry `T‑2` · baseline `ddc63c6` · source `docs/04-testing/TESTING.md`
- **Source** `docs/04-testing/TESTING.md` — the section named in the heading above
- **Claim** "| E2E | `CI=true npx playwright test` | **566 total / 552 gate passed, 14
  env-skipped** |"
- **Expected** the latest committed full gate.
- **Actual** **919 passed / 0 failed / 15 skipped** (**T‑0**), from the 2026-09-06 per-project run.
  The 566/552/14 figure traces to `AGENT_LOGBOOK_HISTORY.md:6630` — **2026-08-12**, "CLEAN RE-RUN
  (verified 2026-08-12, ~07:10) … 552 passed / 0 failed / 14 skipped (17.8m), 566 total". So the row
  is a verbatim, correctly-transcribed result from two months and roughly 350 tests ago.
- **Class** STALE · **Severity** P2 · **Action** UPDATE-DOC
- **Severity** P2 · **Action** UPDATE-DOC
- **Worse than the arithmetic** the number is not just wrong, it is *wrong in the direction that
  understates*: a reader sizing the E2E gate reads 566 where the suite now runs 919+.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `a5cf366` *docs(04-testing): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### T‑4 · [[TESTING]] "Writing tests" — the two file counts · STALE

- **Origin** audit B entry `T‑4` · baseline `ddc63c6` · source `docs/04-testing/TESTING.md`
- **Source** `docs/04-testing/TESTING.md` — the section named in the heading above
- **Claim** "**Unit**: Vitest. Backend tests live in `backend/` (**115 files**); frontend in `app/`
  (**149 files**, colocated or under `app/src/**/__tests__`)."
- **Expected** 115 backend test files, 149 frontend.
- **Actual** Backend is **127** files, frontend **155** (**T‑0**) — the same drift as **T‑1**, stated
  a second time so a single correction does not fix the doc.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC
- **Severity** P3 · **Action** UPDATE-DOC

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `a5cf366` *docs(04-testing): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### T‑5 · [[TESTING]] §"Quick reference: all admin panel tab IDs" — **28 of 46 admin IDs and 2 of 6 POS IDs are missing** · **P1**

- **Origin** audit B entry `T‑5` · baseline `ddc63c6` · source `docs/04-testing/TESTING.md`
- **Source** `docs/04-testing/TESTING.md` — the section named in the heading above
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
- **Severity** P1 · **Action** UPDATE-DOC
- **Severity rationale** the table's own purpose is stated twice — as the reference E2E selectors
  "depend on", and as the "only place in the repo" carrying these IDs (**T‑6**). A reader using it
  to find a tab finds 39% of them, and the missing set is precisely the post-T13 feature areas.
  Twelve of the missing IDs are actually selected on by E2E specs (verified: `'analytics'`,
  `'billing'`, `'crm'`, `'financials'`, `'hr'`, `'promotions'`, `'service-bookings'`, `'storefront'`,
  `'supply'`, `'super_audit'`, `'super_health'`, `'super_performance'` all appear quoted in
  `tests/e2e/**`), so the dependency the README asserts is real *and* the table cannot service it.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `a5cf366` *docs(04-testing): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### T‑6 · [[04-testing/README]] — "Admin tab IDs live only here" · **FALSE**

- **Origin** audit B entry `T‑6` · baseline `ddc63c6` · source `docs/04-testing/TESTING.md`
- **Source** `docs/04-testing/TESTING.md` — the section named in the heading above
- **Claim** "**Admin tab IDs live only here** — the 3 super-admin / 15 tenant-admin / 4 POS tab IDs
  are the only place in the repo that carries them; E2E selectors depend on this table staying put."
- **Expected** no other place in the repo enumerates them.
- **Actual** `AdminApp.tsx` carries all 46 and `POSApp.tsx` carries all 6, by definition — they are
  the source the table transcribes. The counts (3/15/4) are the stale half (**T‑5**).
- **Class** FALSE · **Severity** **P1** · **Action** UPDATE-DOC
- **Severity** P1 · **Action** UPDATE-DOC
- **Severity rationale** this is the sentence that makes the stale table authoritative. It tells a
  reader the table cannot drift from the code because nothing else carries the data — which is the
  opposite of the situation, and the reason the drift went unnoticed.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `a5cf366` *docs(04-testing): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### T‑7 · [[04-testing/README]] — env-skipped count · STALE

- **Origin** audit B entry `T‑7` · baseline `ddc63c6` · source `docs/04-testing/TESTING.md`
- **Source** `docs/04-testing/TESTING.md` — the section named in the heading above
- **Claim** "**Env-skipped tests are counted, not hidden** — 14 tests skip on missing env."
- **Expected** 14.
- **Actual** **15** in the latest committed full gate (**T‑0**). The 14 traces to the 2026-08-12 run
  (line 6630) — the same stale source as **T‑2**.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC
- **Severity** P3 · **Action** UPDATE-DOC
- **Note** `docs/01-architecture/ARCHITECTURE.md` §7 says 15 and `docs/01-architecture/QUICK_START.md`
  §4 says 14, per Part 8a entries **A‑21**/**Q‑4**. So the vault now carries 14 and 15 for the same
  suite in two different folders, and this is one of the two places 14 survives.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `a5cf366` *docs(04-testing): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### T‑8 · [[TESTING]] §"Ground truth" — two gitignored paths and a moved file · STALE

- **Origin** audit B entry `T‑8` · baseline `ddc63c6` · source `docs/04-testing/TESTING.md`
- **Source** `docs/04-testing/TESTING.md` — the section named in the heading above
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
- **Severity** P2 · **Action** UPDATE-DOC

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `a5cf366` *docs(04-testing): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### T‑12 · [[TESTING]] §CI checks before shipping · MATCHED

- **Origin** audit B entry `T‑12` · baseline `ddc63c6` · source `docs/04-testing/TESTING.md`
- **Source** `docs/04-testing/TESTING.md` — the section named in the heading above
- **Claim** Five ordered gates: backend unit · app unit · root integration · `cd app && npm run build`
  · `CI=true npx playwright test` with a passed/failed/skipped figure.
- **Expected** all five real; the build script real.
- **Actual** `app/package.json` has a `build` script; the three vitest commands are real;
  `npx playwright test` is the config's `testDir`. The figure on the last line is stale (**T‑2**).
- **Class** MATCHED (the five gates) / STALE (the figure) · **Severity** P3 · **Action** UPDATE-DOC
- **Severity** P3 · **Action** UPDATE-DOC

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `a5cf366` *docs(04-testing): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### T‑14 · [[04-testing/README]] — "verified counts, not remembered counts" · FALSE as stated

- **Origin** audit B entry `T‑14` · baseline `ddc63c6` · source `docs/04-testing/TESTING.md`
- **Source** `docs/04-testing/TESTING.md` — the section named in the heading above
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
- **Severity** P2 · **Action** UPDATE-DOC
- **Severity rationale** this is a meta-claim about the folder's own reliability, and it is the
  reason **T‑1**/**T‑2**/**T‑4** could rot unnoticed for two months. The claim is what a reader would
  use to decide *not* to re-run a suite; it should not be there unless each count carries its date.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `a5cf366` *docs(04-testing): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

## docs/05-operations — 7 resolved

### O‑16 · [[AUDIT_MASTER_FINDINGS]] PART 1 — all six P0s are fixed in the tree, and the doc still presents them as open · STALE · P2

- **Origin** audit B entry `O‑16` · baseline `ddc63c6` · source `docs/05-operations/AUDIT_MASTER_FINDINGS.md`
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
- **Severity** P2 · **Action** UPDATE-DOC
- **Severity rationale** above P3 because of the shape, not the content. PART 6 is written as a
  proposal awaiting an owner's go-ahead, listing "Wave 1 — Security & correctness fires
  (deploy-blocking) … 1. P0.1 Onboarding SQL injection → zod `.strip()` whitelist". A reader who
  opens this file to decide what to fix next finds six deploy-blocking items, all six already done
  months ago. The doc is correctly tagged `status/archived` and dated 2026-09-05 — the defect is
  that the *fix sequence* section reads in the present tense and nothing marks it spent.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `b06990c` *docs(05-operations): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### O‑17 · [[AUDIT_MASTER_FINDINGS]] P0.4 — the cited migration is in the excluded lineage

- **Origin** audit B entry `O‑17` · baseline `ddc63c6` · source `docs/05-operations/AUDIT_MASTER_FINDINGS.md`
- **Source** `docs/05-operations/AUDIT_MASTER_FINDINGS.md` — the section named in the heading above
- **Claim** "**Where:** `backend/migrations/0069_restaurant_tables.sql:47` (also
  `pos_transactions.kitchen_status` at `:55`)"
- **Expected** the CHECK to be located in a migration that is actually applied.
- **Actual** `backend/migrations/0069_restaurant_tables.sql` exists **only under
  `backend/migrations/legacy/`**, which is excluded from the applied lineage (**D‑9**). The CHECK an
  operator would find is `0002_orders.sql:29` (`orders`) and `0004_pos.sql:156`
  (`pos_transactions`). The finding is stale in the same way as **D‑1** — it was written before the
  squash.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC
- **Severity** P3 · **Action** UPDATE-DOC

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `b06990c` *docs(05-operations): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### O‑18 · [[AUDIT_MASTER_FINDINGS]] PART 5 — the test-count green light · STALE

- **Origin** audit B entry `O‑18` · baseline `ddc63c6` · source `docs/05-operations/AUDIT_MASTER_FINDINGS.md`
- **Source** `docs/05-operations/AUDIT_MASTER_FINDINGS.md` — the section named in the heading above
- **Claim** "Backend unit **1,988/1,988 pass** (72 files) · Frontend unit **3,489/3,489 pass** (137
  files) · Root unit **158/158 pass** (10 files)"
- **Expected** current counts, or a date.
- **Actual** **2743 / 127**, **3632 / 155**, **255 / 37** (**T‑0**). The green-light block carries no
  date and no commit, and PART 4's `tsc` row is similarly undated (**O‑20**).
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC
- **Severity** P3 · **Action** UPDATE-DOC

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `b06990c` *docs(05-operations): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### O‑19 · [[AUDIT_MASTER_FINDINGS]] PART 5 — the migration-count green light · STALE

- **Origin** audit B entry `O‑19` · baseline `ddc63c6` · source `docs/05-operations/AUDIT_MASTER_FINDINGS.md`
- **Source** `docs/05-operations/AUDIT_MASTER_FINDINGS.md` — the section named in the heading above
- **Claim** "91/91 migrations sequential & fully applied; `PRAGMA foreign_key_check` = 0 violations."
- **Expected** 91 applied migrations.
- **Actual** The applied lineage is **40 top-level files**, head `0127` (**D‑1**). 91 was the
  pre-squash `0001`–`0099`-era count (the `legacy/` folder holds 99 files today). The
  `foreign_key_check` claim is not re-derivable without a replay and was not run.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC
- **Severity** P3 · **Action** UPDATE-DOC

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `b06990c` *docs(05-operations): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### O‑20 · [[AUDIT_MASTER_FINDINGS]] PART 4 — `tsc` counts, and PART 5's `DB.batch`/index/`escHtml` figures · STALE

- **Origin** audit B entry `O‑20` · baseline `ddc63c6` · source `docs/05-operations/AUDIT_MASTER_FINDINGS.md`
- **Source** `docs/05-operations/AUDIT_MASTER_FINDINGS.md` — the section named in the heading above
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
- **Severity** P3 · **Action** UPDATE-DOC
- **Note** `tsc` was **not** run by this audit, so "0 then 2" is quoted from the logbook, not
  re-derived — the same source discipline as **T‑0**.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `b06990c` *docs(05-operations): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### O‑21 · [[AUDIT_MASTER_FINDINGS]] M3 and M21 — two PART 2 findings that are now moot

- **Origin** audit B entry `O‑21` · baseline `ddc63c6` · source `docs/05-operations/AUDIT_MASTER_FINDINGS.md`
- **Source** `docs/05-operations/AUDIT_MASTER_FINDINGS.md` — the section named in the heading above
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
- **Severity** P3 · **Action** UPDATE-DOC
- **Note** M21's live residue (6 unsafe drops) is **not** claimed by the doc, so the finding is
  *resolved* rather than merely restated; a reader who trusts "20 in 11 migrations" will
  under-protect the 6 that remain.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `b06990c` *docs(05-operations): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### O‑22 · [[AUDIT_MASTER_FINDINGS]] M11 — "4th public island (`MarketplaceDirectory client:load`)" · STALE

- **Origin** audit B entry `O‑22` · baseline `ddc63c6` · source `docs/05-operations/AUDIT_MASTER_FINDINGS.md`
- **Source** `docs/05-operations/AUDIT_MASTER_FINDINGS.md` — the section named in the heading above
- **Claim** "| M11 | Frontend | MED | 4th public island (`MarketplaceDirectory client:load`) beyond
  documented 3; sibling `/camps` is fully SSR | `app/src/pages/marketplace.astro:14` |"
- **Expected** `client:load` at `marketplace.astro:14`.
- **Actual** `app/src/pages/marketplace.astro:14` is **`client:visible`**, and the directive census
  (Part 8a **A‑8**) is 17 real sites — 8 `client:only` / 6 `client:visible` / 3 `client:load`. So M11
  both mis-names the directive and describes a 3-island world that no longer exists.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC
- **Severity** P3 · **Action** UPDATE-DOC
- **Cross-doc** this is the **fourth** doc in the vault to carry a stale public-island count, after
  `AGENTS.md` (4), `03-frontend/README.md` (4, Part 8a **Y‑1**) and this one — while
  `01-architecture/ARCHITECTURE.md` §3 counts 17 and is right.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `b06990c` *docs(05-operations): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

## docs/06-security — 4 resolved

### S‑2 · [[security-guide]] §Rate Limiting — "the second, tenant-scoped layer … is mounted on 7 prefixes" · **FALSE** · P2

- **Origin** audit B entry `S‑2` · baseline `ddc63c6` · source `docs/06-security/security-guide.md`
- **Source** `docs/06-security/security-guide.md` — the section named in the heading above
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
- **Severity** P2 · **Action** UPDATE-DOC
- **Severity rationale** 7 vs 36 understates the tenant-scoped rate-limit surface by 5×, and this is
  the layer that makes per-tenant limiting real. An auditor sizing blast radius reads 7.
- **Cross-doc** `docs/01-architecture/ARCHITECTURE.md` §4 carries the *same* 7-prefix figure (Part
  8a **A‑16**), and the security guide's own §Verification note repeats it a second time
  ("plus a second tenant-scoped layer on 7 prefixes"). **This is now a three-site defect**, and the
  security guide is the one an auditor is most likely to read.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `ff264db` *docs(06-security): fix 6 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### S‑3 · [[security-guide]] §Rate Limiting — the policy-table size · STALE

- **Origin** audit B entry `S‑3` · baseline `ddc63c6` · source `docs/06-security/security-guide.md`
- **Source** `docs/06-security/security-guide.md` — the section named in the heading above
- **Claim** "a ~20-entry ordered policy table keyed `${cf}:${path}`"
- **Expected** ~20 entries.
- **Actual** `RATE_LIMIT_POLICIES` (`rateLimit.js:25-97`) holds **23 non-`default` entries plus
  `default`** — lines 33, 34, 35, 36, 37, 38, 39, 41, 43, 44, 45, 46, 49, 51, 56, 85, 86, 87, 88, 92,
  93, 94, 95 and the `default` at 96.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC
- **Severity** P3 · **Action** UPDATE-DOC
- **Credit** "~20" is a fair reading of 23, and the doc's insistence on naming the *mechanism*
  (first-match-wins, per-entry `envKey`, mid-path vs trailing `*`) is what makes the table auditable
  at all. Only the number is loose.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `ff264db` *docs(06-security): fix 6 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### S‑13 · [[security-guide]] §CSRF table — "All API requests use JSON bodies" · STALE

- **Origin** audit B entry `S‑13` · baseline `ddc63c6` · source `docs/06-security/security-guide.md`
- **Source** `docs/06-security/security-guide.md` — the section named in the heading above
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
- **Severity** P3 · **Action** UPDATE-DOC
- **Severity rationale** low, because the primary defence (bearer header, no cookie) is unaffected —
  the request still arrives without the JWT. But the sentence says **all**, and an auditor reading a
  "defense-in-depth" row wants the exceptions.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `ff264db` *docs(06-security): fix 6 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### S‑16 · [[security-guide]] — two stale pre-restructure paths · STALE

- **Origin** audit B entry `S‑16` · baseline `ddc63c6` · source `docs/06-security/security-guide.md`
- **Source** `docs/06-security/security-guide.md` — the section named in the heading above
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
- **Severity** P3 · **Action** UPDATE-DOC

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `ff264db` *docs(06-security): fix 6 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

## docs/07-data — 5 resolved

### D‑1 · [[migrations]] §1 — migration head and count · **FALSE as written** · STALE

- **Origin** audit B entry `D‑1` · baseline `ddc63c6` · source `docs/07-data/migrations.md`
- **Source** `docs/07-data/migrations.md` §1 "What migrations are"
- **Claim (verbatim)** "**Current head: `0123_storefront_order_items_fk_pos_products.sql`** (37
  files total: `0001`–`0014` + `0100`–`0123` minus reserved-absent `0109`, filesystem-verified)"
- **Expected** 37 top-level `.sql` files; highest-numbered `0123_*`.
- **Actual** `ls backend/migrations/*.sql | wc -l` → **40**. Highest =
  `0127_meals_tenant_composite_pk.sql`. Sequence `0001…0014 0100…0108 0110…0124 0126 0127`.
  Three migrations landed after this paragraph was written: `0124_guest_folios.sql`,
  `0126_tenant_scoped_unique_sku_email.sql`, `0127_meals_tenant_composite_pk.sql`.
- **Class** STALE · **Severity** P2 · **Action** UPDATE-DOC
- **Severity** P2 · **Action** UPDATE-DOC
- **Note the folder contradicts itself.** `docs/07-data/README.md:64-69` carries an explicit callout
  naming this exact drift and stating the correct figures ("The tree has **40** migrations with head
  `0127_meals_tenant_composite_pk.sql`"), and correctly attributes the fix to an owner content edit
  deliberately left out of the 2026-10-06 restructure. The live guide was missed; the index caught
  it.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `1a1574c` *docs(07-data): fix 7 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### D‑2 · [[migrations]] §2 step 1 — the "create the next migration" instruction now names a taken slot · **P1**

- **Origin** audit B entry `D‑2` · baseline `ddc63c6` · source `docs/07-data/migrations.md`
- **Source** `docs/07-data/migrations.md` — the section named in the heading above
- **Claim** "1. Create `backend/migrations/0124_<slug>.sql` with the next number (head is `0123`;
  never reuse reserved-absent `0109`)."
- **Expected** either the real head, or a slot that is free.
- **Actual** `backend/migrations/0124_guest_folios.sql` **exists** (a real, applied migration
  creating `folios` / `folio_charges` / `folio_settlements`, header dated 2026-09/10). An agent
  following this instruction literally authors a second `0124_*`, which `wrangler d1 migrations
  apply` orders ambiguously (filename sort) and `scripts/check-deploy-parity.sh` will flag as a
  ledger mismatch. The correct next free slot is **`0128`**.
- **Class** FALSE · **Severity** **P1** · **Action** UPDATE-DOC
- **Severity** P1 · **Action** UPDATE-DOC
- **Severity rationale** unlike every other stale count in this audit, this one is an *instruction*
  with a destructive failure mode. It is the first thing the guide tells a reader to do, and the
  doc it is filed under is `status/live` with `type/guide`.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `1a1574c` *docs(07-data): fix 7 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### D‑3 · [[migrations]] §6 — verification test counts · STALE

- **Origin** audit B entry `D‑3` · baseline `ddc63c6` · source `docs/07-data/migrations.md`
- **Source** `docs/07-data/migrations.md` — the section named in the heading above
- **Claim** (code block) `cd backend && npx vitest run` → `# 2610 tests / 115 files` ·
  `cd app && npx vitest run` → `# 3561 tests / 149 files` · root integration `# 255 tests / 37 files`
- **Expected** the latest committed result for each suite.
- **Actual** Not re-run (source note on **T‑1**). Backend is **127 files / 2743 tests**, app is
  **155 / 3632**. Root integration 37/255 is the one row still correct. Backend is **3 files / 133
  tests** behind; frontend **1 file / 71 tests** behind.
- **Class** STALE · **Severity** P2 · **Action** UPDATE-DOC
- **Severity** P2 · **Action** UPDATE-DOC

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `1a1574c` *docs(07-data): fix 7 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### D‑5 · [[migrations]] §5 "earlier" row — the series range understates by one

- **Origin** audit B entry `D‑5` · baseline `ddc63c6` · source `docs/07-data/migrations.md`
- **Source** `docs/07-data/migrations.md` — the section named in the heading above
- **Claim** "`0100`–`0118` project-scoping series (+ `0111` SET NULL idiom)"
- **Expected** the project-scoping series ends at 0118.
- **Actual** `backend/migrations/0119_pos_shifts_store_id.sql` is part of the same project-scoping
  work (POS shifts get `store_id`), and `DEVELOPER_ROADMAP.md` T20 groups `0118`+`0119`+`0120`
  together as "Phase 4 project-scoping". The series runs 0100–0119.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC
- **Severity** P3 · **Action** UPDATE-DOC

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `1a1574c` *docs(07-data): fix 7 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### D‑11 · [[07-data/README]] §Concepts — the lineage range glosses a deliberate gap

- **Origin** audit B entry `D‑11` · baseline `ddc63c6` · source `docs/07-data/README.md`
- **Source** `docs/07-data/README.md` — the section named in the heading above
- **Claim** "the live top level (`0001`–`0014` + `0100`–`0127`) is what wrangler scans"
- **Expected** the two ranges to be accurate as ranges.
- **Actual** Accurate as ranges, but it reads as contiguous. `0125` is **absent and deliberately so**
  (the same fact `docs/01-architecture/ARCHITECTURE.md` §5 documents with its reason). A reader who
  takes the range as contiguous will conclude a migration is missing.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC
- **Severity** P3 · **Action** UPDATE-DOC

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `1a1574c` *docs(07-data): fix 7 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

## docs/08-guides — 2 resolved

### G‑4 · [[analytics-guide]] §Exporting Data — "no PDF" is FALSE

- **Origin** audit B entry `G‑4` · baseline `ddc63c6` · source `docs/08-guides/analytics-guide.md`
- **Source** `docs/08-guides/analytics-guide.md` — the section named in the heading above
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
- **Severity** P2 · **Action** UPDATE-DOC
  UPDATE-DOC
- **Severity rationale** a tenant admin told "no PDF" will not build a PDF workflow; five templates
  offer the format. Note the guide is otherwise admirably honest here — it invented no export button
  and invented no email delivery — so this is a one-clause fix.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `0f0c09a` *docs(08-guides): fix 5 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### G‑8 · [[camp-guide]] §Room Status Lifecycle — "four-state" is stale · STALE

- **Origin** audit B entry `G‑8` · baseline `ddc63c6` · source `docs/08-guides/camp-guide.md`
- **Source** `docs/08-guides/camp-guide.md` — the section named in the heading above
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
- **Severity** P3 · **Action** UPDATE-DOC
- **Cross-doc** `tenant-import-schema.md`'s `rooms.roomStatus` row gets this exactly right — "**no DB
  CHECK**, so this enum is a policy choice mirroring the values `PATCH /api/rooms/:id/status`
  accepts" — and its `cleaningStatus` row gets the CHECK right. So the correct, complete state model
  exists in the vault; the walkthrough that a tenant admin reads does not have it.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `0f0c09a` *docs(08-guides): fix 5 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

## docs/09-plans — 12 resolved

### R‑1 · [[DEVELOPER_ROADMAP]] T9 — "ui library is now 26 components" · STALE

- **Origin** audit B entry `R‑1` · baseline `ddc63c6` · source `docs/09-plans/DEVELOPER_ROADMAP.md`
- **Source** `docs/09-plans/DEVELOPER_ROADMAP.md` — the section named in the heading above
- **Claim** "| T9 | Design-system expansion | +8 a11y-first UI primitives (Accordion, Checkbox,
  FormField, Radio, Separator, Switch, Textarea, Tooltip) + 8 stories; **ui library is now 26
  components** |"
- **Expected** 26 files under `app/src/components/ui/`.
- **Actual** `ls app/src/components/ui/ | wc -l` → **20**. The 8 named primitives **do not exist** as
  files (`test -f` → no match for each), so the "+8" was never realised; the "+8 stories" was not
  either (Part 8a **F‑7**: `find app -name "*.stories.*"` → 10 files, none for those 8). So the row
  marks as **Done** a task whose deliverables are absent, and miscounts the result by 6.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC
- **Severity** P3 · **Action** UPDATE-DOC
- **Cross-doc** `docs/03-frontend/COMPONENT_CATALOG.md` §1 gets this right and is self-aware about it
  ("9 cataloged entries have no file … 3 present files were undocumented"), and Part 8a **F‑1** rates
  it "the single most honest count claim in the three folders". This roadmap row is the same number
  stated wrongly by a document that has no way to check it.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `ae7162b` *docs(09-plans): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### R‑2 · [[DEVELOPER_ROADMAP]] T13 — "16/16 panels use `@/lib/api`" · STALE

- **Origin** audit B entry `R‑2` · baseline `ddc63c6` · source `docs/09-plans/DEVELOPER_ROADMAP.md`
- **Source** `docs/09-plans/DEVELOPER_ROADMAP.md` — the section named in the heading above
- **Claim** "| T13 | Admin query migration | Verified already complete: admin SPA fully on TanStack
  Query, zero raw `fetch` data loads, zero `window.*` globals, **16/16 panels use `@/lib/api`** |"
- **Expected** 16 panels.
- **Actual** `AdminApp.tsx` carries **46** nav tabs and **48** `lazy()` calls in `:60-107` (Part 8a
  **P‑9**, verified exact), and `find app/src/components/admin -type f` → **63** files. The row's
  *substantive* claims all still hold: Part 8a **F‑3** confirmed zero network `fetch` under
  `components/admin` + `components/pos` (all 9 `fetch(`-shaped hits are `refetch()`) and zero
  `window.*` data globals (**A‑11**). Only the denominator is stale.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC
- **Severity** P3 · **Action** UPDATE-DOC

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `ae7162b` *docs(09-plans): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### R‑3 · [[DEVELOPER_ROADMAP]] T14 — "8 POS views" · STALE

- **Origin** audit B entry `R‑3` · baseline `ddc63c6` · source `docs/09-plans/DEVELOPER_ROADMAP.md`
- **Source** `docs/09-plans/DEVELOPER_ROADMAP.md` — the section named in the heading above
- **Claim** "| T14 | POS terminal | Shipped (**8 POS views**, `pos_token` auth, shifts, cart/checkout) |"
- **Expected** 8 view files.
- **Actual** `ls app/src/components/pos/views/` → **11**: the eight named in `COMPONENT_CATALOG.md`
  plus `KitchenView.tsx`, `ProjectPicker.tsx`, `TableView.tsx` (Part 8a **F‑4**). `POSApp.tsx:17-25`
  lazy-imports **nine** view modules plus `CartPanel`.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC
- **Severity** P3 · **Action** UPDATE-DOC

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `ae7162b` *docs(09-plans): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### R‑4 · [[DEVELOPER_ROADMAP]] T19 — "53 migrations, 18 admin panels, 552 E2E gate" · STALE

- **Origin** audit B entry `R‑4` · baseline `ddc63c6` · source `docs/09-plans/DEVELOPER_ROADMAP.md`
- **Source** `docs/09-plans/DEVELOPER_ROADMAP.md` — the section named in the heading above
- **Claim** "| T19 | Docs refresh | README + AGENTS + … updated to match the codebase (repo now
  `campmaster`, no i18n, **53 migrations**, **18 admin panels**, **552 E2E gate**, R2/DO bindings) |"
- **Expected** 53 migrations / 18 panels / 552 E2E.
- **Actual** **40** migrations, head `0127` (**D‑1**); **46** admin nav tabs / **63** component files
  (**R‑2**); **919** E2E gate / 15 skipped (**T‑2**). All three numbers describe the pre-squash,
  pre-T13, pre-2026-09-06 tree.
- **Class** STALE · **Severity** P2 · **Action** UPDATE-DOC
- **Severity** P2 · **Action** UPDATE-DOC
- **Severity rationale** raised above the other roadmap rows because this is the row that *establishes
  the codebase description every other row inherits*. It is the doc's own summary of "what matches
  the codebase", and three of its five figures no longer do.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `ae7162b` *docs(09-plans): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### R‑7 · [[DEVELOPER_ROADMAP]] §Remaining — "Push blocked on OAuth `workflow` scope" · FALSE

- **Origin** audit B entry `R‑7` · baseline `ddc63c6` · source `docs/09-plans/DEVELOPER_ROADMAP.md`
- **Source** `docs/09-plans/DEVELOPER_ROADMAP.md` — the section named in the heading above
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
- **Severity** P3 · **Action** UPDATE-DOC
- **Credit** the row is honest about *how* to unblock it ("or drop `.github/workflows/*` from pushed
  history") — which is the kind of alternative an owner action should carry.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `ae7162b` *docs(09-plans): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### R‑8 · [[DEVELOPER_ROADMAP]] §"Known pre-existing type errors" — the 153-error baseline · FALSE

- **Origin** audit B entry `R‑8` · baseline `ddc63c6` · source `docs/09-plans/DEVELOPER_ROADMAP.md`
- **Source** `docs/09-plans/DEVELOPER_ROADMAP.md` — the section named in the heading above
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
- **Severity** P3 · **Action** UPDATE-DOC
- **Note** the claim "They do not block `astro build`" is *correct* and is the only part that matters
  operationally — that sentence should be kept and the number dropped.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `ae7162b` *docs(09-plans): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### R‑9 · [[BACKLOG_VOID_REFUND]] §Current — "`POST /api/pos/orders/:id/void` exists (manager-gated, stock restore, audit)" · **FALSE** · **P1**

- **Origin** audit B entry `R‑9` · baseline `ddc63c6` · source `docs/09-plans/BACKLOG_VOID_REFUND.md`
- **Source** `docs/09-plans/BACKLOG_VOID_REFUND.md` — the section named in the heading above
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
- **Severity** P1 · **Action** UPDATE-DOC
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

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `ae7162b` *docs(09-plans): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### R‑10 · [[BACKLOG_VOID_REFUND]] §Next cycle item 3 — a "proposed" migration that already shipped · FALSE · P2

- **Origin** audit B entry `R‑10` · baseline `ddc63c6` · source `docs/09-plans/BACKLOG_VOID_REFUND.md`
- **Source** `docs/09-plans/BACKLOG_VOID_REFUND.md` — the section named in the heading above
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
- **Severity** P2 · **Action** UPDATE-DOC
  UPDATE-DOC
- **Severity rationale** paired with **R‑9** this is the second way the same 43-line file
  misdescribes the present: an endpoint that does not exist, and a migration that does. Both sit in
  a document whose §Next-cycle item 7.3 in the wave plan points at as the canonical void/refund
  backlog.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `ae7162b` *docs(09-plans): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### R‑11 · [[BACKLOG_VOID_REFUND]] §A11y/Perf notes — "4 islands" and a stale path · STALE

- **Origin** audit B entry `R‑11` · baseline `ddc63c6` · source `docs/09-plans/BACKLOG_VOID_REFUND.md`
- **Source** `docs/09-plans/BACKLOG_VOID_REFUND.md` — the section named in the heading above
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
- **Severity** P3 · **Action** UPDATE-DOC

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `ae7162b` *docs(09-plans): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### R‑12 · [[FINAL_IMPLEMENTATION_PLAN_v3_waves]] §"Migration budget" — "Current 99, head `0099`" · **FALSE** · P2

- **Origin** audit B entry `R‑12` · baseline `ddc63c6` · source `docs/09-plans/FINAL_IMPLEMENTATION_PLAN_v3_waves.md`
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
- **Severity** P2 · **Action** UPDATE-DOC
- **Severity rationale** this is the second **actionable** stale instruction in this audit after
  **D‑2**, and it is worse in one respect: it names `0100_*` as a *free* slot when that slot has been
  taken for ~6 migrations. A migration budget is only useful while it is true.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `ae7162b` *docs(09-plans): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### R‑14 · [[FINAL_IMPLEMENTATION_PLAN_v3_waves]] §6 — the acceptance-criteria baselines · STALE

- **Origin** audit B entry `R‑14` · baseline `ddc63c6` · source `docs/09-plans/FINAL_IMPLEMENTATION_PLAN_v3_waves.md`
- **Source** `docs/09-plans/FINAL_IMPLEMENTATION_PLAN_v3_waves.md` — the section named in the heading above
- **Claim** (table) "Backend unit tests | **2158 / 83 files** | every wave | any fail → do not
  proceed" · "Frontend unit tests | **3363 / 137 files**" · "Root integration | **255 / 37 files**" ·
  "tsc | **8 pre-existing errors**"
- **Expected** the baseline every wave is measured against to be the current one.
- **Actual** Backend **2743 / 127** and frontend **3632 / 155** (**T‑0**); `tsc` **0 → 2**, not 8
  (**R‑8**/**O‑20**). Root integration 255/37 is still exact (**T‑3**). The gate thresholds
  ("**below threshold pair** (83/72/89/89)", "> 8 → gate") are the durable part and match
  `AGENTS.md` §6.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC
- **Severity** P3 · **Action** UPDATE-DOC
- **Severity rationale** kept at P3 because the *mechanism* is intact — the thresholds are the
  enforceable half and they are unchanged. But a "not worse than baseline − 0.5%" rule measured
  against a 755-test-old baseline cannot detect a regression in the 585 tests added since.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `ae7162b` *docs(09-plans): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### R‑19 · [[09-plans/README]] §Docs — "Live 18-line backlog proposal" · STALE

- **Origin** audit B entry `R‑19` · baseline `ddc63c6` · source `docs/09-plans/README.md`
- **Source** `docs/09-plans/README.md` — the section named in the heading above
- **Claim** "| [[BACKLOG_VOID_REFUND|BACKLOG_VOID_REFUND.md]] | Live **18-line** backlog proposal for
  the next POS cycle. |"
- **Expected** `BACKLOG_VOID_REFUND.md` to be 18 lines.
- **Actual** **43 lines.** (Its substantive claims are audited at **R‑9**/**R‑10**/**R‑11**.)
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC
- **Severity** P3 · **Action** UPDATE-DOC
- **Severity rationale** small on its own, but it is a count in the very table whose purpose is to
  let a reader size the folder before opening a file — and **R‑9** shows what the file it points at
  contains.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `ae7162b` *docs(09-plans): fix 9 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

## docs/10-tenant-import — 6 resolved

### N‑3 · [[tenant-import-types]] §3 — the matrix row and its own evidence note contradict each other · FALSE · P2

- **Origin** audit B entry `N‑3` · baseline `ddc63c6` · source `docs/10-tenant-import/tenant-import-types.md`
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
- **Severity** P2 · **Action** UPDATE-DOC
- **Cross-doc** this is the third of three in the same folder (**N‑4**, **N‑5**), and the only one
  where the doc contradicts *itself in one file*.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `8d9ec8e` *docs(10-tenant-import): fix 7 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### N‑4 · [[tenant-import-schema]] §"Schema-level findings" item 2 — "`project` validated but inert" · FALSE · P2

- **Origin** audit B entry `N‑4` · baseline `ddc63c6` · source `docs/10-tenant-import/tenant-import-schema.md`
- **Source** `docs/10-tenant-import/tenant-import-schema.md` — the section named in the heading above
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
- **Severity** P2 · **Action** UPDATE-DOC
- **Note** the §2 table's line range (`:344–411`) is itself stale — the block is at `:451`+ in a
  1,151-line file. The `project.type` and `project.status` "assigned directly, not COALESCEd" claims
  are unverifiable from what I read but consistent with the schema row types.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `8d9ec8e` *docs(10-tenant-import): fix 7 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### N‑5 · [[tenant-import-appendix]] Table 3 A1 — "Entire `project` block … Parses, never read" · FALSE · P2

- **Origin** audit B entry `N‑5` · baseline `ddc63c6` · source `docs/10-tenant-import/tenant-import-appendix.md`
- **Source** `docs/10-tenant-import/tenant-import-appendix.md` — the section named in the heading above
- **Claim** "| A1 | Entire `project` block (`name`/`location`/`capacity`/`status`) | Parses, **never
  read by `runImport` in either mode**. (Same root cause as F1; listed here as the accepted-ignored
  instance.) |"
- **Expected** the `project` section to be inert.
- **Actual** `tenant-import.js:451` reads it, in both modes — the block sits inside `runImport`, which
  both modes call. Same defect as **N‑3**/**N‑4**, third carrier.
- **Class** FALSE · **Severity** **P2** · **Action** UPDATE-DOC
- **Severity** P2 · **Action** UPDATE-DOC
- **Severity rationale for N‑3/N‑4/N‑5 as a group** one stale finding has propagated to three documents
  in one folder, and in **two** of them it now contradicts that same document's own reference table.
  A manifest author reading A1 would conclude their `project` block is doing nothing and would not
  use `project.type` to set `projects.project_type` — a real, silent capability loss. The finding
  dates from A.2 (2026-09-30); the `project` block became a real writer when A.4 added `project.type`,
  and the reference tables were updated while the findings lists were not.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `8d9ec8e` *docs(10-tenant-import): fix 7 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### N‑8 · [[BLOCKED-pos-products-composite-pk]] §5 — "Identity-path rollback assessment — **SKIPPED**" · **STALE** · P2

- **Origin** audit B entry `N‑8` · baseline `ddc63c6` · source `docs/10-tenant-import/BLOCKED-pos-products-composite-pk.md`
- **Source** `docs/10-tenant-import/BLOCKED-pos-products-composite-pk.md` — the section named in the heading above
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
- **Severity** P2 · **Action** UPDATE-DOC
- **Severity rationale** this is a doc whose whole value proposition is "a verdict and an unblock
  condition, kept separate from the schema docs so an open question is never filed under 'here is how
  it works'" (**N‑10**). §5 is a *verdict* that has since been reversed, and §5.3 hands the reader a
  "Wave 8 item to carry forward" that is already done. A reader would carry a closed item forward and
  skip the one that is genuinely still open (`pos_products.id`, §"Parity D3, identifier half").

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `8d9ec8e` *docs(10-tenant-import): fix 7 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### N‑9 · [[BLOCKED-pos-products-composite-pk]] §5.2 — the cited line range and the superseded quote

- **Origin** audit B entry `N‑9` · baseline `ddc63c6` · source `docs/10-tenant-import/BLOCKED-pos-products-composite-pk.md`
- **Source** `docs/10-tenant-import/BLOCKED-pos-products-composite-pk.md` — the section named in the heading above
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
- **Severity** P3 · **Action** UPDATE-DOC

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `8d9ec8e` *docs(10-tenant-import): fix 7 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.

### N‑13 · [[tenant-import-appendix]] §4 — "Each file covers 84 of the 88 leaf fields" · **83, not 84** · STALE

- **Origin** audit B entry `N‑13` · baseline `ddc63c6` · source `docs/10-tenant-import/tenant-import-appendix.md`
- **Source** `docs/10-tenant-import/tenant-import-appendix.md` — the section named in the heading above
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
- **Severity** P3 · **Action** UPDATE-DOC
- **Severity rationale** the discrepancy is one field, but the claim is explicitly framed as a
  measurement ("not asserted by hand"), and the same section's companion number is
  **exact**: `docs/examples/tenant-manifest.example.json` is **69 / 88** as claimed ("69 of 88 leaf
  fields (no `identity` at all)"), missing 11 (`project.type`, `products.categoryId`,
  `products.campId`, `rooms.roomStatus`, `rooms.cleaningStatus`, `ratePlans.id`,
  `ratePlans.productId`, `menu.meals.id`, `menu.meals.mealCategoryId`, `menu.meals.isActive`,
  `posUsers.storeId`). One number in a pair of self-declared measurements is off by one; that is
  enough to make a reader re-run both.

> **RESOLVED-DOC 2026-10-06** — the cited doc was corrected by `8d9ec8e` *docs(10-tenant-import): fix 7 stale/false claims — gaps round 1*.
>
> The entry text **above** this line is **verbatim** from the source audit, not rewritten here:
> the point of the record is what the doc *claimed* on 2026-10-06 and what the code *was*, and
> both halves must stay readable for a later pass to tell a closed gap from a reopened one.
