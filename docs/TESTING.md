# SinaiCamps — Testing

## Suites and counts (verified)

| Suite | Command | Count |
| --- | --- | --- |
| Backend unit | `cd backend && npx vitest run` | **1082 tests / 36 files** |
| Frontend unit | `cd app && npx vitest run` | **1465 tests / 74 files** |
| Root integration | `npx vitest run` | **169 tests / 10 files** |
| E2E | `CI=true npx playwright test` | **566 total / 552 gate passed, 14 env-skipped** |

## E2E specifics

Playwright config lives in `playwright.config.ts` (repo root). The E2E suite **boots both servers** (backend + frontend) itself in CI mode.

```bash
CI=true npx playwright test          # full gate
npx playwright test --project=auth   # auth project only
npx playwright show-report tests/e2e/results/html
```

### Port hygiene before a full E2E run

If ports are already taken, the suite will fail before any test runs:

```bash
ss -tlnp | grep -E '4320|8787'
#  4320 = frontend (Astro dev/preview)
#  8787 = backend (wrangler dev)
```

Free the ports (or let the config pick alternates) before running.

### Environment-skipped tests (14)

A subset of specs only run against a live staging/prod environment (e.g. production-specific flows). In CI mode they are skipped — the gate is the 552 that run locally.

### Tenant page `load` hang

Tenant E2E pages can hang on `load` in `astro dev` because logo/favicon point at a dead `localhost:8001`. Specs use `page.goto(url, { waitUntil: 'domcontentloaded' })` — keep this convention in new specs.

### Ground truth

`test-results/.last-run.json` records the previous run's results. If `tests/e2e/results/*` disagree with `AGENT_LOGBOOK.md`, the `.last-run.json` and the full log are authoritative.

## Writing tests

- **Unit**: Vitest. Backend tests live in `backend/` (36 files); frontend in `app/` (74 files, colocated or under `app/src/**/__tests__`).
- **Integration**: `tests/` root, run via `vitest.integration.config.ts` (`npm run test:integration`).
- **E2E**: Playwright specs in `tests/e2e/specs/` with shared pages/fixtures in `tests/e2e/pages/` and `tests/e2e/fixtures/`.
- Reusable processes: use the `fix-failing-test` skill (`.opencode/skills/testing/fix-failing-test/SKILL.md`) to debug failures and `new-e2e-test` (`.opencode/skills/testing/new-e2e-test/SKILL.md`) to add specs.

## CI checks before shipping

1. `cd backend && npx vitest run` — green.
2. `cd app && npx vitest run` — green.
3. `npx vitest run` (root integration) — green.
4. `cd app && npm run build` — green.
5. `CI=true npx playwright test` — 552 passed / 0 failed (14 skipped) unless environment specs apply.
