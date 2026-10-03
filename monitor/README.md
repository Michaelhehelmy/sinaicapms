# campmaster-monitor

Standalone Cloudflare Worker that watches SinaiCamps production, collects
error/feedback reports, and serves a mobile status dashboard.

Worker name: `campmaster-monitor` · entry `src/index.js` · route
`status.sinaicamps.com` (see `wrangler.toml`).

**Storage: one Cloudflare R2 bucket, no database.** As of 2026-10-03 every
piece of state lives in objects (`MONITOR_BUCKET` = `campmaster-monitor-media`)
and the worker binds nothing else — no database binding, no `migrations/`,
no KV. `src/storage.js` owns the whole layout; nothing in `src/` builds a query.

## 1. What it does

- **Cron probe** (`scheduled` in `src/index.js`): every run probes every entry
  in `TARGETS` (`src/targets.js`) with a per-target timeout (default 10 s,
  `User-Agent: SinaiCamps-Monitor/1.0 (https://status.sinaicamps.com)`), then
  writes **one object for the whole
  run** — `checks/<YYYY-MM-DD>/<HH-MM>.json`, holding `{run_at, results[]}` for
  all five targets — and evaluates alert transitions (`evaluateAlerts`).
  Every outbound probe goes through the one `probeTarget` helper, so the cron and
  `POST /internal/check` identify themselves identically.
- **What a probe records** (`probeTarget`): redirects are **followed**
  (`redirect: 'follow'`, stated explicitly because the health rule depends on
  it), so the status judged is the one the host *finally* returned — a
  `301` that lands on `200` is **UP**. A probe that comes back with any other
  status writes a human-readable `error_message`
  (`expected HTTP 200, got HTTP 522`, plus the final URL when a chain was
  followed) **and** logs one `monitor probe failed: target=… url=… status=…
  redirected=… final_url=… error=…` line. Timeouts, DNS failures and refused
  connections behave as before: `status_code: null` with the exception text as
  the message. So `last_error` is now non-null for **every** failure mode —
  that field is what the dashboard card renders, and it used to be `null` for
  exactly the case that is hardest to explain (the host answered, wrongly).
- **Alerting**: 3 consecutive failed runs + not already alerting → `down`
  webhook; a healthy run while alerting → `recovery` webhook; otherwise
  bookkeeping only. The counter lives in `state/alert_state.json`
  (`{ <target>: { last_state, consecutive_failures, updated_at } }`), so "3 in a
  row" is one object read and one write, not a history scan. **Recovery fires on
  the first healthy run after a down** (owner's chosen rule: the retraction of a
  human-visible claim should land as soon as the claim stops being true).
- **Storage layout** (one bucket, namespaced by prefix; `src/storage.js` is the
  single source of truth for every key):
  | Key | Contents |
  | --- | --- |
  | `checks/<YYYY-MM-DD>/<HH-MM>.json` | one object per cron run, one result per target |
  | `reports/<errors\|feedback>/<date>/<HH-MM-SS>-<id>.json` | one immutable object per intake report |
  | `state/alert_state.json` | per-target alert state |
  | `state/summary.json` | rolling 24h pre-summed `{okCount, totalCount}` per target |
  | `state/history/<target>.json` | rolling per-target check ring (`/api/history`) |
  | `state/login_attempts/<ipHash>.json` | per-IP PIN brute-force counter |
  Fixed-width, zero-padded, **UTC** stamps are the whole trick: R2 lists keys in
  byte order, so "newest" = "last key in the listing", with no timestamp parsing.
- **Retention** (`runRetention` in `src/index.js`, daily at **UTC hour 0**):
  lists `checks/`, both report collections and the gate counters, and deletes
  what is over-age by the listing's own `uploaded` — probe runs after **14
  days**, intake reports after **30 days**, gate counters untouched for **1 day**.
  `state/` is otherwise never swept: the alert state, the rollup and the rings
  are rewritten in place, and an old version of them is exactly the state that
  must survive a quiet period. The 14-day floor sits well above the widest window
  the API exposes (`/api/history` rejects `hours` above 48), so retention can
  never blank a rendered chart. Each step is **best-effort** — a failing sweep
  is logged and skipped, never allowed to fail the cron that produces the alerts.
- **Public status API**: `GET /api/status` (overall ok/degraded/down +
  per-target up/last_status/last_response_ms/uptime_24h/last_error),
  `GET /api/history?target=<name>&hours=<1–48, default 24>`,
  `GET /api/reports?kind=<errors|feedback>&limit=&offset=`. All three are served
  through a **20s in-memory TTL cache** (`withPublicCache` in `src/index.js`):
  `/api/status` is one entry, the other two are keyed by every parameter that
  changes the answer. The TTL is shorter than the 5-minute cron, so the cache
  only collapses duplicate reads and can never serve data older than one probe
  cycle. It is per-isolate and **best-effort** (a cold isolate just reads the
  bucket), never KV — a write per public read would burn the free plan's 1,000
  writes/day quota. Failed reads are never cached; the next request retries.
- **Intake API**: `POST /report/error` + `POST /report/feedback` (Bearer
  `REPORT_TOKEN`, 60/min per-IP limit, 201 `{id, kind, status: "new"}`).
- **Operator**: `POST /internal/check` (session cookie from 6-digit PIN
  login OR Bearer `REPORT_TOKEN` for scripts; empty body probes all,
  `{"target": "<name>"}` probes one) and `GET /` (session cookie only —
  sign in at `GET /login` with `DASHBOARD_PIN` (6 digits, on-screen keypad); dark mobile
  dashboard with status pill, per-target cards, sparklines, last-20 checks
  and a reports panel, plus a Log out button posting to `POST /logout`).
  The dashboard's client JS polls `/api/status` + `/api/history` every **60s**
  (was 30s); "Check Now" re-runs the same refresh immediately.
  The old `?token=` bookmark is deleted — query tokens never authenticate.
- **Tests**: `tests/` (`storage`, `retention`, `alerts`, `api`, `auth`,
  `public-cache`, `check-logic`) — `cd monitor && npx vitest run`.

## 2. Owner setup (run from `monitor/`)

Secrets are set via `wrangler secret put` only — never in `wrangler.toml`
(`[vars]` is intentionally empty) and never printed.

```bash
cd monitor

# 1. Create the object bucket (already done for this worker:
#    campmaster-monitor-media). For a fresh worker:
wrangler r2 bucket create campmaster-monitor-media

# 2. Set secrets (values prompted interactively, never echoed).
wrangler secret put REPORT_TOKEN
wrangler secret put DASHBOARD_PIN
wrangler secret put ALERT_WEBHOOK_URL

# 3. Deploy. To deploy without the custom domain first, comment out the
#    [[routes]] block (pattern "status.sinaicamps.com"), deploy to
#    *.workers.dev, test, then add the domain later.
wrangler deploy

# 4. Verify.
curl https://status.sinaicamps.com/api/status
```

There is **no database step and no migration step**: nothing in this worker
reads or writes SQL, so there is no schema to create, apply or reconcile.

### OWNER ACTION 1 — the old database is now orphaned (already safe)

`campmaster-monitor-db` still exists in the account and still holds the last
rows the worker wrote there (`checks`, `reports`, `login_attempts`). Nothing
reads it any more, so it is inert data, and deleting it is **not** part of the
deploy. It can be left in place indefinitely; it costs nothing but confusion.

### OWNER ACTION 2 — delete it only AFTER a verified deploy

Deleting a Cloudflare resource is irreversible and is the owner's call, never an
agent's. Do it in this order, and only after step 3 has actually succeeded:

```bash
cd monitor

# 1. Deploy the database-free worker.
wrangler deploy

# 2. Verify BOTH halves of the migration — the read side and the write side:
#      - the dashboard answers and shows a fresh timestamp  → GET /
#      - a probe run is still being stored and alerted on     → the cron at
#        status.sinaicamps.com writes a new checks/<date>/<HH-MM>.json and the
#        next run's dashboard is green (watch two consecutive 5-minute ticks)
curl -s https://status.sinaicamps.com/api/status | head -c 400
curl -s 'https://status.sinaicamps.com/api/history?target=marketplace&hours=2' | head -c 400
#      - and the login gate still works: 5 wrong PINs from your IP, then 429
#        (`{"error":"rate limit exceeded"}`), and a correct PIN afterwards

# 3. Only then delete the orphaned database.
wrangler d1 delete campmaster-monitor-db
```

If step 2 does not pass, **stop** and keep the database — it is the only place
the pre-2026-10-03 history still exists, so deleting it before the new path is
proven loses that history for good.

## 3. First login

1. Deploy with both secrets set (section 2).
2. Visit `https://status.sinaicamps.com/login` in a browser.
3. Enter the 6-digit dashboard PIN once — the server sets a signed
   `monitor_session` cookie (`HttpOnly; Secure; SameSite=Strict; Path=/;
   Max-Age=43200`, 12 hours (or `Max-Age=7776000`, 90 days when Trust this device is checked), well under 4KB) and redirects to `/`.
4. Unauthenticated `GET /` redirects to `/login` (302). The old
   `?token=` bookmark no longer works by design.
5. Log out with the dashboard "Log out" button (`POST /logout` clears
   the cookie with `Max-Age=0`).
6. Missing/invalid `DASHBOARD_PIN` renders a "dashboard PIN not
   configured" page (set it via `wrangler secret put DASHBOARD_PIN`, exactly 6 digits).

`POST /login` is rate-limited (5 failed PIN attempts per 5 minutes per IP,
429 `rate limit exceeded`) and requires a CSRF header (`Origin` or `Referer`,
else 400).

The gate is one object per IP: `state/login_attempts/<ipHash>.json`, holding the
failure timestamps still inside the 5-minute **sliding** window plus
`window_start`, `locked_until`, `last_success_at` and `updated_at`. `ipHash` is
an HMAC-SHA256 of the address keyed by `DASHBOARD_PIN`, so the bucket never
stores a raw IP and the mapping is unknown to anybody without the PIN; the
filename is all that identifies the client. Consequences worth knowing:

- A successful login does **not** refund the budget (it never did) — it only
  records `last_success_at`.
- Rotating `DASHBOARD_PIN` resets every counter, exactly as it invalidates every
  session cookie.
- Nothing reads a counter past its 5-minute window, so the daily sweep deletes
  counters untouched for a day (`runRetention`, `LOGIN_ATTEMPTS_RETENTION_DAYS`)
  and the bucket holds at most one small document per IP that logged in recently.
- `cf-connecting-ip` only, never a spoofable `x-forwarded-for`; no KV writes, so
  the gate never touches the free plan's 1,000/day quota.

## 4. Rotate the dashboard PIN

1. `wrangler secret put DASHBOARD_PIN` (new value prompted, never echoed).
2. Redeploy (`wrangler deploy` from `monitor/`).
3. All existing session cookies invalidate immediately (sessions are
   HMAC-signed with the PIN itself), so every operator signs in again.

## 5. REPORT_TOKEN for scripts (no browser login)

`POST /internal/check` accepts the session cookie OR
`Authorization: Bearer REPORT_TOKEN` — scripts use the Bearer path with
no cookie or CSRF header:

```bash
curl -X POST https://status.sinaicamps.com/internal/check \
  -H "Authorization: Bearer $REPORT_TOKEN" \
  -H 'Content-Type: application/json' -d '{}'
```

`REPORT_TOKEN` is also the Bearer for `POST /report/error` and
`POST /report/feedback`. It is set via `wrangler secret put REPORT_TOKEN`
only — never in `wrangler.toml`, never printed, never committed.

## 6. How to add a target

Targets live in code, not in storage — there is no schema and no migration, so
adding a target is a one-line edit plus a deploy.

1. Edit the `TARGETS` array in `src/targets.js`:
   `{ name: '<id>', url: 'https://…', expect: 200, timeoutMs: 10000 }`.
   `expect` is the healthy status: a single number, an array of numbers,
   or `401` for endpoints that require auth (a 200 there would mean auth
   was bypassed). Redirects are followed, so a redirect that lands on
   `expect` is healthy.
2. Run `cd monitor && npx vitest run` (tests pin probe/alert behavior **and**
   the target list itself — adding an entry is a deliberate act and the suite
   fails until the list assertion is updated).
3. Run `wrangler deploy` from `monitor/`.

Alert state for the new target is created automatically on the first cron
evaluation (`state/alert_state.json` gains the entry, `state/history/<name>.json`
and the `state/summary.json` rollup follow), and the first full run drops the
entry again if the target is removed from `TARGETS`.

**Do not add a target pointing at `status.sinaicamps.com` — or at any host this
worker already serves.** That is not a policy about *this* dashboard's old
`self-check` entry; it is about the request. A Worker fetching a Worker through
the same Cloudflare zone is not the request a browser makes, and the edge
answers it with **522**. The worker-to-worker hop therefore reports a false
outage for a healthy site, three times in a row, in a row that names itself —
which is the one failure mode a status board cannot have. If you want to know
whether the panel is reachable, watch it from **outside** this zone (an external
uptime checker, or a browser); that is the request the "is it up?" question is
about. The full argument is in the comment in `src/targets.js`.

## 7. Cron interval

`[triggers] crons = [ "*/5 * * * *" ]` in `wrangler.toml` — the `scheduled`
handler (`runProbeCycle` → `evaluateAlerts` → `updateSummary` →
`updateHistoryRing` → `runRetention`) runs **every 5 minutes**. The sweep itself
only does work during UTC hour 0 (12 of the 288 daily ticks); the other 276 are
a no-op that lists nothing.
Change the expression and redeploy to adjust.

## 8. Telegram / Slack alerts

Set the webhook destination via secret (never in `wrangler.toml`):

```bash
cd monitor
wrangler secret put ALERT_WEBHOOK_URL
```

- `ALERT_WEBHOOK_URL` is primary; `TELEGRAM_WEBHOOK_URL` is accepted as an
  alias (Telegram proxy URL or bot API endpoint) — see `getWebhookUrl` in
  `src/index.js`.
- Payload posted is JSON
  `{event, target, url, text, status_code, error_message, checked_at}`
  with `event` = `"down"` or `"recovery"` (see `sendAlert`).
- Point it at a Slack incoming webhook URL for Slack, or a Telegram bot
  API / proxy URL for Telegram.
- Missing/empty means alerts are state-tracked but never sent (silent
  skip — the cron run never crashes for lack of webhook config). A dead
  webhook endpoint likewise cannot fail the run (`sendAlert` never throws).

## 9. Troubleshooting

- `wrangler deploy` fails on the route: comment out the `[[routes]]`
  block (`pattern = "status.sinaicamps.com"`) and deploy to
  `*.workers.dev` first, then add the custom domain later.
- `database_id` placeholder: gone with the binding — `wrangler.toml` no longer
  has a database block to fill in. If a deploy complains about a missing
  database id, you are deploying an old copy of `wrangler.toml`.
- Dashboard redirects to `/login`: `GET /` needs the `monitor_session`
  cookie from `POST /login` (`DASHBOARD_PIN`, constant-time compare;
  missing/invalid/expired → 302 to `/login` by design). The old
  `?token=` bookmark never authenticates.
- `/login` returns 500 "dashboard PIN not configured": set it via
  `wrangler secret put DASHBOARD_PIN` (exactly 6 digits) from `monitor/`, then redeploy.
- `/login` returns 429: the 5-fails-per-5-minutes-per-IP gate fired, i.e. five
  failures are still inside the sliding window in that IP's
  `state/login_attempts/<ipHash>.json` (`cf-connecting-ip` only; no KV writes,
  so it never touches the free-plan 1,000/day quota). It reopens on its own as
  those timestamps age out — a locked IP is retried, not blocked forever — and
  `POST /login` with no `pin` in the body records nothing at all.
- `/login` or `/logout` return 400 `csrf required`: send `Origin` (or
  `Referer`) — browsers do this automatically on same-origin POSTs.
- `/report/*` return 401: they take `REPORT_TOKEN` (Bearer only, no
  `?token=`); check `wrangler secret put REPORT_TOKEN`.
- `/internal/check` returns 401: it takes the session cookie OR Bearer
  `REPORT_TOKEN` (scripts); check one of the two is valid.
- `/report/*` returns 429: the in-memory 60/min per-IP limiter fired
  (per-isolate Map on `cf-connecting-ip` only — same trade-off as the main
  backend's `RATE_LIMIT_KV_ENABLED="false"` fallback; no KV writes, so it
  never touches the free-plan 1,000/day quota).
- `/api/history` returns 400: `target` query param is required and must
  match a `TARGETS` name (the body lists `valid_targets`); `hours` above 48 is
  REJECTED, never clamped, because the answer would otherwise be a shorter series
  than the caller asked for with nothing saying so.
- No alerts arriving but status shows down: webhook secret missing
  (silent skip by design) or the 3-consecutive-failure threshold not yet
  reached — check `consecutive_failures` in `state/alert_state.json`.
- A target is red with no explanation: it cannot be, any more. Every failure
  mode writes `error_message` (a status mismatch says what was expected and
  what came back, plus the final URL if a redirect was followed; a timeout or
  DNS failure says that), and that string is `last_error` on `/api/status` and
  in the down webhook. If `last_error` is empty the run predates 2026-10-03 —
  check the `checked_at` of the run object in `checks/<date>/<HH-MM>.json`.
- Probes are identifiable in host logs as
  `SinaiCamps-Monitor/1.0 (https://status.sinaicamps.com)`; a `3xx` on a target
  pinned to `200` means the redirect chain ended before the expected status
  (e.g. a loop), not that the redirect was refused — redirects are followed.
- Never commit secrets, `.env` files, or token values; never add KV
  writes (free-plan quota).
