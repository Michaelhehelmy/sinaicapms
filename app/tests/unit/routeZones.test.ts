import { describe, it, expect } from 'vitest';

import { isRouteForbidden, resolveZone } from '@/lib/routeZones';

describe('resolveZone', () => {
  it('maps the marketplace tenant id to the marketplace zone', () => {
    expect(resolveZone(new URL('https://sinaicamps.com/'), 'marketplace')).toBe('marketplace');
  });

  it('maps an empty tenant id (localhost no param / unknown host) to the marketplace zone', () => {
    expect(resolveZone(new URL('https://localhost/'), '')).toBe('marketplace');
  });

  it('maps any real tenant id to the tenant zone', () => {
    expect(resolveZone(new URL('https://acacia.sinaicamps.com/'), 'acacia')).toBe('tenant');
    expect(resolveZone(new URL('https://acaciacamp.com/'), 'custom-domain-key')).toBe('tenant');
    expect(resolveZone(new URL('https://localhost/?tenant=acacia'), 'acacia')).toBe('tenant');
  });

  it('is independent of the URL when a tenant id is given', () => {
    // The zone is driven by the resolved tenant id, not the host itself.
    expect(resolveZone(new URL('https://sinaicamps.com/?tenant=acacia'), 'acacia')).toBe('tenant');
  });
});

describe('isRouteForbidden', () => {
  describe('marketplace zone', () => {
    it('allows marketplace-only routes', () => {
      expect(isRouteForbidden('marketplace', '/camps')).toBe(false);
      expect(isRouteForbidden('marketplace', '/camp')).toBe(false);
      expect(isRouteForbidden('marketplace', '/camp/acacia')).toBe(false);
      expect(isRouteForbidden('marketplace', '/camp/acacia/book')).toBe(false);
      expect(isRouteForbidden('marketplace', '/camp/acacia/menu')).toBe(false);
    });

    it('forbids tenant-only routes', () => {
      expect(isRouteForbidden('marketplace', '/menu')).toBe(true);
      expect(isRouteForbidden('marketplace', '/book')).toBe(true);
      expect(isRouteForbidden('marketplace', '/rooms')).toBe(true);
      expect(isRouteForbidden('marketplace', '/pos')).toBe(true);
      expect(isRouteForbidden('marketplace', '/pos/login')).toBe(true);
      expect(isRouteForbidden('marketplace', '/pos/sales')).toBe(true);
    });

    it('allows shared routes in both zones', () => {
      for (const path of ['/', '/about', '/contact', '/faq', '/gallery']) {
        expect(isRouteForbidden('marketplace', path)).toBe(false);
      }
    });
  });

  describe('tenant zone', () => {
    it('allows tenant-only routes', () => {
      expect(isRouteForbidden('tenant', '/menu')).toBe(false);
      expect(isRouteForbidden('tenant', '/book')).toBe(false);
      expect(isRouteForbidden('tenant', '/rooms')).toBe(false);
      expect(isRouteForbidden('tenant', '/pos')).toBe(false);
      expect(isRouteForbidden('tenant', '/pos/login')).toBe(false);
      expect(isRouteForbidden('tenant', '/pos/sales')).toBe(false);
    });

    it('forbids marketplace-only routes', () => {
      expect(isRouteForbidden('tenant', '/camps')).toBe(true);
      expect(isRouteForbidden('tenant', '/camp')).toBe(true);
      expect(isRouteForbidden('tenant', '/camp/acacia')).toBe(true);
      expect(isRouteForbidden('tenant', '/camp/acacia/book')).toBe(true);
      expect(isRouteForbidden('tenant', '/camp/acacia/menu')).toBe(true);
    });

    it('allows shared routes in both zones', () => {
      for (const path of ['/', '/about', '/contact', '/faq', '/gallery']) {
        expect(isRouteForbidden('tenant', path)).toBe(false);
      }
    });
  });

  describe('system routes are never forbidden', () => {
    it.each([
      '/admin',
      '/admin/settings',
      '/auth/login',
      '/register',
      '/login',
      '/api/camps',
      '/robots.txt',
      '/sitemap.xml',
      '/404',
      '/_astro/foo.js',
      '/favicon.svg',
    ])('allows system prefix %s on both zones', (path) => {
      expect(isRouteForbidden('marketplace', path)).toBe(false);
      expect(isRouteForbidden('tenant', path)).toBe(false);
    });
  });

  describe('exact-path matching', () => {
    it('does not forbid sibling paths of restricted routes', () => {
      // Only the exact owned routes are restricted — /bookings is NOT /book,
      // /rooms/extra is NOT /rooms, /camps/other is NOT /camp/*, and
      // /positing is NOT /pos.
      expect(isRouteForbidden('marketplace', '/bookings')).toBe(false);
      expect(isRouteForbidden('marketplace', '/rooms/extra')).toBe(false);
      expect(isRouteForbidden('tenant', '/camps/other')).toBe(false);
      expect(isRouteForbidden('marketplace', '/positing')).toBe(false);
    });

    it('forbids the /camp/{id} deep-link family on the tenant zone', () => {
      expect(isRouteForbidden('tenant', '/camp')).toBe(true);
      expect(isRouteForbidden('tenant', '/camp/acacia')).toBe(true);
      expect(isRouteForbidden('tenant', '/camp/acacia/book')).toBe(true);
      expect(isRouteForbidden('tenant', '/camps')).toBe(true);
    });
  });
});
