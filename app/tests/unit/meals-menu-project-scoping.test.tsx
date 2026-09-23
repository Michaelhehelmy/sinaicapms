import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MealsPanel from '@/components/admin/MealsPanel';
import MenuPanel from '@/components/admin/MenuPanel';
import MenuPlannerPanel from '@/components/admin/MenuPlannerPanel';
import TenantMenu, { mealProjectName } from '@/components/public/TenantMenu';
import { useMealsQuery, useMealCategoriesQuery, useMealSchedulesQuery } from '@/hooks/useQueryHooks';
import * as api from '@/lib/api';

// P2-C frontend: admin scoping (current project → projectId) + public merged
// menu (per-meal project label, legacy-shape tolerance). Backend ?projectId
// support lands in parallel (P2-B) — panel tests assert the frontend half of
// the recon contract against mocked hooks/api and never invent backend reads.

const mockShowToast = vi.fn();

// Per-project meal fixtures. When set, the mocked useMealsQuery serves the
// slice for the requested projectId (lets the switcher test assert the list
// actually changes); otherwise it serves `mockMeals` for any scope.
let mockMeals: unknown[] = [];
let mockMealsByProject: Record<string, unknown[]> | null = null;
let mockMealCategories: unknown[] = [];
let mockSchedules: unknown[] = [];

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/hooks/useQueryHooks', () => ({
  queryKeys: {
    meals: ['admin', 'meals'],
    mealCategories: ['admin', 'mealCategories'],
    mealSchedules: (params?: Record<string, string>) => ['admin', 'mealSchedules', params],
  },
  useMealsQuery: vi.fn((projectId?: string) => ({
    data:
      mockMealsByProject && projectId ? (mockMealsByProject[projectId] ?? []) : mockMeals,
    isLoading: false,
  })),
  useMealCategoriesQuery: vi.fn(() => ({ data: mockMealCategories, isLoading: false })),
  useMealSchedulesQuery: vi.fn(() => ({ data: mockSchedules, isLoading: false })),
}));

vi.mock('@/lib/api', () => ({
  saveMeal: vi.fn(),
  deleteMeal: vi.fn(),
  saveMealCategory: vi.fn(),
  deleteMealCategory: vi.fn(),
  bulkCreateMeals: vi.fn(),
  createMealSchedule: vi.fn(),
  deleteMealSchedule: vi.fn(),
}));

const mockSaveMeal = vi.mocked(api.saveMeal);
const mockSaveMealCategory = vi.mocked(api.saveMealCategory);
const mockBulkCreateMeals = vi.mocked(api.bulkCreateMeals);
const mockCreateMealSchedule = vi.mocked(api.createMealSchedule);

const camps = [
  { id: 'c1', name: 'Acacia', location: 'Sinai', startDate: '2025-01-01', endDate: '2025-12-31', capacity: 50, status: 'active', notes: '' },
  { id: 'c2', name: 'Dahab', location: 'Sinai', startDate: '2025-01-01', endDate: '2025-12-31', capacity: 30, status: 'active', notes: '' },
];

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockMeals = [];
  mockMealsByProject = null;
  mockMealCategories = [{ id: 'cat1', name: 'Mains', position: 1 }];
  mockSchedules = [];
  mockSaveMeal.mockResolvedValue({} as never);
  mockSaveMealCategory.mockResolvedValue({} as never);
  mockBulkCreateMeals.mockResolvedValue({ count: 1 } as never);
  mockCreateMealSchedule.mockResolvedValue({} as never);
});

describe('MealsPanel project scoping', () => {
  it('scopes meal + category queries to the current project (campIds[0])', () => {
    renderWithClient(<MealsPanel campIds={['c1']} camps={camps} />);
    expect(vi.mocked(useMealsQuery)).toHaveBeenCalledWith('c1');
    expect(vi.mocked(useMealCategoriesQuery)).toHaveBeenCalledWith('c1');
  });

  it('fresh login with no explicit selection defaults to the tenant default project (camps[0]) — never "all"', () => {
    renderWithClient(<MealsPanel campIds={[]} camps={camps} />);
    expect(vi.mocked(useMealsQuery)).toHaveBeenCalledWith('c1');
    expect(vi.mocked(useMealCategoriesQuery)).toHaveBeenCalledWith('c1');
    for (const call of vi.mocked(useMealsQuery).mock.calls) {
      expect(call[0]).toBe('c1');
    }
  });

  it('switching the project selector re-scopes the list', async () => {
    mockMealsByProject = {
      c1: [{ id: 'm1', name: 'Acacia Stew', mealCategoryId: 'cat1', price: 10, description: '', imageUrl: '', isActive: 1 }],
      c2: [{ id: 'm2', name: 'Dahab Grill', mealCategoryId: 'cat1', price: 20, description: '', imageUrl: '', isActive: 1 }],
    };
    const view = renderWithClient(<MealsPanel campIds={['c1']} camps={camps} />);
    expect(await screen.findByText('Acacia Stew')).toBeInTheDocument();
    expect(screen.queryByText('Dahab Grill')).not.toBeInTheDocument();
    view.rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MealsPanel campIds={['c2']} camps={camps} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Dahab Grill')).toBeInTheDocument();
    expect(screen.queryByText('Acacia Stew')).not.toBeInTheDocument();
    expect(vi.mocked(useMealsQuery)).toHaveBeenLastCalledWith('c2');
  });

  it('tags created meals with the current projectId; edits omit it (no moves)', async () => {
    renderWithClient(<MealsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getAllByText('Add Meal')[0]);
    await waitFor(() => expect(screen.getByText('Add New Meal')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('Meal name'), { target: { value: 'Koshary' } });
    fireEvent.change(screen.getByLabelText('Category *'), { target: { value: 'cat1' } });
    fireEvent.click(screen.getByText('Save Meal'));
    await waitFor(() => expect(mockSaveMeal).toHaveBeenCalled());
    const [payload, editId] = mockSaveMeal.mock.calls[0];
    expect(payload).toMatchObject({ name: 'Koshary', mealCategoryId: 'cat1', projectId: 'c1' });
    expect(editId).toBeUndefined();
  });

  it('edits do not carry projectId', async () => {
    mockMeals = [
      { id: 'm1', name: 'Koshary', mealCategoryId: 'cat1', price: 50, description: '', imageUrl: '', isActive: 1 },
    ];
    renderWithClient(<MealsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => expect(screen.getByText('Edit Meal')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Update Meal'));
    await waitFor(() => expect(mockSaveMeal).toHaveBeenCalled());
    const [payload, editId] = mockSaveMeal.mock.calls[0];
    expect(editId).toBe('m1');
    expect(payload).not.toHaveProperty('projectId');
  });

  it('tags created categories with the current projectId', async () => {
    renderWithClient(<MealsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Categories'));
    fireEvent.click(screen.getAllByText('Add Category')[0]);
    await waitFor(() => expect(screen.getByText('Add New Category')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/Appetizers/), { target: { value: 'Grills' } });
    fireEvent.click(screen.getByText('Save Category'));
    await waitFor(() => expect(mockSaveMealCategory).toHaveBeenCalled());
    expect(mockSaveMealCategory.mock.calls[0][0]).toMatchObject({ name: 'Grills', projectId: 'c1' });
  });
});

describe('MenuPanel project scoping', () => {
  it('scopes queries to the current project; fresh login defaults to camps[0]', () => {
    const view = renderWithClient(<MenuPanel campIds={['c2']} camps={camps} />);
    expect(vi.mocked(useMealsQuery)).toHaveBeenCalledWith('c2');
    expect(vi.mocked(useMealCategoriesQuery)).toHaveBeenCalledWith('c2');
    view.unmount();
    renderWithClient(<MenuPanel campIds={[]} camps={camps} />);
    expect(vi.mocked(useMealsQuery)).toHaveBeenCalledWith('c1');
  });

  it('tags single creates with the current projectId', async () => {
    renderWithClient(<MenuPanel campIds={['c2']} camps={camps} />);
    fireEvent.click(screen.getAllByText('Add Meal')[0]);
    await waitFor(() => expect(screen.getByText('Add New Meal')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('Meal name'), { target: { value: 'Tagine' } });
    fireEvent.change(screen.getByLabelText('Category *'), { target: { value: 'cat1' } });
    fireEvent.click(screen.getByText('Save Meal'));
    await waitFor(() => expect(mockSaveMeal).toHaveBeenCalled());
    expect(mockSaveMeal.mock.calls[0][0]).toMatchObject({ name: 'Tagine', projectId: 'c2' });
  });

  it('bulk create passes the current project alongside the items', async () => {
    renderWithClient(<MenuPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Bulk Add'));
    await waitFor(() => expect(screen.getByText('Bulk Add Menu Items')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('bulk-meal-name-0'), { target: { value: 'Bulk Koshary' } });
    fireEvent.click(screen.getByText('Create 1 Meals'));
    await waitFor(() => expect(mockBulkCreateMeals).toHaveBeenCalled());
    const [items, projectId] = mockBulkCreateMeals.mock.calls[0];
    expect(projectId).toBe('c1');
    expect(items).toEqual([{ name: 'Bulk Koshary', mealCategoryId: undefined, price: 0, description: undefined }]);
  });
});

describe('MenuPlannerPanel project scoping', () => {
  it('narrows schedules via ?projectId and scopes meals; fresh login defaults to camps[0]', () => {
    renderWithClient(<MenuPlannerPanel campIds={['c1']} camps={camps} />);
    expect(vi.mocked(useMealSchedulesQuery)).toHaveBeenCalledWith({ projectId: 'c1' });
    expect(vi.mocked(useMealsQuery)).toHaveBeenCalledWith('c1');
    vi.clearAllMocks();
    renderWithClient(<MenuPlannerPanel campIds={[]} camps={camps} />);
    expect(vi.mocked(useMealSchedulesQuery)).toHaveBeenCalledWith({ projectId: 'c1' });
  });

  it('keeps new-shape (projectId) and legacy (campId) rows of the current project; hides other projects', () => {
    const date = todayISO();
    mockSchedules = [
      { id: 's1', tenantId: 't1', campId: 'c1', campName: 'Acacia', date, mealId: 'm1', mealName: 'Koshary Night', packageType: 'all', maxServings: 50, createdAt: date },
      { id: 's2', tenantId: 't1', campId: 'c1', campName: 'Acacia', date, mealId: 'm1', mealName: 'Project Echo Feast', packageType: 'all', maxServings: 20, createdAt: date, projectId: 'c1' },
      { id: 's3', tenantId: 't1', campId: 'c2', campName: 'Dahab', date, mealId: 'm9', mealName: 'Other Camp Dinner', packageType: 'all', maxServings: 20, createdAt: date },
    ];
    renderWithClient(<MenuPlannerPanel campIds={['c1']} camps={camps} />);
    expect(screen.getByText('Koshary Night')).toBeInTheDocument();
    expect(screen.getByText('Project Echo Feast')).toBeInTheDocument();
    expect(screen.queryByText('Other Camp Dinner')).not.toBeInTheDocument();
  });

  it('tags created schedules with projectId alongside the legacy campId', async () => {
    mockMeals = [{ id: 'm1', name: 'Koshary', mealCategoryId: 'cat1', price: 10, description: '', imageUrl: '', isActive: 1 }];
    mockSchedules = [];
    renderWithClient(<MenuPlannerPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getAllByText('+ Add Meal')[0]);
    await waitFor(() => expect(screen.getByText('Schedule Meal')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Meal *'), { target: { value: 'm1' } });
    fireEvent.click(screen.getByText('Schedule'));
    await waitFor(() => expect(mockCreateMealSchedule).toHaveBeenCalled());
    expect(mockCreateMealSchedule.mock.calls[0][0]).toMatchObject({
      campId: 'c1',
      projectId: 'c1',
      mealId: 'm1',
    });
  });
});

describe('mealProjectName resolution', () => {
  it('prefers the flat projectName echo', () => {
    expect(mealProjectName({ projectId: 'p1', projectName: 'Acacia' })).toBe('Acacia');
  });

  it('falls back to the projects sibling map by projectId', () => {
    expect(
      mealProjectName({ projectId: 'p9' }, [{ id: 'p9', name: 'Siwa' }]),
    ).toBe('Siwa');
  });

  it('falls back to the nested project object', () => {
    expect(mealProjectName({ project: { id: 'p2', name: 'Nuwa' } })).toBe('Nuwa');
  });

  it('returns undefined for legacy rows and unresolvable id-only rows', () => {
    expect(mealProjectName({})).toBeUndefined();
    expect(mealProjectName({ projectId: 'p1' })).toBeUndefined();
  });
});

describe('TenantMenu merged all-projects render + legacy tolerance', () => {
  const categories = [
    { id: 'cat1', name: 'Mains', position: 1 },
    { id: 'cat2', name: 'Starters', position: 2 },
  ];

  it('renders meals from all projects merged with per-meal project labels', () => {
    const meals = [
      { id: 'm1', name: 'Acacia Stew', mealCategoryId: 'cat1', price: 100, isActive: 1, projectId: 'c1', projectName: 'Acacia' },
      { id: 'm2', name: 'Dahab Grill', mealCategoryId: 'cat1', price: 150, isActive: 1, projectId: 'c2', projectName: 'Dahab' },
      { id: 'm3', name: 'Shared Soup', mealCategoryId: 'cat2', price: 60, isActive: 1, projectId: 'c2', projectName: 'Dahab' },
    ];
    render(
      <TenantMenu meals={meals} mealCategories={categories} tenantName="Test Camp" />,
    );
    // Merged: both projects' meals appear under the shared category.
    expect(screen.getByText('Acacia Stew')).toBeInTheDocument();
    expect(screen.getByText('Dahab Grill')).toBeInTheDocument();
    expect(screen.getByText('Shared Soup')).toBeInTheDocument();
    // Per-meal project labels.
    expect(screen.getByTestId('meal-project-m1')).toHaveTextContent('from Acacia');
    expect(screen.getByTestId('meal-project-m2')).toHaveTextContent('from Dahab');
  });

  it('renders legacy responses without project fields identically — no labels, no crash', () => {
    const meals = [
      { id: 'm1', name: 'Grilled Chicken', mealCategoryId: 'cat1', price: 250, description: 'Tasty', isActive: 1 },
      { id: 'm2', name: 'Pasta', mealCategoryId: 'cat1', price: 180, isActive: 1 },
    ];
    render(
      <TenantMenu meals={meals} mealCategories={categories} tenantName="Test Camp" />,
    );
    expect(screen.getByText('Grilled Chicken')).toBeInTheDocument();
    expect(screen.getByText('Pasta')).toBeInTheDocument();
    expect(screen.queryByText(/from /)).not.toBeInTheDocument();
    expect(screen.queryByTestId('meal-project-m1')).not.toBeInTheDocument();
  });

  it('resolves labels via the projects map and nested shape; id-only rows stay label-free', () => {
    const meals = [
      { id: 'm1', name: 'Map Meal', mealCategoryId: 'cat1', price: 10, isActive: 1, projectId: 'p9' },
      { id: 'm2', name: 'Nested Meal', mealCategoryId: 'cat1', price: 10, isActive: 1, project: { id: 'p2', name: 'Nuwa' } },
      { id: 'm3', name: 'Id Only Meal', mealCategoryId: 'cat1', price: 10, isActive: 1, projectId: 'p-unknown' },
    ];
    render(
      <TenantMenu
        meals={meals}
        mealCategories={categories}
        tenantName="Test Camp"
        projects={[{ id: 'p9', name: 'Siwa' }]}
      />,
    );
    expect(screen.getByTestId('meal-project-m1')).toHaveTextContent('from Siwa');
    expect(screen.getByTestId('meal-project-m2')).toHaveTextContent('from Nuwa');
    expect(screen.getByText('Id Only Meal')).toBeInTheDocument();
    expect(screen.queryByTestId('meal-project-m3')).not.toBeInTheDocument();
  });

  it('mixed legacy + new-shape rows render together (tolerant merge)', () => {
    const meals = [
      { id: 'm1', name: 'Legacy Pie', mealCategoryId: 'cat1', price: 70, isActive: 1 },
      { id: 'm2', name: 'New Curry', mealCategoryId: 'cat1', price: 90, isActive: 1, projectId: 'c1', projectName: 'Acacia' },
    ];
    render(
      <TenantMenu meals={meals} mealCategories={categories} tenantName="Test Camp" />,
    );
    expect(screen.getByText('Legacy Pie')).toBeInTheDocument();
    expect(screen.getByText('New Curry')).toBeInTheDocument();
    expect(screen.getByTestId('meal-project-m2')).toHaveTextContent('from Acacia');
    expect(screen.queryByTestId('meal-project-m1')).not.toBeInTheDocument();
  });

  it('search still matches across projects and legacy rows', () => {
    const meals = [
      { id: 'm1', name: 'Acacia Stew', mealCategoryId: 'cat1', price: 100, isActive: 1, projectId: 'c1', projectName: 'Acacia' },
      { id: 'm2', name: 'Plain Rice', mealCategoryId: 'cat1', price: 40, isActive: 1 },
    ];
    render(
      <TenantMenu meals={meals} mealCategories={categories} tenantName="Test Camp" />,
    );
    fireEvent.change(screen.getByTestId('menu-search'), { target: { value: 'stew' } });
    expect(screen.getByText('Acacia Stew')).toBeInTheDocument();
    expect(screen.queryByText('Plain Rice')).not.toBeInTheDocument();
  });
});
