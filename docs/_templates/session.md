---
title: "{{title}}"
aliases:
tags:
  - type/session
  - audience/agent
created: {{date}}
updated: {{date}}
relates-to:
code-references:
verified: never
---
# {{title}}

<!--
Template: _templates/session.md — one dated work session.

Session records live in 98-history/<bucket>/. They are append-only history:
a bucket MOC indexes them, and once written they are not rewritten. If a fact in
a session record turns out to be wrong, correct it in the doc that depends on it
and say so in the next session record — do not edit the old one.

For the running task log, append to the existing file instead of creating one:

  docs/98-history/sessions/AGENT_LOGBOOK_HISTORY.md   (### Task Log)

For durable, reusable gotchas, the reference tier is AGENT_LOGBOOK.md at the repo
root. A session record is a log; a gotcha is a rule. Do not put a rule here.
-->

**Date:** {{date}} {{time}}
**Task:** the task id and one-line outcome
**Commit(s):** short SHAs, or "none — docs only"
**Scope:** which trees were touched, and what was deliberately left alone

## What changed

Facts, not narrative. Counts, paths, SHAs.

## What was verified, and how

The command that was run and what it printed. A grep proves a path exists; it
does not verify a claim. If nothing was verified, say so.

## Not done, and why

Open items, blockers, and anything deliberately deferred. A session record that
hides its omissions is worse than no record.

## Gaps

<!-- Populated by 99-gaps/code-vs-docs.md -->