import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RatePlansPanel from '@/components/admin/RatePlansPanel';

const mockShowToast = vi.fn();
const mockGetRatePlans = vi.fn();
const mockSaveRatePlan = vi.fn();
const mockDeleteRatePlan = vi.fn();
const mockTrackEvent = vi.fn();

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/api', () => ({
  getRatePlans: (...args: unknown[]) => mockGetRatePlans(...args),
  saveRatePlan: (...args: unknown[]) => mockSaveRatePlan(...args),
  deleteRatePlan: (...args: unknown[]) => mockDeleteRatePlan(...args),
}));

vi.mock('@/lib/plausible', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

vi.mock('@/lib/utils', () => ({
  formatCurrency: (n: number) => `$${Number(n).toFixed(2)}`,
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('@/components/ui/Select', () => ({
  Select: ({ options, value, onChange, label }: { options: { value: string; label: string }[]; value?: string; onChange: (e: { target: { value: string } }) => void; label?: string }) => (
    <div>
      {label && <label>{label}</label>}
      <select
        data-testid={label ? `select-${label}` : 'select-default'}
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
  DataTable: ({ data, columns, emptyMessage, actions }: { data: unknown[]; columns?: { key: string; render?: (row: unknown) => React.ReactNode }[]; emptyMessage?: string; actions?: (row: unknown) => React.ReactNode }) => (
    <div>
      {data.length === 0 && <p>{emptyMessage}</p>}
      {data.map((item: unknown, i: number) => (
        <div key={i} data-testid="data-row">
          {columns &&
            columns.map((col) => (
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

vi.mock('@/components/ui/Badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/hooks/useQueryHooks', () => ({
  useProductsQuery: () => ({
    data: [
      { id: 'p1', name: 'Standard Tent', type: 'room', tenantId: 'acaciacamp', sellingPrice: 100, capacity: 2, isActive: true },
      { id: 'p2', name: 'Deluxe Cabin', type: 'room', tenantId: 'acaciacamp', sellingPrice: 250, capacity: 4, isActive: true },
    ],
    isLoading: false,
    error: null,
  }),
}));

const camps = [{ id: 'c1', name: 'Camp 1', location: 'Sinai', startDate: '2025-01-01', endDate: '2025-12-31', capacity: 50, status: 'active', notes: '' }];

describe('RatePlansPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRatePlans.mockResolvedValue([]);
  });

  it('renders with loading state', () => {
    mockGetRatePlans.mockReturnValue(new Promise(() => {}));
    render(<RatePlansPanel campIds={['c1']} camps={camps} />);
    expect(screen.getByText('Rate Plans')).toBeInTheDocument();
    expect(screen.getByText('Loading rate plans...')).toBeInTheDocument();
  });

  it('shows empty state when no plans', async () => {
    render(<RatePlansPanel campIds={['c1']} camps={camps} />);
    await waitFor(() => {
      expect(screen.getByText('No rate plans yet')).toBeInTheDocument();
    });
  });

  it('shows Add Plan button', async () => {
    render(<RatePlansPanel campIds={['c1']} camps={camps} />);
    await waitFor(() => {
      expect(screen.getAllByText('Add Plan').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('handles load error', async () => {
    mockGetRatePlans.mockRejectedValue(new Error('Failed'));
    render(<RatePlansPanel campIds={['c1']} camps={camps} />);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Failed to load rate plans'), 'error');
    });
  });

  it('displays rate plan data when plans exist', async () => {
    mockGetRatePlans.mockResolvedValue([
      { id: 'rp1', campId: 'c1', name: 'Peak Season', productId: 'p1', pricePerNight: 200, minStay: 3, isActive: 1, startDate: '2025-06-01', endDate: '2025-08-31', season: 'peak' },
    ]);
    render(<RatePlansPanel campIds={['c1']} camps={camps} />);
    await waitFor(() => {
      expect(screen.getByText('Peak Season')).toBeInTheDocument();
    });
  });

  it('opens add plan form', async () => {
    render(<RatePlansPanel campIds={['c1']} camps={camps} />);
    await waitFor(() => {
      expect(screen.getAllByText('Add Plan').length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(screen.getAllByText('Add Plan')[0]);
    await waitFor(() => {
      expect(screen.getByText('Add Rate Plan')).toBeInTheDocument();
    });
  });

  it('validates name on save', async () => {
    render(<RatePlansPanel campIds={['c1']} camps={camps} />);
    await waitFor(() => {
      expect(screen.getAllByText('Add Plan').length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(screen.getAllByText('Add Plan')[0]);
    await waitFor(() => {
      expect(screen.getByText('Add Rate Plan')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Name is required.', 'warning');
    });
  });

  it('saves plan successfully', async () => {
    mockSaveRatePlan.mockResolvedValueOnce({});
    mockGetRatePlans.mockResolvedValue([
      { id: 'rp1', campId: 'c1', name: 'New Plan', productId: 'p1', pricePerNight: 100, minStay: 1, isActive: 1, startDate: null, endDate: null, season: 'all' },
    ]);
    render(<RatePlansPanel campIds={['c1']} camps={camps} />);
    await waitFor(() => {
      expect(screen.getAllByText('Add Plan').length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(screen.getAllByText('Add Plan')[0]);
    await waitFor(() => {
      expect(screen.getByText('Add Rate Plan')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'New Plan' } });
    fireEvent.change(screen.getByTestId('select-Product *'), { target: { value: 'p1' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockSaveRatePlan).toHaveBeenCalled();
    });
  });

  it('shows error when save fails', async () => {
    mockSaveRatePlan.mockRejectedValueOnce(new Error('Save failed'));
    render(<RatePlansPanel campIds={['c1']} camps={camps} />);
    await waitFor(() => {
      expect(screen.getAllByText('Add Plan').length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(screen.getAllByText('Add Plan')[0]);
    await waitFor(() => {
      expect(screen.getByText('Add Rate Plan')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'New Plan' } });
    fireEvent.change(screen.getByTestId('select-Product *'), { target: { value: 'p1' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: Save failed', 'error');
    });
  });

  it('shows delete button for existing plans', async () => {
    mockGetRatePlans.mockResolvedValue([
      { id: 'rp1', campId: 'c1', name: 'Peak Season', productId: 'p1', pricePerNight: 200, minStay: 3, isActive: 1, startDate: null, endDate: null, season: 'peak' },
    ]);
    render(<RatePlansPanel campIds={['c1']} camps={camps} />);
    await waitFor(() => {
      expect(screen.getByText('Peak Season')).toBeInTheDocument();
    });
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('renders all table columns with formatted values', async () => {
    mockGetRatePlans.mockResolvedValue([
      { id: 'rp1', campId: 'c1', name: 'Peak Season', productId: 'p1', pricePerNight: 200, minStay: 3, isActive: 1, startDate: '2025-06-01', endDate: '2025-08-31', season: 'peak' },
    ]);
    render(<RatePlansPanel campIds={['c1']} camps={camps} />);
    await waitFor(() => {
      expect(screen.getByText('Peak Season')).toBeInTheDocument();
    });
    expect(screen.getByTestId('cell-pricePerNight')).toHaveTextContent('$200.00');
    expect(screen.getByTestId('cell-minStay')).toHaveTextContent('3');
    expect(screen.getByTestId('cell-season')).toHaveTextContent('peak');
    expect(screen.getByTestId('cell-isActive')).toHaveTextContent('Active');
    expect(screen.getByTestId('cell-campId')).toHaveTextContent('Camp 1');
  });

  it('renders Inactive status and N/A camp fallback', async () => {
    mockGetRatePlans.mockResolvedValue([
      { id: 'rp2', campId: 'r99', name: 'Off Peak', productId: 'p2', pricePerNight: 0, minStay: 1, isActive: 0, startDate: null, endDate: null, season: 'off' },
    ]);
    render(<RatePlansPanel campIds={['c1', 'r99']} camps={camps} />);
    await waitFor(() => {
      expect(screen.getByText('Off Peak')).toBeInTheDocument();
    });
    expect(screen.getByTestId('cell-isActive')).toHaveTextContent('Inactive');
    expect(screen.getByTestId('cell-campId')).toHaveTextContent('N/A');
  });

  it('opens edit form prefilled and updates plan', async () => {
    mockGetRatePlans.mockResolvedValue([
      { id: 'rp1', campId: 'c1', name: 'Peak Season', productId: 'p1', pricePerNight: 200, minStay: 3, isActive: 1, startDate: '2025-06-01', endDate: '2025-08-31', season: 'peak' },
    ]);
    render(<RatePlansPanel campIds={['c1']} camps={camps} />);
    await waitFor(() => {
      expect(screen.getByText('Peak Season')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Edit'));
    await waitFor(() => {
      expect(screen.getByText('Edit Rate Plan')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('200')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Renamed Plan' } });
    fireEvent.click(screen.getByText('Update'));
    await waitFor(() => {
      expect(mockSaveRatePlan).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Renamed Plan', pricePerNight: 200, minStay: 3, season: 'peak', startDate: '2025-06-01', endDate: '2025-08-31' }),
        'rp1',
      );
    });
    expect(mockShowToast).toHaveBeenCalledWith('Plan updated.', 'success');
    expect(mockTrackEvent).toHaveBeenCalledWith('Tenant: Price Updated', { productId: 'p1', planId: 'rp1' });
  });

  it('closes the form modal without saving', async () => {
    render(<RatePlansPanel campIds={['c1']} camps={camps} />);
    await waitFor(() => {
      expect(screen.getAllByText('Add Plan').length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(screen.getAllByText('Add Plan')[0]);
    await waitFor(() => {
      expect(screen.getByText('Add Rate Plan')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Close'));
    await waitFor(() => {
      expect(screen.queryByText('Add Rate Plan')).not.toBeInTheDocument();
    });
  });

  it('deletes plan after confirmation', async () => {
    mockGetRatePlans.mockResolvedValue([
      { id: 'rp1', campId: 'c1', name: 'Peak Season', productId: 'p1', pricePerNight: 200, minStay: 3, isActive: 1, startDate: null, endDate: null, season: 'peak' },
    ]);
    render(<RatePlansPanel campIds={['c1']} camps={camps} />);
    await waitFor(() => {
      expect(screen.getByText('Peak Season')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => {
      expect(screen.getByText('Delete Rate Plan')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Confirm'));
    await waitFor(() => {
      expect(mockDeleteRatePlan).toHaveBeenCalledWith('rp1');
    });
    expect(mockShowToast).toHaveBeenCalledWith('Deleted.', 'success');
  });

  it('cancels delete without calling api', async () => {
    mockGetRatePlans.mockResolvedValue([
      { id: 'rp1', campId: 'c1', name: 'Peak Season', productId: 'p1', pricePerNight: 200, minStay: 3, isActive: 1, startDate: null, endDate: null, season: 'peak' },
    ]);
    render(<RatePlansPanel campIds={['c1']} camps={camps} />);
    await waitFor(() => {
      expect(screen.getByText('Peak Season')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => {
      expect(screen.getByText('Delete Rate Plan')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => {
      expect(screen.queryByText('Delete Rate Plan')).not.toBeInTheDocument();
    });
    expect(mockDeleteRatePlan).not.toHaveBeenCalled();
  });

  it('shows error when delete fails', async () => {
    mockDeleteRatePlan.mockRejectedValueOnce(new Error('Delete failed'));
    mockGetRatePlans.mockResolvedValue([
      { id: 'rp1', campId: 'c1', name: 'Peak Season', productId: 'p1', pricePerNight: 200, minStay: 3, isActive: 1, startDate: null, endDate: null, season: 'peak' },
    ]);
    render(<RatePlansPanel campIds={['c1']} camps={camps} />);
    await waitFor(() => {
      expect(screen.getByText('Peak Season')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => {
      expect(screen.getByText('Delete Rate Plan')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Confirm'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: Delete failed', 'error');
    });
  });

  it('fills every form field and saves a new plan', async () => {
    mockSaveRatePlan.mockResolvedValueOnce({ id: 'rp1', success: true });
    mockGetRatePlans.mockResolvedValue([
      { id: 'rp1', campId: 'c1', name: 'Custom Season', productId: 'p1', pricePerNight: 150, minStay: 2, isActive: 1, startDate: '2025-06-01', endDate: '2025-08-31', season: 'off' },
    ]);
    render(<RatePlansPanel campIds={['c1']} camps={camps} />);
    await waitFor(() => {
      expect(screen.getAllByText('Add Plan').length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(screen.getAllByText('Add Plan')[0]);
    await waitFor(() => {
      expect(screen.getByText('Add Rate Plan')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Custom Season' } });
    fireEvent.change(screen.getByTestId('select-Product *'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText('Price Per Night'), { target: { value: '150' } });
    fireEvent.change(screen.getByTestId('select-Season'), { target: { value: 'off' } });
    fireEvent.change(screen.getByLabelText('Min Stay (nights)'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Start Date'), { target: { value: '2025-06-01' } });
    fireEvent.change(screen.getByLabelText('End Date'), { target: { value: '2025-08-31' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockSaveRatePlan).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Custom Season', productId: 'p1', pricePerNight: 150, minStay: 2, season: 'off', startDate: '2025-06-01', endDate: '2025-08-31' }),
        undefined,
      );
    });
    expect(mockShowToast).toHaveBeenCalledWith('Plan created.', 'success');
    expect(mockTrackEvent).toHaveBeenCalledWith('Tenant: Price Updated', { productId: 'p1', planId: 'rp1' });
  });

  it('renders the Min Stay column values for every plan', async () => {
    mockGetRatePlans.mockResolvedValue([
      { id: 'rp1', campId: 'c1', name: 'Peak Season', productId: 'p1', pricePerNight: 200, minStay: 3, isActive: 1, startDate: null, endDate: null, season: 'peak' },
      { id: 'rp2', name: 'Off Season', productId: 'p2', pricePerNight: 90, minStay: 2, isActive: 1, startDate: null, endDate: null, season: 'off' },
    ]);
    render(<RatePlansPanel campIds={['c1']} camps={camps} />);
    await waitFor(() => {
      expect(screen.getByText('Peak Season')).toBeInTheDocument();
    });
    const minStayCells = screen.getAllByTestId('cell-minStay');
    expect(minStayCells.map((c) => c.textContent)).toEqual(['3', '2']);
  });

  it('does not expose a per-camp duplicate edit affordance in the form', async () => {
    mockGetRatePlans.mockResolvedValue([
      { id: 'rp1', campId: 'c1', name: 'Peak Season', productId: 'p1', pricePerNight: 200, minStay: 3, isActive: 1, startDate: null, endDate: null, season: 'peak' },
    ]);
    render(<RatePlansPanel campIds={['c1']} camps={camps} />);
    await waitFor(() => {
      expect(screen.getByText('Peak Season')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Add Plan'));
    await waitFor(() => {
      expect(screen.getByText('Add Rate Plan')).toBeInTheDocument();
    });
    // campId is display-only: the form must not offer a Camp selector
    expect(screen.queryByTestId('select-Camp')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Camp')).not.toBeInTheDocument();
    // the read-only Camp column still renders the resolved camp name
    expect(screen.getByTestId('cell-campId')).toHaveTextContent('Camp 1');
  });
});
