/**
 * Storefront session ID — per-tenant, persisted in localStorage.
 *
 * Each tenant gets its own cart identity. The UUID is generated once and
 * reused until the user clears storage. No auth is required: the session
 * is a guest-only concept (the API resolves the tenant via hostname).
 */
import { apiFetch } from './api';

const STORAGE_PREFIX = 'sc_storefront_session_';

function storageKey(tenantId?: string): string {
  return `${STORAGE_PREFIX}${tenantId ?? 'default'}`;
}

/** Read or generate a storefront session UUID. */
export function getSessionId(tenantId?: string): string {
  if (typeof window === 'undefined') return '';
  const key = storageKey(tenantId);
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(key, id);
  return id;
}

/** Clear the stored session (call after checkout success). */
export function clearSessionId(tenantId?: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(storageKey(tenantId));
}

// ── Cart state (reactive across islands via storage event) ─────────────────

export interface CartItem {
  id: string;
  productId: string;
  productName?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface CartState {
  items: CartItem[];
  totalItems: number;
  totalPrice: number;
}

/** Fetch the current cart for a session via the backend API. */
export async function getCart(sessionId: string): Promise<CartState> {
  if (!sessionId) return { items: [], totalItems: 0, totalPrice: 0 };
  try {
    const res = await apiFetch<{ cart: unknown; items: CartItem[] }>(
      `/storefront/cart?sessionId=${encodeURIComponent(sessionId)}`,
    );
    const items = res?.items ?? [];
    const totalItems = items.reduce((n, i) => n + i.quantity, 0);
    const totalPrice = items.reduce((n, i) => n + i.totalPrice, 0);
    return { items, totalItems, totalPrice };
  } catch {
    return { items: [], totalItems: 0, totalPrice: 0 };
  }
}

/** Broadcast a cart update so other islands (header badge) pick it up. */
export function broadcastCartUpdate(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('storefront-cart-updated'));
}
