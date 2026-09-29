// Signed session-cookie helpers for the monitor dashboard login.
//
// Cookie-session auth replaces the old `?token=` bookmark: POST /login checks
// DASHBOARD_PIN (6 digits, constant-time) and issues a signed `monitor_session`
// cookie; GET / and POST /internal/check verify it. REPORT_TOKEN (Bearer) is
// kept for scripts on /internal/check and /report/*.
//
// Session value shape: `<ts>.<hmac-hex>` where ts = Date.now() ms
// (the {issued_at} payload — no other fields) and hmac =
// HMAC-SHA256(DASHBOARD_PIN, ts). Trust-device controls the cookie Max-Age
// only (12h default, 90d trusted); the server verify window accepts up to the
// 90d bound so both cookie types verify. Secrets are set via
// `wrangler secret put` — never in wrangler.toml [vars], never logged,
// never echoed.

export const SESSION_COOKIE = 'monitor_session';

// 12 hours in seconds (default cookie Max-Age) — single source of truth.
export const SESSION_DEFAULT_MAX_AGE = 43200;

// 90 days in seconds (trusted-device cookie Max-Age) — single source of truth.
export const SESSION_TRUSTED_MAX_AGE = 7776000;

// Hard upper bound for the session cookie value (header-safety; real
// sessions are ~80 bytes: 13-digit ts + '.' + 64-char hex).
export const SESSION_MAX_BYTES = 4096;

// Constant-time string compare over UTF-8 bytes (length folded into the
// diff so short/long guesses take the same path). Never throws.
export function timingSafeEqual(provided, expected) {
  const a = new TextEncoder().encode(String(provided ?? ''));
  const b = new TextEncoder().encode(String(expected ?? ''));
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return len > 0 && diff === 0;
}

// Parse a Cookie header into { name: value }. First occurrence wins.
// Never throws (null/empty header → {}).
export function parseCookie(header) {
  const out = {};
  if (!header) return out;
  const parts = String(header).split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!name) continue;
    if (!(name in out)) out[name] = value;
  }
  return out;
}

async function hmacHex(key, message) {
  const enc = new TextEncoder();
  const keyData = enc.encode(String(key));
  const msgData = enc.encode(String(message));
  const cryptoObj = globalThis.crypto;
  const cryptoKey = await cryptoObj.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await cryptoObj.subtle.sign('HMAC', cryptoKey, msgData);
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Sign a session for `timestamp` (defaults to Date.now()). Returns
// `<ts>.<64-char hex>`. Never logs the PIN.
export async function signSession(pin, timestamp = Date.now()) {
  const ts = String(timestamp);
  const sig = await hmacHex(pin, ts);
  return `${ts}.${sig}`;
}

// True when `value` is a fresh signature over a numeric ts within the 90d
// window (covers both 12h default and 90d trusted cookies). Fail-closed:
// missing/empty value or PIN, malformed shape, non-numeric ts, future ts,
// expired ts, or bad signature all deny. Signature compare is constant-time.
// Never throws.
export async function verifySession(value, pin, now = Date.now()) {
  if (!value || !pin) return false;
  const s = String(value);
  if (s.length > SESSION_MAX_BYTES) return false;
  const dot = s.lastIndexOf('.');
  if (dot === -1) return false;
  const tsStr = s.slice(0, dot);
  const sig = s.slice(dot + 1);
  if (!/^\d+$/.test(tsStr)) return false;
  if (!/^[0-9a-f]{64}$/.test(sig)) return false;
  const ts = Number(tsStr);
  if (!Number.isFinite(ts)) return false;
  const age = now - ts;
  if (age < 0) return false;
  if (age > SESSION_TRUSTED_MAX_AGE * 1000) return false;
  const expected = await hmacHex(pin, tsStr);
  return timingSafeEqual(sig, expected);
}

// Exact Set-Cookie value for an issued session. Flags are pinned:
// HttpOnly Secure SameSite=Strict Path=/ Max-Age=43200 default,
// Max-Age=7776000 when `trusted` is true. Total length stays well under
// 4KB (≤4KB asserted in tests).
export function buildSessionCookie(value, trusted = false) {
  const maxAge = trusted ? SESSION_TRUSTED_MAX_AGE : SESSION_DEFAULT_MAX_AGE;
  return `${SESSION_COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

// Clearing cookie for POST /logout — same flags, Max-Age=0. Clears the
// session cookie only (login_attempts rows are left for the 5-min gate +
// scheduled cleanup).
export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}
