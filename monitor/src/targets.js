// Probe targets for the SinaiCamps monitor worker.
// Targets live in code, not in the DB. Edit this array to add or remove one,
// then redeploy the worker. No migration needed.
//
// `expect` describes the healthy HTTP status:
//   - a single number (e.g. 200) — that exact status is healthy
//   - an array (e.g. [200, 204]) — any listed status is healthy
//   - 401 — the endpoint requires auth; a 200 would mean auth was bypassed

export const TARGETS = [
  { name: 'marketplace', url: 'https://sinaicamps.com/', expect: 200, timeoutMs: 10000 },
  { name: 'api-public', url: 'https://sinaicamps.com/api/tenants/public', expect: 200, timeoutMs: 10000 },
  { name: 'acacia', url: 'https://acaciacamp.com/', expect: 200, timeoutMs: 10000 },
  { name: 'michaelshouse', url: 'https://michaelshouse.sinaicamps.com/', expect: 200, timeoutMs: 10000 },
  { name: 'api-meals', url: 'https://sinaicamps.com/api/meals', expect: 200, timeoutMs: 10000 },
  // SELF-CHECK: the monitor probes its own public status endpoint. It is DATA
  // for the cron cycle -- it is never probed by hand from a workstation, and
  // adding it here changes no code path beyond TARGETS.length.
  //
  // Why it earns a slot: an outage of the monitor itself cannot alert anyone.
  // Everything above is a DOWN signal delivered by this worker; if this worker
  // is unreachable, the delivery path is dead with it and the dashboard shows
  // nothing at all. The `checks` row written by the run AFTER a self-inflicted
  // outage is the only durable record that the gap happened, and a monitor
  // that has never gone dark cannot prove it would come back.
  //
  // `expect: 200` is a second, cheaper assertion on the same request: it is
  // also a standing regression test that /api/status stays PUBLIC and
  // UNAUTHENTICATED. If a future change put the PIN or the session check in
  // front of it, this target goes red instead of silently logging the operator
  // out of their own dashboard.
  { name: 'self-check', url: 'https://status.sinaicamps.com/api/status', expect: 200, timeoutMs: 10000 },
];

// True when an observed status code counts as healthy for the given expect rule.
export function matchesExpect(status, expect) {
  if (Array.isArray(expect)) return expect.includes(status);
  return status === expect;
}
