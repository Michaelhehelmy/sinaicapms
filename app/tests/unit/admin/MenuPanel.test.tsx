import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MenuPanel from '@/components/admin/MenuPanel';

const mockShowToast = vi.fn();

let invalidateSpy: ReturnType<typeof vi.fn>;
function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  invalidateSpy = vi.spyOn(client, 'invalidateQueries');
  return render(
    <QueryClientProvider client={client}>
      <MenuPanel campIds={['c1']} camps={mockCamps} />
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
  bulkCreateMeals: vi.fn(),
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
      {data.map((row: any, i: number) => (
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

vi.mock('@/components/ui/Badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span data-testid="badge">{children}</span>,
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
    ...rest
  }: {
    label?: string;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    type?: string;
    [key: string]: unknown;
  }) => (
    <div>
      {label && <label>{label}</label>}
      <input
        type={type || 'text'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        data-testid={(rest['data-testid'] as string | undefined) || (label ? `input-${label}` : 'input')}
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
    ...rest
  }: {
    label?: string;
    options: { value: string; label: string }[];
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    placeholder?: string;
    [key: string]: unknown;
  }) => (
    <div>
      {label && <label>{label}</label>}
      <select
        value={value}
        onChange={onChange}
        data-testid={(rest['data-testid'] as string | undefined) || (label ? `select-${label}` : 'select')}
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
const mockBulkCreateMeals = vi.mocked(api.bulkCreateMeals);
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

const hooks = vi.mocked(await import('@/hooks/useQueryHooks'));

function setData(meals: unknown[], cats: unknown[]) {
  (hooks as Record<string, any>).__setMealsData(meals);
  (hooks as Record<string, any>).__setCatsData(cats);
}

describe('MenuPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setData([], []);
    (hooks as Record<string, any>).__setMealsLoading(false);
    (hooks as Record<string, any>).__setCatsLoading(false);
    mockBulkCreateMeals.mockResolvedValue({ count: 0, ids: [], success: true } as never);
  });

  it('renders with the bulk add button in the meals tab (default)', () => {
    setData(mockMeals, mockMealCategories);
    renderPanel();
    expect(screen.getByTestId('menu-panel')).toBeInTheDocument();
    expect(screen.getByText('Menu Management')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-add-meals-btn')).toBeInTheDocument();
    expect(screen.getByText('Add Meal')).toBeInTheDocument();
  });

  it('hides the bulk add button in the categories tab', async () => {
    setData(mockMeals, mockMealCategories);
    renderPanel();
    expect(screen.getByTestId('bulk-add-meals-btn')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Categories'));
    expect(screen.queryByTestId('bulk-add-meals-btn')).not.toBeInTheDocument();
    expect(screen.getByText('Add Category')).toBeInTheDocument();
  });

  it('opens the bulk modal with 5 empty rows when Bulk Add is clicked', async () => {
    setData(mockMeals, mockMealCategories);
    renderPanel();
    fireEvent.click(screen.getByTestId('bulk-add-meals-btn'));
    await waitFor(() => expect(screen.getByTestId('bulk-meal-rows')).toBeInTheDocument());
    expect(screen.getByTestId('bulk-meal-name-0')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-meal-name-4')).toBeInTheDocument();
  });

  it('adds a row with Add Row and removes one with the remove button', async () => {
    setData(mockMeals, mockMealCategories);
    renderPanel();
    fireEvent.click(screen.getByTestId('bulk-add-meals-btn'));
    await waitFor(() => expect(screen.getByTestId('bulk-meal-rows')).toBeInTheDocument());
    expect(screen.queryByTestId('bulk-meal-name-5')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('add-bulk-meal-row-btn'));
    expect(screen.getByTestId('bulk-meal-name-5')).toBeInTheDocument();

    // Tag row 0 so we can prove the right row is removed.
    fireEvent.change(screen.getByTestId('bulk-meal-name-0'), { target: { value: 'RowZero' } });
    // Rows are index-keyed: removal shifts testids, so assert count + value.
    const rm = screen.getAllByRole('button', { name: /Remove meal/ });
    fireEvent.click(rm[0]);
    await waitFor(() => {
      expect(screen.queryAllByTestId(/bulk-meal-name-/)).toHaveLength(5);
      expect(screen.queryByDisplayValue('RowZero')).not.toBeInTheDocument();
    });
  });

  it('bulk creates only filled rows and maps types/values correctly', async () => {
    mockBulkCreateMeals.mockResolvedValue({ count: 2, ids: ['meal_b1', 'meal_b2'], success: true } as never);
    setData(mockMeals, mockMealCategories);
    renderPanel();
    fireEvent.click(screen.getByTestId('bulk-add-meals-btn'));
    await waitFor(() => expect(screen.getByTestId('bulk-meal-rows')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('bulk-meal-name-0'), { target: { value: 'Falafel Wrap' } });
    fireEvent.change(screen.getByTestId('bulk-meal-price-0'), { target: { value: '12' } });
    fireEvent.change(screen.getByTestId('bulk-meal-name-1'), { target: { value: 'Bedouin Tea' } });
    fireEvent.change(screen.getByTestId('bulk-meal-price-1'), { target: { value: '4' } });

    fireEvent.click(screen.getByTestId('modal-submit'));

    await waitFor(() => {
      expect(mockBulkCreateMeals).toHaveBeenCalledWith([
        { name: 'Falafel Wrap', mealCategoryId: undefined, price: 12, description: undefined },
        { name: 'Bedouin Tea', mealCategoryId: undefined, price: 4, description: undefined },
      ]);
      expect(mockShowToast).toHaveBeenCalledWith('2 meals created.', 'success');
    });
    expect(screen.queryByTestId('bulk-meal-rows')).not.toBeInTheDocument();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'meals'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'mealCategories'] });
  });

  it('shows a warning instead of creating when no name is filled', async () => {
    setData(mockMeals, mockMealCategories);
    renderPanel();
    fireEvent.click(screen.getByTestId('bulk-add-meals-btn'));
    await waitFor(() => expect(screen.getByTestId('bulk-meal-rows')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Fill in at least one meal name.', 'warning');
    });
    expect(mockBulkCreateMeals).not.toHaveBeenCalled();
  });

  it('renders a loading spinner while data is loading', () => {
    (hooks as Record<string, any>).__setMealsLoading(true);
    (hooks as Record<string, any>).__setCatsLoading(true);
    renderPanel();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('shows empty state when no meals exist', () => {
    setData([], mockMealCategories);
    renderPanel();
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No meals found')).toBeInTheDocument();
  });
});