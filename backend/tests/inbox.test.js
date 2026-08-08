/**
 * P4 — Unified inbox (Phase 4) tests.
 * Covers handleInboxRoute (GET feed / PATCH read / DELETE), the new-lead SSE
 * broadcast hook in leads.js, and the /api/inbox dispatch through the worker.
 */
import { describe, it, expect, vi } from 'vitest';
import { handleInboxRoute, inboxReadSchema } from '../src/api/inbox.js';
import { broadcastNewLead, handleLeadsRoute } from '../src/api/leads.js';
import { generateToken } from '../src/middleware/sharedAuth.js';

import app from '../src/index.js';

const SECRET = 'test-secret';

function makeRequest(method, url, body = null, headers = {}) {
  const opts = { method, headers: new Headers({ ...headers }) };
  if (body) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

function chainMock(fns) {
  let idx = 0;
  return () => {
    const ch = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn(),
      all: vi.fn(),
      run: vi.fn(),
    };
    if (idx < fns.length) fns[idx](ch, idx);
    idx++;
    return ch;
  };
}

async function makeToken(overrides = {}) {
  return await generateToken(
    { sub: 'u1', userId: 'u1', email: 'a@b.com', role: 'admin', tenantId: 't1', ...overrides },
    SECRET,
    'access'
  );
}

const LEAD_ROW = {
  id: 'lead_1', kind: 'lead', name: 'Alice', email: 'a@x.com', phone: '111',
  subject: 'Hello', message: 'msg', status: 'new', source: 'contact', is_read: 0,
  camp_name: null, room_number: null, customer_name: null,
  check_in_date: null, check_out_date: null, number_of_people: null,
  total_amount: null, amount_paid: null, payment_status: null,
  order_state_id: null, reference: null, created_at: '2030-01-01 10:00:00',
};

const BOOKING_ROW = {
  id: 'ord_1', kind: 'booking', name: null, email: null, phone: null,
  subject: null, message: null, status: 'paid', source: null, is_read: 1,
  camp_name: 'Sinai Camp', room_number: 'Cabin 3', customer_name: 'John Doe',
  check_in_date: '2030-08-01', check_out_date: '2030-08-05', number_of_people: 2,
  total_amount: 400, amount_paid: 400, payment_status: 'paid',
  order_state_id: 2, reference: 'REF-1', created_at: '2030-01-02 10:00:00',
};

describe('handleInboxRoute — GET /api/inbox', () => {
  it('returns both kinds sorted desc with the pagination envelope + unread count', async () => {
    const db = { prepare: vi.fn() };
    db.prepare.mockImplementation(chainMock([
      (ch) => { ch.all.mockResolvedValue({ results: [BOOKING_ROW, LEAD_ROW] }); },
      (ch) => { ch.all.mockResolvedValue({ results: [{ total: 2 }] }); },
      (ch) => { ch.all.mockResolvedValue({ results: [{ total: 1 }] }); },
      (ch) => { ch.all.mockResolvedValue({ results: [{ total: 1 }] }); },
    ]));

    const res = await handleInboxRoute(makeRequest('GET', 'https://x.com/api/inbox'), { DB: db }, 't1');
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data).toHaveLength(2);
    expect(body.data[0].kind).toBe('booking');
    expect(body.data[1].kind).toBe('lead');
    expect(body.data[0].roomNumber).toBe('Cabin 3');
    expect(body.data[0].campName).toBe('Sinai Camp');
    expect(body.data[0].customerName).toBe('John Doe');
    expect(body.data[0].isRead).toBe(1);
    expect(body.total).toBe(2);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(50);
    expect(body.hasMore).toBe(false);
    expect(body.unread).toBe(2);

    const sqls = db.prepare.mock.calls.map((c) => c[0]);
    expect(sqls[0]).toContain('UNION ALL');
    expect(sqls[0]).toContain('FROM leads');
    expect(sqls[0]).toContain('FROM orders o');
    expect(sqls[0]).toContain('inbox_reads');
    expect(sqls[0]).toContain('ORDER BY u.created_at DESC LIMIT ? OFFSET ?');
    // unread counts query leads (is_read = 0) and un-acked bookings.
    expect(sqls[2]).toContain('leads WHERE tenant_id = ? AND is_read = 0');
    expect(sqls[3]).toContain('ir.ref_id IS NULL');
  });

  it('kind=booking builds only the booking arm (no leads join)', async () => {
    const db = { prepare: vi.fn() };
    db.prepare.mockImplementation(chainMock([
      (ch) => { ch.all.mockResolvedValue({ results: [BOOKING_ROW] }); },
      (ch) => { ch.all.mockResolvedValue({ results: [{ total: 1 }] }); },
      (ch) => { ch.all.mockResolvedValue({ results: [{ total: 0 }] }); },
      (ch) => { ch.all.mockResolvedValue({ results: [{ total: 1 }] }); },
    ]));

    const res = await handleInboxRoute(
      makeRequest('GET', 'https://x.com/api/inbox?kind=booking'),
      { DB: db },
      't1'
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].kind).toBe('booking');

    const sqls = db.prepare.mock.calls.map((c) => c[0]);
    expect(sqls[0]).not.toContain('FROM leads');
    expect(sqls[0]).toContain('FROM orders o');
  });

  it('kind=lead applies the status filter to leads.status only', async () => {
    const db = { prepare: vi.fn() };
    let bindArgs = null;
    db.prepare.mockImplementation(chainMock([
      (ch) => {
        ch.bind = vi.fn((...a) => { bindArgs = a; return ch; });
        ch.all.mockResolvedValue({ results: [LEAD_ROW] });
      },
      (ch) => { ch.all.mockResolvedValue({ results: [{ total: 1 }] }); },
      (ch) => { ch.all.mockResolvedValue({ results: [{ total: 1 }] }); },
      (ch) => { ch.all.mockResolvedValue({ results: [{ total: 0 }] }); },
    ]));

    const res = await handleInboxRoute(
      makeRequest('GET', 'https://x.com/api/inbox?kind=lead&status=new'),
      { DB: db },
      't1'
    );
    expect(res.status).toBe(200);

    const sqls = db.prepare.mock.calls.map((c) => c[0]);
    expect(sqls[0]).toContain('l.status = ?');
    expect(sqls[0]).not.toContain('o.payment_status');
    expect(sqls[1]).toContain('l.status = ?');
    expect(bindArgs).toEqual(['t1', 'new', 50, 0]);
  });

  it('kind=all applies status to both arms (leads.status + orders.payment_status)', async () => {
    const db = { prepare: vi.fn() };
    db.prepare.mockImplementation(chainMock([
      (ch) => { ch.all.mockResolvedValue({ results: [] }); },
      (ch) => { ch.all.mockResolvedValue({ results: [{ total: 0 }] }); },
      (ch) => { ch.all.mockResolvedValue({ results: [{ total: 0 }] }); },
      (ch) => { ch.all.mockResolvedValue({ results: [{ total: 0 }] }); },
    ]));

    const res = await handleInboxRoute(
      makeRequest('GET', 'https://x.com/api/inbox?status=paid'),
      { DB: db },
      't1'
    );
    expect(res.status).toBe(200);
    const sqls = db.prepare.mock.calls.map((c) => c[0]);
    expect(sqls[0]).toContain('l.status = ?');
    expect(sqls[0]).toContain('o.payment_status = ?');
  });

  it('returns 400 for an unknown kind filter', async () => {
    const db = { prepare: vi.fn() };
    const res = await handleInboxRoute(
      makeRequest('GET', 'https://x.com/api/inbox?kind=bogus'),
      { DB: db },
      't1'
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('kind');
  });

  it('honors page/pageSize from the query string', async () => {
    const db = { prepare: vi.fn() };
    let bindArgs = null;
    db.prepare.mockImplementation(chainMock([
      (ch) => {
        ch.bind = vi.fn((...a) => { bindArgs = a; return ch; });
        ch.all.mockResolvedValue({ results: [LEAD_ROW] });
      },
      (ch) => { ch.all.mockResolvedValue({ results: [{ total: 25 }] }); },
      (ch) => { ch.all.mockResolvedValue({ results: [{ total: 1 }] }); },
      (ch) => { ch.all.mockResolvedValue({ results: [{ total: 0 }] }); },
    ]));

    const res = await handleInboxRoute(
      makeRequest('GET', 'https://x.com/api/inbox?page=2&pageSize=10&kind=lead'),
      { DB: db },
      't1'
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(10);
    expect(body.hasMore).toBe(true); // 2 * 10 = 20 < 25
    expect(bindArgs).toEqual(['t1', 10, 10]);
  });
});

describe('handleInboxRoute — PATCH /api/inbox/read', () => {
  it('marks a lead read (is_read + read_at), tenant-scoped', async () => {
    const db = { prepare: vi.fn() };
    let bindArgs = null;
    db.prepare.mockImplementation(chainMock([
      (ch) => {
        ch.bind = vi.fn((...a) => { bindArgs = a; return ch; });
        ch.run.mockResolvedValue({ changes: 1 });
      },
    ]));

    const res = await handleInboxRoute(
      makeRequest('PATCH', 'https://x.com/api/inbox/read', { kind: 'lead', id: 'lead_1' }),
      { DB: db },
      't1'
    );
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);

    const sql = db.prepare.mock.calls[0][0];
    expect(sql).toContain('UPDATE leads SET is_read = 1, read_at = datetime(\'now\')');
    expect(sql).toContain('AND tenant_id = ?');
    expect(bindArgs).toEqual(['lead_1', 't1']);
  });

  it('returns 404 when the lead is not found for this tenant', async () => {
    const db = { prepare: vi.fn() };
    db.prepare.mockImplementation(chainMock([
      (ch) => { ch.run.mockResolvedValue({ changes: 0 }); },
    ]));

    const res = await handleInboxRoute(
      makeRequest('PATCH', 'https://x.com/api/inbox/read', { kind: 'lead', id: 'nope' }),
      { DB: db },
      't1'
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Lead not found');
  });

  it('acks a booking idempotently via inbox_reads INSERT OR IGNORE', async () => {
    const db = { prepare: vi.fn() };
    const binds = [];
    db.prepare.mockImplementation(chainMock([
      (ch) => {
        ch.bind = vi.fn((...a) => { binds.push(a); return ch; });
        ch.run.mockResolvedValue({});
      },
    ]));

    const first = await handleInboxRoute(
      makeRequest('PATCH', 'https://x.com/api/inbox/read', { kind: 'booking', id: 'ord_1' }),
      { DB: db },
      't1'
    );
    expect(first.status).toBe(200);
    expect((await first.json()).success).toBe(true);

    const second = await handleInboxRoute(
      makeRequest('PATCH', 'https://x.com/api/inbox/read', { kind: 'booking', id: 'ord_1' }),
      { DB: db },
      't1'
    );
    expect(second.status).toBe(200);

    const sql = db.prepare.mock.calls[0][0];
    expect(sql).toContain('INSERT OR IGNORE INTO inbox_reads');
    expect(sql).toContain("VALUES (?, 'booking', ?, datetime('now'))");
    expect(binds[0]).toEqual(['t1', 'ord_1']);
  });

  it('validates the body via zod (400 on bad kind or empty id)', async () => {
    const db = { prepare: vi.fn() };
    const bad = await handleInboxRoute(
      makeRequest('PATCH', 'https://x.com/api/inbox/read', { kind: 'order', id: '' }),
      { DB: db },
      't1'
    );
    expect(bad.status).toBe(400);
    const body = await bad.json();
    expect(body.success).toBe(false);
    expect(body.errors).toBeDefined();
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('exposes a strict inboxReadSchema contract', () => {
    const ok = inboxReadSchema.safeParse({ kind: 'booking', id: 'ord_1' });
    expect(ok.success).toBe(true);
    const bad = inboxReadSchema.safeParse({ kind: 'x', id: '' });
    expect(bad.success).toBe(false);
  });
});

describe('handleInboxRoute — DELETE /api/inbox/:kind/:id', () => {
  it('deletes a lead, tenant-scoped', async () => {
    const db = { prepare: vi.fn() };
    let bindArgs = null;
    db.prepare.mockImplementation(chainMock([
      (ch) => {
        ch.bind = vi.fn((...a) => { bindArgs = a; return ch; });
        ch.run.mockResolvedValue({ changes: 1 });
      },
    ]));

    const res = await handleInboxRoute(
      makeRequest('DELETE', 'https://x.com/api/inbox/lead/lead_1'),
      { DB: db },
      't1'
    );
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);

    const sql = db.prepare.mock.calls[0][0];
    expect(sql).toContain('DELETE FROM leads WHERE id = ? AND tenant_id = ?');
    expect(bindArgs).toEqual(['lead_1', 't1']);
  });

  it('returns 404 when the lead is not found', async () => {
    const db = { prepare: vi.fn() };
    db.prepare.mockImplementation(chainMock([
      (ch) => { ch.run.mockResolvedValue({ changes: 0 }); },
    ]));

    const res = await handleInboxRoute(
      makeRequest('DELETE', 'https://x.com/api/inbox/lead/nope'),
      { DB: db },
      't1'
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Lead not found');
  });

  it('rejects booking deletion with 400', async () => {
    const db = { prepare: vi.fn() };
    const res = await handleInboxRoute(
      makeRequest('DELETE', 'https://x.com/api/inbox/booking/ord_1'),
      { DB: db },
      't1'
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Booking deletion not allowed');
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('returns 400 when the lead id segment is missing', async () => {
    const db = { prepare: vi.fn() };
    const res = await handleInboxRoute(
      makeRequest('DELETE', 'https://x.com/api/inbox/lead'),
      { DB: db },
      't1'
    );
    expect(res.status).toBe(400);
  });
});

describe('broadcastNewLead (leads.js hook)', () => {
  function makeBroadcasterStub() {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    return {
      broadcaster: {
        idFromName: vi.fn().mockReturnValue('id-t1'),
        get: vi.fn().mockReturnValue({ fetch: fetchSpy }),
      },
      fetchSpy,
    };
  }

  it('fires a new-lead event to the tenant DO after POST /api/leads', async () => {
    const db = { prepare: vi.fn() };
    db.prepare.mockImplementation(chainMock([
      (ch) => { ch.run.mockResolvedValue({ changes: 1 }); },
    ]));
    const { broadcaster, fetchSpy } = makeBroadcasterStub();

    const res = await handleLeadsRoute(
      makeRequest('POST', 'https://x.com/api/leads', {
        name: 'Alice', email: 'a@x.com', subject: 'Hello', message: 'msg',
      }),
      { DB: db, BROADCASTER: broadcaster },
      't1'
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://broadcaster/broadcast');
    expect(broadcaster.idFromName).toHaveBeenCalledWith('t1');
    const sent = JSON.parse(opts.body);
    expect(sent.tenantId).toBe('t1');
    expect(sent.event).toEqual({
      type: 'new-lead',
      leadId: body.id,
      name: 'Alice',
      subject: 'Hello',
    });
  });

  it('does NOT broadcast when there is no tenant context', async () => {
    const db = { prepare: vi.fn() };
    db.prepare.mockImplementation(chainMock([
      (ch) => { ch.run.mockResolvedValue({ changes: 1 }); },
    ]));
    const { fetchSpy } = makeBroadcasterStub();

    const res = await handleLeadsRoute(
      makeRequest('POST', 'https://x.com/api/leads', { name: 'Bob', email: 'b@x.com' }),
      { DB: db },
      null
    );
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('is a no-op when the BROADCASTER binding is absent', () => {
    expect(() => broadcastNewLead({}, 't1', { leadId: 'lead_1', name: 'A', subject: 'S' })).not.toThrow();
  });

  it('skips broadcast for a falsy tenantId', () => {
    const { broadcaster, fetchSpy } = makeBroadcasterStub();
    broadcastNewLead({ BROADCASTER: broadcaster }, null, { leadId: 'lead_1', name: 'A' });
    broadcastNewLead({ BROADCASTER: broadcaster }, '', { leadId: 'lead_1', name: 'A' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('swallows errors when the DO stub throws', () => {
    const broadcaster = {
      idFromName: vi.fn(() => { throw new Error('boom'); }),
    };
    expect(() => broadcastNewLead({ BROADCASTER: broadcaster }, 't1', { leadId: 'l1' })).not.toThrow();
  });

  it('swallows a rejected fetch (broadcast never fails the lead)', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('hub down'));
    const broadcaster = {
      idFromName: vi.fn().mockReturnValue('id-t1'),
      get: vi.fn().mockReturnValue({ fetch: fetchSpy }),
    };
    broadcastNewLead({ BROADCASTER: broadcaster }, 't1', { leadId: 'l1', name: 'A', subject: 'S' });
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/inbox (worker dispatch)', () => {
  const TENANT_LOOKUP = (ch) => { ch.all.mockResolvedValue({ results: [{ id: 't1' }] }); };
  const ACTIVE_CHECK = (ch) => { ch.all.mockResolvedValue({ results: [{ is_active: 1 }] }); };

  it('requires auth — 401 without an Authorization header', async () => {
    const db = { prepare: vi.fn() };
    db.prepare.mockImplementation(chainMock([TENANT_LOOKUP]));
    const res = await app.fetch(new Request('https://sinaicamps.com/api/inbox', {
      method: 'GET',
      headers: { 'x-tenant-id': 't1' },
    }), { DB: db, JWT_SECRET: SECRET, ENVIRONMENT: 'test' });
    expect(res.status).toBe(401);
  });

  it('rejects a POS session with 403', async () => {
    const token = await makeToken({ posType: 'pos', role: 'admin', tenantId: 't1' });
    const db = { prepare: vi.fn() };
    db.prepare.mockImplementation(chainMock([TENANT_LOOKUP, ACTIVE_CHECK]));
    const res = await app.fetch(new Request('https://sinaicamps.com/api/inbox', {
      method: 'GET',
      headers: { 'x-tenant-id': 't1', Authorization: `Bearer ${token}` },
    }), { DB: db, JWT_SECRET: SECRET, ENVIRONMENT: 'test' });
    expect(res.status).toBe(403);
  });

  it('forwards an authenticated GET through to handleInboxRoute', async () => {
    const token = await makeToken({ role: 'admin', tenantId: 't1' });
    const db = { prepare: vi.fn() };
    db.prepare.mockImplementation(chainMock([
      TENANT_LOOKUP,
      ACTIVE_CHECK,
      (ch) => { ch.all.mockResolvedValue({ results: [LEAD_ROW] }); },
      (ch) => { ch.all.mockResolvedValue({ results: [{ total: 1 }] }); },
      (ch) => { ch.all.mockResolvedValue({ results: [{ total: 1 }] }); },
      (ch) => { ch.all.mockResolvedValue({ results: [{ total: 0 }] }); },
    ]));

    const res = await app.fetch(new Request('https://sinaicamps.com/api/inbox?kind=lead', {
      method: 'GET',
      headers: { 'x-tenant-id': 't1', Authorization: `Bearer ${token}` },
    }), { DB: db, JWT_SECRET: SECRET, ENVIRONMENT: 'test' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].kind).toBe('lead');
    expect(body.unread).toBe(1);
  });
});
