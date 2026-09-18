/**
 * Stream-token mint endpoint — Wave 3.4a (F-A16-02).
 *
 * EventSource cannot set Authorization headers, so the admin frontend used to
 * pass its 24h admin JWT in the SSE URL query string. That put a full session
 * credential in browser history / proxy logs for 24 hours. This endpoint lets
 * an authenticated admin exchange their access token for a SHORT-LIVED,
 * SINGLE-USE stream token that rides the query string instead:
 *
 *   POST /api/stream/token          Authorization: Bearer <admin JWT>
 *   → 201 { token, expiresIn, type: 'stream' }
 *
 * Contract (F-A16-02):
 *   - Requester must be an authenticated admin-realm user (admin/super_admin).
 *   - Tenant is bound at mint time (resolved scope, or the token's own
 *     tenantId claim); a super_admin with no tenant context is rejected
 *     (400) — the stream partition must be deterministic.
 *   - `type: 'stream'` + `jti` + `exp` ≤ 60s. The Broadcaster Durable Object
 *     verifies the signature, enforces the stream allow-list, rejects a
 *     mismatched tenant (403) and burns the token on first use (single-use,
 *     replay → 401).
 *   - MITIGATIONS-ARE-HONEST: the stream token still travels in the query
 *     string. It is NOT a secret for 24h — it is a 60-second, single-use,
 *     tenant-bound credential with a minimal blast radius.
 *
 * The 24h admin JWT is NEVER accepted on /api/stream/* anymore (the SSE gate
 * uses tokenTypes: ['stream']), so the mint endpoint is the ONLY path that
 * can obtain a stream credential.
 */
import { Hono } from 'hono';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { getScope } from '../middleware/resolveScope.js';
import { generateToken } from '../middleware/sharedAuth.js';

const STREAM_TOKEN_TTL_SECONDS = 60;

/** Roles allowed to mint (must match the SSE gate allow-list). */
const STREAM_MINT_ROLES = ['admin', 'super_admin'];

const streamToken = new Hono();

streamToken.post('/', async (c) => {
  const scope = getScope(c);
  const user = scope.user;
  if (!user) {
    return errorResponse('Unauthorized', 401);
  }
  if (!STREAM_MINT_ROLES.includes(user.role)) {
    return errorResponse('Forbidden: admin role required', 403);
  }

  const tenantId = scope.tenantId || user.tenantId || null;
  if (!tenantId) {
    return errorResponse('Tenant not resolved', 400);
  }

  const jti = crypto.randomUUID();

  const token = await generateToken(
    {
      sub: String(user.sub ?? user.userId ?? ''),
      userId: String(user.userId ?? user.sub ?? ''),
      email: user.email || null,
      role: user.role,
      tenantId,
      jti,
    },
    c.env.JWT_SECRET,
    'stream',
    null,
    STREAM_TOKEN_TTL_SECONDS,
  );

  return jsonResponse({ token, expiresIn: STREAM_TOKEN_TTL_SECONDS, type: 'stream' }, 201);
});

export default streamToken;