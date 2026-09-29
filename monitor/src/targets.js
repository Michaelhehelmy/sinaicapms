// Monitor targets (A.1 scaffold) — expected-status probes.
// Full check/alert logic lands in A.3/A.4.
export const TARGETS = [
  { name: 'apex', url: 'https://sinaicamps.com/', expectedStatus: 200 },
  { name: 'staging-apex', url: 'https://staging.sinaicamps.com/', expectedStatus: 200 },
  { name: 'api-openapi', url: 'https://sinaicamps.com/api/openapi.json', expectedStatus: 200 },
  { name: 'staging-api-openapi', url: 'https://staging.sinaicamps.com/api/openapi.json', expectedStatus: 200 },
];
