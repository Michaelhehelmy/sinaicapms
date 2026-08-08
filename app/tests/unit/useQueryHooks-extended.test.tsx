import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useCampsQuery, useProductsQuery, useRoomsQuery,
  useOrdersQuery, useRatePlansQuery, usePlansQuery,
  useMealsQuery, useCategoriesQuery, useMealCategoriesQuery,
  useMealSchedulesQuery, useSettingsQuery, useAdminStatsQuery, useTenantsQuery,
  useSaveCampMutation, useDeleteCampMutation,
  useSaveProductMutation, useDeleteProductMutation,
  useSaveRoomMutation, useDeleteRoomMutation,
  useSaveOrderMutation, useDeleteOrderMutation,
  useSaveRatePlanMutation, useDeleteRatePlanMutation,
  useSaveMealMutation, useDeleteMealMutation,
  useUpdateSettingsMutation,
  useSaveSettingsMutation,
} from '@/hooks/useQueryHooks';

const mockShowToast = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/api', () => ({
  getCamps: vi.fn().mockResolvedValue([]),
  getProducts: vi.fn().mockResolvedValue([]),
  getRooms: vi.fn().mockResolvedValue([]),
  getOrders: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  getRatePlans: vi.fn().mockResolvedValue([]),
  getPlans: vi.fn().mockResolvedValue([]),
  getMeals: vi.fn().mockResolvedValue([]),
  getCategories: vi.fn().mockResolvedValue([]),
  getMealCategories: vi.fn().mockResolvedValue([]),
  getMealSchedules: vi.fn().mockResolvedValue([]),
  getMe: vi.fn().mockResolvedValue({}),
  getAdminStats: vi.fn().mockResolvedValue({}),
  getTenants: vi.fn().mockResolvedValue([]),
  saveCamp: vi.fn().mockResolvedValue({ id: '1' }),
  deleteCamp: vi.fn().mockResolvedValue({}),
  saveProduct: vi.fn().mockResolvedValue({ id: '1' }),
  deleteProduct: vi.fn().mockResolvedValue({}),
  saveRoom: vi.fn().mockResolvedValue({ id: '1' }),
  deleteRoom: vi.fn().mockResolvedValue({}),
  saveOrder: vi.fn().mockResolvedValue({ id: '1' }),
  deleteOrder: vi.fn().mockResolvedValue({}),
  saveRatePlan: vi.fn().mockResolvedValue({ id: '1' }),
  deleteRatePlan: vi.fn().mockResolvedValue({}),
  saveMeal: vi.fn().mockResolvedValue({ id: '1' }),
  deleteMeal: vi.fn().mockResolvedValue({}),
  updateBranding: vi.fn().mockResolvedValue({}),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper, queryClient };
}

describe('useMealSchedulesQuery', () => {
  beforeEach(() => { mockShowToast.mockClear(); });

  it('fetches meal schedules', async () => {
    const api = await import('@/lib/api');
    (api.getMealSchedules as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'ms1' }]);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useMealSchedulesQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'ms1' }]);
  });

  it('passes params to API', async () => {
    const api = await import('@/lib/api');
    (api.getMealSchedules as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const { wrapper } = createWrapper();
    renderHook(() => useMealSchedulesQuery({ campId: '1' }), { wrapper });
    await waitFor(() => expect(api.getMealSchedules).toHaveBeenCalledWith({ campId: '1' }));
  });
});

describe('useCampsQuery loading state', () => {
  it('shows loading while fetching', async () => {
    const api = await import('@/lib/api');
    (api.getCamps as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCampsQuery(), { wrapper });
    expect(result.current.isLoading).toBe(true);
  });
});

// ─── Mutation Hooks ──────────────────────────────────────────────────

describe('useSaveCampMutation', () => {
  beforeEach(() => { mockShowToast.mockClear(); });

  it('creates a new camp on success', async () => {
    const api = await import('@/lib/api');
    (api.saveCamp as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'new-1' });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveCampMutation(), { wrapper });
    result.current.mutate({ name: 'New Camp' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Camp created', 'success');
  });

  it('updates an existing camp', async () => {
    const api = await import('@/lib/api');
    (api.saveCamp as ReturnType<typeof vi.fn>).mockResolvedValue({ id: '1' });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveCampMutation('1'), { wrapper });
    result.current.mutate({ name: 'Updated' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Camp updated', 'success');
  });

  it('handles error state', async () => {
    const api = await import('@/lib/api');
    (api.saveCamp as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Save failed'));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveCampMutation(), { wrapper });
    result.current.mutate({ name: 'Fail' });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Failed to save camp: Save failed', 'error');
  });
});

describe('useDeleteCampMutation', () => {
  beforeEach(() => { mockShowToast.mockClear(); });

  it('deletes a camp', async () => {
    const api = await import('@/lib/api');
    (api.deleteCamp as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useDeleteCampMutation(), { wrapper });
    result.current.mutate('1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Camp deleted', 'success');
  });

  it('handles error', async () => {
    const api = await import('@/lib/api');
    (api.deleteCamp as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Delete failed'));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useDeleteCampMutation(), { wrapper });
    result.current.mutate('1');
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Failed to delete camp: Delete failed', 'error');
  });
});

describe('useSaveProductMutation', () => {
  beforeEach(() => { mockShowToast.mockClear(); });

  it('creates a product', async () => {
    const api = await import('@/lib/api');
    (api.saveProduct as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1' });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveProductMutation(), { wrapper });
    result.current.mutate({ name: 'Deluxe' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Product created', 'success');
  });

  it('updates a product', async () => {
    const api = await import('@/lib/api');
    (api.saveProduct as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveProductMutation('p1'), { wrapper });
    result.current.mutate({ name: 'Updated' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Product updated', 'success');
  });

  it('shows an error toast when saving fails', async () => {
    const api = await import('@/lib/api');
    (api.saveProduct as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Save product failed'));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveProductMutation(), { wrapper });
    result.current.mutate({ name: 'Deluxe' });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Failed to save product: Save product failed', 'error');
  });
});

describe('useDeleteProductMutation', () => {
  beforeEach(() => { mockShowToast.mockClear(); });

  it('deletes a product', async () => {
    const api = await import('@/lib/api');
    (api.deleteProduct as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useDeleteProductMutation(), { wrapper });
    result.current.mutate('p1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Product deleted', 'success');
  });
});

describe('useSaveRoomMutation', () => {
  beforeEach(() => { mockShowToast.mockClear(); });

  it('creates a room', async () => {
    const api = await import('@/lib/api');
    (api.saveRoom as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'r1' });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveRoomMutation(), { wrapper });
    result.current.mutate({ name: 'Room 1' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Room created', 'success');
  });

  it('updates a room', async () => {
    const api = await import('@/lib/api');
    (api.saveRoom as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveRoomMutation('r1'), { wrapper });
    result.current.mutate({ name: 'Updated' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Room updated', 'success');
  });
});

describe('useDeleteRoomMutation', () => {
  beforeEach(() => { mockShowToast.mockClear(); });

  it('deletes a room', async () => {
    const api = await import('@/lib/api');
    (api.deleteRoom as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useDeleteRoomMutation(), { wrapper });
    result.current.mutate('r1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Room deleted', 'success');
  });
});

describe('useSaveOrderMutation', () => {
  beforeEach(() => { mockShowToast.mockClear(); });

  it('creates an order', async () => {
    const api = await import('@/lib/api');
    (api.saveOrder as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'o1' });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveOrderMutation(), { wrapper });
    result.current.mutate({ numberOfPeople: 3 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Order created', 'success');
  });
});

describe('useDeleteOrderMutation', () => {
  beforeEach(() => { mockShowToast.mockClear(); });

  it('deletes an order', async () => {
    const api = await import('@/lib/api');
    (api.deleteOrder as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useDeleteOrderMutation(), { wrapper });
    result.current.mutate('o1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Order deleted', 'success');
  });
});

describe('useSaveRatePlanMutation', () => {
  beforeEach(() => { mockShowToast.mockClear(); });

  it('creates a rate plan', async () => {
    const api = await import('@/lib/api');
    (api.saveRatePlan as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveRatePlanMutation(), { wrapper });
    result.current.mutate({ name: 'Summer' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Rate plan created', 'success');
  });
});

describe('useDeleteRatePlanMutation', () => {
  beforeEach(() => { mockShowToast.mockClear(); });

  it('deletes a rate plan', async () => {
    const api = await import('@/lib/api');
    (api.deleteRatePlan as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useDeleteRatePlanMutation(), { wrapper });
    result.current.mutate('rp1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Rate plan deleted', 'success');
  });
});

describe('useSaveMealMutation', () => {
  beforeEach(() => { mockShowToast.mockClear(); });

  it('creates a meal', async () => {
    const api = await import('@/lib/api');
    (api.saveMeal as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveMealMutation(), { wrapper });
    result.current.mutate({ name: 'Breakfast' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Meal created', 'success');
  });
});

describe('useDeleteMealMutation', () => {
  beforeEach(() => { mockShowToast.mockClear(); });

  it('deletes a meal', async () => {
    const api = await import('@/lib/api');
    (api.deleteMeal as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useDeleteMealMutation(), { wrapper });
    result.current.mutate('m1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Meal deleted', 'success');
  });
});

describe('useUpdateSettingsMutation', () => {
  beforeEach(() => { mockShowToast.mockClear(); });

  it('updates settings', async () => {
    const api = await import('@/lib/api');
    (api.updateBranding as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateSettingsMutation(), { wrapper });
    result.current.mutate({ name: 'New Camp' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Settings saved', 'success');
  });

  it('shows an error toast when saving settings fails', async () => {
    const api = await import('@/lib/api');
    (api.updateBranding as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Branding failed'));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateSettingsMutation(), { wrapper });
    result.current.mutate({ name: 'New Camp' });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Failed to save settings: Branding failed', 'error');
  });
});

describe('useSaveSettingsMutation', () => {
  beforeEach(() => { mockShowToast.mockClear(); });

  it('is an alias that saves settings', async () => {
    const api = await import('@/lib/api');
    (api.updateBranding as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveSettingsMutation(), { wrapper });
    result.current.mutate({ name: 'Alias Camp' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Settings saved', 'success');
  });
});
