import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TenantMenu from '@/components/public/TenantMenu';

const meals = [
  { id: 'm1', name: 'Grilled Chicken', mealCategoryId: 'c1', price: 250, description: 'Tasty', isActive: 1 },
  { id: 'm2', name: 'Pasta', mealCategoryId: 'c1', price: 180, isActive: 1 },
  { id: 'm3', name: 'Salad', mealCategoryId: 'c2', price: 120, isActive: 1 },
];

const mealCategories = [
  { id: 'c1', name: 'Mains', position: 1 },
  { id: 'c2', name: 'Starters', position: 2 },
];

const defaultProps = {
  meals,
  mealCategories,
  tenantName: 'Test Camp',
  primaryColor: '#1a73e8',
  whatsappNumber: '201234567890',
};

describe('TenantMenu', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders menu categories and items', () => {
    render(<TenantMenu {...defaultProps} />);
    // Category names appear twice: once in the chip, once in the section h2
    expect(screen.getAllByText('Mains').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Starters').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Grilled Chicken')).toBeInTheDocument();
    expect(screen.getByText('Pasta')).toBeInTheDocument();
    expect(screen.getByText('Salad')).toBeInTheDocument();
  });

  it('renders tenant name in header', () => {
    render(<TenantMenu {...defaultProps} />);
    expect(screen.getByText('Test Camp')).toBeInTheDocument();
  });

  it('adds item to cart and shows cart button', () => {
    render(<TenantMenu {...defaultProps} />);
    const addButtons = screen.getAllByText('+');
    fireEvent.click(addButtons[0]);
    expect(screen.getByText('View Order')).toBeInTheDocument();
    // Cart count badge appears in the floating button
    expect(screen.getByText('1', { selector: 'span[role="status"]' })).toBeInTheDocument();
  });

  it('increments and decrements cart quantity', () => {
    render(<TenantMenu {...defaultProps} />);
    const addButtons = screen.getAllByText('+');
    fireEvent.click(addButtons[0]);
    const removeBtn = screen.getByText('−');
    fireEvent.click(removeBtn);
    expect(screen.queryByTestId('menu-whatsapp-btn')).not.toBeInTheDocument();
  });

  it('opens cart drawer when clicking View Order', () => {
    render(<TenantMenu {...defaultProps} />);
    const addButtons = screen.getAllByText('+');
    fireEvent.click(addButtons[0]);
    fireEvent.click(screen.getByText('View Order'));
    expect(screen.getByText('Your Order')).toBeInTheDocument();
    expect(screen.getByTestId('menu-whatsapp-btn')).toBeInTheDocument();
  });

  it('closes cart drawer with close button', () => {
    render(<TenantMenu {...defaultProps} />);
    const addButtons = screen.getAllByText('+');
    fireEvent.click(addButtons[0]);
    fireEvent.click(screen.getByText('View Order'));
    fireEvent.click(screen.getByLabelText('Close'));
    expect(screen.queryByText('Your Order')).not.toBeInTheDocument();
  });

  it('closes cart drawer on Escape key (lines 182-186)', () => {
    render(<TenantMenu {...defaultProps} />);
    const addButtons = screen.getAllByText('+');
    fireEvent.click(addButtons[0]);
    fireEvent.click(screen.getByText('View Order'));
    expect(screen.getByText('Your Order')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Your Order')).not.toBeInTheDocument();
  });

  it('traps Tab focus inside drawer — Tab from last wraps to first (lines 197-199)', () => {
    render(<TenantMenu {...defaultProps} />);
    const addButtons = screen.getAllByText('+');
    fireEvent.click(addButtons[0]);
    fireEvent.click(screen.getByText('View Order'));

    const drawer = screen.getByRole('dialog');
    const focusable = drawer.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    expect(focusable.length).toBeGreaterThan(0);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    last.focus();
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(drawer, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
  });

  it('traps Shift+Tab focus inside drawer — Shift+Tab from first wraps to last (lines 194-196)', () => {
    render(<TenantMenu {...defaultProps} />);
    const addButtons = screen.getAllByText('+');
    fireEvent.click(addButtons[0]);
    fireEvent.click(screen.getByText('View Order'));

    const drawer = screen.getByRole('dialog');
    const focusable = drawer.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    first.focus();
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(drawer, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('does not wrap Tab when focus is on a middle element', () => {
    render(<TenantMenu {...defaultProps} />);
    const addButtons = screen.getAllByText('+');
    fireEvent.click(addButtons[0]);
    fireEvent.click(screen.getByText('View Order'));

    const drawer = screen.getByRole('dialog');
    const focusable = drawer.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length >= 3) {
      const middle = focusable[Math.floor(focusable.length / 2)];
      middle.focus();
      fireEvent.keyDown(drawer, { key: 'Tab' });
      expect(document.activeElement).toBe(middle);
    }
  });

  it('filters meals by search', () => {
    render(<TenantMenu {...defaultProps} />);
    fireEvent.change(screen.getByTestId('menu-search'), { target: { value: 'Pasta' } });
    expect(screen.getByText('Pasta')).toBeInTheDocument();
    expect(screen.queryByText('Salad')).not.toBeInTheDocument();
  });

  it('shows empty search state', () => {
    render(<TenantMenu {...defaultProps} />);
    fireEvent.change(screen.getByTestId('menu-search'), { target: { value: 'xyznonexistent' } });
    expect(screen.getByText('No results')).toBeInTheDocument();
  });

  it('clears cart', () => {
    render(<TenantMenu {...defaultProps} />);
    const addButtons = screen.getAllByText('+');
    fireEvent.click(addButtons[0]);
    fireEvent.click(screen.getByText('View Order'));
    fireEvent.click(screen.getByText('Clear Cart'));
    expect(screen.queryByTestId('menu-whatsapp-btn')).not.toBeInTheDocument();
  });

  it('closes drawer on overlay click', () => {
    render(<TenantMenu {...defaultProps} />);
    const addButtons = screen.getAllByText('+');
    fireEvent.click(addButtons[0]);
    fireEvent.click(screen.getByText('View Order'));
    const overlay = document.querySelector('.menu-drawer-overlay');
    expect(overlay).toBeInTheDocument();
    fireEvent.click(overlay!);
    expect(screen.queryByText('Your Order')).not.toBeInTheDocument();
  });

  it('shows no whatsapp message when number is missing', () => {
    render(<TenantMenu {...defaultProps} whatsappNumber="" />);
    const addButtons = screen.getAllByText('+');
    fireEvent.click(addButtons[0]);
    fireEvent.click(screen.getByText('View Order'));
    expect(screen.getByText('WhatsApp number not available')).toBeInTheDocument();
  });

  it('inactive meals are hidden', () => {
    const mealsWithInactive = [
      ...meals,
      { id: 'm4', name: 'Hidden Soup', mealCategoryId: 'c2', price: 90, isActive: 0 },
    ];
    render(<TenantMenu {...defaultProps} meals={mealsWithInactive} />);
    expect(screen.queryByText('Hidden Soup')).not.toBeInTheDocument();
  });
});
