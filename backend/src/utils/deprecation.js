/**
 * Phase 9 (/api/v1 cutover): deprecation headers for legacy API surfaces.
 *
 * Two independent deprecation axes coexist during the transition window:
 *
 *  - Surface level: every response served under the UNVERSIONED `/api/*`
 *    alias carries `Deprecation: true` + `Sunset`, announcing the alias's
 *    retirement date. Versioned `/api/v1/*` requests never get these.
 *  - Endpoint level: consolidated legacy paths (`POST /api/pos/auth/login`,
 *    `POST /api/contact`) carry `Deprecation` + `Sunset` even under `/api/v1`,
 *    because the endpoint itself is replaced by its canonical successor
 *    (`POST /api/auth/pos-login`, `POST /api/leads`).
 *
 * Clients should migrate before the Sunset date; the unversioned alias and
 * legacy paths keep working until then.
 */

// RFC 7231 IMF-fixdate. Announced retirement of the unversioned /api/* alias
// and of the consolidated legacy endpoints (~90 days past the cutover).
export const SUNSET_DATE = 'Sat, 21 Nov 2026 00:00:00 GMT';

/**
 * Stamp Deprecation + Sunset headers onto a response.
 *
 * Rebuilds the Response so the returned instance always has mutable headers,
 * regardless of how the upstream handler constructed it.
 */
export function withSunset(res, date = SUNSET_DATE) {
  const out = new Response(res.body, res);
  out.headers.set('Deprecation', 'true');
  out.headers.set('Sunset', date);
  return out;
}
