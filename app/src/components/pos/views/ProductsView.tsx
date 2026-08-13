import { useState, useEffect } from 'react';
import * as apiClient from '@/lib/api';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProductGridSkeleton } from '@/components/ui/Skeleton';
import type { PosProduct, CartItem } from '../types';

// ─── Products View (with cart) ─────────────────────────────
export default function ProductsView({ cart, setCart }: { cart: CartItem[]; setCart: React.Dispatch<React.SetStateAction<CartItem[]>> }) {
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient.posGetProducts()
      .then((data) => setProducts((Array.isArray(data) ? data : []) as PosProduct[]))
      .catch((e) => setError(e.message || 'Failed to load products'))
      .finally(() => setLoading(false));
  }, []);

  function addToCart(product: PosProduct) {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { product, quantity: 1 }];
    });
  }

  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    return p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || String(p.categoryId ?? '').includes(q);
  });

  if (loading) return <div className="p-6"><ProductGridSkeleton count={8} /></div>;
  if (error) return <div className="p-8 text-red-500">{error}</div>;

  return (
    <div className="flex flex-1 overflow-hidden" data-testid="pos-products">
      {/* Product grid */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200 bg-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-gray-900">Products</h2>
            <Input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="product-search"
              className="w-full sm:w-72"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4" data-testid="product-grid">
            {filtered.map((p) => {
              const cartItem = cart.find((i) => i.product.id === p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  data-testid="product-item"
                  className={`text-left bg-white rounded-xl border-2 p-3 sm:p-4 transition-all hover:shadow-md min-h-[120px] ${
                    cartItem ? 'border-indigo-500 ring-1 ring-indigo-200' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="w-full h-24 bg-gray-100 rounded-lg mb-3 flex items-center justify-center text-gray-500 text-2xl">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt={p.name} loading="lazy" decoding="async" className="w-full h-full object-cover rounded-lg" />
                    ) : (
                      '📦'
                    )}
                  </div>
                  <div className="font-semibold text-gray-900 text-sm truncate">{p.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{p.sku}</div>
                  <div className="text-indigo-600 font-bold mt-2">${Number(p.sellingPrice).toFixed(2)}</div>
                  {cartItem && (
                    <div className="mt-2">
                      <Badge variant="info" size="sm">
                        In cart: {cartItem.quantity}
                      </Badge>
                    </div>
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="col-span-full">
                <EmptyState
                  title="No products found"
                  description="Try adjusting your search or check if products are available."
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
