import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getTenantId, setTenantScope, getTenantScope } from '@/lib/api';

// Mock fetch
global.fetch = vi.fn();

describe('getTenantId', () => {
  beforeEach(() => {
    localStorage.clear();
    setTenantScope(null);
  });

  it('returns subdomain as tenant', () => {
    Object.defineProperty(window, 'location', {
      value: { hostname: 'acacia.sinaicamps.com', origin: 'https://acacia.sinaicamps.com', search: '' },
    });
    expect(getTenantId()).toBe('acacia');
  });

  it('returns query param tenant', () => {
    Object.defineProperty(window, 'location', {
      value: { hostname: 'localhost', origin: 'http://localhost', search: '?tenant=michaelshouse' },
    });
    expect(getTenantId()).toBe('michaelshouse');
  });

  it('falls back to localStorage', () => {
    Object.defineProperty(window, 'location', {
      value: { hostname: 'localhost', origin: 'http://localhost', search: '' },
    });
    localStorage.setItem('sinaicamps_tenant_id', 'tenant_3');
    expect(getTenantId()).toBe('tenant_3');
  });

  it('returns marketplace for sinaicamps.com', () => {
    Object.defineProperty(window, 'location', {
      value: { hostname: 'sinaicamps.com', origin: 'https://sinaicamps.com', search: '' },
    });
    expect(getTenantId()).toBe('marketplace');
  });

  it('returns the authenticated admin real tenant on the marketplace host', () => {
    Object.defineProperty(window, 'location', {
      value: { hostname: 'sinaicamps.com', origin: 'https://sinaicamps.com', search: '' },
    });
    localStorage.setItem('sinaicamps_user', JSON.stringify({ id: 1, tenantId: 'michaelshouse' }));
    expect(getTenantId()).toBe('michaelshouse');
  });

  it('keeps marketplace scope for a marketplace-tenant admin session on the platform host', () => {
    Object.defineProperty(window, 'location', {
      value: { hostname: 'sinaicamps.com', origin: 'https://sinaicamps.com', search: '' },
    });
    localStorage.setItem('sinaicamps_user', JSON.stringify({ id: 2, tenantId: 'marketplace' }));
    expect(getTenantId()).toBe('marketplace');
  });

  it('returns marketplace on the platform host when no session exists', () => {
    Object.defineProperty(window, 'location', {
      value: { hostname: 'sinaicamps.com', origin: 'https://sinaicamps.com', search: '' },
    });
    expect(getTenantId()).toBe('marketplace');
  });

  it('returns empty string when the admin session lacks a real tenant', () => {
    Object.defineProperty(window, 'location', {
      value: { hostname: 'localhost', origin: 'http://localhost', search: '' },
    });
    localStorage.setItem('sinaicamps_user', JSON.stringify({ id: 3, tenantId: '' }));
    expect(getTenantId()).toBe('');
  });

  it('returns empty string when nothing else matches', () => {
    Object.defineProperty(window, 'location', {
      value: { hostname: 'localhost', origin: 'http://localhost', search: '' },
    });
    expect(getTenantId()).toBe('');
  });

  it('returns empty string when window is undefined', () => {
    vi.stubGlobal('window', undefined);
    try {
      expect(getTenantId()).toBe('');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});

describe('setTenantScope / getTenantScope (T9 super-admin drill-down override)', () => {
  beforeEach(() => {
    localStorage.clear();
    setTenantScope(null);
    Object.defineProperty(window, 'location', {
      value: { hostname: 'sinaicamps.com', origin: 'https://sinaicamps.com', search: '' },
    });
  });

  it('getTenantScope is null by default', () => {
    expect(getTenantScope()).toBeNull();
  });

  it('getTenantId returns the scope override even on the marketplace host', () => {
    setTenantScope('acaciacamp');
    expect(getTenantScope()).toBe('acaciacamp');
    expect(getTenantId()).toBe('acaciacamp');
  });

  it('getTenantId falls back to hostname after override reset', () => {
    setTenantScope('acaciacamp');
    expect(getTenantId()).toBe('acaciacamp');
    setTenantScope(null);
    expect(getTenantScope()).toBeNull();
    expect(getTenantId()).toBe('marketplace');
  });

  it('trims whitespace and ignores empty strings', () => {
    setTenantScope('  acacia  ');
    expect(getTenantScope()).toBe('acacia');
    setTenantScope('');
    expect(getTenantScope()).toBeNull();
    setTenantScope('   ');
    expect(getTenantScope()).toBeNull();
  });
});
