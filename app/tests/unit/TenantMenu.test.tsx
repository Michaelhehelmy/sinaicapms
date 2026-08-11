import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import TenantMenu from '@/components/public/TenantMenu';

vi.mock('@/lib/utils', () => ({
  escHtml: (s: string) => s,
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

const meals = [
  { id: 'm1', name: 'Koshari', mealCategoryId: 'cat1', price: 50, description: 'Egyptian dish', isActive: 1 },
  { id: 'm2', name: 'Ful', mealCategoryId: 'cat1', price: 30, description: 'Fava beans', isActive: 1 },
  { id: 'm3', name: 'Inactive Meal', mealCategoryId: 'cat1', price: 20, isActive: 0 },
];

const mealCategories = [
  { id: 'cat1', name: 'Main', position: 0 },
  { id: 'cat2', name: 'Desserts', position: 1 },
];

const defaultProps = {
  meals,
  mealCategories,
  tenantName: 'Test Camp',
  primaryColor: '#800020',
  whatsappNumber: '+1234567890',
};

describe('TenantMenu', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders tenant name', () => {
    render(<TenantMenu {...defaultProps} />);
    expect(screen.getByText('Test Camp')).toBeInTheDocument();
  });

  it('renders active meal category chips', () => {
    render(<TenantMenu {...defaultProps} />);
    expect(screen.getAllByText('Main').length).toBeGreaterThanOrEqual(1);
  });

  it('renders active meals', () => {
    render(<TenantMenu {...defaultProps} />);
    expect(screen.getByText('Koshari')).toBeInTheDocument();
    expect(screen.getByText('Ful')).toBeInTheDocument();
    expect(screen.queryByText('Inactive Meal')).not.toBeInTheDocument();
  });

  it('shows meal prices', () => {
    render(<TenantMenu {...defaultProps} />);
    expect(screen.getAllByText('50 EGP').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('30 EGP').length).toBeGreaterThanOrEqual(1);
  });

  it('shows meal descriptions', () => {
    render(<TenantMenu {...defaultProps} />);
    expect(screen.getByText('Egyptian dish')).toBeInTheDocument();
  });

  it('adds item to cart on + click', () => {
    render(<TenantMenu {...defaultProps} />);
    const addButtons = screen.getAllByText('+');
    fireEvent.click(addButtons[0]);
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);
  });

  it('increments quantity on repeated add', () => {
    render(<TenantMenu {...defaultProps} />);
    let addButtons = screen.getAllByText('+');
    fireEvent.click(addButtons[0]);
    addButtons = screen.getAllByText('+');
    fireEvent.click(addButtons[0]);
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
  });

  it('shows view order button when cart has items', () => {
    render(<TenantMenu {...defaultProps} />);
    const addButtons = screen.getAllByText('+');
    fireEvent.click(addButtons[0]);
    expect(screen.getAllByText('View Order').length).toBeGreaterThanOrEqual(1);
  });

  it('opens cart drawer', () => {
    render(<TenantMenu {...defaultProps} />);
    const addButtons = screen.getAllByText('+');
    fireEvent.click(addButtons[0]);
    const viewOrderButtons = screen.getAllByText('View Order');
    fireEvent.click(viewOrderButtons[viewOrderButtons.length - 1]);
    expect(screen.getByText('Your Order')).toBeInTheDocument();
  });

  it('displays total in cart drawer', () => {
    render(<TenantMenu {...defaultProps} />);
    const addButtons = screen.getAllByText('+');
    fireEvent.click(addButtons[0]);
    const viewOrderButtons = screen.getAllByText('View Order');
    fireEvent.click(viewOrderButtons[viewOrderButtons.length - 1]);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getAllByText('50 EGP').length).toBeGreaterThanOrEqual(1);
  });

  it('removes item from cart via decrement', () => {
    render(<TenantMenu {...defaultProps} />);
    const addButtons = screen.getAllByText('+');
    fireEvent.click(addButtons[0]);
    const removeButtons = screen.getAllByText('−');
    fireEvent.click(removeButtons[0]);
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('clears cart via clear button', () => {
    render(<TenantMenu {...defaultProps} />);
    const addButtons = screen.getAllByText('+');
    fireEvent.click(addButtons[0]);
    const viewOrderButtons = screen.getAllByText('View Order');
    fireEvent.click(viewOrderButtons[viewOrderButtons.length - 1]);
    fireEvent.click(screen.getByText('Clear Cart'));
    expect(screen.getByText('Your cart is empty')).toBeInTheDocument();
  });

  it('opens WhatsApp with order link', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<TenantMenu {...defaultProps} />);
    const addButtons = screen.getAllByText('+');
    fireEvent.click(addButtons[0]);
    const viewOrderButtons = screen.getAllByText('View Order');
    fireEvent.click(viewOrderButtons[viewOrderButtons.length - 1]);
    fireEvent.click(screen.getByText(/Send Order via WhatsApp/));
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('wa.me/1234567890'),
      '_blank'
    );
    openSpy.mockRestore();
  });

  it('shows no whatsapp message when number not provided', () => {
    render(<TenantMenu {...defaultProps} whatsappNumber={undefined} />);
    const addButtons = screen.getAllByText('+');
    fireEvent.click(addButtons[0]);
    const viewOrderButtons = screen.getAllByText('View Order');
    fireEvent.click(viewOrderButtons[viewOrderButtons.length - 1]);
    expect(screen.getByText('WhatsApp number not available')).toBeInTheDocument();
  });

  it('searches meals by name', () => {
    render(<TenantMenu {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText('Search for a meal...'), { target: { value: 'Koshari' } });
    expect(screen.getByText('Koshari')).toBeInTheDocument();
    expect(screen.queryByText('Ful')).not.toBeInTheDocument();
  });

  it('shows no results for bad search', () => {
    render(<TenantMenu {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText('Search for a meal...'), { target: { value: 'xyz123' } });
    expect(screen.getByText('No results')).toBeInTheDocument();
  });

  it('renders empty cart state in drawer', () => {
    render(<TenantMenu {...defaultProps} />);
    const addButtons = screen.getAllByText('+');
    fireEvent.click(addButtons[0]);
    const viewOrderButtons = screen.getAllByText('View Order');
    fireEvent.click(viewOrderButtons[viewOrderButtons.length - 1]);
    fireEvent.click(screen.getByText('Clear Cart'));
    expect(screen.getByText('Your cart is empty')).toBeInTheDocument();
  });

  it('closes drawer when clicking backdrop', () => {
    render(<TenantMenu {...defaultProps} />);
    const addButtons = screen.getAllByText('+');
    fireEvent.click(addButtons[0]);
    const viewOrderButtons = screen.getAllByText('View Order');
    fireEvent.click(viewOrderButtons[viewOrderButtons.length - 1]);
    expect(screen.getByText('Your Order')).toBeInTheDocument();
    const closeButtons = screen.getAllByRole('button', { name: 'Close' });
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(screen.queryByText('Your Order')).not.toBeInTheDocument();
  });

  it('recovers from corrupt cart storage', () => {
    localStorage.setItem('sc_menu_cart', '{invalid json');
    render(<TenantMenu {...defaultProps} />);
    expect(screen.getByText('Test Camp')).toBeInTheDocument();
  });

  it('updates active category from IntersectionObserver', () => {
    let callback: ((entries: { isIntersecting: boolean; target: Element }[]) => void) | null = null;
    const observed: Element[] = [];
    class MockIO {
      constructor(cb: (entries: { isIntersecting: boolean; target: Element }[]) => void) { callback = cb; }
      observe(el: Element) { observed.push(el); }
      unobserve() { return null; }
      disconnect() { return null; }
    }
    window.IntersectionObserver = MockIO as unknown as typeof IntersectionObserver;
    render(
      <TenantMenu
        {...defaultProps}
        meals={[...meals, { id: 'm4', name: 'Basbousa', mealCategoryId: 'cat2', price: 40, isActive: 1 }]}
      />,
    );
    expect(observed.length).toBeGreaterThanOrEqual(2);
    act(() => {
      callback!([{ isIntersecting: true, target: observed[1] }]);
    });
    const chips = screen.getAllByTestId('tenant-nav-link');
    expect(chips[1]).toHaveStyle({ background: '#800020' });
  });

  it('scrolls to category when chip clicked', () => {
    const scrollSpy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {});
    render(
      <TenantMenu
        {...defaultProps}
        meals={[...meals, { id: 'm4', name: 'Basbousa', mealCategoryId: 'cat2', price: 40, isActive: 1 }]}
      />,
    );
    const chips = screen.getAllByTestId('tenant-nav-link');
    fireEvent.click(chips[1]);
    expect(scrollSpy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth', block: 'start' }));
    scrollSpy.mockRestore();
  });

  it('closes drawer when clicking the backdrop overlay', () => {
    render(<TenantMenu {...defaultProps} />);
    const addButtons = screen.getAllByText('+');
    fireEvent.click(addButtons[0]);
    const viewOrderButtons = screen.getAllByText('View Order');
    fireEvent.click(viewOrderButtons[viewOrderButtons.length - 1]);
    expect(screen.getByText('Your Order')).toBeInTheDocument();
    const drawerPanel = screen.getByText('Your Order').closest('div.fixed') as HTMLElement;
    const backdrop = drawerPanel.previousElementSibling as HTMLElement;
    fireEvent.click(backdrop);
    expect(screen.queryByText('Your Order')).not.toBeInTheDocument();
  });

  it('adjusts quantity from within the drawer', () => {
    render(<TenantMenu {...defaultProps} />);
    fireEvent.click(screen.getAllByText('+')[0]);
    fireEvent.click(screen.getAllByText('+')[0]);
    const viewOrderButtons = screen.getAllByText('View Order');
    fireEvent.click(viewOrderButtons[viewOrderButtons.length - 1]);
    expect(screen.getByText('Your Order')).toBeInTheDocument();
    const minusButtons = screen.getAllByText('−');
    fireEvent.click(minusButtons[minusButtons.length - 1]);
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);
    const plusButtons = screen.getAllByText('+');
    fireEvent.click(plusButtons[plusButtons.length - 1]);
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
  });
});
