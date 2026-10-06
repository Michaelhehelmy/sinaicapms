---
title: "SinaiCamps Operations Runbook"
aliases:
tags:
  - type/runbook
  - audience/owner
  - domain/operations
  - status/live
created: 2026-09-28
updated: 2026-10-06
relates-to:
  - "[[docs/05-operations/README]]"
  - "[[docs/98-history/deploys/PROD-DEPLOY-CHECKLIST-2026-09-22]]"
  - "[[docs/98-history/deploys/ASTRO_DEPLOY_CUTOVER]]"
  - "[[docs/07-data/migrations]]"
  - "[[docs/98-history/sessions/G65_STAGING_VALIDATION]]"
code-references:
  - "backend/wrangler.toml"
  - "scripts/check-deploy-parity.sh"
  - "deploy.sh"
  - "wrangler.toml"
  - "app/wrangler.toml"
  - "backend/tests/pos-transactions-schema.test.js"
  - "backend/tests/pos-insert-positional.test.js"
verified: never
---
# SinaiCamps Operations Runbook

Owner-only procedures for deploy, rollback, backup, drift detection, and
incident response. Every command below names its target environment
explicitly. Production commands require owner acknowledgement.

## 1. Contacts & Ownership

| Role | Contact |
|------|---------|
| Owner (deploys, prod ack, rollback decisions) | `<owner-phone>` |
| Staging validation | owner or designated tester |

Do not invent contacts: if the owner is unreachable, stop at the
preflight gate and do not proceed to production steps.

## 2. Environments & Resource Map

| Item | Production | Staging |
|------|------------|---------|
| Frontend | https://sinaicamps.com | https://staging.sinaicamps.com |
| Admin | https://sinaicamps.com/admin | https://staging.sinaicamps.com/admin |
| POS (tenant-only; branded 404 on apex) | https://acaciacamp.com/pos | tenant staging host /pos |
| Backend API | https://sinaicamps.com/api/* | https://staging.sinaicamps.com/api/* |
| Worker name | campmaster-backend / campmaster-marketplace | campmaster-backend-staging / campmaster-marketplace-staging |
| D1 database | campmaster-db | campmaster-db-staging |
| D1 database_id | 1008d7ef-c64a-4594-a500-2e09e07e0e12 | 40f944f2-2d50-42b5-91bd-e629585c428c |
| R2 bucket | campmaster-media | campmaster-media-staging |
| KV bindings | KV_CACHE, RATE_LIMIT_KV (see §9) | KV_CACHE, RATE_LIMIT_KV (staging) |

Source of truth for ids: `backend/wrangler.toml` (`[default]` vs
`[env.staging]`). If the file and this table disagree, the file wins and
this runbook must be corrected.

## 3. Pre-flight (read-only, default)

Run before every deploy. Never deploys, never writes remotely.

```bash
./deploy.sh --preflight --staging            # local checks + parity dry-run
./scripts/deploy-preflight.sh --staging --live   # plus live staging reads
```

Gates: [1] fresh non-empty `backups/campmaster-*.sql` (<24h);
[2] parity via `scripts/check-deploy-parity.sh` (ledger head/count,
file-vs-ledger, table counts; exit 1 on mismatch); [3] wrangler.toml
database_id match for both envs + `[env.staging]` present; [4] migration
file inventory (top-level `backend/migrations/*.sql`; `legacy/` excluded).

Production live reads require explicit ack and are never the default:

```bash
./scripts/check-deploy-parity.sh --production --live --ack-prod
```

Without `--ack-prod` the script refuses (exit 2) and contacts nothing.

## 4. Deploy

```bash
./deploy.sh                # production (owner only)
./deploy.sh --staging      # staging
./deploy.sh --backend      # backend only
./deploy.sh --frontend     # frontend only
./deploy.sh --migrate      # migrations only, no deploy
./deploy.sh --no-health    # emergency: skip health checks
```

`deploy.sh` takes a D1 export automatically and aborts on empty backup or
failed Worker deploy.

### 4a. Record BOTH version IDs after every deploy

A full deploy ships **two independent Workers**, and a rollback lever only
exists for one of them. Record both ids in the same breath, or the frontend
rollback in §6 has nothing to point at.

```bash
# Backend API — this is the one ./deploy.sh --rollback can pin
npx wrangler versions list --config backend/wrangler.toml [--env staging]

# Frontend / marketplace — pin via the dashboard (see §6)
npx wrangler versions list --config app/wrangler.toml [--env staging]
```

| Worker | `wrangler.toml` | Prod | Staging |
|---|---|---|---|
| Backend API | `backend/wrangler.toml` | `campmaster-backend` | `campmaster-backend-staging` |
| Frontend / marketplace | `app/wrangler.toml` | `campmaster-marketplace` | `campmaster-marketplace-staging` |

Frontend wrinkle worth knowing: `deploy.sh` builds `app/` and deploys from the
**generated** `app/dist/server/wrangler.json` (patched in-place for staging,
see the `node -e` block in `deploy_frontend()`), not from `app/wrangler.toml`.
The worker **name** is identical either way, so `--config app/wrangler.toml`
addresses the same Worker for `versions list`.

`./deploy.sh --rollback` also prints the backend `versions list` command for
you after a successful pin. It only ever touches the backend.

## 5. Post-deploy Smoke (expect 200/400-guard, never 000/500)

```bash
curl -sS https://sinaicamps.com/ -w "\nHTTP %{http_code}\n" | tail -2
curl -sS https://sinaicamps.com/api/me -w "\nHTTP %{http_code}\n" | tail -2
curl -sS https://acaciacamp.com/ -w "\nHTTP %{http_code}\n" | tail -2
curl -sS https://acaciacamp.com/admin -w "\nHTTP %{http_code}\n" | tail -2
curl -sS https://michaelshouse.sinaicamps.com/ -w "\nHTTP %{http_code}\n" | tail -2
```

Open acaciacamp.com/admin and confirm the Settings panel loads with no
chunk 404.

## 6. Rollback (only if smoke fails)

**Backend** — scripted. Pin the Worker to the previously recorded version
(code + vars; D1 schema is forward-only and is **not** rolled back):

```bash
./deploy.sh --rollback <backend-version-id> [--staging]
```

**Frontend** — manual. Take the frontend version id you recorded in §4a and
roll back to it in the Cloudflare dashboard: `campmaster-marketplace` (or
`campmaster-marketplace-staging`) → Deployments → the version → Deploy →
100% of traffic. There is deliberately no `deploy.sh --rollback` for it: the
frontend is built and deployed from `app/dist/server/wrangler.json`, and a
scripted pin there would need the built artifact to still be on disk.

Do NOT roll back for content drift — only for 5xx/auth-down. If both halves
are bad, roll back **backend first**: the frontend calls the API over the
`API_BACKEND` service binding, so a healthy old frontend against a broken new
API still fails, while a new frontend against a pinned old API degrades
cleanly.

## 7. Backup & Restore

Manual backup (in addition to the automatic one in `deploy.sh`):

```bash
cd backend && npx wrangler d1 export campmaster-db --remote \
  --output ../backups/campmaster-manual-<date>.sql
```

For staging replace `campmaster-db` with `campmaster-db-staging` and add
`--env staging`. Verify the file is non-empty before proceeding. There is
no automated restore path: restoring means replaying SQL against a fresh
database and re-pointing `database_id`, as done in the 2026-09-27 staging
D1 reset (new database, full migration replay, config re-point, reseed).

## 8. Drift Detection

Drift class seen 2026-09-25: handler SQL references a column no migration
ever added (`pos_transactions.tip_amount` listed in the sale INSERT while
only the `orders` table had it; fixed by migration `0120` plus the
schema-parity test `backend/tests/pos-transactions-schema.test.js`).

Detection routine (staging first, prod only with ack):

1. `./scripts/check-deploy-parity.sh --staging --live` — ledger head must
   equal the local file head; ledger rows must equal the file count.
2. Any `MISMATCH` line is a stop: do not deploy until the ledger and the
   `backend/migrations/` lineage agree (`migrations list --local` and
   `--remote`, plus `PRAGMA table_info` on both sides).
3. Second drift shape: positional bind swaps that the suite cannot see
   (2026-09-27 `kitchen_status`/`tip_amount` CHECK failure — fixtures
   stubbed the column, so staging 500'd while unit tests stayed green).
   Pinned by `backend/tests/pos-insert-positional.test.js`, which parses
   the real INSERT and executes the verbatim shape against the migrated
   lineage. Any new `pos_transactions` INSERT site must extend that test.

## 9. Incident Procedures

- **API-wide 429 `Rate limit check failed`**: the KV write quota
  (1,000/day on the free plan) is the prime suspect — a KV write per
  request exhausts it. Keep `RATE_LIMIT_KV_ENABLED="false"` in
  `backend/wrangler.toml` (in-memory fallback). Set `"true"` only on a
  plan with adequate quota. Never add per-request KV writes.
- **`Your account has exceeded D1's free tier daily row read limit
  … [code: 7500]`** — the **D1** free tier, not the KV one. Every remote
  read (`d1 execute --remote`, `d1 migrations list --remote`, the census
  queries) is refused until the quota window resets; nothing is broken and
  the production Worker is unaffected (it has its own row budget). See §9a.
- **5xx on POS sale with `D1_ERROR` in tail**: capture
  `npx wrangler tail --config backend/wrangler.toml [--env staging]`,
  match the error against §8 drift shapes (missing column vs CHECK
  failure), fix forward with a migration or bind correction on staging
  first, then re-run the walkthrough gate.
- **Auth-down / login failures**: `env.JWT_SECRET` has no fallback — a
  missing secret throws immediately. Verify the secret binding before
  chasing code. NULL-tenant admin login is closed by design (only
  `super_admin` may hold a NULL tenant); unexpected 403s there mean the
  guard is working, not broken. Note this is a **different** failure from
  Cloudflare-side auth (401/9109 from wrangler) — see §9b.
- **Chunk 404 / stale service worker**: fixed by a fresh frontend deploy;
  new boot code unregisters stale workers on next visit. Verify via §5.
- **Stale staging**: staging ledger behind local file head means Phase
  code is not deployed — `./deploy.sh --staging`, then re-run the
  walkthrough. Never debug handler behavior on a stale staging.

## 9a. D1 free-tier quota exhaustion — the two limits

The account has **two independent daily free-tier ceilings**, and they fail
completely differently. Never treat one as the other.

| Limit | Free tier | Symptom when hit | Remedy |
|---|---|---|---|
| KV writes | 1,000/day | every API request answers `429 Rate limit check failed` (fail-closed) | not a wait-and-see — set `RATE_LIMIT_KV_ENABLED="false"` so the limiter never writes |
| D1 rows read | free-tier daily row-read cap | operator-side read commands refuse: `Your account has exceeded D1's free tier daily row read limit … [code: 7500]` | **wait for midnight UTC** (the window resets on the UTC day boundary) or upgrade to Workers Paid |

The D1 one is an **operator** outage only: the deployed Worker keeps serving;
what stops is *your ability to verify*. That distinction matters, because the
tempting wrong move is to start debugging production through a channel that is
already refused. Diagnose with `wrangler tail` and the deployed API instead.

Until the window resets, do the verification **locally**: replay the migration
lineage into better-sqlite3 (see the recipe in `AGENT_LOGBOOK.md`) and spend
remote reads only on the counters that actually decide the question. When you
must batch remote reads, fold every counter into **one** `SELECT` with scalar
subqueries — a `UNION ALL` census is itself capped (`too many terms in
compound SELECT`) and burns the same quota as N separate statements.

## 9b. Cloudflare auth failures — `unset` first, then expiry, then `fetch failed`

`deploy.sh` has two auth paths: `CLOUDFLARE_API_TOKEN` from `.env` (Path 1)
and the wrangler OAuth session (Path 2). Three failures dominate, in the order
you will meet them.

### 1. `You are logged in with an API Token` — wrangler refuses to log in

**wrangler refuses any OAuth login while `CLOUDFLARE_API_TOKEN` is present in
the environment.** `deploy.sh` sources `.env` with `set -a` at the top, so the
token is exported for the whole run — which is exactly why the deploy script
`unset`s it itself before its own `wrangler login` call. Any login you run by
hand must do the same, and the prefix is **required, not hygiene**:

```bash
unset CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID && cd backend && npx wrangler login
```

> The manual-fallback text `deploy.sh` prints when its own login fails omits
> the `unset` prefix, so following it verbatim reproduces this failure. Use the
> line above.

### 2. Expired OAuth session

`check_auth()` gates on the **local config file**, not on `wrangler whoami`
(whoami polls the CF API, which hangs or flakes). It reads
`$WRANGLER_OAUTH_CONFIG` (override) or `~/.config/.wrangler/config/default.toml`
and compares `expiration_time` against `date -u`:

- expired → the script tries an **interactive** `wrangler login` mid-run and,
  failing that, exits 1 with the manual fallback;
- **unparseable or missing** `expiration_time` → it proceeds optimistically and
  only warns. It never blocks a possibly-valid session;
- a *rejected* `.env` token (any non-200 from `/user/tokens/verify`) makes the
  script `unset` the token and fall back to OAuth — so a stale token in `.env`
  degrades rather than hard-failing, but it also means **the deploy silently
  runs on OAuth instead of the token you thought you were using**.

Note the OAuth *refresh* token can still authenticate a read
(`d1 migrations list --remote` may succeed) while `expiration_time` is in the
past — that mismatch is why the expiry gate exists.

### 3. `TypeError: fetch failed` — two different causes

| Cause | Signature | Fix |
|---|---|---|
| Expired/absent OAuth | appears mid-deploy at a step that suddenly wants a browser flow | Re-auth per (2) above. The deploy's own gate exists to fail fast *before* this point instead of detonating mid-export. |
| Node resolving IPv6 first | `curl -6 api.cloudflare.com` fails instantly while `curl -4` succeeds; `getent` shows only A records | `NODE_OPTIONS="--dns-result-order=ipv4first"` — `deploy.sh` already exports it (`set -eo pipefail`, right after), so this only bites a **hand-run** `npx wrangler …` |

**Retry rule.** For an interactive `wrangler login` / hand-run wrangler command
there is **no** built-in retry: wait ~60 s and retry, 2–3 times, before
concluding the network is down. Do **not** confuse this with the deploy
script's own retry helper, which is **3 attempts, 15 s apart** and covers only
the D1 export, the Worker deploy and the rollback pin — if a deploy prints
`failed after 3 attempts`, waiting longer inside the script will not help;
re-run it.

`.env` API tokens are masked in the dashboard list view — the full value is
only shown once on the token-creation success screen or via Roll → Copy.

## 10. Watch Window — 24 Hours After Prod Deploy

- 5xx rate on `/api/*` (Cloudflare analytics / tail).
- Login success (admin + POS), booking lead flow, marketplace search.
- Any recurrence of chunk 404s or service-worker intercept errors.
- KV write rate vs quota (must stay near zero with the fallback on).
- Both §4a version ids recorded and legible in `versions list` — the rollback
  lever is only real if you wrote the id down.
