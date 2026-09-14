/**
 * ShopCatalog — product grid with category filter + search + add-to-cart.
 *
 * client:load island. Session ID stored in localStorage (per-tenant).
 * Uses getStorefrontProducts for browsing + addToStorefrontCart for mutations.
 */
import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getStorefrontProducts, addToStorefrontCart } from '@/lib/api';
import { getSessionId, broadcastCartUpdate } from '@/lib/storefrontSession';
import { formatCurrency } from '@/lib/utils';

type Product = { id: string; name: string; sellingPrice: number; description: string; imageUrl: string | null };

interface Props {
  tenantId: string;
  primaryColor: string;
}

export default function ShopCatalog({ tenantId, primaryColor }: Props) {
  const sessionId = getSessionId(tenantId);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState('');
  const [toast, setToast] = useState('');

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useQuery<{ data: Product[]; total: number; pageSize: number }>({
    queryKey: ['storefront-products', tenantId, category, debouncedSearch, page],
    queryFn: async () => {
      const res = await getStorefrontProducts({
        category: category || undefined,
        search: debouncedSearch || undefined,
        page,
        pageSize: 20,
      });
      return res as unknown as { data: Product[]; total: number; pageSize: number };
    },
    placeholderData: (prev) => prev,
  });

  const products = data?.data ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }, []);

  const handleAddToCart = useCallback(async (product: Product) => {
    try {
      await addToStorefrontCart({ productId: product.id, quantity: 1, sessionId });
      showToast(`${product.name} added to cart`);
      broadcastCartUpdate();
    } catch {
      showToast('Could not add to cart');
    }
  }, [sessionId, showToast]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-stone-800">Shop</h1>

      {/* Search + filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
        />
        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value); setPage(1); }}
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">All categories</option>
        </select>
      </div>

      {/* Toast */}
      {toast && (
        <div className="mb-4 rounded-lg bg-stone-900 px-4 py-2 text-sm text-white shadow-sm">
          {toast}
        </div>
      )}

      {/* Products grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-64 animate-pulse rounded-xl bg-stone-200" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <p className="text-center text-stone-500">No products available yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <div key={product.id} className="group overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition hover:shadow-md">
              <div className="aspect-[4/3] w-full bg-stone-100">
                {product.imageUrl ? (
                  <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-stone-400">No image</div>
                )}
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-stone-800">{product.name}</h3>
                {product.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-stone-500">{product.description}</p>
                )}
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-lg font-bold text-stone-900">{formatCurrency(product.sellingPrice)}</span>
                  <button
                    onClick={() => handleAddToCart(product)}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90"
                    style={{ backgroundColor: primaryColor }}
                  >
                    Add to cart
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded border border-stone-300 px-3 py-1 text-sm disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-stone-500">Page {page} of {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded border border-stone-300 px-3 py-1 text-sm disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
