/**
 * Phase 5 step 5d — confirmation groups lines by project label, one total.
 *
 * Pure-helper tests (groupLinesByProject / snapshot round-trip / name
 * resolution) plus render tests against the real StorefrontConfirmation
 * island: mixed tagged lines render Accommodation + Restaurant sections with
 * exactly one grand total; untagged legacy lines render flat in a single
 * Legacy (Unassigned) bucket; no snapshot keeps the legacy header rendering.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StorefrontConfirmation, {
  groupLinesByProject,
  saveConfirmationSnapshot,
  readConfirmationSnapshot,
  resolveConfirmationLineName,
  confirmationSnapshotKey,
  LEGACY_GROUP_TITLE,
  type ConfirmationLine,
} from '@/components/public/StorefrontConfirmation';

const api = vi.hoisted(() => ({
  getStorefrontOrders: vi.fn(),
  getStorefrontProducts: vi.fn(),
  apiFetch: vi.fn(),
}));

vi.mock('@/lib/api', () => api);

vi.mock('@/lib/storefrontSession', () => ({
  getSessionId: () => 'sess-1',
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

// ─── Fixtures (mirror the 5c numeric gate: room 200 + meal 50 ⇒ 250) ─────────

const PROJECTS = [
  { id: 'proj_camp', name: 'Accommodation', projectType: 'camp' },
  { id: 'proj_rest', name: 'Restaurant', projectType: 'restaurant' },
];

const MIXED_LINES: ConfirmationLine[] = [
  { id: 'ci_room', productId: 'room_prod', quantity: 1, totalPrice: 200, projectId: 'proj_camp' },
  { id: 'ci_meal', productId: 'meal_prod', quantity: 1, totalPrice: 50, projectId: 'proj_rest' },
];

const CATALOG = {
  data: [
    { id: 'room_prod', name: 'Sea View Room' },
    { id: 'meal_prod', name: 'Camp Breakfast' },
  ],
  total: 2,
  page: 1,
  pageSize: 100,
  hasMore: false,
};

const ORDER_NUMBER = 'ORD-ABC123';

function mockOrder(status = 'confirmed', totalAmount = 250) {
  api.getStorefrontOrders.mockResolvedValue([
    { id: 'o1', orderNumber: ORDER_NUMBER, totalAmount, status, createdAt: '2026-09-27T10:00:00Z' },
  ]);
}

function mockDirectory(projects = PROJECTS) {
  api.apiFetch.mockImplementation((path: string) => {
    if (path.startsWith('/marketplace/')) return Promise.resolve({ projects });
    return Promise.reject(new Error(`unexpected apiFetch path: ${path}`));
  });
  api.getStorefrontProducts.mockResolvedValue(CATALOG);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

// ─── Pure: groupLinesByProject ───────────────────────────────────────────────

describe('groupLinesByProject', () => {
  it('splits mixed tagged lines into one section per project, first-seen order', () => {
    const groups = groupLinesByProject(MIXED_LINES, PROJECTS);
    expect(groups).toHaveLength(2);
    expect(groups[0].title).toBe('Accommodation');
    expect(groups[0].legacy).toBe(false);
    expect(groups[0].lines).toHaveLength(1);
    expect(groups[1].title).toBe('Restaurant');
    expect(groups[1].lines.map((l) => l.id)).toEqual(['ci_meal']);
  });

  it('coalesces repeat lines of one project into the same section', () => {
    const lines: ConfirmationLine[] = [
      ...MIXED_LINES,
      { id: 'ci_meal2', productId: 'meal_prod', quantity: 2, totalPrice: 100, projectId: 'proj_rest' },
    ];
    const groups = groupLinesByProject(lines, PROJECTS);
    expect(groups).toHaveLength(2);
    expect(groups[1].lines).toHaveLength(2);
  });

  it('buckets null AND unknown tags into one trailing Legacy group (flat)', () => {
    const lines: ConfirmationLine[] = [
      { id: 'l1', productId: 'p1', quantity: 1, totalPrice: 10, projectId: null },
      { id: 'l2', productId: 'p2', quantity: 1, totalPrice: 20 }, // tag omitted
      { id: 'l3', productId: 'p3', quantity: 1, totalPrice: 30, projectId: 'proj_gone' }, // unknown
    ];
    const groups = groupLinesByProject(lines, PROJECTS);
    expect(groups).toHaveLength(1);
    expect(groups[0].legacy).toBe(true);
    expect(groups[0].title).toBe(LEGACY_GROUP_TITLE);
    expect(groups[0].subtitle).toMatch(/Unassigned/);
    expect(groups[0].lines).toHaveLength(3);
  });

  it('trails the Legacy bucket after tagged groups', () => {
    const lines: ConfirmationLine[] = [
      { id: 'l0', productId: 'p0', quantity: 1, totalPrice: 5, projectId: null },
      ...MIXED_LINES,
    ];
    const groups = groupLinesByProject(lines, PROJECTS);
    expect(groups.map((g) => g.title)).toEqual(['Accommodation', 'Restaurant', LEGACY_GROUP_TITLE]);
  });

  it('returns [] for no lines', () => {
    expect(groupLinesByProject([], PROJECTS)).toEqual([]);
  });
});

// ─── Pure: snapshot round-trip ───────────────────────────────────────────────

describe('confirmation snapshot', () => {
  it('saves and reads lines back by order number', () => {
    saveConfirmationSnapshot(ORDER_NUMBER, MIXED_LINES);
    expect(readConfirmationSnapshot(ORDER_NUMBER)).toEqual(MIXED_LINES);
  });

  it('isolates snapshots per order number', () => {
    saveConfirmationSnapshot(ORDER_NUMBER, MIXED_LINES);
    expect(readConfirmationSnapshot('ORD-OTHER')).toBeNull();
  });

  it('returns null when absent, corrupt, or wrong-shaped', () => {
    expect(readConfirmationSnapshot(ORDER_NUMBER)).toBeNull();
    window.sessionStorage.setItem(confirmationSnapshotKey(ORDER_NUMBER), 'not-json{');
    expect(readConfirmationSnapshot(ORDER_NUMBER)).toBeNull();
    window.sessionStorage.setItem(confirmationSnapshotKey(ORDER_NUMBER), JSON.stringify({ lines: 'nope' }));
    expect(readConfirmationSnapshot(ORDER_NUMBER)).toBeNull();
    window.sessionStorage.setItem(
      confirmationSnapshotKey(ORDER_NUMBER),
      JSON.stringify({ lines: [{ id: 42, totalPrice: 'x' }] }),
    );
    expect(readConfirmationSnapshot(ORDER_NUMBER)).toEqual([]);
  });

  it('never throws when storage is unavailable', () => {
    expect(() => saveConfirmationSnapshot('', MIXED_LINES)).not.toThrow();
    expect(readConfirmationSnapshot('')).toBeNull();
  });
});

// ─── Pure: resolveConfirmationLineName ───────────────────────────────────────

describe('resolveConfirmationLineName', () => {
  it('prefers the snapshot product name, then the catalog, then a generic label', () => {
    const withName: ConfirmationLine = { id: 'a', quantity: 1, totalPrice: 1, productName: 'Named' };
    expect(resolveConfirmationLineName(withName, new Map())).toBe('Named');
    const bare: ConfirmationLine = { id: 'b', productId: 'room_prod', quantity: 1, totalPrice: 1 };
    expect(resolveConfirmationLineName(bare, new Map([['room_prod', 'Sea View Room']]))).toBe('Sea View Room');
    expect(resolveConfirmationLineName(bare, { room_prod: 'Sea View Room' })).toBe('Sea View Room');
    expect(resolveConfirmationLineName(bare, new Map())).toBe('Item');
    // Raw ids never leak: an unmapped line renders the generic label, not its id.
    expect(resolveConfirmationLineName(bare, new Map())).not.toContain('room_prod');
  });
});

// ─── Render: grouped confirmation ────────────────────────────────────────────

describe('StorefrontConfirmation grouping (5d)', () => {
  it('renders Accommodation + Restaurant sections with exactly one total', async () => {
    mockOrder('confirmed', 250);
    mockDirectory();
    saveConfirmationSnapshot(ORDER_NUMBER, MIXED_LINES);

    renderWithClient(
      <StorefrontConfirmation orderNumber={ORDER_NUMBER} tenantId="t1" primaryColor="#4a7c4f" tenantName="Shop" />,
    );

    // Group labels from project names.
    expect(await screen.findByText('Accommodation')).toBeInTheDocument();
    expect(screen.getByText('Restaurant')).toBeInTheDocument();
    // Type captions ride along (labels from names/types).
    expect(screen.getByText('camp')).toBeInTheDocument();
    expect(screen.getByText('restaurant')).toBeInTheDocument();

    // Lines resolve catalog names — raw product/project ids never render.
    expect(screen.getByText('Sea View Room')).toBeInTheDocument();
    expect(screen.getByText('Camp Breakfast')).toBeInTheDocument();
    expect(screen.queryByText(/room_prod/)).toBeNull();
    expect(screen.queryByText(/proj_camp/)).toBeNull();
    expect(screen.queryByText(/proj_rest/)).toBeNull();

    const groups = screen.getAllByTestId('confirmation-group');
    expect(groups).toHaveLength(2);
    expect(screen.getAllByTestId('confirmation-line')).toHaveLength(2);

    // Exactly one grand total (the header amount is suppressed when groups render).
    const totals = screen.getAllByTestId('confirmation-total');
    expect(totals).toHaveLength(1);
    expect(totals[0]).toHaveTextContent('Total');
    expect(totals[0]).toHaveTextContent('250');
    expect(screen.queryByTestId('confirmation-legacy-group')).toBeNull();
  });

  it('renders untagged legacy lines flat in one Legacy (Unassigned) bucket', async () => {
    mockOrder('pending', 300);
    mockDirectory();
    saveConfirmationSnapshot(ORDER_NUMBER, [
      { id: 'l1', productId: 'legacy_a', quantity: 2, totalPrice: 200, projectId: null },
      { id: 'l2', productId: 'legacy_b', quantity: 1, totalPrice: 100, projectId: 'proj_retired' },
    ]);

    renderWithClient(
      <StorefrontConfirmation orderNumber={ORDER_NUMBER} tenantId="t1" primaryColor="#4a7c4f" tenantName="Shop" />,
    );

    const legacy = await screen.findByTestId('confirmation-legacy-group');
    expect(legacy).toHaveTextContent('Legacy');
    expect(legacy).toHaveTextContent('Unassigned');
    expect(screen.queryAllByTestId('confirmation-group')).toHaveLength(0);
    // Flat: both lines in the one bucket, no per-project subsections.
    expect(within(legacy).getAllByTestId('confirmation-line')).toHaveLength(2);
    const titles = screen.getAllByTestId('confirmation-group-title');
    expect(titles).toHaveLength(1);

    const totals = screen.getAllByTestId('confirmation-total');
    expect(totals).toHaveLength(1);
    expect(totals[0]).toHaveTextContent('300');
  });

  it('buckets everything Legacy when the project directory fails', async () => {
    mockOrder('confirmed', 250);
    api.apiFetch.mockRejectedValue(new Error('offline'));
    api.getStorefrontProducts.mockResolvedValue(CATALOG);
    saveConfirmationSnapshot(ORDER_NUMBER, MIXED_LINES);

    renderWithClient(
      <StorefrontConfirmation orderNumber={ORDER_NUMBER} tenantId="t1" primaryColor="#4a7c4f" tenantName="Shop" />,
    );

    // Fail-soft: tags cannot resolve, so every line lands in Legacy — and no
    // raw project id is ever rendered as a heading.
    const legacy = await screen.findByTestId('confirmation-legacy-group');
    expect(within(legacy).getAllByTestId('confirmation-line')).toHaveLength(2);
    expect(screen.queryByText(/proj_camp/)).toBeNull();
    expect(screen.getAllByTestId('confirmation-total')).toHaveLength(1);
  });

  it('keeps the legacy header rendering when no snapshot exists', async () => {
    mockOrder('confirmed', 250);
    mockDirectory();

    renderWithClient(
      <StorefrontConfirmation orderNumber={ORDER_NUMBER} tenantId="t1" primaryColor="#4a7c4f" tenantName="Shop" />,
    );

    await screen.findByText('Order confirmed!');
    // Inline header amount (pre-5d shape) with no lines section and no total row.
    expect(screen.getByText(/250/)).toBeInTheDocument();
    expect(screen.queryByText('Order lines')).toBeNull();
    expect(screen.queryByTestId('confirmation-total')).toBeNull();
    // No directory/catalog fetches fire without snapshot lines.
    expect(api.apiFetch).not.toHaveBeenCalled();
    expect(api.getStorefrontProducts).not.toHaveBeenCalled();
  });
});
