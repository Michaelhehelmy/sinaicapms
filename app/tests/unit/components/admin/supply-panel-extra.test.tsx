import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import SupplyPanel from '@/components/admin/SupplyPanel';

// ─── Mock handles (referenced lazily inside vi.mock factories) ──────────────
const mockShowToast = vi.fn();
const mockUser: { role: string } | null = { role: 'super_admin' };

const mockGetSupplyWarehouses = vi.fn();
const mockGetSupplyStock = vi.fn();
const mockGetSupplyTransfers = vi.fn();
const mockGetSupplyPurchaseOrders = vi.fn();
const mockGetSupplyBoms = vi.fn();
const mockGetSupplyManufacturingOrders = vi.fn();
const mockRequest = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: () => Promise.resolve({}),
  getAdminTenants: () => Promise.resolve([]),
  getSupplyWarehouses: (...args: unknown[]) => mockGetSupplyWarehouses(...args),
  getSupplyStock: (...args: unknown[]) => mockGetSupplyStock(...args),
  getSupplyTransfers: (...args: unknown[]) => mockGetSupplyTransfers(...args),
  getSupplyPurchaseOrders: (...args: unknown[]) => mockGetSupplyPurchaseOrders(...args),
  getSupplyBoms: (...args: unknown[]) => mockGetSupplyBoms(...args),
  getSupplyManufacturingOrders: (...args: unknown[]) => mockGetSupplyManufacturingOrders(...args),
  request: (...args: unknown[]) => mockRequest(...args),
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
      {data.map((row: Record<string, unknown>, i: number) => (
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
  Button: ({ children, onClick, disabled, ...rest }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; [key: string]: unknown }) => (
    <button onClick={onClick} disabled={disabled} {...rest}>{children}</button>
  ),
}));

vi.mock('@/components/ui/Input', () => ({
  Input: ({ label, value, onChange, placeholder, type }: { label?: string; value?: string; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string; type?: string }) => (
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
  Select: ({ label, options, value, onChange, placeholder }: { label?: string; options: { value: string; label: string }[]; value?: string; onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void; placeholder?: string }) => (
    <div>
      {label && <label>{label}</label>}
      <select value={value} onChange={onChange} data-testid={label ? `select-${label}` : 'select'}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    </div>
  ),
}));

vi.mock('@/components/ui/Card', () => ({
  Card: ({ children, ...rest }: { children: React.ReactNode; [key: string]: unknown }) => <div {...rest}>{children}</div>,
}));

// ─── Representative data ─────────────────────────────────────────────────────
const sampleWarehouses = [
  { id: 'wh1', name: 'Main Warehouse', location: 'Cairo', is_active: 1 },
  { id: 'wh2', name: 'Overflow', location: '', is_active: 1 },
];

const sampleStock = [
  { id: 's1', product_id: 'p1', warehouse_id: 'wh1', quantity: 25, reserved: 5, product_name: 'Tent', warehouse_name: 'Main Warehouse' },
];

const sampleTransfers = [
  { id: 'tr1', from_warehouse_id: 'wh1', to_warehouse_id: 'wh2', product_id: 'p1', quantity: 4, status: 'draft', from_warehouse_name: 'Main Warehouse', to_warehouse_name: 'Overflow', product_name: 'Tent' },
];

const samplePOs = [
  { id: 'po1', po_number: 'PO-1001', vendor_id: 'v1', order_date: '2026-08-01T00:00:00Z', total_amount: 1250.5, status: 'draft' },
  { id: 'po2', po_number: 'PO-1002', vendor_id: 'v2', order_date: '2026-08-02T00:00:00Z', total_amount: 100, status: 'sent' },
];

const sampleBOMs = [
  { id: 'bom1', product_id: 'p1', name: 'Widget Assembly', version: 1, product_name: 'Widget', lines: [{ id: 'l1', component_id: 'c1', quantity: 2, unit: 'each' }] },
];

const sampleMOs = [
  { id: 'mo1', product_id: 'p1', quantity: 10, status: 'planned', produced_quantity: 0, product_name: 'Widget', bom_name: 'Widget Assembly' },
];

function renderSupply() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><SupplyPanel /></QueryClientProvider>);
}

async function mount() {
  renderSupply();
  await waitFor(() => {
    expect(screen.getByTestId('supply-panel')).toBeInTheDocument();
  });
}

describe('SupplyPanel extra coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSupplyWarehouses.mockResolvedValue(sampleWarehouses);
    mockGetSupplyStock.mockResolvedValue(sampleStock);
    mockGetSupplyTransfers.mockResolvedValue(sampleTransfers);
    mockGetSupplyPurchaseOrders.mockResolvedValue(samplePOs);
    mockGetSupplyBoms.mockResolvedValue(sampleBOMs);
    mockGetSupplyManufacturingOrders.mockResolvedValue(sampleMOs);
    mockRequest.mockResolvedValue({ id: 'x', success: true });
  });

  // ── Empty-state action handlers ──────────────────────────────────────
  it('opens stock adjust modal from the stock empty-state action', async () => {
    mockGetSupplyStock.mockResolvedValue([]);
    await mount();
    fireEvent.click(screen.getByTestId('tab-stock'));
    await waitFor(() => {
      expect(screen.getByTestId('empty-action-Adjust Stock')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('empty-action-Adjust Stock'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Adjust Stock' })).toBeInTheDocument();
    });
  });

  it('opens new transfer modal from the transfers empty-state action', async () => {
    mockGetSupplyTransfers.mockResolvedValue([]);
    await mount();
    fireEvent.click(screen.getByTestId('tab-transfers'));
    await waitFor(() => {
      expect(screen.getByTestId('empty-action-New Transfer')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('empty-action-New Transfer'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'New Transfer' })).toBeInTheDocument();
    });
  });

  it('opens new PO modal from the purchase orders empty-state action', async () => {
    mockGetSupplyPurchaseOrders.mockResolvedValue([]);
    await mount();
    fireEvent.click(screen.getByTestId('tab-purchaseOrders'));
    await waitFor(() => {
      expect(screen.getByTestId('empty-action-New PO')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('empty-action-New PO'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'New Purchase Order' })).toBeInTheDocument();
    });
  });

  it('opens new BOM modal from the BOMs empty-state action', async () => {
    mockGetSupplyBoms.mockResolvedValue([]);
    await mount();
    fireEvent.click(screen.getByTestId('tab-boms'));
    await waitFor(() => {
      expect(screen.getByTestId('empty-action-New BOM')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('empty-action-New BOM'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'New BOM' })).toBeInTheDocument();
    });
  });

  it('opens new order modal from the manufacturing empty-state action', async () => {
    mockGetSupplyManufacturingOrders.mockResolvedValue([]);
    await mount();
    fireEvent.click(screen.getByTestId('tab-manufacturing'));
    await waitFor(() => {
      expect(screen.getByTestId('empty-action-New Order')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('empty-action-New Order'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'New Manufacturing Order' })).toBeInTheDocument();
    });
  });

  // ── Modal onClose handlers (cancel/close buttons) ────────────────────
  it('closes the add warehouse modal via its close button', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Add Warehouse' }));
    fireEvent.click(screen.getByTestId('modal-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('form-modal')).not.toBeInTheDocument();
    });
  });

  it('closes the adjust stock modal via its close button', async () => {
    await mount();
    fireEvent.click(screen.getByTestId('tab-stock'));
    fireEvent.click(screen.getByRole('button', { name: 'Adjust Stock' }));
    fireEvent.click(screen.getByTestId('modal-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('form-modal')).not.toBeInTheDocument();
    });
  });

  it('closes the new transfer modal via its close button', async () => {
    await mount();
    fireEvent.click(screen.getByTestId('tab-transfers'));
    fireEvent.click(screen.getByRole('button', { name: 'New Transfer' }));
    fireEvent.click(screen.getByTestId('modal-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('form-modal')).not.toBeInTheDocument();
    });
  });

  it('closes the new PO modal via its close button', async () => {
    await mount();
    fireEvent.click(screen.getByTestId('tab-purchaseOrders'));
    fireEvent.click(screen.getByRole('button', { name: 'New PO' }));
    fireEvent.click(screen.getByTestId('modal-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('form-modal')).not.toBeInTheDocument();
    });
  });

  it('closes the new BOM modal via its close button', async () => {
    await mount();
    fireEvent.click(screen.getByTestId('tab-boms'));
    fireEvent.click(screen.getByRole('button', { name: 'New BOM' }));
    fireEvent.click(screen.getByTestId('modal-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('form-modal')).not.toBeInTheDocument();
    });
  });

  it('closes the new manufacturing order modal via its close button', async () => {
    await mount();
    fireEvent.click(screen.getByTestId('tab-manufacturing'));
    fireEvent.click(screen.getByRole('button', { name: 'New Order' }));
    fireEvent.click(screen.getByTestId('modal-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('form-modal')).not.toBeInTheDocument();
    });
  });

  it('closes the production progress modal via its close button', async () => {
    await mount();
    fireEvent.click(screen.getByTestId('tab-manufacturing'));
    fireEvent.click(screen.getByRole('button', { name: 'Progress' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Update Production Progress' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('modal-close'));
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Update Production Progress' })).not.toBeInTheDocument();
    });
  });

  // ── BOM form line-edit + add-component handlers ───────────────────────
  it('edits the unit of a BOM component line and adds a component row', async () => {
    await mount();
    fireEvent.click(screen.getByTestId('tab-boms'));
    fireEvent.click(screen.getByRole('button', { name: 'New BOM' }));
    // initial single row -> 3 line inputs (component, qty, unit)
    let lineInputs = screen.getAllByTestId('input');
    expect(lineInputs).toHaveLength(3);
    // toggle unit field to 'kg' on the first row
    fireEvent.change(lineInputs[2], { target: { value: 'kg' } });
    // add a second component row -> 6 line inputs
    fireEvent.click(screen.getByText('+ Add Component'));
    lineInputs = screen.getAllByTestId('input');
    expect(lineInputs).toHaveLength(6);
    // fill first & second component rows, then submit
    fireEvent.change(screen.getByTestId('input-Product ID *'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Widget Assembly' } });
    fireEvent.change(lineInputs[0], { target: { value: 'c1' } });
    fireEvent.change(lineInputs[1], { target: { value: '2' } });
    fireEvent.change(lineInputs[3], { target: { value: 'c2' } });
    fireEvent.change(lineInputs[4], { target: { value: '3' } });
    fireEvent.change(lineInputs[5], { target: { value: 'kg' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      const body = JSON.parse((mockRequest.mock.calls[0]![1] as RequestInit).body as string);
      expect(body.lines).toHaveLength(2);
      expect(body.lines[0]).toEqual({ componentId: 'c1', quantity: 2, unit: 'kg' });
      expect(body.lines[1]).toEqual({ componentId: 'c2', quantity: 3, unit: 'kg' });
    });
    expect(mockShowToast).toHaveBeenCalledWith('BOM created.', 'success');
  });

  // ── MO form date handlers ─────────────────────────────────────────────
  it('captures start and end dates when creating a manufacturing order', async () => {
    await mount();
    fireEvent.click(screen.getByTestId('tab-manufacturing'));
    fireEvent.click(screen.getByRole('button', { name: 'New Order' }));
    fireEvent.change(screen.getByTestId('select-BOM *'), { target: { value: 'bom1' } });
    fireEvent.change(screen.getByTestId('input-Product ID *'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByTestId('input-Quantity *'), { target: { value: '10' } });
    fireEvent.change(screen.getByTestId('input-Start Date'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByTestId('input-End Date'), { target: { value: '2026-09-05' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith('/supply/manufacturing-orders', {
        method: 'POST',
        body: JSON.stringify({ bomId: 'bom1', productId: 'p1', quantity: 10, startDate: '2026-09-01', endDate: '2026-09-05' }),
      });
    });
    expect(mockShowToast).toHaveBeenCalledWith('Manufacturing order created.', 'success');
  });

  // ── Confirm-dialog cancel (non-warehouse onCancel) ────────────────────
  it('cancels a transfer confirm dialog via its cancel button', async () => {
    await mount();
    fireEvent.click(screen.getByTestId('tab-transfers'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Confirm' })[0]);
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('confirm-no'));
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
    });
    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ── Error paths (catch handlers for each mutation) ────────────────────
  it('shows error toast when stock adjustment fails', async () => {
    mockRequest.mockRejectedValueOnce(new Error('Boom'));
    await mount();
    fireEvent.click(screen.getByTestId('tab-stock'));
    fireEvent.click(screen.getByRole('button', { name: 'Adjust Stock' }));
    fireEvent.change(screen.getByTestId('input-Product ID *'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByTestId('select-Warehouse *'), { target: { value: 'wh1' } });
    fireEvent.change(screen.getByTestId('input-Quantity (positive to add, negative to deduct) *'), { target: { value: '-3' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: Boom', 'error');
    });
  });

  it('shows error toast when transfer creation fails', async () => {
    mockRequest.mockRejectedValueOnce(new Error('Boom'));
    await mount();
    fireEvent.click(screen.getByTestId('tab-transfers'));
    fireEvent.click(screen.getByRole('button', { name: 'New Transfer' }));
    fireEvent.change(screen.getByTestId('input-Product ID *'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByTestId('select-From Warehouse *'), { target: { value: 'wh1' } });
    fireEvent.change(screen.getByTestId('select-To Warehouse *'), { target: { value: 'wh2' } });
    fireEvent.change(screen.getByTestId('input-Quantity *'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: Boom', 'error');
    });
  });

  it('shows error toast when transfer confirmation fails', async () => {
    mockRequest.mockRejectedValueOnce(new Error('Boom'));
    await mount();
    fireEvent.click(screen.getByTestId('tab-transfers'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Confirm' })[0]);
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('confirm-yes'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: Boom', 'error');
    });
  });

  it('shows error toast when purchase order creation fails', async () => {
    mockRequest.mockRejectedValueOnce(new Error('Boom'));
    await mount();
    fireEvent.click(screen.getByTestId('tab-purchaseOrders'));
    fireEvent.click(screen.getByRole('button', { name: 'New PO' }));
    fireEvent.change(screen.getByTestId('input-Order Date *'), { target: { value: '2026-08-15' } });
    const lineInputs = screen.getAllByTestId('input');
    fireEvent.change(lineInputs[0], { target: { value: 'p9' } });
    fireEvent.change(lineInputs[1], { target: { value: '2' } });
    fireEvent.change(lineInputs[2], { target: { value: '12.5' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: Boom', 'error');
    });
  });

  it('shows error toast when receiving a purchase order fails', async () => {
    mockRequest.mockRejectedValueOnce(new Error('Boom'));
    await mount();
    fireEvent.click(screen.getByTestId('tab-purchaseOrders'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Receive' })[0]);
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('confirm-yes'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: Boom', 'error');
    });
  });

  it('shows error toast when BOM creation fails', async () => {
    mockRequest.mockRejectedValueOnce(new Error('Boom'));
    await mount();
    fireEvent.click(screen.getByTestId('tab-boms'));
    fireEvent.click(screen.getByRole('button', { name: 'New BOM' }));
    fireEvent.change(screen.getByTestId('input-Product ID *'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Widget Assembly' } });
    const lineInputs = screen.getAllByTestId('input');
    fireEvent.change(lineInputs[0], { target: { value: 'c1' } });
    fireEvent.change(lineInputs[1], { target: { value: '2' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: Boom', 'error');
    });
  });

  it('shows error toast when manufacturing order creation fails', async () => {
    mockRequest.mockRejectedValueOnce(new Error('Boom'));
    await mount();
    fireEvent.click(screen.getByTestId('tab-manufacturing'));
    fireEvent.click(screen.getByRole('button', { name: 'New Order' }));
    fireEvent.change(screen.getByTestId('select-BOM *'), { target: { value: 'bom1' } });
    fireEvent.change(screen.getByTestId('input-Product ID *'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByTestId('input-Quantity *'), { target: { value: '10' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: Boom', 'error');
    });
  });

  it('shows error toast when production progress update fails', async () => {
    mockRequest.mockRejectedValueOnce(new Error('Boom'));
    await mount();
    fireEvent.click(screen.getByTestId('tab-manufacturing'));
    fireEvent.click(screen.getByRole('button', { name: 'Progress' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Update Production Progress' })).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('input-Produced Quantity'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: Boom', 'error');
    });
  });

  // ── Warehouse form modal submit-label 'Saving...' branch while pending ─
  it('shows Saving... label on the stock form while a request is in flight', async () => {
    let resolveReq!: (v: unknown) => void;
    const pending = new Promise<unknown>((res) => { resolveReq = res; });
    mockRequest.mockReturnValue(pending);
    await mount();
    fireEvent.click(screen.getByTestId('tab-stock'));
    fireEvent.click(screen.getByRole('button', { name: 'Adjust Stock' }));
    fireEvent.change(screen.getByTestId('input-Product ID *'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByTestId('select-Warehouse *'), { target: { value: 'wh1' } });
    fireEvent.change(screen.getByTestId('input-Quantity (positive to add, negative to deduct) *'), { target: { value: '5' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('modal-submit'));
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Saving...' })).toBeInTheDocument();
    });
    await act(async () => {
      resolveReq({ success: true });
    });
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Stock adjusted.', 'success');
    });
  });

  // ── Warehouse submit-label 'Update' + 'Saving...' branches ────────────
  it('shows Update label when editing a warehouse, then Saving... while pending', async () => {
    await mount();
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument();
    });
    let resolveReq!: (v: unknown) => void;
    const pending = new Promise<unknown>((res) => { resolveReq = res; });
    mockRequest.mockReturnValue(pending);
    await act(async () => {
      fireEvent.click(screen.getByTestId('modal-submit'));
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Saving...' })).toBeInTheDocument();
    });
    await act(async () => {
      resolveReq({ success: true });
    });
  });
});
