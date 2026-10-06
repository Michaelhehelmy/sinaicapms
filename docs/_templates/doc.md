---
title: "{{title}}"
aliases:
tags:
  - type/reference
  - audience/developer
created: {{date}}
updated: {{date}}
relates-to:
code-references:
verified: never
---
# {{title}}

<!--
Template: _templates/doc.md
1. Save into the numbered folder the subject belongs to (01-architecture … 10-tenant-import).
   History and dated session records go to 98-history/<bucket>/ instead.
2. Fill every frontmatter key. The eight keys above are the vault schema and their
   order is fixed: title, aliases, tags, created, updated, relates-to,
   code-references, verified.
   - aliases: the old filename stem when the file was renamed, so existing
     references keep resolving. Empty is correct when nothing was renamed.
   - tags: at least one type/ and one audience/. Add domain/ and status/ when the
     doc states one.
   - created: the real origin date, not the date of the last move.
     `git log --follow --diff-filter=A --format=%cs -- <path> | tail -1`
   - relates-to: wikilinks, vault-relative — the vault root is docs/, so
     `[[07-data/migrations]]` and never `[[docs/07-data/migrations]]`. Leave empty
     until you know the neighbours; a bare path string is inert and does nothing.
   - code-references: real paths that exist in git, at most 10, distinct files
     first. Empty for a doc that names no file.
   - verified: never, unless you actually re-checked the doc's claims.
3. Link with wikilinks, not relative markdown links. Keep the path when the stem
   is duplicated — README exists in every folder, so `[[98-history/merged/README]]`
   is correct and `[[README]]` is ambiguous.
4. Add this note to its folder MOC's "## Docs" list, or the MOC and the folder
   disagree.
5. Leave "## Gaps" for the 99-gaps sweep; do not fill it speculatively.
-->

## Overview

One paragraph: what this doc is for and who reads it.

## Details

## Gaps

<!-- Populated by 99-gaps/code-vs-docs.md -->