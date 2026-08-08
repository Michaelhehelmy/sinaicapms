import { describe, it, expect } from 'vitest';
import { orderPostSchema, orderPutSchema } from '../src/api/orders.js';
import { campPostSchema, campPutSchema, productPostSchema, roomPostSchema, ratePlanPostSchema } from '../src/api/camps.js';
import { mealPostSchema, mealPutSchema } from '../src/api/meals.js';

// ─── Tests ──────────────────────────────────────────────────────

describe('orderPostSchema', () => {
  it('accepts valid minimal input', () => {
    const result = orderPostSchema.safeParse({
      camp_id: 'c1',
      room_id: 'r1',
      check_in_date: '2026-08-01',
      check_out_date: '2026-08-05',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing camp_id', () => {
    const result = orderPostSchema.safeParse({
      room_id: 'r1',
      check_in_date: '2026-08-01',
      check_out_date: '2026-08-05',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].code).toBe('invalid_type');
    }
  });

  it('rejects missing room_id', () => {
    const result = orderPostSchema.safeParse({
      camp_id: 'c1',
      check_in_date: '2026-08-01',
      check_out_date: '2026-08-05',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].code).toBe('invalid_type');
    }
  });

  it('rejects missing check_in_date', () => {
    const result = orderPostSchema.safeParse({
      camp_id: 'c1',
      room_id: 'r1',
      check_out_date: '2026-08-05',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].code).toBe('invalid_type');
    }
  });

  it('rejects empty guest_name', () => {
    const result = orderPostSchema.safeParse({
      camp_id: 'c1',
      room_id: 'r1',
      guest_name: '',
      check_in_date: '2026-08-01',
      check_out_date: '2026-08-05',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Guest name is required');
    }
  });

  it('rejects number_of_people = 0', () => {
    const result = orderPostSchema.safeParse({
      camp_id: 'c1',
      room_id: 'r1',
      number_of_people: 0,
      check_in_date: '2026-08-01',
      check_out_date: '2026-08-05',
    });
    expect(result.success).toBe(false);
  });

  it('rejects number_of_people = -5', () => {
    const result = orderPostSchema.safeParse({
      camp_id: 'c1',
      room_id: 'r1',
      number_of_people: -5,
      check_in_date: '2026-08-01',
      check_out_date: '2026-08-05',
    });
    expect(result.success).toBe(false);
  });

  it('rejects total_amount = -100', () => {
    const result = orderPostSchema.safeParse({
      camp_id: 'c1',
      room_id: 'r1',
      total_amount: -100,
      check_in_date: '2026-08-01',
      check_out_date: '2026-08-05',
    });
    expect(result.success).toBe(false);
  });

  it('accepts total_amount = 0', () => {
    const result = orderPostSchema.safeParse({
      camp_id: 'c1',
      room_id: 'r1',
      total_amount: 0,
      check_in_date: '2026-08-01',
      check_out_date: '2026-08-05',
    });
    expect(result.success).toBe(true);
  });

  it('strips unknown fields', () => {
    const result = orderPostSchema.safeParse({
      camp_id: 'c1',
      room_id: 'r1',
      check_in_date: '2026-08-01',
      check_out_date: '2026-08-05',
      unknown_field: 'should be removed',
      another_extra: 42,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.unknown_field).toBeUndefined();
      expect(result.data.another_extra).toBeUndefined();
    }
  });

  it('accepts all optional fields omitted', () => {
    const result = orderPostSchema.safeParse({
      camp_id: 'c1',
      room_id: 'r1',
      check_in_date: '2026-08-01',
      check_out_date: '2026-08-05',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.guest_name).toBeUndefined();
      expect(result.data.number_of_people).toBeUndefined();
      expect(result.data.total_amount).toBeUndefined();
    }
  });
});

describe('orderPutSchema', () => {
  it('accepts empty object (all optional)', () => {
    const result = orderPutSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects guest_name = empty string', () => {
    const result = orderPutSchema.safeParse({ guest_name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects number_of_people = 0', () => {
    const result = orderPutSchema.safeParse({ number_of_people: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects total_amount = -100', () => {
    const result = orderPutSchema.safeParse({ total_amount: -100 });
    expect(result.success).toBe(false);
  });

  it('strips unknown fields', () => {
    const result = orderPutSchema.safeParse({ notes: 'hi', fake: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fake).toBeUndefined();
    }
  });
});

describe('campPostSchema', () => {
  it('accepts valid minimal input', () => {
    const result = campPostSchema.safeParse({ name: 'Test Camp' });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const result = campPostSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Name is required');
    }
  });

  it('rejects empty name', () => {
    const result = campPostSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Name is required');
    }
  });

  it('rejects capacity = -1', () => {
    const result = campPostSchema.safeParse({ name: 'Camp', capacity: -1 });
    expect(result.success).toBe(false);
  });

  it('accepts capacity = 0', () => {
    const result = campPostSchema.safeParse({ name: 'Camp', capacity: 0 });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status enum', () => {
    const result = campPostSchema.safeParse({ name: 'Camp', status: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('accepts status = active', () => {
    const result = campPostSchema.safeParse({ name: 'Camp', status: 'active' });
    expect(result.success).toBe(true);
  });

  it('accepts status = inactive', () => {
    const result = campPostSchema.safeParse({ name: 'Camp', status: 'inactive' });
    expect(result.success).toBe(true);
  });

  it('accepts status = completed', () => {
    const result = campPostSchema.safeParse({ name: 'Camp', status: 'completed' });
    expect(result.success).toBe(true);
  });

  it('strips unknown fields', () => {
    const result = campPostSchema.safeParse({ name: 'Camp', evil: 'drop table' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.evil).toBeUndefined();
    }
  });
});

describe('campPutSchema', () => {
  it('accepts empty object (all optional)', () => {
    const result = campPutSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects name = empty string', () => {
    const result = campPutSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid status', () => {
    const result = campPutSchema.safeParse({ status: 'deleted' });
    expect(result.success).toBe(false);
  });
});

describe('mealPostSchema', () => {
  it('accepts valid input', () => {
    const result = mealPostSchema.safeParse({ name: 'Breakfast', price: 25 });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const result = mealPostSchema.safeParse({ price: 25 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].code).toBe('invalid_type');
    }
  });

  it('rejects price = -5', () => {
    const result = mealPostSchema.safeParse({ name: 'Lunch', price: -5 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Price must be non-negative');
    }
  });

  it('accepts price = 0', () => {
    const result = mealPostSchema.safeParse({ name: 'Free Snack', price: 0 });
    expect(result.success).toBe(true);
  });

  it('strips unknown fields', () => {
    const result = mealPostSchema.safeParse({ name: 'Dinner', price: 50, hack: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hack).toBeUndefined();
    }
  });
});

describe('mealPutSchema', () => {
  it('accepts empty object (all optional)', () => {
    const result = mealPutSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects name = empty string', () => {
    const result = mealPutSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects price = -1', () => {
    const result = mealPutSchema.safeParse({ price: -1 });
    expect(result.success).toBe(false);
  });
});

describe('productPostSchema', () => {
  it('accepts valid minimal input', () => {
    const result = productPostSchema.safeParse({ name: 'Deluxe Room' });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const result = productPostSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].code).toBe('invalid_type');
    }
  });

  it('rejects capacity = 0 (.min(1))', () => {
    const result = productPostSchema.safeParse({ name: 'Room', capacity: 0 });
    expect(result.success).toBe(false);
  });

  it('accepts camp_ids as array of strings', () => {
    const result = productPostSchema.safeParse({ name: 'Room', camp_ids: ['c1', 'c2'] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.camp_ids).toEqual(['c1', 'c2']);
    }
  });

  it('rejects camp_ids = string (not array)', () => {
    const result = productPostSchema.safeParse({ name: 'Room', camp_ids: 'not_an_array' });
    expect(result.success).toBe(false);
  });

  it('accepts empty camp_ids array', () => {
    const result = productPostSchema.safeParse({ name: 'Room', camp_ids: [] });
    expect(result.success).toBe(true);
  });

  it('strips unknown fields', () => {
    const result = productPostSchema.safeParse({ name: 'Room', bad: 1 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bad).toBeUndefined();
    }
  });
});

describe('roomPostSchema', () => {
  it('accepts valid minimal input', () => {
    const result = roomPostSchema.safeParse({
      camp_id: 'c1',
      product_id: 'p1',
      name: 'Room 101',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing camp_id', () => {
    const result = roomPostSchema.safeParse({ product_id: 'p1', name: 'Room' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].code).toBe('invalid_type');
    }
  });

  it('rejects missing product_id', () => {
    const result = roomPostSchema.safeParse({ camp_id: 'c1', name: 'Room' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].code).toBe('invalid_type');
    }
  });

  it('rejects missing name', () => {
    const result = roomPostSchema.safeParse({ camp_id: 'c1', product_id: 'p1' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Room name is required');
    }
  });

  it('transforms numeric floor to string', () => {
    const result = roomPostSchema.safeParse({
      camp_id: 'c1',
      product_id: 'p1',
      name: 'Room',
      floor: 2,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.floor).toBe('2');
      expect(typeof result.data.floor).toBe('string');
    }
  });

  it('accepts string floor', () => {
    const result = roomPostSchema.safeParse({
      camp_id: 'c1',
      product_id: 'p1',
      name: 'Room',
      floor: '3',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.floor).toBe('3');
    }
  });
});

describe('ratePlanPostSchema', () => {
  it('accepts valid input', () => {
    const result = ratePlanPostSchema.safeParse({
      product_id: 'p1',
      name: 'Standard',
      price_per_night: 100,
    });
    expect(result.success).toBe(true);
  });

  it('rejects price_per_night = 0 (.positive())', () => {
    const result = ratePlanPostSchema.safeParse({
      product_id: 'p1',
      name: 'Standard',
      price_per_night: 0,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Price must be positive');
    }
  });

  it('rejects price_per_night = -50', () => {
    const result = ratePlanPostSchema.safeParse({
      product_id: 'p1',
      name: 'Standard',
      price_per_night: -50,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing product_id', () => {
    const result = ratePlanPostSchema.safeParse({ name: 'Plan', price_per_night: 100 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].code).toBe('invalid_type');
    }
  });

  it('rejects missing name', () => {
    const result = ratePlanPostSchema.safeParse({ product_id: 'p1', price_per_night: 100 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].code).toBe('invalid_type');
    }
  });

  it('strips unknown fields', () => {
    const result = ratePlanPostSchema.safeParse({
      product_id: 'p1',
      name: 'Plan',
      price_per_night: 50,
      injected: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.injected).toBeUndefined();
    }
  });
});
