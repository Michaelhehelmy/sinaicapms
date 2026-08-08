import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useCampsQuery, useProductsQuery, useRoomsQuery,
  useOrdersQuery, useRatePlansQuery, usePlansQuery,
  useMealsQuery, useCategoriesQuery, useMealCategoriesQuery,
  useMealSchedulesQuery, useSettingsQuery, useAdminStatsQuery, useTenantsQuery,
  useSaveCampMutation, useDeleteCampMutation,
  useSaveRoomMutation,
  useSaveOrderMutation, useDeleteOrderMutation,
  useSaveRatePlanMutation, useDeleteRatePlanMutation,
  useSaveMealMutation, useDeleteMealMutation,
  useSaveMealCategoryMutation, useDeleteMealCategoryMutation,
  useCreateMealScheduleMutation, useDeleteMealScheduleMutation,
  useSavePlanMutation, useDeletePlanMutation,
  useChangePasswordMutation,
  useOccupancyReportQuery, useRevenueReportQuery, useBookingsReportQuery,
  useAdminsQuery,
  useAvailabilityQuery, usePriceOverridesQuery,
  useSetPriceOverrideMutation, useDeletePriceOverrideMutation,
  queryKeys,
} from '@/hooks/useQueryHooks';

const mockShowToast = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const api = vi.hoisted(() => ({
  getCamps: vi.fn(), getProducts: vi.fn(), getRooms: vi.fn(), getOrders: vi.fn(),
  getRatePlans: vi.fn(), getPlans: vi.fn(), getMeals: vi.fn(), getCategories: vi.fn(),
  getMealCategories: vi.fn(), getMealSchedules: vi.fn(), getMe: vi.fn(),
  getAdminStats: vi.fn(), getTenants: vi.fn(), getAdminTenants: vi.fn(), getAdmins: vi.fn(),
  getOccupancyReport: vi.fn(), getRevenueReport: vi.fn(), getBookingsReport: vi.fn(),
  saveCamp: vi.fn(), deleteCamp: vi.fn(),
  saveRoom: vi.fn(),
  saveOrder: vi.fn(), deleteOrder: vi.fn(),
  saveRatePlan: vi.fn(), deleteRatePlan: vi.fn(),
  saveMeal: vi.fn(), deleteMeal: vi.fn(),
  saveMealCategory: vi.fn(), deleteMealCategory: vi.fn(),
  createMealSchedule: vi.fn(), deleteMealSchedule: vi.fn(),
  savePlan: vi.fn(), deletePlan: vi.fn(),
  getAvailability: vi.fn(), getPriceOverrides: vi.fn(),
  setPriceOverrides: vi.fn(), deletePriceOverride: vi.fn(),
  updateBranding: vi.fn(), changePassword: vi.fn(),
}));

vi.mock('@/lib/api', () => api);

function createWrapper(opts?: { gcTime?: number }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: opts?.gcTime ?? 0 },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper, queryClient };
}

beforeEach(() => {
  mockShowToast.mockClear();
  Object.values(api).forEach((fn) => {
    (fn as ReturnType<typeof vi.fn>).mockReset();
  });
});

describe('query hook error handlers', () => {
  const cases: Array<[string, () => { wrapper: React.ComponentType<{ children: React.ReactNode }>; queryClient: QueryClient }, string]> = [
    ['useCampsQuery', () => createWrapper(), 'Failed to load camps'],
    ['useProductsQuery', () => createWrapper(), 'Failed to load products'],
    ['useRoomsQuery', () => createWrapper(), 'Failed to load rooms'],
    ['useOrdersQuery', () => createWrapper(), 'Failed to load orders'],
    ['useRatePlansQuery', () => createWrapper(), 'Failed to load rate plans'],
    ['usePlansQuery', () => createWrapper(), 'Failed to load plans'],
    ['useMealsQuery', () => createWrapper(), 'Failed to load meals'],
    ['useCategoriesQuery', () => createWrapper(), 'Failed to load categories'],
    ['useMealCategoriesQuery', () => createWrapper(), 'Failed to load meal categories'],
    ['useMealSchedulesQuery', () => createWrapper(), 'Failed to load meal schedules'],
    ['useSettingsQuery', () => createWrapper(), 'Failed to load settings'],
    ['useAdminStatsQuery', () => createWrapper(), 'Failed to load platform stats'],
    ['useTenantsQuery', () => createWrapper(), 'Failed to load tenants'],
  ];

  it.each(cases)('%s shows error toast on failure', async (_name, makeWrapper, message) => {
    const { wrapper } = makeWrapper();
    const fail = new Error('boom');
    Object.values(api).forEach((fn) => {
      (fn as ReturnType<typeof vi.fn>).mockRejectedValue(fail);
    });
    // Need at least one hook to exercise — instantiate every hook
    renderHook(() => useCampsQuery(), { wrapper });
    renderHook(() => useProductsQuery(), { wrapper });
    renderHook(() => useRoomsQuery(), { wrapper });
    renderHook(() => useOrdersQuery(), { wrapper });
    renderHook(() => useRatePlansQuery(), { wrapper });
    renderHook(() => usePlansQuery(), { wrapper });
    renderHook(() => useMealsQuery(), { wrapper });
    renderHook(() => useCategoriesQuery(), { wrapper });
    renderHook(() => useMealCategoriesQuery(), { wrapper });
    renderHook(() => useMealSchedulesQuery(), { wrapper });
    renderHook(() => useSettingsQuery(), { wrapper });
    renderHook(() => useAdminStatsQuery(), { wrapper });
    renderHook(() => useTenantsQuery(), { wrapper });
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(`${message}: boom`, 'error');
    });
  });
});

describe('optimistic camp mutation cache paths', () => {
  it('adds a new camp when cache exists', async () => {
    const { wrapper, queryClient } = createWrapper({ gcTime: 60_000 });
    queryClient.setQueryData(queryKeys.camps, [{ id: '1', name: 'Old' }]);
    api.saveCamp.mockResolvedValue({ id: '2' });
    const { result } = renderHook(() => useSaveCampMutation(), { wrapper });
    act(() => { result.current.mutate({ name: 'New' }); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(queryKeys.camps)).toEqual([
      { id: '1', name: 'Old' },
      expect.objectContaining({ name: 'New', id: expect.stringMatching(/^temp_/) }),
    ]);
  });

  it('updates an existing camp in the cache', async () => {
    const { wrapper, queryClient } = createWrapper({ gcTime: 60_000 });
    queryClient.setQueryData(queryKeys.camps, [{ id: '5', name: 'Before' }]);
    api.saveCamp.mockResolvedValue({ id: '5' });
    const { result } = renderHook(() => useSaveCampMutation('5'), { wrapper });
    act(() => { result.current.mutate({ name: 'After' }); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(queryKeys.camps)).toEqual([{ id: '5', name: 'After' }]);
  });

  it('rolls back camp cache when save fails with prior cache', async () => {
    const { wrapper, queryClient } = createWrapper({ gcTime: 60_000 });
    queryClient.setQueryData(queryKeys.camps, [{ id: '5', name: 'Before' }]);
    api.saveCamp.mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() => useSaveCampMutation('5'), { wrapper });
    act(() => { result.current.mutate({ name: 'After' }); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData(queryKeys.camps)).toEqual([{ id: '5', name: 'Before' }]);
    expect(mockShowToast).toHaveBeenCalledWith('Failed to save camp: nope', 'error');
  });

  it('deletes a camp optimistically when cache exists', async () => {
    const { wrapper, queryClient } = createWrapper({ gcTime: 60_000 });
    queryClient.setQueryData(queryKeys.camps, [{ id: '1', name: 'A' }, { id: '2', name: 'B' }]);
    api.deleteCamp.mockResolvedValue({});
    const { result } = renderHook(() => useDeleteCampMutation(), { wrapper });
    act(() => { result.current.mutate('1'); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(queryKeys.camps)).toEqual([{ id: '2', name: 'B' }]);
  });

  it('rolls back camp deletion when delete fails with prior cache', async () => {
    const { wrapper, queryClient } = createWrapper({ gcTime: 60_000 });
    queryClient.setQueryData(queryKeys.camps, [{ id: '1', name: 'A' }, { id: '2', name: 'B' }]);
    api.deleteCamp.mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() => useDeleteCampMutation(), { wrapper });
    act(() => { result.current.mutate('1'); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData(queryKeys.camps)).toEqual([{ id: '1', name: 'A' }, { id: '2', name: 'B' }]);
    expect(mockShowToast).toHaveBeenCalledWith('Failed to delete camp: nope', 'error');
  });
});

describe('optimistic room mutation cache paths', () => {
  it('adds a new room when cache exists', async () => {
    const { wrapper, queryClient } = createWrapper({ gcTime: 60_000 });
    queryClient.setQueryData(queryKeys.rooms, [{ id: '1', name: 'R1' }]);
    api.saveRoom.mockResolvedValue({ id: '2' });
    const { result } = renderHook(() => useSaveRoomMutation(), { wrapper });
    act(() => { result.current.mutate({ name: 'R2' }); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(queryKeys.rooms)).toEqual([
      { id: '1', name: 'R1' },
      expect.objectContaining({ name: 'R2', id: expect.stringMatching(/^temp_/) }),
    ]);
  });

  it('updates an existing room in the cache', async () => {
    const { wrapper, queryClient } = createWrapper({ gcTime: 60_000 });
    queryClient.setQueryData(queryKeys.rooms, [{ id: '7', name: 'Before' }]);
    api.saveRoom.mockResolvedValue({ id: '7' });
    const { result } = renderHook(() => useSaveRoomMutation('7'), { wrapper });
    act(() => { result.current.mutate({ name: 'After' }); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(queryKeys.rooms)).toEqual([{ id: '7', name: 'After' }]);
  });

  it('rolls back room cache when save fails with prior cache', async () => {
    const { wrapper, queryClient } = createWrapper({ gcTime: 60_000 });
    queryClient.setQueryData(queryKeys.rooms, [{ id: '7', name: 'Before' }]);
    api.saveRoom.mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() => useSaveRoomMutation('7'), { wrapper });
    act(() => { result.current.mutate({ name: 'After' }); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData(queryKeys.rooms)).toEqual([{ id: '7', name: 'Before' }]);
    expect(mockShowToast).toHaveBeenCalledWith('Failed to save room: nope', 'error');
  });
});

describe('order mutations', () => {
  it('shows error toast when saving an order fails', async () => {
    const { wrapper } = createWrapper();
    api.saveOrder.mockRejectedValue(new Error('bad'));
    const { result } = renderHook(() => useSaveOrderMutation(), { wrapper });
    act(() => { result.current.mutate({ total: 1 }); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Failed to save order: bad', 'error');
  });

  it('shows error toast when deleting an order fails', async () => {
    const { wrapper } = createWrapper();
    api.deleteOrder.mockRejectedValue(new Error('bad'));
    const { result } = renderHook(() => useDeleteOrderMutation(), { wrapper });
    act(() => { result.current.mutate('1'); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Failed to delete order: bad', 'error');
  });
});

describe('rate plan mutations', () => {
  it('shows error toast when saving a rate plan fails', async () => {
    const { wrapper } = createWrapper();
    api.saveRatePlan.mockRejectedValue(new Error('bad'));
    const { result } = renderHook(() => useSaveRatePlanMutation(), { wrapper });
    act(() => { result.current.mutate({ name: 'P' }); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Failed to save rate plan: bad', 'error');
  });

  it('shows success toast when deleting a rate plan', async () => {
    const { wrapper } = createWrapper();
    api.deleteRatePlan.mockResolvedValue({});
    const { result } = renderHook(() => useDeleteRatePlanMutation(), { wrapper });
    act(() => { result.current.mutate('1'); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Rate plan deleted', 'success');
  });

  it('shows error toast when deleting a rate plan fails', async () => {
    const { wrapper } = createWrapper();
    api.deleteRatePlan.mockRejectedValue(new Error('bad'));
    const { result } = renderHook(() => useDeleteRatePlanMutation(), { wrapper });
    act(() => { result.current.mutate('1'); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Failed to delete rate plan: bad', 'error');
  });
});

describe('meal mutations', () => {
  it('shows error toast when saving a meal fails', async () => {
    const { wrapper } = createWrapper();
    api.saveMeal.mockRejectedValue(new Error('bad'));
    const { result } = renderHook(() => useSaveMealMutation(), { wrapper });
    act(() => { result.current.mutate({ name: 'M' }); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Failed to save meal: bad', 'error');
  });

  it('shows error toast when deleting a meal fails', async () => {
    const { wrapper } = createWrapper();
    api.deleteMeal.mockRejectedValue(new Error('bad'));
    const { result } = renderHook(() => useDeleteMealMutation(), { wrapper });
    act(() => { result.current.mutate('1'); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Failed to delete meal: bad', 'error');
  });
});

describe('meal category mutations', () => {
  it('creates a meal category', async () => {
    const { wrapper } = createWrapper();
    api.saveMealCategory.mockResolvedValue({ id: '1' });
    const { result } = renderHook(() => useSaveMealCategoryMutation(), { wrapper });
    act(() => { result.current.mutate({ name: 'Breakfast' }); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.saveMealCategory).toHaveBeenCalledWith({ name: 'Breakfast' }, undefined);
    expect(mockShowToast).toHaveBeenCalledWith('Category created', 'success');
  });

  it('updates a meal category', async () => {
    const { wrapper } = createWrapper();
    api.saveMealCategory.mockResolvedValue({ id: '1' });
    const { result } = renderHook(() => useSaveMealCategoryMutation('1'), { wrapper });
    act(() => { result.current.mutate({ name: 'Lunch' }); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Category updated', 'success');
  });

  it('shows error toast when saving a meal category fails', async () => {
    const { wrapper } = createWrapper();
    api.saveMealCategory.mockRejectedValue(new Error('bad'));
    const { result } = renderHook(() => useSaveMealCategoryMutation(), { wrapper });
    act(() => { result.current.mutate({ name: 'X' }); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Failed to save category: bad', 'error');
  });

  it('deletes a meal category', async () => {
    const { wrapper } = createWrapper();
    api.deleteMealCategory.mockResolvedValue({});
    const { result } = renderHook(() => useDeleteMealCategoryMutation(), { wrapper });
    act(() => { result.current.mutate('1'); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Category deleted', 'success');
  });

  it('shows error toast when deleting a meal category fails', async () => {
    const { wrapper } = createWrapper();
    api.deleteMealCategory.mockRejectedValue(new Error('bad'));
    const { result } = renderHook(() => useDeleteMealCategoryMutation(), { wrapper });
    act(() => { result.current.mutate('1'); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Failed to delete category: bad', 'error');
  });
});

describe('meal schedule mutations', () => {
  it('creates a meal schedule', async () => {
    const { wrapper } = createWrapper();
    api.createMealSchedule.mockResolvedValue({ id: '1' });
    const payload = { campId: 'c1', date: '2025-01-01', mealId: 'm1' };
    const { result } = renderHook(() => useCreateMealScheduleMutation(), { wrapper });
    act(() => { result.current.mutate(payload); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.createMealSchedule).toHaveBeenCalledWith(payload);
    expect(mockShowToast).toHaveBeenCalledWith('Meal scheduled', 'success');
  });

  it('shows error toast when creating a meal schedule fails', async () => {
    const { wrapper } = createWrapper();
    api.createMealSchedule.mockRejectedValue(new Error('bad'));
    const { result } = renderHook(() => useCreateMealScheduleMutation(), { wrapper });
    act(() => { result.current.mutate({ campId: 'c1', date: '2025-01-01', mealId: 'm1' }); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Failed to schedule meal: bad', 'error');
  });

  it('deletes a meal schedule', async () => {
    const { wrapper } = createWrapper();
    api.deleteMealSchedule.mockResolvedValue({});
    const { result } = renderHook(() => useDeleteMealScheduleMutation(), { wrapper });
    act(() => { result.current.mutate('s1'); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Meal removed', 'success');
  });

  it('shows error toast when deleting a meal schedule fails', async () => {
    const { wrapper } = createWrapper();
    api.deleteMealSchedule.mockRejectedValue(new Error('bad'));
    const { result } = renderHook(() => useDeleteMealScheduleMutation(), { wrapper });
    act(() => { result.current.mutate('s1'); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Failed to remove meal: bad', 'error');
  });
});

describe('plan mutations', () => {
  it('creates a plan', async () => {
    const { wrapper } = createWrapper();
    api.savePlan.mockResolvedValue({ id: '1' });
    const { result } = renderHook(() => useSavePlanMutation(), { wrapper });
    act(() => { result.current.mutate({ name: 'Plan' }); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.savePlan).toHaveBeenCalledWith({ name: 'Plan' }, undefined);
    expect(mockShowToast).toHaveBeenCalledWith('Plan created', 'success');
  });

  it('shows error toast when saving a plan fails', async () => {
    const { wrapper } = createWrapper();
    api.savePlan.mockRejectedValue(new Error('bad'));
    const { result } = renderHook(() => useSavePlanMutation(), { wrapper });
    act(() => { result.current.mutate({ name: 'Plan' }); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Failed to save plan: bad', 'error');
  });

  it('deletes a plan', async () => {
    const { wrapper } = createWrapper();
    api.deletePlan.mockResolvedValue({});
    const { result } = renderHook(() => useDeletePlanMutation(), { wrapper });
    act(() => { result.current.mutate('1'); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Plan deleted', 'success');
  });

  it('shows error toast when deleting a plan fails', async () => {
    const { wrapper } = createWrapper();
    api.deletePlan.mockRejectedValue(new Error('bad'));
    const { result } = renderHook(() => useDeletePlanMutation(), { wrapper });
    act(() => { result.current.mutate('1'); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Failed to delete plan: bad', 'error');
  });
});

describe('change password mutation', () => {
  it('shows success toast on success', async () => {
    const { wrapper } = createWrapper();
    api.changePassword.mockResolvedValue({});
    const { result } = renderHook(() => useChangePasswordMutation(), { wrapper });
    act(() => { result.current.mutate({ currentPassword: 'a', newPassword: 'b' }); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.changePassword).toHaveBeenCalledWith('a', 'b');
    expect(mockShowToast).toHaveBeenCalledWith('Password changed successfully', 'success');
  });

  it('shows error toast on failure', async () => {
    const { wrapper } = createWrapper();
    api.changePassword.mockRejectedValue(new Error('bad'));
    const { result } = renderHook(() => useChangePasswordMutation(), { wrapper });
    act(() => { result.current.mutate({ currentPassword: 'a', newPassword: 'b' }); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Failed to change password: bad', 'error');
  });
});

describe('report queries', () => {
  it('useOccupancyReportQuery fetches and shows error toast on failure', async () => {
    const { wrapper } = createWrapper();
    api.getOccupancyReport.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useOccupancyReportQuery(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Failed to load occupancy report: boom', 'error');
  });

  it('useRevenueReportQuery fetches with opts and shows error toast on failure', async () => {
    const { wrapper } = createWrapper();
    api.getRevenueReport.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useRevenueReportQuery({ days: 7 }), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(api.getRevenueReport).toHaveBeenCalledWith({ days: 7 });
    expect(mockShowToast).toHaveBeenCalledWith('Failed to load revenue report: boom', 'error');
  });

  it('useBookingsReportQuery fetches and shows error toast on failure', async () => {
    const { wrapper } = createWrapper();
    api.getBookingsReport.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useBookingsReportQuery(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(api.getBookingsReport).toHaveBeenCalledWith(undefined);
    expect(mockShowToast).toHaveBeenCalledWith('Failed to load bookings report: boom', 'error');
  });
});

describe('useAdminsQuery', () => {
  it('fetches admins', async () => {
    const { wrapper } = createWrapper();
    api.getAdmins.mockResolvedValue([{ id: '1', email: 'a@b.com' }]);
    const { result } = renderHook(() => useAdminsQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: '1', email: 'a@b.com' }]);
  });

  it('shows error toast on failure', async () => {
    const { wrapper } = createWrapper();
    api.getAdmins.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useAdminsQuery(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Failed to load admins: boom', 'error');
  });
});

describe('availability query', () => {
  it('fetches availability with params', async () => {
    const { wrapper } = createWrapper();
    const data = { availability: [{ productId: 'p1', availableCount: 2, rooms: [] }] };
    api.getAvailability.mockResolvedValue(data);
    const { result } = renderHook(
      () => useAvailabilityQuery({ checkIn: '2026-01-01', checkOut: '2026-01-05' }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.getAvailability).toHaveBeenCalledWith({ checkIn: '2026-01-01', checkOut: '2026-01-05' });
    expect(result.current.data).toEqual(data);
  });

  it('shows error toast on failure', async () => {
    const { wrapper } = createWrapper();
    api.getAvailability.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useAvailabilityQuery({}), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Failed to load availability: boom', 'error');
  });
});

describe('price override query', () => {
  it('fetches overrides with params', async () => {
    const { wrapper } = createWrapper();
    const data = { overrides: [{ id: 1, productId: 'p1', date: '2026-01-01', price: 120, updatedAt: null }] };
    api.getPriceOverrides.mockResolvedValue(data);
    const { result } = renderHook(
      () => usePriceOverridesQuery({ productId: 'p1', from: '2026-01-01', to: '2026-01-31' }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.getPriceOverrides).toHaveBeenCalledWith({ productId: 'p1', from: '2026-01-01', to: '2026-01-31' });
    expect(result.current.data).toEqual(data);
  });

  it('shows error toast on failure', async () => {
    const { wrapper } = createWrapper();
    api.getPriceOverrides.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => usePriceOverridesQuery({ productId: 'p1' }), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Failed to load price overrides: boom', 'error');
  });
});

describe('price override mutations', () => {
  it('shows success toast when saving price overrides', async () => {
    const { wrapper } = createWrapper();
    api.setPriceOverrides.mockResolvedValue({ success: true, productId: 'p1', count: 1 });
    const { result } = renderHook(() => useSetPriceOverrideMutation(), { wrapper });
    act(() => { result.current.mutate({ productId: 'p1', overrides: [{ date: '2026-01-01', price: 120 }] }); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.setPriceOverrides).toHaveBeenCalledWith({ productId: 'p1', overrides: [{ date: '2026-01-01', price: 120 }] });
    expect(mockShowToast).toHaveBeenCalledWith('Price override saved', 'success');
  });

  it('shows error toast when saving price overrides fails', async () => {
    const { wrapper } = createWrapper();
    api.setPriceOverrides.mockRejectedValue(new Error('bad'));
    const { result } = renderHook(() => useSetPriceOverrideMutation(), { wrapper });
    act(() => { result.current.mutate({ productId: 'p1', overrides: [{ date: '2026-01-01', price: 120 }] }); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Failed to save price override: bad', 'error');
  });

  it('shows success toast when clearing a price override', async () => {
    const { wrapper } = createWrapper();
    api.deletePriceOverride.mockResolvedValue({ success: true });
    const { result } = renderHook(() => useDeletePriceOverrideMutation(), { wrapper });
    act(() => { result.current.mutate({ productId: 'p1', date: '2026-01-01' }); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.deletePriceOverride).toHaveBeenCalledWith('p1', '2026-01-01');
    expect(mockShowToast).toHaveBeenCalledWith('Price override cleared', 'success');
  });

  it('shows error toast when clearing a price override fails', async () => {
    const { wrapper } = createWrapper();
    api.deletePriceOverride.mockRejectedValue(new Error('bad'));
    const { result } = renderHook(() => useDeletePriceOverrideMutation(), { wrapper });
    act(() => { result.current.mutate({ productId: 'p1', date: '2026-01-01' }); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Failed to clear price override: bad', 'error');
  });
});
