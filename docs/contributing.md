---
title: "Contributing to the SinaiCamps docs vault"
aliases:
  - CONTRIBUTING
tags:
  - type/guide
  - audience/developer
  - audience/agent
  - domain/vault
  - status/live
created: 2026-10-06
updated: 2026-10-06
relates-to:
  - "[[README]]"
  - "[[01-architecture/README]]"
  - "[[98-history/README]]"
code-references:
  - "app/src/lib/api.ts"
  - "backend/openapi.json"
verified: never
---
# Contributing to the SinaiCamps docs vault

`docs/` is an [Obsidian](https://obsidian.md) vault. Open that folder as a vault (or just
edit the markdown — nothing here needs Obsidian) and this page is the contract.

Read it before you add a file, move one, or edit a link. Most of what makes the vault
usable is a handful of rules that are cheap to keep and expensive to repair later.

---

## The one rule that causes the most damage if broken

**The vault root is `docs/`, not the repo root.** A wikilink is resolved relative to the
vault, so:

| Write this | Never this |
|---|---|
| `[[07-data/migrations]]` | `[[docs/07-data/migrations]]` |
| `[[98-history/audits/README]]` | `[[docs/98-history/audits/README]]` |
| `[[tenant-import]]` | `[[docs/10-tenant-import/tenant-import]]` |

The middle row is the form that 229 links were written in until 2026-10-06; all of them
resolved to a file that does not exist. This is now enforced by config
(`newLinkFormat: "absolute"` in `.obsidian/app.json`), so Obsidian itself emits the
correct form — but a hand-written or generated link still has to be right.

**Keep the path when the stem is duplicated.** `README` exists once per folder (21
copies), so `[[README]]` is ambiguous and `[[98-history/merged/README]]` is not. Every
other stem in the vault is currently unique, which is why most links are bare.

---

## Where a file goes

| It is… | It goes in | Examples |
|---|---|---|
| Current, subject-owned reference material | the numbered folder for its domain | `02-api/`, `07-data/` |
| A plan, roadmap or backlog item still open | `09-plans/` | roadmap, waves, backlog |
| A dated record of work already done | `98-history/<bucket>/` | `sessions/`, `audits/`, `deploys/` |
| A template | `docs/_templates/` | `doc.md`, `moc.md`, `session.md` |

Numbered folders are the live tier; `98-history/` is history and is **append-only** — index
it in its bucket MOC, do not rewrite it. There is no `00-inbox` and no `99-gaps` folder
yet; if a doc does not fit the folders above, say so rather than inventing a folder.

**Two paths stay outside the vault on purpose**, because live code cites them:
`AGENT_LOGBOOK.md` at the repo root (12 code files) and its history in
`98-history/sessions/AGENT_LOGBOOK_HISTORY.md`. Do not move them.

---

## Frontmatter

Every note starts with the same eight keys, in this order. A validator enforces it.

```yaml
title: "SinaiCamps — Architecture"     # verbatim from the note's own H1
aliases:                               # old filename stem when renamed; empty otherwise
tags:
  - type/reference                     # type/ required
  - audience/developer                 # audience/ required
  - domain/architecture                # optional
  - status/current                     # optional
created: 2026-08-13                    # real origin, not the last move
updated: 2026-10-06                    # git log -1 --format=%cs -- <path>
relates-to:
  - "[[07-data/migrations]]"           # wikilinks, vault-relative
code-references:
  - "backend/src/index.js:123-141"     # real, in git, <= 10, distinct files first
verified: never                        # never, unless you actually re-checked the claims
```

- **`created` is the trap.** `git log -1 --format=%cs` returns the date of the last
  *rename*, which for anything that moved in the 2026-10-06 restructure is that day. Use
  `git log --follow --diff-filter=A --format=%cs -- <path> | tail -1`.
- **`aliases` carries the old stem only when the file was renamed**, so existing
  references keep resolving. Empty is the correct answer for a new file — forcing one in
  creates a second claimant for a name. `API_SURFACE` is the standing example of that
  collision: `docs/API_SURFACE.md` is the real file at the original path and
  `02-api/API_SURFACE_MAP.md` aliases the name.
- **`verified: never` is honest by default.** Grepping proves a path *exists*; it does not
  verify that a doc's *claims* are true. Only set another value if you ran the check.
- **`relates-to` entries are wikilinks.** A bare path string is an inert YAML scalar —
  Obsidian renders it as plain text and the navigation silently does nothing.

---

## Links

- Use `[[wikilinks]]`, not relative markdown links, for `.md` targets. A relative link
  renders but creates no backlink, so the target's "linked mentions" stays empty.
- Code files, `deploy.sh`, `https://` URLs and anything outside the vault stay as ordinary
  markdown links — they are not notes.
- Inside a markdown table a link needs an **escaped** pipe: `[[STEM\|label]]`. An
  unescaped `|` ends the cell.
- Do not put a wikilink in a backticked code span or a fenced block and expect it to work;
  Obsidian renders it as code. Equally, do not run a bulk rewrite over `[[…]]` without
  stripping code spans first — the logbook's own gotchas are full of quoted `[[docs/…]]`
  examples, and rewriting those corrupts the record of the bug.
- An alias is a **display string, not markdown**: `[[stem\|text]]`, never
  `[[stem\|`code`]]` — Obsidian draws the backticks literally.

---

## MOCs

Each numbered folder has exactly one index, at `README.md`, with
`## Overview`, `## Concepts`, `## Docs`, `## Related`, `## Gaps`. Upgrade an existing
`README.md` in place; never add a second index for the same folder.

- `## Concepts` is derived from the folder's docs' own headings and the code paths they
  name. Do not invent a concept no doc supports.
- `## Related` names only stems and paths that exist.
- `## Gaps` stays as the byte-exact placeholder
  `<!-- Populated by 99-gaps/code-vs-docs.md -->` until the gaps sweep runs. Do not fill
  it speculatively.

A live-folder MOC answers "what does this folder contain now". The `98-history` MOC
answers "what did the project already decide, and when" — its Concepts section is about
the archive's invariants (archived ≠ deleted, merged ≠ moved, a verified count is not a
claim), and its timeline is ordered by each file's `created:`, never by its filename.

---

## Verifying a change

Docs have no test suite, so verify by resolving:

1. **No new dead link.** Resolve every `[[…]]` target against the vault. A target is dead
   if it is neither a vault-relative path to a note, nor a unique stem, nor an alias.
2. **Count code spans and fenced blocks before you count links.** A scanner that does not
   strip them reports phantom breakage — including `[[d1_databases]]` (a TOML key) and
   `[[env.staging.routes]]` (a wrangler key inside a `<code>` block).
3. **Remember the alias collision rule** and the escaped table pipe, or the count is wrong
   in the other direction.
4. **Docs-only commits need no suite run.** Markdown imports nothing; backend, frontend,
   integration and E2E counts cannot move.

---

## Scope: what a docs commit must not touch

`.opencode/` (253 tracked files of agent tooling), anything under `app/`, `backend/`,
`monitor/`, `tests/`, and `backend/migrations/`. Migration files are applied, never
edited, and a migration's rationale comment is a record of what was known when it was
written. A docs commit that needs a code change is two commits.

**One concern per commit.** A mechanical normalisation and a content rewrite in the same
commit cannot be reviewed or reverted independently.

---

## The logbook

`AGENT_LOGBOOK.md` at the repo root is the **reference tier**: reusable gotchas, and it is
what every agent reads first. The append-only per-task log is
`98-history/sessions/AGENT_LOGBOOK_HISTORY.md`. A gotcha is a rule and belongs in the
reference tier; a session record is a log and belongs in the history. Do not mix them.

## Obsidian config in git

`docs/.obsidian/` is **partly** tracked. Committed: `app.json` (link format, new-file
location, excluded files), `core-plugins.json`, `templates.json` — project-level settings
everyone should share. Not committed, and `.gitignore`d: `workspace.json`,
`graph.json`, `cache.json` — per-user layout and viewport state that would produce a
confusing diff for everyone else. If you open the vault, expect `git status` to stay clean.