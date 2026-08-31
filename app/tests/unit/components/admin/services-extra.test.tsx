import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ServicesPanel from '@/components/admin/ServicesPanel';

const { mockShowToast } = vi.hoisted(() => ({
  mockShowToast: vi.fn(),
}));

// ── Mutable hook data (re-assigned in beforeEach / per test) ──────────
let servicesDefsData: unknown[] = [];
let servicesDefsLoading = false;
let servicesItemsData: unknown[] = [];
let servicesItemsLoading = false;
let servicesBookingsData: unknown[] = [];
let servicesBookingsLoading = false;

// ── Mock module factories ─────────────────────────────────────────────
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/utils', () => ({
  formatCurrency: (v: number) => `$${v.toFixed(2)}`,
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('@/hooks/useQueryHooks', () => {
  const React = require('react');
  const useControlled = (value: unknown, loading: boolean) => {
    const [data, setData] = React.useState(value);
    const [isLoading, setIsLoading] = React.useState(loading);
    React.useEffect(() => {
      setData(value);
      setIsLoading(loading);
    });
    return { data, isLoading, error: null };
  };
  return {
    queryKeys: {
      serviceDefinitions: ['admin', 'serviceDefinitions'],
      serviceItems: ['admin', 'serviceItems'],
      serviceBookings: (status?: string) => ['admin', 'serviceBookings', status],
    },
    useServiceDefinitionsQuery: () => useControlled(servicesDefsData, servicesDefsLoading),
    useServiceItemsQuery: () => useControlled(servicesItemsData, servicesItemsLoading),
    useServiceBookingsQuery: () => useControlled(servicesBookingsData, servicesBookingsLoading),
  };
});

vi.mock('@/lib/api', () => ({
  saveServiceDefinition: vi.fn(),
  deleteServiceDefinition: vi.fn(),
  saveServiceItem: vi.fn(),
  deleteServiceItem: vi.fn(),
  updateBookingStatus: vi.fn(),
}));

import * as api from '@/lib/api';
const mockSaveServiceDefinition = vi.mocked(api.saveServiceDefinition);
const mockDeleteServiceDefinition = vi.mocked(api.deleteServiceDefinition);
const mockSaveServiceItem = vi.mocked(api.saveServiceItem);
const mockDeleteServiceItem = vi.mocked(api.deleteServiceItem);
const mockUpdateBookingStatus = vi.mocked(api.updateBookingStatus);

// ── Shared UI mocks ───────────────────────────────────────────────────
vi.mock('@/components/ui/Card', () => ({
  Card: ({ children, ...rest }: { children: React.ReactNode; [key: string]: unknown }) => (
    <div {...rest}>{children}</div>
  ),
  CardHeader: ({ children, ...rest }: { children: React.ReactNode; [key: string]: unknown }) => (
    <div {...rest}>{children}</div>
  ),
  CardBody: ({ children, ...rest }: { children: React.ReactNode; [key: string]: unknown }) => (
    <div {...rest}>{children}</div>
  ),
}));

vi.mock('@/components/ui/Badge', () => ({
  Badge: ({ children, ...rest }: { children: React.ReactNode; [key: string]: unknown }) => (
    <span data-testid="badge" {...rest}>{children}</span>
  ),
}));

vi.mock('@/components/ui/DataTable', () => ({
  DataTable: ({
    data,
    columns,
    emptyMessage,
    actions,
    pagination,
  }: {
    data: unknown[];
    columns: { key: string; header: string; render?: (item: unknown) => React.ReactNode }[];
    emptyMessage?: string;
    actions?: (row: unknown) => React.ReactNode;
    pagination?: { page: number; total: number; pageSize: number; onChange: (p: number) => void };
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
      {pagination && (
        <div data-testid="pagination">
          <span>Page {pagination.page}</span>
          <button data-testid="pagination-next" onClick={() => pagination.onChange(pagination.page + 1)}>Next</button>
        </div>
      )}
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
  EmptyState: ({ title, description }: { title: string; description?: string }) => (
    <div data-testid="empty-state">
      <h3>{title}</h3>
      {description && <p>{description}</p>}
    </div>
  ),
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
        value={value ?? ''}
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

// ── Representative mock data ──────────────────────────────────────────
const mockDefs = [
  { id: 'sd1', slug: 'plumber', name: 'Plumbing', description: 'Pipe work', is_active: 1 },
  { id: 'sd2', slug: 'electrician', name: 'Electrical', description: '', is_active: 0 },
];

const mockItems = [
  { id: 'si1', service_definition_id: 'sd1', project_id: 'p1', name: 'Emergency Plumbing', description: '24h response', base_price: 50, status: 'active', definition_name: 'Plumbing' },
  { id: 'si2', service_definition_id: 'sd2', project_id: null, name: 'Rewire', description: '', base_price: 0, status: 'inactive', definition_name: 'Electrical' },
];

const mockBookings = [
  { id: 'sb1', item_name: 'Emergency Plumbing', customer_name: 'John', scheduled_date: '2025-07-01T00:00:00Z', status: 'pending', service_item_id: 'si1', service_definition_id: 'sd1', project_id: 'p1' },
  { id: 'sb2', item_name: 'Rewire', customer_name: '', scheduled_date: null, status: 'completed', service_item_id: 'si2', service_definition_id: 'sd2', project_id: 'p1' },
];

// ── Render helpers ────────────────────────────────────────────────────
function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  servicesDefsData = [];
  servicesDefsLoading = false;
  servicesItemsData = [];
  servicesItemsLoading = false;
  servicesBookingsData = [];
  servicesBookingsLoading = false;
});

// ══════════════════════════════════════════════════════════════════════
// ServicesPanel — extra coverage
// Targets the remaining uncovered functions: definition/modal close
// handlers, description/status field onChange handlers, the item save
// error path, the booking status modal onClose, and the delete-confirm
// onCancel handler.
// ══════════════════════════════════════════════════════════════════════
describe('ServicesPanel (extra coverage)', () => {
  it('saves slug and description typed in the add definition form', async () => {
    mockSaveServiceDefinition.mockResolvedValue({ id: 'sd_new', success: true } as never);
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('add-def-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Service Type' })));
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Tour Guide' } });
    fireEvent.change(screen.getByTestId('input-Slug'), { target: { value: 'tour-guide' } });
    fireEvent.change(screen.getByTestId('input-Description'), { target: { value: 'Guided hikes' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() =>
      expect(mockSaveServiceDefinition).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Tour Guide', slug: 'tour-guide', description: 'Guided hikes' }),
        undefined,
      ),
    );
  });

  it('closes the add definition form without saving', async () => {
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('add-def-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Service Type' })));
    fireEvent.click(screen.getByTestId('modal-close'));
    expect(screen.queryByRole('heading', { name: 'Add Service Type' })).not.toBeInTheDocument();
    expect(mockSaveServiceDefinition).not.toHaveBeenCalled();
  });

  it('closes an edit definition form and reopens clean as add (state reset)', async () => {
    servicesDefsData = mockDefs;
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Edit Service Type' })));
    expect(screen.getByTestId('input-Name *')).toHaveValue('Plumbing');
    fireEvent.click(screen.getByTestId('modal-close'));
    expect(screen.queryByRole('heading', { name: 'Edit Service Type' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('add-def-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Service Type' })));
    expect(screen.getByTestId('input-Name *')).toHaveValue('');
  });

  it('shows error toast when saving a service item fails', async () => {
    mockSaveServiceItem.mockRejectedValue(new Error('item boom'));
    servicesDefsData = mockDefs;
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-items'));
    fireEvent.click(screen.getByTestId('add-item-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Service' })));
    fireEvent.change(screen.getByTestId('select-Service Type *'), { target: { value: 'sd1' } });
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Pipe Repair' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Error: item boom', 'error'));
  });

  it('saves description and status when adding a service item', async () => {
    mockSaveServiceItem.mockResolvedValue({ id: 'si_new', success: true } as never);
    servicesDefsData = mockDefs;
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-items'));
    fireEvent.click(screen.getByTestId('add-item-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Service' })));
    fireEvent.change(screen.getByTestId('select-Service Type *'), { target: { value: 'sd1' } });
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Pipe Repair' } });
    fireEvent.change(screen.getByTestId('input-Description'), { target: { value: 'Fast fix' } });
    fireEvent.change(screen.getByTestId('select-Status'), { target: { value: 'inactive' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() =>
      expect(mockSaveServiceItem).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Pipe Repair', description: 'Fast fix', status: 'inactive' }),
        undefined,
      ),
    );
  });

  it('closes the add service item form without saving', async () => {
    servicesDefsData = mockDefs;
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-items'));
    fireEvent.click(screen.getByTestId('add-item-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Service' })));
    fireEvent.click(screen.getByTestId('modal-close'));
    expect(screen.queryByRole('heading', { name: 'Add Service' })).not.toBeInTheDocument();
    expect(mockSaveServiceItem).not.toHaveBeenCalled();
  });

  it('closes the booking status modal without updating', async () => {
    servicesDefsData = mockDefs;
    servicesItemsData = mockItems;
    servicesBookingsData = mockBookings;
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-bookings'));
    fireEvent.click(screen.getAllByText('Update Status')[0]);
    await waitFor(() => expect(screen.getByText('Update Booking Status')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('modal-close'));
    expect(screen.queryByText('Update Booking Status')).not.toBeInTheDocument();
    expect(mockUpdateBookingStatus).not.toHaveBeenCalled();
  });

  it('cancels deleting a service type without calling the api', async () => {
    servicesDefsData = mockDefs;
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getAllByText('Delete')[0]);
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    expect(screen.getByText('Delete Service Type')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('confirm-no'));
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
    expect(mockDeleteServiceDefinition).not.toHaveBeenCalled();
  });

  it('cancels deleting a service item without calling the api', async () => {
    servicesDefsData = mockDefs;
    servicesItemsData = mockItems;
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-items'));
    fireEvent.click(screen.getAllByText('Delete')[0]);
    expect(screen.getByText('Delete Service Item')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('confirm-no'));
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
    expect(mockDeleteServiceItem).not.toHaveBeenCalled();
  });

  it('falls back to raw text for unknown booking statuses', async () => {
    servicesDefsData = mockDefs;
    servicesItemsData = mockItems;
    servicesBookingsData = [
      { id: 'sb9', item_name: 'Mystery', customer_name: '', scheduled_date: null, status: 'rescheduled' },
    ];
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-bookings'));
    expect(screen.getByText('rescheduled')).toBeInTheDocument();
  });

  it('shows the raw status and empty service for unknown-status bookings in the status modal', async () => {
    servicesDefsData = mockDefs;
    servicesItemsData = mockItems;
    servicesBookingsData = [
      { id: 'sb9', item_name: '', customer_name: '', scheduled_date: null, status: 'rescheduled' },
    ];
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-bookings'));
    fireEvent.click(screen.getAllByText('Update Status')[0]);
    await waitFor(() => expect(screen.getByText('Update Booking Status')).toBeInTheDocument());
    expect(screen.getByText(/Current status:/)).toHaveTextContent('rescheduled');
    expect(screen.getByText('Service:')).toBeInTheDocument();
    // The raw fallback status is *not* offered as a changable option (only the
    // 5 known statuses are), so the modal still renders the known options.
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
  });

  it('invokes the booking status modal submit no-op without updating', async () => {
    servicesDefsData = mockDefs;
    servicesItemsData = mockItems;
    servicesBookingsData = mockBookings;
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-bookings'));
    fireEvent.click(screen.getAllByText('Update Status')[0]);
    await waitFor(() => expect(screen.getByText('Update Booking Status')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('modal-submit'));
    expect(mockUpdateBookingStatus).not.toHaveBeenCalled();
  });

  it('shows stringified error toast when definition save rejects with a non-Error value', async () => {
    mockSaveServiceDefinition.mockRejectedValue('def exploded');
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('add-def-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Service Type' })));
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'X' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Error: def exploded', 'error'));
  });

  it('shows stringified error toast when item save rejects with a non-Error value', async () => {
    mockSaveServiceItem.mockRejectedValue('item exploded');
    servicesDefsData = mockDefs;
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-items'));
    fireEvent.click(screen.getByTestId('add-item-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Service' })));
    fireEvent.change(screen.getByTestId('select-Service Type *'), { target: { value: 'sd1' } });
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'X' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Error: item exploded', 'error'));
  });

  it('shows stringified error toast when delete rejects with a non-Error value', async () => {
    mockDeleteServiceItem.mockRejectedValue('del exploded');
    servicesDefsData = mockDefs;
    servicesItemsData = mockItems;
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-items'));
    fireEvent.click(screen.getAllByText('Delete')[0]);
    fireEvent.click(screen.getByTestId('confirm-yes'));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Error: del exploded', 'error'));
  });

  it('shows stringified error toast when status update rejects with a non-Error value', async () => {
    mockUpdateBookingStatus.mockRejectedValue('status exploded');
    servicesDefsData = mockDefs;
    servicesItemsData = mockItems;
    servicesBookingsData = mockBookings;
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-bookings'));
    fireEvent.click(screen.getAllByText('Update Status')[0]);
    await waitFor(() => expect(screen.getByText('Update Booking Status')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Confirmed'));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Error: status exploded', 'error'));
  });

  it('pre-fills empty optional fields when editing a sparsely-populated item', async () => {
    servicesDefsData = mockDefs;
    servicesItemsData = [
      { id: 'si3', service_definition_id: 'sd1', project_id: null, name: 'Bare', description: '', base_price: null, status: 'active', definition_name: '' },
    ];
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-items'));
    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Edit Service' })));
    expect(screen.getByTestId('input-Name *')).toHaveValue('Bare');
    // jest-dom's toHaveValue returns null for empty `type="number"` inputs, so
    // assert on the DOM value property directly.
    expect((screen.getByTestId('input-Base Price ($)') as HTMLInputElement).value).toBe('');
    expect(screen.getByTestId('input-Description')).toHaveValue('');
    expect(screen.getByTestId('select-Status')).toHaveValue('active');
  });

  it('pre-fills empty description when editing a definition without one', async () => {
    servicesDefsData = mockDefs;
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getAllByText('Edit')[1]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Edit Service Type' })));
    expect(screen.getByTestId('input-Description')).toHaveValue('');
  });
});