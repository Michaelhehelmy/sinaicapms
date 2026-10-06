---
title: "docs/99-gaps"
aliases:
  - gaps
tags:
  - type/index
  - audience/agent
  - domain/vault
  - status/live
created: 2026-10-06
updated: 2026-10-06
relates-to:
  - "[[code-vs-docs]]"
  - "[[unverified]]"
  - "[[unimplemented]]"
  - "[[01-architecture/README]]"
  - "[[07-data/README]]"
  - "[[migrations]]"
  - "[[TESTING]]"
  - "[[security-guide]]"
code-references:
  - "backend/migrations/0127_meals_tenant_composite_pk.sql"
  - "backend/wrangler.toml"
  - "backend/src/index.js"
  - "app/src/lib/api.ts"
  - "AGENTS.md"
  - "deploy.sh"
verified: 2026-10-06
---
# docs/99-gaps

## Overview

What the vault's docs claim, checked against the code, with the mismatches filed here instead of
being discovered one reader at a time. This folder holds **no new subject matter** — it is the
reconciliation queue for the other ten folders. Three notes, one entry format, every entry carrying
the `file:line` its claim was measured against.

Nothing in this folder has been fixed. These are findings with named actions, written so that a
reconciliation pass edits docs instead of re-running two audits.

## Concepts

- **A claim is anything falsifiable** — a count, a filename, a line range, a port, an endpoint path, a
  table name, an instruction, and a *negative* claim ("no PDF export", "no second REACT copy") just
  as much as a positive one. Negative claims are the easiest to get wrong, because there is nothing
  in the code to look at and nothing to grep.
- **Five classes, and the class is the finding.** `MATCHED` the claim is true · `STALE` it was true
  and has drifted · `FALSE` it was never true, or the doc set contradicts itself · `UNVERIFIED` it
  cannot be checked from the tree · `UNDOCUMENTED` real code that no doc claims. `MATCHED` is the
  control class: an entry that finds nothing is still filed, because a finding with no control is not
  a finding.
- **Severity is about consequences, not size.** `P1` a reader or agent acting on the doc breaks
  something — an instruction naming a taken migration slot, a table an E2E spec selects on. `P2` a
  wrong number, path or capability in a doc used as a source of truth. `P3` a stale citation, a
  count, a line range.
- **Every entry keeps its citation.** The queue is only worth having if an entry is checkable from
  the note alone, so `Actual` carries the `file:line` for every measurement and `Claim` is quoted
  verbatim. No fix is applied; the action is named and left for a pass that has permission to edit.
- **The docs disagree with each other more than with the code.** Each individual file is largely
  self-consistent and largely right; the drift is between them. `ARCHITECTURE.md` says the role
  ladder has no `staff`, `API_CONTRACT.md` says it does; `security-guide.md` and `ARCHITECTURE.md`
  both say the rate limiter's tenant layer covers 7 prefixes and the code has 36; the roadmap
  reserves `0100_*` as a free migration slot six migrations after it was taken. **Fix these in a
  cross-doc pass, in one order — not one file at a time**, or the next single-file fix undoes the
  last one.
- **`code-references` is the audit's cheapest tool, and it has a half-life.** Sweeping every
  `code-references` entry in the 34 audited files resolved **173 / 173** in audit B and **9 / 9** in
  audit B's testing pair, **30 / 30** in `10-tenant-import`, **17 / 17** in `05-operations` — file
  existence is machine-checkable and is the one thing a grep can prove. But file-level references go
  stale as the file grows: **line-level** ones are the ones that rot. `tenant-import.js:723-726`,
  `resolveImage :38–58` and "section 0, `:344–411`" all still resolve as *files* while pointing at
  the wrong lines (`N‑9`, `N‑18`, `N‑4`). **Grep a reference to existence, then re-grep the range when
  the file changes.**

## Docs

| Doc | What it is |
|---|---|
| [[code-vs-docs\|code-vs-docs.md]] | **`STALE` + `FALSE` claims** — 80 entries, plus the 112 `MATCHED` controls they rest on. Entry **#1** is the migration-head drift: `AGENTS.md` says 53 / `0053`, `docs/07-data/migrations.md` says 37 / `0123`, `WAVE6_EXIT_REPORT.md` says 99 / `0099`, and the tree has **40** with head `0127_meals_tenant_composite_pk.sql` (`legacy/` = 99). |
| [[unverified\|unverified.md]] | **`UNVERIFIED` claims** — 15 entries the tree cannot answer: needs a build, a live host, a Cloudflare console, a manual checklist, or a diff against a pinned SHA. Not defects; the honest edge of a read-only audit. |
| [[unimplemented\|unimplemented.md]] | **`UNDOCUMENTED` code** — 10 entries of real code no doc claims, from `DELETE /api/media/*` to the ~199 endpoints that have no OpenAPI registration at all. The class only reading the source can produce. |

## Workflow

1. **Audit** one folder group at a time, read-only: no doc edited, no suite re-run, no `wrangler`, no
   remote call. Record a baseline commit and confirm it is pushed **before** any write.
2. **Extract** every falsifiable claim, not a sample of them. Where a claim is a count or a table,
   check the whole thing mechanically — a sample cannot validate a count, and three of the four worst
   findings here (184 non-existent client symbols, 30 missing tab IDs, 28 phantom tables) were only
   visible as totals.
3. **Class** each claim and give it a severity from its consequence, not its size. Cite `file:line`.
4. **File** it into one of the three notes. An entry may carry two classes; file it under the more
   consequential one and keep both named.
5. **Fix** in a cross-doc pass, entry #1 first, in this order: `P1` → `P2` → `P3`, and for any single
   fact fix **every carrier in one commit**. Entry #1 alone has three.
6. **Re-check** by re-running the audit's commands, not by re-reading the doc.

**Rules for anyone editing these notes**

- Never delete an entry because it was fixed. Move it to a fixed state with the commit that fixed it;
  a queue that forgets what it caught cannot tell a reader whether a gap was closed or never seen.
- Never add a `MATCHED` entry to a gap note. Controls belong in [[code-vs-docs]], at the foot,
  because a finding that quotes "**A‑1**" is only auditable if **A‑1** is readable there.
- `verified: 2026-10-06` on these notes means *the claims were checked on that date against that
  baseline*, not that the docs are correct. What was and was not re-run is recorded in
  [[code-vs-docs]] and repeated in each note's header.

**This section supersedes one rule in [[contributing]]**, which was left unedited because this pass is
audit-only: `## Gaps` in a folder MOC is no longer a placeholder — all eleven now point here, with
that folder's own counts. The three files in `_templates/` still carry the byte-exact placeholder,
because a template is a new doc that has not been audited yet. The `contributing.md` sentence that
says the placeholder "stays … until the gaps sweep runs" is now historical; the sweep has run.

## Related

- [[README|docs/README.md]] — vault entry point
- [[contributing]] — the frontmatter schema and MOC rules these notes follow
- [[ARCHITECTURE]] — the doc whose §7 test-count table is the model the other count claims should copy
- [[API_SURFACE_MAP]] — the doc with the three unbacked columns (entries `S‑2`, `S‑3`, `S‑4`)
- [[migrations]] — the live guide that instructs the reader into a taken migration slot (`D‑2`)
- [[TESTING]] — the doc whose tab-ID table is nominated as authoritative and is 39% incomplete (`T‑5`)
- [[security-guide]] — the folder's best-audited doc, and the one carrying a three-site stale figure
- [[98-history/sessions/AGENT_LOGBOOK_HISTORY]] — where every test count in these entries comes from

## Gaps

**This note is itself a gap.** Every claim in `docs/01-architecture` … `docs/10-tenant-import` is
tracked here, and this folder's own claims — the totals, the entry counts, the workflow — are tracked
the same way:

- **[[code-vs-docs]]** · [[unverified]] · [[unimplemented]] — 105 gap entries plus 112 `MATCHED`
  controls, filed from two read-only audits on 2026-10-06.
- **Out of scope, and deliberately so**: `docs/README.md`, `docs/contributing.md`, the path-preserving
  stubs (`docs/API_SURFACE.md`, `docs/tenant-import.md`) and the whole `98-history` bucket. `98-history`
  is an archive: a dated claim is checked against the tree as of its `created:` date, and only one file
  in it appears at all — as entry #1's third carrier.
- **Known internal drift**: this note's own class totals are its sources' figures, and the sources
  disagree with their own entry counts in three places. The recount is in [[code-vs-docs]] rather than
  corrected here, because correcting it would be fixing a doc, and this pass is audit-only.