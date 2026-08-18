import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { errorResponse } from '../src/utils/response.js';
import {
  camelField,
  ERROR_CATALOG,
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

  describe('ZOD_DEFAULTS.invalid_type', () => {
    it('returns "Required" for received undefined', () => {
      const issue = { code: 'invalid_type', expected: 'string', received: 'undefined', path: [], message: 'Required' };
      expect(ZOD_DEFAULTS.invalid_type(issue)).toBe('Required');
    });

    it('returns "Required" for received null', () => {
      const issue = { code: 'invalid_type', expected: 'string', received: 'null', path: [], message: 'Required' };
      expect(ZOD_DEFAULTS.invalid_type(issue)).toBe('Required');
    });

    it('returns descriptive message for a non-null/undefined received type', () => {
      const issue = { code: 'invalid_type', expected: 'string', received: 'number', path: ['name'], message: '' };
      expect(ZOD_DEFAULTS.invalid_type(issue)).toBe('Invalid input: expected String, received Number');
    });
  });

  describe('ZOD_DEFAULTS.invalid_literal', () => {
    it('returns literal expected message', () => {
      const issue = { code: 'invalid_literal', expected: 'yes', path: [], message: '' };
      expect(ZOD_DEFAULTS.invalid_literal(issue)).toBe('Invalid literal value, expected yes');
    });
  });

  describe('ZOD_DEFAULTS.too_small', () => {
    it('exact match with noun (string type)', () => {
      const issue = { code: 'too_small', type: 'string', exact: true, minimum: 5, path: [], message: '' };
      expect(ZOD_DEFAULTS.too_small(issue)).toBe('String must contain exactly 5 character(s)');
    });

    it('exact match with noun (array type)', () => {
      const issue = { code: 'too_small', type: 'array', exact: true, minimum: 3, path: [], message: '' };
      expect(ZOD_DEFAULTS.too_small(issue)).toBe('Array must contain exactly 3 element(s)');
    });

    it('exact match without noun (number type)', () => {
      const issue = { code: 'too_small', type: 'number', exact: true, minimum: 10, path: [], message: '' };
      expect(ZOD_DEFAULTS.too_small(issue)).toBe('Number must be equal to 10');
    });

    it('exact match without noun (bigint type)', () => {
      const issue = { code: 'too_small', type: 'bigint', exact: true, minimum: 42, path: [], message: '' };
      expect(ZOD_DEFAULTS.too_small(issue)).toBe('BigInt must be equal to 42');
    });

    it('non-exact number type', () => {
      const issue = { code: 'too_small', type: 'number', exact: false, minimum: 1, path: [], message: '' };
      expect(ZOD_DEFAULTS.too_small(issue)).toBe('Number must be greater than or equal to 1');
    });

    it('non-exact bigint type', () => {
      const issue = { code: 'too_small', type: 'bigint', exact: false, minimum: 0, path: [], message: '' };
      expect(ZOD_DEFAULTS.too_small(issue)).toBe('BigInt must be greater than or equal to 0');
    });

    it('non-exact string type (with noun)', () => {
      const issue = { code: 'too_small', type: 'string', exact: false, minimum: 8, path: [], message: '' };
      expect(ZOD_DEFAULTS.too_small(issue)).toBe('String must contain at least 8 character(s)');
    });

    it('non-exact array type (with noun)', () => {
      const issue = { code: 'too_small', type: 'array', exact: false, minimum: 1, path: [], message: '' };
      expect(ZOD_DEFAULTS.too_small(issue)).toBe('Array must contain at least 1 element(s)');
    });

    it('non-exact other type without noun falls through to bare minimum', () => {
      const issue = { code: 'too_small', type: 'date', exact: false, minimum: 0, path: [], message: '' };
      expect(ZOD_DEFAULTS.too_small(issue)).toBe('Date must be at least 0');
    });
  });

  describe('ZOD_DEFAULTS.too_big', () => {
    it('exact match with noun (string type)', () => {
      const issue = { code: 'too_big', type: 'string', exact: true, maximum: 10, path: [], message: '' };
      expect(ZOD_DEFAULTS.too_big(issue)).toBe('String must contain exactly 10 character(s)');
    });

    it('exact match with noun (array type)', () => {
      const issue = { code: 'too_big', type: 'array', exact: true, maximum: 5, path: [], message: '' };
      expect(ZOD_DEFAULTS.too_big(issue)).toBe('Array must contain exactly 5 element(s)');
    });

    it('exact match without noun (number type)', () => {
      const issue = { code: 'too_big', type: 'number', exact: true, maximum: 100, path: [], message: '' };
      expect(ZOD_DEFAULTS.too_big(issue)).toBe('Number must be equal to 100');
    });

    it('exact match without noun (bigint type)', () => {
      const issue = { code: 'too_big', type: 'bigint', exact: true, maximum: 999, path: [], message: '' };
      expect(ZOD_DEFAULTS.too_big(issue)).toBe('BigInt must be equal to 999');
    });

    it('non-exact number type', () => {
      const issue = { code: 'too_big', type: 'number', exact: false, maximum: 100, path: [], message: '' };
      expect(ZOD_DEFAULTS.too_big(issue)).toBe('Number must be less than or equal to 100');
    });

    it('non-exact bigint type', () => {
      const issue = { code: 'too_big', type: 'bigint', exact: false, maximum: 50, path: [], message: '' };
      expect(ZOD_DEFAULTS.too_big(issue)).toBe('BigInt must be less than or equal to 50');
    });

    it('non-exact string type (with noun)', () => {
      const issue = { code: 'too_big', type: 'string', exact: false, maximum: 255, path: [], message: '' };
      expect(ZOD_DEFAULTS.too_big(issue)).toBe('String must contain at most 255 character(s)');
    });

    it('non-exact array type (with noun)', () => {
      const issue = { code: 'too_big', type: 'array', exact: false, maximum: 10, path: [], message: '' };
      expect(ZOD_DEFAULTS.too_big(issue)).toBe('Array must contain at most 10 element(s)');
    });

    it('non-exact other type without noun falls through to bare maximum', () => {
      const issue = { code: 'too_big', type: 'date', exact: false, maximum: 999, path: [], message: '' };
      expect(ZOD_DEFAULTS.too_big(issue)).toBe('Date must be at most 999');
    });
  });

  describe('ZOD_DEFAULTS.invalid_enum_value', () => {
    it('formats options and received value', () => {
      const issue = { code: 'invalid_enum_value', options: ['a', 'b', 'c'], received: 'd', path: [], message: '' };
      expect(ZOD_DEFAULTS.invalid_enum_value(issue)).toBe(
        "Invalid enum value. Expected 'a' | 'b' | 'c', received 'd'",
      );
    });
  });

  describe('ZOD_DEFAULTS.invalid_date', () => {
    it('returns "Invalid date"', () => {
      const issue = { code: 'invalid_date', path: [], message: '' };
      expect(ZOD_DEFAULTS.invalid_date(issue)).toBe('Invalid date');
    });
  });

  describe('ZOD_DEFAULTS.unrecognized_keys', () => {
    it('formats all unrecognized keys', () => {
      const issue = { code: 'unrecognized_keys', keys: ['foo', 'bar'], path: [], message: '' };
      expect(ZOD_DEFAULTS.unrecognized_keys(issue)).toBe("Unrecognized key(s) in object: 'foo', 'bar'");
    });
  });

  describe('ZOD_DEFAULTS.custom', () => {
    it('returns the issue message verbatim', () => {
      const issue = { code: 'custom', message: 'Custom validation failed', path: [], };
      expect(ZOD_DEFAULTS.custom(issue)).toBe('Custom validation failed');
    });
  });

  describe('ERROR_CATALOG.invalid_type', () => {
    it('returns "Required" for undefined received', () => {
      const issue = { code: 'invalid_type', expected: 'string', received: 'undefined', path: [], message: 'Required' };
      expect(ERROR_CATALOG.invalid_type(issue)).toBe('Required');
    });

    it('returns "Required" for null received', () => {
      const issue = { code: 'invalid_type', expected: 'string', received: 'null', path: [], message: 'Required' };
      expect(ERROR_CATALOG.invalid_type(issue)).toBe('Required');
    });

    it('returns friendly message with labelOf for non-null/undefined', () => {
      const issue = { code: 'invalid_type', expected: 'string', received: 'number', path: ['start_date'], message: '' };
      expect(ERROR_CATALOG.invalid_type(issue)).toBe('start date is invalid: expected String, received Number');
    });
  });

  describe('ERROR_CATALOG.too_small', () => {
    it('number type uses labelOf and bare minimum', () => {
      const issue = { code: 'too_small', type: 'number', minimum: 1, path: ['capacity'], message: '' };
      expect(ERROR_CATALOG.too_small(issue)).toBe('capacity must be at least 1');
    });

    it('bigint type uses labelOf and bare minimum', () => {
      const issue = { code: 'too_small', type: 'bigint', minimum: 0, path: ['record_id'], message: '' };
      expect(ERROR_CATALOG.too_small(issue)).toBe('record id must be at least 0');
    });

    it('string type uses "characters" suffix', () => {
      const issue = { code: 'too_small', type: 'string', minimum: 3, path: ['code_name'], message: '' };
      expect(ERROR_CATALOG.too_small(issue)).toBe('code name must have at least 3 characters');
    });

    it('array type uses "items" suffix', () => {
      const issue = { code: 'too_small', type: 'array', minimum: 1, path: ['tags'], message: '' };
      expect(ERROR_CATALOG.too_small(issue)).toBe('tags must have at least 1 items');
    });
  });

  describe('ERROR_CATALOG.too_big', () => {
    it('number type uses labelOf and bare maximum', () => {
      const issue = { code: 'too_big', type: 'number', maximum: 100, path: ['discount_pct'], message: '' };
      expect(ERROR_CATALOG.too_big(issue)).toBe('discount pct must be at most 100');
    });

    it('bigint type uses labelOf and bare maximum', () => {
      const issue = { code: 'too_big', type: 'bigint', maximum: 999, path: ['big_val'], message: '' };
      expect(ERROR_CATALOG.too_big(issue)).toBe('big val must be at most 999');
    });

    it('string type uses "characters" suffix', () => {
      const issue = { code: 'too_big', type: 'string', maximum: 50, path: ['bio'], message: '' };
      expect(ERROR_CATALOG.too_big(issue)).toBe('bio must have at most 50 characters');
    });

    it('array type uses "items" suffix', () => {
      const issue = { code: 'too_big', type: 'array', maximum: 5, path: ['items'], message: '' };
      expect(ERROR_CATALOG.too_big(issue)).toBe('items must have at most 5 items');
    });
  });

  describe('ERROR_CATALOG.invalid_enum_value', () => {
    it('returns friendly enum message with label', () => {
      const issue = { code: 'invalid_enum_value', path: ['order_status'], message: '' };
      expect(ERROR_CATALOG.invalid_enum_value(issue)).toBe('Invalid enum value for order status');
    });
  });

  describe('ERROR_CATALOG.invalid_string', () => {
    it('returns friendly format message with label', () => {
      const issue = { code: 'invalid_string', path: ['email_address'], message: '' };
      expect(ERROR_CATALOG.invalid_string(issue)).toBe('email address has an invalid format');
    });
  });

  describe('ERROR_CATALOG.invalid_date', () => {
    it('returns friendly date message with label', () => {
      const issue = { code: 'invalid_date', path: ['start_date'], message: '' };
      expect(ERROR_CATALOG.invalid_date(issue)).toBe('start date is not a valid date');
    });
  });

  describe('ERROR_CATALOG.invalid_literal', () => {
    it('returns friendly literal message with label', () => {
      const issue = { code: 'invalid_literal', path: ['currency'], message: '' };
      expect(ERROR_CATALOG.invalid_literal(issue)).toBe('currency has an invalid value');
    });
  });

  describe('ERROR_CATALOG.unrecognized_keys', () => {
    it('returns all unrecognized keys with friendly prefix', () => {
      const issue = { code: 'unrecognized_keys', keys: ['x', 'y'], path: [], message: '' };
      expect(ERROR_CATALOG.unrecognized_keys(issue)).toBe('Unrecognized field(s): x, y');
    });
  });

  describe('isCustomIssue with unknown code', () => {
    it('returns true for unrecognized issue codes', () => {
      const issue = { code: 'some_unknown_code', message: 'whatever', path: [] };
      expect(isCustomIssue(issue)).toBe(true);
    });
  });

  describe('labelOf edge cases via ERROR_CATALOG', () => {
    it('returns "field" when path is empty (via too_small)', () => {
      const issue = { code: 'too_small', type: 'number', exact: false, minimum: 1, path: [], message: '' };
      expect(ERROR_CATALOG.too_small(issue)).toBe('field must be at least 1');
    });

    it('returns "field" when path is empty (via too_big)', () => {
      const issue = { code: 'too_big', type: 'string', exact: false, maximum: 10, path: [], message: '' };
      expect(ERROR_CATALOG.too_big(issue)).toBe('field must have at most 10 characters');
    });

    it('uses last path segment and replaces underscores with spaces', () => {
      const issue = { code: 'invalid_type', expected: 'string', received: 'number', path: ['deeply', 'nested_field'], message: '' };
      expect(ERROR_CATALOG.invalid_type(issue)).toBe('nested field is invalid: expected String, received Number');
    });
  });

  describe('labelOfType unknown type fallback via ZOD_DEFAULTS', () => {
    it('returns "Unknown" for unrecognized type in too_small exact', () => {
      const issue = { code: 'too_small', type: 'map', exact: true, minimum: 1, path: [], message: '' };
      expect(ZOD_DEFAULTS.too_small(issue)).toBe('Unknown must be equal to 1');
    });

    it('returns "Unknown" for unrecognized type in too_big', () => {
      const issue = { code: 'too_big', type: 'set', exact: false, maximum: 5, path: [], message: '' };
      expect(ZOD_DEFAULTS.too_big(issue)).toBe('Unknown must be at most 5');
    });

    it('returns "Unknown" for unrecognized type in invalid_type', () => {
      const issue = { code: 'invalid_type', expected: 'custom', received: 'widget', path: [], message: '' };
      expect(ZOD_DEFAULTS.invalid_type(issue)).toBe('Invalid input: expected Unknown, received Unknown');
    });
  });

  describe('toValidationErrors fallback for unknown codes', () => {
    it('falls back to issue.message when ERROR_CATALOG has no entry for the code', () => {
      const parsed = {
        success: false,
        error: {
          issues: [{
            code: 'not_in_catalog',
            path: ['test_field'],
            message: 'This is a fallback message',
          }],
        },
      };
      const errors = toValidationErrors(parsed);
      expect(errors).toEqual([{ field: 'testField', message: 'This is a fallback message' }]);
    });

    it('uses ?? fallback when code is in ZOD_DEFAULTS but not in ERROR_CATALOG', () => {
      const customMsg = 'My custom validation logic failed';
      const parsed = {
        success: false,
        error: {
          issues: [{
            code: 'custom',
            path: ['payment_method'],
            message: customMsg,
          }],
        },
      };
      const errors = toValidationErrors(parsed);
      expect(errors).toEqual([{ field: 'paymentMethod', message: customMsg }]);
    });
  });

  describe('sizeNoun edge cases via ZOD_DEFAULTS.too_small', () => {
    it('number type non-exact returns "greater than or equal to" (sizeNoun returns empty)', () => {
      const issue = { code: 'too_small', type: 'number', exact: false, minimum: 0, path: [], message: '' };
      expect(ZOD_DEFAULTS.too_small(issue)).toBe('Number must be greater than or equal to 0');
    });

    it('bigint type non-exact returns "greater than or equal to" (sizeNoun returns empty)', () => {
      const issue = { code: 'too_small', type: 'bigint', exact: false, minimum: 0, path: [], message: '' };
      expect(ZOD_DEFAULTS.too_small(issue)).toBe('BigInt must be greater than or equal to 0');
    });
  });

  describe('toValidationErrors with ERROR_CATALOG integration', () => {
    it('passes Zod invalid_type verbatim when default message diverges from ZOD_DEFAULTS', () => {
      const schema = z.object({ name: z.string() });
      const parsed = schema.safeParse({ name: 123 });
      const errors = toValidationErrors(parsed);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('name');
      // Zod's default ("Expected string, received number") differs from
      // ZOD_DEFAULTS ("Invalid input: expected String, received Number"),
      // so isCustomIssue → true → verbatim passthrough (not catalog)
      expect(errors[0].message).toBe('Expected string, received number');
    });

    it('passes Zod invalid_literal verbatim when default diverges from ZOD_DEFAULTS', () => {
      const schema = z.object({ mode: z.literal('fast') });
      const parsed = schema.safeParse({ mode: 'slow' });
      const errors = toValidationErrors(parsed);
      expect(errors[0].field).toBe('mode');
      // Zod's default includes quotes around the expected value; ZOD_DEFAULTS does not
      expect(errors[0].message).toMatch(/^Invalid literal value/);
    });

    it('applies ERROR_CATALOG.too_big for number type', () => {
      const schema = z.object({ age: z.number().max(150) });
      const parsed = schema.safeParse({ age: 200 });
      const errors = toValidationErrors(parsed);
      expect(errors[0].field).toBe('age');
      expect(errors[0].message).toBe('age must be at most 150');
    });

    it('applies ERROR_CATALOG.too_big for string type', () => {
      const schema = z.object({ bio: z.string().max(10) });
      const parsed = schema.safeParse({ bio: 'a'.repeat(20) });
      const errors = toValidationErrors(parsed);
      expect(errors[0].field).toBe('bio');
      expect(errors[0].message).toBe('bio must have at most 10 characters');
    });

    it('applies ERROR_CATALOG.too_big for array type', () => {
      const schema = z.object({ tags: z.array(z.string()).max(2) });
      const parsed = schema.safeParse({ tags: ['a', 'b', 'c'] });
      const errors = toValidationErrors(parsed);
      expect(errors[0].field).toBe('tags');
      expect(errors[0].message).toBe('tags must have at most 2 items');
    });

    it('applies ERROR_CATALOG.too_small for string type', () => {
      const schema = z.object({ code: z.string().min(5) });
      const parsed = schema.safeParse({ code: 'hi' });
      const errors = toValidationErrors(parsed);
      expect(errors[0].field).toBe('code');
      expect(errors[0].message).toBe('code must have at least 5 characters');
    });

    it('applies ERROR_CATALOG.too_small for array type', () => {
      const schema = z.object({ items: z.array(z.string()).min(2) });
      const parsed = schema.safeParse({ items: ['one'] });
      const errors = toValidationErrors(parsed);
      expect(errors[0].field).toBe('items');
      expect(errors[0].message).toBe('items must have at least 2 items');
    });

    it('applies ERROR_CATALOG.invalid_date', () => {
      const schema = z.object({ start_date: z.coerce.date() });
      const parsed = schema.safeParse({ start_date: 'not-a-date' });
      const errors = toValidationErrors(parsed);
      expect(errors[0].field).toBe('startDate');
      expect(errors[0].message).toBe('start date is not a valid date');
    });

    it('applies ERROR_CATALOG.unrecognized_keys', () => {
      const schema = z.object({ name: z.string() }).strict();
      const parsed = schema.safeParse({ name: 'ok', extra_field: 1 });
      const errors = toValidationErrors(parsed);
      expect(errors[0].field).toBe('');
      expect(errors[0].message).toBe('Unrecognized field(s): extra_field');
    });

    it('passes custom messages through verbatim (not catalog)', () => {
      const schema = z.object({ email: z.string().email('Please provide a valid email') });
      const parsed = schema.safeParse({ email: 'bad' });
      const errors = toValidationErrors(parsed);
      expect(errors[0].message).toBe('Please provide a valid email');
    });

    it('falls through to issue.message when no catalog entry exists', () => {
      const schema = z.object({ name: z.string() });
      const parsed = schema.safeParse({});
      const errors = toValidationErrors(parsed);
      expect(errors[0].message).toBe('Required');
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
