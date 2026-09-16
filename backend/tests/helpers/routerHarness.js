import { Hono } from 'hono';
import { resolveScope } from '../../src/middleware/resolveScope.js';
import { generateToken } from '../../src/middleware/sharedAuth.js';

/**
 * Mount a Phase 4 sub-router exactly as index.js does in production:
 * a stub scope middleware (stands in for resolveScope) followed by
 * app.route at the same base path. Drive it with app.request(path, init, env).
 *
 * @param {import('hono').Hono} router default-exported sub-router
 * @param {{ tenantId?: string|null, user?: unknown, basePath?: string }} opts
 */
export function mountRouter(router, { tenantId = null, user = null, basePath = '/' } = {}) {
  const scopeMiddleware = async (c, next) => {
    c.set('scope', { tenantId, user });
    await next();
  };
  const app = new Hono();
  if (basePath && basePath !== '/') {
    app.use(basePath, scopeMiddleware);
    app.use(`${basePath}/*`, scopeMiddleware);
    app.route(basePath, router);
  } else {
    app.use('*', scopeMiddleware);
    app.route('/', router);
  }
  return app;
}

/**
 * REAL-AUTH mount — wires a sub-router behind the PRODUCTION resolveScope +
 * requireAuth middlewares (single shared instance on both the exact path and
 * the /* pattern, exactly like the reports/import mounts in index.js; the
 * per-request WeakSet in resolveScope dedupes the double match).
 *
 * Unlike mountRouter(), this drives an authenticated request end-to-end: the
 * request must carry `Authorization: Bearer <token>` signed with the same
 * JWT_SECRET present in the `env` passed to app.request(). Any resolveScope
 * option is forwarded verbatim (e.g. `scopeOptions: {
 *   auth: { roles: ['super_admin','admin'], requireTenant: false },
 *   requireTenantHint: false }` mirrors the /api/tenants/import prod mount).
 *
 * Use for suites whose auth/scope wiring is itself under test (import etc.);
 * keep the injected-scope mountRouter() for statement-inspection suites where
 * auth is out of scope and signing tokens would only add noise.
 *
 * @param {import('hono').Hono} router default-exported sub-router
 * @param {{ basePath?: string, scopeOptions?: object }} opts
 */
export function mountRouterAuthenticated(router, { basePath = '/', scopeOptions = {} } = {}) {
  const scope = resolveScope(scopeOptions);
  const app = new Hono();
  app.use(basePath, scope);
  app.use(`${basePath}/*`, scope);
  app.route(basePath, router);
  return app;
}

/**
 * Sign a REAL admin JWT for the real-auth harness (thin wrapper over the
 * production generateToken). Payload must carry { sub, userId, email, role,
 * tenantId } (tenantId may be null for super_admin). Returns a Promise<string>.
 *
 * @param {{ sub: string, userId?: string, email: string, role: string, tenantId?: string|null }} user
 * @param {string} secret JWT secret — can be any string in tests, but MUST equal env.JWT_SECRET on the request env.
 * @returns {Promise<string>}
 */
export function signAdminToken(user, secret) {
  return generateToken(user, secret);
}
