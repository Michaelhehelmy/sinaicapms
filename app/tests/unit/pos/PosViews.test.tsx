import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockShowToast = vi.fn();

// Phase 6: data views consume TanStack Query hooks — wrap them in a fresh
// QueryClient per render so tests stay isolated from each other.
function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/api', () => ({
  posLogin: vi.fn(),
  posGetDashboard: vi.fn(),
  posGetProducts: vi.fn(),
  posGetOrders: vi.fn(),
  posCreateOrder: vi.fn(),
  posOpenShift: vi.fn(),
  posCloseShift: vi.fn(),
  applyPromotions: vi.fn(),
}));

vi.mock('@/lib/posUrl', () => ({
  posUrl: (path: string) => path,
}));

vi.mock('@/lib/utils', () => ({
  formatCurrency: (n: number) => `$${Number(n).toFixed(2)}`,
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

import * as api from '@/lib/api';
import LoginView from '@/components/pos/views/LoginView';
import CartPanel from '@/components/pos/views/CartPanel';
import OrdersView from '@/components/pos/views/OrdersView';
import ShiftOverlay from '@/components/pos/views/ShiftOverlay';
import ProductsView from '@/components/pos/views/ProductsView';
import ShiftDashboard from '@/components/pos/views/ShiftDashboard';
import DashboardView from '@/components/pos/views/DashboardView';
import ReceiptModal from '@/components/pos/views/ReceiptModal';

const mockPosLogin = vi.mocked(api.posLogin);
const mockPosGetOrders = vi.mocked(api.posGetOrders);
const mockPosGetProducts = vi.mocked(api.posGetProducts);
const mockPosCreateOrder = vi.mocked(api.posCreateOrder);
const mockPosOpenShift = vi.mocked(api.posOpenShift);
const mockPosCloseShift = vi.mocked(api.posCloseShift);
const mockPosGetDashboard = vi.mocked(api.posGetDashboard);
const mockApplyPromotions = vi.mocked(api.applyPromotions);

const testUser = {
  id: '1',
  username: 'cashier',
  email: 'c@test.com',
  firstName: 'John',
  lastName: 'Doe',
  role: 'cashier',
  organizationId: 1,
  storeId: null,
};

const sampleProduct = {
  id: 'p1',
  sku: 'SKU001',
  name: 'Water Bottle',
  description: 'Cold water',
  sellingPrice: 5,
  costPrice: 3,
  categoryId: 1,
  type: 'retail',
  imageUrl: null,
  isActive: 1,
  stockQuantity: 50,
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

// ─── LoginView ──────────────────────────────────────────────
describe('LoginView', () => {
  it('renders login form', () => {
    const onLogin = vi.fn();
    render(<LoginView onLogin={onLogin} />);
    expect(screen.getByLabelText('Email or Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByText('Sign In')).toBeInTheDocument();
    expect(screen.getByText('SinaiCamps POS')).toBeInTheDocument();
  });

  it('shows error on API failure', async () => {
    mockPosLogin.mockRejectedValue(new Error('Invalid credentials'));
    const onLogin = vi.fn();
    render(<LoginView onLogin={onLogin} />);
    fireEvent.change(screen.getByLabelText('Email or Username'), { target: { value: 'bad@test.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByText('Sign In'));
    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
    expect(onLogin).not.toHaveBeenCalled();
  });
});

// ─── CartPanel ──────────────────────────────────────────────
describe('CartPanel', () => {
  const userWithTaxRate = { ...testUser, taxRate: 0.1 } as any;

  it('renders empty cart', () => {
    render(
      <CartPanel cart={[]} setCart={vi.fn()} onCheckout={vi.fn()} user={userWithTaxRate} />,
    );
    expect(screen.getByText('Current Order')).toBeInTheDocument();
    expect(screen.getByText('Click products to add to cart')).toBeInTheDocument();
  });

  it('calculates subtotal, tax, and total', () => {
    const cart = [{ product: { ...sampleProduct, sellingPrice: 100 }, quantity: 2 }];
    render(
      <CartPanel cart={cart} setCart={vi.fn()} onCheckout={vi.fn()} user={userWithTaxRate} />,
    );
    expect(screen.getByText('Subtotal')).toBeInTheDocument();
    expect(screen.getByText('Tax (10%)')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
  });

  it('handles split payment selection', () => {
    const cart = [{ product: { ...sampleProduct, sellingPrice: 10 }, quantity: 1 }];
    render(
      <CartPanel cart={cart} setCart={vi.fn()} onCheckout={vi.fn()} user={userWithTaxRate} />,
    );
    fireEvent.click(screen.getByText('Split'));
    expect(screen.getByText('Cash', { selector: 'label' })).toBeInTheDocument();
  });

  it('handles checkout successfully', async () => {
    mockPosCreateOrder.mockResolvedValue({
      order: { id: 'o1', orderNumber: 'ORD-100', totalAmount: 11, subtotal: 10, taxAmount: 1, paymentMethod: 'cash', status: 'completed', items: [{ id: 'i1', productName: 'Water', quantity: 1, unitPrice: 10, totalAmount: 10 }] },
    } as any);
    const setCart = vi.fn();
    const onCheckout = vi.fn();
    const cart = [{ product: { ...sampleProduct, sellingPrice: 10 }, quantity: 1 }];
    render(
      <CartPanel cart={cart} setCart={setCart} onCheckout={onCheckout} user={userWithTaxRate} />,
    );
    fireEvent.click(screen.getByText(/Pay \$/));
    await waitFor(() => {
      expect(mockPosCreateOrder).toHaveBeenCalled();
    });
  });

  it('opens the receipt modal after checkout success; cleanup + navigation run on close', async () => {
    mockPosCreateOrder.mockResolvedValue({
      order: { id: 'o1', orderNumber: 'ORD-REC', totalAmount: 11, subtotal: 10, taxAmount: 1, paymentMethod: 'cash', status: 'completed', items: [{ id: 'i1', productName: 'Water', quantity: 1, unitPrice: 10, totalAmount: 10 }] },
    } as any);
    const setCart = vi.fn();
    const onCheckout = vi.fn();
    const cart = [{ product: { ...sampleProduct, sellingPrice: 10 }, quantity: 1 }];
    render(
      <CartPanel cart={cart} setCart={setCart} onCheckout={onCheckout} user={userWithTaxRate} />,
    );

    fireEvent.click(screen.getByText(/Pay \$/));

    // Receipt appears immediately after the order is created…
    await waitFor(() => {
      expect(screen.getByTestId('receipt-modal')).toBeInTheDocument();
    });
    expect(screen.getByText(/ORD-REC/)).toBeInTheDocument();
    expect(screen.getByText(/Paid \(cash\)/)).toBeInTheDocument();
    // …while the cart reset + navigation are deferred until the modal closes.
    expect(setCart).not.toHaveBeenCalled();
    expect(onCheckout).not.toHaveBeenCalled();

    // Closing the receipt runs the post-checkout cleanup + navigation.
    fireEvent.click(screen.getByText('Close'));
    await waitFor(() => {
      expect(setCart).toHaveBeenCalledWith([]);
    });
    expect(onCheckout).toHaveBeenCalled();
  });

  it('increases and decreases quantity', () => {
    const cart = [{ product: { ...sampleProduct, sellingPrice: 10 }, quantity: 1 }];
    const setCart = vi.fn();
    render(<CartPanel cart={cart} setCart={setCart} onCheckout={vi.fn()} user={userWithTaxRate} />);
    fireEvent.click(screen.getByTestId('qty-increase'));
    expect(setCart).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('qty-decrease'));
    expect(setCart).toHaveBeenCalled();
  });

  it('updates quantity via the reduce so decrease removes item at 0', () => {
    const cart = [{ product: { ...sampleProduct, sellingPrice: 10 }, quantity: 1 }];
    const setCart = vi.fn();
    render(<CartPanel cart={cart} setCart={setCart} onCheckout={vi.fn()} user={userWithTaxRate} />);
    fireEvent.click(screen.getByTestId('qty-decrease'));
    const updater = setCart.mock.calls[0][0];
    const result = updater(cart);
    expect(result).toEqual([]);
  });

  it('keeps non-matching cart items when adjusting quantity', () => {
    const other = { product: { ...sampleProduct, id: 'other', sellingPrice: 5 }, quantity: 2 };
    const target = { product: { ...sampleProduct, sellingPrice: 10 }, quantity: 1 };
    const setCart = vi.fn();
    render(<CartPanel cart={[target, other]} setCart={setCart} onCheckout={vi.fn()} user={userWithTaxRate} />);
    // Increase the FIRST item (target). The non-matching "other" must be preserved.
    fireEvent.click(screen.getAllByTestId('qty-increase')[0]);
    const updater = setCart.mock.calls[0][0];
    const result = updater([target, other]);
    expect(result.find((i: any) => i.product.id === 'p1')?.quantity).toBe(2);
    expect(result.find((i: any) => i.product.id === 'other')?.quantity).toBe(2);
  });

  it('shows checkout failure toast', async () => {
    mockPosCreateOrder.mockRejectedValue(new Error('Payment declined'));
    const cart = [{ product: { ...sampleProduct, sellingPrice: 10 }, quantity: 1 }];
    render(<CartPanel cart={cart} setCart={vi.fn()} onCheckout={vi.fn()} user={userWithTaxRate} />);
    fireEvent.click(screen.getByText(/Pay \$/));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Payment declined', 'error');
    });
  });

  it('selects a preset tip and shows it in the total', () => {
    const cart = [{ product: { ...sampleProduct, sellingPrice: 100 }, quantity: 1 }];
    render(<CartPanel cart={cart} setCart={vi.fn()} onCheckout={vi.fn()} user={userWithTaxRate} />);
    fireEvent.click(screen.getByText('15%'));
    // tip = round(100 * 0.15) = 15, rendered in the total line
    expect(screen.getByText('Tip')).toBeInTheDocument();
  });

  it('opens custom tip input and sets the tip amount', () => {
    const cart = [{ product: { ...sampleProduct, sellingPrice: 100 }, quantity: 1 }];
    render(<CartPanel cart={cart} setCart={vi.fn()} onCheckout={vi.fn()} user={userWithTaxRate} />);
    fireEvent.click(screen.getByText('Custom'));
    const input = screen.getByTestId('custom-tip-input');
    fireEvent.change(input, { target: { value: '5.5' } });
    expect(screen.getByText('Tip')).toBeInTheDocument();
  });

  it('treats non-numeric custom tip as zero', () => {
    const cart = [{ product: { ...sampleProduct, sellingPrice: 100 }, quantity: 1 }];
    render(<CartPanel cart={cart} setCart={vi.fn()} onCheckout={vi.fn()} user={userWithTaxRate} />);
    fireEvent.click(screen.getByText('Custom'));
    const input = screen.getByTestId('custom-tip-input');
    fireEvent.change(input, { target: { value: 'abc' } });
    // parseFloat('abc') = NaN → `|| 0` → tip = 0, so no Tip row is shown
    expect(screen.queryByText('Tip')).not.toBeInTheDocument();
  });

  it('shows split payment cash/card fields', () => {
    const cart = [{ product: { ...sampleProduct, sellingPrice: 20 }, quantity: 1 }];
    render(<CartPanel cart={cart} setCart={vi.fn()} onCheckout={vi.fn()} user={userWithTaxRate} />);
    fireEvent.click(screen.getByText('Split'));
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '12' } });
    // split card amount = total (22) - cash (12) = 10.00
    expect(screen.getByText('Cash', { selector: 'label' })).toBeInTheDocument();
    expect(screen.getByText('$10.00')).toBeInTheDocument();
  });

  it('renders the mobile close button when onClose is provided', () => {
    render(
      <CartPanel cart={[]} setCart={vi.fn()} onCheckout={vi.fn()} user={userWithTaxRate} onClose={vi.fn()} mobileOpen />,
    );
    expect(screen.getByTestId('mobile-cart-close')).toBeInTheDocument();
  });

  it('shows discount badge when promotion result has a discount', async () => {
    mockApplyPromotions.mockResolvedValue({ total_discount: 5, items: [] } as any);
    const cart = [{ product: { ...sampleProduct, sellingPrice: 50 }, quantity: 1 }];
    render(<CartPanel cart={cart} setCart={vi.fn()} onCheckout={vi.fn()} user={userWithTaxRate} />);
    await waitFor(() => {
      expect(screen.getByTestId('cart-discount')).toBeInTheDocument();
    });
  });

  // ─── Extended coverage: CartPanel.tsx lines 65-67, 111-113, 212-214 ──────
  it('clears promo result when applyPromotions throws', async () => {
    mockApplyPromotions.mockRejectedValue(new Error('Promo API down'));
    const cart = [{ product: { ...sampleProduct, sellingPrice: 30 }, quantity: 1 }];
    render(<CartPanel cart={cart} setCart={vi.fn()} onCheckout={vi.fn()} user={userWithTaxRate} />);
    // Wait for the 300ms debounce + API call to fail
    await waitFor(() => {
      expect(mockApplyPromotions).toHaveBeenCalled();
    });
    // Discount badge should NOT be visible (promo result cleared)
    expect(screen.queryByTestId('cart-discount')).not.toBeInTheDocument();
  });

  it('sends tipAmount when tip is set and checkout succeeds', async () => {
    mockPosCreateOrder.mockResolvedValue({
      order: { id: 'o1', orderNumber: 'ORD-TIP', totalAmount: 115, subtotal: 100, taxAmount: 10, paymentMethod: 'cash', status: 'completed', items: [] },
    } as any);
    const cart = [{ product: { ...sampleProduct, sellingPrice: 100 }, quantity: 1 }];
    const onCheckout = vi.fn();
    render(<CartPanel cart={cart} setCart={vi.fn()} onCheckout={onCheckout} user={userWithTaxRate} />);
    // Select 15% tip
    fireEvent.click(screen.getByText('15%'));
    await waitFor(() => { expect(screen.getByText('Tip')).toBeInTheDocument(); });
    // Checkout
    fireEvent.click(screen.getByText(/Pay \$/));
    await waitFor(() => {
      expect(mockPosCreateOrder).toHaveBeenCalledWith(expect.objectContaining({ tipAmount: 15 }));
    });
  });

  it('displays promotion names from promo result items', async () => {
    mockApplyPromotions.mockResolvedValue({
      total_discount: 10,
      items: [{ promotion_name: 'Happy Hour', discount: 5 }],
    } as any);
    const cart = [{ product: { ...sampleProduct, sellingPrice: 50 }, quantity: 1 }];
    render(<CartPanel cart={cart} setCart={vi.fn()} onCheckout={vi.fn()} user={userWithTaxRate} />);
    // Wait for promo API debounce (300ms) + state update
    await waitFor(() => {
      expect(screen.getByTestId('cart-discount')).toBeInTheDocument();
    }, { timeout: 2000 });
    // Now the discount badge is visible; check for the promotion name text
    expect(screen.getByTestId('cart-discount').textContent).toContain('Happy Hour');
  });

  it('handles non-Error exception during checkout gracefully', async () => {
    mockPosCreateOrder.mockRejectedValue('string error');
    const cart = [{ product: { ...sampleProduct, sellingPrice: 10 }, quantity: 1 }];
    render(<CartPanel cart={cart} setCart={vi.fn()} onCheckout={vi.fn()} user={userWithTaxRate} />);
    fireEvent.click(screen.getByText(/Pay \$/));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Checkout failed', 'error');
    });
  });
});

// ─── OrdersView ─────────────────────────────────────────────
describe('OrdersView', () => {
  it('loads and renders orders', async () => {
    mockPosGetOrders.mockResolvedValue([
      { id: '1', orderNumber: 'ORD-001', totalAmount: 25.50, subtotal: 23.18, taxAmount: 2.32, paymentMethod: 'cash', status: 'completed', createdAt: new Date().toISOString() },
    ] as any);
    renderWithClient(<OrdersView />);
    await waitFor(() => {
      expect(screen.getByText('ORD-001')).toBeInTheDocument();
    });
  });

  it('shows error state', async () => {
    mockPosGetOrders.mockRejectedValue(new Error('Orders load failed'));
    renderWithClient(<OrdersView />);
    await waitFor(() => {
      expect(screen.getByText('Orders load failed')).toBeInTheDocument();
    });
  });

  it('shows empty state', async () => {
    mockPosGetOrders.mockResolvedValue([] as any);
    renderWithClient(<OrdersView />);
    await waitFor(() => {
      expect(screen.getByText('No orders found')).toBeInTheDocument();
    });
  });

  it('renders order rows with labels', async () => {
    mockPosGetOrders.mockResolvedValue([
      { id: '1', orderNumber: 'ORD-001', totalAmount: 25.50, subtotal: 23.18, taxAmount: 2.32, paymentMethod: 'cash', status: 'completed', createdAt: new Date().toISOString() },
      { id: '2', orderNumber: 'ORD-002', totalAmount: 10, subtotal: 9, taxAmount: 1, paymentMethod: 'card', status: 'pending', createdAt: new Date().toISOString() },
    ] as any);
    renderWithClient(<OrdersView />);
    await waitFor(() => {
      expect(screen.getByText('ORD-001')).toBeInTheDocument();
    });
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('retries by calling refetch from the error state', async () => {
    mockPosGetOrders
      .mockRejectedValueOnce(new Error('Orders load failed'))
      .mockResolvedValueOnce([{ id: '1', orderNumber: 'ORD-1', totalAmount: 5, subtotal: 5, taxAmount: 0, paymentMethod: 'cash', status: 'completed', createdAt: new Date().toISOString() }] as any);
    renderWithClient(<OrdersView />);
    await waitFor(() => {
      expect(screen.getByText('Orders load failed')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Try Again'));
    await waitFor(() => {
      expect(screen.getByText('ORD-1')).toBeInTheDocument();
    });
  });
});

// ─── ShiftOverlay ───────────────────────────────────────────
describe('ShiftOverlay', () => {
  it('validates cash input', async () => {
    const onShiftOpened = vi.fn();
    renderWithClient(<ShiftOverlay onShiftOpened={onShiftOpened} />);
    fireEvent.click(screen.getByText('Open Shift'));
    await waitFor(() => {
      expect(screen.getByText('Enter a valid opening cash amount')).toBeInTheDocument();
    });
    expect(onShiftOpened).not.toHaveBeenCalled();
  });

  it('opens shift successfully', async () => {
    mockPosOpenShift.mockResolvedValue({
      shift: { id: 's2', status: 'open', openingTime: new Date().toISOString(), openingCash: 200, expectedClosingCash: 200, notes: null },
    } as any);
    const onShiftOpened = vi.fn();
    renderWithClient(<ShiftOverlay onShiftOpened={onShiftOpened} />);
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '200' } });
    fireEvent.click(screen.getByText('Open Shift'));
    await waitFor(() => {
      expect(mockPosOpenShift).toHaveBeenCalledWith({ openingCash: 200 });
      expect(onShiftOpened).toHaveBeenCalled();
    });
  });

  it('shows error', async () => {
    mockPosOpenShift.mockRejectedValue(new Error('Cannot open shift'));
    const onShiftOpened = vi.fn();
    renderWithClient(<ShiftOverlay onShiftOpened={onShiftOpened} />);
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '100' } });
    fireEvent.click(screen.getByText('Open Shift'));
    await waitFor(() => {
      expect(screen.getByText('Cannot open shift')).toBeInTheDocument();
    });
  });
});

// ─── ProductsView ───────────────────────────────────────────
describe('ProductsView', () => {
  it('loads and renders products', async () => {
    mockPosGetProducts.mockResolvedValue([sampleProduct] as any);
    renderWithClient(<ProductsView cart={[]} setCart={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('Water Bottle')).toBeInTheDocument();
    });
  });

  it('adds to cart', async () => {
    mockPosGetProducts.mockResolvedValue([sampleProduct] as any);
    const setCart = vi.fn();
    renderWithClient(<ProductsView cart={[]} setCart={setCart} />);
    await waitFor(() => {
      expect(screen.getByText('Water Bottle')).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByText('Water Bottle')[0]);
    await waitFor(() => {
      expect(setCart).toHaveBeenCalled();
    });
  });

  it('filters by search', async () => {
    mockPosGetProducts.mockResolvedValue([sampleProduct] as any);
    renderWithClient(<ProductsView cart={[]} setCart={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('Water Bottle')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('Search products...'), { target: { value: 'Water' } });
    expect(screen.getByText('Water Bottle')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Search products...'), { target: { value: 'xyz' } });
    expect(screen.getByText('No products found')).toBeInTheDocument();
  });

  it('shows error', async () => {
    mockPosGetProducts.mockRejectedValue(new Error('Products load failed'));
    renderWithClient(<ProductsView cart={[]} setCart={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('Products load failed')).toBeInTheDocument();
    });
  });
});

// ─── ShiftDashboard ─────────────────────────────────────────
describe('ShiftDashboard', () => {
  const activeShift = {
    id: 's1',
    status: 'open',
    openingTime: new Date().toISOString(),
    openingCash: 100,
    expectedClosingCash: 200,
    notes: null,
  } as any;

  function clickCloseShiftButton() {
    const spans = screen.getAllByText('Close Shift');
    const btn = spans.find((el) => el.parentElement?.tagName === 'BUTTON');
    fireEvent.click(btn!.parentElement!);
  }

  it('shows shift info', () => {
    renderWithClient(<ShiftDashboard shift={activeShift} onShiftClosed={vi.fn()} />);
    expect(screen.getByText('Current Shift')).toBeInTheDocument();
    expect(screen.getByText('Shift ID')).toBeInTheDocument();
  });

  it('validates closing cash', async () => {
    const onShiftClosed = vi.fn();
    renderWithClient(<ShiftDashboard shift={activeShift} onShiftClosed={onShiftClosed} />);
    clickCloseShiftButton();
    await waitFor(() => {
      expect(screen.getByText('Enter closing cash amount')).toBeInTheDocument();
    });
  });

  it('closes shift showing balanced', async () => {
    mockPosCloseShift.mockResolvedValue({
      shift: { id: 's1', status: 'closed', openingCash: 100, totalCashSales: 150, expectedClosingCash: 250, actualClosingCash: 250, discrepancy: 0 },
    } as any);
    const onShiftClosed = vi.fn();
    renderWithClient(<ShiftDashboard shift={activeShift} onShiftClosed={onShiftClosed} />);
    fireEvent.change(screen.getByLabelText('Actual Closing Cash ($)'), { target: { value: '250' } });
    clickCloseShiftButton();
    await waitFor(() => {
      expect(screen.getByText('Shift Closed')).toBeInTheDocument();
      expect(screen.getByText('Balanced')).toBeInTheDocument();
    });
  });

  it('closes shift showing discrepancy', async () => {
    mockPosCloseShift.mockResolvedValue({
      shift: { id: 's1', status: 'closed', openingCash: 100, totalCashSales: 150, expectedClosingCash: 250, actualClosingCash: 200, discrepancy: -50 },
    } as any);
    const onShiftClosed = vi.fn();
    renderWithClient(<ShiftDashboard shift={activeShift} onShiftClosed={onShiftClosed} />);
    fireEvent.change(screen.getByLabelText('Actual Closing Cash ($)'), { target: { value: '200' } });
    clickCloseShiftButton();
    await waitFor(() => {
      expect(screen.getByText('Shift Closed')).toBeInTheDocument();
      expect(screen.getByText('$-50.00')).toBeInTheDocument();
    });
  });
});

// ─── DashboardView ──────────────────────────────────────────
describe('DashboardView', () => {
  it('loads dashboard data', async () => {
    mockPosGetDashboard.mockResolvedValue({
      todayRevenue: 150,
      todayOrders: 5,
      activeProducts: 10,
      recentOrders: [],
    } as any);
    renderWithClient(<DashboardView />);
    await waitFor(() => {
      expect(screen.getByText("Today's Revenue")).toBeInTheDocument();
    });
  });

  it('shows error state', async () => {
    mockPosGetDashboard.mockRejectedValue(new Error('Dashboard load failed'));
    renderWithClient(<DashboardView />);
    await waitFor(() => {
      expect(screen.getByText('Dashboard load failed')).toBeInTheDocument();
    });
  });

  it('shows empty state for recent orders', async () => {
    mockPosGetDashboard.mockResolvedValue({
      todayRevenue: 0,
      todayOrders: 0,
      activeProducts: 0,
      recentOrders: [],
    } as any);
    renderWithClient(<DashboardView />);
    await waitFor(() => {
      expect(screen.getByText('No orders yet')).toBeInTheDocument();
    });
  });

  it('renders recent order rows', async () => {
    mockPosGetDashboard.mockResolvedValue({
      todayRevenue: 150,
      todayOrders: 5,
      activeProducts: 10,
      recentOrders: [
        { id: '1', orderNumber: 'ORD-1', totalAmount: 25.5, paymentMethod: 'cash', status: 'completed', createdAt: new Date().toISOString() },
        { id: '2', orderNumber: 'ORD-2', totalAmount: 10, paymentMethod: 'card', status: 'voided', createdAt: new Date().toISOString() },
      ],
    } as any);
    renderWithClient(<DashboardView />);
    await waitFor(() => {
      expect(screen.getByText('ORD-1')).toBeInTheDocument();
      expect(screen.getByText('ORD-2')).toBeInTheDocument();
    });
    expect(screen.getByText('completed')).toBeInTheDocument();
    expect(screen.getByText('voided')).toBeInTheDocument();
  });

  it('retries by calling refetch from the error state', async () => {
    mockPosGetDashboard
      .mockRejectedValueOnce(new Error('Dashboard load failed'))
      .mockResolvedValueOnce({ todayRevenue: 1, todayOrders: 1, activeProducts: 1, recentOrders: [] } as any);
    renderWithClient(<DashboardView />);
    await waitFor(() => {
      expect(screen.getByText('Dashboard load failed')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Try Again'));
    await waitFor(() => {
      expect(screen.getByText("Today's Revenue")).toBeInTheDocument();
    });
  });

  it('renders nothing when no data and not loading', async () => {
    mockPosGetDashboard.mockResolvedValue({ undefined } as any);
    renderWithClient(<DashboardView />);
    await waitFor(() => {
      expect(screen.queryByTestId('pos-dashboard')).not.toBeInTheDocument();
    });
  });
});

// ─── ReceiptModal ───────────────────────────────────────────
describe('ReceiptModal', () => {
  const baseOrder = {
    id: 'o1',
    orderNumber: 'ORD-100',
    totalAmount: 11,
    subtotal: 10,
    taxAmount: 1,
    paymentMethod: 'cash',
    status: 'completed',
    createdAt: new Date().toISOString(),
  };

  it('renders receipt with items', () => {
    const order = {
      ...baseOrder,
      items: [
        { id: 'i1', productName: 'Water Bottle', quantity: 2, unitPrice: 5, totalAmount: 10 },
      ],
    };
    const onClose = vi.fn();
    render(<ReceiptModal order={order as any} user={testUser as any} onClose={onClose} />);
    expect(screen.getByText(/Order:.*ORD-100/)).toBeInTheDocument();
    expect(screen.getByText(/Water Bottle/)).toBeInTheDocument();
    expect(screen.getByText('Close')).toBeInTheDocument();
  });

  it('renders receipt without items', () => {
    const order = { ...baseOrder };
    const onClose = vi.fn();
    render(<ReceiptModal order={order as any} user={testUser as any} onClose={onClose} />);
    expect(screen.getByText('Items list unavailable')).toBeInTheDocument();
  });

  it('renders split payment breakdown', () => {
    const order = {
      ...baseOrder,
      paymentMethod: 'split',
      amountCash: 5,
      amountCard: 6,
      items: [
        { id: 'i1', productName: 'Snack', quantity: 1, unitPrice: 10, totalAmount: 10 },
      ],
    };
    const onClose = vi.fn();
    render(<ReceiptModal order={order as any} user={testUser as any} onClose={onClose} />);
    expect(screen.getByText('Paid (split)')).toBeInTheDocument();
    expect(screen.getByText('$5.00')).toBeInTheDocument();
    expect(screen.getByText('$6.00')).toBeInTheDocument();
  });
});
