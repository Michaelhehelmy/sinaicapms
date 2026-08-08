import { describe, it, expect } from 'vitest';

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:8789';

describe('Post-Deploy Smoke Tests', () => {
  describe('Health & Availability', () => {
    it('API root returns 200 with HTML', async () => {
      const res = await fetch(`${API_BASE}/`);
      expect(res.status).toBe(200);
      const contentType = res.headers.get('content-type') || '';
      expect(contentType).toContain('text/html');
    });

    it('API root page mentions SinaiCamps', async () => {
      const res = await fetch(`${API_BASE}/`);
      const html = await res.text();
      expect(html).toContain('SinaiCamps');
    });

    it('GET /api/me with valid tenant returns data', async () => {
      const res = await fetch(`${API_BASE}/api/me`, {
        headers: { 'x-tenant-id': 'marketplace' }
      });
      expect(res.ok).toBeTruthy();
      const data = await res.json();
      expect(data).toHaveProperty('id');
    });

    it('GET /api/camps returns array', async () => {
      const res = await fetch(`${API_BASE}/api/camps`, {
        headers: { 'x-tenant-id': 'marketplace' }
      });
      expect(res.ok).toBeTruthy();
      const data = await res.json();
      expect(Array.isArray(data)).toBeTruthy();
    });

    it('GET /api/products returns array', async () => {
      const res = await fetch(`${API_BASE}/api/products`, {
        headers: { 'x-tenant-id': 'marketplace' }
      });
      expect(res.ok).toBeTruthy();
      const data = await res.json();
      expect(Array.isArray(data)).toBeTruthy();
    });
  });

  describe('Auth Endpoints', () => {
    it('POST /api/auth/login with invalid creds returns 401', async () => {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nonexistent@fake.com', password: 'wrong', tenantId: 'test' })
      });
      expect(res.status).toBe(401);
    });

    it('POST /api/auth/login with missing fields returns error', async () => {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      expect(res.ok).toBeFalsy();
    });
  });

  describe('Security Headers', () => {
    it('responses have Content-Type header', async () => {
      const res = await fetch(`${API_BASE}/api/camps`, {
        headers: { 'x-tenant-id': 'marketplace' }
      });
      const ct = res.headers.get('content-type');
      expect(ct).toBeTruthy();
    });

    it('OPTIONS requests have CORS headers', async () => {
      const res = await fetch(`${API_BASE}/api/camps`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://sinaicamps.com',
          'Access-Control-Request-Method': 'GET'
        }
      });
      const cors = res.headers.get('access-control-allow-origin');
      expect(cors).toBeTruthy();
    });
  });

  describe('POS Endpoints', () => {
    it('POST /api/pos/auth/login with invalid creds returns 401', async () => {
      const res = await fetch(`${API_BASE}/api/pos/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'nonexistent@fake.com', password: 'wrong' })
      });
      expect(res.status).toBe(401);
    });
  });

  describe('Error Handling', () => {
    it('unknown route returns 404 with JSON', async () => {
      const res = await fetch(`${API_BASE}/api/this-route-does-not-exist-xyz`);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data).toHaveProperty('error');
    });

    it('no server version leaked in headers', async () => {
      const res = await fetch(`${API_BASE}/`);
      const server = res.headers.get('server');
      if (server) {
        expect(server).not.toContain('wrangler');
        expect(server).not.toContain('cloudflare');
      }
    });
  });
});
