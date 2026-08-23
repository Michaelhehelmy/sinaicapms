import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MealsPanel from '@/components/admin/MealsPanel';

const mockShowToast = vi.fn();

// The panel reads useQueryClient() to invalidate concerns — provide a fresh
// client per render and expose an invalidation spy for refresh assertions.
let invalidateSpy: ReturnType<typeof vi.fn>;
function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  invalidateSpy = vi.spyOn(client, 'invalidateQueries');
  return render(
    <QueryClientProvider client={client}>
      <MealsPanel campIds={['c1']} camps={mockCamps} />
    </QueryClientProvider>,
  );
}

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/api', () => ({
  saveMeal: vi.fn(),
  deleteMeal: vi.fn(),
  saveMealCategory: vi.fn(),
  deleteMealCategory: vi.fn(),
}));

vi.mock('@/lib/utils', () => ({
  formatCurrency: (v: number) => `$${v.toFixed(2)}`,
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('@/components/ui/DataTable', () => ({
  DataTable: ({
    data,
    columns,
    emptyMessage,
    actions,
  }: {
    data: unknown[];
    columns: { key: string; header: string; render?: (item: unknown) => React.ReactNode }[];
    emptyMessage?: string;
    actions?: (row: unknown) => React.ReactNode;
  }) => (
    <div data-testid="data-table">
      {data.length === 0 && emptyMessage && <p>{emptyMessage}</p>}
      {data.map((row: Record<string, unknown>, i: number) => (
        <div key={i} data-testid="data-row">
          {columns.map((col) => (
            <span key={col.key}>{col.render ? col.render(row) : String(row[col.key] ?? '')}</span>
          ))}
          {actions && <div>{actions(row)}</div>}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('@/components/ui/FormModal', () => ({
  FormModal: ({
    open,
    title,
    children,
    onClose,
    onSubmit,
    submitLabel,
    submitDisabled,
  }: {
    open: boolean;
    title: string;
    children: React.ReactNode;
    onClose?: () => void;
    onSubmit?: () => void;
    submitLabel?: string;
    submitDisabled?: boolean;
  }) =>
    open ? (
      <div data-testid="form-modal">
        <h2>{title}</h2>
        {children}
        {onClose && <button data-testid="modal-close" onClick={onClose}>Close</button>}
        {onSubmit && (
          <button data-testid="modal-submit" onClick={onSubmit} disabled={submitDisabled}>
            {submitLabel || 'Submit'}
          </button>
        )}
      </div>
    ) : null,
}));

vi.mock('@/components/ui/ConfirmDialog', () => ({
  ConfirmDialog: ({
    open,
    title,
    message,
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    title: string;
    message?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <h2>{title}</h2>
        {message && <p>{message}</p>}
        {onConfirm && <button data-testid="confirm-yes" onClick={onConfirm}>Confirm</button>}
        {onCancel && <button data-testid="confirm-no" onClick={onCancel}>Cancel</button>}
      </div>
    ) : null,
}));

vi.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: ({ text }: { text?: string }) => <div data-testid="loading-spinner">{text}</div>,
}));

vi.mock('@/components/ui/EmptyState', () => ({
  EmptyState: ({ title, description }: { title: string; description?: string }) => (
    <div data-testid="empty-state">
      <h3>{title}</h3>
      {description && <p>{description}</p>}
    </div>
  ),
}));

vi.mock('@/components/ui/StatusTag', () => ({
  StatusTag: ({ status }: { status: string }) => <span data-testid="status-tag">{status}</span>,
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...rest
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    [key: string]: unknown;
  }) => (
    <button onClick={onClick} disabled={disabled} data-testid={rest['data-testid'] as string | undefined} {...rest}>{children}</button>
  ),
}));

vi.mock('@/components/ui/Input', () => ({
  Input: ({
    label,
    value,
    onChange,
    placeholder,
    type,
  }: {
    label?: string;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    type?: string;
  }) => (
    <div>
      {label && <label>{label}</label>}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        data-testid={label ? `input-${label}` : 'input'}
      />
    </div>
  ),
}));

vi.mock('@/components/ui/Select', () => ({
  Select: ({
    label,
    options,
    value,
    onChange,
    placeholder,
  }: {
    label?: string;
    options: { value: string; label: string }[];
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    placeholder?: string;
  }) => (
    <div>
      {label && <label>{label}</label>}
      <select
        value={value}
        onChange={onChange}
        data-testid={label ? `select-${label}` : 'select'}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt: { value: string; label: string }) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  ),
}));

vi.mock('@/components/ui/Card', () => ({
  Card: ({
    children,
    ...rest
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => <div {...rest}>{children}</div>,
}));

import * as api from '@/lib/api';
const mockSaveMeal = vi.mocked(api.saveMeal);
const mockDeleteMeal = vi.mocked(api.deleteMeal);
const mockSaveMealCategory = vi.mocked(api.saveMealCategory);
const mockDeleteMealCategory = vi.mocked(api.deleteMealCategory);

const mockMealCategories = [
  { id: 'mcat_001', name: 'Appetizers', position: 1 },
  { id: 'mcat_002', name: 'Main Course', position: 2 },
  { id: 'mcat_003', name: 'Desserts', position: 3 },
];

const mockMeals = [
  { id: 'meal_001', name: 'Spring Rolls', mealCategoryId: 'mcat_001', price: 5.5, description: 'Crispy rolls', imageUrl: null, isActive: 1 },
  { id: 'meal_002', name: 'Grilled Chicken', mealCategoryId: 'mcat_002', price: 15, description: 'Herb chicken', imageUrl: 'https://img.com/chicken.jpg', isActive: 1 },
  { id: 'meal_003', name: 'Chocolate Cake', mealCategoryId: 'mcat_003', price: 8, description: '', imageUrl: null, isActive: 0 },
];

const mockCamps = [
  { id: 'c1', name: 'Camp A', location: 'Cairo', startDate: '2025-06-01', endDate: '2025-08-01', capacity: 50, status: 'active', notes: '' },
];

// Phase 6: MealsPanel consumes TanStack Query data hooks + invalidates
// ['admin', ...] concerns on change instead of legacy useAdminData.refresh().
vi.mock('@/hooks/useQueryHooks', () => {
  let mealsData: unknown[] = [];
  let catsData: unknown[] = [];
  let mealsLoading = false;
  let catsLoading = false;

  return {
    queryKeys: {
      meals: ['admin', 'meals'],
      mealCategories: ['admin', 'mealCategories'],
    },
    useMealsQuery: () => ({ data: mealsData as never, isLoading: mealsLoading }),
    useMealCategoriesQuery: () => ({ data: catsData as never, isLoading: catsLoading }),
    __setMealsData: (d: unknown[]) => { mealsData = d; },
    __setCatsData: (d: unknown[]) => { catsData = d; },
    __setMealsLoading: (v: boolean) => { mealsLoading = v; },
    __setCatsLoading: (v: boolean) => { catsLoading = v; },
  };
});

// Access the setters
const hooks = vi.mocked(await import('@/hooks/useQueryHooks'));

function setData(meals: unknown[], cats: unknown[]) {
  (hooks as Record<string, unknown>).__setMealsData(meals);
  (hooks as Record<string, unknown>).__setCatsData(cats);
}

describe('MealsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setData([], []);
    (hooks as Record<string, unknown>).__setMealsLoading(false);
    (hooks as Record<string, unknown>).__setCatsLoading(false);
  });

  it('renders with meal categories in data table', () => {
    setData(mockMeals, mockMealCategories);
    renderPanel();
    expect(screen.getByTestId('meals-panel')).toBeInTheDocument();
    expect(screen.getByText('Menu Meals')).toBeInTheDocument();
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
  });

  it('switches between meals and categories sections', () => {
    setData(mockMeals, mockMealCategories);
    renderPanel();
    // Default is meals
    expect(screen.getByTestId('add-meal-btn')).toBeInTheDocument();

    // Switch to categories
    fireEvent.click(screen.getByText('Categories'));
    expect(screen.getByText('Add Category')).toBeInTheDocument();
    expect(screen.queryByTestId('add-meal-btn')).not.toBeInTheDocument();
  });

  it('shows empty state when no meals exist', () => {
    setData([], mockMealCategories);
    renderPanel();
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No meals yet')).toBeInTheDocument();
  });

  it('shows empty state when no categories exist', () => {
    setData(mockMeals, []);
    renderPanel();
    fireEvent.click(screen.getByText('Categories'));
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No categories yet')).toBeInTheDocument();
  });

  it('shows loading spinner while data is loading', () => {
    (hooks as Record<string, unknown>).__setMealsLoading(true);
    (hooks as Record<string, unknown>).__setCatsLoading(true);
    renderPanel();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('add new category opens form and saves successfully', async () => {
    mockSaveMealCategory.mockResolvedValue({ id: 'mcat_new', success: true } as never);
    setData([], []);

    renderPanel();
    fireEvent.click(screen.getByText('Categories'));
    fireEvent.click(screen.getByText('Add Category'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add New Category' })));

    fireEvent.change(screen.getByTestId('input-Category Name *'), { target: { value: 'Beverages' } });
    fireEvent.click(screen.getByTestId('modal-submit'));

    await waitFor(() => {
      expect(mockSaveMealCategory).toHaveBeenCalledWith({ name: 'Beverages' }, undefined);
      expect(mockShowToast).toHaveBeenCalledWith('Category created.', 'success');
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'mealCategories'] });
  });

  it('category validation rejects empty name', async () => {
    setData([], []);
    renderPanel();
    fireEvent.click(screen.getByText('Categories'));
    fireEvent.click(screen.getByText('Add Category'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add New Category' })));

    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Category name is required.', 'warning');
    });
    expect(mockSaveMealCategory).not.toHaveBeenCalled();
  });

  it('edit category pre-fills the name', async () => {
    setData([], mockMealCategories);
    renderPanel();
    fireEvent.click(screen.getByText('Categories'));

    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Edit Category' })));
    expect(screen.getByTestId('input-Category Name *')).toHaveValue('Appetizers');
  });

  it('edit category saves with updated name', async () => {
    mockSaveMealCategory.mockResolvedValue({ success: true } as never);
    setData([], mockMealCategories);
    renderPanel();
    fireEvent.click(screen.getByText('Categories'));

    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Edit Category' })));

    fireEvent.change(screen.getByTestId('input-Category Name *'), { target: { value: 'Starters' } });
    fireEvent.click(screen.getByTestId('modal-submit'));

    await waitFor(() => {
      expect(mockSaveMealCategory).toHaveBeenCalledWith({ name: 'Starters' }, 'mcat_001');
      expect(mockShowToast).toHaveBeenCalledWith('Category updated.', 'success');
    });
  });

  it('delete category shows confirmation dialog', () => {
    setData([], mockMealCategories);
    renderPanel();
    fireEvent.click(screen.getByText('Categories'));

    fireEvent.click(screen.getAllByText('Delete')[0]);
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete this category/)).toBeInTheDocument();
  });

  it('confirm delete category calls API and refreshes', async () => {
    mockDeleteMealCategory.mockResolvedValue({ success: true } as never);
    setData([], mockMealCategories);

    renderPanel();
    fireEvent.click(screen.getByText('Categories'));

    fireEvent.click(screen.getAllByText('Delete')[0]);
    fireEvent.click(screen.getByTestId('confirm-yes'));

    await waitFor(() => {
      expect(mockDeleteMealCategory).toHaveBeenCalledWith('mcat_001');
      expect(mockShowToast).toHaveBeenCalledWith('Category deleted.', 'success');
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'mealCategories'] });
  });

  it('add new meal opens form and saves successfully', async () => {
    mockSaveMeal.mockResolvedValue({ id: 'meal_new', success: true } as never);
    setData([], mockMealCategories);

    renderPanel();
    fireEvent.click(screen.getByTestId('add-meal-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add New Meal' })));

    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Caesar Salad' } });
    fireEvent.change(screen.getByTestId('select-Category *'), { target: { value: 'mcat_001' } });
    fireEvent.change(screen.getByTestId('input-Price'), { target: { value: '7.5' } });
    fireEvent.click(screen.getByTestId('modal-submit'));

    await waitFor(() => {
      expect(mockSaveMeal).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Caesar Salad',
          mealCategoryId: 'mcat_001',
          price: 7.5,
        }),
        undefined,
      );
      expect(mockShowToast).toHaveBeenCalledWith('Meal created.', 'success');
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'meals'] });
  });

  it('meal validation rejects empty name', async () => {
    setData([], mockMealCategories);
    renderPanel();
    fireEvent.click(screen.getByTestId('add-meal-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add New Meal' })));

    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Meal name is required.', 'warning');
    });
    expect(mockSaveMeal).not.toHaveBeenCalled();
  });

  it('meal validation rejects missing category', async () => {
    setData([], mockMealCategories);
    renderPanel();
    fireEvent.click(screen.getByTestId('add-meal-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add New Meal' })));

    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Pasta' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Category is required.', 'warning');
    });
    expect(mockSaveMeal).not.toHaveBeenCalled();
  });

  it('edit meal pre-fills all fields', () => {
    setData(mockMeals, mockMealCategories);
    renderPanel();

    fireEvent.click(screen.getAllByText('Edit')[0]);
    expect(screen.getByRole('heading', { name: 'Edit Meal' })).toBeInTheDocument();
    expect(screen.getByTestId('input-Name *')).toHaveValue('Spring Rolls');
    expect(screen.getByTestId('select-Category *')).toHaveValue('mcat_001');
    expect(screen.getByTestId('input-Price')).toHaveValue(5.5);
  });

  it('edit meal saves with updated data', async () => {
    mockSaveMeal.mockResolvedValue({ success: true } as never);
    setData(mockMeals, mockMealCategories);
    renderPanel();

    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Edit Meal' })));

    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Fresh Spring Rolls' } });
    fireEvent.click(screen.getByTestId('modal-submit'));

    await waitFor(() => {
      expect(mockSaveMeal).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Fresh Spring Rolls' }),
        'meal_001',
      );
      expect(mockShowToast).toHaveBeenCalledWith('Meal updated.', 'success');
    });
  });

  it('delete meal shows confirmation dialog', () => {
    setData(mockMeals, mockMealCategories);
    renderPanel();

    fireEvent.click(screen.getAllByText('Delete')[0]);
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete this meal/)).toBeInTheDocument();
  });

  it('confirm delete meal calls API and refreshes', async () => {
    mockDeleteMeal.mockResolvedValue({ success: true } as never);
    setData(mockMeals, mockMealCategories);

    renderPanel();
    fireEvent.click(screen.getAllByText('Delete')[0]);
    fireEvent.click(screen.getByTestId('confirm-yes'));

    await waitFor(() => {
      expect(mockDeleteMeal).toHaveBeenCalledWith('meal_001');
      expect(mockShowToast).toHaveBeenCalledWith('Meal deleted.', 'success');
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'meals'] });
  });

  it('cancel delete does not call API', () => {
    setData(mockMeals, mockMealCategories);
    renderPanel();

    fireEvent.click(screen.getAllByText('Delete')[0]);
    fireEvent.click(screen.getByTestId('confirm-no'));
    expect(mockDeleteMeal).not.toHaveBeenCalled();
  });

  it('save category API error shows error toast', async () => {
    mockSaveMealCategory.mockRejectedValue(new Error('server error'));
    setData([], []);
    renderPanel();
    fireEvent.click(screen.getByText('Categories'));
    fireEvent.click(screen.getByText('Add Category'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add New Category' })));

    fireEvent.change(screen.getByTestId('input-Category Name *'), { target: { value: 'New Cat' } });
    fireEvent.click(screen.getByTestId('modal-submit'));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Error saving category'),
        'error',
      );
    });
  });

  it('save meal API error shows error toast', async () => {
    mockSaveMeal.mockRejectedValue(new Error('db failure'));
    setData([], mockMealCategories);
    renderPanel();
    fireEvent.click(screen.getByTestId('add-meal-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add New Meal' })));

    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Burger' } });
    fireEvent.change(screen.getByTestId('select-Category *'), { target: { value: 'mcat_002' } });
    fireEvent.click(screen.getByTestId('modal-submit'));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Error saving meal'),
        'error',
      );
    });
  });

  it('delete category API error shows error toast', async () => {
    mockDeleteMealCategory.mockRejectedValue(new Error('cannot delete'));
    setData([], mockMealCategories);
    renderPanel();
    fireEvent.click(screen.getByText('Categories'));
    fireEvent.click(screen.getAllByText('Delete')[0]);
    fireEvent.click(screen.getByTestId('confirm-yes'));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Error deleting'),
        'error',
      );
    });
  });

  it('renders meal data correctly in rows', () => {
    setData(mockMeals, mockMealCategories);
    renderPanel();
    expect(screen.getByText('Spring Rolls')).toBeInTheDocument();
    expect(screen.getByText('Grilled Chicken')).toBeInTheDocument();
    expect(screen.getByText('Chocolate Cake')).toBeInTheDocument();
  });

  it('displays category names for meals', () => {
    setData(mockMeals, mockMealCategories);
    renderPanel();
    expect(screen.getByText('Appetizers')).toBeInTheDocument();
    expect(screen.getByText('Main Course')).toBeInTheDocument();
    expect(screen.getByText('Desserts')).toBeInTheDocument();
  });

  it('displays formatted prices', () => {
    setData(mockMeals, mockMealCategories);
    renderPanel();
    expect(screen.getByText('$5.50')).toBeInTheDocument();
    expect(screen.getByText('$15.00')).toBeInTheDocument();
    expect(screen.getByText('$8.00')).toBeInTheDocument();
  });

  it('displays status tags for active/inactive meals', () => {
    setData(mockMeals, mockMealCategories);
    renderPanel();
    const statusTags = screen.getAllByTestId('status-tag');
    expect(statusTags.length).toBe(3);
  });
});
