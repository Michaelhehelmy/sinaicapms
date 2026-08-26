/**
 * HR & Payroll tests — employee CRUD, leave approval, payroll calculation, tenant isolation.
 */
import { describe, it, expect, vi } from 'vitest';
import hrRouter from '../../src/api/hr';
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

// ── Employees ───────────────────────────────────────────────────────────────

describe('Employees', () => {
  it('GET /employees lists all employees', async () => {
    const db = makeRoutingDb().on(/FROM employees.*ORDER BY/, [
      { id: 'emp1', tenant_id: 't1', first_name: 'John', last_name: 'Doe', email: 'john@test.com', status: 'active', salary_amount: 5000 }
    ]);
    const app = mountRouter(hrRouter, { tenantId: 't1' });
    const res = await app.request(req('/employees'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.length).toBe(1);
    expect(body[0].firstName).toBe('John');
    expect(body[0].lastName).toBe('Doe');
  });

  it('POST /employees creates a new employee', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM employees WHERE.*email/, null)
      .on(/INSERT INTO employees/, { meta: { changes: 1 } });
    const app = mountRouter(hrRouter, { tenantId: 't1' });
    const res = await app.request(req('/employees', {
      method: 'POST',
      body: JSON.stringify({
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@test.com',
        hireDate: '2026-01-01',
        salaryAmount: 6000,
      }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.firstName).toBe('Jane');
  });

  it('POST /employees rejects duplicate email', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM employees WHERE.*email/, [{ id: 'existing' }]);
    const app = mountRouter(hrRouter, { tenantId: 't1' });
    const res = await app.request(req('/employees', {
      method: 'POST',
      body: JSON.stringify({ firstName: 'Jane', lastName: 'Smith', email: 'jane@test.com', hireDate: '2026-01-01' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.success).toBe(false);
  });

  it('PUT /employees/:id updates an employee', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM employees WHERE id/, [{ id: 'emp1' }])
      .on(/UPDATE employees SET/, { meta: { changes: 1 } });
    const app = mountRouter(hrRouter, { tenantId: 't1' });
    const res = await app.request(req('/employees/emp1', {
      method: 'PUT',
      body: JSON.stringify({ department: 'Engineering' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('DELETE /employees/:id soft-deletes (sets terminated)', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM employees WHERE id/, [{ id: 'emp1' }])
      .on(/UPDATE employees SET status/, { meta: { changes: 1 } });
    const app = mountRouter(hrRouter, { tenantId: 't1' });
    const res = await app.request(req('/employees/emp1', { method: 'DELETE' }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('PUT /employees/:id returns 404 for missing employee', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM employees WHERE id/, null);
    const app = mountRouter(hrRouter, { tenantId: 't1' });
    const res = await app.request(req('/employees/missing', {
      method: 'PUT',
      body: JSON.stringify({ department: 'HR' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });
});

// ── Leave Types ─────────────────────────────────────────────────────────────

describe('Leave Types', () => {
  it('GET /leave-types lists all leave types', async () => {
    const db = makeRoutingDb().on(/FROM leave_types/, [
      { id: 'lt1', name: 'Vacation', accrual_rate: 15, is_paid: 1 }
    ]);
    const app = mountRouter(hrRouter, { tenantId: 't1' });
    const res = await app.request(req('/leave-types'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.length).toBe(1);
    expect(body[0].name).toBe('Vacation');
  });

  it('POST /leave-types creates a leave type', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM leave_types WHERE.*name/, null)
      .on(/INSERT INTO leave_types/, { meta: { changes: 1 } });
    const app = mountRouter(hrRouter, { tenantId: 't1' });
    const res = await app.request(req('/leave-types', {
      method: 'POST',
      body: JSON.stringify({ name: 'Sick Leave', accrualRate: 10, isPaid: true }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.name).toBe('Sick Leave');
  });

  it('POST /leave-types rejects duplicate name', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM leave_types WHERE.*name/, [{ id: 'existing' }]);
    const app = mountRouter(hrRouter, { tenantId: 't1' });
    const res = await app.request(req('/leave-types', {
      method: 'POST',
      body: JSON.stringify({ name: 'Vacation' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.success).toBe(false);
  });
});

// ── Leave Requests ──────────────────────────────────────────────────────────

describe('Leave Requests', () => {
  it('POST /leave-requests creates a leave request', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM employees WHERE/, [{ id: 'emp1' }])
      .on(/SELECT id FROM leave_types WHERE/, [{ id: 'lt1' }])
      .on(/INSERT INTO leave_requests/, { meta: { changes: 1 } });
    const app = mountRouter(hrRouter, { tenantId: 't1' });
    const res = await app.request(req('/leave-requests', {
      method: 'POST',
      body: JSON.stringify({
        employeeId: 'emp1',
        leaveTypeId: 'lt1',
        startDate: '2026-03-01',
        endDate: '2026-03-05',
        days: 5,
      }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.status).toBe('pending');
    expect(body.days).toBe(5);
  });

  it('PATCH /leave-requests/:id/approve approves a request', async () => {
    const db = makeRoutingDb()
      .on(/SELECT \* FROM leave_requests WHERE/, [{ id: 'lr1', status: 'pending', employee_id: 'emp1', leave_type_id: 'lt1', start_date: '2026-03-01', days: 5 }])
      .on(/UPDATE leave_requests SET status/, { meta: { changes: 1 } })
      .on(/SELECT id, used_days, remaining_days FROM leave_balances/, { id: 'lb1', used_days: 2, remaining_days: 13 })
      .on(/UPDATE leave_balances SET/, { meta: { changes: 1 } });
    const app = mountRouter(hrRouter, { tenantId: 't1' });
    const res = await app.request(req('/leave-requests/lr1/approve', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('PATCH /leave-requests/:id/approve rejects already processed request', async () => {
    const db = makeRoutingDb()
      .on(/SELECT \* FROM leave_requests WHERE/, [{ id: 'lr1', status: 'approved' }]);
    const app = mountRouter(hrRouter, { tenantId: 't1' });
    const res = await app.request(req('/leave-requests/lr1/approve', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain('not pending');
  });
});

// ── Payroll ─────────────────────────────────────────────────────────────────

describe('Payroll', () => {
  it('POST /payroll/runs creates a payroll run with correct calculations', async () => {
    const db = makeRoutingDb()
      .on(/SELECT \* FROM employees WHERE.*active/, [
        { id: 'emp1', salary_amount: 5000, bank_account: null },
        { id: 'emp2', salary_amount: 3000, bank_account: '12345' },
      ])
      .on(/INSERT INTO payroll_runs/, { meta: { changes: 1 } })
      .on(/INSERT INTO payroll_lines/, { meta: { changes: 1 } });
    const app = mountRouter(hrRouter, { tenantId: 't1' });
    const res = await app.request(req('/payroll/runs', {
      method: 'POST',
      body: JSON.stringify({ periodStart: '2026-03-01', periodEnd: '2026-03-31' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.lineCount).toBe(2);
    // gross = 5000 + 3000 = 8000
    expect(body.totalGross).toBe(8000);
    // deductions = 8000 * 0.2 = 1600
    expect(body.totalDeductions).toBe(1600);
    // net = 8000 - 1600 = 6400
    expect(body.totalNet).toBe(6400);
  });

  it('POST /payroll/runs rejects when no active employees', async () => {
    const db = makeRoutingDb()
      .on(/SELECT \* FROM employees WHERE.*active/, []);
    const app = mountRouter(hrRouter, { tenantId: 't1' });
    const res = await app.request(req('/payroll/runs', {
      method: 'POST',
      body: JSON.stringify({ periodStart: '2026-03-01', periodEnd: '2026-03-31' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain('No active employees');
  });

  it('GET /payroll/runs lists all payroll runs', async () => {
    const db = makeRoutingDb().on(/FROM payroll_runs/, [
      { id: 'pr1', period_start: '2026-03-01', period_end: '2026-03-31', status: 'draft', total_gross: 8000 }
    ]);
    const app = mountRouter(hrRouter, { tenantId: 't1' });
    const res = await app.request(req('/payroll/runs'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.length).toBe(1);
  });

  it('GET /payroll/runs/:id returns run with lines', async () => {
    const db = makeRoutingDb()
      .on(/SELECT \* FROM payroll_runs WHERE/, [{ id: 'pr1', status: 'draft', total_gross: 8000 }])
      .on(/FROM payroll_lines pl/, [
        { id: 'pl1', employee_id: 'emp1', first_name: 'John', last_name: 'Doe', gross_pay: 5000, deductions: 1000, net_pay: 4000 }
      ]);
    const app = mountRouter(hrRouter, { tenantId: 't1' });
    const res = await app.request(req('/payroll/runs/pr1'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.id).toBe('pr1');
    expect(body.lines.length).toBe(1);
    expect(body.lines[0].firstName).toBe('John');
  });

  it('POST /payroll/runs/:id/post posts the payroll', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id, status FROM payroll_runs/, [{ id: 'pr1', status: 'completed' }])
      .on(/UPDATE payroll_runs SET status/, { meta: { changes: 1 } })
      .on(/UPDATE payroll_lines SET status/, { meta: { changes: 1 } });
    const app = mountRouter(hrRouter, { tenantId: 't1' });
    const res = await app.request(req('/payroll/runs/pr1/post', { method: 'POST' }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('POST /payroll/runs/:id/post rejects draft payroll', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id, status FROM payroll_runs/, [{ id: 'pr1', status: 'draft' }]);
    const app = mountRouter(hrRouter, { tenantId: 't1' });
    const res = await app.request(req('/payroll/runs/pr1/post', { method: 'POST' }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain('completed before posting');
  });
});

// ── Recruitment ─────────────────────────────────────────────────────────────

describe('Recruitment', () => {
  it('GET /job-posts lists all job posts', async () => {
    const db = makeRoutingDb().on(/FROM job_posts/, [
      { id: 'jp1', title: 'Front Desk', department: 'Operations', status: 'open' }
    ]);
    const app = mountRouter(hrRouter, { tenantId: 't1' });
    const res = await app.request(req('/job-posts'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.length).toBe(1);
    expect(body[0].title).toBe('Front Desk');
  });

  it('POST /job-posts creates a job post', async () => {
    const db = makeRoutingDb().on(/INSERT INTO job_posts/, { meta: { changes: 1 } });
    const app = mountRouter(hrRouter, { tenantId: 't1' });
    const res = await app.request(req('/job-posts', {
      method: 'POST',
      body: JSON.stringify({ title: 'Chef', department: 'Kitchen', location: 'Cairo' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.title).toBe('Chef');
    expect(body.status).toBe('open');
  });

  it('POST /applicants creates an applicant', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM job_posts WHERE/, [{ id: 'jp1' }])
      .on(/INSERT INTO applicants/, { meta: { changes: 1 } });
    const app = mountRouter(hrRouter, { tenantId: 't1' });
    const res = await app.request(req('/applicants', {
      method: 'POST',
      body: JSON.stringify({ jobPostId: 'jp1', name: 'Ahmed Ali', email: 'ahmed@test.com' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.name).toBe('Ahmed Ali');
    expect(body.status).toBe('applied');
  });

  it('POST /applicants rejects invalid job post', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM job_posts WHERE/, null);
    const app = mountRouter(hrRouter, { tenantId: 't1' });
    const res = await app.request(req('/applicants', {
      method: 'POST',
      body: JSON.stringify({ jobPostId: 'missing', name: 'Ahmed', email: 'ahmed@test.com' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error).toContain('not found');
  });
});

// ── Leave Balances ──────────────────────────────────────────────────────────

describe('Leave Balances', () => {
  it('GET /leave-balances lists balances for employee', async () => {
    const db = makeRoutingDb().on(/FROM leave_balances/, [
      { id: 'lb1', employee_id: 'emp1', leave_type_id: 'lt1', year: 2026, total_days: 15, used_days: 5, remaining_days: 10, leave_type_name: 'Vacation' }
    ]);
    const app = mountRouter(hrRouter, { tenantId: 't1' });
    const res = await app.request(req('/leave-balances?employeeId=emp1'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.length).toBe(1);
    expect(body[0].totalDays).toBe(15);
    expect(body[0].remainingDays).toBe(10);
  });
});

// ── Validation ──────────────────────────────────────────────────────────────

describe('Validation', () => {
  it('POST /employees rejects invalid payload', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(hrRouter, { tenantId: 't1' });
    const res = await app.request(req('/employees', {
      method: 'POST',
      body: JSON.stringify({ firstName: '', email: 'bad' }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });

  it('POST /leave-requests rejects missing fields', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(hrRouter, { tenantId: 't1' });
    const res = await app.request(req('/leave-requests', {
      method: 'POST',
      body: JSON.stringify({}),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });

  it('POST /job-posts rejects empty title', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(hrRouter, { tenantId: 't1' });
    const res = await app.request(req('/job-posts', {
      method: 'POST',
      body: JSON.stringify({ title: '' }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });
});

// ── Tenant Isolation ────────────────────────────────────────────────────────

describe('Tenant Isolation', () => {
  it('queries always include tenant_id', async () => {
    const capturedBinds = [];
    const db = makeRoutingDb().on(/FROM employees/, (binds) => {
      capturedBinds.push(...binds);
      return { results: [{ id: 'emp1', first_name: 'John', last_name: 'Doe', email: 'john@test.com', status: 'active', salary_amount: 5000 }], meta: { changes: 0 } };
    });
    const app = mountRouter(hrRouter, { tenantId: 't1' });
    await app.request(req('/employees'), {}, env(db));
    expect(capturedBinds).toContain('t1');
  });

  it('different tenants see different data', async () => {
    const db = makeRoutingDb().on(/FROM employees/, (binds) => {
      const tenantId = binds[0];
      if (tenantId === 't1') {
        return { results: [{ id: 'emp1', first_name: 'John', last_name: 'Doe', email: 'john@test.com', status: 'active', salary_amount: 5000 }], meta: { changes: 0 } };
      }
      return { results: [], meta: { changes: 0 } };
    });
    const app1 = mountRouter(hrRouter, { tenantId: 't1' });
    const app2 = mountRouter(hrRouter, { tenantId: 't2' });
    const res1 = await app1.request(req('/employees'), {}, env(db));
    const res2 = await app2.request(req('/employees'), {}, { DB: db });
    const body1 = await res1.json();
    const body2 = await res2.json();
    expect(body1.length).toBe(1);
    expect(body2.length).toBe(0);
  });
});
