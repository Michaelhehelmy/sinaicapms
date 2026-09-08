export interface Camp {
  id: string;
  name: string;
  location: string;
  startDate: string;
  endDate: string;
  capacity: number;
  status: string;
  notes: string;
  /** Unified-architecture discriminator (projects.project_type, wire camelCase). */
  projectType?: string;
}

export interface Product {
  id: string;
  tenantId: string;
  categoryId: string | null;
  sku: string | null;
  basePrice: number;
  capacity: number;
  imageUrl: string | null;
  isActive: number;
  name?: string;
  description?: string;
  shortDescription?: string;
  campIds?: string[];
}

export interface Room {
  id: string;
  campId: string;
  productId: string;
  name: string;
  status: string;
  bedType: string;
  maxGuests: number;
  basePrice: number;
  floor: string | null;
  notes: string | null;
  isActive: number;
}

export interface Order {
  id: string;
  tenantId: string;
  campId: string;
  roomId: string;
  customerId: string | null;
  orderStateId: string;
  checkInDate: string;
  checkOutDate: string;
  numberOfPeople: number;
  totalAmount: number;
  amountPaid: number;
  // T8-C: these 4 are detail-only (GET /api/orders/:id) — absent from list rows.
  // Use getOrder()/OrderDetail when you need them.
  paymentMethod?: string | null;
  paymentStatus: string;
  reference: string;
  notes?: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  roomName: string | null;
  stateName: string | null;
}

export interface RatePlan {
  id: string;
  tenantId: string;
  productId: string;
  name: string;
  season: string;
  startDate: string | null;
  endDate: string | null;
  pricePerNight: number;
  minStay: number;
  isActive: number;
}

export interface Plan {
  id: string;
  campId: string;
  name: string;
  description: string | null;
  date: string | null;
  time: string | null;
  capacity: number | null;
  status: string;
  category: string | null;
}

export interface TenantSettings {
  name: string;
  primaryColor: string;
  whatsappNumber: string;
  phone: string;
  email: string;
  location: string;
  logoUrl: string;
  faviconUrl: string;
  description: string;
  footerText: string;
  currency: string;
  [key: string]: unknown;
}

export interface Meal {
  id: string;
  name: string;
  mealCategoryId: string;
  price: number;
  description: string | null;
  imageUrl: string | null;
  isActive: number;
  categoryName?: string;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  active: number;
  position: number;
}

export interface MealCategory {
  id: string;
  name: string;
  position: number;
}

export interface MealSchedule {
  id: string;
  tenantId: string;
  campId: string;
  campName: string;
  date: string;
  mealId: string;
  mealName: string;
  packageType: string;
  maxServings: number;
  createdAt: string;
}

