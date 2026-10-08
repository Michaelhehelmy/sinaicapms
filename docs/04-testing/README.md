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
  - "playwright.config.ts:34-90"
  - "vitest.integration.config.ts"
  - "vitest.config.ts"
  - ".github/workflows/ci.yml"
  - ".github/workflows/e2e.yml"
  - "scripts/run-all-tests.sh"
  - "app/src/components/admin/AdminApp.tsx:127-155,180-196"
  - "app/src/components/pos/POSApp.tsx:39-44"
  - "tests/e2e/pages/admin/dashboard.page.ts:16"
  - ".gitignore:10,14"
verified: never
---
# docs/04-testing — Testing

## Overview

Suites, verified counts, and the manual-testing references. `TESTING.md` is the canonical entry:
if it disagrees with your local run, your run is the thing to investigate. It was re-verified
against the tree and against `.github/workflows/` on 2026-10-06 — its counts now name the commit
that produced them.

## Concepts

- **Four suites, four configs** — `backend` (Vitest), `app` (Vitest), root integration
  (`vitest.integration.config.ts`), and E2E (Playwright, boots both servers). **The root
  command needs its `--config`**: plain `npx vitest run` uses `vitest.config.ts`, whose
  `include` is `tests/unit/**` only. The full-config integration run has a pre-existing
  30-minute `/api/auth` login-limit 429 flake; verify targeted or per-file rather than
  assuming you broke it.
- **Counts carry their commit — and this folder's table only started doing so on
  2026-10-06.** It was headed "filesystem-verified and dated" while no row carried a date
  or a commit and its front matter read `verified: never`; the E2E row was a verbatim
  2026-08-12 run with nothing in the file saying so. `ARCHITECTURE.md` §7 is the canonical
  table and both must quote it. **A count without a date is a claim; a count with the
  producing commit is evidence.**
- **E2E has a port-hygiene preflight** — free the ports before a full run, and note that tenant
  pages hang on `load` in `astro dev` because the logo/favicon point at a dead `localhost:8001`.
  Zone and E2E specs use `waitUntil: 'domcontentloaded'`.
- **Env-skipped tests are counted, not hidden** — 15 tests skip on missing env (the last
  recorded full gate, 2026-09-06; it said 14 before that run). "Skipped" is a reported
  number here so a green run cannot quietly mean "most of the suite did not execute".
  **CI runs 10 of them**: `e2e.yml` is `--grep "@smoke"`.
- **Admin tab IDs live in the components, not in a doc** — `AdminApp.tsx` declares
  `TENANT_NAV` (`:127-155`, **29**) and `SUPER_NAV` (`:180-196`, **17**), `POSApp.tsx`
  declares `POS_NAV` (`:39-44`, **6**). `TESTING.md` transcribes them for convenience.
  This index used to claim the table was "the only place in the repo that carries them …
  E2E selectors depend on this table staying put" — **both halves were false**: the
  source is the nav arrays, and E2E deep-links by path
  (`tests/e2e/pages/admin/dashboard.page.ts:16` → `/admin/<tab>`), so no selector reads
  the table. A "this is the only copy" claim is the sentence that stops anyone checking it.
- **CI is seven checks, not five, and its E2E job is smoke-only** — see `TESTING.md`
  §"CI checks before shipping", which now transcribes `.github/workflows/ci.yml` and
  `e2e.yml` rather than a local habit list.
- **Manual cross-cutting steps 32–34** — authentication/security, responsive design, error handling.
  Not automatable, and skipped silently is the same as passed unless you do them. The counts
  are exact (7 + 5 + 4 = 16 actions) and need no code to change.
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

