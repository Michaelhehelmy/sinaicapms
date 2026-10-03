// Probe targets for the SinaiCamps monitor worker.
// Targets live in code, not in the DB. Edit this array to add or remove one,
// then redeploy the worker. No migration needed.
//
// `expect` describes the healthy HTTP status:
//   - a single number (e.g. 200) — that exact status is healthy
//   - an array (e.g. [200, 204]) — any listed status is healthy
//   - 401 — the endpoint requires auth; a 200 would mean auth was bypassed
//
// A redirect that is FOLLOWED and lands on `expect` is healthy (see
// `redirect: 'follow'` + the failure message in `probeTarget`); a chain that
// ends on some other 3xx is not. See the note on the removed self-check target
// below for the one target that must never be added back from in here.

export const TARGETS = [
  { name: 'marketplace', url: 'https://sinaicamps.com/', expect: 200, timeoutMs: 10000 },
  { name: 'api-public', url: 'https://sinaicamps.com/api/tenants/public', expect: 200, timeoutMs: 10000 },
  { name: 'acacia', url: 'https://acaciacamp.com/', expect: 200, timeoutMs: 10000 },
  { name: 'michaelshouse', url: 'https://michaelshouse.sinaicamps.com/', expect: 200, timeoutMs: 10000 },
  { name: 'api-meals', url: 'https://sinaicamps.com/api/meals', expect: 200, timeoutMs: 10000 },
  // NO SELF-CHECK TARGET, ON PURPOSE (removed 2026-10-03).
  //
  // There used to be a sixth entry here: `self-check` ->
  // https://status.sinaicamps.com/api/status, `expect: 200`. Its argument was
  // sound — an outage of the monitor itself cannot deliver its own alert, so the
  // run object written *after* the gap is the only durable evidence it happened.
  //
  // IT ALSO MANUFACTURED FALSE POSITIVES, WHICH COST MORE THAN IT PROVED. The
  // monitor probes its own hostname from inside the same Cloudflare zone, and a
  // Worker fetching a Worker through that zone is not the same request a browser
  // makes: the edge returns 522 to the worker-to-worker hop. That is an artifact
  // of WHERE the probe runs, not a statement about whether the site is up, and it
  // is indistinguishable on the dashboard from a real outage — the one property a
  // status board cannot afford. Three consecutive 522s would also have fired a
  // real down alert, and `self-check` would have been the row naming itself: the
  // monitor paging about itself, with no way to tell the alert from the cause.
  //
  // An operator still wants to know when the panel is unreachable, and the honest
  // way to get that is from OUTSIDE this zone — an external uptime check, or a
  // browser hitting the URL — because that is the request the "is it up?" question
  // is actually about. Re-adding the target from inside here re-adds the 522.
  //
  // Mechanically, dropping the name retires its state on the next FULL run:
  // `evaluateAlerts` prunes alert-state entries for targets no longer configured,
  // and `state/history/self-check.json` + its `summary` entry are simply no longer
  // read or written (they are small, and `state/` is deliberately never swept).
];

// True when an observed status code counts as healthy for the given expect rule.
export function matchesExpect(status, expect) {
  if (Array.isArray(expect)) return expect.includes(status);
  return status === expect;
}
