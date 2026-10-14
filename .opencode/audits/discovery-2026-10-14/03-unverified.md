# Discovery audit 2026-10-14 — 03-unverified (hypotheses, NOT findings)

Promotion rule: anything here lacks at least one of LOCATION/REPRODUCTION/IMPACT/FALSIFICATION/SEVERITY.
Do not quote these as findings. Each needs the stated probe to close.

## H-01 — Hono use('/api/x/*') vs bare '/api/x' middleware semantics
- What: whether bare collection requests execute star-pattern middleware (scope/limiter mounts) in the deployed Hono version.
- Why unverified: needs a booted worker; read-only budget did not boot one. In-code comment (index.js:221-225) asserts both match; either value of the premise leaves the fail-closed analysis intact, but the premise itself is unobserved.
- Probe: boot local worker, GET bare vs star paths with/without auth, read scope/rate headers.

## H-02 — order_items tenant isolation via orders join (schema fact, reader/writer audit missing)
- What: order_items has project_id but no tenant_id (0106:49-63, 0111:117-131; `git log -S 'order_items.*tenant'` empty — schema half verified).
- Why unverified: IMPACT needs a backend+frontend reader/writer grep (every query joining — or failing to join — orders for tenant scoping). DB agent did not own those files.
- Probe: `grep -rn "order_items" backend/src app/src` + per-site join check.

## H-03 — pos_products.barcode stayed GLOBAL while sku went tenant-scoped
- What: 0126 stages `UNIQUE INDEX (tenant_id, sku)` but keeps `barcode TEXT UNIQUE` global (0126:148 vs :314 — schema half verified).
- Why unverified: needs writer audit (tenant-import/POS) for cross-tenant identical-barcode emissions to grade impact.
- Probe: grep barcode writers + attempt cross-tenant import replay in throwaway DB.

## H-04 — suite-count staleness (backend 127/2743, frontend 155/3632, E2E 919)
- What: TESTING.md:36-41 quoted totals with SHAs 9e58dae/88f307a.
- Why unverified: full gates out of scope/budget (E2E banned); zero test-file commits since 2026-10-06 lowers rot probability but does not measure. Needs owner full-gate re-run.

## H-05 — app/tests "155 files" denominator ambiguity
- What: disk = 155 under unit/ + 1 e2e + 2 mocks + setup.ts = 159 total; doc :105 says "155 files, under unit/, e2e/ and mocks/".
- Why unverified: one-word doc clarification needed (unit-only vs total), owner wording call.

## H-06 — AdminApp.tsx:170 duplicate id:'rooms' double-count risk
- What: extra `id:'rooms'` type-aware relabel makes raw `grep -c "{ id:"` = 47 vs real nav 46.
- Why unverified: needs MOBILE_NAV_IDS + E2E nav-tab-rooms selector grep to show a real double-count vs benign relabel.
- Probe: `sed -n '158,178p' AdminApp.tsx` + E2E selector grep.

## H-07 — storefrontSession.ts vs session.ts vs inline localStorage session-key duplication
- What: 14 files / 36 hits on session keys (`grep -rln` only).
- Why unverified: needs key-by-key diff to show divergent reads/writes of the same key.
- Probe: extract key constants per file, set-difference.

## H-08 — marketplace/:tenantSlug 4 sequential reads; orders/calculate-price 4 sequential lookups
- What: fixed-N serial awaits (marketplace.js:106-145; orders.js:305-323), not N+1.
- Why unverified: needs latency/request-rate evidence that Promise.all matters.
- Probe: time the handlers under representative load.

## H-09 — transformers.web script-budget breach claim
- What: budget.json script 300 KB vs emitted transformers.web 503.7 KiB min / 146.5 KiB gzip.
- Why unverified: adjudication needs `ANALYZE=1 npm run build` + lighthouse run to determine gzip-vs-min accounting. Do not claim without that run.

## H-10 — PM_*/STOREFRONT_CART_ENABLED in wrangler [vars] but absent from .env.example
- What: present in wrangler, read by paymentConfig.js:44-56 / index.js:879, absent from examples.
- Why unverified: wrangler comments say PM secrets go via `wrangler secret put` (never commit) — absence may be deliberate hygiene. Needs owner intent.

## H-11 — 8 extra RATE_LIMIT_* env dials readable but undefined in wrangler
- What: 10 envKeys in rateLimit.js vs LOGIN/API (+KV_ENABLED) in wrangler.
- Why unverified: readLimitInt falls back to hardcoded max when absent ("uses default" by design); whether the wrangler comment misleads is an ops-docs judgment call. Needs owner.

## H-12 — monitor/ red suite and package.json/lock dirty state
- What: git status shows M app/backend/monitor package.json + locks, untracked tmp agent files; recent commit 97bb5db "fixes red suite on main" for monitor.
- Why unverified: monitor suite not executed in this run; dirty lockfiles not diffed. Needs `git diff --stat` review + targeted monitor run by owner.
