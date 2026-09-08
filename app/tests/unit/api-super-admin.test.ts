/**
 * Coverage tests for api.ts lines 1830–2491:
 * TenantPayouts, HR, Supply Chain, CRM, Storefront, AI, Super Admin,
 * Marketplace Payouts, Admin Settings/Subscriptions/Reports/Performance.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getTenantPayouts,
  processPayment,
  confirmFinancialPayment,
  deleteProjectLink,
  getProjectMealPlans,
  getHrEmployees,
  createHrEmployee,
  updateHrEmployee,
  deleteHrEmployee,
  getHrLeaveTypes,
  createHrLeaveType,
  getHrLeaveRequests,
  createHrLeaveRequest,
  approveHrLeaveRequest,
  getHrPayrollRuns,
  createHrPayrollRun,
  postHrPayrollRun,
  getHrJobPosts,
  createHrJobPost,
  createHrApplicant,
  getSupplyWarehouses,
  getSupplyStock,
  getSupplyTransfers,
  getSupplyPurchaseOrders,
  getSupplyBoms,
  getSupplyManufacturingOrders,
  getCrmContacts,
  getCrmLeads,
  getCrmOpportunities,
  getCrmTasks,
  getCrmTickets,
  getCrmKnowledgeArticles,
  getStorefrontProducts,
  getStorefrontProduct,
  getStorefrontCart,
  addToStorefrontCart,
  updateStorefrontCartItem,
  removeStorefrontCartItem,
  checkoutStorefront,
  getStorefrontOrders,
  getStorefrontPages,
  deleteStorefrontPage,
  getStorefrontBlogPosts,
  deleteStorefrontBlogPost,
  getAiPredictions,
  createAiPrediction,
  getAiDynamicPrice,
  getAiAnomaly,
  getAiPriceRules,
  getAiAutomationRules,
  toggleAiAutomationRule,
  getAiAutomationLogs,
  analyzeWithWorkersAI,
  generateEmbeddings,
  getDurableStateSessions,
  syncDurableState,
  getDurableStateValue,
  getSuperFinancialsOverview,
  getSuperInvoices,
  getAdminPublicPayments,
  getAdminPayoutEligible,
  getAdminPayouts,
  getAdminPayout,
  createAdminPayout,
  markAdminPayoutPaid,
  cancelAdminPayout,
  getSuperHROverview,
  getSuperEmployees,
  getSuperSupplyOverview,
  getSuperPurchaseOrders,
  getSuperCRMOverview,
  getSuperContacts,
  getSuperOpportunities,
  getSuperStorefrontOverview,
  getSuperStorefrontProducts,
  getSuperAIOverview,
  getSuperPredictions,
  request,
  saveStorefrontPage,
  saveStorefrontBlogPost,
  saveStorefrontBlogCategory,
  deleteStorefrontBlogCategory,
  getStorefrontBlogCategories,
  updateAIPriceRule,
  createAIPriceRule,
  deleteAIPriceRule,
  updateAIAutomationRule,
  createAIAutomationRule,
  toggleAIAutomationRule,
  runAIForecast,
  getAdminSettings,
  updateAdminSettings,
  updateAdminSubscription,
  cancelAdminSubscription,
  resumeAdminSubscription,
  generateAdminReport,
  createAdminScheduledReport,
  deleteAdminScheduledReport,
  exportAdminPerformance,
  updateKitchenStatus,
  getProjectItems,
  saveProjectItem,
  deleteProjectItem,
  getProjectLinks,
  createProjectLink,
  getTenantBilling,
  createPublicReservation,
  getPosTables,
  createPosTable,
  updatePosTable,
  updatePosTableStatus,
  deletePosTable,
} from '@/lib/api';

global.fetch = vi.fn();

function mockFetch(data: unknown = { ok: true }, ok = true) {
  vi.mocked(fetch).mockClear();
  vi.mocked(fetch).mockResolvedValue({
    ok,
    status: ok ? 200 : 400,
    json: () => Promise.resolve(data),
    blob: () => Promise.resolve(new Blob([JSON.stringify(data)], { type: 'text/csv' })),
    headers: { get: () => 'application/json' },
  } as unknown as Response);
}

function mockFetchNotFound() {
  mockFetch({ error: 'not found' }, false);
}

describe('project links & meal plans', () => {
  beforeEach(() => { vi.mocked(fetch).mockClear(); mockFetch({}); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('deleteProjectLink', async () => {
    mockFetch({ success: true });
    const result = await deleteProjectLink('link1');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it('getProjectMealPlans returns array when response has mealPlans', async () => {
    mockFetch({ mealPlans: [{ id: '1', name: 'Plan A' }] });
    const result = await getProjectMealPlans('proj1');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ id: '1', name: 'Plan A' }]);
  });

  it('getProjectMealPlans returns empty when response is not array', async () => {
    mockFetch({ notMealPlans: true });
    const result = await getProjectMealPlans('proj1');
    expect(result).toEqual([]);
  });
});

describe('kitchen status & project items/links', () => {
  beforeEach(() => { vi.mocked(fetch).mockClear(); mockFetch({}); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('updateKitchenStatus PATCHes the kitchen status', async () => {
    mockFetch({ success: true });
    await updateKitchenStatus('o1', 'ready');
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init?.method).toBe('PATCH');
    expect(init?.body).toContain('"status":"ready"');
  });

  it('getProjectItems returns array when response is array', async () => {
    mockFetch([{ id: 'i1' }]);
    const result = await getProjectItems({ projectId: 'p1', itemType: 'vehicle', status: 'active' });
    expect(result).toEqual([{ id: 'i1' }]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('getProjectItems returns empty when response is not array', async () => {
    mockFetch({ notArray: true });
    const result = await getProjectItems({});
    expect(result).toEqual([]);
  });

  it('getProjectItems builds query params only for provided filters', async () => {
    mockFetch([]);
    await getProjectItems({ projectId: 'p1', status: 'active' });
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain('projectId=p1');
    expect(String(url)).toContain('status=active');
    expect(String(url)).not.toContain('itemType=');
  });

  it('saveProjectItem POSTs when no id', async () => {
    mockFetch({ id: 'i1' });
    await saveProjectItem({ name: 'x' } as never);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(init?.method).toBe('POST');
    expect(String(url)).toContain('/projects/items');
  });

  it('saveProjectItem PUTs when id provided', async () => {
    mockFetch({ id: 'i1' });
    await saveProjectItem({ name: 'x' } as never, 'i1');
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init?.method).toBe('PUT');
  });

  it('deleteProjectItem DELETEs by id', async () => {
    mockFetch({ success: true });
    const result = await deleteProjectItem('i1');
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init?.method).toBe('DELETE');
    expect(result.success).toBe(true);
  });

  it('getProjectLinks returns array and passes projectId query', async () => {
    mockFetch([{ id: 'l1' }]);
    const result = await getProjectLinks('p1');
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain('projectId=p1');
    expect(result).toEqual([{ id: 'l1' }]);
  });

  it('getProjectLinks returns empty for non-array and omits query when no projectId', async () => {
    mockFetch({ notArray: true });
    const result = await getProjectLinks();
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).not.toContain('projectId=');
    expect(result).toEqual([]);
  });

  it('createProjectLink POSTs the payload', async () => {
    mockFetch({ id: 'l1' });
    await createProjectLink({ projectIdA: 'a', projectIdB: 'b', linkType: 'partner' });
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init?.method).toBe('POST');
    expect(init?.body).toContain('projectIdA');
  });
});

describe('billing, public reservations & POS tables', () => {
  beforeEach(() => { vi.mocked(fetch).mockClear(); mockFetch({}); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('getTenantBilling requests /tenant/billing', async () => {
    mockFetch({ id: 'b1' });
    const result = await getTenantBilling();
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain('/tenant/billing');
    expect(result).toEqual({ id: 'b1' });
  });

  it('createPublicReservation POSTs data', async () => {
    mockFetch({ id: 'r1' });
    await createPublicReservation({ campId: 'c1' } as never);
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init?.method).toBe('POST');
    expect(String(init?.body)).toContain('campId');
  });

  it('getPosTables requests /pos-tables', async () => {
    mockFetch([]);
    const result = await getPosTables();
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain('/pos-tables');
    expect(result).toEqual([]);
  });

  it('createPosTable POSTs data', async () => {
    mockFetch({ success: true, id: 't1' });
    await createPosTable({ name: 'T1', capacity: 4, section: 'A' });
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init?.method).toBe('POST');
    expect(String(init?.body)).toContain('"name":"T1"');
  });

  it('updatePosTable PUTs by id', async () => {
    mockFetch({ success: true });
    await updatePosTable('t1', { capacity: 6 });
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(init?.method).toBe('PUT');
    expect(String(url)).toContain('/pos-tables/t1');
  });

  it('updatePosTableStatus PATCHes status', async () => {
    mockFetch({ success: true });
    await updatePosTableStatus('t1', 'occupied');
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init?.method).toBe('PATCH');
    expect(String(init?.body)).toContain('"status":"occupied"');
  });

  it('deletePosTable DELETEs by id', async () => {
    mockFetch({ success: true });
    const result = await deletePosTable('t1');
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(init?.method).toBe('DELETE');
    expect(String(url)).toContain('/pos-tables/t1');
    expect(result.success).toBe(true);
  });
});

describe('tenant payout & payment gateway', () => {
  beforeEach(() => { vi.mocked(fetch).mockClear(); mockFetch([]); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('getTenantPayouts', async () => {
    const result = await getTenantPayouts();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual([]);
  });

  it('processPayment', async () => {
    const resp = { id: '1', paymentIntentId: 'pi_x', clientSecret: 'cs_x', amount: 100, currency: 'EGP', status: 'pending', message: 'ok', success: true };
    mockFetch(resp);
    const result = await processPayment({ amount: 100, method: 'card' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it('confirmFinancialPayment', async () => {
    mockFetch({ success: true, status: 'captured' });
    const result = await confirmFinancialPayment('pay_1');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });
});

describe('HR module', () => {
  beforeEach(() => { vi.mocked(fetch).mockClear(); mockFetch([]); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('getHrEmployees', async () => {
    const result = await getHrEmployees();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual([]);
  });

  it('createHrEmployee', async () => {
    mockFetch({ id: '1', success: true });
    const result = await createHrEmployee({ firstName: 'A', lastName: 'B', email: 'a@b.com', hireDate: '2024-01-01', salaryAmount: 5000 });
    expect(result.success).toBe(true);
  });

  it('updateHrEmployee', async () => {
    mockFetch({ success: true });
    const result = await updateHrEmployee('emp1', { position: 'Dev' });
    expect(result.success).toBe(true);
  });

  it('deleteHrEmployee', async () => {
    mockFetch({ success: true });
    const result = await deleteHrEmployee('emp1');
    expect(result.success).toBe(true);
  });

  it('getHrLeaveTypes', async () => {
    const result = await getHrLeaveTypes();
    expect(result).toEqual([]);
  });

  it('createHrLeaveType', async () => {
    mockFetch({ id: '1', success: true });
    const result = await createHrLeaveType({ name: 'Vacation', accrualRate: 1.5 });
    expect(result.success).toBe(true);
  });

  it('getHrLeaveRequests', async () => {
    const result = await getHrLeaveRequests();
    expect(result).toEqual([]);
  });

  it('createHrLeaveRequest', async () => {
    mockFetch({ id: '1', success: true });
    const result = await createHrLeaveRequest({ employeeId: 'e1', leaveTypeId: 'lt1', startDate: '2024-01-01', endDate: '2024-01-05', days: 5 });
    expect(result.success).toBe(true);
  });

  it('approveHrLeaveRequest', async () => {
    mockFetch({ success: true });
    const result = await approveHrLeaveRequest('lr1', 'approved');
    expect(result.success).toBe(true);
  });

  it('getHrPayrollRuns', async () => {
    const result = await getHrPayrollRuns();
    expect(result).toEqual([]);
  });

  it('createHrPayrollRun', async () => {
    mockFetch({ id: '1', success: true });
    const result = await createHrPayrollRun({ periodStart: '2024-01-01', periodEnd: '2024-01-31', runDate: '2024-02-01' });
    expect(result.success).toBe(true);
  });

  it('postHrPayrollRun', async () => {
    mockFetch({ success: true });
    const result = await postHrPayrollRun('pr1');
    expect(result.success).toBe(true);
  });

  it('getHrJobPosts', async () => {
    const result = await getHrJobPosts();
    expect(result).toEqual([]);
  });

  it('createHrJobPost', async () => {
    mockFetch({ id: '1', success: true });
    const result = await createHrJobPost({ title: 'Dev' });
    expect(result.success).toBe(true);
  });

  it('createHrApplicant', async () => {
    mockFetch({ id: '1', success: true });
    const result = await createHrApplicant({ name: 'Test' });
    expect(result).toEqual({ id: '1', success: true });
  });
});

describe('supply chain', () => {
  beforeEach(() => { vi.mocked(fetch).mockClear(); mockFetch([]); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('getSupplyWarehouses', async () => {
    const result = await getSupplyWarehouses();
    expect(result).toEqual([]);
  });

  it('getSupplyStock without params', async () => {
    const result = await getSupplyStock();
    expect(result).toEqual([]);
  });

  it('getSupplyStock with params', async () => {
    const result = await getSupplyStock({ warehouseId: 'w1' });
    expect(result).toEqual([]);
  });

  it('getSupplyTransfers', async () => {
    const result = await getSupplyTransfers();
    expect(result).toEqual([]);
  });

  it('getSupplyPurchaseOrders', async () => {
    const result = await getSupplyPurchaseOrders();
    expect(result).toEqual([]);
  });

  it('getSupplyBoms', async () => {
    const result = await getSupplyBoms();
    expect(result).toEqual([]);
  });

  it('getSupplyManufacturingOrders', async () => {
    const result = await getSupplyManufacturingOrders();
    expect(result).toEqual([]);
  });
});

describe('CRM module', () => {
  beforeEach(() => { vi.mocked(fetch).mockClear(); mockFetch([]); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('getCrmContacts without params', async () => {
    const result = await getCrmContacts();
    expect(result).toEqual([]);
  });

  it('getCrmContacts with params', async () => {
    const result = await getCrmContacts({ type: 'customer' });
    expect(result).toEqual([]);
  });

  it('getCrmLeads', async () => {
    const result = await getCrmLeads();
    expect(result).toEqual([]);
  });

  it('getCrmOpportunities', async () => {
    const result = await getCrmOpportunities();
    expect(result).toEqual([]);
  });

  it('getCrmTasks without params', async () => {
    const result = await getCrmTasks();
    expect(result).toEqual([]);
  });

  it('getCrmTasks with params', async () => {
    const result = await getCrmTasks({ projectId: 'p1', status: 'open' });
    expect(result).toEqual([]);
  });

  it('getCrmTickets', async () => {
    const result = await getCrmTickets();
    expect(result).toEqual([]);
  });

  it('getCrmKnowledgeArticles', async () => {
    const result = await getCrmKnowledgeArticles();
    expect(result).toEqual([]);
  });
});

describe('storefront module', () => {
  beforeEach(() => { vi.mocked(fetch).mockClear(); mockFetch([]); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('getStorefrontProducts without params', async () => {
    const result = await getStorefrontProducts();
    expect(result).toEqual([]);
  });

  it('getStorefrontProducts with params', async () => {
    const result = await getStorefrontProducts({ category: 'food' });
    expect(result).toEqual([]);
  });

  it('getStorefrontProduct', async () => {
    const result = await getStorefrontProduct('p1');
    expect(result).toEqual([]);
  });

  it('getStorefrontCart', async () => {
    const result = await getStorefrontCart('sess1');
    expect(result).toEqual([]);
  });

  it('addToStorefrontCart', async () => {
    mockFetch({ id: '1', success: true });
    const result = await addToStorefrontCart({ productId: 'p1', quantity: 2, sessionId: 's1' });
    expect(result.success).toBe(true);
  });

  it('updateStorefrontCartItem', async () => {
    mockFetch({ success: true });
    const result = await updateStorefrontCartItem('ci1', 3);
    expect(result.success).toBe(true);
  });

  it('removeStorefrontCartItem', async () => {
    mockFetch({ success: true });
    const result = await removeStorefrontCartItem('ci1');
    expect(result.success).toBe(true);
  });

  it('checkoutStorefront', async () => {
    mockFetch({ orderId: '1', orderNumber: 'ORD-001', success: true });
    const result = await checkoutStorefront({ sessionId: 's1' });
    expect(result.success).toBe(true);
  });

  it('getStorefrontOrders', async () => {
    const result = await getStorefrontOrders('s1');
    expect(result).toEqual([]);
  });

  it('getStorefrontPages', async () => {
    const result = await getStorefrontPages();
    expect(result).toEqual([]);
  });

  it('deleteStorefrontPage', async () => {
    mockFetch({ success: true });
    const result = await deleteStorefrontPage('p1');
    expect(result.success).toBe(true);
  });

  it('getStorefrontBlogPosts', async () => {
    const result = await getStorefrontBlogPosts();
    expect(result).toEqual([]);
  });

  it('deleteStorefrontBlogPost', async () => {
    mockFetch({ success: true });
    const result = await deleteStorefrontBlogPost('b1');
    expect(result.success).toBe(true);
  });

  // Storefront save helpers (POST vs PUT)
  it('saveStorefrontPage creates (no editId)', async () => {
    mockFetch({ id: '1', success: true });
    const result = await saveStorefrontPage({ slug: 'new', title: 'New' });
    expect(result).toEqual({ id: '1', success: true });
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('/storefront/admin/pages');
    expect(url).not.toContain('/storefront/admin/pages/');
  });

  it('saveStorefrontPage updates (with editId)', async () => {
    mockFetch({ success: true });
    await saveStorefrontPage({ title: 'Upd' }, 'p1');
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('/storefront/admin/pages/p1');
  });

  it('saveStorefrontBlogPost creates', async () => {
    mockFetch({ id: '1', success: true });
    await saveStorefrontBlogPost({ slug: 's', title: 'T', content: 'C' });
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('/storefront/admin/blog');
  });

  it('saveStorefrontBlogPost updates', async () => {
    mockFetch({ success: true });
    await saveStorefrontBlogPost({ title: 'Upd' }, 'b1');
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('/storefront/admin/blog/b1');
  });

  it('saveStorefrontBlogCategory creates', async () => {
    mockFetch({ id: '1', success: true });
    await saveStorefrontBlogCategory({ name: 'Cat' });
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('/storefront/admin/blog-categories');
  });

  it('saveStorefrontBlogCategory updates', async () => {
    mockFetch({ success: true });
    await saveStorefrontBlogCategory({ name: 'Upd' }, 'c1');
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('/storefront/admin/blog-categories/c1');
  });

  it('deleteStorefrontBlogCategory', async () => {
    mockFetch({ success: true });
    await deleteStorefrontBlogCategory('c1');
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('/storefront/admin/blog-categories/c1');
  });

  it('getStorefrontBlogCategories', async () => {
    const result = await getStorefrontBlogCategories();
    expect(result).toEqual([]);
  });
});

describe('AI module', () => {
  beforeEach(() => { vi.mocked(fetch).mockClear(); mockFetch([]); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('getAiPredictions without params', async () => {
    const result = await getAiPredictions();
    expect(result).toEqual([]);
  });

  it('getAiPredictions with params', async () => {
    const result = await getAiPredictions({ modelType: 'demand' });
    expect(result).toEqual([]);
  });

  it('createAiPrediction', async () => {
    mockFetch({ id: '1', success: true });
    const result = await createAiPrediction({ modelType: 'demand', predictedValue: 'high' });
    expect(result.success).toBe(true);
  });

  it('getAiDynamicPrice', async () => {
    mockFetch({ suggestedPrice: 99, confidence: 0.8, factors: {} });
    const result = await getAiDynamicPrice({ productId: 'p1', currentPrice: 100 });
    expect(result.suggestedPrice).toBe(99);
  });

  it('getAiAnomaly', async () => {
    mockFetch({ anomalies: [] });
    const result = await getAiAnomaly({ type: 'sales', data: {} });
    expect(result.anomalies).toEqual([]);
  });

  it('getAiPriceRules', async () => {
    const result = await getAiPriceRules();
    expect(result).toEqual([]);
  });

  it('getAiAutomationRules', async () => {
    const result = await getAiAutomationRules();
    expect(result).toEqual([]);
  });

  it('toggleAiAutomationRule', async () => {
    mockFetch({ success: true, isActive: 1 });
    const result = await toggleAiAutomationRule('r1');
    expect(result.success).toBe(true);
  });

  it('getAiAutomationLogs', async () => {
    const result = await getAiAutomationLogs();
    expect(result).toEqual([]);
  });

  it('analyzeWithWorkersAI', async () => {
    mockFetch({ id: '1', model: 'm', response: 'hi', tokens_used: 10, created_at: '', message: 'ok', success: true });
    const result = await analyzeWithWorkersAI({ prompt: 'hello' });
    expect(result.success).toBe(true);
  });

  it('generateEmbeddings', async () => {
    mockFetch({ id: '1', model: 'm', embeddings: [[0.1]], dimensions: 1, message: 'ok', success: true });
    const result = await generateEmbeddings({ text: 'hello' });
    expect(result.success).toBe(true);
  });

  it('getDurableStateSessions', async () => {
    mockFetch({ sessions: [], total: 0, message: 'ok', success: true });
    const result = await getDurableStateSessions();
    expect(result.success).toBe(true);
  });

  it('syncDurableState', async () => {
    mockFetch({ key: 'k', stored: true, ttl: 60, message: 'ok', success: true });
    const result = await syncDurableState({ key: 'k', value: 'v' });
    expect(result.success).toBe(true);
  });

  it('getDurableStateValue', async () => {
    mockFetch({ key: 'k', value: 'v', found: true, message: 'ok', success: true });
    const result = await getDurableStateValue('k');
    expect(result.success).toBe(true);
  });

  // Alternate AI function variants (lowercase start)
  it('updateAIPriceRule', async () => {
    mockFetch({ success: true });
    await updateAIPriceRule('r1', { name: 'Upd' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('createAIPriceRule', async () => {
    mockFetch({ id: '1', success: true });
    const result = await createAIPriceRule({ name: 'Rule' });
    expect(result).toEqual({ id: '1', success: true });
  });

  it('deleteAIPriceRule', async () => {
    mockFetch({ success: true });
    await deleteAIPriceRule('r1');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('updateAIAutomationRule', async () => {
    mockFetch({ success: true });
    await updateAIAutomationRule('r1', { name: 'Upd' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('createAIAutomationRule', async () => {
    mockFetch({ id: '1', success: true });
    const result = await createAIAutomationRule({ name: 'Rule' });
    expect(result).toEqual({ id: '1', success: true });
  });

  it('toggleAIAutomationRule', async () => {
    mockFetch({ success: true });
    await toggleAIAutomationRule('r1');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('runAIForecast', async () => {
    mockFetch({ productId: 'p1', periodDays: 7, forecasts: [], model: { slope: 0, intercept: 0, rSquared: 1 } });
    const result = await runAIForecast({ productId: 'p1', periodDays: 7 });
    expect(result.productId).toBe('p1');
  });
});

describe('super admin cross-tenant APIs', () => {
  beforeEach(() => { vi.mocked(fetch).mockClear(); mockFetch({ data: [] }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('getSuperFinancialsOverview', async () => {
    const result = await getSuperFinancialsOverview();
    expect(result).toEqual({ data: [] });
  });

  it('getSuperInvoices', async () => {
    const result = await getSuperInvoices(1, 10);
    expect(result).toEqual({ data: [] });
  });

  it('getAdminPublicPayments with no params', async () => {
    const result = await getAdminPublicPayments();
    expect(result).toEqual({ data: [] });
  });

  it('getAdminPublicPayments with all params', async () => {
    const result = await getAdminPublicPayments({ page: 2, pageSize: 10, status: 'captured', tenantId: '1', channel: 'online' });
    expect(result).toEqual({ data: [] });
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('page=2');
    expect(url).toContain('pageSize=10');
    expect(url).toContain('status=captured');
    expect(url).toContain('tenantId=1');
    expect(url).toContain('channel=online');
  });

  it('getAdminPayoutEligible with no params', async () => {
    const result = await getAdminPayoutEligible();
    expect(result).toEqual({ data: [] });
  });

  it('getAdminPayoutEligible with params', async () => {
    const result = await getAdminPayoutEligible({ tenantId: 1, limit: 5 });
    expect(result).toEqual({ data: [] });
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('tenantId=1');
    expect(url).toContain('limit=5');
  });

  it('getAdminPayouts with no params', async () => {
    const result = await getAdminPayouts();
    expect(result).toEqual({ data: [] });
  });

  it('getAdminPayouts with params', async () => {
    const result = await getAdminPayouts({ page: 1, pageSize: 20, tenantId: 1, status: 'paid' });
    expect(result).toEqual({ data: [] });
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('status=paid');
  });

  it('getAdminPayout', async () => {
    const result = await getAdminPayout('po1');
    expect(result).toEqual({ data: [] });
  });

  it('createAdminPayout', async () => {
    mockFetch({ id: '1', success: true });
    await createAdminPayout({ tenantId: 1, paymentIds: ['p1'], method: 'bank_transfer' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('markAdminPayoutPaid', async () => {
    mockFetch({ success: true });
    await markAdminPayoutPaid('po1');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('cancelAdminPayout', async () => {
    mockFetch({ success: true });
    await cancelAdminPayout('po1');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('getSuperHROverview', async () => {
    const result = await getSuperHROverview();
    expect(result).toEqual({ data: [] });
  });

  it('getSuperEmployees', async () => {
    const result = await getSuperEmployees(2, 10);
    expect(result).toEqual({ data: [] });
  });

  it('getSuperSupplyOverview', async () => {
    const result = await getSuperSupplyOverview();
    expect(result).toEqual({ data: [] });
  });

  it('getSuperPurchaseOrders', async () => {
    const result = await getSuperPurchaseOrders(1, 5);
    expect(result).toEqual({ data: [] });
  });

  it('getSuperCRMOverview', async () => {
    const result = await getSuperCRMOverview();
    expect(result).toEqual({ data: [] });
  });

  it('getSuperContacts', async () => {
    const result = await getSuperContacts(1, 20);
    expect(result).toEqual({ data: [] });
  });

  it('getSuperOpportunities', async () => {
    const result = await getSuperOpportunities(1, 20);
    expect(result).toEqual({ data: [] });
  });

  it('getSuperStorefrontOverview', async () => {
    const result = await getSuperStorefrontOverview();
    expect(result).toEqual({ data: [] });
  });

  it('getSuperStorefrontProducts', async () => {
    const result = await getSuperStorefrontProducts(1, 20);
    expect(result).toEqual({ data: [] });
  });

  it('getSuperAIOverview', async () => {
    const result = await getSuperAIOverview();
    expect(result).toEqual({ data: [] });
  });

  it('getSuperPredictions', async () => {
    const result = await getSuperPredictions(1, 20);
    expect(result).toEqual({ data: [] });
  });

  it('request helper wraps apiFetch', async () => {
    const result = await request<{ data: unknown }>('/test');
    expect(result).toEqual({ data: [] });
  });
});

describe('admin settings / subscriptions / reports / performance', () => {
  beforeEach(() => { vi.mocked(fetch).mockClear(); mockFetch({ settings: {} }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('getAdminSettings', async () => {
    const result = await getAdminSettings();
    expect(result).toEqual({ settings: {} });
  });

  it('updateAdminSettings', async () => {
    mockFetch({ success: true });
    await updateAdminSettings({ theme: 'dark' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('updateAdminSubscription', async () => {
    mockFetch({ success: true });
    await updateAdminSubscription('sub1', { plan: 'pro' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('cancelAdminSubscription', async () => {
    mockFetch({ success: true });
    await cancelAdminSubscription('sub1');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('resumeAdminSubscription', async () => {
    mockFetch({ success: true });
    await resumeAdminSubscription('sub1');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('generateAdminReport', async () => {
    mockFetch({ url: 'https://example.com/report.pdf' });
    await generateAdminReport({ type: 'revenue' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('createAdminScheduledReport', async () => {
    mockFetch({ id: '1', success: true });
    await createAdminScheduledReport({ name: 'Weekly', frequency: 'weekly' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('deleteAdminScheduledReport', async () => {
    mockFetch({ success: true });
    await deleteAdminScheduledReport('r1');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('exportAdminPerformance', async () => {
    mockFetch({ url: 'https://example.com/export.csv' });
    const result = await exportAdminPerformance('csv');
    expect(result).toBeInstanceOf(Blob);
    expect(result.size).toBeGreaterThan(0);
  });
});
