import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  apiFetch,
  getOccupancyReport, getRevenueReport, getBookingsReport,
  login, logout, getAuthMe, forgotPassword, resetPassword, changePassword, registerUser,
  getCamps, getCamp, saveCamp, deleteCamp,
  getProducts, saveProduct, deleteProduct,
  getRooms, saveRoom, deleteRoom,
  getRatePlans, saveRatePlan, deleteRatePlan,
  getOrders, getOrder, getOrderStatus, saveOrder, deleteOrder, bulkDeleteOrders, calculatePrice, getAvailability, updateOrderStatus,
  getPriceOverrides, setPriceOverrides, deletePriceOverride,
  getCategories, getCategory, saveCategory, deleteCategory,
  getMeals, getMeal, saveMeal, deleteMeal,
  getMealSchedules, createMealSchedule, deleteMealSchedule,
  getMealCategories, saveMealCategory, deleteMealCategory,
  getPlans, getPlan, savePlan, deletePlan,
  getMe, updateBranding,
  getTenants, getTenantsPublic, getAdminTenants, createTenant, updateAdminTenant, deleteAdminTenant,
  getAdmins, createAdminUser, deleteAdminUser, updateAdminUser,
  getAdminStats,
  bulkSuspendTenants, bulkActivateTenants, bulkDeleteTenants,
  saveLead, getLeads, updateLead, deleteLead,
  getInbox, markInboxRead, deleteInboxLead,
  createPaymentIntent, confirmPayment,
  posLogin, posGetDashboard, posGetProducts, posCreateProduct, posUpdateProduct, posDeleteProduct,
  posGetOrders, posGetOrder, posCreateOrder,
  posGetActiveShift, posOpenShift, posCloseShift,
  posGetCustomers, posGetInventory, posGetStaff, posGetReports,
  getLowStock,
} from '@/lib/api';

global.fetch = vi.fn();

function setTestHostname(hostname: string) {
  Object.defineProperty(window, 'location', {
    value: { hostname, origin: `https://${hostname}`, search: '' },
    writable: true,
  });
}

function mockFetch(jsonResponse: unknown, ok = true, contentType = 'application/json') {
  setTestHostname('test.sinaicamps.com');
  vi.mocked(fetch).mockClear();
  vi.mocked(fetch).mockResolvedValue({
    ok,
    status: ok ? 200 : 400,
    json: () => Promise.resolve(jsonResponse),
    headers: { get: () => contentType },
  } as Response);
}

function mockFetchNoTenant(jsonResponse: unknown, ok = true, contentType = 'application/json') {
  setTestHostname('localhost');
  vi.mocked(fetch).mockClear();
  vi.mocked(fetch).mockResolvedValue({
    ok,
    status: ok ? 200 : 400,
    json: () => Promise.resolve(jsonResponse),
    headers: { get: () => contentType },
  } as Response);
}

function mockFetchWithStatus(status: number, jsonResponse?: unknown) {
  vi.mocked(fetch).mockClear();
  vi.mocked(fetch).mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(jsonResponse ?? {}),
    headers: { get: () => 'application/json' },
  } as Response);
}

describe('report endpoints', () => {
  beforeEach(() => { localStorage.clear(); mockFetch({ data: [] }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('getOccupancyReport calls GET /reports/occupancy', async () => {
    await getOccupancyReport();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain('/reports/occupancy');
  });

  it('getRevenueReport with days param calls GET /reports/revenue?days=7', async () => {
    await getRevenueReport({ days: 7 });
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain('/reports/revenue?days=7');
  });

  it('getRevenueReport with start/end', async () => {
    await getRevenueReport({ start: '2026-01-01', end: '2026-01-31' });
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain('start=2026-01-01');
    expect(url).toContain('end=2026-01-31');
  });

  it('getBookingsReport without args', async () => {
    getBookingsReport();
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain('/reports/bookings');
  });

  it('getBookingsReport with days/start/end params', async () => {
    getBookingsReport({ days: 7, start: '2025-01-01', end: '2025-01-07' });
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain('/reports/bookings?days=7&start=2025-01-01&end=2025-01-07');
  });
});

describe('apiFetch core', () => {
  beforeEach(() => { localStorage.clear(); vi.mocked(fetch).mockClear(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('sets x-tenant-id and Authorization headers', async () => {
    localStorage.setItem('sinaicamps_token', 'my-token');
    localStorage.setItem('sinaicamps_tenant_id', 'tenant_42');
    setTestHostname('localhost');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
      headers: { get: () => 'application/json' },
    } as Response);
    await apiFetch('/test-endpoint');
    const [, opts] = vi.mocked(fetch).mock.calls[0];
    const headers = opts.headers as Record<string, string>;
    expect(headers['x-tenant-id']).toBe('tenant_42');
    expect(headers['Authorization']).toBe('Bearer my-token');
  });

  it('sends request body as-is without conversion', async () => {
    localStorage.setItem('sinaicamps_token', 'token');
    mockFetch({ success: true });
    await apiFetch('/test', {
      method: 'POST',
      body: JSON.stringify({ firstName: 'John', lastName: 'Doe' }),
    });
    const [, opts] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(opts.body as string);
    expect(body).toEqual({ firstName: 'John', lastName: 'Doe' });
  });

  it('leaves non-JSON body as-is', async () => {
    localStorage.setItem('sinaicamps_token', 'token');
    mockFetch({ success: true });
    await apiFetch('/test', { method: 'POST', body: 'raw string body' });
    const [, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.body).toBe('raw string body');
  });

  it('deduplicates concurrent GET requests', async () => {
    localStorage.setItem('sinaicamps_tenant_id', 't1');
    mockFetch({ data: 'result' });
    const [r1, r2] = await Promise.all([
      apiFetch('/dedup-test'),
      apiFetch('/dedup-test'),
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(r1).toEqual({ data: 'result' });
    expect(r2).toEqual({ data: 'result' });
  });

  it('returns response data as-is (wire is camelCase)', async () => {
    mockFetch({ userName: 'John', userEmail: 'john@test.com' });
    const result = await apiFetch('/user');
    expect(result).toEqual({ userName: 'John', userEmail: 'john@test.com' });
  });

  it('throws and clears session on 401', async () => {
    setTestHostname('localhost');
    localStorage.setItem('sinaicamps_token', 'bad-token');
    localStorage.setItem('sinaicamps_user', '{}');

    // Mock window.location.href for redirect
    const origLocation = window.location;
    delete (window as any).location;
    window.location = { ...origLocation, href: '' } as Location;

    mockFetchWithStatus(401);
    await expect(apiFetch('/secured')).rejects.toThrow('Unauthorized');
    expect(localStorage.getItem('sinaicamps_token')).toBeNull();
    expect(localStorage.getItem('sinaicamps_user')).toBeNull();
  });

  it('clears POS session on 401 for pos endpoints', async () => {
    setTestHostname('localhost');
    localStorage.setItem('pos_token', 'pos-token');
    localStorage.setItem('pos_user', '{"name":"x"}');

    vi.mocked(fetch).mockClear();
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({}),
      headers: { get: () => 'application/json' },
    } as Response);

    await expect(apiFetch('/pos/dashboard')).rejects.toThrow('Unauthorized');
    expect(localStorage.getItem('pos_token')).toBeNull();
    expect(localStorage.getItem('pos_user')).toBeNull();
  });

  it('falls back to empty body when error JSON parse fails', async () => {
    vi.mocked(fetch).mockClear();
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('bad json')),
      headers: { get: () => 'application/json' },
    } as Response);

    await expect(apiFetch('/bad')).rejects.toThrow('API error: 500');
  });

  it('throws for non-JSON error responses', async () => {
    mockFetch(null, false, 'text/html');
    await expect(apiFetch('/bad-response')).rejects.toThrow('non-JSON response');
  });

  it('throws with API error message from JSON error field', async () => {
    mockFetchWithStatus(400, { error: 'Invalid input' });
    await expect(apiFetch('/bad')).rejects.toThrow('Invalid input');
  });

  it('throws with API error message from message field', async () => {
    mockFetchWithStatus(400, { message: 'Not found' });
    await expect(apiFetch('/bad')).rejects.toThrow('Not found');
  });

  it('throws fallback status message when no error field', async () => {
    mockFetchWithStatus(500, {});
    await expect(apiFetch('/bad')).rejects.toThrow('API error: 500');
  });

  it('sets method to GET by default', async () => {
    mockFetch({});
    await apiFetch('/test');
    const [, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.method).toBeUndefined();
  });
});

describe('apiFetch silent refresh', () => {
  beforeEach(() => { localStorage.clear(); vi.mocked(fetch).mockClear(); });
  afterEach(() => { vi.restoreAllMocks(); });

  function mock401() {
    return {
      ok: false,
      status: 401,
      json: () => Promise.resolve({}),
      headers: { get: () => 'application/json' },
    } as Response;
  }

  it('silently refreshes and retries once on 401 with a valid refresh token', async () => {
    setTestHostname('localhost');
    localStorage.setItem('sinaicamps_token', 'expired-token');
    localStorage.setItem('sinaicamps_refresh_token', 'valid-refresh');

    vi.mocked(fetch)
      .mockResolvedValueOnce(mock401())
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, token: 'fresh-access', refreshToken: 'fresh-refresh' }),
        headers: { get: () => 'application/json' },
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'retried-ok' }),
        headers: { get: () => 'application/json' },
      } as Response);

    const result = await apiFetch('/secured');
    expect(fetch).toHaveBeenCalledTimes(3);

    const [refreshUrl, refreshOpts] = vi.mocked(fetch).mock.calls[1];
    expect(refreshUrl).toContain('/auth/refresh');
    expect((refreshOpts as RequestInit).method).toBe('POST');
    const refreshBody = JSON.parse((refreshOpts as RequestInit).body as string);
    expect(refreshBody.refreshToken).toBe('valid-refresh');

    const [, retryOpts] = vi.mocked(fetch).mock.calls[2];
    const headers = (retryOpts as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer fresh-access');

    expect(localStorage.getItem('sinaicamps_token')).toBe('fresh-access');
    expect(localStorage.getItem('sinaicamps_refresh_token')).toBe('fresh-refresh');
    expect(result).toEqual({ data: 'retried-ok' });
  });

  it('throws and clears session on 401 when no refresh token exists', async () => {
    setTestHostname('localhost');
    localStorage.setItem('sinaicamps_token', 'bad-token');
    localStorage.setItem('sinaicamps_user', '{}');
    mockFetchWithStatus(401);

    await expect(apiFetch('/secured')).rejects.toThrow('Unauthorized');
    expect(fetch).toHaveBeenCalledTimes(1); // no refresh attempt
    expect(localStorage.getItem('sinaicamps_token')).toBeNull();
    expect(localStorage.getItem('sinaicamps_user')).toBeNull();
  });

  it('throws and clears all keys when the refresh call fails', async () => {
    setTestHostname('localhost');
    localStorage.setItem('sinaicamps_token', 'bad-token');
    localStorage.setItem('sinaicamps_refresh_token', 'bad-refresh');
    localStorage.setItem('sinaicamps_user', '{}');

    vi.mocked(fetch)
      .mockResolvedValueOnce(mock401())
      .mockResolvedValueOnce(mock401());

    await expect(apiFetch('/secured')).rejects.toThrow('Unauthorized');
    expect(fetch).toHaveBeenCalledTimes(2); // original + refresh attempt
    expect(localStorage.getItem('sinaicamps_token')).toBeNull();
    expect(localStorage.getItem('sinaicamps_refresh_token')).toBeNull();
    expect(localStorage.getItem('sinaicamps_user')).toBeNull();
  });

  it('does not retry when the refresh endpoint itself returns 401', async () => {
    setTestHostname('localhost');
    localStorage.setItem('sinaicamps_refresh_token', 'bad-refresh');
    vi.mocked(fetch).mockResolvedValue(mock401());

    await expect(
      apiFetch('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: 'bad-refresh' }) }),
    ).rejects.toThrow('Unauthorized');
    expect(fetch).toHaveBeenCalledTimes(1); // no infinite loop
  });

  it('shares a single refresh call across concurrent 401s', async () => {
    setTestHostname('localhost');
    localStorage.setItem('sinaicamps_token', 'expired-token');
    localStorage.setItem('sinaicamps_refresh_token', 'valid-refresh');

    vi.mocked(fetch)
      .mockResolvedValueOnce(mock401())                       // /a original
      .mockResolvedValueOnce(mock401())                       // /b original
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, token: 'fresh-access', refreshToken: 'fresh-refresh' }),
        headers: { get: () => 'application/json' },
      } as Response)                                          // single refresh
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'a' }),
        headers: { get: () => 'application/json' },
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'b' }),
        headers: { get: () => 'application/json' },
      } as Response);

    const [r1, r2] = await Promise.all([apiFetch('/a'), apiFetch('/b')]);
    const refreshCalls = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes('/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
    expect(r1).toEqual({ data: 'a' });
    expect(r2).toEqual({ data: 'b' });
  });
});

describe('auth endpoints', () => {
  beforeEach(() => { setTestHostname('localhost'); localStorage.clear(); mockFetchNoTenant({ token: 'abc', user: {} }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('login sends POST /auth/login', async () => {
    const res = await login('test@test.com', 'pass', 'tenant_1');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain('/auth/login');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body as string);
    expect(body).toEqual({ email: 'test@test.com', password: 'pass', tenantId: 'tenant_1' });
  });

  it('logout sends POST /auth/logout', async () => {
    await logout();
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain('/auth/logout');
    expect(opts.method).toBe('POST');
  });

  it('getAuthMe sends GET /auth/me', async () => {
    await getAuthMe();
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain('/auth/me');
  });

  it('forgotPassword sends POST /auth/forgot-password', async () => {
    await forgotPassword('user@test.com');
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain('/auth/forgot-password');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body as string);
    expect(body).toEqual({ email: 'user@test.com' });
  });

  it('resetPassword sends POST /auth/reset-password', async () => {
    await resetPassword('reset-token', 'newPass123');
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain('/auth/reset-password');
    const body = JSON.parse(opts.body as string);
    expect(body).toEqual({ token: 'reset-token', password: 'newPass123' });
  });

  it('changePassword sends POST /auth/change-password', async () => {
    await changePassword('oldPass', 'newPass');
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain('/auth/change-password');
    const body = JSON.parse(opts.body as string);
    expect(body).toEqual({ currentPassword: 'oldPass', newPassword: 'newPass' });
  });

  it('registerUser sends POST /auth/register', async () => {
    await registerUser({ name: 'John', email: 'j@test.com', password: 'pass', tenantId: 't1' });
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain('/auth/register');
    const body = JSON.parse(opts.body as string);
    expect(body).toEqual({ name: 'John', email: 'j@test.com', password: 'pass', tenantId: 't1' });
  });
});

describe('camp endpoints', () => {
  beforeEach(() => { localStorage.clear(); mockFetch([{ id: 1, name: 'Camp A' }]); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('getCamps sends GET /camps', async () => {
    const data = await getCamps();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/camps'), expect.any(Object));
  });

  it('getCamp sends GET /camps/5', async () => {
    await getCamp(5);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/camps/5'), expect.any(Object));
  });

  it('saveCamp with editId sends PUT /camps/5', async () => {
    await saveCamp({ name: 'Updated' }, 5);
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.method).toBe('PUT');
    expect(url).toContain('/camps/5');
  });

  it('saveCamp without editId sends POST /camps', async () => {
    await saveCamp({ name: 'New Camp' });
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(url).toContain('/camps');
  });

  it('deleteCamp sends DELETE /camps/3', async () => {
    await deleteCamp(3);
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.method).toBe('DELETE');
    expect(url).toContain('/camps/3');
  });
});

describe('product endpoints', () => {
  beforeEach(() => { mockFetch([]); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('getProducts sends GET /products', async () => {
    await getProducts();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/products'), expect.any(Object));
  });

  it('saveProduct with editId PUT /products/2', async () => {
    await saveProduct({ name: 'Deluxe' }, 2);
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.method).toBe('PUT');
    expect(url).toContain('/products/2');
  });

  it('saveProduct without editId POST /products', async () => {
    await saveProduct({ name: 'Std' });
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(url).toContain('/products');
  });

  it('deleteProduct DELETE /products/7', async () => {
    await deleteProduct(7);
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.method).toBe('DELETE');
    expect(url).toContain('/products/7');
  });
});

describe('room endpoints', () => {
  beforeEach(() => { mockFetch([]); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('getRooms GET /rooms', async () => {
    await getRooms();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/rooms'), expect.any(Object));
  });

  it('saveRoom with editId PUT /rooms/1', async () => {
    await saveRoom({ name: 'R1' }, 1);
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.method).toBe('PUT');
    expect(url).toContain('/rooms/1');
  });

  it('saveRoom without editId POST /rooms', async () => {
    await saveRoom({ name: 'R2' });
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(url).toContain('/rooms');
  });

  it('deleteRoom DELETE /rooms/4', async () => {
    await deleteRoom(4);
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.method).toBe('DELETE');
    expect(url).toContain('/rooms/4');
  });
});

describe('rate plan endpoints', () => {
  beforeEach(() => { mockFetch([]); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('getRatePlans GET /rateplans', async () => {
    await getRatePlans();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/rateplans'), expect.any(Object));
  });

  it('saveRatePlan with editId PUT /rateplans/1', async () => {
    await saveRatePlan({ name: 'Summer' }, 1);
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.method).toBe('PUT');
    expect(url).toContain('/rateplans/1');
  });

  it('saveRatePlan without editId POST /rateplans', async () => {
    await saveRatePlan({ name: 'Winter' });
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(url).toContain('/rateplans');
  });

  it('deleteRatePlan DELETE /rateplans/2', async () => {
    await deleteRatePlan(2);
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.method).toBe('DELETE');
    expect(url).toContain('/rateplans/2');
  });
});

describe('order endpoints', () => {
  beforeEach(() => { mockFetch({ data: [], total: 0 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('getOrders GET /orders', async () => {
    await getOrders();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/orders'), expect.any(Object));
  });

  it('getOrders with params adds query string', async () => {
    await getOrders({ status: 'active', camp_id: '5' });
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain('status=active');
    expect(url).toContain('camp_id=5');
  });

  it('getOrder GET /orders/10', async () => {
    await getOrder(10);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/orders/10'), expect.any(Object));
  });

  it('getOrderStatus GET /orders/status/REF-001', async () => {
    await getOrderStatus('REF-001');
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/orders/status/REF-001'), expect.any(Object));
  });

  it('saveOrder with editId PUT /orders/6', async () => {
    await saveOrder({ numberOfPeople: 3 }, 6);
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.method).toBe('PUT');
    expect(url).toContain('/orders/6');
  });

  it('saveOrder without editId POST /orders', async () => {
    await saveOrder({ numberOfPeople: 2 });
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(url).toContain('/orders');
  });

  it('updateOrderStatus PATCH /orders/7/status', async () => {
    await updateOrderStatus(7, 'confirmed');
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.method).toBe('PATCH');
    expect(url).toContain('/orders/7/status');
    const body = JSON.parse(opts.body as string);
    expect(body).toEqual({ status: 'confirmed' });
  });

  it('deleteOrder DELETE /orders/20', async () => {
    await deleteOrder(20);
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.method).toBe('DELETE');
    expect(url).toContain('/orders/20');
  });

  it('bulkDeleteOrders POST /orders/bulk-delete', async () => {
    await bulkDeleteOrders(['10', '20']);
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(url).toContain('/orders/bulk-delete');
    const body = JSON.parse(opts.body as string);
    expect(body).toEqual({ ids: ['10', '20'] });
  });

  it('calculatePrice with room/check in/out', async () => {
    mockFetch({ totalPrice: 500 });
    const price = await calculatePrice(1, '2026-01-01', '2026-01-05');
    expect(price).toEqual({ totalPrice: 500 });
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain('roomId=1');
    expect(url).toContain('checkIn=2026-01-01');
    expect(url).toContain('checkOut=2026-01-05');
  });

  it('getAvailability with params', async () => {
    await getAvailability({ checkIn: '2026-01-01', checkOut: '2026-01-05' });
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain('/availability?');
    expect(url).toContain('checkIn=2026-01-01');
  });
});

describe('price override endpoints', () => {
  beforeEach(() => { mockFetch({ overrides: [] }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('getPriceOverrides GET /price-overrides with productId + window', async () => {
    await getPriceOverrides({ productId: 'p1', from: '2026-01-01', to: '2026-01-31' });
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain('/price-overrides?');
    expect(url).toContain('productId=p1');
    expect(url).toContain('from=2026-01-01');
    expect(url).toContain('to=2026-01-31');
  });

  it('getPriceOverrides omits empty optional params', async () => {
    await getPriceOverrides({ productId: 'p1' });
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain('/price-overrides?productId=p1');
    expect(url).not.toContain('from=');
    expect(url).not.toContain('to=');
  });

  it('setPriceOverrides PUT /price-overrides with JSON body', async () => {
    mockFetch({ success: true, productId: 'p1', count: 1 });
    const res = await setPriceOverrides({ productId: 'p1', overrides: [{ date: '2026-01-01', price: 120 }] });
    expect(res).toEqual({ success: true, productId: 'p1', count: 1 });
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.method).toBe('PUT');
    expect(url).toContain('/price-overrides');
    expect(JSON.parse(opts.body as string)).toEqual({ productId: 'p1', overrides: [{ date: '2026-01-01', price: 120 }] });
  });

  it('deletePriceOverride DELETE /price-overrides with encoded product + date', async () => {
    await deletePriceOverride('p1', '2026-01-01');
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.method).toBe('DELETE');
    expect(url).toContain('/price-overrides?productId=p1&date=2026-01-01');
  });
});

describe('category endpoints', () => {
  beforeEach(() => { mockFetch([]); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('getCategories GET /categories', async () => {
    await getCategories();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/categories'), expect.any(Object));
  });

  it('getCategory GET /categories/5', async () => {
    await getCategory(5);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/categories/5'), expect.any(Object));
  });

  it('saveCategory PUT /categories/1', async () => {
    await saveCategory({ name: 'Cat' }, 1);
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.method).toBe('PUT');
    expect(url).toContain('/categories/1');
  });

  it('saveCategory POST /categories', async () => {
    await saveCategory({ name: 'New' });
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(url).toContain('/categories');
  });

  it('deleteCategory DELETE /categories/3', async () => {
    await deleteCategory(3);
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.method).toBe('DELETE');
    expect(url).toContain('/categories/3');
  });
});

describe('meal endpoints', () => {
  beforeEach(() => { mockFetch([]); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('getMeals GET /meals', async () => {
    await getMeals();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/meals'), expect.any(Object));
  });

  it('getMeal GET /meals/2', async () => {
    await getMeal(2);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/meals/2'), expect.any(Object));
  });

  it('saveMeal PUT /meals/1', async () => {
    await saveMeal({ name: 'Breakfast' }, 1);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/meals/1'), expect.objectContaining({ method: 'PUT' }));
  });

  it('saveMeal POST /meals', async () => {
    await saveMeal({ name: 'Lunch' });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/meals'), expect.objectContaining({ method: 'POST' }));
  });

  it('deleteMeal DELETE /meals/3', async () => {
    await deleteMeal(3);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/meals/3'), expect.objectContaining({ method: 'DELETE' }));
  });
});

describe('meal schedule endpoints', () => {
  beforeEach(() => { mockFetch([]); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('getMealSchedules GET /meal-schedules', async () => {
    await getMealSchedules();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/meal-schedules'), expect.any(Object));
  });

  it('getMealSchedules with params', async () => {
    await getMealSchedules({ campId: '1', date: '2026-01-01' });
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain('campId=1');
    expect(url).toContain('date=2026-01-01');
  });

  it('createMealSchedule POST /meal-schedules', async () => {
    await createMealSchedule({ campId: '1', date: '2026-01-01', mealId: 'm1', packageType: 'standard', maxServings: 10 });
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(url).toContain('/meal-schedules');
  });

  it('deleteMealSchedule DELETE /meal-schedules/s1', async () => {
    await deleteMealSchedule('s1');
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/meal-schedules/s1'), expect.objectContaining({ method: 'DELETE' }));
  });
});

describe('meal category endpoints', () => {
  beforeEach(() => { mockFetch([]); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('getMealCategories GET /meal-categories', async () => {
    await getMealCategories();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/meal-categories'), expect.any(Object));
  });

  it('saveMealCategory PUT /meal-categories/1', async () => {
    await saveMealCategory({ name: 'Hot' }, 1);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/meal-categories/1'), expect.objectContaining({ method: 'PUT' }));
  });

  it('saveMealCategory POST /meal-categories', async () => {
    await saveMealCategory({ name: 'Cold' });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/meal-categories'), expect.objectContaining({ method: 'POST' }));
  });

  it('deleteMealCategory DELETE /meal-categories/2', async () => {
    await deleteMealCategory(2);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/meal-categories/2'), expect.objectContaining({ method: 'DELETE' }));
  });
});

describe('plan endpoints', () => {
  beforeEach(() => { mockFetch([]); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('getPlans GET /plans', async () => {
    await getPlans();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/plans'), expect.any(Object));
  });

  it('getPlan GET /plans/3', async () => {
    await getPlan(3);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/plans/3'), expect.any(Object));
  });

  it('savePlan PUT /plans/1', async () => {
    await savePlan({ name: 'Plan A' }, 1);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/plans/1'), expect.objectContaining({ method: 'PUT' }));
  });

  it('savePlan POST /plans', async () => {
    await savePlan({ name: 'Plan B' });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/plans'), expect.objectContaining({ method: 'POST' }));
  });

  it('deletePlan DELETE /plans/2', async () => {
    await deletePlan(2);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/plans/2'), expect.objectContaining({ method: 'DELETE' }));
  });
});

describe('settings endpoints', () => {
  beforeEach(() => { mockFetch({ name: 'Camp' }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('getMe GET /me', async () => {
    await getMe();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/me'), expect.any(Object));
  });

  it('updateBranding PATCH /me', async () => {
    await updateBranding({ name: 'New Camp', primaryColor: '#ff6600' });
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.method).toBe('PATCH');
    expect(url).toContain('/me');
    const body = JSON.parse(opts.body as string);
    expect(body).toHaveProperty('name');
    expect(body).toHaveProperty('primaryColor');
  });
});

describe('tenant endpoints', () => {
  beforeEach(() => { mockFetch([]); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('getTenants GET /tenants', async () => {
    await getTenants();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/tenants'), expect.any(Object));
  });

  it('getAdminTenants GET /admin/tenants (T6 paginated)', async () => {
    await getAdminTenants();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/admin/tenants'), expect.any(Object));
  });

  it('getAdminTenants with params adds query string', async () => {
    await getAdminTenants({ page: '2', pageSize: '25' });
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain('page=2');
    expect(url).toContain('pageSize=25');
  });

  it('getTenantsPublic GET /tenants/public', async () => {
    await getTenantsPublic();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/tenants/public'), expect.any(Object));
  });

  it('createTenant POST /tenants', async () => {
    await createTenant({ tenantName: 'New', subdomain: 'newcamp' });
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(url).toContain('/tenants');
  });
});

describe('super admin endpoints', () => {
  beforeEach(() => { mockFetch({}); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('getAdminStats GET /admin/stats', async () => {
    await getAdminStats();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/admin/stats'), expect.any(Object));
  });

  it('updateAdminTenant PATCH /admin/tenants/5', async () => {
    await updateAdminTenant(5, { name: 'Updated' });
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.method).toBe('PATCH');
    expect(url).toContain('/admin/tenants/5');
  });

  it('deleteAdminTenant DELETE /admin/tenants/3', async () => {
    await deleteAdminTenant(3);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/admin/tenants/3'), expect.objectContaining({ method: 'DELETE' }));
  });

  it('getAdmins GET /admin/admins', async () => {
    await getAdmins();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/admin/admins'), expect.any(Object));
  });

  it('createAdminUser POST /admin/admins', async () => {
    await createAdminUser({ email: 'a@b.com', password: 'pass', role: 'admin' });
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(url).toContain('/admin/admins');
  });

  it('deleteAdminUser DELETE /admin/admins/7', async () => {
    await deleteAdminUser(7);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/admin/admins/7'), expect.objectContaining({ method: 'DELETE' }));
  });

  it('updateAdminUser PATCH /admin/admins/2', async () => {
    await updateAdminUser(2, { role: 'super_admin' });
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.method).toBe('PATCH');
    expect(url).toContain('/admin/admins/2');
  });
});

describe('bulk tenant actions', () => {
  beforeEach(() => { mockFetch({}); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('bulkSuspendTenants POST /admin/tenants/bulk/suspend', async () => {
    await bulkSuspendTenants(['1', '2']);
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1].body as string);
    expect(body).toEqual({ ids: ['1', '2'] });
  });

  it('bulkActivateTenants POST /admin/tenants/bulk/activate', async () => {
    await bulkActivateTenants(['3']);
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1].body as string);
    expect(body).toEqual({ ids: ['3'] });
  });

  it('bulkDeleteTenants POST /admin/tenants/bulk/delete', async () => {
    await bulkDeleteTenants(['1', '2', '3']);
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1].body as string);
    expect(body).toEqual({ ids: ['1', '2', '3'] });
  });
});

describe('lead endpoints', () => {
  beforeEach(() => { mockFetch([]); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('saveLead POST /leads', async () => {
    await saveLead({ name: 'John', email: 'j@t.com' });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/leads'), expect.objectContaining({ method: 'POST' }));
  });

  it('getLeads GET /leads', async () => {
    await getLeads();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/leads'), expect.any(Object));
  });

  it('updateLead PUT /leads/l1', async () => {
    await updateLead('l1', { status: 'contacted' });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/leads/l1'), expect.objectContaining({ method: 'PUT' }));
  });

  it('deleteLead DELETE /leads/l2', async () => {
    await deleteLead('l2');
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/leads/l2'), expect.objectContaining({ method: 'DELETE' }));
  });
});

describe('payment endpoints', () => {
  beforeEach(() => { mockFetch({}); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('createPaymentIntent POST /payments/create-intent', async () => {
    await createPaymentIntent({ orderId: 'o1', amount: 5000 });
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(url).toContain('/payments/create-intent');
  });

  it('confirmPayment POST /payments/confirm', async () => {
    await confirmPayment({ paymentIntentId: 'pi_1', orderId: 'o2' });
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(url).toContain('/payments/confirm');
  });
});

describe('POS endpoints', () => {
  beforeEach(() => { mockFetch({}); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('posLogin POST /pos/auth/login', async () => {
    await posLogin('user', 'pass');
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(url).toContain('/pos/auth/login');
  });

  it('posGetDashboard GET /pos/dashboard', async () => {
    await posGetDashboard();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/pos/dashboard'), expect.any(Object));
  });

  it('posGetProducts GET /pos/products', async () => {
    await posGetProducts();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/pos/products'), expect.any(Object));
  });

  it('posCreateProduct POST /pos/products', async () => {
    await posCreateProduct({ name: 'Burger', price: 10 });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/pos/products'), expect.objectContaining({ method: 'POST' }));
  });

  it('posUpdateProduct PUT /pos/products/1', async () => {
    await posUpdateProduct(1, { price: 12 });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/pos/products/1'), expect.objectContaining({ method: 'PUT' }));
  });

  it('posDeleteProduct DELETE /pos/products/2', async () => {
    await posDeleteProduct(2);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/pos/products/2'), expect.objectContaining({ method: 'DELETE' }));
  });

  it('posGetOrders GET /pos/orders', async () => {
    await posGetOrders();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/pos/orders'), expect.any(Object));
  });

  it('posGetOrder GET /pos/orders/5', async () => {
    await posGetOrder(5);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/pos/orders/5'), expect.any(Object));
  });

  it('posCreateOrder POST /pos/orders', async () => {
    await posCreateOrder({ items: [{ id: 1, qty: 2 }] });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/pos/orders'), expect.objectContaining({ method: 'POST' }));
  });

  it('posGetActiveShift GET /pos/shifts/active', async () => {
    await posGetActiveShift();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/pos/shifts/active'), expect.any(Object));
  });

  it('posOpenShift POST /pos/shifts/open', async () => {
    await posOpenShift({ openingCash: 100 });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/pos/shifts/open'), expect.objectContaining({ method: 'POST' }));
  });

  it('posCloseShift POST /pos/shifts/close', async () => {
    await posCloseShift({ closingCash: 200 });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/pos/shifts/close'), expect.objectContaining({ method: 'POST' }));
  });

  it('posGetCustomers GET /pos/customers', async () => {
    await posGetCustomers();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/pos/customers'), expect.any(Object));
  });

  it('posGetInventory GET /pos/inventory', async () => {
    await posGetInventory();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/pos/inventory'), expect.any(Object));
  });

  it('posGetStaff GET /pos/staff', async () => {
    await posGetStaff();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/pos/staff'), expect.any(Object));
  });

  it('posGetReports GET /pos/reports', async () => {
    await posGetReports();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/pos/reports'), expect.any(Object));
  });

  it('getLowStock GET /inventory/low-stock', async () => {
    await getLowStock();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/inventory/low-stock'), expect.any(Object));
  });

  it('getLowStock passes pagination params', async () => {
    await getLowStock({ page: '2', pageSize: '50' });
    const called = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(called).toContain('/inventory/low-stock');
    expect(called).toContain('page=2');
    expect(called).toContain('pageSize=50');
  });
});

describe('inbox endpoints', () => {
  beforeEach(() => { mockFetch({}); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('getInbox GET /inbox without params', async () => {
    await getInbox();
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain('/inbox');
    expect(opts.method).toBeUndefined();
  });

  it('getInbox passes kind/page/pageSize query params', async () => {
    await getInbox({ kind: 'lead', page: '2', pageSize: '20' });
    const called = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(called).toContain('/inbox?');
    expect(called).toContain('kind=lead');
    expect(called).toContain('page=2');
    expect(called).toContain('pageSize=20');
  });

  it('markInboxRead PATCH /inbox/read with lead body', async () => {
    await markInboxRead('lead', 'l1');
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain('/inbox/read');
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body as string)).toEqual({ kind: 'lead', id: 'l1' });
  });

  it('markInboxRead PATCH with booking body', async () => {
    await markInboxRead('booking', 'b9');
    const [, opts] = vi.mocked(fetch).mock.calls[0];
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body as string)).toEqual({ kind: 'booking', id: 'b9' });
  });

  it('deleteInboxLead DELETE /inbox/lead/:id (URL-encoded)', async () => {
    await deleteInboxLead('lead/42');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/inbox/lead/lead%2F42'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
