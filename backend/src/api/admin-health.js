import { jsonResponse, errorResponse } from '../utils/response';
import { requireAuth } from '../middleware/requireAuth.js';

const superAdminGate = requireAuth({
  realm: 'admin',
  roles: ['super_admin'],
  requireTenant: false,
  invalidToken: { status: 403, message: 'Unauthorized: Super Admin access required' },
  realmMismatch: { message: 'Unauthorized: Super Admin access required' },
  insufficientRole: { message: 'Unauthorized: Super Admin access required' },
});

/**
 * Probe D1 latency by running a lightweight query.
 */
async function probeD1(env) {
  const start = Date.now();
  try {
    await env.DB.prepare('SELECT 1').first();
    const latencyMs = Date.now() - start;
    return { status: latencyMs < 200 ? 'ok' : 'degraded', latencyMs, queries: 0, errors: 0 };
  } catch {
    return { status: 'down', latencyMs: Date.now() - start, queries: 0, errors: 1 };
  }
}

/**
 * Probe KV latency if the binding is available.
 */
async function probeKV(env) {
  if (!env.KV_CACHE) {
    return { status: 'skipped', latencyMs: 0, operations: 0, errors: 0 };
  }
  const start = Date.now();
  try {
    await env.KV_CACHE.get('__healthcheck');
    const latencyMs = Date.now() - start;
    return { status: latencyMs < 100 ? 'ok' : 'degraded', latencyMs, operations: 0, errors: 0 };
  } catch {
    return { status: 'down', latencyMs: Date.now() - start, operations: 0, errors: 1 };
  }
}

/**
 * Probe R2 binding availability.
 */
function probeR2(env) {
  if (!env.MEDIA_BUCKET) {
    return { status: 'skipped', latencyMs: 0, operations: 0, errors: 0 };
  }
  return { status: 'ok', latencyMs: 0, operations: 0, errors: 0 };
}

/**
 * Handle /api/admin/health/* routes.
 * All endpoints require super_admin auth.
 */
export async function handleAdminHealthRoute(request, env) {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname.split('/').filter(Boolean);

  const auth = await superAdminGate(request, env);
  if (auth instanceof Response) return auth;

  // GET /api/admin/health — Current system health
  if (method === 'GET' && path.length === 3 && path[3] === undefined) {
    try {
      // Workers: always ok if we're serving this endpoint
      const workers = { status: 'ok', uptime: Date.now(), requests: 0, errors: 0 };

      // D1
      const d1 = await probeD1(env);

      // KV
      const kv = await probeKV(env);

      // R2
      const r2 = probeR2(env);

      // Determine overall status
      const statuses = [workers.status, d1.status, kv.status, r2.status];
      const overall = statuses.includes('down') ? 'down'
        : statuses.includes('degraded') ? 'degraded'
        : 'ok';

      return jsonResponse({ workers, d1, kv, r2, overall });
    } catch (e) {
      return errorResponse('Failed to check system health');
    }
  }

  // GET /api/admin/health/metrics — Historical health metrics
  if (method === 'GET' && path.length === 4 && path[3] === 'metrics') {
    try {
      // Real metrics require Cloudflare Analytics API integration or a request-
      // counting middleware.  Returning zeroed hourly buckets is honest; the
      // frontend charts show "no data" rather than misleading random numbers.
      const now = new Date();
      const metrics = [];
      for (let i = 23; i >= 0; i--) {
        const ts = new Date(now.getTime() - i * 3600_000);
        metrics.push({
          timestamp: ts.toISOString(),
          workers: { requests: 0, errors: 0, latencyMs: 0 },
          d1: { queries: 0, errors: 0, latencyMs: 0 },
          kv: { operations: 0, errors: 0, latencyMs: 0 },
        });
      }

      return jsonResponse({ metrics });
    } catch (e) {
      return errorResponse('Failed to fetch health metrics');
    }
  }

  return errorResponse('Admin health endpoint not found', 404);
}
