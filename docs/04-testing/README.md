---
title: "docs/04-testing — Testing"
aliases:
tags:
  - type/index
  - audience/developer
  - domain/testing
  - status/live
created: 2026-10-06
updated: 2026-10-06
relates-to:
  - "[[TESTING]]"
  - "[[98-history/merged/TESTING_ROADMAP]]"
  - "[[98-history/test-runs/README]]"
  - "[[98-history/tester-guides/testing-guide-owner]]"
code-references:
  - "playwright.config.ts"
  - "vitest.integration.config.ts"
  - "scripts/run-all-tests.sh"
verified: never
---
# docs/04-testing — Testing

## Overview

Suites, verified counts, and the manual-testing references. `TESTING.md` is the canonical entry:
if it disagrees with your local run, your run is the thing to investigate.

## Concepts

- **Four suites, four configs** — `backend` (Vitest), `app` (Vitest), root integration
  (`vitest.integration.config.ts`), and E2E (Playwright, boots both servers). The full-config
  integration run has a pre-existing 30-minute `/api/auth` login-limit 429 flake; verify targeted
  or per-file rather than assuming you broke it.
- **Verified counts, not remembered counts** — the suite table is filesystem-verified and dated.
  A count in this file is a claim with a date on it.
- **E2E has a port-hygiene preflight** — free the ports before a full run, and note that tenant
  pages hang on `load` in `astro dev` because the logo/favicon point at a dead `localhost:8001`.
  Zone and E2E specs use `waitUntil: 'domcontentloaded'`.
- **Env-skipped tests are counted, not hidden** — 14 tests skip on missing env. "Skipped" is a
  reported number here so a green run cannot quietly mean "half the suite did not execute".
- **Admin tab IDs live only here** — the 3 super-admin / 15 tenant-admin / 4 POS tab IDs are the only
  place in the repo that carries them; E2E selectors depend on this table staying put.
- **Manual cross-cutting steps 32–34** — authentication/security, responsive design, error handling.
  Not automatable, and skipped silently is the same as passed unless you do them.
- **CI checks before shipping** — the pre-push gate, in order.

## Docs

| Doc | What it is |
|---|---|
| [[TESTING\|TESTING.md]] | Canonical suite list with verified counts and commands, plus the cross-cutting manual steps and the admin tab-ID reference. |

## Related

- [[README|docs/README.md]] — vault entry point
- [[ARCHITECTURE]] — §7 lists the per-layer test commands this folder expands
- [[COMPONENT_CATALOG]] — what the frontend suites are meant to cover
- [[98-history/merged/TESTING_ROADMAP]] — the spent plan; note its login-credentials table is stale
- [[98-history/tester-guides/testing-guide-owner]] · [[98-history/tester-guides/testing-guide-tester]] — the manual walkthroughs
- [[98-history/test-runs/README]] — archived full-suite run reports
- [[RUNBOOK]] — deploy-time smoke, the operational half of "did it pass"

## Gaps

Audited 2026-10-06 against the tree, read-only. This folder's queued doc fixes:

- **[[code-vs-docs]]** — **9** `STALE`/`FALSE` claims, plus **5** `MATCHED` controls this folder's findings rest on. `MATCHED` entries are reproduced at the foot of that note, because a finding that quotes one of them is only auditable if it is readable there.
- **[[unverified]]** — **1** claim this folder states that the tree cannot answer · **[[unimplemented]]** — none.

Nothing is fixed yet. Each entry carries the `file:line` its claim was measured against and a named action; fix this folder's carriers together, not one file at a time — see [[99-gaps/README]] for the workflow.

