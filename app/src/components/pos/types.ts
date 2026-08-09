// ─── POS Shared Types ──────────────────────────────────────
// Extracted from POSApp.tsx to enable code-splitting across views.
// T8-C: shapes aligned with the OpenAPI-generated spec types
// (components['schemas'] in @/lib/api-types) so casts from api client
// responses are assignable without `as unknown as`.

export type PosUser = {
  id: string;
  username: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role: string;
  organizationId?: number | string;
  storeId?: number | string | unknown;
  /** Org-level tax rate from the login response; undefined → fall back to 0.1 */
  taxRate?: number | null;
};

export type PosProduct = {
  id: string;
  sku: string;
  name: string;
  description: string;
  sellingPrice: number;
  costPrice: number;
  categoryId: number | null;
  type: string;
  imageUrl: string | null;
  isActive: number;
  stockQuantity: number;
};

export type CartItem = {
  product: PosProduct;
  quantity: number;
};

export type Order = {
  id: string;
  orderNumber: string;
  totalAmount: number;
  subtotal: number;
  taxAmount: number;
  paymentMethod: string;
  amountCash?: number;
  amountCard?: number;
  status: string;
  createdAt?: string;
  items?: Array<{ id: string; productName?: string; productId?: string; quantity: number; unitPrice: number; totalAmount: number }>;
};

export type Dashboard = {
  todayRevenue: number;
  todayOrders: number;
  activeProducts: number;
  recentOrders: Order[];
};

export type Shift = {
  id: string;
  status: string;
  openingTime: string;
  openingCash: number;
  expectedClosingCash?: number;
  notes?: string | null;
};
