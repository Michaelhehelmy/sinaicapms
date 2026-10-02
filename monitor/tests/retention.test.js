import { describe, it, expect, afterEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scheduled } from '../src/index.js';
import { TARGETS } from '../src/targets.js';

// Retention policy guard — real SQLite, real `scheduled()`.
//
// The unit suite's FakeDb dispatches on SQL substrings, which cannot tell a
// retention DELETE that deletes the right rows from one that deletes none: both
// "found nothing to prune" and "pruned the wrong thing" look like a clean run
// against a stub. This file therefore drives the real cron entry point against
// real SQL (the same engine D1 embeds, all three migrations replayed) and
// asserts on the surviving ROWS — old rows gone, fresh rows intact.
//
// `scheduled()` is called, not `runRetention()`, so the wiring into the cron is
// covered too: a helper that works but is never called would pass a
// helper-only test.

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.join(here, '..', 'migrations');
const MIGRATION_FILES = ['0001_init.sql', '0002_login_attempts.sql', '0003_indexes.sql'];

// Windows under test, as SQLite modifier strings.
//
// ONE unit+value pair only, and that is a hard SQLite rule, not a style
// choice: `datetime('now', '-13 days 23 hours')` returns NULL (a second
// unit+value group invalidates the WHOLE modifier), which would seed a NULL
// into `checks.checked_at` and blow up on NOT NULL. So every seed below is a
// single-unit offset.
//
// The offsets deliberately BRACKET each boundary by an hour rather than sitting
// exactly on it. `datetime('now')` is re-evaluated by the DELETE statement, so
// the cutoff advances by the (sub-second) time between the seed INSERT and the
// prune; a row seeded at exactly -14 days is therefore already *inside* the
// window by the time it is deleted. An hour of margin makes both sides of the
// boundary deterministic regardless of how slow the test machine is.
//
// UNITS: `H()` takes HOURS. `ONE_HOUR` below is 1 hour, NOT 3600 seconds — the
// first draft of this file reused a `HOUR = 3600` constant against this
// hours-based helper and silently seeded every "fresh" row ~150 days old, so
// retention correctly deleted rows the test believed were new.
const H = (hours) => `-${hours} hours`;

// `checks` retention is 14 days = 336 hours.
const CHECKS_INSIDE = 336 - 1; // just inside  -> must survive
const CHECKS_OUTSIDE = 336 + 1; // just outside -> must be deleted
// Widest window any reader can ask for: `/api/history` clamps hours to 168.
const MAX_HISTORY_WINDOW_HOURS = 168;
// `reports` retention is 30 days = 720 hours.
const REPORTS_INSIDE = 720 - 1;
const REPORTS_OUTSIDE = 720 + 1;
// Comfortably "brand new" — 1 hour, in HOURS (H() takes hours, not seconds).
const ONE_HOUR = 1;

// Minimal D1-shaped adapter over node:sqlite. `failOn` injects a D1 failure on
// any statement containing that fragment, for the best-effort path.
function makeDb({ failOn = null } = {}) {
  const raw = new DatabaseSync(':memory:');
  for (const file of MIGRATION_FILES) {
    raw.exec(fs.readFileSync(path.join(MIGRATIONS, file), 'utf8'));
  }
  const db = {
    prepare(sql) {
      const stmt = raw.prepare(sql);
      return {
        sql,
        args: [],
        bind(...args) {
          this.args = args;
          return this;
        },
        async all() {
          return { results: stmt.all(...this.args) };
        },
        async first() {
          return stmt.get(...this.args) ?? null;
        },
        async run() {
          if (failOn && sql.includes(failOn)) {
            throw new Error(`injected D1 failure: ${failOn}`);
          }
          const r = stmt.run(...this.args);
          // D1 reports the affected-row count under `meta.changes`; the prunes
          // read it, so the shim must expose the same shape or the helpers would
          // silently return null counts under test.
          return { success: true, meta: { changes: r.changes, last_row_id: r.lastInsertRowid } };
        },
      };
    },
    _raw: raw,
  };
  return db;
}

// "now" shifted by a SQLite modifier, resolved by SQLite itself so the seed and
// the prune agree on the format and the clock.
function ago(db, modifier) {
  return db._raw.prepare('SELECT datetime(\'now\', ?) AS t').get(modifier).t;
}

function seedCheck(db, target, modifier) {
  db._raw
    .prepare(
      'INSERT INTO checks (target, status_code, ok, response_ms, error_message, checked_at) VALUES (?,?,?,?,?,?)',
    )
    .run(target, 200, 1, 12, null, ago(db, modifier));
}

function seedReport(db, modifier) {
  db._raw
    .prepare("INSERT INTO reports (kind, message, created_at) VALUES ('error', 'boom', ?)")
    .run(ago(db, modifier));
}

function seedAlertState(db, target) {
  db._raw
    .prepare(
      'INSERT INTO alert_state (target, consecutive_failures, alerting) VALUES (?, ?, 1)',
    )
    .run(target, 5);
}

const checkTargets = (db) => db._raw.prepare('SELECT target FROM checks').all().map((r) => r.target);
const reportCount = (db) => db._raw.prepare('SELECT COUNT(*) AS n FROM reports').get().n;
const alertTargets = (db) =>
  db._raw.prepare('SELECT target FROM alert_state').all().map((r) => r.target);

// Rows already past the checks retention window — the retention pass's own
// definition of "prunable". Zero means the previous pass did its job.
const overAgeChecks = (db) =>
  db._raw.prepare("SELECT COUNT(*) AS n FROM checks WHERE checked_at < datetime('now','-14 days')").get().n;

// Every probe target, by name — the probe cycle inside `scheduled()` writes one
// fresh `checks` row and one `alert_state` row for each of these.
const configured = TARGETS.map((t) => t.name);

// Stub the network the cron uses. Returns 200 so every probe is healthy, which
// also keeps `evaluateAlerts` from firing a down/recovery webhook.
function stubFetch() {
  const calls = [];
  vi.stubGlobal('fetch', async (url) => {
    calls.push(String(url));
    return { status: 200, ok: true };
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('cron retention policy', () => {
  it('deletes checks older than 14 days and keeps everything inside the window', async () => {
    const db = makeDb();
    seedCheck(db, 'fresh', H(ONE_HOUR));
    seedCheck(db, 'boundary-inside', H(CHECKS_INSIDE));
    seedCheck(db, 'too-old', H(CHECKS_OUTSIDE));
    seedCheck(db, 'ancient', H(40 * 24));
    stubFetch();

    await scheduled({}, { DB: db });

    const left = checkTargets(db);
    expect(left).toContain('fresh');
    expect(left).toContain('boundary-inside');
    expect(left).not.toContain('too-old');
    expect(left).not.toContain('ancient');
  });

  it('keeps the whole widest dashboard window (168h), so retention can never blank a rendered chart', async () => {
    const db = makeDb();
    // A row at the very oldest edge of the largest query the API permits
    // (`/api/history` clamps hours to 168) plus one right at the retention floor.
    seedCheck(db, 'edge-of-largest-window', H(MAX_HISTORY_WINDOW_HOURS));
    seedCheck(db, 'at-retention-floor', H(CHECKS_INSIDE));
    stubFetch();

    await scheduled({}, { DB: db });

    expect(checkTargets(db)).toContain('edge-of-largest-window');
    expect(checkTargets(db)).toContain('at-retention-floor');
  });

  it('deletes reports older than 30 days and keeps everything inside the window', async () => {
    const db = makeDb();
    seedReport(db, H(45 * 24));
    seedReport(db, H(REPORTS_OUTSIDE));
    seedReport(db, H(REPORTS_INSIDE));
    seedReport(db, H(ONE_HOUR));
    expect(reportCount(db)).toBe(4);
    stubFetch();

    await scheduled({}, { DB: db });

    // Only the two inside the window survive (plus nothing else — retention adds
    // no rows, so the count is exactly 2).
    expect(reportCount(db)).toBe(2);
  });

  it('preserves report CONTENT, not just the row count', async () => {
    const db = makeDb();
    db._raw
      .prepare("INSERT INTO reports (kind, message, created_at) VALUES ('error', 'old message', ?)")
      .run(ago(db, H(45 * 24)));
    db._raw
      .prepare("INSERT INTO reports (kind, message, created_at) VALUES ('feedback', 'new message', ?)")
      .run(ago(db, H(ONE_HOUR)));
    stubFetch();

    await scheduled({}, { DB: db });

    const left = db._raw.prepare('SELECT kind, message FROM reports').all();
    expect(left).toEqual([{ kind: 'feedback', message: 'new message' }]);
  });

  it('deletes alert_state for a target that has no surviving check', async () => {
    const db = makeDb();
    seedAlertState(db, 'orphan'); // never probed — no checks at all
    seedAlertState(db, 'backed-by-fresh'); // has a check inside the window
    seedCheck(db, 'backed-by-fresh', H(ONE_HOUR));
    seedAlertState(db, 'at-retention-floor');
    seedCheck(db, 'at-retention-floor', H(CHECKS_INSIDE));
    stubFetch();

    await scheduled({}, { DB: db });

    const left = alertTargets(db);
    expect(left).not.toContain('orphan');
    expect(left).toContain('backed-by-fresh');
    expect(left).toContain('at-retention-floor');
  });

  it('deletes alert_state whose ONLY check was itself over-age (rule reads the post-prune table)', async () => {
    const db = makeDb();
    // The subtle case: a check row DOES exist for this target, but it is older
    // than the retention window, so `pruneOldChecks` removes it in the same
    // pass. A rule keyed on "has any check row at all" would keep the stale
    // state; keying on the same window the checks prune uses removes it.
    seedAlertState(db, 'ancient');
    seedCheck(db, 'ancient', H(40 * 24));
    expect(checkTargets(db)).toContain('ancient');
    stubFetch();

    await scheduled({}, { DB: db });

    expect(checkTargets(db)).not.toContain('ancient');
    expect(alertTargets(db)).not.toContain('ancient');
  });

  it('never deletes alert_state for a currently configured target', async () => {
    const db = makeDb();
    stubFetch();

    await scheduled({}, { DB: db });

    // `evaluateAlerts` upserts one row per configured target before retention
    // runs, and the probe cycle just wrote a fresh check for each — so live
    // targets are structurally un-prunable no matter how long the table ages.
    const left = alertTargets(db);
    for (const name of configured) {
      expect(left, `alert_state lost the configured target ${name}`).toContain(name);
    }
    expect(new Set(left).size).toBe(left.length); // still one row per target
  });

  it('a retention failure never fails the cron, and the other steps still run', async () => {
    const db = makeDb({ failOn: 'DELETE FROM checks' });
    seedCheck(db, 'too-old', H(CHECKS_OUTSIDE));
    seedReport(db, H(45 * 24));
    seedAlertState(db, 'orphan');
    const errors = [];
    vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a));
    const calls = stubFetch();

    // Must RESOLVE. A rejection here would mean a D1 hiccup during the prune
    // silently silenced the cron that produces the alerts.
    await expect(scheduled({}, { DB: db })).resolves.toBeUndefined();

    // The failing step is the only casualty: its rows remain...
    expect(checkTargets(db)).toContain('too-old');
    // ...while the two later steps still pruned.
    expect(reportCount(db)).toBe(0);
    expect(alertTargets(db)).not.toContain('orphan');
    // The failure is logged, not swallowed silently.
    expect(errors.map((e) => e.join(' '))).toEqual([
      expect.stringContaining('monitor retention step failed checks'),
    ]);
    // And the probe half of the cron was unaffected.
    expect(calls).toHaveLength(TARGETS.length);
  });

  it('is idempotent — a second cron run prunes nothing further', async () => {
    const db = makeDb();
    seedCheck(db, 'survivor', H(ONE_HOUR));
    seedCheck(db, 'too-old', H(CHECKS_OUTSIDE));
    seedReport(db, H(45 * 24));
    seedAlertState(db, 'orphan');
    stubFetch();

    await scheduled({}, { DB: db });
    await scheduled({}, { DB: db });

    // Idempotency here means "no row is still prunable after the first pass",
    // NOT "the row set is frozen": each cron run legitimately ADDS one
    // `checks` row per target, so an equality assertion on the raw target list
    // would (correctly) fail on the probe half of the cron. The exact row
    // accounting below pins both halves at once — 1 surviving seed plus one row
    // per target per run, and zero rows past either window.
    expect(overAgeChecks(db)).toBe(0);
    expect(reportCount(db)).toBe(0);
    expect(alertTargets(db)).not.toContain('orphan');
    expect(checkTargets(db)).not.toContain('too-old');
    expect(db._raw.prepare('SELECT COUNT(*) AS n FROM checks').get().n).toBe(
      1 + 2 * TARGETS.length,
    );
    expect(new Set(alertTargets(db)).size).toBe(configured.length);
  });

  it('only probes over the network — retention issues no fetch of its own', async () => {
    const db = makeDb();
    const calls = stubFetch();

    await scheduled({}, { DB: db });

    // Exactly one request per configured target (the probes). No alert webhook
    // is configured in this env, so no alert POST, and retention never fetches.
    expect(calls).toHaveLength(TARGETS.length);
    for (const target of TARGETS) expect(calls).toContain(target.url);
  });
});