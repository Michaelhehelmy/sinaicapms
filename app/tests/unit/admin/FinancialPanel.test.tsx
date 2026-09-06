import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import FinancialPanel from '@/components/admin/FinancialPanel';

const mockShowToast = vi.fn();

// Query data stores
let accountsData: unknown[] = [];
let journalsData: unknown[] = [];
let entriesData: unknown[] = [];
let invoicesData: unknown[] = [];
let paymentsData: unknown[] = [];
let taxRatesData: unknown[] = [];
let payoutsData: unknown[] = [];
let anyLoading = false;

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/api', () => ({
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
}));

vi.mock('@/hooks/useQueryHooks', () => {
  const React = require('react');
  const useQ = (data: unknown) => {
    const [d, setD] = React.useState(data);
    const [l, setL] = React.useState(anyLoading);
    React.useEffect(() => { setD(data); setL(anyLoading); });
    return { data: d, isLoading: l };
  };
  return {
    useFinancialAccountsQuery: () => useQ(accountsData),
    useFinancialJournalsQuery: () => useQ(journalsData),
    useFinancialJournalEntriesQuery: () => useQ(entriesData),
    useFinancialInvoicesQuery: () => useQ(invoicesData),
    useFinancialPaymentsQuery: () => useQ(paymentsData),
    useFinancialTaxRatesQuery: () => useQ(taxRatesData),
    useFinancialPayoutsQuery: () => useQ(payoutsData),
    queryKeys: { financials: ['admin', 'financials'] },
  };
});

vi.mock('@/lib/utils', () => ({
  formatCurrency: (v: number) => `$${v.toFixed(2)}`,
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: ({ text }: { text?: string }) => <div data-testid="loading-spinner">{text}</div>,
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, onClick, disabled, ...rest }: { children: React.ReactNode; onClick?: (e?: React.MouseEvent) => void; disabled?: boolean; [key: string]: unknown }) => (
    <button onClick={onClick} disabled={disabled} {...rest}>{children}</button>
  ),
}));

vi.mock('@/components/ui/Input', () => ({
  Input: ({ label, value, onChange, placeholder, type }: { label?: string; value?: string; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string; type?: string }) => (
    <div>
      {label && <label>{label}</label>}
      <input type={type} value={value} onChange={onChange} placeholder={placeholder} data-testid={label ? `input-${label}` : 'input'} />
    </div>
  ),
}));

vi.mock('@/components/ui/Select', () => ({
  Select: ({ label, options, value, onChange }: { label?: string; options: { value: string; label: string }[]; value?: string; onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void }) => (
    <div>
      {label && <label>{label}</label>}
      <select value={value} onChange={onChange} data-testid={label ? `select-${label}` : 'select'}>
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

vi.mock('@/components/ui/Badge', () => ({
  Badge: ({ children, variant, size, dot }: { children: React.ReactNode; variant?: string; size?: string; dot?: boolean }) => (
    <span data-testid="badge">{children}</span>
  ),
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

vi.mock('@/components/ui/DataTable', () => ({
  DataTable: ({ data, columns, emptyMessage, actions }: {
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
  FormModal: ({ open, title, children, onClose, onSubmit, submitLabel, submitDisabled }: {
    open: boolean; title: string; children: React.ReactNode;
    onClose?: () => void; onSubmit?: () => void; submitLabel?: string; submitDisabled?: boolean;
  }) => open ? (
    <div data-testid="form-modal">
      <h2>{title}</h2>
      {children}
      {onClose && <button data-testid="modal-close" onClick={onClose}>Close</button>}
      {onSubmit && <button data-testid="modal-submit" onClick={onSubmit} disabled={submitDisabled}>{submitLabel || 'Submit'}</button>}
    </div>
  ) : null,
}));

import * as api from '@/lib/api';
const mockCreateFinancialAccount = vi.mocked(api.createFinancialAccount);
const mockUpdateFinancialAccount = vi.mocked(api.updateFinancialAccount);
const mockDeleteFinancialAccount = vi.mocked(api.deleteFinancialAccount);
const mockCreateFinancialJournal = vi.mocked(api.createFinancialJournal);
const mockCreateJournalEntry = vi.mocked(api.createJournalEntry);
const mockPostJournalEntry = vi.mocked(api.postJournalEntry);
const mockCreateFinancialInvoice = vi.mocked(api.createFinancialInvoice);
const mockUpdateInvoiceStatus = vi.mocked(api.updateInvoiceStatus);
const mockCreatePayment = vi.mocked(api.createPayment);
const mockCreateTaxRate = vi.mocked(api.createTaxRate);

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><FinancialPanel /></QueryClientProvider>);
}

describe('FinancialPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accountsData = [];
    journalsData = [];
    entriesData = [];
    invoicesData = [];
    paymentsData = [];
    taxRatesData = [];
    payoutsData = [];
    anyLoading = false;
  });

  // === Loading ===
  it('shows loading spinner', () => {
    anyLoading = true;
    renderPanel();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.getByText('Loading financial data...')).toBeInTheDocument();
  });

  // === Accounts Tab (default) ===
  it('renders accounts tab by default with empty state', () => {
    renderPanel();
    expect(screen.getByTestId('financial-panel')).toBeInTheDocument();
    expect(screen.getByText('Financial Management')).toBeInTheDocument();
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No accounts')).toBeInTheDocument();
  });

  it('renders accounts with data', () => {
    accountsData = [
      { id: 'a1', code: '1000', name: 'Cash', type: 'asset', is_active: 1, parent_id: null },
      { id: 'a2', code: '2000', name: 'Payable', type: 'liability', is_active: 0, parent_id: null },
    ];
    renderPanel();
    expect(screen.getByText('Cash')).toBeInTheDocument();
    expect(screen.getByText('Payable')).toBeInTheDocument();
    expect(screen.getByText('1000')).toBeInTheDocument();
  });

  it('opens add account modal', () => {
    renderPanel();
    // There are two "Add Account" buttons (header + empty state)
    fireEvent.click(screen.getAllByText('Add Account')[0]);
    expect(screen.getByTestId('form-modal')).toBeInTheDocument();
    expect(screen.getByText('New Account')).toBeInTheDocument();
  });

  it('validates account code and name required', async () => {
    renderPanel();
    fireEvent.click(screen.getAllByText('Add Account')[0]);
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Code and name are required.', 'warning');
    });
  });

  it('creates account successfully', async () => {
    mockCreateFinancialAccount.mockResolvedValue({} as never);
    renderPanel();
    fireEvent.click(screen.getAllByText('Add Account')[0]);
    fireEvent.change(screen.getByTestId('input-Code *'), { target: { value: '1000' } });
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Cash' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockCreateFinancialAccount).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('Account created.', 'success');
    });
  });

  it('creates account error shows toast', async () => {
    mockCreateFinancialAccount.mockRejectedValue(new Error('fail'));
    renderPanel();
    fireEvent.click(screen.getAllByText('Add Account')[0]);
    fireEvent.change(screen.getByTestId('input-Code *'), { target: { value: '1000' } });
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Cash' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error'), 'error');
    });
  });

  it('edits account successfully', async () => {
    accountsData = [{ id: 'a1', code: '1000', name: 'Cash', type: 'asset', is_active: 1, parent_id: null }];
    mockUpdateFinancialAccount.mockResolvedValue({} as never);
    renderPanel();
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByText('Edit Account')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockUpdateFinancialAccount).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('Account updated.', 'success');
    });
  });

  it('deactivates account', async () => {
    accountsData = [{ id: 'a1', code: '1000', name: 'Cash', type: 'asset', is_active: 1, parent_id: null }];
    mockDeleteFinancialAccount.mockResolvedValue({} as never);
    renderPanel();
    fireEvent.click(screen.getByText('Deactivate'));
    await waitFor(() => {
      expect(mockDeleteFinancialAccount).toHaveBeenCalledWith('a1');
      expect(mockShowToast).toHaveBeenCalledWith('Account deactivated.', 'success');
    });
  });

  it('deactivate account error shows toast', async () => {
    accountsData = [{ id: 'a1', code: '1000', name: 'Cash', type: 'asset', is_active: 1, parent_id: null }];
    mockDeleteFinancialAccount.mockRejectedValue(new Error('del fail'));
    renderPanel();
    fireEvent.click(screen.getByText('Deactivate'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error'), 'error');
    });
  });

  // === Journals Tab ===
  it('switches to journals tab with empty state', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-journals'));
    expect(screen.getByText('No journal entries')).toBeInTheDocument();
  });

  it('renders journal entries with data', () => {
    entriesData = [
      { id: 'e1', journal_id: 'j1', journal_name: 'Sales', date: '2025-01-15', description: 'Test entry', reference: 'REF001', posted: 0, lines: [] },
    ];
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-journals'));
    expect(screen.getByText('Test entry')).toBeInTheDocument();
  });

  it('opens new entry modal from tab button', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-journals'));
    fireEvent.click(screen.getAllByText('New Entry')[0]);
    expect(screen.getByTestId('form-modal')).toBeInTheDocument();
  });

  it('validates journal required in entry', async () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-journals'));
    fireEvent.click(screen.getAllByText('New Entry')[0]);
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Journal is required.', 'warning');
    });
  });

  it('validates at least 2 lines required', async () => {
    journalsData = [{ id: 'j1', name: 'Sales', type: 'sales', is_active: 1 }];
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-journals'));
    fireEvent.click(screen.getAllByText('New Entry')[0]);
    fireEvent.change(screen.getByTestId('select-Journal *'), { target: { value: 'j1' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('At least 2 lines required.', 'warning');
    });
  });

  it('validates debits must equal credits', async () => {
    journalsData = [{ id: 'j1', name: 'Sales', type: 'sales', is_active: 1 }];
    accountsData = [{ id: 'a1', code: '1000', name: 'Cash', type: 'asset', is_active: 1, parent_id: null }];
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-journals'));
    fireEvent.click(screen.getAllByText('New Entry')[0]);
    fireEvent.change(screen.getByTestId('select-Journal *'), { target: { value: 'j1' } });
    // Fill 2 lines with mismatched debits/credits
    const selects = screen.getAllByRole('combobox');
    // line selects for accounts (indices 1,2 after the Journal select)
    fireEvent.change(selects[1], { target: { value: 'a1' } });
    fireEvent.change(selects[2], { target: { value: 'a1' } });
    // Line-item inputs (no label): debit0=0, credit0=1, debit1=2, credit1=3
    const lineInputs = screen.getAllByTestId('input');
    fireEvent.change(lineInputs[0], { target: { value: '100' } }); // debit line 0
    fireEvent.change(lineInputs[3], { target: { value: '50' } });  // credit line 1
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Debits must equal credits.', 'warning');
    });
  });

  it('creates journal entry successfully', async () => {
    journalsData = [{ id: 'j1', name: 'Sales', type: 'sales', is_active: 1 }];
    accountsData = [{ id: 'a1', code: '1000', name: 'Cash', type: 'asset', is_active: 1, parent_id: null }];
    mockCreateJournalEntry.mockResolvedValue({} as never);
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-journals'));
    fireEvent.click(screen.getAllByText('New Entry')[0]);
    fireEvent.change(screen.getByTestId('select-Journal *'), { target: { value: 'j1' } });
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[1], { target: { value: 'a1' } });
    fireEvent.change(selects[2], { target: { value: 'a1' } });
    const lineInputs = screen.getAllByTestId('input');
    fireEvent.change(lineInputs[0], { target: { value: '100' } }); // debit line 0
    fireEvent.change(lineInputs[3], { target: { value: '100' } }); // credit line 1
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Journal entry created.', 'success');
    });
  });

  it('journal entry creation error shows toast', async () => {
    journalsData = [{ id: 'j1', name: 'Sales', type: 'sales', is_active: 1 }];
    accountsData = [{ id: 'a1', code: '1000', name: 'Cash', type: 'asset', is_active: 1, parent_id: null }];
    mockCreateJournalEntry.mockRejectedValue(new Error('je fail'));
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-journals'));
    fireEvent.click(screen.getAllByText('New Entry')[0]);
    fireEvent.change(screen.getByTestId('select-Journal *'), { target: { value: 'j1' } });
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[1], { target: { value: 'a1' } });
    fireEvent.change(selects[2], { target: { value: 'a1' } });
    const lineInputs = screen.getAllByTestId('input');
    fireEvent.change(lineInputs[0], { target: { value: '100' } }); // debit line 0
    fireEvent.change(lineInputs[3], { target: { value: '100' } }); // credit line 1
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error'), 'error');
    });
  });

  it('posts journal entry', async () => {
    entriesData = [{ id: 'e1', journal_id: 'j1', journal_name: 'Sales', date: '2025-01-15', description: 'Draft', reference: '', posted: 0, lines: [] }];
    mockPostJournalEntry.mockResolvedValue({} as never);
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-journals'));
    fireEvent.click(screen.getByText('Post'));
    await waitFor(() => {
      expect(mockPostJournalEntry).toHaveBeenCalledWith('e1');
      expect(mockShowToast).toHaveBeenCalledWith('Entry posted.', 'success');
    });
  });

  it('post entry error shows toast', async () => {
    entriesData = [{ id: 'e1', journal_id: 'j1', journal_name: 'Sales', date: '2025-01-15', description: '', reference: '', posted: 0, lines: [] }];
    mockPostJournalEntry.mockRejectedValue(new Error('post fail'));
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-journals'));
    fireEvent.click(screen.getByText('Post'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error'), 'error');
    });
  });

  it('already posted entry shows no post button', () => {
    entriesData = [{ id: 'e1', journal_id: 'j1', journal_name: 'Sales', date: '2025-01-15', description: '', reference: '', posted: 1, lines: [] }];
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-journals'));
    expect(screen.queryByText('Post')).not.toBeInTheDocument();
  });

  // === Invoices Tab ===
  it('switches to invoices tab with empty state', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-invoices'));
    expect(screen.getByText('No invoices')).toBeInTheDocument();
  });

  it('renders invoices with data', () => {
    invoicesData = [{ id: 'i1', invoice_number: 'INV001', type: 'sales', contact_id: null, issue_date: '2025-01-01', due_date: null, total_amount: 500, paid_amount: 0, status: 'draft', currency: 'USD' }];
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-invoices'));
    expect(screen.getByText('INV001')).toBeInTheDocument();
  });

  it('opens new invoice modal', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-invoices'));
    fireEvent.click(screen.getAllByText('New Invoice')[0]);
    expect(screen.getByTestId('form-modal')).toBeInTheDocument();
  });

  it('validates at least one line item required', async () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-invoices'));
    fireEvent.click(screen.getAllByText('New Invoice')[0]);
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('At least one line item required.', 'warning');
    });
  });

  it('creates invoice successfully', async () => {
    mockCreateFinancialInvoice.mockResolvedValue({} as never);
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-invoices'));
    fireEvent.click(screen.getAllByText('New Invoice')[0]);
    // Line-item inputs (no label): desc0=0, qty0=1, price0=2
    const lineInputs = screen.getAllByTestId('input');
    fireEvent.change(lineInputs[0], { target: { value: 'Test service' } }); // description
    fireEvent.change(lineInputs[2], { target: { value: '100' } });         // unitPrice
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockCreateFinancialInvoice).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('Invoice created.', 'success');
    });
  });

  it('invoice creation error shows toast', async () => {
    mockCreateFinancialInvoice.mockRejectedValue(new Error('inv fail'));
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-invoices'));
    fireEvent.click(screen.getAllByText('New Invoice')[0]);
    const lineInputs = screen.getAllByTestId('input');
    fireEvent.change(lineInputs[0], { target: { value: 'Service' } });
    fireEvent.change(lineInputs[2], { target: { value: '50' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error'), 'error');
    });
  });

  it('sends draft invoice', async () => {
    invoicesData = [{ id: 'i1', invoice_number: 'INV001', type: 'sales', contact_id: null, issue_date: '2025-01-01', due_date: null, total_amount: 100, paid_amount: 0, status: 'draft', currency: 'USD' }];
    mockUpdateInvoiceStatus.mockResolvedValue({} as never);
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-invoices'));
    fireEvent.click(screen.getByText('Send'));
    await waitFor(() => {
      expect(mockUpdateInvoiceStatus).toHaveBeenCalledWith('i1', 'sent');
      expect(mockShowToast).toHaveBeenCalledWith('Invoice marked as sent.', 'success');
    });
  });

  it('marks sent invoice as paid', async () => {
    invoicesData = [{ id: 'i1', invoice_number: 'INV001', type: 'sales', contact_id: null, issue_date: '2025-01-01', due_date: null, total_amount: 100, paid_amount: 0, status: 'sent', currency: 'USD' }];
    mockUpdateInvoiceStatus.mockResolvedValue({} as never);
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-invoices'));
    fireEvent.click(screen.getByText('Mark Paid'));
    await waitFor(() => {
      expect(mockUpdateInvoiceStatus).toHaveBeenCalledWith('i1', 'paid');
      expect(mockShowToast).toHaveBeenCalledWith('Invoice marked as paid.', 'success');
    });
  });

  it('invoice status update error shows toast', async () => {
    invoicesData = [{ id: 'i1', invoice_number: 'INV001', type: 'sales', contact_id: null, issue_date: '2025-01-01', due_date: null, total_amount: 100, paid_amount: 0, status: 'draft', currency: 'USD' }];
    mockUpdateInvoiceStatus.mockRejectedValue(new Error('status fail'));
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-invoices'));
    fireEvent.click(screen.getByText('Send'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error'), 'error');
    });
  });

  // === Payments Tab ===
  it('switches to payments tab with empty state', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-payments'));
    expect(screen.getByText('No payments')).toBeInTheDocument();
  });

  it('renders payments with data', () => {
    paymentsData = [{ id: 'p1', invoice_id: 'i1', amount: 250, payment_date: '2025-01-10', method: 'cash', status: 'completed', reference: 'CASH01' }];
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-payments'));
    expect(screen.getByText('$250.00')).toBeInTheDocument();
    expect(screen.getByText('cash')).toBeInTheDocument();
    expect(screen.getByText('completed')).toBeInTheDocument();
  });

  it('opens record payment modal', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-payments'));
    fireEvent.click(screen.getAllByText('Record Payment')[0]);
    expect(screen.getByTestId('form-modal')).toBeInTheDocument();
  });

  it('validates payment amount required', async () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-payments'));
    fireEvent.click(screen.getAllByText('Record Payment')[0]);
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Amount is required.', 'warning');
    });
  });

  it('creates payment successfully', async () => {
    mockCreatePayment.mockResolvedValue({} as never);
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-payments'));
    fireEvent.click(screen.getAllByText('Record Payment')[0]);
    fireEvent.change(screen.getByTestId('input-Amount *'), { target: { value: '100' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockCreatePayment).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('Payment recorded.', 'success');
    });
  });

  it('payment creation error shows toast', async () => {
    mockCreatePayment.mockRejectedValue(new Error('pay fail'));
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-payments'));
    fireEvent.click(screen.getAllByText('Record Payment')[0]);
    fireEvent.change(screen.getByTestId('input-Amount *'), { target: { value: '100' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error'), 'error');
    });
  });

  // === Tax Rates Tab ===
  it('switches to taxes tab with empty state', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-taxes'));
    expect(screen.getByText('No tax rates')).toBeInTheDocument();
  });

  it('renders tax rates with data', () => {
    taxRatesData = [{ id: 't1', name: 'VAT', rate: 14, jurisdiction: 'Egypt', is_default: 1 }];
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-taxes'));
    expect(screen.getByText('VAT')).toBeInTheDocument();
    expect(screen.getByText('14%')).toBeInTheDocument();
  });

  it('opens add tax rate modal', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-taxes'));
    // There are two "Add Tax Rate" buttons (header + empty state)
    fireEvent.click(screen.getAllByText('Add Tax Rate')[0]);
    expect(screen.getByTestId('form-modal')).toBeInTheDocument();
  });

  it('validates tax rate name and rate required', async () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-taxes'));
    fireEvent.click(screen.getAllByText('Add Tax Rate')[0]);
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Name and rate are required.', 'warning');
    });
  });

  it('creates tax rate successfully', async () => {
    mockCreateTaxRate.mockResolvedValue({} as never);
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-taxes'));
    fireEvent.click(screen.getAllByText('Add Tax Rate')[0]);
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'GST' } });
    fireEvent.change(screen.getByTestId('input-Rate (%) *'), { target: { value: '10' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockCreateTaxRate).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('Tax rate created.', 'success');
    });
  });

  it('tax rate creation error shows toast', async () => {
    mockCreateTaxRate.mockRejectedValue(new Error('tax fail'));
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-taxes'));
    // There are two "Add Tax Rate" buttons (header + empty state)
    const addButtons = screen.getAllByText('Add Tax Rate');
    fireEvent.click(addButtons[0]);
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'GST' } });
    fireEvent.change(screen.getByTestId('input-Rate (%) *'), { target: { value: '10' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error'), 'error');
    });
  });

  it('edits tax rate from table', async () => {
    taxRatesData = [{ id: 't1', name: 'VAT', rate: 14, jurisdiction: 'Egypt', is_default: 1 }];
    mockCreateTaxRate.mockResolvedValue({} as never);
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-taxes'));
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByText('Edit Tax Rate')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockCreateTaxRate).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('Tax rate updated.', 'success');
    });
  });

  // === Marketplace Payouts ===
  it('shows payouts empty state', () => {
    renderPanel();
    expect(screen.getByText('Marketplace Payouts')).toBeInTheDocument();
    expect(screen.getByText('No marketplace payouts yet.')).toBeInTheDocument();
  });

  it('renders payouts with data', () => {
    payoutsData = [{ id: 'po1', amount: 500, currency: 'USD', method: 'bank_transfer', status: 'paid', reference: 'REF001', notes: null, itemCount: 5, createdAt: '2025-01-01T00:00:00Z', paidAt: '2025-01-05T00:00:00Z' }];
    renderPanel();
    expect(screen.getByText('REF001')).toBeInTheDocument();
  });

  it('shows outstanding amount when pending payouts exist', () => {
    payoutsData = [
      { id: 'po1', amount: 100, currency: 'USD', method: 'bank_transfer', status: 'pending', reference: null, notes: null, itemCount: 2, createdAt: '2025-01-01T00:00:00Z', paidAt: null },
      { id: 'po2', amount: 200, currency: 'USD', method: 'cash', status: 'paid', reference: null, notes: null, itemCount: 3, createdAt: '2025-01-02T00:00:00Z', paidAt: '2025-01-03T00:00:00Z' },
    ];
    renderPanel();
    expect(screen.getByTestId('payouts-outstanding')).toBeInTheDocument();
  });

  // === Tab switching ===
  it('displays correct tab labels', () => {
    renderPanel();
    expect(screen.getByText('Chart of Accounts')).toBeInTheDocument();
    expect(screen.getByText('Journal Entries')).toBeInTheDocument();
    expect(screen.getByText('Invoices')).toBeInTheDocument();
    expect(screen.getByText('Payments')).toBeInTheDocument();
    expect(screen.getByText('Tax Rates')).toBeInTheDocument();
  });
});
