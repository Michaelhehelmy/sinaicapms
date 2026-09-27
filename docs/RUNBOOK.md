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
failed Worker deploy. Record the Worker version after each deploy for
rollback use: `npx wrangler versions list --config backend/wrangler.toml`.

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

Backend: pin the Worker to the previously recorded version (code + vars;
D1 schema is forward-only and is NOT rolled back):

```bash
./deploy.sh --rollback <backend-version-id> [--staging]
```

Frontend: Cloudflare dashboard → campmaster-marketplace → rollback to the
noted version. Do NOT roll back for content drift — only for 5xx/auth-down.

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
- **5xx on POS sale with `D1_ERROR` in tail**: capture
  `npx wrangler tail --config backend/wrangler.toml [--env staging]`,
  match the error against §8 drift shapes (missing column vs CHECK
  failure), fix forward with a migration or bind correction on staging
  first, then re-run the walkthrough gate.
- **Auth-down / login failures**: `env.JWT_SECRET` has no fallback — a
  missing secret throws immediately. Verify the secret binding before
  chasing code. NULL-tenant admin login is closed by design (only
  `super_admin` may hold a NULL tenant); unexpected 403s there mean the
  guard is working, not broken.
- **Chunk 404 / stale service worker**: fixed by a fresh frontend deploy;
  new boot code unregisters stale workers on next visit. Verify via §5.
- **Stale staging**: staging ledger behind local file head means Phase
  code is not deployed — `./deploy.sh --staging`, then re-run the
  walkthrough. Never debug handler behavior on a stale staging.

## 10. Watch Window — 24 Hours After Prod Deploy

- 5xx rate on `/api/*` (Cloudflare analytics / tail).
- Login success (admin + POS), booking lead flow, marketplace search.
- Any recurrence of chunk 404s or service-worker intercept errors.
- KV write rate vs quota (must stay near zero with the fallback on).
