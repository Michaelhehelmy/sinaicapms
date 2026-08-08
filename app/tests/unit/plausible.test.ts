import { describe, it, expect, vi, afterEach } from 'vitest';

import { resolveDataDomain, trackEvent, _trackEventImpl } from '@/lib/plausible';

describe('resolveDataDomain', () => {
  it('maps sinaicamps.com to itself', () => {
    expect(resolveDataDomain('sinaicamps.com')).toBe('sinaicamps.com');
  });

  it('maps acaciacamp.com to itself', () => {
    expect(resolveDataDomain('acaciacamp.com')).toBe('acaciacamp.com');
  });

  it('maps michaelshouse.sinaicamps.com to itself', () => {
    expect(resolveDataDomain('michaelshouse.sinaicamps.com')).toBe('michaelshouse.sinaicamps.com');
  });

  it('strips a www. prefix and lower-cases the host', () => {
    expect(resolveDataDomain('www.sinaicamps.com')).toBe('sinaicamps.com');
    expect(resolveDataDomain('WWW.AcaciaCamp.COM')).toBe('acaciacamp.com');
  });

  it('falls back to sinaicamps.com for unknown hosts', () => {
    expect(resolveDataDomain('example.com')).toBe('sinaicamps.com');
    expect(resolveDataDomain('')).toBe('sinaicamps.com');
    expect(resolveDataDomain('  sinaicamps.com  ')).toBe('sinaicamps.com');
  });
});

describe('_trackEventImpl (pure branch coverage)', () => {
  it('calls plausible with a name only when no props are given', () => {
    const fn = vi.fn();
    _trackEventImpl('Pageview', undefined, fn, false, false);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('Pageview', undefined);
  });

  it('wraps props in the Plausible props envelope', () => {
    const fn = vi.fn();
    _trackEventImpl('Tenant: Booking Created', { campId: 7, currency: 'EGP' }, fn, false, false);
    expect(fn).toHaveBeenCalledWith('Tenant: Booking Created', {
      props: { campId: 7, currency: 'EGP' },
    });
  });

  it('no-ops when the plausible function is missing', () => {
    expect(() => _trackEventImpl('Pageview', undefined, undefined, false, false)).not.toThrow();
  });

  it('no-ops under SSR', () => {
    const fn = vi.fn();
    _trackEventImpl('Pageview', undefined, fn, true, false);
    expect(fn).not.toHaveBeenCalled();
  });

  it('no-ops under test mode', () => {
    const fn = vi.fn();
    _trackEventImpl('Pageview', undefined, fn, false, true);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('trackEvent', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('delegates to window.plausible with props outside test mode', () => {
    vi.stubEnv('MODE', 'development');
    const fn = vi.fn();
    vi.stubGlobal('plausible', fn);

    trackEvent('Tenant: Dashboard View', { tenantId: 'abc' });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('Tenant: Dashboard View', { props: { tenantId: 'abc' } });
  });

  it('delegates to window.plausible without props outside test mode', () => {
    vi.stubEnv('MODE', 'development');
    const fn = vi.fn();
    vi.stubGlobal('plausible', fn);

    trackEvent('Pageview');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('Pageview', undefined);
  });

  it('no-ops when window.plausible is not a function', () => {
    vi.stubEnv('MODE', 'development');
    vi.stubGlobal('plausible', undefined);

    expect(() => trackEvent('Pageview')).not.toThrow();
  });

  it('no-ops in test mode even when window.plausible exists', () => {
    const fn = vi.fn();
    vi.stubGlobal('plausible', fn);

    trackEvent('Pageview');

    expect(fn).not.toHaveBeenCalled();
  });

  it('no-ops when there is no window (SSR)', () => {
    vi.stubEnv('MODE', 'development');
    vi.stubGlobal('window', undefined);

    expect(() => trackEvent('Pageview')).not.toThrow();
  });
});
