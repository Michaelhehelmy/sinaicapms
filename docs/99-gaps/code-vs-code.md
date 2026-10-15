---
title: "Code vs code — UNGUARDED behaviour in the applied migration lineage and the tests around it"
aliases:
  - code-vs-code
tags:
  - type/audit
  - audience/agent
  - domain/docs
  - status/live
created: 2026-10-06
updated: 2026-10-15
relates-to:
  - "[[99-gaps/README]]"
  - "[[code-vs-docs]]"
  - "[[unverified]]"
  - "[[unimplemented]]"
  - "[[migrations]]"
  - "[[TESTING]]"
  - "[[AUDIT_MASTER_FINDINGS]]"
code-references:
  - "backend/migrations/0107_enforce_not_null_other_tables.sql"
  - "backend/migrations/0108_add_meals_project_id.sql"
  - "backend/migrations/0111_fix_project_id_set_null_contradiction.sql"
  - "backend/migrations/0112_drop_pos_tenant_id_defaults.sql"
  - "backend/migrations/0115_rooms_new_tenant_not_null_fk.sql"
  - "backend/migrations/0126_tenant_scoped_unique_sku_email.sql"
  - "tests/core/migration-integrity.test.js"
  - "monitor/tests/api.test.js:180,304,368,454,466,1464 (the six failing assertions)"
  - "monitor/tests/api.test.js:473 (the NOW constant the fixtures should derive from)"
  - "monitor/tests/helpers/fake-r2.js (HOUR_0, seedRun, seedRing)"
  - "monitor/src/index.js:341-353 (newestRun two-day lookback)"
  - "monitor/src/index.js:495-505 (readHistoryWindow window filter)"
  - "monitor/src/index.js:1245-1250,1268 (escapeHtml of the probe error)"
  - "docs/01-architecture/ARCHITECTURE.md:184 (the Monitor unit row that cites 9e809bd)"
  - "docs/05-operations/AUDIT_MASTER_FINDINGS.md"
  - "docs/09-plans/FINAL_IMPLEMENTATION_PLAN_v3_waves.md"
  - ".opencode/audits/monitor-suite-red-2026-10-06.md"
verified: 2026-10-08
---
# Code vs code — UNGUARDED behaviour in the applied migration lineage **and in the tests around it**

The other three notes in this folder ask **"does the code do what the docs say?"** This one asks the
question that survived a docs-only reconciliation: **"where does the code assert a property it does
not actually enforce?"** It holds **8** entries (`C‑0`…`C‑7`). Every one of those eight is `Severity`
**P2**, `Action** **`FIX-CODE`**, and deferred to **Wave 9**. A 2026-10-14 discovery addendum at the
foot files **`D‑1`…`D‑9`** — new code-safety entries from a fresh read-only audit, all `Status`
`OPEN`, wave unassigned (owner to triage); severities are per-entry (P1–P2). On 2026-10-15
**`C‑0` moved to `RESOLVED-CODE`** (`b109014`), P1-1/P1-3 closed alongside it, and **`W9‑1`…`W9‑3`**
were filed to Wave 9 — see `## Resolutions 2026-10-15` and `## Wave 9 intake` at the foot. The eight
above are otherwise unchanged, and the folder ledger in [[code-vs-docs]] is unchanged pending owner
triage of the nine plus three.

**They do not all come from one finding, and this note used to say that they did.** The sentence
this paragraph replaces read "all from one finding (**`O‑21`**'s M21 half)" — and `C‑0`'s own
`Origin` contradicted it on the day it was written, because `C‑0` came from `b06990c`'s commit body
rather than from the `O‑21` triage. What is true, and countable, is: **six** entries (`C‑1`…`C‑6`)
are the applied lineage's own bare `DROP TABLE` files, the residue of `O‑21`'s M21 half; **`C‑0`**
is the test that claims to police those six and cannot pass as written; and **`C‑7`** is a defect in
a **different subsystem** — the monitor suite is red on `main` — surfaced 2026-10-08 and recorded in
`.opencode/audits/monitor-suite-red-2026-10-06.md`. **The count and the provenance are one claim: a
note that describes its entries by a shared origin has to keep that origin true for every entry it
holds, and where it cannot, the origin sentence is what has to move.** (Correcting this on
2026-10-08 is what made the folder counts reconcile: the header said **6**, the file carried **7**
headings, and the file now carries **8**.)

**Nothing in this note has been fixed.** The owner chose FIX DOCS ONLY for the 2026-10-06
reconciliation, so the documentation half of `O‑21` was closed (`b06990c` corrected the archived
claim) and this code half was recorded rather than touched. `C‑7` was filed under the same rule: it
is `monitor/` code and `monitor/` tests, which this mission may not edit. That is the whole reason
the note exists: a fix-docs-only pass closes a doc claim about a code defect and leaves the defect
standing, which is correct only if somebody records that it is still standing.

## Status as of 2026-10-14

| Status | Count | Entries |
|---|---|---|
| `RESOLVED-CODE` | **1** | **`C‑7`** — the monitor suite, fixed by `97bb5bd` (relative fixtures + two boundary tests) |
| `OPEN` | **7** | `C‑0` … `C‑6` — six migration files carrying a bare `DROP TABLE`, and the test that polices them |
| `DEFERRED` | **7** | the same seven, **deferred to Wave 9**; `OPEN` and `DEFERRED` are not exclusive here (see below) |
| `RESOLVED-DOC` | **0** | no doc needed changing — the live claim was already corrected in `b06990c` |
| `RESOLVED-REJECTED` | **0** | |
| **Total entries** | **8** | |

**This note now has a `RESOLVED-CODE` row, and that is the point of it.** The whole reason this
folder exists is that a fix-docs-only pass closes a doc claim about a code defect and leaves the
defect standing — which is correct only if somebody records that it is still standing, and equally
only if the record can later be **closed**. `C‑7` was filed on 2026-10-08, routed to the code
workstream, and fixed on the same day (`97bb5bd`) without any `src/` change: the fixtures now anchor
to `Date.now()` instead of a calendar literal, and two tests name the `newestRun` / `readHistoryWindow`
window boundaries that the old suite structurally could not assert. `194` tests pass on any calendar
day, verified with the clock pinned one year ahead, twenty days back, and at `00:02` UTC. **The
production code was never wrong and was never touched** — the entry closed by changing the tests that
misread it, which is the only way it could have been closed honestly.

**The folder-wide ledger, where each entry gets exactly one status, is `## Status as of 2026-10-06`
in [[code-vs-docs]]** — that ledger keeps its 2026-10-06 *heading* because it is a dated record that
four other notes name by name, and its two rows that moved on 2026-10-08 carry a dated amendment
line instead. This note's own table is dated by its heading, so its heading moved.

**`OPEN` and `DEFERRED` overlap here and the overlap is the point.** In the other three notes the two
are alternatives — an entry is either waiting for a decision or waiting for a pass. In this note the
seven that remain are waiting for *both*: an owner slot to work in and a code change nobody has made.
Reporting them as `DEFERRED` alone would understate the queue; reporting them as `OPEN` alone would
imply the work is unowned. **Both counts are true, and the row above is the honest way to say so.**
The eighth, `C‑7`, was in exactly this state on 2026-10-08 and left it on 2026-10-14 — which is the
overlap doing its job rather than being a permanent condition.

**Why "Wave 9" when the wave plan stops at 7 — flagged here, once, and nowhere else.**
`docs/09-plans/FINAL_IMPLEMENTATION_PLAN_v3_waves.md` §5 plans **Waves 0 → 7**, and "Wave 8" was
already used ad hoc for the tenant-import carry-forward (`BLOCKED-pos-products-composite-pk.md` §5.3,
closed). **Wave 9 is therefore the first free slot, and the number is this note's convention, not a
slot the plan reserved.** This paragraph is the **only** flag: the seven `Deferred to` rows below
carry `Wave 9` as *data* and none of them re-argues the provenance, so a rename is this paragraph
plus a replace on the number — not a judgement restated seven times. It used to end by inviting the
reader to rename it "in one place — this line and the `Deferred to` row on each entry", which named
nine sites and identified none of them as *the* site.

**The one-sentence finding.** `docs/05-operations/AUDIT_MASTER_FINDINGS.md` M21 (2026-09-05) claimed
**"20 unsafe `DROP TABLE` (no `IF EXISTS`) in 11 migrations"**, citing nine migration ids. Today
**every** `DROP TABLE` in the excluded `backend/migrations/legacy/` lineage is guarded — verified by
scanning all **99** files: **0** bare `DROP TABLE` statements. The claim's cited files were all in
`legacy/`, and `legacy/` is not a lineage `wrangler` ever runs. Meanwhile the applied lineage's own
**6** bare drops are **not claimed anywhere in the vault**. So the archived finding was wrong about
where the risk was, and the risk itself was never written down.

## Method

`verified: 2026-10-08` means: on 2026-10-06 the six migrations and `C‑0` were measured from the tree,
and on 2026-10-08 that measurement was **re-run unchanged** (6 matches, the same 6 file:line pairs)
and `C‑7` was added from a suite run. Nothing here was inferred from a doc.

For each of the **6 migration files** the question is one: **does the file's `DROP TABLE` carry an
`IF EXISTS` guard?** Measured mechanically, not read by eye, because the difference between "a bare
`DROP TABLE`" and "a bare `DROP TABLE` inside a `--` comment" is exactly the kind of distinction a
reviewer gets wrong by scanning:

```bash
# every line in the applied lineage matching the guard-less form, with its file and line
grep -nE 'DROP[[:space:]]+TABLE[[:space:]]+(?!IF EXISTS)' -P backend/migrations/*.sql
```

That yields **6** lines in **6** files — re-run 2026-10-08 and unchanged. Reading each line then
splits them **2 / 4**: two are real statements, four are prose inside the comment blocks that
*document* the RENAME-swap idiom. **Both halves are filed below, and the reason is in `C‑0`.**
`rg` is not on PATH in this workspace; every measurement here used `grep` or a throwaway `node:fs`
script from `/tmp`.

**The other two entries were not measured this way, and the note says which is which.** `C‑0` asks
the *same* question of the **test** — does its assertion match reality — and was measured by
replicating that test's own regex and file list rather than by reading it. `C‑7` is not a `DROP
TABLE` finding at all: it was measured by **running** `cd monitor && npx vitest run` and re-running
it pinned to the fixtures' own instant, and it lives here because it is the same *shape* of claim —
something asserting a property it does not enforce — in the folder's only note that may hold a code
finding.

**What the six migrations have in common.** All six live in the RENAME-swap rebuild idiom
(`PRAGMA defer_foreign_keys = true` → `CREATE TABLE x_new` → copy-ALL → drop-old → `ALTER … RENAME` →
`PRAGMA foreign_key_check`), and in that idiom the drop-old step is *normally* guarded — `0107:434-443`,
`0111:453-462`, `0112:383-387` and `0126:280-281` all write `DROP TABLE IF EXISTS`, and their own
headers explain the discipline. Two files step outside it. **That is the actual defect class:** not
"migrations are unsafe" but "the idiom's own convention is enforced by habit, not by anything".

**Severity P2 for all eight, and the reasoning, because "P2" hides a judgement.** *(The severity
has not moved with `C‑7`'s resolution — `P2` recorded the risk the entry carried when filed, and
history is not re-scored.)* `P1` in this repo's
scale is "a reader or agent acting on the doc breaks something". These six cannot break anything by
being read — they execute only during `wrangler d1 migrations apply`. `P0` is a production bug, and
none of these is one: in every case the drop is preceded in the same file by a statement that fails
first if the target is absent (`0108`'s `CREATE TABLE IF NOT EXISTS` at `:56`; `0115`'s
`INSERT … FROM rooms_new` at `:97-106`), and D1 applies each migration atomically, so a missing
target aborts the file with the database left where it was. They are **P2**: a wrong property in a
place the codebase treats as an invariant, on a path with no live incident — which is the definition
of a hygiene finding in this vault's scale, and the reason none of them is worth an unscheduled wave.
`C‑0` and `C‑7` are P2 for the same reason with the consequence inverted: a migration's unguarded
drop only runs during a migration apply, while **a test that cannot pass and a suite whose recorded
verdict has rotted mislead the very next reader immediately**. Neither is a production bug — nothing
user-facing changed, and in `C‑7`'s case the production code is the *correct* half and the fixtures
are the stale one.

**Deferred to Wave 9, not fixed now**, for reasons that are worth stating because a reader will
otherwise assume the deferral is a formality:

1. **The owner scoped this round to documentation.** `RESOLVED-CODE = 0` across the whole folder.
   `C‑7` is the same rule seen from the other side: its fix is `monitor/tests/api.test.js` and
   `monitor/src/index.js`, and this mission is forbidden to edit either. *(Both halves of that
   sentence were true on 2026-10-08 and are history now: `C‑7` was fixed the same day, by
   `97bb5bd`, and the folder's `RESOLVED-CODE` is 1.)*
2. **Editing an already-applied migration is not free.** All six migration files are in the applied
   lineage (`0126` landed 2026-10-02, `5ff57a7`). Adding `IF EXISTS` is *semantically* a no-op on
   every database that already applied them — but it changes a checksum-relevant artefact, and the
   project's own hard rule 7 is that table rebuilds are forward-only with rollback = restore-from-
   backup. A one-word edit to an applied migration deserves a wave slot, not a drive-by.
3. **One of the two real statements is arguably correct as written.** `0115:108`'s
   `DROP TABLE rooms_new;` is the drop-old step of a swap whose copy at `:97-106` reads
   `FROM rooms_new` — so the table provably exists, and `IF EXISTS` would only mask a real failure
   (a `rooms_new` that vanished is a bug worth aborting on). **The fix for `0115` is therefore
   probably a comment, not a keyword.** Recorded here rather than assumed, because "add `IF EXISTS` to
   everything" is how a safety guard becomes a silencer.

# Entries

Every entry is a **file**, not a line: one migration per row for `C‑1`…`C‑6`, because a file is the
unit `wrangler` applies and the unit a rollback reverts; then the **test** that claims to police
those six (`C‑0`), and one **other subsystem's** test suite (`C‑7`). The ids are `C‑0` first on
purpose — it is the finding that made the other six legible — and `C‑7` is simply the next free id.

## C‑1 · `0107_enforce_not_null_other_tables.sql` · **no executable drop — comment only**

- **Origin** `O‑21` (M21) live residue · surfaced by
  `.opencode/audits/gaps-triage-A-2026-10-06.md:188-190` · filed 2026-10-06
- **File** `backend/migrations/0107_enforce_not_null_other_tables.sql` · **line** `:53` · 595 lines,
  added `dd092a9` 2026-09-23
- **Matched line** `-- DROP TABLE under FK enforcement fires immediate ON DELETE CASCADE/SET NULL`
- **Expected** every `DROP TABLE` in an applied migration to be guarded, or to be provably safe.
- **Actual** the line is **inside a comment block** — part of the header's `CASCADE-FIX (P1-C sibling
  proves one-at-a-time DROP wipes rebuilt children)` note, which documents *why* the drop order
  matters. **Every executable `DROP TABLE` in this file is guarded**: `:434-443` writes
  `DROP TABLE IF EXISTS` for all ten swapped-out tables, and `:585-588` does the same for the four
  `_guard_*` staging tables.
- **IF EXISTS guard** **N/A — there is no unguarded statement.** The file is compliant.
- **Class** UNGUARDED-BY-REGEX, not unguarded-in-fact · **Severity** **P2** · **Action** **`FIX-CODE`**
- **Deferred to** **Wave 9** · **Reason** the finding is real; the *fix* is not an `IF EXISTS`
- **What the fix actually is** the only defensible change to this file is **none**. It is filed
  because it is one of the four inputs to `C‑0`: a guard-absence count of 6 overstates the real
  number by 4. Wave 9 closes it by closing `C‑0`, not by editing this file.

## C‑2 · `0108_add_meals_project_id.sql` · **unguarded, but created in the same file**

- **Origin** `O‑21` (M21) live residue · filed 2026-10-06
- **File** `backend/migrations/0108_add_meals_project_id.sql` · **line** `:68` · 75 lines, added
  `772e8f9` 2026-09-23
- **Matched line** `DROP TABLE _0108_project_guard;`
- **Expected** `DROP TABLE IF EXISTS`, to match the guard convention the other five rebuild migrations
  follow.
- **Actual** `_0108_project_guard` is created at **`:56`** by `CREATE TABLE IF NOT EXISTS
  _0108_project_guard (ok TEXT NOT NULL);`, `DELETE`d at `:57`, written to at `:59-66`, and dropped
  at `:68`. The file's own header (`:49-51`) states the intent — *"ROLLBACK SAFETY: the guard table is
  created AND dropped inside this file, so committed state is unchanged by Part 1"*. The table is
  therefore **provably present** at `:68` on any run that reached it, so this is a **clean, in-file
  scratch table**, not a rebuild drop.
- **IF EXISTS guard** **absent**, and **not needed for correctness** — but it is the one place in the
  lineage where a `CREATE … IF NOT EXISTS` is paired with an unguarded `DROP`, which is the asymmetry
  that bites when someone splits the file or reorders the statements.
- **Class** UNGUARDED · **Severity** **P2** · **Action** **`FIX-CODE`**
- **Deferred to** **Wave 9** · **Reason** lowest-risk of the two real statements; no live incident
- **The fix** add `IF EXISTS`. This is a **one-word edit to an applied migration**, which is why it
  waits for a wave slot rather than riding along in a docs commit — see *Deferred to Wave 9, not fixed
  now*, reason 2. It is the cheapest item in this note and the first one Wave 9 should take.

## C‑3 · `0111_fix_project_id_set_null_contradiction.sql` · **no executable drop — comment only**

- **Origin** `O‑21` (M21) live residue · filed 2026-10-06
- **File** `backend/migrations/0111_fix_project_id_set_null_contradiction.sql` · **line** `:42` · 619
  lines, added `6e114bd` 2026-09-24
- **Matched line** `--     DROP TABLE of the parent is DEFERRED and COMMIT-validated, so drops`
- **Expected** as `C‑1`.
- **Actual** inside the header's FK-behaviour note ("verified 2026-09-24 on SQLite 3.45.1 using the
  exact D1 pattern … RESTRICT (orders.room_id → rooms_new, rooms_new.product_id → pos_products)").
  **Every executable drop in this file is guarded**: `:453-462` and following write
  `DROP TABLE IF EXISTS`.
- **IF EXISTS guard** **N/A — there is no unguarded statement.** The file is compliant.
- **Class** UNGUARDED-BY-REGEX, not unguarded-in-fact · **Severity** **P2** · **Action** **`FIX-CODE`**
- **Deferred to** **Wave 9** · **Reason** as `C‑1`
- **What the fix actually is** none to this file; filed for `C‑0`.

## C‑4 · `0112_drop_pos_tenant_id_defaults.sql` · **no executable drop — comment only**

- **Origin** `O‑21` (M21) live residue · filed 2026-10-06
- **File** `backend/migrations/0112_drop_pos_tenant_id_defaults.sql` · **line** `:374` · 484 lines,
  added `6e114bd` 2026-09-24
- **Matched line** `-- when DROP TABLE fires an immediate CASCADE into a surviving table, SQLite`
- **Expected** as `C‑1`.
- **Actual** inside the header's `DROP-ORDER NOTE`, which records the finding that a survivor with a
  second FK to an already-dropped table **aborts the DROP with `no such table`** — the exact hazard
  the guard convention exists to manage. **Every executable drop is guarded**: `:383-387`.
- **IF EXISTS guard** **N/A — there is no unguarded statement.** The file is compliant.
- **Class** UNGUARDED-BY-REGEX, not unguarded-in-fact · **Severity** **P2** · **Action** **`FIX-CODE`**
- **Deferred to** **Wave 9** · **Reason** as `C‑1`
- **What the fix actually is** none to this file; filed for `C‑0`. This one is the most *dangerous*
  line to have matched, because the note it belongs to is a warning about unguarded drops — a reader
  skimming a guard count from grep output would be misled by exactly this hit.

## C‑5 · `0115_rooms_new_tenant_not_null_fk.sql` · **unguarded — and probably correct as written**

- **Origin** `O‑21` (M21) live residue · filed 2026-10-06
- **File** `backend/migrations/0115_rooms_new_tenant_not_null_fk.sql` · **line** `:108` · 137 lines,
  added `cb3927c` 2026-09-24
- **Matched line** `DROP TABLE rooms_new;`
- **Expected** `DROP TABLE IF EXISTS`, matching `:112-121`'s own use of `CREATE INDEX IF NOT EXISTS`
  and the file's declared `Rebuild idiom` (`:37-40`: *copy-ALL → drop-old → rename*).
- **Actual** the **drop-old** step of a one-table RENAME-swap, and it is preceded by the copy that
  proves the table exists: **`:97-106`** is `INSERT INTO rooms_new_new (17 columns) SELECT … FROM
  rooms_new;`. If `rooms_new` were absent, that statement fails first and the `DROP` never executes.
  The whole rebuild sits inside `PRAGMA defer_foreign_keys = true` (`:63`) … `= false` (`:133`) and
  ends with `PRAGMA foreign_key_check` (`:137`), and the header states (`:59-61`) that table rebuilds
  are forward-only with rollback = restore-from-backup.
- **IF EXISTS guard** **absent**, and **adding it would remove a fail-closed property**: the abort on a
  missing `rooms_new` is a *useful* abort, not an obstacle. SQLite's "no such table" is the signal that
  the lineage diverged from what this migration was written against.
- **Class** UNGUARDED · **Severity** **P2** · **Action** **`FIX-CODE`**
- **Deferred to** **Wave 9** · **Reason** the fix is a **decision**, not an edit — see below
- **What the fix actually is** most likely **a comment at `:108`**, not `IF EXISTS`: state that the
  drop-old step is unguarded *on purpose* and that the `:97-106` copy is the existence proof. Recording
  it as an intention is what stops the next pass — or the next `migration-integrity.test.js` fix —
  from "correcting" it into a silencer. **This entry must not be closed by adding the keyword.**

## C‑6 · `0126_tenant_scoped_unique_sku_email.sql` · **no executable drop — comment only**

- **Origin** `O‑21` (M21) live residue · filed 2026-10-06
- **File** `backend/migrations/0126_tenant_scoped_unique_sku_email.sql` · **line** `:96` · 378 lines,
  added `5ff57a7` 2026-10-02
- **Matched line** `-- DROP TABLE removes its sqlite_sequence row and the staging table's own`
- **Expected** as `C‑1`.
- **Actual** inside the header's `AUTOINCREMENT SAFETY` note, explaining why dropping the old table
  does **not** lose the `sqlite_sequence` high-water mark. **Every executable drop is guarded**:
  `:280-281` (`pos_users`, `pos_products`), `:370` and following (`_guard_*` staging tables).
- **IF EXISTS guard** **N/A — there is no unguarded statement.** The file is compliant.
- **Class** UNGUARDED-BY-REGEX, not unguarded-in-fact · **Severity** **P2** · **Action** **`FIX-CODE`**
- **Deferred to** **Wave 9** · **Reason** as `C‑1`
- **What the fix actually is** none to this file; filed for `C‑0`. `0126` is also the newest of the six
  (`2026-10-02`) and the one an agent is most likely to read for the tenant-scoped-unique pattern, so
  its comment block is the least surprising place in the lineage for a false guard count to surface.

## C‑0 · `tests/core/migration-integrity.test.js` — the guard **cannot** pass as written

- **Origin** noted by the 2026-10-06 docs pass in `b06990c`'s commit body; **verified independently**
  for this note, 2026-10-06 · filed 2026-10-06
- **File** `tests/core/migration-integrity.test.js` · **lines** `:76` (the `it`), **`:80`** (the
  regex), **`:90`** (the assertion)
- **Claim (the test's own name)** `it('no DROP TABLE without IF EXISTS', …)` asserting
  `expect(unsafeDrops.length).toBe(0);`
- **Expected** a green assertion that means "no migration drops a table without an `IF EXISTS` guard".
- **Actual** `:80` is

  ```js
  const dropMatches = content.match(/DROP TABLE\s+(?!IF EXISTS)/gi);
  ```

  It matches against **raw file text**, with no comment stripping and no statement-level parsing.
  Running that exact regex over the same file list the test builds at `:8-10` gives:

  | # | file | line | line content | executable? |
  |---|---|---|---|---|
  | 1 | `0107_enforce_not_null_other_tables.sql` | 53 | `-- DROP TABLE under FK enforcement fires immediate ON DELETE CASCADE/SET NULL` | no — comment |
  | 2 | `0108_add_meals_project_id.sql` | 68 | `DROP TABLE _0108_project_guard;` | **yes** (`C‑2`) |
  | 3 | `0111_fix_project_id_set_null_contradiction.sql` | 42 | `--     DROP TABLE of the parent is DEFERRED and COMMIT-validated, so drops` | no — comment |
  | 4 | `0112_drop_pos_tenant_id_defaults.sql` | 374 | `-- when DROP TABLE fires an immediate CASCADE into a surviving table, SQLite` | no — comment |
  | 5 | `0115_rooms_new_tenant_not_null_fk.sql` | 108 | `DROP TABLE rooms_new;` | **yes** (`C‑5`) |
  | 6 | `0126_tenant_scoped_unique_sku_email.sql` | 96 | `-- DROP TABLE removes its sqlite_sequence row and the staging table's own` | no — comment |

  **6 matches**, so `:90`'s `expect(unsafeDrops.length).toBe(0)` sees **6, not 2** — and **2**, not 6,
  is the number of real unguarded statements. **The assertion cannot pass as written.** It is also
  **not** reported as failing here: this note filed **no** defect against the suite's *result*, only
  against the assertion's *arithmetic*, and no suite was run (see *Method*). It is very likely the
  test currently fails, or has been failing since `0107`/`0111`/`0112`/`0126` landed, and the
  reconciliation pass that touched six documentation folders did not run it.

- **IF EXISTS guard** N/A — this is the test, not a migration
- **Class** UNGUARDED-BY-REGEX · **Severity** **P2** · **Action** **`FIX-CODE`**
- **Deferred to** **Wave 9** · **Reason** it is one edit to one test file, batched with `C‑1`…`C‑6`
  so the corrected regex and the corrected migrations land in the same review
- **The fix, and why it is not simply "strip comments"** stripping `--` lines would drop the count from
  6 to 2 and make the assertion **still fail** — and for the *right* reason, which is the whole point:
  the two real statements are `C‑2` and `C‑5`. So Wave 9 needs **both** halves, in this order:
  1. strip SQL comments (or match line-anchored statements only), so the regex reports **2**;
  2. decide `C‑2` and `C‑5` — add `IF EXISTS` to `0108:68`, and add an explanatory comment (not the
     keyword) at `0115:108`.

  Only after both does `:90` return `0`. **A pass achieved by weakening the regex alone is a false
  green**, and that is the specific failure mode to avoid — the migration files and the test that
  polices them must be closed together or the queue just reappears wearing a green checkmark.

- **Deliberately not edited.** This note is a findings file; the owner chose FIX DOCS ONLY; and the
  instruction for this pass was explicit — record the code-side finding, do not touch the test. **The
  fix belongs to whoever takes Wave 9**, and the wording above is written so they can act on it without
  re-deriving the count.

## C‑7 · `monitor/tests/api.test.js` — the suite is red on `main`, and the fixtures are why

- **Origin** **not** `O‑21`: a different subsystem with no archived finding behind it. First observed
  by the gaps round-1 verification pass on 2026-10-06 and recorded there, **reproduced and diagnosed
  2026-10-08** · full evidence in `.opencode/audits/monitor-suite-red-2026-10-06.md` · filed
  2026-10-08
- **Files** `monitor/tests/api.test.js` (1466 lines, 6 failing assertions) ·
  `monitor/tests/helpers/fake-r2.js` (the fixtures) · the code they disagree with:
  `monitor/src/index.js:341-353` (`newestRun`), `:495-505` (`readHistoryWindow`), `:1268`
  (`escapeHtml(t.last_error)`)
- **Claim (the implied one)** `cd monitor && npx vitest run` is the command
  `docs/01-architecture/ARCHITECTURE.md:184` names for the "Monitor unit" row, and the run it cites
  (`9e809bd`) recorded **"Suite: 7 files / 191 tests PASS"**. Each failing test carries the same
  unstated claim: that its hard-coded instant is still current.
- **Expected** **7 files / 191 tests, 0 failed**, exit 0.
- **Actual** **7 files / 191 tests, 6 failed | 185 passed**, exit 1 — deterministic across four runs.
  **The file count and the test count are both still exactly right; only the verdict rotted**, which
  is why the recorded baseline could not be trusted by inspection. Six failing assertions, all in
  `tests/api.test.js`:

  | line | assertion | got | why |
  |---|---|---|---|
  | 180 | `expect(body.overall).toBe('ok')` | `'down'` | `newestRun` found no run, so no target has a result and none has alert state → all `up:false` → `upCount === 0` → `'down'` |
  | 304 | `expect(… .up).toBe(false)` | `true` | same miss; the row is null, so the **carry-forward** answers `last_state === 'up'`, which this test deliberately seeded `up` |
  | 368 | `expect(body.checks).toHaveLength(3)` | `0` | every seeded ring entry is older than the 24h window |
  | 454 | `expect(body.checks).toHaveLength(288)` | `0` | same, at `hours=24` with 288 seeded entries |
  | 466 | `expect(body.checks).toHaveLength(500)` | `0` | same, at the 500-entry cap |
  | 1464 | `expect(html).toContain('&lt;img src=x&gt;')` | absent | the `<img src=x>` payload is a probe `error_message` rendered at `:1268`, and the card is never built because the run was not found |

- **The mechanism, in one sentence: every fixture is stamped `2026-10-03`, and the code these tests
  read is stamped `now`.** `newestRun(bucket, now = new Date())` scans **only today and yesterday**
  (`for (const daysAgo of [0, 1])`, `:342`) — a deliberate optimisation with its own passing test
  ("falls back to yesterday when today has no run yet") — so a run object under
  `checks/2026-10-03/` is invisible from **2026-10-05** onward. `readHistoryWindow(env, target, hours,
  now = new Date())` filters on `since = now − hours` (`:496`), so entries 5 days old are dropped.
  The sibling tests that read `new Date()` correctly pin it — `vi.setSystemTime` appears 19 times in
  this file, at `:238`, `:271`, `:389`, `:491` and 14 more — and the six failures are exactly the ones
  that do not.
- **Confirmed, not inferred.** Re-running the same file with the clock pinned to the fixtures' own
  instant (`2026-10-03T12:00:00.000Z`) turns **all six green**; one unrelated test then errors inside
  vitest's runner (`STACK_TRACE_ERROR`, no assertion) which is an artefact of the pinning shim, not a
  seventh defect — it is green on the real clock.
- **Class** **CLOCK-COUPLED-FIXTURE** — a third class for this note, and the one that has no `IF
  EXISTS` to add. Nothing in the codebase promises the fixture instant stays current; the suite
  silently assumed it. · **Severity** **P2** · **Action** **`FIX-CODE/TEST`**
- **Deferred to** ~~Wave 9~~ **— never deferred. RESOLVED 2026-10-14 by `97bb5bd`.**

> ### Status — `RESOLVED-CODE` 2026-10-14, commit `97bb5bd`
>
> `test(monitor): use relative timestamps in fixtures — fixes red suite on main`, one commit, tests
> only. **`monitor/src/` was not touched** — `git diff --stat monitor/src/` is empty — which is the
> whole finding confirmed: the six failures were fixtures misreading two correct windows.
>
> - Fixtures read against the real clock now anchor to `Date.now()` (`NOW` / `MINUTE` / `HOUR` /
>   `agoMs` / `agoIso`) rather than to `2026-10-03`. Offsets are **minutes** on purpose:
>   `newestRun` looks back by UTC *day prefix*, so a fixture anchored in hours is not guaranteed to
>   stay inside the lookback when the suite starts near midnight.
> - The 19 tests that already pinned the clock with `vi.setSystemTime` **kept their absolute
>   instants** — pinning both sides to one literal is what makes a boundary assertion exact.
> - Two tests added, because with every fixture stale `/api/history` returning `[]` was
>   indistinguishable from a filter rejecting everything: `a run older than the two-day lookback is
>   INVISIBLE, and the page says so` (+ its in-window twin), and `drops entries older than the window
>   and keeps the ones inside it`. Both were **mutation-checked** — widening `newestRun` to
>   `[0, 1, 2, 3]` fails the first, `since = 0` fails the second — so a future change that loosens a
>   window cannot land silently.
> - **Verified:** 7 files / 194 tests pass, three consecutive identical runs, plus green with the
>   clock pinned one year ahead, twenty days back, and at `00:02` UTC.
>
> The `Wave 9` slot this entry was parked in is therefore **free again**; `C‑0`…`C‑6` still hold it.
>
> ### Status — `DEFERRED` to Wave 9, filed 2026-10-08
>
> *Retained as the record of why it was not fixed during the documentation round.*
>
> The fix belonged to the code workstream, and that mission was forbidden to touch `monitor/`.
- **The fix is in the tests, not the production code.** Pin the clock in the six tests the way their
  siblings do, or derive the fixtures from the existing `NOW` constant (`tests/api.test.js:473`)
  instead of a literal. **Do not widen `newestRun`'s two-day lookback or `readHistoryWindow`'s window
  to make the tests pass** — both are correct, both are documented, and both have passing tests of
  their own; loosening them to accommodate a stale fixture would trade a red suite for a monitor that
  reports a five-day-old probe as current.
- **One assertion in the set is currently vacuous, and the code workstream should know before
  "fixing" it.** `tests/api.test.js:1463`'s `expect(html).not.toContain('<img src=x>')` passes
  *because the card is missing*, not because escaping works. The escaping guard only comes back to
  life when the run is found. Its title, "accepts session cookie too and escapes report content", is
  also stale: the payload is a probe error, not report content — report text stopped being
  server-rendered at `monitor/src/index.js:1245-1250` and is now assigned as text nodes
  (`:1416-1428`), which the neighbouring test at `:1401` already pins.
- **Deliberately not edited.** No file under `monitor/` was modified by the pass that filed this entry,
  including the `wrangler` devDependency bump left dirty in `monitor/package.json`. The owner routes it.

## Why `O‑21` is filed in two places

`docs/05-operations/AUDIT_MASTER_FINDINGS.md` M21 produced **two** findings that had to be separated
before either could be closed, and the separation is the reason [[code-vs-docs]] `O‑21` is
`RESOLVED-DOC` while this note is `OPEN`:

- **The doc half** — the archived claim "20 unsafe `DROP TABLE` in 11 migrations", citing `0014` /
  `0039` / `0040` / `0042` / `0046` / `0047` / `0054` / `0069` / `0091` (nine ids for "11
  migrations"). All nine resolve **only** to `backend/migrations/legacy/`, which `wrangler` never
  scans, and **every** `DROP TABLE` in all **99** `legacy/` files is guarded. The archived file is
  `status/archived` and dated 2026-09-05, so `b06990c` handled it the way an archive should be
  handled: a status block mapping sections to FIXED / MOOT / WRONG / SUPERSEDED, with the 2026-09-05
  text preserved under strikethrough. That claim was **wrong about where the risk was**; rewriting the
  numbers would have destroyed the record.
- **The code half** — the applied lineage's own 6 matches, which **no doc claims**. A reader who
  trusted M21 would under-protect them, which is the exact failure `O‑21`'s own entry note predicted:
  *"the finding is resolved rather than merely restated; a reader who trusts '20 in 11 migrations'
  will under-protect the 6 that remain."*

One archived section, two findings, two destinations. **The rule this establishes:** a claim that is
*wrong* and a claim that is *right but incomplete* need different fixes, and closing the first while
leaving the second unrecorded converts a documented risk into an undocumented one.

**`C‑7` is not part of this split, and belongs in the note anyway.** It has no archived finding
behind it, no `legacy/` lineage, and no `DROP TABLE`: it is an independently discovered defect in a
different subsystem, filed here for one reason — this is the folder's only note that may hold a code
finding, and **routing by "is it a code defect?" beats routing by "which audit found it?"** A reader
who finds `C‑7` under the `O‑21` heading would also file it as the same residue, and it is not.

# Related

- [[99-gaps/README]] — the folder index and its rules for editing these notes
- [[code-vs-docs]] — where the folder-wide status ledger lives, `## Status as of 2026-10-06`
- [[migrations]] — the live guide; `§1` is the authority on migration head and count
- [[TESTING]] — the folder whose `migration-integrity.test.js` this note's `C‑0` lands in, and which
  names the monitor suite's command
- [[AUDIT_MASTER_FINDINGS]] — the archived 2026-09-05 source of `O‑21` / M21, `status/archived`
- `.opencode/audits/gaps-triage-A-2026-10-06.md:188-190` — where the live residue was first named
- `.opencode/audits/monitor-suite-red-2026-10-06.md` — the unabridged evidence for `C‑7`

## Addendum 2026-10-14 — discovery audit `D‑1`…`D‑9` (Status OPEN, wave unassigned)

Filed from `.opencode/audits/discovery-2026-10-14/` (branch `main` @ `8d6e3ba`), read-only, each
re-verified by the orchestrator with the quoted command. No existing entry is altered; overlaps name
the existing entry. Full 5-tuple evidence (location / reproduction / impact / falsification /
severity) lives in `02-findings.md` + `05-evidence/F-*.txt` of that audit.

### `D‑1` · `GET /api/supply/boms` N+1 read · P1 · FIX-CODE · OPEN
- **File** `backend/src/api/supply.js:462-477` (loop `:472`).
- **Observed** 1 BOM-list query + 1 `SELECT * FROM bom_lines WHERE bom_id = ?` per BOM, no `IN()`
  batching, no outer `LIMIT`. Same file fixed this pattern with `IN()`+`batch` at `:598-603`.
- **Repro** `sed -n '462,477p' backend/src/api/supply.js`.

### `D‑2` · sequential per-line INSERT awaits on 4 write paths · P1 · FIX-CODE · OPEN
- **Files** `backend/src/api/financials.js:290-296` (entry_lines), `:370-377` (invoice_lines);
  `backend/src/api/supply.js:369-375` (PO lines), `:497-503` (bom_lines).
- **Observed** lone `await … INSERT … .run()` per line, no `DB.batch()` — N×RTT latency plus
  non-atomic partial writes. Batch idiom established (`folios.js:215`, `supply.js:452,609`).
- **Repro** `grep -n "for (const line" backend/src/api/financials.js backend/src/api/supply.js`.

### `D‑3` · `GET /api/camps` unbounded fallback when `?limit` absent · P2 · FIX-CODE · OPEN
- **File** `backend/src/api/camps.js:205-221`.
- **Observed** `if (limit)` branch paginates; else full `SELECT * FROM projects …` (tenant) or
  cross-tenant `SELECT c.* … GROUP BY c.tenant_id` with zero `LIMIT`.
- **Repro** `sed -n '205,221p' backend/src/api/camps.js`.

### `D‑4` · hottest public GETs bypass `cachedJsonResponse`; `Vary` covers 1 of 3 dimensions · P2 · FIX-CODE · OPEN
- **Files** `backend/src/api/meals.js`, `meal-plans.js`, `marketplace.js`, `storefront.js` (all
  `jsonResponse`); `backend/src/utils/response.js:64-76,72`; `middleware/tenant.js:9`,
  `middleware/resolveScope.js:17,158`.
- **Observed** zero `cachedJsonResponse` on anonymous tenant/slug-keyed reads despite
  `response.js:58-61` naming products/meals/plans as intended users; single `Vary: x-tenant-id`
  vs hostname/query/header resolution. Overlaps `code-vs-docs` `:900` (helper contract) — that row
  describes the helper; this row describes its non-use.
- **Repro** `grep -rn "cachedJsonResponse" backend/src/api/meals.js backend/src/api/marketplace.js backend/src/api/storefront.js backend/src/api/meal-plans.js` → zero.

### `D‑5` · refresh rotation without revocation; logout no-op · P2 · FIX-CODE · OPEN
- **Files** `backend/src/api/auth.js:235-245` (re-issue), `:263-266` (logout); POS mirror
  `backend/src/routes/pos/index.js:292-304` (comment admits "no revocation table yet").
- **Observed** no store/invalidation of the old refresh token; logout returns success only. Stolen
  refresh mints access until its own 7d exp. No D1 table, KV entry, or used-flag found.
- **Repro** `sed -n '235,270p' backend/src/api/auth.js`.

### `D‑6` · inline-script fetch bypass + fragile `window.__API_BASE` bridge · P2 · FIX-CODE · OPEN
- **Files** writers `CampsSection.astro:186,190,191`; readers `MarketplaceHome.astro:247`,
  `CampsSection.astro:251,281,312`, `gallery.astro:141-182`; hand-rolled base
  `contact.astro:132-133`, `sitemap.xml.ts:15`.
- **Observed** public/lead traffic bypasses `@/lib/api` with a duplicated tri-branch base URL;
  `MarketplaceHome` consumes `window.__API_BASE` it never sets. Distinct from `A‑11` (which was a
  *comment*, REJECTED) — these are live assignments/reads.
- **Repro** `grep -rn "window\.__" app/src --include="*.astro" --include="*.tsx"`.

### `D‑7` · `cashier_id TEXT NOT NULL`, no FK, mismatched to `pos_users.id INTEGER` · P2 · FIX-CODE · OPEN
- **File** `backend/migrations/0004_pos.sql:125,219` vs `:183`; workaround `0119:43` (`CAST`).
- **Observed** orphan cashier references unenforceable without a type migration. Overlaps
  `code-vs-docs:1795` (which records the *naming* fact `cashier_id`≠`staff_id`); this row records the
  *typing/FK* fact. `staff_id` column does not exist (comment-only hits).
- **Repro** `grep -n "cashier_id" backend/migrations/0004_pos.sql`.

### `D‑8` · `escHtml` ×4 with semantic drift · P2 · FIX-CODE · OPEN
- **Files** `app/src/lib/utils.ts:3`, `backend/src/utils/response.js:108`,
  `MarketplaceHome.astro:201`, `CampsSection.astro:195`.
- **Observed** same name/signature, different implementations: DOM versions escape all entities,
  regex/chained versions escape 5 chars. Overlaps `S‑8`/`S‑9` MATCHED controls (which census
  *occurrences*); this row records *implementation divergence* of the four definitions.
- **Repro** `grep -rIn 'function escHtml' app/src backend/src`.

### `D‑9` · `workers.uptime` is epoch-ms rendered as days · P2 · FIX-CODE · OPEN
- **Files** producer `backend/src/api/admin-health.js:70` (`uptime: Date.now()`); consumer
  `SystemHealthPanel.tsx:103` (`/ 86400_000` + "d"); `index.js:202 uptime_ms` is a different,
  correct field (excluded).
- **Observed** panel shows days-since-epoch (~20,000+d). Fix is duration or rename to `serverTime`.
- **Repro** `sed -n '55,85p' backend/src/api/admin-health.js`.

## Resolutions 2026-10-15 — P1-1, P1-2, P1-3

No existing entry is rewritten; each resolution names the entry it closes and the commit that
closed it, per folder rules. `C‑0` below is the same `C‑0` filed above — its status moves, its text
does not.

### P1-1 · deploy.yml "Integration" ran the unit suite; smoke could not fail · RESOLVED 2026-10-15 · `64cafc9`
- **Closed by** `64cafc9` *ci(deploy): run the integration suite under the integration job + make
  smoke failures fail the job — discovery P1-1*: matrix command is now
  `npx vitest run --config vitest.integration.config.ts`, and the e2e-verify `|| echo ...
  (non-blocking)` swallow is removed (YAML-validated).
- **Note: CI validation pending next main push.** `deploy.yml` triggers only on `main`/`staging`
  pushes, so no test branch could exercise it; on the next main push check the "Run Integration
  tests" step log for `--config vitest.integration.config.ts`.

### P1-2 · Integration CI red on main · RESOLVED 2026-10-15 · `b109014`
- **Closed by** `b109014` *test(integration): repair 3 red assertions — discovery P1-2*: the three
  `C‑0` assertions repaired (grandfathered `hr`/`ai` slugs; comment-stripping DROP guard with two
  pinned intentional statements; uniqueness + strictly-increasing numbering). File now 10/10 green.
  **`C‑0` is therefore `RESOLVED-CODE`** — the second in this note after `C‑7`.
- **Note: 55 failures, not 3.** The full suite showed 55 failed, not the 3 the discovery sampled:
  **40 were class C** — the local D1 was stranded at `0110` while the code expects `0127`
  (repaired by wiping local state and replaying 0001→0127 clean, plus restoring the hand-seeded
  `marketplace` row; backup at `/tmp/opencode/d1-backup/d1.sqlite`; no production systems
  touched); **3 were class A** test drift, fixed by `b109014`; **10 remain class A** (the meals
  cluster, the smoke Sunset, the superadmin list premise — see W9 intake below) for Wave 9.
  Suite stands at 236 passed / 10 failed; backend 2743/2743, frontend 3632/3632, monitor 194/194.

### P1-3 · `0127` pending-apply on prod · RESOLVED 2026-10-14
- **Closed by owner apply on 2026-10-14** (no repo commit): `npx wrangler d1 migrations list
  campmaster-db --remote` now reports "No migrations to apply!".
- **Note: `0126` was also pending; both applied 2026-10-14.** The discovery named only `0127`
  because it checked the head, not the full gap — the method now requires the list command
  (`.opencode/audits/discovery-2026-10-14/01-method.md`, amendment 2026-10-14).

## Wave 9 intake 2026-10-15 — `W9‑1`…`W9‑3` (Status DEFERRED to Wave 9)

The 10 residual integration failures, grouped by root cause. All `Action` `FIX-TEST` (update the
test bodies to the intended post-Sep-23 API shape), all `Status` `DEFERRED` to Wave 9.

### `W9‑1` · meals-cluster test bodies omit `project_id` (8 tests, 6 files) · P1 · FIX-TEST · DEFERRED
- **Files** `tests/core/meal-categories-crud.test.js:27` (POST sends `{name}` only),
  `tests/core/meals-ingredients-full.test.js`, `tests/tenant/meals.test.js`,
  `tests/security/row-isolation.test.js` (Meals case), `tests/tenant/cascade.test.js`
  (meal-category case), `tests/tenant/concurrency-extended.test.js` (meal updates).
- **Observed** `POST /api/meal-categories` requires `project_id`
  (`backend/src/api/meal-categories.js:10`, added `772e8f9`, 2026-09-23 project-scoping) but the
  test bodies predate it → 400, and every downstream GET/PUT/DELETE in the same files 404s on the
  never-created row. Class A drift; the API is right.
- **Repro** full `npx vitest run --config vitest.integration.config.ts` on a 0127-shape local DB.

### `W9‑2` · superadmin list premise impossible (1 test, 1 file) · P3 · FIX-TEST · DEFERRED
- **Files** `tests/superadmin/tenants.test.js:23-29` ("at least the marketplace tenant") vs
  `backend/src/api/tenants.js:106,109` (public list excludes `marketplace` by design, since
  `737d7c2`).
- **Observed** the test can only pass when some *other* active tenant happens to exist (parallel
  workers' tenants) — timing-dependent by construction. Either seed a listable tenant in the test
  or assert on the super-admin branch, which does not filter by `status`.
- **Repro** same full-suite command on a clean local DB: `expected 0 to be greater than 0`.

### `W9‑3` · smoke Sunset expectation vs intentional sunset alias (1 test, 1 file) · P3 · FIX-TEST · DEFERRED
- **Files** `tests/core/smoke.test.js:132` (expects no `Sunset` on `/api/v1/*`) vs
  `backend/src/api/camps-alias.js` (`Sunset: Fri, 23 Oct 2026`, added `b1dd0a1`, 2026-09-23
  `/api/camps` → `/api/projects` rename).
- **Observed** the header is intentional until the 2026-10-23 deletion date; the test needs a
  time-aware update, not the code. **Resolves 2026-10-23** — on or after that date, either the
  alias (and header) is gone and the test passes, or the alias survived and the test is still
  correctly red.
- **Repro** same full-suite command: `expected 'Fri, 23 Oct 2026 00:00:00 GMT' to be null`.
