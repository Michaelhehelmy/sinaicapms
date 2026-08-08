/**
 * POS SPA navigation helper.
 *
 * The POS app performs hard full-page redirects (login → dashboard, checkout
 * → orders). When POS is served on a tenant-zoned localhost URL
 * (`/pos/...?tenant=<id>`, the E2E convention) those redirects must preserve
 * the `?tenant=` param — otherwise the reload resolves to the marketplace
 * zone and the route is forbidden (404).
 *
 * In production the zone comes from the host (acaciacamp.com,
 * acacia.sinaicamps.com), no param is present, and the path is returned
 * untouched.
 */
export function posUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  const tenant = new URLSearchParams(window.location.search).get('tenant');
  return tenant ? `${path}?tenant=${encodeURIComponent(tenant)}` : path;
}
