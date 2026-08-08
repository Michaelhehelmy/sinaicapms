import { describe, it, expect } from 'vitest';
import {
  API_BASE_URL,
  superAdminLogin,
  createTestTenant,
  createTenantAdmin,
  tenantAdminLogin,
  deleteTestTenant
} from '../helpers';

describe('API Contract — Response Shape Validation', () => {
  let superAdminToken;
  let tenantId;
  const ts = Date.now();
  const subdomain = `contract-${ts}`;
  const adminEmail = `admin@${subdomain}.com`;
  const adminPassword = 'Password123';
  let tenantToken;

  beforeAll(async () => {
    superAdminToken = await superAdminLogin();
    tenantId = await createTestTenant(subdomain, subdomain, 'Contract Test Camp');
    await createTenantAdmin(tenantId, adminEmail, adminPassword, superAdminToken);
    tenantToken = await tenantAdminLogin(tenantId, adminEmail, adminPassword);
  });

  afterAll(async () => {
    if (tenantId && superAdminToken) {
      await deleteTestTenant(tenantId, superAdminToken);
    }
  });

  // ── GET /api/me ────────────────────────────────────────
  describe('GET /api/me', () => {
    it('returns object with expected fields', async () => {
      const res = await fetch(`${API_BASE_URL}/api/me`, {
        headers: { 'x-tenant-id': tenantId }
      });
      expect(res.ok).toBeTruthy();
      const data = await res.json();
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('name');
      expect(typeof data.id).toBe('string');
      expect(typeof data.name).toBe('string');
    });
  });

  // ── GET /api/camps ─────────────────────────────────────
  describe('GET /api/camps', () => {
    it('returns array', async () => {
      const res = await fetch(`${API_BASE_URL}/api/camps`, {
        headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
      });
      expect(res.ok).toBeTruthy();
      const data = await res.json();
      expect(Array.isArray(data)).toBeTruthy();
    });

    it('each camp has id, name fields', async () => {
      const res = await fetch(`${API_BASE_URL}/api/camps`, {
        headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
      });
      const data = await res.json();
      expect(Array.isArray(data)).toBeTruthy();
      if (data.length > 0) {
        const camp = data[0];
        expect(camp).toHaveProperty('id');
        expect(camp).toHaveProperty('name');
        expect(typeof camp.id).toBe('string');
        expect(typeof camp.name).toBe('string');
      }
    });
  });

  // ── GET /api/products ──────────────────────────────────
  describe('GET /api/products', () => {
    it('returns array', async () => {
      const res = await fetch(`${API_BASE_URL}/api/products`, {
        headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
      });
      expect(res.ok).toBeTruthy();
      const data = await res.json();
      expect(Array.isArray(data)).toBeTruthy();
    });
  });

  // ── GET /api/rooms ─────────────────────────────────────
  describe('GET /api/rooms', () => {
    it('returns array', async () => {
      const res = await fetch(`${API_BASE_URL}/api/rooms`, {
        headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
      });
      expect(res.ok).toBeTruthy();
      const data = await res.json();
      expect(Array.isArray(data)).toBeTruthy();
    });
  });

  // ── GET /api/meals ─────────────────────────────────────
  describe('GET /api/meals', () => {
    it('returns array', async () => {
      const res = await fetch(`${API_BASE_URL}/api/meals`, {
        headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
      });
      expect(res.ok).toBeTruthy();
      const data = await res.json();
      expect(Array.isArray(data)).toBeTruthy();
    });
  });

  // ── GET /api/orders ────────────────────────────────────
  describe('GET /api/orders', () => {
    it('returns array', async () => {
      const res = await fetch(`${API_BASE_URL}/api/orders`, {
        headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
      });
      expect(res.ok).toBeTruthy();
      const data = await res.json();
      expect(Array.isArray(data)).toBeTruthy();
    });
  });

  // ── GET /api/rateplans ─────────────────────────────────
  describe('GET /api/rateplans', () => {
    it('returns array', async () => {
      const res = await fetch(`${API_BASE_URL}/api/rateplans`, {
        headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
      });
      expect(res.ok).toBeTruthy();
      const data = await res.json();
      expect(Array.isArray(data)).toBeTruthy();
    });
  });

  // ── GET /api/categories ────────────────────────────────
  describe('GET /api/categories', () => {
    it('returns array', async () => {
      const res = await fetch(`${API_BASE_URL}/api/categories`, {
        headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
      });
      expect(res.ok).toBeTruthy();
      const data = await res.json();
      expect(Array.isArray(data)).toBeTruthy();
    });
  });

  // ── GET /api/meal-categories ───────────────────────────
  describe('GET /api/meal-categories', () => {
    it('returns array', async () => {
      const res = await fetch(`${API_BASE_URL}/api/meal-categories`, {
        headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
      });
      expect(res.ok).toBeTruthy();
      const data = await res.json();
      expect(Array.isArray(data)).toBeTruthy();
    });
  });

  // ── Error Responses ────────────────────────────────────
  describe('Error Response Shape', () => {
    it('POST /api/camps with missing name returns { success: false, error }', async () => {
      const res = await fetch(`${API_BASE_URL}/api/camps`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tenantToken}`,
          'x-tenant-id': tenantId
        },
        body: JSON.stringify({})
      });
      expect(res.ok).toBeFalsy();
      const data = await res.json();
      expect(data).toHaveProperty('error');
    });

    it('POST /api/auth/login with wrong creds returns { success: false, error }', async () => {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nonexistent@test.com', password: 'wrong', tenantId: 'test' })
      });
      expect(res.ok).toBeFalsy();
      const data = await res.json();
      expect(data).toHaveProperty('error');
    });

    it('GET /api/nonexistent returns 404 with JSON body', async () => {
      const res = await fetch(`${API_BASE_URL}/api/totally-fake-route-xyz`);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data).toHaveProperty('error');
    });
  });
});
