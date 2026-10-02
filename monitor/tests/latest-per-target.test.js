import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLatestPerTarget } from '../src/db.js';
import { TARGETS } from '../src/targets.js';

// Real-SQLite guard for the 2026-09-30 last-per-target rewrite.
//
// The unit suite's FakeDb matches on SQL substrings, so it cannot catch a plan
// regression — this file runs the actual query through SQLite (the same engine
// D1 embeds) and asserts (a) row-for-row parity with the old
// `WHERE id IN (SELECT MAX(id) ... GROUP BY target)` shape and (b) that the
// plan contains no table scan of `checks`, which is what made the old form
// O(rows) in the probe table.

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.join(here, '..', 'migrations');

// Minimal D1-shaped adapter over node:sqlite.
function makeDb() {
  const raw = new DatabaseSync(':memory:');
  for (const file of ['0001_init.sql', '0002_login_attempts.sql', '0003_indexes.sql']) {
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
          return stmt.run(...this.args);
        },
      };
    },
    _raw: raw,
  };
  return db;
}

const SEED_ROWS = 43_200; // 5 targets x ~30 days of 5-minute probes

function seed(db, rows = SEED_ROWS, distinctTargets = TARGETS) {
  const names = distinctTargets.map((t) => (typeof t === 'string' ? t : t.name));
  const stmt = db._raw.prepare(
    'INSERT INTO checks (target, status_code, ok, response_ms, error_message, checked_at) VALUES (?,?,?,?,?,?)',
  );
  db._raw.exec('BEGIN');
  for (let i = 0; i < rows; i += 1) {
    const ok = i % 997 === 0 ? 0 : 1;
    stmt.run(
      names[i % names.length],
      ok ? 200 : 500,
      ok,
      40 + (i % 300),
      ok ? null : 'boom',
      '2026-09-29 00:00:00',
    );
  }
  db._raw.exec('COMMIT');
}

const OLD_SQL = `SELECT target, status_code, ok, response_ms, error_message, checked_at
  FROM checks WHERE id IN (SELECT MAX(id) FROM checks GROUP BY target)`;

const SELECT_FIELDS = 'target, status_code, ok, response_ms, error_message, checked_at';

function oldShapeRows(db) {
  return db._raw.prepare(OLD_SQL).all();
}

function newShapeSql(targets) {
  const names = targets.map((t) => (typeof t === 'string' ? t : t.name));
  return names
    .map(
      () =>
        `SELECT * FROM (\nSELECT ${SELECT_FIELDS}\n       FROM checks WHERE target = ? ORDER BY id DESC LIMIT 1\n)`,
    )
    .join('\nUNION ALL\n');
}

describe('getLatestPerTarget — real SQLite parity + plan', () => {
  it('returns exactly the same rows as the old GROUP BY/MAX(id) form', async () => {
    const db = makeDb();
    seed(db);
    const got = await getLatestPerTarget(db);
    const want = oldShapeRows(db);

    expect(got).toHaveLength(want.length);
    expect(got).toHaveLength(TARGETS.length);
    for (const row of got) {
      const expected = want.find((w) => w.target === row.target);
      expect(expected, `missing old-form row for ${row.target}`).toBeTruthy();
      expect(row).toEqual({ ...expected });
    }
  });

  it('keeps the wire shape: the same six fields, in order, per row', async () => {
    const db = makeDb();
    seed(db);
    const got = await getLatestPerTarget(db);
    expect(got.length).toBeGreaterThan(0);
    for (const row of got) {
      expect(Object.keys(row)).toEqual([
        'target',
        'status_code',
        'ok',
        'response_ms',
        'error_message',
        'checked_at',
      ]);
    }
  });

  it('plan uses the index and never scans `checks` (old form did)', async () => {
    const db = makeDb();
    seed(db);

    const newPlan = db._raw.prepare(`EXPLAIN QUERY PLAN ${newShapeSql(TARGETS)}`).all();
    const oldPlan = db._raw.prepare(`EXPLAIN QUERY PLAN ${OLD_SQL}`).all();
    const newText = newPlan.map((r) => r.detail).join('\n');
    const oldText = oldPlan.map((r) => r.detail).join('\n');

    // Regression guard: the old shape scanned the (target, id) index end to end.
    expect(oldText).toMatch(/SCAN checks USING COVERING INDEX idx_checks_target_id/);
    // The new shape must drive one bounded SEARCH per configured target.
    expect(newText).not.toMatch(/SCAN checks/);
    const searches = newText.match(/SEARCH checks USING (?:COVERING )?INDEX idx_checks_target_id \(target=\?\)/g);
    expect(searches).toHaveLength(TARGETS.length);
  });

  it('a configured target with no rows contributes nothing (matches old form)', async () => {
    const db = makeDb();
    seed(db);
    const targets = [...TARGETS, 'never-probed'];
    const got = await getLatestPerTarget(db, targets);
    expect(got).toHaveLength(TARGETS.length);
    expect(got.map((r) => r.target).sort()).toEqual(oldShapeRows(db).map((r) => r.target).sort());
  });

  it('accepts plain string target names as well as target objects', async () => {
    const db = makeDb();
    seed(db);
    const byObject = await getLatestPerTarget(db);
    const byString = await getLatestPerTarget(db, TARGETS.map((t) => t.name));
    expect(byString).toEqual(byObject);
  });

  it('empty target list short-circuits without querying', async () => {
    const db = makeDb();
    seed(db);
    let prepared = 0;
    const spy = {
      prepare(sql) {
        prepared += 1;
        return db.prepare(sql);
      },
    };
    expect(await getLatestPerTarget(spy, [])).toEqual([]);
    expect(prepared).toBe(0);
  });

  it('empty table yields an empty result, not a throw', async () => {
    const db = makeDb();
    expect(await getLatestPerTarget(db)).toEqual([]);
  });

  it('stays correct when a target has exactly one row', async () => {
    const db = makeDb();
    db._raw
      .prepare(
        'INSERT INTO checks (target, status_code, ok, response_ms, error_message, checked_at) VALUES (?,?,?,?,?,?)',
      )
      .run('marketplace', 200, 1, 11, null, '2026-09-29 00:00:00');
    const got = await getLatestPerTarget(db, ['marketplace']);
    expect(got).toEqual([
      {
        target: 'marketplace',
        status_code: 200,
        ok: 1,
        response_ms: 11,
        error_message: null,
        checked_at: '2026-09-29 00:00:00',
      },
    ]);
  });
});
