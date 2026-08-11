import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CampsPanel from '@/components/admin/CampsPanel';

const mockShowToast = vi.fn();
const mockRefreshCamps = vi.fn();
const mockMutate = vi.fn();
const mockMutateDelete = vi.fn();
const mockCampMutateAsync = vi.fn();
const mockProductMutateAsync = vi.fn();
const mockRatePlanMutateAsync = vi.fn();
let mockCamps: unknown[] = [];
let mockCampsLoading = false;

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/hooks/useQueryHooks', () => ({
  useCampsQuery: () => ({ data: mockCamps, isLoading: mockCampsLoading }),
  useSaveCampMutation: () => ({ mutate: mockMutate, mutateAsync: mockCampMutateAsync, isPending: false }),
  useDeleteCampMutation: () => ({ mutate: mockMutateDelete, isPending: false }),
  useSaveProductMutation: () => ({ mutateAsync: mockProductMutateAsync, isPending: false }),
  useSaveRatePlanMutation: () => ({ mutateAsync: mockRatePlanMutateAsync, isPending: false }),
}));

vi.mock('@/lib/utils', () => ({
  formatCurrency: (n: number) => `$${Number(n).toFixed(2)}`,
  formatDate: (d: string) => d,
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

const singleCamp = {
  id: 'c1',
  name: 'Test Camp',
  location: 'Sinai',
  startDate: '2025-01-01',
  endDate: '2025-12-31',
  capacity: 50,
  status: 'active',
  notes: '',
};

describe('CampsPanel (single-camp admin)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCamps = [];
    mockCampsLoading = false;
  });

  it('renders with empty state and create action when no camp exists', () => {
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    expect(screen.getByText('Camp')).toBeInTheDocument();
    expect(screen.getByText('No camp yet')).toBeInTheDocument();
    expect(screen.getByText('Create Camp')).toBeInTheDocument();
  });

  it('does not render add-camp buttons (single camp only)', () => {
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    expect(screen.queryByText('Add Camp')).not.toBeInTheDocument();
    expect(screen.queryByText('New Listing')).not.toBeInTheDocument();
  });

  it('opens the listing wizard from the empty state', async () => {
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    expect(screen.queryByTestId('wizard-steps')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Create Camp'));
    await waitFor(() => {
      expect(screen.getByTestId('wizard-steps')).toBeInTheDocument();
    });
  });

  it('closes the listing wizard via its Cancel button', async () => {
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    fireEvent.click(screen.getByText('Create Camp'));
    await waitFor(() => {
      expect(screen.getByTestId('wizard-steps')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => {
      expect(screen.queryByTestId('wizard-steps')).not.toBeInTheDocument();
    });
  });

  it('calls onRefreshCamps when a listing is created through the wizard', async () => {
    mockCampMutateAsync.mockResolvedValue({ id: 'camp-1', success: true });
    mockProductMutateAsync.mockResolvedValue({ id: 'product-1', success: true });
    mockRatePlanMutateAsync.mockResolvedValue({ id: 'plan-1', success: true });
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    fireEvent.click(screen.getByText('Create Camp'));
    await waitFor(() => expect(screen.getByTestId('wizard-steps')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Listing Name *'), { target: { value: 'Sunrise Beach Camp' } });
    fireEvent.change(screen.getByLabelText('Accommodation Type *'), { target: { value: 'cabin' } });
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByTestId('wizard-step-amenities')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByTestId('wizard-step-pricing')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Base Price (per night) *'), { target: { value: '120' } });
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByTestId('wizard-step-photos')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Create Listing'));
    await waitFor(() => {
      expect(mockRefreshCamps).toHaveBeenCalled();
    });
  });

  it('renders the single camp in the data table', () => {
    mockCamps = [singleCamp];
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    expect(screen.getByText('Test Camp')).toBeInTheDocument();
    expect(screen.getByText('Sinai')).toBeInTheDocument();
    expect(screen.getByText(/2025-01-01 → 2025-12-31/)).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByText(/active/i)).toBeInTheDocument();
  });

  it('validates name required on save', async () => {
    mockCamps = [singleCamp];
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => {
      expect(screen.getByText('Edit Camp')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('Camp name'), { target: { value: '' } });
    fireEvent.click(screen.getByText('Update Camp'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Camp name is required.', 'warning');
    });
  });

  it('validates location required on save', async () => {
    mockCamps = [singleCamp];
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => {
      expect(screen.getByText('Edit Camp')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('Camp location'), { target: { value: '' } });
    fireEvent.click(screen.getByText('Update Camp'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Camp location is required.', 'warning');
    });
  });

  it('validates dates (start >= end)', async () => {
    mockCamps = [singleCamp];
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => { expect(screen.getByText('Edit Camp')).toBeInTheDocument(); });
    fireEvent.change(screen.getByLabelText('Start Date'), { target: { value: '2025-12-31' } });
    fireEvent.change(screen.getByLabelText('End Date'), { target: { value: '2025-01-01' } });
    fireEvent.click(screen.getByText('Update Camp'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Start date must be before end date.', 'warning');
    });
  });

  it('edits the camp in place and calls onRefreshCamps', async () => {
    mockCamps = [singleCamp];
    mockMutate.mockImplementation((_data: any, options: any) => {
      options.onSuccess();
    });
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => {
      expect(screen.getByText('Edit Camp')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByDisplayValue('Test Camp'), { target: { value: 'Renamed Camp' } });
    fireEvent.click(screen.getByText('Update Camp'));
    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Renamed Camp' }),
        expect.anything(),
      );
      expect(mockRefreshCamps).toHaveBeenCalled();
    });
  });

  it('saves the camp with all fields through the edit form', async () => {
    mockCamps = [singleCamp];
    mockMutate.mockImplementation((_data: any, options: any) => {
      options.onSuccess();
    });
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => { expect(screen.getByText('Edit Camp')).toBeInTheDocument(); });
    fireEvent.change(screen.getByPlaceholderText('Camp name'), { target: { value: 'Test Camp' } });
    fireEvent.change(screen.getByPlaceholderText('Camp location'), { target: { value: 'Sinai' } });
    fireEvent.change(screen.getByLabelText('Start Date'), { target: { value: '2025-01-01' } });
    fireEvent.change(screen.getByLabelText('End Date'), { target: { value: '2025-12-31' } });
    fireEvent.change(screen.getByLabelText('Capacity'), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'planning' } });
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Extra notes' } });
    fireEvent.click(screen.getByText('Update Camp'));
    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Camp',
          location: 'Sinai',
          startDate: '2025-01-01',
          endDate: '2025-12-31',
          capacity: 60,
          status: 'planning',
          notes: 'Extra notes',
        }),
        expect.anything(),
      );
    });
  });

  it('deletes the camp with confirmation', async () => {
    mockCamps = [singleCamp];
    mockMutateDelete.mockImplementation((_id: any, options: any) => {
      options.onSuccess();
    });
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    fireEvent.click(screen.getAllByText('Delete')[0]);
    await waitFor(() => {
      expect(screen.getByText('Delete Camp')).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByText('Delete')[1]);
    await waitFor(() => {
      expect(mockRefreshCamps).toHaveBeenCalled();
      expect(screen.queryByText('Delete Camp')).not.toBeInTheDocument();
    });
  });

  it('cancels the delete dialog', async () => {
    mockCamps = [singleCamp];
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    fireEvent.click(screen.getAllByText('Delete')[0]);
    await waitFor(() => {
      expect(screen.getByText('Delete Camp')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => {
      expect(screen.queryByText('Delete Camp')).not.toBeInTheDocument();
    });
  });
});
