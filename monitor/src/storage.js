// R2 object storage for the monitor worker: key layout + the four JSON
// mechanics (read / write / list / delete) every caller needs.
//
// WHY R2 (2026-10-03): the probe table was append-only and grew one row per
// target every 5 minutes forever; the growth is what forced the index/query
// rewrite of 2026-09-30 (FIX A/B/C). R2 stores each cron run as ONE immutable
// object instead, so there is no table to grow, no index to maintain, and the
// retention policy becomes "delete the object" rather than "DELETE FROM ...".
//
// LAYOUT (all keys live in the single `MONITOR_BUCKET` bucket):
//
//   checks/<YYYY-MM-DD>/<HH-MM>.json   one object per cron run:
//                                      { run_at, results: [ {name,url,status_code,ok,response_ms,error_message} ] }
//   reports/<errors|feedback>/<YYYY-MM-DD>/<HH-MM-SS>-<id>.json
//                                      one object per intake report
//   state/alert_state.json             { <target>: { last_state, consecutive_failures, updated_at } }
//   state/summary.json                 rolling 24h per-target { okCount, totalCount }
//   state/history/<target>.json        rolling per-target check ring (the /api/history read path)
//
// LEXICOGRAPHIC ORDER IS THE SORT ORDER, AND THAT IS THE POINT: R2 `list()`
// returns keys in UTF-8 byte order, so `checks/2026-10-03/23-55.json` sorts
// after `checks/2026-10-03/09-05.json` and after every object from an earlier
// date. Fixed-width, zero-padded, ASCII-only stamps therefore give "newest run"
// = "last key in the listing" with no timestamp parsing at all. That is why the
// time stamp is `HH-MM` and not `HH:MM` (a colon is legal in a key but breaks
// naive URL/path building) and why nothing here ever depends on locale time —
// every stamp is derived from `Date#toISOString()`, i.e. UTC.

// Top-level prefixes. Exported so a caller can build a `list()` prefix without
// hand-typing a string, and so tests can assert the layout from one place.
export const CHECKS_PREFIX = 'checks';
export const REPORTS_PREFIX = 'reports';
export const STATE_PREFIX = 'state';

// Intake kinds. The KEY uses the plural (`errors`, `feedback`) because a
// prefix is a collection name, while the stored document keeps the singular
// `kind` (`error`, `feedback`) it had as a D1 row value — the two are related
// but not identical, so they are named separately instead of derived ad hoc.
export const REPORT_KINDS = ['errors', 'feedback'];

// Retention windows, carried over verbatim from the D1 policy in `db.js` and
// bounded by the same reason: `/api/history` clamps `hours` to 168 (7 days), so
// a 14-day floor on checks can never blank a rendered window, and `reports` has
// no time-windowed UI so it can afford 30 days.
export const CHECKS_RETENTION_DAYS = 14;
export const REPORTS_RETENTION_DAYS = 30;

// R2 `list()` returns at most 1000 keys per call and signals more with
// `truncated: true` + `cursor`. Hard cap on how many pages a single listing
// will walk before the helper gives up: 1000 pages x 1000 keys = 1,000,000
// objects, which is ~10x anything this worker can produce in the retention
// window. A cursor that fails to advance would otherwise spin forever inside a
// cron invocation and burn the invocation's CPU budget for nothing.
export const MAX_LIST_PAGES = 1000;

// `YYYY-MM-DD` in UTC. The whole layout is UTC end to end — the cron schedule
// is UTC, the retention cutoffs are UTC, and `checks/<date>/` buckets by UTC
// day, so a local-time stamp would split one probe day across two prefixes for
// most of the world.
export function dateStamp(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

// `HH-MM` in UTC, zero padded. See the lexicographic-order note above: this is
// the sort key for "newest run".
export function timeStamp(date = new Date()) {
  return new Date(date).toISOString().slice(11, 16).replace(':', '-');
}

// `prefix + YYYY-MM-DD + '/'`, always with a trailing slash. R2 treats `list`
// prefixes as plain string prefixes (there are no real directories), so the
// trailing slash is what stops `checks/2026-10-0` from also matching
// `checks/2026-10-03/...` and bleeding one day into the next listing.
export function datePrefix(prefix, date = new Date()) {
  return `${prefix}/${dateStamp(date)}/`;
}

// `<prefix>/` — the listing prefix for a whole collection (no date segment).
export function reportsPrefix(kind) {
  if (kind == null) return `${REPORTS_PREFIX}/`;
  if (!REPORT_KINDS.includes(kind)) {
    throw new Error(`unknown report kind: ${kind}`);
  }
  return `${REPORTS_PREFIX}/${kind}/`;
}

// ONE object per cron run: `checks/<date>/<HH-MM>.json`.
//
// `run_at` inside the document and the key's own stamp are produced from the
// SAME `Date`, so a reader that trusts either one cannot disagree with a reader
// that trusts the other. Callers pass the instant they want to represent — not
// `new Date()` at write time — otherwise a run that starts at 12:59:59.9 and
// finishes at 13:00:00.1 lands in the wrong day bucket.
export function checksKey(date = new Date()) {
  return `${datePrefix(CHECKS_PREFIX, date)}${timeStamp(date)}.json`;
}

// Strip characters that would make a key awkward to handle: `:` (illegal in a
// URL path segment unescaped) and `.` (legal, but it is the extension separator
// this layout relies on, so keeping it out of the stem keeps the extension the
// only dot in the key). Everything else passes through — these are machine
// stamps, not user input, and there is no injection surface in a key.
function sanitizeStamp(value) {
  return String(value ?? '')
    .replace(/:/g, '-')
    .replace(/\./g, '-');
}

// ONE object per intake report: `reports/<kind>/<date>/<HH-MM-SS>-<id>.json`.
//
// The id is in the key (not only in the body) so a reader can page backwards
// through the newest-N reports with a single descending listing and never
// download a body it does not render, and so two reports arriving in the same
// second cannot collide on one key (an overwrite would silently lose intake
// data — the one thing an intake endpoint must never do).
export function reportKey(kind, date, stamp, id) {
  if (!REPORT_KINDS.includes(kind)) {
    throw new Error(`unknown report kind: ${kind}`);
  }
  return `${reportsPrefix(kind)}${dateStamp(date)}/${sanitizeStamp(stamp)}-${sanitizeStamp(id)}.json`;
}

// Mutable per-target alert state, one document for the whole worker. Not dated:
// it is read and rewritten on every run, so it has exactly one key and its
// history lives in the `checks/` objects, not here.
export function alertStateKey() {
  return `${STATE_PREFIX}/alert_state.json`;
}

// Rolling 24h uptime rollup, one document, rewritten in place every run.
// Owner-approved addition over a literal port of the D1 queries: without it
// `/api/status` would have to fan out across 24h of per-minute objects (288
// reads at a 5-minute cadence) on every cached miss, purely to compute
// `uptime_24h` for 5 targets.
export function summaryKey() {
  return `${STATE_PREFIX}/summary.json`;
}

// Rolling per-target check ring: `state/history/<target>.json` = { target,
// updated_at, entries: [{ checked_at, status_code, ok, response_ms }] }.
//
// WHY A SECOND ROLLUP, when the `checks/<date>/` objects already hold every
// result (2026-10-03, phase 3 — the second owner-approved deviation, the first
// being `summary.json` above): `/api/history` has to serve a WINDOW, and R2 has
// no range read. The faithful port — list the day prefixes the window touches
// and GET every run object inside it — is 288 objects for `hours=24` at the
// 5-minute cron cadence, and the Workers subrequest budget on the free plan is
// 50 per invocation. A faithful port is not merely slow here, it fails: the
// dashboard's six `/api/history` calls (one per target card) cannot each afford
// 288 GETs, and neither can a single one. The ring collapses the whole read to
// ONE GET and keeps exactly the entries the endpoint is able to return (its
// 500-entry cap), so no byte is fetched that would not be rendered.
//
// Per target rather than one shared document, so a card's read costs one GET and
// stays inside the budget no matter how many cards are open.
//
// NOT DATED, so the retention sweep (age-based, `checks/` + `reports/`) leaves
// it alone for the same reason it leaves `alert_state.json` alone: it is
// rewritten in place every run, and a year-old ring is exactly the history that
// must survive a quiet period.
export function historyKey(target) {
  const name = String(target ?? '').trim();
  // Target names are code-declared in `targets.js`, but the value reaches this
  // helper from a QUERY STRING (`/api/history?target=…`) in the read path, so
  // the key is built only from a closed character set. A `/` or `..` in a name
  // would file a document outside `state/history/`; rejecting is cheaper than
  // discovering that later.
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error(`invalid history target: ${target}`);
  return `${STATE_PREFIX}/history/${name}.json`;
}

// True when an object's `uploaded` timestamp is strictly older than
// `now - days`. Strict `<`, so an object exactly at the cutoff survives and the
// next sweep re-evaluates it against a moved clock — same boundary semantics
// the D1 `DELETE ... WHERE ts < ?` prunes had.
//
// `uploaded` is whatever R2 hands back: a Date (real bucket) or an ISO string
// (a test double, or a value that round-tripped through JSON). Both are
// accepted; anything unparseable is treated as NOT old, because deleting on a
// read we could not understand is the wrong way to fail.
export function isOlderThan(uploaded, now, days) {
  const t = uploaded instanceof Date ? uploaded.getTime() : Date.parse(String(uploaded ?? ''));
  if (!Number.isFinite(t)) return false;
  const cutoff = new Date(now).getTime() - days * 24 * 60 * 60 * 1000;
  return t < cutoff;
}

// GET one object and parse it. Returns `fallback` when the key is absent (R2
// answers a missing key with a null body and no throw), which is how a cold
// bucket reads as "empty", not "error".
//
// A body that EXISTS but does not parse THROWS on purpose. Swallowing it would
// return the fallback and the caller would then write that fallback back —
// silently resetting alert state (losing `last_state: 'down'`, so the next
// healthy run would announce a recovery for an outage that is still ongoing).
// Throwing lets the caller's try/catch skip the step and leave the file alone.
export async function readJson(bucket, key, fallback = null) {
  const object = await bucket.get(key);
  if (object === null || object === undefined) return fallback;
  return object.json();
}

// PUT one object as `application/json`. No `customMetadata`, no cache headers:
// every read of these keys is either the cron's own write-read (microseconds
// later, so any caching is worthless) or a dashboard poll already wrapped in
// the in-memory 20s cache in `index.js`.
export async function writeJson(bucket, key, value) {
  await bucket.put(key, JSON.stringify(value), {
    httpMetadata: { contentType: 'application/json' },
  });
}

// ONE page of `list()`, exposed so a caller that must page manually (the
// retention sweep) can do so without re-implementing the cursor contract.
// Returns `{ objects, truncated, cursor }` exactly as R2 does.
export function listPage(bucket, { prefix = '', cursor, limit = 1000 } = {}) {
  return bucket.list({ prefix, cursor, limit });
}

// Walk every page under `prefix` and return a flat `{ key, uploaded }[]`.
// `maxKeys` bounds the walk; when the cap is hit the result is truncated rather
// than silently short (the sweep's own semantics are "delete the OLDEST", and
// R2 returns keys ascending, so a truncated listing only ever means fewer
// objects were considered — never a wrong one).
export async function listAll(bucket, { prefix = '', maxKeys = 100000 } = {}) {
  const out = [];
  let cursor;
  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const res = await listPage(bucket, { prefix, cursor });
    for (const object of res?.objects ?? []) {
      out.push({ key: object.key, uploaded: object.uploaded });
      if (out.length >= maxKeys) return out;
    }
    if (!res?.truncated) return out;
    cursor = res?.cursor;
    if (!cursor) return out; // truncated with no cursor would loop forever
  }
  return out;
}

// Delete keys in batches. R2 accepts up to 1000 keys per `delete()` call; a
// single over-long array is rejected outright, so the batching is a
// correctness requirement, not a politeness one. Returns the number of keys
// the caller asked to delete.
export async function deleteKeys(bucket, keys) {
  const BATCH = 1000;
  for (let i = 0; i < keys.length; i += BATCH) {
    await bucket.delete(keys.slice(i, i + BATCH));
  }
  return keys.length;
}