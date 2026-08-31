import { describe, it, expect } from 'vitest';
import {
  isGoogleMapsUrl,
  extractMapCoords,
  mapsUrlToIframe,
  getLocationDisplay,
} from '@/lib/utils';

describe('isGoogleMapsUrl', () => {
  it('returns false for empty/falsy input', () => {
    expect(isGoogleMapsUrl('')).toBe(false);
    expect(isGoogleMapsUrl(null as unknown as string)).toBe(false);
    expect(isGoogleMapsUrl(undefined as unknown as string)).toBe(false);
  });

  it('matches google.com/maps URLs (case-insensitive)', () => {
    expect(isGoogleMapsUrl('https://www.google.com/maps?q=1,2')).toBe(true);
    expect(isGoogleMapsUrl('https://WWW.GOOGLE.COM/MAPS?q=1,2')).toBe(true);
  });

  it('matches maps.google URLs', () => {
    expect(isGoogleMapsUrl('https://maps.google.com/?q=1,2')).toBe(true);
  });

  it('matches goo.gl maps short links', () => {
    expect(isGoogleMapsUrl('https://goo.gl/maps/abc')).toBe(true);
  });

  it('returns false for plain addresses', () => {
    expect(isGoogleMapsUrl('Sinai, Egypt')).toBe(false);
  });
});

describe('extractMapCoords', () => {
  it('returns null for empty input', () => {
    expect(extractMapCoords('')).toBeNull();
    expect(extractMapCoords(null as unknown as string)).toBeNull();
  });

  it('extracts coordinates from ?q=LAT,LNG', () => {
    expect(extractMapCoords('https://www.google.com/maps?q=27.5,33.2')).toEqual({ lat: '27.5', lng: '33.2' });
  });

  it('extracts coordinates from ?ll=LAT,LNG', () => {
    expect(extractMapCoords('https://www.google.com/maps?ll=-10.5,20.1')).toEqual({ lat: '-10.5', lng: '20.1' });
  });

  it('extracts coordinates from @LAT,LNG', () => {
    expect(extractMapCoords('https://www.google.com/maps/@27.5,33.2,15z')).toEqual({ lat: '27.5', lng: '33.2' });
  });

  it('returns null when no coordinates found', () => {
    expect(extractMapCoords('https://www.google.com/maps/place/Somewhere')).toBeNull();
  });
});

describe('mapsUrlToIframe', () => {
  it('returns an embed src for coordinate URLs', () => {
    const src = mapsUrlToIframe('https://www.google.com/maps?q=27.5,33.2');
    expect(src).toContain('google.com/maps/embed');
    expect(src).toContain('!2d33.2');
    expect(src).toContain('!3d27.5');
  });

  it('returns a place embed for /place/ URLs', () => {
    const src = mapsUrlToIframe('https://www.google.com/maps/place/Saint Catherines');
    expect(src).toContain('google.com/maps/embed/v1/place');
    expect(src).toContain('Saint%20Catherines');
  });

  it('returns null for unrecognized URLs', () => {
    expect(mapsUrlToIframe('not-a-map')).toBeNull();
  });
});

describe('getLocationDisplay', () => {
  it('returns Sinai, Egypt for empty location', () => {
    expect(getLocationDisplay('')).toBe('Sinai, Egypt');
    expect(getLocationDisplay(null)).toBe('Sinai, Egypt');
    expect(getLocationDisplay(undefined)).toBe('Sinai, Egypt');
  });

  it('extracts a readable name from a /place/ maps URL', () => {
    const url = `https://www.google.com/maps/place/${encodeURIComponent('Saint Catherine')}`;
    expect(getLocationDisplay(url)).toBe('Saint Catherine');
  });

  it('falls back to coordinates for a coordinate maps URL', () => {
    expect(getLocationDisplay('https://www.google.com/maps?q=27.5,33.2')).toBe('27.5, 33.2');
  });

  it('returns plain addresses as-is', () => {
    expect(getLocationDisplay('Dahab, South Sinai')).toBe('Dahab, South Sinai');
  });
});
