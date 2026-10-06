---
title: "docs/98-history — archived, not deleted"
aliases:
tags:
  - type/index
  - audience/developer
  - domain/history
  - status/archived
created: 2026-10-06
updated: 2026-10-06
relates-to:
  - "[[docs/98-history/audits/README]]"
  - "[[docs/98-history/sessions/README]]"
  - "[[docs/98-history/plans/README]]"
  - "[[docs/98-history/merged/README]]"
  - "[[docs/98-history/worksheets/README]]"
  - "[[docs/98-history/deploys/README]]"
  - "[[docs/98-history/migrations/README]]"
  - "[[docs/98-history/tester-guides/README]]"
  - "[[docs/98-history/test-runs/README]]"
  - "[[docs/README]]"
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

## Buckets

| Bucket | What is in it | Files |
|---|---|---|
| [`audits/`](audits/) | Executed and superseded audit rounds: the 2026-09-05 8-domain round, the deep-dive summaries, the 2026-08-22 unification set, the 2026-07-18 assertion-quality QA round. `AUDIT_MASTER_FINDINGS.md`, the consolidation index that round survives as, is **live** at [`../05-operations/`](../05-operations/). | 16 |
| [`worksheets/`](worksheets/) | One-step investigation worksheets that each fed a fix that shipped (route gaps, monitor 404, `.eschtml` inventory, tenant-import round-trip parity). | 4 |
| [`sessions/`](sessions/) | Dated session records, wave-closure reports and gate results. `AGENT_LOGBOOK_HISTORY.md` — the append-only task history split out of the repo-root `AGENT_LOGBOOK.md` — is the entry point for per-task records. | 6 |
| [`plans/`](plans/) | Spent plans and roadmaps whose work is complete: the Astro 5→7 upgrade, the 38-task `IMPLEMENTATION_PLAN.md`, the polish plan. The live backlog is [`../09-plans/DEVELOPER_ROADMAP.md`](../09-plans/DEVELOPER_ROADMAP.md). | 3 |
| [`deploys/`](deploys/) | Deploy and cutover history: the completed Astro cutover and the one-shot prod-deploy checklist it drove. The live procedure is [`../05-operations/RUNBOOK.md`](../05-operations/RUNBOOK.md). | 2 |
| [`migrations/`](migrations/) | The D1 schema-direction planning note, archived after 40 migrations landed with its "Decision Required" head still unresolved. The live migration procedure is [`../07-data/migrations.md`](../07-data/migrations.md). | 1 |
| [`merged/`](merged/) | The seven MERGE sources from the 2026-10-06 cleanup. Their surviving sections were migrated into their canonical targets **before** the move; the rest was duplicate or stale. See each file's target below. | 7 |
| [`tester-guides/`](tester-guides/) | Both human-testing guides, kept separate by an explicit boundary statement: `testing-guide-owner.md` (owner-only super-admin credentials) and `testing-guide-tester.md` (shareable). | 2 |
| [`test-runs/`](test-runs/) | The one preserved machine test report — `2026-09-09-full-suite-run.md`, force-added from a gitignored `reports/` artifact so the per-run pass/fail breakdown survives. | 1 |

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

- `backend/migrations/0127_meals_tenant_composite_pk.sql:36-37` → `docs/audit-2026-10-02-tenant-import-edge-cases.md` → [`merged/audit-2026-10-02-tenant-import-edge-cases.md`](merged/audit-2026-10-02-tenant-import-edge-cases.md) §3.1
- `scripts/validate-manifest.mjs:5` → `docs/audit-2026-09-30-tenant-manifest-schema.md` → [`merged/audit-2026-09-30-tenant-manifest-schema.md`](merged/audit-2026-09-30-tenant-manifest-schema.md)
- `tests/e2e/specs/admin/super-panel-coverage.spec.ts` and `…/tenant-panel-coverage.spec.ts` → `AUDIT_E2E_GAPS_FINDINGS.md` → [`audits/AUDIT_E2E_GAPS_FINDINGS.md`](audits/AUDIT_E2E_GAPS_FINDINGS.md)
- `docs/security-guide.md` → `docs/audit-2026-09-30-eschtml-inventory.md` → [`worksheets/audit-2026-09-30-eschtml-inventory.md`](worksheets/audit-2026-09-30-eschtml-inventory.md)

## Deliberately not archived

- `AGENT_LOGBOOK.md` (repo root) stays put — 12 code files and `AGENTS.md` cite that path. It is now
  the reference tier only; its history is [`sessions/AGENT_LOGBOOK_HISTORY.md`](sessions/AGENT_LOGBOOK_HISTORY.md).
- `docs/tenant-import.md`, `docs/API_SURFACE.md`, `FINAL_IMPLEMENTATION_PLAN_v3.md` and
  `AGENT_LOGBOOK.md` keep their original paths as **split entry points**; each links to its siblings.
- `backend/migrations/legacy/README.md`, `backend/REFRESH_TOKENS_DESIGN.md`, `monitor/README.md`,
  `examples/minimal/README.md` and `.github/workflows/README.md` were left in place — they are
  directory-local or cited by live code, and moving docs out of code trees is out of scope for a
  docs restructure.
