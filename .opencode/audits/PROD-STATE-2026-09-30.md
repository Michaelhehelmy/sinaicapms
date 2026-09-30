# PROD-STATE verification — 2026-09-30 (read-only + report commit)

- task: prod-state-verify · scope: read-only diagnosis, NO FIXES
- HEAD at probe time: `1b88fef243c7d69aa23714ab6364db4074b2b981` (`test(staging): folio cross-project attribution — PASS`, 2026-09-30 10:19:22 +0300)
- All wrangler calls run with `CLOUDFLARE_API_TOKEN` unset (OAuth path). Prod D1 touched once: `SELECT 1` only.
- Working tree had pre-existing unstaged/untracked changes (see §7) — report commit stages ONLY the two report files.

## §1 — Part 1: versions / deployments / API reachability — VERDICT: DEPLOYED

API reachability (public, unauthenticated):

```
GET /api/tenants -> 200
GET /api/me      -> 200
GET /            -> 200
GET /api/tenants body[0:500]: [{"id":"acaciacamp","name":"Acacia Camp", ... "heroImageUrl":"https://i.postimg.cc/WpBZdd8J/IMG- ...}]
```

`wrangler versions list` (raw, full — 10 versions):

```
Version ID:  2002e860-699d-411b-afaf-06b5000df32e   Created: 2026-09-23T11:33:38.696Z   Author: (empty)                        Source: Unknown (version_upload)
Version ID:  a5e69fc4-61d9-4985-9ffe-69c65977a11f   Created: 2026-09-28T09:42:12.065Z   Author: michael.he.helmy@gmail.com    Source: Secret Change
Version ID:  5f9935b4-5334-476e-83cf-ad0526c06d0d   Created: 2026-09-28T22:54:29.332Z   Author: michael.he.helmy@gmail.com    Source: Secret Change
Version ID:  47bd1221-eecc-4134-8674-d192a9a874b6   Created: 2026-09-29T04:37:28.753Z   Author: michael.he.helmy@gmail.com    Source: Secret Change
Version ID:  cdc3c5d8-85b2-42bc-ad8e-6bbbfa8c8860   Created: 2026-09-29T11:50:41.610Z   Author: michael.he.helmy@gmail.com    Source: Unknown (version_upload)
Version ID:  85dc057a-5a8c-4523-8a01-61af3c65f7f3   Created: 2026-09-30T07:59:15.779Z   Author: michael.he.helmy@gmail.com    Source: Unknown (version_upload)
Version ID:  acee6756-8d33-4d9d-896d-91fb7664b538   Created: 2026-09-30T08:03:03.635Z   Author: michael.he.helmy@gmail.com    Source: Unknown (version_upload)
Version ID:  64c791d4-5516-4eef-aa79-fc496e9cac51   Created: 2026-09-30T08:36:29.347Z   Author: michael.he.helmy@gmail.com    Source: Unknown (version_upload)
Version ID:  d67243c3-7a4d-40e6-b0d8-9903f0a58663   Created: 2026-09-30T08:40:19.494Z   Author: michael.he.helmy@gmail.com    Source: Unknown (version_upload)
Version ID:  dd02e31f-ecf4-4837-964a-e4a3d821c441   Created: 2026-09-30T08:52:32.555Z   Author: michael.he.helmy@gmail.com    Source: Unknown (version_upload)
```

`wrangler deployments status` (raw):

```
Created:     2026-09-30T08:52:34.481Z
Author:      michael.he.helmy@gmail.com
Source:      Unknown (deployment)
Message:     -
Version(s):  (100%) dd02e31f-ecf4-4837-964a-e4a3d821c441 (Created 2026-09-30T08:52:32.555Z, Tag -, Message -)
```

`wrangler deployments list` confirms the same chain (09-23 → 09-28 ×2 secret → 09-29 secret → 09-29 deploy → 09-30 ×5 deploys ending `dd02e31f` at 100%).

`wrangler versions view dd02e31f-…` (raw; first attempt flaked `fetch failed`, retry succeeded):

```
Version ID:  dd02e31f-ecf4-4837-964a-e4a3d821c441
Created:     2026-09-30T08:52:32.555Z
Author:      michael.he.helmy@gmail.com
Source:      Unknown (version_upload)
Handlers:             fetch
Compatibility Date:   2025-07-01
Compatibility Flags:  nodejs_compat
Secrets: JWT_SECRET
Bindings: env.BROADCASTER (Durable Object) · env.KV_CACHE (2fde…) · env.RATE_LIMIT_KV (a805…) ·
          env.DB (1008d7ef-c64a-4594-a500-2e09e07e0e12) · env.MEDIA_BUCKET (campmaster-media)
Vars: ENVIRONMENT=production · PM_BASE_URL=https://accept.paymob.com · PM_CURRENCY=EGP ·
      PM_ENABLED=false · PM_PUBLIC_KEY=(empty) · RATE_LIMIT_API=100 ·
      RATE_LIMIT_KV_ENABLED=false · RATE_LIMIT_LOGIN=20
```

Reading: backend Worker is live on the newest version at 100% traffic (5 code deploys today 07:59–08:52 UTC, all `version_upload` = `wrangler deploy` from a checkout). The 09-28/29 `Secret Change` versions are secret-rotation restarts, not code pushes. Public API returns 200s. → **DEPLOYED** (not STALE, not UNKNOWN).

## §2 — Part 2: prod folio curls + 4 sites + admin grep — VERDICT: FOLIO-LIVE

Folio 401-vs-404 probes, unauthenticated (`401 Captured error Missing/invalid Authorization header` = route EXISTS behind auth; `404` = route MISSING):

```
/api/folios               -> HTTP 401 | {"success":false,"error":"Missing or invalid Authorization header"}
/api/folios/test123       -> HTTP 401 | {"success":false,"error":"Missing or invalid Authorization header"}
/api/folios/test123/charges -> HTTP 401 | {"success":false,"error":"Missing or invalid Authorization header"}
/api/folios/test123/settle  -> HTTP 401 | {"success":false,"error":"Missing or invalid Authorization header"}
/api/folios/test123/void    -> HTTP 401 | {"success":false,"error":"Missing or invalid Authorization header"}
POST /api/folios/x/settle ({} body) -> HTTP 401 | {"success":false,"error":"Missing or invalid Authorization header"}
POST /api/folios/x/charges ({} body) -> HTTP 401 | {"success":false,"error":"Missing or invalid Authorization header"}
```

All seven folio surfaces return 401 → every route (list, detail, charges, settle, void) is mounted on prod. → **FOLIO-LIVE** (not FOLIO-MISSING).

4 sites (all `-L`, all 200):

```
https://sinaicamps.com/          -> 200
https://staging.sinaicamps.com/  -> 200
https://acaciacamp.com/          -> 200
https://sinaicamps.com/camps     -> 200
GET /admin (-L)                  -> 200
```

Admin/frontend folio wiring (grep `folio` in `app/src`, 100+ hits — load-bearing sites):

- `app/src/lib/api.ts:550-601` — `listFolios / getFolio / openFolio / postFolioCharge / voidFolioCharge / settleFolio / voidFolio` against `/folios…`
- `app/src/hooks/useQueryHooks.ts:72-73,786-895` — `queryKeys.folios/folio`, list + detail + 4 mutations with `['admin','folios']` invalidation
- `app/src/components/admin/FolioReceipt.tsx` — receipt modal (`#folio-receipt-content`, print CSS, `folio-receipt-{total,paid,balance}` testids)
- `app/src/components/pos/views/CartPanel.tsx:48-177,360-394` — B.6 charge-to-folio toggle + open-folio picker (`folio-section`, `folio-toggle`, `folio-picker`), posts `paymentMethod:'folio' + folioId`
- `app/src/lib/api-types.ts:10185-10189` — `paymentMethod: cash|card|split|folio`, `folioId?`

Backend mount confirmed in source: `backend/src/index.js:73,723-731` (`import foliosRoutes`, `app.route('/api/folios', foliosRoutes)` + scope/limiter), full lifecycle in `backend/src/api/folios.js` (POST / · GET / · GET /:id · POST /:id/charges · DELETE /:id/charges/:chargeId · POST /:id/settle · POST /:id/void + `all('*')` 404).

## §3 — Part 3: conditional source/version forensics — SKIPPED (no 404s)

Entry condition was "only if 404s". Part 2 returned zero 404s (7/7 folio routes 401 = live), so no forensics were required. Context only (read-only, no conclusions drawn against prod):

```
git log --oneline -15: 1b88fef test(staging): folio cross-project attribution — PASS
  cce74f8 docs(audit): FINAL-CLOSURE-100 · 0484e7c test(staging): folio cross-tenant probe — PASS
  c32d822 test: full suite after folio · 92ad650 test(staging): guest folio walkthrough — PASS
  ff68a91 feat(reports): folio attribution — no double count · deaf23e feat(pos): charge to folio
  25a9023 feat(admin): guest folio panel + receipt · 4234361 feat(folio): auto-post from check-in and POS
  19417ac feat(folio): lifecycle endpoints · 4296992 feat(folio): schema + migration 0124 ...
```

Note: Worker Versions carry no git SHA (`Tag: -`, `Message: -`, `Source: version_upload`), so a byte-level HEAD↔prod equivalence cannot be asserted from metadata alone — the 401 liveness + 5 same-day deploys are the positive signal, not a hash match. No defect asserted.

## §4 — Part 4: whoami + metadata — VERDICT: pipeline identity healthy

`wrangler whoami` (raw):

```
You are logged in with an OAuth Token, associated with the email michael.he.helmy@gmail.com.
Credentials: /home/michael/.config/.wrangler/config/default.toml
Account: Michael.he.helmy@gmail.com's Account (160e5baf51934e3af06e3028a83de5b8)
Token Permissions: user(read) · offline_access · account(read) · workers(write) ·
  workers_kv(write) · workers_routes(write) · workers_scripts(write) ·
  workers_observability(read) · d1(write) · pages(write) · ... (truncated, all expected scopes)
```

`wrangler d1 list` (raw): `campmaster-db (1008d7ef-…)` created 2026-07-08 (prod, matches `wrangler.toml`), `campmaster-db-staging (40f944f2-…)`, `campmaster-monitor-db (81de335f-…)`, `campops-db (f2b526b8-…)`.

Prod D1 liveness (sole prod write-surface touch — `SELECT 1`):

```
wrangler d1 execute campmaster-db --remote --command "SELECT 1;"
→ success: true, served_by: v3-prod, region EEUR, colo MXP, result [{"1": 1}]
```

Metadata explanation: `Secret Change` versions (09-28 ×2, 09-29 ×1) are secret-rotation restarts that keep the prior code bundle — they explain the version-list gaps without a deploy. `version_upload` = `wrangler deploy` code push. `d1 migrations list campmaster-db --remote` → `✅ No migrations to apply!` (first attempt flaked `fetch failed`; retry clean) — schema ledger is in sync, no pending migration is holding the pipeline.

## §5 — Part 5: deploy.sh flow + A/B recommendation

`deploy.sh` flow (read from source, not executed): `check_network` → `resolve_urls` → `check_auth` (Path 1: `CLOUDFLARE_API_TOKEN` verify; Path 2: wrangler OAuth session with fast local expiry gate; else interactive `wrangler login`) → `deploy_backend` (npm install → `d1 export` backup with 3× retry, abort on empty → `d1 migrations apply --remote` → `wrangler deploy --minify` with 3× retry → prints rollback-pin reminder) → `deploy_frontend` (npm install → `npm run build` → staging wrangler.json patch → `wrangler deploy`) → `health_check` (backend: `/api/tenants`, `/api/me`, `/api/meals`, login-empty-4xx; frontend: `/`, `/admin`, `/pos`, acaciacamp non-critical). Flags: `--backend/--frontend/--migrate/--staging/--no-health/--preflight/--rollback <version-id>` (Wave 1.3 rollback = pin 100% traffic to an immutable Version; D1 forward-only, untouched).

Pipeline failure modes observed TODAY (read-only evidence, no fix): (a) `versions view` + `d1 migrations list` each flaked once with `fetch failed` (sandbox IPv6/network flake; `deploy.sh` forces `ipv4first` and 3× retry for exactly this) then succeeded on retry — transient, not a pipeline break; (b) nothing in the version/deployment ledger indicates a failed or partial deploy (every `version_upload` has a matching 100% deployment, newest = serving).

A/B recommendation:

- Option A — full `./deploy.sh` (backend + frontend + migrations + health): NOT indicated — prod serves the newest bundle, migrations ledger clean, health endpoints 200.
- Option B — `--rollback <version-id>`: NOT indicated — no regression signal; folio routes live; pinning back would REMOVE today's folio code.

Recommendation is B-over-A only in the sense of "neither; hold": **no deploy, no rollback** (see NEXT-ACTION).

## §6 — Verdicts + NEXT-ACTION + Defects

- Backend deploy state: **DEPLOYED** (serving `dd02e31f` @ 100% since 2026-09-30T08:52:34Z; public API 200s; migrations in sync).
- Folio presence on prod: **FOLIO-LIVE** (7/7 route probes 401-behind-auth; admin + POS + API client wired).
- NEXT-ACTION (one of DEPLOY | ROLLBACK | INVESTIGATE | NO-ACTION): **NO-ACTION** — prod is current and healthy; next deploy rides the normal pipeline whenever the next feature lands.
- Defects: **none confirmed** — no Defect section required (transient `fetch failed` flakes retried clean; version/SHA non-linkability is a metadata limitation, not a defect).

## §7 — Appendix: session raw outputs + repo state

HEAD: `1b88fef243c7d69aa23714ab6364db4074b2b981` · remote `https://github.com/Michaelhehelmy/sinaicapms.git` (fetch+push) · branch `main...origin/main`.

Pre-existing working-tree state (NOT staged or committed by this task):

```
M app/package-lock.json · M app/package.json · M backend/package-lock.json
M backend/package.json · M monitor/package.json
?? .opencode/agents/tmp/2026-09-30-prodstate.md
?? .opencode/audits/wave-6-staging-whoami-live.txt · ?? .opencode/summaries/
?? docs/examples/acacia-manifest.json · ?? monitor/package-lock.json · ?? scripts-recon.js
```

This commit stages ONLY: `.opencode/audits/PROD-STATE-2026-09-30.md` + `AGENT_LOGBOOK.md` fold entry.
