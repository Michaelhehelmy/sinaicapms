---
audit: docs-inventory
date: 2026-10-06
task: docs-p1-inventory (Obsidian vault program 2026-10-06 — Part 1)
mode: READ-ONLY on all docs — no deletions, no content edits, no code changes
scope: every tracked-or-untracked `.md` in the repository except the excluded paths
files_inventoried: 89
---

# Docs Inventory — SinaiCamps (2026-10-06)

**Part 1 of the Obsidian vault program.** This file enumerates **every** markdown document in
the repository, assigns each one a domain and a status, and justifies that status. It changes
nothing: the only files written in this task are this audit and the `AGENT_LOGBOOK.md` fold.

**Part 2** (`.opencode/agents/tmp/2026-10-06-p2.md`) consumes this file and turns these statuses
into a DELETE / MERGE / ARCHIVE / SPLIT proposal behind an owner gate. **Nothing is deleted or
moved until the owner approves that proposal.**

---

## 1. Scope and enumeration

### 1.1 The find command

```bash
find . -name "*.md" -type f \
  -not -path "*/node_modules/*" \
  -not -path "./.git/*" \
  -not -path "*/dist/*" \
  -not -path "*/build/*" \
  -not -path "./.opencode/*" \
  | sed 's|^\./||' | sort
```

This returns **89 files**, matching the mission's stated expectation exactly.

**One scope note that must be explicit.** The mission described its exclusions as
"node_modules/.git/dist/build/.opencode/backups". The path `.opencode/backups` **does not exist**
in this repository. Interpreting the exclusion literally yields **260** `.md` files, not 89 — the
171 extra files are all under `.opencode/` (agents, audits, prompts, skills, summaries,
templates), which is agent tooling rather than the documentation vault the program targets.
Excluding `.opencode/` wholesale is the only reading that produces the mission's expected count,
so that is what was used. **The 171 `.opencode/**/*.md` files are therefore outside this
inventory** and are not assessed, counted, or proposed for action here.

### 1.2 Column definitions

| column | meaning | how it was computed |
|---|---|---|
| **path** | repo-relative path | `find` output, sorted |
| **lines** | line count | `wc -l` |
| **last-modified** | last commit date that touched the file | `git log -1 --format=%ad --date=short`; `untracked` for the 19 generated artifacts, which git has never seen |
| **referenced-by** | **inbound** — who points at this file | path-qualified text match **plus** resolved relative markdown links, scanned across 1,298 text files (docs, code, tests, scripts, config). Capped at 6 + a count of the remainder. |
| **referenced-from** | **outbound** — what this file points at | same resolution, run over the file's own text |
| **domain** | subject area | closed list, §1.3 |
| **status** | proposed disposition | KEEP / MERGE / ARCHIVE / DELETE / SPLIT, justified per row in §4 |

Reference resolution is deliberately **path-qualified**. A naive basename search reports
`docs/README.md`, `monitor/README.md`, `examples/minimal/README.md` and `backend/migrations/legacy/README.md`
as referencing each other (and every `reports/*/REPORT.md` as referencing every other), which is
false. Ambiguous bare basenames (`README`, `REPORT`, `TESTING`) are therefore only matched with a
directory qualifier or through an actually-resolved relative link.

**Not counted as inbound references:** `docs/.obsidian/workspace.json` (untracked Obsidian editor
UI state, not a real reference) and build output such as `app/storybook-static/**` (gitignored
build artifact that happens to embed doc paths).

### 1.3 Domain list (closed set, 15 values)

The mission referenced "the mission's list" of domains; that list was not carried into
`.opencode/agents/tmp/2026-10-06-p1.md`. This inventory therefore fixes a closed 15-value
vocabulary derived from the repository's own subject areas and applies it to every row. **If the
mission intended a different vocabulary, the `domain` column is the only thing that needs
re-mapping — statuses do not depend on it.**

| domain | n | covers |
|---|---|---|
| `agent-ops` | 2 | agent instructions and persistent memory |
| `architecture` | 4 | repo entry points, architecture, setup, docs index |
| `api` | 4 | the frontend↔backend contract and its audits/examples |
| `database` | 4 | D1 schema, migrations, migration audits |
| `security` | 5 | auth, secrets, sanitisation, security audits |
| `testing` | 7 | suites, guides, coverage/E2E/assertion audits |
| `frontend` | 7 | Astro/React app, bundle, component catalog, frontend audits |
| `backend` | 2 | Worker route/architecture audits |
| `deploy` | 5 | deploy, rollback, cutover, CI, runbooks |
| `tenant-import` | 7 | `POST /api/tenants/import` manifest feature and its audits |
| `product-guide` | 5 | the five business-pillar user guides |
| `audit-report` | 6 | cross-cutting audit rounds and their consolidation |
| `plan` | 7 | roadmaps, execution plans, live backlog |
| `session-log` | 5 | dated wave reports, closures, gate results |
| `generated-artifact` | 19 | machine-written, gitignored output |
| **total** | **89** | |

---

## 2. The inventory

89 rows, one per `.md`. `last-modified` is the last commit that touched the file.

| # | path | lines | last-modified | referenced-by | referenced-from | domain | status |
|---|---|---|---|---|---|---|---|
| 1 | `AGENT_LOGBOOK.md` | 9783 | 2026-10-03 | AGENTS.md, ASTRO_UPGRADE_PLAN.md, AUDIT_E2E_GAPS_FINDINGS.md, AUDIT_FRONTEND_FINDINGS.md, AUDIT_TEST_COVERAGE_FINDINGS.md, FINAL_IMPLEMENTATION_PLAN_v3.md +25 more | AGENTS.md, ASTRO_DEPLOY_CUTOVER.md, AUDIT_BACKEND_QUALITY_FINDINGS.md, AUDIT_DATABASE_FINDINGS.md, AUDIT_DEEP_DIVE_2026-09-06.md, AUDIT_E2E_GAPS_FINDINGS.md +47 more | agent-ops | **SPLIT** |
| 2 | `AGENTS.md` | 175 | 2026-09-21 | AGENT_LOGBOOK.md, AUDIT_BACKEND_QUALITY_FINDINGS.md, AUDIT_DEEP_DIVE_2026-09-06.md, AUDIT_FRONTEND_FINDINGS.md, AUDIT_TEST_COVERAGE_FINDINGS.md, FINAL_IMPLEMENTATION_PLAN.md +10 more | AGENT_LOGBOOK.md, README.md, docs/tenant-import.md | agent-ops | **KEEP** |
| 3 | `app/FRONTEND_UNIFICATION_AUDIT.md` | 397 | 2026-08-23 | AGENT_LOGBOOK.md, backend/BACKEND_UNIFICATION_AUDIT.md | AGENTS.md | frontend | **ARCHIVE** |
| 4 | `ASTRO_DEPLOY_CUTOVER.md` | 108 | 2026-09-07 | AGENT_LOGBOOK.md, ASTRO_UPGRADE_PLAN.md, AUDIT_MASTER_FINDINGS.md | — | deploy | **ARCHIVE** |
| 5 | `ASTRO_UPGRADE_PLAN.md` | 208 | 2026-09-07 | — | AGENT_LOGBOOK.md, ASTRO_DEPLOY_CUTOVER.md, AUDIT_MASTER_FINDINGS.md, AUDIT_TS_DEPS_FINDINGS.md | plan | **ARCHIVE** |
| 6 | `AUDIT_BACKEND_QUALITY_FINDINGS.md` | 95 | 2026-09-06 | AGENT_LOGBOOK.md, AUDIT_MASTER_FINDINGS.md | AGENTS.md | audit-report | **ARCHIVE** |
| 7 | `AUDIT_DATABASE_FINDINGS.md` | 250 | 2026-09-06 | AGENT_LOGBOOK.md, AUDIT_MASTER_FINDINGS.md | — | audit-report | **ARCHIVE** |
| 8 | `AUDIT_DEEP_DIVE_2026-09-06.md` | 107 | 2026-09-06 | AGENT_LOGBOOK.md | AGENTS.md | audit-report | **ARCHIVE** |
| 9 | `AUDIT_E2E_GAPS_FINDINGS.md` | 308 | 2026-09-06 | AGENT_LOGBOOK.md, AUDIT_MASTER_FINDINGS.md, tests/e2e/specs/admin/super-panel-coverage.spec.ts, tests/e2e/specs/admin/tenant-panel-coverage.spec.ts | AGENT_LOGBOOK.md | testing | **ARCHIVE** |
| 10 | `AUDIT_FRONTEND_FINDINGS.md` | 250 | 2026-09-06 | AGENT_LOGBOOK.md, AUDIT_MASTER_FINDINGS.md | AGENTS.md, AGENT_LOGBOOK.md | frontend | **ARCHIVE** |
| 11 | `AUDIT_MASTER_FINDINGS.md` | 192 | 2026-09-07 | AGENT_LOGBOOK.md, ASTRO_UPGRADE_PLAN.md, IMPLEMENTATION_PLAN.md | ASTRO_DEPLOY_CUTOVER.md, AUDIT_BACKEND_QUALITY_FINDINGS.md, AUDIT_DATABASE_FINDINGS.md, AUDIT_E2E_GAPS_FINDINGS.md, AUDIT_FRONTEND_FINDINGS.md, AUDIT_PERFORMANCE_FINDINGS.md +3 more | audit-report | **KEEP** |
| 12 | `AUDIT_PERFORMANCE_FINDINGS.md` | 112 | 2026-09-06 | AGENT_LOGBOOK.md, AUDIT_MASTER_FINDINGS.md | — | audit-report | **ARCHIVE** |
| 13 | `AUDIT_SECURITY_FINDINGS.md` | 186 | 2026-09-06 | AGENT_LOGBOOK.md, AUDIT_MASTER_FINDINGS.md | — | security | **ARCHIVE** |
| 14 | `AUDIT_TEST_COVERAGE_FINDINGS.md` | 240 | 2026-09-06 | AGENT_LOGBOOK.md, AUDIT_MASTER_FINDINGS.md | AGENTS.md, AGENT_LOGBOOK.md | testing | **ARCHIVE** |
| 15 | `AUDIT_TS_DEPS_FINDINGS.md` | 249 | 2026-09-07 | AGENT_LOGBOOK.md, ASTRO_UPGRADE_PLAN.md, AUDIT_MASTER_FINDINGS.md | — | frontend | **ARCHIVE** |
| 16 | `backend/API_CONTRACT_AUDIT.md` | 261 | 2026-08-23 | AGENT_LOGBOOK.md, backend/BACKEND_UNIFICATION_AUDIT.md | — | api | **ARCHIVE** |
| 17 | `backend/AUTH_SYSTEM_AUDIT.md` | 377 | 2026-08-23 | AGENT_LOGBOOK.md | backend/DATABASE_SCHEMA_AUDIT.md | security | **ARCHIVE** |
| 18 | `backend/BACKEND_UNIFICATION_AUDIT.md` | 380 | 2026-08-23 | AGENT_LOGBOOK.md | AGENTS.md, AGENT_LOGBOOK.md, app/FRONTEND_UNIFICATION_AUDIT.md, backend/API_CONTRACT_AUDIT.md | backend | **ARCHIVE** |
| 19 | `backend/DATABASE_SCHEMA_AUDIT.md` | 486 | 2026-08-23 | AGENT_LOGBOOK.md, backend/AUTH_SYSTEM_AUDIT.md | AGENT_LOGBOOK.md | database | **ARCHIVE** |
| 20 | `backend/migrations/legacy/README.md` | 16 | 2026-09-23 | — | — | database | **KEEP** |
| 21 | `backend/migrations/SCHEMA_DIRECTION_PLAN.md` | 389 | 2026-08-08 | AGENT_LOGBOOK.md | — | database | **ARCHIVE** |
| 22 | `backend/REFRESH_TOKENS_DESIGN.md` | 115 | 2026-08-23 | AGENT_LOGBOOK.md, backend/src/routes/pos/index.js | — | security | **KEEP** |
| 23 | `docs/ADMIN_REPAIR_REPORT_2026_09_14.md` | 150 | 2026-09-21 | AGENT_LOGBOOK.md | — | session-log | **ARCHIVE** |
| 24 | `docs/analytics-guide.md` | 115 | 2026-09-28 | docs/README.md | — | product-guide | **KEEP** |
| 25 | `docs/API_CONTRACT.md` | 96 | 2026-09-28 | AGENT_LOGBOOK.md, README.md, docs/QUICK_START.md, docs/README.md, docs/security-guide.md, examples/minimal/README.md | — | api | **KEEP** |
| 26 | `docs/API_SURFACE.md` | 576 | 2026-09-28 | AGENT_LOGBOOK.md | — | api | **SPLIT** |
| 27 | `docs/ARCHITECTURE.md` | 157 | 2026-10-03 | AGENT_LOGBOOK.md, README.md, docs/QUICK_START.md, docs/README.md | AGENT_LOGBOOK.md, docs/RUNBOOK.md, docs/TESTING.md | architecture | **KEEP** |
| 28 | `docs/audit-2026-09-15-route-gaps.md` | 48 | 2026-09-16 | AGENT_LOGBOOK.md | AGENT_LOGBOOK.md | frontend | **ARCHIVE** |
| 29 | `docs/audit-2026-09-30-eschtml-inventory.md` | 126 | 2026-09-30 | AGENT_LOGBOOK.md, docs/security-guide.md | — | security | **ARCHIVE** |
| 30 | `docs/audit-2026-09-30-monitor-404.md` | 52 | 2026-09-30 | AGENT_LOGBOOK.md | — | backend | **ARCHIVE** |
| 31 | `docs/audit-2026-09-30-tenant-import-parity.md` | 253 | 2026-10-02 | AGENT_LOGBOOK.md, backend/migrations/0127_meals_tenant_composite_pk.sql, backend/tests/meals-tenant-composite-pk.test.js, backend/tests/tenant-import-project-id.test.js, docs/tenant-import.md | docs/tenant-import.md | tenant-import | **ARCHIVE** |
| 32 | `docs/audit-2026-09-30-tenant-manifest-gaps.md` | 78 | 2026-09-30 | AGENT_LOGBOOK.md, docs/audit-2026-09-30-tenant-manifest-types.md, docs/tenant-import.md | docs/audit-2026-09-30-tenant-manifest-schema.md, docs/tenant-import.md | tenant-import | **MERGE** |
| 33 | `docs/audit-2026-09-30-tenant-manifest-schema.md` | 127 | 2026-09-30 | AGENT_LOGBOOK.md, docs/audit-2026-09-30-tenant-manifest-gaps.md, docs/audit-2026-09-30-tenant-manifest-types.md, docs/tenant-import.md, scripts/validate-manifest.mjs | docs/tenant-import.md | tenant-import | **MERGE** |
| 34 | `docs/audit-2026-09-30-tenant-manifest-types.md` | 115 | 2026-09-30 | AGENT_LOGBOOK.md, docs/tenant-import.md | docs/audit-2026-09-30-tenant-manifest-gaps.md, docs/audit-2026-09-30-tenant-manifest-schema.md, docs/tenant-import.md | tenant-import | **MERGE** |
| 35 | `docs/audit-2026-10-02-bundle-investigation.md` | 190 | 2026-10-02 | AGENT_LOGBOOK.md | AGENTS.md, docs/PERF_BASELINE.md | frontend | **MERGE** |
| 36 | `docs/audit-2026-10-02-tenant-import-edge-cases.md` | 272 | 2026-10-02 | AGENT_LOGBOOK.md, backend/migrations/0127_meals_tenant_composite_pk.sql, docs/tenant-import.md | — | tenant-import | **MERGE** |
| 37 | `docs/BACKLOG_VOID_REFUND.md` | 18 | 2026-09-21 | docs/FINAL-CLOSURE-v2.md | — | plan | **KEEP** |
| 38 | `docs/BLOCKED-pos-products-composite-pk.md` | 129 | 2026-10-02 | AGENT_LOGBOOK.md | — | tenant-import | **KEEP** |
| 39 | `docs/camp-guide.md` | 117 | 2026-09-28 | docs/README.md | — | product-guide | **KEEP** |
| 40 | `docs/COMPONENT_CATALOG.md` | 77 | 2026-09-21 | README.md, docs/README.md | — | frontend | **KEEP** |
| 41 | `docs/DEEP_AUDIT_2026_08_27.md` | 190 | 2026-09-21 | AGENT_LOGBOOK.md | — | audit-report | **ARCHIVE** |
| 42 | `docs/deploy/PROD-DEPLOY-CHECKLIST-2026-09-22.md` | 40 | 2026-09-22 | — | — | deploy | **ARCHIVE** |
| 43 | `docs/DEVELOPER_ROADMAP.md` | 40 | 2026-09-28 | AGENT_LOGBOOK.md, README.md, docs/README.md | AGENT_LOGBOOK.md | plan | **KEEP** |
| 44 | `docs/FINAL-AUDIT-CLOSURE.md` | 38 | 2026-09-21 | — | — | session-log | **ARCHIVE** |
| 45 | `docs/FINAL-CLOSURE-v2.md` | 50 | 2026-09-22 | — | docs/BACKLOG_VOID_REFUND.md | session-log | **ARCHIVE** |
| 46 | `docs/G65_STAGING_VALIDATION.md` | 17 | 2026-09-22 | — | — | session-log | **ARCHIVE** |
| 47 | `docs/MIGRATION_GUIDE.md` | 51 | 2026-09-28 | AGENT_LOGBOOK.md, README.md, docs/README.md, scripts-recon.js | — | database | **KEEP** |
| 48 | `docs/PERF_BASELINE.md` | 151 | 2026-09-22 | AGENT_LOGBOOK.md, README.md, docs/README.md, docs/audit-2026-10-02-bundle-investigation.md | — | frontend | **KEEP** |
| 49 | `docs/POLISH_PLAN.md` | 121 | 2026-09-28 | AGENT_LOGBOOK.md, FINAL_IMPLEMENTATION_PLAN.md, FINAL_IMPLEMENTATION_PLAN_v3.md, docs/WAVE6_EXIT_REPORT.md | AGENT_LOGBOOK.md | plan | **ARCHIVE** |
| 50 | `docs/QUICK_START.md` | 77 | 2026-09-21 | AGENT_LOGBOOK.md, README.md, docs/README.md | docs/API_CONTRACT.md, docs/ARCHITECTURE.md | architecture | **KEEP** |
| 51 | `docs/README.md` | 108 | 2026-09-21 | AGENT_LOGBOOK.md | — | architecture | **KEEP** |
| 52 | `docs/restaurant-guide.md` | 141 | 2026-09-28 | docs/README.md | — | product-guide | **KEEP** |
| 53 | `docs/RUNBOOK.md` | 289 | 2026-10-02 | AGENT_LOGBOOK.md, README.md, docs/ARCHITECTURE.md, docs/tenant-import.md | AGENT_LOGBOOK.md | deploy | **KEEP** |
| 54 | `docs/security-guide.md` | 306 | 2026-10-02 | AGENT_LOGBOOK.md, FINAL_IMPLEMENTATION_PLAN.md, README.md, docs/README.md | docs/API_CONTRACT.md, docs/audit-2026-09-30-eschtml-inventory.md | security | **KEEP** |
| 55 | `docs/service-guide.md` | 134 | 2026-09-28 | docs/README.md | — | product-guide | **KEEP** |
| 56 | `docs/supermarket-guide.md` | 122 | 2026-09-28 | docs/README.md | — | product-guide | **KEEP** |
| 57 | `docs/tenant-import.md` | 658 | 2026-10-02 | AGENTS.md, AGENT_LOGBOOK.md, FINAL_IMPLEMENTATION_PLAN_v3.md, README.md, app/src/components/admin/TenantImportPanel.tsx, backend/tests/tenant-export-room-status.test.js +5 more | docs/RUNBOOK.md, docs/audit-2026-09-30-tenant-import-parity.md, docs/audit-2026-09-30-tenant-manifest-gaps.md, docs/audit-2026-09-30-tenant-manifest-schema.md, docs/audit-2026-09-30-tenant-manifest-types.md, docs/audit-2026-10-02-tenant-import-edge-cases.md | tenant-import | **SPLIT** |
| 58 | `docs/TESTING_GUIDE_OWNER.md` | 59 | 2026-09-21 | AGENT_LOGBOOK.md, scripts/seed-test-users.js | docs/TESTING_GUIDE_TESTER.md | testing | **KEEP** |
| 59 | `docs/TESTING_GUIDE_TESTER.md` | 75 | 2026-09-21 | AGENT_LOGBOOK.md, docs/TESTING_GUIDE_OWNER.md, scripts/seed-test-users.js | — | testing | **KEEP** |
| 60 | `docs/TESTING.md` | 59 | 2026-09-28 | AGENT_LOGBOOK.md, README.md, docs/ARCHITECTURE.md, docs/README.md, scripts-recon.js | AGENT_LOGBOOK.md | testing | **KEEP** |
| 61 | `docs/WAVE6_EXIT_REPORT.md` | 39 | 2026-09-28 | AGENT_LOGBOOK.md | README.md, docs/POLISH_PLAN.md | session-log | **ARCHIVE** |
| 62 | `examples/minimal/README.md` | 53 | 2026-08-13 | AGENT_LOGBOOK.md | docs/API_CONTRACT.md | api | **KEEP** |
| 63 | `FINAL_IMPLEMENTATION_PLAN.md` | 439 | 2026-09-21 | AGENT_LOGBOOK.md, FINAL_IMPLEMENTATION_PLAN_v3.md | AGENTS.md, docs/POLISH_PLAN.md, docs/security-guide.md | plan | **MERGE** |
| 64 | `FINAL_IMPLEMENTATION_PLAN_v3.md` | 994 | 2026-09-17 | AGENT_LOGBOOK.md | AGENTS.md, AGENT_LOGBOOK.md, FINAL_IMPLEMENTATION_PLAN.md, docs/POLISH_PLAN.md, docs/tenant-import.md | plan | **SPLIT** |
| 65 | `.github/workflows/README.md` | 76 | 2026-08-23 | — | — | deploy | **KEEP** |
| 66 | `IMPLEMENTATION_PLAN.md` | 131 | 2026-09-06 | AGENT_LOGBOOK.md | AGENT_LOGBOOK.md, AUDIT_MASTER_FINDINGS.md | plan | **ARCHIVE** |
| 67 | `monitor/README.md` | 323 | 2026-10-03 | AGENT_LOGBOOK.md | — | deploy | **KEEP** |
| 68 | `README.md` | 389 | 2026-10-02 | AGENTS.md, AGENT_LOGBOOK.md, app/storybook-static/assets/entry-preview-docs-DlC7LSUk.js, docs/WAVE6_EXIT_REPORT.md, examples/minimal/minimal-marketplace.mjs, monitor/wrangler.toml | docs/API_CONTRACT.md, docs/ARCHITECTURE.md, docs/COMPONENT_CATALOG.md, docs/DEVELOPER_ROADMAP.md, docs/MIGRATION_GUIDE.md, docs/PERF_BASELINE.md +5 more | architecture | **KEEP** |
| 69 | `TESTING_ROADMAP.md` | 454 | 2026-08-23 | — | — | testing | **MERGE** |
| 70 | `tests/AUDIT-ASSERTION-QUALITY.md` | 297 | 2026-08-08 | — | — | testing | **ARCHIVE** |
| 71 | `reports/all-tests-20260909-172545/REPORT.md` | 26 | untracked | — | AGENT_LOGBOOK.md | generated-artifact | **DELETE** |
| 72 | `reports/all-tests-20260909-172545/_summary_table.md` | 5 | untracked | — | — | generated-artifact | **DELETE** |
| 73 | `reports/all-tests-20260909-173200/REPORT.md` | 26 | untracked | — | AGENT_LOGBOOK.md | generated-artifact | **DELETE** |
| 74 | `reports/all-tests-20260909-173200/_summary_table.md` | 5 | untracked | — | — | generated-artifact | **DELETE** |
| 75 | `reports/all-tests-20260909-202050/REPORT.md` | 40 | untracked | — | AGENT_LOGBOOK.md | generated-artifact | **DELETE** |
| 76 | `reports/all-tests-20260909-202050/_summary_table.md` | 13 | untracked | — | — | generated-artifact | **DELETE** |
| 77 | `reports/all-tests-20260909-215048/REPORT.md` | 678 | untracked | — | AGENT_LOGBOOK.md | generated-artifact | **DELETE** |
| 78 | `reports/all-tests-20260909-215048/_summary_table.md` | 13 | untracked | — | — | generated-artifact | **DELETE** |
| 79 | `reports/all-tests-20260909-230124/REPORT.md` | 26 | untracked | — | AGENT_LOGBOOK.md | generated-artifact | **DELETE** |
| 80 | `reports/all-tests-20260909-230124/_summary_table.md` | 5 | untracked | — | — | generated-artifact | **DELETE** |
| 81 | `reports/all-tests-20260909-231931/REPORT.md` | 41 | untracked | — | AGENT_LOGBOOK.md | generated-artifact | **DELETE** |
| 82 | `reports/all-tests-20260909-231931/_summary_table.md` | 13 | untracked | — | — | generated-artifact | **DELETE** |
| 83 | `reports/all-tests-20260910-073629/REPORT.md` | 40 | untracked | — | AGENT_LOGBOOK.md | generated-artifact | **DELETE** |
| 84 | `reports/all-tests-20260910-073629/_summary_table.md` | 13 | untracked | — | — | generated-artifact | **DELETE** |
| 85 | `reports/all-tests-20260910-085638/REPORT.md` | 90 | untracked | — | AGENT_LOGBOOK.md | generated-artifact | **DELETE** |
| 86 | `reports/all-tests-20260910-085638/_summary_table.md` | 13 | untracked | — | — | generated-artifact | **DELETE** |
| 87 | `reports/all-tests-20260910-113411/REPORT.md` | 27 | untracked | — | AGENT_LOGBOOK.md | generated-artifact | **DELETE** |
| 88 | `reports/all-tests-20260910-113411/_summary_table.md` | 6 | untracked | — | — | generated-artifact | **DELETE** |
| 89 | `tests/e2e/results/prod-e2e/html/data/f3a7ec94a6adaa5981903363293014757b8675d6.md` | 438 | untracked | — | — | generated-artifact | **DELETE** |

---

## 3. Counts

### 3.1 Per status

| status | n | share | meaning |
|---|---|---|---|
| **KEEP** | 28 | 31.5% | canonical, current, correctly-tiered — stays as-is |
| **ARCHIVE** | 31 | 34.8% | real history whose work is done and whose outcome is recorded elsewhere; move, keep the content |
| **DELETE** | 19 | 21.3% | machine-written, gitignored, regenerable artifacts with no unique content |
| **MERGE** | 7 | 7.9% | content that duplicates or supersedes a canonical doc; migrate named sections, then retire |
| **SPLIT** | 4 | 4.5% | genuinely valuable but over the 500-line threshold; split, do not cut |
| **total** | **89** | 100% | |

**31 + 19 = 50 of 89 files (56%) are dead weight today.** That is the headline: the repo has a
small, healthy canonical tier (28 docs) sitting under ~50 files of superseded plans, executed
audits, dated wave reports and build output.

### 3.2 Per domain

| domain | KEEP | MERGE | ARCHIVE | DELETE | SPLIT | total |
|---|---|---|---|---|---|---|
| `agent-ops` | 1 | — | — | — | 1 | 2 |
| `architecture` | 4 | — | — | — | — | 4 |
| `api` | 1 | — | 1 | — | 1 | 4 |
| `database` | 2 | — | 2 | — | — | 4 |
| `security` | 2 | — | 3 | — | — | 5 |
| `testing` | 3 | 1 | 3 | — | — | 7 |
| `frontend` | 2 | 1 | 4 | — | — | 7 |
| `backend` | — | — | 2 | — | — | 2 |
| `deploy` | 3 | — | 2 | — | — | 5 |
| `tenant-import` | 2 | 4 | 1 | — | 1 | 7 |
| `product-guide` | 5 | — | — | — | — | 5 |
| `audit-report` | 1 | — | 5 | — | — | 6 |
| `plan` | 1 | 1 | 3 | — | 1 | 7 |
| `session-log` | — | — | 5 | — | — | 5 |
| `generated-artifact` | — | — | — | 19 | — | 19 |
| **total** | **28** | **7** | **31** | **19** | **4** | **89** |

`product-guide` is the cleanest domain in the repo: 5/5 KEEP, all in the same 2026-09-28 refresh
set, all reachable from `docs/README.md`. `audit-report` is the inverse: 1/6 KEEP — a whole round
of sub-reports kept alive only by their own consolidation index.

---

## 4. Flags: every file over 500 lines (SPLIT candidates)

**5 files exceed 500 lines.** Four are SPLIT; one is a DELETE (a generated artifact, so splitting
it is meaningless).

| # | path | lines | status | threshold overrun | why |
|---|---|---|---|---|---|
| 1 | `AGENT_LOGBOOK.md` | **9,783** | **SPLIT** | 19.6× | Mandated session-start read for every agent (AGENTS.md §8) and the most-referenced doc in the repo (31 referrers). Two unrelated things share one file: a ~110-line **"Persistent Learnings & Codebase Gotchas"** section that is a reusable reference, and ~9,600 lines of append-only per-task history. Splitting these lets the reference tier be loaded and maintained without the history. |
| 2 | `FINAL_IMPLEMENTATION_PLAN_v3.md` | **994** | **SPLIT** | 2.0× | The owner-approved canonical plan for the deep-audit campaign. Currently mixes a wave/task index, per-item acceptance criteria, and the owner-decision record (Q10 = KEEP, freeze lifted). The index belongs with the backlog; the decision record belongs with the audit history. |
| 3 | `docs/tenant-import.md` | **658** | **SPLIT** | 1.3× | The most load-bearing feature doc in the repo — 11 referrers including `AGENTS.md`, root `README.md`, `app/src/components/admin/TenantImportPanel.tsx`, four `backend/tests/*` files and `scripts/export-tenant.mjs`. It currently mixes three documents: the operator walkthrough, the manifest field reference, and the audit-response appendix. |
| 4 | `docs/API_SURFACE.md` | **576** | **SPLIT** | 1.2× | Restates `docs/API_CONTRACT.md` before adding the endpoint → api-function → handler → table → hook map. Only the map is non-duplicated content; that map should be its own reference so the contract statement stays at 96 lines. |
| 5 | `reports/all-tests-20260909-215048/REPORT.md` | **678** | **DELETE** | 1.4× | Over the threshold, but it is untracked + gitignored machine output from a single 2026-09-09 test session, superseded by the final run of that session and regenerated by `scripts/run-all-tests.sh`. No split — there is nothing to preserve. |

**Near-threshold files worth watching** (not flagged as SPLIT, but they will cross 500 on the
next edit): `backend/DATABASE_SCHEMA_AUDIT.md` (486), `TESTING_ROADMAP.md` (454),
`FINAL_IMPLEMENTATION_PLAN.md` (439),
`tests/e2e/results/prod-e2e/html/data/f3a7ec94….md` (438, generated).

---

## 5. Per-row status justification

One line per file, grouped by status. This is the justification the 7-column table defers.

### 5.1 KEEP (28)

| path | justification |
|---|---|
| `AGENTS.md` | Loaded as the opencode system prompt for this repo — its inbound set includes `monitor/src/index.js` and two E2E specs that cite its rules. 175 lines, single-purpose, actively maintained. |
| `AUDIT_MASTER_FINDINGS.md` | The consolidation index of the 2026-09-05 8-domain round and the declared source for `IMPLEMENTATION_PLAN.md`. Kept as the surviving entry point even though its eight sub-reports archive. |
| `README.md` | Repository entry point, reconciled with the tree 2026-10-02, and the hub that links 11 docs. Nothing else serves this role. |
| `backend/REFRESH_TOKENS_DESIGN.md` | The one backend design doc explicitly **not** executed ("Do not implement until the plan's …"), and the live code cites it (`backend/src/routes/pos/index.js`). A future-gated spec has no other home. |
| `backend/migrations/legacy/README.md` | Load-bearing directory-local README: without it the 99 archived migrations look like live lineage. States the 2026-09-23 squash to the canonical 14-file baseline. 16 lines, zero referrers by design. |
| `docs/API_CONTRACT.md` | The thin, correct statement of the frontend↔backend contract ("the contract lives in `app/src/lib/api.ts`"). 96 lines, 6 referrers. Preferred over the 576-line `docs/API_SURFACE.md`. |
| `docs/ARCHITECTURE.md` | Self-declared source of truth ("If it disagrees with prose elsewhere in the repo, trust this file"), re-verified 2026-10-02/03. Linked from root `README.md` and `docs/QUICK_START.md`. |
| `docs/BACKLOG_VOID_REFUND.md` | 18-line live backlog proposal for the next POS cycle. Unimplemented, and referenced by `backend/tests/phase4f-transactions-project.test.js` — the only plan-tier file with a live code referrer. |
| `docs/BLOCKED-pos-products-composite-pk.md` | Live BLOCKED item documenting the verified FK consequence that stopped the `pos_products` composite-PK migration. Load-bearing for whoever writes the next migration; last touched 2026-10-02. |
| `docs/COMPONENT_CATALOG.md` | Frontend inventory with an explicit on-disk truth count ("20 actual, 2026-09-21") and honest gaps called out. Linked from root `README.md` and `docs/ARCHITECTURE.md`. |
| `docs/DEVELOPER_ROADMAP.md` | The live backlog state, folded forward through 2026-09-28. Small (40 lines), 3 referrers, no duplication elsewhere. |
| `docs/MIGRATION_GUIDE.md` | The canonical, thin (51-line) D1 migration procedure — the right shape for a durable doc. **Content caveat:** its §1 head is stale (see §6). |
| `docs/PERF_BASELINE.md` | The declared perf home — linked from root `README.md`, cited by the bundle audit, backed by `app/budget.json` enforcement. Canonical destination for the newer 2026-10-02 measurement. |
| `docs/QUICK_START.md` | Setup path from zero, linked from root `README.md` and `docs/README.md`, 77 lines, current. |
| `docs/README.md` | The docs hub. Its table of contents is the only thing linking the five product guides, `docs/TESTING.md`, `security-guide` and `QUICK_START` — without it 13 docs become orphans. |
| `docs/RUNBOOK.md` | Owner-only operational procedures (deploy, rollback, backup, drift, incident), rewritten 2026-10-02 against the live tree. The successor to every archived deploy checklist. |
| `docs/security-guide.md` | Canonical security architecture prose, refreshed 2026-10-02, linked from root `README.md`, `docs/ARCHITECTURE.md` and the API-contract consumers. Where the escHtml verdict landed. |
| `docs/TESTING.md` | Canonical suite list with verified counts and commands — 59 lines, 5 referrers. The correct tier and shape for the testing domain. |
| `docs/TESTING_GUIDE_OWNER.md` | Owner-only credential/super-admin testing guide; linked by the tester guide and cited by `scripts/seed-test-users.js`. Kept separate from the tester guide by an explicit boundary statement. |
| `docs/TESTING_GUIDE_TESTER.md` | The shareable tester guide, linked from the owner guide; truth-verified 2026-09-21 against `scripts/seed-test-users.js` and `routeZones.ts`. |
| `docs/analytics-guide.md` | One of the five business-pillar user guides, 2026-09-28 refreshed set, linked from the docs index. Current. |
| `docs/camp-guide.md` | One of the five business-pillar user guides, 2026-09-28 set, linked from `docs/README.md`. Current. |
| `docs/restaurant-guide.md` | One of the five business-pillar user guides, 2026-09-28 set, linked from `docs/README.md`. Current. |
| `docs/service-guide.md` | One of the five business-pillar user guides, 2026-09-28 set, linked from `docs/README.md`. Current. |
| `docs/supermarket-guide.md` | One of the five business-pillar user guides, 2026-09-28 set, linked from `docs/README.md`. Current. |
| `examples/minimal/README.md` | Directory-local README for the runnable marketplace-fetch example beside `minimal-marketplace.mjs`. Small, current, and the only place the external-fetch contract is demonstrated. |
| `monitor/README.md` | Current (2026-10-03) README for the standalone `campmaster-monitor` Worker after the R2 migration. Worker-local convention, same role as the other two directory-local READMEs. |
| `.github/workflows/README.md` | Directory-local README describing `ci.yml` and the release/deploy workflows. Convention-correct placement (no top-level CI doc exists), 76 lines. |

### 5.2 SPLIT (4)

See §4 for the full split rationale. Summary: `AGENT_LOGBOOK.md` (9,783),
`FINAL_IMPLEMENTATION_PLAN_v3.md` (994), `docs/tenant-import.md` (658),
`docs/API_SURFACE.md` (576). All four are heavily referenced, so the split must **not** break a
single existing inbound path — the migration plan in Part 2 has to name the replacement for each.

### 5.3 MERGE (7)

| source | target | justification |
|---|---|---|
| `TESTING_ROADMAP.md` | `docs/TESTING.md` (+ the TESTING_GUIDE pair) | 454 lines, **zero** inbound referrers, last touched 2026-08-23. An orphan whose content splits three ways: suite expectations duplicate `docs/TESTING.md`, and its login-credentials table duplicates `docs/TESTING_GUIDE_OWNER.md` / `docs/TESTING_GUIDE_TESTER.md`. Only the not-yet-covered cases carry new value. |
| `FINAL_IMPLEMENTATION_PLAN.md` (v2) | `FINAL_IMPLEMENTATION_PLAN_v3.md` | v2 of the same plan that v3 supersedes. v3 already carries the v2-round owner decisions (Q10 = KEEP, freeze lifted), so the v2→v3 delta is a decision record, not new work. Maintaining two versions of one plan guarantees drift. |
| `docs/audit-2026-09-30-tenant-manifest-gaps.md` | `docs/tenant-import.md` | Doc-vs-code gap list whose resolutions are already written into `tenant-import.md` — the file that cites it. Merging removes a second source of truth for one manifest. |
| `docs/audit-2026-09-30-tenant-manifest-schema.md` | `docs/tenant-import.md` | Field-by-field Zod extract duplicating the field reference in `tenant-import.md`. `scripts/validate-manifest.mjs` cites it; that script's reference must be repointed at the merged canonical section. |
| `docs/audit-2026-09-30-tenant-manifest-types.md` | `docs/tenant-import.md` | Tenant-type coverage matrix superseded by the type table already in `tenant-import.md`. Its only inbound refs are `tenant-import.md` and one sibling audit — the whole cluster is a doc pile-up on a single topic. |
| `docs/audit-2026-10-02-tenant-import-edge-cases.md` | `docs/tenant-import.md` | 7/7-green edge-case matrix plus **3 residual findings**. The residuals are long-lived open items, not audit history, so they belong in `tenant-import.md`. Migration `0127` cites this file and must be repointed. |
| `docs/audit-2026-10-02-bundle-investigation.md` | `docs/PERF_BASELINE.md` | A 2026-10-02 measurement, **newer** than the 2026-09-22 snapshot in `PERF_BASELINE.md`, that does not need its own audit file. Merge its surviving numbers into the declared perf home — which is already the file it cites. |

### 5.4 ARCHIVE (31)

Grouped by why they are dead.

**Executed 2026-09-05 audit round — 8 sub-reports (the round's findings are done; the index survives):**
`AUDIT_BACKEND_QUALITY_FINDINGS.md`, `AUDIT_DATABASE_FINDINGS.md`, `AUDIT_E2E_GAPS_FINDINGS.md`,
`AUDIT_FRONTEND_FINDINGS.md`, `AUDIT_PERFORMANCE_FINDINGS.md`, `AUDIT_SECURITY_FINDINGS.md`,
`AUDIT_TEST_COVERAGE_FINDINGS.md`, `AUDIT_TS_DEPS_FINDINGS.md` — all consumed by
`IMPLEMENTATION_PLAN.md`'s 38 tasks (all complete 2026-09-06) and consolidated in
`AUDIT_MASTER_FINDINGS.md`.
*Archive-with-a-caveat:* `AUDIT_E2E_GAPS_FINDINGS.md` is cited by two live E2E specs
(`tests/e2e/specs/admin/super-panel-coverage.spec.ts`, `tenant-panel-coverage.spec.ts`) as their
coverage justification — that pointer must survive the move.

**2026-08-22/23 unification audits (executed the following day):**
`app/FRONTEND_UNIFICATION_AUDIT.md`, `backend/API_CONTRACT_AUDIT.md`,
`backend/AUTH_SYSTEM_AUDIT.md`, `backend/BACKEND_UNIFICATION_AUDIT.md`,
`backend/DATABASE_SCHEMA_AUDIT.md` — the logbook records Phases 1-3, 5, 6, 8, 9 landing
2026-08-23. They form one set (`BACKEND_UNIFICATION_AUDIT.md` names the other two as companions)
and should archive together. The forward-looking remainder already has a home in
`backend/REFRESH_TOKENS_DESIGN.md`.

**Spent plans and roadmaps:** `ASTRO_UPGRADE_PLAN.md` (Astro 5→7 executed; **zero** referrers —
a fully spent plan), `IMPLEMENTATION_PLAN.md` (38 tasks complete; durable backlog is
`docs/DEVELOPER_ROADMAP.md`), `docs/POLISH_PLAN.md` (self-declares "Waves 1-3 shipped … kept for
reference"; only §3.10 PWA is unshipped and it is already in the logbook),
`ASTRO_DEPLOY_CUTOVER.md` (cutover completed 2026-09-07; `docs/RUNBOOK.md` replaces it),
`docs/deploy/PROD-DEPLOY-CHECKLIST-2026-09-22.md` (one-shot cutover checklist whose own first line
says the cutover it drives is the last step, now done),
`backend/migrations/SCHEMA_DIRECTION_PLAN.md` (still marked "Decision Required" after 40
migrations landed — head is now `0127`; every decision is resolved in the tree and the logbook).

**Superseded cross-cutting audits:** `AUDIT_DEEP_DIVE_2026-09-06.md` (round-2 summary, all items
closed by the following waves and superseded by the FINAL plans),
`docs/DEEP_AUDIT_2026_08_27.md` (superseded by the 2026-09-05 round, and it already carries
`WITHDRAWN` markers from the 2026-09-21 truth pass — self-declared partly dead),
`tests/AUDIT-ASSERTION-QUALITY.md` (2026-07-18 QA round, **zero** referrers, superseded by the
2026-09-05 coverage and E2E-gap audits, both executed).

**One-step investigation worksheets (each fed a fix that shipped):**
`docs/audit-2026-09-15-route-gaps.md` (T10 worksheet, created because the logbook held no
route-gap record — the items were fixed in the following waves),
`docs/audit-2026-09-30-monitor-404.md` (root-caused the `status.sinaicamps.com` split-brain; fix
shipped), `docs/audit-2026-09-30-eschtml-inventory.md` (step-1 inventory of a completed sweep;
its "D KEEP all" verdict is already recorded in `docs/security-guide.md`, which cites it),
`docs/audit-2026-09-30-tenant-import-parity.md` (round-trip parity verdict PASS + 6 drift items).
*Archive-with-a-caveat:* the parity audit is cited by migration `0127`, two `backend/tests/*`
files and `docs/tenant-import.md` — it archives as the evidence trail for those citations, so the
pointer must survive.

**Dated session/closure records (the commit history they cite is permanent):**
`docs/ADMIN_REPAIR_REPORT_2026_09_14.md`, `docs/FINAL-AUDIT-CLOSURE.md` (**zero** referrers — a
commit-hash list), `docs/FINAL-CLOSURE-v2.md`, `docs/G65_STAGING_VALIDATION.md` (17-line gate
result, superseded by the prod checklist and then the runbook), `docs/WAVE6_EXIT_REPORT.md`
(a commit list **plus stale counts** — it claims 99 migrations / head `0099` where the tree has 40
/ head `0127`, which is the strongest argument for archiving rather than keeping it).

### 5.5 DELETE (19)

All 19 are **untracked and gitignored** machine output — there is nothing in git to remove and
nothing to migrate. Part 2 should still list them explicitly for owner sign-off.

| group | n | files | justification |
|---|---|---|---|
| `reports/all-tests-*/REPORT.md` | 9 | `20260909-172545`, `-173200`, `-202050`, `-215048`, `-230124`, `-231931`, `20260910-073629`, `-085638`, `-113411` | Output of one 2026-09-09/10 test session. Nine of the eleven snapshots in that session are superseded by the final run; nothing in the repo references any of them **by path**; `scripts/run-all-tests.sh` recreates them on demand. |
| `reports/all-tests-*/_summary_table.md` | 9 | same nine run directories | Machine-written companion table for a sibling `REPORT.md` in the same directory. Zero inbound references, zero unique content. |
| `tests/e2e/results/prod-e2e/html/data/f3a7ec94….md` | 1 | Playwright HTML-report payload | Not a document. Regenerated in full by `npx playwright show-report` or any `--reporter=html` run. |

> The 9 `REPORT.md` files appear to have 1 outbound reference each to `AGENT_LOGBOOK.md`; that is
> the logbook citing the *run*, not the report citing the logbook, and it does not make the
> artifacts live.

---

## 6. Accuracy findings (read-only observations — nothing was edited)

These are contradictions surfaced by the inventory. They are reported, not fixed, per the
read-only constraint.

1. **`docs/MIGRATION_GUIDE.md` §1 states the wrong migration head.** It claims
   `0123_storefront_order_items_fk_pos_products.sql` and "37 f[iles]". The tree has **40**
   `.sql` migrations with head **`0127_meals_tenant_composite_pk.sql`**. This is the doc most
   likely to be trusted on the spot, so it matters — and it is a KEEP doc, which means it needs a
   refresh rather than an archive.
2. **`AGENTS.md` §2 carries the same class of drift.** It states
   "`backend/migrations/` — D1 schema migrations (53 files — Layer 3)" and names head
   `0053_camp_ownership.sql`, from the pre-squash era. Actual: 40 files, head `0127`.
   (`AGENTS.md` is outside this task's editable set; flagged here for the owner.)
3. **`docs/WAVE6_EXIT_REPORT.md` claims 99 migrations / head `0099_normalize_marketplace_payouts_ids.sql`**,
   a third, older number. Reinforces its ARCHIVE status.
4. **Three different "current migration head" claims coexist** across KEEP-class docs
   (`AGENTS.md` 0053/53, `docs/MIGRATION_GUIDE.md` 0123/37, `docs/WAVE6_EXIT_REPORT.md` 0099/99)
   against one reality (0127/40). Any Obsidian vault structure should nominate exactly one doc as
   the head-of-migrations authority.

---

## 7. Read-only compliance

| constraint | status |
|---|---|
| No document deleted | ✅ 0 deletions |
| No document content edited | ✅ the 89 inventoried docs are byte-identical to `HEAD` (verified in §8) |
| No code changed | ✅ no file under `app/`, `backend/`, `monitor/`, `tests/`, `scripts/`, `examples/` written |
| Only the audit file created | ✅ `.opencode/audits/docs-inventory-2026-10-06.md` |
| `AGENT_LOGBOOK.md` fold | ✅ one appended task-log line, same commit (required by the spec) |
| No Part 2 action taken | ✅ no DELETE/MERGE/ARCHIVE/SPLIT executed; Part 2 remains an owner-gated proposal |

Pre-existing unrelated dirty state in the worktree (`app/`, `backend/`, `monitor/`
`package.json` / `package-lock.json`, plus untracked `.opencode/agents/tmp/*.md`,
`docs/.obsidian/`, `docs/examples/acacia-manifest.json`, `scripts-recon.js`) was left
**untouched and unstaged**. Only the two files named above are in this commit.

---

## 8. Verification

```
$ find . -name "*.md" -type f \
    -not -path "*/node_modules/*" -not -path "./.git/*" \
    -not -path "*/dist/*" -not -path "*/build/*" -not -path "./.opencode/*" | wc -l
89

$ git diff --stat HEAD -- $(cat mdfiles.txt)     # the 89 inventoried docs
(no output — 0 files changed)

status counts: KEEP 28 · MERGE 7 · ARCHIVE 31 · DELETE 19 · SPLIT 4  = 89
>500 lines:    5 files (4 SPLIT + 1 DELETE-generated)
domain counts: 15 domains summing to 89
```

---

*Part 1 complete. Next: `.opencode/agents/tmp/2026-10-06-p2.md` — turn these statuses into a
DELETE / MERGE / ARCHIVE / SPLIT proposal with named migrating sections, behind the owner gate.
**Delete nothing yet.***
