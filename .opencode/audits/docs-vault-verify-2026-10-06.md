---
title: "Vault verification — orphans, broken links, missing frontmatter"
aliases:
  - docs-vault-verify-2026-10-06
type: audit
audience: agent
domain: docs
status: current
created: 2026-10-06
baseline: 1616727
scope: docs (97 notes)
---

# Vault verification — orphans, broken links, missing frontmatter

**Date** 2026-10-06 · **Baseline** `1616727` (confirmed pushed before any write: `git ls-remote origin
refs/heads/main` = `16167275ee4f7a3ab9400753b3ece0890db59d62` == `git rev-parse HEAD`, 0 ahead/behind).

**Scope** all **97** `*.md` under `docs/` — 11 domain folders, `98-history` (52), `99-gaps` (4),
`_templates` (3), and the 4 vault-root files (`README.md`, `contributing.md`, and the two
path-preserving stubs). **Fix** nothing was fixed by this audit; the only files it writes are itself and
the `AGENT_LOGBOOK.md` fold.

**Method.** `rg` is not on PATH (it exists at `~/.pi/agent/bin/rg` and `~/.cache/opencode/bin/rg` but is
not on `PATH`), so every sweep is a throwaway `python3` `os.walk` + `re` script from `/tmp`. A number
from a raw grep is worthless here, because this corpus contains three separate things that look like
broken links and are not. The resolver models all of them, and each guard was **proved non-vacuous**
before its count was believed:

| Guard | What it prevents | How it was proved |
|---|---|---|
| Escaped table pipe `[[t\|alias]]` | splitting on `\|` yields the target `t\` and reports **30 phantom broken links** — every converted table link in the vault | a naive pass reports 32 broken sites; the same pass with the pipe modelled reports 3 |
| Inline code spans + fenced blocks | `[[d1_databases]]`, `[[docs/…]]` quoted as examples are code, not navigation | `docs/contributing.md:118,150` and `_templates/doc.md:36` mention `[[…]]` in backticks; stripping them keeps all three out of the counts |
| Frontmatter **aliases** as resolvable targets | a split doc is reachable only by the old stem (`API_SURFACE`, `SCHEMA_DIRECTION_PLAN`, …) | alias index is consulted per note; without it the count rises and every split-half link reads as dead |
| **Bare stem vs path-qualified** | `[[README]]` silently resolving through the vault-root path branch | see §2 — this was a **real bug in my own first resolver**, caught because `contributing.md:49` declares `[[README]]` ambiguous while my scanner reported it clean |

The missing-frontmatter check was proved non-vacuous on a synthetic fixture: `tags: []` → flagged,
absent frontmatter block → flagged, valid note → clean. So the 0 below is a measurement, not a
parser that returns `[]` for everything.

## Summary

| Check | Result |
| --- | --- |
| Notes scanned | **97** |
| `[[…]]` occurrences scanned (code stripped) | **927** |
| **Orphans** (no inbound link from any non-index note) | **6** — of which **1** is a real defect |
| **Broken wikilinks** | **3 sites / 2 distinct targets** — of which **1** is a scanner false positive, so **2** genuinely dead |
| **Ambiguous wikilinks** (resolve, but non-deterministically) | **18** — all target `README` |
| **Missing frontmatter** (`title` + `tags` + `updated`) | **0** |

Nothing was deleted, renamed, or had a claim edited. Two of the three broken-link sites were fixed in a
follow-up commit (`docs(vault): fix orphans + broken links`); the rest are reported, not fixed, and §5
says why each one was left.

## 1. Orphans — 6, one real

Definition: a note with **no inbound wikilink from any file other than a `README.md` index**. The
`_templates/` folder is excluded — Obsidian's own `userIgnoreFilters` excludes it too, and a template
is not a note in the graph.

| # | Note | Linked from | Verdict |
| --- | --- | --- | --- |
| 1 | `docs/contributing.md` | `99-gaps/README.md` only | **REAL DEFECT — fixed in commit 2** |
| 2 | `docs/README.md` | 11 folder MOCs | Not a defect |
| 3 | `docs/98-history/audits/AUDIT_TS_DEPS_FINDINGS.md` | `98-history/README.md`, `98-history/audits/README.md` | Not a defect |
| 4 | `docs/98-history/plans/IMPLEMENTATION_PLAN.md` | `98-history/README.md`, `98-history/plans/README.md` | Not a defect |
| 5 | `docs/98-history/plans/POLISH_PLAN.md` | `98-history/README.md`, `98-history/plans/README.md` | Not a defect |
| 6 | `docs/98-history/worksheets/audit-2026-09-30-monitor-404.md` | `98-history/README.md`, `98-history/worksheets/README.md` | Not a defect |

**#1 is the finding.** `docs/contributing.md` is the vault's contribution contract — the eight-key
frontmatter schema, the MOC rules, the link rules, the scope rule. It is the one document every other
document in the vault is required to obey, and it is reachable from exactly **one** place in the whole
vault: the `## Related` section of `99-gaps/README.md`. It appears **nowhere** in the root MOC
(`docs/README.md` does not contain the string `contributing` at all, in a link or in prose), so the
vault's entry point cannot route a contributor to the rules. `API_SURFACE.md`, `tenant-import.md` and
the other vault-root stubs are each reachable from the root MOC; `contributing.md` is not. Fixed in
commit 2 by adding one line to `docs/README.md` § Developer Resources — additive navigation, no claim
touched.

**#2 is an artifact of the definition, and reporting it as a defect would be wrong.** The vault root
index is linked from 11 folder MOCs and every one of them is a `README.md`, so "linked only from the
index" is *always* true of a root index. It is the most-linked note in the vault.

**#3–#6 are curated, and the honest reason they look like orphans is that the definition excludes the
thing that legitimately links them.** Each is linked from **its own bucket MOC** plus the `98-history`
MOC — that is exactly the curation a MOC exists to provide, and each is reachable in two hops. Adding a
second link to the same bucket MOC would be duplicate navigation, not a fix. The stricter question —
*is any note linked from literally nowhere?* — has the answer **0**.

## 2. Broken wikilinks — 3 sites, 2 genuinely dead

| Site | Link | Verdict |
| --- | --- | --- |
| `98-history/README.md:156` | `[[AGENT_LOGBOOK]]` | **Real dead link — fixed in commit 2** |
| `98-history/sessions/README.md:33` | `[[AGENT_LOGBOOK]]` | **Real dead link — fixed in commit 2** |
| `98-history/merged/FINAL_IMPLEMENTATION_PLAN.md:366` | `[[env.staging.routes]]` | **Scanner false positive — not a link** |

**`[[AGENT_LOGBOOK]]` ×2.** The target is the **repo-root** `AGENT_LOGBOOK.md`, which sits outside the
vault root (`docs/`) and therefore cannot resolve to any note. `find docs -iname '*LOGBOOK*'` returns
only `98-history/sessions/AGENT_LOGBOOK_HISTORY.md`, whose `aliases:` is empty, so no alias rescues it
either. Both sentences say so explicitly — `98-history/README.md:155-156` reads "the repo-root
`AGENT_LOGBOOK` holds the reference tier", and `sessions/README.md:33` reads "split out of the repo-root
`AGENT_LOGBOOK`" — so the referent is a **repo-root file path**, not a vault note, and the only
mechanically correct rendering is inline code.

These are **pre-existing and already logged**: p6 recorded both as "the repo-root stub is outside the
vault root by the p3 ruling, so it needs an owner decision, not a link fix". That remains true of the
*owner decision* (whether the vault should gain its own logbook note) and this audit does not make it.
What p6 left undone is the link *syntax*, and that is mechanical: `[[AGENT_LOGBOOK]]` → `` `AGENT_LOGBOOK.md` ``.
Words unchanged, no file renamed, no claim edited, one-line revert. This also matches how the vault
already renders every other non-vault path (p5: "NON-MD TARGETS LEFT AS MARKDOWN LINKS … `deploy.sh`,
and code paths stay").

The obvious alternative — repointing both at `[[98-history/sessions/AGENT_LOGBOOK_HISTORY]]` — is
**wrong and was rejected**: `98-history/README.md` links `AGENT_LOGBOOK_HISTORY` on the *preceding* line
and then `AGENT_LOGBOOK` on the next, deliberately contrasting the two tiers. Repointing would collapse
a distinction the document is making.

**`[[env.staging.routes]]` is a false positive, and the fix is in the scanner, not the doc.** The
occurrence is `<td>Add <code>[[env.staging.routes]]</code> or document intent</td>` — a wrangler TOML
key inside an HTML `<code>` element in an archived HTML table. It is illustrative text in a Wave-4
action item ("add this config key"), not navigation, and it will never be a note. p6 classified it
identically. Left untouched: it is inside `<code>` in archived prose, and rewriting it would edit an
archived record for the sake of a number.

### Reconciliation with p6's recorded baseline

p6's post-fix sweep recorded **3 unresolved** out of 618 links. This audit, at a later baseline and with
a resolver written from scratch, finds the **same 3**: `2× [[AGENT_LOGBOOK]]` +
`1× [[env.staging.routes]]`. The other three of p6's six are accounted for and absent here — the third
`[[AGENT_LOGBOOK]]` is in the **repo-root `README.md`**, outside the 97-note vault scope; the
`[[SinaiCamps Business API Surface]]` title-link was repaired to `[[API_SURFACE]]` in p6 commit 2; and
the literal `[[…]]` is inside a double-backtick span. Independent agreement on a number derived two
different ways is the strongest evidence in this report.

## 3. Ambiguous wikilinks — 18, all `[[README]]`

Reported as its own class because it is neither broken nor fine. `README` is the **only** duplicated
stem in the vault — **22 copies**, one per folder — and the vault says so itself at
`contributing.md:49` ("copies), so `[[README]]` is ambiguous and `[[98-history/merged/README]]` is
not"). Every folder MOC links the vault root with it:

- **7** bare `[[README]]` in `relates-to` frontmatter — `01-architecture/README.md:15`,
  `02-api/README.md:16`, `03-frontend/README.md:15`, `98-history/README.md:23`, `API_SURFACE.md:14`,
  `contributing.md:13`, and `98-history/README.md:218` in prose
- **11** `[[README|docs/README.md]]` with an explicit display label, one per folder MOC plus
  `99-gaps/README.md:117`

**This class was nearly missed because of a bug in my own resolver.** `docs/README.md`'s
vault-relative stem *is* `README`, so a `if target in vault_paths` check resolves every `[[README]]` to
the root and reports clean. That contradicts `contributing.md:49` in the same corpus. The fixed
resolver refuses to let a bare stem use the path branch: a stem naming 22 files is ambiguous even
though one of them sits at the vault root. The 7 bare links have **no** deterministic fix available —
the vault root is the ambiguous stem, so there is no longer form to path-qualify to — and the 11
labelled ones carry intent in the label but still resolve by heuristic. **Fixing this needs an Obsidian
resolution decision, not a substitution**, so nothing here was touched; it is reported for the owner.

## 4. Missing frontmatter — 0

`title`, `tags` and `updated` are present and non-empty in **97 / 97** notes. No note is missing a
frontmatter block, and no note has an empty value for any of the three. The fixtures in §Method confirm
the check can fail.

One adjacent fact, recorded because it is a decision rather than an oversight: **repo-root `AGENTS.md`
carries no frontmatter** and is the only Markdown file in the repo without it. p6 commit 2 left it that
way deliberately — it is injected as the live system prompt, and editing it mid-program is a worse risk
than a doc being inconsistent. It is outside the 97-note vault scope and is **not** counted as a miss.

## 5. Gap totals, read from `docs/99-gaps/`

Two layers, because the folder publishes both and they disagree. Reporting only one would repeat the
defect the folder exists to catch.

### Layer 1 — as filed, and mechanically confirmed

| Class | Count | Where | Confirmed by |
| --- | --- | --- | --- |
| `MATCHED` (controls) | **112** | foot of `code-vs-docs.md` | 112 `### X-N` headings in the control region |
| `STALE` + `FALSE` (gaps) | **80** | `code-vs-docs.md` entry region | 80 `### X-N` headings |
| `UNVERIFIED` | **15** | `unverified.md` | 15 `### X-N` headings |
| `UNDOCUMENTED` | **10** | `unimplemented.md` | 10 `### X-N` headings |
| **Total gap entries** | **105** | 80 + 15 + 10 | — |

Every figure matches the entry headings counted from the files, so the "Where the counts are filed"
paragraph and the notes' contents agree. `80 + 15 + 10 + 112 = 217`; the 218th is `T‑0`, the test-count
provenance table, which carries no class — the same item p8c recorded.

### Layer 2 — the source audits' own class table

Reproduced unchanged by `code-vs-docs.md` and **known to disagree with its own entries** (its own
recount, which I did not re-derive):

| Class | Audit A | Audit B | Combined |
| --- | --- | --- | --- |
| `MATCHED` | 51 | 77 | **128** |
| `STALE` | 15 | 31 | **46** |
| `FALSE` | 13 | 16 | **29** |
| `UNVERIFIED` | 11 | 7 | **18** |
| `UNDOCUMENTED` | 4 | 3 | **7** |
| **Total** | **94** | **134** | **228** (recount: **218**) |

### The split within the 80

The "80" is filed as `STALE` + `FALSE`, but counting the `**Class**` lines in the entry region gives
**43 `STALE` + 28 `FALSE` + 10 `MATCHED`** = 81 class lines across 80 headings (one entry carries two
classes — the note's documented "a correct claim and a false one in the same line" case). The **10
`MATCHED`-classed entries are the gap markers nested inside a `MATCHED` body**, which neither source
audit counted. So the 80 is 71 pure `STALE`/`FALSE` + 10 nested, not a clean 46/29 split, and
Layer 2's 46/29 is the audits' claim rather than the files' content.

**Three discrepancies, exactly as `code-vs-docs.md` itemises them:** audit A's table sums to 94 while
its own headings come to 83; audit B has 135 headings against a reported 134 (the extra is `T‑0`); and
neither counted the nested markers, which yield **13 `UNVERIFIED`** and **10 `UNDOCUMENTED`** against
reported 18 / 7. `S‑2` and `S‑3` are each defined twice as headings (78 unique ids across 80 headings),
and **12 entry ids collide across the two audits** — p8c's finding, and the reason a consolidation keyed
on the bare id loses entries.

**What was not done:** no figure above was "corrected", and no gap note was edited. The source audits
stay the record of what they claimed; the recount stays the record of what reconciles. **No doc claim
was edited anywhere in this audit.**

## 6. Limits of this audit

- **Wikilinks only.** Inbound counts come from `[[…]]`. `docs/README.md`'s Table of Contents uses
  relative **markdown** links (`[Quick Start](01-architecture/QUICK_START.md)`), which Obsidian also
  resolves but this scanner does not read. Every note it names is reachable by wikilink as well, so no
  orphan is hiding there, but a note reachable *only* by markdown link would be missed.
- **Orphan status is per the mission's definition**, which excludes index→index edges. Under the looser
  "no inbound link at all" reading the answer is 0.
- **Ambiguity is reported, not adjudicated.** Whether `[[README]]` lands on the root or on the linking
  note's own MOC is Obsidian's heuristic; this audit does not claim to know which.
- **`98-history` claims were not checked.** Per the archive's own invariant, a dated record is measured
  against the tree as of its `created:` date, so its stale numbers are records, not defects.
- **No suite was run and none was needed** — markdown only, no module imported, no test reads these
  files.

**Rollback** = revert the single commit.
