import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PromotionsPanel from '@/components/admin/PromotionsPanel';

const { mockShowToast, mockTrackEvent } = vi.hoisted(() => ({
  mockShowToast: vi.fn(),
  mockTrackEvent: vi.fn(),
}));

// ── Mutable hook data (re-assigned in beforeEach / per test) ──────────
let promosData: unknown[] = [];
let promosLoading = false;

// ── Mock module factories ─────────────────────────────────────────────
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/plausible', () => ({
  trackEvent: mockTrackEvent,
}));

vi.mock('@/lib/utils', () => ({
  formatCurrency: (v: number) => `$${v.toFixed(2)}`,
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('@/hooks/useQueryHooks', () => {
  const React = require('react');
  const useControlled = (value: unknown, loading: boolean) => {
    const [data, setData] = React.useState(value);
    const [isLoading, setIsLoading] = React.useState(loading);
    React.useEffect(() => {
      setData(value);
      setIsLoading(loading);
    });
    return { data, isLoading: isLoading };
  };
  return {
    queryKeys: { promotions: ['admin', 'promotions'] },
    usePromotionsQuery: () => useControlled(promosData, promosLoading),
  };
});

vi.mock('@/lib/api', () => ({
  savePromotion: vi.fn(),
  deletePromotion: vi.fn(),
  getPromotions: vi.fn(),
}));

import * as api from '@/lib/api';
const mockSavePromotion = vi.mocked(api.savePromotion);
const mockDeletePromotion = vi.mocked(api.deletePromotion);

// ── Shared UI mocks ───────────────────────────────────────────────────
vi.mock('@/components/ui/Card', () => ({
  Card: ({ children, ...rest }: { children: React.ReactNode; [key: string]: unknown }) => (
    <div {...rest}>{children}</div>
  ),
}));

vi.mock('@/components/ui/Badge', () => ({
  Badge: ({ children, ...rest }: { children: React.ReactNode; [key: string]: unknown }) => (
    <span data-testid="badge" {...rest}>{children}</span>
  ),
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
    <button onClick={onClick} disabled={disabled} {...rest}>{children}</button>
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
        value={value ?? ''}
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

// ── Representative mock data ──────────────────────────────────────────
const mockPromos = [
  { id: 'pr1', name: 'Summer Sale', type: 'percentage', value: 20, applies_to: 'all', applies_to_id: null, min_purchase: 50, day_of_week: null, start_date: '2025-06-01', end_date: '2025-08-01', is_active: 1 },
  { id: 'pr2', name: 'BOGO Dessert', type: 'bogo', value: 0, applies_to: 'category', applies_to_id: 'cat_desserts', min_purchase: 0, day_of_week: 5, start_date: '', end_date: '', is_active: 0 },
  { id: 'pr3', name: 'Coke Discount', type: 'fixed', value: 5, applies_to: 'product', applies_to_id: 'prod_coke', min_purchase: 0, day_of_week: 0, start_date: '', end_date: '', is_active: 1 },
];

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

async function openAddForm() {
  renderWithQuery(<PromotionsPanel />);
  fireEvent.click(screen.getByTestId('add-promotion-btn'));
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Promotion' })));
}

beforeEach(() => {
  vi.clearAllMocks();
  promosData = [];
  promosLoading = false;
  mockSavePromotion.mockResolvedValue({ id: 'pr_new', success: true } as never);
});

// ══════════════════════════════════════════════════════════════════════
// PromotionsPanel — additional coverage for the promotion form fields
// ══════════════════════════════════════════════════════════════════════
describe('PromotionsPanel form fields', () => {
  it('closes the form modal without saving', async () => {
    await openAddForm();
    expect(screen.getByTestId('form-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('modal-close'));
    expect(screen.queryByTestId('form-modal')).not.toBeInTheDocument();
    expect(mockSavePromotion).not.toHaveBeenCalled();
  });

  it('sets applies_to to category and captures the category id', async () => {
    await openAddForm();
    fireEvent.change(screen.getByTestId('select-Applies To'), { target: { value: 'category' } });
    // Applying to a category reveals the category ID input.
    fireEvent.change(screen.getByTestId('input-Category ID'), { target: { value: 'cat_desserts' } });
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Dessert Deal' } });
    fireEvent.change(screen.getByTestId('input-Percentage *'), { target: { value: '15' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockSavePromotion).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Dessert Deal',
          applies_to: 'category',
          applies_to_id: 'cat_desserts',
        }),
        undefined,
      );
      expect(mockShowToast).toHaveBeenCalledWith('Promotion created.', 'success');
    });
  });

  it('sets applies_to to product and captures the product id', async () => {
    await openAddForm();
    fireEvent.change(screen.getByTestId('select-Applies To'), { target: { value: 'product' } });
    fireEvent.change(screen.getByTestId('input-Product ID'), { target: { value: 'prod_coke' } });
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Coke Deal' } });
    fireEvent.change(screen.getByTestId('input-Percentage *'), { target: { value: '2' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockSavePromotion).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Coke Deal',
          applies_to: 'product',
          applies_to_id: 'prod_coke',
          value: 2,
        }),
        undefined,
      );
    });
  });

  it('captures min_purchase, day_of_week and start/end dates and submits them', async () => {
    await openAddForm();
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Weekend Deal' } });
    fireEvent.change(screen.getByTestId('input-Percentage *'), { target: { value: '10' } });
    fireEvent.change(screen.getByTestId('input-Min Purchase ($)'), { target: { value: '25' } });
    fireEvent.change(screen.getByTestId('select-Day of Week'), { target: { value: '5' } });
    fireEvent.change(screen.getByTestId('input-Start Date'), { target: { value: '2025-07-01' } });
    fireEvent.change(screen.getByTestId('input-End Date'), { target: { value: '2025-07-31' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockSavePromotion).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Weekend Deal',
          min_purchase: 25,
          day_of_week: 5,
          start_date: '2025-07-01',
          end_date: '2025-07-31',
        }),
        undefined,
      );
    });
  });

  it('toggles the active checkbox off before saving', async () => {
    await openAddForm();
    // Default state is active (checked).
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Inactive Promo' } });
    fireEvent.change(screen.getByTestId('input-Percentage *'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockSavePromotion).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Inactive Promo', is_active: 0 }),
        undefined,
      );
    });
  });

  it('keeps is_active true by default when creating', async () => {
    await openAddForm();
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Auto Active' } });
    fireEvent.change(screen.getByTestId('input-Percentage *'), { target: { value: '20' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockSavePromotion).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Auto Active', is_active: 1 }),
        undefined,
      );
    });
  });
});

// ══════════════════════════════════════════════════════════════════════
// PromotionsPanel — bogo type special-casing
// ══════════════════════════════════════════════════════════════════════
describe('PromotionsPanel bogo type', () => {
  it('submits bogo with auto-calculated zero value', async () => {
    await openAddForm();
    fireEvent.change(screen.getByTestId('select-Type *'), { target: { value: 'bogo' } });
    // The value input is read-only/disabled for bogo; name is still required.
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'BOGO Combo' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockSavePromotion).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'BOGO Combo', type: 'bogo', value: 0 }),
        undefined,
      );
      expect(mockShowToast).toHaveBeenCalledWith('Promotion created.', 'success');
    });
  });
});

// ══════════════════════════════════════════════════════════════════════
// PromotionsPanel — editing form pre-fill and field handlers on edit path
// ══════════════════════════════════════════════════════════════════════
describe('PromotionsPanel edit form fields', () => {
  it('pre-fills and edits a product applies_to promotion', async () => {
    promosData = [mockPromos[2]]; // Coke Discount, product applies_to_id
    renderWithQuery(<PromotionsPanel />);
    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Edit Promotion' })));
    // Pre-filled fields from the product promotion.
    expect(screen.getByTestId('input-Name *')).toHaveValue('Coke Discount');
    expect(screen.getByTestId('input-Product ID')).toHaveValue('prod_coke');
    // Change the product id and re-save.
    fireEvent.change(screen.getByTestId('input-Product ID'), { target: { value: 'prod_pepsi' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockSavePromotion).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Coke Discount', applies_to_id: 'prod_pepsi' }),
        'pr3',
      );
      expect(mockShowToast).toHaveBeenCalledWith('Promotion updated.', 'success');
    });
  });

  it('pre-fills a bogo promotion with day_of_week and keeps is_active from data', async () => {
    promosData = [mockPromos[1]]; // BOGO Dessert, inactive, day_of_week 5
    renderWithQuery(<PromotionsPanel />);
    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Edit Promotion' })));
    expect(screen.getByTestId('select-Type *')).toHaveValue('bogo');
    expect(screen.getByTestId('select-Day of Week')).toHaveValue('5');
    expect(screen.getByTestId('select-Applies To')).toHaveValue('category');
    expect(screen.getByTestId('input-Category ID')).toHaveValue('cat_desserts');
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    // Toggle it back on.
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockSavePromotion).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'BOGO Dessert', is_active: 1 }),
        'pr2',
      );
    });
  });
});
