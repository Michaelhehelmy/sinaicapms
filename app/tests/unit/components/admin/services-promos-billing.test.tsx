import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ServicesPanel from '@/components/admin/ServicesPanel';
import ServiceBookingsPanel from '@/components/admin/ServiceBookingsPanel';
import PromotionsPanel from '@/components/admin/PromotionsPanel';
import SubscriptionsPanel from '@/components/admin/SubscriptionsPanel';
import BillingPanel from '@/components/admin/BillingPanel';

const { mockShowToast, mockTrackEvent } = vi.hoisted(() => ({
  mockShowToast: vi.fn(),
  mockTrackEvent: vi.fn(),
}));

// ── Mutable hook data (re-assigned in beforeEach / per test) ──────────
let servicesDefsData: unknown[] = [];
let servicesDefsLoading = false;
let servicesItemsData: unknown[] = [];
let servicesItemsLoading = false;
let servicesBookingsData: unknown[] = [];
let servicesBookingsLoading = false;

let promosData: unknown[] = [];
let promosLoading = false;

let subsParams: Record<string, string> | undefined;
let subsData: unknown = undefined;
let subsLoading = false;

let billingData: unknown = undefined;
let billingLoading = false;
let billingError: Error | null = null;

// ── Mock module factories ─────────────────────────────────────────────
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/plausible', () => ({
  trackEvent: mockTrackEvent,
}));

vi.mock('@/lib/utils', () => ({
  formatCurrency: (v: number) => `$${v.toFixed(2)}`,
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('@/hooks/useQueryHooks', () => {
  const React = require('react');
  const useControlled = (value: unknown, loading: boolean, error: Error | null = null) => {
    const [data, setData] = React.useState(value);
    const [isLoading, setIsLoading] = React.useState(loading);
    const [err, setErr] = React.useState(error);
    React.useEffect(() => {
      setData(value);
      setIsLoading(loading);
      setErr(error);
    });
    return { data, isLoading: isLoading, error: err };
  };
  return {
    queryKeys: {
      camps: ['admin', 'camps'],
      serviceDefinitions: ['admin', 'serviceDefinitions'],
      serviceItems: ['admin', 'serviceItems'],
      serviceBookings: (status?: string) => ['admin', 'serviceBookings', status],
      adminSubscriptions: () => ['admin', 'subscriptions'],
      tenantBilling: ['admin', 'tenantBilling'],
    },
    useServiceDefinitionsQuery: () => useControlled(servicesDefsData, servicesDefsLoading),
    useServiceItemsQuery: () => useControlled(servicesItemsData, servicesItemsLoading),
    useServiceBookingsQuery: () => useControlled(servicesBookingsData, servicesBookingsLoading),
    usePromotionsQuery: () => useControlled(promosData, promosLoading),
    useAdminSubscriptionsQuery: (params?: Record<string, string>) => {
      subsParams = params;
      return useControlled(subsData, subsLoading);
    },
    useTenantBillingQuery: () => useControlled(billingData, billingLoading, billingError),
  };
});

vi.mock('@/lib/api', () => ({
  getServiceDefinitions: vi.fn(),
  saveServiceDefinition: vi.fn(),
  deleteServiceDefinition: vi.fn(),
  getServiceItems: vi.fn(),
  saveServiceItem: vi.fn(),
  deleteServiceItem: vi.fn(),
  getServiceBookings: vi.fn(),
  createServiceBooking: vi.fn(),
  updateBookingStatus: vi.fn(),
  assignServiceWorker: vi.fn(),
  getPosUsers: vi.fn(),
  getPromotions: vi.fn(),
  savePromotion: vi.fn(),
  deletePromotion: vi.fn(),
  updateAdminSubscription: vi.fn(),
  cancelAdminSubscription: vi.fn(),
  resumeAdminSubscription: vi.fn(),
  getTenantBilling: vi.fn(),
}));

import * as api from '@/lib/api';
const mockGetServiceDefinitions = vi.mocked(api.getServiceDefinitions);
const mockSaveServiceDefinition = vi.mocked(api.saveServiceDefinition);
const mockDeleteServiceDefinition = vi.mocked(api.deleteServiceDefinition);
const mockSaveServiceItem = vi.mocked(api.saveServiceItem);
const mockDeleteServiceItem = vi.mocked(api.deleteServiceItem);
const mockUpdateBookingStatus = vi.mocked(api.updateBookingStatus);
const mockCreateServiceBooking = vi.mocked(api.createServiceBooking);
const mockAssignServiceWorker = vi.mocked(api.assignServiceWorker);
const mockGetPosUsers = vi.mocked(api.getPosUsers);
const mockGetServiceItems = vi.mocked(api.getServiceItems);
const mockGetServiceBookings = vi.mocked(api.getServiceBookings);
const mockSavePromotion = vi.mocked(api.savePromotion);
const mockDeletePromotion = vi.mocked(api.deletePromotion);
const mockUpdateAdminSubscription = vi.mocked(api.updateAdminSubscription);
const mockCancelAdminSubscription = vi.mocked(api.cancelAdminSubscription);
const mockResumeAdminSubscription = vi.mocked(api.resumeAdminSubscription);

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

const mockPromos = [
  { id: 'pr1', name: 'Summer Sale', type: 'percentage', value: 20, applies_to: 'all', applies_to_id: null, min_purchase: 50, day_of_week: null, start_date: '2025-06-01', end_date: '2025-08-01', is_active: 1 },
  { id: 'pr2', name: 'BOGO Dessert', type: 'bogo', value: 0, applies_to: 'category', applies_to_id: 'cat_desserts', min_purchase: 0, day_of_week: 5, start_date: '', end_date: '', is_active: 0 },
  { id: 'pr3', name: 'Coke Discount', type: 'fixed', value: 5, applies_to: 'product', applies_to_id: 'prod_coke', min_purchase: 0, day_of_week: 0, start_date: '', end_date: '', is_active: 1 },
];

const mockSubData = {
  data: [
    { tenantId: 't1', tenantName: 'Acacia', plan: 'pro', status: 'active', usage: { bookings: 500, limit: 10000, percent: 5 }, totalPaid: 99 },
    { tenantId: 't2', tenantName: 'Sinai', plan: 'free', status: 'canceled', usage: { bookings: 0, limit: 100, percent: 0 }, totalPaid: 0 },
  ],
  total: 2,
  page: 1,
  pageSize: 20,
};

const mockBilling = {
  subscription: { plan: 'pro', planLabel: 'Pro', price: 99, status: 'active', currentPeriodEnd: '2026-09-01T00:00:00Z' },
  usage: { bookings: 150, bookingsLimit: 10000, posUsers: 3, posUsersLimit: 10 },
  plans: [
    { name: 'Free', price: 0, period: '/mo', bookingsLimit: 100, storageLimit: '1 GB', posUsersLimit: 2 },
    { name: 'Pro', price: 99, period: '/mo', bookingsLimit: 10000, storageLimit: '50 GB', posUsersLimit: 10 },
  ],
  billingHistory: [
    { id: 'bh1', date: '2026-08-01T00:00:00Z', description: 'Monthly subscription', amount: 99, status: 'active' },
  ],
};

// ── Render helpers ────────────────────────────────────────────────────
// A fresh QueryClient per render prevents a pending query from one test
// (e.g. the never-resolving "loading" promise) leaking into subsequent
// tests that reuse the same query key with the real react-query hooks.
function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function setServices(defs: unknown[], items: unknown[], bookings: unknown[]) {
  servicesDefsData = defs;
  servicesItemsData = items;
  servicesBookingsData = bookings;
}

beforeEach(() => {
  vi.clearAllMocks();
  servicesDefsData = [];
  servicesDefsLoading = false;
  servicesItemsData = [];
  servicesItemsLoading = false;
  servicesBookingsData = [];
  servicesBookingsLoading = false;
  promosData = [];
  promosLoading = false;
  subsData = undefined;
  subsLoading = false;
  billingData = undefined;
  billingLoading = false;
  billingError = null;
  const setupData = mockBilling;
  void setupData;
});

// ══════════════════════════════════════════════════════════════════════
// ServicesPanel
// ══════════════════════════════════════════════════════════════════════
describe('ServicesPanel', () => {
  beforeEach(() => {
    servicesDefsData = [];
    servicesItemsData = [];
    servicesBookingsData = [];
    servicesDefsLoading = false;
    servicesItemsLoading = false;
    servicesBookingsLoading = false;
    mockGetServiceDefinitions.mockResolvedValue([] as never);
    mockGetServiceItems.mockResolvedValue([] as never);
    mockGetServiceBookings.mockResolvedValue([] as never);
  });

  it('renders with definitions table by default', () => {
    setServices(mockDefs, mockItems, mockBookings);
    renderWithQuery(<ServicesPanel />);
    expect(screen.getByTestId('services-panel')).toBeInTheDocument();
    expect(screen.getByText('Services')).toBeInTheDocument();
    expect(screen.getByText('Plumbing')).toBeInTheDocument();
    expect(screen.getByText('/plumber')).toBeInTheDocument();
    expect(screen.getByText('Electrical')).toBeInTheDocument();
  });

  it('shows loading spinner when any query is loading', () => {
    setServices([], [], []);
    servicesDefsLoading = true;
    renderWithQuery(<ServicesPanel />);
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.getByText('Loading services...')).toBeInTheDocument();
  });

  it('shows empty state when no definitions exist', () => {
    setServices([], mockItems, mockBookings);
    renderWithQuery(<ServicesPanel />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No service types')).toBeInTheDocument();
  });

  it('switches to items tab and renders items table', () => {
    setServices(mockDefs, mockItems, mockBookings);
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-items'));
    expect(screen.getByText('Emergency Plumbing')).toBeInTheDocument();
    expect(screen.getByText('Rewire')).toBeInTheDocument();
    expect(screen.getByText('$50.00')).toBeInTheDocument();
  });

  it('shows empty state for items tab', () => {
    setServices(mockDefs, [], mockBookings);
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-items'));
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No bookable items')).toBeInTheDocument();
  });

  it('switches to bookings tab with badge count', () => {
    setServices(mockDefs, mockItems, mockBookings);
    renderWithQuery(<ServicesPanel />);
    expect(screen.getByText('Bookings (2)')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tab-bookings'));
    expect(screen.getByText('Emergency Plumbing')).toBeInTheDocument();
    expect(screen.getByText('John')).toBeInTheDocument();
  });

  it('shows empty state for bookings tab', () => {
    setServices(mockDefs, mockItems, []);
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-bookings'));
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No bookings yet')).toBeInTheDocument();
  });

  it('adds a service type via the form', async () => {
    mockSaveServiceDefinition.mockResolvedValue({ id: 'sd_new', success: true } as never);
    setServices([], [], []);
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('add-def-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Service Type' })));
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Tour Guide' } });
    fireEvent.change(screen.getByTestId('input-Slug'), { target: { value: 'tour-guide' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockSaveServiceDefinition).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Tour Guide', slug: 'tour-guide' }),
        undefined,
      );
      expect(mockShowToast).toHaveBeenCalledWith('Definition created.', 'success');
    });
  });

  it('rejects saving a definition with empty name', async () => {
    setServices([], [], []);
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('add-def-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Service Type' })));
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Name is required.', 'warning'));
    expect(mockSaveServiceDefinition).not.toHaveBeenCalled();
  });

  it('edits a service type and pre-fills fields', async () => {
    setServices(mockDefs, [], []);
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Edit Service Type' })));
    expect(screen.getByTestId('input-Name *')).toHaveValue('Plumbing');
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Plumbing Pro' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockSaveServiceDefinition).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Plumbing Pro' }),
        'sd1',
      );
      expect(mockShowToast).toHaveBeenCalledWith('Definition updated.', 'success');
    });
  });

  it('shows error toast when saving definition fails', async () => {
    mockSaveServiceDefinition.mockRejectedValue(new Error('db down'));
    setServices([], [], []);
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('add-def-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Service Type' })));
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Test' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Error: db down', 'error'));
  });

  it('deletes a service type after confirmation', async () => {
    mockDeleteServiceDefinition.mockResolvedValue({ success: true } as never);
    setServices(mockDefs, [], []);
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getAllByText('Delete')[0]);
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    expect(screen.getByText('Delete Service Type')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('confirm-yes'));
    await waitFor(() => {
      expect(mockDeleteServiceDefinition).toHaveBeenCalledWith('sd1');
      expect(mockShowToast).toHaveBeenCalledWith('Deleted.', 'success');
    });
  });

  it('shows error toast when delete fails', async () => {
    mockDeleteServiceDefinition.mockRejectedValue(new Error('lock'));
    setServices(mockDefs, [], []);
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getAllByText('Delete')[0]);
    fireEvent.click(screen.getByTestId('confirm-yes'));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Error: lock', 'error'));
  });

  it('adds a service item via the form', async () => {
    mockSaveServiceItem.mockResolvedValue({ id: 'si_new', success: true } as never);
    setServices(mockDefs, [], []);
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-items'));
    fireEvent.click(screen.getByTestId('add-item-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Service' })));
    fireEvent.change(screen.getByTestId('select-Service Type *'), { target: { value: 'sd1' } });
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Pipe Repair' } });
    fireEvent.change(screen.getByTestId('input-Base Price ($)'), { target: { value: '75' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockSaveServiceItem).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Pipe Repair', service_definition_id: 'sd1', base_price: 75 }),
        undefined,
      );
      expect(mockShowToast).toHaveBeenCalledWith('Item created.', 'success');
    });
  });

  it('rejects item with empty name', async () => {
    setServices(mockDefs, [], []);
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-items'));
    fireEvent.click(screen.getByTestId('add-item-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Service' })));
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Name is required.', 'warning'));
    expect(mockSaveServiceItem).not.toHaveBeenCalled();
  });

  it('rejects item missing service type', async () => {
    setServices(mockDefs, [], []);
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-items'));
    fireEvent.click(screen.getByTestId('add-item-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Service' })));
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'X' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Service type is required.', 'warning'));
    expect(mockSaveServiceItem).not.toHaveBeenCalled();
  });

  it('edits a service item pre-filling fields', async () => {
    setServices(mockDefs, mockItems, []);
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-items'));
    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Edit Service' })));
    expect(screen.getByTestId('input-Name *')).toHaveValue('Emergency Plumbing');
    expect(screen.getByTestId('select-Service Type *')).toHaveValue('sd1');
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Urgent Plumbing' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockSaveServiceItem).toHaveBeenCalledWith(expect.objectContaining({ name: 'Urgent Plumbing' }), 'si1');
      expect(mockShowToast).toHaveBeenCalledWith('Item updated.', 'success');
    });
  });

  it('deletes a service item after confirmation', async () => {
    mockDeleteServiceItem.mockResolvedValue({ success: true } as never);
    setServices(mockDefs, mockItems, []);
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-items'));
    fireEvent.click(screen.getAllByText('Delete')[0]);
    expect(screen.getByText('Delete Service Item')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('confirm-yes'));
    await waitFor(() => {
      expect(mockDeleteServiceItem).toHaveBeenCalledWith('si1');
      expect(mockShowToast).toHaveBeenCalledWith('Deleted.', 'success');
    });
  });

  it('updates booking status from the bookings tab', async () => {
    mockUpdateBookingStatus.mockResolvedValue({ success: true } as never);
    setServices(mockDefs, mockItems, mockBookings);
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-bookings'));
    fireEvent.click(screen.getAllByText('Update Status')[0]);
    await waitFor(() => expect(screen.getByText('Update Booking Status')).toBeInTheDocument());
    // "Current status: Pending" is split across a <strong> child, so match the leading text node.
    expect(screen.getByText(/Current status:/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Confirmed'));
    await waitFor(() => {
      expect(mockUpdateBookingStatus).toHaveBeenCalledWith('sb1', 'confirmed');
      expect(mockShowToast).toHaveBeenCalledWith('Booking marked as confirmed.', 'success');
    });
  });

  it('shows error toast when updating booking status fails', async () => {
    mockUpdateBookingStatus.mockRejectedValue(new Error('nope'));
    setServices(mockDefs, mockItems, mockBookings);
    renderWithQuery(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-bookings'));
    fireEvent.click(screen.getAllByText('Update Status')[0]);
    await waitFor(() => expect(screen.getByText('Update Booking Status')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Confirmed'));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Error: nope', 'error'));
  });
});

// ══════════════════════════════════════════════════════════════════════
// ServiceBookingsPanel
// ══════════════════════════════════════════════════════════════════════
describe('ServiceBookingsPanel', () => {
  beforeEach(() => {
    mockGetServiceBookings.mockResolvedValue([] as never);
    mockGetServiceItems.mockResolvedValue([] as never);
    mockGetPosUsers.mockResolvedValue({ data: [] } as never);
  });

  it('renders and shows loading state initially', async () => {
    mockGetServiceBookings.mockReturnValue(new Promise(() => {}) as never);
    renderWithQuery(<ServiceBookingsPanel />);
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.getByText('Loading bookings...')).toBeInTheDocument();
    // The bookings query stays pending (never resolves), so the panel does not mount.
    expect(screen.queryByTestId('service-bookings-panel')).not.toBeInTheDocument();
  });

  it('renders bookings table with data', async () => {
    mockGetServiceBookings.mockResolvedValue(mockBookings as never);
    mockGetServiceItems.mockResolvedValue(mockItems as never);
    mockGetPosUsers.mockResolvedValue({ data: [{ id: 'w1', firstName: 'Ali', lastName: 'Khan', isActive: 1 }] } as never);
    renderWithQuery(<ServiceBookingsPanel />);
    await waitFor(() => expect(screen.getByTestId('data-table')).toBeInTheDocument());
    expect(screen.getByText('Service Bookings')).toBeInTheDocument();
    expect(screen.getByText('John')).toBeInTheDocument();
    expect(screen.getByText('Emergency Plumbing')).toBeInTheDocument();
  });

  it('renders empty state when no bookings', async () => {
    mockGetServiceBookings.mockResolvedValue([] as never);
    renderWithQuery(<ServiceBookingsPanel />);
    await waitFor(() => expect(screen.getByTestId('empty-state')).toBeInTheDocument());
    expect(screen.getByText('No bookings yet')).toBeInTheDocument();
  });

  it('creates a booking via the modal', async () => {
    mockGetServiceBookings.mockResolvedValue([] as never);
    mockGetServiceItems.mockResolvedValue(mockItems as never);
    mockCreateServiceBooking.mockResolvedValue({ id: 'sb_new', success: true } as never);
    renderWithQuery(<ServiceBookingsPanel />);
    await waitFor(() => expect(screen.getByTestId('add-booking-btn')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('add-booking-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Create Booking' })));
    fireEvent.change(screen.getByTestId('select-Service Item *'), { target: { value: 'si1' } });
    fireEvent.change(screen.getByTestId('input-Customer Name'), { target: { value: 'Jane' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockCreateServiceBooking).toHaveBeenCalledWith(expect.objectContaining({ service_item_id: 'si1', customer_name: 'Jane' }));
      expect(mockShowToast).toHaveBeenCalledWith('Booking created.', 'success');
    });
  });

  it('rejects creating a booking without service item', async () => {
    mockGetServiceBookings.mockResolvedValue([] as never);
    renderWithQuery(<ServiceBookingsPanel />);
    await waitFor(() => expect(screen.getByTestId('add-booking-btn')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('add-booking-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Create Booking' })));
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Service item is required.', 'warning'));
    expect(mockCreateServiceBooking).not.toHaveBeenCalled();
  });

  it('shows error toast when create fails', async () => {
    mockGetServiceBookings.mockResolvedValue([] as never);
    mockGetServiceItems.mockResolvedValue(mockItems as never);
    mockCreateServiceBooking.mockRejectedValue(new Error('create failed'));
    renderWithQuery(<ServiceBookingsPanel />);
    await waitFor(() => expect(screen.getByTestId('add-booking-btn')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('add-booking-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Create Booking' })));
    fireEvent.change(screen.getByTestId('select-Service Item *'), { target: { value: 'si1' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Error: create failed', 'error'));
  });

  it('changes booking status from row action select', async () => {
    mockGetServiceBookings.mockResolvedValue(mockBookings as never);
    mockUpdateBookingStatus.mockResolvedValue({ success: true } as never);
    renderWithQuery(<ServiceBookingsPanel />);
    await waitFor(() => expect(screen.getByTestId('data-table')).toBeInTheDocument());
    // Row action status selects have an empty label => testid "select" (the
    // filter select carries a label, so it is excluded). Pick the first row.
    const rowSelects = screen.getAllByTestId('select');
    fireEvent.change(rowSelects[0], { target: { value: 'confirmed' } });
    await waitFor(() => {
      expect(mockUpdateBookingStatus).toHaveBeenCalledWith('sb1', 'confirmed');
    });
  });

  it('assigns a worker via the modal', async () => {
    mockGetServiceBookings.mockResolvedValue(mockBookings as never);
    mockGetPosUsers.mockResolvedValue({ data: [{ id: 'w1', firstName: 'Ali', lastName: 'Khan', isActive: 1 }] } as never);
    mockAssignServiceWorker.mockResolvedValue({ success: true } as never);
    renderWithQuery(<ServiceBookingsPanel />);
    await waitFor(() => expect(screen.getByTestId('data-table')).toBeInTheDocument());
    fireEvent.click(screen.getAllByText('Assign Worker')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Assign Worker' })));
    fireEvent.change(screen.getByTestId('select-Select Worker'), { target: { value: 'w1' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockAssignServiceWorker).toHaveBeenCalledWith('sb1', 'w1');
      expect(mockShowToast).toHaveBeenCalledWith('Worker assigned.', 'success');
    });
  });

  it('shows error toast when assign fails', async () => {
    mockGetServiceBookings.mockResolvedValue(mockBookings as never);
    mockGetPosUsers.mockResolvedValue({ data: [{ id: 'w1', firstName: 'Ali', lastName: 'Khan', isActive: 1 }] } as never);
    mockAssignServiceWorker.mockRejectedValue(new Error('assign failed'));
    renderWithQuery(<ServiceBookingsPanel />);
    await waitFor(() => expect(screen.getByTestId('data-table')).toBeInTheDocument());
    fireEvent.click(screen.getAllByText('Assign Worker')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Assign Worker' })));
    fireEvent.change(screen.getByTestId('select-Select Worker'), { target: { value: 'w1' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Error: assign failed', 'error'));
  });
});

// ══════════════════════════════════════════════════════════════════════
// PromotionsPanel
// ══════════════════════════════════════════════════════════════════════
describe('PromotionsPanel', () => {
  beforeEach(() => {
    promosData = [];
    promosLoading = false;
  });

  it('renders promotions table with formatted values', () => {
    promosData = mockPromos;
    renderWithQuery(<PromotionsPanel />);
    expect(screen.getByTestId('promotions-panel')).toBeInTheDocument();
    expect(screen.getByText('Summer Sale')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
    expect(screen.getByText('All Products')).toBeInTheDocument();
    // 'BOGO' appears in both the Type badge (upper-cased type) and the Value cell.
    expect(screen.getAllByText('BOGO').length).toBeGreaterThan(0);
    expect(screen.getByText('$5.00')).toBeInTheDocument();
  });

  it('shows loading spinner', () => {
    promosLoading = true;
    promosData = [];
    renderWithQuery(<PromotionsPanel />);
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.getByText('Loading promotions...')).toBeInTheDocument();
  });

  it('shows empty state when no promotions', () => {
    promosData = [];
    renderWithQuery(<PromotionsPanel />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No promotions yet')).toBeInTheDocument();
  });

  it('formats schedule and category applies_to', () => {
    promosData = mockPromos;
    renderWithQuery(<PromotionsPanel />);
    expect(screen.getByText('Category: cat_desserts')).toBeInTheDocument();
    expect(screen.getByText('Product: prod_coke')).toBeInTheDocument();
    expect(screen.getByText(/Fri/)).toBeInTheDocument();
    expect(screen.getByText(/From 2025-06-01/)).toBeInTheDocument();
  });

  it('creates a promotion', async () => {
    mockSavePromotion.mockResolvedValue({ id: 'pr_new', success: true } as never);
    promosData = [];
    renderWithQuery(<PromotionsPanel />);
    fireEvent.click(screen.getByTestId('add-promotion-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Promotion' })));
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'New Deal' } });
    fireEvent.change(screen.getByTestId('input-Percentage *'), { target: { value: '15' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockSavePromotion).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New Deal', type: 'percentage', value: 15 }),
        undefined,
      );
      expect(mockShowToast).toHaveBeenCalledWith('Promotion created.', 'success');
      expect(mockTrackEvent).toHaveBeenCalledWith('Tenant: Promotion Updated', { promoId: 'new' });
    });
  });

  it('rejects empty name', async () => {
    promosData = [];
    renderWithQuery(<PromotionsPanel />);
    fireEvent.click(screen.getByTestId('add-promotion-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Promotion' })));
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Name is required.', 'warning'));
    expect(mockSavePromotion).not.toHaveBeenCalled();
  });

  it('rejects negative value for percentage', async () => {
    promosData = [];
    renderWithQuery(<PromotionsPanel />);
    fireEvent.click(screen.getByTestId('add-promotion-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Promotion' })));
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Bad' } });
    fireEvent.change(screen.getByTestId('input-Percentage *'), { target: { value: '-5' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Value must be a non-negative number.', 'warning'));
    expect(mockSavePromotion).not.toHaveBeenCalled();
  });

  it('edits a promotion pre-filling fields', async () => {
    promosData = mockPromos;
    renderWithQuery(<PromotionsPanel />);
    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Edit Promotion' })));
    expect(screen.getByTestId('input-Name *')).toHaveValue('Summer Sale');
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockSavePromotion).toHaveBeenCalledWith(expect.objectContaining({ name: 'Summer Sale' }), 'pr1');
      expect(mockShowToast).toHaveBeenCalledWith('Promotion updated.', 'success');
    });
  });

  it('shows error toast when save fails', async () => {
    mockSavePromotion.mockRejectedValue(new Error('save failed'));
    promosData = [];
    renderWithQuery(<PromotionsPanel />);
    fireEvent.click(screen.getByTestId('add-promotion-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Promotion' })));
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'X' } });
    fireEvent.change(screen.getByTestId('input-Percentage *'), { target: { value: '10' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Error: save failed', 'error'));
  });

  it('deletes a promotion after confirmation', async () => {
    mockDeletePromotion.mockResolvedValue({ success: true } as never);
    promosData = mockPromos;
    renderWithQuery(<PromotionsPanel />);
    fireEvent.click(screen.getAllByText('Delete')[0]);
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    expect(screen.getByText('Delete Promotion')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('confirm-yes'));
    await waitFor(() => {
      expect(mockDeletePromotion).toHaveBeenCalledWith('pr1');
      expect(mockShowToast).toHaveBeenCalledWith('Promotion deleted.', 'success');
    });
  });

  it('shows error toast when delete fails', async () => {
    mockDeletePromotion.mockRejectedValue(new Error('del failed'));
    promosData = mockPromos;
    renderWithQuery(<PromotionsPanel />);
    fireEvent.click(screen.getAllByText('Delete')[0]);
    fireEvent.click(screen.getByTestId('confirm-yes'));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Error: del failed', 'error'));
  });

  it('cancels delete without calling api', async () => {
    promosData = mockPromos;
    renderWithQuery(<PromotionsPanel />);
    fireEvent.click(screen.getAllByText('Delete')[0]);
    fireEvent.click(screen.getByTestId('confirm-no'));
    expect(mockDeletePromotion).not.toHaveBeenCalled();
  });

  it('allows switching type to fixed', async () => {
    promosData = [];
    renderWithQuery(<PromotionsPanel />);
    fireEvent.click(screen.getByTestId('add-promotion-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Promotion' })));
    fireEvent.change(screen.getByTestId('select-Type *'), { target: { value: 'fixed' } });
    expect(screen.getByTestId('input-Amount Off *')).toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════
// SubscriptionsPanel
// ══════════════════════════════════════════════════════════════════════
describe('SubscriptionsPanel', () => {
  beforeEach(() => {
    subsData = undefined;
    subsLoading = false;
  });

  it('renders subscription table with plan summary cards', () => {
    subsData = mockSubData;
    renderWithQuery(<SubscriptionsPanel />);
    expect(screen.getByText('Subscriptions')).toBeInTheDocument();
    expect(screen.getByText('2 total subscriptions')).toBeInTheDocument();
    expect(screen.getByText('Acacia')).toBeInTheDocument();
    expect(screen.getByText('Sinai')).toBeInTheDocument();
    expect(screen.getByText('$99.00')).toBeInTheDocument();
  });

  it('shows loading spinner', () => {
    subsLoading = true;
    renderWithQuery(<SubscriptionsPanel />);
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.getByText('Loading subscriptions...')).toBeInTheDocument();
  });

  it('filters by plan and status', () => {
    subsData = mockSubData;
    renderWithQuery(<SubscriptionsPanel />);
    fireEvent.change(screen.getByTestId('select-Plan'), { target: { value: 'pro' } });
    expect(subsParams?.plan).toBe('pro');
    fireEvent.change(screen.getByTestId('select-Status'), { target: { value: 'active' } });
    expect(subsParams?.status).toBe('active');
    fireEvent.change(screen.getByTestId('select-Plan'), { target: { value: '' } });
    expect(subsParams?.plan).toBeUndefined();
  });

  it('shows clear button when filters applied and clears them', () => {
    subsData = mockSubData;
    renderWithQuery(<SubscriptionsPanel />);
    fireEvent.change(screen.getByTestId('select-Plan'), { target: { value: 'pro' } });
    const clearBtn = screen.getByText('Clear');
    expect(clearBtn).toBeInTheDocument();
    fireEvent.click(clearBtn);
    expect(subsParams?.plan).toBeUndefined();
  });

  it('changes plan for a tenant', async () => {
    mockUpdateAdminSubscription.mockResolvedValue({ success: true } as never);
    subsData = mockSubData;
    renderWithQuery(<SubscriptionsPanel />);
    fireEvent.click(screen.getAllByText('Change Plan')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Change Plan — Acacia' })));
    fireEvent.change(screen.getByTestId('select-New Plan'), { target: { value: 'enterprise' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockUpdateAdminSubscription).toHaveBeenCalledWith('t1', { plan: 'enterprise' });
      expect(mockShowToast).toHaveBeenCalledWith('Subscription updated to enterprise', 'success');
    });
  });

  it('shows error toast when change plan fails', async () => {
    mockUpdateAdminSubscription.mockRejectedValue(new Error('upgrade failed'));
    subsData = mockSubData;
    renderWithQuery(<SubscriptionsPanel />);
    fireEvent.click(screen.getAllByText('Change Plan')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Change Plan — Acacia' })));
    fireEvent.change(screen.getByTestId('select-New Plan'), { target: { value: 'starter' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Failed to update: upgrade failed', 'error'));
  });

  it('cancels an active subscription after confirmation', async () => {
    mockCancelAdminSubscription.mockResolvedValue({ success: true } as never);
    subsData = mockSubData;
    renderWithQuery(<SubscriptionsPanel />);
    fireEvent.click(screen.getAllByText('Cancel')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Cancel Subscription' })));
    expect(screen.getByText(/Are you sure you want to cancel/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockCancelAdminSubscription).toHaveBeenCalledWith('t1');
      expect(mockShowToast).toHaveBeenCalledWith('Subscription canceled', 'success');
    });
  });

  it('resumes a canceled subscription after confirmation', async () => {
    mockResumeAdminSubscription.mockResolvedValue({ success: true } as never);
    subsData = mockSubData;
    renderWithQuery(<SubscriptionsPanel />);
    fireEvent.click(screen.getAllByText('Resume')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Resume Subscription' })));
    expect(screen.getByText(/Resume the subscription for/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockResumeAdminSubscription).toHaveBeenCalledWith('t2');
      expect(mockShowToast).toHaveBeenCalledWith('Subscription resumed', 'success');
    });
  });

  it('shows error toast when cancel fails', async () => {
    mockCancelAdminSubscription.mockRejectedValue(new Error('cancel failed'));
    subsData = mockSubData;
    renderWithQuery(<SubscriptionsPanel />);
    fireEvent.click(screen.getAllByText('Cancel')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Cancel Subscription' })));
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Action failed: cancel failed', 'error'));
  });

  it('paginates through subscriptions', () => {
    subsData = mockSubData;
    renderWithQuery(<SubscriptionsPanel />);
    expect(screen.getByTestId('pagination')).toBeInTheDocument();
    expect(screen.getByText('Page 1')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('pagination-next'));
    // The mock returns a static page shape, but the page change flows through
    // the query params (setPage(2) => queryParams.page === '2').
    expect(subsParams?.page).toBe('2');
  });
});

// ══════════════════════════════════════════════════════════════════════
// BillingPanel
// ══════════════════════════════════════════════════════════════════════
describe('BillingPanel', () => {
  beforeEach(() => {
    billingData = undefined;
    billingLoading = false;
    billingError = null;
  });

  it('renders billing skeleton while loading', () => {
    billingLoading = true;
    renderWithQuery(<BillingPanel />);
    expect(screen.getByTestId('billing-panel')).toBeInTheDocument();
  });

  it('renders error state', () => {
    billingError = new Error('boom');
    renderWithQuery(<BillingPanel />);
    expect(screen.getByTestId('billing-panel')).toBeInTheDocument();
    expect(screen.getByText(/Unable to load billing information/)).toBeInTheDocument();
  });

  it('renders billing details with plan, usage, plans and history', () => {
    billingData = mockBilling;
    renderWithQuery(<BillingPanel />);
    expect(screen.getByText('Billing & Plans')).toBeInTheDocument();
    // 'Pro' appears in both the current-plan label and the plan comparison header.
    expect(screen.getAllByText('Pro').length).toBeGreaterThan(0);
    expect(screen.getByText('$99/mo')).toBeInTheDocument();
    expect(screen.getByText('Compare Plans')).toBeInTheDocument();
    expect(screen.getByText('Monthly subscription')).toBeInTheDocument();
    expect(screen.getByText(/Next billing/)).toBeInTheDocument();
  });

  it('handles unlimited plan branch and no current period end', () => {
    billingData = {
      subscription: { plan: 'free', planLabel: 'Free', price: 0, status: 'active', currentPeriodEnd: null },
      usage: { bookings: 50, bookingsLimit: 0, posUsers: 2, posUsersLimit: 0 },
      plans: [{ name: 'Free', price: 0, period: '/mo', bookingsLimit: 0, storageLimit: '0', posUsersLimit: 0 }],
      billingHistory: [],
    };
    renderWithQuery(<BillingPanel />);
    // 'Free' appears in both the current-plan label and the plan comparison header.
    expect(screen.getAllByText('Free').length).toBeGreaterThan(0);
    // Two usage meters render "(unlimited)".
    expect(screen.getAllByText(/unlimited/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Next billing/)).not.toBeInTheDocument();
    expect(screen.queryByText('Billing History')).not.toBeInTheDocument();
  });

  it('renders status as canceled with red text', () => {
    billingData = {
      ...mockBilling,
      subscription: { ...mockBilling.subscription, status: 'canceled', currentPeriodEnd: null },
    };
    renderWithQuery(<BillingPanel />);
    expect(screen.getByText('Billing & Plans')).toBeInTheDocument();
    expect(screen.getByText('canceled')).toBeInTheDocument();
  });
});
