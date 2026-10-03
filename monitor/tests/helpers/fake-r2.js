// In-memory R2 double shared by the cron's tests.
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