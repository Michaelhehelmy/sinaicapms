import { useState, useEffect, useRef, useCallback } from 'react';
import { escHtml } from '@/lib/utils';
import { normalizeHex, hexToRgb, contrastText } from '@/lib/theme';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';

interface MealItem {
  id: string;
  name: string;
  mealCategoryId: string;
  price: number;
  description?: string;
  imageUrl?: string;
  isActive: number;
  categoryName?: string;
}

interface MealCategoryItem {
  id: string;
  name: string;
  position: number;
}

interface CartItem extends MealItem {
  qty: number;
}

interface Props {
  meals: MealItem[];
  mealCategories: MealCategoryItem[];
  tenantName: string;
  primaryColor?: string;
  whatsappNumber?: string;
}

const DEFAULT_CURRENCY = 'EGP';

const CART_STORAGE_KEY = 'sc_menu_cart';

/** Icon set: one stroke family (Heroicons outline, 24px grid, 1.75 stroke). */
interface IconProps {
  className?: string;
}

function CartIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
    </svg>
  );
}

function SendIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
    </svg>
  );
}

function XMarkIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

/** rgba shade of any hex color, built from the existing hexToRgb helper. */
function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const MENU_T = {
  searchPlaceholder: 'Search for a meal...',
  emptyCart: 'Your cart is empty',
  cartTitle: 'Your Order',
  close: 'Close',
  viewOrder: 'View Order',
  total: 'Total',
  sendWhatsApp: 'Send Order via WhatsApp',
  noWhatsapp: 'WhatsApp number not available',
  clearCart: 'Clear Cart',
  noResults: 'No results',
  noResultsHint: 'Try a different search term',
  newOrder: 'new order from {name}',
  totalLabel: 'Total',
} as const;

function loadCart(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export default function TenantMenu({ meals, mealCategories, tenantName, primaryColor, whatsappNumber }: Props) {
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>(loadCart);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(0);
  const categoryRefs = useRef<(HTMLDivElement | null)[]>([]);
  const chipsRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Single brand accent derived from the tenant color (one accent per page).
  const brandHex = normalizeHex(primaryColor);
  const brandText = contrastText(hexToRgb(brandHex));

  // Persist cart to localStorage on every change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    }
  }, [cart]);

  const t = MENU_T;
  const currency = DEFAULT_CURRENCY;

  const categories = mealCategories
    .slice()
    .sort((a, b) => (a.position || 0) - (b.position || 0))
    .map((cat) => ({
      ...cat,
      items: meals.filter((m) => m.mealCategoryId === cat.id && m.isActive === 1),
    }));

  const filteredCategories = categories.map(cat => ({
    ...cat,
    items: cat.items.filter(item => {
      const q = search.toLowerCase();
      return item.name.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q)) ||
        cat.name.toLowerCase().includes(q);
    })
  })).filter(cat => cat.items.length > 0);

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const idx = categoryRefs.current.findIndex(ref => ref === entry.target);
            if (idx !== -1) setActiveCategory(idx);
          }
        });
      },
      { rootMargin: '-120px 0px -60% 0px', threshold: 0 }
    );
    categoryRefs.current.forEach(ref => {
      if (ref) observerRef.current!.observe(ref);
    });
    return () => observerRef.current?.disconnect();
  }, [filteredCategories.length, search]);

  useEffect(() => {
    if (chipsRef.current) {
      const activeChip = chipsRef.current.children[activeCategory] as HTMLElement;
      if (activeChip) {
        activeChip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [activeCategory]);

  // Dialog behavior: focus the drawer on open, trap Tab, close on Escape,
  // restore focus to the trigger when closed.
  useEffect(() => {
    if (!drawerOpen) return;
    const drawer = drawerRef.current;
    if (!drawer) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setDrawerOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = drawer.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    drawer.focus();
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [drawerOpen]);

  const scrollToCategory = useCallback((idx: number) => {
    const ref = categoryRefs.current[idx];
    if (ref) {
      ref.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const addToCart = useCallback((item: MealItem) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === item.id);
      if (existing) {
        return prev.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c);
      }
      return [...prev, { ...item, qty: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((itemId: string) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === itemId);
      if (!existing) return prev;
      if (existing.qty <= 1) return prev.filter(c => c.id !== itemId);
      return prev.map(c => c.id === itemId ? { ...c, qty: c.qty - 1 } : c);
    });
  }, []);

  const getItemQty = useCallback((itemId: string) => {
    return cart.find(c => c.id === itemId)?.qty || 0;
  }, [cart]);

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);

  const sendWhatsApp = useCallback(() => {
    if (!whatsappNumber || cart.length === 0) return;
    const lines = cart.map(item => {
      const priceStr = item.price ? `${item.price} ${currency}` : '';
      return `• ${escHtml(item.name)} × ${item.qty} - ${priceStr}`;
    });
    const totalStr = `\n\n${t.totalLabel}: ${cartTotal} ${currency}`;
    const msg = `${t.newOrder.replace('{name}', escHtml(tenantName))}\n\n${lines.join('\n')}${totalStr}`;
    const url = `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  }, [cart, cartTotal, currency, tenantName, whatsappNumber, t]);

  const formatPrice = (price: number) => {
    return `${price} ${currency}`;
  };

  return (
    <div data-testid="tenant-nav" className="min-h-screen font-cairo" style={{ background: '#f4ead2', color: '#333' }}>
      <div
        className="relative w-full overflow-hidden"
        style={{
          background: brandHex,
          minHeight: '220px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div className="bg-topo pointer-events-none absolute inset-0 text-white opacity-20" aria-hidden="true"></div>
        <div className="relative z-10 text-center px-4 py-12">
          <h1 className="text-3xl md:text-5xl font-bold mb-2" style={{ color: brandText }}>
            {tenantName}
          </h1>
          <p className="text-lg md:text-xl opacity-80" style={{ color: brandText }}>
            Menu
          </p>
        </div>
      </div>

      <div className="sticky top-0 z-30 px-4 py-3" style={{ background: '#f4ead2', borderBottom: '1px solid #d4c5a0' }}>
        <div className="max-w-2xl mx-auto mb-3">
          <Input
            type="text"
            placeholder={t.searchPlaceholder}
            value={search}
            onChange={e => setSearch(e.target.value)}
            rightIcon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            }
            className="!rounded-xl !border-[#d4c5a0] !bg-white !py-3 !text-base"
            data-testid="menu-search"
          />
        </div>

        <div
          ref={chipsRef}
          className="flex gap-2 overflow-x-auto pb-2 max-w-4xl mx-auto no-scrollbar"
          style={{ scrollBehavior: 'smooth' }}
        >
          {filteredCategories.map((cat, idx) => (
            <Button
              key={cat.id}
              onClick={() => scrollToCategory(idx)}
              size="sm"
              data-testid="tenant-nav-link"
              data-page={cat.name}
              className="shrink-0 !rounded-full !font-semibold !whitespace-nowrap transition-all duration-200"
              style={{
                background: activeCategory === idx ? brandHex : '#fff',
                color: activeCategory === idx ? brandText : brandHex,
                border: `2px solid ${brandHex}`,
                boxShadow: activeCategory === idx ? `0 2px 8px ${hexToRgba(brandHex, 0.25)}` : 'none',
              }}
            >
              {cat.name}
            </Button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {filteredCategories.length === 0 && (
          <EmptyState
            title={t.noResults}
            description={t.noResultsHint}
          />
        )}

        {filteredCategories.map((cat, catIdx) => (
          <div
            key={cat.id}
            ref={el => { categoryRefs.current[catIdx] = el; }}
            className="mb-8"
          >
            <div
              className="flex items-center gap-3 mb-4 px-4 py-3 rounded-xl"
              style={{ background: hexToRgba(brandHex, 0.07), borderRight: `4px solid ${brandHex}` }}
            >
              <div className="w-3 h-3 rounded-full shrink-0" style={{ background: brandHex }} />
              <h2 className="text-xl font-bold" style={{ color: brandHex }}>{cat.name}</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {cat.items.map((item) => {
                const qty = getItemQty(item.id);
                return (
                  <div
                    key={item.id}
                    className="rounded-xl overflow-hidden transition-shadow duration-200 hover:shadow-md"
                    style={{
                      background: '#fff',
                      border: qty > 0 ? `2px solid ${brandHex}` : '1px solid #e8e0cc',
                    }}
                  >
                    <Card padding="none" className="!rounded-none !shadow-none !bg-transparent">
                      <div className="flex items-start justify-between p-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-base" style={{ color: '#2d2d2d' }}>{item.name}</h3>
                          {item.description && (
                            <p className="text-xs mt-1 opacity-60 italic">{item.description}</p>
                          )}
                          <span className="font-bold text-base mt-1 inline-block" style={{ color: brandHex }}>
                            {formatPrice(item.price)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          {qty > 0 ? (
                            <>
                              <Button
                                onClick={() => removeFromCart(item.id)}
                                variant="danger"
                                size="sm"
                                className="!w-10 !h-10 !rounded-full !p-0 !text-lg"
                              >
                                −
                              </Button>
                              <span className="w-6 text-center font-bold">{qty}</span>
                              <Button
                                onClick={() => addToCart(item)}
                                size="sm"
                                className="!w-10 !h-10 !rounded-full !p-0 !text-lg"
                                style={{ background: brandHex, color: brandText }}
                              >
                                +
                              </Button>
                            </>
                          ) : (
                            <Button
                              onClick={() => addToCart(item)}
                              size="sm"
                              className="!w-10 !h-10 !rounded-full !p-0 !text-lg hover:!scale-110"
                              style={{ background: brandHex, color: brandText }}
                            >
                              +
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {cartCount > 0 && (
        <Button
          onClick={() => setDrawerOpen(true)}
          size="lg"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 !rounded-full shadow-xl !gap-3 transition-transform hover:!scale-105"
          style={{ background: brandHex, color: brandText }}
        >
          <span className="flex items-center gap-3">
            <Badge
              size="sm"
              className="!bg-white/25 !rounded-full min-w-[1.5rem] h-6 flex items-center justify-center !p-0"
              style={{ color: brandText }}
            >
              {cartCount}
            </Badge>
            <span>{t.viewOrder}</span>
            <span className="opacity-80">|</span>
            <span>{formatPrice(cartTotal)}</span>
          </span>
        </Button>
      )}

      {drawerOpen && (
        <>
          <div
            className="menu-drawer-overlay fixed inset-0 bg-black/40 z-50"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="menu-cart-drawer-title"
            tabIndex={-1}
            className="menu-drawer fixed inset-y-0 right-0 z-50 w-full max-w-md flex flex-col shadow-2xl outline-none"
            style={{ background: '#f4ead2' }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#d4c5a0' }}>
              <h2 id="menu-cart-drawer-title" className="text-xl font-bold flex items-center gap-2">
                <CartIcon className="h-5 w-5" />
                {t.cartTitle}
              </h2>
              <Button
                onClick={() => setDrawerOpen(false)}
                variant="ghost"
                size="sm"
                className="!w-8 !h-8 !rounded-full !p-0"
                aria-label={t.close}
              >
                <XMarkIcon />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {cart.length === 0 ? (
                <EmptyState
                  icon={<CartIcon className="h-12 w-12 text-gray-300" />}
                  title={t.emptyCart}
                  className="py-12"
                />
              ) : (
                <div className="space-y-3">
                  {cart.map((item) => (
                    <Card key={item.id} padding="sm" className="!shadow-none !p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm">{item.name}</p>
                          <p className="text-xs opacity-60">{formatPrice(item.price)}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            onClick={() => removeFromCart(item.id)}
                            variant="danger"
                            size="sm"
                            className="!w-10 !h-10 !rounded-full !p-0 !text-sm"
                          >
                            −
                          </Button>
                          <span className="w-5 text-center font-bold text-sm">{item.qty}</span>
                          <Button
                            onClick={() => addToCart(item)}
                            size="sm"
                            className="!w-10 !h-10 !rounded-full !p-0 !text-sm"
                            style={{ background: brandHex, color: brandText }}
                          >
                            +
                          </Button>
                        </div>
                        <span className="ml-3 font-bold text-sm shrink-0" style={{ color: brandHex }}>
                          {formatPrice(item.price * item.qty)}
                        </span>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="px-5 py-4 border-t" style={{ borderColor: '#d4c5a0' }}>
                <div className="flex justify-between mb-3">
                  <span className="font-bold text-lg">{t.total}</span>
                  <span className="font-bold text-lg" style={{ color: brandHex }}>
                    {formatPrice(cartTotal)}
                  </span>
                </div>
                <Button
                  onClick={sendWhatsApp}
                  disabled={!whatsappNumber}
                  fullWidth
                  leftIcon={<SendIcon />}
                  className="!rounded-xl hover:!opacity-90"
                  style={{ background: '#25D366' }}
                  data-testid="menu-whatsapp-btn"
                >
                  {t.sendWhatsApp}
                </Button>
                {!whatsappNumber && (
                  <p className="text-xs text-center mt-2 opacity-50">{t.noWhatsapp}</p>
                )}
                <Button
                  onClick={() => setCart([])}
                  variant="ghost"
                  fullWidth
                  className="!py-2 !text-sm !font-semibold opacity-60 hover:!opacity-100"
                >
                  {t.clearCart}
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .menu-drawer {
          animation: slideInRight 300ms cubic-bezier(0.32, 0.72, 0, 1);
        }
        .menu-drawer-overlay {
          animation: fadeIn 250ms ease;
        }
        @media (prefers-reduced-motion: reduce) {
          .menu-drawer,
          .menu-drawer-overlay {
            animation: none;
          }
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .font-cairo { font-family: 'Cairo', 'Noto Sans Arabic', sans-serif; }
      `}</style>
    </div>
  );
}
