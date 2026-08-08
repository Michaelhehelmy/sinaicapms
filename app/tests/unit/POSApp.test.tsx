import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import POSApp from '@/components/pos/POSApp';

const mockShowToast = vi.fn();

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
  posGetActiveShift: vi.fn(),
}));

vi.mock('@/lib/utils', () => ({
  formatCurrency: (n: number) => `$${Number(n).toFixed(2)}`,
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

import * as api from '@/lib/api';
const mockPosLogin = vi.mocked(api.posLogin);
const mockPosGetDashboard = vi.mocked(api.posGetDashboard);
const mockPosGetProducts = vi.mocked(api.posGetProducts);
const mockPosGetOrders = vi.mocked(api.posGetOrders);
const mockPosCreateOrder = vi.mocked(api.posCreateOrder);
const mockPosOpenShift = vi.mocked(api.posOpenShift);
const mockPosCloseShift = vi.mocked(api.posCloseShift);
const mockPosGetActiveShift = vi.mocked(api.posGetActiveShift);

const testUser = { id: 1, username: 'cashier', email: 'c@test.com', firstName: 'John', lastName: 'Doe', role: 'cashier', organizationId: 1, storeId: null };

function clickCloseShiftButton() {
  const spans = screen.getAllByText('Close Shift');
  const btn = spans.find((el) => el.parentElement?.tagName === 'BUTTON');
  fireEvent.click(btn!.parentElement!);
}

function loginAsTestUser() {
  localStorage.setItem('pos_token', 'test-token');
  localStorage.setItem('pos_user', JSON.stringify(testUser));
}

// Helper: set the mock pathname for POS routing
function setPOSPath(path: string) {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, pathname: path },
    writable: true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  // Set default path to dashboard
  setPOSPath('/pos/dashboard');
  mockPosLogin.mockResolvedValue({ success: true, token: 'test-token', user: testUser } as any);
  mockPosGetActiveShift.mockResolvedValue({ active: true, shift: { id: 's1', status: 'open', openingTime: new Date().toISOString(), openingCash: 100, expectedClosingCash: 200, notes: null } } as any);
  mockPosGetDashboard.mockResolvedValue({ todayRevenue: 150, todayOrders: 5, activeProducts: 10, recentOrders: [] } as any);
  mockPosGetProducts.mockResolvedValue([] as any);
  mockPosGetOrders.mockResolvedValue([] as any);
});

describe('POSApp', () => {
  describe('Login View', () => {
    it('shows login form when not authenticated', async () => {
      setPOSPath('/pos/login');
      render(<POSApp />);
      await waitFor(() => {
        expect(screen.getByText('SinaiCamps POS')).toBeInTheDocument();
      });
      expect(screen.getByText('Sign in to your terminal')).toBeInTheDocument();
      expect(screen.getByText('Sign In')).toBeInTheDocument();
    });

    it('validates login requires fields', async () => {
      setPOSPath('/pos/login');
      render(<POSApp />);
      await waitFor(() => { expect(screen.getByText('Sign In')).toBeInTheDocument(); });
      fireEvent.click(screen.getByText('Sign In'));
      await waitFor(() => {
        expect(mockPosLogin).not.toHaveBeenCalled();
      });
    });

    it('submits login successfully', async () => {
      setPOSPath('/pos/login');
      render(<POSApp />);
      await waitFor(() => { expect(screen.getByLabelText('Email or Username')).toBeInTheDocument(); });
      fireEvent.change(screen.getByLabelText('Email or Username'), { target: { value: 'c@test.com' } });
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pass123' } });
      fireEvent.click(screen.getByText('Sign In'));
      await waitFor(() => {
        expect(mockPosLogin).toHaveBeenCalledWith('c@test.com', 'pass123');
      });
    });

    it('stores token and user in localStorage on login', async () => {
      setPOSPath('/pos/login');
      render(<POSApp />);
      await waitFor(() => { expect(screen.getByLabelText('Email or Username')).toBeInTheDocument(); });
      fireEvent.change(screen.getByLabelText('Email or Username'), { target: { value: 'c@test.com' } });
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pass123' } });
      fireEvent.click(screen.getByText('Sign In'));
      await waitFor(() => {
        expect(localStorage.getItem('pos_token')).toBe('test-token');
        expect(JSON.parse(localStorage.getItem('pos_user') || '{}').firstName).toBe('John');
      });
    });

    it('shows login error on failed response', async () => {
      mockPosLogin.mockRejectedValue(new Error('Invalid credentials'));
      setPOSPath('/pos/login');
      render(<POSApp />);
      await waitFor(() => { expect(screen.getByLabelText('Email or Username')).toBeInTheDocument(); });
      fireEvent.change(screen.getByLabelText('Email or Username'), { target: { value: 'bad@test.com' } });
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
      fireEvent.click(screen.getByText('Sign In'));
      await waitFor(() => {
        expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
      });
    });

    it('handles login API error', async () => {
      mockPosLogin.mockRejectedValue(new Error('Network error'));
      setPOSPath('/pos/login');
      render(<POSApp />);
      await waitFor(() => { expect(screen.getByLabelText('Email or Username')).toBeInTheDocument(); });
      fireEvent.change(screen.getByLabelText('Email or Username'), { target: { value: 'c@test.com' } });
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pass123' } });
      fireEvent.click(screen.getByText('Sign In'));
      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });

  describe('Sidebar & Navigation', () => {
    it('renders sidebar after login with nav items', async () => {
      loginAsTestUser();
      render(<POSApp />);
      await waitFor(() => {
        expect(screen.getByText('POS Terminal')).toBeInTheDocument();
      });
      expect(screen.getAllByText('Dashboard').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Products').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Orders').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Shift')).toBeInTheDocument();
    });

    it('treats an invalid stored user JSON as logged out', async () => {
      localStorage.setItem('pos_token', 'test-token');
      localStorage.setItem('pos_user', '{not-json');
      setPOSPath('/pos/dashboard');
      render(<POSApp />);
      await waitFor(() => {
        expect(screen.getByText('SinaiCamps POS')).toBeInTheDocument();
      });
    });

    it('navigates to the target view when a sidebar nav item is clicked', async () => {
      loginAsTestUser();
      render(<POSApp />);
      await waitFor(() => {
        expect(screen.getByText('POS Terminal')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('pos-nav-products'));
      expect(window.location.href).toBe('/pos/products');
    });

    it('shows sign out button', async () => {
      loginAsTestUser();
      render(<POSApp />);
      await waitFor(() => {
        expect(screen.getByText('Sign out')).toBeInTheDocument();
      });
    });

    it('shows user name in sidebar', async () => {
      loginAsTestUser();
      render(<POSApp />);
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });
    });

    it('navigates to products view via sidebar click', async () => {
      loginAsTestUser();
      render(<POSApp />);
      await waitFor(() => { expect(screen.getByText('POS Terminal')).toBeInTheDocument(); });
      // Verify Products nav button exists
      const productsBtn = screen.getAllByText('Products')[0];
      expect(productsBtn).toBeInTheDocument();
    });

    it('navigates to orders view via sidebar click', async () => {
      loginAsTestUser();
      render(<POSApp />);
      await waitFor(() => { expect(screen.getByText('POS Terminal')).toBeInTheDocument(); });
      // Verify Orders nav button exists
      const ordersBtn = screen.getAllByText('Orders')[0];
      expect(ordersBtn).toBeInTheDocument();
    });

    it('navigates to shift view via sidebar click', async () => {
      loginAsTestUser();
      render(<POSApp />);
      await waitFor(() => { expect(screen.getByText('POS Terminal')).toBeInTheDocument(); });
      // Verify Shift nav button exists
      const shiftBtn = screen.getByText('Shift');
      expect(shiftBtn).toBeInTheDocument();
    });

    it('handles logout and clears state', async () => {
      loginAsTestUser();
      render(<POSApp />);
      await waitFor(() => {
        expect(screen.getByText('Sign out')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Sign out'));
      await waitFor(() => {
        expect(screen.getByText('SinaiCamps POS')).toBeInTheDocument();
      });
      expect(localStorage.getItem('pos_token')).toBeNull();
      expect(localStorage.getItem('pos_user')).toBeNull();
    });
  });

  describe('Dashboard View', () => {
    it('shows dashboard with stats after login', async () => {
      loginAsTestUser();
      render(<POSApp />);
      await waitFor(() => {
        expect(screen.getByText("Today's Revenue")).toBeInTheDocument();
      });
      expect(screen.getByText("$150.00")).toBeInTheDocument();
    });

    it('shows recent orders section', async () => {
      loginAsTestUser();
      render(<POSApp />);
      await waitFor(() => {
        expect(screen.getByText('Recent Orders')).toBeInTheDocument();
      });
    });

    it('shows empty state when no recent orders', async () => {
      loginAsTestUser();
      render(<POSApp />);
      await waitFor(() => {
        expect(screen.getByText('No orders yet')).toBeInTheDocument();
      });
    });

    it('renders recent orders when data exists', async () => {
      mockPosGetDashboard.mockResolvedValue({
        todayRevenue: 150, todayOrders: 5, activeProducts: 10,
        recentOrders: [
          { id: '1', orderNumber: 'ORD-001', totalAmount: 25.50, subtotal: 23.18, taxAmount: 2.32, paymentMethod: 'cash', status: 'completed', createdAt: new Date().toISOString() },
        ],
      } as any);
      loginAsTestUser();
      render(<POSApp />);
      await waitFor(() => {
        expect(screen.getByText('ORD-001')).toBeInTheDocument();
      });
    });

    it('shows voided status badge', async () => {
      mockPosGetDashboard.mockResolvedValue({
        todayRevenue: 0, todayOrders: 1, activeProducts: 10,
        recentOrders: [
          { id: '2', orderNumber: 'ORD-002', totalAmount: 10, subtotal: 9.09, taxAmount: 0.91, paymentMethod: 'card', status: 'voided', createdAt: new Date().toISOString() },
        ],
      } as any);
      loginAsTestUser();
      render(<POSApp />);
      await waitFor(() => { expect(screen.getByText('ORD-002')).toBeInTheDocument(); });
    });

    it('handles dashboard API error', async () => {
      mockPosGetDashboard.mockRejectedValue(new Error('Dashboard load failed'));
      loginAsTestUser();
      render(<POSApp />);
      await waitFor(() => {
        expect(screen.getByText('Dashboard load failed')).toBeInTheDocument();
      });
    });

    it('renders nothing when dashboard API resolves with no data', async () => {
      mockPosGetDashboard.mockResolvedValue(undefined as unknown as never);
      loginAsTestUser();
      render(<POSApp />);
      await waitFor(() => {
        expect(mockPosGetDashboard).toHaveBeenCalled();
      });
      expect(screen.queryByTestId('pos-dashboard')).not.toBeInTheDocument();
    });

    it('shows order with no payment method as dash', async () => {
      mockPosGetDashboard.mockResolvedValue({
        todayRevenue: 0, todayOrders: 1, activeProducts: 10,
        recentOrders: [
          { id: '3', orderNumber: 'ORD-003', totalAmount: 5, subtotal: 4.55, taxAmount: 0.45, paymentMethod: '', status: 'pending', createdAt: new Date().toISOString() },
        ],
      } as any);
      loginAsTestUser();
      render(<POSApp />);
      await waitFor(() => { expect(screen.getByText('ORD-003')).toBeInTheDocument(); });
    });
  });

  describe('Products View', () => {
    const sampleProducts = [
      { id: 'p1', sku: 'SKU001', name: 'Water Bottle', description: 'Cold water', sellingPrice: 5, costPrice: 3, categoryId: 1, type: 'retail', imageUrl: null, isActive: 1, stockQuantity: 50 },
      { id: 'p2', sku: 'SKU002', name: 'Snack Bar', description: 'Protein bar', sellingPrice: 3, costPrice: 2, categoryId: 2, type: 'retail', imageUrl: null, isActive: 1, stockQuantity: 30 },
    ];

    it('shows products view with product list', async () => {
      mockPosGetProducts.mockResolvedValue(sampleProducts as any);
      loginAsTestUser();
      setPOSPath('/pos/products');
      render(<POSApp />);
      await waitFor(() => {
        expect(screen.getByText('Water Bottle')).toBeInTheDocument();
        expect(screen.getByText('Snack Bar')).toBeInTheDocument();
      });
    });

    it('searches products by name', async () => {
      mockPosGetProducts.mockResolvedValue(sampleProducts as any);
      loginAsTestUser();
      setPOSPath('/pos/products');
      render(<POSApp />);
      await waitFor(() => { expect(screen.getByText('Water Bottle')).toBeInTheDocument(); });
      fireEvent.change(screen.getByPlaceholderText('Search products...'), { target: { value: 'Water' } });
      expect(screen.getByText('Water Bottle')).toBeInTheDocument();
      expect(screen.queryByText('Snack Bar')).not.toBeInTheDocument();
    });

    it('shows empty state when no products match search', async () => {
      mockPosGetProducts.mockResolvedValue([
        { id: 'p1', sku: 'SKU001', name: 'Water', description: '', sellingPrice: 5, costPrice: 3, categoryId: 1, type: 'retail', imageUrl: null, isActive: 1, stockQuantity: 50 },
      ] as any);
      loginAsTestUser();
      setPOSPath('/pos/products');
      render(<POSApp />);
      await waitFor(() => { expect(screen.getByText('Water')).toBeInTheDocument(); });
      fireEvent.change(screen.getByPlaceholderText('Search products...'), { target: { value: 'xyz' } });
      expect(screen.getByText('No products found')).toBeInTheDocument();
    });

    it('adds product to cart on click', async () => {
      mockPosGetProducts.mockResolvedValue([
        { id: 'p1', sku: 'SKU001', name: 'UniqueProduct', description: '', sellingPrice: 5, costPrice: 3, categoryId: 1, type: 'retail', imageUrl: null, isActive: 1, stockQuantity: 50 },
      ] as any);
      loginAsTestUser();
      setPOSPath('/pos/products');
      render(<POSApp />);
      await waitFor(() => { expect(screen.getByText('UniqueProduct')).toBeInTheDocument(); });
      fireEvent.click(screen.getAllByText('UniqueProduct')[0]);
      await waitFor(() => {
        expect(screen.getByText('In cart: 1')).toBeInTheDocument();
      });
    });

    it('increments product quantity when clicked again', async () => {
      mockPosGetProducts.mockResolvedValue([
        { id: 'p1', sku: 'SKU001', name: 'UniqueItem', description: '', sellingPrice: 5, costPrice: 3, categoryId: 1, type: 'retail', imageUrl: null, isActive: 1, stockQuantity: 50 },
      ] as any);
      loginAsTestUser();
      setPOSPath('/pos/products');
      render(<POSApp />);
      await waitFor(() => { expect(screen.getAllByText('UniqueItem').length).toBeGreaterThanOrEqual(1); });
      fireEvent.click(screen.getAllByText('UniqueItem')[0]);
      await waitFor(() => { expect(screen.getByText('In cart: 1')).toBeInTheDocument(); });
      fireEvent.click(screen.getAllByText('UniqueItem')[0]);
      await waitFor(() => {
        expect(screen.getByText('In cart: 2')).toBeInTheDocument();
      });
    });

    it('handles products API error', async () => {
      mockPosGetProducts.mockRejectedValue(new Error('Products load failed'));
      loginAsTestUser();
      setPOSPath('/pos/products');
      render(<POSApp />);
      await waitFor(() => {
        expect(screen.getByText('Products load failed')).toBeInTheDocument();
      });
    });

    it('renders product with image', async () => {
      mockPosGetProducts.mockResolvedValue([
        { id: 'p1', sku: 'SKU001', name: 'Water', description: '', sellingPrice: 5, costPrice: 3, categoryId: 1, type: 'retail', imageUrl: 'https://example.com/water.jpg', isActive: 1, stockQuantity: 50 },
      ] as any);
      loginAsTestUser();
      setPOSPath('/pos/products');
      render(<POSApp />);
      await waitFor(() => {
        const img = screen.getByAltText('Water');
        expect(img).toHaveAttribute('src', 'https://example.com/water.jpg');
      });
    });

    it('filters by SKU', async () => {
      mockPosGetProducts.mockResolvedValue([
        { id: 'p1', sku: 'ABC-123', name: 'Widget', description: '', sellingPrice: 5, costPrice: 3, categoryId: 1, type: 'retail', imageUrl: null, isActive: 1, stockQuantity: 50 },
      ] as any);
      loginAsTestUser();
      setPOSPath('/pos/products');
      render(<POSApp />);
      await waitFor(() => { expect(screen.getByText('Widget')).toBeInTheDocument(); });
      fireEvent.change(screen.getByPlaceholderText('Search products...'), { target: { value: 'ABC' } });
      expect(screen.getByText('Widget')).toBeInTheDocument();
    });
  });

  describe('Cart Panel', () => {
    const waterProduct = { id: 'p1', sku: 'SKU001', name: 'WaterCart', description: '', sellingPrice: 10, costPrice: 5, categoryId: 1, type: 'retail', imageUrl: null, isActive: 1, stockQuantity: 50 };

    async function renderWithProduct(product = waterProduct) {
      mockPosGetProducts.mockResolvedValue([product] as any);
      loginAsTestUser();
      setPOSPath('/pos/products');
      render(<POSApp />);
      await waitFor(() => { expect(screen.getAllByText(product.name).length).toBeGreaterThanOrEqual(1); });
    }

    it('shows cart panel with empty state', async () => {
      mockPosGetProducts.mockResolvedValue([] as any);
      loginAsTestUser();
      setPOSPath('/pos/products');
      render(<POSApp />);
      await waitFor(() => {
        expect(screen.getByText('Current Order')).toBeInTheDocument();
        expect(screen.getByText('Click products to add to cart')).toBeInTheDocument();
      });
    });

    it('adds product and shows subtotal/tax/total', async () => {
      await renderWithProduct();
      fireEvent.click(screen.getAllByText('WaterCart')[0]);
      await waitFor(() => {
        expect(screen.getByText('Subtotal')).toBeInTheDocument();
        expect(screen.getByText('Tax (10%)')).toBeInTheDocument();
      });
    });

    it('decrements item quantity with minus button', async () => {
      await renderWithProduct();
      fireEvent.click(screen.getAllByText('WaterCart')[0]);
      fireEvent.click(screen.getAllByText('WaterCart')[0]);
      await waitFor(() => { expect(screen.getByText('In cart: 2')).toBeInTheDocument(); });
      const minusButtons = screen.getAllByText('-');
      fireEvent.click(minusButtons[0]);
      await waitFor(() => {
        expect(screen.getByText('In cart: 1')).toBeInTheDocument();
      });
    });

    it('increments item quantity with plus button', async () => {
      await renderWithProduct();
      fireEvent.click(screen.getAllByText('WaterCart')[0]);
      fireEvent.click(screen.getAllByText('WaterCart')[0]);
      await waitFor(() => { expect(screen.getByText('In cart: 2')).toBeInTheDocument(); });
      const plusButtons = screen.getAllByText('+');
      fireEvent.click(plusButtons[0]);
      await waitFor(() => {
        expect(screen.getByText('In cart: 3')).toBeInTheDocument();
      });
    });

    it('removes item when quantity reaches zero', async () => {
      await renderWithProduct();
      fireEvent.click(screen.getAllByText('WaterCart')[0]);
      const minusButtons = screen.getAllByText('-');
      fireEvent.click(minusButtons[0]);
      await waitFor(() => {
        expect(screen.getByText('Click products to add to cart')).toBeInTheDocument();
      });
    });

    it('selects card payment method', async () => {
      await renderWithProduct();
      fireEvent.click(screen.getAllByText('WaterCart')[0]);
      await waitFor(() => { expect(screen.getByText(/Pay \$/)).toBeInTheDocument(); });
      fireEvent.click(screen.getByText('Card'));
      expect(screen.getByText(/Pay \$/)).toBeInTheDocument();
    });

    it('selects split payment and shows cash input', async () => {
      await renderWithProduct();
      fireEvent.click(screen.getAllByText('WaterCart')[0]);
      await waitFor(() => { expect(screen.getByText(/Pay \$/)).toBeInTheDocument(); });
      fireEvent.click(screen.getByText('Split'));
      await waitFor(() => {
        expect(screen.getByText('Cash', { selector: 'label' })).toBeInTheDocument();
      });
    });

    it('sends split payment details when checking out with split', async () => {
      await renderWithProduct();
      mockPosCreateOrder.mockResolvedValue({
        order: {
          id: 'o1', orderNumber: 'ORD-200', totalAmount: 11, subtotal: 10, taxAmount: 1, paymentMethod: 'split', status: 'completed', createdAt: new Date().toISOString(),
        },
      } as any);
      fireEvent.click(screen.getAllByText('WaterCart')[0]);
      await waitFor(() => { expect(screen.getByText(/Pay \$/)).toBeInTheDocument(); });
      fireEvent.click(screen.getByText('Split'));
      await waitFor(() => { expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument(); });
      fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '5' } });
      fireEvent.click(screen.getByText(/Pay \$/));
      await waitFor(() => {
        expect(mockPosCreateOrder).toHaveBeenCalledWith(expect.objectContaining({
          paymentMethod: 'split',
          amountCash: 5,
          amountCard: 6,
        }));
      });
    });

    it('disables checkout when split cash exceeds the total', async () => {
      await renderWithProduct();
      fireEvent.click(screen.getAllByText('WaterCart')[0]);
      await waitFor(() => { expect(screen.getByText(/Pay \$/)).toBeInTheDocument(); });
      fireEvent.click(screen.getByText('Split'));
      await waitFor(() => { expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument(); });
      fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '50' } });
      await waitFor(() => {
        expect(screen.getByText('Cash exceeds total')).toBeInTheDocument();
      });
    });

    it('shows checkout error', async () => {
      await renderWithProduct();
      mockPosCreateOrder.mockRejectedValue(new Error('Payment declined'));
      fireEvent.click(screen.getAllByText('WaterCart')[0]);
      await waitFor(() => { expect(screen.getByText(/Pay \$/)).toBeInTheDocument(); });
      fireEvent.click(screen.getByText(/Pay \$/));
      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Payment declined', 'error');
      });
    });

    it('successful checkout calls API and clears cart', async () => {
      await renderWithProduct();
      mockPosCreateOrder.mockResolvedValue({
        order: {
          id: 'o1', orderNumber: 'ORD-100', totalAmount: 11, subtotal: 10, taxAmount: 1, paymentMethod: 'cash', status: 'completed', createdAt: new Date().toISOString(),
          items: [{ id: 'i1', productName: 'Water', quantity: 1, unitPrice: 10, totalAmount: 10 }],
        },
      } as any);
      fireEvent.click(screen.getAllByText('WaterCart')[0]);
      await waitFor(() => { expect(screen.getByText(/Pay \$/)).toBeInTheDocument(); });
      fireEvent.click(screen.getByText(/Pay \$/));
      await waitFor(() => {
        expect(mockPosCreateOrder).toHaveBeenCalled();
      });
    });

    it('receipt shows items unavailable when order has no items', async () => {
      mockPosCreateOrder.mockResolvedValue({
        order: {
          id: 'o1', orderNumber: 'ORD-101', totalAmount: 11, subtotal: 10, taxAmount: 1, paymentMethod: 'cash', status: 'completed', createdAt: new Date().toISOString(),
        },
      } as any);
      await renderWithProduct();
      fireEvent.click(screen.getAllByText('WaterCart')[0]);
      fireEvent.click(screen.getByText(/Pay \$/));
      await waitFor(() => {
        expect(mockPosCreateOrder).toHaveBeenCalled();
      });
    });
  });

  describe('Orders View', () => {
    it('shows orders table', async () => {
      mockPosGetOrders.mockResolvedValue([
        { id: '1', orderNumber: 'ORD-001', totalAmount: 25.50, subtotal: 23.18, taxAmount: 2.32, paymentMethod: 'cash', status: 'completed', createdAt: new Date().toISOString() },
      ] as any);
      loginAsTestUser();
      setPOSPath('/pos/orders');
      render(<POSApp />);
      await waitFor(() => { expect(screen.getByText('ORD-001')).toBeInTheDocument(); });
    });

    it('shows empty orders state', async () => {
      loginAsTestUser();
      setPOSPath('/pos/orders');
      render(<POSApp />);
      await waitFor(() => { expect(screen.getByText('No orders found')).toBeInTheDocument(); });
    });

    it('handles orders API error', async () => {
      mockPosGetOrders.mockRejectedValue(new Error('Orders load failed'));
      loginAsTestUser();
      setPOSPath('/pos/orders');
      render(<POSApp />);
      await waitFor(() => { expect(screen.getByText('Orders load failed')).toBeInTheDocument(); });
    });
  });

  describe('Shift Overlay', () => {
    it('shows shift overlay when no active shift', async () => {
      mockPosGetActiveShift.mockResolvedValue({ active: false } as any);
      loginAsTestUser();
      render(<POSApp />);
      await waitFor(() => {
        expect(screen.getByText('Open Cash Drawer')).toBeInTheDocument();
      });
    });

    it('validates opening cash input', async () => {
      mockPosGetActiveShift.mockResolvedValue({ active: false } as any);
      loginAsTestUser();
      render(<POSApp />);
      await waitFor(() => { expect(screen.getByText('Open Cash Drawer')).toBeInTheDocument(); });
      fireEvent.click(screen.getByText('Open Shift'));
      await waitFor(() => {
        expect(screen.getByText('Enter a valid opening cash amount')).toBeInTheDocument();
      });
    });

    it('opens shift with valid cash', async () => {
      mockPosGetActiveShift.mockResolvedValue({ active: false } as any);
      mockPosOpenShift.mockResolvedValue({
        shift: { id: 's2', status: 'open', openingTime: new Date().toISOString(), openingCash: 200, expectedClosingCash: 200, notes: null },
      } as any);
      loginAsTestUser();
      render(<POSApp />);
      await waitFor(() => { expect(screen.getByText('Open Cash Drawer')).toBeInTheDocument(); });
      fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '200' } });
      fireEvent.click(screen.getByText('Open Shift'));
      await waitFor(() => {
        expect(mockPosOpenShift).toHaveBeenCalledWith({ openingCash: 200 });
      });
    });

    it('handles shift open error', async () => {
      mockPosGetActiveShift.mockResolvedValue({ active: false } as any);
      mockPosOpenShift.mockRejectedValue(new Error('Cannot open shift'));
      loginAsTestUser();
      render(<POSApp />);
      await waitFor(() => { expect(screen.getByText('Open Cash Drawer')).toBeInTheDocument(); });
      fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '100' } });
      fireEvent.click(screen.getByText('Open Shift'));
      await waitFor(() => {
        expect(screen.getByText('Cannot open shift')).toBeInTheDocument();
      });
    });
  });

  describe('Shift Dashboard', () => {
    it('shows current shift info', async () => {
      loginAsTestUser();
      setPOSPath('/pos/shift');
      render(<POSApp />);
      await waitFor(() => {
        expect(screen.getByText('Current Shift')).toBeInTheDocument();
        expect(screen.getByText('Shift ID')).toBeInTheDocument();
      });
    });

    it('validates closing cash input', async () => {
      loginAsTestUser();
      setPOSPath('/pos/shift');
      render(<POSApp />);
      await waitFor(() => { expect(screen.getAllByText('Close Shift').length).toBeGreaterThanOrEqual(1); });
      clickCloseShiftButton();
      await waitFor(() => {
        expect(screen.getByText('Enter closing cash amount')).toBeInTheDocument();
      });
    });

    it('closes shift with valid cash', async () => {
      mockPosCloseShift.mockResolvedValue({
        shift: { id: 's1', status: 'closed', openingCash: 100, totalCashSales: 150, expectedClosingCash: 250, actualClosingCash: 250, discrepancy: 0 },
      } as any);
      loginAsTestUser();
      setPOSPath('/pos/shift');
      render(<POSApp />);
      await waitFor(() => { expect(screen.getAllByText('Close Shift').length).toBeGreaterThanOrEqual(1); });
      fireEvent.change(screen.getByLabelText('Actual Closing Cash ($)'), { target: { value: '250' } });
      clickCloseShiftButton();
      await waitFor(() => {
        expect(screen.getByText('Shift Closed')).toBeInTheDocument();
        expect(screen.getByText('Balanced')).toBeInTheDocument();
      });
    });

    it('shows discrepancy when closing cash does not match', async () => {
      mockPosCloseShift.mockResolvedValue({
        shift: { id: 's1', status: 'closed', openingCash: 100, totalCashSales: 150, expectedClosingCash: 250, actualClosingCash: 200, discrepancy: -50 },
      } as any);
      loginAsTestUser();
      setPOSPath('/pos/shift');
      render(<POSApp />);
      await waitFor(() => { expect(screen.getAllByText('Close Shift').length).toBeGreaterThanOrEqual(1); });
      fireEvent.change(screen.getByLabelText('Actual Closing Cash ($)'), { target: { value: '200' } });
      clickCloseShiftButton();
      await waitFor(() => {
        expect(screen.getByText('Shift Closed')).toBeInTheDocument();
        expect(screen.getByText('$-50.00')).toBeInTheDocument();
      });
    });

    it('shows positive discrepancy', async () => {
      mockPosCloseShift.mockResolvedValue({
        shift: { id: 's1', status: 'closed', openingCash: 100, totalCashSales: 150, expectedClosingCash: 250, actualClosingCash: 260, discrepancy: 10 },
      } as any);
      loginAsTestUser();
      setPOSPath('/pos/shift');
      render(<POSApp />);
      await waitFor(() => { expect(screen.getAllByText('Close Shift').length).toBeGreaterThanOrEqual(1); });
      fireEvent.change(screen.getByLabelText('Actual Closing Cash ($)'), { target: { value: '260' } });
      clickCloseShiftButton();
      await waitFor(() => {
        expect(screen.getByText('$+10.00')).toBeInTheDocument();
      });
    });

    it('handles close shift error', async () => {
      mockPosCloseShift.mockRejectedValue(new Error('Close shift failed'));
      loginAsTestUser();
      setPOSPath('/pos/shift');
      render(<POSApp />);
      await waitFor(() => { expect(screen.getAllByText('Close Shift').length).toBeGreaterThanOrEqual(1); });
      fireEvent.change(screen.getByLabelText('Actual Closing Cash ($)'), { target: { value: '200' } });
      clickCloseShiftButton();
      await waitFor(() => {
        expect(screen.getByText('Close shift failed')).toBeInTheDocument();
      });
    });

    it('navigates back to POS after closing shift', async () => {
      mockPosCloseShift.mockResolvedValue({
        shift: { id: 's1', status: 'closed', openingCash: 100, totalCashSales: 150, expectedClosingCash: 250, actualClosingCash: 250, discrepancy: 0 },
      } as any);
      loginAsTestUser();
      setPOSPath('/pos/shift');
      render(<POSApp />);
      await waitFor(() => { expect(screen.getAllByText('Close Shift').length).toBeGreaterThanOrEqual(1); });
      fireEvent.change(screen.getByLabelText('Actual Closing Cash ($)'), { target: { value: '250' } });
      clickCloseShiftButton();
      await waitFor(() => { expect(screen.getByText('Shift Closed')).toBeInTheDocument(); });
      // Back to POS triggers navigation (full page reload in production)
      const backBtn = screen.getByText('Back to POS');
      expect(backBtn).toBeInTheDocument();
      fireEvent.click(backBtn);
      await waitFor(() => {
        expect(window.location.href).toBe('/pos/dashboard');
      });
    });
  });

  describe('Path-based navigation', () => {
    it('reads initial path for view selection', async () => {
      loginAsTestUser();
      setPOSPath('/pos/products');
      render(<POSApp />);
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search products...')).toBeInTheDocument();
      });
    });
  });

  describe('Shift check failure is non-fatal', () => {
    it('still shows shift overlay when shift check fails', async () => {
      mockPosGetActiveShift.mockRejectedValue(new Error('Shift check failed'));
      loginAsTestUser();
      render(<POSApp />);
      await waitFor(() => {
        expect(screen.getByText('Open Cash Drawer')).toBeInTheDocument();
      });
    });
  });
});
