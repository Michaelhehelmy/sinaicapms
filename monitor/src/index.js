import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { TARGETS, matchesExpect } from './targets.js';
import {
  CHECKS_PREFIX,
  REPORT_KINDS,
  CHECKS_RETENTION_DAYS,
  REPORTS_RETENTION_DAYS,
  LOGIN_ATTEMPTS_RETENTION_DAYS,
  checksKey,
  reportKey,
  secondsStamp,
  reportsPrefix,
  alertStateKey,
  summaryKey,
  historyKey,
  loginAttemptsKey,
  loginAttemptsPrefix,
  ipHash,
  datePrefix,
  dateStamp,
  isOlderThan,
  readJson,
  writeJson,
  listAll,
  listPage,
  deleteKeys,
} from './storage.js';
import {
  SESSION_COOKIE,
  SESSION_DEFAULT_MAX_AGE,
  SESSION_TRUSTED_MAX_AGE,
  parseCookie,
  signSession,
  verifySession,
  buildSessionCookie,
  clearSessionCookie,
} from './auth.js';

const app = new Hono();

// /api/status and /api/history are intentionally public (hostnames and
// response times are not sensitive), so cross-origin reads are allowed.
app.use(
  '/api/*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
);

// Probe one target with a hard timeout. Never throws — network failures,
// timeouts, and non-2xx handling all fold into the returned row.
export async function probeTarget(target, fetchFn = fetch) {
  const timeoutMs = target.timeoutMs ?? 10000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetchFn(target.url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'campmaster-monitor/1.0' },
    });
    const responseMs = Date.now() - started;
    const statusCode = res.status;
    return {
      statusCode,
      ok: matchesExpect(statusCode, target.expect) ? 1 : 0,
      responseMs,
      errorMessage: null,
    };
  } catch (err) {
    return {
      statusCode: null,
      ok: 0,
      responseMs: Date.now() - started,
      errorMessage: String(err?.message || err).slice(0, 500),
    };
  } finally {
    clearTimeout(timer);
  }
}

// Serialize one probe result into its STORED form.
//
// Snake_case on purpose: it is the column naming the old row-per-target probe
// store used, so the R2 read path is a mechanical port and the `/api/status` +
// `/api/history` wire shape (which was built from those rows) does not change
// underneath the dashboard. `ok` stays 1/0, not a boolean, for the same reason.
function toStoredResult(r) {
  return {
    name: r.name,
    url: r.url,
    status_code: r.statusCode ?? null,
    ok: r.ok ? 1 : 0,
    response_ms: r.responseMs ?? null,
    error_message: r.errorMessage ?? null,
  };
}

// Persist ONE object per probe run — the single write the cron makes per tick.
//
// The old table grew by one ROW PER TARGET per tick (5 rows every 5 minutes,
// forever, which is what forced the 2026-09-30 index/query rewrite). R2 inverts
// that: one object per run holds all N results, so the storage grows by exactly
// one object per tick, the run's `run_at` lives in the document instead of
// being inferred from a column, and retention becomes "delete the object".
//
// `now` is a parameter, never `new Date()` at write time, and the KEY is derived
// from the same instant as the body's `run_at` — otherwise a run that starts at
// 12:59:59.9 and finishes at 13:00:00.1 would file itself under the wrong day
// and disagree with its own payload.
export async function writeRunResults(env, results, now = new Date()) {
  const key = checksKey(now);
  await writeJson(env.MONITOR_BUCKET, key, {
    run_at: now.toISOString(),
    results: results.map(toStoredResult),
  });
  return key;
}

// Probe every target concurrently, then persist the run as one object.
//
// ORDER IS PROBED, NOT WRITTEN: every target is probed before anything is
// written, so the write path can never add latency to a probe or (if R2 is
// unavailable) lose the run's results after they were already collected. That
// is the mirror image of the row-at-a-time version, which wrote each row inside
// its own probe task.
export async function runProbeCycle(env, fetchFn = fetch, now = new Date()) {
  const settled = await Promise.all(
    TARGETS.map(async (target) => {
      const row = await probeTarget(target, fetchFn);
      return { name: target.name, url: target.url, ...row };
    }),
  );
  await writeRunResults(env, settled, now);
  return settled;
}

// --- Public read cache (in-memory, 20s TTL) ---
//
// PERFORMANCE (2026-09-30): the dashboard polls /api/status once plus
// /api/history once per card on every refresh, and each poll re-ran the same
// aggregates. Even on the 60s interval that is 1 + N reads per viewer per
// minute, multiplied by however many dashboards are open. A short TTL collapses
// every read inside one window onto a single read and takes that fan-out
// back out of the picture.
//
// 20s is deliberately shorter than the 5-minute probe cron, so the cache can
// never serve data older than one full probe run — it only absorbs duplicate
// reads and bursty multi-viewer traffic, it does not change what the dashboard
// shows.
//
// Best-effort by design, and deliberately NOT KV: per-isolate Map on
// globalThis, so a cold isolate simply queries (same trade-off as the report
// rate limiter below). A KV write per public read would burn the free plan's
// 1,000 writes/day quota, which is exactly the outage documented in AGENTS.md.
//
// Errors are NEVER cached: `producer` throws → nothing is stored, so the next
// request retries the bucket rather than pinning a transient failure for 20s.
export const PUBLIC_CACHE_TTL_MS = 20_000;

// Bound on the history fan-out (N targets * 3 window sizes); a dashboard that
// asks for more still gets correct answers, just from the bucket.
const PUBLIC_CACHE_MAX_ENTRIES = 256;

function publicCacheStore() {
  if (!globalThis.__monitorPublicCache) globalThis.__monitorPublicCache = new Map();
  return globalThis.__monitorPublicCache;
}

// Drop every cached public read. Exported so tests can isolate themselves (each
// test builds its own storage double) and so a deploy can never inherit a stale
// entry from a recycled isolate.
export function clearPublicCache() {
  publicCacheStore().clear();
}

// Read-through cache. `key` is 'status' or `history:<target>|<hours>`.
// Returns the cached payload when it is younger than TTL, otherwise awaits
// `producer()` and stores the resolved value. Entries older than the TTL are
// never returned (and are dropped on the next write).
//
// Thin wrapper over withPublicCacheInfo: endpoints that do not care WHERE the
// payload came from use this; /api/status uses the *Info form so it can report
// it (see the `cached` flag below).
export async function withPublicCache(key, producer, now = Date.now()) {
  const { value } = await withPublicCacheInfo(key, producer, now);
  return value;
}

// Same read-through cache, but also reports whether the returned payload was a
// HIT (`cached: true`) or was just produced from storage (`cached: false`).
//
// The hit/miss answer is deliberately NOT part of the stored value: it describes
// one HTTP response, not the data, so it is computed per call and merged into
// the response by the caller. Storing it would be a self-invalidating flag -- the
// `false` written by the miss that populated the entry would be replayed by
// every subsequent hit inside the TTL, telling viewers the payload was freshly
// queried when it was not, and the `true` written by a hit would pin the entry
// as fresh past its TTL.
export async function withPublicCacheInfo(key, producer, now = Date.now()) {
  const store = publicCacheStore();
  const hit = store.get(key);
  if (hit && now - hit.at < PUBLIC_CACHE_TTL_MS) return { value: hit.value, cached: true };

  // Throws propagate to the route (500) with nothing written to the store.
  const value = await producer();

  if (store.size >= PUBLIC_CACHE_MAX_ENTRIES) {
    for (const [k, entry] of store) {
      if (now - entry.at >= PUBLIC_CACHE_TTL_MS) store.delete(k);
    }
    while (store.size >= PUBLIC_CACHE_MAX_ENTRIES) {
      store.delete(store.keys().next().value);
    }
  }
  store.set(key, { value, at: now });
  return { value, cached: false };
}

// --- R2 read path (migration phase 3) ---
//
// Both public reads used to be SQL: one index probe per target plus a COUNT/SUM
// per target for `/api/status`, and a single indexed range scan for
// `/api/history`. None of those queries exists any more; what replaced them is
// below, and the wire shapes are byte-for-byte the same.

// Widest window `/api/history` will serve, and the ceiling on the entries it
// returns (both carried over from the old call's own limits: a 168h clamp and
// `LIMIT 500`). In R2 the window ceiling is also the RING's retention: the
// stored document is trimmed to this many hours on every write, so a request can
// never ask for an older sample than the bucket still holds.
export const HISTORY_MAX_WINDOW_HOURS = 48;
export const HISTORY_MAX_ENTRIES = 500;

// One run object per MINUTE at most — the key stamp is `HH-MM` — so a UTC day
// can hold no more than 1440 keys however hard `POST /internal/check` is
// hammered. The bound on the listing exists because `listAll` truncates rather
// than telling the caller it stopped, and it returns ASCENDING keys: a
// truncated listing would drop the NEWEST run, which is the only one the reader
// wants. Staying under the ceiling is what makes the walk complete.
const RUN_KEYS_PER_DAY_MAX = 1440;

// Newest run object: today's `checks/<date>/` prefix, falling back to
// yesterday's.
//
// TWO DAY BUCKETS, NOT A WHOLE-BUCKET WALK: R2 lists ASCENDING, so "newest" is
// the LAST key of a listing — one LIST plus one GET, and a LIST is a subrequest
// too. Walking `checks/` (14 days of retention, ~4,000 keys, paginated) to find
// the newest object would cost more than the read it serves, so the lookup asks
// the two day buckets that can hold it and stops. Yesterday is the fallback
// that matters in practice: a deploy at 00:02 UTC, or a cron that has not run
// yet today, must still render yesterday's last known state rather than nothing.
//
// The returned document is the run itself (`{ run_at, results[] }`) or null for
// a cold bucket — readJson's `fallback`, which is how an empty bucket reads as
// "nothing has ever been probed" instead of an error.
export async function newestRun(bucket, now = new Date()) {
  const at = new Date(now).getTime();
  for (const daysAgo of [0, 1]) {
    const keys = await listAll(bucket, {
      prefix: datePrefix(CHECKS_PREFIX, new Date(at - daysAgo * 86_400_000)),
      maxKeys: RUN_KEYS_PER_DAY_MAX,
    });
    const newest = keys[keys.length - 1]?.key;
    if (!newest) continue;
    return readJson(bucket, newest, null);
  }
  return null;
}

// Uptime percentage from the rollup's `{ okCount, totalCount }` bucket. Same
// arithmetic and same one-decimal rounding as the old aggregate query, and the
// same "no rows in the window ⇒ null" contract the dashboard renders as `—`.
function uptimeFromBucket(bucket) {
  const total = Number(bucket?.totalCount ?? 0);
  if (!total) return null;
  return Math.round((Number(bucket?.okCount ?? 0) / total) * 1000) / 10;
}

// The public aggregate behind BOTH `/api/status` and the server-rendered
// dashboard. Shared deliberately: there used to be two byte-identical copies
// of this block (one for the page, one for the endpoint), and with the reads on
// R2 a second copy would be a second thing to keep in step with the storage
// layout — plus a way for the page and the JSON endpoint to disagree on the
// same bucket.
//
// THREE READS, IN PARALLEL, no fan-out:
//   - the newest run object   → per-target last status / response time / error
//   - `state/alert_state.json`→ carry-forward for targets this run did not probe
//   - `state/summary.json`    → `uptime_24h`, pre-summed (see updateSummary)
//
// THE CARRY-FORWARD IS WHY ALERT STATE IS READ HERE AT ALL. A run object holds
// one result per PROBED target, and `POST /internal/check` writes a normal run
// object with a SINGLE result when an operator checks one host by hand. With
// "latest row per target" being a query that simply had a row for every
// configured target, a one-target run left the other five alone. Reading
// only the newest run object would instead blank them — the newest run's shape
// is the newest run's business, and the dashboard would report five healthy
// hosts as down because a human pressed a button. `alert_state.json` is the
// per-target state the cron already carries forward verbatim for exactly this
// case ("not probed" is not "healthy"), so a target with no result in the newest
// run falls back to its `last_state`.
//
// `up`, deliberately, is NOT read from alert state when the run HAS a result for
// that target: `last_state` is sticky by design (it stays `up` until three
// consecutive failures cross the threshold), so a target failing for one or two
// runs would still be reported healthy — the row-based version reported
// `up: false` the moment a single probe came back ok=0. The live run bit wins;
// the state document only fills the gaps.
export async function readStatusAggregate(env, now = new Date()) {
  const [run, alert, summary] = await Promise.all([
    newestRun(env.MONITOR_BUCKET, now),
    readJson(env.MONITOR_BUCKET, alertStateKey(), {}),
    readJson(env.MONITOR_BUCKET, summaryKey(), null),
  ]);

  const results = Array.isArray(run?.results) ? run.results : [];
  const byName = new Map(results.map((r) => [r.name, r]));
  const state = alert && typeof alert === 'object' ? alert : {};
  const buckets = summary && typeof summary === 'object' ? summary.targets : null;

  const targets = TARGETS.map((t) => {
    const row = byName.get(t.name) ?? null;
    const carried = state[t.name] ?? null;
    return {
      name: t.name,
      url: t.url,
      up: row ? row.ok === 1 : carried?.last_state === 'up',
      last_status: row?.status_code ?? null,
      last_response_ms: row?.response_ms ?? null,
      uptime_24h: uptimeFromBucket(buckets?.[t.name]),
      last_error: row?.error_message ?? null,
    };
  });

  const upCount = targets.filter((t) => t.up).length;
  const overall = upCount === targets.length ? 'ok' : upCount === 0 ? 'down' : 'degraded';
  return { overall, checked_at: run?.run_at ?? null, targets };
}

// Public aggregate status across all targets.
app.get('/api/status', async (c) => {
  // Cache the finished payload, not the per-target read results: one entry for
  // the whole aggregate, so concurrent viewers share a single read.
  const { value: aggregate, cached } = await withPublicCacheInfo('status', () =>
    readStatusAggregate(c.env),
  );
  // `cached` describes THIS response (served from the 20s window vs read just
  // now), so an operator watching the dashboard can see the cache working --
  // and, more usefully, can tell a stale-looking pill apart from a stale
  // backend. It is merged here, outside the cached value, for the reason in
  // withPublicCacheInfo's comment.
  return c.json({ ...aggregate, cached });
});

// Public per-target history. `target` is required; hours defaults to 24.
//
// MAX 48 HOURS, REJECTED RATHER THAN CLAMPED. The old endpoint clamped to 168
// because an indexed range scan over 7 days was one query. The R2 read is a
// window over a stored ring (see `historyKey` in storage.js) whose whole reason
// to exist is that a per-object walk of the window does not fit in an
// invocation's subrequest budget. Clamping `hours=168` to 48 would answer 200
// with a 48-hour series and no indication that anything was dropped — the caller
// would draw a shorter sparkline than the number in its own URL and never know.
// A 400 names the ceiling instead.
app.get('/api/history', async (c) => {
  // Validate BEFORE the cache so a 400 is never stored under any key, and so an
  // unknown target costs zero reads instead of joining the cached fan-out.
  //
  // A rejected request echoes `valid_targets`: the caller was asking for one
  // target out of a known, code-declared set, so the actionable answer is the
  // set itself. Without it the only response to a typo is "unknown target",
  // which forces the caller to enumerate TARGETS out of band to recover (and
  // previously produced an empty `checks` array, indistinguishable from "this
  // target was never probed").
  const target = c.req.query('target');
  const valid_targets = TARGETS.map((t) => t.name);
  if (!target) return c.json({ error: 'target query param is required', valid_targets }, 400);
  if (!valid_targets.includes(target)) return c.json({ error: 'unknown target', valid_targets }, 400);

  let hours = parseInt(c.req.query('hours') ?? '24', 10);
  if (Number.isNaN(hours)) hours = 24;
  if (hours > HISTORY_MAX_WINDOW_HOURS) {
    return c.json(
      { error: `history max ${HISTORY_MAX_WINDOW_HOURS} hours in R2 mode`, max_hours: HISTORY_MAX_WINDOW_HOURS, valid_targets },
      400,
    );
  }
  hours = Math.max(hours, 1);

  // Keyed by the normalized target|hours so `/api/history?target=x&hours=07`
  // and `?hours=7` share one entry.
  const payload = await withPublicCache(`history:${target}|${hours}`, () =>
    readHistoryWindow(c.env, target, hours),
  );
  return c.json(payload);
});

// One target's checks inside the requested window, oldest first — the exact
// `{target, hours, checks}` shape the range query produced, and the exact four
// fields it projected (`status_code`, `ok` as 1/0, `response_ms`, `checked_at`).
// The stored entries already carry those names, so the port is a window filter,
// not a reshape: there is no field to mistranslate and nothing to remember about
// the old column naming after this commit.
//
// ONE GET for the whole response, versus the range query's single statement.
// Sorting is defensive: entries are appended in run order, but two runs inside
// the same minute share a key and a manual `/internal/check` can be back-dated
// by nothing at all, so the window's contents are re-sorted by the value the
// caller reads rather than trusted to the write order.
export async function readHistoryWindow(env, target, hours, now = new Date()) {
  const since = new Date(now).getTime() - hours * 60 * 60 * 1000;
  const doc = await readJson(env.MONITOR_BUCKET, historyKey(target), null);
  const entries = Array.isArray(doc?.entries) ? doc.entries : [];
  const checks = entries
    .filter((e) => {
      const t = Date.parse(e?.checked_at ?? '');
      return Number.isFinite(t) && t >= since;
    })
    .sort((a, b) => Date.parse(a.checked_at) - Date.parse(b.checked_at))
    .slice(-HISTORY_MAX_ENTRIES)
    .map((e) => ({
      status_code: e?.status_code ?? null,
      ok: e?.ok ? 1 : 0,
      response_ms: e?.response_ms ?? null,
      checked_at: e?.checked_at ?? null,
    }));
  return { target, hours, checks };
}

// --- Public reports listing (phase 5) ---
//
// The dashboard's "Recent reports" list, as a PUBLIC endpoint: same audience and
// same exposure as /api/status (report messages are user-submitted prose about
// the product; the endpoints are already public and CORS-open under /api/*), and
// the same reason it is an endpoint rather than server-rendered markup — the old
// version paid one query per page render for a list the operator then had to
// reload to see.
//
// Covered by the same 20s in-memory cache as /api/history, keyed by every
// parameter that changes the answer. It is NOT behind the intake limiter: that
// limiter exists to throttle a token brute-force (60/min per IP), and this
// endpoint takes no credential, so a shared per-IP budget would only punish
// viewers behind one NAT.

export const REPORTS_DEFAULT_KIND = 'errors';
// A page is a page: 20 is the largest the dashboard asks for, and capping it
// keeps one request's work inside an invocation's subrequest budget.
export const REPORTS_MAX_LIMIT = 20;
// Hard ceiling on objects READ per request (`offset + limit`). The reads are the
// unavoidable part of an object listing — each report is its own object — so the
// budget is expressed in objects and rejected rather than clamped, for the same
// reason /api/history rejects `hours > 48`: a silent clamp answers 200 with a
// shorter page than the caller asked for and tells it nothing.
export const REPORTS_MAX_READS = 40;
// Pages walked per day bucket. R2 lists ASCENDING with a forward-only cursor, so
// "the newest N" costs every page before them: at the intake limiter's ceiling
// (60/min/IP) a single day could hold ~86,000 keys, and the dashboard's own page
// budget would be gone long before that. Ten pages is 10,000 reports per day —
// a sustained ~11 reports/minute — and `truncated` in the response says plainly
// when a bucket had more than that, instead of serving the oldest of the day's
// first 10,000 as if they were the newest.
export const REPORTS_MAX_LIST_PAGES = 10;

// Keys under one report day bucket, NEWEST FIRST, plus whether the bucket was
// fully walked. Reversing the ascending listing is the whole trick: byte order is
// arrival order, so no timestamp is parsed.
async function listReportKeysDesc(bucket, prefix) {
  const keys = [];
  let cursor;
  let exhausted = false;
  for (let page = 0; page < REPORTS_MAX_LIST_PAGES; page += 1) {
    const res = await listPage(bucket, { prefix, cursor });
    for (const object of res?.objects ?? []) keys.push(object.key);
    if (!res?.truncated) {
      exhausted = true;
      break;
    }
    cursor = res?.cursor;
    // `truncated: true` with no cursor cannot advance; stopping is the only safe
    // move (a non-advancing cursor would spin inside the invocation).
    if (!cursor) {
      exhausted = true;
      break;
    }
  }
  keys.reverse();
  return { keys, exhausted };
}

// Newest-first intake reports for one kind, sliced by `offset`/`limit`.
//
// TODAY + YESTERDAY, two day buckets. The retention window is 30 days, but
// walking 30 buckets is 30 listings (each a subrequest) to answer a question the
// dashboard asks as "what is new"; the older reports are still retained, still
// swept on schedule, and still readable by an operator with bucket access.
//
// The page is taken from the KEY ordering and only then read: the newest `limit`
// objects are exactly the ones that will be rendered, so no body is fetched that
// the response does not contain. A key that vanished between the listing and the
// GET (the retention sweep deletes by key) is skipped rather than answering a
// slot with `null`.
export async function readReports(env, { kind, limit, offset }, now = new Date()) {
  const at = new Date(now).getTime();
  const descending = [];
  let exhausted = true;
  for (const daysAgo of [0, 1]) {
    // `reportsPrefix(kind)` already ends in a slash, so the day segment is
    // appended directly rather than through `datePrefix` (which would insert a
    // second one and produce a prefix that matches nothing).
    const listed = await listReportKeysDesc(
      env.MONITOR_BUCKET,
      `${reportsPrefix(kind)}${dateStamp(new Date(at - daysAgo * 86_400_000))}/`,
    );
    descending.push(...listed.keys);
    exhausted = exhausted && listed.exhausted;
  }
  const page = descending.slice(offset, offset + limit);
  const documents = await Promise.all(page.map((key) => readJson(env.MONITOR_BUCKET, key, null)));
  return {
    reports: documents.filter((doc) => doc && typeof doc === 'object'),
    truncated: !exhausted,
  };
}

app.get('/api/reports', async (c) => {
  // Validate BEFORE the cache, exactly like /api/history: a 400 is never stored
  // under any key, and a typo costs zero bucket work.
  const valid_kinds = REPORT_KINDS;
  const kind = (c.req.query('kind') ?? REPORTS_DEFAULT_KIND).trim();
  if (!valid_kinds.includes(kind)) return c.json({ error: 'unknown kind', valid_kinds }, 400);

  let limit = parseInt(c.req.query('limit') ?? String(REPORTS_MAX_LIMIT), 10);
  if (Number.isNaN(limit)) limit = REPORTS_MAX_LIMIT;
  limit = Math.min(Math.max(limit, 1), REPORTS_MAX_LIMIT);
  let offset = parseInt(c.req.query('offset') ?? '0', 10);
  if (Number.isNaN(offset) || offset < 0) offset = 0;
  if (offset + limit > REPORTS_MAX_READS) {
    return c.json(
      {
        error: `reports max ${REPORTS_MAX_READS} objects per request in R2 mode`,
        max_reads: REPORTS_MAX_READS,
        max_limit: REPORTS_MAX_LIMIT,
        valid_kinds,
      },
      400,
    );
  }

  const payload = await withPublicCache(`reports:${kind}|${limit}|${offset}`, () =>
    readReports(c.env, { kind, limit, offset }),
  );
  return c.json(payload);
});

// --- Favicon ---
//
// INLINE BYTES, NOT AN ASSET BINDING: the monitor worker has no static assets
// (no ASSETS binding in wrangler.toml — the dashboard HTML is a template
// literal), so the alternative to these ~200 bytes inline is adding a Workers
// Static Assets deployment for one icon.
//
// PUBLIC ON PURPOSE, like /api/status: browsers request /favicon.ico with no
// cookies and often with no session at all, so gating it behind the PIN would
// guarantee the 404 this route exists to remove. The bytes are the same on
// every page and leak nothing (no host, no tenant, no probe data).
//
// Cache-Control is long (7 days) because the icon is immutable in practice: it
// only changes when someone edits the constant below, and a wrong-but-cached
// icon is a cosmetic problem, not an incident. `immutable` is deliberately NOT
// set — the path is stable, so a browser must still be willing to revalidate
// after a redeploy that actually changed the artwork.
const FAVICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
  '<rect width="32" height="32" rx="7" fill="#0f172a"/>' +
  '<path d="M4 17h5l3-8 5 14 3-6h8" fill="none" stroke="#38bdf8" stroke-width="2.5" ' +
  'stroke-linecap="round" stroke-linejoin="round"/></svg>';

export const FAVICON_CACHE_CONTROL = 'public, max-age=604800';

app.get('/favicon.ico', (c) => {
  c.header('Content-Type', 'image/svg+xml; charset=utf-8');
  c.header('Cache-Control', FAVICON_CACHE_CONTROL);
  return c.body(FAVICON_SVG, 200);
});

// --- A.4 API + dashboard (append-only; A.3 routes/helpers above untouched) ---

// Constant-time string compare over UTF-8 bytes (length folded into the diff
// so short/long guesses take the same path). Guards REPORT_TOKEN /
// DASHBOARD_PIN against timing side-channels. Never throws.
export function timingSafeEqual(provided, expected) {
  const a = new TextEncoder().encode(String(provided ?? ''));
  const b = new TextEncoder().encode(String(expected ?? ''));
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return len > 0 && diff === 0;
}

// Extract the credential from an `Authorization: Bearer <token>` header.
// Returns null when missing or malformed (never throws).
export function getBearerToken(header) {
  const m = /^Bearer (.+)$/.exec(String(header ?? '').trim());
  if (!m) return null;
  const token = m[1].trim();
  return token ? token : null;
}

// True when the request header carries `expected` (constant-time). Fail-closed:
// missing header, malformed scheme, empty token, or unconfigured `expected`
// all deny.
export function isAuthorizedToken(header, expected) {
  if (!expected) return false;
  const provided = getBearerToken(header);
  if (!provided) return false;
  return timingSafeEqual(provided, expected);
}

// In-memory 60/min per-IP limiter for /report/*. Per-isolate Map on globalThis
// (same trade-off as the main backend's RATE_LIMIT_KV_ENABLED="false" fallback:
// per-isolate, resets on restart — acceptable for an intake endpoint on the
// free plan, where a KV write per request would exhaust the 1,000/day quota).
// Only cf-connecting-ip is trusted (not spoofable x-forwarded-for).
export const REPORT_RATE_LIMIT = 60;
export const REPORT_RATE_WINDOW_MS = 60_000;

function reportRateStore() {
  if (!globalThis.__monitorReportRate) globalThis.__monitorReportRate = new Map();
  return globalThis.__monitorReportRate;
}

// Returns { allowed, count, limit }. Exported for tests.
export function checkReportRateLimit(ip, now = Date.now()) {
  const store = reportRateStore();
  const windowStart = Math.floor(now / REPORT_RATE_WINDOW_MS) * REPORT_RATE_WINDOW_MS;
  if (store.size > 2000) {
    for (const key of store.keys()) {
      const w = Number(key.slice(key.lastIndexOf(':') + 1));
      if (Number.isFinite(w) && w < windowStart) store.delete(key);
    }
  }
  const key = `${ip}:${windowStart}`;
  const count = (store.get(key) ?? 0) + 1;
  store.set(key, count);
  return { allowed: count <= REPORT_RATE_LIMIT, count, limit: REPORT_RATE_LIMIT };
}

export function getClientIp(c) {
  return c.req.header('cf-connecting-ip')?.trim() || 'unknown';
}

// POST /login brute-force budget: 5 failed PIN attempts per 5 minutes per IP,
// enforced in the bucket as ONE document per IP at
// `state/login_attempts/<ipHash>.json` (`ipHash` + `loginAttemptsKey` in
// storage.js, swept by `runRetention`). Object-backed so the budget survives
// isolate restarts; only cf-connecting-ip is trusted (not spoofable
// x-forwarded-for). No KV writes (free-plan 1,000/day quota).
//
// EVERY POST /login RECORDS EXACTLY ONE OUTCOME — success, failure and
// rate-limited alike — the same accounting the attempt table kept: the failure
// TIMESTAMPS plus a `last_success_at` stamp, never the PIN value or hash, and
// never the raw address (the filename is an HMAC of it).
export const LOGIN_FAIL_LIMIT = 5;
export const LOGIN_FAIL_WINDOW_MS = 5 * 60 * 1000;

// Drop the failure timestamps that have left the 5-minute window. This is the
// SLIDING half of the gate, and it is why the document stores timestamps rather
// than a count: `fails` is what decides when the budget frees up again, so an
// attempt made just before the oldest failure expires keeps costing a try.
//
// An unparseable stamp is dropped (it cannot be shown to be inside the window)
// and the result is always sorted ascending, so the oldest entry IS the window
// start even if a document was written by an older/hand-edited writer.
function pruneLoginFails(fails, nowMs) {
  return (Array.isArray(fails) ? fails : [])
    .map((f) => Date.parse(String(f ?? '')))
    .filter((t) => Number.isFinite(t) && nowMs - t < LOGIN_FAIL_WINDOW_MS)
    .sort((a, b) => a - b)
    .map((t) => new Date(t).toISOString());
}

// Read one IP's gate counter. Never throws on a cold bucket: an absent document
// is `count: 0, locked: false`, which is exactly a first-time visitor.
//
// Returns the document as well as the pruned window, so the caller that records
// an outcome does not have to guess what was stored before it.
export async function readLoginGate(env, ip, now = new Date()) {
  const hash = await ipHash(ip, env?.DASHBOARD_PIN);
  const key = loginAttemptsKey(hash);
  const doc = await readJson(env.MONITOR_BUCKET, key, null);
  const fails = pruneLoginFails(doc?.fails, new Date(now).getTime());
  return {
    key,
    ip_hash: hash,
    doc,
    fails,
    count: fails.length,
    locked: fails.length >= LOGIN_FAIL_LIMIT,
  };
}

// Record one POST /login outcome against the IP's counter document and return
// the resulting window.
//
// THREE RULES, each preserving the contract the attempt table had:
//   - a FAILURE appends a timestamp, unless the budget is already spent: past
//     the limit nothing is appended, so a hammering client cannot grow the
//     document and the window still frees up one failure at a time.
//   - a SUCCESS DOES NOT CLEAR THE FAILURES. The old count filtered on
//     `success = 0` and nothing else, so a success never refunded the budget;
//     refunding it here would hand an attacker five fresh guesses for the price
//     of one guess they do not need. The success is recorded as
//     `last_success_at` instead, which answers "did this IP authenticate
//     recently" without touching the gate.
//   - the write is UNWRAPPED, like every other write in this worker: an
//     unrecorded attempt is a gate that has silently moved, which is worse than
//     a 500 the caller can retry.
export async function recordLoginOutcome(env, ip, { success }, now = new Date()) {
  const at = new Date(now);
  const gate = await readLoginGate(env, ip, at);
  const fails =
    success || gate.count >= LOGIN_FAIL_LIMIT
      ? gate.fails
      : [...gate.fails, at.toISOString()];
  const windowStart = fails.length ? fails[0] : null;
  const lockedUntil =
    fails.length >= LOGIN_FAIL_LIMIT
      ? new Date(Date.parse(windowStart) + LOGIN_FAIL_WINDOW_MS).toISOString()
      : null;
  await writeJson(env.MONITOR_BUCKET, gate.key, {
    ip_hash: gate.ip_hash,
    fails,
    window_start: windowStart,
    locked_until: lockedUntil,
    updated_at: at.toISOString(),
    last_success_at: success ? at.toISOString() : (gate.doc?.last_success_at ?? null),
  });
  return { ...gate, fails, count: fails.length, locked: fails.length >= LOGIN_FAIL_LIMIT };
}

// CSRF gate for cookie-authenticated POSTs (/login, /logout). Browsers
// always send Origin (fetch/form) or Referer on same-origin POSTs; a
// missing pair means a forged cross-site request path. Returns true when
// the gate passes.
export function hasCsrfHeader(c) {
  return Boolean(c.req.header('origin') || c.req.header('referer'));
}

// True when the request carries a fresh session cookie signed with
// DASHBOARD_PIN. Fail-closed: unconfigured/invalid PIN, missing cookie,
// or bad/expired signature all deny. Never throws, never logs.
export async function hasValidSession(c, now = Date.now()) {
  const pin = c.env?.DASHBOARD_PIN;
  if (!pin || !/^\d{6}$/.test(pin)) return false;
  const cookies = parseCookie(c.req.header('cookie'));
  const value = cookies[SESSION_COOKIE];
  if (!value) return false;
  return verifySession(value, pin, now);
}

// PIN login form (GET /login). No token or PIN bytes in the page — the 6-digit
// PIN posts to POST /login which sets the HttpOnly session cookie. The PIN
// itself never appears in a URL (no ?pin= / ?token= path authenticates).
// Includes an on-screen keypad (10 digit buttons), a <noscript> fallback
// (the plain PIN field + submit keep working with JS disabled), and a
// prefers-reduced-motion guard.
function buildLoginHtml() {
  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  const keys = digits.map((d) => `<button type="button" class="key" data-digit="${d}">${d}</button>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in — SinaiCamps Status</title>
<link rel="icon" href="/favicon.ico" type="image/svg+xml">
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{background:#0f172a;color:#e2e8f0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0}
.wrap{max-width:24rem;margin:4rem auto;padding:1rem}
.card{background:#1e293b;border:1px solid #334155;border-radius:.75rem;padding:1.5rem}
h1{font-size:1.1rem;margin:0 0 1rem}
label{display:block;font-size:.8rem;color:#cbd5e1;margin-bottom:.3rem}
input[type=text]{width:100%;padding:.6rem;font-size:1.25rem;letter-spacing:.4em;text-align:center;border-radius:.5rem;border:1px solid #475569;background:#0b1220;color:#e2e8f0}
button[type=submit]{width:100%;padding:.7rem;margin-top:1rem;font-size:.9rem;font-weight:700;color:#0f172a;background:#38bdf8;border:0;border-radius:.6rem}
.keypad{display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;margin-top:1rem}
.key{padding:.8rem;font-size:1.1rem;font-weight:700;color:#e2e8f0;background:#0b1220;border:1px solid #475569;border-radius:.6rem}
.key:active{background:#334155}
.trust{display:flex;align-items:center;gap:.5rem;margin-top:1rem;font-size:.8rem;color:#cbd5e1}
.trust input{width:auto}
.muted{color:#94a3b8;font-size:.75rem;margin-top:1rem}
@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
</style>
</head>
<body>
<div class="wrap"><div class="card">
<h1>SinaiCamps Status — sign in</h1>
<form method="POST" action="/login">
<label for="pin">6-digit PIN</label>
<input id="pin" name="pin" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required>
<div class="keypad">${keys}</div>
<label class="trust"><input type="checkbox" name="trust" value="1"> Trust this device for 90 days</label>
<button type="submit">Sign in</button>
</form>
<noscript><p>Enter your 6-digit PIN above and press Sign in. The on-screen keypad needs JavaScript; the PIN field works without it.</p></noscript>
<p class="muted">Session cookie lasts 12 hours, or 90 days on trusted devices (HttpOnly, Secure, SameSite=Strict). 5 wrong tries per 5 minutes per IP, then try again later.</p>
</div></div>
<script>
(function(){
var input = document.getElementById('pin');
var keys = document.querySelectorAll('.key');
for (var i = 0; i < keys.length; i++) {
  keys[i].addEventListener('click', function(){
    if (input.value.length < 6) input.value += this.getAttribute('data-digit');
    input.focus();
  });
}
})();
</script>
</body>
</html>`;
}

// Error page when DASHBOARD_PIN is not configured (missing or not 6 digits).
// Names the secret to set (`wrangler secret put DASHBOARD_PIN`) without ever
// printing or requiring its value.
function buildUnconfiguredHtml() {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/favicon.ico" type="image/svg+xml">
<title>Dashboard not configured</title></head>
<body style="background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif">
<div style="max-width:28rem;margin:4rem auto;padding:1rem">
<h1>Dashboard PIN not configured</h1>
<p>Set it via <code>wrangler secret put DASHBOARD_PIN</code> from <code>monitor/</code>, then redeploy. It must be exactly 6 digits.</p>
</div>
</body>
</html>`;
}

// Minimal HTML escaper for server-rendered dashboard values (report messages,
// page URLs, probe error strings are all operator/user-controlled).
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const REPORT_BODY_LIMITS = { message: 2000, page_url: 500, contact: 200, severity: 32 };

// The User-Agent is stored with every report (who/where it came from, which is
// half of what makes an intake report actionable) but it is a HEADER, so unlike
// the body fields above nothing in the request path bounds it — it is capped
// here, at the point it enters storage, so no caller can write an object whose
// size is set by something outside this worker's control.
export const REPORT_USER_AGENT_MAX = 300;

// Endpoint kind (`/report/error`, `/report/feedback`) → key collection. See
// `writeReport`.
const REPORT_COLLECTION_BY_KIND = { error: 'errors', feedback: 'feedback' };

// Severities that page a human on the alert channel. `warning` is deliberately
// NOT one of them: the whole point of the severity field is that a stored report
// does not have to interrupt anyone, and an endpoint that forwarded everything
// would make the channel useless within a day.
export const REPORT_PAGING_SEVERITIES = ['error', 'fatal'];

// One intake report, as a string id: `<ms epoch base36>-<6 hex>`.
//
// NO DATABASE SEQUENCE ANY MORE (R2 has none) and none is needed: the id only has
// to be unique inside the key, and unique is enough because a collision would
// overwrite a report — the one thing an intake endpoint must never do — while
// ordering is the KEY's job. Leading epoch milliseconds make two reports inside
// the same second sort in arrival order too, which the 6 random hex characters
// cannot guarantee on their own. `crypto.getRandomValues` is a global in Workers
// and in Node, so no import and no crypto client.
export function newReportId(now = new Date()) {
  const rand = new Uint8Array(3);
  crypto.getRandomValues(rand);
  const suffix = [...rand].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${new Date(now).getTime().toString(36)}-${suffix}`;
}

// Write ONE intake report as `reports/<kind>/<date>/<HH-MM-SS>-<id>.json`.
//
// `now` is a parameter and BOTH the key's stamp and the body's `received_at`
// come from it, exactly as `checksKey`/`run_at` do in `writeRunResults`: a
// report that arrives at 23:59:59.9 must not file itself under tomorrow, or the
// dashboard would order it before reports it was stored after.
//
// The document carries the four fields the old row had (kind, message, page_url,
// contact, status) plus the id, the arrival time, the caller's severity and its
// User-Agent — everything an operator needs to triage without opening logs.
export async function writeReport(env, { kind, message, pageUrl, contact, severity, userAgent }, now = new Date()) {
  // The STORED kind is singular ('error') while the KEY's collection is plural
  // (`REPORT_KINDS`), a distinction `storage.js` documents rather than derives.
  // It is resolved in exactly one place, here: a misspelled endpoint kind throws
  // at the write instead of silently minting a collection the retention sweep
  // never visits.
  const collection = REPORT_COLLECTION_BY_KIND[kind];
  if (!collection) throw new Error(`unknown report kind: ${kind}`);
  const at = new Date(now);
  const id = newReportId(at);
  const key = reportKey(collection, at, secondsStamp(at), id);
  const document = {
    id,
    kind,
    received_at: at.toISOString(),
    message,
    page_url: pageUrl || null,
    contact: contact || null,
    status: 'new',
    severity: severity ?? null,
    user_agent: userAgent ? String(userAgent).slice(0, REPORT_USER_AGENT_MAX) : null,
  };
  await writeJson(env.MONITOR_BUCKET, key, document);
  return { id, key, document };
}

// Forward a paging report to the alert channel. Same posture as `sendAlert`:
// resolves `{sent}` / `{skipped}` and NEVER throws, because a dead webhook must
// not turn a stored report into a failed request (and the report is already
// stored by the time this runs — the notification is a convenience, the record
// is the product).
//
// The payload keeps the alert channel's `event`/`text` convention so an existing
// receiver can route on it without a second format, and truncates the message:
// the channel is a notification, not a copy of the report, and a 2,000-character
// wall of text is unreadable on a phone at 3am.
export const REPORT_FORWARD_MESSAGE_MAX = 400;
export async function forwardReport(env, report, fetchFn = fetch) {
  const webhookUrl = getWebhookUrl(env);
  if (!webhookUrl) return { skipped: true, reason: 'no-webhook' };
  const message = String(report?.message ?? '');
  const text =
    `\ud83d\udea8 campmaster-monitor: NEW ${report?.severity ?? 'error'} report (${report?.kind ?? 'error'})\n` +
    `${message.slice(0, REPORT_FORWARD_MESSAGE_MAX)}${message.length > REPORT_FORWARD_MESSAGE_MAX ? '…' : ''}` +
    `${report?.page_url ? `\n${report.page_url}` : ''}` +
    `${report?.contact ? `\ncontact: ${report.contact}` : ''}`;
  try {
    await fetchFn(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'campmaster-monitor/1.0' },
      body: JSON.stringify({
        event: 'report',
        kind: report?.kind ?? 'error',
        severity: report?.severity ?? 'error',
        id: report?.id ?? null,
        text,
        message,
        page_url: report?.page_url ?? null,
        contact: report?.contact ?? null,
        received_at: report?.received_at ?? null,
        user_agent: report?.user_agent ?? null,
      }),
    });
    return { sent: true };
  } catch {
    return { skipped: true, reason: 'send-failed' };
  }
}

// `c.executionCtx` THROWS when the context carries none (Hono's getter, and
// `app.request()` in the tests is exactly such a context), so it is read behind a
// guard rather than assumed.
function executionCtxOf(c) {
  try {
    return c.executionCtx ?? null;
  } catch {
    return null;
  }
}

// Shared intake handler for POST /report/error + POST /report/feedback.
// Order: IP rate limit (60/min, throttles token brute-force too) → Bearer
// REPORT_TOKEN (401) → JSON + field validation (400) → R2 write (201) → alert
// channel forward.
//
// THE WRITE IS NOT WRAPPED, for the same reason the cron's probe write is not:
// an intake report that is accepted and then lost is the worst outcome this
// endpoint has, so a failing bucket is a 500 the caller can see and retry, not a
// silent success.
async function handleReport(c, kind) {
  const rl = checkReportRateLimit(getClientIp(c));
  if (!rl.allowed) return c.json({ error: 'rate limit exceeded' }, 429);
  if (!isAuthorizedToken(c.req.header('authorization'), c.env.REPORT_TOKEN)) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) return c.json({ error: 'message is required' }, 400);
  if (message.length > REPORT_BODY_LIMITS.message) {
    return c.json({ error: 'message too long (max 2000 chars)' }, 400);
  }
  const pageUrl = typeof body?.page_url === 'string' ? body.page_url.trim() : null;
  const contact = typeof body?.contact === 'string' ? body.contact.trim() : null;
  if (pageUrl && pageUrl.length > REPORT_BODY_LIMITS.page_url) {
    return c.json({ error: 'page_url too long (max 500 chars)' }, 400);
  }
  if (contact && contact.length > REPORT_BODY_LIMITS.contact) {
    return c.json({ error: 'contact too long (max 200 chars)' }, 400);
  }
  // Severity is optional and free-form within its length limit: it decides
  // whether the report interrupts someone, and an unrecognised value simply
  // means "store it, page nobody" rather than a rejected request.
  const severityRaw = typeof body?.severity === 'string' ? body.severity.trim().toLowerCase() : '';
  if (severityRaw.length > REPORT_BODY_LIMITS.severity) {
    return c.json({ error: 'severity too long (max 32 chars)' }, 400);
  }
  const severity = severityRaw || (kind === 'error' ? 'error' : 'info');

  // One instant for the whole request: the key's stamps and `received_at` must
  // agree, or the dashboard would order the report by one clock and display
  // another.
  const now = new Date();
  const { id, document } = await writeReport(
    c.env,
    { kind, message, pageUrl, contact, severity, userAgent: c.req.header('user-agent') },
    now,
  );

  // Only paging severities on the error endpoint reach the channel. Feedback is
  // never forwarded: it is not an incident, and forwarding it would train the
  // operator to ignore the channel.
  if (kind === 'error' && REPORT_PAGING_SEVERITIES.includes(severity)) {
    const send = () => forwardReport(c.env, document);
    // Hand the network call to the platform where there is a context to hand it
    // to, so a slow or hanging webhook cannot delay the caller's 201; await it
    // otherwise (tests, and any adapter with no execution context).
    const ctx = executionCtxOf(c);
    if (ctx?.waitUntil) ctx.waitUntil(send());
    else await send();
  }
  return c.json({ id, kind, status: 'new' }, 201);
}

app.post('/report/error', (c) => handleReport(c, 'error'));
app.post('/report/feedback', (c) => handleReport(c, 'feedback'));

// Manual probe trigger (operator runbook + dashboard "Check Now" stays a
// same-origin refresh — see dashboard script). Bearer REPORT_TOKEN (401).
// Optional JSON { target }: one known target name probes just that target;
// empty body probes all. Unknown target → 400. Always 200 with the alert
// evaluation outcomes (probe rows are written first, same as the cron path).
app.post('/internal/check', async (c) => {
  const cookieOk = await hasValidSession(c);
  const bearerOk = isAuthorizedToken(c.req.header('authorization'), c.env.REPORT_TOKEN);
  if (!cookieOk && !bearerOk) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  let targetName = null;
  const raw = await c.req.text();
  if (raw) {
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400);
    }
    targetName = body?.target ?? null;
    if (targetName != null && !TARGETS.some((t) => t.name === targetName)) {
      return c.json({ error: 'unknown target' }, 400);
    }
  }
  let probed;
  // One instant for the whole request: the run object's key + `run_at`, the
  // alert state stamps, and both rollup entries must all agree, and the rollups
  // must not double-count a manual run that spans a day boundary.
  const now = new Date();
  if (targetName) {
    const t = TARGETS.find((x) => x.name === targetName);
    const row = await probeTarget(t);
    probed = [{ name: t.name, url: t.url, ...row }];
    // A single-target manual run is still a RUN: it is stored in the same
    // one-object-per-run shape (with one result), so the R2 read path has
    // exactly one document shape to parse and never has to ask "is this a
    // partial run?". It also advances that target's consecutive-failure
    // counter, exactly as the row-at-a-time version's insert did.
    await writeRunResults(c.env, probed, now);
  } else {
    probed = await runProbeCycle(c.env, fetch, now);
  }
  const results = await evaluateAlerts(c.env, probed, fetch, now);
  await updateSummary(c.env, probed, now);
  // The history ring is derived data, same as the summary: wrapped, because a
  // ring that missed one manual run still renders a correct (shorter) window,
  // while an exception here would cost the operator the outcome they asked for.
  try {
    await updateHistoryRing(c.env, probed, now);
  } catch (err) {
    console.error('monitor history ring update failed', err?.message ?? err);
  }
  return c.json({ checked_at: now.toISOString(), results });
});

// The dashboard's status block is `readStatusAggregate` itself — the A.4
// "extend-only, keep a separate copy" rule existed because there used to be
// two byte-identical read blocks. With one read path in the bucket there is one
// shape to keep, and the page and /api/status cannot disagree about the same
// data.

// Newest-first probe rows across ALL targets, max `limit` — the dashboard's
// "Recent checks" table, and the R2 replacement for the old
// `ORDER BY id DESC LIMIT ?` over the append-only probe table.
//
// READ THE RINGS, NOT THE RUN OBJECTS. A run object holds every target's
// result, so a naive port would walk run objects newest-first and flatten; that
// costs a LIST per day plus one GET per run, and it cannot tell in advance how
// many runs a page of 20 rows needs (a partial one-target run yields one row,
// not six). The rings are already per target and already ordered, so the whole
// table is one GET per target — bounded by TARGETS, not by the row count — and
// the newest-20 cut is taken after the merge.
//
// `error_message` is NOT carried: `/api/history` never projected it and the
// table never rendered it, so the ring does not store it (see updateHistoryRing).
export async function readRecentChecks(env, limit = 20) {
  const rings = await Promise.all(
    TARGETS.map((t) => readJson(env.MONITOR_BUCKET, historyKey(t.name), null)),
  );
  const rows = [];
  rings.forEach((doc, i) => {
    for (const entry of Array.isArray(doc?.entries) ? doc.entries : []) {
      rows.push({
        target: TARGETS[i].name,
        status_code: entry?.status_code ?? null,
        ok: entry?.ok ? 1 : 0,
        response_ms: entry?.response_ms ?? null,
        checked_at: entry?.checked_at ?? null,
      });
    }
  });
  rows.sort((a, b) => Date.parse(b.checked_at ?? '') - Date.parse(a.checked_at ?? ''));
  return rows.slice(0, Math.max(limit, 0));
}

// Inline dark mobile dashboard HTML. Server-rendered: status pill, per-target
// cards, and the last-20 checks list, all read from R2 by the two helpers the
// public endpoints also use. Client JS refreshes the pill, cards, and
// per-target sparklines from the PUBLIC /api/status + /api/history endpoints
// every 60s (no token in the page JS); "Check Now" re-runs that same refresh
// immediately instead of waiting for the interval. Both endpoints are served
// from the 20s in-memory public cache, so a manual "Check Now" right after a
// refresh is nearly free.
//
// The REPORTS list is the one thing that is NOT server-rendered: it arrives from
// `GET /api/reports` when its tab is opened (see `renderReports`), so switching
// between errors and feedback costs no page render and no server query. The
// consequence, recorded here because it is a security decision rather than a UI
// one: report messages used to be escaped server-side by `escapeHtml`, and now
// they are assigned as TEXT NODES, which cannot parse their input as HTML, and
// the page script contains no HTML-parsing sink at all (pinned by test).
function buildDashboardHtml({ overall, checked_at, targets, recentChecks }) {
  const pillLabel = overall.toUpperCase();
  const cards = targets
    .map(
      (t) => `
      <section class="card" data-card="${escapeHtml(t.name)}">
        <div class="row">
          <strong>${escapeHtml(t.name)}</strong>
          <span class="dot ${t.up ? 'up' : 'down'}" data-f="dot"></span>
        </div>
        <div class="url">${escapeHtml(t.url)}</div>
        <div class="row meta">
          <span>uptime 24h: <b data-f="uptime">${t.uptime_24h == null ? '—' : `${t.uptime_24h}%`}</b></span>
          <span>last: <b data-f="ms">${t.last_response_ms == null ? '—' : `${t.last_response_ms} ms`}</b></span>
          <span>http: <b data-f="code">${t.last_status ?? '—'}</b></span>
        </div>
        <div class="err" data-f="err">${t.last_error ? escapeHtml(t.last_error) : ''}</div>
        <canvas class="spark" data-spark="${escapeHtml(t.name)}" width="320" height="48" aria-label="24h response-time sparkline"></canvas>
      </section>`,
    )
    .join('');
  const checkRows = recentChecks
    .map(
      (r) => `
      <tr><td>${escapeHtml(r.checked_at ?? '')}</td><td>${escapeHtml(r.target)}</td>
      <td class="${r.ok ? 'ok' : 'bad'}">${r.ok ? 'up' : 'down'}</td>
      <td>${r.status_code ?? '—'}</td><td>${r.response_ms ?? '—'}</td></tr>`,
    )
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SinaiCamps Status</title>
<link rel="icon" href="/favicon.ico" type="image/svg+xml">
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{background:#0f172a;color:#e2e8f0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0}
.wrap{max-width:28rem;margin:0 auto;padding:1rem 1rem 3rem}
header{display:flex;align-items:center;justify-content:space-between;gap:.5rem}
h1{font-size:1.1rem;margin:.5rem 0}
h2{font-size:.95rem;margin:1.5rem 0 .25rem;color:#cbd5e1}
#status-pill{font-weight:700;font-size:.8rem;padding:.3rem .8rem;border-radius:999px;letter-spacing:.05em}
#status-pill.ok{background:#166534;color:#dcfce7}
#status-pill.degraded{background:#92400e;color:#fef3c7}
#status-pill.down{background:#991b1b;color:#fee2e2}
.card{background:#1e293b;border:1px solid #334155;border-radius:.75rem;padding:.75rem 1rem;margin:.75rem 0}
.row{display:flex;align-items:center;justify-content:space-between;gap:.5rem}
.url{color:#94a3b8;font-size:.75rem;word-break:break-all;margin:.15rem 0 .4rem}
.meta{font-size:.75rem;color:#cbd5e1;flex-wrap:wrap;gap:.25rem .75rem;justify-content:flex-start}
.err{color:#fca5a5;font-size:.75rem;min-height:1em;word-break:break-word}
.dot{width:.8rem;height:.8rem;border-radius:50%;background:#64748b}
.dot.up{background:#22c55e}
.dot.down{background:#ef4444}
canvas.spark{width:100%;height:48px;display:block;margin-top:.4rem;background:#0b1220;border-radius:.5rem}
table{width:100%;border-collapse:collapse;font-size:.72rem}
th,td{text-align:left;padding:.3rem .35rem;border-bottom:1px solid #334155;vertical-align:top}
th{color:#94a3b8;font-weight:600}
td.ok{color:#4ade80}td.bad{color:#f87171}
.muted{color:#94a3b8;font-size:.75rem}
.tabs{display:flex;gap:.4rem;margin:.2rem 0 .35rem}
.tab{flex:1;padding:.35rem;font-size:.8rem;font-weight:600;color:#94a3b8;background:#0b1220;border:1px solid #334155;border-radius:.5rem}
.tab.on{color:#0f172a;background:#38bdf8;border-color:#38bdf8}
#check-now{width:100%;padding:.7rem;font-size:.9rem;font-weight:700;color:#0f172a;background:#38bdf8;border:0;border-radius:.6rem;margin-top:1rem}
#check-now:active{transform:scale(.98)}
@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
</style>
</head>
<body>
<div class="wrap">
<header>
<h1>SinaiCamps Status</h1>
<div id="status-pill" class="${overall}">${pillLabel}</div>
<form method="POST" action="/logout" style="margin:0"><button id="logout" type="submit" style="background:none;border:1px solid #334155;color:#94a3b8;border-radius:.5rem;padding:.3rem .7rem;font-size:.75rem">Log out</button></form>
</header>
<p class="muted" id="updated">updated ${escapeHtml(checked_at ?? 'never')}</p>
<button id="check-now" type="button">Check Now</button>
<div id="cards">${cards}</div>
<h2>Recent checks (last 20)</h2>
<table><thead><tr><th>time</th><th>target</th><th>state</th><th>http</th><th>ms</th></tr></thead>
<tbody id="checks">${checkRows || '<tr><td colspan="5" class="muted">no checks yet</td></tr>'}</tbody></table>
<h2>Recent reports</h2>
<div class="tabs" role="tablist">
<button type="button" role="tab" class="tab on" data-report-tab="errors" aria-selected="true">Errors</button>
<button type="button" role="tab" class="tab" data-report-tab="feedback" aria-selected="false">Feedback</button>
</div>
<table><thead><tr><th>time</th><th>kind</th><th>message</th><th>status</th></tr></thead>
<tbody id="reports"><tr><td colspan="4" class="muted" id="reports-state">Loading…</td></tr></tbody></table>
</div>
<script>
(function(){
var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function setPill(overall){
  var pill = document.getElementById('status-pill');
  pill.className = overall;
  pill.textContent = String(overall).toUpperCase();
}
function drawSpark(canvas, points){
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (!points.length) { ctx.fillStyle = '#64748b'; ctx.font = '12px system-ui'; ctx.fillText('no data', 8, 24); return; }
  var max = Math.max.apply(null, points.map(function(p){ return p.response_ms || 0; }).concat([1]));
  ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.5; ctx.beginPath();
  points.forEach(function(p, i){
    var x = (i / Math.max(points.length - 1, 1)) * (W - 8) + 4;
    var y = H - 6 - ((p.response_ms || 0) / max) * (H - 12);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.fillStyle = '#ef4444';
  points.forEach(function(p, i){
    if (!p.ok) {
      var x = (i / Math.max(points.length - 1, 1)) * (W - 8) + 4;
      var y = H - 6 - ((p.response_ms || 0) / max) * (H - 12);
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 7); ctx.fill();
    }
  });
  void reduceMotion;
}
async function refreshAll(){
  try {
    var s = await fetch('/api/status').then(function(r){ return r.json(); });
    setPill(s.overall);
    document.getElementById('updated').textContent = 'updated ' + (s.checked_at || 'never');
    (s.targets || []).forEach(function(t){
      var card = document.querySelector('[data-card="' + t.name + '"]');
      if (!card) return;
      var dot = card.querySelector('[data-f="dot"]');
      if (dot) dot.className = 'dot ' + (t.up ? 'up' : 'down');
      var set = function(k, v){ var el = card.querySelector('[data-f="' + k + '"]'); if (el) el.textContent = v; };
      set('uptime', t.uptime_24h == null ? '—' : t.uptime_24h + '%');
      set('ms', t.last_response_ms == null ? '—' : t.last_response_ms + ' ms');
      set('code', t.last_status == null ? '—' : String(t.last_status));
      set('err', t.last_error || '');
    });
    var sparks = document.querySelectorAll('[data-spark]');
    for (var i = 0; i < sparks.length; i++) {
      var name = sparks[i].getAttribute('data-spark');
      var h = await fetch('/api/history?target=' + encodeURIComponent(name) + '&hours=24').then(function(r){ return r.json(); });
      drawSpark(sparks[i], (h.checks || []).slice(-60));
    }
  } catch (e) {
    document.getElementById('updated').textContent = 'refresh failed — showing last render';
  }
}
// --- reports (fetched per tab, rendered as text nodes) ---
//
// LAZY PER TAB: nothing is fetched until a tab is opened, and each kind is
// fetched once per page view. The server no longer renders this list, so a page
// render costs no report read at all — which is the point: the old version paid
// a newest-first reports query on every dashboard load, including every load
// where nobody looked at the list.
//
// TEXT NODES, NEVER MARKUP. Report messages are user-submitted prose, so each
// cell is assigned through textContent, which cannot parse its input as HTML.
// Building rows out of markup instead would mean re-implementing escapeHtml
// inside the page — two escaping implementations to keep in step, one of them
// invisible to the server-side tests — and the page script would then contain an
// HTML-parsing sink, which a test cannot assert is absent while this comment
// names it. The rule is pinned in tests/api.test.js instead.
var REPORTS_PER_PAGE = 20;
var reportTabsLoaded = {};
function reportRow(values){
  var tr = document.createElement('tr');
  for (var i = 0; i < values.length; i++) {
    var td = document.createElement('td');
    td.textContent = values[i];
    tr.appendChild(td);
  }
  return tr;
}
function reportNotice(text){
  var tr = document.createElement('tr');
  var td = document.createElement('td');
  td.colSpan = 4;
  td.className = 'muted';
  td.textContent = text;
  tr.appendChild(td);
  return tr;
}
function renderReports(rows, truncated){
  var body = document.getElementById('reports');
  body.textContent = '';
  if (!rows.length) { body.appendChild(reportNotice('No recent reports')); return; }
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    body.appendChild(reportRow([
      r.received_at || '', r.kind || '',
      String(r.message == null ? '' : r.message).slice(0, 120),
      r.status || ''
    ]));
  }
  if (truncated) {
    // More reports exist than the listing walks. Say so, rather than let an
    // operator read this page as "nothing has been reported since".
    body.appendChild(reportNotice('Listing truncated — more reports exist than this view walks.'));
  }
}
async function openReportTab(kind, force){
  if (reportTabsLoaded[kind] && !force) return;
  var body = document.getElementById('reports');
  body.textContent = '';
  body.appendChild(reportNotice('Loading…'));
  var rows = [];
  var truncated = false;
  try {
    var res = await fetch('/api/reports?kind=' + encodeURIComponent(kind) + '&limit=' + REPORTS_PER_PAGE).then(function(r){ return r.json(); });
    rows = res.reports || [];
    truncated = !!res.truncated;
  } catch (e) {
    body.textContent = '';
    body.appendChild(reportNotice('Could not load reports — showing nothing'));
    reportTabsLoaded[kind] = true;
    return;
  }
  reportTabsLoaded[kind] = true;
  renderReports(rows, truncated);
}
function selectReportTab(kind){
  var tabs = document.querySelectorAll('[data-report-tab]');
  for (var i = 0; i < tabs.length; i++) {
    var on = tabs[i].getAttribute('data-report-tab') === kind;
    tabs[i].className = on ? 'tab on' : 'tab';
    tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
  }
  return openReportTab(kind);
}
(function(){
  var tabs = document.querySelectorAll('[data-report-tab]');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener('click', function(){ selectReportTab(this.getAttribute('data-report-tab')); });
  }
})();
document.getElementById('check-now').addEventListener('click', function(){
  // A manual refresh re-reads the OPEN tab as well — or "Check Now" would skip
  // the one panel an operator opens it to see.
  var open = document.querySelector('.tab.on[data-report-tab]');
  if (open) openReportTab(open.getAttribute('data-report-tab'), true);
  refreshAll();
});
// VISIBILITY-AWARE TIMER: a backgrounded tab still has its setInterval
// running (browsers only throttle it to ~1/min, they do not stop it), so every
// hidden dashboard kept hitting /api/status + N × /api/history for data nobody
// is looking at. The interval is stopped while document.hidden and restarted on
// visibilitychange, with one immediate refresh on return — a tab left open
// overnight must show current numbers, not whatever it last rendered before the
// tab was backgrounded. "Check Now" is unaffected: it is a user gesture, so it
// refreshes even while hidden.
var REFRESH_MS = 60000;
var timer = null;
function stopTimer(){ if (timer !== null) { clearInterval(timer); timer = null; } }
function startTimer(){ if (timer === null) timer = setInterval(refreshAll, REFRESH_MS); }
document.addEventListener('visibilitychange', function(){
  if (document.hidden) { stopTimer(); return; }
  startTimer();
  refreshAll();
});
if (document.hidden) stopTimer(); else startTimer();
refreshAll();
})();
// The Errors tab is the default view, so it opens — and fetches — with the page.
openReportTab('errors');
</script>
</body>
</html>`;
}

// 6-digit PIN login (form-friendly). GET renders the keypad form; POST checks
// DASHBOARD_PIN constant-time and issues the signed session cookie.
// Brute-force gate: 5 failed attempts per 5 minutes per IP (cf-connecting-ip
// only), then 429 `rate limit exceeded`; every POST records one outcome against
// that IP's `state/login_attempts/<ipHash>.json` (failures + rate-limited alike,
// and a success stamp — timestamps only, never the PIN, never the raw address).
// Trust-device checkbox extends the cookie Max-Age from 12h (43200) to 90d
// (7776000). The PIN never appears in a URL and is never logged.
// Secrets via `wrangler secret put` — never in wrangler.toml [vars],
// never logged, never echoed.
export function isPinConfigured(env) {
  const pin = env?.DASHBOARD_PIN;
  return typeof pin === 'string' && /^\d{6}$/.test(pin);
}

app.get('/login', async (c) => {
  if (!isPinConfigured(c.env)) return c.html(buildUnconfiguredHtml(), 500);
  if (await hasValidSession(c)) return c.redirect('/', 302);
  return c.html(buildLoginHtml());
});

app.post('/login', async (c) => {
  if (!isPinConfigured(c.env)) return c.json({ error: 'dashboard pin not configured' }, 500);
  if (!hasCsrfHeader(c)) return c.json({ error: 'csrf required' }, 400);
  const ip = getClientIp(c);
  const now = new Date();
  // The gate is consulted BEFORE the body is read, exactly as the attempt count
  // used to be: a spent budget answers 429 whatever the request body is (even a
  // malformed one), and it costs one small object read rather than a query.
  // `triesLeft` below is derived from the SAME read, so the number in the 401
  // and the counter the gate just wrote cannot disagree.
  const gate = await readLoginGate(c.env, ip, now);
  if (gate.locked) {
    await recordLoginOutcome(c.env, ip, { success: false }, now);
    return c.json({ error: 'rate limit exceeded' }, 429);
  }
  let pin = '';
  let trust = false;
  const contentType = c.req.header('content-type') ?? '';
  const raw = await c.req.text();
  if (contentType.includes('application/json')) {
    let body;
    try {
      body = JSON.parse(raw || '{}');
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400);
    }
    pin = typeof body?.pin === 'string' ? body.pin : '';
    trust = body?.trust === true || body?.trust === 1 || body?.trust === '1' || body?.trust === 'on';
  } else {
    const params = new URLSearchParams(raw);
    pin = params.get('pin') ?? '';
    const trustRaw = params.get('trust') ?? '';
    trust = trustRaw === '1' || trustRaw === 'on' || trustRaw === 'true';
  }
  if (!pin) return c.json({ error: 'pin is required' }, 400);
  const ok = timingSafeEqual(pin, c.env.DASHBOARD_PIN);
  await recordLoginOutcome(c.env, ip, { success: ok });
  if (!ok) {
    const triesLeft = Math.max(0, LOGIN_FAIL_LIMIT - gate.count - 1);
    return c.json({ error: `Wrong PIN, ${triesLeft} tries left` }, 401);
  }
  const session = await signSession(c.env.DASHBOARD_PIN, Date.now());
  c.header('Set-Cookie', buildSessionCookie(session, trust));
  return c.redirect('/', 302);
});

app.post('/logout', (c) => {
  if (!hasCsrfHeader(c)) return c.json({ error: 'csrf required' }, 400);
  c.header('Set-Cookie', clearSessionCookie());
  return c.redirect('/login', 302);
});

// Cookie-session operator dashboard. Requires a fresh `monitor_session`
// cookie from POST /login (signed with DASHBOARD_PIN, 90d verify window;
// cookie Max-Age 12h default, 90d trusted). The old `?token=` bookmark is
// deleted — query tokens never authenticate, and the PIN never appears in
// a URL. Unauthenticated browsers redirect to /login (302); the PIN itself
// is set via `wrangler secret put` — never in wrangler.toml [vars].
app.get('/', async (c) => {
  if (!isPinConfigured(c.env)) return c.html(buildUnconfiguredHtml(), 500);
  if (!(await hasValidSession(c))) {
    return c.redirect('/login', 302);
  }
  const agg = await readStatusAggregate(c.env);
  const recentChecks = await readRecentChecks(c.env, 20);
  return c.html(buildDashboardHtml({ ...agg, recentChecks }));
});

app.notFound((c) => c.json({ error: 'not found' }, 404));
app.onError((err, c) => {
  console.error('monitor request failed', err?.message ?? err);
  return c.json({ error: 'internal error' }, 500);
});

// Webhook destination for down/recovery alerts. ALERT_WEBHOOK_URL is primary;
// TELEGRAM_WEBHOOK_URL is accepted as an alias (Telegram proxy URL or bot API
// endpoint). Set via `wrangler secret put` — never in wrangler.toml [vars].
// Missing/empty means alerts are state-tracked but never sent (silent skip:
// the cron run must never crash for lack of webhook config).
export function getWebhookUrl(env) {
  return env?.ALERT_WEBHOOK_URL || env?.TELEGRAM_WEBHOOK_URL || null;
}

// POST one alert payload. Resolves { sent:true } / { skipped:true } — never
// throws, so a dead webhook endpoint can't fail the cron run either.
export async function sendAlert(env, { target, url, event, statusCode, errorMessage }, fetchFn = fetch) {
  const webhookUrl = getWebhookUrl(env);
  if (!webhookUrl) return { skipped: true };
  const text =
    event === 'recovery'
      ? `✅ campmaster-monitor: ${target} RECOVERED (${url})`
      : `🔴 campmaster-monitor: ${target} is DOWN (${url})${statusCode != null ? ` — HTTP ${statusCode}` : ''}${errorMessage ? ` — ${errorMessage}` : ''}`;
  try {
    await fetchFn(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'campmaster-monitor/1.0' },
      body: JSON.stringify({
        event,
        target,
        url,
        text,
        status_code: statusCode ?? null,
        error_message: errorMessage ?? null,
        checked_at: new Date().toISOString(),
      }),
    });
    return { sent: true };
  } catch {
    return { skipped: true };
  }
}

// Consecutive failed runs before a target is announced DOWN. Same number the
// last three rows used to imply — it is the alert latency
// floor: one bad 5-minute probe is noise, three is an outage.
export const ALERT_FAIL_THRESHOLD = 3;

// Evaluate alert transitions AFTER the run object is written:
//   - 3 consecutive failed runs + not already down → send "down"
//   - a healthy run while down → send "recovery"
//   - otherwise → counter bookkeeping only, no webhook.
//
// THE COUNTER IS THE STATE, NOT A RE-DERIVATION. The last version re-read the
// three most recent probe rows on every target on every run (5 targets x a query
// per 5 minutes, forever). Here `state/alert_state.json` carries
// `consecutive_failures`, so "3 in a row" is a single read of one small object
// and a single write back — no history read at all. One deliberate difference
// from the old rules, and it is the owner's chosen rule: recovery fires on the
// FIRST healthy run after a down, where the previous rules required three. A
// down alert is a
// human-visible claim ("this is broken"); the recovery that retracts it should
// arrive as soon as the claim stops being true.
//
// `probeResults` scopes evaluation (subset of TARGETS); omit it to evaluate all
// configured targets. A target that is NOT in `probeResults` (a single-target
// manual run) keeps its entry untouched — its entry is NOT reset, because
// "not probed" is not "healthy".
export async function evaluateAlerts(env, probeResults, fetchFn = fetch, now = new Date()) {
  const names = (probeResults ?? []).map((r) => r.name);
  const fullRun = names.length === 0;
  const list = fullRun ? TARGETS : TARGETS.filter((t) => names.includes(t.name));
  const byName = new Map((probeResults ?? []).map((r) => [r.name, r]));

  // Read the whole document once. A corrupt/unreadable body THROWS out of
  // readJson (see storage.js) — which fails this whole step instead of silently
  // writing back an empty state that would lose `last_state: 'down'`.
  const previous = await readJson(env.MONITOR_BUCKET, alertStateKey(), {});
  const state = { ...(previous && typeof previous === 'object' ? previous : {}) };

  const outcomes = [];
  for (const target of list) {
    const row = byName.get(target.name);
    // No result for this target in this run: carry the entry forward verbatim.
    if (!row) {
      const carried = state[target.name];
      outcomes.push({
        target: target.name,
        event: null,
        notified: false,
        alerting: carried?.last_state === 'down',
        consecutiveFailures: carried?.consecutive_failures ?? 0,
      });
      continue;
    }
    const prev = state[target.name] ?? null;
    const healthy = row.ok === 1;
    const consecutiveFailures = healthy ? 0 : (prev?.consecutive_failures ?? 0) + 1;
    const wasDown = prev?.last_state === 'down';
    let event = null;
    if (!healthy && consecutiveFailures >= ALERT_FAIL_THRESHOLD && !wasDown) event = 'down';
    else if (healthy && wasDown) event = 'recovery';
    const lastState = event === 'down' ? 'down' : healthy ? 'up' : (prev?.last_state ?? 'up');
    state[target.name] = {
      last_state: lastState,
      consecutive_failures: consecutiveFailures,
      updated_at: now.toISOString(),
    };
    let notified = false;
    if (event) {
      const res = await sendAlert(
        env,
        {
          target: target.name,
          url: target.url,
          event,
          statusCode: row.statusCode ?? null,
          errorMessage: row.errorMessage ?? null,
        },
        fetchFn,
      );
      notified = !!res.sent;
    }
    outcomes.push({
      target: target.name,
      event,
      notified,
      alerting: lastState === 'down',
      consecutiveFailures,
    });
  }

  // Drop entries for targets that are no longer configured — the R2 form of the
  // `pruneStaleAlertState` DELETE. ONLY on a full run: a single-target manual
  // run must not delete the other five targets' alert state, or one operator
  // clicking "check this host" would erase the outage history of everything
  // else. Entries accumulate at most one per removed target name, so this is
  // belt-and-braces on a file that is rewritten every run anyway.
  if (fullRun) {
    for (const key of Object.keys(state)) {
      if (!TARGETS.some((t) => t.name === key)) delete state[key];
    }
  }

  await writeJson(env.MONITOR_BUCKET, alertStateKey(), state);
  return outcomes;
}

// Rolling 24h uptime rollup, rewritten in place on every run.
//
// OWNER-APPROVED ADDITION over a literal port of the old aggregate. It
// answered "what fraction of this target's checks in the last 24h were ok" with
// one indexed count per target; the R2 equivalent is "walk 24h of run
// objects" = 288 objects at the 5-minute cadence, x 5 targets, on every cached
// miss of the PUBLIC `/api/status` route. That is the read fan-out this
// rollup exists to remove: one small object read replaces up to 288.
//
// Shape: `runs[]` is the per-run evidence (the minimum needed to expire the
// window), `targets{}` is the aggregate `/api/status` actually reads. Keeping
// both means a reader never has to re-sum 288 entries, and the window can still
// be rolled forward without trusting a stored total.
export const SUMMARY_WINDOW_HOURS = 24;

// Ceiling on the retained `runs` entries. At the cron cadence 24h is 288 runs,
// so this only bites if an operator hammers POST /internal/check (every manual
// run appends an entry). Dropping the OLDEST is the right truncation: the
// window is a rolling "recent" view, and the newest entries are the ones a
// reader needs.
export const SUMMARY_MAX_RUNS = 1000;

export async function updateSummary(env, results, now = new Date()) {
  const windowMs = SUMMARY_WINDOW_HOURS * 60 * 60 * 1000;
  const nowMs = new Date(now).getTime();
  const previous = await readJson(env.MONITOR_BUCKET, summaryKey(), null);
  const prior = Array.isArray(previous?.runs) ? previous.runs : [];

  // Strictly inside the window: a run exactly 24h old has expired, matching the
  // `isOlderThan` boundary the sweep uses.
  const runs = prior.filter((r) => {
    const t = Date.parse(r?.run_at ?? '');
    return Number.isFinite(t) && nowMs - t < windowMs;
  });

  const ok = {};
  for (const r of results ?? []) ok[r.name] = r.ok === 1 ? 1 : 0;
  runs.push({ run_at: new Date(now).toISOString(), ok });
  const trimmed = runs.length > SUMMARY_MAX_RUNS ? runs.slice(-SUMMARY_MAX_RUNS) : runs;

  const targets = {};
  for (const run of trimmed) {
    for (const [name, wasOk] of Object.entries(run.ok ?? {})) {
      const bucket = (targets[name] ??= { okCount: 0, totalCount: 0 });
      bucket.totalCount += 1;
      if (wasOk) bucket.okCount += 1;
    }
  }

  await writeJson(env.MONITOR_BUCKET, summaryKey(), {
    updated_at: new Date(now).toISOString(),
    window_hours: SUMMARY_WINDOW_HOURS,
    targets,
    runs: trimmed,
  });
  return targets;
}

// Rolling per-target check ring, rewritten in place on every run: the stored
// document `/api/history` reads instead of walking run objects.
//
// WHY THIS EXISTS, in the only terms that matter: R2 has no range read, so
// serving a WINDOW means reading every object the window covers. At the 5-minute
// cron cadence `hours=24` is 288 run objects, and the Workers free plan allows
// 50 subrequests per invocation — so a literal port of the range query does
// not merely cost more, it FAILS, and it would fail inside the dashboard's
// per-card loop of six requests. (Same reasoning, same shape as
// `updateSummary` above: one small object read replaces a walk that no longer
// fits in an invocation.)
//
// The ring is trimmed to the widest window the endpoint will serve
// (`HISTORY_MAX_WINDOW_HOURS`) and capped at the number of entries it can return
// (`HISTORY_MAX_ENTRIES`), so it never stores a sample no request could be
// answered with. Trimming by age keeps the document proportional to the window
// instead of to uptime; the cap is what bounds it if an operator hammers
// `/internal/check` (every manual run appends).
//
// THE SAME FOUR FIELDS `/api/history` PROJECTS, and the same names the old
// columns had — no `error_message`, which the endpoint never returned.
//
// "NOT PROBED" IS NOT A NEW ENTRY, mirroring `evaluateAlerts`: a target missing
// from `results` (a single-target manual run) is SKIPPED rather than appended as
// a healthy sample, because the run carried no observation of it and inventing
// one would draw a straight line on its sparkline across a check that never
// happened.
export async function updateHistoryRing(env, results, now = new Date()) {
  const at = new Date(now);
  const nowMs = at.getTime();
  const windowMs = HISTORY_MAX_WINDOW_HOURS * 60 * 60 * 1000;
  const byName = new Map((results ?? []).map((r) => [r.name, r]));
  const written = [];
  for (const target of TARGETS) {
    const row = byName.get(target.name);
    if (!row) continue;
    const previous = await readJson(env.MONITOR_BUCKET, historyKey(target.name), null);
    const prior = Array.isArray(previous?.entries) ? previous.entries : [];
    // Strictly inside the window, matching `isOlderThan`'s boundary: an entry
    // exactly 48h old is already unanswerable, so keeping it would store bytes
    // no request can return.
    const kept = prior.filter((e) => {
      const t = Date.parse(e?.checked_at ?? '');
      return Number.isFinite(t) && nowMs - t < windowMs;
    });
    kept.push({
      checked_at: at.toISOString(),
      status_code: row.statusCode ?? null,
      ok: row.ok ? 1 : 0,
      response_ms: row.responseMs ?? null,
    });
    const entries = kept.length > HISTORY_MAX_ENTRIES ? kept.slice(-HISTORY_MAX_ENTRIES) : kept;
    await writeJson(env.MONITOR_BUCKET, historyKey(target.name), {
      target: target.name,
      updated_at: at.toISOString(),
      entries,
    });
    written.push(target.name);
  }
  return written;
}

// Cron retention sweep over the R2 layout, replacing the row DELETEs that used
// to prune it: probe-run objects older than 14 days, intake-report objects (both
// kinds) older than 30, and per-IP PIN gate counters untouched for a day.
//
// `state/` IS NEVER SWEPT, except that one sub-collection: the alert state, the
// rollup and the per-target rings are not dated, are rewritten in place, and
// "old" versions of them are exactly the state that must survive a quiet
// period. A gate counter is the opposite — nothing reads it past its 5-minute
// window, so its age is meaningless and sweeping it is what bounds the key count.
//
// DAILY, AT UTC HOUR 0. The row-based version could run every 5 minutes because
// a bounded indexed `DELETE` is cheap. A sweep here must LIST keys (up to ~4,000
// for checks alone at the retention floor), which is paginated and not free, so
// it runs once a day — and at hour 0 in UTC, the same clock the day buckets and
// the retention cutoffs are built on, so "the first run of a new UTC day" is a
// fact rather than a coincidence. Every one of the 12 daily runs that lands
// inside hour 0 (the cron fires every 5 minutes) does the sweep; that is
// idempotent and costs 12 listings a day, far cheaper than a state flag that
// could be lost and strand an unbounded bucket.
//
// BEST-EFFORT BY DESIGN, one try/catch PER STEP — the same posture as
// `sendAlert()`, and the same reason: this cron is what produces the alert that
// would REPORT a broken bucket, so a prune failure must not silence it. Per-step
// rather than one wrapper, so a failing step cannot skip the remaining ones.
export async function runRetention(env, now = new Date()) {
  if (new Date(now).getUTCHours() !== 0) {
    return { skipped: true, reason: 'not-utc-hour-0' };
  }
  const steps = [
    ['checks', `${CHECKS_PREFIX}/`, CHECKS_RETENTION_DAYS],
    ...REPORT_KINDS.map((kind) => [`reports/${kind}`, reportsPrefix(kind), REPORTS_RETENTION_DAYS]),
    ['login_attempts', loginAttemptsPrefix(), LOGIN_ATTEMPTS_RETENTION_DAYS],
  ];
  const deleted = {};
  for (const [name, prefix, days] of steps) {
    try {
      const objects = await listAll(env.MONITOR_BUCKET, { prefix });
      // Age comes from the LISTING's `uploaded`, so deciding what to delete
      // costs no per-object HEAD.
      const stale = objects.filter((o) => isOlderThan(o.uploaded, now, days)).map((o) => o.key);
      deleted[name] = await deleteKeys(env.MONITOR_BUCKET, stale);
    } catch (err) {
      console.error('monitor retention step failed', name, err?.message ?? err);
      deleted[name] = null;
    }
  }
  return deleted;
}

// Cron entry: probe every target, store the run as ONE object, evaluate alert
// transitions, fold the run into the 24h rollup and the per-target rings, and
// run the daily R2 sweep. Runs every 5 minutes via the [triggers] crons
// schedule in wrangler.toml.
//
// This is the WHOLE data path: the worker binds an object bucket and nothing
// else, so there is no statement to prune here any more — the gate counters the
// cron used to age out are swept by `runRetention` like every other dated key.
//
// FAILURE POSTURE, per step and deliberately not uniform:
//   - probe + write + alerts stay UNWRAPPED. A failure there means the monitor
//     did not do its job; swallowing it would turn a broken probe path into a
//     silently stale dashboard.
//   - the rollups and the sweep are WRAPPED each in their own try/catch. All
//     are derived/maintenance data with a correct answer on the next run, and
//     none is allowed to cancel the alerting above them. (This split is
//     inherited unchanged: retention steps were always per-step guarded, the
//     probe/alert half was not.)
async function scheduled(event, env, ctx) {
  const now = new Date();
  const results = await runProbeCycle(env, fetch, now);
  await evaluateAlerts(env, results, fetch, now);
  try {
    await updateSummary(env, results, now);
  } catch (err) {
    console.error('monitor summary update failed', err?.message ?? err);
  }
  // Its own try/catch, and its own log line, for the same reason as the summary
  // above: a ring that missed one run still answers `/api/history` correctly for
  // the samples it holds, so it must not be able to cancel the cron.
  try {
    await updateHistoryRing(env, results, now);
  } catch (err) {
    console.error('monitor history ring update failed', err?.message ?? err);
  }
  await runRetention(env, now);
}

export default { fetch: app.fetch, scheduled };
export { app, scheduled };
