import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MealsPanel from '@/components/admin/MealsPanel';

const mockShowToast = vi.fn();
const mockRefreshMeals = vi.fn();
const mockRefreshCats = vi.fn();
let mockMeals: unknown[] = [];
let mockMealCategories: unknown[] = [];

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/hooks/useAdminData', () => ({
  useMeals: () => ({ data: mockMeals, loading: false, refresh: mockRefreshMeals }),
  useMealCategories: () => ({ data: mockMealCategories, loading: false, refresh: mockRefreshCats }),
  useCamps: () => ({ data: [] }),
}));

vi.mock('@/lib/api', () => ({
  saveMeal: vi.fn(),
  deleteMeal: vi.fn(),
  saveMealCategory: vi.fn(),
  deleteMealCategory: vi.fn(),
}));

vi.mock('@/lib/utils', () => ({
  formatCurrency: (n: number) => `$${Number(n).toFixed(2)}`,
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('@/components/ui/Select', () => ({
  Select: ({ options, value, onChange, label, placeholder }: { options: { value: string; label: string }[]; value?: string; onChange: (e: { target: { value: string } }) => void; label?: string; placeholder?: string }) => (
    <div>
      {label && <label>{label}</label>}
      <select
        data-testid={label ? `select-${label}` : 'select'}
        value={value || ''}
        onChange={onChange}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt: { value: string; label: string }) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  ),
}));

import * as api from '@/lib/api';
const mockSaveMeal = vi.mocked(api.saveMeal);
const mockDeleteMeal = vi.mocked(api.deleteMeal);
const mockSaveMealCategory = vi.mocked(api.saveMealCategory);
const mockDeleteMealCategory = vi.mocked(api.deleteMealCategory);

const camps = [{ id: 'c1', name: 'Camp 1', location: 'Sinai', startDate: '2025-01-01', endDate: '2025-12-31', capacity: 50, status: 'active', notes: '' }];

describe('MealsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMeals = [];
    mockMealCategories = [{ id: 'cat1', name: 'Main Course', position: 1 }];
  });

  it('renders with meals section by default', () => {
    render(<MealsPanel campIds={['c1']} camps={camps} />);
    expect(screen.getByText('Menu Meals')).toBeInTheDocument();
    expect(screen.getAllByText('Add Meal').length).toBeGreaterThanOrEqual(1);
  });

  it('shows empty state when no meals', () => {
    render(<MealsPanel campIds={['c1']} camps={camps} />);
    expect(screen.getByText('No meals yet')).toBeInTheDocument();
  });

  it('switches to categories section', async () => {
    render(<MealsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Categories'));
    await waitFor(() => {
      expect(screen.getAllByText('Add Category').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows empty state for categories', async () => {
    mockMealCategories = [];
    render(<MealsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Categories'));
    await waitFor(() => {
      expect(screen.getByText('No categories yet')).toBeInTheDocument();
    });
  });

  it('opens add meal form', async () => {
    render(<MealsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getAllByText('Add Meal')[0]);
    await waitFor(() => {
      expect(screen.getByText('Add New Meal')).toBeInTheDocument();
    });
  });

  it('validates meal name required', async () => {
    render(<MealsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getAllByText('Add Meal')[0]);
    await waitFor(() => { expect(screen.getByText('Add New Meal')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Save Meal'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Meal name is required.', 'warning');
    });
  });

  it('validates category required for meal', async () => {
    render(<MealsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getAllByText('Add Meal')[0]);
    await waitFor(() => { expect(screen.getByText('Add New Meal')).toBeInTheDocument(); });
    fireEvent.change(screen.getByPlaceholderText('Meal name'), { target: { value: 'Burger' } });
    fireEvent.click(screen.getByText('Save Meal'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Category is required.', 'warning');
    });
  });

  it('saves meal with valid data', async () => {
    mockSaveMeal.mockResolvedValue({} as any);
    render(<MealsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getAllByText('Add Meal')[0]);
    await waitFor(() => { expect(screen.getByText('Add New Meal')).toBeInTheDocument(); });
    fireEvent.change(screen.getByPlaceholderText('Meal name'), { target: { value: 'Burger' } });
    fireEvent.change(screen.getByTestId('select-Category *'), { target: { value: 'cat1' } });
    fireEvent.click(screen.getByText('Save Meal'));
    await waitFor(() => {
      expect(mockSaveMeal).toHaveBeenCalled();
    });
  });

  it('opens add category form', async () => {
    render(<MealsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Categories'));
    await waitFor(() => { expect(screen.getAllByText('Add Category').length).toBeGreaterThanOrEqual(1); });
    fireEvent.click(screen.getAllByText('Add Category')[0]);
    await waitFor(() => {
      expect(screen.getByText('Add New Category')).toBeInTheDocument();
    });
  });

  it('validates category name required', async () => {
    render(<MealsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Categories'));
    await waitFor(() => { expect(screen.getAllByText('Add Category').length).toBeGreaterThanOrEqual(1); });
    fireEvent.click(screen.getAllByText('Add Category')[0]);
    await waitFor(() => { expect(screen.getByText('Add New Category')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Save Category'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Category name is required.', 'warning');
    });
  });

  it('saves category with valid name', async () => {
    mockSaveMealCategory.mockResolvedValue({} as any);
    render(<MealsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Categories'));
    await waitFor(() => { expect(screen.getAllByText('Add Category').length).toBeGreaterThanOrEqual(1); });
    fireEvent.click(screen.getAllByText('Add Category')[0]);
    await waitFor(() => { expect(screen.getByText('Add New Category')).toBeInTheDocument(); });
    fireEvent.change(screen.getByPlaceholderText(/Appetizers/), { target: { value: 'Desserts' } });
    fireEvent.click(screen.getByText('Save Category'));
    await waitFor(() => {
      expect(mockSaveMealCategory).toHaveBeenCalled();
    });
  });

  it('closes meal form on cancel', async () => {
    render(<MealsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getAllByText('Add Meal')[0]);
    await waitFor(() => { expect(screen.getByText('Add New Meal')).toBeInTheDocument(); });
    fireEvent.click(screen.getByLabelText('Close dialog'));
    await waitFor(() => {
      expect(screen.queryByText('Add New Meal')).not.toBeInTheDocument();
    });
  });

  it('closes category form on cancel', async () => {
    render(<MealsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Categories'));
    await waitFor(() => { expect(screen.getAllByText('Add Category').length).toBeGreaterThanOrEqual(1); });
    fireEvent.click(screen.getAllByText('Add Category')[0]);
    await waitFor(() => { expect(screen.getByText('Add New Category')).toBeInTheDocument(); });
    fireEvent.click(screen.getByLabelText('Close dialog'));
    await waitFor(() => {
      expect(screen.queryByText('Add New Category')).not.toBeInTheDocument();
    });
  });

  it('renders meal rows with categories, prices, descriptions and statuses', () => {
    mockMeals = [
      { id: 'm1', name: 'Burger', mealCategoryId: 'cat1', price: 50, description: 'Juicy', imageUrl: '', isActive: 1 },
      { id: 'm2', name: 'Salad', mealCategoryId: 'missing', price: 0, description: '', imageUrl: '', isActive: 0 },
    ];
    render(<MealsPanel campIds={['c1']} camps={camps} />);
    expect(screen.getByText('Burger')).toBeInTheDocument();
    expect(screen.getByText('Salad')).toBeInTheDocument();
    expect(screen.getByText('Main Course')).toBeInTheDocument();
    expect(screen.getByText('Uncategorized')).toBeInTheDocument();
    expect(screen.getByText('$50.00')).toBeInTheDocument();
    expect(screen.getByText('$0.00')).toBeInTheDocument();
    expect(screen.getByText('Juicy')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText(/inactive/i)).toBeInTheDocument();
  });

  it('switches back to the meals section', () => {
    render(<MealsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Categories'));
    fireEvent.click(screen.getByText('Meals'));
    expect(screen.getAllByText('Add Meal').length).toBeGreaterThanOrEqual(1);
  });

  it('edits a meal with all fields updated', async () => {
    mockMeals = [
      { id: 'm1', name: 'Burger', mealCategoryId: 'cat1', price: 50, description: 'Juicy', imageUrl: '', isActive: 1 },
    ];
    mockSaveMeal.mockResolvedValue({} as any);
    const { container } = render(<MealsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => { expect(screen.getByText('Edit Meal')).toBeInTheDocument(); });
    expect(screen.getByPlaceholderText('Meal name')).toHaveValue('Burger');

    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText('Image URL'), { target: { value: 'https://x.png' } });
    fireEvent.change(container.querySelector('textarea') as HTMLTextAreaElement, { target: { value: 'New desc' } });
    fireEvent.change(screen.getByTestId('select-Status'), { target: { value: '0' } });
    fireEvent.click(screen.getByText('Update Meal'));

    await waitFor(() => {
      expect(mockSaveMeal).toHaveBeenCalledWith(expect.objectContaining({
        id: 'm1',
        name: 'Burger',
        mealCategoryId: 'cat1',
        price: 60,
        imageUrl: 'https://x.png',
        description: 'New desc',
        isActive: 0,
      }));
      expect(mockShowToast).toHaveBeenCalledWith('Meal updated.', 'success');
      expect(mockRefreshMeals).toHaveBeenCalled();
    });
  });

  it('handles meal save error', async () => {
    mockSaveMeal.mockRejectedValue(new Error('boom'));
    render(<MealsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getAllByText('Add Meal')[0]);
    await waitFor(() => { expect(screen.getByText('Add New Meal')).toBeInTheDocument(); });
    fireEvent.change(screen.getByPlaceholderText('Meal name'), { target: { value: 'Burger' } });
    fireEvent.change(screen.getByTestId('select-Category *'), { target: { value: 'cat1' } });
    fireEvent.click(screen.getByText('Save Meal'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error saving meal: boom', 'error');
    });
  });

  it('handles category save error', async () => {
    mockSaveMealCategory.mockRejectedValue(new Error('cat boom'));
    render(<MealsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Categories'));
    await waitFor(() => { expect(screen.getAllByText('Add Category').length).toBeGreaterThanOrEqual(1); });
    fireEvent.click(screen.getAllByText('Add Category')[0]);
    await waitFor(() => { expect(screen.getByText('Add New Category')).toBeInTheDocument(); });
    fireEvent.change(screen.getByPlaceholderText(/Appetizers/), { target: { value: 'Desserts' } });
    fireEvent.click(screen.getByText('Save Category'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error saving category: cat boom', 'error');
    });
  });

  it('deletes a meal after confirmation', async () => {
    mockMeals = [
      { id: 'm1', name: 'Burger', mealCategoryId: 'cat1', price: 50, description: '', imageUrl: '', isActive: 1 },
    ];
    mockDeleteMeal.mockResolvedValue({} as any);
    render(<MealsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getAllByText('Delete')[0]);
    await waitFor(() => {
      expect(screen.getByText(/Are you sure you want to delete this meal/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByText('Delete')[1]);
    await waitFor(() => {
      expect(mockDeleteMeal).toHaveBeenCalledWith('m1');
      expect(mockShowToast).toHaveBeenCalledWith('Meal deleted.', 'success');
      expect(mockRefreshMeals).toHaveBeenCalled();
    });
  });

  it('cancels a meal delete dialog', async () => {
    mockMeals = [
      { id: 'm1', name: 'Burger', mealCategoryId: 'cat1', price: 50, description: '', imageUrl: '', isActive: 1 },
    ];
    render(<MealsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getAllByText('Delete')[0]);
    await waitFor(() => {
      expect(screen.getByText(/Are you sure you want to delete this meal/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => {
      expect(screen.queryByText(/Are you sure you want to delete this meal/)).not.toBeInTheDocument();
    });
    expect(mockDeleteMeal).not.toHaveBeenCalled();
  });

  it('handles meal delete error', async () => {
    mockMeals = [
      { id: 'm1', name: 'Burger', mealCategoryId: 'cat1', price: 50, description: '', imageUrl: '', isActive: 1 },
    ];
    mockDeleteMeal.mockRejectedValue(new Error('nope'));
    render(<MealsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getAllByText('Delete')[0]);
    await waitFor(() => { expect(screen.getByText(/Are you sure you want to delete this meal/)).toBeInTheDocument(); });
    fireEvent.click(screen.getAllByText('Delete')[1]);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error deleting: nope', 'error');
    });
  });

  it('edits a category', async () => {
    mockMealCategories = [{ id: 'cat1', name: 'Main Course', position: 1 }];
    mockSaveMealCategory.mockResolvedValue({} as any);
    render(<MealsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Categories'));
    await waitFor(() => { expect(screen.getAllByText('Add Category').length).toBeGreaterThanOrEqual(1); });
    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => { expect(screen.getByText('Edit Category')).toBeInTheDocument(); });
    fireEvent.change(screen.getByPlaceholderText(/Appetizers/), { target: { value: 'Starters' } });
    fireEvent.click(screen.getByText('Update Category'));
    await waitFor(() => {
      expect(mockSaveMealCategory).toHaveBeenCalledWith({ name: 'Starters' }, 'cat1');
      expect(mockShowToast).toHaveBeenCalledWith('Category updated.', 'success');
      expect(mockRefreshCats).toHaveBeenCalled();
    });
  });

  it('deletes a category after confirmation', async () => {
    mockMealCategories = [{ id: 'cat1', name: 'Main Course', position: 1 }];
    mockDeleteMealCategory.mockResolvedValue({} as any);
    render(<MealsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Categories'));
    await waitFor(() => { expect(screen.getAllByText('Add Category').length).toBeGreaterThanOrEqual(1); });
    fireEvent.click(screen.getAllByText('Delete')[0]);
    await waitFor(() => {
      expect(screen.getByText(/Are you sure you want to delete this category/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByText('Delete')[1]);
    await waitFor(() => {
      expect(mockDeleteMealCategory).toHaveBeenCalledWith('cat1');
      expect(mockShowToast).toHaveBeenCalledWith('Category deleted.', 'success');
      expect(mockRefreshCats).toHaveBeenCalled();
    });
  });

  it('opens the add category form from the empty state action', async () => {
    mockMealCategories = [];
    render(<MealsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Categories'));
    await waitFor(() => { expect(screen.getByText('No categories yet')).toBeInTheDocument(); });
    fireEvent.click(screen.getAllByText('Add Category')[1]);
    await waitFor(() => { expect(screen.getByText('Add New Category')).toBeInTheDocument(); });
  });
});
