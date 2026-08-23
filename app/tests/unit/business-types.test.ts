import { describe, it, expect } from 'vitest';
import {
  BUSINESS_TYPES,
  BUSINESS_TYPE_ORDER,
  getBusinessType,
} from '@/lib/business-types';

describe('BUSINESS_TYPES registry', () => {
  it('registers all six business types', () => {
    expect(Object.keys(BUSINESS_TYPES).sort()).toEqual(
      ['camp', 'custom', 'hotel', 'restaurant', 'supermarket', 'transportation'].sort(),
    );
  });

  it('every schema is well-formed', () => {
    for (const [key, schema] of Object.entries(BUSINESS_TYPES)) {
      expect(schema.type).toBe(key);
      expect(schema.label).toBeTruthy();
      expect(schema.icon).toBeTruthy();
      expect(schema.description).toBeTruthy();
      expect(Array.isArray(schema.projectTypes)).toBe(true);
      expect(Array.isArray(schema.metaFields)).toBe(true);
    }
  });

  it('every business exposes phone/email/website contact meta', () => {
    for (const schema of Object.values(BUSINESS_TYPES)) {
      const keys = schema.metaFields.map((f) => f.key);
      expect(keys).toContain('phone');
      expect(keys).toContain('email');
      expect(keys).toContain('website');
    }
  });
});

describe('per-type project mappings', () => {
  it('camp businesses own camp projects only', () => {
    expect(BUSINESS_TYPES.camp.projectTypes).toEqual(['camp']);
  });

  it('supermarket businesses own supermarket projects and add delivery_area', () => {
    expect(BUSINESS_TYPES.supermarket.projectTypes).toEqual(['supermarket']);
    const keys = BUSINESS_TYPES.supermarket.metaFields.map((f) => f.key);
    expect(keys).toContain('opening_hours');
    expect(keys).toContain('delivery_area');
  });

  it('transportation adds fleet_size instead of opening_hours', () => {
    const keys = BUSINESS_TYPES.transportation.metaFields.map((f) => f.key);
    expect(keys).toContain('fleet_size');
    expect(keys).not.toContain('opening_hours');
  });

  it('restaurant adds opening_hours + cuisine_type tags', () => {
    const byKey = Object.fromEntries(BUSINESS_TYPES.restaurant.metaFields.map((f) => [f.key, f]));
    expect(byKey.opening_hours?.type).toBe('text');
    expect(byKey.cuisine_type?.type).toBe('tags');
    expect(byKey.cuisine_type?.multi).toBe(true);
  });

  it('hotel adds star_rating (1–5) and amenities tags', () => {
    const byKey = Object.fromEntries(BUSINESS_TYPES.hotel.metaFields.map((f) => [f.key, f]));
    expect(byKey.star_rating?.type).toBe('number');
    expect(byKey.star_rating?.min).toBe(1);
    expect(byKey.star_rating?.max).toBe(5);
    expect(byKey.amenities?.type).toBe('tags');
    expect(byKey.amenities?.multi).toBe(true);
  });

  it('custom has no preset project types (fully custom)', () => {
    expect(BUSINESS_TYPES.custom.projectTypes).toEqual([]);
    const keys = BUSINESS_TYPES.custom.metaFields.map((f) => f.key);
    expect(keys.sort()).toEqual(['email', 'phone', 'website']);
  });
});

describe('BUSINESS_TYPE_ORDER', () => {
  it('covers every registered type with custom last', () => {
    expect([...BUSINESS_TYPE_ORDER].sort()).toEqual(Object.keys(BUSINESS_TYPES).sort());
    expect(BUSINESS_TYPE_ORDER[BUSINESS_TYPE_ORDER.length - 1]).toBe('custom');
  });
});

describe('getBusinessType helper', () => {
  it('returns the registered schema for known types', () => {
    expect(getBusinessType('hotel')).toBe(BUSINESS_TYPES.hotel);
    expect(getBusinessType('restaurant')).toBe(BUSINESS_TYPES.restaurant);
  });

  it('falls back to custom for unknown/null/undefined', () => {
    expect(getBusinessType('spaceship')).toBe(BUSINESS_TYPES.custom);
    expect(getBusinessType(null)).toBe(BUSINESS_TYPES.custom);
    expect(getBusinessType(undefined)).toBe(BUSINESS_TYPES.custom);
    expect(getBusinessType('')).toBe(BUSINESS_TYPES.custom);
  });
});
