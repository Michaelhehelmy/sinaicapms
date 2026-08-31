import { describe, it, expect, vi, beforeEach } from 'vitest';
import reportsRoutes from '../src/api/reports.js';
import { mountRouter } from './helpers/routerHarness.js';

const superAdmin = { id: 'adm1', role: 'super_admin' };

function mount(scope = { user: superAdmin, tenantId: 'tee1' }) {
  return mountRouter(reportsRoutes, { basePath: '/api/reports', ...scope });
}

/**
 * Mock DB whose `.all()` returns each element of `results` in call order.
 */
function seqDb(resultsArr) {
  let call = 0;
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn().mockReturnThis(),
      all: vi.fn(() => Promise.resolve({ results: resultsArr[Math.min(call++, resultsArr.length - 1)] ?? [] })),
    })),
  };
}

describe('reportsRoutes', () => {
  let env;

  beforeEach(() => {
    env = { DB: null };
  });

  const get = async (url, db) => {
    env.DB = db;
    const app = mount();
    return app.request(`http://localhost${url}`, { method: 'GET' }, env);
  };

  // ─── occupancy ─────────────────────────────────────────────
  it('GET /occupancy computes rate', async () => {
    const res = await get('/api/reports/occupancy', seqDb([
      [{ count: 10 }],   // total rooms
      [{ count: 5 }],    // occupied
    ]));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.totalRooms).toBe(10);
    expect(body.occupiedRooms).toBe(5);
    expect(body.occupancyRate).toBe(50);
  });

  it('GET /occupancy handles zero rooms', async () => {
    const res = await get('/api/reports/occupancy', seqDb([[{ count: 0 }], [{ count: 0 }]]));
    const body = await res.json();
    expect(body.occupancyRate).toBe(0);
  });

  it('GET /occupancy returns 400 on error', async () => {
    const res = await get('/api/reports/occupancy', {
      prepare: vi.fn(() => { throw new Error('db'); }),
    });
    expect(res.status).toBe(400);
  });

  // ─── revenue ───────────────────────────────────────────────
  it('GET /revenue uses start/end params', async () => {
    const res = await get('/api/reports/revenue?start=2026-01-01&end=2026-01-31', seqDb([
      [{ date: '2026-01-01', total: 100, count: 2 }], // dailyRevenue
      [{ total_revenue: 100, total_collected: 50, total_outstanding: 50, total_orders: 2 }], // summary
    ]));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.start).toBe('2026-01-01');
    expect(body.end).toBe('2026-01-31');
    expect(body.summary.totalRevenue).toBe(100);
    expect(body.details[0].date).toBe('2026-01-01');
  });

  it('GET /revenue defaults to days param', async () => {
    const res = await get('/api/reports/revenue?days=7', seqDb([[], []]));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(typeof body.start).toBe('string');
  });

  it('GET /revenue returns 400 on error', async () => {
    const res = await get('/api/reports/revenue', {
      prepare: vi.fn(() => { throw new Error('db'); }),
    });
    expect(res.status).toBe(400);
  });

  // ─── bookings ──────────────────────────────────────────────
  it('GET /bookings returns by_state and by_camp', async () => {
    const res = await get('/api/reports/bookings?start=2026-01-01&end=2026-01-31', seqDb([
      [{ state: 'Confirmed', count: 3 }],
      [{ camp_name: 'Acacia', count: 3, revenue: 500 }],
    ]));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.byState[0].state).toBe('Confirmed');
    expect(body.byCamp[0].campName).toBe('Acacia');
  });

  it('GET /bookings returns 400 on error', async () => {
    const res = await get('/api/reports/bookings', {
      prepare: vi.fn(() => { throw new Error('db'); }),
    });
    expect(res.status).toBe(400);
  });

  // ─── top-products ──────────────────────────────────────────
  it('GET /top-products returns ranking', async () => {
    const res = await get('/api/reports/top-products?days=30&limit=5', seqDb([
      [{ id: 'p1', name: 'Tent', total_qty: 10, total_revenue: 500, order_count: 4 }],
    ]));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.days).toBe(30);
    expect(body.topProducts[0].name).toBe('Tent');
  });

  it('GET /top-products returns 400 on error', async () => {
    const res = await get('/api/reports/top-products', {
      prepare: vi.fn(() => { throw new Error('db'); }),
    });
    expect(res.status).toBe(400);
  });

  // ─── kitchen-performance ───────────────────────────────────
  it('GET /kitchen-performance returns status breakdown and trend', async () => {
    const res = await get('/api/reports/kitchen-performance?days=7', seqDb([
      [{ status: 'completed', count: 5 }],
      [{ date: '2026-01-01', completed: 5, ready: 2, pending: 1, total: 8 }],
    ]));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.byStatus[0].status).toBe('completed');
    expect(body.dailyTrend[0].date).toBe('2026-01-01');
  });

  it('GET /kitchen-performance returns 400 on error', async () => {
    const res = await get('/api/reports/kitchen-performance', {
      prepare: vi.fn(() => { throw new Error('db'); }),
    });
    expect(res.status).toBe(400);
  });

  // ─── low-stock ─────────────────────────────────────────────
  it('GET /low-stock returns low stock items', async () => {
    const res = await get('/api/reports/low-stock', seqDb([
      [{ id: 'p1', name: 'Water', stock_quantity: 2, min_stock_level: 10, unit: 'pcs', status: 'low' }],
    ]));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.lowStock[0].status).toBe('low');
  });

  it('GET /low-stock returns 400 on error', async () => {
    const res = await get('/api/reports/low-stock', {
      prepare: vi.fn(() => { throw new Error('db'); }),
    });
    expect(res.status).toBe(400);
  });

  // ─── revenue-breakdown ─────────────────────────────────────
  it('GET /revenue-breakdown aggregates by type, payment, accommodation', async () => {
    const res = await get('/api/reports/revenue-breakdown?days=30', seqDb([
      [{ type: 'product', revenue: 100, order_count: 2 }],          // byProductType
      [{ method: 'cash', revenue: 80, count: 2 }],                   // byPayment
      [{ revenue: 500, order_count: 3 }],                            // accommodation
    ]));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.byProductType[0].type).toBe('product');
    expect(body.byPaymentMethod[0].method).toBe('cash');
    expect(body.accommodation.revenue).toBe(500);
  });

  it('GET /revenue-breakdown returns 400 on error', async () => {
    const res = await get('/api/reports/revenue-breakdown', {
      prepare: vi.fn(() => { throw new Error('db'); }),
    });
    expect(res.status).toBe(400);
  });

  // ─── customer-metrics ──────────────────────────────────────
  it('GET /customer-metrics returns customer stats', async () => {
    const res = await get('/api/reports/customer-metrics?days=30', seqDb([
      [{ count: 50 }],   // total
      [{ count: 10 }],   // new
      [{ count: 5 }],    // repeat
      [{ avg_order_value: 80, avg_collected: 60 }], // aov
    ]));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.totalCustomers).toBe(50);
    expect(body.newCustomers).toBe(10);
    expect(body.repeatCustomers).toBe(5);
    expect(body.avgOrderValue).toBe(80);
  });

  it('GET /customer-metrics returns 400 on error', async () => {
    const res = await get('/api/reports/customer-metrics', {
      prepare: vi.fn(() => { throw new Error('db'); }),
    });
    expect(res.status).toBe(400);
  });

  // ─── seasonal ──────────────────────────────────────────────
  it('GET /seasonal returns accommodation + POS monthly', async () => {
    const res = await get('/api/reports/seasonal', seqDb([
      [{ month: '2026-01', revenue: 100, order_count: 2 }],
      [{ month: '2026-01', revenue: 50, tx_count: 3 }],
    ]));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.accommodationMonthly[0].month).toBe('2026-01');
    expect(body.posMonthly[0].txCount).toBe(3);
  });

  it('GET /seasonal returns 400 on error', async () => {
    const res = await get('/api/reports/seasonal', {
      prepare: vi.fn(() => { throw new Error('db'); }),
    });
    expect(res.status).toBe(400);
  });

  // ─── guards ────────────────────────────────────────────────
  it('returns 405 for non-GET', async () => {
    env.DB = seqDb([]);
    const app = mount();
    const res = await app.request('http://localhost/api/reports/occupancy', { method: 'POST' }, env);
    expect(res.status).toBe(405);
  });

  it('returns 404 for unknown report type', async () => {
    env.DB = seqDb([]);
    const app = mount();
    const res = await app.request('http://localhost/api/reports/bogus', { method: 'GET' }, env);
    expect(res.status).toBe(404);
  });
});
