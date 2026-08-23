import { Hono } from 'hono';

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
