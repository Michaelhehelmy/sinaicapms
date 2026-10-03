import { TARGETS } from './targets.js';

// D1 query helpers for the monitor worker. Every helper takes the D1 binding
// (`env.DB`) as its first argument so routes stay thin and tests can pass a stub.
//
// SCOPE AFTER THE R2 MIGRATION (2026-10-03, phase 2): this module is the
// READ side plus `login_attempts`, and nothing else. Every WRITE for probe
// history, alert state, and intake reports moved to R2 (`src/storage.js`), and
// the three D1 retention DELETEs were superseded by the R2 key sweep in
// `index.js#runRetention` — an R2 sweep deletes objects by key, so there is no
// `DELETE ... WHERE` left to write here. What remains:
//   - probe reads (`getLatestPerTarget`, `getLastCheckTime`, `getUptimeSince`,
//     `getHistory`) — still served from D1, migrating to R2 in phase 3;
//   - intake report reads (`getRecentReports`, `getRecentChecks`) — phase 4/5;
//   - the PIN gate (`recordLoginAttempt`, `getRecentFailCount`,
//     `clearOldLoginAttempts`) — the last D1-only feature, phase 6.
// The removed helpers are gone rather than left dead: an unused D1 write path is
// exactly what phase 6's `grep env.DB` gate is meant to catch, so keeping one
// "just in case" would make the migration unprovable.
//
// Time storage note: the schema defaults `checked_at` to SQLite
// `datetime('now')` ("YYYY-MM-DD HH:MM:SS" UTC). `toIso()` converts that form
// to ISO-8601 on the way out; values that already look like ISO pass through.

// "YYYY-MM-DD HH:MM:SS" -> "YYYY-MM-DDTHH:MM:SSZ". ISO input passes through.
export function toIso(value) {
  if (value == null) return null;
  const s = String(value);
  if (s.includes('T')) return s;
  return `${s.replace(' ', 'T')}Z`;
}

function rowToCheck(row) {
  return {
    status_code: row.status_code,
    ok: row.ok,
    response_ms: row.response_ms,
    checked_at: toIso(row.checked_at),
  };
}

// `recordCheck` used to live here (one INSERT per target per run). It moved to
// R2 with the rest of the probe write path — see `writeRunResults` in
// `index.js`, which stores the whole run as ONE object instead of 5 rows.

// Newest check row per target (raw rows, includes target + error_message).
//
// PERFORMANCE (2026-09-30): this was `WHERE id IN (SELECT MAX(id) FROM checks
// GROUP BY target)`, which plan-decompiles to
//   SEARCH checks USING INTEGER PRIMARY KEY (rowid=?)
//   LIST SUBQUERY 1
//   SCAN checks USING COVERING INDEX idx_checks_target_id   <- O(rows)
//   CREATE BLOOM FILTER
// The outer probe set (one id per target) is only obtainable by walking the
// whole (target, id DESC) index, so the query is O(rows) in the probe table
// even though it returns one row per target. `checks` grows ~1 row/target per
// probe cycle, so this is the query that degrades fastest as uptime accrues.
//
// D1 does not run ANALYZE, so `sqlite_stat1` is absent and SQLite cannot skip-
// scan the probe set; the O(rows) covering scan is therefore unavoidable in
// ANY self-contained form (verified: `DISTINCT target`, `GROUP BY target`,
// and a correlated `MAX(id)` rewrite all still emit `SCAN ... USING COVERING
// INDEX idx_checks_target_id`).
//
// The probe set does not need to come from the table at all: `TARGETS` lives in
// code (`src/targets.js`), so we drive one bounded index SEARCH per configured
// target instead of scanning for the target list:
//
//   SEARCH checks USING INDEX idx_checks_target_id (target=?)
//
// That is O(targets * log(rows)) with no scan, measured flat at ~0.011 ms/run
// from 5k to 320k rows (vs 5.2 ms -> 38 ms for the old form). A configured
// target with no rows yet simply contributes zero rows, which matches the old
// `IN (...)` form: a target absent from `checks` was never in the result set.
// Callers pair rows with `TARGETS` by name, so row order is irrelevant and the
// wire shape (the six projected fields, per target) is unchanged.
const LATEST_PER_TARGET_BRANCH =
  'SELECT target, status_code, ok, response_ms, error_message, checked_at\n' +
  '       FROM checks WHERE target = ? ORDER BY id DESC LIMIT 1';

export async function getLatestPerTarget(db, targets = TARGETS) {
  const names = targets.map((t) => (typeof t === 'string' ? t : t.name));
  if (!names.length) return [];
  const sql = names.map(() => `SELECT * FROM (\n${LATEST_PER_TARGET_BRANCH}\n)`).join('\nUNION ALL\n');
  const res = await db
    .prepare(sql)
    .bind(...names)
    .all();
  return res.results ?? [];
}

// ISO time of the most recent check run across all targets, or null when empty.
export async function getLastCheckTime(db) {
  const row = await db.prepare('SELECT MAX(checked_at) AS last_check FROM checks').first();
  return row?.last_check ?? null;
}

// 24h-style uptime percentage for one target since `sinceSqliteUtc`
// ("YYYY-MM-DD HH:MM:SS"). Null when there are no rows in the window.
export async function getUptimeSince(db, target, sinceSqliteUtc) {
  const row = await db
    .prepare('SELECT COUNT(*) AS total, COALESCE(SUM(ok), 0) AS ok_count FROM checks WHERE target = ? AND checked_at >= ?')
    .bind(target, sinceSqliteUtc)
    .first();
  const total = row?.total ?? 0;
  if (!total) return null;
  return Math.round(((row.ok_count ?? 0) / total) * 1000) / 10;
}

// History for one target over the last `hours` hours, oldest first, max `limit`.
export async function getHistory(db, target, hours, limit = 500) {
  const res = await db
    .prepare(
      `SELECT status_code, ok, response_ms, checked_at
       FROM checks
       WHERE target = ? AND checked_at >= datetime('now', ?)
       ORDER BY checked_at ASC
       LIMIT ?`,
    )
    .bind(target, `-${hours} hours`, limit)
    .all();
  return (res.results ?? []).map(rowToCheck);
}

// `getLastNChecks`, `getAlertState`, and `upsertAlertState` used to live here.
// All three moved to R2: alert evaluation now reads and rewrites ONE
// `state/alert_state.json` document and derives "3 consecutive failures" from
// the counter inside it, instead of re-reading the last three rows per target on
// every run. See `evaluateAlerts` in `index.js`.

// --- A.4 intake + dashboard helpers (append-only; A.3 helpers above untouched) ---

// Insert one intake row (`kind` is 'error' or 'feedback'). Returns the new row
// id (D1 `meta.last_row_id`) or null when the driver omits it.
export async function insertReport(db, { kind, message, pageUrl, contact }) {
  const res = await db
    .prepare('INSERT INTO reports (kind, message, page_url, contact) VALUES (?, ?, ?, ?)')
    .bind(kind, message, pageUrl ?? null, contact ?? null)
    .run();
  return res?.meta?.last_row_id ?? null;
}

// Newest-first intake rows, max `limit`. Server-rendered into the dashboard
// "Recent reports" list; ISO times via toIso().
export async function getRecentReports(db, limit = 20) {
  const res = await db
    .prepare(
      `SELECT id, kind, message, page_url, contact, status, created_at
       FROM reports
       ORDER BY id DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all();
  return (res.results ?? []).map((row) => ({ ...row, created_at: toIso(row.created_at) }));
}

// Newest-first probe rows across all targets, max `limit`. Server-rendered
// into the dashboard "Recent checks" list; ISO times via toIso().
export async function getRecentChecks(db, limit = 20) {
  const res = await db
    .prepare(
      `SELECT target, status_code, ok, response_ms, error_message, checked_at
       FROM checks
       ORDER BY id DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all();
  return (res.results ?? []).map((row) => ({ ...row, checked_at: toIso(row.checked_at) }));
}

// --- PIN login gate helpers (append-only; helpers above untouched) ---
//
// One row per POST /login attempt (success AND failure AND rate-limited).
// Only the outcome bit is stored — never the PIN value or hash. `ip` is
// cf-connecting-ip only (never x-forwarded-for).

// Insert one login-attempt row. `success` is truthy on correct PIN.
export async function recordLoginAttempt(db, { ip, success }) {
  await db
    .prepare('INSERT INTO login_attempts (ip, success) VALUES (?, ?)')
    .bind(ip, success ? 1 : 0)
    .run();
}

// Count of FAILED attempts for `ip` in the last 5 minutes (the brute-force
// budget for POST /login: 5 fails per 5 min per IP, then 429). Returns 0
// when there are none.
export async function getRecentFailCount(db, ip) {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS fail_count FROM login_attempts
       WHERE ip = ? AND success = 0 AND attempted_at >= datetime('now', '-5 minutes')`,
    )
    .bind(ip)
    .first();
  return row?.fail_count ?? 0;
}

// Delete attempt rows older than 1 hour (keeps the 5-min gate window plus
// headroom; runs from scheduled() so the table stays small). Returns the
// driver result.
export async function clearOldLoginAttempts(db) {
  return db
    .prepare(`DELETE FROM login_attempts WHERE attempted_at < datetime('now', '-1 hour')`)
    .run();
}

// --- Retention policy (2026-10-03: R2, not D1) ---
//
// This section used to hold three DELETE statements (`pruneOldChecks`,
// `pruneOldReports`, `pruneStaleAlertState`) plus the two window constants, all
// backed by real query plans (index SEARCH vs full SCAN) and a real-SQLite test.
//
// After the R2 migration there is nothing to DELETE here. `checks` and `reports`
// are immutable OBJECTS whose age lives in the R2 key and the listing's
// `uploaded`, so retention is "list the prefix, delete what is over-age" —
// `runRetention` in `index.js` — with the same 14-day / 30-day windows, now
// defined in `src/storage.js` (`CHECKS_RETENTION_DAYS`, `REPORTS_RETENTION_DAYS`)
// beside the key layout they govern. The orphaned-`alert_state` rule is gone
// too: alert state is ONE document keyed by target, so `evaluateAlerts` drops
// entries for unconfigured targets on every full run instead of needing a
// separate sweep query.
//
// The windows themselves are unchanged and keep their original justification:
// `/api/history` clamps `hours` to 1–168 and uptime is a 24h window, so the
// widest thing any reader can ask for is 7 days and a 14-day floor on checks
// can never blank a rendered window; `reports` has no time-windowed UI and can
// afford 30 days.
