import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ListingWizard from '@/components/admin/ListingWizard';

const mockShowToast = vi.fn();
const mockOnClose = vi.fn();
const mockOnCreated = vi.fn();

const mockCampMutateAsync = vi.fn();
const mockProductMutateAsync = vi.fn();
const mockRatePlanMutateAsync = vi.fn();

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/hooks/useQueryHooks', () => ({
  useSaveCampMutation: () => ({ mutateAsync: mockCampMutateAsync, isPending: false }),
  useSaveProductMutation: () => ({ mutateAsync: mockProductMutateAsync, isPending: false }),
  useSaveRatePlanMutation: () => ({ mutateAsync: mockRatePlanMutateAsync, isPending: false }),
}));

vi.mock('@/lib/utils', () => ({
  formatCurrency: (n: number) => `$${Number(n).toFixed(2)}`,
  formatDate: (d: string) => d,
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

function renderWizard(open = true) {
  return render(<ListingWizard open={open} onClose={mockOnClose} onCreated={mockOnCreated} />);
}

/** Walk the wizard to the photos step with valid data. */
async function walkToPhotos() {
  renderWizard();
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
}

describe('ListingWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCampMutateAsync.mockResolvedValue({ id: 'camp-1', success: true });
    mockProductMutateAsync.mockResolvedValue({ id: 'product-1', success: true });
    mockRatePlanMutateAsync.mockResolvedValue({ id: 'plan-1', success: true });
  });

  it('renders the 4-step stepper with translated labels when open', () => {
    renderWizard();
    const steps = screen.getByTestId('wizard-steps');
    expect(steps).toBeInTheDocument();
    expect(within(steps).getByText('Details')).toBeInTheDocument();
    expect(within(steps).getByText('Amenities')).toBeInTheDocument();
    expect(within(steps).getByText('Pricing')).toBeInTheDocument();
    expect(within(steps).getByText('Photos')).toBeInTheDocument();
    expect(screen.getByText('Listing details')).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    const { container } = renderWizard(false);
    expect(container.querySelector('[data-testid="wizard-steps"]')).toBeNull();
  });

  it('blocks advancing on details step until name and type are set', () => {
    renderWizard();
    fireEvent.click(screen.getByText('Next'));
    expect(mockShowToast).toHaveBeenCalledWith('Listing name is required.', 'warning');
    fireEvent.change(screen.getByLabelText('Listing Name *'), { target: { value: 'Sunrise Beach Camp' } });
    fireEvent.click(screen.getByText('Next'));
    expect(mockShowToast).toHaveBeenCalledWith('Accommodation type is required.', 'warning');
    expect(screen.queryByTestId('wizard-step-amenities')).not.toBeInTheDocument();
  });

  it('advances to amenities and toggles chips', async () => {
    renderWizard();
    fireEvent.change(screen.getByLabelText('Listing Name *'), { target: { value: 'Sunrise Beach Camp' } });
    fireEvent.change(screen.getByLabelText('Accommodation Type *'), { target: { value: 'cabin' } });
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByTestId('wizard-step-amenities')).toBeInTheDocument());
    expect(screen.getByTestId('wizard-amenities-empty')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle amenity: WiFi' }));
    expect(screen.queryByTestId('wizard-amenities-empty')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toggle amenity: WiFi' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Toggle amenity: WiFi' }));
    expect(screen.getByRole('button', { name: 'Toggle amenity: WiFi' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('goes back to the previous step', async () => {
    renderWizard();
    fireEvent.change(screen.getByLabelText('Listing Name *'), { target: { value: 'Sunrise Beach Camp' } });
    fireEvent.change(screen.getByLabelText('Accommodation Type *'), { target: { value: 'cabin' } });
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByTestId('wizard-step-amenities')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Back'));
    await waitFor(() => expect(screen.getByTestId('wizard-step-details')).toBeInTheDocument());
    // Back is disabled on the first step
    expect(screen.getByText('Back').closest('button')).toBeDisabled();
  });

  it('blocks advancing on pricing step without a valid base price', async () => {
    renderWizard();
    fireEvent.change(screen.getByLabelText('Listing Name *'), { target: { value: 'Sunrise Beach Camp' } });
    fireEvent.change(screen.getByLabelText('Accommodation Type *'), { target: { value: 'cabin' } });
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByTestId('wizard-step-amenities')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByTestId('wizard-step-pricing')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Next'));
    expect(mockShowToast).toHaveBeenCalledWith('Base price must be greater than 0.', 'warning');
    expect(screen.queryByTestId('wizard-step-photos')).not.toBeInTheDocument();
  });

  it('shows a live preview with details, amenities and formatted price', async () => {
    renderWizard();
    expect(screen.getByTestId('wizard-preview')).toBeInTheDocument();
    expect(screen.getByText('No photo yet')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Listing Name *'), { target: { value: 'Sunrise Beach Camp' } });
    fireEvent.change(screen.getByLabelText('Accommodation Type *'), { target: { value: 'cabin' } });
    fireEvent.change(screen.getByLabelText('Capacity'), { target: { value: '6' } });
    const preview = screen.getByTestId('wizard-preview');
    await waitFor(() => {
      expect(within(preview).getByText('Sunrise Beach Camp')).toBeInTheDocument();
      expect(within(preview).getByText('Cabin')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByTestId('wizard-step-amenities')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByTestId('wizard-step-pricing')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Base Price (per night) *'), { target: { value: '120' } });
    await waitFor(() => expect(within(preview).getByText('$120.00')).toBeInTheDocument());
  });

  it('creates camp, product and rate plan in order on submit', async () => {
    await walkToPhotos();
    fireEvent.click(screen.getByText('Create Listing'));
    await waitFor(() => {
      expect(mockCampMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Sunrise Beach Camp', status: 'active' }),
      );
      expect(mockProductMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Sunrise Beach Camp',
          campIds: ['camp-1'],
          basePrice: 120,
        }),
      );
      expect(mockRatePlanMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ productId: 'product-1', pricePerNight: 120, isActive: 1 }),
      );
      expect(mockShowToast).toHaveBeenCalledWith('Listing created successfully.', 'success');
      expect(mockOnCreated).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('sends description, amenities summary, capacity and photo cover on submit', async () => {
    await walkToPhotos();
    // Photos step: add a URL photo so the cover is included in the payload
    fireEvent.change(screen.getByLabelText('Add Image by URL'), {
      target: { value: 'https://example.com/cover.jpg' },
    });
    fireEvent.click(screen.getByText('Add URL'));
    fireEvent.click(screen.getByText('Create Listing'));
    await waitFor(() => {
      expect(mockProductMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          imageUrl: 'https://example.com/cover.jpg',
          shortDescription: 'Cabin',
        }),
      );
    });
  });

  it('persists selected amenities into the product short description', async () => {
    renderWizard();
    fireEvent.change(screen.getByLabelText('Listing Name *'), { target: { value: 'Sunrise Beach Camp' } });
    fireEvent.change(screen.getByLabelText('Accommodation Type *'), { target: { value: 'chalet' } });
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByTestId('wizard-step-amenities')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Toggle amenity: WiFi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle amenity: Fire Pit' }));
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByTestId('wizard-step-pricing')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Base Price (per night) *'), { target: { value: '90' } });
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByTestId('wizard-step-photos')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Create Listing'));
    await waitFor(() => {
      expect(mockProductMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ shortDescription: 'Chalet · WiFi · Fire Pit' }),
      );
      expect(mockRatePlanMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Standard', minStay: 1, season: 'all' }),
      );
    });
  });

  it('persists advanced rate plan fields and description edits', async () => {
    renderWizard();
    fireEvent.change(screen.getByLabelText('Listing Name *'), { target: { value: 'Sunrise Beach Camp' } });
    fireEvent.change(screen.getByLabelText('Accommodation Type *'), { target: { value: 'cabin' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'A peaceful beachfront camp.' } });
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByTestId('wizard-step-amenities')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByTestId('wizard-step-pricing')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Base Price (per night) *'), { target: { value: '120' } });
    fireEvent.change(screen.getByLabelText('Rate Plan Name'), { target: { value: 'Weekend' } });
    fireEvent.change(screen.getByLabelText('Season'), { target: { value: 'peak' } });
    fireEvent.change(screen.getByLabelText('Minimum Stay (nights)'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Start Date'), { target: { value: '2025-06-01' } });
    fireEvent.change(screen.getByLabelText('End Date'), { target: { value: '2025-09-30' } });
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByTestId('wizard-step-photos')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Create Listing'));
    await waitFor(() => {
      expect(mockProductMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'A peaceful beachfront camp.' }),
      );
      expect(mockRatePlanMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Weekend',
          season: 'peak',
          minStay: 2,
          startDate: '2025-06-01',
          endDate: '2025-09-30',
          isActive: 1,
        }),
      );
    });
  });

  it('shows an error toast when creation fails and keeps the wizard open', async () => {
    mockCampMutateAsync.mockRejectedValue(new Error('network'));
    await walkToPhotos();
    fireEvent.click(screen.getByText('Create Listing'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Failed to create listing. Please try again.', 'error');
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  it('closes via the Cancel button without creating', async () => {
    await walkToPhotos();
    fireEvent.click(screen.getByText('Cancel'));
    expect(mockOnClose).toHaveBeenCalled();
    expect(mockCampMutateAsync).not.toHaveBeenCalled();
  });

  it('resets the form when reopened', async () => {
    const { rerender } = renderWizard();
    fireEvent.change(screen.getByLabelText('Listing Name *'), { target: { value: 'Sunrise Beach Camp' } });
    fireEvent.click(screen.getByText('Cancel'));
    rerender(<ListingWizard open={false} onClose={mockOnClose} onCreated={mockOnCreated} />);
    rerender(<ListingWizard open={true} onClose={mockOnClose} onCreated={mockOnCreated} />);
    await waitFor(() => {
      expect(screen.getByLabelText('Listing Name *')).toHaveValue('');
    });
  });

  it('ignores clicks on footer buttons while submitting', async () => {
    let resolveCamp: (v: { id: string; success: boolean }) => void = () => {};
    mockCampMutateAsync.mockImplementation(
      () =>
        new Promise<{ id: string; success: boolean }>((resolve) => {
          resolveCamp = resolve;
        }),
    );
    await walkToPhotos();
    fireEvent.click(screen.getByText('Create Listing'));
    await waitFor(() => expect(screen.getByText('Creating…')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Cancel'));
    fireEvent.click(screen.getByText('Back'));
    expect(mockOnClose).not.toHaveBeenCalled();
    resolveCamp({ id: 'camp-1', success: true });
    await waitFor(() => expect(mockProductMutateAsync).toHaveBeenCalled());
  });
});
