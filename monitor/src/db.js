import { TARGETS } from './targets.js';

// D1 query helpers for the monitor worker. Every helper takes the D1 binding
// (`env.DB`) as its first argument so routes stay thin and tests can pass a stub.
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

// One row per probe run.
export async function recordCheck(db, { target, statusCode, ok, responseMs, errorMessage }) {
  await db
    .prepare(
      'INSERT INTO checks (target, status_code, ok, response_ms, error_message) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(target, statusCode, ok ? 1 : 0, responseMs, errorMessage ?? null)
    .run();
}

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

// Oldest-first last-N rows for one target (used by alert evaluation).
export async function getLastNChecks(db, target, n) {
  const res = await db
    .prepare(
      `SELECT status_code, ok, response_ms, error_message, checked_at
       FROM (SELECT * FROM checks WHERE target = ? ORDER BY id DESC LIMIT ?)
       ORDER BY checked_at ASC`,
    )
    .bind(target, n)
    .all();
  return res.results ?? [];
}

// Alert-state row for one target, or null when never evaluated.
export async function getAlertState(db, target) {
  const row = await db
    .prepare(
      `SELECT target, consecutive_failures, alerting, last_alert_at, updated_at
       FROM alert_state WHERE target = ?`,
    )
    .bind(target)
    .first();
  return row ?? null;
}

// Upsert per-target alert state. `lastAlertAt` is a "YYYY-MM-DD HH:MM:SS" UTC
// string (SQLite form, like `checked_at`) or null when no transition fired.
export async function upsertAlertState(db, target, { consecutiveFailures, alerting, lastAlertAt }) {
  await db
    .prepare(
      `INSERT INTO alert_state (target, consecutive_failures, alerting, last_alert_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(target) DO UPDATE SET
         consecutive_failures = excluded.consecutive_failures,
         alerting = excluded.alerting,
         last_alert_at = excluded.last_alert_at,
         updated_at = datetime('now')`,
    )
    .bind(target, consecutiveFailures, alerting ? 1 : 0, lastAlertAt ?? null)
    .run();
}

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

// --- Retention policy (unbounded-growth guard for the cron-written tables) ---
//
// `checks` gains one row per target every 5 minutes and nothing ever removed
// one, so the probe table grew forever — the growth that made FIX A/B/C query
// work necessary in the first place. Retention is the other half of that fix:
// bound the table so the indexed reads stay cheap, instead of only making each
// read cheaper.
//
// WINDOWS ARE BOUNDED BY WHAT THE DASHBOARD RENDERS, not by taste:
//   - `/api/history` clamps `hours` to 1–168 (`src/index.js`) and uptime is a
//     24h window, so the widest thing any reader can ask for is 7 days. A
//     14-day floor on `checks` can therefore never blank a rendered window —
//     there is always at least a week of headroom above the largest query.
//   - `reports` has no time-windowed UI (the dashboard shows the newest 20 by
//     id), so it can afford a much longer 30-day window before pruning.
export const CHECKS_RETENTION_DAYS = 14;
export const REPORTS_RETENTION_DAYS = 30;

// Both prune windows are BOUND parameters, never interpolated SQL (same
// pattern as `getHistory`), so the constants above are the single source of
// truth and the statements stay injection-free by construction.
const checksWindow = () => `-${CHECKS_RETENTION_DAYS} days`;

// Delete probe rows older than the retention window.
//
// Plan: `SEARCH checks USING INDEX idx_checks_checked_at (checked_at<?)` —
// this predicate depends on FIX A's SINGLE-COLUMN index. `0001_init`'s
// `idx_checks_target_checked` cannot serve it, because `target` is
// unconstrained here and leads that index, so the delete degrades to a full
// table scan without `idx_checks_checked_at`.
//
// Strict `<`, so a row exactly at the cutoff survives; the next run re-evaluates
// it against a moved `now`. `checks` is never truncated by a fixed LIMIT, which
// would make the amount of work per run depend on how far behind it had fallen.
export async function pruneOldChecks(db) {
  return db
    .prepare(`DELETE FROM checks WHERE checked_at < datetime('now', ?)`)
    .bind(checksWindow())
    .run();
}

// Delete intake reports older than the retention window. Strict `<`, same
// boundary semantics as `pruneOldChecks`.
//
// Plan: `SCAN reports` — the only reports index is
// `idx_reports_status_created (status, created_at)` and `status` is
// unconstrained here, so this is a full scan of a small, slowly-growing
// user-intake table (one row per submitted report, not per probe run). A
// dedicated `created_at` index would fix the plan and is deliberately NOT
// added: it is another write on every intake row, for a table two orders of
// magnitude smaller than `checks`. Revisit if report volume ever grows to
// where a 5-minute scan is measurable.
export async function pruneOldReports(db) {
  return db
    .prepare(`DELETE FROM reports WHERE created_at < datetime('now', ?)`)
    .bind(`-${REPORTS_RETENTION_DAYS} days`)
    .run();
}

// Delete `alert_state` rows whose target has no check inside the checks
// retention window — i.e. state for a target that is no longer probed.
//
// Two things make this safe to run every cron tick:
//   - `evaluateAlerts` upserts a row for every CURRENT `TARGETS` entry BEFORE
//     this runs, and the probe cycle has just written a fresh `checks` row for
//     each of them, so every live target is definitionally "recently checked"
//     and can never be pruned.
//   - The window is the SAME 14 days `pruneOldChecks` uses, so the rule reads
//     the table in its post-prune state: any check old enough to have been
//     deleted cannot also vouch for an alert_state row. That keeps the two
//     steps from disagreeing and makes the whole retention pass idempotent.
//
// Plan: `SCAN alert_state` + a correlated `SEARCH c USING COVERING INDEX
// idx_checks_target_checked_desc (target=? AND checked_at>?)`. The outer scan
// is bounded by the number of configured targets (one row per target, PRIMARY
// KEY), not by table age, so it does not grow the way `checks` did.
export async function pruneStaleAlertState(db) {
  return db
    .prepare(
      `DELETE FROM alert_state
       WHERE NOT EXISTS (
         SELECT 1 FROM checks c
         WHERE c.target = alert_state.target
           AND c.checked_at >= datetime('now', ?)
       )`,
    )
    .bind(checksWindow())
    .run();
}
