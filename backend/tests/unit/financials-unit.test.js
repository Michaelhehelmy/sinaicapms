/**
 * Financial Management tests — accounts, journal entries, invoices, payments, tax rates.
 *
 * Uses the same SQL-routing mock DB and mountRouter helper as services-unit.test.js.
 */
import { describe, it, expect, vi } from 'vitest';
import financialsRouter from '../../src/api/financials';
import { mountRouter } from '../helpers/routerHarness';

// ── SQL-routing mock DB ─────────────────────────────────────────────────────

function makeRoutingDb() {
  const handlers = [];
  const db = {
    prepare: vi.fn((sql) => {
      const stmt = {
        bind: vi.fn((...binds) => { stmt.boundBinds = binds; return stmt; }),
        boundBinds: [],
        all: vi.fn(async () => (await runHandler(sql, stmt.boundBinds)) ?? { results: [], meta: { changes: 0 } }),
        first: vi.fn(async () => ((await runHandler(sql, stmt.boundBinds))?.results ?? [])[0] ?? null),
        run: vi.fn(async () => (await runHandler(sql, stmt.boundBinds)) ?? { meta: { changes: 1 } }),
      };
      db.statements.push(stmt);
      return stmt;
    }),
    batch: vi.fn(async () => []),
    statements: [],
  };
  function runHandler(sql, binds) {
    for (const h of handlers) {
      if (h.match.test(sql)) return h.result(binds);
    }
    return undefined;
  }
  db.on = (match, result) => {
    handlers.push({ match, result: typeof result === 'function' ? result : () => ({ results: result ?? [], meta: { changes: 1 } }) });
    return db;
  };
  return db;
}

const env = (db) => ({ DB: db });
const TENANT_HEADERS = { 'Content-Type': 'application/json', 'x-tenant-id': 't1' };
const req = (path, init = {}) =>
  new Request(`http://localhost${path}`, { headers: TENANT_HEADERS, ...init });

// ── Accounts ────────────────────────────────────────────────────────────────

describe('Financial Accounts', () => {
  it('GET /accounts lists all accounts', async () => {
    const db = makeRoutingDb().on(/FROM accounts/, [
      { id: 'acc1', tenant_id: 't1', code: '1000', name: 'Cash', type: 'asset', is_active: 1 }
    ]);
    const app = mountRouter(financialsRouter, { tenantId: 't1' });
    const res = await app.request(req('/accounts'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.length).toBe(1);
    expect(body[0].code).toBe('1000');
  });

  it('POST /accounts creates a new account', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM accounts WHERE.*code/, null)
      .on(/INSERT INTO accounts/, { meta: { changes: 1 } });
    const app = mountRouter(financialsRouter, { tenantId: 't1' });
    const res = await app.request(req('/accounts', {
      method: 'POST',
      body: JSON.stringify({ code: '2000', name: 'Accounts Payable', type: 'liability' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.code).toBe('2000');
  });

  it('POST /accounts rejects duplicate code', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM accounts WHERE.*code/, [{ id: 'existing' }]);
    const app = mountRouter(financialsRouter, { tenantId: 't1' });
    const res = await app.request(req('/accounts', {
      method: 'POST',
      body: JSON.stringify({ code: '1000', name: 'Cash', type: 'asset' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.success).toBe(false);
  });

  it('PUT /accounts/:id updates an account', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM accounts WHERE id/, [{ id: 'acc1' }])
      .on(/UPDATE accounts SET/, { meta: { changes: 1 } });
    const app = mountRouter(financialsRouter, { tenantId: 't1' });
    const res = await app.request(req('/accounts/acc1', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated Cash' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('DELETE /accounts/:id soft-deletes an account', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM accounts WHERE id/, [{ id: 'acc1' }])
      .on(/UPDATE accounts SET is_active/, { meta: { changes: 1 } });
    const app = mountRouter(financialsRouter, { tenantId: 't1' });
    const res = await app.request(req('/accounts/acc1', { method: 'DELETE' }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// ── Journals ────────────────────────────────────────────────────────────────

describe('Financial Journals', () => {
  it('GET /journals lists all journals', async () => {
    const db = makeRoutingDb().on(/FROM journals/, [
      { id: 'j1', name: 'Sales Journal', type: 'sales', sequence_next: 1, is_active: 1 }
    ]);
    const app = mountRouter(financialsRouter, { tenantId: 't1' });
    const res = await app.request(req('/journals'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.length).toBe(1);
    expect(body[0].name).toBe('Sales Journal');
  });

  it('POST /journals creates a new journal', async () => {
    const db = makeRoutingDb().on(/INSERT INTO journals/, { meta: { changes: 1 } });
    const app = mountRouter(financialsRouter, { tenantId: 't1' });
    const res = await app.request(req('/journals', {
      method: 'POST',
      body: JSON.stringify({ name: 'Cash Journal', type: 'cash' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.name).toBe('Cash Journal');
  });
});

// ── Journal Entries ─────────────────────────────────────────────────────────

describe('Journal Entries', () => {
  it('POST /journal-entries creates a balanced entry', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM journals WHERE/, [{ id: 'j1' }])
      .on(/INSERT INTO journal_entries/, { meta: { changes: 1 } })
      .on(/INSERT INTO entry_lines/, { meta: { changes: 1 } });
    const app = mountRouter(financialsRouter, { tenantId: 't1' });
    const res = await app.request(req('/journal-entries', {
      method: 'POST',
      body: JSON.stringify({
        journalId: 'j1',
        date: '2026-01-01',
        description: 'Test entry',
        lines: [
          { accountId: 'acc1', debit: 100, credit: 0 },
          { accountId: 'acc2', debit: 0, credit: 100 },
        ],
      }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
  });

  it('POST /journal-entries rejects unbalanced entry', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM journals WHERE/, [{ id: 'j1' }]);
    const app = mountRouter(financialsRouter, { tenantId: 't1' });
    const res = await app.request(req('/journal-entries', {
      method: 'POST',
      body: JSON.stringify({
        journalId: 'j1',
        date: '2026-01-01',
        lines: [
          { accountId: 'acc1', debit: 100, credit: 0 },
          { accountId: 'acc2', debit: 0, credit: 50 },
        ],
      }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toContain('Debits must equal credits');
  });

  it('GET /journal-entries lists entries with lines', async () => {
    const db = makeRoutingDb()
      .on(/FROM journal_entries je/, [
        { id: 'e1', journal_id: 'j1', journal_name: 'Sales Journal', date: '2026-01-01', description: 'Test', posted: 0 }
      ])
      .on(/FROM entry_lines el/, [
        { id: 'l1', account_id: 'acc1', account_name: 'Cash', account_code: '1000', debit: 100, credit: 0 }
      ]);
    const app = mountRouter(financialsRouter, { tenantId: 't1' });
    const res = await app.request(req('/journal-entries'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.length).toBe(1);
    expect(body[0].lines.length).toBe(1);
  });

  it('POST /journal-entries/:id/post posts an entry', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id, posted FROM journal_entries/, [{ id: 'e1', posted: 0 }])
      .on(/UPDATE journal_entries SET posted/, { meta: { changes: 1 } });
    const app = mountRouter(financialsRouter, { tenantId: 't1' });
    const res = await app.request(req('/journal-entries/e1/post', { method: 'POST' }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('POST /journal-entries/:id/post rejects already posted entry', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id, posted FROM journal_entries/, [{ id: 'e1', posted: 1 }]);
    const app = mountRouter(financialsRouter, { tenantId: 't1' });
    const res = await app.request(req('/journal-entries/e1/post', { method: 'POST' }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain('already posted');
  });
});

// ── Invoices ────────────────────────────────────────────────────────────────

describe('Invoices', () => {
  it('POST /invoices creates an invoice with lines', async () => {
    const db = makeRoutingDb()
      .on(/SELECT COUNT/, [{ cnt: 0 }])
      .on(/INSERT INTO invoices/, { meta: { changes: 1 } })
      .on(/INSERT INTO invoice_lines/, { meta: { changes: 1 } });
    const app = mountRouter(financialsRouter, { tenantId: 't1' });
    const res = await app.request(req('/invoices', {
      method: 'POST',
      body: JSON.stringify({
        type: 'sales',
        issueDate: '2026-01-01',
        lines: [
          { description: 'Widget', quantity: 2, unitPrice: 50 },
        ],
      }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.totalAmount).toBe(100);
    expect(body.invoiceNumber).toMatch(/^INV-/);
  });

  it('GET /invoices lists invoices with status filter', async () => {
    const db = makeRoutingDb().on(/FROM invoices/, [
      { id: 'inv1', invoice_number: 'INV-00001', type: 'sales', total_amount: 200, paid_amount: 0, status: 'draft' }
    ]);
    const app = mountRouter(financialsRouter, { tenantId: 't1' });
    const res = await app.request(req('/invoices?status=draft'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.length).toBe(1);
  });

  it('PATCH /invoices/:id/status updates status', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM invoices/, [{ id: 'inv1' }])
      .on(/UPDATE invoices SET status/, { meta: { changes: 1 } });
    const app = mountRouter(financialsRouter, { tenantId: 't1' });
    const res = await app.request(req('/invoices/inv1/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'sent' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// ── Payments ────────────────────────────────────────────────────────────────

describe('Payments', () => {
  it('POST /payments records a payment and updates invoice', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id, total_amount, paid_amount FROM invoices/, [{ id: 'inv1', total_amount: 100, paid_amount: 0 }])
      .on(/UPDATE invoices SET paid_amount/, { meta: { changes: 1 } })
      .on(/INSERT INTO payments/, { meta: { changes: 1 } });
    const app = mountRouter(financialsRouter, { tenantId: 't1' });
    const res = await app.request(req('/payments', {
      method: 'POST',
      body: JSON.stringify({
        invoiceId: 'inv1',
        amount: 100,
        paymentDate: '2026-01-01',
        method: 'cash',
      }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.amount).toBe(100);
    expect(body.status).toBe('completed');
  });

  it('POST /payments records a payment without invoice', async () => {
    const db = makeRoutingDb().on(/INSERT INTO payments/, { meta: { changes: 1 } });
    const app = mountRouter(financialsRouter, { tenantId: 't1' });
    const res = await app.request(req('/payments', {
      method: 'POST',
      body: JSON.stringify({
        amount: 250,
        paymentDate: '2026-01-15',
        method: 'bank_transfer',
      }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
  });
});

// ── Tax Rates ───────────────────────────────────────────────────────────────

describe('Tax Rates', () => {
  it('GET /tax-rates lists all tax rates', async () => {
    const db = makeRoutingDb().on(/FROM tax_rates/, [
      { id: 'tr1', name: 'VAT', rate: 15, jurisdiction: 'Egypt', is_default: 1 }
    ]);
    const app = mountRouter(financialsRouter, { tenantId: 't1' });
    const res = await app.request(req('/tax-rates'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.length).toBe(1);
    expect(body[0].name).toBe('VAT');
  });

  it('POST /tax-rates creates a new tax rate', async () => {
    const db = makeRoutingDb().on(/INSERT INTO tax_rates/, { meta: { changes: 1 } });
    const app = mountRouter(financialsRouter, { tenantId: 't1' });
    const res = await app.request(req('/tax-rates', {
      method: 'POST',
      body: JSON.stringify({ name: 'GST', rate: 10, jurisdiction: 'Australia' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.rate).toBe(10);
  });
});

// ── Exchange Rates ──────────────────────────────────────────────────────────

describe('Exchange Rates', () => {
  it('GET /exchange-rates lists all exchange rates', async () => {
    const db = makeRoutingDb().on(/FROM exchange_rates/, [
      { id: 'er1', from_currency: 'USD', to_currency: 'EGP', rate: 30.5, date: '2026-01-01' }
    ]);
    const app = mountRouter(financialsRouter, { tenantId: 't1' });
    const res = await app.request(req('/exchange-rates'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.length).toBe(1);
    expect(body[0].fromCurrency).toBe('USD');
  });
});

// ── Tenant Isolation ────────────────────────────────────────────────────────

describe('Tenant Isolation', () => {
  it('queries always include tenant_id', async () => {
    const capturedBinds = [];
    const db = makeRoutingDb().on(/FROM accounts/, (binds) => {
      capturedBinds.push(...binds);
      return { results: [{ id: 'acc1', code: '1000', name: 'Cash', type: 'asset', is_active: 1 }], meta: { changes: 0 } };
    });
    const app = mountRouter(financialsRouter, { tenantId: 't1' });
    await app.request(req('/accounts'), {}, env(db));
    expect(capturedBinds).toContain('t1');
  });
});

// ── Validation ──────────────────────────────────────────────────────────────

describe('Validation', () => {
  it('POST /accounts rejects invalid type', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(financialsRouter, { tenantId: 't1' });
    const res = await app.request(req('/accounts', {
      method: 'POST',
      body: JSON.stringify({ code: '1000', name: 'Cash', type: 'invalid' }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });

  it('POST /invoices rejects empty lines', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(financialsRouter, { tenantId: 't1' });
    const res = await app.request(req('/invoices', {
      method: 'POST',
      body: JSON.stringify({ type: 'sales', issueDate: '2026-01-01', lines: [] }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });
});

// ── Payment Gateway Stubs ───────────────────────────────────────────────────

describe('Payment Gateway Stubs', () => {
  it('POST /process-payment creates payment intent', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(financialsRouter, { tenantId: 't1' });
    const res = await app.request(req('/process-payment', {
      method: 'POST',
      body: JSON.stringify({ amount: 100, method: 'stripe', currency: 'USD' }),
    }), {}, env(db));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.paymentIntentId).toMatch(/^pi_/);
    expect(body.clientSecret).toContain('_secret_');
    expect(body.status).toBe('pending');
  });

  it('POST /process-payment rejects invalid amount', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(financialsRouter, { tenantId: 't1' });
    const res = await app.request(req('/process-payment', {
      method: 'POST',
      body: JSON.stringify({ amount: -10, method: 'stripe' }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });

  it('POST /process-payment rejects missing method', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(financialsRouter, { tenantId: 't1' });
    const res = await app.request(req('/process-payment', {
      method: 'POST',
      body: JSON.stringify({ amount: 100 }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });

  it('POST /confirm-payment confirms payment', async () => {
    const db = makeRoutingDb();
    db.on(/SELECT id, invoice_id, amount FROM payments/, () => ({
      results: [{ id: 'pay1', invoice_id: 'inv1', amount: 50 }],
    }));
    db.on(/UPDATE payments SET status/, () => ({ results: [], meta: { changes: 1 } }));
    db.on(/SELECT id, total_amount, paid_amount FROM invoices/, () => ({
      results: [{ id: 'inv1', total_amount: 100, paid_amount: 30 }],
    }));
    db.on(/UPDATE invoices SET paid_amount/, () => ({ results: [], meta: { changes: 1 } }));

    const app = mountRouter(financialsRouter, { tenantId: 't1' });
    const res = await app.request(req('/confirm-payment', {
      method: 'POST',
      body: JSON.stringify({ paymentId: 'pay1' }),
    }), {}, env(db));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe('completed');
  });

  it('POST /confirm-payment rejects missing paymentId', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(financialsRouter, { tenantId: 't1' });
    const res = await app.request(req('/confirm-payment', {
      method: 'POST',
      body: JSON.stringify({}),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });
});
