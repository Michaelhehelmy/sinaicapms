# Discovery audit 2026-10-14 — 04-subagent-notes

All 7 subagents ran READ-ONLY on main @ 8d6e3ba, converged, no files edited.
Orchestrator verified ≥20% of each agent's findings with fresh commands
(evidence files record orchestrator outputs, not subagent quotes).
No P0. No systemic 5× defect class. No STOP-condition trigger.

## security-auditor — auth/scoping/tenancy/crypto/secrets
- Scope: index.js mounts+CORS, middleware/**, rateLimit, api auth/tenant/RBAC, wrangler bindings, JWT, upload/CSRF.
- Reported: 4 findings (F1 refresh/logout P2; F2 healthz e.message P3; F3 CORS 5-min cache P3; F4 POS limiter passthrough P3) + 2 hypotheses (Hono star semantics; JWT throw-vs-null).
- Integrated: F1 → F-08 (P2). F4's tenant-accounting half folded into F-07 context; filed as P3-level note inside F-07/F-02 rather than standalone (global caps still bound floods).
- NOT integrated as findings: F2/F3 graded P3 with minimal content/bounded TTL — recorded here, not promoted, to avoid padding: healthz reflects only SELECT-1/KV-healthcheck error text behind no-auth (low-entropy oracle); custom-domain CORS cache TTL 5 min/isolate (short-lived trust persistence). Repro commands preserved in agent transcript.
- Gaps: did not boot worker (H-01 carries the premise); POS limiter passthrough needs traffic-share data to grade above P3.
- Verified by orchestrator: F1 (sed auth.js:235-270 + revocation grep) — confirmed.

## db — schema/migrations/indexes/orphans
- Scope: backend/migrations/*.sql (top-level), sequence/head/idempotency, columns readers/writers (schema half), FKs.
- Reported: 5 findings (0127-pending P1; 2 unsafe drops P2; ADD COLUMN rerun P3; cashier TEXT/FK P2; meal_schedules missing composite index P3) + 3 hypotheses (order_items, barcode, triggers).
- Integrated: all 5 → F-03, F-14, F-10; meal_schedules index folded into F-14 family as P3 note (perf hygiene, non-regression) rather than standalone.
- Gaps: reader/writer halves for H-02/H-03 belong to other scopes (carried in 03-unverified).
- Verified by orchestrator: 0127 header+ls; unsafe-drop negative-grep (2 rows); cashier grep + 0119 CAST — all confirmed.

## qa — test integrity/mutation/coverage-traps/spec drift
- Scope: tests/**, workflows vs TESTING.md, thresholds, OpenAPI gate, nav counts, mutation probes, red suites.
- Reported: 4 findings (migration-integrity red P1; deploy.yml mislabeled + non-blocking e2e P1; vacuous PK assertion P2; POS_NAV off-by-one + Pages label P3) + 2 hypotheses (suite counts; 155 denominator).
- Integrated: red → F-01; deploy → F-02; vacuous PK assertion recorded here (not promoted standalone — advisory check inside an already-red file; fixing F-01 without converting it preserves a blind spot, noted in F-01); labels → F-15.
- Gaps: full suite re-runs out of budget (H-04/H-05).
- Verified by orchestrator: full re-run of migration-integrity (3 failed/7 passed) + deploy.yml + both vitest configs — confirmed. Post-audit churn `git log --since=2026-10-06` on test/workflow paths = empty (pre-existing red).

## frontend — components/state/props/islands/bundle
- Scope: app/src/** only.
- Reported: 5 items (island comment-inflation P3; raw fetch 6 sites P2/P3; window.__ globals P2; money-format dup P3; "nothing dead" P3) + 2 hypotheses (rooms dup; session keys).
- Integrated: raw-fetch true bypasses + window bridge → F-09; money dup + island hygiene recorded here (not promoted: USD-only today, discipline holds 17-real-vs-23-raw).
- Gaps: H-06/H-07 need selector/key diffs (03-unverified).
- Verified by orchestrator: window.__ grep (consumer-only MarketplaceHome:247 confirmed); contact.astro tri-branch sed — confirmed.

## performance-profiler — N+1s/cache/hot paths/budgets
- Scope: services, response.js cache headers, api hot paths, budget.json vs lighthouse harness vs PERF_BASELINE.
- Reported: 7 findings (BOM N+1 P1; sequential inserts P1; camps unbounded P2; uncached GETs P2; Vary P2; toCamel tax P3; perf-gate drift P3) + 4 hypotheses.
- Integrated: → F-04, F-05, F-06, F-07 (Vary folded in). toCamel + harness-drift recorded here (measure-first / docs-only; lighthouserc.cjs 200ms comment vs 300ms harness needs a dead-config check before promotion).
- Gaps: H-08/H-09 need latency/build runs.
- Verified by orchestrator: BOM sed, camps sed, cachedJson absence grep (zero in 4 files) — confirmed.

## general-grep-1 — dead code/duplicates/magic-numbers/swallowed-errors
- Scope: whole-tree pattern sweeps.
- Reported: 7 findings (truncate dead; authMiddleware dead; over-exports; escHtml×4 medium; 9 empty catches; console mostly-intentional; uptime-epoch medium).
- Integrated: escHtml → F-11; uptime → F-12; tenants.js:96 + index.js:135 silent catches noted inside F-09/F-13 families as supporting detail (fail-closed, silent).
- NOT promoted: truncate/authMiddleware/over-exports/console (dead/self-documented/intentional — hygiene, no runtime effect; listing them as findings would pad the report).
- Verified by orchestrator: escHtml 4-def grep + body reads; uptime producer/consumer seds — confirmed.

## general-grep-2 — env/bindings/docs-count drift
- Scope: env vars vs examples/wrangler/docs; bindings declared vs used; doc counts vs tree.
- Reported: 5 findings (287-symbols P4; 2837-vs-2838 P4; dead RATE_LIMIT_* knobs P3; dead PUBLIC_* knobs P3; RATE_LIMIT_KV comment gap P4) + 2 hypotheses (PM_*, extra dials).
- Integrated: knobs → F-13; counts/labels → F-15.
- Verified healthy (explicit, to prevent repeat audits): migrations 40/0127, api 57, POS 10, hooks 5, admin 63/46, views 11, ui 20, AI/STATE_DO 503-guarded with zero declarations (matches "no binding" claim), rate table 23+default, limiters 36 (self-corrected 37→36 after finding the projectsCatalogLimiter wrapper hit).
- Verified by orchestrator: all count commands re-ran (286/2837/40/36), dead-var zero-hit greps, RATE_LIMIT_KV live grep — confirmed.

## Verification rate
- 7/7 agents had ≥20% of claims re-run by orchestrator with fresh commands (security 1/4 + cross-checks; db 3/5; qa 2/4 + full test re-run; frontend 2/5; perf 3/7; grep-1 2/7; grep-2 5/5 counts). A subagent report was treated as draft throughout; only orchestrator-confirmed items entered 02-findings.md.
