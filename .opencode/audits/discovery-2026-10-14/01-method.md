# Discovery audit 2026-10-14 — 01-method (contract, written first)

Date: 2026-10-14. Repo: /home/michael/devin/opencode-workspace/sinaicamps, branch main @ 8d6e3ba (dirty: package.json/lock churn + untracked tmp agent files).
Fresh discovery run: no prior audit finding is ground truth; every re-reported claim gets a fresh reproduction.

## What I will look at (and why)
1. Docs-vs-code drift: `docs/01-architecture/ARCHITECTURE.md`, `docs/02-api/*`, `docs/03-frontend/*`, `docs/04-testing/TESTING.md`, `docs/05-operations/*`, `docs/06-security/*`, `docs/07-data/*`, `docs/08-guides/*`, root `AGENTS.md`/`README.md` vs measured tree. Reason: 2026-10-06 batches fixed counts once; counts rot fastest.
2. Backend truth: `backend/src/index.js` mounts, `backend/src/routes/registry.js` vs `backend/openapi.json` vs `app/src/lib/api.ts` exports, `backend/wrangler.toml` bindings/vars, `backend/src/api/*` auth/tenant scoping, rate-limit coverage. Reason: contract layer is the blast radius.
3. Data truth: `backend/migrations/*.sql` (head, sequence, idempotency, unsafe drops), live schema vs queries (`tenant_id`/`project_id`/generated columns), indexes/FKs. Reason: migration head was 4-valued on 2026-10-06. For any "migration pending" finding, list the FULL applied-gap with `npx wrangler d1 migrations list campmaster-db --remote` (read-only) — never a head-only `ls | tail -1`, which structurally misses interior unapplied files (see amendment 2026-10-14 at foot).
4. Frontend truth: island directives, `AdminApp`/`POSApp` nav tab IDs, hooks export list, raw-fetch/sovereign globals, dead components/props. Reason: catalog undercounted 25-vs-63 before.
5. Test integrity: what CI actually runs (`.github/workflows/*.yml`) vs what docs claim, mutation-spot-checks on suspicious green assertions, red suites. Reason: CI runs 10 @smoke E2E, not the suite.
6. Cross-cutting greps: dead exports/imports, `TODO/FIXME/HACK/XXX/DEPRECATED`, env-var refs without setters, `console.log`/`TODO` in prod paths, duplicated helpers, silent catch blocks.
7. Memory/logbook candidates: `AGENT_LOGBOOK.md` persistent learnings + `memory` graph `open/deferred/known/TODO/Blocked` items + `docs/99-gaps/*` open rows — each re-verified, never trusted.

## What I will NOT look at (and why)
- Live Cloudflare writes: `deploy.sh`, `wrangler d1/kv/r2/secret` writes forbidden by authorization. Read-only.
- Full E2E gate re-run: `wrangler dev` crashes under sustained load (logbook 2026-08-30); targeted specs only on demand.
- `legacy/` migrations archaeology and `node_modules/`, `.wrangler/`, `dist/`: excluded, not shipped.
- Fixing anything: forbidden; report only.

## Evidence rule (non-negotiable)
LOCATION + REPRODUCTION + IMPACT + FALSIFICATION + SEVERITY (P0/P1/P2/P3) or the item goes in 03-unverified.md. Verifier must be able to rerun the quoted command and see the claim.

## Subagent plan (orthogonal scopes, no shared files)
- security-auditor: auth/RBAC/tenant scoping/rate-limit/CORS/JWT/secret handling in `backend/src/**`.
- db: `backend/migrations/*.sql` + schema-vs-query lineage.
- qa: test integrity — CI workflows vs docs, mutation probes, red suites.
- frontend: `app/src/**` islands/nav/hooks/dead code.
- performance-profiler: N+1, batch usage, cache headers, bundle budgets.
- general-grep-1: dead exports/imports/duplicated helpers across tree.
- general-grep-2: env vars/bindings/docs-count drift sweeps.
Each gets scope + done-condition + evidence rule. I verify >=20% of each report myself. Budget 20 min each; kill non-converging agents. Overlap arbitrated by me; agents report to me only.

## Git/memory method
- `git log -S '<symbol>' -- <path>` before calling anything deleted/never-existed.
- `git blame` on suspicious lines; `git log --since=2026-10-06` on prior-audit folders for post-audit risk.
- `git bisect` only for specific behavioral questions.
- Memory graph + logbook items treated as candidates, re-verified.

## Outputs
`00-REPORT.md`, `01-method.md` (this file), `02-findings.md`, `03-unverified.md`, `04-subagent-notes.md`, `05-evidence/*`. Gaps updates to `docs/99-gaps/code-vs-code.md` / `code-vs-docs.md` for code-safety or previously-logged doc gaps only. Commit per file, push after each, report SHAs.

## Amendment 2026-10-14 — migration gap check must list all pending, not just head

The P1-3 finding in this run named only `0127` as unapplied on prod. Reality: both `0126` and
`0127` were pending — the audit missed `0126` because it checked the head (`ls … | tail -1` plus
the 0127 PENDING-APPLY header), not the full gap. Applied-state lives remote-side; nothing in the
tree can show an interior unapplied file.

Rule for future runs: for any "migration pending" finding, run (read-only — list, never apply):

    cd backend
    npx wrangler d1 migrations list campmaster-db --remote

That command lists ALL unapplied migrations. Use it, not a head-only check. (Re-verified
2026-10-14: remote now reports "No migrations to apply!" — the owner has since applied both.)
