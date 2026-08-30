import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockShowToast = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

// Mock every API function referenced by the hooks under test.
// NOTE: factory must be fully self-contained (no external refs — it is hoisted).
vi.mock('@/lib/api', () => {
  const mk = () => vi.fn().mockResolvedValue([]);
  const mkObj = () => vi.fn().mockResolvedValue({ ok: true });
  return {
    __esModule: true,
    apiFetch: vi.fn().mockResolvedValue([]),
    request: vi.fn().mockResolvedValue([]),
    // project meta
    getProjectMeta: mk(),
    setProjectMeta: vi.fn().mockResolvedValue(undefined),
    updateProjectMeta: vi.fn().mockResolvedValue(undefined),
    deleteProjectMeta: vi.fn().mockResolvedValue(undefined),
    // top products / kitchen / analytics reports
    getTopProducts: mk(),
    getKitchenPerformance: mk(),
    getAnalyticsLowStock: mk(),
    getRevenueBreakdown: mk(),
    getCustomerMetrics: mk(),
    getSeasonalComparison: mk(),
    getPromotions: mk(),
    // services
    getServiceDefinitions: mk(),
    getServiceItems: mk(),
    getServiceBookings: mk(),
    getPosUsers: mkObj(),
    // HR
    getHrEmployees: mk(),
    getHrLeaveTypes: mk(),
    getHrLeaveRequests: mk(),
    getHrPayrollRuns: mk(),
    getHrJobPosts: mk(),
    // Financial
    getFinancialAccounts: mk(),
    getFinancialJournals: mk(),
    getJournalEntries: mk(),
    getFinancialInvoices: mk(),
    getTaxRates: mk(),
    // Supply
    getSupplyWarehouses: mk(),
    getSupplyStock: mk(),
    getSupplyTransfers: mk(),
    getSupplyPurchaseOrders: mk(),
    getSupplyBoms: mk(),
    getSupplyManufacturingOrders: mk(),
    // CRM
    getCrmContacts: mk(),
    getCrmLeads: mk(),
    getCrmOpportunities: mk(),
    getCrmTasks: mk(),
    getCrmTickets: mk(),
    getCrmKnowledgeArticles: mk(),
    // Storefront
    getStorefrontPages: mk(),
    getStorefrontBlogPosts: mk(),
    getStorefrontOrders: mk(),
    // AI
    getAiPredictions: mk(),
    getAiPriceRules: mk(),
    getAiAutomationRules: mk(),
    getAiAutomationLogs: mk(),
    // Super admin
    getSuperFinancialsOverview: mkObj(),
    getSuperInvoices: mkObj(),
    getSuperHROverview: mkObj(),
    getSuperEmployees: mkObj(),
    getSuperSupplyOverview: mkObj(),
    getSuperPurchaseOrders: mkObj(),
    getSuperCRMOverview: mkObj(),
    getSuperContacts: mkObj(),
    getSuperOpportunities: mkObj(),
    getSuperStorefrontOverview: mkObj(),
    getSuperStorefrontProducts: mkObj(),
    getSuperAIOverview: mkObj(),
    getSuperPredictions: mkObj(),
    // Admin / billing
    getTenantBilling: mkObj(),
    getAdmins: mk(),
    getAdminSettings: mkObj(),
  };
});

import {
  useProjectMetaQuery,
  useSaveProjectMetaMutation,
  useTopProductsQuery,
  useKitchenPerformanceQuery,
  useAnalyticsLowStockQuery,
  useRevenueBreakdownQuery,
  useCustomerMetricsQuery,
  useSeasonalComparisonQuery,
  usePromotionsQuery,
  useServiceDefinitionsQuery,
  useServiceItemsQuery,
  useServiceBookingsQuery,
  usePosUsersQuery,
  useHrEmployeesQuery,
  useHrLeaveTypesQuery,
  useHrLeaveRequestsQuery,
  useHrPayrollRunsQuery,
  useHrJobPostsQuery,
  useFinancialAccountsQuery,
  useFinancialJournalsQuery,
  useFinancialJournalEntriesQuery,
  useFinancialInvoicesQuery,
  useFinancialPaymentsQuery,
  useFinancialTaxRatesQuery,
  useSupplyWarehousesQuery,
  useSupplyStockQuery,
  useSupplyTransfersQuery,
  useSupplyPurchaseOrdersQuery,
  useSupplyBomsQuery,
  useSupplyManufacturingOrdersQuery,
  useCrmContactsQuery,
  useCrmLeadsQuery,
  useCrmOpportunitiesQuery,
  useCrmTasksQuery,
  useCrmTicketsQuery,
  useCrmKnowledgeArticlesQuery,
  useStorefrontPagesQuery,
  useStorefrontBlogPostsQuery,
  useStorefrontBlogCategoriesQuery,
  useStorefrontCartsQuery,
  useStorefrontOrdersQuery,
  useAIPredictionsQuery,
  useAIPriceRulesQuery,
  useAIAutomationRulesQuery,
  useAIAutomationLogsQuery,
  useSuperFinancialsOverviewQuery,
  useSuperInvoicesQuery,
  useSuperHROverviewQuery,
  useSuperEmployeesQuery,
  useSuperSupplyOverviewQuery,
  useSuperPurchaseOrdersQuery,
  useSuperCRMOverviewQuery,
  useSuperContactsQuery,
  useSuperOpportunitiesQuery,
  useSuperStorefrontOverviewQuery,
  useSuperStorefrontProductsQuery,
  useSuperAIOverviewQuery,
  useSuperPredictionsQuery,
  useTenantBillingQuery,
  useAdminUsersQuery,
  useAdminAuditQuery,
  useAdminHealthQuery,
  useAdminHealthMetricsQuery,
  useAdminPerformanceQuery,
  useAdminReportsQuery,
  useAdminScheduledReportsQuery,
  useAdminSettingsQuery,
  useAdminSubscriptionsQuery,
} from '@/hooks/useQueryHooks';

import * as api from '@/lib/api';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper, queryClient };
}

/** Render a query hook and wait until its data resolves. */
async function mountQuery<H extends (...a: never[]) => unknown>(hook: H, ...args: never[]) {
  const { wrapper } = createWrapper();
  const { result } = renderHook(() => (hook as (...a: unknown[]) => unknown)(...args), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  return result;
}

/** Render a query hook whose api getter rejects — covers throwOnError error path. */
async function mountQueryError<H extends (...a: never[]) => unknown>(
  hook: H,
  apiFn: () => unknown,
  ...args: never[]
) {
  vi.mocked(apiFn).mockRejectedValue(new Error('boom'));
  const { wrapper } = createWrapper();
  const { result } = renderHook(() => (hook as (...a: unknown[]) => unknown)(...args), { wrapper });
  await waitFor(() => expect(result.current.isError).toBe(true));
  return result;
}

describe('useQueryHooks — additional coverage (reports/HR/financial/supply/CRM/storefront/AI/super-admin)', () => {
  beforeEach(() => {
    mockShowToast.mockClear();
    vi.mocked(api.apiFetch).mockClear();
    vi.mocked(api.request).mockClear();
  });

  describe('project meta', () => {
    it('useProjectMetaQuery resolves with enabled projectId', async () => {
      vi.mocked(api.getProjectMeta).mockResolvedValue([{ id: 'm1' } as never]);
      const result = await mountQuery(useProjectMetaQuery as never, 'p1');
      expect(api.getProjectMeta).toHaveBeenCalledWith('p1');
      expect(result.current.data).toEqual([{ id: 'm1' }]);
    });

    it('useSaveProjectMetaMutation runs creates/updates/deletes and clears cache', async () => {
      const { wrapper, queryClient } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
      const { result } = renderHook(() => useSaveProjectMetaMutation('p1'), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({
          creates: [{ key: 'color', value: 'red' }],
          updates: [{ id: 'u1', value: 'blue' }],
          deletes: ['d1'],
        });
      });
      expect(api.setProjectMeta).toHaveBeenCalledWith('p1', 'color', 'red');
      expect(api.updateProjectMeta).toHaveBeenCalledWith('p1', 'u1', 'blue');
      expect(api.deleteProjectMeta).toHaveBeenCalledWith('p1', 'd1');
      expect(invalidateSpy).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalled();
    });

    it('useSaveProjectMetaMutation throws without projectId', async () => {
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useSaveProjectMetaMutation(null), { wrapper });
      await act(async () => {
        await expect(
          result.current.mutateAsync({ creates: [], updates: [], deletes: [] } as never)
        ).rejects.toThrow('No project selected');
      });
    });
  });

  describe('queries that resolve', () => {
    const queryCases: Array<[string, never, unknown[]]> = [
      ['useTopProductsQuery', useTopProductsQuery as never, [300, 10]],
      ['useKitchenPerformanceQuery', useKitchenPerformanceQuery as never, [7]],
      ['useAnalyticsLowStockQuery', useAnalyticsLowStockQuery as never, []],
      ['useRevenueBreakdownQuery', useRevenueBreakdownQuery as never, [30]],
      ['useCustomerMetricsQuery', useCustomerMetricsQuery as never, [30]],
      ['useSeasonalComparisonQuery', useSeasonalComparisonQuery as never, []],
      ['usePromotionsQuery', usePromotionsQuery as never, [true]],
      ['useServiceDefinitionsQuery', useServiceDefinitionsQuery as never, []],
      ['useServiceItemsQuery', useServiceItemsQuery as never, []],
      ['useServiceBookingsQuery', useServiceBookingsQuery as never, ['CONFIRMED']],
      ['usePosUsersQuery', usePosUsersQuery as never, [{ page: 1, pageSize: 10 }]],
      ['useHrEmployeesQuery', useHrEmployeesQuery as never, []],
      ['useHrLeaveTypesQuery', useHrLeaveTypesQuery as never, []],
      ['useHrLeaveRequestsQuery', useHrLeaveRequestsQuery as never, []],
      ['useHrPayrollRunsQuery', useHrPayrollRunsQuery as never, []],
      ['useHrJobPostsQuery', useHrJobPostsQuery as never, []],
      ['useFinancialAccountsQuery', useFinancialAccountsQuery as never, []],
      ['useFinancialJournalsQuery', useFinancialJournalsQuery as never, []],
      ['useFinancialJournalEntriesQuery', useFinancialJournalEntriesQuery as never, []],
      ['useFinancialInvoicesQuery', useFinancialInvoicesQuery as never, []],
      ['useFinancialPaymentsQuery', useFinancialPaymentsQuery as never, []],
      ['useFinancialTaxRatesQuery', useFinancialTaxRatesQuery as never, []],
      ['useSupplyWarehousesQuery', useSupplyWarehousesQuery as never, []],
      ['useSupplyStockQuery', useSupplyStockQuery as never, []],
      ['useSupplyTransfersQuery', useSupplyTransfersQuery as never, []],
      ['useSupplyPurchaseOrdersQuery', useSupplyPurchaseOrdersQuery as never, []],
      ['useSupplyBomsQuery', useSupplyBomsQuery as never, []],
      ['useSupplyManufacturingOrdersQuery', useSupplyManufacturingOrdersQuery as never, []],
      ['useCrmContactsQuery', useCrmContactsQuery as never, []],
      ['useCrmLeadsQuery', useCrmLeadsQuery as never, []],
      ['useCrmOpportunitiesQuery', useCrmOpportunitiesQuery as never, []],
      ['useCrmTasksQuery', useCrmTasksQuery as never, []],
      ['useCrmTicketsQuery', useCrmTicketsQuery as never, []],
      ['useCrmKnowledgeArticlesQuery', useCrmKnowledgeArticlesQuery as never, []],
      ['useStorefrontPagesQuery', useStorefrontPagesQuery as never, []],
      ['useStorefrontBlogPostsQuery', useStorefrontBlogPostsQuery as never, []],
      ['useStorefrontBlogCategoriesQuery', useStorefrontBlogCategoriesQuery as never, []],
      ['useStorefrontCartsQuery', useStorefrontCartsQuery as never, []],
      ['useStorefrontOrdersQuery', useStorefrontOrdersQuery as never, []],
      ['useAIPredictionsQuery', useAIPredictionsQuery as never, []],
      ['useAIPriceRulesQuery', useAIPriceRulesQuery as never, []],
      ['useAIAutomationRulesQuery', useAIAutomationRulesQuery as never, []],
      ['useAIAutomationLogsQuery', useAIAutomationLogsQuery as never, []],
      ['useSuperFinancialsOverviewQuery', useSuperFinancialsOverviewQuery as never, []],
      ['useSuperHROverviewQuery', useSuperHROverviewQuery as never, []],
      ['useSuperSupplyOverviewQuery', useSuperSupplyOverviewQuery as never, []],
      ['useSuperCRMOverviewQuery', useSuperCRMOverviewQuery as never, []],
      ['useSuperStorefrontOverviewQuery', useSuperStorefrontOverviewQuery as never, []],
      ['useSuperAIOverviewQuery', useSuperAIOverviewQuery as never, []],
      ['useTenantBillingQuery', useTenantBillingQuery as never, []],
      ['useAdminUsersQuery', useAdminUsersQuery as never, []],
      ['useAdminAuditQuery', useAdminAuditQuery as never, [{}]],
      ['useAdminHealthQuery', useAdminHealthQuery as never, []],
      ['useAdminHealthMetricsQuery', useAdminHealthMetricsQuery as never, []],
      ['useAdminPerformanceQuery', useAdminPerformanceQuery as never, []],
      ['useAdminReportsQuery', useAdminReportsQuery as never, []],
      ['useAdminScheduledReportsQuery', useAdminScheduledReportsQuery as never, []],
      ['useAdminSettingsQuery', useAdminSettingsQuery as never, []],
      ['useAdminSubscriptionsQuery', useAdminSubscriptionsQuery as never, [{}]],
    ];

    for (const [name, hook, args] of queryCases) {
      it(`${name} resolves`, async () => {
        const result = await mountQuery(hook, ...args);
        expect(result.current.isSuccess).toBe(true);
      });
    }
  });

  describe('throwOnError error paths (toast + return false)', () => {
    const errorCases: Array<[string, never, () => unknown, never[]]> = [
      ['useTopProductsQuery', useTopProductsQuery as never, api.getTopProducts, [300, 10]],
      ['useKitchenPerformanceQuery', useKitchenPerformanceQuery as never, api.getKitchenPerformance, [7]],
      ['useAnalyticsLowStockQuery', useAnalyticsLowStockQuery as never, api.getAnalyticsLowStock, []],
      ['useRevenueBreakdownQuery', useRevenueBreakdownQuery as never, api.getRevenueBreakdown, [30]],
      ['useCustomerMetricsQuery', useCustomerMetricsQuery as never, api.getCustomerMetrics, [30]],
      ['useSeasonalComparisonQuery', useSeasonalComparisonQuery as never, api.getSeasonalComparison, []],
      ['usePromotionsQuery', usePromotionsQuery as never, api.getPromotions, [true]],
      ['useServiceDefinitionsQuery', useServiceDefinitionsQuery as never, api.getServiceDefinitions, []],
      ['useServiceItemsQuery', useServiceItemsQuery as never, api.getServiceItems, []],
      ['useServiceBookingsQuery', useServiceBookingsQuery as never, api.getServiceBookings, ['CONFIRMED']],
      ['usePosUsersQuery', usePosUsersQuery as never, api.getPosUsers, [{ page: 1, pageSize: 10 }]],
      ['useHrEmployeesQuery', useHrEmployeesQuery as never, api.getHrEmployees, []],
      ['useHrLeaveTypesQuery', useHrLeaveTypesQuery as never, api.getHrLeaveTypes, []],
      ['useHrLeaveRequestsQuery', useHrLeaveRequestsQuery as never, api.getHrLeaveRequests, []],
      ['useHrPayrollRunsQuery', useHrPayrollRunsQuery as never, api.getHrPayrollRuns, []],
      ['useHrJobPostsQuery', useHrJobPostsQuery as never, api.getHrJobPosts, []],
      ['useFinancialAccountsQuery', useFinancialAccountsQuery as never, api.getFinancialAccounts, []],
      ['useFinancialJournalsQuery', useFinancialJournalsQuery as never, api.getFinancialJournals, []],
      ['useFinancialJournalEntriesQuery', useFinancialJournalEntriesQuery as never, api.getJournalEntries, []],
      ['useFinancialInvoicesQuery', useFinancialInvoicesQuery as never, api.getFinancialInvoices, []],
      ['useFinancialPaymentsQuery', useFinancialPaymentsQuery as never, api.request, []],
      ['useFinancialTaxRatesQuery', useFinancialTaxRatesQuery as never, api.getTaxRates, []],
      ['useSupplyWarehousesQuery', useSupplyWarehousesQuery as never, api.getSupplyWarehouses, []],
      ['useSupplyStockQuery', useSupplyStockQuery as never, api.getSupplyStock, []],
      ['useSupplyTransfersQuery', useSupplyTransfersQuery as never, api.getSupplyTransfers, []],
      ['useSupplyPurchaseOrdersQuery', useSupplyPurchaseOrdersQuery as never, api.getSupplyPurchaseOrders, []],
      ['useSupplyBomsQuery', useSupplyBomsQuery as never, api.getSupplyBoms, []],
      ['useSupplyManufacturingOrdersQuery', useSupplyManufacturingOrdersQuery as never, api.getSupplyManufacturingOrders, []],
      ['useCrmContactsQuery', useCrmContactsQuery as never, api.getCrmContacts, []],
      ['useCrmLeadsQuery', useCrmLeadsQuery as never, api.getCrmLeads, []],
      ['useCrmOpportunitiesQuery', useCrmOpportunitiesQuery as never, api.getCrmOpportunities, []],
      ['useCrmTasksQuery', useCrmTasksQuery as never, api.getCrmTasks, []],
      ['useCrmTicketsQuery', useCrmTicketsQuery as never, api.getCrmTickets, []],
      ['useCrmKnowledgeArticlesQuery', useCrmKnowledgeArticlesQuery as never, api.getCrmKnowledgeArticles, []],
      ['useStorefrontPagesQuery', useStorefrontPagesQuery as never, api.getStorefrontPages, []],
      ['useStorefrontBlogPostsQuery', useStorefrontBlogPostsQuery as never, api.getStorefrontBlogPosts, []],
      ['useStorefrontBlogCategoriesQuery', useStorefrontBlogCategoriesQuery as never, api.apiFetch, []],
      ['useStorefrontCartsQuery', useStorefrontCartsQuery as never, api.apiFetch, []],
      ['useStorefrontOrdersQuery', useStorefrontOrdersQuery as never, api.getStorefrontOrders, []],
      ['useAIPredictionsQuery', useAIPredictionsQuery as never, api.getAiPredictions, []],
      ['useAIPriceRulesQuery', useAIPriceRulesQuery as never, api.getAiPriceRules, []],
      ['useAIAutomationRulesQuery', useAIAutomationRulesQuery as never, api.getAiAutomationRules, []],
      ['useAIAutomationLogsQuery', useAIAutomationLogsQuery as never, api.getAiAutomationLogs, []],
    ];

    for (const [name, hook, apiFn, args] of errorCases) {
      it(`${name} shows an error toast when the request fails`, async () => {
        mockShowToast.mockClear();
        await mountQueryError(hook, apiFn, ...args);
        expect(mockShowToast).toHaveBeenCalled();
      });
    }
  });
});
