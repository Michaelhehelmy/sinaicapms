import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import CRMPanel from '@/components/admin/CRMPanel';

// ─── Mock handles (mirror crm.test.tsx patterns) ─────────────────────────────
const mockShowToast = vi.fn();
let mockUser: { role: string } | null = { role: 'super_admin' };

const mockApiFetch = vi.fn();
const mockGetCrmContacts = vi.fn();
const mockGetCrmLeads = vi.fn();
const mockGetCrmOpportunities = vi.fn();
const mockGetCrmTasks = vi.fn();
const mockGetCrmTickets = vi.fn();
const mockGetCrmKnowledgeArticles = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  getCrmContacts: (...args: unknown[]) => mockGetCrmContacts(...args),
  getCrmLeads: (...args: unknown[]) => mockGetCrmLeads(...args),
  getCrmOpportunities: (...args: unknown[]) => mockGetCrmOpportunities(...args),
  getCrmTasks: (...args: unknown[]) => mockGetCrmTasks(...args),
  getCrmTickets: (...args: unknown[]) => mockGetCrmTickets(...args),
  getCrmKnowledgeArticles: (...args: unknown[]) => mockGetCrmKnowledgeArticles(...args),
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
  Card: ({ children, ...rest }: { children: React.ReactNode; [key: string]: unknown }) => <div {...rest}>{children}</div>,
}));

vi.mock('@/components/ui/StatCard', () => ({
  StatCard: ({ title, value }: { title: string; value: string | number }) => (
    <div data-testid="stat-card">
      <span>{title}</span>
      <span>{value}</span>
    </div>
  ),
}));

// ─── Data ────────────────────────────────────────────────────────────────────
const mockContacts = [
  { id: 'c1', type: 'individual', name: 'Alice Morgan', email: 'alice@test.com', phone: '+20123', address: 'Cairo', industry: 'Travel', isCustomer: true, isVendor: false, isLead: true, notes: 'VIP' },
  { id: 'c2', type: 'company', name: 'Acme Corp', email: 'acme@test.com', phone: '', address: '', industry: '', isCustomer: false, isVendor: true, isLead: false, notes: '' },
];

const mockLeads = [
  { id: 'l1', contactId: 'c1', contactName: 'Alice Morgan', status: 'new', source: 'Website', value: 1500, assignedTo: 'Sara' },
  { id: 'l2', contactId: 'c2', contactName: 'Acme Corp', status: 'won', source: 'Referral', value: 0, assignedTo: null },
];

const mockOpportunities = [
  { id: 'o1', leadId: 'l1', name: 'Camp Deal', stage: 'proposal', amount: 5000, probability: 30, expectedCloseDate: '2026-09-01', assignedTo: 'Sara' },
  { id: 'o2', leadId: null, name: 'Retreat', stage: 'proposal', amount: 0, probability: 0, expectedCloseDate: null, assignedTo: null },
  { id: 'o3', leadId: 'l2', name: 'Wedding', stage: 'negotiation', amount: 12000, probability: 70, expectedCloseDate: '2026-10-15', assignedTo: 'Sara' },
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

function defaultApiFetch(url: string) {
  return Promise.resolve({});
}

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

describe('CRMPanel coverage extras', () => {
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
    // CRMPanel.tsx calls `formatLabel` from the module-level KanbanBoard/GanttChart
    // but only declares it inside the component → unresolvable identifier hosts a
    // ReferenceError at module scope. The existing suite stubs it on globalThis —
    // replicate that here (we are not allowed to edit src/).
    (globalThis as { formatLabel?: (s: unknown) => string }).formatLabel = (s: unknown) =>
      String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  });

  afterEach(() => {
    delete (globalThis as { formatLabel?: (s: unknown) => string }).formatLabel;
  });

  it('moves a proposal-stage opportunity to negotiation from the kanban board', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-opportunities')); });
    fireEvent.click(screen.getByTestId('tab-opportunities'));
    await waitFor(() => { expect(screen.getByText('Camp Deal')); });
    fireEvent.click(screen.getByText('Kanban'));
    await waitFor(() => { expect(screen.getByTestId('kanban-board')).toBeInTheDocument(); });
    // Both proposal-stage opps (o1, o2) render → Negotiation buttons
    fireEvent.click(screen.getAllByText('→ Negotiation')[0]);
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/crm/opportunities/o1/stage',
        expect.objectContaining({ method: 'PATCH', body: expect.stringContaining('"stage":"negotiation"') }),
      );
      expect(mockShowToast).toHaveBeenCalledWith('Opportunity moved to Negotiation.', 'success');
    });
  });

  it('toggles the opportunities view back to table using the Table button', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-opportunities')); });
    fireEvent.click(screen.getByTestId('tab-opportunities'));
    await waitFor(() => { expect(screen.getByText('Camp Deal')); });
    fireEvent.click(screen.getByText('Kanban'));
    await waitFor(() => { expect(screen.getByTestId('kanban-board')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Table'));
    await waitFor(() => {
      expect(screen.getByTestId('data-table')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('kanban-board')).not.toBeInTheDocument();
  });

  it('toggles the tasks view back to table using the Table button', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-tasks')); });
    fireEvent.click(screen.getByTestId('tab-tasks'));
    await waitFor(() => { expect(screen.getByText('Follow up')); });
    fireEvent.click(screen.getByText('Gantt'));
    await waitFor(() => { expect(screen.getByTestId('gantt-chart')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Table'));
    await waitFor(() => {
      expect(screen.getByTestId('data-table')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('gantt-chart')).not.toBeInTheDocument();
  });

  it('shows an error toast when creating a lead fails', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (String(url).includes('/crm/leads')) return Promise.reject(new Error('lead save failed'));
      return defaultApiFetch(url);
    });
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-leads')); });
    fireEvent.click(screen.getByTestId('tab-leads'));
    await waitFor(() => { expect(screen.getByText('Add Lead')); });
    fireEvent.click(screen.getByText('Add Lead'));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Lead' })); });
    fireEvent.change(screen.getByTestId('select-Contact *'), { target: { value: 'c1' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error: lead save failed'), 'error');
    });
  });

  it('shows an error toast when creating an opportunity fails', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (String(url).includes('/crm/opportunities')) return Promise.reject(new Error('opp save failed'));
      return defaultApiFetch(url);
    });
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-opportunities')); });
    fireEvent.click(screen.getByTestId('tab-opportunities'));
    await waitFor(() => { expect(screen.getByText('Add Opportunity')); });
    fireEvent.click(screen.getByText('Add Opportunity'));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Opportunity' })); });
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Summer Camp' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error: opp save failed'), 'error');
    });
  });

  it('shows an error toast when updating opportunity stage from the modal fails', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (String(url).includes('/stage')) return Promise.reject(new Error('stage failed'));
      return defaultApiFetch(url);
    });
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-opportunities')); });
    fireEvent.click(screen.getByTestId('tab-opportunities'));
    await waitFor(() => { expect(screen.getByText('Camp Deal')); });
    fireEvent.click(screen.getAllByText('Update Stage')[0]);
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Update Pipeline Stage' })); });
    // o1 is at 'proposal' stage → the Proposal option is filtered; 'Closed Won'
    // appears only in the modal options, so it is unambiguous here.
    fireEvent.click(screen.getByText('Closed Won'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error: stage failed'), 'error');
    });
  });

  it('shows an error toast when moving an opportunity via the kanban board fails', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (String(url).includes('/stage')) return Promise.reject(new Error('move failed'));
      return defaultApiFetch(url);
    });
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-opportunities')); });
    fireEvent.click(screen.getByTestId('tab-opportunities'));
    await waitFor(() => { expect(screen.getByText('Camp Deal')); });
    fireEvent.click(screen.getByText('Kanban'));
    await waitFor(() => { expect(screen.getByTestId('kanban-board')).toBeInTheDocument(); });
    fireEvent.click(screen.getAllByText('→ Negotiation')[0]);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error: move failed'), 'error');
    });
  });

  it('shows an error toast when creating a task fails', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (String(url).includes('/crm/tasks')) return Promise.reject(new Error('task save failed'));
      return defaultApiFetch(url);
    });
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-tasks')); });
    fireEvent.click(screen.getByTestId('tab-tasks'));
    await waitFor(() => { expect(screen.getByText('Add Task')); });
    fireEvent.click(screen.getByText('Add Task'));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Task' })); });
    fireEvent.change(screen.getByTestId('input-Title *'), { target: { value: 'Call supplier' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error: task save failed'), 'error');
    });
  });

  it('shows an error toast when updating task status fails', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (String(url).includes('/crm/tasks/') && String(url).includes('/status')) return Promise.reject(new Error('task status failed'));
      return defaultApiFetch(url);
    });
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-tasks')); });
    fireEvent.click(screen.getByTestId('tab-tasks'));
    await waitFor(() => { expect(screen.getByText('Follow up')); });
    fireEvent.click(screen.getAllByText('Update Status')[0]);
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Update Task Status' })); });
    fireEvent.click(screen.getByText('In Progress'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error: task status failed'), 'error');
    });
  });

  it('shows an error toast when creating a ticket fails', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (String(url).includes('/crm/tickets')) return Promise.reject(new Error('ticket save failed'));
      return defaultApiFetch(url);
    });
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-tickets')); });
    fireEvent.click(screen.getByTestId('tab-tickets'));
    await waitFor(() => { expect(screen.getByText('Add Ticket')); });
    fireEvent.click(screen.getByText('Add Ticket'));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Ticket' })); });
    fireEvent.change(screen.getByTestId('input-Subject *'), { target: { value: 'AC not working' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error: ticket save failed'), 'error');
    });
  });

  it('shows an error toast when adding a ticket comment fails', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (String(url).includes('/comments')) return Promise.reject(new Error('comment failed'));
      return defaultApiFetch(url);
    });
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-tickets')); });
    fireEvent.click(screen.getByTestId('tab-tickets'));
    await waitFor(() => { expect(screen.getByText('Broken shower')); });
    fireEvent.click(screen.getAllByText('Add Comment')[0]);
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Comment' })); });
    fireEvent.change(screen.getByTestId('input-Comment'), { target: { value: 'Sent plumber' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error: comment failed'), 'error');
    });
  });

  it('shows an error toast when saving a knowledge article fails', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (String(url).includes('/crm/knowledge-articles')) return Promise.reject(new Error('kb save failed'));
      return defaultApiFetch(url);
    });
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-knowledge')); });
    fireEvent.click(screen.getByTestId('tab-knowledge'));
    await waitFor(() => { expect(screen.getByTestId('add-btn')); });
    fireEvent.click(screen.getByTestId('add-btn'));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Article' })); });
    fireEvent.change(screen.getByTestId('input-Title *'), { target: { value: 'Safety rules' } });
    fireEvent.change(screen.getByTestId('input-Content *'), { target: { value: 'No fires' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error: kb save failed'), 'error');
    });
  });

  it('fills every contact form optional field and closes the modal via Close', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('add-btn')); });
    fireEvent.click(screen.getByTestId('add-btn'));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Contact' })); });
    fireEvent.change(screen.getByTestId('input-Address'), { target: { value: 'Sinai' } });
    fireEvent.change(screen.getByTestId('input-Industry'), { target: { value: 'Hospitality' } });
    fireEvent.click(screen.getByLabelText('Customer'));
    fireEvent.click(screen.getByLabelText('Vendor'));
    fireEvent.click(screen.getByLabelText('Lead'));
    fireEvent.change(screen.getByTestId('input-Notes'), { target: { value: 'preferred' } });
    fireEvent.click(screen.getByTestId('modal-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('form-modal')).not.toBeInTheDocument();
    });
  });

  it('fills the optional lead fields, then closes the lead form modal', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-leads')); });
    fireEvent.click(screen.getByTestId('tab-leads'));
    await waitFor(() => { expect(screen.getByText('Add Lead')); });
    fireEvent.click(screen.getByText('Add Lead'));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Lead' })); });
    fireEvent.change(screen.getByTestId('select-Contact *'), { target: { value: 'c1' } });
    fireEvent.change(screen.getByTestId('input-Assigned To'), { target: { value: 'Omar' } });
    fireEvent.change(screen.getByTestId('input-Notes'), { target: { value: 'follow up' } });
    fireEvent.click(screen.getByTestId('modal-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('form-modal')).not.toBeInTheDocument();
    });
  });

  it('closes the lead status modal via the close button', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-leads')); });
    fireEvent.click(screen.getByTestId('tab-leads'));
    await waitFor(() => { expect(screen.getByText('Website')); });
    fireEvent.click(screen.getAllByText('Update Status')[0]);
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Update Lead Status' })); });
    fireEvent.click(screen.getByTestId('modal-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('form-modal')).not.toBeInTheDocument();
    });
  });

  it('fills optional opportunity fields and closes the opp form modal', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-opportunities')); });
    fireEvent.click(screen.getByTestId('tab-opportunities'));
    await waitFor(() => { expect(screen.getByText('Add Opportunity')); });
    fireEvent.click(screen.getByText('Add Opportunity'));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Opportunity' })); });
    fireEvent.change(screen.getByTestId('input-Expected Close Date'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByTestId('input-Assigned To'), { target: { value: 'Sara' } });
    fireEvent.click(screen.getByTestId('modal-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('form-modal')).not.toBeInTheDocument();
    });
  });

  it('closes the opportunity stage modal via the close button', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-opportunities')); });
    fireEvent.click(screen.getByTestId('tab-opportunities'));
    await waitFor(() => { expect(screen.getByText('Camp Deal')); });
    fireEvent.click(screen.getAllByText('Update Stage')[0]);
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Update Pipeline Stage' })); });
    fireEvent.click(screen.getByTestId('modal-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('form-modal')).not.toBeInTheDocument();
    });
  });

  it('closes the task form modal via the close button', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-tasks')); });
    fireEvent.click(screen.getByTestId('tab-tasks'));
    await waitFor(() => { expect(screen.getByText('Add Task')); });
    fireEvent.click(screen.getByText('Add Task'));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Task' })); });
    fireEvent.click(screen.getByTestId('modal-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('form-modal')).not.toBeInTheDocument();
    });
  });

  it('fills the task project id and assignee id fields', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-tasks')); });
    fireEvent.click(screen.getByTestId('tab-tasks'));
    await waitFor(() => { expect(screen.getByText('Add Task')); });
    fireEvent.click(screen.getByText('Add Task'));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Task' })); });
    fireEvent.change(screen.getByTestId('input-Project ID'), { target: { value: 'p9' } });
    fireEvent.change(screen.getByTestId('input-Assignee ID'), { target: { value: 'u9' } });
    fireEvent.click(screen.getByTestId('modal-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('form-modal')).not.toBeInTheDocument();
    });
  });

  it('closes the task status modal via the close button', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-tasks')); });
    fireEvent.click(screen.getByTestId('tab-tasks'));
    await waitFor(() => { expect(screen.getByText('Follow up')); });
    fireEvent.click(screen.getAllByText('Update Status')[0]);
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Update Task Status' })); });
    fireEvent.click(screen.getByTestId('modal-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('form-modal')).not.toBeInTheDocument();
    });
  });

  it('closes the ticket form modal and fills assigned to', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-tickets')); });
    fireEvent.click(screen.getByTestId('tab-tickets'));
    await waitFor(() => { expect(screen.getByText('Add Ticket')); });
    fireEvent.click(screen.getByText('Add Ticket'));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Ticket' })); });
    fireEvent.change(screen.getByTestId('input-Assigned To'), { target: { value: 'Omar' } });
    fireEvent.click(screen.getByTestId('modal-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('form-modal')).not.toBeInTheDocument();
    });
  });

  it('closes the ticket comment modal via the close button', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-tickets')); });
    fireEvent.click(screen.getByTestId('tab-tickets'));
    await waitFor(() => { expect(screen.getByText('Broken shower')); });
    fireEvent.click(screen.getAllByText('Add Comment')[0]);
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Comment' })); });
    fireEvent.click(screen.getByTestId('modal-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('form-modal')).not.toBeInTheDocument();
    });
  });

  it('closes the knowledge form modal and fills tags field', async () => {
    renderWithQuery(<CRMPanel />);
    await waitFor(() => { expect(screen.getByTestId('tab-knowledge')); });
    fireEvent.click(screen.getByTestId('tab-knowledge'));
    await waitFor(() => { expect(screen.getByTestId('add-btn')); });
    fireEvent.click(screen.getByTestId('add-btn'));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Article' })); });
    fireEvent.change(screen.getByTestId('input-Tags'), { target: { value: 'safety,summer' } });
    fireEvent.click(screen.getByTestId('modal-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('form-modal')).not.toBeInTheDocument();
    });
  });
});
