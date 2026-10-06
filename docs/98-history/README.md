---
title: "docs/98-history — archived, not deleted"
aliases:
  - 98-history
  - History Index
tags:
  - type/index
  - audience/developer
  - domain/history
  - status/archived
created: 2026-10-06
updated: 2026-10-06
relates-to:
  - "[[98-history/audits/README]]"
  - "[[98-history/sessions/README]]"
  - "[[98-history/plans/README]]"
  - "[[98-history/merged/README]]"
  - "[[98-history/worksheets/README]]"
  - "[[98-history/deploys/README]]"
  - "[[98-history/migrations/README]]"
  - "[[98-history/tester-guides/README]]"
  - "[[98-history/test-runs/README]]"
  - "[[README]]"
  - "[[04-testing/README]]"
  - "[[09-plans/README]]"
  - "[[05-operations/README]]"
code-references:
  - "backend/src/index.js"
  - "app/src/lib/api.ts"
  - "backend/migrations/0127_meals_tenant_composite_pk.sql"
  - "scripts/validate-manifest.mjs"
  - "tests/e2e/specs/admin/super-panel-coverage.spec.ts"
  - "backend/wrangler.toml"
verified: never
---
# docs/98-history — archived, not deleted

Everything in this folder is **history**. Nothing here is deleted content: each file was moved
with `git mv` and its text is byte-for-byte what it was when it was live. The live documentation
tier lives in the numbered folders beside this one (`docs/01-architecture/` … `docs/10-tenant-import/`).

> **Restructured 2026-10-06** (docs-vault restructure, per the owner-approved cleanup proposal at
> `.opencode/audits/docs-cleanup-proposal-2026-10-06.md`). Path changes here are recorded so that
> pointers left deliberately at an old path — in frozen migration comments, in archived docs, and
> in the few live comments that were not repointed — still resolve to something.

## Overview

The archive. Every document the vault keeps that is **no longer true** — audit rounds whose findings
shipped, plans whose tasks closed, gate results, one-off procedures. Nothing here was deleted: each
file is a `git mv` rename and its prose is unchanged, so `git log --follow` still resolves and a
citation written in 2026-08 still reads what it read then.

Read this index when you want to know **what the project already decided, tried, or measured** — not
what it currently does. The current answer lives in `docs/01-architecture/` … `docs/10-tenant-import/`.

## Concepts

- **Archived ≠ deleted** — the reason a stale number survives here (a "99 migrations" claim, a login
  table naming an account that does not exist) is that the file is a record of a moment. Editing it
  would falsify that moment; correcting it belongs in the live doc it fed.
- **Merged ≠ moved** — `merged/` sources had their surviving sections migrated into a canonical
  target *before* the move, so the target owns the content and the source owns the provenance.
- **Buckets are by kind, dates are the index** — folders group documents by *what they are*
  (audit, plan, session, worksheet); the chronological section below is the *when*. A round that
  produced an audit, a plan and a worksheet appears in all three folders and once here.
- **Two pointers are deliberately stale** — a frozen migration comment and a test spec still cite
  the pre-restructure path of an archived file. Those were not repointed, and the "Old path → new
  path" table below is what makes them resolve.
- **Verified counts are not claims** — the reports here recorded 99 migrations against a tree of 40.
  Archived numbers are read as history, never as current state.

## Buckets

| Bucket | What is in it | Files |
|---|---|---|
| [`audits/`](audits/) | Executed and superseded audit rounds: the 2026-09-05 8-domain round, the deep-dive summaries, the 2026-08-22 unification set, the 2026-07-18 assertion-quality QA round. `AUDIT_MASTER_FINDINGS.md`, the consolidation index that round survives as, is **live** at [`../05-operations/`](../05-operations/). | 16 |
| [`worksheets/`](worksheets/) | One-step investigation worksheets that each fed a fix that shipped (route gaps, monitor 404, `.eschtml` inventory, tenant-import round-trip parity). | 4 |
| [`sessions/`](sessions/) | Dated session records, wave-closure reports and gate results. `AGENT_LOGBOOK_HISTORY.md` — the append-only task history split out of the repo-root `AGENT_LOGBOOK.md` — is the entry point for per-task records. | 6 |
| [`plans/`](plans/) | Spent plans and roadmaps whose work is complete: the Astro 5→7 upgrade, the 38-task `IMPLEMENTATION_PLAN.md`, the polish plan. The live backlog is [[DEVELOPER_ROADMAP]]. | 3 |
| [`deploys/`](deploys/) | Deploy and cutover history: the completed Astro cutover and the one-shot prod-deploy checklist it drove. The live procedure is [[RUNBOOK]]. | 2 |
| [`migrations/`](migrations/) | The D1 schema-direction planning note, archived after 40 migrations landed with its "Decision Required" head still unresolved. The live migration procedure is [[migrations]]. | 1 |
| [`merged/`](merged/) | The seven MERGE sources from the 2026-10-06 cleanup. Their surviving sections were migrated into their canonical targets **before** the move; the rest was duplicate or stale. See each file's target below. | 7 |
| [`tester-guides/`](tester-guides/) | Both human-testing guides, kept separate by an explicit boundary statement: `testing-guide-owner.md` (owner-only super-admin credentials) and `testing-guide-tester.md` (shareable). | 2 |
| [`test-runs/`](test-runs/) | The one preserved machine test report — `2026-09-09-full-suite-run.md`, force-added from a gitignored `reports/` artifact so the per-run pass/fail breakdown survives. | 1 |

## Chronological index

Every document in the vault's archive, ordered by when it was written rather than by which bucket
holds it. Dates come from each file's `created` frontmatter (the 2026-10-06 frontmatter pass
reconstructed it from the filename date, the git rename and the prose, and defaulted to the last
commit that touched the file's content where no date was recoverable).

### 2026-08 — the unification round and the first plans

<!-- Populated per-entry by 07-history-refine; the grouping above is stable. -->

| Date | Doc | Bucket | What happened |
|---|---|---|---|
| 2026-08-08 | [[AUDIT-ASSERTION-QUALITY]] | audits | QA assertion-quality round over the E2E specs. |
| 2026-08-08 | [[SCHEMA_DIRECTION_PLAN]] | migrations | The D1 schema direction, still headed "Decision Required". |
| 2026-08-09 | [[POLISH_PLAN]] | plans | Final polish plan, locked. |
| 2026-08-23 | [[API_CONTRACT_AUDIT]] · [[AUTH_SYSTEM_AUDIT]] · [[BACKEND_UNIFICATION_AUDIT]] · [[DATABASE_SCHEMA_AUDIT]] · [[FRONTEND_UNIFICATION_AUDIT]] | audits | Five audits written the same day: merge the API suite, unify admin+POS auth, consolidate the backend, review the schema, consolidate the frontend. |
| 2026-08-23 | [[TESTING_ROADMAP]] | merged | Manual-testing roadmap; its surviving sections went into `TESTING.md` and both tester guides. |
| 2026-08-23 | [[testing-guide-tester]] | tester-guides | The shareable human-testing walkthrough. |
| 2026-08-26 | [[IMPLEMENTATION_PLAN]] | plans | The 38 tasks that closed the 2026-09-05 audit round. |
| 2026-08-31 | [[DEEP_AUDIT_2026_08_27]] | audits | Deep audit report (the file name is its own date). |

### 2026-09 — audits, remediation, cutover, closure

<!-- Populated per-entry by 07-history-refine. -->

| Date | Doc | Bucket | What happened |
|---|---|---|---|
| 2026-09-06 | [[AUDIT_BACKEND_QUALITY_FINDINGS]] · [[AUDIT_DATABASE_FINDINGS]] · [[AUDIT_DEEP_DIVE_2026-09-06]] · [[AUDIT_E2E_GAPS_FINDINGS]] · [[AUDIT_FRONTEND_FINDINGS]] · [[AUDIT_PERFORMANCE_FINDINGS]] · [[AUDIT_SECURITY_FINDINGS]] · [[AUDIT_TEST_COVERAGE_FINDINGS]] · [[AUDIT_TS_DEPS_FINDINGS]] | audits | The 8-domain round plus a second deep dive. Its consolidation index survives live as [[05-operations/AUDIT_MASTER_FINDINGS]]. |
| 2026-09-07 | [[ASTRO_UPGRADE_PLAN]] | plans | Astro 5→7, executed on `feat/astro-7`. |
| 2026-09-07 | [[ASTRO_DEPLOY_CUTOVER]] | deploys | Pages → Workers cutover, completed. |
| 2026-09-09 | [[2026-09-09-full-suite-run]] | test-runs | Full-suite machine report, force-added out of a gitignored `reports/` artifact. 9 suites failed. |
| 2026-09-09 | [[testing-guide-owner]] | tester-guides | The owner-only walkthrough — super-admin credentials, deliberately not shareable. |
| 2026-09-14 | [[ADMIN_REPAIR_REPORT_2026_09_14]] | sessions | Admin panel and storefront repair report. |
| 2026-09-16 | [[audit-2026-09-15-route-gaps]] | worksheets | A1 route-surface gap worksheet. |
| 2026-09-18 | [[FINAL_IMPLEMENTATION_PLAN]] | merged | v2 of the plan; superseded by the repo-root v3, which kept its §4.1 verdicts and §3.7 delta. |
| 2026-09-21 | [[FINAL-AUDIT-CLOSURE]] · [[G65_STAGING_VALIDATION]] · [[WAVE6_EXIT_REPORT]] | sessions | Wave 6 closure, the G6.5 staging gate, and a doc-truth exit report. |
| 2026-09-22 | [[PROD-DEPLOY-CHECKLIST-2026-09-22]] · [[FINAL-CLOSURE-v2]] | deploys · sessions | The one-shot prod-deploy checklist its own first line says is now moot, and the final closure. |

### 2026-09-30 → 2026-10-02 — tenant-import and bundle doc-vs-code rounds

<!-- Populated per-entry by 07-history-refine. -->

| Date | Doc | Bucket | What happened |
|---|---|---|---|
| 2026-09-30 | [[audit-2026-09-30-tenant-manifest-schema]] · [[audit-2026-09-30-tenant-manifest-gaps]] · [[audit-2026-09-30-tenant-manifest-types]] | merged | Field-by-field tenant-import reference plus gap and tenant-type matrices; all three migrated into `docs/10-tenant-import/`. |
| 2026-09-30 | [[audit-2026-09-30-eschtml-inventory]] · [[audit-2026-09-30-monitor-404]] | worksheets | `.eschtml` inventory (still cited by `security-guide.md`) and the monitor custom-domain 404. |
| 2026-10-01 | [[audit-2026-09-30-tenant-import-parity]] | worksheets | Round-trip parity; its D3/D4 drift items survive in `docs/10-tenant-import/BLOCKED-pos-products-composite-pk.md`. |
| 2026-10-02 | [[audit-2026-10-02-tenant-import-edge-cases]] · [[audit-2026-10-02-bundle-investigation]] | merged | Edge-case matrix (still cited by migration `0127`) and the frontend bundle investigation that seeded `PERF_BASELINE.md`. |

### 2026-10-06 — the restructure itself

<!-- Populated per-entry by 07-history-refine. -->

| Date | Doc | What happened |
|---|---|---|
| 2026-10-06 | [[98-history/README]] · [[98-history/audits/README]] · [[98-history/deploys/README]] · [[98-history/merged/README]] · [[98-history/migrations/README]] · [[98-history/plans/README]] · [[98-history/sessions/README]] · [[98-history/test-runs/README]] · [[98-history/tester-guides/README]] · [[98-history/worksheets/README]] | This index and the nine bucket indexes were written by the vault restructure. |

### 2026-08-08 → present — the running task log

[[AGENT_LOGBOOK_HISTORY]] has no end date. It is the append-only per-task record and is the one file
in this archive that keeps growing; the repo-root [[AGENT_LOGBOOK]] holds the reference tier (the
persistent gotchas) that stays at its original path because live code cites it.

## Old path → new path

Every one of these is a `git mv` rename, so `git log --follow` still works on the new path.

| Was | Now |
|---|---|
| `AUDIT_*_FINDINGS.md`, `AUDIT_DEEP_DIVE_2026-09-06.md` (repo root) | `docs/98-history/audits/` |
| `docs/DEEP_AUDIT_2026_08_27.md` | `docs/98-history/audits/DEEP_AUDIT_2026_08_27.md` |
| `tests/AUDIT-ASSERTION-QUALITY.md` | `docs/98-history/audits/AUDIT-ASSERTION-QUALITY.md` |
| `app/FRONTEND_UNIFICATION_AUDIT.md` | `docs/98-history/audits/FRONTEND_UNIFICATION_AUDIT.md` |
| `backend/API_CONTRACT_AUDIT.md`, `backend/AUTH_SYSTEM_AUDIT.md`, `backend/BACKEND_UNIFICATION_AUDIT.md`, `backend/DATABASE_SCHEMA_AUDIT.md` | `docs/98-history/audits/` |
| `docs/audit-2026-09-15-route-gaps.md`, `docs/audit-2026-09-30-monitor-404.md`, `docs/audit-2026-09-30-eschtml-inventory.md`, `docs/audit-2026-09-30-tenant-import-parity.md` | `docs/98-history/worksheets/` |
| `docs/ADMIN_REPAIR_REPORT_2026_09_14.md`, `docs/FINAL-AUDIT-CLOSURE.md`, `docs/FINAL-CLOSURE-v2.md`, `docs/G65_STAGING_VALIDATION.md`, `docs/WAVE6_EXIT_REPORT.md` | `docs/98-history/sessions/` |
| `AGENT_LOGBOOK.md` §`### Task Log` | `docs/98-history/sessions/AGENT_LOGBOOK_HISTORY.md` |
| `ASTRO_UPGRADE_PLAN.md`, `IMPLEMENTATION_PLAN.md` (repo root), `docs/POLISH_PLAN.md` | `docs/98-history/plans/` |
| `ASTRO_DEPLOY_CUTOVER.md`, `docs/deploy/PROD-DEPLOY-CHECKLIST-2026-09-22.md` | `docs/98-history/deploys/` |
| `backend/migrations/SCHEMA_DIRECTION_PLAN.md` | `docs/98-history/migrations/SCHEMA_DIRECTION_PLAN.md` |
| `TESTING_ROADMAP.md`, `FINAL_IMPLEMENTATION_PLAN.md` (repo root) | `docs/98-history/merged/` |
| `docs/audit-2026-09-30-tenant-manifest-{schema,gaps,types}.md`, `docs/audit-2026-10-02-tenant-import-edge-cases.md`, `docs/audit-2026-10-02-bundle-investigation.md` | `docs/98-history/merged/` |
| `docs/TESTING_GUIDE_OWNER.md` | `docs/98-history/tester-guides/testing-guide-owner.md` |
| `docs/TESTING_GUIDE_TESTER.md` | `docs/98-history/tester-guides/testing-guide-tester.md` |
| `reports/all-tests-20260909-215048/REPORT.md` (gitignored) | `docs/98-history/test-runs/2026-09-09-full-suite-run.md` (`git add -f`) |

## `merged/` — which target each source fed

| Source | Migrated into |
|---|---|
| `TESTING_ROADMAP.md` | `docs/04-testing/TESTING.md` (§Cross-cutting concerns, §Tab IDs) · `docs/98-history/tester-guides/testing-guide-tester.md` (§3 lead-in + appendix) · `docs/98-history/tester-guides/testing-guide-owner.md` (§4). Its **stale** login-credential table was dropped, not migrated. |
| `FINAL_IMPLEMENTATION_PLAN.md` (v2) | `FINAL_IMPLEMENTATION_PLAN_v3.md` §4.1 (D1–D20 verdicts) and §3.7 (v2→v3 grading delta). |
| `audit-2026-09-30-tenant-manifest-schema.md` | `docs/10-tenant-import/tenant-import-schema.md` (schema-level findings). |
| `audit-2026-09-30-tenant-manifest-gaps.md` | `docs/10-tenant-import/tenant-import-appendix.md` (Tables 2–4 + sample-vs-code notes). |
| `audit-2026-09-30-tenant-manifest-types.md` | `docs/10-tenant-import/tenant-import-types.md` (per-section evidence notes). |
| `audit-2026-10-02-tenant-import-edge-cases.md` | `docs/10-tenant-import/tenant-import-appendix.md` (§residual findings, §harness gotchas) + `docs/10-tenant-import/BLOCKED-pos-products-composite-pk.md` (parity D3 half + skipped-rollback assessment). |
| `audit-2026-10-02-bundle-investigation.md` | `docs/03-frontend/PERF_BASELINE.md` (2026-10-02 snapshot, investigation, reverted candidate, reproduction method). |

## Pointers deliberately left at their old path

These citations were **not** rewritten, because the file they cite is a record of what was known
when it was written and repointing it would falsify that history. Each old path still resolves
here:

- `backend/migrations/0127_meals_tenant_composite_pk.sql:36-37` → `docs/audit-2026-10-02-tenant-import-edge-cases.md` → [[audit-2026-10-02-tenant-import-edge-cases]] §3.1
- `scripts/validate-manifest.mjs:5` → `docs/audit-2026-09-30-tenant-manifest-schema.md` → [[audit-2026-09-30-tenant-manifest-schema]]
- `tests/e2e/specs/admin/super-panel-coverage.spec.ts` and `…/tenant-panel-coverage.spec.ts` → `AUDIT_E2E_GAPS_FINDINGS.md` → [[AUDIT_E2E_GAPS_FINDINGS]]
- `docs/security-guide.md` → `docs/audit-2026-09-30-eschtml-inventory.md` → [[audit-2026-09-30-eschtml-inventory]]

## Deliberately not archived

- `AGENT_LOGBOOK.md` (repo root) stays put — 12 code files and `AGENTS.md` cite that path. It is now
  the reference tier only; its history is [[AGENT_LOGBOOK_HISTORY]].
- `docs/tenant-import.md`, `docs/API_SURFACE.md`, `FINAL_IMPLEMENTATION_PLAN_v3.md` and
  `AGENT_LOGBOOK.md` keep their original paths as **split entry points**; each links to its siblings.
- `backend/migrations/legacy/README.md`, `backend/REFRESH_TOKENS_DESIGN.md`, `monitor/README.md`,
  `examples/minimal/README.md` and `.github/workflows/README.md` were left in place — they are
  directory-local or cited by live code, and moving docs out of code trees is out of scope for a
  docs restructure.

## Related

- [[README]] — vault entry point
- [[01-architecture/README]] · [[02-api/README]] · [[03-frontend/README]] · [[04-testing/README]] · [[05-operations/README]] — the live tiers this archive answers for
- [[06-security/README]] · [[07-data/README]] · [[08-guides/README]] · [[09-plans/README]] · [[10-tenant-import/README]] — the remaining live tiers
- [[98-history/audits/README]] · [[98-history/deploys/README]] · [[98-history/merged/README]] · [[98-history/migrations/README]] · [[98-history/plans/README]] · [[98-history/sessions/README]] · [[98-history/test-runs/README]] · [[98-history/tester-guides/README]] · [[98-history/worksheets/README]] — the buckets this index cuts across

## Gaps

<!-- Populated by 99-gaps/code-vs-docs.md -->
