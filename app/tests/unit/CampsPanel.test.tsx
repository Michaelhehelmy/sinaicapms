import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import CampsPanel from '@/components/admin/CampsPanel';

const mockShowToast = vi.fn();
const mockRefreshCamps = vi.fn();
const mockMutate = vi.fn();
const mockMutateDelete = vi.fn();
const mockCampMutateAsync = vi.fn();
const mockProductMutateAsync = vi.fn();
const mockRatePlanMutateAsync = vi.fn();
const mockMetaMutate = vi.fn();
const mockCreateLinkMutate = vi.fn();
const mockDeleteLinkMutate = vi.fn();
let mockCamps: unknown[] = [];
let mockCampsLoading = false;
// project-meta query state driven per-test
let mockMetaRows: unknown[] = [];
let mockMetaSuccess = true;
// project-links query state driven per-test
let mockLinks: unknown[] = [];
let mockLinksLoading = false;

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/hooks/useQueryHooks', () => ({
  useCampsQuery: () => ({ data: mockCamps, isLoading: mockCampsLoading }),
  useSaveCampMutation: () => ({ mutate: mockMutate, mutateAsync: mockCampMutateAsync, isPending: false }),
  useDeleteCampMutation: () => ({ mutate: mockMutateDelete, isPending: false }),
  useSaveProductMutation: () => ({ mutateAsync: mockProductMutateAsync, isPending: false }),
  useSaveRatePlanMutation: () => ({ mutateAsync: mockRatePlanMutateAsync, isPending: false }),
  useProjectMetaQuery: () => ({
    data: mockMetaRows,
    isSuccess: mockMetaSuccess,
    isPending: false,
  }),
  useSaveProjectMetaMutation: () => ({ mutate: mockMetaMutate, isPending: false }),
  useProjectLinksQuery: () => ({ data: mockLinks, isLoading: mockLinksLoading, isPending: false }),
  useCreateProjectLinkMutation: () => ({ mutate: mockCreateLinkMutate, isPending: false }),
  useDeleteProjectLinkMutation: () => ({ mutate: mockDeleteLinkMutate, isPending: false }),
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

const secondCamp = {
  id: 'c2',
  name: 'Second Camp',
  location: 'Sharm',
  startDate: '2025-06-01',
  endDate: '2025-09-30',
  capacity: 30,
  status: 'active',
  notes: '',
};

/** Canonical link fixture — c1 (Test Camp) linked to c2 (Second Camp). */
const linkC1toC2 = {
  id: 'pl1',
  linkType: 'supplies',
  metaData: null,
  a: { id: 'c1', name: 'Test Camp', slug: 'test-camp', projectType: 'camp' },
  b: { id: 'c2', name: 'Second Camp', slug: 'second', projectType: 'supermarket' },
};

describe('CampsPanel (single-camp admin)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCamps = [];
    mockCampsLoading = false;
    mockMetaRows = [];
    mockMetaSuccess = true;
    mockLinks = [];
    mockLinksLoading = false;
  });

  it('renders with empty state and create action when no camp exists', () => {
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('No projects yet')).toBeInTheDocument();
    expect(screen.getByText('Create Project')).toBeInTheDocument();
  });

  it('does not render add-camp buttons (single camp only)', () => {
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    expect(screen.queryByText('Add Camp')).not.toBeInTheDocument();
    expect(screen.queryByText('New Listing')).not.toBeInTheDocument();
  });

  it('opens the listing wizard from the empty state', async () => {
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    expect(screen.queryByTestId('wizard-steps')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Create Project'));
    await waitFor(() => {
      expect(screen.getByTestId('wizard-steps')).toBeInTheDocument();
    });
  });

  it('closes the listing wizard via its Cancel button', async () => {
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    fireEvent.click(screen.getByText('Create Project'));
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
    fireEvent.click(screen.getByText('Create Project'));
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
      expect(screen.getByText('Edit Project')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('Project name'), { target: { value: '' } });
    fireEvent.click(screen.getByText('Update Project'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Project name is required.', 'warning');
    });
  });

  it('validates location required on save', async () => {
    mockCamps = [singleCamp];
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => {
      expect(screen.getByText('Edit Project')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('Project name'), { target: { value: 'Valid Name' } });
    fireEvent.change(screen.getByPlaceholderText('Paste Google Maps link or type address'), { target: { value: '' } });
    fireEvent.click(screen.getByText('Update Project'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Project location is required.', 'warning');
    });
  });

  it('validates dates (start >= end)', async () => {
    mockCamps = [singleCamp];
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => { expect(screen.getByText('Edit Project')).toBeInTheDocument(); });
    fireEvent.change(screen.getByLabelText('Start Date'), { target: { value: '2025-12-31' } });
    fireEvent.change(screen.getByLabelText('End Date'), { target: { value: '2025-01-01' } });
    fireEvent.click(screen.getByText('Update Project'));
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
      expect(screen.getByText('Edit Project')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByDisplayValue('Test Camp'), { target: { value: 'Renamed Camp' } });
    fireEvent.click(screen.getByText('Update Project'));
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
    await waitFor(() => { expect(screen.getByText('Edit Project')).toBeInTheDocument(); });
    fireEvent.change(screen.getByPlaceholderText('Project name'), { target: { value: 'Test Camp' } });
    fireEvent.change(screen.getByPlaceholderText('Paste Google Maps link or type address'), { target: { value: 'Sinai' } });
    fireEvent.change(screen.getByLabelText('Start Date'), { target: { value: '2025-01-01' } });
    fireEvent.change(screen.getByLabelText('End Date'), { target: { value: '2025-12-31' } });
    fireEvent.change(screen.getByLabelText('Capacity'), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'planning' } });
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Extra notes' } });
    fireEvent.click(screen.getByText('Update Project'));
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
      expect(screen.getByText('Delete Project')).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByText('Delete')[1]);
    await waitFor(() => {
      expect(mockRefreshCamps).toHaveBeenCalled();
      expect(screen.queryByText('Delete Project')).not.toBeInTheDocument();
    });
  });

  it('passes { id, tenantId } when deleting a marketplace cross-tenant row', async () => {
    mockCamps = [{ ...singleCamp, tenant_id: 'tenant-alpha' }];
    mockMutateDelete.mockImplementation((_id: any, options: any) => {
      options.onSuccess();
    });
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    fireEvent.click(screen.getAllByText('Delete')[0]);
    await waitFor(() => {
      expect(screen.getByText('Delete Project')).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByText('Delete')[1]);
    await waitFor(() => {
      expect(mockMutateDelete).toHaveBeenCalledWith(
        { id: 'c1', tenantId: 'tenant-alpha' },
        expect.anything(),
      );
      expect(mockRefreshCamps).toHaveBeenCalled();
    });
  });

  it('falls back to tenantId (camelCase) on marketplace rows without tenant_id', async () => {
    mockCamps = [{ ...singleCamp, id: 'c9', tenantId: 'tenant-beta' }];
    mockMutateDelete.mockImplementation((_id: any, options: any) => {
      options.onSuccess();
    });
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    fireEvent.click(screen.getAllByText('Delete')[0]);
    await waitFor(() => {
      expect(screen.getByText('Delete Project')).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByText('Delete')[1]);
    await waitFor(() => {
      expect(mockMutateDelete).toHaveBeenCalledWith(
        { id: 'c9', tenantId: 'tenant-beta' },
        expect.anything(),
      );
    });
  });

  it('cancels the delete dialog', async () => {
    mockCamps = [singleCamp];
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    fireEvent.click(screen.getAllByText('Delete')[0]);
    await waitFor(() => {
      expect(screen.getByText('Delete Project')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => {
      expect(screen.queryByText('Delete Project')).not.toBeInTheDocument();
    });
  });

  it('shows an Add Project button when at least one camp exists', () => {
    mockCamps = [singleCamp];
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    expect(screen.getByTestId('add-project-button')).toBeInTheDocument();
    expect(screen.getByText('Add Project')).toBeInTheDocument();
  });

  it('does not show the Add Project button in the empty state (uses the wizard instead)', () => {
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    expect(screen.queryByTestId('add-project-button')).not.toBeInTheDocument();
  });

  it('opens the create form in CREATE mode via Add Project and triggers the POST save mutation', async () => {
    mockCamps = [singleCamp];
    mockMutate.mockImplementation((_data: any, options: any) => options.onSuccess());
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);

    fireEvent.click(screen.getByTestId('add-project-button'));
    await waitFor(() => {
      expect(screen.getByText('Create Project')).toBeInTheDocument();
    });
    // CREATE mode → "Save Project" submit label (not "Update Project").
    expect(screen.getByText('Save Project')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Project name'), { target: { value: 'Second Camp' } });
    fireEvent.change(screen.getByPlaceholderText('Paste Google Maps link or type address'), { target: { value: 'Sinai' } });
    fireEvent.click(screen.getByText('Save Project'));

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Second Camp', location: 'Sinai' }),
        expect.anything(),
      );
      expect(mockRefreshCamps).toHaveBeenCalled();
    });
  });

  it('resets the create form so a previously edited project does not leak into Add Project', async () => {
    mockCamps = [singleCamp];
    mockMutate.mockImplementation((_data: any, options: any) => options.onSuccess());
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);

    // Edit the existing camp first.
    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => expect(screen.getByText('Edit Project')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Project Type'), { target: { value: 'supermarket' } });
    fireEvent.change(screen.getByDisplayValue('Test Camp'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByText('Update Project'));
    await waitFor(() => expect(mockRefreshCamps).toHaveBeenCalled());

    // Now open Add Project — name/type must be reset to the create defaults.
    fireEvent.click(screen.getByTestId('add-project-button'));
    await waitFor(() => expect(screen.getByText('Create Project')).toBeInTheDocument());
    expect(screen.getByTestId('add-project-button')).toBeInTheDocument();
    expect(screen.getByLabelText('Project Type')).toHaveValue('camp');
    expect((screen.getByPlaceholderText('Project name') as HTMLInputElement).value).toBe('');
  });
});

describe('CampsPanel unified-schema editing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCamps = [singleCamp];
    mockMetaRows = [];
    mockMetaSuccess = true;
    mockLinks = [];
    mockLinksLoading = false;
    // Meta mutation resolves like TanStack would (drives onSuccess → close).
    mockMetaMutate.mockImplementation((_ops: unknown, options: any) => options?.onSuccess?.());
  });

  const openEditModal = async () => {
    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => expect(screen.getByText('Edit Project')).toBeInTheDocument());
  };

  it('renders the Project Type select and the schema custom-fields section', async () => {
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    await openEditModal();
    expect(screen.getByLabelText('Project Type')).toHaveValue('camp');
    expect(screen.getByRole('heading', { name: /custom fields/i })).toBeInTheDocument();
    for (const key of ['activities', 'accommodation_type', 'check_in_time']) {
      expect(screen.getByTestId(`form-meta-${key}`)).toBeInTheDocument();
    }
  });

  it('never renders core-owned keys (notes) in the meta section', async () => {
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    await openEditModal();
    // The textarea Notes field belongs to the core form…
    expect(screen.getByLabelText('Notes')).toBeInTheDocument();
    // …and must NOT be duplicated as a meta field.
    expect(screen.queryByTestId('form-meta-notes')).not.toBeInTheDocument();
  });

  it('switches the rendered schema when the project type changes', async () => {
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    await openEditModal();
    fireEvent.change(screen.getByLabelText('Project Type'), { target: { value: 'supermarket' } });
    await waitFor(() => {
      expect(screen.getByTestId('form-meta-opening_hours')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('form-meta-accommodation_type')).not.toBeInTheDocument();
  });

  it('sends the selected projectType in the save payload', async () => {
    mockMutate.mockImplementation((_data: any, options: any) => options.onSuccess());
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    await openEditModal();
    fireEvent.change(screen.getByLabelText('Project Type'), { target: { value: 'transportation' } });
    fireEvent.click(screen.getByText('Update Project'));
    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({ projectType: 'transportation' }),
        expect.anything(),
      );
    });
  });

  it('persists changed meta values after a successful core save', async () => {
    mockMetaRows = [{ id: 7, projectId: 'c1', metaKey: 'accommodation_type', metaValue: 'tent' }];
    mockMutate.mockImplementation((_data: any, options: any) => options.onSuccess());
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    await openEditModal();

    // Seeded from GET /projects/:id/meta
    const accSelect = await waitFor(() => screen.getByTestId('form-meta-accommodation_type'));
    expect(accSelect).toHaveValue('tent');

    fireEvent.change(accSelect, { target: { value: 'cabin' } });
    fireEvent.click(screen.getByText('Update Project'));

    await waitFor(() => {
      expect(mockMetaMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          creates: [],
          updates: [{ id: 7, value: 'cabin' }],
          deletes: [],
        }),
        expect.anything(),
      );
      expect(mockRefreshCamps).toHaveBeenCalled();
    });
  });

  it('skips the meta mutation entirely when nothing changed', async () => {
    mockMetaRows = [
      { id: 7, projectId: 'c1', metaKey: 'accommodation_type', metaValue: 'tent' },
      { id: 8, projectId: 'c1', metaKey: 'activities', metaValue: '["Hiking"]' },
    ];
    mockMutate.mockImplementation((_data: any, options: any) => options.onSuccess());
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    await openEditModal();
    await waitFor(() => expect(screen.getByTestId('form-meta-accommodation_type')).toHaveValue('tent'));

    fireEvent.click(screen.getByText('Update Project'));
    await waitFor(() => expect(mockRefreshCamps).toHaveBeenCalled());
    expect(mockMetaMutate).not.toHaveBeenCalled();
  });

  it('deletes stored rows whose field was cleared in the form', async () => {
    mockMetaRows = [{ id: 9, projectId: 'c1', metaKey: 'activities', metaValue: '["Hiking"]' }];
    mockMutate.mockImplementation((_data: any, options: any) => options.onSuccess());
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    await openEditModal();
    const activities = await waitFor(() => screen.getByTestId('form-meta-activities'));
    expect(activities).toHaveValue('Hiking');

    fireEvent.change(activities, { target: { value: '' } });
    fireEvent.click(screen.getByText('Update Project'));
    await waitFor(() => {
      expect(mockMetaMutate).toHaveBeenCalledWith(
        expect.objectContaining({ deletes: [9], creates: [], updates: [] }),
        expect.anything(),
      );
    });
  });

  it('disables submit until the meta query resolves while editing', async () => {
    mockMetaSuccess = false;
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    await openEditModal();
    const updateBtn = screen.getByText('Update Project').closest('button');
    expect(updateBtn).toBeDisabled();
  });
});

describe('CampsPanel Connections (cross-project links)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCamps = [singleCamp, secondCamp];
    mockMetaRows = [];
    mockMetaSuccess = true;
    mockLinks = [];
    mockLinksLoading = false;
  });

  const openEditModal = async () => {
    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => expect(screen.getByText('Edit Project')).toBeInTheDocument());
  };

  it('renders the Connections section for the edited project with its links', async () => {
    mockLinks = [linkC1toC2];
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    await openEditModal();

    expect(screen.getByTestId('project-connections')).toBeInTheDocument();
    // The OTHER side of the link (c2) name + its project type + the link type.
    const list = within(screen.getByTestId('connections-list'));
    expect(list.getByText('Second Camp')).toBeInTheDocument();
    expect(list.getByText(/supermarket · supplies/i)).toBeInTheDocument();
  });

  it('shows an empty state when the project has no links yet', async () => {
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    await openEditModal();
    expect(screen.getByTestId('connections-empty')).toBeInTheDocument();
    expect(screen.getByText('No connections yet.')).toBeInTheDocument();
  });

  it('does not render Connections in CREATE mode (no project to link yet)', async () => {
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    fireEvent.click(screen.getByTestId('add-project-button'));
    await waitFor(() => expect(screen.getByText('Create Project')).toBeInTheDocument());
    expect(screen.queryByTestId('project-connections')).not.toBeInTheDocument();
  });

  it('adds a connection via the add form', async () => {
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    await openEditModal();

    fireEvent.change(screen.getByLabelText('Link to project'), { target: { value: 'c2' } });
    fireEvent.change(screen.getByLabelText('Link type'), { target: { value: 'supplies' } });
    fireEvent.click(screen.getByTestId('add-link-button'));

    await waitFor(() => {
      expect(mockCreateLinkMutate).toHaveBeenCalledWith(
        { projectIdA: 'c1', projectIdB: 'c2', linkType: 'supplies' },
        expect.anything(),
      );
    });
  });

  it('excludes self and already-linked projects from the add select', async () => {
    mockLinks = [linkC1toC2];
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    await openEditModal();

    const select = screen.getByLabelText('Link to project') as HTMLSelectElement;
    const values = Array.from(select.querySelectorAll('option')).map((o) => (o as HTMLOptionElement).value);
    // Only the disabled placeholder remains — c1 (self) and c2 (linked) are gone.
    expect(values).toEqual(['']);
    expect(screen.getByTestId('add-link-button')).toBeDisabled();
  });

  it('removes a connection after confirmation', async () => {
    mockLinks = [{ ...linkC1toC2, a: { ...linkC1toC2.a }, b: { ...linkC1toC2.b } }];
    mockDeleteLinkMutate.mockImplementation((_id: any, options: any) => options?.onSuccess?.());
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    await openEditModal();

    fireEvent.click(screen.getByTestId('remove-link-pl1'));
    await waitFor(() => expect(screen.getByText('Remove Connection')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Yes, Remove'));

    await waitFor(() => {
      expect(mockDeleteLinkMutate).toHaveBeenCalledWith('pl1', expect.anything());
      expect(screen.queryByText('Remove Connection')).not.toBeInTheDocument();
    });
  });

  it('does not call createProjectLink without a selected project', async () => {
    render(<CampsPanel onRefreshCamps={mockRefreshCamps} />);
    await openEditModal();
    fireEvent.click(screen.getByTestId('add-link-button'));
    expect(mockCreateLinkMutate).not.toHaveBeenCalled();
  });
});
