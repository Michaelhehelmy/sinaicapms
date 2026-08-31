import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import UsersPanel from '@/components/admin/UsersPanel';
import SystemHealthPanel from '@/components/admin/SystemHealthPanel';
import SystemSettingsPanel from '@/components/admin/SystemSettingsPanel';
import TenantPerformancePanel from '@/components/admin/TenantPerformancePanel';
import AuditLogPanel from '@/components/admin/AuditLogPanel';
import SuperReportsPanel from '@/components/admin/SuperReportsPanel';

// ── Hook mocks (per-panel) ──────────────────────────────────────────────
const mockUseAdminUsersQuery = vi.fn();
const mockUseAdminHealthQuery = vi.fn();
const mockUseAdminHealthMetricsQuery = vi.fn();
const mockUseAdminSettingsQuery = vi.fn();
const mockUseAdminPerformanceQuery = vi.fn();
const mockUseAdminAuditQuery = vi.fn();
const mockUseAdminReportsQuery = vi.fn();
const mockUseAdminScheduledReportsQuery = vi.fn();

vi.mock('@/hooks/useQueryHooks', () => ({
  queryKeys: {
    adminSettings: ['admin', 'settings'],
    accounts: ['admin', 'accounts'],
  },
  useAdminUsersQuery: (...args: unknown[]) => mockUseAdminUsersQuery(...args),
  useAdminHealthQuery: (...args: unknown[]) => mockUseAdminHealthQuery(...args),
  useAdminHealthMetricsQuery: (...args: unknown[]) => mockUseAdminHealthMetricsQuery(...args),
  useAdminSettingsQuery: (...args: unknown[]) => mockUseAdminSettingsQuery(...args),
  useAdminPerformanceQuery: (...args: unknown[]) => mockUseAdminPerformanceQuery(...args),
  useAdminAuditQuery: (...args: unknown[]) => mockUseAdminAuditQuery(...args),
  useAdminReportsQuery: (...args: unknown[]) => mockUseAdminReportsQuery(...args),
  useAdminScheduledReportsQuery: (...args: unknown[]) => mockUseAdminScheduledReportsQuery(...args),
}));

// ── lib/api mocks ───────────────────────────────────────────────────────
const mockUpdateAdminUser = vi.fn();
const mockDeleteAdminUser = vi.fn();
const mockGetAdminSettings = vi.fn();
const mockUpdateAdminSettings = vi.fn();
const mockExportAdminPerformance = vi.fn();
const mockGenerateAdminReport = vi.fn();
const mockCreateAdminScheduledReport = vi.fn();
const mockDeleteAdminScheduledReport = vi.fn();

vi.mock('@/lib/api', () => ({
  getAdmins: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 25, hasMore: false }),
  updateAdminUser: (...args: unknown[]) => mockUpdateAdminUser(...args),
  deleteAdminUser: (...args: unknown[]) => mockDeleteAdminUser(...args),
  getAdminSettings: (...args: unknown[]) => mockGetAdminSettings(...args),
  updateAdminSettings: (...args: unknown[]) => mockUpdateAdminSettings(...args),
  exportAdminPerformance: (...args: unknown[]) => mockExportAdminPerformance(...args),
  generateAdminReport: (...args: unknown[]) => mockGenerateAdminReport(...args),
  createAdminScheduledReport: (...args: unknown[]) => mockCreateAdminScheduledReport(...args),
  deleteAdminScheduledReport: (...args: unknown[]) => mockDeleteAdminScheduledReport(...args),
}));

// ── lib/auth + lib/utils mocks ──────────────────────────────────────────
const mockUseAuth = vi.fn();
vi.mock('@/lib/auth', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

vi.mock('@/lib/utils', () => ({
  formatCurrency: (n: number) => `$${Number(n).toFixed(2)}`,
  formatDate: (d: string) => String(d),
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

// ── UI primitives mocks ─────────────────────────────────────────────────
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: ({ text }: { text?: string }) => <div data-testid="loading-spinner">{text}</div>,
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, onClick, ...rest }: { children: React.ReactNode; onClick?: () => void; [key: string]: unknown }) => (
    <button onClick={onClick} {...rest}>{children}</button>
  ),
}));

vi.mock('@/components/ui/Card', () => ({
  Card: ({ children, ...rest }: { children: React.ReactNode; [key: string]: unknown }) => <div data-testid="card" {...rest}>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/Badge', () => ({
  Badge: ({ children, ...rest }: { children: React.ReactNode; [key: string]: unknown }) => <span {...rest}>{children}</span>,
}));

vi.mock('@/components/ui/Select', () => ({
  Select: ({ label, options, value, onChange, ...rest }: { label?: string; options: { value: string; label: string }[]; value?: string; onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void; [key: string]: unknown }) => (
    <div>
      {label && <label>{label}</label>}
      <select value={value} onChange={onChange} {...rest}>
        {options.map((opt: { value: string; label: string }) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  ),
}));

vi.mock('@/components/ui/DataTable', () => ({
  DataTable: ({ data, columns, emptyMessage, onRowClick, pagination }: {
    data: unknown[];
    columns: { key: string; render?: (item: unknown) => React.ReactNode; header?: string }[];
    emptyMessage?: string;
    onRowClick?: (item: unknown) => void;
    pagination?: { page: number; total: number; pageSize: number; onChange?: (p: number) => void };
  }) => (
    <div data-testid="data-table">
      {data.length === 0 && emptyMessage && <p>{emptyMessage}</p>}
      {pagination && (
        <div data-testid="pagination">{pagination.page} / {pagination.total}</div>
      )}
      {data.map((row: Record<string, unknown>, i: number) => (
        <div key={String(row.id || row.email || i)} data-testid="data-row" onClick={onRowClick ? () => onRowClick(row) : undefined}>
          {columns.map((col) => (
            <span key={col.key}>{col.render ? col.render(row) : String(row[col.key] ?? '')}</span>
          ))}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('@/components/ui/ConfirmDialog', () => ({
  ConfirmDialog: ({ open, title, message, onConfirm, onCancel, confirmLabel }: {
    open: boolean; title: string; message?: string; onConfirm?: () => void; onCancel?: () => void; confirmLabel?: string;
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <h3>{title}</h3>
        {message && <p>{message}</p>}
        {onConfirm && <button data-testid="confirm-dialog-confirm" onClick={onConfirm}>{confirmLabel || 'Confirm'}</button>}
        {onCancel && <button data-testid="confirm-dialog-cancel" onClick={onCancel}>Cancel</button>}
      </div>
    ) : null,
}));

vi.mock('@/components/ui/FormModal', () => ({
  FormModal: ({ open, title, children, onClose, onSubmit, submitLabel }: {
    open: boolean; title: string; children: React.ReactNode; onClose?: () => void; onSubmit?: () => void; submitLabel?: string;
  }) =>
    open ? (
      <div data-testid="form-modal">
        <h3>{title}</h3>
        {children}
        {onClose && <button data-testid="form-modal-close" onClick={onClose}>Close</button>}
        {onSubmit && <button data-testid="form-modal-submit" onClick={onSubmit}>{submitLabel || 'Submit'}</button>}
      </div>
    ) : null,
}));

vi.mock('@/components/ui/StatCard', () => ({
  StatCard: ({ title, value }: { title: string; value: unknown }) => (
    <div data-testid="stat-card">
      <span>{title}</span>
      <span>{String(value)}</span>
    </div>
  ),
}));

vi.mock('@/components/ui/LineChart', () => ({
  LineChart: () => <div data-testid="line-chart" />,
}));

vi.mock('@/components/ui/StatusTag', () => ({
  StatusTag: ({ status }: { status: string }) => <span>{status}</span>,
}));

// ── Test helpers ────────────────────────────────────────────────────────
function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(ui, { wrapper: Wrapper });
}

const sampleUsers = [
  { id: 'u1', email: 'admin1@test.com', displayName: 'Admin One', role: 'admin', tenantId: 't1', tenantName: 'Camp Alpha', lastLogin: '2026-08-01T10:00:00Z', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'u2', email: 'viewer1@test.com', displayName: 'Viewer One', role: 'viewer', tenantId: 't2', tenantName: 'Camp Beta', lastLogin: null, createdAt: '2026-02-01T00:00:00Z' },
  { id: 'u3', email: 'super@test.com', displayName: 'Super Admin', role: 'super_admin', tenantId: null, tenantName: null, lastLogin: '2026-08-02T10:00:00Z', createdAt: '2026-01-02T00:00:00Z' },
];

const sampleHealth = {
  overall: 'ok',
  workers: { status: 'ok', uptime: 172800000, latencyMs: 12, requests: 100, errors: 1 },
  d1: { status: 'ok', latencyMs: 8, queries: 500, errors: 2 },
  kv: { status: 'ok', latencyMs: 3, operations: 1000, errors: 0 },
  r2: { status: 'ok' },
};

const sampleMetrics = {
  metrics: [
    { timestamp: '2026-08-01T10:00:00Z', workers: { latencyMs: 10, requests: 10, errors: 0 }, d1: { latencyMs: 5, queries: 100, errors: 0 }, kv: { operations: 50, errors: 0 } },
    { timestamp: '2026-08-01T10:05:00Z', workers: { latencyMs: 15, requests: 20, errors: 2 }, d1: { latencyMs: 9, queries: 150, errors: 1 }, kv: { operations: 60, errors: 1 } },
  ],
};

const sampleSettings = {
  featureFlags: { financials: true, hr: false, supply: true, crm: false, storefront: true, ai: false },
  emailTemplates: {
    welcomeEmail: { subject: 'Welcome', body: 'Hello {{name}}' },
    bookingConfirmation: { subject: 'Booking', body: 'Your booking is confirmed' },
  },
  defaults: { taxRate: 15, currency: 'USD', timezone: 'UTC', dateFormat: 'YYYY-MM-DD' },
  branding: { platformName: 'SinaiCamps', logoUrl: 'https://example.com/logo.png', faviconUrl: null as string | null, primaryColor: '#16a34a' },
};

const samplePerf = {
  tenants: [
    { id: 't1', name: 'Camp Alpha', metrics: { revenue: 50000, bookings: 120, occupancy: 80, employeeCount: 15, inventoryValue: 3000, leads: 40 }, trends: { revenue: 'up', bookings: 'flat' } },
    { id: 't2', name: 'Camp Beta', metrics: { revenue: 30000, bookings: 60, occupancy: 55, employeeCount: 8, inventoryValue: 1200, leads: 10 }, trends: { revenue: 'down', bookings: 'up' } },
  ],
  rankings: {
    revenue: [{ tenantId: 't1', name: 'Camp Alpha', revenue: 50000 }],
    occupancy: [{ tenantId: 't1', name: 'Camp Alpha', occupancy: 80 }],
    growth: [{ tenantId: 't2', name: 'Camp Beta', growthRate: 12 }],
  },
};

const sampleAudit = {
  data: [
    { id: '1', created_at: '2026-08-01T10:00:00Z', tenant_name: 'Camp Alpha', user_email: 'admin@test.com', action: 'create', entity_type: 'tenant', entity_id: 'tenant-abcd', oldValues: { name: 'Old' }, newValues: { name: 'New' } },
    { id: '2', created_at: '2026-08-02T10:00:00Z', tenant_id: 't2', user_id: 'user2', action: 'update', entity_type: 'project', entity_id: 'proj-1234', oldValues: 'not-json', newValues: 'also-not-json' },
  ],
  page: 1,
  total: 2,
  pageSize: 25,
};

const sampleReports = {
  reports: [
    { id: 'r1', name: 'Revenue Report', description: 'Revenue across tenants', category: 'financial', formats: ['csv', 'json'], parameters: [{ name: 'from' }] },
    { id: 'r2', name: 'Occupancy Report', description: 'Occupancy stats', category: 'operations', formats: ['csv'], parameters: [] },
  ],
};

const sampleScheduled = {
  scheduled: [
    { id: 's1', reportId: 'r1', schedule: 'daily', recipients: ['a@test.com', 'b@test.com'], lastRunAt: '2026-08-01T00:00:00Z' },
    { id: 's2', reportId: 'missing', schedule: 'weekly', recipients: [], lastRunAt: null },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { role: 'super_admin' } });
  mockUseAdminUsersQuery.mockReturnValue({ data: { data: [], total: 0 }, isLoading: false });
  mockUseAdminHealthQuery.mockReturnValue({ data: undefined, isLoading: false });
  mockUseAdminHealthMetricsQuery.mockReturnValue({ data: undefined, isLoading: false });
  mockUseAdminSettingsQuery.mockReturnValue({ data: undefined, isLoading: false });
  mockUseAdminPerformanceQuery.mockReturnValue({ data: undefined, isLoading: false });
  mockUseAdminAuditQuery.mockReturnValue({ data: undefined, isLoading: false });
  mockUseAdminReportsQuery.mockReturnValue({ data: undefined, isLoading: false });
  mockUseAdminScheduledReportsQuery.mockReturnValue({ data: undefined, isLoading: false, refetch: vi.fn() });

  mockUpdateAdminUser.mockResolvedValue({ success: true });
  mockDeleteAdminUser.mockResolvedValue({ success: true });
  mockGetAdminSettings.mockResolvedValue(sampleSettings);
  mockUpdateAdminSettings.mockResolvedValue({ success: true });
  mockGenerateAdminReport.mockResolvedValue({ downloadUrl: 'https://example.com/report.csv' });
  mockCreateAdminScheduledReport.mockResolvedValue({ success: true });
  mockDeleteAdminScheduledReport.mockResolvedValue({ success: true });

  // jsdom lacks object URL helpers
  Object.defineProperty(URL, 'createObjectURL', { writable: true, value: vi.fn(() => 'blob:mock') });
  Object.defineProperty(URL, 'revokeObjectURL', { writable: true, value: vi.fn() });
  // anchor click is a no-op in jsdom; silence navigation guard
  HTMLAnchorElement.prototype.click = vi.fn();
});

// ═══════════════════════════════════════════════════════════════════════
// UsersPanel
// ═══════════════════════════════════════════════════════════════════════
describe('UsersPanel', () => {
  it('renders Access Denied for non-super-admin', () => {
    mockUseAuth.mockReturnValue({ user: { role: 'admin' } });
    renderWithProviders(<UsersPanel />);
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.getByText('Super Admin access required.')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockUseAdminUsersQuery.mockReturnValue({ data: undefined, isLoading: true });
    renderWithProviders(<UsersPanel />);
    expect(screen.getByTestId('loading-spinner')).toHaveTextContent('Loading admin users...');
  });

  it('renders heading and empty table', () => {
    renderWithProviders(<UsersPanel />);
    expect(screen.getByText('Admin Users')).toBeInTheDocument();
    expect(screen.getByText('Manage admin accounts across all tenants')).toBeInTheDocument();
  });

  it('renders users in the table with role badges and count', async () => {
    mockUseAdminUsersQuery.mockReturnValue({ data: { data: sampleUsers, total: 3 }, isLoading: false });
    renderWithProviders(<UsersPanel />);
    expect(screen.getByText('3 of 3 users')).toBeInTheDocument();
    expect(screen.getByText('admin1@test.com')).toBeInTheDocument();
    expect(screen.getAllByText('admin').length).toBeGreaterThan(0);
    // super admin user shows Protected action
    expect(screen.getByText('Protected')).toBeInTheDocument();
  });

  it('handles array (non-paginated) response', () => {
    mockUseAdminUsersQuery.mockReturnValue({ data: sampleUsers, isLoading: false });
    renderWithProviders(<UsersPanel />);
    expect(screen.getByText('3 of 3 users')).toBeInTheDocument();
  });

  it('handles empty users data', () => {
    mockUseAdminUsersQuery.mockReturnValue({ data: null, isLoading: false });
    renderWithProviders(<UsersPanel />);
    expect(screen.getByText('0 of 0 users')).toBeInTheDocument();
  });

  it('filters by search term', async () => {
    mockUseAdminUsersQuery.mockReturnValue({ data: { data: sampleUsers, total: 3 }, isLoading: false });
    renderWithProviders(<UsersPanel />);
    fireEvent.change(screen.getByPlaceholderText('Search by email, name, or tenant...'), { target: { value: 'beta' } });
    await waitFor(() => {
      expect(screen.getByText('1 of 3 users')).toBeInTheDocument();
    });
    // viewer1 (tenant Camp Beta) remains, admin1/super filtered out
    expect(screen.getByText('viewer1@test.com')).toBeInTheDocument();
    expect(screen.queryByText('admin1@test.com')).not.toBeInTheDocument();
  });

  it('filters by role', async () => {
    mockUseAdminUsersQuery.mockReturnValue({ data: { data: sampleUsers, total: 3 }, isLoading: false });
    renderWithProviders(<UsersPanel />);
    fireEvent.change(screen.getByDisplayValue('All Roles'), { target: { value: 'viewer' } });
    await waitFor(() => {
      expect(screen.getByText('1 of 3 users')).toBeInTheDocument();
    });
    expect(screen.getByText('viewer1@test.com')).toBeInTheDocument();
  });

  it('clears filters', async () => {
    mockUseAdminUsersQuery.mockReturnValue({ data: { data: sampleUsers, total: 3 }, isLoading: false });
    renderWithProviders(<UsersPanel />);
    fireEvent.change(screen.getByPlaceholderText('Search by email, name, or tenant...'), { target: { value: 'beta' } });
    await waitFor(() => expect(screen.getByText('1 of 3 users')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Clear Filters'));
    await waitFor(() => expect(screen.getByText('3 of 3 users')).toBeInTheDocument());
  });

  it('opens edit role modal and saves', async () => {
    mockUseAdminUsersQuery.mockReturnValue({ data: { data: sampleUsers, total: 3 }, isLoading: false });
    mockUseAuth.mockReturnValue({ user: { role: 'super_admin' } });
    renderWithProviders(<UsersPanel />);
    fireEvent.click(screen.getAllByText('Edit Role')[0]);
    expect(screen.getByText('Save')).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue('Admin'), { target: { value: 'viewer' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockUpdateAdminUser).toHaveBeenCalledWith('u1', { role: 'viewer' });
    });
  });

  it('cancels edit role modal', async () => {
    mockUseAdminUsersQuery.mockReturnValue({ data: { data: sampleUsers, total: 3 }, isLoading: false });
    renderWithProviders(<UsersPanel />);
    fireEvent.click(screen.getAllByText('Edit Role')[0]);
    fireEvent.click(screen.getByText('Cancel'));
    expect(mockUpdateAdminUser).not.toHaveBeenCalled();
  });

  it('handles edit role error', async () => {
    mockUseAdminUsersQuery.mockReturnValue({ data: { data: sampleUsers, total: 3 }, isLoading: false });
    mockUpdateAdminUser.mockRejectedValue(new Error('boom'));
    renderWithProviders(<UsersPanel />);
    fireEvent.click(screen.getAllByText('Edit Role')[0]);
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockUpdateAdminUser).toHaveBeenCalled();
    });
  });

  it('deactivates a user through confirm dialog', async () => {
    mockUseAdminUsersQuery.mockReturnValue({ data: { data: sampleUsers, total: 3 }, isLoading: false });
    renderWithProviders(<UsersPanel />);
    fireEvent.click(screen.getAllByText('Deactivate')[0]);
    expect(screen.getByText('Deactivate User')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    await waitFor(() => {
      expect(mockDeleteAdminUser).toHaveBeenCalledWith('u1');
    });
  });

  it('cancels deactivate', async () => {
    mockUseAdminUsersQuery.mockReturnValue({ data: { data: sampleUsers, total: 3 }, isLoading: false });
    renderWithProviders(<UsersPanel />);
    fireEvent.click(screen.getAllByText('Deactivate')[0]);
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));
    expect(mockDeleteAdminUser).not.toHaveBeenCalled();
  });

  it('handles deactivate error', async () => {
    mockUseAdminUsersQuery.mockReturnValue({ data: { data: sampleUsers, total: 3 }, isLoading: false });
    mockDeleteAdminUser.mockRejectedValue(new Error('fail'));
    renderWithProviders(<UsersPanel />);
    fireEvent.click(screen.getAllByText('Deactivate')[0]);
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    await waitFor(() => expect(mockDeleteAdminUser).toHaveBeenCalled());
  });

  it('exports filtered users to CSV', async () => {
    mockUseAdminUsersQuery.mockReturnValue({ data: { data: sampleUsers, total: 3 }, isLoading: false });
    renderWithProviders(<UsersPanel />);
    fireEvent.click(screen.getByText('Export CSV'));
    await waitFor(() => {
      expect(URL.createObjectURL).toHaveBeenCalled();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SystemHealthPanel
// ═══════════════════════════════════════════════════════════════════════
describe('SystemHealthPanel', () => {
  it('shows loading state', () => {
    mockUseAdminHealthQuery.mockReturnValue({ data: undefined, isLoading: true });
    mockUseAdminHealthMetricsQuery.mockReturnValue({ data: undefined, isLoading: false });
    renderWithProviders(<SystemHealthPanel />);
    expect(screen.getByTestId('loading-spinner')).toHaveTextContent('Loading system health...');
  });

  it('renders overall status, service cards, totals and charts', () => {
    mockUseAdminHealthQuery.mockReturnValue({ data: sampleHealth, isLoading: false });
    mockUseAdminHealthMetricsQuery.mockReturnValue({ data: sampleMetrics, isLoading: false });
    renderWithProviders(<SystemHealthPanel />);
    expect(screen.getByText('System Health')).toBeInTheDocument();
    expect(screen.getByText(/Overall Status: Operational/)).toBeInTheDocument();
    expect(screen.getByText('Workers')).toBeInTheDocument();
    expect(screen.getByText('D1 Database')).toBeInTheDocument();
    expect(screen.getByText('KV Cache')).toBeInTheDocument();
    expect(screen.getByText('R2 Storage')).toBeInTheDocument();
    // totals aggregated from metrics
    expect(screen.getByText('Worker Requests (24h)')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument(); // workers requests total (10+20)
    expect(screen.getByText('2')).toBeInTheDocument(); // workers errors
    // charts
    expect(screen.getAllByTestId('line-chart').length).toBeGreaterThanOrEqual(2);
  });

  it('renders degraded/down statuses via label map', () => {
    const bad = {
      overall: 'degraded',
      workers: { status: 'down' },
      d1: { status: 'degraded' },
      kv: { status: 'ok' },
      r2: { status: 'skipped' },
    };
    mockUseAdminHealthQuery.mockReturnValue({ data: bad, isLoading: false });
    mockUseAdminHealthMetricsQuery.mockReturnValue({ data: { metrics: [] }, isLoading: false });
    renderWithProviders(<SystemHealthPanel />);
    expect(screen.getByText(/Overall Status: Degraded/)).toBeInTheDocument();
    expect(screen.getByText('Down')).toBeInTheDocument();
    expect(screen.getByText('N/A')).toBeInTheDocument();
  });

  it('renders with no health data (unknown fallback)', () => {
    mockUseAdminHealthQuery.mockReturnValue({ data: undefined, isLoading: false });
    mockUseAdminHealthMetricsQuery.mockReturnValue({ data: undefined, isLoading: false });
    renderWithProviders(<SystemHealthPanel />);
    expect(screen.getByTestId('system-health-panel')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SystemSettingsPanel
// ═══════════════════════════════════════════════════════════════════════
describe('SystemSettingsPanel', () => {
  it('shows loading state', () => {
    mockUseAdminSettingsQuery.mockReturnValue({ data: undefined, isLoading: true });
    renderWithProviders(<SystemSettingsPanel />);
    expect(screen.getByTestId('loading-spinner')).toHaveTextContent('Loading settings...');
  });

  it('renders feature flags tab with toggles and saves', async () => {
    mockUseAdminSettingsQuery.mockReturnValue({ data: sampleSettings, isLoading: false });
    renderWithProviders(<SystemSettingsPanel />);
    expect(screen.getByText('System Settings')).toBeInTheDocument();
    // flags rendered from FEATURE_FLAGS list (await effect that populates state)
    expect(await screen.findByText('Financial Management')).toBeInTheDocument();
    expect(screen.getByText('HR & Payroll')).toBeInTheDocument();
    // enabled/disabled badges present via component text
    expect((await screen.findAllByText('Enabled')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Disabled').length).toBeGreaterThan(0);

    // toggle a flag
    const toggle = screen.getByTestId('flag-toggle-hr');
    fireEvent.click(toggle);

    fireEvent.click(screen.getByText('Save Changes'));
    await waitFor(() => {
      expect(mockUpdateAdminSettings).toHaveBeenCalled();
      const payload = mockUpdateAdminSettings.mock.calls[0][0];
      expect(payload.featureFlags).toBeDefined();
      expect(payload.featureFlags.hr).toBe(true);
    });
  });

  it('switches to email templates tab and edits a template', async () => {
    mockUseAdminSettingsQuery.mockReturnValue({ data: sampleSettings, isLoading: false });
    renderWithProviders(<SystemSettingsPanel />);
    fireEvent.click(screen.getByText('Email Templates'));
    expect(await screen.findByText('welcome Email')).toBeInTheDocument();
    expect(screen.getByText('booking Confirmation')).toBeInTheDocument();
    expect(screen.getByText(/Subject: Welcome/)).toBeInTheDocument();

    fireEvent.click(screen.getAllByText('Edit')[0]);
    expect(screen.getByTestId('form-modal')).toBeInTheDocument();
    // change the subject input (initialized from the welcome template draft)
    const subject = screen.getByDisplayValue('Welcome');
    fireEvent.change(subject, { target: { value: 'New Welcome' } });
    fireEvent.click(screen.getByTestId('form-modal-submit'));
    await waitFor(() => {
      expect(screen.queryByTestId('form-modal')).not.toBeInTheDocument();
    });

    // save the emails tab
    fireEvent.click(screen.getByText('Save Changes'));
    await waitFor(() => {
      const payload = mockUpdateAdminSettings.mock.calls[0][0];
      expect(payload.emailTemplates).toBeDefined();
      expect(payload.emailTemplates.welcomeEmail.subject).toBe('New Welcome');
    });
  });

  it('closes email modal via close button', async () => {
    mockUseAdminSettingsQuery.mockReturnValue({ data: sampleSettings, isLoading: false });
    renderWithProviders(<SystemSettingsPanel />);
    fireEvent.click(screen.getByText('Email Templates'));
    fireEvent.click((await screen.findAllByText('Edit'))[0]);
    fireEvent.click(screen.getByTestId('form-modal-close'));
    expect(screen.queryByTestId('form-modal')).not.toBeInTheDocument();
  });

  it('renders defaults tab and edits tax rate', async () => {
    renderWithProviders(<SystemSettingsPanel />);
    fireEvent.click(screen.getByText('Defaults'));
    expect(screen.getByText('Platform Defaults')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('setting-tax-rate'), { target: { value: '20' } });
    fireEvent.click(screen.getByText('Save Changes'));
    await waitFor(() => {
      const payload = mockUpdateAdminSettings.mock.calls[0][0];
      expect(payload.defaults.taxRate).toBe(20);
    });
  });

  it('renders branding tab and edits platform name', async () => {
    renderWithProviders(<SystemSettingsPanel />);
    fireEvent.click(screen.getByText('Branding'));
    expect(screen.getByText('Platform Branding')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('setting-platform-name'), { target: { value: 'MyCamp' } });
    fireEvent.click(screen.getByText('Save Changes'));
    await waitFor(() => {
      const payload = mockUpdateAdminSettings.mock.calls[0][0];
      expect(payload.branding.platformName).toBe('MyCamp');
    });
  });

  it('handles save error', async () => {
    mockUpdateAdminSettings.mockRejectedValue(new Error('nope'));
    renderWithProviders(<SystemSettingsPanel />);
    fireEvent.click(screen.getByText('Save Changes'));
    await waitFor(() => {
      expect(mockUpdateAdminSettings).toHaveBeenCalled();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TenantPerformancePanel
// ═══════════════════════════════════════════════════════════════════════
describe('TenantPerformancePanel', () => {
  it('shows loading state', () => {
    mockUseAdminPerformanceQuery.mockReturnValue({ data: undefined, isLoading: true });
    renderWithProviders(<TenantPerformancePanel />);
    expect(screen.getByTestId('loading-spinner')).toHaveTextContent('Loading performance data...');
  });

  it('renders stats, rankings and tenant table', () => {
    mockUseAdminPerformanceQuery.mockReturnValue({ data: samplePerf, isLoading: false });
    renderWithProviders(<TenantPerformancePanel />);
    expect(screen.getByText('Tenant Performance')).toBeInTheDocument();
    // stats
    expect(screen.getByText('Total Tenants')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Total Revenue')).toBeInTheDocument();
    expect(screen.getByText('$80000.00')).toBeInTheDocument();
    expect(screen.getByText('Avg Occupancy')).toBeInTheDocument();
    expect(screen.getByText('68%')).toBeInTheDocument();
    // rankings
    expect(screen.getByText('Top by Revenue')).toBeInTheDocument();
    expect(screen.getAllByText('Camp Alpha').length).toBeGreaterThan(0);
    // table row
    expect(screen.getByText('$30000.00')).toBeInTheDocument();
    // trend badges
    expect(screen.getByText(/down/)).toBeInTheDocument();
  });

  it('renders empty state when no tenants', () => {
    mockUseAdminPerformanceQuery.mockReturnValue({ data: { tenants: [], rankings: { revenue: [], occupancy: [], growth: [] } }, isLoading: false });
    renderWithProviders(<TenantPerformancePanel />);
    expect(screen.getAllByText('No data').length).toBe(3);
    expect(screen.getByText('No tenant data available')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument(); // avg occupancy for empty
  });

  it('exports performance CSV on success', async () => {
    mockExportAdminPerformance.mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob()) });
    mockUseAdminPerformanceQuery.mockReturnValue({ data: samplePerf, isLoading: false });
    renderWithProviders(<TenantPerformancePanel />);
    fireEvent.click(screen.getByText('Export CSV'));
    await waitFor(() => {
      expect(mockExportAdminPerformance).toHaveBeenCalled();
      expect(URL.createObjectURL).toHaveBeenCalled();
    });
  });

  it('handles export failure', async () => {
    mockExportAdminPerformance.mockResolvedValue({ ok: false });
    mockUseAdminPerformanceQuery.mockReturnValue({ data: samplePerf, isLoading: false });
    renderWithProviders(<TenantPerformancePanel />);
    fireEvent.click(screen.getByText('Export CSV'));
    await waitFor(() => {
      expect(mockExportAdminPerformance).toHaveBeenCalled();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// AuditLogPanel
// ═══════════════════════════════════════════════════════════════════════
describe('AuditLogPanel', () => {
  it('shows loading state', () => {
    mockUseAdminAuditQuery.mockReturnValue({ data: undefined, isLoading: true });
    renderWithProviders(<AuditLogPanel />);
    expect(screen.getByTestId('loading-spinner')).toHaveTextContent('Loading audit logs...');
  });

  it('renders audit table with columns and pagination', () => {
    mockUseAdminAuditQuery.mockReturnValue({ data: sampleAudit, isLoading: false });
    renderWithProviders(<AuditLogPanel />);
    expect(screen.getByText('Audit Log')).toBeInTheDocument();
    expect(screen.getByText('Camp Alpha')).toBeInTheDocument();
    expect(screen.getByText('create')).toBeInTheDocument();
    expect(screen.getByText('project')).toBeInTheDocument();
    expect(screen.getByTestId('pagination')).toBeInTheDocument();
  });

  it('shows empty message when no audit data', () => {
    mockUseAdminAuditQuery.mockReturnValue({ data: undefined, isLoading: false });
    renderWithProviders(<AuditLogPanel />);
    expect(screen.getByText('No audit logs found')).toBeInTheDocument();
  });

  it('applies filters and shows clear filters', () => {
    mockUseAdminAuditQuery.mockReturnValue({ data: sampleAudit, isLoading: false });
    renderWithProviders(<AuditLogPanel />);
    const actionSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(actionSelect, { target: { value: 'create' } });
    expect(mockUseAdminAuditQuery).toHaveBeenCalledWith(expect.objectContaining({ action: 'create', page: '1' }));
    fireEvent.click(screen.getByText('Clear Filters'));
  });

  it('filters by entity type and dates', () => {
    mockUseAdminAuditQuery.mockReturnValue({ data: sampleAudit, isLoading: false });
    renderWithProviders(<AuditLogPanel />);
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'tenant' } });
    const dateInputs = document.querySelectorAll<HTMLInputElement>('input[type="date"]');
    fireEvent.change(dateInputs[0], { target: { value: '2026-08-01' } });
    fireEvent.change(dateInputs[1], { target: { value: '2026-08-05' } });
    expect(mockUseAdminAuditQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ entityType: 'tenant', startDate: '2026-08-01', endDate: '2026-08-05' }),
    );
  });

  it('expands a row to show JsonDiff', () => {
    mockUseAdminAuditQuery.mockReturnValue({ data: sampleAudit, isLoading: false });
    renderWithProviders(<AuditLogPanel />);
    const rows = screen.getAllByTestId('data-row');
    fireEvent.click(rows[0]);
    expect(screen.getByText('Audit Entry Details')).toBeInTheDocument();
    // changed key values rendered (name: Old / New)
    expect(screen.getByText('"Old"')).toBeInTheDocument();
    expect(screen.getByText('"New"')).toBeInTheDocument();
  });

  it('expands a row with non-JSON values showing no changes', () => {
    mockUseAdminAuditQuery.mockReturnValue({ data: sampleAudit, isLoading: false });
    renderWithProviders(<AuditLogPanel />);
    const rows = screen.getAllByTestId('data-row');
    fireEvent.click(rows[1]);
    expect(screen.getByText('No changes recorded')).toBeInTheDocument();
  });

  it('collapses a row on second click', () => {
    mockUseAdminAuditQuery.mockReturnValue({ data: sampleAudit, isLoading: false });
    renderWithProviders(<AuditLogPanel />);
    const rows = screen.getAllByTestId('data-row');
    fireEvent.click(rows[0]);
    expect(screen.getByText('Audit Entry Details')).toBeInTheDocument();
    fireEvent.click(rows[0]);
    expect(screen.queryByText('Audit Entry Details')).not.toBeInTheDocument();
  });

  it('exports audit log on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob()) });
    vi.stubGlobal('fetch', fetchMock);
    mockUseAdminAuditQuery.mockReturnValue({ data: sampleAudit, isLoading: false });
    localStorage.setItem('admin_access_token', 'tok123');
    renderWithProviders(<AuditLogPanel />);
    fireEvent.click(screen.getByTestId('audit-export-btn'));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/audit/export'),
        expect.objectContaining({ headers: { Authorization: 'Bearer tok123' } }),
      );
    });
    vi.unstubAllGlobals();
  });

  it('exports audit log without token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob()) });
    vi.stubGlobal('fetch', fetchMock);
    mockUseAdminAuditQuery.mockReturnValue({ data: sampleAudit, isLoading: false });
    localStorage.removeItem('admin_access_token');
    renderWithProviders(<AuditLogPanel />);
    fireEvent.click(screen.getByTestId('audit-export-btn'));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    vi.unstubAllGlobals();
  });

  it('handles audit export failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchMock);
    mockUseAdminAuditQuery.mockReturnValue({ data: sampleAudit, isLoading: false });
    renderWithProviders(<AuditLogPanel />);
    fireEvent.click(screen.getByTestId('audit-export-btn'));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    vi.unstubAllGlobals();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SuperReportsPanel
// ═══════════════════════════════════════════════════════════════════════
describe('SuperReportsPanel', () => {
  it('shows loading state', () => {
    mockUseAdminReportsQuery.mockReturnValue({ data: undefined, isLoading: true });
    mockUseAdminScheduledReportsQuery.mockReturnValue({ data: undefined, isLoading: false, refetch: vi.fn() });
    renderWithProviders(<SuperReportsPanel />);
    expect(screen.getByTestId('loading-spinner')).toHaveTextContent('Loading reports...');
  });

  it('renders templates grouped by category and stat cards', () => {
    mockUseAdminReportsQuery.mockReturnValue({ data: sampleReports, isLoading: false });
    mockUseAdminScheduledReportsQuery.mockReturnValue({ data: sampleScheduled, isLoading: false, refetch: vi.fn() });
    renderWithProviders(<SuperReportsPanel />);
    expect(screen.getByText('Reports')).toBeInTheDocument();
    expect(screen.getByText('financial Reports')).toBeInTheDocument();
    expect(screen.getByText('operations Reports')).toBeInTheDocument();
    expect(screen.getAllByText('Revenue Report').length).toBeGreaterThan(0);
    expect(screen.getByText(/Parameters: from/)).toBeInTheDocument();
    // scheduled table
    expect(screen.getAllByText('Scheduled Reports').length).toBeGreaterThan(0);
    expect(screen.getByText('a@test.com, b@test.com')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument(); // empty recipients for s2
  });

  it('renders empty scheduled reports', () => {
    mockUseAdminReportsQuery.mockReturnValue({ data: sampleReports, isLoading: false });
    mockUseAdminScheduledReportsQuery.mockReturnValue({ data: { scheduled: [] }, isLoading: false, refetch: vi.fn() });
    renderWithProviders(<SuperReportsPanel />);
    expect(screen.getByText('No scheduled reports yet')).toBeInTheDocument();
  });

  it('generates a report and opens the download URL', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    mockUseAdminReportsQuery.mockReturnValue({ data: sampleReports, isLoading: false });
    mockUseAdminScheduledReportsQuery.mockReturnValue({ data: sampleScheduled, isLoading: false, refetch: vi.fn() });
    renderWithProviders(<SuperReportsPanel />);
    fireEvent.click(screen.getAllByText('Generate')[0]);
    await waitFor(() => {
      expect(mockGenerateAdminReport).toHaveBeenCalledWith({ reportId: 'r1' });
    });
    expect(openSpy).toHaveBeenCalledWith('https://example.com/report.csv', '_blank');
    openSpy.mockRestore();
  });

  it('handles generate error', async () => {
    mockGenerateAdminReport.mockRejectedValue(new Error('gen fail'));
    mockUseAdminReportsQuery.mockReturnValue({ data: sampleReports, isLoading: false });
    mockUseAdminScheduledReportsQuery.mockReturnValue({ data: sampleScheduled, isLoading: false, refetch: vi.fn() });
    renderWithProviders(<SuperReportsPanel />);
    fireEvent.click(screen.getAllByText('Generate')[0]);
    await waitFor(() => {
      expect(mockGenerateAdminReport).toHaveBeenCalled();
    });
  });

  it('schedules a report with recipients', async () => {
    const refetch = vi.fn();
    mockUseAdminReportsQuery.mockReturnValue({ data: sampleReports, isLoading: false });
    mockUseAdminScheduledReportsQuery.mockReturnValue({ data: sampleScheduled, isLoading: false, refetch });
    renderWithProviders(<SuperReportsPanel />);
    fireEvent.click(screen.getAllByText('Schedule')[0]);
    expect(screen.getByText('Schedule Report')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('admin@example.com'), { target: { value: 'x@test.com, y@test.com ' } });
    fireEvent.click(screen.getByText('Confirm Schedule'));
    await waitFor(() => {
      expect(mockCreateAdminScheduledReport).toHaveBeenCalledWith({
        reportId: 'r1',
        schedule: 'daily',
        recipients: ['x@test.com', 'y@test.com'],
      });
      expect(refetch).toHaveBeenCalled();
    });
    expect(screen.queryByText('Schedule Report')).not.toBeInTheDocument();
  });

  it('schedules a report without recipients', async () => {
    mockUseAdminReportsQuery.mockReturnValue({ data: sampleReports, isLoading: false });
    mockUseAdminScheduledReportsQuery.mockReturnValue({ data: sampleScheduled, isLoading: false, refetch: vi.fn() });
    renderWithProviders(<SuperReportsPanel />);
    fireEvent.click(screen.getAllByText('Schedule')[0]);
    fireEvent.click(screen.getByText('Confirm Schedule'));
    await waitFor(() => {
      expect(mockCreateAdminScheduledReport).toHaveBeenCalledWith({
        reportId: 'r1',
        schedule: 'daily',
        recipients: [],
      });
    });
  });

  it('handles schedule error', async () => {
    mockCreateAdminScheduledReport.mockRejectedValue(new Error('sched fail'));
    mockUseAdminReportsQuery.mockReturnValue({ data: sampleReports, isLoading: false });
    mockUseAdminScheduledReportsQuery.mockReturnValue({ data: sampleScheduled, isLoading: false, refetch: vi.fn() });
    renderWithProviders(<SuperReportsPanel />);
    fireEvent.click(screen.getAllByText('Schedule')[0]);
    fireEvent.click(screen.getByText('Confirm Schedule'));
    await waitFor(() => {
      expect(mockCreateAdminScheduledReport).toHaveBeenCalled();
    });
  });

  it('cancels schedule form', () => {
    mockUseAdminReportsQuery.mockReturnValue({ data: sampleReports, isLoading: false });
    mockUseAdminScheduledReportsQuery.mockReturnValue({ data: sampleScheduled, isLoading: false, refetch: vi.fn() });
    renderWithProviders(<SuperReportsPanel />);
    fireEvent.click(screen.getAllByText('Schedule')[0]);
    expect(screen.getByText('Schedule Report')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Schedule Report')).not.toBeInTheDocument();
  });

  it('deletes a scheduled report', async () => {
    const refetch = vi.fn();
    mockUseAdminReportsQuery.mockReturnValue({ data: sampleReports, isLoading: false });
    mockUseAdminScheduledReportsQuery.mockReturnValue({ data: sampleScheduled, isLoading: false, refetch });
    renderWithProviders(<SuperReportsPanel />);
    fireEvent.click(screen.getAllByText('Remove')[0]);
    await waitFor(() => {
      expect(mockDeleteAdminScheduledReport).toHaveBeenCalledWith('s1');
      expect(refetch).toHaveBeenCalled();
    });
  });

  it('handles delete schedule error', async () => {
    mockDeleteAdminScheduledReport.mockRejectedValue(new Error('del fail'));
    mockUseAdminReportsQuery.mockReturnValue({ data: sampleReports, isLoading: false });
    mockUseAdminScheduledReportsQuery.mockReturnValue({ data: sampleScheduled, isLoading: false, refetch: vi.fn() });
    renderWithProviders(<SuperReportsPanel />);
    fireEvent.click(screen.getAllByText('Remove')[0]);
    await waitFor(() => {
      expect(mockDeleteAdminScheduledReport).toHaveBeenCalled();
    });
  });
});
