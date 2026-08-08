import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MenuPanel from '@/components/admin/MenuPanel';

const mockShowToast = vi.fn();
const mockRefreshMeals = vi.fn();
const mockRefreshCats = vi.fn();
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

vi.mock('@/hooks/useAdminData', () => ({
  useMeals: () => ({ data: mockMeals, loading: mockMealsLoading, refresh: mockRefreshMeals }),
  useMealCategories: () => ({ data: mockMealCategories, loading: mockCatsLoading, refresh: mockRefreshCats }),
  useCamps: () => ({ data: [] }),
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

beforeEach(() => {
  vi.clearAllMocks();
  mockMeals = [];
  mockMealCategories = [{ id: 'cat1', name: 'Main Course', position: 1 }];
  mockMealsLoading = false;
  mockCatsLoading = false;
});

describe('MenuPanel', () => {
  it('renders with meals section by default', () => {
    render(<MenuPanel campIds={['c1']} camps={camps} />);
    expect(screen.getByText('Menu Management')).toBeInTheDocument();
    expect(screen.getAllByText('Add Meal').length).toBeGreaterThanOrEqual(1);
  });

  it('shows empty state when no meals', () => {
    render(<MenuPanel campIds={['c1']} camps={camps} />);
    expect(screen.getByText('No meals found')).toBeInTheDocument();
  });

  it('switches to categories section', async () => {
    render(<MenuPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Categories'));
    await waitFor(() => {
      expect(screen.getByText('Main Course')).toBeInTheDocument();
    });
  });

  it('shows category filter', () => {
    render(<MenuPanel campIds={['c1']} camps={camps} />);
    expect(screen.getByText('Filter by category:')).toBeInTheDocument();
  });

  it('shows loading spinner when loading', () => {
    mockMealsLoading = true;
    render(<MenuPanel campIds={['c1']} camps={camps} />);
    expect(screen.getByText('Loading menu...')).toBeInTheDocument();
  });

  it('displays meal data when meals exist', () => {
    mockMeals = [
      { id: 'm1', name: 'Grilled Chicken', mealCategoryId: 'cat1', price: 15.5, description: 'Delicious', imageUrl: '', isActive: 1 },
    ];
    render(<MenuPanel campIds={['c1']} camps={camps} />);
    expect(screen.getByText('Grilled Chicken')).toBeInTheDocument();
  });

  it('opens add meal form', async () => {
    render(<MenuPanel campIds={['c1']} camps={camps} />);
    const addMealBtns = screen.getAllByText('Add Meal');
    fireEvent.click(addMealBtns[0]);
    await waitFor(() => {
      expect(screen.getByText('Add New Meal')).toBeInTheDocument();
    });
  });

  it('validates meal name on save', async () => {
    render(<MenuPanel campIds={['c1']} camps={camps} />);
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
    render(<MenuPanel campIds={['c1']} camps={camps} />);
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
    render(<MenuPanel campIds={['c1']} camps={camps} />);
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
    render(<MenuPanel campIds={['c1']} camps={camps} />);
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
    render(<MenuPanel campIds={['c1']} camps={camps} />);
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
    render(<MenuPanel campIds={['c1']} camps={camps} />);
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
    render(<MenuPanel campIds={['c1']} camps={camps} />);
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
    render(<MenuPanel campIds={['c1']} camps={camps} />);
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
    render(<MenuPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Categories'));
    await waitFor(() => {
      expect(screen.getByText('Main Course')).toBeInTheDocument();
    });
  });

  it('shows delete meal button', () => {
    mockMeals = [
      { id: 'm1', name: 'Grilled Chicken', mealCategoryId: 'cat1', price: 15.5, description: '', imageUrl: '', isActive: 1 },
    ];
    render(<MenuPanel campIds={['c1']} camps={camps} />);
    expect(screen.getByText('Del')).toBeInTheDocument();
  });

  it('shows delete category button', async () => {
    render(<MenuPanel campIds={['c1']} camps={camps} />);
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
    render(<MenuPanel campIds={['c1']} camps={camps} />);
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
    render(<MenuPanel campIds={['c1']} camps={camps} />);
    expect(screen.getByText('Uncategorized')).toBeInTheDocument();
  });

  it('opens edit meal form pre-filled and saves', async () => {
    mockMeals = [{ id: 'm1', name: 'Chicken', mealCategoryId: 'cat1', price: 15.5, description: 'Grilled', imageUrl: '', isActive: 1 }];
    mockSaveMeal.mockResolvedValueOnce({});
    render(<MenuPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Edit'));
    await waitFor(() => { expect(screen.getByText('Edit Meal')).toBeInTheDocument(); });
    fireEvent.change(screen.getByDisplayValue('Grilled'), { target: { value: 'Marinated' } });
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Image URL'), { target: { value: 'https://x/y.jpg' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: '0' } });
    fireEvent.click(screen.getByText('Update Meal'));
    await waitFor(() => {
      expect(mockSaveMeal).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1', price: 20, isActive: 0, description: 'Marinated' }));
      expect(mockShowToast).toHaveBeenCalledWith('Meal updated.', 'success');
    });
  });

  it('deletes a meal after confirmation', async () => {
    mockMeals = [{ id: 'm1', name: 'Chicken', mealCategoryId: 'cat1', price: 15.5, description: '', imageUrl: '', isActive: 1 }];
    mockDeleteMeal.mockResolvedValueOnce({});
    render(<MenuPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Del'));
    await waitFor(() => { expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Confirm'));
    await waitFor(() => {
      expect(mockDeleteMeal).toHaveBeenCalledWith('m1');
      expect(mockShowToast).toHaveBeenCalledWith('Meal deleted.', 'success');
      expect(mockRefreshMeals).toHaveBeenCalled();
    });
  });

  it('shows error when deleting meal fails', async () => {
    mockMeals = [{ id: 'm1', name: 'Chicken', mealCategoryId: 'cat1', price: 15.5, description: '', imageUrl: '', isActive: 1 }];
    mockDeleteMeal.mockRejectedValueOnce(new Error('boom'));
    render(<MenuPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Del'));
    await waitFor(() => { expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Confirm'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error deleting: boom', 'error');
    });
  });

  it('cancels meal delete', async () => {
    mockMeals = [{ id: 'm1', name: 'Chicken', mealCategoryId: 'cat1', price: 15.5, description: '', imageUrl: '', isActive: 1 }];
    render(<MenuPanel campIds={['c1']} camps={camps} />);
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
    render(<MenuPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Categories'));
    await waitFor(() => { expect(screen.getByText('Main Course')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Del'));
    await waitFor(() => { expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Confirm'));
    await waitFor(() => {
      expect(mockDeleteMealCategory).toHaveBeenCalledWith('cat1');
      expect(mockShowToast).toHaveBeenCalledWith('Category deleted.', 'success');
      expect(mockRefreshCats).toHaveBeenCalled();
    });
  });

  it('opens edit category form pre-filled and saves', async () => {
    mockSaveMealCategory.mockResolvedValueOnce({});
    render(<MenuPanel campIds={['c1']} camps={camps} />);
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
    render(<MenuPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Categories'));
    await waitFor(() => { expect(screen.getByText('No categories yet')).toBeInTheDocument(); });
    fireEvent.click(screen.getAllByText('Add Category')[1]);
    await waitFor(() => { expect(screen.getByText('Add New Category')).toBeInTheDocument(); });
  });

  it('switches back to meals section', async () => {
    render(<MenuPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Categories'));
    await waitFor(() => { expect(screen.getByText('Main Course')).toBeInTheDocument(); });
    fireEvent.click(screen.getByRole('button', { name: 'Meals' }));
    await waitFor(() => { expect(screen.getByText('Filter by category:')).toBeInTheDocument(); });
  });

  it('shows meal count per category', async () => {
    mockMeals = [{ id: 'm1', name: 'Chicken', mealCategoryId: 'cat1', price: 15.5, description: '', imageUrl: '', isActive: 1 }];
    render(<MenuPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Categories'));
    await waitFor(() => { expect(screen.getByText('Main Course')).toBeInTheDocument(); });
    expect(screen.getAllByText('1')).toHaveLength(2);
  });

  it('closes meal form on close', async () => {
    render(<MenuPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getAllByText('Add Meal')[0]);
    await waitFor(() => { expect(screen.getByText('Add New Meal')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Close'));
    await waitFor(() => {
      expect(screen.queryByText('Add New Meal')).not.toBeInTheDocument();
    });
  });

  it('closes category form on close', async () => {
    render(<MenuPanel campIds={['c1']} camps={camps} />);
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
