import { describe, it, expect, afterEach, vi } from 'vitest';
import { app, isPinConfigured, hasValidSession, LOGIN_FAIL_LIMIT, LOGIN_FAIL_WINDOW_MS } from '../src/index.js';
import { TARGETS } from '../src/targets.js';
import {
  SESSION_COOKIE,
  SESSION_DEFAULT_MAX_AGE,
  SESSION_TRUSTED_MAX_AGE,
  parseCookie,
  signSession,
  verifySession,
  timingSafeEqual,
  buildSessionCookie,
} from '../src/auth.js';
import { makeR2, seedRun, gateDocs, gateKey, readGate } from './helpers/fake-r2.js';

// Cookie-session dashboard auth: 6-digit PIN login issues a signed
// `monitor_session` cookie; GET / requires it; POST /internal/check
// accepts it OR Bearer REPORT_TOKEN. The old `?token=` bookmark is deleted
// and the PIN never appears in a URL.
//
// BRUTE-FORCE BUDGET (unchanged contract, new storage — phase 6): 5 failed
// attempts per 5 minutes per IP, then 429 `rate limit exceeded`. It was one row
// per POST; it is now one object per IP at `state/login_attempts/<ipHash>.json`
// holding the failure timestamps inside the window. Every assertion about the
// STATUS, the message text and the per-IP isolation below is byte-for-byte what
// it was against the attempt table; only the bookkeeping assertions moved, from
// "one row was inserted" to "one counter document holds N failure timestamps" —
// which is the same fact about a store that has no rows any more.

const REPORT_TOKEN = 'test-report-secret';
const DASHBOARD_PIN = '123456';
// The worker binds ONE storage resource: the object bucket. There is no database
// binding in `env` at all any more, so a route that reached for one would throw
// rather than silently read a stale table — and these tests would fail instead
// of passing against a stub.
const envFor = (extra = {}) => ({
  MONITOR_BUCKET: extra.MONITOR_BUCKET ?? makeR2(),
  REPORT_TOKEN,
  DASHBOARD_PIN,
  ...extra,
});
const ORIGIN = 'https://status.sinaicamps.com';

function cookieHeader(setCookie) {
  const pair = String(setCookie).split(';')[0];
  return pair.trim();
}

async function loginCookie(bucket, env, ip = '10.99.1.4', extraBody = {}) {
  const res = await app.request(
    '/login',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: ORIGIN,
        'cf-connecting-ip': ip,
      },
      body: JSON.stringify({ pin: DASHBOARD_PIN, ...extraBody }),
    },
    { ...env, MONITOR_BUCKET: bucket },
  );
  expect(res.status).toBe(302);
  const setCookie = res.headers.get('set-cookie');
  expect(setCookie).toContain(`${SESSION_COOKIE}=`);
  return cookieHeader(setCookie);
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.useRealTimers();
});

describe('monitor PIN login (signed session cookie + R2 gate)', () => {
  it('1: GET /login renders the keypad form (10 digits, noscript, reduced-motion, no PIN bytes)', async () => {
    const res = await app.request('/login', {}, envFor());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('action="/login"');
    expect(html).toContain('name="pin"');
    expect(html).toContain('name="trust"');
    // 10 digit buttons, one per digit.
    const digits = (html.match(/data-digit="/g) || []).length;
    expect(digits).toBe(10);
    for (const d of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      expect(html).toContain(`data-digit="${d}"`);
    }
    // Noscript fallback + reduced-motion guard.
    expect(html).toContain('<noscript>');
    expect(html).toContain('prefers-reduced-motion');
    // No PIN bytes leak into the page and the PIN never appears in a URL.
    expect(html).not.toContain(DASHBOARD_PIN);
    expect(html).not.toContain('?pin=');
    // Cookie helpers stay honest on edge input.
    expect(parseCookie(null)).toEqual({});
    expect(parseCookie('')).toEqual({});
    expect(parseCookie('a=1; b=2; a=3').a).toBe('1');
    expect(parseCookie('weird; =x; k=v').k).toBe('v');
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(timingSafeEqual('', '')).toBe(false);
    expect(timingSafeEqual(null, 'x')).toBe(false);
    expect(timingSafeEqual('x', null)).toBe(false);
    expect(LOGIN_FAIL_LIMIT).toBe(5);
  });

  it('2: POST /login 400 when CSRF Origin/Referer missing (400 on malformed JSON)', async () => {
    const noCsrf = await app.request(
      '/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '10.99.1.2' },
        body: JSON.stringify({ pin: DASHBOARD_PIN }),
      },
      envFor(),
    );
    expect(noCsrf.status).toBe(400);
    expect((await noCsrf.json()).error).toMatch(/csrf/i);

    const bucket = makeR2();
    const badJson = await app.request(
      '/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '10.99.1.22' },
        body: '{not-json',
      },
      envFor({ MONITOR_BUCKET: bucket }),
    );
    expect(badJson.status).toBe(400);
    // A malformed body is not an ATTEMPT: nothing is counted against the IP, or
    // an attacker could lock an operator out with garbage instead of guesses.
    expect(gateDocs(bucket)).toEqual([]);
  });

  it('3: POST /login 401 Wrong PIN with tries left; 400 when PIN missing; non-6-digit rejected; always-records', async () => {
    const bucket = makeR2();
    const env = envFor({ MONITOR_BUCKET: bucket });
    const wrong = await app.request(
      '/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '10.99.1.3' },
        body: JSON.stringify({ pin: '000000' }),
      },
      env,
    );
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get('set-cookie')).toBeNull();
    const wrongBody = await wrong.json();
    expect(wrongBody.error).toContain('Wrong PIN');
    expect(wrongBody.error).toContain('4 tries left');
    // A failure records exactly one timestamp against this IP alone.
    const gate = await readGate(bucket, '10.99.1.3', DASHBOARD_PIN);
    expect(gate.fails).toHaveLength(1);
    expect(gate.locked_until).toBeNull();
    expect(gate.window_start).toBe(gate.fails[0]);
    expect(gate.last_success_at).toBeNull();
    expect(gateDocs(bucket)).toHaveLength(1);
    // Neither the PIN nor the raw address is anywhere in the bucket.
    const dump = JSON.stringify([...bucket.store.entries()]);
    expect(dump).not.toContain('000000');
    expect(dump).not.toContain('10.99.1.3');
    expect(bucket.keys()[0]).not.toContain('10.99.1.3');

    const second = await app.request(
      '/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '10.99.1.3' },
        body: JSON.stringify({ pin: '000000' }),
      },
      env,
    );
    expect(second.status).toBe(401);
    expect((await second.json()).error).toContain('3 tries left');
    expect((await readGate(bucket, '10.99.1.3', DASHBOARD_PIN)).fails).toHaveLength(2);

    // Non-6-digit input counts as a wrong attempt (401, never 500).
    const short = await app.request(
      '/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '10.99.1.31' },
        body: JSON.stringify({ pin: '123' }),
      },
      env,
    );
    expect(short.status).toBe(401);
    expect((await short.json()).error).toMatch(/wrong pin/i);
    expect((await readGate(bucket, '10.99.1.31', DASHBOARD_PIN)).fails).toHaveLength(1);

    const missing = await app.request(
      '/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '10.99.1.33' },
        body: JSON.stringify({}),
      },
      env,
    );
    expect(missing.status).toBe(400);
    // No pin in the body ⇒ no attempt recorded for that IP either, so exactly
    // the two IPs that actually guessed (`.1.3` and `.1.31`) hold a document.
    expect(gateDocs(bucket)).toHaveLength(2);
    expect(await readGate(bucket, '10.99.1.33', DASHBOARD_PIN)).toBeUndefined();
  });

  it('4: POST /login success sets 12h cookie with exact flags (≤4KB) and 302 to /; 90d window edges', async () => {
    const bucket = makeR2();
    const res = await app.request(
      '/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '10.99.1.4' },
        body: JSON.stringify({ pin: DASHBOARD_PIN }),
      },
      envFor({ MONITOR_BUCKET: bucket }),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/');
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain(`Max-Age=${SESSION_DEFAULT_MAX_AGE}`);
    expect(SESSION_DEFAULT_MAX_AGE).toBe(43200);
    expect(SESSION_TRUSTED_MAX_AGE).toBe(7776000);
    expect(setCookie.length).toBeLessThanOrEqual(4096);
    // A success is recorded too (the attempt table stored the success bit), as a
    // success STAMP — and it does not fabricate failures.
    const gate = await readGate(bucket, '10.99.1.4', DASHBOARD_PIN);
    expect(gate.fails).toEqual([]);
    expect(gate.last_success_at).not.toBeNull();
    const value = cookieHeader(setCookie).split('=')[1];
    expect(await verifySession(value, DASHBOARD_PIN)).toBe(true);
    // Session window edges (90d trusted bound, constant-time).
    const almostExpired = await signSession(DASHBOARD_PIN, Date.now() - (SESSION_TRUSTED_MAX_AGE * 1000 - 5000));
    expect(await verifySession(almostExpired, DASHBOARD_PIN)).toBe(true);
    const expired = await signSession(DASHBOARD_PIN, Date.now() - (SESSION_TRUSTED_MAX_AGE * 1000 + 1000));
    expect(await verifySession(expired, DASHBOARD_PIN)).toBe(false);
    const future = await signSession(DASHBOARD_PIN, Date.now() + 60_000);
    expect(await verifySession(future, DASHBOARD_PIN)).toBe(false);
    expect(await verifySession('not-a-session', DASHBOARD_PIN)).toBe(false);
    expect(await verifySession('abc.def', DASHBOARD_PIN)).toBe(false);
    expect(await verifySession(`${Date.now()}.zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz`, DASHBOARD_PIN)).toBe(false);
    const last = value.slice(-1);
    const flipped = `${value.slice(0, -1)}${last === '0' ? '1' : '0'}`;
    expect(await verifySession(flipped, DASHBOARD_PIN)).toBe(false);
    expect(await verifySession(value, '000000')).toBe(false);
    expect(await verifySession('', DASHBOARD_PIN)).toBe(false);
    expect(await verifySession(value, '')).toBe(false);
    expect(await verifySession(`${'x'.repeat(4090)}.deadbeef`, DASHBOARD_PIN)).toBe(false);
    expect(buildSessionCookie('v').length).toBeLessThanOrEqual(4096);
    expect(buildSessionCookie('v', true)).toContain('Max-Age=7776000');
  });

  it('5: trust-device flag picks Max-Age 7776000 vs 43200 (JSON + form)', async () => {
    const env = envFor();
    const trusted = await app.request(
      '/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '10.99.1.41' },
        body: JSON.stringify({ pin: DASHBOARD_PIN, trust: true }),
      },
      env,
    );
    expect(trusted.status).toBe(302);
    expect(trusted.headers.get('set-cookie')).toContain('Max-Age=7776000');

    const formTrusted = await app.request(
      '/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', origin: ORIGIN, 'cf-connecting-ip': '10.99.1.42' },
        body: `pin=${DASHBOARD_PIN}&trust=1`,
      },
      env,
    );
    expect(formTrusted.status).toBe(302);
    expect(formTrusted.headers.get('set-cookie')).toContain('Max-Age=7776000');

    const plain = await app.request(
      '/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '10.99.1.43' },
        body: JSON.stringify({ pin: DASHBOARD_PIN }),
      },
      env,
    );
    expect(plain.status).toBe(302);
    expect(plain.headers.get('set-cookie')).toContain('Max-Age=43200');
  });

  it('6: GET / with valid cookie renders the dashboard with logout link', async () => {
    // `>OK</div>` is only true when the status block finds a healthy run, so the
    // bucket has to hold one (the aggregate reads the bucket).
    const bucket = makeR2();
    seedRun(bucket, new Date(), TARGETS.map((t) => ({ name: t.name, ok: true })));
    const env = envFor({ MONITOR_BUCKET: bucket });
    const cookie = await loginCookie(bucket, env, '10.99.1.5');
    const res = await app.request('/', { headers: { cookie } }, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('status-pill');
    expect(html).toContain('>OK</div>');
    expect(html).toContain('action="/logout"');
    expect(html).toContain('Log out');
  });

  it('7: GET / without cookie redirects to /login and ?pin=/ ?token= never authenticate', async () => {
    const env = envFor();
    const bare = await app.request('/', {}, env);
    expect(bare.status).toBe(302);
    expect(bare.headers.get('location')).toContain('/login');

    const queryPin = await app.request(`/?pin=${DASHBOARD_PIN}`, {}, env);
    expect(queryPin.status).toBe(302);
    expect(queryPin.headers.get('location')).toContain('/login');

    const queryToken = await app.request(`/?token=${DASHBOARD_PIN}`, {}, env);
    expect(queryToken.status).toBe(302);
    expect(queryToken.headers.get('location')).toContain('/login');

    const bearer = await app.request(
      '/',
      { headers: { authorization: `Bearer ${REPORT_TOKEN}` } },
      env,
    );
    expect(bearer.status).toBe(302);
  });

  it('8: authed GET /login redirects to /', async () => {
    const bucket = makeR2();
    const env = envFor({ MONITOR_BUCKET: bucket });
    const cookie = await loginCookie(bucket, env, '10.99.1.7');
    const res = await app.request('/login', { headers: { cookie } }, env);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/');
  });

  it('9: POST /logout clears the cookie with Max-Age=0 (CSRF required, cookie only)', async () => {
    const bucket = makeR2();
    const env = envFor({ MONITOR_BUCKET: bucket });
    const noCsrf = await app.request('/logout', { method: 'POST' }, env);
    expect(noCsrf.status).toBe(400);

    const cookie = await loginCookie(bucket, env, '10.99.1.8');
    const key = await gateKey('10.99.1.8', DASHBOARD_PIN);
    const gateBefore = JSON.stringify(bucket.read(key));
    const res = await app.request(
      '/logout',
      { method: 'POST', headers: { origin: ORIGIN, cookie } },
      env,
    );
    expect(res.status).toBe(302);
    const cleared = res.headers.get('set-cookie');
    expect(cleared).toContain(`${SESSION_COOKIE}=`);
    expect(cleared).toContain('Max-Age=0');
    expect(cleared).toContain('HttpOnly');
    expect(cleared).toContain('Secure');
    expect(cleared).toContain('SameSite=Strict');
    expect(cleared).toContain('Path=/');
    // Logout clears the cookie only — the gate counter is untouched.
    expect(JSON.stringify(bucket.read(key))).toBe(gateBefore);
  });

  it('10: POST /internal/check accepts session cookie or Bearer REPORT_TOKEN, rejects neither', async () => {
    globalThis.fetch = async () => ({ status: 200, ok: true });
    const bucket = makeR2();
    const env = envFor({ MONITOR_BUCKET: bucket });
    const cookie = await loginCookie(bucket, env, '10.99.1.9');

    const viaCookie = await app.request('/internal/check', { method: 'POST', headers: { cookie } }, env);
    expect(viaCookie.status).toBe(200);

    const viaBearer = await app.request(
      '/internal/check',
      { method: 'POST', headers: { authorization: `Bearer ${REPORT_TOKEN}` } },
      envFor(),
    );
    expect(viaBearer.status).toBe(200);

    const denied = await app.request('/internal/check', { method: 'POST' }, envFor());
    expect(denied.status).toBe(401);
  });

  it('11: gate 5 fails/5min/IP then 429 verbatim (per-IP); unconfigured PIN 500s', async () => {
    expect(isPinConfigured({ DASHBOARD_PIN })).toBe(true);
    expect(isPinConfigured({})).toBe(false);
    expect(isPinConfigured({ DASHBOARD_PIN: '12345' })).toBe(false);
    expect(isPinConfigured({ DASHBOARD_PIN: 'abcdef' })).toBe(false);
    expect(isPinConfigured({ DASHBOARD_PIN: '1234567' })).toBe(false);

    const bucket = makeR2();
    const env = envFor({ MONITOR_BUCKET: bucket });
    const ip = '10.99.9.77';
    const wants = ['4 tries left', '3 tries left', '2 tries left', '1 tries left', '0 tries left'];
    for (let i = 0; i < 5; i++) {
      const res = await app.request(
        '/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': ip },
          body: JSON.stringify({ pin: '000000' }),
        },
        env,
      );
      expect(res.status).toBe(401);
      expect((await res.json()).error).toContain(wants[i]);
    }
    const gate = await readGate(bucket, ip, DASHBOARD_PIN);
    expect(gate.fails).toHaveLength(5);
    // The window is pinned by the OLDEST failure, and `locked_until` is the
    // moment the budget frees up again.
    expect(gate.window_start).toBe(gate.fails[0]);
    expect(Date.parse(gate.locked_until) - Date.parse(gate.window_start)).toBe(5 * 60_000);
    // 6th attempt — even the correct PIN — hits the gate and is still recorded.
    const limited = await app.request(
      '/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': ip },
        body: JSON.stringify({ pin: DASHBOARD_PIN }),
      },
      env,
    );
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: 'rate limit exceeded' });
    // Already spent: nothing is appended, so a hammering client cannot grow the
    // document, and the correct PIN was NOT recorded as a success.
    const after = await readGate(bucket, ip, DASHBOARD_PIN);
    expect(after.fails).toEqual(gate.fails);
    expect(after.last_success_at).toBeNull();
    expect(after.locked_until).toBe(gate.locked_until);
    expect(gateDocs(bucket)).toHaveLength(1);

    // A different IP is unaffected (per-IP gate) and its success is recorded.
    const otherBucket = makeR2();
    const otherEnv = envFor({ MONITOR_BUCKET: otherBucket });
    const other = await app.request(
      '/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '10.99.9.78' },
        body: JSON.stringify({ pin: DASHBOARD_PIN }),
      },
      otherEnv,
    );
    expect(other.status).toBe(302);
    const otherGate = await readGate(otherBucket, '10.99.9.78', DASHBOARD_PIN);
    expect(otherGate.fails).toEqual([]);
    expect(otherGate.last_success_at).not.toBeNull();
    // Two IPs never share a document: the key is derived from the address.
    expect(await gateKey('10.99.9.77', DASHBOARD_PIN)).not.toBe(
      await gateKey('10.99.9.78', DASHBOARD_PIN),
    );

    // Unconfigured PIN (missing or not 6 digits) blocks login + dashboard.
    for (const badEnv of [{ REPORT_TOKEN }, { REPORT_TOKEN, DASHBOARD_PIN: '12345' }]) {
      const loginPage = await app.request('/login', {}, badEnv);
      expect(loginPage.status).toBe(500);
      expect(await loginPage.text()).toMatch(/pin not configured/i);

      const loginPost = await app.request(
        '/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '10.99.1.11' },
          body: JSON.stringify({ pin: '123456' }),
        },
        badEnv,
      );
      expect(loginPost.status).toBe(500);

      const dash = await app.request('/', {}, badEnv);
      expect(dash.status).toBe(500);
      expect(await dash.text()).toMatch(/pin not configured/i);
    }
  });
});

// The gate's TIME semantics, which case 11 above cannot reach: it drives five
// failures back to back, so it proves the budget but not the window that frees
// it. Both properties below are the ones the row-per-attempt store gave for free
// (`attempted_at >= datetime('now','-5 minutes')`) and that an object-based
// counter has to earn back by hand.
describe('the gate 5-minute window (sliding, one slot at a time)', () => {
  const IP = '10.99.8.1';
  const T0 = new Date('2026-10-03T12:00:00.000Z');

  const post = (env, body = { pin: '000000' }, ip = IP) =>
    app.request(
      '/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': ip },
        body: JSON.stringify(body),
      },
      env,
    );

  it('stays shut while any failure is still inside the window, and reopens one slot at a time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const bucket = makeR2();
    const env = envFor({ MONITOR_BUCKET: bucket });

    // Five failures spaced 20s apart: the oldest is at T0, so the window is
    // anchored there and the budget is spent at T0 + 80s.
    for (let i = 0; i < LOGIN_FAIL_LIMIT; i += 1) {
      const res = await post(env);
      expect(res.status).toBe(401);
      vi.advanceTimersByTime(20_000);
    }
    const spent = await readGate(bucket, IP, DASHBOARD_PIN);
    expect(spent.fails).toHaveLength(LOGIN_FAIL_LIMIT);
    expect(Date.parse(spent.locked_until) - Date.parse(spent.window_start)).toBe(LOGIN_FAIL_WINDOW_MS);

    // One second before the oldest failure leaves the window: still shut.
    vi.setSystemTime(new Date(Date.parse(spent.window_start) + LOGIN_FAIL_WINDOW_MS - 1000));
    expect((await post(env)).status).toBe(429);
    // The 429 path recorded nothing new, so hammering cannot grow the document.
    expect((await readGate(bucket, IP, DASHBOARD_PIN)).fails).toHaveLength(LOGIN_FAIL_LIMIT);

    // The instant the oldest failure ages out: ONE slot frees, not five. This is
    // the sliding property — a counter plus a fixed window anchor would hand back
    // the WHOLE budget here, which is the bug this shape exists to prevent.
    const slideAt = Date.parse(spent.window_start) + LOGIN_FAIL_WINDOW_MS;
    vi.setSystemTime(new Date(slideAt));
    const reopened = await post(env);
    expect(reopened.status).toBe(401);
    // Four failures were still inside the window, so this guess is the fifth:
    // "0 tries left" is the honest count, and the window has SLID rather than
    // restarted (its start is now the second-oldest failure, 20s later).
    expect((await reopened.json()).error).toContain('0 tries left');
    const slid = await readGate(bucket, IP, DASHBOARD_PIN);
    expect(slid.window_start).toBe(spent.fails[1]);
    expect(slid.fails).toHaveLength(LOGIN_FAIL_LIMIT); // this guess refilled the freed slot
    expect(Date.parse(slid.locked_until) - Date.parse(slid.window_start)).toBe(LOGIN_FAIL_WINDOW_MS);

    // Still shut 19s later — only the second failure is now the one about to
    // expire. A window that reset wholesale would answer 401 here.
    vi.setSystemTime(new Date(slideAt + 19_000));
    expect((await post(env)).status).toBe(429);

    // One more 1s and that failure ages out too, and the gate is a BUDGET, not a
    // lockout: the correct PIN is accepted in the same window.
    vi.setSystemTime(new Date(slideAt + 20_000));
    const ok = await post(env, { pin: DASHBOARD_PIN });
    expect(ok.status).toBe(302);
    const afterSuccess = await readGate(bucket, IP, DASHBOARD_PIN);
    // A success does NOT refund the failures still inside the window (the old
    // count filtered on `success = 0` and nothing else); it only stamps itself.
    expect(afterSuccess.fails).toHaveLength(LOGIN_FAIL_LIMIT - 1);
    expect(afterSuccess.last_success_at).not.toBeNull();
  });

  it('rotating the PIN moves the counter: the same IP starts a fresh budget', async () => {
    // The counter is keyed by an HMAC of the address under DASHBOARD_PIN, so a new
    // PIN files the document somewhere else and the spent budget is invisible.
    // (That is also the property a bare, unkeyed digest would fail — a static hash
    // would keep returning 429 here forever.)
    const bucket = makeR2();
    const envA = envFor({ MONITOR_BUCKET: bucket });
    for (let i = 0; i < LOGIN_FAIL_LIMIT; i += 1) expect((await post(envA)).status).toBe(401);
    expect((await post(envA, { pin: DASHBOARD_PIN })).status).toBe(429);

    const envB = envFor({ MONITOR_BUCKET: bucket, DASHBOARD_PIN: '654321' });
    const fresh = await post(envB);
    expect(fresh.status).toBe(401);
    expect((await fresh.json()).error).toContain('4 tries left');
    expect((await post(envB, { pin: '654321' })).status).toBe(302);
    // Two documents: one per secret. Neither key contains the address.
    expect(gateDocs(bucket)).toHaveLength(2);
    expect(JSON.stringify(bucket.keys())).not.toContain(IP);
  });

  it('hasValidSession is fail-closed on a malformed PIN, even with a valid signature', async () => {
    // A session is HMAC'd with the PIN, so a correctly-signed cookie from an
    // older 6-digit PIN must still be refused once the configured PIN is not a
    // 6-digit value at all — otherwise "unconfigured" would mean "any holder of
    // an old cookie is authenticated".
    const value = await signSession('123456', Date.now());
    const ctx = (env, cookie) => ({ env, req: { header: (h) => (h === 'cookie' ? cookie : undefined) } });
    const cookie = `${SESSION_COOKIE}=${value}`;
    expect(await hasValidSession(ctx({ DASHBOARD_PIN }, cookie))).toBe(true);
    for (const bad of [{}, { DASHBOARD_PIN: '' }, { DASHBOARD_PIN: '12345' }, { DASHBOARD_PIN: 'abcdef' }]) {
      expect(await hasValidSession(ctx(bad, cookie)), JSON.stringify(bad)).toBe(false);
    }
    // No cookie at all denies too.
    expect(await hasValidSession(ctx({ DASHBOARD_PIN }, ''))).toBe(false);
  });
});
