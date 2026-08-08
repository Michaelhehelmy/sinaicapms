/**
 * Structured validation errors (T4).
 *
 * Wire contract on Zod 400s: { success: false, error, errors: [{ field, message }] }
 *   - `error`   : semicolon-joined messages — byte-compatible with the previous
 *                 `issues.map(i => i.message).join('; ')` string.
 *   - `errors`  : structured array; `field` is the camelCase wire key (matches the
 *                 T3 camelCase contract; auth/payments camel paths pass through),
 *                 `message` is the Zod issue message.
 *
 * Message resolution rules:
 *   1. If the issue carries a CUSTOM schema message (issue.message differs from the
 *      known Zod auto-generated default for that code) → verbatim passthrough
 *      (guarantees error-string compatibility for all custom-message schemas).
 *   2. Otherwise the ERROR_CATALOG template for that code is applied (friendlier
 *      user-facing wording). `invalid_type` for a missing required field keeps
 *      Zod's exact "Required" so existing assertions stay green.
 *   3. Codes without a catalog entry fall back to the verbatim issue.message.
 *
 * Detection uses exact equality against ZOD_DEFAULTS (faithful Zod v3 generators);
 * if a default generator is ever off, the issue is treated as custom → verbatim,
 * which is today's behavior — safe by construction.
 */

import { errorResponse } from './response.js';

function camelSegment(seg) {
  return seg.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
}

/**
 * Dot-joined Zod issue path → camelCase wire key.
 * Numeric segments (array indices) are preserved: `items.0.meal_id` → `items.0.mealId`.
 */
export function camelField(pathStr) {
  return String(pathStr)
    .split('.')
    .map((seg) => (/^\d+$/.test(seg) ? seg : camelSegment(seg)))
    .join('.');
}

/** Humanized label for the last path segment: `start_date` → `start date`. */
function labelOf(issue) {
  const seg = issue.path[issue.path.length - 1];
  if (seg === undefined || seg === null) return 'field';
  return String(seg).replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

const ZOD_TYPE_LABEL = {
  string: 'String',
  number: 'Number',
  bigint: 'BigInt',
  boolean: 'Boolean',
  date: 'Date',
  array: 'Array',
  object: 'Object',
  function: 'Function',
  symbol: 'Symbol',
  undefined: 'Undefined',
  null: 'Null',
  unknown: 'Unknown',
};

const labelOfType = (type) => ZOD_TYPE_LABEL[type] || 'Unknown';

function sizeNoun(issue) {
  if (issue.type === 'string') return 'character(s)';
  if (issue.type === 'array') return 'element(s)';
  return '';
}

/**
 * Faithful Zod v3 auto-default message generators, keyed by issue code.
 * Used only to DETECT custom messages via exact-equality comparison.
 */
export const ZOD_DEFAULTS = {
  invalid_type: (issue) =>
    issue.received === 'undefined' || issue.received === 'null'
      ? 'Required'
      : `Invalid input: expected ${labelOfType(issue.expected)}, received ${labelOfType(issue.received)}`,
  invalid_literal: (issue) => `Invalid literal value, expected ${issue.expected}`,
  too_small: (issue) => {
    const noun = sizeNoun(issue);
    if (issue.exact) {
      return noun
        ? `${labelOfType(issue.type)} must contain exactly ${issue.minimum} ${noun}`
        : `${labelOfType(issue.type)} must be equal to ${issue.minimum}`;
    }
    if (issue.type === 'number' || issue.type === 'bigint') {
      return `${labelOfType(issue.type)} must be greater than or equal to ${issue.minimum}`;
    }
    return noun
      ? `${labelOfType(issue.type)} must contain at least ${issue.minimum} ${noun}`
      : `${labelOfType(issue.type)} must be at least ${issue.minimum}`;
  },
  too_big: (issue) => {
    const noun = sizeNoun(issue);
    if (issue.exact) {
      return noun
        ? `${labelOfType(issue.type)} must contain exactly ${issue.maximum} ${noun}`
        : `${labelOfType(issue.type)} must be equal to ${issue.maximum}`;
    }
    if (issue.type === 'number' || issue.type === 'bigint') {
      return `${labelOfType(issue.type)} must be less than or equal to ${issue.maximum}`;
    }
    return noun
      ? `${labelOfType(issue.type)} must contain at most ${issue.maximum} ${noun}`
      : `${labelOfType(issue.type)} must be at most ${issue.maximum}`;
  },
  invalid_string: (issue) => `Invalid ${issue.validation}`,
  invalid_enum_value: (issue) =>
    `Invalid enum value. Expected ${issue.options.map((o) => `'${o}'`).join(' | ')}, received '${issue.received}'`,
  invalid_date: () => 'Invalid date',
  unrecognized_keys: (issue) => `Unrecognized key(s) in object: ${issue.keys.map((k) => `'${k}'`).join(', ')}`,
  custom: (issue) => issue.message,
};

/**
 * Error catalog: friendlier user-facing templates per Zod issue code.
 * Applied only to AUTO-GENERATED messages (custom schema messages pass through).
 */
export const ERROR_CATALOG = {
  invalid_type: (issue) => {
    if (issue.received === 'undefined' || issue.received === 'null') return 'Required'; // keep exact (asserted + byte-compat)
    return `${labelOf(issue)} is invalid: expected ${labelOfType(issue.expected)}, received ${labelOfType(issue.received)}`;
  },
  too_small: (issue) => {
    if (issue.type === 'number' || issue.type === 'bigint') {
      return `${labelOf(issue)} must be at least ${issue.minimum}`;
    }
    return `${labelOf(issue)} must have at least ${issue.minimum} ${issue.type === 'array' ? 'items' : 'characters'}`;
  },
  too_big: (issue) => {
    if (issue.type === 'number' || issue.type === 'bigint') {
      return `${labelOf(issue)} must be at most ${issue.maximum}`;
    }
    return `${labelOf(issue)} must have at most ${issue.maximum} ${issue.type === 'array' ? 'items' : 'characters'}`;
  },
  invalid_enum_value: (issue) => `Invalid enum value for ${labelOf(issue)}`,
  invalid_string: (issue) => `${labelOf(issue)} has an invalid format`,
  invalid_date: (issue) => `${labelOf(issue)} is not a valid date`,
  invalid_literal: (issue) => `${labelOf(issue)} has an invalid value`,
  unrecognized_keys: (issue) => `Unrecognized field(s): ${issue.keys.join(', ')}`,
};

/** True when the issue carries a custom schema message (not an auto-generated default). */
export function isCustomIssue(issue) {
  const generator = ZOD_DEFAULTS[issue.code];
  if (!generator) return true; // unknown code → treat as custom (verbatim)
  return issue.message !== generator(issue);
}

/**
 * Zod safeParse result → structured field errors.
 * `field` uses the camelCase wire key; `message` is custom-verbatim or catalog-friendly.
 */
export function toValidationErrors(parsed) {
  return parsed.error.issues.map((issue) => ({
    field: camelField(issue.path.join('.')),
    message: isCustomIssue(issue) ? issue.message : (ERROR_CATALOG[issue.code]?.(issue) ?? issue.message),
  }));
}

/**
 * Build a 400 errorResponse from a failed safeParse result:
 * { success: false, error: <joined messages>, errors: [{ field, message }] }.
 * The `error` string equals the previous `issues.map(i => i.message).join('; ')`.
 */
export function validationError(parsed, status = 400) {
  const errors = toValidationErrors(parsed);
  return errorResponse(errors.map((e) => e.message).join('; '), status, errors);
}
