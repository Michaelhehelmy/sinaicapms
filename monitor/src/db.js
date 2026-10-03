// D1 query helpers for the monitor worker. Every helper takes the D1 binding
// (`env.DB`) as its first argument so routes stay thin and tests can pass a stub.
//
// SCOPE AFTER THE R2 MIGRATION (2026-10-03, phases 2-3): this module is the
// intake-reports READ side plus `login_attempts`, and nothing else. Every WRITE
// for probe history, alert state, and intake reports moved to R2
// (`src/storage.js`), the three D1 retention DELETEs were superseded by the R2
// key sweep in `index.js#runRetention` (an R2 sweep deletes objects by key, so
// there is no `DELETE ... WHERE` left to write here), and the PROBE READS are
// gone as of phase 3. What remains:
//   - intake report reads (`getRecentReports`) — phase 5 removes the last of
//     them, when the dashboard's reports list moves to `GET /api/reports`;
//   - the PIN gate (`recordLoginAttempt`, `getRecentFailCount`,
//     `clearOldLoginAttempts`) — the last D1-only feature, phase 6.
// The removed helpers are gone rather than left dead: an unused D1 write path is
// exactly what phase 6's `grep env.DB` gate is meant to catch, so keeping one
// "just in case" would make the migration unprovable. The same applies to the
// probe reads this commit deleted (`getLatestPerTarget`, `getLastCheckTime`,
// `getUptimeSince`, `getHistory`, `getRecentChecks`): the answers now come from
// the run objects, `state/summary.json`, and `state/history/<target>.json`, and
// the SQL that produced them no longer describes where the data lives.
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

// `getLastNChecks`, `getAlertState`, and `upsertAlertState` used to live here.
// All three moved to R2: alert evaluation now reads and rewrites ONE
// `state/alert_state.json` document and derives "3 consecutive failures" from
// the counter inside it, instead of re-reading the last three rows per target on
// every run. See `evaluateAlerts` in `index.js`.
//
// The probe READS went the same way in phase 3, and their replacements are
// named here so the next reader does not go looking for a query that is gone:
//   - latest result per target → `newestRun()` reads the newest `checks/<date>/`
//     object, and `state/alert_state.json` carries a target forward when the
//     newest run did not probe it (`readStatusAggregate`)
//   - 24h uptime → the pre-summed `targets{}` of `state/summary.json`
//   - history window → `state/history/<target>.json`, the rolling ring
//     (`updateHistoryRing` writes it, `readHistoryWindow` answers from it)
//   - dashboard "Recent checks" → merged from every target's ring
//     (`readRecentChecks`)

// --- A.4 intake + dashboard helpers ---

// `insertReport` used to live here (one D1 row per intake report). It moved to R2
// with the rest of the write path in phase 4: one report is now ONE immutable
// object under `reports/<kind>/<date>/`, written by `writeReport` in `index.js`.
// The D1 `reports` table is read by nothing that writes to it any more —
// `getRecentReports` below is the last reader and phase 5 replaces it with
// `GET /api/reports`.

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
