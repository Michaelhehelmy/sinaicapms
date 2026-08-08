import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getTenantId } from '@/lib/api';

// Mock fetch
global.fetch = vi.fn();

describe('getTenantId', () => {
  beforeEach(() => {
    localStorage.clear();
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
