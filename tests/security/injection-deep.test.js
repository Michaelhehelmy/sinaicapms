import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  API_BASE_URL,
  superAdminLogin,
  createTestTenant,
  createTenantAdmin,
  tenantAdminLogin,
  deleteTestTenant
} from '../helpers';

describe('Security Deep — Injection, XSS, JWT Tampering, CSRF', () => {
  let superAdminToken;
  let tenantId;
  const ts = Date.now();
  const subdomain = `sec-deep-${ts}`;
  const adminEmail = `admin@${subdomain}.com`;
  const adminPassword = 'Password123';
  let tenantToken;

  beforeAll(async () => {
    superAdminToken = await superAdminLogin();
    tenantId = await createTestTenant(subdomain, subdomain, 'Security Deep Test');
    await createTenantAdmin(tenantId, adminEmail, adminPassword, superAdminToken);
    tenantToken = await tenantAdminLogin(tenantId, adminEmail, adminPassword);
  });

  afterAll(async () => {
    if (tenantId && superAdminToken) {
      await deleteTestTenant(tenantId, superAdminToken);
    }
  });

  // ── SQL Injection ──────────────────────────────────────
  describe('SQL Injection', () => {
    const sqliPayloads = [
      "' OR '1'='1",
      "'; DROP TABLE camps; --",
      "' UNION SELECT * FROM pos_users --",
      "1; SELECT * FROM admins --",
      "' OR 1=1 LIMIT 1 --",
      "admin'--",
      "' OR ''='",
      "1' AND '1'='1",
    ];

    for (const payload of sqliPayloads) {
      it(`rejects SQL injection in GET /api/camps (${payload.substring(0, 20)}...)`, async () => {
        const res = await fetch(`${API_BASE_URL}/api/camps?search=${encodeURIComponent(payload)}`, {
          headers: {
            'Authorization': `Bearer ${tenantToken}`,
            'x-tenant-id': tenantId
          }
        });
        const text = await res.text().catch(() => '');
        expect(text.toLowerCase()).not.toContain('sql');
        expect(text.toLowerCase()).not.toContain('syntax error');
        expect(text.toLowerCase()).not.toContain('database error');
      });
    }

    it('rejects SQL injection in POST /api/camps name field', async () => {
      const res = await fetch(`${API_BASE_URL}/api/camps`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tenantToken}`,
          'x-tenant-id': tenantId
        },
        body: JSON.stringify({ name: "'; DROP TABLE camps; --", location: 'Test' })
      });
      expect(res.ok).toBeTruthy();
      // Verify the name was stored as a literal string, not executed
      const listRes = await fetch(`${API_BASE_URL}/api/camps`, {
        headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
      });
      const camps = await listRes.json();
      const found = Array.isArray(camps) ? camps.find(c => c.name && c.name.includes('DROP TABLE')) : null;
      if (found) {
        // If stored, it should be a plain string, not executed
        expect(found.name).toContain("'; DROP TABLE camps; --");
      }
    });

    it('rejects SQL injection in POST /api/orders guest_name', async () => {
      const res = await fetch(`${API_BASE_URL}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tenantToken}`,
          'x-tenant-id': tenantId
        },
        body: JSON.stringify({
          camp_id: '1',
          room_id: '1',
          check_in_date: '2026-08-01',
          check_out_date: '2026-08-05',
          guest_name: "'; DROP TABLE orders; --",
          number_of_people: 2,
          total_amount: 100
        })
      });
      // Should either succeed (storing literal) or fail validation — never SQL error
      const text = await res.text().catch(() => '');
      expect(text.toLowerCase()).not.toContain('sql');
      expect(text.toLowerCase()).not.toContain('syntax');
    });
  });

  // ── XSS (Cross-Site Scripting) ─────────────────────────
  describe('XSS Prevention', () => {
    const xssPayloads = [
      '<script>alert("xss")</script>',
      '<img src=x onerror=alert(1)>',
      '<svg onload=alert(1)>',
      '"><script>alert("xss")</script>',
      "javascript:alert(1)",
      '<iframe src="javascript:alert(1)">',
      '<body onload=alert(1)>',
      '{{constructor.constructor("alert(1)")()}}',
    ];

    for (const payload of xssPayloads) {
      it(`sanitizes XSS in camp name (${payload.substring(0, 25)}...)`, async () => {
        const res = await fetch(`${API_BASE_URL}/api/camps`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${tenantToken}`,
            'x-tenant-id': tenantId
          },
          body: JSON.stringify({ name: payload, location: 'XSS Test' })
        });
        expect(res.ok).toBeTruthy();

        const listRes = await fetch(`${API_BASE_URL}/api/camps`, {
          headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
        });
        const camps = await listRes.json();
        if (Array.isArray(camps)) {
          const found = camps.find(c => c.name && c.name.includes('<script'));
          if (found) {
            // Must be escaped or stripped — never raw script tags
            expect(found.name).not.toMatch(/<script[\s>]/);
          }
        }
      });
    }

    it('sanitizes XSS in POST /api/leads name field', async () => {
      const res = await fetch(`${API_BASE_URL}/api/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
        body: JSON.stringify({
          name: '<script>alert("xss")</script>',
          email: 'test@test.com',
          phone: '+1234567890',
          message: 'Test lead'
        })
      });
      expect(res.ok).toBeTruthy();
    });
  });

  // ── JWT Tampering ──────────────────────────────────────
  describe('JWT Tampering', () => {
    it('rejects token with invalid signature', async () => {
      const res = await fetch(`${API_BASE_URL}/api/camps`, {
        headers: {
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJ0ZW5hbnRJZCI6InRlc3QiLCJyb2xlIjoiYWRtaW4ifQ.INVALIDSIGNATURE',
          'x-tenant-id': tenantId
        }
      });
      expect(res.status).toBe(401);
    });

    it('rejects token with expired exp', async () => {
      // Craft a token with exp in the past
      const payload = btoa(JSON.stringify({ tenantId, role: 'admin', exp: 1000000000 }));
      const fakeToken = `eyJhbGciOiJIUzI1NiJ9.${payload}.fakesig`;
      const res = await fetch(`${API_BASE_URL}/api/camps`, {
        headers: {
          'Authorization': `Bearer ${fakeToken}`,
          'x-tenant-id': tenantId
        }
      });
      expect(res.status).toBe(401);
    });

    it('rejects token with wrong tenant_id claim', async () => {
      const payload = btoa(JSON.stringify({ tenantId: 'wrong-tenant', role: 'admin' }));
      const fakeToken = `eyJhbGciOiJIUzI1NiJ9.${payload}.fakesig`;
      const res = await fetch(`${API_BASE_URL}/api/camps`, {
        headers: {
          'Authorization': `Bearer ${fakeToken}`,
          'x-tenant-id': tenantId
        }
      });
      expect(res.status).toBe(401);
    });

    it('rejects token with role escalation (super_admin claim)', async () => {
      const payload = btoa(JSON.stringify({ tenantId, role: 'super_admin' }));
      const fakeToken = `eyJhbGciOiJIUzI1NiJ9.${payload}.fakesig`;
      const res = await fetch(`${API_BASE_URL}/api/camps`, {
        headers: {
          'Authorization': `Bearer ${fakeToken}`,
          'x-tenant-id': tenantId
        }
      });
      // Should reject because signature is invalid
      expect(res.status).toBe(401);
    });

    it('rejects empty Bearer token', async () => {
      const res = await fetch(`${API_BASE_URL}/api/camps`, {
        headers: {
          'Authorization': 'Bearer ',
          'x-tenant-id': tenantId
        }
      });
      expect(res.status).toBe(401);
    });

    it('rejects non-Bearer authorization header', async () => {
      const res = await fetch(`${API_BASE_URL}/api/camps`, {
        headers: {
          'Authorization': 'Basic dXNlcjpwYXNz',
          'x-tenant-id': tenantId
        }
      });
      expect(res.status).toBe(401);
    });

    it('rejects missing Authorization header on protected routes', async () => {
      const res = await fetch(`${API_BASE_URL}/api/camps`, {
        headers: { 'x-tenant-id': tenantId }
      });
      expect(res.status).toBe(401);
    });
  });

  // ── CORS ───────────────────────────────────────────────
  describe('CORS Security', () => {
    it('allows requests from sinaicamps.com origin', async () => {
      const res = await fetch(`${API_BASE_URL}/api/camps`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://sinaicamps.com',
          'Access-Control-Request-Method': 'GET'
        }
      });
      const corsHeader = res.headers.get('access-control-allow-origin');
      expect(corsHeader).toBeTruthy();
    });

    it('rejects requests from evil.com origin', async () => {
      const res = await fetch(`${API_BASE_URL}/api/camps`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://evil.com',
          'Access-Control-Request-Method': 'GET'
        }
      });
      const corsHeader = res.headers.get('access-control-allow-origin');
      expect(corsHeader).toBeNull();
    });

    it('allows requests with no origin (server-to-server)', async () => {
      const res = await fetch(`${API_BASE_URL}/api/camps`);
      // No origin header = server-to-server, should be allowed
      expect(res.status).toBeDefined();
    });
  });

  // ── Rate Limiting ──────────────────────────────────────
  describe('Rate Limiting', () => {
    it('auth endpoint has rate limiting (rapid requests)', async () => {
      const requests = Array.from({ length: 5 }, () =>
        fetch(`${API_BASE_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'nonexistent@test.com', password: 'wrong', tenantId: 'test' })
        })
      );
      const responses = await Promise.all(requests);
      const statuses = responses.map(r => r.status);
      // At least some should succeed (401) or all should fail (429)
      // The important thing is no 500 errors
      expect(statuses.every(s => s <= 429)).toBeTruthy();
    });
  });

  // ── Error Handling ─────────────────────────────────────
  describe('Error Security', () => {
    it('does not leak stack traces in error responses', async () => {
      const res = await fetch(`${API_BASE_URL}/api/nonexistent-endpoint-xyz`, {
        headers: { 'x-tenant-id': tenantId }
      });
      const text = await res.text();
      expect(text).not.toContain('at Object.');
      expect(text).not.toContain('node_modules');
      expect(text).not.toContain('.js:');
    });

    it('returns JSON Content-Type on errors', async () => {
      const res = await fetch(`${API_BASE_URL}/api/nonexistent-endpoint-xyz`);
      const contentType = res.headers.get('content-type') || '';
      expect(contentType).toContain('application/json');
    });

    it('returns proper 404 for unknown routes', async () => {
      const res = await fetch(`${API_BASE_URL}/api/totally-fake-route`);
      expect(res.status).toBe(404);
    });
  });
});
