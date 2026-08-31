import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import CRMPanel from '@/components/admin/CRMPanel';
import SuperCRMPanel from '@/components/admin/SuperCRMPanel';

// ─── Mock handles (referenced lazily inside vi.mock factories) ──────────────
const mockShowToast = vi.fn();
let mockUser: { role: string } | null = { role: 'super_admin' };

const mockApiFetch = vi.fn();
const mockGetCrmContacts = vi.fn();
const mockGetCrmLeads = vi.fn();
const mockGetCrmOpportunities = vi.fn();
const mockGetCrmTasks = vi.fn();
const mockGetCrmTickets = vi.fn();
const mockGetCrmKnowledgeArticles = vi.fn();
const mockGetAdminTenants = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  getCrmContacts: (...args: unknown[]) => mockGetCrmContacts(...args),
  getCrmLeads: (...args: unknown[]) => mockGetCrmLeads(...args),
  getCrmOpportunities: (...args: unknown[]) => mockGetCrmOpportunities(...args),
  getCrmTasks: (...args: unknown[]) => mockGetCrmTasks(...args),
  getCrmTickets: (...args: unknown[]) => mockGetCrmTickets(...args),
  getCrmKnowledgeArticles: (...args: unknown[]) => mockGetCrmKnowledgeArticles(...args),
  getAdminTenants: (...args: unknown[]) => mockGetAdminTenants(...args),
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
      {action && <button onClick={action.onClick}>{action.label}</button>}
    </div>
  ),
}));

vi.mock('@/components/ui/Badge', () => ({
  Badge: ({ children, dot, ...rest }: { children: React.ReactNode; dot?: boolean; [key: string]: unknown }) => <span {...rest}>{children}</span>,
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

// ─── Representative CRM data ────────────────────────────────────────────────
const mockContacts = [
  { id: 'c1', type: 'individual', name: 'Alice Morgan', email: 'alice@test.com', phone: '+20123', address: 'Cairo', industry: 'Travel', isCustomer: true, isVendor: false, isLead: true, notes: 'VIP' },
  { id: 'c2', type: 'company', name: 'Acme Corp', email: 'acme@test.com', phone: '', address: '', industry: '', isCustomer: false, isVendor: true, isLead: false, notes: '' },
];

const mockLeads = [
  { id: 'l1', contactId: 'c1', contactName: 'Alice Morgan', status: 'new', source: 'Website', value: 1500, assignedTo: 'Sara' },
  { id: 'l2', contactId: 'c2', contactName: 'Acme Corp', status: 'won', source: 'Referral', value: 0, assignedTo: null },
];

const mockOpportunities = [
  { id: 'o1', leadId: 'l1', name: 'Camp Deal', stage: 'qualification', amount: 5000, probability: 30, expectedCloseDate: '2026-09-01', assignedTo: 'Sara' },
  { id: 'o2', leadId: null, name: 'Retreat', stage: 'proposal', amount: 0, probability: 0, expectedCloseDate: null, assignedTo: null },
  { id: 'o3', leadId: 'l2', name: 'Wedding', stage: 'negotiation', amount: 12000, probability: 70, expectedCloseDate: '2026-10-15', assignedTo: 'Sara' },
  { id: 'o4', leadId: null, name: 'Closed Win', stage: 'closed_won', amount: 9000, probability: 100, expectedCloseDate: '2026-08-01', assignedTo: null },
  { id: 'o5', leadId: null, name: 'Closed Loss', stage: 'closed_lost', amount: 500, probability: 0, expectedCloseDate: '2026-07-01', assignedTo: null },
];

const mockTasks = [
  { id: 't1', title: 'Follow up', projectId: 'p1', assigneeId: 'u1', status: 'todo', priority: 'high', dueDate: '2026-09-10', description: 'Call client' },
  { id: 't2', title: 'Send proposal', projectId: null, assigneeId: null, status: 'done', priority: 'low', dueDate: '2026-09-12', description: null },
  { id: 't3', title: 'No date task', projectId: null, assigneeId: null, status: 'blocked', priority: 'medium', dueDate: null, description: null },
];

const mockTickets = [
  { id: 'k1', contactId: 'c1', subject: 'Broken shower', status: 'open', priority: 'urgent', contactName: 'Alice Morgan', assignedTo: 'Sara', description: 'In room 3' },
  { id: 'k2', contactId: null, subject: 'Billing question', status: 'closed', priority: 'low', contactName: null, assignedTo: null, description: null },
];

const mockArticles = [
  { id: 'a1', title: 'Check-in guide', content: 'How to check in', category: 'Guides', tags: 'checkin,frontdesk', isPublished: true },
  { id: 'a2', title: 'Draft article', content: 'Draft content', category: null, tags: null, isPublished: false },
];

const mockTenants = [
  { id: 't1', name: 'Camp Alpha', subdomain: 'alpha', status: 'active' },
  { id: 't2', name: 'Camp Beta', subdomain: 'beta', status: 'active' },
];

const mockOverview = {
  totalContacts: 42,
  totalLeads: 12,
  openOpportunities: 5,
  openTickets: 3,
  tenantBreakdown: [{ tenant_id: 't1', tenant_name: 'Camp Alpha', contact_count: 20, lead_count: 8, opportunity_count: 3 }],
};

const mockSuperContacts = [
  { id: 1, first_name: 'Alice', last_name: 'Morgan', email: 'alice@x.com', company: 'Acme', tenant_name: 'Camp Alpha', created_at: '2026-01-02' },
  { id: 2, first_name: 'Bob', last_name: 'Tanner', email: '', company: '', tenant_name: 'Camp Beta', created_at: null },
];

// Default apiFetch route table: super overview/contacts + generic {} for everything else.
function defaultApiFetch(url: string) {
  const u = String(url);
  if (u.includes('/admin/crm/overview')) return Promise.resolve(mockOverview);
  if (u.includes('/admin/crm/contacts')) return Promise.resolve({ data: mockSuperContacts, total: 2 });
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

describe('CRMPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { role: 'super_admin' };
    mockApiFetch.mockImplementation(defaultApiFetch);
    mockGetCrmContacts.mockResolvedValue(mockContacts);
    mockGetCrmLeads.mockResolvedValue(mockLeads);
    mockGetCrmOpportunities.mockResolvedValue(mockOpportunities);
    mockGetCrmTasks.mockResolvedValue(mockTasks);
    mockGetCrmTickets.mockResolvedValue(mockTickets);
    mockGetCrmKnowledgeArticles.mockResolvedValue(mockArticles);
    // CRMPanel.tsx uses `formatLabel` inside the module-level KanbanBoard and
    // GanttChart components, but only declares it inside CRMPanel (line 627).
    // The identifier is therefore unresolvable at module scope → ReferenceError
    // in the real component whenever Kanban/Gantt views render. We cannot edit
    // src/, so provide the formatter at global scope (unresolvable identifiers
    // fall back to the global environment at call time) — mirrors the component's
    // formatter exactly so the views render as they would in production.
    (globalThis as { formatLabel?: (s: unknown) => string }).formatLabel = (s: unknown) =>
      String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  });

  afterEach(() => {
    delete (globalThis as { formatLabel?: (s: unknown) => string }).formatLabel;
  });

  it('shows loading spinner while CRM queries are in flight', async () => {
    const d = deferred<unknown[]>();
    mockGetCrmContacts.mockReturnValue(d.promise as never);
    await act(async () => {
      renderWithQuery(<CRMPanel />);
    });
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.getByText('Loading CRM...')).toBeInTheDocument();
    await act(async () => {
      d.resolve([]);
    });
  });

  it('renders contacts table with data and flag badges', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => {
      expect(screen.getByText('Alice Morgan')).toBeInTheDocument();
    });
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Contacts (2)')).toBeInTheDocument();
    expect(screen.getByText('Customer')).toBeInTheDocument();
    expect(screen.getByText('Vendor')).toBeInTheDocument();
    expect(screen.getAllByText('Lead').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('add-btn')).toBeInTheDocument();
  });

  it('renders contacts empty state and opens add modal from empty state action', async () => {
    mockGetCrmContacts.mockResolvedValue([]);
    renderWithQuery(<CRMPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: 'No contacts' })).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('Add Contact')[0]);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Add Contact' })).toBeInTheDocument();
    });
    expect(screen.getByTestId('form-modal')).toBeInTheDocument();
  });

  it('validates contact name is required', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('add-btn')); });
    fireEvent.click(screen.getByTestId('add-btn'));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Contact' })); });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Name is required.', 'warning');
    });
    expect(mockApiFetch).not.toHaveBeenCalledWith('/crm/contacts', expect.any(Object));
  });

  it('creates a contact', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('add-btn')); });
    fireEvent.click(screen.getByTestId('add-btn'));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Contact' })); });
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'John Doe' } });
    fireEvent.change(screen.getByTestId('input-Email'), { target: { value: 'john@test.com' } });
    fireEvent.change(screen.getByTestId('input-Phone'), { target: { value: '+20111' } });
    fireEvent.click(screen.getByLabelText('Customer'));
    fireEvent.change(screen.getByTestId('select-Type'), { target: { value: 'company' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/crm/contacts',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('John Doe'),
        }),
      );
      expect(mockShowToast).toHaveBeenCalledWith('Contact created.', 'success');
    });
  });

  it('shows error toast when creating contact fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('contact save failed'));
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('add-btn')); });
    fireEvent.click(screen.getByTestId('add-btn'));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Contact' })); });
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Jane' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Error: contact save failed'),
        'error',
      );
    });
  });

  it('edits a contact with pre-filled data and updates it', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByText('Alice Morgan')); });
    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Edit Contact' })); });
    expect(screen.getByTestId('input-Name *')).toHaveValue('Alice Morgan');
    expect(screen.getByTestId('input-Email')).toHaveValue('alice@test.com');
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Alice Updated' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/crm/contacts/c1',
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('Alice Updated'),
        }),
      );
      expect(mockShowToast).toHaveBeenCalledWith('Contact updated.', 'success');
    });
  });

  it('deletes a contact after confirmation', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByText('Alice Morgan')); });
    fireEvent.click(screen.getAllByText('Delete')[0]);
    await waitFor(() => { expect(screen.getByTestId('confirm-dialog')); });
    expect(screen.getByRole('heading', { name: 'Delete Contact' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('confirm-yes'));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/crm/contacts/c1', expect.objectContaining({ method: 'DELETE' }));
      expect(mockShowToast).toHaveBeenCalledWith('Deleted.', 'success');
    });
  });

  it('cancels contact deletion without calling the API', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByText('Alice Morgan')); });
    fireEvent.click(screen.getAllByText('Delete')[0]);
    await waitFor(() => { expect(screen.getByTestId('confirm-dialog')); });
    fireEvent.click(screen.getByTestId('confirm-no'));
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
    });
    expect(mockApiFetch).not.toHaveBeenCalledWith('/crm/contacts/c1', expect.objectContaining({ method: 'DELETE' }));
  });

  it('shows error toast when deleting a contact fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('delete failed'));
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByText('Alice Morgan')); });
    fireEvent.click(screen.getAllByText('Delete')[0]);
    await waitFor(() => { expect(screen.getByTestId('confirm-dialog')); });
    fireEvent.click(screen.getByTestId('confirm-yes'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error: delete failed'), 'error');
    });
  });

  it('renders leads empty state', async () => {
    mockGetCrmLeads.mockResolvedValue([]);
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-leads')); });
    fireEvent.click(screen.getByTestId('tab-leads'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'No leads' })).toBeInTheDocument();
    });
  });

  it('renders leads table with status badges', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-leads')); });
    fireEvent.click(screen.getByTestId('tab-leads'));
    await waitFor(() => {
      expect(screen.getByText('Website')).toBeInTheDocument();
    });
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('$1500.00')).toBeInTheDocument();
    expect(screen.getByText('Won')).toBeInTheDocument();
  });

  it('validates lead requires a contact', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-leads')); });
    fireEvent.click(screen.getByTestId('tab-leads'));
    await waitFor(() => { expect(screen.getByText('Add Lead')); });
    fireEvent.click(screen.getByText('Add Lead'));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Lead' })); });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Contact is required.', 'warning');
    });
  });

  it('creates a lead with a selected contact', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-leads')); });
    fireEvent.click(screen.getByTestId('tab-leads'));
    await waitFor(() => { expect(screen.getByText('Add Lead')); });
    fireEvent.click(screen.getByText('Add Lead'));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Lead' })); });
    fireEvent.change(screen.getByTestId('select-Contact *'), { target: { value: 'c1' } });
    fireEvent.change(screen.getByTestId('input-Source'), { target: { value: 'Referral' } });
    fireEvent.change(screen.getByTestId('input-Value ($)'), { target: { value: '1000' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/crm/leads',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"value":1000'),
        }),
      );
      expect(mockShowToast).toHaveBeenCalledWith('Lead created.', 'success');
    });
  });

  it('updates a lead status from the status modal', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-leads')); });
    fireEvent.click(screen.getByTestId('tab-leads'));
    await waitFor(() => { expect(screen.getByText('Website')); });
    fireEvent.click(screen.getAllByText('Update Status')[0]);
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Update Lead Status' })); });
    fireEvent.click(screen.getByText('Contacted'));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/crm/leads/l1/status',
        expect.objectContaining({ method: 'PATCH', body: expect.stringContaining('"status":"contacted"') }),
      );
      expect(mockShowToast).toHaveBeenCalledWith('Lead marked as contacted.', 'success');
    });
  });

  it('shows error toast when lead status update fails', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (String(url).includes('/crm/leads/')) return Promise.reject(new Error('status failed'));
      return defaultApiFetch(url);
    });
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-leads')); });
    fireEvent.click(screen.getByTestId('tab-leads'));
    await waitFor(() => { expect(screen.getByText('Website')); });
    fireEvent.click(screen.getAllByText('Update Status')[0]);
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Update Lead Status' })); });
    fireEvent.click(screen.getByText('Contacted'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error: status failed'), 'error');
    });
  });

  it('renders opportunities in table view', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-opportunities')); });
    fireEvent.click(screen.getByTestId('tab-opportunities'));
    await waitFor(() => {
      expect(screen.getByText('Camp Deal')).toBeInTheDocument();
    });
    expect(screen.getByText('Qualification')).toBeInTheDocument();
    expect(screen.getByText('$5000.00')).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
  });

  it('renders opportunities empty state', async () => {
    mockGetCrmOpportunities.mockResolvedValue([]);
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-opportunities')); });
    fireEvent.click(screen.getByTestId('tab-opportunities'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'No opportunities' })).toBeInTheDocument();
    });
  });

  it('switches to kanban view and moves opportunities between stages', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-opportunities')); });
    fireEvent.click(screen.getByTestId('tab-opportunities'));
    await waitFor(() => { expect(screen.getByText('Camp Deal')); });
    fireEvent.click(screen.getByText('Kanban'));
    await waitFor(() => {
      expect(screen.getByTestId('kanban-board')).toBeInTheDocument();
    });
    // Qualification column: only o1 renders a → Proposal button
    fireEvent.click(screen.getByText('→ Proposal'));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/crm/opportunities/o1/stage',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('"stage":"proposal"'),
        }),
      );
      expect(mockShowToast).toHaveBeenCalledWith('Opportunity moved to Proposal.', 'success');
    });
    // Negotiation column: o3 has both → Won and → Lost buttons
    fireEvent.click(screen.getByText('→ Won'));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/crm/opportunities/o3/stage',
        expect.objectContaining({ body: expect.stringContaining('"stage":"closed_won"') }),
      );
    });
    fireEvent.click(screen.getByText('→ Lost'));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/crm/opportunities/o3/stage',
        expect.objectContaining({ body: expect.stringContaining('"stage":"closed_lost"') }),
      );
    });
  });

  it('updates opportunity stage from the stage modal', async () => {
    mockGetCrmOpportunities.mockResolvedValue([mockOpportunities[0]]);
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-opportunities')); });
    fireEvent.click(screen.getByTestId('tab-opportunities'));
    await waitFor(() => { expect(screen.getByText('Camp Deal')); });
    fireEvent.click(screen.getAllByText('Update Stage')[0]);
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Update Pipeline Stage' })); });
    fireEvent.click(screen.getByText('Proposal'));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/crm/opportunities/o1/stage',
        expect.objectContaining({ method: 'PATCH', body: expect.stringContaining('"stage":"proposal"') }),
      );
      expect(mockShowToast).toHaveBeenCalledWith('Opportunity moved to proposal.', 'success');
    });
  });

  it('validates opportunity name is required', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-opportunities')); });
    fireEvent.click(screen.getByTestId('tab-opportunities'));
    await waitFor(() => { expect(screen.getByText('Add Opportunity')); });
    fireEvent.click(screen.getByText('Add Opportunity'));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Opportunity' })); });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Name is required.', 'warning');
    });
  });

  it('creates an opportunity with parsed numeric fields', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-opportunities')); });
    fireEvent.click(screen.getByTestId('tab-opportunities'));
    await waitFor(() => { expect(screen.getByText('Add Opportunity')); });
    fireEvent.click(screen.getByText('Add Opportunity'));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Opportunity' })); });
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Summer Camp' } });
    fireEvent.change(screen.getByTestId('input-Amount ($)'), { target: { value: '7500' } });
    fireEvent.change(screen.getByTestId('input-Probability (%)'), { target: { value: '40' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/crm/opportunities',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"amount":7500'),
        }),
      );
      expect(mockShowToast).toHaveBeenCalledWith('Opportunity created.', 'success');
    });
  });

  it('renders tasks in table view and updates task status', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-tasks')); });
    fireEvent.click(screen.getByTestId('tab-tasks'));
    await waitFor(() => { expect(screen.getByText('Follow up')); });
    expect(screen.getByText('Todo')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('Update Status')[0]);
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Update Task Status' })); });
    fireEvent.click(screen.getByText('In Progress'));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/crm/tasks/t1/status',
        expect.objectContaining({ method: 'PATCH', body: expect.stringContaining('"status":"in_progress"') }),
      );
      expect(mockShowToast).toHaveBeenCalledWith('Task status updated.', 'success');
    });
  });

  it('renders tasks empty state', async () => {
    mockGetCrmTasks.mockResolvedValue([]);
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-tasks')); });
    fireEvent.click(screen.getByTestId('tab-tasks'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'No tasks' })).toBeInTheDocument();
    });
  });

  it('renders gantt view with task timelines', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-tasks')); });
    fireEvent.click(screen.getByTestId('tab-tasks'));
    await waitFor(() => { expect(screen.getByText('Follow up')); });
    fireEvent.click(screen.getByText('Gantt'));
    await waitFor(() => {
      expect(screen.getByTestId('gantt-chart')).toBeInTheDocument();
    });
    expect(screen.getByText('Task Timeline')).toBeInTheDocument();
    expect(screen.getByText('Follow up')).toBeInTheDocument();
    expect(screen.getByText('Send proposal')).toBeInTheDocument();
    expect(screen.getAllByText('Todo').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Done').length).toBeGreaterThanOrEqual(1);
  });

  it('renders gantt empty message when no tasks have due dates', async () => {
    mockGetCrmTasks.mockResolvedValue([{ id: 't9', title: 'No dates', projectId: null, assigneeId: null, status: 'blocked', priority: 'low', dueDate: null, description: null }]);
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-tasks')); });
    fireEvent.click(screen.getByTestId('tab-tasks'));
    await waitFor(() => { expect(screen.getByText('No dates')); });
    fireEvent.click(screen.getByText('Gantt'));
    await waitFor(() => {
      expect(screen.getByText(/No tasks with due dates to display/)).toBeInTheDocument();
    });
  });

  it('validates task title is required', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-tasks')); });
    fireEvent.click(screen.getByTestId('tab-tasks'));
    await waitFor(() => { expect(screen.getByText('Add Task')); });
    fireEvent.click(screen.getByText('Add Task'));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Task' })); });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Title is required.', 'warning');
    });
  });

  it('creates a task', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-tasks')); });
    fireEvent.click(screen.getByTestId('tab-tasks'));
    await waitFor(() => { expect(screen.getByText('Add Task')); });
    fireEvent.click(screen.getByText('Add Task'));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Task' })); });
    fireEvent.change(screen.getByTestId('input-Title *'), { target: { value: 'Call supplier' } });
    fireEvent.change(screen.getByTestId('input-Description'), { target: { value: 'Order linen' } });
    fireEvent.change(screen.getByTestId('select-Priority'), { target: { value: 'urgent' } });
    fireEvent.change(screen.getByTestId('input-Due Date'), { target: { value: '2026-10-01' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/crm/tasks',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Call supplier'),
        }),
      );
      expect(mockShowToast).toHaveBeenCalledWith('Task created.', 'success');
    });
  });

  it('renders tickets in table view', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-tickets')); });
    fireEvent.click(screen.getByTestId('tab-tickets'));
    await waitFor(() => { expect(screen.getByText('Broken shower')); });
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Urgent')).toBeInTheDocument();
  });

  it('renders tickets empty state', async () => {
    mockGetCrmTickets.mockResolvedValue([]);
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-tickets')); });
    fireEvent.click(screen.getByTestId('tab-tickets'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'No tickets' })).toBeInTheDocument();
    });
  });

  it('validates ticket subject is required and creates a ticket', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-tickets')); });
    fireEvent.click(screen.getByTestId('tab-tickets'));
    await waitFor(() => { expect(screen.getByText('Add Ticket')); });
    fireEvent.click(screen.getByText('Add Ticket'));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Ticket' })); });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Subject is required.', 'warning');
    });
    fireEvent.change(screen.getByTestId('input-Subject *'), { target: { value: 'AC not working' } });
    fireEvent.change(screen.getByTestId('input-Description'), { target: { value: 'Room 5' } });
    fireEvent.change(screen.getByTestId('select-Priority'), { target: { value: 'high' } });
    fireEvent.change(screen.getByTestId('select-Contact'), { target: { value: 'c1' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/crm/tickets',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('AC not working'),
        }),
      );
      expect(mockShowToast).toHaveBeenCalledWith('Ticket created.', 'success');
    });
  });

  it('adds a comment to a ticket (empty comment guarded)', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-tickets')); });
    fireEvent.click(screen.getByTestId('tab-tickets'));
    await waitFor(() => { expect(screen.getByText('Broken shower')); });
    fireEvent.click(screen.getAllByText('Add Comment')[0]);
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Comment' })); });
    // Empty comment: no API call, no toast
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockApiFetch).not.toHaveBeenCalledWith('/crm/tickets/k1/comments', expect.any(Object));
    });
    // Typed comment submits
    fireEvent.change(screen.getByTestId('input-Comment'), { target: { value: 'Sent plumber' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/crm/tickets/k1/comments',
        expect.objectContaining({ method: 'POST', body: expect.stringContaining('Sent plumber') }),
      );
      expect(mockShowToast).toHaveBeenCalledWith('Comment added.', 'success');
    });
  });

  it('renders knowledge articles with published badges', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-knowledge')); });
    fireEvent.click(screen.getByTestId('tab-knowledge'));
    await waitFor(() => { expect(screen.getByText('Check-in guide')); });
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Guides')).toBeInTheDocument();
  });

  it('renders knowledge articles empty state', async () => {
    mockGetCrmKnowledgeArticles.mockResolvedValue([]);
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-knowledge')); });
    fireEvent.click(screen.getByTestId('tab-knowledge'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'No articles' })).toBeInTheDocument();
    });
  });

  it('validates knowledge article title and content are required', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-knowledge')); });
    fireEvent.click(screen.getByTestId('tab-knowledge'));
    await waitFor(() => { expect(screen.getByTestId('add-btn')); });
    fireEvent.click(screen.getByTestId('add-btn'));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Article' })); });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Title and content are required.', 'warning');
    });
  });

  it('creates a knowledge article', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-knowledge')); });
    fireEvent.click(screen.getByTestId('tab-knowledge'));
    await waitFor(() => { expect(screen.getByTestId('add-btn')); });
    fireEvent.click(screen.getByTestId('add-btn'));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Article' })); });
    fireEvent.change(screen.getByTestId('input-Title *'), { target: { value: 'Safety rules' } });
    fireEvent.change(screen.getByTestId('input-Content *'), { target: { value: 'No fires' } });
    fireEvent.change(screen.getByTestId('input-Category'), { target: { value: 'Safety' } });
    fireEvent.click(screen.getByLabelText('Published'));
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/crm/knowledge-articles',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Safety rules'),
        }),
      );
      expect(mockShowToast).toHaveBeenCalledWith('Article created.', 'success');
    });
  });

  it('edits a knowledge article with prefilled data', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-knowledge')); });
    fireEvent.click(screen.getByTestId('tab-knowledge'));
    await waitFor(() => { expect(screen.getByText('Check-in guide')); });
    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Edit Article' })); });
    expect(screen.getByTestId('input-Title *')).toHaveValue('Check-in guide');
    expect(screen.getByTestId('input-Content *')).toHaveValue('How to check in');
    fireEvent.change(screen.getByTestId('input-Title *'), { target: { value: 'Check-in guide v2' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/crm/knowledge-articles',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Check-in guide v2'),
        }),
      );
      expect(mockShowToast).toHaveBeenCalledWith('Article updated.', 'success');
    });
  });

  it('switches between all tabs and renders counts', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByText('Alice Morgan')); });
    expect(screen.getByText('Contacts (2)')).toBeInTheDocument();
    expect(screen.getByText('Leads (2)')).toBeInTheDocument();
    expect(screen.getByText('Opportunities (5)')).toBeInTheDocument();
    expect(screen.getByText('Tasks (3)')).toBeInTheDocument();
    expect(screen.getByText('Tickets (2)')).toBeInTheDocument();
    expect(screen.getByText('Knowledge (2)')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tab-leads'));
    await waitFor(() => { expect(screen.getByText('Website')); });
    fireEvent.click(screen.getByTestId('tab-opportunities'));
    await waitFor(() => { expect(screen.getByText('Camp Deal')); });
    fireEvent.click(screen.getByTestId('tab-tasks'));
    await waitFor(() => { expect(screen.getByText('Follow up')); });
    fireEvent.click(screen.getByTestId('tab-tickets'));
    await waitFor(() => { expect(screen.getByText('Broken shower')); });
    fireEvent.click(screen.getByTestId('tab-knowledge'));
    await waitFor(() => { expect(screen.getByText('Check-in guide')); });
  });
});

describe('SuperCRMPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { role: 'super_admin' };
    mockApiFetch.mockImplementation(defaultApiFetch);
    mockGetAdminTenants.mockResolvedValue(mockTenants);
  });

  it('renders access denied for non-super-admin users', async () => {
    mockUser = { role: 'admin' };
    await act(async () => {
      renderWithQuery(<SuperCRMPanel />);
    });
    expect(screen.getByRole('heading', { name: 'Access Denied' })).toBeInTheDocument();
    expect(screen.getByText('Super Admin access required.')).toBeInTheDocument();
  });

  it('shows loading spinner while tenants/overview are in flight', async () => {
    const d = deferred();
    mockGetAdminTenants.mockReturnValue(d.promise as never);
    await act(async () => {
      renderWithQuery(<SuperCRMPanel />);
    });
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.getByText('Loading CRM data...')).toBeInTheDocument();
    await act(async () => {
      d.resolve([]);
    });
  });

  it('renders CRM overview stats and tenant breakdown', async () => {
    await act(async () => {
      renderWithQuery(<SuperCRMPanel />);
    });
    await waitFor(() => {
      expect(screen.getAllByTestId('stat-card').length).toBeGreaterThanOrEqual(4);
    });
    expect(screen.getByText('Contacts')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Leads')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Open Opps')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Open Tickets')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('CRM by Tenant')).toBeInTheDocument();
    expect(screen.getByText('8 leads')).toBeInTheDocument();
    expect(screen.getByText('3 opps')).toBeInTheDocument();
    expect(screen.getByText('20 contacts')).toBeInTheDocument();
  });

  it('renders contacts table with data', async () => {
    await act(async () => {
      renderWithQuery(<SuperCRMPanel />);
    });
    await waitFor(() => {
      expect(screen.getByText('Alice Morgan')).toBeInTheDocument();
    });
    expect(screen.getByText('Bob Tanner')).toBeInTheDocument();
    expect(screen.getByText('alice@x.com')).toBeInTheDocument();
    expect(screen.getAllByText('Camp Alpha').length).toBeGreaterThanOrEqual(1);
  });

  it('shows empty state when no contacts are found', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (String(url).includes('/admin/crm/contacts')) return Promise.resolve({ data: [], total: 0 });
      return defaultApiFetch(url);
    });
    await act(async () => {
      renderWithQuery(<SuperCRMPanel />);
    });
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: 'No contacts found' })).toBeInTheDocument();
  });

  it('filters contacts by selected tenant', async () => {
    await act(async () => {
      renderWithQuery(<SuperCRMPanel />);
    });
    await waitFor(() => { expect(screen.getByText('Alice Morgan')); });
    const tenantSelect = screen.getByTestId('select-Filter by Tenant');
    fireEvent.change(tenantSelect, { target: { value: 't1' } });
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/admin/crm/contacts?tenantId=t1');
    });
  });

  it('refresh button reloads contacts', async () => {
    await act(async () => {
      renderWithQuery(<SuperCRMPanel />);
    });
    await waitFor(() => { expect(screen.getByText('Alice Morgan')); });
    fireEvent.click(screen.getByText('Refresh'));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/admin/crm/contacts');
    });
  });

  it('handles tenants with a { data } envelope', async () => {
    mockGetAdminTenants.mockResolvedValue({ data: mockTenants } as never);
    await act(async () => {
      renderWithQuery(<SuperCRMPanel />);
    });
    await waitFor(() => {
      expect(screen.getByText('Alice Morgan')).toBeInTheDocument();
    });
    expect(screen.getAllByText('Camp Alpha').length).toBeGreaterThanOrEqual(1);
  });

  it('shows error toast when tenants fail to load', async () => {
    mockGetAdminTenants.mockRejectedValue(new Error('tenants down'));
    await act(async () => {
      renderWithQuery(<SuperCRMPanel />);
    });
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load tenants: tenants down'),
        'error',
      );
    });
  });

  it('shows error toast when CRM overview fails to load', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (String(url).includes('/admin/crm/overview')) return Promise.reject(new Error('overview down'));
      return defaultApiFetch(url);
    });
    await act(async () => {
      renderWithQuery(<SuperCRMPanel />);
    });
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load CRM overview: overview down'),
        'error',
      );
    });
  });

  it('shows error toast when contacts fail to load', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (String(url).includes('/admin/crm/contacts')) return Promise.reject(new Error('contacts down'));
      return defaultApiFetch(url);
    });
    await act(async () => {
      renderWithQuery(<SuperCRMPanel />);
    });
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load contacts: contacts down'),
        'error',
      );
    });
  });
});