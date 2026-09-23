import campsRoutes from './camps.js';

/**
 * Phase 3 rename — `/api/camps` sunset alias.
 *
 * DELETION DATE: 2026-10-23 (30-day rule — on or after this date remove this
 * file, its import plus the `registerCampsAlias()` call in
 * backend/src/index.js, and the `src/api/camps-alias.js` allowlist entry in
 * the CI sunset gate in .github/workflows/ci.yml).
 *
 * Historical reason: migration 0063 renamed the `camps` table to `projects`
 * (multi-project tenants; uniqueness is now UNIQUE(tenant_id, slug)), but the
 * HTTP route stayed `/api/camps`. This alias keeps the old prefix serving
 * byte-identical CRUD while clients migrate to the canonical `/api/projects`
 * mount. No handler logic lives here — both prefixes serve the SAME
 * campsRoutes instance, and every alias response carries Deprecation + Sunset
 * headers (set idempotently via direct header mutation: the bare path matches
 * both the exact and wildcard mount patterns, so this middleware can run
 * twice per request and must not rebuild the Response body).
 */

// RFC 7231 IMF-fixdate for the 30-day sunset above.
export const CAMPS_ALIAS_SUNSET = 'Fri, 23 Oct 2026 00:00:00 GMT';

export async function campsAliasSunset(c, next) {
  await next();
  c.res.headers.set('Deprecation', 'true');
  c.res.headers.set('Sunset', CAMPS_ALIAS_SUNSET);
}

/**
 * Mount the sunset alias with the project-wide exact+wildcard+limiter triple.
 * `/api/camps` has no sibling sub-mounts, so the plain triple is safe here
 * (unlike the canonical `/api/projects` mount, whose guard lives in
 * backend/src/index.js next to the sibling links/items/meta/tags/meal-plans
 * mounts).
 */
export function registerCampsAlias(app, { scope, limiter }) {
  app.use('/api/camps', scope);
  app.use('/api/camps', campsAliasSunset);
  app.use('/api/camps/*', scope);
  app.use('/api/camps/*', campsAliasSunset);
  app.use('/api/camps/*', limiter());
  app.route('/api/camps', campsRoutes);
}
