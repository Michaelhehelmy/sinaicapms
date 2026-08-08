import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  useCamps,
  useOrders,
  useProducts,
  useRooms,
  useRatePlans,
  usePlans,
  useMeals,
  useCategories,
  useMealCategories,
  useMealSchedules,
  useSettings,
} from '@/hooks/useAdminData';

vi.mock('@/lib/api', () => ({
  getCamps: vi.fn(),
  getOrders: vi.fn(),
  getProducts: vi.fn(),
  getRooms: vi.fn(),
  getRatePlans: vi.fn(),
  getPlans: vi.fn(),
  getMeals: vi.fn(),
  getCategories: vi.fn(),
  getMealCategories: vi.fn(),
  getMealSchedules: vi.fn(),
  getMe: vi.fn(),
}));

import {
  getCamps,
  getOrders,
  getProducts,
  getRooms,
  getRatePlans,
  getPlans,
  getMeals,
  getCategories,
  getMealCategories,
  getMealSchedules,
  getMe,
} from '@/lib/api';

function HookConsumer({ hook }: { hook: () => ReturnType<typeof useCamps> }) {
  const { data, loading, error, refresh } = hook();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="error">{error ?? 'null'}</span>
      <span data-testid="data">{JSON.stringify(data)}</span>
      <button onClick={refresh} data-testid="refresh-btn">
        Refresh
      </button>
    </div>
  );
}

describe('useCamps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns loading state initially', async () => {
    vi.mocked(getCamps).mockImplementation(() => new Promise(() => {}));

    await act(async () => {
      render(<HookConsumer hook={useCamps} />);
    });

    expect(screen.getByTestId('loading').textContent).toBe('true');
    expect(screen.getByTestId('error').textContent).toBe('null');
  });

  it('returns data after successful fetch', async () => {
    const mockData = [{ id: '1', name: 'Camp A', location: 'Sinai', startDate: '2026-01-01', endDate: '2026-01-05', capacity: 10, status: 'active', notes: '' }];
    vi.mocked(getCamps).mockResolvedValue(mockData as never);

    await act(async () => {
      render(<HookConsumer hook={useCamps} />);
    });

    expect(screen.getByTestId('loading').textContent).toBe('false');
    expect(screen.getByTestId('error').textContent).toBe('null');
    expect(screen.getByTestId('data').textContent).toContain('Camp A');
  });

  it('returns error state on failed fetch', async () => {
    vi.mocked(getCamps).mockRejectedValue(new Error('Network error'));

    await act(async () => {
      render(<HookConsumer hook={useCamps} />);
    });

    expect(screen.getByTestId('loading').textContent).toBe('false');
    expect(screen.getByTestId('error').textContent).toBe('Network error');
  });

  it('refresh re-fetches data', async () => {
    const mockData = [{ id: '1', name: 'Camp A', location: 'Sinai', startDate: '2026-01-01', endDate: '2026-01-05', capacity: 10, status: 'active', notes: '' }];
    vi.mocked(getCamps).mockResolvedValue(mockData as never);

    await act(async () => {
      render(<HookConsumer hook={useCamps} />);
    });

    expect(screen.getByTestId('loading').textContent).toBe('false');

    const updatedData = [{ id: '2', name: 'Camp B', location: 'Sinai', startDate: '2026-02-01', endDate: '2026-02-05', capacity: 20, status: 'active', notes: '' }];
    vi.mocked(getCamps).mockResolvedValue(updatedData as never);

    await act(async () => {
      screen.getByTestId('refresh-btn').click();
    });

    expect(screen.getByTestId('data').textContent).toContain('Camp B');
  });

  it('cleanup on unmount prevents state update', async () => {
    let resolveFetch: (value: unknown) => void;
    vi.mocked(getCamps).mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve; }),
    );

    const { unmount } = await act(async () => {
      return render(<HookConsumer hook={useCamps} />);
    });

    unmount();

    await act(async () => {
      resolveFetch!([{ id: '1', name: 'Camp A' }]);
    });
  });
});

describe('useOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns correct data structure for useOrders hook', async () => {
    const mockData = {
      data: [{ id: '1', tenantId: '1', campId: '1', roomId: '1', customerId: '10', orderStateId: '1', checkInDate: '2026-01-01', checkOutDate: '2026-01-05', numberOfPeople: 2, totalAmount: 500, amountPaid: 500, paymentMethod: 'cash', paymentStatus: 'paid', reference: 'ORD-001', notes: null, customerFirstName: 'John', customerLastName: 'Doe', customerEmail: 'john@test.com', customerPhone: null, roomName: 'Room 1', stateName: 'Confirmed' }],
      total: 1,
    };
    vi.mocked(getOrders).mockResolvedValue(mockData as never);

    await act(async () => {
      render(<HookConsumer hook={useOrders} />);
    });

    expect(screen.getByTestId('loading').textContent).toBe('false');
    expect(screen.getByTestId('error').textContent).toBe('null');
    expect(screen.getByTestId('data').textContent).toContain('ORD-001');
    expect(screen.getByTestId('data').textContent).toContain('total');
  });
});

describe('remaining data hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['useProducts', useProducts, getProducts, [{ id: 'p1', tenantId: '1', categoryId: null, sku: null, basePrice: 100, capacity: 5, imageUrl: null, isActive: 1 }]],
    ['useRooms', useRooms, getRooms, [{ id: 'r1', campId: '1', productId: 'p1', name: 'Room 1', status: 'available', bedType: 'single', maxGuests: 2, basePrice: 50, floor: null, notes: null, isActive: 1 }]],
    ['useRatePlans', useRatePlans, getRatePlans, [{ id: 'rp1', tenantId: '1', productId: 'p1', name: 'Standard', season: 'summer', startDate: null, endDate: null, pricePerNight: 80, minStay: 2, isActive: 1 }]],
    ['usePlans', usePlans, getPlans, [{ id: 'pl1', campId: '1', name: 'Plan A', description: null, date: null, time: null, capacity: null, status: 'draft', category: null }]],
    ['useMeals', useMeals, getMeals, [{ id: 'm1', name: 'Koshari', mealCategoryId: 'c1', price: 100, description: null, imageUrl: null, isActive: 1 }]],
    ['useCategories', useCategories, getCategories, [{ id: 'c1', name: 'Category A', description: null, parentId: null, active: 1, position: 1 }]],
    ['useMealCategories', useMealCategories, getMealCategories, [{ id: 'mc1', name: 'Breakfast', position: 1 }]],
    ['useSettings', useSettings, getMe, [{ id: 't1', name: 'Tenant', primaryColor: '#fff', whatsappNumber: '', phone: '', email: '', location: '', logoUrl: '', faviconUrl: '', description: '', footerText: '', currency: 'EGP' }]],
  ] as Array<[string, () => unknown, { mockResolvedValue: (v: unknown) => void }, unknown]>)(
    'resolves data for %s',
    async (_name, hook, apiFn, mockData) => {
      apiFn.mockResolvedValue(mockData);

      await act(async () => {
        render(<HookConsumer hook={hook as never} />);
      });

      expect(screen.getByTestId('loading').textContent).toBe('false');
      expect(screen.getByTestId('error').textContent).toBe('null');
      expect(screen.getByTestId('data').textContent).toContain('"id"');
    },
  );

  it('useMealSchedules passes params to the api', async () => {
    getMealSchedules.mockResolvedValue([{ id: 'ms1', campId: 'c1', date: '2026-01-01' }]);

    await act(async () => {
      render(<HookConsumer hook={(() => useMealSchedules({ campId: 'c1' })) as never} />);
    });

    expect(getMealSchedules).toHaveBeenCalledWith({ campId: 'c1' });
    expect(screen.getByTestId('data').textContent).toContain('ms1');
  });

  it('useMealSchedules works without params', async () => {
    getMealSchedules.mockResolvedValue([{ id: 'ms2', campId: 'c2', date: '2026-01-02' }]);

    await act(async () => {
      render(<HookConsumer hook={useMealSchedules as never} />);
    });

    expect(getMealSchedules).toHaveBeenCalledWith(undefined);
    expect(screen.getByTestId('data').textContent).toContain('ms2');
  });
});
