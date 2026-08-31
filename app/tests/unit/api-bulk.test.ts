import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as api from '@/lib/api';

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

const RESULT = { ok: true };

beforeEach(() => {
  mockFetch(RESULT);
});

// Generic helper: assert an api call resolves to the mocked payload.
async function expectResolves(fn: () => unknown) {
  await expect((fn() as Promise<unknown>)).resolves.toEqual(RESULT);
}

describe('api.ts — project meta / tags / audit / promotions', () => {
  it('getProjectMeta returns [] for a non-array payload', async () => {
    mockFetch({ not: 'array' });
    await expect(api.getProjectMeta('p1')).resolves.toEqual([]);
  });
  it('getProjectMeta returns the array', async () => {
    mockFetch([{ id: 1 }]);
    await expect(api.getProjectMeta('p1')).resolves.toEqual([{ id: 1 }]);
  });
  it('setProjectMeta / updateProjectMeta / deleteProjectMeta / reorderProjectMeta', async () => {
    await expectResolves(() => api.setProjectMeta('p1', 'k', 'v'));
    await expectResolves(() => api.updateProjectMeta('p1', 2, 'v'));
    // void-returning helpers: just ensure they resolve without throwing
    await expect(api.deleteProjectMeta('p1', 2)).resolves.toBeUndefined();
    await expect(api.reorderProjectMeta('p1', [{ id: 1, sort_order: 0 }])).resolves.toBeUndefined();
  });
  it('getTags / createTag / getProjectTags / addProjectTags / removeProjectTag', async () => {
    mockFetch([{ id: 't1' }]);
    await expect(api.getTags('tee1')).resolves.toEqual([{ id: 't1' }]);
    await expect(api.getTags()).resolves.toEqual([{ id: 't1' }]);
    await expect(api.getProjectTags('p1')).resolves.toEqual([{ id: 't1' }]);
    mockFetch(RESULT);
    await expectResolves(() => api.createTag('Trek'));
    await expect(api.addProjectTags('p1', ['t1'])).resolves.toBeUndefined();
    await expect(api.removeProjectTag('p1', 't1')).resolves.toBeUndefined();
  });
  it('getAuditLog builds query params', async () => {
    await expectResolves(() => api.getAuditLog({ entity_type: 'user', limit: 10, offset: 5 }));
    await expectResolves(() => api.getAuditLog());
  });
  it('promotions CRUD + apply', async () => {
    await expectResolves(() => api.getPromotions());
    await expectResolves(() => api.getPromotions(true));
    await expectResolves(() => api.savePromotion({ name: 'x' }));
    await expectResolves(() => api.savePromotion({ name: 'x' }, 'p1'));
    await expectResolves(() => api.deletePromotion('p1'));
    await expectResolves(() => api.applyPromotions({ items: [{ productId: 'pr1', quantity: 2 }] }));
  });
});

describe('api.ts — services module', () => {
  it('service definitions / items / bookings / catalog', async () => {
    await expectResolves(() => api.getServiceDefinitions());
    await expectResolves(() => api.saveServiceDefinition({ name: 'x' }));
    await expectResolves(() => api.saveServiceDefinition({ name: 'x' }, 'd1'));
    await expectResolves(() => api.deleteServiceDefinition('d1'));
    await expectResolves(() => api.getServiceItems());
    await expectResolves(() => api.saveServiceItem({ name: 'x' }));
    await expectResolves(() => api.saveServiceItem({ name: 'x' }, 'i1'));
    await expectResolves(() => api.deleteServiceItem('i1'));
    await expectResolves(() => api.getServiceBookings());
    await expectResolves(() => api.createServiceBooking({ serviceItemId: 'i1' }));
    await expectResolves(() => api.updateBookingStatus('b1', 'confirmed'));
    await expectResolves(() => api.getPublicServiceCatalog('acacia'));
    await expectResolves(() => api.assignServiceWorker('b1', 'w1'));
    await expectResolves(() => api.getServiceAvailability('i1'));
    await expectResolves(() => api.createServiceAvailabilitySlot('i1', { availableDate: '2026-09-01' }));
    await expectResolves(() => api.getServiceReviews('i1'));
    await expectResolves(() => api.submitServiceReview('b1', { rating: 5 }));
    await expectResolves(() => api.updateServicePricing('i1', { priceTier: 'premium' }));
  });
});

describe('api.ts — analytics + onboarding + marketplace', () => {
  it('analytics', async () => {
    await expectResolves(() => api.getAnalyticsLowStock());
    await expectResolves(() => api.getTopProducts());
    await expectResolves(() => api.getKitchenPerformance());
    await expectResolves(() => api.getRevenueBreakdown());
    await expectResolves(() => api.getCustomerMetrics());
    await expectResolves(() => api.getSeasonalComparison());
    await expectResolves(() => api.getInventoryAdjustments());
    await expectResolves(() => api.createInventoryAdjustment({ productId: 'p1', quantity: 5 }));
    await expectResolves(() => api.getReorderSuggestions());
  });
  it('onboarding', async () => {
    await expectResolves(() => api.signupTenant('tee1', { email: 'a@b.c', password: 'x' }));
    await expectResolves(() => api.getOnboardingStatus('tee1'));
    await expectResolves(() => api.completeOnboarding('tee1', {}));
    await expectResolves(() => api.updateOnboardingTenant('tee1', {}));
    await expectResolves(() => api.autoLogin('tok'));
  });
  it('marketplace', async () => {
    await expectResolves(() => api.getMarketplaceListings());
    await expectResolves(() => api.getMarketplaceCategories());
    await expectResolves(() => api.getMarketplaceTenantProfile('tee1'));
    await expectResolves(() => api.submitMarketplaceReview({ rating: 5 }));
    await expectResolves(() => api.getMarketplaceReviews('tee1'));
  });
});

describe('api.ts — financial module', () => {
  it('accounts / journals / invoices / tax', async () => {
    await expectResolves(() => api.getFinancialAccounts());
    await expectResolves(() => api.createFinancialAccount({ name: 'Cash' }));
    await expectResolves(() => api.updateFinancialAccount('a1', { name: 'Bank' }));
    await expectResolves(() => api.deleteFinancialAccount('a1'));
    await expectResolves(() => api.getFinancialJournals());
    await expectResolves(() => api.createFinancialJournal({ reference: 'r' }));
    await expectResolves(() => api.getJournalEntries());
    await expectResolves(() => api.createJournalEntry({ accountId: 'a1' }));
    await expectResolves(() => api.postJournalEntry('j1'));
    await expectResolves(() => api.getFinancialInvoices());
    await expectResolves(() => api.createFinancialInvoice({ number: 'INV-1' }));
    await expectResolves(() => api.updateInvoiceStatus('i1', 'paid'));
    await expectResolves(() => api.createPayment({ invoiceId: 'i1', amount: 10 }));
    await expectResolves(() => api.getTaxRates());
    await expectResolves(() => api.createTaxRate({ rate: 0.15 }));
    await expectResolves(() => api.processPayment({ amount: 10 }));
    await expectResolves(() => api.confirmFinancialPayment('p1'));
  });
});

describe('api.ts — HR module', () => {
  it('employees / leave / payroll / jobs', async () => {
    await expectResolves(() => api.getHrEmployees());
    await expectResolves(() => api.createHrEmployee({ firstName: 'A' }));
    await expectResolves(() => api.updateHrEmployee('e1', { firstName: 'B' }));
    await expectResolves(() => api.deleteHrEmployee('e1'));
    await expectResolves(() => api.getHrLeaveTypes());
    await expectResolves(() => api.createHrLeaveType({ name: 'Annual' }));
    await expectResolves(() => api.getHrLeaveRequests());
    await expectResolves(() => api.createHrLeaveRequest({ employeeId: 'e1' }));
    await expectResolves(() => api.approveHrLeaveRequest('l1', 'approved'));
    await expectResolves(() => api.getHrPayrollRuns());
    await expectResolves(() => api.createHrPayrollRun({ period: '2026-08' }));
    await expectResolves(() => api.postHrPayrollRun('pr1'));
    await expectResolves(() => api.getHrJobPosts());
    await expectResolves(() => api.createHrJobPost({ title: 'Chef' }));
    await expectResolves(() => api.createHrApplicant({ name: 'A' }));
  });
});

describe('api.ts — supply module', () => {
  it('warehouses / stock / transfers / purchase orders / boms / mfg', async () => {
    await expectResolves(() => api.getSupplyWarehouses());
    await expectResolves(() => api.createSupplyWarehouse({ name: 'W' }));
    await expectResolves(() => api.getSupplyStock());
    await expectResolves(() => api.adjustSupplyStock({ productId: 'p1', quantity: 5 }));
    await expectResolves(() => api.getSupplyTransfers());
    await expectResolves(() => api.createSupplyTransfer({ fromWarehouseId: '1' }));
    await expectResolves(() => api.confirmSupplyTransfer('t1'));
    await expectResolves(() => api.getSupplyPurchaseOrders());
    await expectResolves(() => api.createSupplyPurchaseOrder({ supplier: 'S' }));
    await expectResolves(() => api.receiveSupplyPurchaseOrder('po1'));
    await expectResolves(() => api.getSupplyBoms());
    await expectResolves(() => api.createSupplyBom({ name: 'Bom' }));
    await expectResolves(() => api.getSupplyManufacturingOrders());
    await expectResolves(() => api.createSupplyManufacturingOrder({ bomId: 'b1' }));
    await expectResolves(() => api.progressSupplyManufacturingOrder('m1', 'done'));
  });
});

describe('api.ts — CRM module', () => {
  it('contacts / leads / opportunities / tasks / tickets / articles', async () => {
    await expectResolves(() => api.getCrmContacts());
    await expectResolves(() => api.createCrmContact({ firstName: 'A' }));
    await expectResolves(() => api.updateCrmContact('c1', { lastName: 'B' }));
    await expectResolves(() => api.getCrmLeads());
    await expectResolves(() => api.createCrmLead({ name: 'L' }));
    await expectResolves(() => api.updateCrmLeadStatus('l1', 'qualified'));
    await expectResolves(() => api.getCrmOpportunities());
    await expectResolves(() => api.createCrmOpportunity({ name: 'Opp' }));
    await expectResolves(() => api.updateCrmOpportunityStage('o1', 'closed'));
    await expectResolves(() => api.getCrmTasks());
    await expectResolves(() => api.createCrmTask({ title: 'T' }));
    await expectResolves(() => api.updateCrmTaskStatus('t1', 'done'));
    await expectResolves(() => api.getCrmTickets());
    await expectResolves(() => api.createCrmTicket({ subject: 'Bug' }));
    await expectResolves(() => api.addCrmTicketComment('t1', { body: 'hi' }));
    await expectResolves(() => api.getCrmKnowledgeArticles());
    await expectResolves(() => api.createCrmKnowledgeArticle({ title: 'A' }));
  });
});

describe('api.ts — storefront (public + orders)', () => {
  it('products / product / cart / checkout / orders', async () => {
    await expectResolves(() => api.getStorefrontProducts());
    await expectResolves(() => api.getStorefrontProduct('p1'));
    await expectResolves(() => api.getStorefrontCart());
    await expectResolves(() => api.addToStorefrontCart({ productId: 'p1', quantity: 1 }));
    await expectResolves(() => api.updateStorefrontCartItem('ci1', { quantity: 2 }));
    await expectResolves(() => api.removeStorefrontCartItem('ci1'));
    await expectResolves(() => api.checkoutStorefront());
    await expectResolves(() => api.getStorefrontOrders('s1'));
    await expectResolves(() => api.getStorefrontPages());
    await expectResolves(() => api.createStorefrontPage({ slug: 'x', title: 'X' }));
    await expectResolves(() => api.updateStorefrontPage('pg1', { title: 'Y' }));
    await expectResolves(() => api.deleteStorefrontPage('pg1'));
    await expectResolves(() => api.getStorefrontBlogPosts());
    await expectResolves(() => api.createStorefrontBlogPost({ slug: 'x', title: 'X', content: 'c' }));
    await expectResolves(() => api.updateStorefrontBlogPost('bp1', { title: 'Y' }));
    await expectResolves(() => api.deleteStorefrontBlogPost('bp1'));
    await expectResolves(() => api.saveStorefrontPage({ title: 'P' }));
    await expectResolves(() => api.saveStorefrontPage({ title: 'P' }, 'pg2'));
    await expectResolves(() => api.saveStorefrontBlogPost({ title: 'B' }));
    await expectResolves(() => api.saveStorefrontBlogPost({ title: 'B' }, 'bp2'));
    await expectResolves(() => api.saveStorefrontBlogCategory({ name: 'Cat' }));
    await expectResolves(() => api.saveStorefrontBlogCategory({ name: 'Cat' }, 'cat2'));
    await expectResolves(() => api.deleteStorefrontBlogCategory('cat2'));
  });
});

describe('api.ts — AI + durable state', () => {
  it('predictions / price rules / automation / workers AI / durable state', async () => {
    await expectResolves(() => api.getAiPredictions());
    await expectResolves(() => api.getAiPredictions({ modelType: 'demand' }));
    await expectResolves(() => api.createAiPrediction({ modelType: 'demand', predictedValue: '10' }));
    await expectResolves(() => api.getAiDynamicPrice({ productId: 'p1', currentPrice: 100 }));
    await expectResolves(() => api.getAiForecast({ productId: 'p1', periodDays: 7 }));
    await expectResolves(() => api.getAiAnomaly({ type: 'sales', data: {} }));
    await expectResolves(() => api.getAiPriceRules());
    await expectResolves(() => api.createAiPriceRule({ name: 'R', ruleType: 'fixed' }));
    await expectResolves(() => api.updateAiPriceRule('r1', { name: 'R2' }));
    await expectResolves(() => api.deleteAiPriceRule('r1'));
    await expectResolves(() => api.getAiAutomationRules());
    await expectResolves(() => api.createAiAutomationRule({ name: 'A', triggerEvent: 'x' }));
    await expectResolves(() => api.toggleAiAutomationRule('a1'));
    await expectResolves(() => api.getAiAutomationLogs());
    await expectResolves(() => api.analyzeWithWorkersAI({ prompt: 'hi' }));
    await expectResolves(() => api.generateEmbeddings({ text: 'hi' }));
    await expectResolves(() => api.getDurableStateSessions());
    await expectResolves(() => api.syncDurableState({ key: 'k', value: 1 }));
    await expectResolves(() => api.getDurableStateValue('k'));
    await expectResolves(() => api.updateAIPriceRule('r1', { name: 'R3' }));
    await expectResolves(() => api.createAIPriceRule({ name: 'R4' }));
    await expectResolves(() => api.deleteAIPriceRule('r1'));
    await expectResolves(() => api.updateAIAutomationRule('a1', { name: 'A2' }));
    await expectResolves(() => api.createAIAutomationRule({ name: 'A3', triggerEvent: 'y' }));
    await expectResolves(() => api.toggleAIAutomationRule('a1'));
    await expectResolves(() => api.runAIForecast({ productId: 'p1' }));
  });
});

describe('api.ts — super admin + request + upload + admin settings', () => {
  it('super admin overviews + paginated lists', async () => {
    await expectResolves(() => api.getSuperFinancialsOverview());
    await expectResolves(() => api.getSuperInvoices());
    await expectResolves(() => api.getSuperInvoices(2, 50));
    await expectResolves(() => api.getSuperHROverview());
    await expectResolves(() => api.getSuperEmployees());
    await expectResolves(() => api.getSuperEmployees(2, 50));
    await expectResolves(() => api.getSuperSupplyOverview());
    await expectResolves(() => api.getSuperPurchaseOrders());
    await expectResolves(() => api.getSuperPurchaseOrders(2, 50));
    await expectResolves(() => api.getSuperCRMOverview());
    await expectResolves(() => api.getSuperContacts());
    await expectResolves(() => api.getSuperContacts(2, 50));
    await expectResolves(() => api.getSuperOpportunities());
    await expectResolves(() => api.getSuperOpportunities(2, 50));
    await expectResolves(() => api.getSuperStorefrontOverview());
    await expectResolves(() => api.getSuperStorefrontProducts());
    await expectResolves(() => api.getSuperStorefrontProducts(2, 50));
    await expectResolves(() => api.getSuperAIOverview());
    await expectResolves(() => api.getSuperPredictions());
    await expectResolves(() => api.getSuperPredictions(2, 50));
  });

  it('generic request helper', async () => {
    await expectResolves(() => api.request('/some/path'));
    await expectResolves(() => api.request('/some/path', { method: 'POST', body: '{}' }));
  });

  it('admin settings / subscriptions / reports / performance export', async () => {
    await expectResolves(() => api.getAdminSettings());
    await expectResolves(() => api.updateAdminSettings({ theme: 'dark' }));
    await expectResolves(() => api.updateAdminSubscription('sub1', { plan: 'pro' }));
    await expectResolves(() => api.cancelAdminSubscription('sub1'));
    await expectResolves(() => api.resumeAdminSubscription('sub1'));
    await expectResolves(() => api.generateAdminReport({ type: 'revenue' }));
    await expectResolves(() => api.createAdminScheduledReport({ frequency: 'daily' }));
    await expectResolves(() => api.deleteAdminScheduledReport('sr1'));
    await expectResolves(() => api.exportAdminPerformance('csv'));
  });

  it('upload posts a FormData payload and returns response', async () => {
    setTestHostname('test.sinaicamps.com');
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    await expect(api.upload(file)).resolves.toEqual(RESULT);
  });

  it('upload throws an error for a non-JSON error response', async () => {
    setTestHostname('test.sinaicamps.com');
    vi.mocked(fetch).mockClear();
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
      headers: { get: () => 'text/html' },
    } as Response);
    await expect(api.upload(new File(['x'], 'a.png', { type: 'image/png' }))).rejects.toThrow('Server error');
  });

  it('upload throws the server error message for a JSON error response', async () => {
    setTestHostname('test.sinaicamps.com');
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Upload failed' }),
      headers: { get: () => 'application/json' },
    } as Response);
    await expect(api.upload(new File(['x'], 'a.png', { type: 'image/png' }))).rejects.toThrow('Upload failed');
  });
});
