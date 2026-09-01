// Paymob payment service — Intention API + HMAC webhook verification
// All secrets are passed as params (never imported from env) so tests can inject fixtures.

/**
 * Create a Paymob payment intention (server-side).
 *
 * @param {object} opts
 * @param {string}  opts.secretKey      - Paymob API secret key
 * @param {string}  opts.baseUrl        - Paymob API base URL (e.g. 'https://accept.paymob.com/api')
 * @param {number}  opts.amountCents    - Amount in the smallest currency unit (piasters/cents)
 * @param {string}  opts.currency       - Currency code (default 'EGP')
 * @param {string}  opts.orderRef       - Internal order reference (embedded in item description for webhook mapping)
 * @param {string[]} opts.paymentMethods- Array of payment method IDs to enable
 * @param {object}  opts.billingData    - Billing data object per Paymob spec
 * @param {string}  opts.notificationUrl- Webhook URL Paymob will POST to
 * @param {string}  opts.redirectionUrl - Redirect URL after payment completion
 * @returns {Promise<{ clientSecret: string, id: number }>}
 * @throws {Error} On non-2xx response from Paymob
 */
export async function createPaymobIntention({
  secretKey,
  baseUrl,
  amountCents,
  currency = 'EGP',
  orderRef,
  paymentMethods,
  billingData,
  notificationUrl,
  redirectionUrl,
}) {
  const body = {
    amount: amountCents,
    currency,
    payment_methods: paymentMethods,
    items: [
      {
        name: `Order ${orderRef}`,
        amount: amountCents,
        description: `Camping reservation — orderRef:${orderRef}`,
        quantity: 1,
      },
    ],
    billing_data: billingData,
    notification_url: notificationUrl,
    redirection_url: redirectionUrl,
  };

  const res = await fetch(`${baseUrl}/v1/intention/`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    const msg = data?.message || data?.detail || `Paymob intention API returned ${res.status}`;
    throw new Error(`Paymob error: ${msg}`);
  }

  return { clientSecret: data.client_secret, id: data.id };
}

/**
 * Build the canonical HMAC-signed string from a Paymob transaction callback body.
 *
 * Paymob's HMAC verification requires concatenating specific transaction fields in a
 * documented order, then HMAC-SHA512-ing the result. The exact field order can vary
 * between Paymob API versions and integration types (card vs mobile vs wallet).
 *
 * This helper is exported so tests can override or call it directly, and so the field
 * order can be adjusted without changing the verify function.
 *
 * The canonical concatenation (Paymob "HMAC" dashboard docs) is:
 *   amount_cents + created_at + currency + error_occured + has_parent_transaction
 *   + id + integration_id + is_3d_secure + is_auth_successful + is_capture
 *   + is_divided + is_refunded + is_standalone_payment + is_voided + merchant_id
 *   + order + owner + pending + source_data_pan + source_data_type
 *   + success
 *
 * Fields are joined by empty string (no separator). Missing fields use empty string.
 *
 * @param {object} transactionObj - Parsed transaction callback body
 * @returns {string} Concatenated string ready for HMAC comparison
 */
export function buildHmacSignedString(transactionObj) {
  const t = transactionObj || {};
  const source = t.source_data || t.sourceData || {};
  return [
    t.amount_cents,
    t.created_at,
    t.currency,
    t.error_occured,
    t.has_parent_transaction,
    t.id,
    t.integration_id,
    t.is_3d_secure,
    t.is_auth_successful,
    t.is_capture,
    t.is_divided,
    t.is_refunded,
    t.is_standalone_payment,
    t.is_voided,
    t.merchant_id,
    t.order,
    t.owner,
    t.pending,
    source.pan,
    source.type,
    t.success,
  ]
    .map((v) => (v === undefined || v === null ? '' : String(v)))
    .join('');
}

/**
 * Verify a Paymob webhook HMAC-SHA512 signature using the Web Crypto API.
 *
 * @param {object} opts
 * @param {string}  opts.rawBody   - Raw request body string (before JSON parsing)
 * @param {string}  opts.hmacHeader - Value of the `hmac` field from the parsed callback body
 * @param {string}  opts.hmacSecret - HMAC secret from the Paymob dashboard
 * @returns {Promise<boolean>} Whether the signature is valid
 */
export async function verifyPaymobWebhookSignature({ rawBody, hmacHeader, hmacSecret }) {
  if (!hmacHeader || !hmacSecret || !rawBody) {
    return false;
  }

  let transaction;
  try {
    transaction = JSON.parse(rawBody);
  } catch {
    return false;
  }

  const signedString = buildHmacSignedString(transaction);
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(hmacSecret),
    { name: 'HMAC', hash: { name: 'SHA-512' } },
    false,
    ['sign', 'verify'],
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedString));
  const computedHex = uint8ArrayToHex(new Uint8Array(signatureBuffer));

  // Constant-time comparison to prevent timing attacks
  return timingSafeEqual(computedHex, hmacHeader);
}

/**
 * Parse a Paymob transaction callback body defensively.
 *
 * @param {string|object} rawBody - Raw JSON string or pre-parsed object
 * @returns {{ id: number|null, pending: boolean|null, success: boolean|null,
 *             amount_cents: number|null, order: number|null, hmac: string|null,
 *             transaction_id: string|null }}
 */
export function extractPaymobTransaction(rawBody) {
  let body = rawBody;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return { id: null, pending: null, success: null, amount_cents: null, order: null, hmac: null, transaction_id: null };
    }
  }
  if (!body || typeof body !== 'object') {
    return { id: null, pending: null, success: null, amount_cents: null, order: null, hmac: null, transaction_id: null };
  }

  const obj = body.obj || body;
  return {
    id: obj.id ?? null,
    pending: obj.pending ?? null,
    success: obj.success ?? null,
    amount_cents: obj.amount_cents ?? null,
    order: obj.order ?? null,
    hmac: obj.hmac ?? null,
    transaction_id: obj.id ? String(obj.id) : null,
  };
}

// --- Internal helpers ---

/** @param {Uint8Array} bytes @returns {string} Lowercase hex string */
function uint8ArrayToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Constant-time string comparison to prevent timing side-channel attacks.
 * Both strings must be the same length; returns false immediately otherwise.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
