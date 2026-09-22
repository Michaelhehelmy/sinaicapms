import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as api from '@/lib/api';
import type { components } from '@/lib/api-types';

type Schemas = components['schemas'];

const mockShowToast = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/api', () => ({
  importTenantManifest: vi.fn(),
}));

const mockSessionGetUser = vi.fn((..._args: unknown[]): { role?: string } | null => null);
vi.mock('@/lib/session', () => ({
  session: { getUser: (...args: unknown[]) => mockSessionGetUser(...args) },
}));

import TenantImportPanel, {
  parseManifest,
  buildTenantManifestTemplate,
} from '@/components/admin/TenantImportPanel';
const mockImport = vi.mocked(api.importTenantManifest);

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const VALID_MANIFEST = {
  identity: {
    name: 'Acme Camp',
    subdomain: 'acme',
    type: 'camp',
    email: 'admin@acme.test',
    password: 'secret123',
    firstName: 'Admin',
    lastName: 'User',
  },
  tenant: { name: 'Acme Camp', description: 'Wilderness summers' },
  products: [
    { name: 'Deluxe Tent', type: 'room', basePrice: 450, capacity: 4, isActive: 1 },
    { name: 'Standard Tent', type: 'room', basePrice: 300, capacity: 2, isActive: 1 },
  ],
  rooms: [
    { name: 'Tent A1', status: 'available' },
    { name: 'Tent A2', status: 'available' },
    { name: 'Tent B1', status: 'available' },
  ],
  ratePlans: [{ name: 'Summer 2026', pricePerNight: 450 }],
  menu: {
    categories: [{ name: 'Grills' }, { name: 'Salads' }],
    meals: [
      { name: 'Mixed Grill', price: 220, categoryName: 'Grills' },
      { name: 'Grilled Chicken', price: 180, categoryName: 'Grills' },
      { name: 'Greek Salad', price: 90, categoryName: 'Salads' },
      { name: 'Caesar Salad', price: 110, categoryName: 'Salads' },
    ],
  },
  posUsers: [
    { email: 'cashier@acme.test', password: 'secret123', firstName: 'Cash', lastName: 'Ier' },
    { email: 'bar@acme.test', password: 'secret123', firstName: 'Bar', lastName: 'Ista' },
  ],
} satisfies Schemas['TenantImportRequest'];

const IMPORT_RESPONSE: Schemas['TenantImportResponse'] = {
  success: true,
  tenantId: 't_123',
  counts: {
    products: 2,
    rooms: 3,
    ratePlans: 1,
    mealCategories: 2,
    meals: 4,
    posUsers: 2,
  },
};

const renderPanel = () => {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <TenantImportPanel />
    </QueryClientProvider>,
  );
};

const typeManifest = (value: string) => {
  fireEvent.change(screen.getByTestId('import-textarea'), { target: { value } });
};

/* ------------------------------------------------------------------ */
/*  parseManifest unit tests                                           */
/* ------------------------------------------------------------------ */

describe('parseManifest', () => {
  it('parses a full manifest and computes per-entity counts', () => {
    const parsed = parseManifest(JSON.stringify(VALID_MANIFEST));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.preview).toMatchObject({
      name: 'Acme Camp',
      type: 'camp',
      hasIdentity: true,
      totalItems: 14,
      counts: { products: 2, rooms: 3, ratePlans: 1, mealCategories: 2, meals: 4, posUsers: 2 },
    });
  });

  it('accepts a tenant-scoped bundle without an identity block', () => {
    const { identity: _identity, ...dataOnly } = VALID_MANIFEST;
    const parsed = parseManifest(JSON.stringify(dataOnly));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.preview.hasIdentity).toBe(false);
  });

  it('rejects invalid JSON with a descriptive error', () => {
    const parsed = parseManifest('{"products": [');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toContain('Invalid JSON');
  });

  it('rejects non-object manifests', () => {
    expect(parseManifest('[1,2,3]').ok).toBe(false);
    expect(parseManifest('null').ok).toBe(false);
    expect(parseManifest('"hello"').ok).toBe(false);
  });

  it('rejects an empty manifest with no identity and no data sections', () => {
    const parsed = parseManifest('{}');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toContain('empty');
  });

  it('rejects an identity block missing subdomain', () => {
    const parsed = parseManifest(JSON.stringify({ identity: { name: 'Acme' } }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toContain('subdomain');
  });
});

/* ------------------------------------------------------------------ */
/*  Panel behaviour                                                    */
/* ------------------------------------------------------------------ */

describe('TenantImportPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockImport.mockResolvedValue(IMPORT_RESPONSE);
  });

  it('renders the textarea, file input, and a disabled Go live button initially', () => {
    renderPanel();
    expect(screen.getByTestId('tenant-import-panel')).toBeInTheDocument();
    expect(screen.getByTestId('import-textarea')).toBeInTheDocument();
    expect(screen.getByTestId('import-file-input')).toBeInTheDocument();
    expect(screen.getByText('Load from file')).toBeInTheDocument();
    expect(screen.getByTestId('import-go-live-btn')).toBeDisabled();
  });

  it('shows preview counts, tenant name, and type for a valid manifest', () => {
    renderPanel();
    typeManifest(JSON.stringify(VALID_MANIFEST));

    expect(screen.getByTestId('import-preview')).toBeInTheDocument();
    expect(screen.getByTestId('import-count-products')).toHaveTextContent('2');
    expect(screen.getByTestId('import-count-rooms')).toHaveTextContent('3');
    expect(screen.getByTestId('import-count-rateplans')).toHaveTextContent('1');
    expect(screen.getByTestId('import-count-mealcategories')).toHaveTextContent('2');
    expect(screen.getByTestId('import-count-meals')).toHaveTextContent('4');
    expect(screen.getByTestId('import-count-posusers')).toHaveTextContent('2');
    expect(screen.getByTestId('import-preview-name')).toHaveTextContent('Acme Camp');
    expect(screen.getByTestId('import-preview-type')).toHaveTextContent('camp');
    expect(screen.getByTestId('import-go-live-btn')).toBeEnabled();
  });

  it('shows an inline error and keeps the button disabled for invalid JSON', () => {
    renderPanel();
    typeManifest('{"products": [');
    expect(screen.getByTestId('import-parse-error')).toHaveTextContent('Invalid JSON');
    expect(screen.queryByTestId('import-preview')).not.toBeInTheDocument();
    expect(screen.getByTestId('import-go-live-btn')).toBeDisabled();
  });

  it('loads a manifest from the file input', async () => {
    renderPanel();
    const file = new File([JSON.stringify(VALID_MANIFEST)], 'manifest.json', { type: 'application/json' });
    fireEvent.change(screen.getByTestId('import-file-input'), { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('import-preview')).toBeInTheDocument();
    });
    expect(screen.getByTestId('import-count-products')).toHaveTextContent('2');
    expect(screen.getByTestId('import-go-live-btn')).toBeEnabled();
  });

  it('calls the API client with the full parsed manifest on confirm', async () => {
    renderPanel();
    typeManifest(JSON.stringify(VALID_MANIFEST));

    fireEvent.click(screen.getByTestId('import-go-live-btn'));

    await waitFor(() => {
      expect(mockImport).toHaveBeenCalledTimes(1);
    });
    expect(mockImport).toHaveBeenCalledWith(VALID_MANIFEST);
  });

  it('renders success counts and fires a success toast from the mutation result', async () => {
    renderPanel();
    typeManifest(JSON.stringify(VALID_MANIFEST));

    fireEvent.click(screen.getByTestId('import-go-live-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('import-result')).toBeInTheDocument();
    });
    expect(screen.getByTestId('import-count-products-result')).toHaveTextContent('2');
    expect(screen.getByTestId('import-count-rooms-result')).toHaveTextContent('3');
    expect(screen.getByTestId('import-count-meals-result')).toHaveTextContent('4');
    expect(screen.getByTestId('import-count-posusers-result')).toHaveTextContent('2');
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('Import complete'),
      'success',
    );
  });

  it('shows the inline submit error and an error toast when the import fails', async () => {
    mockImport.mockRejectedValue(new Error('Missing required fields'));
    renderPanel();
    typeManifest(JSON.stringify(VALID_MANIFEST));

    fireEvent.click(screen.getByTestId('import-go-live-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('import-submit-error')).toHaveTextContent('Missing required fields');
    });
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('Import failed'),
      'error',
    );
  });
});
/* ------------------------------------------------------------------ */
/*  Tenant-admin workflow (download template / guard rails / submit)   */
/* ------------------------------------------------------------------ */

const SCOPED_MANIFEST = (() => {
  const { identity: _dropped, ...rest } = VALID_MANIFEST;
  return rest;
})();

describe('TenantImportPanel tenant workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockImport.mockResolvedValue(IMPORT_RESPONSE);
    mockSessionGetUser.mockReturnValue(null);
  });

  it('1. template download payload is valid JSON with expected top-level keys', () => {
    const template = buildTenantManifestTemplate();
    const roundTripped = JSON.parse(JSON.stringify(template)) as Record<string, unknown>;
    for (const key of ['tenant', 'products', 'rooms', 'ratePlans', 'menu', 'posUsers']) {
      expect(roundTripped).toHaveProperty(key);
    }
    expect((roundTripped.tenant as Record<string, unknown>).currency).toBe('EGP');
  });

  it('2. template does NOT contain an identity key', () => {
    expect(buildTenantManifestTemplate()).not.toHaveProperty('identity');
  });

  it('3. malformed JSON shows an error and disables Import', () => {
    renderPanel();
    typeManifest('{not valid json');
    expect(screen.getByTestId('import-parse-error')).toBeInTheDocument();
    expect(screen.getByTestId('import-go-live-btn')).toBeDisabled();
  });

  it('4. identity block is rejected for tenant admins with the exact message', () => {
    mockSessionGetUser.mockReturnValue({ role: 'admin' });
    renderPanel();
    typeManifest(JSON.stringify(VALID_MANIFEST));
    expect(screen.getByTestId('import-parse-error')).toHaveTextContent(
      'This template is for existing tenants. Remove the identity block to import as tenant admin.',
    );
    expect(screen.getByTestId('import-go-live-btn')).toBeDisabled();
  });

  it('5. valid scoped manifest shows correct preview counts', () => {
    renderPanel();
    typeManifest(JSON.stringify(SCOPED_MANIFEST));
    expect(screen.getByTestId('import-preview')).toBeInTheDocument();
    expect(screen.getByTestId('import-count-meals')).toHaveTextContent('4');
    expect(screen.getByTestId('import-count-rateplans')).toHaveTextContent('1');
    expect(screen.getByTestId('import-go-live-btn')).toBeEnabled();
  });

  it('6. successful submit posts the parsed body to /api/tenants/import', async () => {
    renderPanel();
    typeManifest(JSON.stringify(SCOPED_MANIFEST));
    fireEvent.click(screen.getByTestId('import-go-live-btn'));
    await waitFor(() => {
      expect(mockImport).toHaveBeenCalledTimes(1);
    });
    expect(mockImport).toHaveBeenCalledWith(expect.objectContaining({ products: SCOPED_MANIFEST.products }));
    expect(mockImport.mock.calls[0][0]).not.toHaveProperty('identity');
  });

  it('7. failed submit displays envelope message plus field errors', async () => {
    const err = new Error('Validation failed') as Error & {
      fieldErrors: Array<{ field: string; message: string }>;
    };
    err.fieldErrors = [{ field: 'rooms.0.productName', message: 'Unknown product' }];
    mockImport.mockRejectedValue(err);
    renderPanel();
    typeManifest(JSON.stringify(SCOPED_MANIFEST));
    fireEvent.click(screen.getByTestId('import-go-live-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('import-submit-error')).toHaveTextContent('Validation failed');
    });
    expect(screen.getByTestId('import-submit-error')).toHaveTextContent('rooms.0.productName');
  });

  it('8. super-admin sees the warning banner; tenant admin does not', () => {
    mockSessionGetUser.mockReturnValue({ role: 'super_admin' });
    const first = renderPanel();
    expect(screen.getByTestId('import-superadmin-warning')).toHaveTextContent(
      'You are importing as super-admin.',
    );
    first.unmount();
    mockSessionGetUser.mockReturnValue({ role: 'admin' });
    renderPanel();
    expect(screen.queryByTestId('import-superadmin-warning')).not.toBeInTheDocument();
  });
});
