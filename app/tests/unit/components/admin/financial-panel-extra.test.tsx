import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import FinancialPanel from '@/components/admin/FinancialPanel';

// Self-contained mock factory. Use vi.hoisted so the api fns and mutable
// query state are referenceable both inside the factory and in assertions.
const { mockApi, hookState, mockShowToast } = vi.hoisted(() => {
  const state = {
    accounts: [] as unknown[],
    journals: [] as unknown[],
    entries: [] as unknown[],
    invoices: [] as unknown[],
    payments: [] as unknown[],
    taxRates: [] as unknown[],
    loading: false,
  };
  return {
    mockApi: {
      createFinancialAccount: vi.fn(),
      updateFinancialAccount: vi.fn(),
      deleteFinancialAccount: vi.fn(),
      createFinancialJournal: vi.fn(),
      createJournalEntry: vi.fn(),
      postJournalEntry: vi.fn(),
      createFinancialInvoice: vi.fn(),
      updateInvoiceStatus: vi.fn(),
      createPayment: vi.fn(),
      createTaxRate: vi.fn(),
    },
    hookState: {
      state,
      reset: () => {
        state.accounts = [];
        state.journals = [];
        state.entries = [];
        state.invoices = [];
        state.payments = [];
        state.taxRates = [];
        state.loading = false;
      },
      set: (patch: Record<string, unknown>) => Object.assign(state, patch),
    },
    mockShowToast: vi.fn(),
  };
});

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { role: 'super_admin' } }),
}));

vi.mock('@/hooks/useQueryHooks', () => {
  const s = hookState.state;
  return {
    queryKeys: {
      financialAccounts: ['admin', 'financials', 'accounts'],
      financialJournals: ['admin', 'financials', 'journals'],
      financialJournalEntries: ['admin', 'financials', 'journalEntries'],
      financialInvoices: ['admin', 'financials', 'invoices'],
      financialPayments: ['admin', 'financials', 'payments'],
      financialTaxRates: ['admin', 'financials', 'taxRates'],
    },
    useFinancialAccountsQuery: () => ({ data: s.accounts, isLoading: s.loading }),
    useFinancialJournalsQuery: () => ({ data: s.journals, isLoading: s.loading }),
    useFinancialJournalEntriesQuery: () => ({ data: s.entries, isLoading: s.loading }),
    useFinancialInvoicesQuery: () => ({ data: s.invoices, isLoading: s.loading }),
    useFinancialPaymentsQuery: () => ({ data: s.payments, isLoading: s.loading }),
    useFinancialTaxRatesQuery: () => ({ data: s.taxRates, isLoading: s.loading }),
  };
});

vi.mock('@/lib/api', () => ({
  createFinancialAccount: mockApi.createFinancialAccount,
  updateFinancialAccount: mockApi.updateFinancialAccount,
  deleteFinancialAccount: mockApi.deleteFinancialAccount,
  createFinancialJournal: mockApi.createFinancialJournal,
  createJournalEntry: mockApi.createJournalEntry,
  postJournalEntry: mockApi.postJournalEntry,
  createFinancialInvoice: mockApi.createFinancialInvoice,
  updateInvoiceStatus: mockApi.updateInvoiceStatus,
  createPayment: mockApi.createPayment,
  createTaxRate: mockApi.createTaxRate,
}));

vi.mock('@/lib/utils', () => ({
  formatCurrency: (v: number) => `$${Number(v).toFixed(2)}`,
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
        {onClose && <button data-testid={`close-${title}`} onClick={onClose}>Close</button>}
        {onSubmit && (
          <button data-testid="modal-submit" onClick={onSubmit} disabled={submitDisabled}>
            {submitLabel || 'Submit'}
          </button>
        )}
      </div>
    ) : null,
}));

vi.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: ({ text }: { text?: string }) => <div data-testid="loading-spinner">{text}</div>,
}));

vi.mock('@/components/ui/EmptyState', () => ({
  EmptyState: ({
    title,
    description,
    action,
  }: {
    title: string;
    description?: string;
    action?: { label: string; onClick: () => void };
  }) => (
    <div data-testid="empty-state">
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <button data-testid="empty-state-action" onClick={action.onClick}>{action.label}</button>}
    </div>
  ),
}));

vi.mock('@/components/ui/Badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
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
    <button onClick={onClick} disabled={disabled} data-testid={rest['data-testid'] as string | undefined} {...rest}>{children}</button>
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

// ─── Mock data ─────────────────────────────────────────────────────────────

const mockAccounts = [
  { id: 'acc_1', code: '1000', name: 'Cash', type: 'asset', is_active: 1, parent_id: null },
  { id: 'acc_3', code: '3000', name: 'Revenue', type: 'revenue', is_active: 1, parent_id: null },
];

const mockJournals = [
  { id: 'j_1', name: 'Sales Journal', type: 'sales', sequence_next: 1, is_active: 1 },
  { id: 'j_2', name: 'Old Journal', type: 'general', sequence_next: 2, is_active: 0 },
];

const mockInvoices = [
  { id: 'inv_1', invoice_number: 'INV-0001', type: 'sales', contact_id: null, issue_date: '2025-06-01', due_date: '2025-07-01', total_amount: 100, paid_amount: 0, status: 'draft', currency: 'USD' },
];

let invalidateSpy: ReturnType<typeof vi.fn>;

function renderWithClient(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  invalidateSpy = vi.spyOn(client, 'invalidateQueries');
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function setData(patch: Record<string, unknown>) {
  hookState.set(patch);
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('FinancialPanel extra coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookState.reset();
  });

  it('opens the entry modal via the journals empty-state action', () => {
    setData({ accounts: mockAccounts, journals: mockJournals, entries: [] });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getByTestId('tab-journals'));
    expect(screen.getByText('No journal entries')).toBeInTheDocument();
    // The empty-state action button should open the New Journal Entry modal.
    fireEvent.click(screen.getByTestId('empty-state-action'));
    expect(screen.getByRole('heading', { name: 'New Journal Entry' })).toBeInTheDocument();
  });

  it('opens the invoice modal via the invoices empty-state action and edits its fields', () => {
    setData({ accounts: mockAccounts, entries: mockEntries(), invoices: [] });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getByTestId('tab-invoices'));
    expect(screen.getByText('No invoices')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('empty-state-action'));
    expect(screen.getByRole('heading', { name: 'New Invoice' })).toBeInTheDocument();
    // Exercise the invoice modal input/select onChange handlers.
    const inputs = screen.getAllByTestId('input');
    fireEvent.change(inputs[0], { target: { value: 'Consulting' } });
    fireEvent.change(inputs[1], { target: { value: '3' } });
    fireEvent.change(inputs[2], { target: { value: '120' } });
    fireEvent.change(screen.getByTestId('input-Notes'), { target: { value: 'Thanks' } });
    fireEvent.change(screen.getByTestId('input-Issue Date *'), { target: { value: '2025-07-01' } });
    fireEvent.change(screen.getByTestId('input-Due Date'), { target: { value: '2025-08-01' } });
    fireEvent.change(screen.getByTestId('input-Currency'), { target: { value: 'EUR' } });
    fireEvent.change(screen.getByTestId('select-Type *'), { target: { value: 'purchase' } });
    // Add a second line item.
    fireEvent.click(screen.getByText('+ Add Line'));
    mockApi.createFinancialInvoice.mockResolvedValue({ id: 'inv_new', success: true } as never);
    fireEvent.click(screen.getByTestId('modal-submit'));
  });

  it('opens the payment modal via the payments empty-state action and shows error on failure', async () => {
    setData({ accounts: mockAccounts, payments: [] });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getByTestId('tab-payments'));
    expect(screen.getByText('No payments')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('empty-state-action'));
    expect(screen.getByRole('heading', { name: 'Record Payment' })).toBeInTheDocument();
    // Exercise payment modal onChange handlers.
    fireEvent.change(screen.getByTestId('input-Amount *'), { target: { value: '75' } });
    fireEvent.change(screen.getByTestId('input-Payment Date *'), { target: { value: '2025-07-05' } });
    fireEvent.change(screen.getByTestId('select-Method *'), { target: { value: 'bank_transfer' } });
    fireEvent.change(screen.getByTestId('input-Reference'), { target: { value: 'REF-33' } });
    mockApi.createPayment.mockRejectedValue(new Error('boom'));
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error:'), 'error');
    });
  });

  it('opens the tax modal via the taxes empty-state action and edits its name', () => {
    setData({ accounts: mockAccounts, taxRates: [] });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getByTestId('tab-taxes'));
    expect(screen.getByText('No tax rates')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('empty-state-action'));
    expect(screen.getByRole('heading', { name: 'New Tax Rate' })).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'VAT' } });
    fireEvent.change(screen.getByTestId('input-Rate (%) *'), { target: { value: '15' } });
    fireEvent.change(screen.getByTestId('input-Jurisdiction'), { target: { value: 'EG' } });
  });

  it('closes the account modal via its close button', () => {
    setData({ accounts: mockAccounts });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getAllByText('Add Account')[0]);
    expect(screen.getByRole('heading', { name: 'New Account' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('close-New Account'));
    expect(screen.queryByRole('heading', { name: 'New Account' })).not.toBeInTheDocument();
  });

  it('edits entry modal description, reference, and date fields', () => {
    setData({ accounts: mockAccounts, journals: mockJournals, entries: mockEntries() });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getByTestId('tab-journals'));
    fireEvent.click(screen.getAllByText('New Entry')[0]);
    expect(screen.getByRole('heading', { name: 'New Journal Entry' })).toBeInTheDocument();
    // Exercise write-date + string onChange handlers on the entry modal.
    fireEvent.change(screen.getByTestId('input-Date *'), { target: { value: '2025-07-10' } });
    fireEvent.change(screen.getByTestId('input-Description'), { target: { value: 'Deposit' } });
    fireEvent.change(screen.getByTestId('input-Reference'), { target: { value: 'DEP-1' } });
    fireEvent.change(screen.getByTestId('select-Journal *'), { target: { value: 'j_1' } });
    // Exercise the account select onChange on a line.
    fireEvent.change(screen.getAllByTestId('select')[0], { target: { value: 'acc_1' } });
  });

  it('adds and removes entry lines', () => {
    setData({ accounts: mockAccounts, journals: mockJournals, entries: mockEntries() });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getByTestId('tab-journals'));
    fireEvent.click(screen.getAllByText('New Entry')[0]);
    fireEvent.click(screen.getByText('+ Add Line'));
    // 3 lines now, so the remove (x) button appears (idx >= 2).
    expect(screen.getAllByTestId('select')).toHaveLength(3);
    // Fill the debit/credit onChange handlers too.
    fireEvent.change(screen.getAllByTestId('input')[0], { target: { value: '100' } });
    fireEvent.change(screen.getAllByTestId('input')[5], { target: { value: '100' } });
    expect(screen.getByText('x')).toBeInTheDocument();
    fireEvent.click(screen.getByText('x'));
    expect(screen.getAllByTestId('select')).toHaveLength(2);
  });

  it('closes the invoice, payment, and tax modals via their close buttons', () => {
    setData({ accounts: mockAccounts, invoices: mockInvoices });
    renderWithClient(<FinancialPanel />);

    // Invoice modal close.
    fireEvent.click(screen.getByTestId('tab-invoices'));
    fireEvent.click(screen.getByText('New Invoice'));
    expect(screen.getByRole('heading', { name: 'New Invoice' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('close-New Invoice'));
    expect(screen.queryByRole('heading', { name: 'New Invoice' })).not.toBeInTheDocument();

    // Payment modal close.
    fireEvent.click(screen.getByTestId('tab-payments'));
    fireEvent.click(screen.getAllByText('Record Payment')[0]);
    expect(screen.getByRole('heading', { name: 'Record Payment' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('close-Record Payment'));
    expect(screen.queryByRole('heading', { name: 'Record Payment' })).not.toBeInTheDocument();

    // Tax modal close.
    fireEvent.click(screen.getByTestId('tab-taxes'));
    fireEvent.click(screen.getAllByText('Add Tax Rate')[0]);
    expect(screen.getByRole('heading', { name: 'New Tax Rate' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('close-New Tax Rate'));
    expect(screen.queryByRole('heading', { name: 'New Tax Rate' })).not.toBeInTheDocument();
  });

  it('saves a journal entry built through empty-state modal on success path and invalidates', async () => {
    setData({ accounts: mockAccounts, journals: mockJournals, entries: mockEntries() });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getByTestId('tab-journals'));
    fireEvent.click(screen.getAllByText('New Entry')[0]);
    fireEvent.change(screen.getByTestId('select-Journal *'), { target: { value: 'j_1' } });
    const selects = screen.getAllByTestId('select');
    const inputs = screen.getAllByTestId('input');
    fireEvent.change(selects[0], { target: { value: 'acc_1' } });
    fireEvent.change(selects[1], { target: { value: 'acc_3' } });
    fireEvent.change(inputs[0], { target: { value: '100' } });
    fireEvent.change(inputs[3], { target: { value: '100' } });
    mockApi.createJournalEntry.mockResolvedValue({ id: 'e_new', success: true } as never);
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockApi.createJournalEntry).toHaveBeenCalledWith(expect.objectContaining({ journalId: 'j_1' }));
      expect(mockShowToast).toHaveBeenCalledWith('Journal entry created.', 'success');
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'financials'] });
  });
});

// Helper for entries data (kept at module scope for reuse).
function mockEntries() {
  return [
    { id: 'e_1', journal_id: 'j_1', journal_name: 'Sales Journal', date: '2025-06-01T00:00:00Z', description: 'Sale', reference: 'INV-1', posted: 0, lines: [] },
    { id: 'e_2', journal_id: 'j_2', journal_name: 'Old Journal', date: '2025-05-01T00:00:00Z', description: 'Adjustment', reference: 'ADJ-1', posted: 1, lines: [] },
  ];
}
