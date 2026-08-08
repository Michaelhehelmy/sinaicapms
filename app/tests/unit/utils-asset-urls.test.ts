import { describe, it, expect } from 'vitest';
import { normalizeAssetUrl } from '@/lib/utils';

const FALLBACK = 'https://images.unsplash.com/fallback.png';

describe('normalizeAssetUrl', () => {
  it('returns fallback for null / undefined / empty / whitespace', () => {
    expect(normalizeAssetUrl(null, FALLBACK)).toBe(FALLBACK);
    expect(normalizeAssetUrl(undefined, FALLBACK)).toBe(FALLBACK);
    expect(normalizeAssetUrl('', FALLBACK)).toBe(FALLBACK);
    expect(normalizeAssetUrl('   ', FALLBACK)).toBe(FALLBACK);
    expect(normalizeAssetUrl(null)).toBe('');
    expect(normalizeAssetUrl(undefined)).toBe('');
  });

  it('strips localhost URLs regardless of protocol', () => {
    expect(normalizeAssetUrl('http://localhost:8001/x.png', FALLBACK)).toBe(FALLBACK);
    expect(normalizeAssetUrl('https://localhost:8001/x.png', FALLBACK)).toBe(FALLBACK);
    expect(normalizeAssetUrl('http://localhost/x.png', FALLBACK)).toBe(FALLBACK);
    expect(normalizeAssetUrl('http://foo.localhost:8001/x.png', FALLBACK)).toBe(FALLBACK);
    expect(normalizeAssetUrl('HTTP://LOCALHOST:8001/x.png', FALLBACK)).toBe(FALLBACK);
  });

  it('strips loopback / private hostnames', () => {
    expect(normalizeAssetUrl('http://127.0.0.1:8000/x', FALLBACK)).toBe(FALLBACK);
    expect(normalizeAssetUrl('http://127.0.0.1/x.png', FALLBACK)).toBe(FALLBACK);
    expect(normalizeAssetUrl('http://127.34.56.78/logo.png', FALLBACK)).toBe(FALLBACK);
    expect(normalizeAssetUrl('http://0.0.0.0:8000/x.png', FALLBACK)).toBe(FALLBACK);
    expect(normalizeAssetUrl('http://192.168.1.10/x.png', FALLBACK)).toBe(FALLBACK);
    expect(normalizeAssetUrl('http://10.0.0.5/x.png', FALLBACK)).toBe(FALLBACK);
    expect(normalizeAssetUrl('http://[::1]:8080/x.png', FALLBACK)).toBe(FALLBACK);
  });

  it('passes through valid https URLs unchanged', () => {
    expect(normalizeAssetUrl('https://valid.com/x.png', FALLBACK)).toBe('https://valid.com/x.png');
    expect(normalizeAssetUrl('https://cdn.valid.com/img/logo.png?w=200&q=80', FALLBACK)).toBe(
      'https://cdn.valid.com/img/logo.png?w=200&q=80',
    );
    expect(normalizeAssetUrl('https://sub.domain.com/a/b/c.jpg', FALLBACK)).toBe(
      'https://sub.domain.com/a/b/c.jpg',
    );
  });

  it('upgrades http URLs to https', () => {
    expect(normalizeAssetUrl('http://valid.com/x.png', FALLBACK)).toBe('https://valid.com/x.png');
    expect(normalizeAssetUrl('http://valid.com:8080/x.png', FALLBACK)).toBe(
      'https://valid.com:8080/x.png',
    );
    expect(normalizeAssetUrl('http://sub.valid.com/a/b.png', FALLBACK)).toBe(
      'https://sub.valid.com/a/b.png',
    );
  });

  it('returns fallback for garbage input and non-http protocols', () => {
    expect(normalizeAssetUrl('not a url', FALLBACK)).toBe(FALLBACK);
    expect(normalizeAssetUrl('http://', FALLBACK)).toBe(FALLBACK);
    expect(normalizeAssetUrl('javascript:alert(1)', FALLBACK)).toBe(FALLBACK);
    expect(normalizeAssetUrl('data:text/plain,hello', FALLBACK)).toBe(FALLBACK);
    expect(normalizeAssetUrl('/relative/path.png', FALLBACK)).toBe(FALLBACK);
    expect(normalizeAssetUrl(42 as unknown as string, FALLBACK)).toBe(FALLBACK);
  });
});
