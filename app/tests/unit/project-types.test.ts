import { describe, it, expect } from 'vitest';
import {
  PROJECT_TYPES,
  PROJECT_TYPE_ORDER,
  getProjectType,
  campProjectType,
  supermarketProjectType,
  transportationProjectType,
  restaurantProjectType,
  encodeMetaValue,
  decodeMetaValue,
  buildMetaOps,
  isMetaOpsEmpty,
} from '@/lib/project-types';
import type { MetaFieldDef, MetaRow } from '@/lib/project-types';

describe('PROJECT_TYPES registry', () => {
  it('registers exactly the four shipped verticals', () => {
    expect(Object.keys(PROJECT_TYPES).sort()).toEqual(
      ['camp', 'restaurant', 'supermarket', 'transportation'].sort(),
    );
  });

  it('every schema has the required identity fields', () => {
    for (const [key, schema] of Object.entries(PROJECT_TYPES)) {
      expect(schema.type).toBe(key);
      expect(schema.label).toBeTruthy();
      expect(schema.icon).toBeTruthy();
      expect(schema.description).toBeTruthy();
      expect(Array.isArray(schema.coreFields)).toBe(true);
      expect(schema.coreFields.length).toBeGreaterThan(0);
      expect(Array.isArray(schema.metaFields)).toBe(true);
    }
  });

  it('meta field keys are unique within a schema', () => {
    for (const schema of Object.values(PROJECT_TYPES)) {
      const keys = schema.metaFields.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('select meta fields always declare their options', () => {
    for (const schema of Object.values(PROJECT_TYPES)) {
      for (const field of schema.metaFields) {
        if (field.type === 'select') {
          expect(field.options).toBeDefined();
          expect(field.options!.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('multi is only used with tags or image-gallery types', () => {
    for (const schema of Object.values(PROJECT_TYPES)) {
      for (const field of schema.metaFields) {
        if (field.multi) {
          expect(['tags', 'image-gallery']).toContain(field.type);
        }
      }
    }
  });
});

describe('camp schema', () => {
  it('has the full accommodation core-field set', () => {
    expect(campProjectType.coreFields).toEqual([
      'name',
      'location',
      'start_date',
      'end_date',
      'capacity',
      'description',
      'status',
    ]);
  });

  it('declares all seven camp meta fields with correct types', () => {
    const byKey = Object.fromEntries(campProjectType.metaFields.map((f) => [f.key, f]));
    expect(byKey.activities?.type).toBe('tags');
    expect(byKey.notes?.type).toBe('textarea');
    expect(byKey.weather_conditions?.type).toBe('text');
    expect(byKey.accommodation_type?.type).toBe('select');
    expect(byKey.emergency_contact?.type).toBe('text');
    expect(byKey.check_in_time?.type).toBe('text');
    expect(byKey.check_out_time?.type).toBe('text');
  });

  it('accommodation_type offers tent/cabin/hotel/mixed', () => {
    const acc = campProjectType.metaFields.find((f) => f.key === 'accommodation_type');
    expect(acc?.options).toEqual(['tent', 'cabin', 'hotel', 'mixed']);
  });
});

describe('supermarket schema', () => {
  it('declares the five store meta fields with correct types', () => {
    const byKey = Object.fromEntries(supermarketProjectType.metaFields.map((f) => [f.key, f]));
    expect(byKey.opening_hours?.type).toBe('text');
    expect(byKey.payment_methods?.type).toBe('tags');
    expect(byKey.delivery_available?.type).toBe('select');
    expect(byKey.product_categories?.type).toBe('tags');
    expect(byKey.loyalty_program?.type).toBe('text');
  });

  it('delivery_available is a yes/no select', () => {
    const delivery = supermarketProjectType.metaFields.find(
      (f) => f.key === 'delivery_available',
    );
    expect(delivery?.options).toEqual(['yes', 'no']);
  });
});

describe('transportation schema', () => {
  it('declares the seven route meta fields with correct types', () => {
    const byKey = Object.fromEntries(transportationProjectType.metaFields.map((f) => [f.key, f]));
    expect(byKey.route_origin?.type).toBe('text');
    expect(byKey.route_destination?.type).toBe('text');
    expect(byKey.vehicle_type?.type).toBe('select');
    expect(byKey.schedule?.type).toBe('textarea');
    expect(byKey.price_per_trip?.type).toBe('number');
    expect(byKey.stops?.type).toBe('textarea');
    expect(byKey.amenities?.type).toBe('tags');
  });

  it('vehicle_type covers bus/van/car/train/flight', () => {
    const vehicle = transportationProjectType.metaFields.find((f) => f.key === 'vehicle_type');
    expect(vehicle?.options).toEqual(['bus', 'van', 'car', 'train', 'flight']);
  });

  it('route origin/destination are required', () => {
    const byKey = Object.fromEntries(transportationProjectType.metaFields.map((f) => [f.key, f]));
    expect(byKey.route_origin?.required).toBe(true);
    expect(byKey.route_destination?.required).toBe(true);
  });
});

describe('restaurant schema', () => {
  it('declares the six dining meta fields with correct types', () => {
    const byKey = Object.fromEntries(restaurantProjectType.metaFields.map((f) => [f.key, f]));
    expect(byKey.cuisine_type?.type).toBe('tags');
    expect(byKey.opening_hours?.type).toBe('text');
    expect(byKey.seating_capacity?.type).toBe('number');
    expect(byKey.reservation_required?.type).toBe('select');
    expect(byKey.menu_highlights?.type).toBe('textarea');
    expect(byKey.dietary_options?.type).toBe('tags');
  });

  it('reservation_required is a yes/no select', () => {
    const res = restaurantProjectType.metaFields.find(
      (f) => f.key === 'reservation_required',
    );
    expect(res?.options).toEqual(['yes', 'no']);
  });
});

describe('getProjectType helper', () => {
  it('returns the registered schema for known types', () => {
    expect(getProjectType('camp')).toBe(campProjectType);
    expect(getProjectType('supermarket')).toBe(supermarketProjectType);
  });

  it('falls back to a generic custom schema for unknown types', () => {
    const schema = getProjectType('spaceship');
    expect(schema.type).toBe('spaceship');
    expect(schema.label).toBe('Spaceship');
    expect(schema.icon).toBeTruthy();
    expect(schema.coreFields).toContain('name');
    expect(schema.metaFields).toEqual([]);
  });

  it('handles null/undefined types', () => {
    expect(getProjectType(null).type).toBe('custom');
    expect(getProjectType(undefined).label).toBe('Custom');
    expect(getProjectType('').icon).toBeTruthy();
  });
});

describe('PROJECT_TYPE_ORDER', () => {
  it('lists the four verticals in registry order (custom excluded)', () => {
    expect(PROJECT_TYPE_ORDER).toEqual(['camp', 'supermarket', 'transportation', 'restaurant']);
  });
});

const campField = (key: string): MetaFieldDef => {
  const f = campProjectType.metaFields.find((x) => x.key === key);
  if (!f) throw new Error(`missing camp meta field ${key}`);
  return f;
};

const restaurantField = (key: string): MetaFieldDef => {
  const f = restaurantProjectType.metaFields.find((x) => x.key === key);
  if (!f) throw new Error(`missing restaurant meta field ${key}`);
  return f;
};

describe('encodeMetaValue', () => {
  it('serializes tags arrays to a JSON string', () => {
    expect(encodeMetaValue(campField('activities'), ['Hiking', 'Stargazing'])).toBe(
      JSON.stringify(['Hiking', 'Stargazing']),
    );
  });

  it('returns null for empty multi values (delete signal)', () => {
    const activities = campField('activities');
    expect(encodeMetaValue(activities, [])).toBeNull();
    expect(encodeMetaValue(activities, undefined)).toBeNull();
    // legacy comma state that trims to nothing
    expect(encodeMetaValue(activities, ' , ,')).toBeNull();
  });

  it('tolerates legacy comma-separated strings for multi fields', () => {
    expect(encodeMetaValue(campField('activities'), 'Hiking, Diving')).toBe(
      JSON.stringify(['Hiking', 'Diving']),
    );
  });

  it('passes scalars through as strings and nulls empties', () => {
    const acc = campField('accommodation_type');
    expect(encodeMetaValue(acc, 'tent')).toBe('tent');
    expect(encodeMetaValue(campField('check_in_time'), '')).toBeNull();
    expect(encodeMetaValue(acc, null)).toBeNull();
    expect(encodeMetaValue(acc, undefined)).toBeNull();
    expect(encodeMetaValue(acc, '   ')).toBeNull();
  });

  it('stringifies numbers for number fields', () => {
    expect(encodeMetaValue(restaurantField('seating_capacity'), 42)).toBe('42');
  });
});

describe('decodeMetaValue', () => {
  it('parses JSON arrays back into string[]', () => {
    expect(decodeMetaValue(campField('activities'), '["A","B"]')).toEqual(['A', 'B']);
  });

  it('falls back to comma-splitting for legacy multi rows', () => {
    expect(decodeMetaValue(campField('activities'), 'A, B')).toEqual(['A', 'B']);
    expect(decodeMetaValue(campField('activities'), 'wifi')).toEqual(['wifi']);
  });

  it('returns raw strings untouched for scalar fields', () => {
    expect(decodeMetaValue(campField('accommodation_type'), 'cabin')).toBe('cabin');
    expect(decodeMetaValue(campField('accommodation_type'), '["not","decoded"]')).toBe(
      '["not","decoded"]',
    );
  });

  it('maps null/undefined to the field-native empty value', () => {
    expect(decodeMetaValue(campField('activities'), null)).toEqual([]);
    expect(decodeMetaValue(campField('accommodation_type'), null)).toBe('');
    expect(decodeMetaValue(campField('activities'), undefined)).toEqual([]);
  });
});

describe('buildMetaOps', () => {
  const row = (id: number, metaKey: string, metaValue: string): MetaRow => ({
    id,
    metaKey,
    metaValue,
  });

  it('creates ops for keys with no existing row', () => {
    const ops = buildMetaOps([], { accommodation_type: 'tent' }, [campField('accommodation_type')]);
    expect(ops).toEqual({ creates: [{ key: 'accommodation_type', value: 'tent' }], updates: [], deletes: [] });
  });

  it('updates only when the encoded value actually differs', () => {
    const rows = [row(7, 'accommodation_type', 'tent')];
    expect(buildMetaOps(rows, { accommodation_type: 'cabin' }, [campField('accommodation_type')]).updates).toEqual([
      { id: 7, value: 'cabin' },
    ]);
    expect(isMetaOpsEmpty(buildMetaOps(rows, { accommodation_type: 'tent' }, [campField('accommodation_type')]))).toBe(true);
  });

  it('deletes rows whose next value encodes to null', () => {
    const ops = buildMetaOps([row(9, 'activities', '["Hiking"]')], { activities: [] }, [campField('activities')]);
    expect(ops.deletes).toEqual([9]);
    expect(ops.creates).toEqual([]);
  });

  it('never diffs excluded keys even when a row exists', () => {
    const rows = [row(3, 'notes', 'legacy note')];
    const ops = buildMetaOps(rows, { notes: 'changed locally' }, [campField('notes')], ['notes']);
    expect(isMetaOpsEmpty(ops)).toBe(true);
  });

  it('ignores foreign keys present in rows but absent from the schema', () => {
    // Project switched camp → restaurant; the old camp row must survive.
    const ops = buildMetaOps(
      [row(5, 'accommodation_type', 'tent'), row(6, 'activities', '["Hiking"]')],
      { cuisine_type: 'Seafood' },
      [restaurantField('cuisine_type')],
    );
    // cuisine_type is a tags (multi) field → plain strings are normalized
    // into a one-element JSON array on write.
    expect(ops.creates).toEqual([{ key: 'cuisine_type', value: '["Seafood"]' }]);
    expect(ops.updates).toEqual([]);
    expect(ops.deletes).toEqual([]);
  });

  it('reports an empty diff via isMetaOpsEmpty', () => {
    expect(isMetaOpsEmpty({ creates: [], updates: [], deletes: [] })).toBe(true);
    expect(isMetaOpsEmpty({ creates: [], updates: [{ id: 1, value: 'x' }], deletes: [] })).toBe(false);
  });
});
