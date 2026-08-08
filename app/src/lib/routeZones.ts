/**
 * Zone model for marketplace vs tenant route exclusivity.
 *
 * Every public request resolves to exactly one content zone:
 *  - 'marketplace': the sinaicamps.com marketplace host (or localhost without
 *    a `?tenant=` param, or any unrecognized host — see middleware/tenant.ts).
 *  - 'tenant': a tenant subdomain (x.sinaicamps.com), a tenant custom domain,
 *    or localhost with a `?tenant=` param.
 *
 * `isRouteForbidden` encodes the allow-list. A route is forbidden when the
 * current zone does not own it:
 *   marketplace-only: /camps, /camp, /camp/*
 *   tenant-only:      /pos, /pos/* (POS is an operations app — tenant-only),
 *                     /menu, /book, /rooms
 *   system (both):    /admin, /auth, /register, /login, /api,
 *                     /robots.txt, /sitemap.xml, /404, static assets
 *   both zones:       /, /about, /contact, /faq, /gallery
 *
 * Guards live in each restricted page's frontmatter:
 *   `if (Astro.locals.routeForbidden) { Astro.response.status = 404; return <ZoneGuard />; }`
 */

export type Zone = 'marketplace' | 'tenant';

/** Hosts that are never zone-restricted (SPAs, auth, endpoints, assets). */
const SYSTEM_PREFIXES = [
  '/admin',
  '/auth',
  '/register',
  '/login',
  '/api',
  '/robots.txt',
  '/sitemap.xml',
  '/404',
  '/_astro',
  '/favicon',
];

/**
 * Resolve the content zone for a request. Uses the tenant id resolved by the
 * middleware: 'marketplace' (the marketplace tenant row) maps to the
 * marketplace zone; any real tenant id maps to the tenant zone; an empty id
 * (localhost without `?tenant=`, unrecognized host) defaults to the
 * marketplace zone.
 */
export function resolveZone(_url: URL, tenantId: string): Zone {
  return tenantId === 'marketplace' ? 'marketplace' : tenantId ? 'tenant' : 'marketplace';
}

/**
 * True when the route must not render for the given zone. Pages whose routes
 * can be forbidden are responsible for returning a branded 404 when this is
 * true (the catch-all `[...path]` page covers truly unknown paths).
 */
export function isRouteForbidden(zone: Zone, pathname: string): boolean {
  if (SYSTEM_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return false;
  }
  if (pathname === '/camps' || pathname === '/camp' || pathname.startsWith('/camp/')) {
    return zone !== 'marketplace';
  }
  if (pathname === '/pos' || pathname.startsWith('/pos/')) {
    return zone !== 'tenant';
  }
  if (pathname === '/menu' || pathname === '/book' || pathname === '/rooms') {
    return zone !== 'tenant';
  }
  return false;
}
