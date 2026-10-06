---
title: "{{title}}"
aliases:
tags:
  - type/index
  - audience/developer
created: {{date}}
updated: {{date}}
relates-to:
code-references:
verified: never
---
# {{title}}

<!--
Template: _templates/moc.md — a Map of Content for one folder.

Use this only when the folder has no README.md yet. If it already has one,
UPGRADE it in place: never add a second index for the same folder.

A live-folder MOC answers "what does this folder contain now".
An archive MOC (98-history/) answers "what did the project already decide, and
when" — its Concepts section is about the archive's own invariants
(archived is not deleted, merged is not moved, a verified count is not a claim).
-->

## Overview

The folder in two sentences: what belongs here and what does not.

## Concepts

- The 3–6 ideas a newcomer needs before reading any file in this folder.
- Derive each one from the docs' own headings and the code paths they name.
- Do not invent a concept no doc in the folder supports.

## Docs

- `[[stem-one|What it is for]]` — one line, same wording the doc's own summary uses
- `[[stem-two|What it is for]]`
  (unquoted examples are live links; the quoted ones are what you replace)

## Related

- Only stems or paths that already exist in the vault. A MOC pointing at a
  missing file is the exact drift 99-gaps exists to catch.

## Gaps

<!-- Populated by 99-gaps/code-vs-docs.md -->