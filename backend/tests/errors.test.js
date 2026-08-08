import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { errorResponse } from '../src/utils/response.js';
import {
  camelField,
  isCustomIssue,
  toValidationErrors,
  validationError,
  ZOD_DEFAULTS,
} from '../src/utils/errors.js';

describe('errors utils', () => {
  describe('camelField', () => {
    it('camelizes snake_case wire keys', () => {
      expect(camelField('start_date')).toBe('startDate');
    });

    it('camelizes nested dotted paths per segment', () => {
      expect(camelField('a.b_c')).toBe('a.bC');
    });

    it('preserves numeric array indices', () => {
      expect(camelField('items.0.meal_id')).toBe('items.0.mealId');
    });

    it('is a no-op on already-camel paths', () => {
      expect(camelField('paymentIntentId')).toBe('paymentIntentId');
      expect(camelField('orderId.confirmToken')).toBe('orderId.confirmToken');
    });
  });

  describe('isCustomIssue', () => {
    it('returns true for custom schema messages', () => {
      const schema = z.string().min(1, 'Name is required');
      const parsed = schema.safeParse('');
      expect(parsed.success).toBe(false);
      expect(isCustomIssue(parsed.error.issues[0])).toBe(true);
    });

    it('returns false for auto-generated messages', () => {
      const schema = z.string().min(1);
      const parsed = schema.safeParse('');
      expect(parsed.success).toBe(false);
      expect(isCustomIssue(parsed.error.issues[0])).toBe(false);
    });

    it('returns true for invalid_type missing field (no required_error)', () => {
      const schema = z.object({ name: z.string() });
      const parsed = schema.safeParse({});
      expect(parsed.success).toBe(false);
      expect(parsed.error.issues[0].message).toBe('Required');
      expect(isCustomIssue(parsed.error.issues[0])).toBe(false);
    });
  });

  describe('toValidationErrors', () => {
    it('keeps custom messages verbatim and camelizes fields', () => {
      const schema = z.object({ start_date: z.string().min(1, 'Start date is required') });
      const parsed = schema.safeParse({ start_date: '' });
      const errors = toValidationErrors(parsed);
      expect(errors).toEqual([{ field: 'startDate', message: 'Start date is required' }]);
    });

    it('applies the catalog to auto-generated too_small messages', () => {
      const schema = z.object({ capacity: z.number().min(1) });
      const parsed = schema.safeParse({ capacity: 0 });
      const errors = toValidationErrors(parsed);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('capacity');
      expect(errors[0].message).toContain('at least 1');
    });

    it('keeps the exact "Required" message for missing required fields', () => {
      const schema = z.object({ admin_password: z.string() });
      const parsed = schema.safeParse({});
      const errors = toValidationErrors(parsed);
      expect(errors).toEqual([{ field: 'adminPassword', message: 'Required' }]);
    });

    it('keeps the "Invalid enum" prefix for auto enum errors (compat)', () => {
      const schema = z.object({ status: z.enum(['new', 'contacted', 'converted', 'archived']) });
      const parsed = schema.safeParse({ status: 'pending' });
      const errors = toValidationErrors(parsed);
      expect(errors[0].field).toBe('status');
      expect(errors[0].message).toContain('Invalid enum');
    });

    it('passes camel-case-native schema paths through unchanged', () => {
      const schema = z.object({ paymentIntentId: z.string() });
      const parsed = schema.safeParse({});
      const errors = toValidationErrors(parsed);
      expect(errors[0].field).toBe('paymentIntentId');
    });

    it('preserves numeric array indices in nested paths', () => {
      const schema = z.object({ items: z.array(z.object({ meal_id: z.string() })) });
      const parsed = schema.safeParse({ items: [{ meal_id: 123 }] });
      expect(parsed.success).toBe(false);
      const errors = toValidationErrors(parsed);
      expect(errors[0].field).toBe('items.0.mealId');
    });
  });

  describe('validationError', () => {
    it('returns 400 with { success:false, error, errors } envelope', async () => {
      const schema = z.object({
        name: z.string().min(1, 'Name is required'),
        start_date: z.string().min(1, 'Start date is required'),
      });
      const parsed = schema.safeParse({ name: '', start_date: '' });
      const res = validationError(parsed);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Name is required; Start date is required');
      expect(body.errors).toEqual([
        { field: 'name', message: 'Name is required' },
        { field: 'startDate', message: 'Start date is required' },
      ]);
    });

    it('error string equals joined errors[].message (compat)', () => {
      const schema = z.object({ admin_password: z.string() });
      const parsed = schema.safeParse({});
      const res = validationError(parsed);
      return res.json().then((body) => {
        expect(body.error).toBe(body.errors.map((e) => e.message).join('; '));
        expect(body.error).toBe('Required');
      });
    });

    it('honors a custom status code', async () => {
      const schema = z.object({ name: z.string() });
      const parsed = schema.safeParse({});
      const res = validationError(parsed, 422);
      expect(res.status).toBe(422);
    });
  });

  describe('ZOD_DEFAULTS fidelity', () => {
    it('matches Zod invalid_type "Required" for missing fields', () => {
      const schema = z.object({ email: z.string() });
      const parsed = schema.safeParse({});
      expect(parsed.error.issues[0].message).toBe(ZOD_DEFAULTS.invalid_type(parsed.error.issues[0]));
    });

    it('matches Zod invalid_string default', () => {
      const schema = z.string().email();
      const parsed = schema.safeParse('not-an-email');
      expect(parsed.error.issues[0].message).toBe(ZOD_DEFAULTS.invalid_string(parsed.error.issues[0]));
    });
  });
});

describe('errorResponse with structured errors', () => {
  it('includes errors array when provided', async () => {
    const res = errorResponse('Bad input', 400, [{ field: 'x', message: 'y' }]);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Bad input', errors: [{ field: 'x', message: 'y' }] });
  });

  it('omits errors key for 2-arg calls (backwards compatible)', async () => {
    const res = errorResponse('Not found', 404);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Not found' });
    expect('errors' in body).toBe(false);
  });

  it('applies toCamel to errors payload but leaves single-word keys unchanged', async () => {
    const res = errorResponse('Bad input', 400, [{ field: 'startDate', message: 'x y' }]);
    const body = await res.json();
    expect(body.errors).toEqual([{ field: 'startDate', message: 'x y' }]);
  });
});
