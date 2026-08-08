import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  queryKeys,
  useCampsQuery,
  useProductsQuery,
  useRoomsQuery,
  useOrdersQuery,
  useRatePlansQuery,
  usePlansQuery,
  useMealsQuery,
  useCategoriesQuery,
  useMealCategoriesQuery,
  useSettingsQuery,
  useAdminStatsQuery,
  useTenantsQuery,
  useLowStock,
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
  getAdminTenants: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 50, hasMore: false }),
  getLowStock: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50, hasMore: false }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper, queryClient };
}

describe('queryKeys', () => {
  it('has correct key factories', () => {
    expect(queryKeys.camps).toEqual(['camps']);
    expect(queryKeys.camp('1')).toEqual(['camps', '1']);
    expect(queryKeys.products).toEqual(['products']);
    expect(queryKeys.rooms).toEqual(['rooms']);
    expect(queryKeys.orders()).toEqual(['orders', undefined]);
    expect(queryKeys.orders({ status: 'active' })).toEqual(['orders', { status: 'active' }]);
    expect(queryKeys.order('1')).toEqual(['orders', '1']);
    expect(queryKeys.ratePlans).toEqual(['ratePlans']);
    expect(queryKeys.plans).toEqual(['plans']);
    expect(queryKeys.meals).toEqual(['meals']);
    expect(queryKeys.categories).toEqual(['categories']);
    expect(queryKeys.mealCategories).toEqual(['mealCategories']);
    expect(queryKeys.settings).toEqual(['settings']);
    expect(queryKeys.adminStats).toEqual(['adminStats']);
    expect(queryKeys.tenants).toEqual(['tenants']);
    expect(queryKeys.admins).toEqual(['admins']);
    expect(queryKeys.lowStock).toEqual(['inventory', 'low-stock']);
  });
});

describe('useLowStock', () => {
  beforeEach(() => {
    mockShowToast.mockClear();
  });

  it('fetches low-stock items', async () => {
    const api = await import('@/lib/api');
    const payload = {
      items: [{ id: 'i1', name: 'Water Bottles', stockQuantity: 2, minStockLevel: 10, status: 'low' }],
      total: 1,
      page: 1,
      pageSize: 50,
      hasMore: false,
    };
    (api.getLowStock as ReturnType<typeof vi.fn>).mockResolvedValue(payload);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useLowStock(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(payload);
  });

  it('enters error state and shows toast on failure', async () => {
    const api = await import('@/lib/api');
    (api.getLowStock as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Stock error'));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useLowStock(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Stock error');
    expect(result.current.data).toBeUndefined();
  });
});

describe('useCampsQuery', () => {
  beforeEach(() => {
    mockShowToast.mockClear();
  });

  it('fetches camps data', async () => {
    const api = await import('@/lib/api');
    (api.getCamps as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: '1', name: 'Test Camp' }]);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCampsQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: '1', name: 'Test Camp' }]);
  });

  it('enters error state on failure', async () => {
    const api = await import('@/lib/api');
    (api.getCamps as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCampsQuery(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Network error');
    expect(result.current.data).toBeUndefined();
  });
});

describe('useProductsQuery', () => {
  beforeEach(() => { mockShowToast.mockClear(); });

  it('fetches products data', async () => {
    const api = await import('@/lib/api');
    (api.getProducts as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'p1', name: 'Deluxe' }]);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProductsQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'p1', name: 'Deluxe' }]);
  });

  it('enters error state on failure', async () => {
    const api = await import('@/lib/api');
    (api.getProducts as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Fail'));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProductsQuery(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Fail');
    expect(result.current.data).toBeUndefined();
  });
});

describe('useRoomsQuery', () => {
  beforeEach(() => { mockShowToast.mockClear(); });

  it('fetches rooms data', async () => {
    const api = await import('@/lib/api');
    (api.getRooms as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'r1', name: 'Room 1' }]);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useRoomsQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'r1', name: 'Room 1' }]);
  });
});

describe('useOrdersQuery', () => {
  beforeEach(() => { mockShowToast.mockClear(); });

  it('fetches orders data', async () => {
    const api = await import('@/lib/api');
    (api.getOrders as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [{ id: 'o1' }], total: 1 });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useOrdersQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ data: [{ id: 'o1' }], total: 1 });
  });

  it('passes params to API', async () => {
    const api = await import('@/lib/api');
    (api.getOrders as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], total: 0 });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useOrdersQuery({ status: 'confirmed' }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.getOrders).toHaveBeenCalledWith({ status: 'confirmed' });
  });
});

describe('useRatePlansQuery', () => {
  beforeEach(() => { mockShowToast.mockClear(); });

  it('fetches rate plans', async () => {
    const api = await import('@/lib/api');
    (api.getRatePlans as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'rp1' }]);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useRatePlansQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'rp1' }]);
  });
});

describe('usePlansQuery', () => {
  beforeEach(() => { mockShowToast.mockClear(); });

  it('fetches plans', async () => {
    const api = await import('@/lib/api');
    (api.getPlans as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'pl1' }]);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => usePlansQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'pl1' }]);
  });
});

describe('useMealsQuery', () => {
  beforeEach(() => { mockShowToast.mockClear(); });

  it('fetches meals', async () => {
    const api = await import('@/lib/api');
    (api.getMeals as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'm1' }]);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useMealsQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'm1' }]);
  });
});

describe('useCategoriesQuery', () => {
  beforeEach(() => { mockShowToast.mockClear(); });

  it('fetches categories', async () => {
    const api = await import('@/lib/api');
    (api.getCategories as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'c1' }]);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCategoriesQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'c1' }]);
  });
});

describe('useMealCategoriesQuery', () => {
  beforeEach(() => { mockShowToast.mockClear(); });

  it('fetches meal categories', async () => {
    const api = await import('@/lib/api');
    (api.getMealCategories as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'mc1' }]);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useMealCategoriesQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'mc1' }]);
  });
});

describe('useSettingsQuery', () => {
  beforeEach(() => { mockShowToast.mockClear(); });

  it('fetches settings', async () => {
    const api = await import('@/lib/api');
    (api.getMe as ReturnType<typeof vi.fn>).mockResolvedValue({ name: 'Camp' });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSettingsQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ name: 'Camp' });
  });
});

describe('useAdminStatsQuery', () => {
  beforeEach(() => { mockShowToast.mockClear(); });

  it('fetches admin stats', async () => {
    const api = await import('@/lib/api');
    (api.getAdminStats as ReturnType<typeof vi.fn>).mockResolvedValue({ totalTenants: 5 });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAdminStatsQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ totalTenants: 5 });
  });
});

describe('useTenantsQuery', () => {
  beforeEach(() => { mockShowToast.mockClear(); });

  it('fetches tenants', async () => {
    const api = await import('@/lib/api');
    (api.getAdminTenants as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: 't1' }], total: 1, page: 1, pageSize: 50, hasMore: false,
    });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useTenantsQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      data: [{ id: 't1' }], total: 1, page: 1, pageSize: 50, hasMore: false,
    });
  });
});
