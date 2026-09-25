/**
 * P0 T10: requireAuth NULL-tenant top guard + lenient removal + SSE valid-token.
 *
 * Uses REAL token crypto (no sharedAuth mocks) so the SSE gate behavior is
 * proven end-to-end at the gate level:
 *
 *   (a) role=admin + tenantId null → 403 even on requireTenant:false gates,
 *       with ZERO DB round-trips (guard sits before the activity probe).
 *   (b) scopeMode:'lenient' no longer bypasses: null-claim AND mismatched
 *       claim both 403 under the SSE gate config (index.js:437 equivalent).
 *   (c) SSE-equivalent gate (tokenTypes:['stream'], allowQueryToken) passes a
 *       VALID stream token (tenant-bound at mint, as stream-token.js
 *       guarantees — mint 400s without a tenant, so no legitimate
 *       null-tenantId SSE use exists post-Step-1).
 *   (d) mismatched-tenant stream token → 403; missing token → 401.
 */
import { describe, it, expect, vi } from 'vitest';
import { requireAuth } from '../src/middleware/requireAuth.js';
import { generateToken } from '../src/middleware/sharedAuth.js';

const JWT_SECRET = 'p0-guard-test-secret';

function trackingDb() {
  const calls = [];
  const db = {
    prepare: vi.fn().mockImplementation((sql) => {
      calls.push(sql);
      return {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: [{ is_active: 1 }] }),
        first: vi.fn().mockResolvedValue({ is_active: 1 }),
        run: vi.fn().mockResolvedValue({}),
      };
    }),
  };
  return { db, calls };
}

const envFor = (db) => ({ DB: db, JWT_SECRET });
const bearerReq = (url, token) =>
  new Request(url, token ? { headers: { Authorization: `Bearer ${token}` } } : {});

describe('P0 T10: requireAuth NULL-tenant guard + SSE valid-token', () => {
  it('rejects null-tenant non-super_admin tokens, ignores scopeMode lenient, passes valid SSE stream tokens', async () => {
    // (a) top guard on a requireTenant:false gate (posUsersHandlerGate shape).
    {
      const { db, calls } = trackingDb();
      const gate = requireAuth({ realm: 'admin', roles: ['super_admin', 'admin'], requireTenant: false });
      const token = await generateToken(
        { sub: 'a2', userId: 'a2', role: 'admin', tenantId: null }, JWT_SECRET, 'access'
      );
      const res = await gate(bearerReq('https://x.com/api/pos-users', token), envFor(db));
      expect(res).toBeInstanceOf(Response);
      expect(res.status).toBe(403);
      expect(calls).toHaveLength(0);
    }

    // (b) lenient bypass is gone: SSE gate config with scopeMode:'lenient'.
    {
      const { db } = trackingDb();
      const sseGate = requireAuth({
        realm: 'admin',
        allowQueryToken: true,
        tokenTypes: ['stream'],
        roles: ['admin', 'super_admin'],
        scopeMode: 'lenient',
        scopeDenied: { message: 'Forbidden: Access denied to this tenant' },
      });
      const nullClaim = await generateToken(
        { sub: 'a2', userId: 'a2', role: 'admin', tenantId: null, jti: 'j-null' }, JWT_SECRET, 'stream'
      );
      const denied = await sseGate(
        new Request(`https://x.com/api/stream/orders?tenantId=t1&token=${nullClaim}`),
        envFor(db), { tenantId: 't1' }
      );
      expect(denied).toBeInstanceOf(Response);
      expect(denied.status).toBe(403);

      const otherClaim = await generateToken(
        { sub: 'a1', userId: 'a1', role: 'admin', tenantId: 'other', jti: 'j-other' }, JWT_SECRET, 'stream'
      );
      const mismatch = await sseGate(
        new Request(`https://x.com/api/stream/orders?tenantId=t1&token=${otherClaim}`),
        envFor(db), { tenantId: 't1' }
      );
      expect(mismatch).toBeInstanceOf(Response);
      expect(mismatch.status).toBe(403);
    }

    // (c) valid tenant-bound stream token passes (query-token transport, as EventSource uses).
    {
      const { db } = trackingDb();
      const sseGate = requireAuth({
        realm: 'admin',
        allowQueryToken: true,
        tokenTypes: ['stream'],
        roles: ['admin', 'super_admin'],
        scopeMode: 'lenient',
        scopeDenied: { message: 'Forbidden: Access denied to this tenant' },
      });
      const valid = await generateToken(
        { sub: 'a1', userId: 'a1', role: 'admin', tenantId: 't1', jti: 'j-valid' }, JWT_SECRET, 'stream'
      );
      const ok = await sseGate(
        new Request(`https://x.com/api/stream/orders?tenantId=t1&token=${valid}`),
        envFor(db), { tenantId: 't1' }
      );
      expect(ok).not.toBeInstanceOf(Response);
      expect(ok.user.tenantId).toBe('t1');
      expect(ok.user.role).toBe('admin');
    }

    // (d) mismatched stream tenant → 403; missing token → 401.
    {
      const { db } = trackingDb();
      const sseGate = requireAuth({
        realm: 'admin',
        allowQueryToken: true,
        tokenTypes: ['stream'],
        roles: ['admin', 'super_admin'],
      });
      const other = await generateToken(
        { sub: 'a1', userId: 'a1', role: 'admin', tenantId: 'evil', jti: 'j-evil' }, JWT_SECRET, 'stream'
      );
      const denied = await sseGate(
        new Request(`https://x.com/api/stream/orders?tenantId=t1&token=${other}`),
        envFor(db), { tenantId: 't1' }
      );
      expect(denied.status).toBe(403);
      const missing = await sseGate(
        new Request('https://x.com/api/stream/orders?tenantId=t1'), envFor(db), { tenantId: 't1' }
      );
      expect(missing.status).toBe(401);
    }
  });
});
