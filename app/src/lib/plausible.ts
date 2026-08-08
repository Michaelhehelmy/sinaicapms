/**
 * Plausible analytics helpers.
 *
 * `resolveDataDomain` maps a request hostname to the Plausible site domain so
 * the shared analytics account can track the marketplace and each tenant
 * portal under its own site.
 * `trackEvent` is a guarded client-side event helper that degrades to a no-op
 * on the server, when the Plausible loader has not injected `window.plausible`,
 * and under unit tests (vitest runs with `import.meta.env.MODE === 'test'`).
 */

const DOMAIN_MAP: Record<string, string> = {
  'sinaicamps.com': 'sinaicamps.com',
  'acaciacamp.com': 'acaciacamp.com',
  'michaelshouse.sinaicamps.com': 'michaelshouse.sinaicamps.com',
};

const FALLBACK_DOMAIN = 'sinaicamps.com';

/** Callable injected by the Plausible `script.tagged-events.js` loader. */
type PlausibleFn = (event: string, options?: unknown) => void;

interface PlausibleWindow {
  plausible?: PlausibleFn;
}

/**
 * Resolve the Plausible `data-domain` for a request hostname:
 * - strips a leading `www.` and lower-cases the host
 * - known portals map 1:1 to their Plausible site
 * - unknown hosts fall back to the marketplace site (`sinaicamps.com`)
 */
export function resolveDataDomain(hostname: string): string {
  const normalized = hostname.trim().toLowerCase().replace(/^www\./, '');
  return DOMAIN_MAP[normalized] ?? FALLBACK_DOMAIN;
}

/**
 * Pure implementation of `trackEvent` so every branch is unit-testable
 * without fighting jsdom globals / `import.meta.env`.
 */
export function _trackEventImpl(
  name: string,
  props: Record<string, unknown> | undefined,
  plausibleFn: unknown,
  isSsr: boolean,
  isTest: boolean,
): void {
  if (isSsr || isTest) return;
  if (typeof plausibleFn !== 'function') return;
  (plausibleFn as PlausibleFn)(name, props ? { props } : undefined);
}

/**
 * Fire a Plausible custom event from the browser.
 *
 * Safe to call anywhere: no-ops under SSR (no `window`), when the loader has
 * not injected `window.plausible`, and under test (vitest sets
 * `import.meta.env.MODE` to `'test'`).
 */
export function trackEvent(name: string, props?: Record<string, unknown>): void {
  _trackEventImpl(
    name,
    props,
    typeof window === 'undefined' ? undefined : (window as unknown as PlausibleWindow).plausible,
    typeof window === 'undefined',
    import.meta.env.MODE === 'test',
  );
}
