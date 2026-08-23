import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PlanningPanel from '@/components/admin/PlanningPanel';

const mockShowToast = vi.fn();
const mockSavePlan = vi.fn();
const mockDeletePlan = vi.fn();
let mockPlans: unknown[] = [];
let mockPlansLoading = false;

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

// Phase 6: PlanningPanel consumes TanStack Query data hooks instead of the
// legacy useAdminData fetchers.
vi.mock('@/hooks/useQueryHooks', () => ({
  queryKeys: {
    plans: ['admin', 'plans'],
  },
  usePlansQuery: () => ({ data: mockPlans, isLoading: mockPlansLoading }),
}));

vi.mock('@/lib/api', () => ({
  savePlan: (...args: unknown[]) => mockSavePlan(...args),
  deletePlan: (...args: unknown[]) => mockDeletePlan(...args),
}));

vi.mock('@/lib/utils', () => ({
  formatCurrency: (n: number) => `$${Number(n).toFixed(2)}`,
  formatDate: (d: string) => d || '-',
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('@/components/ui/Select', () => ({
  Select: ({ options, value, onChange, label }: { options: { value: string; label: string }[]; value?: string; onChange: (e: { target: { value: string } }) => void; label?: string }) => (
    <div>
      {label && <label>{label}</label>}
      <select
        data-testid={label ? `select-${label}` : 'select-filter'}
        value={value || ''}
        onChange={onChange}
      >
        {options.map((opt: { value: string; label: string }) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  ),
}));

vi.mock('@/components/ui/DataTable', () => ({
  DataTable: ({ data, columns, emptyMessage, actions }: { data: unknown[]; columns: { key: string; render?: (item: unknown) => React.ReactNode }[]; emptyMessage?: string; actions?: (row: unknown) => React.ReactNode }) => (
    <div>
      {data.length === 0 && <p>{emptyMessage}</p>}
      {data.map((item: unknown, i: number) => (
        <div key={i} data-testid="data-row">
          {columns.map((col) => (
            <span key={col.key} data-testid={`cell-${col.key}`}>
              {col.render ? col.render(item) : String((item as Record<string, unknown>)[col.key] ?? '')}
            </span>
          ))}
          {actions && actions(item)}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('@/components/ui/FormModal', () => ({
  FormModal: ({ open, title, children, onClose, onSubmit, submitLabel }: { open: boolean; title: string; children: React.ReactNode; onClose: () => void; onSubmit: () => void; submitLabel: string }) => (
    open ? (
      <div data-testid="form-modal">
        <h3>{title}</h3>
        {children}
        <button onClick={onClose}>Close</button>
        <button onClick={onSubmit}>{submitLabel}</button>
      </div>
    ) : null
  ),
}));

vi.mock('@/components/ui/ConfirmDialog', () => ({
  ConfirmDialog: ({ open, title, onConfirm, onCancel }: { open: boolean; title: string; onConfirm: () => void; onCancel: () => void }) => (
    open ? (
      <div data-testid="confirm-dialog">
        <h3>{title}</h3>
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null
  ),
}));

const camps = [{ id: 'c1', name: 'Camp 1', location: 'Sinai', startDate: '2025-01-01', endDate: '2025-12-31', capacity: 50, status: 'active', notes: '' }];

// The panel reads useQueryClient() to invalidate concerns — provide a fresh
// client per render.
function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PlanningPanel campIds={['c1']} camps={camps} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPlans = [
    { id: 'p1', campId: 'c1', name: 'Plan 1', description: '', date: '2025-07-15', time: '10:00', capacity: 20, status: 'upcoming', category: 'Activity' },
  ];
  mockPlansLoading = false;
});

describe('PlanningPanel', () => {
  it('renders with list view by default', () => {
    renderPanel();
    expect(screen.getByText('Camp Planning')).toBeInTheDocument();
    expect(screen.getAllByText('Add Plan').length).toBeGreaterThanOrEqual(1);
  });

  it('shows plan data when plans exist', () => {
    renderPanel();
    expect(screen.getByText('Plan 1')).toBeInTheDocument();
  });

  it('switches to calendar view', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('Calendar'));
    await waitFor(() => {
      expect(screen.getByText(/Prev/)).toBeInTheDocument();
      expect(screen.getByText(/Next/)).toBeInTheDocument();
    });
  });

  it('navigates calendar months', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('Calendar'));
    await waitFor(() => {
      expect(screen.getByText(/Next/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/Next/));
    fireEvent.click(screen.getByText(/Prev/));
  });

  it('opens add plan form', async () => {
    renderPanel();
    fireEvent.click(screen.getAllByText('Add Plan')[0]);
    await waitFor(() => {
      expect(screen.getByText('Add New Plan')).toBeInTheDocument();
    });
  });

  it('validates plan on save', async () => {
    renderPanel();
    fireEvent.click(screen.getAllByText('Add Plan')[0]);
    await waitFor(() => {
      expect(screen.getByText('Add New Plan')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Save Plan'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Plan name is required.', 'warning');
    });
  });

  it('saves plan successfully', async () => {
    mockSavePlan.mockResolvedValueOnce({});
    renderPanel();
    fireEvent.click(screen.getAllByText('Add Plan')[0]);
    await waitFor(() => {
      expect(screen.getByText('Add New Plan')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('Plan name'), { target: { value: 'New Plan' } });
    fireEvent.click(screen.getByText('Save Plan'));
    await waitFor(() => {
      expect(mockSavePlan).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('Plan created.', 'success');
    });
  });

  it('shows error when save plan fails', async () => {
    mockSavePlan.mockRejectedValueOnce(new Error('Plan save failed'));
    renderPanel();
    fireEvent.click(screen.getAllByText('Add Plan')[0]);
    await waitFor(() => {
      expect(screen.getByText('Add New Plan')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('Plan name'), { target: { value: 'New Plan' } });
    fireEvent.click(screen.getByText('Save Plan'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error saving plan: Plan save failed', 'error');
    });
  });

  it('shows empty state when no plans', () => {
    mockPlans = [];
    renderPanel();
    expect(screen.getByText('No plans yet')).toBeInTheDocument();
  });

  it('shows delete button for plans', () => {
    renderPanel();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('shows filter status dropdown', () => {
    renderPanel();
    expect(screen.getByTestId('select-filter')).toBeInTheDocument();
  });

  it('filters plans by status', async () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('select-filter'), { target: { value: 'upcoming' } });
    await waitFor(() => {
      expect(screen.getByText('Plan 1')).toBeInTheDocument();
    });
  });

  it('shows empty filtered state', () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('select-filter'), { target: { value: 'completed' } });
    expect(screen.getByText('No plans yet')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockPlansLoading = true;
    renderPanel();
    expect(screen.getByText('Loading plans...')).toBeInTheDocument();
  });

  it('sorts plans by date', () => {
    mockPlans = [
      { id: 'p1', campId: 'c1', name: 'Plan 1', description: '', date: '', time: '10:00', capacity: 20, status: 'upcoming', category: 'Activity' },
      { id: 'p2', campId: 'c1', name: 'Plan 2', description: '', date: '2025-08-01', time: '11:00', capacity: 30, status: 'completed', category: 'Meal' },
    ];
    renderPanel();
    expect(screen.getByText('Plan 1')).toBeInTheDocument();
    expect(screen.getByText('Plan 2')).toBeInTheDocument();
    expect(screen.getAllByTestId('cell-campId')[0]).toHaveTextContent('Camp 1');
    expect(screen.getAllByTestId('cell-date').length).toBe(2);
    expect(screen.getAllByTestId('cell-time').length).toBe(2);
    expect(screen.getAllByTestId('cell-category').length).toBe(2);
    expect(screen.getAllByTestId('cell-capacity')[0]).toHaveTextContent('20');
    expect(screen.getAllByTestId('cell-status')[0]).toHaveTextContent(/upcoming/i);
  });

  it('edits an existing plan', async () => {
    mockSavePlan.mockResolvedValueOnce({});
    renderPanel();
    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => {
      expect(screen.getByText('Edit Plan')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByDisplayValue('Plan 1'), { target: { value: 'Plan 1 Updated' } });
    fireEvent.click(screen.getByText('Update Plan'));
    await waitFor(() => {
      expect(mockSavePlan).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1', name: 'Plan 1 Updated' }));
      expect(mockShowToast).toHaveBeenCalledWith('Plan updated.', 'success');
    });
  });

  it('deletes a plan with confirmation', async () => {
    mockDeletePlan.mockResolvedValueOnce({});
    renderPanel();
    fireEvent.click(screen.getAllByText('Delete')[0]);
    await waitFor(() => {
      expect(screen.getByText('Delete Plan')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Confirm'));
    await waitFor(() => {
      expect(mockDeletePlan).toHaveBeenCalledWith('p1');
      expect(mockShowToast).toHaveBeenCalledWith('Plan deleted.', 'success');
    });
  });

  it('shows error when delete fails', async () => {
    mockDeletePlan.mockRejectedValueOnce(new Error('Delete failed'));
    renderPanel();
    fireEvent.click(screen.getAllByText('Delete')[0]);
    await waitFor(() => {
      expect(screen.getByText('Delete Plan')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Confirm'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error deleting plan: Delete failed', 'error');
    });
  });

  it('cancels delete dialog', async () => {
    renderPanel();
    fireEvent.click(screen.getAllByText('Delete')[0]);
    await waitFor(() => {
      expect(screen.getByText('Delete Plan')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => {
      expect(screen.queryByText('Delete Plan')).not.toBeInTheDocument();
    });
  });

  it('closes add plan form', async () => {
    renderPanel();
    fireEvent.click(screen.getAllByText('Add Plan')[0]);
    await waitFor(() => {
      expect(screen.getByText('Add New Plan')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Close'));
    await waitFor(() => {
      expect(screen.queryByText('Add New Plan')).not.toBeInTheDocument();
    });
  });

  it('switches back to list view', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('Calendar'));
    await waitFor(() => {
      expect(screen.getByText(/Prev/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('List'));
    await waitFor(() => {
      expect(screen.getAllByTestId('data-row').length).toBe(1);
    });
  });

  it('fills all plan form fields', async () => {
    mockSavePlan.mockResolvedValueOnce({});
    renderPanel();
    fireEvent.click(screen.getAllByText('Add Plan')[0]);
    await waitFor(() => {
      expect(screen.getByText('Add New Plan')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('Plan name'), { target: { value: 'New Plan' } });
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2025-08-05' } });
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '14:30' } });
    fireEvent.change(screen.getByLabelText('Capacity'), { target: { value: '25' } });
    fireEvent.change(screen.getByTestId('select-Status'), { target: { value: 'ongoing' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Activity' } });
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Desc' } });
    fireEvent.click(screen.getByText('Save Plan'));
    await waitFor(() => {
      expect(mockSavePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          campId: 'c1',
          name: 'New Plan',
          date: '2025-08-05',
          time: '14:30',
          capacity: 25,
          status: 'ongoing',
          category: 'Activity',
          description: 'Desc',
        }),
      );
      expect(mockShowToast).toHaveBeenCalledWith('Plan created.', 'success');
    });
  });

  it('calendar renders plan chips and opens edit on click', async () => {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`;
    mockPlans = [
      { id: 'p1', campId: 'c1', name: 'Plan A', description: '', date: dateStr, time: '10:00', capacity: 20, status: 'completed', category: 'Activity' },
      { id: 'p2', campId: 'c1', name: 'Plan B', description: '', date: dateStr, time: '11:00', capacity: 30, status: 'ongoing', category: 'Meal' },
      { id: 'p3', campId: 'c1', name: 'Plan C', description: '', date: dateStr, time: '12:00', capacity: 40, status: 'cancelled', category: 'Meeting' },
    ];
    renderPanel();
    fireEvent.click(screen.getByText('Calendar'));
    await waitFor(() => {
      expect(screen.getByText('Plan A')).toBeInTheDocument();
    });
    expect(screen.getByText('+1 more')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Plan A'));
    await waitFor(() => {
      expect(screen.getByText('Edit Plan')).toBeInTheDocument();
    });
  });
});
