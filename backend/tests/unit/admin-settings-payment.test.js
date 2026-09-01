/**
 * Unit tests for admin-settings.js payment section.
 *
 * Covers: GET masks secrets, PUT preserves/overwrites/clears secrets,
 * and the payment column is persisted in the UPDATE statement.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/middleware/requireAuth.js', () => ({
  requireAuth: () => async () => ({ user: { id: 'super-admin-1' } }),
}));

import { adminSettingsRoutes } from '../../src/api/admin-settings.js';
import { Hono } from 'hono';

// ── Helpers ────────────────────────────────────────────────────────────────

const DEFAULT_PAYMENT = {
  enabled: false,
  secretKey: '',
  hmacSecret: '',
  integrationIds: '',
  baseUrl: 'https://accept.paymob.com',
  publicKey: '',
  currency: 'EGP',
  marketplaceFeePct: 0,
};

function buildSettingsRow(overrides = {}) {
  return {
    id: 1,
    feature_flags: JSON.stringify({ financials: false, hr: false, supply: false, crm: false, storefront: false, ai: false }),
    email_templates: JSON.stringify({}),
    defaults: JSON.stringify({ taxRate: 0, currency: 'USD', timezone: 'UTC', dateFormat: 'YYYY-MM-DD' }),
    branding: JSON.stringify({ platformName: 'SinaiCamps', logoUrl: null, faviconUrl: null, primaryColor: '#16a34a' }),
    payment: JSON.stringify({ ...DEFAULT_PAYMENT, ...overrides }),
    updated_at: '2026-09-01T00:00:00Z',
    ...overrides._raw,
  };
}

function makeDb(existingRow) {
  let storedRow = existingRow || buildSettingsRow();
  return {
    prepare: vi.fn((sql) => {
      const stmt = {
        bind: vi.fn((...binds) => {
          stmt._binds = binds;
          return stmt;
        }),
        _binds: [],
        first: vi.fn(async () => {
          if (/SELECT/.test(sql) && /platform_settings/.test(sql)) return storedRow;
          return null;
        }),
        run: vi.fn(async () => {
          // Simulate UPDATE — extract payment from binds
          if (/UPDATE platform_settings/.test(sql)) {
            // payment is the 5th bind (0-indexed 4) in the UPDATE
            const paymentJson = stmt._binds[4];
            if (paymentJson !== undefined) {
              storedRow = { ...storedRow, payment: paymentJson };
            }
          }
          if (/INSERT INTO platform_settings/.test(sql)) {
            const paymentJson = stmt._binds[4];
            if (paymentJson !== undefined) {
              storedRow = { ...storedRow, payment: paymentJson };
            }
          }
          return { meta: { changes: 1 } };
        }),
      };
      return stmt;
    }),
  };
}

function makeApp(db) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.env = { DB: db };
    await next();
  });
  app.route('/', adminSettingsRoutes);
  return app;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Admin Settings — Payment Section', () => {
  describe('GET / — masks secrets', () => {
    it('returns secretKeySet/hmacSecretSet booleans instead of raw values', async () => {
      const db = makeDb(buildSettingsRow({ secretKey: 'sk_live_abc123', hmacSecret: 'hmac_xyz789' }));
      const app = makeApp(db);
      const res = await app.request('/');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.payment.secretKeySet).toBe(true);
      expect(data.payment.hmacSecretSet).toBe(true);
      expect(data.payment).not.toHaveProperty('secretKey');
      expect(data.payment).not.toHaveProperty('hmacSecret');
    });

    it('returns secretKeySet: false when no secret stored', async () => {
      const db = makeDb(buildSettingsRow({ secretKey: '', hmacSecret: '' }));
      const app = makeApp(db);
      const res = await app.request('/');
      const data = await res.json();

      expect(data.payment.secretKeySet).toBe(false);
      expect(data.payment.hmacSecretSet).toBe(false);
    });

    it('returns non-secret payment fields as-is', async () => {
      const db = makeDb(buildSettingsRow({
        enabled: true,
        integrationIds: '123,456',
        baseUrl: 'https://custom.paymob.com',
        publicKey: 'pk_test_xyz',
        currency: 'EGP',
        marketplaceFeePct: 2.5,
      }));
      const app = makeApp(db);
      const res = await app.request('/');
      const data = await res.json();

      expect(data.payment.enabled).toBe(true);
      expect(data.payment.integrationIds).toBe('123,456');
      expect(data.payment.baseUrl).toBe('https://custom.paymob.com');
      expect(data.payment.publicKey).toBe('pk_test_xyz');
      expect(data.payment.currency).toBe('EGP');
      expect(data.payment.marketplaceFeePct).toBe(2.5);
    });
  });

  describe('PUT / — payment merge', () => {
    it('stores new secretKey and shows secretKeySet:true on GET', async () => {
      const db = makeDb(buildSettingsRow());
      const app = makeApp(db);
      const putRes = await app.request('/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment: { secretKey: 'sk_live_new_secret' } }),
      });
      expect((await putRes.json()).success).toBe(true);

      const getRes = await app.request('/');
      const data = await getRes.json();
      expect(data.payment.secretKeySet).toBe(true);
    });

    it('omitting secretKey keeps existing stored secret', async () => {
      const db = makeDb(buildSettingsRow({ secretKey: 'sk_live_existing' }));
      const app = makeApp(db);
      // PUT with only enabled changed — no secretKey field
      await app.request('/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment: { enabled: true } }),
      });

      const getRes = await app.request('/');
      const data = await getRes.json();
      expect(data.payment.secretKeySet).toBe(true);
      expect(data.payment.enabled).toBe(true);
    });

    it('PUT with secretKey:"" clears the secret', async () => {
      const db = makeDb(buildSettingsRow({ secretKey: 'sk_live_to_clear' }));
      const app = makeApp(db);
      await app.request('/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment: { secretKey: '' } }),
      });

      const getRes = await app.request('/');
      const data = await getRes.json();
      expect(data.payment.secretKeySet).toBe(false);
    });

    it('PUT with hmacSecret:"" clears it', async () => {
      const db = makeDb(buildSettingsRow({ hmacSecret: 'hmac_to_clear' }));
      const app = makeApp(db);
      await app.request('/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment: { hmacSecret: '' } }),
      });

      const getRes = await app.request('/');
      const data = await getRes.json();
      expect(data.payment.hmacSecretSet).toBe(false);
    });

    it('omitting hmacSecret keeps existing stored secret', async () => {
      const db = makeDb(buildSettingsRow({ hmacSecret: 'hmac_keep_me' }));
      const app = makeApp(db);
      await app.request('/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment: { currency: 'SAR' } }),
      });

      const getRes = await app.request('/');
      const data = await getRes.json();
      expect(data.payment.hmacSecretSet).toBe(true);
      expect(data.payment.currency).toBe('SAR');
    });

    it('PUT response also masks secrets', async () => {
      const db = makeDb(buildSettingsRow());
      const app = makeApp(db);
      const putRes = await app.request('/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment: { secretKey: 'sk_x', hmacSecret: 'hmac_x' } }),
      });
      const data = await putRes.json();

      expect(data.payment.secretKeySet).toBe(true);
      expect(data.payment.hmacSecretSet).toBe(true);
      expect(data.payment).not.toHaveProperty('secretKey');
      expect(data.payment).not.toHaveProperty('hmacSecret');
    });
  });
});
