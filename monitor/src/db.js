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
export async function getLatestPerTarget(db) {
  const res = await db
    .prepare(
      `SELECT target, status_code, ok, response_ms, error_message, checked_at
       FROM checks
       WHERE id IN (SELECT MAX(id) FROM checks GROUP BY target)`,
    )
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
