import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MenuPanel from '@/components/admin/MenuPanel';

const mockShowToast = vi.fn();
const mockSaveMeal = vi.fn();
const mockDeleteMeal = vi.fn();
const mockSaveMealCategory = vi.fn();
const mockDeleteMealCategory = vi.fn();
let mockMeals: unknown[] = [];
let mockMealCategories: unknown[] = [];
let mockMealsLoading = false;
let mockCatsLoading = false;

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

// Phase 6: MenuPanel consumes TanStack Query data hooks + invalidates
// ['admin', ...] concerns on change instead of legacy useAdminData.refresh().
vi.mock('@/hooks/useQueryHooks', () => ({
  queryKeys: {
    meals: ['admin', 'meals'],
    mealCategories: ['admin', 'mealCategories'],
  },
  useMealsQuery: () => ({ data: mockMeals, isLoading: mockMealsLoading }),
  useMealCategoriesQuery: () => ({ data: mockMealCategories, isLoading: mockCatsLoading }),
}));

vi.mock('@/lib/api', () => ({
  saveMeal: (...args: unknown[]) => mockSaveMeal(...args),
  deleteMeal: (...args: unknown[]) => mockDeleteMeal(...args),
  saveMealCategory: (...args: unknown[]) => mockSaveMealCategory(...args),
  deleteMealCategory: (...args: unknown[]) => mockDeleteMealCategory(...args),
}));

vi.mock('@/lib/utils', () => ({
  formatCurrency: (n: number) => `$${Number(n).toFixed(2)}`,
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
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
  ConfirmDialog: ({ open, title, message, onConfirm, onCancel }: { open: boolean; title: string; message: string; onConfirm: () => void; onCancel: () => void }) => (
    open ? (
      <div data-testid="confirm-dialog">
        <h3>{title}</h3>
        <p>{message}</p>
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null
  ),
}));

vi.mock('@/components/ui/Badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

const camps = [{ id: 'c1', name: 'Camp 1', location: 'Sinai', startDate: '2025-01-01', endDate: '2025-12-31', capacity: 50, status: 'active', notes: '' }];

// The panel reads useQueryClient() to invalidate concerns — provide a fresh
// client per render and expose an invalidation spy for refresh assertions.
let invalidateSpy: ReturnType<typeof vi.fn>;
function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  invalidateSpy = vi.spyOn(client, 'invalidateQueries');
  return render(
    <QueryClientProvider client={client}>
      <MenuPanel campIds={['c1']} camps={camps} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMeals = [];
  mockMealCategories = [{ id: 'cat1', name: 'Main Course', position: 1 }];
  mockMealsLoading = false;
  mockCatsLoading = false;
});

describe('MenuPanel', () => {
  it('renders with meals section by default', () => {
    renderPanel();
    expect(screen.getByText('Menu Management')).toBeInTheDocument();
    expect(screen.getAllByText('Add Meal').length).toBeGreaterThanOrEqual(1);
  });

  it('shows empty state when no meals', () => {
    renderPanel();
    expect(screen.getByText('No meals found')).toBeInTheDocument();
  });

  it('switches to categories section', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('Categories'));
    await waitFor(() => {
      expect(screen.getByText('Main Course')).toBeInTheDocument();
    });
  });

  it('shows category filter', () => {
    renderPanel();
    expect(screen.getByText('Filter by category:')).toBeInTheDocument();
  });

  it('shows loading spinner when loading', () => {
    mockMealsLoading = true;
    renderPanel();
    expect(screen.getByText('Loading menu...')).toBeInTheDocument();
  });

  it('displays meal data when meals exist', () => {
    mockMeals = [
      { id: 'm1', name: 'Grilled Chicken', mealCategoryId: 'cat1', price: 15.5, description: 'Delicious', imageUrl: '', isActive: 1 },
    ];
    renderPanel();
    expect(screen.getByText('Grilled Chicken')).toBeInTheDocument();
  });

  it('opens add meal form', async () => {
    renderPanel();
    const addMealBtns = screen.getAllByText('Add Meal');
    fireEvent.click(addMealBtns[0]);
    await waitFor(() => {
      expect(screen.getByText('Add New Meal')).toBeInTheDocument();
    });
  });

  it('validates meal name on save', async () => {
    renderPanel();
    const addMealBtns = screen.getAllByText('Add Meal');
    fireEvent.click(addMealBtns[0]);
    await waitFor(() => {
      expect(screen.getByText('Add New Meal')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Save Meal'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Meal name is required.', 'warning');
    });
  });

  it('validates category on meal save', async () => {
    renderPanel();
    const addMealBtns = screen.getAllByText('Add Meal');
    fireEvent.click(addMealBtns[0]);
    await waitFor(() => {
      expect(screen.getByText('Add New Meal')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('Meal name'), { target: { value: 'New Meal' } });
    fireEvent.click(screen.getByText('Save Meal'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Category is required.', 'warning');
    });
  });

  it('saves meal successfully', async () => {
    mockSaveMeal.mockResolvedValueOnce({});
    renderPanel();
    const addMealBtns = screen.getAllByText('Add Meal');
    fireEvent.click(addMealBtns[0]);
    await waitFor(() => {
      expect(screen.getByText('Add New Meal')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('Meal name'), { target: { value: 'New Meal' } });
    fireEvent.change(screen.getByLabelText('Category *'), { target: { value: 'cat1' } });
    fireEvent.click(screen.getByText('Save Meal'));
    await waitFor(() => {
      expect(mockSaveMeal).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('Meal created.', 'success');
    });
  });

  it('shows error when saving meal fails', async () => {
    mockSaveMeal.mockRejectedValueOnce(new Error('Save failed'));
    renderPanel();
    const addMealBtns = screen.getAllByText('Add Meal');
    fireEvent.click(addMealBtns[0]);
    await waitFor(() => {
      expect(screen.getByText('Add New Meal')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('Meal name'), { target: { value: 'New Meal' } });
    fireEvent.change(screen.getByLabelText('Category *'), { target: { value: 'cat1' } });
    fireEvent.click(screen.getByText('Save Meal'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error saving meal: Save failed', 'error');
    });
  });

  it('opens add category form', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('Categories'));
    await waitFor(() => {
      expect(screen.getByText('Main Course')).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByText('Add Category')[0]);
    await waitFor(() => {
      expect(screen.getByText('Add New Category')).toBeInTheDocument();
    });
  });

  it('validates category name on save', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('Categories'));
    await waitFor(() => {
      expect(screen.getByText('Main Course')).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByText('Add Category')[0]);
    await waitFor(() => {
      expect(screen.getByText('Add New Category')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Save Category'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Category name is required.', 'warning');
    });
  });

  it('saves category successfully', async () => {
    mockSaveMealCategory.mockResolvedValueOnce({});
    renderPanel();
    fireEvent.click(screen.getByText('Categories'));
    await waitFor(() => {
      expect(screen.getByText('Main Course')).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByText('Add Category')[0]);
    await waitFor(() => {
      expect(screen.getByText('Add New Category')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText(/Appetizers/), { target: { value: 'Desserts' } });
    fireEvent.click(screen.getByText('Save Category'));
    await waitFor(() => {
      expect(mockSaveMealCategory).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('Category created.', 'success');
    });
  });

  it('shows error when saving category fails', async () => {
    mockSaveMealCategory.mockRejectedValueOnce(new Error('Cat save failed'));
    renderPanel();
    fireEvent.click(screen.getByText('Categories'));
    await waitFor(() => {
      expect(screen.getByText('Main Course')).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByText('Add Category')[0]);
    await waitFor(() => {
      expect(screen.getByText('Add New Category')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText(/Appetizers/), { target: { value: 'Desserts' } });
    fireEvent.click(screen.getByText('Save Category'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error saving category: Cat save failed', 'error');
    });
  });

  it('displays category data when categories exist', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('Categories'));
    await waitFor(() => {
      expect(screen.getByText('Main Course')).toBeInTheDocument();
    });
  });

  it('shows delete meal button', () => {
    mockMeals = [
      { id: 'm1', name: 'Grilled Chicken', mealCategoryId: 'cat1', price: 15.5, description: '', imageUrl: '', isActive: 1 },
    ];
    renderPanel();
    expect(screen.getByText('Del')).toBeInTheDocument();
  });

  it('shows delete category button', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('Categories'));
    await waitFor(() => {
      expect(screen.getByText('Main Course')).toBeInTheDocument();
    });
    expect(screen.getByText('Del')).toBeInTheDocument();
  });

  it('filters meals by category', async () => {
    mockMeals = [
      { id: 'm1', name: 'Chicken', mealCategoryId: 'cat1', price: 15.5, description: '', imageUrl: '', isActive: 1 },
      { id: 'm2', name: 'Salad', mealCategoryId: 'cat2', price: 8, description: '', imageUrl: '', isActive: 1 },
    ];
    mockMealCategories = [
      { id: 'cat1', name: 'Main Course', position: 1 },
      { id: 'cat2', name: 'Starters', position: 2 },
    ];
    renderPanel();
    expect(screen.getByText('Chicken')).toBeInTheDocument();
    expect(screen.getByText('Salad')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'cat1' } });
    await waitFor(() => {
      expect(screen.queryByText('Salad')).not.toBeInTheDocument();
      expect(screen.getByText('Chicken')).toBeInTheDocument();
    });
  });

  it('shows uncategorized badge for meals without a category', () => {
    mockMeals = [{ id: 'm1', name: 'Mystery Meal', mealCategoryId: null, price: 5, description: '', imageUrl: '', isActive: 1 }];
    renderPanel();
    expect(screen.getByText('Uncategorized')).toBeInTheDocument();
  });

  it('opens edit meal form pre-filled and saves', async () => {
    mockMeals = [{ id: 'm1', name: 'Chicken', mealCategoryId: 'cat1', price: 15.5, description: 'Grilled', imageUrl: '', isActive: 1 }];
    mockSaveMeal.mockResolvedValueOnce({});
    renderPanel();
    fireEvent.click(screen.getByText('Edit'));
    await waitFor(() => { expect(screen.getByText('Edit Meal')).toBeInTheDocument(); });
    fireEvent.change(screen.getByDisplayValue('Grilled'), { target: { value: 'Marinated' } });
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Image URL'), { target: { value: 'https://x/y.jpg' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: '0' } });
    fireEvent.click(screen.getByText('Update Meal'));
    await waitFor(() => {
      expect(mockSaveMeal).toHaveBeenCalledWith(expect.objectContaining({ price: 20, isActive: 0, description: 'Marinated' }), 'm1');
      expect(mockShowToast).toHaveBeenCalledWith('Meal updated.', 'success');
    });
  });

  it('deletes a meal after confirmation', async () => {
    mockMeals = [{ id: 'm1', name: 'Chicken', mealCategoryId: 'cat1', price: 15.5, description: '', imageUrl: '', isActive: 1 }];
    mockDeleteMeal.mockResolvedValueOnce({});
    renderPanel();
    fireEvent.click(screen.getByText('Del'));
    await waitFor(() => { expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Confirm'));
    await waitFor(() => {
      expect(mockDeleteMeal).toHaveBeenCalledWith('m1');
      expect(mockShowToast).toHaveBeenCalledWith('Meal deleted.', 'success');
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'meals'] });
    });
  });

  it('shows error when deleting meal fails', async () => {
    mockMeals = [{ id: 'm1', name: 'Chicken', mealCategoryId: 'cat1', price: 15.5, description: '', imageUrl: '', isActive: 1 }];
    mockDeleteMeal.mockRejectedValueOnce(new Error('boom'));
    renderPanel();
    fireEvent.click(screen.getByText('Del'));
    await waitFor(() => { expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Confirm'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error deleting: boom', 'error');
    });
  });

  it('cancels meal delete', async () => {
    mockMeals = [{ id: 'm1', name: 'Chicken', mealCategoryId: 'cat1', price: 15.5, description: '', imageUrl: '', isActive: 1 }];
    renderPanel();
    fireEvent.click(screen.getByText('Del'));
    await waitFor(() => { expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
    });
    expect(mockDeleteMeal).not.toHaveBeenCalled();
  });

  it('deletes a category after confirmation', async () => {
    mockDeleteMealCategory.mockResolvedValueOnce({});
    renderPanel();
    fireEvent.click(screen.getByText('Categories'));
    await waitFor(() => { expect(screen.getByText('Main Course')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Del'));
    await waitFor(() => { expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Confirm'));
    await waitFor(() => {
      expect(mockDeleteMealCategory).toHaveBeenCalledWith('cat1');
      expect(mockShowToast).toHaveBeenCalledWith('Category deleted.', 'success');
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'mealCategories'] });
    });
  });

  it('opens edit category form pre-filled and saves', async () => {
    mockSaveMealCategory.mockResolvedValueOnce({});
    renderPanel();
    fireEvent.click(screen.getByText('Categories'));
    await waitFor(() => { expect(screen.getByText('Main Course')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Edit'));
    await waitFor(() => { expect(screen.getByText('Edit Category')).toBeInTheDocument(); });
    fireEvent.change(screen.getByPlaceholderText(/Appetizers/), { target: { value: 'Desserts' } });
    fireEvent.click(screen.getByText('Update Category'));
    await waitFor(() => {
      expect(mockSaveMealCategory).toHaveBeenCalledWith(expect.objectContaining({ name: 'Desserts' }), 'cat1');
      expect(mockShowToast).toHaveBeenCalledWith('Category updated.', 'success');
    });
  });

  it('adds category from empty state action', async () => {
    mockMealCategories = [];
    renderPanel();
    fireEvent.click(screen.getByText('Categories'));
    await waitFor(() => { expect(screen.getByText('No categories yet')).toBeInTheDocument(); });
    fireEvent.click(screen.getAllByText('Add Category')[1]);
    await waitFor(() => { expect(screen.getByText('Add New Category')).toBeInTheDocument(); });
  });

  it('switches back to meals section', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('Categories'));
    await waitFor(() => { expect(screen.getByText('Main Course')).toBeInTheDocument(); });
    fireEvent.click(screen.getByRole('button', { name: 'Meals' }));
    await waitFor(() => { expect(screen.getByText('Filter by category:')).toBeInTheDocument(); });
  });

  it('shows meal count per category', async () => {
    mockMeals = [{ id: 'm1', name: 'Chicken', mealCategoryId: 'cat1', price: 15.5, description: '', imageUrl: '', isActive: 1 }];
    renderPanel();
    fireEvent.click(screen.getByText('Categories'));
    await waitFor(() => { expect(screen.getByText('Main Course')).toBeInTheDocument(); });
    expect(screen.getAllByText('1')).toHaveLength(2);
  });

  it('closes meal form on close', async () => {
    renderPanel();
    fireEvent.click(screen.getAllByText('Add Meal')[0]);
    await waitFor(() => { expect(screen.getByText('Add New Meal')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Close'));
    await waitFor(() => {
      expect(screen.queryByText('Add New Meal')).not.toBeInTheDocument();
    });
  });

  it('closes category form on close', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('Categories'));
    await waitFor(() => { expect(screen.getByText('Main Course')).toBeInTheDocument(); });
    fireEvent.click(screen.getAllByText('Add Category')[0]);
    await waitFor(() => { expect(screen.getByText('Add New Category')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Close'));
    await waitFor(() => {
      expect(screen.queryByText('Add New Category')).not.toBeInTheDocument();
    });
  });
});
