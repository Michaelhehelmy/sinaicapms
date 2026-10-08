---
title: "Code vs code — UNDOCUMENTED and unguarded behaviour"
aliases:
  - code-vs-code
tags:
  - type/audit
  - audience/agent
  - domain/docs
  - status/live
created: 2026-10-06
updated: 2026-10-06
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
  - "docs/05-operations/AUDIT_MASTER_FINDINGS.md"
  - "docs/09-plans/FINAL_IMPLEMENTATION_PLAN_v3_waves.md"
verified: 2026-10-06
---
# Code vs code — UNGUARDED behaviour in the applied migration lineage

The other three notes in this folder ask **"does the code do what the docs say?"** This one asks the
question that survived a docs-only reconciliation: **"where does the code assert a property it does
not actually enforce?"** It holds **6** entries, all from one finding (**`O‑21`**'s M21 half), all
`Severity` **P2**, all `Action` **`FIX-CODE`**, all deferred to **Wave 9**.

**Nothing in this note has been fixed.** The owner chose FIX DOCS ONLY for the 2026-10-06
reconciliation, so the documentation half of `O‑21` was closed (`b06990c` corrected the archived
claim) and this code half was recorded rather than touched. That is the whole reason the note exists:
a fix-docs-only pass closes a doc claim about a code defect and leaves the defect standing, which is
correct only if somebody records that it is still standing.

## Status as of 2026-10-06

| Status | Count | Entries |
|---|---|---|
| `OPEN` | **6** | `C‑1` … `C‑6` — one per migration file carrying a bare `DROP TABLE` |
| `DEFERRED` | **6** | the same six, **deferred to Wave 9**; `OPEN` and `DEFERRED` are not exclusive here (see below) |
| `RESOLVED-CODE` | **0** | no code changed |
| `RESOLVED-DOC` | **0** | no doc needed changing — the live claim was already corrected in `b06990c` |
| `RESOLVED-REJECTED` | **0** | |
| **Total entries** | **6** | |

**`OPEN` and `DEFERRED` overlap here and the overlap is the point.** In the other three notes the two
are alternatives — an entry is either waiting for a decision or waiting for a pass. In this note all
six are waiting for *both*: an owner slot to work in and a code change nobody has made. Reporting
them as `DEFERRED` alone would understate the queue; reporting them as `OPEN` alone would imply the
work is unowned. **Both counts are true, and the row above is the honest way to say so.** The
folder-wide ledger, where each entry gets exactly one status, is `## Status as of 2026-10-06` in
[[code-vs-docs]].

**Why "Wave 9" when the wave plan stops at 7.** `docs/09-plans/FINAL_IMPLEMENTATION_PLAN_v3_waves.md`
§5 plans **Waves 0 → 7**, and "Wave 8" was already used ad hoc for the tenant-import carry-forward
(`BLOCKED-pos-products-composite-pk.md` §5.3, closed). **Wave 9 is therefore the first free slot, and
the number is this note's convention, not a slot the plan reserved.** Anyone who disagrees should
rename it in one place — this line and the `Deferred to` row on each entry — rather than leave six
entries pointing at a wave that does not exist.

**The one-sentence finding.** `docs/05-operations/AUDIT_MASTER_FINDINGS.md` M21 (2026-09-05) claimed
**"20 unsafe `DROP TABLE` (no `IF EXISTS`) in 11 migrations"**, citing nine migration ids. Today
**every** `DROP TABLE` in the excluded `backend/migrations/legacy/` lineage is guarded — verified by
scanning all **99** files: **0** bare `DROP TABLE` statements. The claim's cited files were all in
`legacy/`, and `legacy/` is not a lineage `wrangler` ever runs. Meanwhile the applied lineage's own
**6** bare drops are **not claimed anywhere in the vault**. So the archived finding was wrong about
where the risk was, and the risk itself was never written down.

## Method

For each of the 6 files the question is one: **does the file's `DROP TABLE` carry an `IF EXISTS`
guard?** Measured mechanically, not read by eye, because the difference between "a bare `DROP TABLE`"
and "a bare `DROP TABLE` inside a `--` comment" is exactly the kind of distinction a reviewer gets
wrong by scanning:

```bash
# every line in the applied lineage matching the guard-less form, with its file and line
grep -nE 'DROP[[:space:]]+TABLE[[:space:]]+(?!IF EXISTS)' -P backend/migrations/*.sql
```

That yields **6** lines in **6** files. Reading each line then splits them **2 / 4**: two are real
statements, four are prose inside the comment blocks that *document* the RENAME-swap idiom. **Both
halves are filed below, and the reason is in `C‑0`.** `rg` is not on PATH in this workspace; every
measurement here used `grep` or a throwaway `node:fs` script from `/tmp`.

**What the six have in common.** All six live in the RENAME-swap rebuild idiom
(`PRAGMA defer_foreign_keys = true` → `CREATE TABLE x_new` → copy-ALL → drop-old → `ALTER … RENAME` →
`PRAGMA foreign_key_check`), and in that idiom the drop-old step is *normally* guarded — `0107:434-443`,
`0111:453-462`, `0112:383-387` and `0126:280-281` all write `DROP TABLE IF EXISTS`, and their own
headers explain the discipline. Two files step outside it. **That is the actual defect class:** not
"migrations are unsafe" but "the idiom's own convention is enforced by habit, not by anything".

**Severity P2 for all six, and the reasoning, because "P2" hides a judgement.** `P1` in this repo's
scale is "a reader or agent acting on the doc breaks something". These six cannot break anything by
being read — they execute only during `wrangler d1 migrations apply`. `P0` is a production bug, and
none of these is one: in every case the drop is preceded in the same file by a statement that fails
first if the target is absent (`0108`'s `CREATE TABLE IF NOT EXISTS` at `:56`; `0115`'s
`INSERT … FROM rooms_new` at `:97-106`), and D1 applies each migration atomically, so a missing
target aborts the file with the database left where it was. They are **P2**: a wrong property in a
place the codebase treats as an invariant, on a path with no live incident — which is the definition
of a hygiene finding in this vault's scale, and the reason none of them is worth an unscheduled wave.

**Deferred to Wave 9, not fixed now**, for three reasons that are worth stating because a reader will
otherwise assume the deferral is a formality:

1. **The owner scoped this round to documentation.** `RESOLVED-CODE = 0` across the whole folder.
2. **Editing an already-applied migration is not free.** All six files are in the applied lineage
   (`0126` landed 2026-10-02, `5ff57a7`). Adding `IF EXISTS` is *semantically* a no-op on every
   database that already applied them — but it changes a checksum-relevant artefact, and the
   project's own hard rule 7 is that table rebuilds are forward-only with rollback = restore-from-
   backup. A one-word edit to an applied migration deserves a wave slot, not a drive-by.
3. **One of the two real statements is arguably correct as written.** `0115:108`'s
   `DROP TABLE rooms_new;` is the drop-old step of a swap whose copy at `:97-106` reads
   `FROM rooms_new` — so the table provably exists, and `IF EXISTS` would only mask a real failure
   (a `rooms_new` that vanished is a bug worth aborting on). **The fix for `0115` is therefore
   probably a comment, not a keyword.** Recorded here rather than assumed, because "add `IF EXISTS` to
   everything" is how a safety guard becomes a silencer.

# Entries

Every entry is a **file**, not a line: one migration per row, because a file is the unit `wrangler`
applies and the unit a rollback reverts.

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

# Related

- [[99-gaps/README]] — the folder index and its rules for editing these notes
- [[code-vs-docs]] — where the folder-wide status ledger lives, `## Status as of 2026-10-06`
- [[migrations]] — the live guide; `§1` is the authority on migration head and count
- [[TESTING]] — the folder whose `migration-integrity.test.js` this note's `C‑0` lands in
- [[AUDIT_MASTER_FINDINGS]] — the archived 2026-09-05 source of `O‑21` / M21, `status/archived`
- `.opencode/audits/gaps-triage-A-2026-10-06.md:188-190` — where the live residue was first named