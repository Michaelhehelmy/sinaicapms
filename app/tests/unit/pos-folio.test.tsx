import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockShowToast = vi.fn();

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/api', () => ({
  applyPromotions: vi.fn(),
  posCreateOrder: vi.fn(),
  listFolios: vi.fn(),
}));

vi.mock('@/lib/posUrl', () => ({
  posUrl: (path: string) => path,
}));

vi.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

import * as api from '@/lib/api';
import CartPanel from '@/components/pos/views/CartPanel';

const mockApplyPromotions = vi.mocked(api.applyPromotions);
const mockPosCreateOrder = vi.mocked(api.posCreateOrder);
const mockListFolios = vi.mocked(api.listFolios);

const testUser = {
  id: '1',
  username: 'cashier',
  email: 'c@test.com',
  firstName: 'John',
  lastName: 'Doe',
  role: 'cashier',
  organizationId: 1,
  storeId: null,
  taxRate: 0.1,
} as any;

const sampleProduct = {
  id: 'p1',
  sku: 'SKU001',
  name: 'Water Bottle',
  description: 'Cold water',
  sellingPrice: 10,
  costPrice: 3,
  categoryId: 1,
  type: 'retail',
  imageUrl: null,
  isActive: 1,
  stockQuantity: 50,
};

const cart = [{ product: { ...sampleProduct }, quantity: 1 }];

const openFolios = {
  folios: [
    { id: 'folio_1', guestId: 'g1', status: 'open', totalAmount: 300, openedAt: '2026-09-30T10:00:00.000Z' },
    { id: 'folio_2', guestId: null, status: 'open', totalAmount: 0, openedAt: '2026-09-30T11:00:00.000Z' },
  ],
  counts: { open: 2, settled: 0, voided: 0, total: 2 },
  total: 2,
  limit: 50,
  offset: 0,
};

function folioOrder() {
  return {
    order: {
      id: 'o1',
      orderNumber: 'ORD-FOLIO',
      totalAmount: 11,
      subtotal: 10,
      taxAmount: 1,
      paymentMethod: 'folio',
      status: 'completed',
      items: [{ id: 'i1', productName: 'Water', quantity: 1, unitPrice: 10, totalAmount: 10 }],
    },
  } as any;
}

// Fresh client per render so folio-invalidation assertions stay isolated.
function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  return { queryClient, invalidateSpy };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockApplyPromotions.mockResolvedValue({} as any);
  mockListFolios.mockResolvedValue(openFolios as any);
});

// ─── B.6 charge-to-folio (4 mission tests) ─────────────────
describe('CartPanel charge-to-folio (B.6)', () => {
  it('toggle shows the open-folio picker', async () => {
    renderWithClient(
      <CartPanel cart={cart} setCart={vi.fn()} onCheckout={vi.fn()} user={testUser} />,
    );

    // Picker hidden until the cashier opts into folio charging.
    expect(screen.queryByTestId('folio-picker')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('folio-toggle'));

    await waitFor(() => expect(mockListFolios).toHaveBeenCalled());
    expect(mockListFolios).toHaveBeenCalledWith(expect.objectContaining({ status: 'open' }));
    await waitFor(() => expect(screen.getByTestId('folio-picker')).toBeInTheDocument());
    expect(screen.getByTestId('folio-picker')).toHaveTextContent('folio_1');
    expect(screen.getByTestId('folio-picker')).toHaveTextContent('folio_2');
  });

  it('folio checkout posts folio_id with paymentMethod folio', async () => {
    mockPosCreateOrder.mockResolvedValue(folioOrder());
    renderWithClient(
      <CartPanel cart={cart} setCart={vi.fn()} onCheckout={vi.fn()} user={testUser} />,
    );

    fireEvent.click(screen.getByTestId('folio-toggle'));
    await waitFor(() => expect(screen.getByTestId('folio-picker')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('folio-picker'), { target: { value: 'folio_1' } });

    fireEvent.click(screen.getByTestId('pay-btn'));

    await waitFor(() => expect(mockPosCreateOrder).toHaveBeenCalled());
    const body = mockPosCreateOrder.mock.calls[0][0] as Record<string, unknown>;
    expect(body).toMatchObject({ paymentMethod: 'folio', folioId: 'folio_1' });
    expect(body.items).toEqual([{ productId: 'p1', quantity: 1 }]);
  });

  it('folio checkout invalidates the folio list + detail queries', async () => {
    mockPosCreateOrder.mockResolvedValue(folioOrder());
    const { invalidateSpy } = renderWithClient(
      <CartPanel cart={cart} setCart={vi.fn()} onCheckout={vi.fn()} user={testUser} />,
    );

    fireEvent.click(screen.getByTestId('folio-toggle'));
    await waitFor(() => expect(screen.getByTestId('folio-picker')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('folio-picker'), { target: { value: 'folio_1' } });

    fireEvent.click(screen.getByTestId('pay-btn'));

    await waitFor(() => expect(mockPosCreateOrder).toHaveBeenCalled());
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'folios'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'folios', 'folio_1'] });
    });
  });

  it('no-folio flow stays intact (cash body, no folioId, no folio invalidation)', async () => {
    mockPosCreateOrder.mockResolvedValue({
      order: { ...folioOrder().order, paymentMethod: 'cash' },
    } as any);
    // Provider-free on purpose: proves the guarded QueryClient lookup keeps
    // legacy renders working and the default flow posts a plain cash order.
    const onCheckout = vi.fn();
    render(
      <CartPanel cart={cart} setCart={vi.fn()} onCheckout={onCheckout} user={testUser} />,
    );

    fireEvent.click(screen.getByTestId('pay-btn'));

    await waitFor(() => expect(mockPosCreateOrder).toHaveBeenCalled());
    const body = mockPosCreateOrder.mock.calls[0][0] as Record<string, unknown>;
    expect(body).toMatchObject({ paymentMethod: 'cash' });
    expect(body).not.toHaveProperty('folioId');
    expect(mockListFolios).not.toHaveBeenCalled();
    expect(mockShowToast).not.toHaveBeenCalledWith('Select a folio to charge to', 'error');
  });
});
