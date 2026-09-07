// Stub for the `cloudflare:workers` virtual module (only resolvable in the
// Workerd runtime via the Cloudflare Vite plugin). Exports a typed mock `env`
// so middleware modules can be unit-tested in the Node/vitest environment.
// `API_BACKEND` is intentionally undefined here so tests exercising the
// binding pass it in explicitly via resolveApiFetcher(); the global fallback
// path (cross-origin fetch) is the behaviour under test in vitest.
export const env: Record<string, unknown> = {};
