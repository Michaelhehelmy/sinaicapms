// In-memory R2 double shared by every R2 test in this suite — the cron's
// writes, the retention sweep, and (as of phase 3) the PUBLIC READS.
//
// The D1-era tests used two different stubs — a SQL-dispatching `FakeDb` and a
// real `node:sqlite` adapter — because the thing under test WAS SQL. Nothing
// under test here is SQL, so one object-keyed store is enough, and it is built
// to the two properties the real binding has that a naive `Map` stub does not:
//
//   1. `list()` returns keys in UTF-8 byte order, truncated to `pageSize` with a
//      cursor. The whole retention sweep is "walk pages in ascending order", so
//      a stub that returned insertion order would pass tests the real bucket
//      fails (and vice versa).
//   2. `uploaded` travels with each key. The sweep decides age from the LISTING
//      precisely so it never issues a per-object HEAD; a stub whose list results
//      lack `uploaded` cannot prove that.
//
// Failure injection is per-operation (`failOn: { put: /checks/ }`) so a test can
// break exactly one write and assert the OTHER steps still ran — the property
// that keeps a broken bucket from silencing the monitor that reports it.

import {
  checksKey,
  alertStateKey,
  summaryKey,
  historyKey,
  reportKey,
  secondsStamp,
} from '../../src/storage.js';

function matches(failOn, op, key) {
  const rule = failOn?.[op];
  if (!rule) return false;
  return typeof rule === 'string' ? key.includes(rule) : rule.test(key);
}

export function makeR2({ pageSize = 2, failOn = null, uploaded = '2026-10-03T12:00:00.000Z' } = {}) {
  const store = new Map();
  const calls = { get: [], put: [], list: [], delete: [] };

  const bucket = {
    store,
    calls,
    // `body` may be a value (stored as-is) or a JSON string (parsed, the way a
    // real PUT+GET round-trip would see it).
    seed(key, body, uploadedAt = uploaded) {
      store.set(key, {
        value: typeof body === 'string' ? JSON.parse(body) : body,
        uploaded: uploadedAt,
      });
      return key;
    },
    // Enumeration in BYTE ORDER, exactly like `list()`. Returning insertion
    // order here would let an assertion pass on a bucket that would answer
    // differently in production.
    keys() {
      return [...store.keys()].sort();
    },
    // Convenience read used by assertions: the parsed document, or undefined.
    read(key) {
      return store.get(key)?.value;
    },
    async get(key) {
      calls.get.push(key);
      if (matches(failOn, 'get', key)) throw new Error(`injected R2 get failure: ${key}`);
      const hit = store.get(key);
      if (!hit) return null; // R2 answers a missing key with a null body
      return { json: async () => hit.value };
    },
    async put(key, body, options) {
      calls.put.push(key);
      if (matches(failOn, 'put', key)) throw new Error(`injected R2 put failure: ${key}`);
      const value = typeof body === 'string' ? JSON.parse(body) : body;
      store.set(key, { value, uploaded, options });
      return { key, etag: 'etag' };
    },
    async list({ prefix = '', cursor, limit = 1000 } = {}) {
      calls.list.push({ prefix, cursor });
      if (matches(failOn, 'list', prefix)) throw new Error(`injected R2 list failure: ${prefix}`);
      const keys = [...store.keys()].filter((k) => k.startsWith(prefix)).sort();
      const size = Math.min(limit, pageSize);
      const start = cursor ? Number(cursor) : 0;
      const page = keys.slice(start, start + size);
      const end = start + page.length;
      return {
        objects: page.map((key) => ({ key, uploaded: store.get(key).uploaded })),
        truncated: end < keys.length,
        cursor: end < keys.length ? String(end) : undefined,
      };
    },
    async delete(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      calls.delete.push(list);
      for (const key of list) {
        if (matches(failOn, 'delete', key)) throw new Error(`injected R2 delete failure: ${key}`);
      }
      for (const key of list) store.delete(key);
    },
  };
  return bucket;
}

// The cron resolves probes through the global `fetch`, so a test that wants
// every probe to pass (or fail) installs one of these. Returns the call log so
// a test can assert the network was touched EXACTLY once per target.
export function stubFetch(status = 200) {
  const calls = [];
  const impl = async (url) => {
    calls.push(String(url));
    if (typeof status === 'function') return status(String(url));
    return { status, ok: status < 400 };
  };
  return { calls, impl };
}

// Collects alert webhook POSTs (the Telegram/alert sink).
export function webhookCollector() {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return { ok: true };
  };
  return { calls, impl };
}

// UTC hour 0 — the only hour the retention sweep runs in.
export const HOUR_0 = new Date('2026-10-03T00:12:00.000Z');

// --- fixture builders for the READ path (phase 3) ---
//
// The public reads resolve their keys THROUGH `src/storage.js`, so a fixture
// that hand-typed a key string could pass against a layout the code no longer
// uses. Every builder below derives the key from the same instant the body's
// stamps come from, exactly like the cron does — a fixture cannot invent a key
// that disagrees with its own payload.

// One probe result in the shape the cron STORES (snake_case, `ok` as 1/0).
const storedResult = (r) => ({
  name: r.name,
  url: r.url ?? `https://${r.name}.test/`,
  status_code: r.statusCode ?? (r.ok ? 200 : 500),
  ok: r.ok ? 1 : 0,
  response_ms: r.responseMs ?? 12,
  error_message: r.errorMessage ?? null,
});

// Seed one run object: `checks/<date>/<HH-MM>.json` = { run_at, results[] }.
// Pass a partial `results` list to model a PARTIAL run (what a single-target
// `POST /internal/check` writes).
export function seedRun(bucket, at, results, uploaded) {
  return bucket.seed(
    checksKey(at),
    { run_at: new Date(at).toISOString(), results: results.map(storedResult) },
    uploaded,
  );
}

// Seed `state/summary.json`, the pre-summed 24h rollup. `targets` maps a target
// name to its { okCount, totalCount }; an omitted target reads as "no samples",
// i.e. `uptime_24h: null`.
export function seedSummary(bucket, targets, { at = HOUR_0, runs = [] } = {}) {
  return bucket.seed(
    summaryKey(),
    {
      updated_at: new Date(at).toISOString(),
      window_hours: 24,
      targets,
      runs,
    },
    undefined,
  );
}

// Seed `state/alert_state.json` (the per-target carry-forward the status read
// falls back to for a target the newest run did not probe).
export function seedAlertState(bucket, state) {
  return bucket.seed(alertStateKey(), state);
}

// Seed one target's `state/history/<target>.json` ring. Entries are stored in
// the same four fields `/api/history` projects.
export function seedRing(bucket, target, entries, { at = HOUR_0 } = {}) {
  return bucket.seed(historyKey(target), {
    target,
    updated_at: new Date(at).toISOString(),
    entries,
  });
}

// Seed ONE intake report object: `reports/<kind>/<date>/<HH-MM-SS>-<id>.json`,
// where `kind` is the PLURAL collection ('errors' / 'feedback') because that is
// what the key layout uses. `at` derives both the stamps and the key, so a
// fixture cannot place a report in a bucket its own `received_at` disagrees with.
export function seedIntake(bucket, kind, at, overrides = {}) {
  const when = new Date(at);
  const id = overrides.id ?? `${when.getTime().toString(36)}-000001`;
  const key = reportKey(kind, when, secondsStamp(when), id);
  return bucket.seed(key, {
    id,
    kind: kind === 'errors' ? 'error' : 'feedback',
    received_at: when.toISOString(),
    message: 'seeded report',
    page_url: null,
    contact: null,
    status: 'new',
    severity: 'error',
    user_agent: null,
    ...overrides,
  });
}

// A ring entry at `minutesAgo` before `at`, ok by default.
export const ringEntry = (at, minutesAgo, over = {}) => ({
  checked_at: new Date(new Date(at).getTime() - minutesAgo * 60_000).toISOString(),
  status_code: 200,
  ok: 1,
  response_ms: 12,
  ...over,
});