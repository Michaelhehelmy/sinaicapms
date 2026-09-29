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
];

// True when an observed status code counts as healthy for the given expect rule.
export function matchesExpect(status, expect) {
  if (Array.isArray(expect)) return expect.includes(status);
  return status === expect;
}
