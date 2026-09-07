import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import SupplyPanel from '@/components/admin/SupplyPanel';
import SuperSupplyPanel from '@/components/admin/SuperSupplyPanel';
import StorefrontPanel from '@/components/admin/StorefrontPanel';
import SuperStorefrontPanel from '@/components/admin/SuperStorefrontPanel';

// ─── Mock handles (referenced lazily inside vi.mock factories) ──────────────
const mockShowToast = vi.fn();
let mockUser: { role: string } | null = { role: 'super_admin' };

const mockApiFetch = vi.fn();
const mockGetAdminTenants = vi.fn();
const mockGetSupplyWarehouses = vi.fn();
const mockGetSupplyStock = vi.fn();
const mockGetSupplyTransfers = vi.fn();
const mockGetSupplyPurchaseOrders = vi.fn();
const mockGetSupplyBoms = vi.fn();
const mockGetSupplyManufacturingOrders = vi.fn();
const mockGetStorefrontPages = vi.fn();
const mockGetStorefrontBlogPosts = vi.fn();
const mockGetStorefrontBlogCategories = vi.fn();
const mockRequest = vi.fn();
const mockSaveStorefrontPage = vi.fn();
const mockSaveStorefrontBlogPost = vi.fn();
const mockSaveStorefrontBlogCategory = vi.fn();
const mockDeleteStorefrontPage = vi.fn();
const mockDeleteStorefrontBlogPost = vi.fn();
const mockDeleteStorefrontBlogCategory = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  getAdminTenants: (...args: unknown[]) => mockGetAdminTenants(...args),
  getSupplyWarehouses: (...args: unknown[]) => mockGetSupplyWarehouses(...args),
  getSupplyStock: (...args: unknown[]) => mockGetSupplyStock(...args),
  getSupplyTransfers: (...args: unknown[]) => mockGetSupplyTransfers(...args),
  getSupplyPurchaseOrders: (...args: unknown[]) => mockGetSupplyPurchaseOrders(...args),
  getSupplyBoms: (...args: unknown[]) => mockGetSupplyBoms(...args),
  getSupplyManufacturingOrders: (...args: unknown[]) => mockGetSupplyManufacturingOrders(...args),
  getStorefrontPages: (...args: unknown[]) => mockGetStorefrontPages(...args),
  getStorefrontBlogPosts: (...args: unknown[]) => mockGetStorefrontBlogPosts(...args),
  getStorefrontBlogCategories: (...args: unknown[]) => mockGetStorefrontBlogCategories(...args),
  request: (...args: unknown[]) => mockRequest(...args),
  saveStorefrontPage: (...args: unknown[]) => mockSaveStorefrontPage(...args),
  saveStorefrontBlogPost: (...args: unknown[]) => mockSaveStorefrontBlogPost(...args),
  saveStorefrontBlogCategory: (...args: unknown[]) => mockSaveStorefrontBlogCategory(...args),
  deleteStorefrontPage: (...args: unknown[]) => mockDeleteStorefrontPage(...args),
  deleteStorefrontBlogPost: (...args: unknown[]) => mockDeleteStorefrontBlogPost(...args),
  deleteStorefrontBlogCategory: (...args: unknown[]) => mockDeleteStorefrontBlogCategory(...args),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

vi.mock('@/lib/utils', () => ({
  formatCurrency: (n: number) => `$${Number(n).toFixed(2)}`,
  formatDate: (d: string) => d,
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('@/components/ui/DataTable', () => ({
  DataTable: ({
    data,
    columns,
    emptyMessage,
    actions,
  }: {
    data: unknown[];
    columns: { key: string; header: string; render?: (item: unknown) => React.ReactNode }[];
    emptyMessage?: string;
    actions?: (row: unknown) => React.ReactNode;
  }) => (
    <div data-testid="data-table">
      {data.length === 0 && emptyMessage && <p>{emptyMessage}</p>}
      {data.map((row: any, i: number) => (
        <div key={i} data-testid="data-row">
          {columns.map((col) => (
            <span key={col.key}>{col.render ? col.render(row) : String(row[col.key] ?? '')}</span>
          ))}
          {actions && <div>{actions(row)}</div>}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('@/components/ui/FormModal', () => ({
  FormModal: ({
    open,
    title,
    children,
    onClose,
    onSubmit,
    submitLabel,
    submitDisabled,
  }: {
    open: boolean;
    title: string;
    children: React.ReactNode;
    onClose?: () => void;
    onSubmit?: () => void;
    submitLabel?: string;
    submitDisabled?: boolean;
  }) =>
    open ? (
      <div data-testid="form-modal">
        <h2>{title}</h2>
        {children}
        {onClose && <button data-testid="modal-close" onClick={onClose}>Close</button>}
        {onSubmit && (
          <button data-testid="modal-submit" onClick={onSubmit} disabled={submitDisabled}>
            {submitLabel || 'Submit'}
          </button>
        )}
      </div>
    ) : null,
}));

vi.mock('@/components/ui/ConfirmDialog', () => ({
  ConfirmDialog: ({
    open,
    title,
    message,
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    title: string;
    message?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <h2>{title}</h2>
        {message && <p>{message}</p>}
        {onConfirm && <button data-testid="confirm-yes" onClick={onConfirm}>Confirm</button>}
        {onCancel && <button data-testid="confirm-no" onClick={onCancel}>Cancel</button>}
      </div>
    ) : null,
}));

vi.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: ({ text }: { text?: string }) => <div data-testid="loading-spinner">{text}</div>,
}));

vi.mock('@/components/ui/EmptyState', () => ({
  EmptyState: ({ title, description, action }: { title: string; description?: string; action?: { label: string; onClick: () => void } }) => (
    <div data-testid="empty-state">
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <button data-testid={`empty-action-${action.label}`} onClick={action.onClick}>{action.label}</button>}
    </div>
  ),
}));

vi.mock('@/components/ui/Badge', () => ({
  Badge: ({ children, ...rest }: { children: React.ReactNode; [key: string]: unknown }) => <span {...rest}>{children}</span>,
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...rest
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    [key: string]: unknown;
  }) => (
    <button onClick={onClick} disabled={disabled} {...rest}>{children}</button>
  ),
}));

vi.mock('@/components/ui/Input', () => ({
  Input: ({
    label,
    value,
    onChange,
    placeholder,
    type,
  }: {
    label?: string;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    type?: string;
  }) => (
    <div>
      {label && <label>{label}</label>}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        data-testid={label ? `input-${label}` : 'input'}
      />
    </div>
  ),
}));

vi.mock('@/components/ui/Select', () => ({
  Select: ({
    label,
    options,
    value,
    onChange,
    placeholder,
  }: {
    label?: string;
    options: { value: string; label: string }[];
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    placeholder?: string;
  }) => (
    <div>
      {label && <label>{label}</label>}
      <select
        value={value}
        onChange={onChange}
        data-testid={label ? `select-${label}` : 'select'}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt: { value: string; label: string }) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  ),
}));

vi.mock('@/components/ui/Card', () => ({
  Card: ({
    children,
    ...rest
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => <div {...rest}>{children}</div>,
}));

vi.mock('@/components/ui/StatCard', () => ({
  StatCard: ({ title, value }: { title: string; value: string | number }) => (
    <div data-testid="stat-card">
      <span>{title}</span>
      <span>{value}</span>
    </div>
  ),
}));

// ─── Representative data ─────────────────────────────────────────────────────
const sampleTenants = [
  { id: 't1', name: 'Camp Alpha', subdomain: 'alpha', status: 'active' },
  { id: 't2', name: 'Camp Beta', subdomain: 'beta', status: 'active' },
];

const sampleWarehouses = [
  { id: 'wh1', name: 'Main Warehouse', location: 'Cairo', isActive: 1 },
  { id: 'wh2', name: 'Overflow', location: '', isActive: 0 },
];

const sampleStock = [
  { id: 's1', productId: 'p1', warehouseId: 'wh1', quantity: 25, reserved: 5, productName: 'Tent', warehouseName: 'Main Warehouse' },
  { id: 's2', productId: 'p2', warehouseId: 'wh1', quantity: 10, reserved: 10, productName: '', warehouseName: '' },
];

const sampleTransfers = [
  { id: 'tr1', fromWarehouseId: 'wh1', toWarehouseId: 'wh2', productId: 'p1', quantity: 4, status: 'draft', fromWarehouseName: 'Main Warehouse', toWarehouseName: 'Overflow', productName: 'Tent' },
  { id: 'tr2', fromWarehouseId: 'wh1', toWarehouseId: 'wh2', productId: 'p1', quantity: 6, status: 'in_transit', fromWarehouseName: 'Main Warehouse', toWarehouseName: 'Overflow', productName: 'Tent' },
  { id: 'tr3', fromWarehouseId: 'wh1', toWarehouseId: 'wh2', productId: 'p2', quantity: 2, status: 'completed', fromWarehouseName: '', toWarehouseName: '', productName: '' },
];

const samplePOs = [
  { id: 'po1', poNumber: 'PO-1001', vendorId: 'v1', orderDate: '2026-08-01T00:00:00Z', totalAmount: 1250.5, status: 'draft' },
  { id: 'po2', poNumber: 'PO-1002', vendorId: '', orderDate: '', totalAmount: 0, status: 'received' },
  { id: 'po3', poNumber: 'PO-1003', vendorId: null, orderDate: '2026-08-02T00:00:00Z', totalAmount: 99, status: 'sent' },
  { id: 'po4', poNumber: 'PO-1004', vendorId: 'v2', orderDate: '2026-08-03T00:00:00Z', totalAmount: 10, status: 'canceled' },
];

const sampleBOMs = [
  { id: 'bom1', productId: 'p1', name: 'Widget Assembly', version: 1, productName: 'Widget', lines: [{ id: 'l1', componentId: 'c1', quantity: 2, unit: 'each' }, { id: 'l2', componentId: 'c2', quantity: 1, unit: 'kg' }] },
  { id: 'bom2', productId: 'p5', name: 'Empty BOM', version: 2, productName: '', lines: [] },
];

const sampleMOs = [
  { id: 'mo1', productId: 'p1', quantity: 10, status: 'planned', producedQuantity: 0, productName: 'Widget', bomName: 'Widget Assembly' },
  { id: 'mo2', productId: 'p1', quantity: 10, status: 'in_production', producedQuantity: 4, productName: 'Widget', bomName: 'Widget Assembly' },
  { id: 'mo3', productId: 'p2', quantity: 5, status: 'completed', producedQuantity: 5, productName: 'Gadget', bomName: 'Gadget Assembly' },
  { id: 'mo4', productId: 'p3', quantity: 3, status: 'canceled', producedQuantity: 0, productName: '', bomName: '' },
];

const samplePages = [
  { id: 'pg1', slug: 'about', title: 'About Us', content: '<p>Hello</p>', metaTitle: 'About', metaDescription: 'desc', isPublished: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' },
  { id: 'pg2', slug: 'draft-page', title: 'Draft Page', content: '', metaTitle: '', metaDescription: '', isPublished: 0, createdAt: '2026-01-03T00:00:00Z', updatedAt: null },
];

const samplePosts = [
  { id: 'bp1', slug: 'hello', title: 'Hello World', content: '<p>x</p>', excerpt: 'Intro', category: 'News', tags: 'a,b', authorId: 'u1', isPublished: 1, publishedAt: '2026-01-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'bp2', slug: 'draft', title: 'Draft Post', content: '', excerpt: '', category: null, tags: '', authorId: null, isPublished: 0, publishedAt: null, createdAt: '2026-02-01T00:00:00Z', updatedAt: null },
];

const sampleCategories = [
  { id: 'cat1', name: 'News', slug: 'news', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'cat2', name: 'Guides', slug: 'guides', createdAt: '2026-01-02T00:00:00Z' },
];

const sampleCarts = [
  { id: 'cart1', sessionId: 'sess-abc', userId: null, itemCount: 3, total: 250, createdAt: '2026-01-05T00:00:00Z' },
  { id: 'cart2', sessionId: '', userId: 'u9', itemCount: 0, total: 0, createdAt: null },
];

const sampleOrders = [
  { id: 'o1', orderNumber: 'ORD-1', customerEmail: 'a@b.com', totalAmount: 300, status: 'completed', paymentStatus: 'paid', createdAt: '2026-01-06T00:00:00Z' },
  { id: 'o2', orderNumber: 'ORD-2', customerEmail: '', totalAmount: 0, status: 'pending', paymentStatus: 'unpaid', createdAt: null },
  { id: 'o3', orderNumber: 'ORD-3', customerEmail: 'c@d.com', totalAmount: 55, status: 'canceled', paymentStatus: 'refunded', createdAt: '2026-01-07T00:00:00Z' },
];

const mockSupplyOverview = {
  totalWarehouses: 12,
  totalProducts: 34,
  pendingPurchaseOrders: 5,
  lowStockItems: 2,
  tenantBreakdown: [{ tenantId: 't1', tenantName: 'Camp Alpha', warehouseCount: 8, productCount: 20 }],
};

const mockSuperPOs = [
  { id: 'po-1', reference: 'PO-500', status: 'received', totalAmount: 1500, tenantName: 'Camp Alpha', createdAt: '2026-07-01T00:00:00Z' },
  { id: 'po-2', reference: '', status: 'canceled', totalAmount: 0, tenantName: '', createdAt: null },
  { id: 'po-3', reference: 'PO-501', status: 'draft', totalAmount: 75.5, tenantName: 'Camp Beta', createdAt: '2026-07-02T00:00:00Z' },
];

const mockStorefrontOverview = {
  totalProducts: 100,
  activeProducts: 80,
  totalPOSTransactions: 42,
  totalPOSRevenue: 12500.5,
  tenantBreakdown: [{ tenantId: 't1', tenantName: 'Camp Alpha', productCount: 40, activeCount: 20 }],
};

const mockSuperProducts = [
  { id: 'prod1', name: 'Tent', sku: 'TNT-1', price: 150, tenantName: 'Camp Alpha', status: 'active' },
  { id: 'prod2', name: '', sku: '', price: 0, tenantName: '', status: 'draft' },
];

// Default apiFetch route table: super overview/lists + storefront admin lists.
function defaultApiFetch(url: string) {
  const u = String(url);
  if (u.includes('/admin/supply/overview')) return Promise.resolve(mockSupplyOverview);
  if (u.includes('/admin/supply/purchase-orders')) return Promise.resolve({ data: mockSuperPOs, total: mockSuperPOs.length });
  if (u.includes('/admin/storefront/overview')) return Promise.resolve(mockStorefrontOverview);
  if (u.includes('/admin/storefront/products')) return Promise.resolve({ data: mockSuperProducts, total: mockSuperProducts.length });
  if (u.includes('/storefront/admin/blog/categories')) return Promise.resolve(sampleCategories);
  if (u.includes('/storefront/admin/carts')) return Promise.resolve(sampleCarts);
  if (u.includes('/storefront/admin/orders')) return Promise.resolve(sampleOrders);
  return Promise.resolve({});
}

// ─── Test utilities ──────────────────────────────────────────────────────────
function deferred<T = unknown>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('SupplyPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { role: 'super_admin' };
    mockApiFetch.mockImplementation(defaultApiFetch);
    mockGetSupplyWarehouses.mockResolvedValue(sampleWarehouses);
    mockGetSupplyStock.mockResolvedValue(sampleStock);
    mockGetSupplyTransfers.mockResolvedValue(sampleTransfers);
    mockGetSupplyPurchaseOrders.mockResolvedValue(samplePOs);
    mockGetSupplyBoms.mockResolvedValue(sampleBOMs);
    mockGetSupplyManufacturingOrders.mockResolvedValue(sampleMOs);
    mockRequest.mockResolvedValue({ id: 'x', success: true });
  });

  it('shows loading spinner while supply queries are in flight', async () => {
    const d = deferred<unknown[]>();
    mockGetSupplyWarehouses.mockReturnValue(d.promise as never);
    await act(async () => {
      renderWithQuery(<SupplyPanel />);
    });
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.getByText('Loading supply chain...')).toBeInTheDocument();
    await act(async () => {
      d.resolve(sampleWarehouses);
    });
  });

  it('renders warehouses table with data and badges', async () => {
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('supply-panel')).toBeInTheDocument();
    });
    expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
    expect(screen.getByText('Overflow')).toBeInTheDocument();
    expect(screen.getByText('Cairo')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    // inactive warehouse location falls back to '-'
    const rows = screen.getAllByTestId('data-row');
    expect(within(rows[1]).getByText('-')).toBeInTheDocument();
  });

  it('shows warehouse empty state and opens add modal from the header button', async () => {
    mockGetSupplyWarehouses.mockResolvedValue([]);
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: 'No warehouses' })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Warehouse' })[0]);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Add Warehouse' })).toBeInTheDocument();
    });
  });

  it('opens add warehouse modal from the empty state action', async () => {
    mockGetSupplyWarehouses.mockResolvedValue([]);
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('empty-action-Add Warehouse')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('empty-action-Add Warehouse'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Add Warehouse' })).toBeInTheDocument();
    });
  });

  it('validates warehouse name is required', async () => {
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('supply-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Warehouse' }));
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Name is required.', 'warning');
    });
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('creates a warehouse and shows success toast', async () => {
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('supply-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Warehouse' }));
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Main Warehouse' } });
    fireEvent.change(screen.getByTestId('input-Location'), { target: { value: 'Cairo, Egypt' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith('/supply/warehouses', {
        method: 'POST',
        body: JSON.stringify({ name: 'Main Warehouse', location: 'Cairo, Egypt' }),
      });
    });
    expect(mockShowToast).toHaveBeenCalledWith('Warehouse created.', 'success');
    await waitFor(() => {
      expect(screen.queryByTestId('form-modal')).not.toBeInTheDocument();
    });
  });

  it('edits a warehouse and shows updated toast', async () => {
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('supply-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Edit Warehouse' })).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith('/supply/warehouses/wh1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Renamed', location: 'Cairo' }),
      });
    });
    expect(mockShowToast).toHaveBeenCalledWith('Warehouse updated.', 'success');
  });

  it('deletes a warehouse after confirmation and deactivates it', async () => {
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('supply-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    expect(screen.getByText('Confirm Delete')).toBeInTheDocument();
    expect(mockShowToast).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('confirm-yes'));
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith('/supply/warehouses/wh1', { method: 'DELETE' });
    });
    expect(mockShowToast).toHaveBeenCalledWith('Warehouse deactivated.', 'success');
  });

  it('shows error toast when warehouse delete fails', async () => {
    mockRequest.mockRejectedValue(new Error('Boom'));
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('supply-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('confirm-yes'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: Boom', 'error');
    });
  });

  it('shows error toast when warehouse create fails', async () => {
    mockRequest.mockRejectedValue(new Error('Boom'));
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('supply-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Warehouse' }));
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'X' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: Boom', 'error');
    });
  });

  it('renders stock tab with availability calculations', async () => {
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('supply-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-stock'));
    await waitFor(() => {
      expect(screen.getByText('Tent')).toBeInTheDocument();
    });
    // quantity - reserved = 25 - 5 = 20
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
  });

  it('shows stock empty state', async () => {
    mockGetSupplyStock.mockResolvedValue([]);
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('supply-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-stock'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'No stock records' })).toBeInTheDocument();
    });
  });

  it('validates stock product and warehouse are required', async () => {
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('supply-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-stock'));
    fireEvent.click(screen.getByRole('button', { name: 'Adjust Stock' }));
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Product and warehouse required.', 'warning');
    });
  });

  it('adjusts stock and shows success toast', async () => {
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('supply-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-stock'));
    fireEvent.click(screen.getByRole('button', { name: 'Adjust Stock' }));
    fireEvent.change(screen.getByTestId('input-Product ID *'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByTestId('select-Warehouse *'), { target: { value: 'wh1' } });
    fireEvent.change(screen.getByTestId('input-Quantity (positive to add, negative to deduct) *'), { target: { value: '-3' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith('/supply/stock', {
        method: 'POST',
        body: JSON.stringify({ productId: 'p1', warehouseId: 'wh1', quantity: -3 }),
      });
    });
    expect(mockShowToast).toHaveBeenCalledWith('Stock adjusted.', 'success');
  });

  it('renders transfers tab with status badges and confirm action only for drafts', async () => {
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('supply-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-transfers'));
    await waitFor(() => {
      expect(screen.getByText('Draft')).toBeInTheDocument();
      expect(screen.getByText('In Transit')).toBeInTheDocument();
      expect(screen.getByText('Completed')).toBeInTheDocument();
    });
    expect(screen.getAllByRole('button', { name: 'Confirm' })).toHaveLength(1);
  });

  it('validates transfer fields are required', async () => {
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('supply-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-transfers'));
    fireEvent.click(screen.getByRole('button', { name: 'New Transfer' }));
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('All fields required.', 'warning');
    });
  });

  it('creates a transfer and shows success toast', async () => {
    // Both warehouses must be active so they appear in the transfer selects.
    mockGetSupplyWarehouses.mockResolvedValue([
      { ...sampleWarehouses[0] },
      { ...sampleWarehouses[1], isActive: 1 },
    ]);
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('supply-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-transfers'));
    fireEvent.click(screen.getByRole('button', { name: 'New Transfer' }));
    fireEvent.change(screen.getByTestId('input-Product ID *'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByTestId('select-From Warehouse *'), { target: { value: 'wh1' } });
    fireEvent.change(screen.getByTestId('select-To Warehouse *'), { target: { value: 'wh2' } });
    fireEvent.change(screen.getByTestId('input-Quantity *'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith('/supply/stock-transfers', {
        method: 'POST',
        body: JSON.stringify({ productId: 'p1', fromWarehouseId: 'wh1', toWarehouseId: 'wh2', quantity: 5 }),
      });
    });
    expect(mockShowToast).toHaveBeenCalledWith('Transfer created.', 'success');
  });

  it('confirms a draft transfer', async () => {
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('supply-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-transfers'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => {
      expect(screen.getByText('Confirm Transfer')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('confirm-yes'));
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith('/supply/stock-transfers/tr1/confirm', { method: 'PATCH' });
    });
    expect(mockShowToast).toHaveBeenCalledWith('Transfer confirmed.', 'success');
  });

  it('renders purchase orders tab with mixed statuses and amounts', async () => {
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('supply-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-purchaseOrders'));
    await waitFor(() => {
      expect(screen.getByText('PO-1001')).toBeInTheDocument();
    });
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Received')).toBeInTheDocument();
    expect(screen.getByText('Sent')).toBeInTheDocument();
    expect(screen.getByText('Canceled')).toBeInTheDocument();
    expect(screen.getByText('$1250.50')).toBeInTheDocument();
    // draft + sent rows expose the Receive action
    expect(screen.getAllByRole('button', { name: 'Receive' })).toHaveLength(2);
  });

  it('validates purchase order date and lines are required', async () => {
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('supply-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-purchaseOrders'));
    fireEvent.click(screen.getByRole('button', { name: 'New PO' }));
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Order date and at least one line required.', 'warning');
    });
  });

  it('validates purchase order requires at least one valid line', async () => {
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('supply-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-purchaseOrders'));
    fireEvent.click(screen.getByRole('button', { name: 'New PO' }));
    fireEvent.change(screen.getByTestId('input-Order Date *'), { target: { value: '2026-08-15' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Add at least one valid line.', 'warning');
    });
  });

  it('creates a purchase order with line items', async () => {
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('supply-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-purchaseOrders'));
    fireEvent.click(screen.getByRole('button', { name: 'New PO' }));
    fireEvent.change(screen.getByTestId('input-Vendor ID'), { target: { value: 'v1' } });
    fireEvent.change(screen.getByTestId('input-Order Date *'), { target: { value: '2026-08-15' } });
    fireEvent.change(screen.getByTestId('input-Expected Delivery'), { target: { value: '2026-08-25' } });
    fireEvent.change(screen.getByTestId('input-Notes'), { target: { value: 'Urgent' } });
    const lineInputs = screen.getAllByTestId('input');
    fireEvent.change(lineInputs[0], { target: { value: 'p9' } });
    fireEvent.change(lineInputs[1], { target: { value: '2' } });
    fireEvent.change(lineInputs[2], { target: { value: '12.5' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith('/supply/purchase-orders', {
        method: 'POST',
        body: JSON.stringify({
          vendorId: 'v1',
          orderDate: '2026-08-15',
          expectedDelivery: '2026-08-25',
          notes: 'Urgent',
          lines: [{ productId: 'p9', quantity: 2, unitPrice: 12.5 }],
        }),
      });
    });
    expect(mockShowToast).toHaveBeenCalledWith('Purchase order created.', 'success');
  });

  it('adds a second PO line via the add-line button', async () => {
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('supply-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-purchaseOrders'));
    fireEvent.click(screen.getByRole('button', { name: 'New PO' }));
    fireEvent.click(screen.getByText('+ Add Line'));
    fireEvent.change(screen.getByTestId('input-Order Date *'), { target: { value: '2026-08-15' } });
    const lineInputs = screen.getAllByTestId('input');
    expect(lineInputs).toHaveLength(6);
    fireEvent.change(lineInputs[0], { target: { value: 'p9' } });
    fireEvent.change(lineInputs[3], { target: { value: 'p10' } });
    fireEvent.change(lineInputs[4], { target: { value: '3' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      const body = JSON.parse((mockRequest.mock.calls[0]![1] as RequestInit).body as string);
      expect(body.lines).toHaveLength(2);
      expect(body.lines[0]).toEqual({ productId: 'p9', quantity: 1, unitPrice: 0 });
      expect(body.lines[1]).toEqual({ productId: 'p10', quantity: 3, unitPrice: 0 });
    });
  });

  it('receives a draft purchase order', async () => {
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('supply-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-purchaseOrders'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Receive' })[0]);
    await waitFor(() => {
      expect(screen.getByText('Confirm Receive PO')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('confirm-yes'));
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith('/supply/purchase-orders/po1/receive', { method: 'PATCH' });
    });
    expect(mockShowToast).toHaveBeenCalledWith('Purchase order received.', 'success');
  });

  it('renders BOMs tab with component counts', async () => {
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('supply-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-boms'));
    await waitFor(() => {
      expect(screen.getByText('Widget Assembly')).toBeInTheDocument();
    });
    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.getByText('Widget')).toBeInTheDocument();
    // components count from lines array length
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('validates BOM product and name are required', async () => {
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('supply-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-boms'));
    fireEvent.click(screen.getByRole('button', { name: 'New BOM' }));
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Product and name required.', 'warning');
    });
  });

  it('validates BOM requires at least one component', async () => {
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('supply-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-boms'));
    fireEvent.click(screen.getByRole('button', { name: 'New BOM' }));
    fireEvent.change(screen.getByTestId('input-Product ID *'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Assembly' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Add at least one component.', 'warning');
    });
  });

  it('creates a BOM with component lines', async () => {
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('supply-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-boms'));
    fireEvent.click(screen.getByRole('button', { name: 'New BOM' }));
    fireEvent.change(screen.getByTestId('input-Product ID *'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Widget Assembly' } });
    const lineInputs = screen.getAllByTestId('input');
    fireEvent.change(lineInputs[0], { target: { value: 'c1' } });
    fireEvent.change(lineInputs[1], { target: { value: '2' } });
    fireEvent.change(lineInputs[2], { target: { value: 'each' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith('/supply/boms', {
        method: 'POST',
        body: JSON.stringify({
          productId: 'p1',
          name: 'Widget Assembly',
          lines: [{ componentId: 'c1', quantity: 2, unit: 'each' }],
        }),
      });
    });
    expect(mockShowToast).toHaveBeenCalledWith('BOM created.', 'success');
  });

  it('renders manufacturing tab and exposes Progress only on active orders', async () => {
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('supply-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-manufacturing'));
    await waitFor(() => {
      expect(screen.getByText('Planned')).toBeInTheDocument();
      expect(screen.getByText('In Production')).toBeInTheDocument();
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByText('Canceled')).toBeInTheDocument();
    });
    expect(screen.getByText('4/10')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Progress' })).toHaveLength(2);
  });

  it('validates manufacturing order BOM, product, and quantity are required', async () => {
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('supply-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-manufacturing'));
    fireEvent.click(screen.getByRole('button', { name: 'New Order' }));
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('BOM, product, and quantity required.', 'warning');
    });
  });

  it('creates a manufacturing order', async () => {
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('supply-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-manufacturing'));
    fireEvent.click(screen.getByRole('button', { name: 'New Order' }));
    fireEvent.change(screen.getByTestId('select-BOM *'), { target: { value: 'bom1' } });
    fireEvent.change(screen.getByTestId('input-Product ID *'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByTestId('input-Quantity *'), { target: { value: '10' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith('/supply/manufacturing-orders', {
        method: 'POST',
        body: JSON.stringify({ bomId: 'bom1', productId: 'p1', quantity: 10 }),
      });
    });
    expect(mockShowToast).toHaveBeenCalledWith('Manufacturing order created.', 'success');
  });

  it('updates MO progress to in_production when below target', async () => {
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('supply-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-manufacturing'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Progress' })[1]); // mo2: produced 4 / qty 10
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Update Production Progress' })).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('input-Produced Quantity'), { target: { value: '3' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith('/supply/manufacturing-orders/mo2/progress', {
        method: 'PATCH',
        body: JSON.stringify({ producedQuantity: 3, status: 'in_production' }),
      });
    });
    expect(mockShowToast).toHaveBeenCalledWith('Progress updated.', 'success');
  });

  it('updates MO progress to completed when reaching target', async () => {
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('supply-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-manufacturing'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Progress' })[0]); // mo1: produced 0 / qty 10
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Update Production Progress' })).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('input-Produced Quantity'), { target: { value: '10' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith('/supply/manufacturing-orders/mo1/progress', {
        method: 'PATCH',
        body: JSON.stringify({ producedQuantity: 10, status: 'completed' }),
      });
    });
    expect(mockShowToast).toHaveBeenCalledWith('Progress updated.', 'success');
  });

  it('renders unknown status fallback badge', async () => {
    mockGetSupplyTransfers.mockResolvedValue([
      { id: 'mystery', fromWarehouseId: 'wh1', toWarehouseId: 'wh2', productId: 'p1', quantity: 1, status: 'mystery', fromWarehouseName: 'A', toWarehouseName: 'B', productName: 'P' },
    ]);
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('supply-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-transfers'));
    await waitFor(() => {
      expect(screen.getByText('mystery')).toBeInTheDocument();
    });
  });

  it('shows error toast when supply query fails and still renders panel', async () => {
    mockGetSupplyWarehouses.mockRejectedValue(new Error('WH error'));
    renderWithQuery(<SupplyPanel />);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Failed to load warehouses: WH error', 'error');
    });
    await waitFor(() => {
      expect(screen.getByTestId('supply-panel')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: 'No warehouses' })).toBeInTheDocument();
  });
});

describe('SuperSupplyPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { role: 'super_admin' };
    mockApiFetch.mockImplementation(defaultApiFetch);
    mockGetAdminTenants.mockResolvedValue(sampleTenants);
  });

  it('shows access denied for non-super-admin users', async () => {
    mockUser = { role: 'admin' };
    await act(async () => {
      renderWithQuery(<SuperSupplyPanel />);
    });
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.getByText('Super Admin access required.')).toBeInTheDocument();
  });

  it('shows loading spinner while tenants and overview load', async () => {
    const d = deferred<unknown[]>();
    mockGetAdminTenants.mockReturnValue(d.promise as never);
    await act(async () => {
      renderWithQuery(<SuperSupplyPanel />);
    });
    expect(screen.getByText('Loading supply data...')).toBeInTheDocument();
    await act(async () => {
      d.resolve(sampleTenants);
    });
  });

  it('renders overview stat cards and tenant breakdown', async () => {
    renderWithQuery(<SuperSupplyPanel />);
    await waitFor(() => {
      expect(screen.getByText('Supply Chain Overview')).toBeInTheDocument();
    });
    const cards = screen.getAllByTestId('stat-card');
    expect(cards).toHaveLength(4);
    expect(within(cards[0]).getByText('Warehouses')).toBeInTheDocument();
    expect(within(cards[0]).getByText('12')).toBeInTheDocument();
    expect(within(cards[1]).getByText('34')).toBeInTheDocument();
    expect(within(cards[2]).getByText('5')).toBeInTheDocument();
    expect(within(cards[3]).getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Inventory by Tenant')).toBeInTheDocument();
    // tenant name appears in both the filter select and the breakdown list
    expect(screen.getAllByText('Camp Alpha').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('8 warehouses')).toBeInTheDocument();
  });

  it('renders purchase orders table with fallbacks', async () => {
    renderWithQuery(<SuperSupplyPanel />);
    await waitFor(() => {
      expect(screen.getByText('PO-500')).toBeInTheDocument();
    });
    // tenant name appears in both the filter select and the row
    expect(screen.getAllByText('Camp Alpha').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('$1500.00')).toBeInTheDocument();
    expect(screen.getByText('2026-07-01T00:00:00Z')).toBeInTheDocument();
    // empty reference falls back to the first 8 chars of the id
    expect(screen.getByText('po-2')).toBeInTheDocument();
    // empty tenant and created_at fall back to '—'
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('filters purchase orders by tenant', async () => {
    renderWithQuery(<SuperSupplyPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('select-Filter by Tenant')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('select-Filter by Tenant'), { target: { value: 't1' } });
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/admin/supply/purchase-orders?tenantId=t1');
    });
  });

  it('refreshes purchase orders on button click', async () => {
    renderWithQuery(<SuperSupplyPanel />);
    await waitFor(() => {
      expect(screen.getByText('PO-500')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/admin/supply/purchase-orders');
    });
  });

  it('shows empty state when no purchase orders exist', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/admin/supply/purchase-orders')) return Promise.resolve({ data: [], total: 0 });
      return defaultApiFetch(u);
    });
    renderWithQuery(<SuperSupplyPanel />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'No purchase orders found' })).toBeInTheDocument();
    });
  });

  it('shows error toast when tenants fail to load', async () => {
    mockGetAdminTenants.mockRejectedValue(new Error('Tenants error'));
    renderWithQuery(<SuperSupplyPanel />);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Failed to load tenants: Tenants error', 'error');
    });
  });

  it('shows error toast when overview fails to load', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/admin/supply/overview')) return Promise.reject(new Error('Overview error'));
      return defaultApiFetch(u);
    });
    renderWithQuery(<SuperSupplyPanel />);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Failed to load supply overview: Overview error', 'error');
    });
  });

  it('shows error toast when purchase orders fail to load', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/admin/supply/purchase-orders')) return Promise.reject(new Error('POs error'));
      return defaultApiFetch(u);
    });
    renderWithQuery(<SuperSupplyPanel />);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Failed to load purchase orders: POs error', 'error');
    });
  });
});

describe('StorefrontPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { role: 'super_admin' };
    mockApiFetch.mockImplementation(defaultApiFetch);
    mockGetStorefrontPages.mockResolvedValue(samplePages);
    mockGetStorefrontBlogPosts.mockResolvedValue(samplePosts);
    mockGetStorefrontBlogCategories.mockResolvedValue(sampleCategories);
    mockSaveStorefrontPage.mockResolvedValue({ id: 'pg', success: true });
    mockSaveStorefrontBlogPost.mockResolvedValue({ id: 'bp', success: true });
    mockSaveStorefrontBlogCategory.mockResolvedValue({ id: 'cat', success: true });
    mockDeleteStorefrontPage.mockResolvedValue({ success: true });
    mockDeleteStorefrontBlogPost.mockResolvedValue({ success: true });
    mockDeleteStorefrontBlogCategory.mockResolvedValue({ success: true });
  });

  it('shows loading spinner while storefront queries are in flight', async () => {
    const d = deferred<unknown[]>();
    mockGetStorefrontPages.mockReturnValue(d.promise as never);
    await act(async () => {
      renderWithQuery(<StorefrontPanel />);
    });
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.getByText('Loading storefront...')).toBeInTheDocument();
    await act(async () => {
      d.resolve(samplePages);
    });
  });

  it('renders pages table with status and updated date', async () => {
    renderWithQuery(<StorefrontPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('storefront-panel')).toBeInTheDocument();
    });
    expect(screen.getByText('About Us')).toBeInTheDocument();
    expect(screen.getByText('/about')).toBeInTheDocument();
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('2026-01-02')).toBeInTheDocument();
  });

  it('shows pages empty state and opens add modal from the header button', async () => {
    mockGetStorefrontPages.mockResolvedValue([]);
    renderWithQuery(<StorefrontPanel />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'No pages' })).toBeInTheDocument();
    });
    // two 'Add Page' buttons exist (header + empty state action); use the header one
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Page' })[0]);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Add Page' })).toBeInTheDocument();
    });
  });

  it('opens add page modal from the empty state action', async () => {
    mockGetStorefrontPages.mockResolvedValue([]);
    renderWithQuery(<StorefrontPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('empty-action-Add Page')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('empty-action-Add Page'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Add Page' })).toBeInTheDocument();
    });
  });

  it('validates page title is required', async () => {
    renderWithQuery(<StorefrontPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('storefront-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Page' }));
    fireEvent.change(screen.getByTestId('input-Slug *'), { target: { value: 'news' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Title is required.', 'warning');
    });
  });

  it('validates page slug is required', async () => {
    renderWithQuery(<StorefrontPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('storefront-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Page' }));
    fireEvent.change(screen.getByTestId('input-Title *'), { target: { value: 'News' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Slug is required.', 'warning');
    });
  });

  it('creates a page with content and publishes it', async () => {
    renderWithQuery(<StorefrontPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('storefront-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Page' }));
    fireEvent.change(screen.getByTestId('input-Title *'), { target: { value: 'News' } });
    fireEvent.change(screen.getByTestId('input-Slug *'), { target: { value: 'news' } });
    fireEvent.change(screen.getByPlaceholderText('Page content (HTML)'), { target: { value: '<p>hi</p>' } });
    fireEvent.change(screen.getByTestId('input-Meta Title'), { target: { value: 'SEO' } });
    fireEvent.change(screen.getByTestId('input-Meta Description'), { target: { value: 'desc' } });
    fireEvent.click(screen.getByLabelText('Published'));
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockSaveStorefrontPage).toHaveBeenCalledWith({
        slug: 'news',
        title: 'News',
        content: '<p>hi</p>',
        metaTitle: 'SEO',
        metaDescription: 'desc',
        isPublished: true,
      }, undefined);
    });
    expect(mockShowToast).toHaveBeenCalledWith('Page created.', 'success');
  });

  it('edits a page with prefilled fields', async () => {
    renderWithQuery(<StorefrontPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('storefront-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Edit Page' })).toBeInTheDocument();
    });
    expect((screen.getByTestId('input-Title *') as HTMLInputElement).value).toBe('About Us');
    expect((screen.getByTestId('input-Slug *') as HTMLInputElement).value).toBe('about');
    expect((screen.getByTestId('input-Meta Title') as HTMLInputElement).value).toBe('About');
    expect((screen.getByLabelText('Published') as HTMLInputElement).checked).toBe(true);
    fireEvent.change(screen.getByTestId('input-Title *'), { target: { value: 'About Us v2' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockSaveStorefrontPage).toHaveBeenCalledWith(expect.objectContaining({ title: 'About Us v2', slug: 'about' }), 'pg1');
    });
    expect(mockShowToast).toHaveBeenCalledWith('Page updated.', 'success');
  });

  it('deletes a page after confirmation', async () => {
    renderWithQuery(<StorefrontPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('storefront-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    expect(screen.getByText('Delete page')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('confirm-yes'));
    await waitFor(() => {
      expect(mockDeleteStorefrontPage).toHaveBeenCalledWith('pg1');
    });
    expect(mockShowToast).toHaveBeenCalledWith('Deleted.', 'success');
  });

  it('shows error toast when page save fails', async () => {
    mockSaveStorefrontPage.mockRejectedValue(new Error('Save boom'));
    renderWithQuery(<StorefrontPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('storefront-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Page' }));
    fireEvent.change(screen.getByTestId('input-Title *'), { target: { value: 'News' } });
    fireEvent.change(screen.getByTestId('input-Slug *'), { target: { value: 'news' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: Save boom', 'error');
    });
  });

  it('shows error toast when page delete fails', async () => {
    mockDeleteStorefrontPage.mockRejectedValue(new Error('Delete boom'));
    renderWithQuery(<StorefrontPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('storefront-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('confirm-yes'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: Delete boom', 'error');
    });
  });

  it('renders blog tab with posts', async () => {
    renderWithQuery(<StorefrontPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('storefront-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-blog'));
    await waitFor(() => {
      expect(screen.getByText('Hello World')).toBeInTheDocument();
    });
    expect(screen.getByText('News')).toBeInTheDocument();
    expect(screen.getByText('u1')).toBeInTheDocument();
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('validates blog post title, slug, and content in order', async () => {
    renderWithQuery(<StorefrontPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('storefront-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-blog'));
    fireEvent.click(screen.getByRole('button', { name: 'Add Post' }));

    fireEvent.change(screen.getByTestId('input-Title *'), { target: { value: 'T' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Slug is required.', 'warning');
    });

    fireEvent.change(screen.getByTestId('input-Slug *'), { target: { value: 't' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Content is required.', 'warning');
    });
  });

  it('creates a blog post', async () => {
    renderWithQuery(<StorefrontPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('storefront-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-blog'));
    fireEvent.click(screen.getByRole('button', { name: 'Add Post' }));
    fireEvent.change(screen.getByTestId('input-Title *'), { target: { value: 'New Post' } });
    fireEvent.change(screen.getByTestId('input-Slug *'), { target: { value: 'new-post' } });
    fireEvent.change(screen.getByPlaceholderText('Post content (HTML)'), { target: { value: '<p>body</p>' } });
    fireEvent.change(screen.getByTestId('input-Excerpt'), { target: { value: 'summary' } });
    fireEvent.change(screen.getByTestId('input-Category'), { target: { value: 'News' } });
    fireEvent.change(screen.getByTestId('input-Tags'), { target: { value: 'a,b' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockSaveStorefrontBlogPost).toHaveBeenCalledWith({
        slug: 'new-post',
        title: 'New Post',
        content: '<p>body</p>',
        excerpt: 'summary',
        category: 'News',
        tags: 'a,b',
        authorId: undefined,
        isPublished: false,
      }, undefined);
    });
    expect(mockShowToast).toHaveBeenCalledWith('Blog post created.', 'success');
  });

  it('edits a blog post with prefilled fields', async () => {
    renderWithQuery(<StorefrontPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('storefront-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-blog'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Edit Blog Post' })).toBeInTheDocument();
    });
    expect((screen.getByTestId('input-Title *') as HTMLInputElement).value).toBe('Hello World');
    expect((screen.getByTestId('input-Excerpt') as HTMLInputElement).value).toBe('Intro');
    fireEvent.change(screen.getByTestId('input-Title *'), { target: { value: 'Hello World 2' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockSaveStorefrontBlogPost).toHaveBeenCalledWith(expect.objectContaining({ title: 'Hello World 2', slug: 'hello' }), 'bp1');
    });
    expect(mockShowToast).toHaveBeenCalledWith('Blog post updated.', 'success');
  });

  it('deletes a blog post after confirmation', async () => {
    renderWithQuery(<StorefrontPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('storefront-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-blog'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('confirm-yes'));
    await waitFor(() => {
      expect(mockDeleteStorefrontBlogPost).toHaveBeenCalledWith('bp1');
    });
    expect(mockShowToast).toHaveBeenCalledWith('Deleted.', 'success');
  });

  it('renders blog categories tab', async () => {
    renderWithQuery(<StorefrontPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('storefront-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-blogCategories'));
    await waitFor(() => {
      expect(screen.getByText('News')).toBeInTheDocument();
      // categories render the slug without a leading slash (unlike pages)
      expect(screen.getByText('news')).toBeInTheDocument();
    });
    expect(screen.getByText('Guides')).toBeInTheDocument();
  });

  it('validates category name and slug are required', async () => {
    renderWithQuery(<StorefrontPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('storefront-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-blogCategories'));
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }));
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Name is required.', 'warning');
    });

    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Events' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Slug is required.', 'warning');
    });
  });

  it('creates a blog category', async () => {
    renderWithQuery(<StorefrontPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('storefront-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-blogCategories'));
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }));
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Events' } });
    fireEvent.change(screen.getByTestId('input-Slug *'), { target: { value: 'events' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockSaveStorefrontBlogCategory).toHaveBeenCalledWith({ name: 'Events', slug: 'events' });
    });
    expect(mockShowToast).toHaveBeenCalledWith('Category created.', 'success');
  });

  it('deletes a blog category after confirmation', async () => {
    renderWithQuery(<StorefrontPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('storefront-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-blogCategories'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('confirm-yes'));
    await waitFor(() => {
      expect(mockDeleteStorefrontBlogCategory).toHaveBeenCalledWith('cat1');
    });
    expect(mockShowToast).toHaveBeenCalledWith('Deleted.', 'success');
  });

  it('renders carts tab with totals and fallbacks', async () => {
    renderWithQuery(<StorefrontPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('storefront-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-carts'));
    await waitFor(() => {
      expect(screen.getByText('Carts (2)')).toBeInTheDocument();
    });
    expect(screen.getByText('sess-abc')).toBeInTheDocument();
    expect(screen.getByText('$250.00')).toBeInTheDocument();
    expect(screen.getByText('2026-01-05')).toBeInTheDocument();
    // cart with no session falls back to user_id
    expect(screen.getByText('u9')).toBeInTheDocument();
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('renders orders tab with status badges', async () => {
    renderWithQuery(<StorefrontPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('storefront-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-orders'));
    await waitFor(() => {
      expect(screen.getByText('Orders (3)')).toBeInTheDocument();
    });
    expect(screen.getByText('ORD-1')).toBeInTheDocument();
    expect(screen.getByText('a@b.com')).toBeInTheDocument();
    expect(screen.getByText('$300.00')).toBeInTheDocument();
    expect(screen.getByText('completed')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
    expect(screen.getByText('canceled')).toBeInTheDocument();
    expect(screen.getByText('2026-01-06')).toBeInTheDocument();
  });

  it('shows empty states for carts and orders tabs', async () => {
    mockApiFetch.mockResolvedValue([]);
    renderWithQuery(<StorefrontPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('storefront-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-carts'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'No active carts' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-orders'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'No orders' })).toBeInTheDocument();
    });
  });

  it('shows error toast when storefront queries fail', async () => {
    mockGetStorefrontPages.mockRejectedValue(new Error('Pages error'));
    renderWithQuery(<StorefrontPanel />);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Failed to load storefront pages: Pages error', 'error');
    });
  });
});

describe('SuperStorefrontPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { role: 'super_admin' };
    mockApiFetch.mockImplementation(defaultApiFetch);
    mockGetAdminTenants.mockResolvedValue(sampleTenants);
  });

  it('shows access denied for non-super-admin users', async () => {
    mockUser = { role: 'manager' };
    await act(async () => {
      renderWithQuery(<SuperStorefrontPanel />);
    });
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.getByText('Super Admin access required.')).toBeInTheDocument();
  });

  it('shows loading spinner while tenants and overview load', async () => {
    const d = deferred<unknown[]>();
    mockGetAdminTenants.mockReturnValue(d.promise as never);
    await act(async () => {
      renderWithQuery(<SuperStorefrontPanel />);
    });
    expect(screen.getByText('Loading storefront data...')).toBeInTheDocument();
    await act(async () => {
      d.resolve(sampleTenants);
    });
  });

  it('renders overview stat cards and tenant breakdown', async () => {
    renderWithQuery(<SuperStorefrontPanel />);
    await waitFor(() => {
      expect(screen.getByText('Storefront Overview')).toBeInTheDocument();
    });
    const cards = screen.getAllByTestId('stat-card');
    expect(cards).toHaveLength(4);
    expect(within(cards[0]).getByText('Total Products')).toBeInTheDocument();
    expect(within(cards[0]).getByText('100')).toBeInTheDocument();
    expect(within(cards[1]).getByText('80')).toBeInTheDocument();
    expect(within(cards[2]).getByText('42')).toBeInTheDocument();
    expect(within(cards[3]).getByText('$12500.50')).toBeInTheDocument();
    expect(screen.getByText('Storefront by Tenant')).toBeInTheDocument();
    expect(screen.getByText('40 products')).toBeInTheDocument();
    expect(screen.getByText('20 active')).toBeInTheDocument();
  });

  it('renders products table with fallbacks', async () => {
    renderWithQuery(<SuperStorefrontPanel />);
    await waitFor(() => {
      expect(screen.getByText('Tent')).toBeInTheDocument();
    });
    expect(screen.getByText('TNT-1')).toBeInTheDocument();
    expect(screen.getByText('$150.00')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3); // empty name, tenant, sku
    expect(screen.getByText('draft')).toBeInTheDocument();
  });

  it('filters products by tenant', async () => {
    renderWithQuery(<SuperStorefrontPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('select-Filter by Tenant')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('select-Filter by Tenant'), { target: { value: 't2' } });
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/admin/storefront/products?tenantId=t2');
    });
  });

  it('refreshes products on button click', async () => {
    renderWithQuery(<SuperStorefrontPanel />);
    await waitFor(() => {
      expect(screen.getByText('Tent')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/admin/storefront/products');
    });
  });

  it('shows empty state when no products exist', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/admin/storefront/products')) return Promise.resolve({ data: [], total: 0 });
      return defaultApiFetch(u);
    });
    renderWithQuery(<SuperStorefrontPanel />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'No products found' })).toBeInTheDocument();
    });
  });

  it('shows error toast when overview fails to load', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/admin/storefront/overview')) return Promise.reject(new Error('Overview error'));
      return defaultApiFetch(u);
    });
    renderWithQuery(<SuperStorefrontPanel />);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Failed to load storefront overview: Overview error', 'error');
    });
  });

  it('shows error toast when products fail to load', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/admin/storefront/products')) return Promise.reject(new Error('Products error'));
      return defaultApiFetch(u);
    });
    renderWithQuery(<SuperStorefrontPanel />);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Failed to load products: Products error', 'error');
    });
  });

  it('shows error toast when tenants fail to load', async () => {
    mockGetAdminTenants.mockRejectedValue(new Error('Tenants error'));
    renderWithQuery(<SuperStorefrontPanel />);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Failed to load tenants: Tenants error', 'error');
    });
  });
});