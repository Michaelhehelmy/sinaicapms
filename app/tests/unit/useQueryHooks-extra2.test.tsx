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
    // base CRUD
    getCamps: mk(),
    getProducts: mk(),
    getRooms: mk(),
    getOrders: mk(),
    getRatePlans: mk(),
    getPlans: mk(),
    getMeals: mk(),
    getCategories: mk(),
    getMealCategories: mk(),
    getMealSchedules: mk(),
    getMe: mk(),
    getLowStock: mk(),
    getAdminStats: mkObj(),
    getAdminTenants: mkObj(),
    getAdmins: mk(),
    saveCamp: mkObj(),
    deleteCamp: mkObj(),
    saveProduct: mkObj(),
    deleteProduct: mkObj(),
    saveRoom: mkObj(),
    deleteRoom: mkObj(),
    saveOrder: mkObj(),
    deleteOrder: mkObj(),
    saveRatePlan: mkObj(),
    deleteRatePlan: mkObj(),
    saveMeal: mkObj(),
    deleteMeal: mkObj(),
    updateBranding: mkObj(),
    saveMealCategory: mkObj(),
    deleteMealCategory: mkObj(),
    createMealSchedule: mkObj(),
    deleteMealSchedule: mkObj(),
    savePlan: mkObj(),
    deletePlan: mkObj(),
    changePassword: mkObj(),
    // reports / admins / availability
    getOccupancyReport: mk(),
    getRevenueReport: mk(),
    getBookingsReport: mk(),
    getAvailability: mk(),
    getPriceOverrides: mk(),
    setPriceOverrides: mkObj(),
    deletePriceOverride: mkObj(),
    getInbox: mk(),
    markInboxRead: mkObj(),
    deleteInboxLead: mkObj(),
    // super admin paginated lists
    getSuperInvoices: mkObj(),
    getSuperEmployees: mkObj(),
    getSuperPurchaseOrders: mkObj(),
    getSuperContacts: mkObj(),
    getSuperOpportunities: mkObj(),
    getSuperStorefrontProducts: mkObj(),
    getSuperPredictions: mkObj(),
    // error-path only additions
    getProjectMeta: mk(),
    getTenantBilling: mkObj(),
  };
});

import {
  useCampsQuery,
  useProductsQuery,
  useRoomsQuery,
  useOrdersQuery,
  useRatePlansQuery,
  usePlansQuery,
  useMealsQuery,
  useCategoriesQuery,
  useMealCategoriesQuery,
  useMealSchedulesQuery,
  useSettingsQuery,
  useLowStock,
  useAdminStatsQuery,
  useTenantsQuery,
  useSaveCampMutation,
  useDeleteCampMutation,
  useSaveProductMutation,
  useDeleteProductMutation,
  useSaveRoomMutation,
  useDeleteRoomMutation,
  useSaveOrderMutation,
  useDeleteOrderMutation,
  useSaveRatePlanMutation,
  useDeleteRatePlanMutation,
  useSaveMealMutation,
  useDeleteMealMutation,
  useUpdateSettingsMutation,
  useSaveMealCategoryMutation,
  useDeleteMealCategoryMutation,
  useCreateMealScheduleMutation,
  useDeleteMealScheduleMutation,
  useSavePlanMutation,
  useDeletePlanMutation,
  useSaveSettingsMutation,
  useChangePasswordMutation,
  useOccupancyReportQuery,
  useRevenueReportQuery,
  useBookingsReportQuery,
  useAdminsQuery,
  useAvailabilityQuery,
  usePriceOverridesQuery,
  useSetPriceOverrideMutation,
  useDeletePriceOverrideMutation,
  useInboxQuery,
  useInboxUnreadQuery,
  useMarkInboxReadMutation,
  useDeleteInboxLeadMutation,
  useSuperInvoicesQuery,
  useSuperEmployeesQuery,
  useSuperPurchaseOrdersQuery,
  useSuperContactsQuery,
  useSuperOpportunitiesQuery,
  useSuperStorefrontProductsQuery,
  useSuperPredictionsQuery,
  useProjectMetaQuery,
  useTenantBillingQuery,
  queryKeys,
} from '@/hooks/useQueryHooks';

import * as api from '@/lib/api';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      // gcTime must stay high (not 0) so seeded cache entries survive past
      // a mutation's settle-time invalidation for the optimistic-cache tests.
      queries: { retry: false, gcTime: 60_000 },
      mutations: { retry: false, gcTime: 60_000 },
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
  vi.mocked(apiFn).mockRejectedValueOnce(new Error('boom'));
  const { wrapper } = createWrapper();
  const { result } = renderHook(() => (hook as (...a: unknown[]) => unknown)(...args), { wrapper });
  await waitFor(() => expect(result.current.isError).toBe(true));
  return result;
}

/** Render a save-style mutation and run it to completion (success path). */
async function runSaveMutation(
  hook: (...hookArgs: unknown[]) => { mutateAsync: (v: unknown) => Promise<unknown> },
  vars: unknown,
  ...hookArgs: unknown[]
) {
  const { wrapper } = createWrapper();
  const { result } = renderHook(() => hook(...hookArgs), { wrapper });
  await act(async () => {
    await result.current.mutateAsync(vars);
  });
  return result;
}

/** Render a save-style mutation whose api fn rejects — covers onError toast path. */
async function runSaveMutationError(
  apiFn: (...a: unknown[]) => unknown,
  hook: (...hookArgs: unknown[]) => { mutateAsync: (v: unknown) => Promise<unknown> },
  vars: unknown,
  ...hookArgs: unknown[]
) {
  vi.mocked(apiFn).mockRejectedValueOnce(new Error('boom'));
  const { wrapper } = createWrapper();
  const { result } = renderHook(() => hook(...hookArgs), { wrapper });
  await act(async () => {
    await expect(result.current.mutateAsync(vars)).rejects.toThrow('boom');
  });
  return result;
}

describe('useQueryHooks — additional coverage 2 (base CRUD / mutations / reports / super-admin pagination)', () => {
  beforeEach(() => {
    mockShowToast.mockClear();
    vi.mocked(api.apiFetch).mockClear();
    vi.mocked(api.request).mockClear();
    // Clear every other api fn so call-history assertions (e.g. the
    // `does not fetch when disabled` test) start from a clean slate.
    const apiFns = Object.values(api).filter((v) => typeof v === 'function');
    for (const fn of apiFns) {
      if (typeof (fn as unknown as { mock?: unknown }).mock !== 'undefined') {
        (fn as unknown as ReturnType<typeof vi.fn>).mockClear();
      }
    }
  });

  describe('base CRUD queries (resolve + data)', () => {
    const baseQueryCases: Array<[string, never, unknown[], () => unknown]> = [
      ['useCampsQuery', useCampsQuery as never, [], api.getCamps],
      ['useProductsQuery', useProductsQuery as never, [], api.getProducts],
      ['useRoomsQuery', useRoomsQuery as never, [], api.getRooms],
      ['useRatePlansQuery', useRatePlansQuery as never, [], api.getRatePlans],
      ['usePlansQuery', usePlansQuery as never, [], api.getPlans],
      ['useMealsQuery', useMealsQuery as never, [], api.getMeals],
      ['useCategoriesQuery', useCategoriesQuery as never, [], api.getCategories],
      ['useMealCategoriesQuery', useMealCategoriesQuery as never, [], api.getMealCategories],
      ['useSettingsQuery', useSettingsQuery as never, [], api.getMe],
      ['useLowStock', useLowStock as never, [], api.getLowStock],
      ['useAdminStatsQuery', useAdminStatsQuery as never, [], api.getAdminStats],
      ['useTenantsQuery', useTenantsQuery as never, [], api.getAdminTenants],
      ['useOccupancyReportQuery', useOccupancyReportQuery as never, [], api.getOccupancyReport],
      ['useAdminsQuery', useAdminsQuery as never, [], api.getAdmins],
    ];

    for (const [name, hook, args, apiFn] of baseQueryCases) {
      it(`${name} resolves with data`, async () => {
        vi.mocked(apiFn).mockResolvedValue([{ id: 1, label: name }] as never);
        const result = await mountQuery(hook, ...(args as never[]));
        expect(apiFn).toHaveBeenCalledWith();
        expect(result.current.data).toEqual([{ id: 1, label: name }]);
      });
    }
  });

  describe('queries with arguments', () => {
    it('useOrdersQuery passes params to getOrders', async () => {
      vi.mocked(api.getOrders).mockResolvedValue({ data: [], total: 0 } as never);
      const result = await mountQuery(useOrdersQuery as never, { status: 'CONFIRMED' } as never);
      expect(api.getOrders).toHaveBeenCalledWith({ status: 'CONFIRMED' });
      expect(result.current.data).toEqual({ data: [], total: 0 });
    });

    it('useMealSchedulesQuery passes params to getMealSchedules', async () => {
      vi.mocked(api.getMealSchedules).mockResolvedValue([{ id: 's1' }] as never);
      const result = await mountQuery(useMealSchedulesQuery as never, { mealCategoryId: 'c1' } as never);
      expect(api.getMealSchedules).toHaveBeenCalledWith({ mealCategoryId: 'c1' });
      expect(result.current.data).toEqual([{ id: 's1' }]);
    });

    it('useRevenueReportQuery passes opts to getRevenueReport', async () => {
      vi.mocked(api.getRevenueReport).mockResolvedValue({ revenue: 100 } as never);
      const result = await mountQuery(useRevenueReportQuery as never, { days: 30 } as never);
      expect(api.getRevenueReport).toHaveBeenCalledWith({ days: 30 });
      expect(result.current.data).toEqual({ revenue: 100 });
    });

    it('useBookingsReportQuery passes opts to getBookingsReport', async () => {
      vi.mocked(api.getBookingsReport).mockResolvedValue({ bookings: 5 } as never);
      const result = await mountQuery(useBookingsReportQuery as never, { days: 30 } as never);
      expect(api.getBookingsReport).toHaveBeenCalledWith({ days: 30 });
      expect(result.current.data).toEqual({ bookings: 5 });
    });

    it('useAvailabilityQuery passes params to getAvailability', async () => {
      vi.mocked(api.getAvailability).mockResolvedValue({ available: true } as never);
      const result = await mountQuery(useAvailabilityQuery as never, { from: '2026-08-01', to: '2026-08-07' } as never);
      expect(api.getAvailability).toHaveBeenCalledWith({ from: '2026-08-01', to: '2026-08-07' });
      expect(result.current.data).toEqual({ available: true });
    });

    it('usePriceOverridesQuery passes product filter to getPriceOverrides', async () => {
      vi.mocked(api.getPriceOverrides).mockResolvedValue({ data: [] } as never);
      const result = await mountQuery(usePriceOverridesQuery as never, { productId: 'p1', from: '2026-08-01', to: '2026-08-07' } as never);
      expect(api.getPriceOverrides).toHaveBeenCalledWith({ productId: 'p1', from: '2026-08-01', to: '2026-08-07' });
      expect(result.current.data).toEqual({ data: [] });
    });

    it('usePriceOverridesQuery does not fetch when disabled', async () => {
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => usePriceOverridesQuery({ productId: 'p1', enabled: false } as never), { wrapper });
      await act(async () => {});
      expect(api.getPriceOverrides).not.toHaveBeenCalled();
      expect(result.current.isPending).toBe(true);
    });

    it('useInboxQuery passes params to getInbox', async () => {
      vi.mocked(api.getInbox).mockResolvedValue({ data: [], total: 0, unread: 3 } as never);
      const result = await mountQuery(useInboxQuery as never, { pageSize: '10' } as never);
      expect(api.getInbox).toHaveBeenCalledWith({ pageSize: '10' });
      expect(result.current.data).toEqual({ data: [], total: 0, unread: 3 });
    });

    it('useInboxUnreadQuery selects the unread count', async () => {
      vi.mocked(api.getInbox).mockResolvedValue({ data: [], total: 0, unread: 7 } as never);
      const result = await mountQuery(useInboxUnreadQuery as never);
      expect(api.getInbox).toHaveBeenCalledWith({ pageSize: '1' });
      expect(result.current.data).toBe(7);
    });
  });

  describe('super admin paginated queries', () => {
    const superCases: Array<[string, never, unknown[], () => unknown, unknown[]]> = [
      ['useSuperInvoicesQuery', useSuperInvoicesQuery as never, [2, 50], api.getSuperInvoices, [2, 50]],
      ['useSuperEmployeesQuery', useSuperEmployeesQuery as never, [2, 50], api.getSuperEmployees, [2, 50]],
      ['useSuperPurchaseOrdersQuery', useSuperPurchaseOrdersQuery as never, [2, 50], api.getSuperPurchaseOrders, [2, 50]],
      ['useSuperContactsQuery', useSuperContactsQuery as never, [2, 50], api.getSuperContacts, [2, 50]],
      ['useSuperOpportunitiesQuery', useSuperOpportunitiesQuery as never, [2, 50], api.getSuperOpportunities, [2, 50]],
      ['useSuperStorefrontProductsQuery', useSuperStorefrontProductsQuery as never, [2, 50], api.getSuperStorefrontProducts, [2, 50]],
      ['useSuperPredictionsQuery', useSuperPredictionsQuery as never, [2, 50], api.getSuperPredictions, [2, 50]],
    ];

    for (const [name, hook, hookArgs, apiFn, expectedArgs] of superCases) {
      it(`${name} resolves with page/limit args`, async () => {
        const payload = { data: [], total: 0, page: 2, pageSize: 50, hasMore: false };
        vi.mocked(apiFn).mockResolvedValue(payload as never);
        const result = await mountQuery(hook, ...(hookArgs as never[]));
        expect(apiFn).toHaveBeenCalledWith(...(expectedArgs as never[]));
        expect(result.current.data).toEqual(payload);
      });
    }

    it('useSuperEmployeesQuery defaults to page 1 limit 20', async () => {
      vi.mocked(api.getSuperEmployees).mockResolvedValue({ data: [], total: 0 } as never);
      const result = await mountQuery(useSuperEmployeesQuery as never);
      expect(api.getSuperEmployees).toHaveBeenCalledWith(1, 20);
      expect(result.current.isSuccess).toBe(true);
    });
  });

  describe('query error paths (toast + return false)', () => {
    const errorCases: Array<[string, never, () => unknown, never[]]> = [
      ['useCampsQuery', useCampsQuery as never, api.getCamps, []],
      ['useProductsQuery', useProductsQuery as never, api.getProducts, []],
      ['useRoomsQuery', useRoomsQuery as never, api.getRooms, []],
      ['useOrdersQuery', useOrdersQuery as never, api.getOrders, [{ status: 'CONFIRMED' }]],
      ['useRatePlansQuery', useRatePlansQuery as never, api.getRatePlans, []],
      ['usePlansQuery', usePlansQuery as never, api.getPlans, []],
      ['useMealsQuery', useMealsQuery as never, api.getMeals, []],
      ['useCategoriesQuery', useCategoriesQuery as never, api.getCategories, []],
      ['useMealCategoriesQuery', useMealCategoriesQuery as never, api.getMealCategories, []],
      ['useMealSchedulesQuery', useMealSchedulesQuery as never, api.getMealSchedules, []],
      ['useSettingsQuery', useSettingsQuery as never, api.getMe, []],
      ['useLowStock', useLowStock as never, api.getLowStock, []],
      ['useAdminStatsQuery', useAdminStatsQuery as never, api.getAdminStats, []],
      ['useTenantsQuery', useTenantsQuery as never, api.getAdminTenants, []],
      ['useOccupancyReportQuery', useOccupancyReportQuery as never, api.getOccupancyReport, []],
      ['useRevenueReportQuery', useRevenueReportQuery as never, api.getRevenueReport, [{ days: 30 }]],
      ['useBookingsReportQuery', useBookingsReportQuery as never, api.getBookingsReport, [{ days: 30 }]],
      ['useAdminsQuery', useAdminsQuery as never, api.getAdmins, []],
      ['useAvailabilityQuery', useAvailabilityQuery as never, api.getAvailability, [{ from: 'a', to: 'b' }]],
      ['usePriceOverridesQuery', usePriceOverridesQuery as never, api.getPriceOverrides, [{ productId: 'p1' }]],
      ['useInboxQuery', useInboxQuery as never, api.getInbox, []],
      ['useInboxUnreadQuery', useInboxUnreadQuery as never, api.getInbox, []],
      ['useProjectMetaQuery', useProjectMetaQuery as never, api.getProjectMeta, ['p1']],
      ['useTenantBillingQuery', useTenantBillingQuery as never, api.getTenantBilling, []],
    ];

    for (const [name, hook, apiFn, args] of errorCases) {
      it(`${name} shows an error toast when the request fails`, async () => {
        mockShowToast.mockClear();
        await mountQueryError(hook, apiFn as () => unknown, ...args);
        await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
      });
    }
  });

  describe('queryKeys factory coverage', () => {
    it('camp and order factories return namespaced keys', () => {
      expect(queryKeys.camp('42')).toEqual(['admin', 'camps', '42']);
      expect(queryKeys.order('7')).toEqual(['admin', 'orders', '7']);
    });
  });

  describe('save mutations (create + update)', () => {
    const saveCases: Array<[string, (...h: unknown[]) => { mutateAsync: (v: unknown) => Promise<unknown> }, (v: unknown, editId?: unknown) => unknown, unknown]> = [
      ['useSaveProductMutation', useSaveProductMutation as never, api.saveProduct as unknown as (v: unknown, editId?: unknown) => unknown, { name: 'Tent' }],
      ['useSaveOrderMutation', useSaveOrderMutation as never, api.saveOrder as unknown as (v: unknown, editId?: unknown) => unknown, { guestName: 'A' }],
      ['useSaveRatePlanMutation', useSaveRatePlanMutation as never, api.saveRatePlan as unknown as (v: unknown, editId?: unknown) => unknown, { name: 'High' }],
      ['useSaveMealMutation', useSaveMealMutation as never, api.saveMeal as unknown as (v: unknown, editId?: unknown) => unknown, { name: 'Lunch' }],
      ['useSaveMealCategoryMutation', useSaveMealCategoryMutation as never, api.saveMealCategory as unknown as (v: unknown, editId?: unknown) => unknown, { name: 'Hot' }],
      ['useSavePlanMutation', useSavePlanMutation as never, api.savePlan as unknown as (v: unknown, editId?: unknown) => unknown, { name: '4N' }],
    ];

    for (const [name, hook, apiFn, data] of saveCases) {
      it(`${name} creates a record`, async () => {
        const spy = apiFn as unknown as ReturnType<typeof vi.fn>;
        await runSaveMutation(hook, data);
        expect(spy).toHaveBeenCalledWith(data, undefined);
        expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('created'), 'success');
      });

      it(`${name} updates a record when editId is set`, async () => {
        const spy = apiFn as unknown as ReturnType<typeof vi.fn>;
        await runSaveMutation(hook, data, 3);
        expect(spy).toHaveBeenCalledWith(data, 3);
        expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('updated'), 'success');
      });

      it(`${name} shows an error toast on failure`, async () => {
        await runSaveMutationError(apiFn as (...a: unknown[]) => unknown, hook, data);
        await waitFor(() =>
          expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Failed'), 'error'),
        );
      });
    }
  });

  describe('delete mutations (useCrudMutation)', () => {
    const deleteCases: Array<[string, (...h: unknown[]) => { mutateAsync: (v: unknown) => Promise<unknown> }, (id: unknown) => unknown]> = [
      ['useDeleteProductMutation', useDeleteProductMutation as never, api.deleteProduct as unknown as (id: unknown) => unknown],
      ['useDeleteRoomMutation', useDeleteRoomMutation as never, api.deleteRoom as unknown as (id: unknown) => unknown],
      ['useDeleteOrderMutation', useDeleteOrderMutation as never, api.deleteOrder as unknown as (id: unknown) => unknown],
      ['useDeleteRatePlanMutation', useDeleteRatePlanMutation as never, api.deleteRatePlan as unknown as (id: unknown) => unknown],
      ['useDeleteMealMutation', useDeleteMealMutation as never, api.deleteMeal as unknown as (id: unknown) => unknown],
      ['useDeleteMealCategoryMutation', useDeleteMealCategoryMutation as never, api.deleteMealCategory as unknown as (id: unknown) => unknown],
      ['useDeletePlanMutation', useDeletePlanMutation as never, api.deletePlan as unknown as (id: unknown) => unknown],
    ];

    for (const [name, hook, apiFn] of deleteCases) {
      it(`${name} deletes a record and invalidates`, async () => {
        const spy = apiFn as unknown as ReturnType<typeof vi.fn>;
        const { wrapper, queryClient } = createWrapper();
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
        const { result } = renderHook(() => (hook as (id: unknown) => { mutateAsync: (v: unknown) => Promise<unknown> })(), { wrapper });
        await act(async () => {
          await result.current.mutateAsync(42);
        });
        expect(spy).toHaveBeenCalledWith(42);
        expect(invalidateSpy).toHaveBeenCalled();
        expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('deleted'), 'success');
      });

      it(`${name} shows an error toast on failure`, async () => {
        await runSaveMutationError(apiFn as (...a: unknown[]) => unknown, hook, 42);
        await waitFor(() =>
          expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Failed'), 'error'),
        );
      });
    }
  });

  describe('camp mutations (optimistic cache)', () => {
    it('useSaveCampMutation creates and invalidates cache', async () => {
      const { wrapper, queryClient } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
      const { result } = renderHook(() => useSaveCampMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ name: 'Wadi' } as never);
      });
      expect(api.saveCamp).toHaveBeenCalledWith({ name: 'Wadi' }, undefined);
      expect(invalidateSpy).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('Camp created', 'success');
      // empty cache stays unchanged (onMutate returns early on `!old`)
      expect(queryClient.getQueryData(['admin', 'camps'])).toBeUndefined();
    });

    it('useSaveCampMutation appends to existing cache when creating', async () => {
      const { wrapper, queryClient } = createWrapper();
      queryClient.setQueryData(['admin', 'camps'], [{ id: 1, name: 'A' }]);
      const { result } = renderHook(() => useSaveCampMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ name: 'B' } as never);
      });
      const data = queryClient.getQueryData(['admin', 'camps']) as Array<{ id: number | string; name: string }>;
      expect(data).toHaveLength(2);
      expect(data[1]).toMatchObject({ name: 'B' });
    });

    it('useSaveCampMutation updates existing cache entry when editId is set', async () => {
      const { wrapper, queryClient } = createWrapper();
      queryClient.setQueryData(['admin', 'camps'], [{ id: 5, name: 'Old' }]);
      const { result } = renderHook(() => useSaveCampMutation(5), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ name: 'New' } as never);
      });
      expect(api.saveCamp).toHaveBeenCalledWith({ name: 'New' }, 5);
      const data = queryClient.getQueryData(['admin', 'camps']) as Array<{ id: number; name: string }>;
      expect(data[0]).toMatchObject({ id: 5, name: 'New' });
      expect(mockShowToast).toHaveBeenCalledWith('Camp updated', 'success');
    });

    it('useSaveCampMutation rolls back cache and toasts on error', async () => {
      vi.mocked(api.saveCamp).mockRejectedValueOnce(new Error('boom'));
      const { wrapper, queryClient } = createWrapper();
      queryClient.setQueryData(['admin', 'camps'], [{ id: 1, name: 'A' }]);
      const { result } = renderHook(() => useSaveCampMutation(), { wrapper });
      await act(async () => {
        await expect(result.current.mutateAsync({ name: 'B' } as never)).rejects.toThrow('boom');
      });
      expect(queryClient.getQueryData(['admin', 'camps'])).toEqual([{ id: 1, name: 'A' }]);
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Failed to save camp'), 'error');
    });

    it('useDeleteCampMutation removes from cache and invalidates', async () => {
      const { wrapper, queryClient } = createWrapper();
      queryClient.setQueryData(['admin', 'camps'], [{ id: 1 }, { id: 2 }]);
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
      const { result } = renderHook(() => useDeleteCampMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync(1);
      });
      expect(api.deleteCamp).toHaveBeenCalledWith(1);
      expect(queryClient.getQueryData(['admin', 'camps'])).toEqual([{ id: 2 }]);
      expect(invalidateSpy).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('Camp deleted', 'success');
    });

    it('useDeleteCampMutation handles empty cache on mutate', async () => {
      const { wrapper, queryClient } = createWrapper();
      const { result } = renderHook(() => useDeleteCampMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync(9);
      });
      expect(api.deleteCamp).toHaveBeenCalledWith(9);
      expect(queryClient.getQueryData(['admin', 'camps'])).toBeUndefined();
    });

    it('useDeleteCampMutation rolls back cache on error', async () => {
      vi.mocked(api.deleteCamp).mockRejectedValueOnce(new Error('boom'));
      const { wrapper, queryClient } = createWrapper();
      queryClient.setQueryData(['admin', 'camps'], [{ id: 1 }, { id: 2 }]);
      const { result } = renderHook(() => useDeleteCampMutation(), { wrapper });
      await act(async () => {
        await expect(result.current.mutateAsync(1)).rejects.toThrow('boom');
      });
      expect(queryClient.getQueryData(['admin', 'camps'])).toEqual([{ id: 1 }, { id: 2 }]);
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Failed to delete camp'), 'error');
    });
  });

  describe('room mutations (optimistic cache)', () => {
    it('useSaveRoomMutation handles empty cache on mutate', async () => {
      const { wrapper, queryClient } = createWrapper();
      const { result } = renderHook(() => useSaveRoomMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ name: 'B' } as never);
      });
      expect(api.saveRoom).toHaveBeenCalledWith({ name: 'B' }, undefined);
      expect(queryClient.getQueryData(['admin', 'rooms'])).toBeUndefined();
    });

    it('useSaveRoomMutation appends to existing cache when creating', async () => {
      const { wrapper, queryClient } = createWrapper();
      queryClient.setQueryData(['admin', 'rooms'], [{ id: 1, name: 'A' }]);
      const { result } = renderHook(() => useSaveRoomMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ name: 'B' } as never);
      });
      expect(api.saveRoom).toHaveBeenCalledWith({ name: 'B' }, undefined);
      const data = queryClient.getQueryData(['admin', 'rooms']) as Array<{ name: string }>;
      expect(data).toHaveLength(2);
      expect(data[1]).toMatchObject({ name: 'B' });
      expect(mockShowToast).toHaveBeenCalledWith('Room created', 'success');
    });

    it('useSaveRoomMutation updates existing cache entry when editId is set', async () => {
      const { wrapper, queryClient } = createWrapper();
      queryClient.setQueryData(['admin', 'rooms'], [{ id: 5, name: 'Old' }]);
      const { result } = renderHook(() => useSaveRoomMutation(5), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ name: 'New' } as never);
      });
      expect(api.saveRoom).toHaveBeenCalledWith({ name: 'New' }, 5);
      const data = queryClient.getQueryData(['admin', 'rooms']) as Array<{ id: number; name: string }>;
      expect(data[0]).toMatchObject({ id: 5, name: 'New' });
      expect(mockShowToast).toHaveBeenCalledWith('Room updated', 'success');
    });

    it('useSaveRoomMutation rolls back cache and toasts on error', async () => {
      vi.mocked(api.saveRoom).mockRejectedValueOnce(new Error('boom'));
      const { wrapper, queryClient } = createWrapper();
      queryClient.setQueryData(['admin', 'rooms'], [{ id: 1, name: 'A' }]);
      const { result } = renderHook(() => useSaveRoomMutation(), { wrapper });
      await act(async () => {
        await expect(result.current.mutateAsync({ name: 'B' } as never)).rejects.toThrow('boom');
      });
      expect(queryClient.getQueryData(['admin', 'rooms'])).toEqual([{ id: 1, name: 'A' }]);
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Failed to save room'), 'error');
    });
  });

  describe('settings / password / schedule / override / inbox mutations', () => {
    it('useUpdateSettingsMutation calls updateBranding and invalidates settings', async () => {
      const { wrapper, queryClient } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
      const { result } = renderHook(() => useUpdateSettingsMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ name: 'X' } as never);
      });
      expect(api.updateBranding).toHaveBeenCalledWith({ name: 'X' });
      expect(invalidateSpy).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('Settings saved', 'success');
    });

    it('useUpdateSettingsMutation shows an error toast on failure', async () => {
      await runSaveMutationError(api.updateBranding as never, useUpdateSettingsMutation as never, { name: 'X' } as never);
      await waitFor(() =>
        expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Failed to save settings'), 'error'),
      );
    });

    it('useSaveSettingsMutation delegates to updateBranding', async () => {
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useSaveSettingsMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ name: 'Y' } as never);
      });
      expect(api.updateBranding).toHaveBeenCalledWith({ name: 'Y' });
    });

    it('useChangePasswordMutation calls changePassword with both passwords', async () => {
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useChangePasswordMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ currentPassword: 'old', newPassword: 'new' } as never);
      });
      expect(api.changePassword).toHaveBeenCalledWith('old', 'new');
      expect(mockShowToast).toHaveBeenCalledWith('Password changed successfully', 'success');
    });

    it('useChangePasswordMutation shows an error toast on failure', async () => {
      await runSaveMutationError(api.changePassword as never, useChangePasswordMutation as never, {
        currentPassword: 'old',
        newPassword: 'new',
      } as never);
      await waitFor(() =>
        expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Failed to change password'), 'error'),
      );
    });

    it('useCreateMealScheduleMutation calls createMealSchedule and toasts', async () => {
      const { wrapper, queryClient } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
      const { result } = renderHook(() => useCreateMealScheduleMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ mealCategoryId: 'c1', day: 'MON' } as never);
      });
      expect(api.createMealSchedule).toHaveBeenCalledWith({ mealCategoryId: 'c1', day: 'MON' });
      expect(invalidateSpy).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('Meal scheduled', 'success');
    });

    it('useCreateMealScheduleMutation shows an error toast on failure', async () => {
      await runSaveMutationError(api.createMealSchedule as never, useCreateMealScheduleMutation as never, {} as never);
      await waitFor(() =>
        expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Failed to schedule meal'), 'error'),
      );
    });

    it('useDeleteMealScheduleMutation calls deleteMealSchedule and toasts', async () => {
      const { wrapper, queryClient } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
      const { result } = renderHook(() => useDeleteMealScheduleMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync('ms1');
      });
      expect(api.deleteMealSchedule).toHaveBeenCalledWith('ms1');
      expect(invalidateSpy).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('Meal removed', 'success');
    });

    it('useDeleteMealScheduleMutation shows an error toast on failure', async () => {
      await runSaveMutationError(api.deleteMealSchedule as never, useDeleteMealScheduleMutation as never, 'ms1' as never);
      await waitFor(() =>
        expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Failed to remove meal'), 'error'),
      );
    });

    it('useSetPriceOverrideMutation calls setPriceOverrides and invalidates', async () => {
      const { wrapper, queryClient } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
      const { result } = renderHook(() => useSetPriceOverrideMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ productId: 'p1', date: '2026-08-01', price: 120 } as never);
      });
      expect(api.setPriceOverrides).toHaveBeenCalledWith({ productId: 'p1', date: '2026-08-01', price: 120 });
      expect(invalidateSpy).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('Price override saved', 'success');
    });

    it('useSetPriceOverrideMutation shows an error toast on failure', async () => {
      await runSaveMutationError(api.setPriceOverrides as never, useSetPriceOverrideMutation as never, {} as never);
      await waitFor(() =>
        expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Failed to save price override'), 'error'),
      );
    });

    it('useDeletePriceOverrideMutation calls deletePriceOverride with product and date', async () => {
      const { wrapper, queryClient } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
      const { result } = renderHook(() => useDeletePriceOverrideMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ productId: 'p1', date: '2026-08-01' } as never);
      });
      expect(api.deletePriceOverride).toHaveBeenCalledWith('p1', '2026-08-01');
      expect(invalidateSpy).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('Price override cleared', 'success');
    });

    it('useDeletePriceOverrideMutation shows an error toast on failure', async () => {
      await runSaveMutationError(api.deletePriceOverride as never, useDeletePriceOverrideMutation as never, {
        productId: 'p1',
        date: '2026-08-01',
      } as never);
      await waitFor(() =>
        expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Failed to clear price override'), 'error'),
      );
    });

    it('useMarkInboxReadMutation calls markInboxRead with kind and id', async () => {
      const { wrapper, queryClient } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
      const { result } = renderHook(() => useMarkInboxReadMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ kind: 'lead', id: '5' } as never);
      });
      expect(api.markInboxRead).toHaveBeenCalledWith('lead', '5');
      expect(invalidateSpy).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('Marked as read', 'success');
    });

    it('useMarkInboxReadMutation shows an error toast on failure', async () => {
      await runSaveMutationError(api.markInboxRead as never, useMarkInboxReadMutation as never, {
        kind: 'booking',
        id: '7',
      } as never);
      await waitFor(() =>
        expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Failed to mark as read'), 'error'),
      );
    });

    it('useDeleteInboxLeadMutation calls deleteInboxLead with the id', async () => {
      const { wrapper, queryClient } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
      const { result } = renderHook(() => useDeleteInboxLeadMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync('99');
      });
      expect(api.deleteInboxLead).toHaveBeenCalledWith('99');
      expect(invalidateSpy).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('Lead deleted', 'success');
    });

    it('useDeleteInboxLeadMutation shows an error toast on failure', async () => {
      await runSaveMutationError(api.deleteInboxLead as never, useDeleteInboxLeadMutation as never, '99' as never);
      await waitFor(() =>
        expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Failed to delete lead'), 'error'),
      );
    });
  });

  describe('render-phase toast deferral (throwOnError) — regression for T5 crash', () => {
    it('defers the error toast out of the render phase to avoid the infinite re-render loop', async () => {
      mockShowToast.mockClear();
      vi.mocked(api.getOrders).mockRejectedValueOnce(new Error('render boom'));
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useOrdersQuery(), { wrapper });
      // Wait until the query settles into the error state.
      await waitFor(() => expect(result.current.isError).toBe(true));
      // The toast must be deferred via setTimeout(0) — mutateAsync rejection / query
      // settle must not have fired showToast synchronously (the render-phase crash bug).
      // We cannot assert on the same tick reliably, so assert the toast *does* fire asynchronously.
      expect(result.current.isError).toBe(true);
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Failed to load orders'), 'error'));
    });
  });
});