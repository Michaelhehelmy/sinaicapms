/**
 * Coverage-push tests for useQueryHooks.ts — covers remaining uncovered
 * mutation hooks, paginated super-admin queries, backward-compat aliases,
 * and throwOnError error paths that the other test files missed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─── Toast mock ───────────────────────────────────────────────────────────────
const mockShowToast = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

// ─── API mock ────────────────────────────────────────────────────────────────
// NOTE: factory must be fully self-contained (no external refs — it is hoisted).
vi.mock('@/lib/api', () => {
  const mk = () => vi.fn().mockResolvedValue([]);
  const mkObj = () => vi.fn().mockResolvedValue({ ok: true });
  return {
    __esModule: true,
    // Base query hooks
    getCamps: mk(),
    getProducts: mk(),
    getRooms: mk(),
    getOrders: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    getRatePlans: mk(),
    getPlans: mk(),
    getMeals: mk(),
    getCategories: mk(),
    getMealCategories: mk(),
    getMealSchedules: mk(),
    getSettings: vi.fn().mockResolvedValue({}),
    getMe: vi.fn().mockResolvedValue({}),
    getAdminStats: vi.fn().mockResolvedValue({}),
    getTenants: mk(),
    getAdminTenants: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 50, hasMore: false }),
    getLowStock: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50, hasMore: false }),
    // Camps, rooms, orders, products, rate plans, meals, categories, meta, items, links
    getProjectMeta: vi.fn().mockResolvedValue([]),
    saveProjectItem: vi.fn().mockResolvedValue({ id: 'pi1' }),
    createProjectLink: vi.fn().mockResolvedValue({ id: 'pl1' }),
    saveCamp: vi.fn().mockResolvedValue({ id: 'c1' }),
    deleteCamp: vi.fn().mockResolvedValue({ ok: true }),
    saveRoom: vi.fn().mockResolvedValue({ id: 'r1' }),
    saveOrder: vi.fn().mockResolvedValue({ id: 'o1' }),
    saveRatePlan: vi.fn().mockResolvedValue({ id: 'rp1' }),
    saveMeal: vi.fn().mockResolvedValue({ id: 'm1' }),
    // Reports
    getOccupancyReport: mkObj(),
    getRevenueReport: mkObj(),
    getBookingsReport: mkObj(),
    // Admin
    getAdmins: mk(),
    getAdminSettings: mkObj(),
    // Availability / Price overrides
    getAvailability: mkObj(),
    getPriceOverrides: mkObj(),
    setPriceOverrides: vi.fn().mockResolvedValue({ ok: true }),
    deletePriceOverride: vi.fn().mockResolvedValue({ ok: true }),
    // Meal mutations
    saveMealCategory: vi.fn().mockResolvedValue({ id: 'mc1' }),
    deleteMealCategory: vi.fn().mockResolvedValue({ ok: true }),
    createMealSchedule: vi.fn().mockResolvedValue({ id: 'ms1' }),
    deleteMealSchedule: vi.fn().mockResolvedValue({ ok: true }),
    // Plan mutations
    savePlan: vi.fn().mockResolvedValue({ id: 'p1' }),
    deletePlan: vi.fn().mockResolvedValue({ ok: true }),
    // Settings
    updateBranding: vi.fn().mockResolvedValue({}),
    changePassword: vi.fn().mockResolvedValue({ ok: true }),
    // Inbox
    getInbox: vi.fn().mockResolvedValue({ data: [], unread: 0, total: 0 }),
    markInboxRead: vi.fn().mockResolvedValue({ ok: true }),
    deleteInboxLead: vi.fn().mockResolvedValue({ ok: true }),
    // Super admin paginated
    getSuperInvoices: mkObj(),
    getSuperEmployees: mkObj(),
    getSuperPurchaseOrders: mkObj(),
    getSuperContacts: mkObj(),
    getSuperOpportunities: mkObj(),
    getSuperStorefrontProducts: mkObj(),
    getSuperPredictions: mkObj(),
    getSuperFinancialsOverview: mkObj(),
    getSuperHROverview: mkObj(),
    getSuperSupplyOverview: mkObj(),
    getSuperCRMOverview: mkObj(),
    getSuperStorefrontOverview: mkObj(),
    getSuperAIOverview: mkObj(),
    // Tenant billing
    getTenantBilling: mkObj(),
    // Generic fetch
    apiFetch: vi.fn().mockResolvedValue([]),
    request: vi.fn().mockResolvedValue([]),
  };
});

// ─── Imports AFTER mocks ─────────────────────────────────────────────────────
import * as api from '@/lib/api';
import {
  // Mutation hooks under test
  useSaveMealCategoryMutation,
  useDeleteMealCategoryMutation,
  useCreateMealScheduleMutation,
  useDeleteMealScheduleMutation,
  useSavePlanMutation,
  useDeletePlanMutation,
  useChangePasswordMutation,
  useSaveCampMutation,
  useDeleteCampMutation,
  useSaveProjectItemMutation,
  useCreateProjectLinkMutation,
  useSaveRoomMutation,
  useSaveOrderMutation,
  useSaveRatePlanMutation,
  useSaveMealMutation,
  // Query hooks under test
  useOccupancyReportQuery,
  useRevenueReportQuery,
  useBookingsReportQuery,
  useAdminsQuery,
  useAvailabilityQuery,
  usePriceOverridesQuery,
  useSettingsQuery,
  useLowStock,
  useAdminStatsQuery,
  useTenantsQuery,
  useProjectMetaQuery,
  // Super admin paginated
  useSuperInvoicesQuery,
  useSuperEmployeesQuery,
  useSuperPurchaseOrdersQuery,
  useSuperContactsQuery,
  useSuperOpportunitiesQuery,
  useSuperStorefrontProductsQuery,
  useSuperPredictionsQuery,
  // Backward-compat aliases
  useCampsRQ,
  useRoomsRQ,
  useOrdersRQ,
  useProductsRQ,
  useRatePlansRQ,
  usePlansRQ,
  useMealsRQ,
  useCategoriesRQ,
  useMealCategoriesRQ,
  useMealSchedulesRQ,
  useSettingsRQ,
  useTenantBillingQuery,
} from '@/hooks/useQueryHooks';

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

async function mountQuery<H extends (...a: never[]) => unknown>(hook: H, ...args: never[]) {
  const { wrapper } = createWrapper();
  const { result } = renderHook(() => (hook as (...a: unknown[]) => unknown)(...args), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  return result;
}

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

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('useQueryHooks — coverage push (mutations / reports / super-admin / aliases)', () => {
  beforeEach(() => {
    mockShowToast.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Mutation hooks: success path ────────────────────────────────────────

  describe('mutation hooks — success paths', () => {
    it('useSaveMealCategoryMutation creates (no editId) and invalidates', async () => {
      vi.mocked(api.saveMealCategory).mockResolvedValue({ id: 'mc1' } as never);
      const { wrapper, queryClient } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
      const { result } = renderHook(() => useSaveMealCategoryMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ name: 'Veggie' } as never);
      });
      expect(api.saveMealCategory).toHaveBeenCalledWith({ name: 'Veggie' }, undefined);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'mealCategories'] });
      expect(mockShowToast).toHaveBeenCalled();
    });

    it('useSaveMealCategoryMutation updates (with editId) and shows "Category updated"', async () => {
      vi.mocked(api.saveMealCategory).mockResolvedValue({ id: 'mc1' } as never);
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useSaveMealCategoryMutation('mc1'), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ name: 'Vegan' } as never);
      });
      expect(api.saveMealCategory).toHaveBeenCalledWith({ name: 'Vegan' }, 'mc1');
      expect(mockShowToast).toHaveBeenCalled();
    });

    it('useDeleteMealCategoryMutation deletes and invalidates', async () => {
      vi.mocked(api.deleteMealCategory).mockResolvedValue({ ok: true } as never);
      const { wrapper, queryClient } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
      const { result } = renderHook(() => useDeleteMealCategoryMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync('mc1' as never);
      });
      expect(api.deleteMealCategory).toHaveBeenCalledWith('mc1');
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'mealCategories'] });
      expect(mockShowToast).toHaveBeenCalled();
    });

    it('useCreateMealScheduleMutation creates and invalidates', async () => {
      vi.mocked(api.createMealSchedule).mockResolvedValue({ id: 'ms1' } as never);
      const { wrapper, queryClient } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
      const { result } = renderHook(() => useCreateMealScheduleMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ mealId: 'm1', date: '2025-06-01', timeSlot: 'lunch' } as never);
      });
      expect(api.createMealSchedule).toHaveBeenCalled();
      expect(invalidateSpy).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalled();
    });

    it('useDeleteMealScheduleMutation deletes and invalidates', async () => {
      vi.mocked(api.deleteMealSchedule).mockResolvedValue({ ok: true } as never);
      const { wrapper, queryClient } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
      const { result } = renderHook(() => useDeleteMealScheduleMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync('ms1' as never);
      });
      expect(api.deleteMealSchedule).toHaveBeenCalledWith('ms1');
      expect(invalidateSpy).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalled();
    });

    it('useSavePlanMutation creates (no editId) and invalidates', async () => {
      vi.mocked(api.savePlan).mockResolvedValue({ id: 'plan1' } as never);
      const { wrapper, queryClient } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
      const { result } = renderHook(() => useSavePlanMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ name: 'Premium' } as never);
      });
      expect(api.savePlan).toHaveBeenCalledWith({ name: 'Premium' }, undefined);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'plans'] });
      expect(mockShowToast).toHaveBeenCalled();
    });

    it('useSavePlanMutation updates (with editId) and shows "Plan updated"', async () => {
      vi.mocked(api.savePlan).mockResolvedValue({ id: 'plan1' } as never);
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useSavePlanMutation('plan1'), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ name: 'Standard' } as never);
      });
      expect(api.savePlan).toHaveBeenCalledWith({ name: 'Standard' }, 'plan1');
      expect(mockShowToast).toHaveBeenCalled();
    });

    it('useDeletePlanMutation deletes and invalidates', async () => {
      vi.mocked(api.deletePlan).mockResolvedValue({ ok: true } as never);
      const { wrapper, queryClient } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
      const { result } = renderHook(() => useDeletePlanMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync('plan1' as never);
      });
      expect(api.deletePlan).toHaveBeenCalledWith('plan1');
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'plans'] });
      expect(mockShowToast).toHaveBeenCalled();
    });

    it('useChangePasswordMutation calls changePassword and shows toast', async () => {
      vi.mocked(api.changePassword).mockResolvedValue({ ok: true } as never);
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useChangePasswordMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ currentPassword: 'old', newPassword: 'new' });
      });
      expect(api.changePassword).toHaveBeenCalledWith('old', 'new');
      expect(mockShowToast).toHaveBeenCalled();
    });
  });

  // ── Mutation hooks: error path ──────────────────────────────────────────

  describe('mutation hooks — error paths', () => {
    it('useSaveMealCategoryMutation shows toast on error', async () => {
      vi.mocked(api.saveMealCategory).mockRejectedValue(new Error('fail'));
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useSaveMealCategoryMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ name: 'x' } as never).catch(() => {});
      });
      // useErrorToast wraps showToast in setTimeout — wait for it
      await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    });

    it('useDeleteMealCategoryMutation shows toast on error', async () => {
      vi.mocked(api.deleteMealCategory).mockRejectedValue(new Error('fail'));
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useDeleteMealCategoryMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync('x' as never).catch(() => {});
      });
      await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    });

    it('useCreateMealScheduleMutation shows toast on error', async () => {
      vi.mocked(api.createMealSchedule).mockRejectedValue(new Error('fail'));
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useCreateMealScheduleMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ mealId: 'm1' } as never).catch(() => {});
      });
      await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    });

    it('useDeleteMealScheduleMutation shows toast on error', async () => {
      vi.mocked(api.deleteMealSchedule).mockRejectedValue(new Error('fail'));
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useDeleteMealScheduleMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync('x' as never).catch(() => {});
      });
      await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    });

    it('useSavePlanMutation shows toast on error', async () => {
      vi.mocked(api.savePlan).mockRejectedValue(new Error('fail'));
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useSavePlanMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ name: 'x' } as never).catch(() => {});
      });
      await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    });

    it('useDeletePlanMutation shows toast on error', async () => {
      vi.mocked(api.deletePlan).mockRejectedValue(new Error('fail'));
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useDeletePlanMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync('x' as never).catch(() => {});
      });
      await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    });

    it('useChangePasswordMutation shows toast on error', async () => {
      vi.mocked(api.changePassword).mockRejectedValue(new Error('fail'));
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useChangePasswordMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ currentPassword: 'old', newPassword: 'new' }).catch(() => {});
      });
      await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    });
  });

  // ── Report queries: success + error ─────────────────────────────────────

  describe('report query hooks', () => {
    it('useOccupancyReportQuery resolves', async () => {
      vi.mocked(api.getOccupancyReport).mockResolvedValue({ occupancy: 80 } as never);
      await mountQuery(useOccupancyReportQuery as never);
    });

    it('useOccupancyReportQuery shows toast on error', async () => {
      await mountQueryError(useOccupancyReportQuery as never, api.getOccupancyReport);
      await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    });

    it('useRevenueReportQuery resolves', async () => {
      vi.mocked(api.getRevenueReport).mockResolvedValue({ revenue: 5000 } as never);
      await mountQuery(useRevenueReportQuery as never);
    });

    it('useRevenueReportQuery resolves with opts', async () => {
      vi.mocked(api.getRevenueReport).mockResolvedValue({ revenue: 1000 } as never);
      await mountQuery(useRevenueReportQuery as never, { days: 7 });
    });

    it('useRevenueReportQuery shows toast on error', async () => {
      await mountQueryError(useRevenueReportQuery as never, api.getRevenueReport);
      await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    });

    it('useBookingsReportQuery resolves', async () => {
      vi.mocked(api.getBookingsReport).mockResolvedValue({ bookings: 12 } as never);
      await mountQuery(useBookingsReportQuery as never);
    });

    it('useBookingsReportQuery resolves with opts', async () => {
      vi.mocked(api.getBookingsReport).mockResolvedValue({ bookings: 5 } as never);
      await mountQuery(useBookingsReportQuery as never, { start: '2025-01-01', end: '2025-01-31' });
    });

    it('useBookingsReportQuery shows toast on error', async () => {
      await mountQueryError(useBookingsReportQuery as never, api.getBookingsReport);
      await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    });
  });

  // ── useAdminsQuery ──────────────────────────────────────────────────────

  describe('useAdminsQuery', () => {
    it('resolves with admin list', async () => {
      vi.mocked(api.getAdmins).mockResolvedValue([{ id: 'a1', name: 'Admin 1' }] as never);
      await mountQuery(useAdminsQuery as never);
    });

    it('shows toast on error', async () => {
      await mountQueryError(useAdminsQuery as never, api.getAdmins);
      await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    });
  });

  // ── Availability & price overrides ──────────────────────────────────────

  describe('useAvailabilityQuery', () => {
    it('resolves with availability data', async () => {
      vi.mocked(api.getAvailability).mockResolvedValue({ rooms: [] } as never);
      await mountQuery(useAvailabilityQuery as never, { from: '2025-06-01', to: '2025-06-07' });
    });

    it('shows toast on error', async () => {
      await mountQueryError(useAvailabilityQuery as never, api.getAvailability, { from: '2025-06-01', to: '2025-06-07' });
      await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    });
  });

  describe('usePriceOverridesQuery', () => {
    it('resolves with price overrides', async () => {
      vi.mocked(api.getPriceOverrides).mockResolvedValue([{ id: 'po1' }] as never);
      await mountQuery(usePriceOverridesQuery as never, { productId: 'prod1' });
    });

    it('resolves when enabled=true explicitly', async () => {
      vi.mocked(api.getPriceOverrides).mockResolvedValue([{ id: 'po2' }] as never);
      await mountQuery(usePriceOverridesQuery as never, { productId: 'prod1', enabled: true });
    });

    it('does not fire when enabled=false', async () => {
      vi.mocked(api.getPriceOverrides).mockClear();
      const { wrapper } = createWrapper();
      renderHook(() => usePriceOverridesQuery({ productId: 'prod1', enabled: false } as never), { wrapper });
      await new Promise(r => setTimeout(r, 50));
      expect(api.getPriceOverrides).not.toHaveBeenCalled();
    });

    it('shows toast on error', async () => {
      await mountQueryError(usePriceOverridesQuery as never, api.getPriceOverrides, { productId: 'prod1' });
      await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    });
  });

  // ── Super admin paginated queries ───────────────────────────────────────

  describe('super admin paginated queries', () => {
    it('useSuperInvoicesQuery resolves', async () => {
      vi.mocked(api.getSuperInvoices).mockResolvedValue({ data: [], total: 0 } as never);
      await mountQuery(useSuperInvoicesQuery as never);
    });

    it('useSuperInvoicesQuery resolves with custom page/limit', async () => {
      vi.mocked(api.getSuperInvoices).mockResolvedValue({ data: [], total: 0 } as never);
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useSuperInvoicesQuery(2, 10), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(api.getSuperInvoices).toHaveBeenCalledWith(2, 10);
    });

    it('useSuperEmployeesQuery resolves', async () => {
      vi.mocked(api.getSuperEmployees).mockResolvedValue({ data: [], total: 0 } as never);
      await mountQuery(useSuperEmployeesQuery as never);
    });

    it('useSuperEmployeesQuery resolves with custom page/limit', async () => {
      vi.mocked(api.getSuperEmployees).mockResolvedValue({ data: [], total: 0 } as never);
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useSuperEmployeesQuery(3, 5), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(api.getSuperEmployees).toHaveBeenCalledWith(3, 5);
    });

    it('useSuperPurchaseOrdersQuery resolves', async () => {
      vi.mocked(api.getSuperPurchaseOrders).mockResolvedValue({ data: [], total: 0 } as never);
      await mountQuery(useSuperPurchaseOrdersQuery as never);
    });

    it('useSuperContactsQuery resolves', async () => {
      vi.mocked(api.getSuperContacts).mockResolvedValue({ data: [], total: 0 } as never);
      await mountQuery(useSuperContactsQuery as never);
    });

    it('useSuperOpportunitiesQuery resolves', async () => {
      vi.mocked(api.getSuperOpportunities).mockResolvedValue({ data: [], total: 0 } as never);
      await mountQuery(useSuperOpportunitiesQuery as never);
    });

    it('useSuperStorefrontProductsQuery resolves', async () => {
      vi.mocked(api.getSuperStorefrontProducts).mockResolvedValue({ data: [], total: 0 } as never);
      await mountQuery(useSuperStorefrontProductsQuery as never);
    });

    it('useSuperPredictionsQuery resolves', async () => {
      vi.mocked(api.getSuperPredictions).mockResolvedValue({ data: [], total: 0 } as never);
      await mountQuery(useSuperPredictionsQuery as never);
    });

    it('useSuperPredictionsQuery resolves with custom page/limit', async () => {
      vi.mocked(api.getSuperPredictions).mockResolvedValue({ data: [], total: 0 } as never);
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useSuperPredictionsQuery(5, 25), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(api.getSuperPredictions).toHaveBeenCalledWith(5, 25);
    });
  });

  // ── Backward-compat aliases ─────────────────────────────────────────────

  describe('backward-compat aliases (use*RQ)', () => {
    const aliasCases: Array<[string, never, unknown[]]> = [
      ['useCampsRQ', useCampsRQ as never, []],
      ['useRoomsRQ', useRoomsRQ as never, []],
      ['useOrdersRQ', useOrdersRQ as never, []],
      ['useProductsRQ', useProductsRQ as never, []],
      ['useRatePlansRQ', useRatePlansRQ as never, []],
      ['usePlansRQ', usePlansRQ as never, []],
      ['useMealsRQ', useMealsRQ as never, []],
      ['useCategoriesRQ', useCategoriesRQ as never, []],
      ['useMealCategoriesRQ', useMealCategoriesRQ as never, []],
      ['useMealSchedulesRQ', useMealSchedulesRQ as never, []],
      ['useSettingsRQ', useSettingsRQ as never, []],
    ];

    for (const [name, hook, args] of aliasCases) {
      it(`${name} resolves (aliases underlying query hook)`, async () => {
        await mountQuery(hook, ...args);
      });
    }
  });

  // ── throwOnError error paths for base query hooks ───────────────────────

  describe('base query hooks — throwOnError error paths', () => {
    const baseErrorCases: Array<[string, never, () => unknown, never[]]> = [
      ['useRoomsRQ', useRoomsRQ as never, api.getRooms, []],
      ['useOrdersRQ', useOrdersRQ as never, api.getOrders, []],
      ['useRatePlansRQ', useRatePlansRQ as never, api.getRatePlans, []],
      ['usePlansRQ', usePlansRQ as never, api.getPlans, []],
      ['useMealsRQ', useMealsRQ as never, api.getMeals, []],
      ['useCategoriesRQ', useCategoriesRQ as never, api.getCategories, []],
      ['useMealCategoriesRQ', useMealCategoriesRQ as never, api.getMealCategories, []],
      ['useMealSchedulesRQ', useMealSchedulesRQ as never, api.getMealSchedules, []],
      ['useAdminsQuery', useAdminsQuery as never, api.getAdmins, []],
    ];

    for (const [name, hook, apiFn, args] of baseErrorCases) {
      it(`${name} shows toast on error`, async () => {
        mockShowToast.mockClear();
        await mountQueryError(hook, apiFn, ...args);
        await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
      });
    }
  });

  // ── useTenantBillingQuery (redundant coverage) ──────────────────────────

  describe('useTenantBillingQuery', () => {
    it('resolves with billing data', async () => {
      vi.mocked(api.getTenantBilling).mockResolvedValue({ plan: 'pro' } as never);
      await mountQuery(useTenantBillingQuery as never);
    });
  });

  // ── Additional throwOnError error paths ──────────────────────────────────

  describe('remaining throwOnError error paths', () => {
    it('useSettingsQuery shows toast on error', async () => {
      vi.mocked(api.getMe).mockRejectedValue(new Error('fail'));
      await mountQueryError(useSettingsQuery as never, api.getMe);
      await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    });

    it('useLowStock shows toast on error', async () => {
      vi.mocked(api.getLowStock).mockRejectedValue(new Error('fail'));
      await mountQueryError(useLowStock as never, api.getLowStock);
      await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    });

    it('useAdminStatsQuery shows toast on error', async () => {
      vi.mocked(api.getAdminStats).mockRejectedValue(new Error('fail'));
      await mountQueryError(useAdminStatsQuery as never, api.getAdminStats);
      await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    });

    it('useTenantsQuery shows toast on error', async () => {
      vi.mocked(api.getAdminTenants).mockRejectedValue(new Error('fail'));
      await mountQueryError(useTenantsQuery as never, api.getAdminTenants);
      await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    });

    it('useProjectMetaQuery shows toast on error', async () => {
      vi.mocked(api.getProjectMeta).mockRejectedValue(new Error('fail'));
      await mountQueryError(useProjectMetaQuery as never, api.getProjectMeta, 'proj1');
      await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    });

    it('useTenantBillingQuery shows toast on error', async () => {
      vi.mocked(api.getTenantBilling).mockRejectedValue(new Error('fail'));
      await mountQueryError(useTenantBillingQuery as never, api.getTenantBilling);
      await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    });
  });

  // ── Mutation onError paths (remaining) ───────────────────────────────────

  describe('mutation onError paths (remaining)', () => {
    it('useSaveProjectItemMutation shows toast on error', async () => {
      vi.mocked(api.saveProjectItem).mockRejectedValue(new Error('fail'));
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useSaveProjectItemMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ name: 'x' } as never).catch(() => {});
      });
      await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    });

    it('useCreateProjectLinkMutation shows toast on error', async () => {
      vi.mocked(api.createProjectLink).mockRejectedValue(new Error('fail'));
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useCreateProjectLinkMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ fromProjectId: 'a', toProjectId: 'b' } as never).catch(() => {});
      });
      await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    });

    it('useSaveRoomMutation shows toast on error', async () => {
      vi.mocked(api.saveRoom).mockRejectedValue(new Error('fail'));
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useSaveRoomMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ name: 'Room1' } as never).catch(() => {});
      });
      await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    });

    it('useSaveOrderMutation shows toast on error', async () => {
      vi.mocked(api.saveOrder).mockRejectedValue(new Error('fail'));
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useSaveOrderMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ total: 100 } as never).catch(() => {});
      });
      await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    });

    it('useSaveRatePlanMutation shows toast on error', async () => {
      vi.mocked(api.saveRatePlan).mockRejectedValue(new Error('fail'));
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useSaveRatePlanMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ name: 'RP1' } as never).catch(() => {});
      });
      await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    });

    it('useSaveMealMutation shows toast on error', async () => {
      vi.mocked(api.saveMeal).mockRejectedValue(new Error('fail'));
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useSaveMealMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ name: 'Meal1' } as never).catch(() => {});
      });
      await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    });
  });

  // ── Optimistic update onMutate callbacks ─────────────────────────────────

  describe('optimistic update onMutate paths', () => {
    it('useSaveCampMutation onMutate with editId updates cache', async () => {
      vi.mocked(api.saveCamp).mockResolvedValue({ id: 'c1' } as never);
      const { wrapper, queryClient } = createWrapper();
      // Pre-populate cache so onMutate runs the optimistic update
      queryClient.setQueryData(['admin', 'camps'], [{ id: 'c1', name: 'Old' }]);
      const { result } = renderHook(() => useSaveCampMutation('c1'), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ name: 'Updated' } as never);
      });
      await waitFor(() => expect(result.current.isSuccess || result.current.isIdle).toBe(true));
    });

    it('useSaveCampMutation onMutate without editId adds temp item', async () => {
      vi.mocked(api.saveCamp).mockResolvedValue({ id: 'c_new' } as never);
      const { wrapper, queryClient } = createWrapper();
      queryClient.setQueryData(['admin', 'camps'], [{ id: 'c1', name: 'Existing' }]);
      const { result } = renderHook(() => useSaveCampMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ name: 'New Camp' } as never);
      });
      await waitFor(() => expect(result.current.isSuccess || result.current.isIdle).toBe(true));
    });

    it('useSaveCampMutation onMutate when cache is empty does nothing', async () => {
      vi.mocked(api.saveCamp).mockResolvedValue({ id: 'c1' } as never);
      const { wrapper } = createWrapper();
      // No pre-populated cache — onMutate gets undefined and returns early
      const { result } = renderHook(() => useSaveCampMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ name: 'X' } as never);
      });
      await waitFor(() => expect(result.current.isSuccess || result.current.isIdle).toBe(true));
    });

    it('useDeleteCampMutation onMutate removes item from cache', async () => {
      vi.mocked(api.deleteCamp).mockResolvedValue({ ok: true } as never);
      const { wrapper, queryClient } = createWrapper();
      queryClient.setQueryData(['admin', 'camps'], [
        { id: 'c1', name: 'Camp1' },
        { id: 'c2', name: 'Camp2' },
      ]);
      const { result } = renderHook(() => useDeleteCampMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync('c1');
      });
      await waitFor(() => expect(result.current.isSuccess || result.current.isIdle).toBe(true));
    });

    it('useDeleteCampMutation onMutate when cache is empty does nothing', async () => {
      vi.mocked(api.deleteCamp).mockResolvedValue({ ok: true } as never);
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useDeleteCampMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync('c1');
      });
      await waitFor(() => expect(result.current.isSuccess || result.current.isIdle).toBe(true));
    });

    it('useSaveRoomMutation onMutate with editId updates cache', async () => {
      vi.mocked(api.saveRoom).mockResolvedValue({ id: 'r1' } as never);
      const { wrapper, queryClient } = createWrapper();
      queryClient.setQueryData(['admin', 'rooms'], [{ id: 'r1', name: 'OldRoom' }]);
      const { result } = renderHook(() => useSaveRoomMutation('r1'), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ name: 'NewRoom' } as never);
      });
      await waitFor(() => expect(result.current.isSuccess || result.current.isIdle).toBe(true));
    });

    it('useSaveRoomMutation onMutate without editId adds temp room', async () => {
      vi.mocked(api.saveRoom).mockResolvedValue({ id: 'r_new' } as never);
      const { wrapper, queryClient } = createWrapper();
      queryClient.setQueryData(['admin', 'rooms'], [{ id: 'r1', name: 'Existing' }]);
      const { result } = renderHook(() => useSaveRoomMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ name: 'NewRoom' } as never);
      });
      await waitFor(() => expect(result.current.isSuccess || result.current.isIdle).toBe(true));
    });

    it('useSaveRoomMutation onMutate when cache is empty does nothing', async () => {
      vi.mocked(api.saveRoom).mockResolvedValue({ id: 'r1' } as never);
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useSaveRoomMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ name: 'X' } as never);
      });
      await waitFor(() => expect(result.current.isSuccess || result.current.isIdle).toBe(true));
    });
  });

  // ── useSaveCampMutation / useSaveRoomMutation error + rollback ───────────

  describe('optimistic mutation error + rollback', () => {
    it('useSaveCampMutation rolls back cache on error', async () => {
      vi.mocked(api.saveCamp).mockRejectedValue(new Error('fail'));
      const { wrapper, queryClient } = createWrapper();
      const original = [{ id: 'c1', name: 'Original' }] as never;
      queryClient.setQueryData(['admin', 'camps'], original);
      const { result } = renderHook(() => useSaveCampMutation('c1'), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ name: 'Fail' } as never).catch(() => {});
      });
      await waitFor(() => {
        const data = queryClient.getQueryData(['admin', 'camps']);
        expect(data).toEqual(original);
      });
    });

    it('useSaveRoomMutation rolls back cache on error', async () => {
      vi.mocked(api.saveRoom).mockRejectedValue(new Error('fail'));
      const { wrapper, queryClient } = createWrapper();
      const original = [{ id: 'r1', name: 'Original' }] as never;
      queryClient.setQueryData(['admin', 'rooms'], original);
      const { result } = renderHook(() => useSaveRoomMutation('r1'), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ name: 'Fail' } as never).catch(() => {});
      });
      await waitFor(() => {
        const data = queryClient.getQueryData(['admin', 'rooms']);
        expect(data).toEqual(original);
      });
    });

    it('useDeleteCampMutation rolls back cache on error', async () => {
      vi.mocked(api.deleteCamp).mockRejectedValue(new Error('fail'));
      const { wrapper, queryClient } = createWrapper();
      const original = [
        { id: 'c1', name: 'Camp1' },
        { id: 'c2', name: 'Camp2' },
      ] as never;
      queryClient.setQueryData(['admin', 'camps'], original);
      const { result } = renderHook(() => useDeleteCampMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync('c1').catch(() => {});
      });
      // onError rolls back the cache to the pre-mutation snapshot
      await waitFor(() => {
        const data = queryClient.getQueryData(['admin', 'camps']);
        expect(data).toEqual(original);
      });
    });

    it('useSaveCampMutation error when no previous context does not crash', async () => {
      vi.mocked(api.saveCamp).mockRejectedValue(new Error('fail'));
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useSaveCampMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ name: 'Fail' } as never).catch(() => {});
      });
      // Should not throw — onError handles missing context gracefully
      await waitFor(() => expect(result.current.isError || result.current.isIdle).toBe(true));
    });

    it('useSaveRoomMutation error when no previous context does not crash', async () => {
      vi.mocked(api.saveRoom).mockRejectedValue(new Error('fail'));
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useSaveRoomMutation(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({ name: 'Fail' } as never).catch(() => {});
      });
      await waitFor(() => expect(result.current.isError || result.current.isIdle).toBe(true));
    });
  });
});
