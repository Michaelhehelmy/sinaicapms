# Discovery audit 2026-10-14 — 00-REPORT

Branch main @ 8d6e3ba. Fresh discovery run; no prior audit used as truth (all re-reported claims re-verified; see 04-subagent-notes for what was deliberately NOT promoted).

## What I found, and did not find
Found 15 findings: the CI/deploy safety net is hollow (red-but-unblocking gate + mislabeled deploy suite), one pending migration (0127) with live code already assuming it, concrete read/write hot paths (BOM N+1, 4 sequential-insert sites, unbounded camps fallback, uncached public GETs), a 7-day refresh/logout weakness, and a cluster of public-surface fragilities (inline fetch bypass, SSR bridge globals, escHtml×4 drift, epoch uptime) plus doc/config slips. Did NOT find: no P0 (no cross-tenant leak, money loss, or prod-down proven); tenant-scoping/JWT/CORS/CSRF all fail closed; OpenAPI faithful (128==128); island/nav/hook/bundle discipline holds; no TEMP-table, GENERATED-column, or trigger-loss defects.

## Count by severity
- P1 ×5: F-01 red integration gate; F-02 deploy runs unit as "Integration" + non-blocking e2e; F-03 0127 pending with dependent code; F-04 BOM N+1; F-05 sequential multi-line inserts.
- P2 ×8: F-06 camps unbounded; F-07 uncached public GETs (+Vary); F-08 refresh/logout; F-09 inline fetch + window bridge; F-10 cashier TEXT/FK; F-11 escHtml×4; F-12 epoch uptime; F-14 0115 bare drop (P2 half).
- P3 ×3 (incl. halves): F-13 dead env knobs; F-14 ADD COLUMN rerun (P3 half); F-15 doc count slips.
Titles in 02-findings.md; evidence in 05-evidence/F-*.txt; hypotheses (12) in 03-unverified.md.

## Count by top-level directory
- backend/src: F-03–F-08, F-10–F-12, F-14 (9.5)
- app/src: F-09, F-11, F-12-consumer, F-15-partial (3)
- tests + .github/workflows: F-01, F-02 (2)
- root/docs config (.env.example, TESTING.md, AGENTS.md, API_CONTRACT.md): F-13, F-15 (2)
- backend/migrations: F-03, F-10-schema, F-14 (3, overlapping backend/src)

## Top 5 by impact
1. [F-02](02-findings.md#F-02) deploy gate tests the wrong suite + smoke can't fail — production ships past integration coverage. (P1)
2. [F-01](02-findings.md#F-01) integration CI red on main — normalizes red gates while the real path bypasses them. (P1)
3. [F-03](02-findings.md#F-03) 0127 pending-apply with dependent code live — next deploy 500s/409s meal paths until owner applies. (P1)
4. [F-08](02-findings.md#F-08) refresh without revocation + no-op logout — any refresh theft = 7-day forgery window with false-confidence logout. (P2)
5. [F-04](02-findings.md#F-04)/[F-05](02-findings.md#F-05) BOM N+1 + sequential multi-line writes — latency × atomicity on accounting/manufacturing paths. (P1)

## What I did not look at, with reason
- Live Cloudflare writes (deploy.sh, wrangler d1/kv/r2/secret): forbidden; read-only.
- Full E2E gate: wrangler dev crashes under sustained load (logbook 2026-08-30); targeted single-file run only.
- legacy/ migrations, node_modules, .wrangler, dist: excluded, not shipped.
- Monitor suite + dirty lockfile diff: carried as H-12 (out of budget).
- Fixes: forbidden this phase.

## Confidence and reason
High on the 15 filed (every one re-verified by orchestrator with quoted commands; the red gate re-executed). Medium on completeness: 12 hypotheses need runtime/owner probes (worker boot, prod distributions, full gates), and two scopes (monitor, lockfile drift) were deferred. No systemic 5× class found.

## Recommended next action: fix now
Rationale: F-02+F-01 together mean production deploys with no integration gate and a red CI nobody trusts; F-03 makes the next deploy order-sensitive. The cheapest high-leverage sequence: correct deploy.yml Integration command + make e2e-verify blocking, triage the 3 red assertions (or gate them), then owner-applies 0127 before any code depending on it ships — all before the perf/write-path work.
