/**
 * Tenant lookup outcome — the ONE distinction the public pages need:
 * "there is no such tenant" (a 404) vs "we could not learn whether the tenant
 * exists" (an outage).
 *
 * WHY THIS EXISTS (incident, 2026-10-03): during a D1 outage every tenant host
 * (acaciacamp.com, michaelshouse.sinaicamps.com) rendered the branded 404,
 * because the tenant fetch's failure was swallowed and a null tenant was
 * rendered identically to a genuine "no such tenant". A 404 tells a crawler,
 * a monitor and a human that the property does not exist — a lie that also
 * burns the host's SEO once Cloudflare/proxies cache it. The distinction is
 * made HERE, once, from the response itself, and is carried on
 * `Astro.locals.tenantLookupState` (set by middleware/tenant.ts); the guard
 * component (components/public/ZoneGuard.astro) is the single render site.
 *
 * NO PAGE decides this for itself, so no page can get it wrong.
 */

/**
 * - `skipped`    — no lookup was attempted: the marketplace host (its tenant id
 *                  IS `marketplace`), no host key at all (localhost with no
 *                  `?tenant=`), or a system route the middleware skips
 *                  (`/admin`, `/pos`, `/auth/*`, `/register*`).
 * - `ok`         — the API answered with a tenant (2xx carrying an `id`).
 * - `not-found`  — the API positively answered "no such tenant": 404/410, or a
 *                  2xx body with no `id`. This is the ONLY state that may
 *                  render the branded 404.
 * - `failed`     — the lookup could not be completed: the fetch threw or was
 *                  aborted, or the response was anything else (a D1 outage
 *                  surfaces as the Worker's 500, a gateway 502/504, a 429
 *                  throttle, an auth error, or a body that is not JSON). We do
 *                  NOT know whether the tenant exists, so we must not claim it
 *                  does not — this state renders the 503 outage page instead.
 */
export type TenantLookupState = 'skipped' | 'ok' | 'not-found' | 'failed';

/** Statuses that are a positive "no such tenant" answer from the API. */
const ABSENT_STATUSES = new Set([404, 410]);

/** The branded 404 status (unchanged, SEO-contract preserved). */
export const TENANT_NOT_FOUND_STATUS = 404;

/** A lookup that could not be completed — retryable, so it is NOT a 404. */
export const TENANT_OUTAGE_STATUS = 503;

/** `Retry-After` (seconds) sent with the outage page so caches/clients wait. */
export const TENANT_OUTAGE_RETRY_AFTER = '60';

/** Rendered marker for the outage page (`data-testid`), asserted by tests/E2E. */
export const TENANT_OUTAGE_MARKER = 'tenant-outage-page';

/** Copy shared by the outage page and its tests (single source of truth). */
export const TENANT_OUTAGE_HEADLINE = "We're having trouble loading this property";
export const TENANT_OUTAGE_RETRY_LABEL = 'Try again';

/** Minimal shape of a fetch Response — tolerates the partial mocks in tests. */
export interface TenantLookupResponse {
  ok?: boolean;
  status?: number;
}

/**
 * Classify a tenant lookup response.
 *
 * `matched` is the parsed body and is only consulted for a 2xx, where "2xx
 * without an `id`" is treated as absent (the pre-existing behaviour: a body we
 * cannot use renders the branded 404, it does not paint the outage page).
 */
export function classifyTenantLookup(
  res: TenantLookupResponse | null | undefined,
  matched?: { id?: unknown } | null,
): TenantLookupState {
  if (!res || res.ok !== true) {
    const status = typeof res?.status === 'number' ? res.status : 0;
    return ABSENT_STATUSES.has(status) ? 'not-found' : 'failed';
  }
  return matched?.id ? 'ok' : 'not-found';
}

export interface TenantGuardInput {
  /** `Astro.locals.tenantLookupState` — absent on a request that skipped SSR. */
  tenantLookupState?: TenantLookupState;
  /** `Astro.locals.routeForbidden` — the route is not owned by the zone. */
  routeForbidden?: boolean;
}

export interface TenantGuardState {
  /** Which document the guard renders. */
  kind: 'not-found' | 'outage';
  /** HTTP status to serve it with. */
  status: number;
  /** `Retry-After` value for the outage page, `null` for the 404. */
  retryAfter: string | null;
}

/**
 * Decide what the guard renders, from the request locals only.
 *
 * The zone model wins over the outage: a zone-forbidden route is a REAL 404
 * even when the lookup failed (`/camps` on a tenant host is not owned by that
 * zone regardless of D1's health), so `routeForbidden` is checked first and the
 * outage state can never loosen zone exclusivity.
 */
export function resolveTenantGuardState(input: TenantGuardInput): TenantGuardState {
  const outage = input.tenantLookupState === 'failed' && input.routeForbidden !== true;
  if (outage) {
    return { kind: 'outage', status: TENANT_OUTAGE_STATUS, retryAfter: TENANT_OUTAGE_RETRY_AFTER };
  }
  return { kind: 'not-found', status: TENANT_NOT_FOUND_STATUS, retryAfter: null };
}
