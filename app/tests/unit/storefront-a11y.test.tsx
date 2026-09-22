import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ShopCatalog from '@/components/public/ShopCatalog';
import StorefrontCart from '@/components/public/StorefrontCart';

const api = vi.hoisted(() => ({
  getStorefrontProducts: vi.fn(),
  addToStorefrontCart: vi.fn(),
  getStorefrontCart: vi.fn(),
  updateStorefrontCartItem: vi.fn(),
  removeStorefrontCartItem: vi.fn(),
}));

vi.mock('@/lib/api', () => api);

vi.mock('@/lib/storefrontSession', () => ({
  getSessionId: () => 'sess-1',
  broadcastCartUpdate: vi.fn(),
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

const products = [
  { id: 'p1', name: 'Coffee', sellingPrice: 50, description: 'Hot coffee', imageUrl: null },
];

const cart = {
  id: 'cart-1',
  items: [
    { id: 'ci1', productId: 'p1', productName: 'Coffee', quantity: 2, unitPrice: 50, totalPrice: 100 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getStorefrontProducts.mockResolvedValue({ data: products, total: 1, pageSize: 20 });
  api.addToStorefrontCart.mockResolvedValue({ ok: true });
  api.getStorefrontCart.mockResolvedValue(cart);
  api.updateStorefrontCartItem.mockResolvedValue({ ok: true });
  api.removeStorefrontCartItem.mockResolvedValue({ ok: true });
});

describe('ShopCatalog a11y (F-A19-04/05/06)', () => {
  it('labels the search input and category filter', async () => {
    renderWithClient(<ShopCatalog tenantId="t1" primaryColor="#000" />);
    expect(screen.getByLabelText('Search products')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by category')).toBeInTheDocument();
    // Products still load behind the labelled controls.
    expect(await screen.findByText('Coffee')).toBeInTheDocument();
  });

  it('announces add-to-cart feedback via a polite live region', async () => {
    renderWithClient(<ShopCatalog tenantId="t1" primaryColor="#000" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add to cart' }));

    const toast = await screen.findByRole('status');
    expect(toast).toHaveAttribute('aria-live', 'polite');
    expect(toast).toHaveTextContent('Coffee added to cart');
  });
});

describe('StorefrontCart a11y (F-A19-07)', () => {
  it('labels quantity steppers and remove with the product name', async () => {
    renderWithClient(<StorefrontCart tenantId="t1" primaryColor="#000" />);
    await screen.findByText('Coffee');

    expect(
      screen.getByRole('button', { name: 'Decrease quantity of Coffee' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Increase quantity of Coffee' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove Coffee from cart' }),
    ).toBeInTheDocument();
    const qty = screen.getByRole('status', { name: 'Quantity of Coffee: 2' });
    expect(qty).toHaveTextContent('2');
  });
});
