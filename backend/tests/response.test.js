import { describe, it, expect } from 'vitest';
import { jsonResponse, cachedJsonResponse, errorResponse, escHtml, ok, created } from '../src/utils/response.js';

describe('response utils', () => {
  describe('jsonResponse', () => {
    it('returns Response with default status 200', () => {
      const res = jsonResponse({ ok: true });
      expect(res.status).toBe(200);
    });

    it('returns Response with custom status', () => {
      const res = jsonResponse({ created: true }, 201);
      expect(res.status).toBe(201);
    });

    it('sets Content-Type to application/json', () => {
      const res = jsonResponse({});
      expect(res.headers.get('Content-Type')).toBe('application/json');
    });

    it('sets security headers', () => {
      const res = jsonResponse({});
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
      expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
      expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(res.headers.get('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()');
    });

    it('body contains serialized data', async () => {
      const data = { name: 'test', count: 42 };
      const res = jsonResponse(data);
      const body = await res.json();
      expect(body).toEqual(data);
    });

    it('handles nested objects', async () => {
      const data = { user: { id: 1, roles: ['admin'] } };
      const res = jsonResponse(data);
      const body = await res.json();
      expect(body.user.id).toBe(1);
      expect(body.user.roles).toEqual(['admin']);
    });
  });

  describe('cachedJsonResponse', () => {
    it('sets public cache headers', () => {
      const res = cachedJsonResponse({ items: [] });
      expect(res.headers.get('Cache-Control')).toContain('public');
      expect(res.headers.get('Cache-Control')).toContain('max-age=300');
    });

    it('varies the cache on x-tenant-id to prevent cross-tenant cache leaks', () => {
      const res = cachedJsonResponse({ items: [] });
      expect(res.headers.get('Vary')).toBe('x-tenant-id');
    });

    it('accepts custom maxAge', () => {
      const res = cachedJsonResponse({ items: [] }, 60);
      expect(res.headers.get('Cache-Control')).toContain('max-age=60');
    });
  });

  describe('camelCase wire contract (T3)', () => {
    it('jsonResponse emits camelCase keys from snake_case data', async () => {
      const data = { created_at: '2026-01-01', total_price: 200, check_in_date: '2026-06-01' };
      const res = jsonResponse(data);
      const body = await res.json();
      expect(body.createdAt).toBe('2026-01-01');
      expect(body.totalPrice).toBe(200);
      expect(body.checkInDate).toBe('2026-06-01');
      expect(body.created_at).toBeUndefined();
    });

    it('cachedJsonResponse emits camelCase keys (deep, incl. arrays)', async () => {
      const data = {
        results: [
          { tenant_name: 'Acacia Camp', occupancy_rate: 30 },
          { tenant_name: 'Mountain Ridge', total_rooms: 10 },
        ],
      };
      const res = cachedJsonResponse(data);
      const body = await res.json();
      expect(body.results[0].tenantName).toBe('Acacia Camp');
      expect(body.results[0].occupancyRate).toBe(30);
      expect(body.results[1].tenantName).toBe('Mountain Ridge');
      expect(body.results[1].totalRooms).toBe(10);
    });

    it('is idempotent on already-camelCase keys', async () => {
      const data = { tenantId: 't1', campIds: ['c1'], nested: { basePrice: 100 } };
      const res = jsonResponse(data);
      const body = await res.json();
      expect(body).toEqual({ tenantId: 't1', campIds: ['c1'], nested: { basePrice: 100 } });
    });

    it('does not mutate values', async () => {
      const data = { title: 'my_title_stays', options: ['a_b'] };
      const res = jsonResponse(data);
      const body = await res.json();
      expect(body.title).toBe('my_title_stays');
      expect(body.options).toEqual(['a_b']);
    });
  });

  describe('errorResponse', () => {
    it('returns Response with status 400 by default', () => {
      const res = errorResponse('Bad input');
      expect(res.status).toBe(400);
    });

    it('returns Response with custom status', () => {
      const res = errorResponse('Not found', 404);
      expect(res.status).toBe(404);
    });

    it('body contains { success: false, error: message }', async () => {
      const res = errorResponse('Something went wrong');
      const body = await res.json();
      expect(body).toEqual({ success: false, error: 'Something went wrong' });
    });
  });

  describe('ok / created (Phase 3 contract normalization)', () => {
    it('ok returns the data payload with status 200 by default', async () => {
      const res = ok({ items: [1, 2] });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ items: [1, 2] });
    });

    it('ok accepts a custom status', async () => {
      const res = ok({ done: true }, 202);
      expect(res.status).toBe(202);
    });

    it('ok emits camelCase keys like jsonResponse', async () => {
      const res = ok({ tenant_id: 't1', total_price: 5 });
      const body = await res.json();
      expect(body).toEqual({ tenantId: 't1', totalPrice: 5 });
    });

    it('created returns { success: true, id } with status 201', async () => {
      const res = created('ord_123');
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toEqual({ success: true, id: 'ord_123' });
    });

    it('created sets JSON content type and security headers', () => {
      const res = created('x');
      expect(res.headers.get('Content-Type')).toBe('application/json');
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    });
  });

  describe('escHtml', () => {
    it('escapes HTML entities', () => {
      expect(escHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    it('escapes ampersands', () => {
      expect(escHtml('a & b')).toBe('a &amp; b');
    });

    it('escapes single quotes', () => {
      expect(escHtml("it's")).toBe("it&#39;s");
    });

    it('returns non-string values as-is', () => {
      expect(escHtml(null)).toBe(null);
      expect(escHtml(undefined)).toBe(undefined);
      expect(escHtml(42)).toBe(42);
    });

    it('returns empty string as-is', () => {
      expect(escHtml('')).toBe('');
    });
  });
});
