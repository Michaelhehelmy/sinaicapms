import { describe, it, expect, vi, afterEach } from 'vitest';
import { posUrl } from '@/lib/posUrl';

function setSearch(search: string) {
  Object.defineProperty(window, 'location', {
    value: { search },
    writable: true,
    configurable: true,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('posUrl', () => {
  describe('SSR (window undefined)', () => {
    it('returns path unchanged when window is undefined', () => {
      vi.stubGlobal('window', undefined);
      expect(posUrl('/pos/dashboard')).toBe('/pos/dashboard');
    });

    it('returns empty path unchanged when window is undefined', () => {
      vi.stubGlobal('window', undefined);
      expect(posUrl('')).toBe('');
    });
  });

  describe('no tenant param', () => {
    it('returns path unchanged with empty search', () => {
      setSearch('');
      expect(posUrl('/pos/dashboard')).toBe('/pos/dashboard');
    });

    it('returns path unchanged with unrelated params', () => {
      setSearch('?foo=bar&baz=1');
      expect(posUrl('/pos/orders')).toBe('/pos/orders');
    });
  });

  describe('with tenant param', () => {
    it('appends tenant param to path', () => {
      setSearch('?tenant=42');
      expect(posUrl('/pos/dashboard')).toBe('/pos/dashboard?tenant=42');
    });

    it('appends tenant param to empty path', () => {
      setSearch('?tenant=5');
      expect(posUrl('')).toBe('?tenant=5');
    });

    it('appends tenant to root path', () => {
      setSearch('?tenant=3');
      expect(posUrl('/')).toBe('/?tenant=3');
    });

    it('preserves existing path segments', () => {
      setSearch('?tenant=7');
      expect(posUrl('/pos/orders/123')).toBe('/pos/orders/123?tenant=7');
    });
  });

  describe('tenant encoding', () => {
    it('encodes tenant with special characters', () => {
      setSearch('?tenant=a b&foo=bar');
      expect(posUrl('/pos/checkout')).toBe('/pos/checkout?tenant=a%20b');
    });

    it('encodes tenant with ampersand', () => {
      setSearch('?tenant=Tom%26Jerry');
      expect(posUrl('/pos/dashboard')).toBe('/pos/dashboard?tenant=Tom%26Jerry');
    });

    it('encodes tenant with equals sign', () => {
      setSearch('?tenant=a%3Db');
      expect(posUrl('/pos/dashboard')).toBe('/pos/dashboard?tenant=a%3Db');
    });

    it('handles tenant value that is a number string', () => {
      setSearch('?tenant=999');
      expect(posUrl('/pos/orders')).toBe('/pos/orders?tenant=999');
    });
  });

  describe('tenant param placement', () => {
    it('ignores other params and only reads tenant', () => {
      setSearch('?tab=history&tenant=11&sort=desc');
      expect(posUrl('/pos/orders')).toBe('/pos/orders?tenant=11');
    });

    it('returns path unchanged when tenant param is empty string', () => {
      setSearch('?tenant=');
      expect(posUrl('/pos/dashboard')).toBe('/pos/dashboard');
    });

    it('handles tenant param at the start of search', () => {
      setSearch('?tenant=42&other=1');
      expect(posUrl('/pos/checkout')).toBe('/pos/checkout?tenant=42');
    });
  });
});
