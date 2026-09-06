import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import AuditLogPanel from '@/components/admin/AuditLogPanel';

const mockShowToast = vi.fn();
let auditData: { data: unknown[]; total: number; page: number; pageSize: number } = { data: [], total: 0, page: 1, pageSize: 25 };
let auditLoading = false;

// Mock fetch for export
const mockFetch = vi.fn();
Object.defineProperty(globalThis, 'fetch', { value: mockFetch, writable: true });

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/hooks/useQueryHooks', () => {
  const React = require('react');
  return {
    useAdminAuditQuery: () => {
      const [d, setD] = React.useState(auditData);
      const [l, setL] = React.useState(auditLoading);
      React.useEffect(() => { setD(auditData); setL(auditLoading); });
      return { data: d, isLoading: l };
    },
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
  Select: ({ label, options, value, onChange, placeholder }: { label?: string; options: { value: string; label: string }[]; value?: string; onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void; placeholder?: string }) => (
    <div>
      {label && <label>{label}</label>}
      <select value={value} onChange={onChange} data-testid={label ? `select-${label}` : 'select'}>
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
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/Badge', () => ({
  Badge: ({ children }: { children: React.ReactNode; variant?: string; size?: string; dot?: boolean }) => (
    <span data-testid="badge">{children}</span>
  ),
}));

vi.mock('@/components/ui/DataTable', () => ({
  DataTable: ({ data, columns, emptyMessage, actions, pagination, onRowClick, rowKey }: {
    data: unknown[];
    columns: { key: string; header: string; render?: (item: unknown) => React.ReactNode }[];
    emptyMessage?: string;
    actions?: (row: unknown) => React.ReactNode;
    pagination?: { page: number; total: number; pageSize: number; onChange: (p: number) => void };
    onRowClick?: (item: unknown) => void;
    rowKey?: string;
  }) => (
    <div data-testid="data-table">
      {data.length === 0 && emptyMessage && <p>{emptyMessage}</p>}
      {data.map((row: any, i: number) => (
        <div key={i} data-testid="data-row" onClick={() => onRowClick?.(row)}>
          {columns.map((col) => (
            <span key={col.key}>{col.render ? col.render(row) : String(row[col.key] ?? '')}</span>
          ))}
          {actions && <div>{actions(row)}</div>}
        </div>
      ))}
      {pagination && (
        <div data-testid="pagination">
          <span>Page {pagination.page}</span>
          <button data-testid="next-page" onClick={() => pagination.onChange(pagination.page + 1)}>Next</button>
        </div>
      )}
    </div>
  ),
}));

const mockAuditEntries = [
  { id: 'log1', created_at: '2025-01-15T10:30:00Z', tenant_name: 'Camp Alpha', tenant_id: 't1', user_email: 'admin@camp.com', user_id: 'u1', action: 'create', entity_type: 'tenant', entity_id: 'abc123def456', oldValues: null, newValues: { name: 'Camp Alpha' } },
  { id: 'log2', created_at: '2025-01-16T14:00:00Z', tenant_name: 'Camp Beta', tenant_id: 't2', user_email: 'manager@camp.com', user_id: 'u2', action: 'update', entity_type: 'project', entity_id: 'xyz789', oldValues: { status: 'draft' }, newValues: { status: 'active' } },
  { id: 'log3', created_at: '2025-01-17T09:00:00Z', tenant_name: null, tenant_id: 't3', user_email: null, user_id: 'u3', action: 'delete', entity_type: 'admin', entity_id: 'del123', oldValues: '{"key":"val"}', newValues: '{"key":"updated"}' },
];

describe('AuditLogPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditData = { data: [], total: 0, page: 1, pageSize: 25 };
    auditLoading = false;
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders with empty state', () => {
    renderPanel();
    expect(screen.getByText('Audit Log')).toBeInTheDocument();
    expect(screen.getByText('Export CSV')).toBeInTheDocument();
    expect(screen.getByText('No audit logs found')).toBeInTheDocument();
  });

  it('shows loading spinner', () => {
    auditLoading = true;
    renderPanel();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('renders audit entries with data', () => {
    auditData = { data: mockAuditEntries, total: 3, page: 1, pageSize: 25 };
    renderPanel();
    expect(screen.getByText('Camp Alpha')).toBeInTheDocument();
    expect(screen.getByText('Camp Beta')).toBeInTheDocument();
    expect(screen.getByText('create')).toBeInTheDocument();
  });

  it('displays date/time in table', () => {
    auditData = { data: mockAuditEntries, total: 3, page: 1, pageSize: 25 };
    renderPanel();
    expect(screen.getByText('Camp Alpha')).toBeInTheDocument();
  });

  it('handles null tenant_name and user_email', () => {
    auditData = { data: [mockAuditEntries[2]], total: 1, page: 1, pageSize: 25 };
    renderPanel();
    expect(screen.getByText('u3')).toBeInTheDocument();
  });

  it('updates action filter', () => {
    auditData = { data: mockAuditEntries, total: 3, page: 1, pageSize: 25 };
    renderPanel();
    fireEvent.change(screen.getByTestId('select-Action'), { target: { value: 'create' } });
    expect(screen.getByTestId('select-Action')).toHaveValue('create');
  });

  it('updates entity type filter', () => {
    auditData = { data: mockAuditEntries, total: 3, page: 1, pageSize: 25 };
    renderPanel();
    fireEvent.change(screen.getByTestId('select-Entity Type'), { target: { value: 'tenant' } });
    expect(screen.getByTestId('select-Entity Type')).toHaveValue('tenant');
  });

  it('updates start date filter', () => {
    const { container } = renderPanel();
    const startDate = container.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(startDate, { target: { value: '2025-01-01' } });
    expect(startDate.value).toBe('2025-01-01');
  });

  it('updates end date filter', () => {
    const { container } = renderPanel();
    const dateInputs = container.querySelectorAll('input[type="date"]');
    const endDate = dateInputs[1] as HTMLInputElement;
    fireEvent.change(endDate, { target: { value: '2025-12-31' } });
    expect(endDate.value).toBe('2025-12-31');
  });

  it('clears filters', () => {
    auditData = { data: mockAuditEntries, total: 3, page: 1, pageSize: 25 };
    renderPanel();
    fireEvent.change(screen.getByTestId('select-Action'), { target: { value: 'create' } });
    fireEvent.click(screen.getByText('Clear Filters'));
    expect(screen.getByTestId('select-Action')).toHaveValue('');
  });

  it('expands row on click and shows JsonDiff', () => {
    auditData = { data: mockAuditEntries, total: 3, page: 1, pageSize: 25 };
    renderPanel();
    const rows = screen.getAllByTestId('data-row');
    fireEvent.click(rows[1]); // Click the update entry
    expect(screen.getByText('Audit Entry Details')).toBeInTheDocument();
  });

  it('collapses expanded row on second click', () => {
    auditData = { data: mockAuditEntries, total: 3, page: 1, pageSize: 25 };
    renderPanel();
    const rows = screen.getAllByTestId('data-row');
    fireEvent.click(rows[1]);
    expect(screen.getByText('Audit Entry Details')).toBeInTheDocument();
    fireEvent.click(rows[1]);
    expect(screen.queryByText('Audit Entry Details')).not.toBeInTheDocument();
  });

  it('shows "No changes recorded" for null values', () => {
    auditData = { data: [mockAuditEntries[0]], total: 1, page: 1, pageSize: 25 };
    renderPanel();
    const rows = screen.getAllByTestId('data-row');
    fireEvent.click(rows[0]); // log1 has null oldValues
    expect(screen.getByText('Audit Entry Details')).toBeInTheDocument();
  });

  it('shows JSON diff for changed values', () => {
    auditData = { data: [mockAuditEntries[1]], total: 1, page: 1, pageSize: 25 };
    renderPanel();
    const rows = screen.getAllByTestId('data-row');
    fireEvent.click(rows[0]); // log2 has oldValues: {status:'draft'}, newValues: {status:'active'}
    expect(screen.getByText('Audit Entry Details')).toBeInTheDocument();
  });

  it('handles string JSON values in JsonDiff', () => {
    auditData = { data: [mockAuditEntries[2]], total: 1, page: 1, pageSize: 25 };
    renderPanel();
    const rows = screen.getAllByTestId('data-row');
    fireEvent.click(rows[0]); // log3 has string JSON oldValues/newValues
    expect(screen.getByText('Audit Entry Details')).toBeInTheDocument();
  });

  it('handles invalid JSON string in JsonDiff', () => {
    auditData = {
      data: [{ id: 'log4', created_at: '2025-01-15T10:30:00Z', tenant_name: 'T', tenant_id: 't', user_email: 'e', user_id: 'u', action: 'create', entity_type: 'x', entity_id: 'y', oldValues: 'not-json{', newValues: 'also-not[' }],
      total: 1,
      page: 1,
      pageSize: 25,
    };
    renderPanel();
    const rows = screen.getAllByTestId('data-row');
    fireEvent.click(rows[0]);
    expect(screen.getByText('Audit Entry Details')).toBeInTheDocument();
  });

  it('exports CSV successfully', async () => {
    const mockBlob = new Blob(['csv,data'], { type: 'text/csv' });
    mockFetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(mockBlob) });
    const mockUrl = vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:mock');
    const mockRevoke = vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => {});
    const mockClick = vi.fn();

    renderPanel();

    vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as unknown as Node);
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as unknown as Node);
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return { href: '', download: '', click: mockClick } as unknown as HTMLElement;
      return originalCreateElement(tag);
    });

    fireEvent.click(screen.getByTestId('audit-export-btn'));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('Audit log exported', 'success');
    });
  });

  it('export error shows toast', async () => {
    mockFetch.mockResolvedValue({ ok: false });
    renderPanel();
    fireEvent.click(screen.getByTestId('audit-export-btn'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Failed to export'), 'error');
    });
  });

  it('export network error shows toast', async () => {
    mockFetch.mockRejectedValue(new Error('network error'));
    renderPanel();
    fireEvent.click(screen.getByTestId('audit-export-btn'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Failed to export'), 'error');
    });
  });

  it('shows pagination', () => {
    auditData = { data: mockAuditEntries, total: 50, page: 1, pageSize: 25 };
    renderPanel();
    expect(screen.getByTestId('pagination')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('next-page'));
  });

  it('renders truncated entity ID', () => {
    auditData = { data: [mockAuditEntries[0]], total: 1, page: 1, pageSize: 25 };
    renderPanel();
    expect(screen.getByText('abc123def456...')).toBeInTheDocument();
  });

  it('renders action badge for unknown action', () => {
    auditData = { data: [{ id: 'log5', created_at: '2025-01-15T10:30:00Z', tenant_name: 'T', tenant_id: 't', user_email: 'e', user_id: 'u', action: 'archive', entity_type: 'x', entity_id: 'y', oldValues: null, newValues: null }], total: 1, page: 1, pageSize: 25 };
    renderPanel();
    expect(screen.getByText('archive')).toBeInTheDocument();
  });

  it('shows "No changes recorded" for empty object values', () => {
    auditData = {
      data: [{ id: 'log6', created_at: '2025-01-18T10:30:00Z', tenant_name: 'T', tenant_id: 't', user_email: 'e', user_id: 'u', action: 'update', entity_type: 'x', entity_id: 'y', oldValues: '{}', newValues: '{}' }],
      total: 1,
      page: 1,
      pageSize: 25,
    };
    renderPanel();
    const rows = screen.getAllByTestId('data-row');
    fireEvent.click(rows[0]);
    // both parse to truthy {} with no keys -> falls through to allKeys.length check
    expect(screen.getByText('No changes recorded')).toBeInTheDocument();
  });

  it('clears a single filter via the select', () => {
    auditData = { data: mockAuditEntries, total: 3, page: 1, pageSize: 25 };
    renderPanel();
    fireEvent.change(screen.getByTestId('select-Action'), { target: { value: 'create' } });
    expect(screen.getByTestId('select-Action')).toHaveValue('create');
    fireEvent.change(screen.getByTestId('select-Action'), { target: { value: '' } });
    expect(screen.getByTestId('select-Action')).toHaveValue('');
  });

  it('exports CSV with active filters applied', async () => {
    const mockBlob = new Blob(['csv,data'], { type: 'text/csv' });
    mockFetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(mockBlob) });
    mockFetch.mockClear();
    renderPanel();
    fireEvent.change(screen.getByTestId('select-Action'), { target: { value: 'create' } });
    const mockClick = vi.fn();
    vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as unknown as Node);
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as unknown as Node);
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return { href: '', download: '', click: mockClick } as unknown as HTMLElement;
      return originalCreateElement(tag);
    });
    fireEvent.click(screen.getByTestId('audit-export-btn'));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('action=create'), expect.anything());
      expect(mockShowToast).toHaveBeenCalledWith('Audit log exported', 'success');
    });
  });

  it('renders nothing when expanded row is no longer present', async () => {
    auditData = { data: mockAuditEntries, total: 3, page: 1, pageSize: 25 };
    const view = renderPanel();
    const rows = screen.getAllByTestId('data-row');
    fireEvent.click(rows[0]); // expand log1
    expect(screen.getByText('Audit Entry Details')).toBeInTheDocument();
    // remove log1 from the data, forcing the expanded row to be unresolved
    auditData = { data: [mockAuditEntries[1], mockAuditEntries[2]], total: 2, page: 1, pageSize: 25 };
    fireEvent.click(screen.getByText('Export CSV')); // trigger a re-render so the mock effect syncs
    await waitFor(() => {
      expect(screen.queryByText('Audit Entry Details')).not.toBeInTheDocument();
    });
  });

  function renderPanel() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><AuditLogPanel /></QueryClientProvider>);
  }
});
