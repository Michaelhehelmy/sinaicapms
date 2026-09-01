/**
 * Unit tests for the Paymob payment service (backend/src/services/paymob.js).
 *
 * Locks the security-critical invariants of the Paymob flow:
 *  1. HMAC webhook verification accepts a valid signature over a canonical
 *     payload and rejects tampered / missing signatures.
 *  2. extractPaymobTransaction parses a realistic callback body and is
 *     null-safe on garbage.
 *
 * The service signs with the global Web Crypto (crypto.subtle) HMAC-SHA512;
 * the test computes the expected signature with node:crypto over the same
 * canonical string (buildHmacSignedString) so the two independent SHA-512 HMAC
 * implementations must agree.
 */
import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  verifyPaymobWebhookSignature,
  buildHmacSignedString,
  extractPaymobTransaction,
} from '../../src/services/paymob.js';

const HMAC_SECRET = 'test-paymob-hmac-secret';

/**
 * Build a canonical Paymob transaction object (top-level transaction fields —
 * the same shape buildHmacSignedString / extractPaymobTransaction read).
 */
function baseTransaction(overrides = {}) {
  return {
    amount_cents: '20000',
    created_at: '2026-09-01T12:00:00',
    currency: 'EGP',
    error_occured: false,
    has_parent_transaction: false,
    id: 123456,
    integration_id: 111111,
    is_3d_secure: true,
    is_auth_successful: true,
    is_capture: false,
    is_divided: false,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    merchant_id: 222222,
    order: {
      id: 333333,
      items: [
        { name: 'Order ORD-ABC123', description: 'Camping reservation — orderRef:ORD-ABC123', amount: 20000, quantity: 1 },
      ],
    },
    owner: 444444,
    pending: false,
    source_data: { type: 'card', pan: 'xxxx' },
    success: true,
    ...overrides,
  };
}

/** Sign a transaction object the same way Paymob signs the callback. */
function signTransaction(transactionObj) {
  const canonical = buildHmacSignedString(transactionObj);
  return createHmac('sha512', HMAC_SECRET).update(canonical).digest('hex');
}

/** Serialize a signed transaction to the raw body Paymob would POST. */
function buildSignedBody(overrides = {}) {
  const txn = baseTransaction(overrides);
  // The hmac field is part of the body but must NOT be part of the canonical
  // signed string (buildHmacSignedString doesn't read `hmac`), so attach it
  // after computing the signature over the transaction payload.
  const txnWithoutHmac = { ...txn };
  delete txnWithoutHmac.hmac;
  const hmac = signTransaction(txnWithoutHmac);
  return JSON.stringify({ ...txnWithoutHmac, hmac });
}

describe('verifyPaymobWebhookSignature', () => {
  it('accepts a valid HMAC over a canonical payload', async () => {
    const rawBody = buildSignedBody();
    const parsed = JSON.parse(rawBody);
    const valid = await verifyPaymobWebhookSignature({
      rawBody,
      hmacHeader: parsed.hmac,
      hmacSecret: HMAC_SECRET,
    });
    expect(valid).toBe(true);
  });

  it('rejects an altered payload (tampered amount)', async () => {
    const rawBody = buildSignedBody();
    const tampered = JSON.parse(rawBody);
    tampered.amount_cents = '99999';
    const rawBodyTampered = JSON.stringify(tampered);
    const valid = await verifyPaymobWebhookSignature({
      rawBody: rawBodyTampered,
      hmacHeader: tampered.hmac,
      hmacSecret: HMAC_SECRET,
    });
    expect(valid).toBe(false);
  });

  it('rejects an altered payload (success flipped to true)', async () => {
    // Sign a failing transaction, then flip success to true — the signature
    // must no longer verify.
    const rawBody = buildSignedBody({ success: false, pending: true });
    const flipped = JSON.parse(rawBody);
    flipped.success = true;
    flipped.pending = false;
    const valid = await verifyPaymobWebhookSignature({
      rawBody: JSON.stringify(flipped),
      hmacHeader: flipped.hmac,
      hmacSecret: HMAC_SECRET,
    });
    expect(valid).toBe(false);
  });

  it('rejects an empty / missing hmac header', async () => {
    const rawBody = buildSignedBody();
    const valid = await verifyPaymobWebhookSignature({
      rawBody,
      hmacHeader: '',
      hmacSecret: HMAC_SECRET,
    });
    expect(valid).toBe(false);
  });

  it('rejects a missing hmac header (undefined)', async () => {
    const rawBody = buildSignedBody();
    const valid = await verifyPaymobWebhookSignature({
      rawBody,
      hmacHeader: undefined,
      hmacSecret: HMAC_SECRET,
    });
    expect(valid).toBe(false);
  });

  it('rejects a wrong hmac secret', async () => {
    const rawBody = buildSignedBody();
    const parsed = JSON.parse(rawBody);
    const valid = await verifyPaymobWebhookSignature({
      rawBody,
      hmacHeader: parsed.hmac,
      hmacSecret: 'a-different-secret',
    });
    expect(valid).toBe(false);
  });

  it('rejects a garbage (non-JSON) raw body', async () => {
    const valid = await verifyPaymobWebhookSignature({
      rawBody: 'not json at all {{{',
      hmacHeader: 'deadbeef',
      hmacSecret: HMAC_SECRET,
    });
    expect(valid).toBe(false);
  });

  it('rejects when rawBody is missing', async () => {
    const valid = await verifyPaymobWebhookSignature({
      rawBody: '',
      hmacHeader: 'deadbeef',
      hmacSecret: HMAC_SECRET,
    });
    expect(valid).toBe(false);
  });
});

describe('buildHmacSignedString', () => {
  it('concatenates the documented Paymob fields in order with no separator', () => {
    const txn = baseTransaction();
    const s = buildHmacSignedString(txn);
    expect(s).toBe(
      String(txn.amount_cents) +
      String(txn.created_at) +
      String(txn.currency) +
      String(txn.error_occured) +
      String(txn.has_parent_transaction) +
      String(txn.id) +
      String(txn.integration_id) +
      String(txn.is_3d_secure) +
      String(txn.is_auth_successful) +
      String(txn.is_capture) +
      String(txn.is_divided) +
      String(txn.is_refunded) +
      String(txn.is_standalone_payment) +
      String(txn.is_voided) +
      String(txn.merchant_id) +
      String(txn.order) +
      String(txn.owner) +
      String(txn.pending) +
      String(txn.source_data.pan) +
      String(txn.source_data.type) +
      String(txn.success)
    );
  });

  it('treats missing fields as empty string', () => {
    // Only id and success are set; every other field in the canonical order
    // contributes an empty string. Result is id then success concatenated.
    const s = buildHmacSignedString({ id: 1, success: true });
    expect(s).toBe('1true');
  });

  it('returns empty string for null/undefined input', () => {
    expect(buildHmacSignedString(null)).toBe('');
    expect(buildHmacSignedString(undefined)).toBe('');
  });
});

describe('extractPaymobTransaction', () => {
  it('parses a realistic Paymob callback body', () => {
    const rawBody = buildSignedBody();
    const parsed = extractPaymobTransaction(rawBody);
    expect(parsed.id).toBe(123456);
    expect(parsed.pending).toBe(false);
    expect(parsed.success).toBe(true);
    expect(parsed.amount_cents).toBe('20000');
    expect(parsed.order).toEqual({
      id: 333333,
      items: [
        { name: 'Order ORD-ABC123', description: 'Camping reservation — orderRef:ORD-ABC123', amount: 20000, quantity: 1 },
      ],
    });
    expect(parsed.hmac).toBeTruthy();
    expect(parsed.transaction_id).toBe('123456');
  });

  it('reads transaction fields from the obj wrapper when present', () => {
    const txn = baseTransaction();
    const body = JSON.stringify({ obj: { ...txn, hmac: 'abc' } });
    const parsed = extractPaymobTransaction(body);
    expect(parsed.id).toBe(123456);
    expect(parsed.success).toBe(true);
    expect(parsed.hmac).toBe('abc');
  });

  it('returns null-safe defaults on non-JSON garbage', () => {
    const parsed = extractPaymobTransaction('this is not json');
    expect(parsed).toEqual({
      id: null, pending: null, success: null, amount_cents: null,
      order: null, hmac: null, transaction_id: null,
    });
  });

  it('returns null-safe defaults on a non-object body', () => {
    const parsed = extractPaymobTransaction('"just a string"');
    expect(parsed.id).toBe(null);
    expect(parsed.success).toBe(null);
  });

  it('returns null-safe defaults on empty/missing objects', () => {
    expect(extractPaymobTransaction('').id).toBe(null);
    expect(extractPaymobTransaction('{}').id).toBe(null);
    expect(extractPaymobTransaction(null).id).toBe(null);
    expect(extractPaymobTransaction(undefined).id).toBe(null);
  });
});
