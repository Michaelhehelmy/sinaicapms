/**
 * OpenAPI 3.0 route registry — the single source of truth for the API contract.
 *
 * Middle-path design (T8): `@hono/zod-openapi`'s `createRoute` is used as the
 * DEFINITION layer only. Runtime dispatch (the wildcard catch-all in index.js and
 * the `(req, env, tenantId)` handlers) is intentionally UNCHANGED — handlers keep
 * receiving raw Requests, so the 852-test backend harness is untouched.
 *
 * - Requests: reuse the EXISTING zod schemas from each api module (T4/T5).
 * - Responses: schemas below mirror the ACTUAL wire output of `jsonResponse`/
 *   `cachedJsonResponse` = `JSON.stringify(toCamel(data))` — i.e. ALL keys are
 *   camelCase (e.g. `tenantId`, never `tenant_id`).
 * - `buildOpenApiDocument()` assembles the spec via `OpenApiGeneratorV3` (the same
 *   engine @hono/zod-openapi uses internally). Served at GET /api/openapi.json and
 *   serialized to backend/openapi.json by `npm run gen:openapi`.
 *
 * NOTE on zod versions: backend runs zod v3 (T4/T5 schema layer + tests depend on
 * it). @hono/zod-openapi@0.19.0 (peer zod 3.*) + @asteasolutions/zod-to-openapi@7.1.0
 * (peer zod ^3.20.2) are pinned accordingly — the zod v4 requirement of
 * @hono/zod-openapi 1.x is intentionally avoided.
 *
 * ─── SSE: GET /api/stream/orders (NOT in OpenAPI) ──────────────────────
 * Streaming response — intentionally excluded from the OpenAPI document (it is
 * not a JSON response). Contract:
 *   GET /api/stream/orders?tenantId=<id>
 *   Headers: `Authorization: Bearer <tenant-admin JWT>` (roles admin|super_admin;
 *            POS sessions and non-admin roles are rejected with 403).
 * The route opens a Server-Sent Events stream on the per-tenant Broadcaster
 * Durable Object (see backend/src/durable/broadcaster.js). Each event is a
 * single-line JSON object in an SSE `data:` field, framed by `\n\n`:
 *   Stream opens with:
 *     data: {"type":"connected"}
 *   A `: ping` comment line is sent every 25s as a keep-alive.
 *   The order-create path (POST /api/orders) pushes:
 *     data: {"type":"new-booking","orderId":"ord_...","campId":"c_...",
 *            "checkIn":"YYYY-MM-DD","checkOut":"YYYY-MM-DD"}
 * Clients use `EventSource` (or a fetch-based reader) and dispatch on the
 * `type` field. Errors are plain JSON envelopes (400/401/403/503) like the
 * rest of the API.
 */

import { createRoute, z } from '@hono/zod-openapi';
import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';

import {
  loginSchema,
  refreshSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from '../api/auth.js';
import { orderStatusSchema } from '../api/orders.js'; // single-key { status } — wire-identical, reused as-is
import { paymentIntentSchema, confirmPaymentSchema } from '../api/payments.js'; // already camelCase wire-identical (no toSnake in handler) — reused as-is

// ─── Shared response schemas (camelCase wire contract) ───────────────────────

export const userSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    role: z.string(),
    tenantId: z.string().nullable().optional(),
  })
  .openapi('User');

export const authSessionSchema = z
  .object({
    success: z.boolean(),
    token: z.string(),
    refreshToken: z.string(),
    user: userSchema,
  })
  .openapi('AuthSession');

export const authMeSchema = z.object({ user: userSchema }).openapi('AuthMe');

export const messageEnvelopeSchema = z
  .object({
    success: z.boolean(),
    message: z.string().optional(),
  })
  .openapi('MessageEnvelope');

export const errorEnvelopeSchema = z
  .object({
    success: z.boolean(),
    error: z.string(),
    errors: z
      .array(z.object({ field: z.string(), message: z.string() }))
      .optional(),
  })
  .openapi('ErrorEnvelope');

// Shared error responses for routes that use the T4 structured-error envelope.
export const errorResponses = (extra = {}) => ({
  400: { description: 'Bad request / validation error', content: { 'application/json': { schema: errorEnvelopeSchema } } },
  401: { description: 'Unauthorized', content: { 'application/json': { schema: errorEnvelopeSchema } } },
  404: { description: 'Not found', content: { 'application/json': { schema: errorEnvelopeSchema } } },
  500: { description: 'Internal server error', content: { 'application/json': { schema: errorEnvelopeSchema } } },
  ...extra,
});

// ─── Auth routes (8) ─────────────────────────────────────────────────────────

export const authRoutes = [
  createRoute({
    method: 'post',
    path: '/api/auth/login',
    tags: ['auth'],
    summary: 'Admin login (access + refresh tokens)',
    request: {
      body: { content: { 'application/json': { schema: loginSchema } } },
    },
    responses: {
      200: { description: 'Login successful', content: { 'application/json': { schema: authSessionSchema } } },
      ...errorResponses({ 409: { description: 'Conflict', content: { 'application/json': { schema: errorEnvelopeSchema } } } }),
    },
  }),
  createRoute({
    method: 'post',
    path: '/api/auth/refresh',
    tags: ['auth'],
    summary: 'Exchange a refresh token for a new access + refresh token pair (stateless re-issue)',
    request: {
      body: { content: { 'application/json': { schema: refreshSchema } } },
    },
    responses: {
      200: { description: 'New tokens issued', content: { 'application/json': { schema: authSessionSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'post',
    path: '/api/auth/logout',
    tags: ['auth'],
    summary: 'Logout (client-side token discard; stateless)',
    responses: {
      200: { description: 'Logged out', content: { 'application/json': { schema: messageEnvelopeSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'get',
    path: '/api/auth/me',
    tags: ['auth'],
    summary: 'Current admin profile (requires Bearer access token)',
    responses: {
      200: { description: 'Current user', content: { 'application/json': { schema: authMeSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'post',
    path: '/api/auth/register',
    tags: ['auth'],
    summary: 'Self-service staff registration (pending admin approval)',
    request: {
      body: { content: { 'application/json': { schema: registerSchema } } },
    },
    responses: {
      200: { description: 'Registration created (pending approval)', content: { 'application/json': { schema: z.object({ success: z.boolean(), message: z.string(), adminId: z.string() }).openapi('RegisterResponse') } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'post',
    path: '/api/auth/forgot-password',
    tags: ['auth'],
    summary: 'Request a password reset email (rate-limited per IP)',
    request: {
      body: { content: { 'application/json': { schema: forgotPasswordSchema } } },
    },
    responses: {
      200: { description: 'Reset email sent (if account exists)', content: { 'application/json': { schema: messageEnvelopeSchema } } },
      ...errorResponses({ 429: { description: 'Too many attempts', content: { 'application/json': { schema: errorEnvelopeSchema } } } }),
    },
  }),
  createRoute({
    method: 'post',
    path: '/api/auth/reset-password',
    tags: ['auth'],
    summary: 'Set a new password with a reset token',
    request: {
      body: { content: { 'application/json': { schema: resetPasswordSchema } } },
    },
    responses: {
      200: { description: 'Password reset', content: { 'application/json': { schema: messageEnvelopeSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'post',
    path: '/api/auth/change-password',
    tags: ['auth'],
    summary: 'Change the current admin password (requires Bearer access token)',
    request: {
      body: { content: { 'application/json': { schema: changePasswordSchema } } },
    },
    responses: {
      200: { description: 'Password changed', content: { 'application/json': { schema: messageEnvelopeSchema } } },
      ...errorResponses(),
    },
  }),
];

// ─── Marketplace core (T8-B1): camps / products / rooms / rateplans / orders / availability / reports ──
//
// Wire contract notes for these modules:
//  - REQUEST bodies: clients send camelCase; handlers run `toSnake()` before the
//    (snake_case) module zod schemas parse them. The request schemas below are the
//    camelCase wire mirrors of the module schemas (campPostSchema, etc.).
//  - QUERY/PATH params: NOT transformed (no toSnake/toCamel on URLs), so they stay
//    snake_case (`camp_id`, `check_in`, ...) exactly as the handlers read them.
//  - RESPONSES: camelCase via jsonResponse/cachedJsonResponse (toCamel).

const idResponseSchema = z
  .object({ id: z.string(), success: z.boolean() })
  .openapi('IdResponse');
const successResponseSchema = z
  .object({ success: z.boolean() })
  .openapi('SuccessResponse');

const paginatedEnvelope = (itemSchema, name) =>
  z
    .object({
      data: z.array(itemSchema),
      total: z.number(),
      page: z.number(),
      pageSize: z.number(),
      hasMore: z.boolean(),
    })
    .openapi(name);

// ── Camps ──────────────────────────────────────────────────────────────────────
// Wire rows: `SELECT * FROM camps` (+ tenant_name/tenant_subdomain on the
// marketplace cross-tenant query). Camps table has no created_at/updated_at.
const campSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    name: z.string(),
    location: z.string().nullable().optional(),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    capacity: z.number().nullable().optional(),
    status: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    tenantName: z.string().nullable().optional(), // marketplace cross-tenant only
    tenantSubdomain: z.string().nullable().optional(),
  })
  .openapi('Camp');

const campListSchema = z.array(campSchema).openapi('CampList');

const campPostRequestSchema = z
  .object({
    id: z.string().optional(),
    name: z.string(),
    location: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    capacity: z.number().optional(),
    status: z.enum(['active', 'inactive', 'completed']).optional(),
    notes: z.string().optional(),
  })
  .openapi('CampCreateRequest');

const campPutRequestSchema = z
  .object({
    name: z.string().optional(),
    location: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    capacity: z.number().optional(),
    status: z.enum(['active', 'inactive', 'completed']).optional(),
    notes: z.string().optional(),
  })
  .openapi('CampUpdateRequest');

// ── Products (Room Types) ───────────────────────────────────────────────────────
// Wire rows from handleProductsRoute's explicit mapping (reads pos_products,
// adds campIds from the product_camps junction).
const productSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    categoryId: z.string().nullable(),
    sku: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    shortDescription: z.string().nullable(),
    basePrice: z.number().nullable(),
    capacity: z.number().nullable(),
    imageUrl: z.string().nullable(),
    isActive: z.number().int(),
    createdAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
    campIds: z.array(z.string()),
  })
  .openapi('Product');

const productListSchema = z.array(productSchema).openapi('ProductList');

const productPostRequestSchema = z
  .object({
    id: z.string().optional(),
    name: z.string(),
    lang: z.string().optional(),
    capacity: z.number().optional(),
    basePrice: z.number().optional(),
    description: z.string().optional(),
    shortDescription: z.string().optional(),
    metaTitle: z.string().optional(),
    metaDescription: z.string().optional(),
    linkRewrite: z.string().optional(),
    imageUrl: z.string().optional(),
    categoryId: z.string().optional(),
    sku: z.string().optional(),
    isActive: z.number().optional(),
    campIds: z.array(z.string()).optional(),
  })
  .openapi('ProductCreateRequest');

const productPutRequestSchema = productPostRequestSchema.partial().openapi('ProductUpdateRequest');

// ── Rooms ───────────────────────────────────────────────────────────────────────
// Wire rows: `SELECT r.* FROM rooms_new r ...`.
const roomSchema = z
  .object({
    id: z.string(),
    campId: z.string(),
    productId: z.string(),
    name: z.string(),
    status: z.string(),
    bedType: z.string().nullable(),
    maxGuests: z.number().int(),
    basePrice: z.number().nullable(),
    floor: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    isActive: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string().nullable(),
  })
  .openapi('Room');

const roomListSchema = z.array(roomSchema).openapi('RoomList');

const roomPostRequestSchema = z
  .object({
    id: z.string().optional(),
    campId: z.string(),
    productId: z.string(),
    name: z.string(),
    floor: z.union([z.string(), z.number()]).optional(),
    status: z.string().optional(),
    bedType: z.string().optional(),
    maxGuests: z.number().optional(),
    basePrice: z.number().optional(),
    notes: z.string().optional(),
    isActive: z.number().optional(),
  })
  .openapi('RoomCreateRequest');

const roomPutRequestSchema = roomPostRequestSchema.partial().openapi('RoomUpdateRequest');

// ── Rate plans ──────────────────────────────────────────────────────────────────
// Wire rows: `SELECT * FROM rate_plans_new`.
const ratePlanSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    productId: z.string(),
    name: z.string(),
    season: z.string(),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    pricePerNight: z.number(),
    minStay: z.number().int(),
    isActive: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string().nullable(),
  })
  .openapi('RatePlan');

const ratePlanListSchema = z.array(ratePlanSchema).openapi('RatePlanList');

const ratePlanPostRequestSchema = z
  .object({
    id: z.string().optional(),
    productId: z.string(),
    name: z.string(),
    pricePerNight: z.number().positive(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    season: z.string().optional(),
    minStay: z.number().optional(),
    isActive: z.number().optional(),
  })
  .openapi('RatePlanCreateRequest');

const ratePlanPutRequestSchema = ratePlanPostRequestSchema.partial().openapi('RatePlanUpdateRequest');

// ── Price overrides (per-product, per-night) ───────────────────────────────────
// Wire rows: `SELECT po.id, po.product_id, po.date, po.price, po.updated_at
// FROM price_overrides po JOIN pos_products p ...` (toCamel => camelCase keys).
const priceOverrideSchema = z
  .object({
    id: z.number(),
    productId: z.string(),
    date: z.string(),
    price: z.number().int(),
    updatedAt: z.string().nullable(),
  })
  .openapi('PriceOverride');

const priceOverrideListSchema = z
  .object({ overrides: z.array(priceOverrideSchema) })
  .openapi('PriceOverrideList');

const priceOverrideItemSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    price: z.number().int().min(0).nullable(),
  })
  .openapi('PriceOverrideItem');

const priceOverridePutRequestSchema = z
  .object({
    productId: z.string(),
    overrides: z.array(priceOverrideItemSchema),
  })
  .openapi('PriceOverridePutRequest');

const priceOverridePutResponseSchema = z
  .object({
    success: z.boolean(),
    productId: z.string(),
    count: z.number().int(),
  })
  .openapi('PriceOverridePutResponse');

// ── Orders ──────────────────────────────────────────────────────────────────────
const orderPostRequestSchema = z
  .object({
    id: z.string().optional(),
    guestName: z.string().optional(),
    guestEmail: z.string().optional(),
    guestPhone: z.string().optional(),
    campId: z.string(),
    roomId: z.string(),
    numberOfPeople: z.number().optional(),
    checkInDate: z.string(),
    checkOutDate: z.string(),
    totalAmount: z.number().optional(),
    amountPaid: z.number().optional(),
    paymentMethod: z.string().optional(),
    paymentStatus: z.string().optional(),
    orderStateId: z.string().optional(),
    notes: z.string().optional(),
  })
  .openapi('OrderCreateRequest');

const orderPutRequestSchema = orderPostRequestSchema
  .partial()
  .openapi('OrderUpdateRequest');

const orderCreateResponseSchema = z
  .object({
    id: z.string(),
    reference: z.string(),
    success: z.boolean(),
    customerId: z.string().nullable(),
  })
  .openapi('OrderCreateResponse');

const orderStatusUpdateResponseSchema = z
  .object({ success: z.boolean(), id: z.string(), status: z.string() })
  .openapi('OrderStatusUpdateResponse');

const bulkDeleteResponseSchema = z
  .object({ success: z.boolean(), deleted: z.array(z.string()) })
  .openapi('BulkDeleteResponse');

const priceEnvelopeSchema = z.object({ totalPrice: z.number() }).openapi('PriceEnvelope');

// GET /api/orders/status/:ref — public status lookup by reference code.
const orderStatusResponseSchema = z
  .object({
    reference: z.string(),
    guestName: z.string().nullable(),
    checkInDate: z.string().nullable(),
    checkOutDate: z.string().nullable(),
    totalAmount: z.number().nullable(),
    amountPaid: z.number().nullable(),
    paymentStatus: z.string().nullable(),
    paymentMethod: z.string().nullable(),
    status: z.string().nullable(),
    roomName: z.string().nullable(),
  })
  .openapi('OrderStatus');

// GET /api/orders (list) — one row per order from the paginated query.
const orderListRowSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    campId: z.string(),
    roomId: z.string(),
    customerId: z.string().nullable(),
    orderStateId: z.string(),
    checkInDate: z.string(),
    checkOutDate: z.string(),
    numberOfPeople: z.number().int(),
    totalAmount: z.number(),
    amountPaid: z.number(),
    paymentStatus: z.string(),
    reference: z.string(),
    createdAt: z.string(),
    customerFirstName: z.string().nullable(),
    customerLastName: z.string().nullable(),
    roomName: z.string().nullable(),
    stateName: z.string().nullable(),
  })
  .openapi('Order');

const paginatedOrdersSchema = paginatedEnvelope(orderListRowSchema, 'PaginatedOrders');

// GET /api/orders/:id — detail row (adds payment_method, notes, customer email/phone).
const orderDetailSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    campId: z.string(),
    roomId: z.string(),
    customerId: z.string().nullable(),
    orderStateId: z.string(),
    checkInDate: z.string(),
    checkOutDate: z.string(),
    numberOfPeople: z.number().int(),
    totalAmount: z.number(),
    amountPaid: z.number(),
    paymentMethod: z.string().nullable(),
    paymentStatus: z.string(),
    reference: z.string(),
    notes: z.string().nullable(),
    createdAt: z.string(),
    customerFirstName: z.string().nullable(),
    customerLastName: z.string().nullable(),
    customerEmail: z.string().nullable(),
    customerPhone: z.string().nullable(),
    roomName: z.string().nullable(),
    stateName: z.string().nullable(),
  })
  .openapi('OrderDetail');

// ── Availability ─────────────────────────────────────────────────────────────────
const availabilityResponseSchema = z
  .union([
    // With ?product_id=... → single-product shape
    z.object({
      available: z.boolean(),
      availableCount: z.number().int(),
      rooms: z.array(z.object({ id: z.string(), name: z.string() })),
    }),
    // Without product_id → per-product map
    z.object({
      availability: z.array(
        z.object({
          productId: z.string(),
          availableCount: z.number().int(),
          rooms: z.array(z.object({ id: z.string(), name: z.string() })),
        }),
      ),
    }),
  ])
  .openapi('AvailabilityResponse');

// ── Reports ──────────────────────────────────────────────────────────────────────
const occupancyReportSchema = z
  .object({ totalRooms: z.number(), occupiedRooms: z.number(), occupancyRate: z.number() })
  .openapi('OccupancyReport');

const revenueReportSchema = z
  .object({
    start: z.string(),
    end: z.string(),
    summary: z.object({
      totalRevenue: z.number(),
      totalCollected: z.number(),
      totalOutstanding: z.number(),
      totalOrders: z.number(),
    }),
    details: z.array(z.object({ date: z.string(), total: z.number(), count: z.number() })),
  })
  .openapi('RevenueReport');

const bookingsReportSchema = z
  .object({
    start: z.string(),
    end: z.string(),
    byState: z.array(z.object({ state: z.string(), count: z.number() })),
    byCamp: z.array(z.object({ campName: z.string(), count: z.number(), revenue: z.number() })),
  })
  .openapi('BookingsReport');

// ── Marketplace route definitions (30) ───────────────────────────────────────────

export const marketplaceRoutes = [
  // Camps (5)
  createRoute({
    method: 'get',
    path: '/api/camps',
    tags: ['camps'],
    summary: 'List camps (public GET; optional legacy limit/offset → plain array)',
    request: { query: z.object({ limit: z.string().optional(), offset: z.string().optional() }) },
    responses: {
      200: { description: 'Camps', content: { 'application/json': { schema: campListSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'get',
    path: '/api/camps/{id}',
    tags: ['camps'],
    summary: 'Get a single camp',
    responses: {
      200: { description: 'Camp', content: { 'application/json': { schema: campSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'post',
    path: '/api/camps',
    tags: ['camps'],
    summary: 'Create a camp (auth + tenant scoped)',
    request: { body: { content: { 'application/json': { schema: campPostRequestSchema } } } },
    responses: {
      200: { description: 'Created', content: { 'application/json': { schema: idResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'put',
    path: '/api/camps/{id}',
    tags: ['camps'],
    summary: 'Update a camp',
    request: { body: { content: { 'application/json': { schema: campPutRequestSchema } } } },
    responses: {
      200: { description: 'Updated', content: { 'application/json': { schema: successResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'delete',
    path: '/api/camps/{id}',
    tags: ['camps'],
    summary: 'Delete a camp (cascades rooms/rate plans/orders)',
    responses: {
      200: { description: 'Deleted', content: { 'application/json': { schema: successResponseSchema } } },
      ...errorResponses(),
    },
  }),

  // Products (4)
  createRoute({
    method: 'get',
    path: '/api/products',
    tags: ['products'],
    summary: 'List products / room types (public GET)',
    responses: {
      200: { description: 'Products', content: { 'application/json': { schema: productListSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'post',
    path: '/api/products',
    tags: ['products'],
    summary: 'Create a product (auth + tenant scoped)',
    request: { body: { content: { 'application/json': { schema: productPostRequestSchema } } } },
    responses: {
      200: { description: 'Created', content: { 'application/json': { schema: idResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'put',
    path: '/api/products/{id}',
    tags: ['products'],
    summary: 'Update a product',
    request: { body: { content: { 'application/json': { schema: productPutRequestSchema } } } },
    responses: {
      200: { description: 'Updated', content: { 'application/json': { schema: successResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'delete',
    path: '/api/products/{id}',
    tags: ['products'],
    summary: 'Delete a product (400 if linked to rooms or rate plans)',
    responses: {
      200: { description: 'Deleted', content: { 'application/json': { schema: successResponseSchema } } },
      ...errorResponses(),
    },
  }),

  // Rooms (4)
  createRoute({
    method: 'get',
    path: '/api/rooms',
    tags: ['rooms'],
    summary: 'List rooms (public GET; optional camp_id / floor filters)',
    request: { query: z.object({ campId: z.string().optional(), floor: z.string().optional() }) },
    responses: {
      200: { description: 'Rooms', content: { 'application/json': { schema: roomListSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'post',
    path: '/api/rooms',
    tags: ['rooms'],
    summary: 'Create a room (auth + tenant scoped)',
    request: { body: { content: { 'application/json': { schema: roomPostRequestSchema } } } },
    responses: {
      200: { description: 'Created', content: { 'application/json': { schema: idResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'put',
    path: '/api/rooms/{id}',
    tags: ['rooms'],
    summary: 'Update a room',
    request: { body: { content: { 'application/json': { schema: roomPutRequestSchema } } } },
    responses: {
      200: { description: 'Updated', content: { 'application/json': { schema: successResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'delete',
    path: '/api/rooms/{id}',
    tags: ['rooms'],
    summary: 'Delete a room (400 if it has orders)',
    responses: {
      200: { description: 'Deleted', content: { 'application/json': { schema: successResponseSchema } } },
      ...errorResponses(),
    },
  }),

  // Rate plans (4)
  createRoute({
    method: 'get',
    path: '/api/rateplans',
    tags: ['rateplans'],
    summary: 'List rate plans (public GET)',
    responses: {
      200: { description: 'Rate plans', content: { 'application/json': { schema: ratePlanListSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'post',
    path: '/api/rateplans',
    tags: ['rateplans'],
    summary: 'Create a rate plan (auth + tenant scoped)',
    request: { body: { content: { 'application/json': { schema: ratePlanPostRequestSchema } } } },
    responses: {
      200: { description: 'Created', content: { 'application/json': { schema: idResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'put',
    path: '/api/rateplans/{id}',
    tags: ['rateplans'],
    summary: 'Update a rate plan',
    request: { body: { content: { 'application/json': { schema: ratePlanPutRequestSchema } } } },
    responses: {
      200: { description: 'Updated', content: { 'application/json': { schema: successResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'delete',
    path: '/api/rateplans/{id}',
    tags: ['rateplans'],
    summary: 'Delete a rate plan (400 if active orders reference its product)',
    responses: {
      200: { description: 'Deleted', content: { 'application/json': { schema: successResponseSchema } } },
      ...errorResponses(),
    },
  }),

  // Price overrides (3) — per-product, per-night overrides (auth + tenant scoped)
  createRoute({
    method: 'get',
    path: '/api/price-overrides',
    tags: ['priceoverrides'],
    summary: 'List price overrides for a product (auth + tenant scoped; optional from/to filter)',
    request: {
      query: z.object({
        productId: z.string(),
        from: z.string().optional(),
        to: z.string().optional(),
      }),
    },
    responses: {
      200: { description: 'Price overrides', content: { 'application/json': { schema: priceOverrideListSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'put',
    path: '/api/price-overrides',
    tags: ['priceoverrides'],
    summary: 'Bulk upsert price overrides for a product (null price deletes that date)',
    request: { body: { content: { 'application/json': { schema: priceOverridePutRequestSchema } } } },
    responses: {
      200: { description: 'Saved', content: { 'application/json': { schema: priceOverridePutResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'delete',
    path: '/api/price-overrides',
    tags: ['priceoverrides'],
    summary: 'Delete a single price override by product + date',
    request: {
      query: z.object({
        productId: z.string(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    },
    responses: {
      200: { description: 'Deleted', content: { 'application/json': { schema: successResponseSchema } } },
      ...errorResponses(),
    },
  }),

  // Orders (9)
  createRoute({
    method: 'get',
    path: '/api/orders',
    tags: ['orders'],
    summary: 'List orders (paginated; optional status filter)',
    request: { query: z.object({ status: z.string().optional(), page: z.string().optional(), pageSize: z.string().optional() }) },
    responses: {
      200: { description: 'Paginated orders', content: { 'application/json': { schema: paginatedOrdersSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'get',
    path: '/api/orders/{id}',
    tags: ['orders'],
    summary: 'Get a single order',
    responses: {
      200: { description: 'Order', content: { 'application/json': { schema: orderDetailSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'post',
    path: '/api/orders',
    tags: ['orders'],
    summary: 'Create an order (public POST)',
    request: { body: { content: { 'application/json': { schema: orderPostRequestSchema } } } },
    responses: {
      200: { description: 'Created', content: { 'application/json': { schema: orderCreateResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'put',
    path: '/api/orders/{id}',
    tags: ['orders'],
    summary: 'Update an order (auth + tenant scoped)',
    request: { body: { content: { 'application/json': { schema: orderPutRequestSchema } } } },
    responses: {
      200: { description: 'Updated', content: { 'application/json': { schema: successResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'delete',
    path: '/api/orders/{id}',
    tags: ['orders'],
    summary: 'Delete an order (frees the room when no other active orders remain)',
    responses: {
      200: { description: 'Deleted', content: { 'application/json': { schema: successResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'patch',
    path: '/api/orders/{id}/status',
    tags: ['orders'],
    summary: 'Set an order status (order_state id) — T5 dedicated route',
    request: { body: { content: { 'application/json': { schema: orderStatusSchema } } } },
    responses: {
      200: { description: 'Status updated', content: { 'application/json': { schema: orderStatusUpdateResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'post',
    path: '/api/orders/bulk-delete',
    tags: ['orders'],
    summary: 'Delete multiple orders by id (auth + tenant scoped)',
    request: { body: { content: { 'application/json': { schema: z.object({ ids: z.array(z.string()) }).openapi('BulkDeleteRequest') } } } },
    responses: {
      200: { description: 'Deleted', content: { 'application/json': { schema: bulkDeleteResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'get',
    path: '/api/orders/calculate-price',
    tags: ['orders'],
    summary: 'Server-side price calculation for a room + date range (public GET)',
    request: { query: z.object({ roomId: z.string(), checkIn: z.string(), checkOut: z.string() }) },
    responses: {
      200: { description: 'Calculated total', content: { 'application/json': { schema: priceEnvelopeSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'get',
    path: '/api/orders/status/{ref}',
    tags: ['orders'],
    summary: 'Public order status lookup by reference code',
    responses: {
      200: { description: 'Order status', content: { 'application/json': { schema: orderStatusResponseSchema } } },
      ...errorResponses(),
    },
  }),

  // Availability (1 — response shape depends on ?product_id)
  createRoute({
    method: 'get',
    path: '/api/availability',
    tags: ['availability'],
    summary: 'Check room availability for a date range (public GET; optional productId filter)',
    request: { query: z.object({ checkIn: z.string(), checkOut: z.string(), productId: z.string().optional() }) },
    responses: {
      200: { description: 'Availability (by-product when ?product_id given, else full map)', content: { 'application/json': { schema: availabilityResponseSchema } } },
      ...errorResponses(),
    },
  }),

  // Reports (3)
  createRoute({
    method: 'get',
    path: '/api/reports/occupancy',
    tags: ['reports'],
    summary: 'Occupancy report (auth + tenant scoped)',
    responses: {
      200: { description: 'Occupancy', content: { 'application/json': { schema: occupancyReportSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'get',
    path: '/api/reports/revenue',
    tags: ['reports'],
    summary: 'Revenue report (auth + tenant scoped; start/end or days)',
    request: { query: z.object({ start: z.string().optional(), end: z.string().optional(), days: z.string().optional() }) },
    responses: {
      200: { description: 'Revenue', content: { 'application/json': { schema: revenueReportSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'get',
    path: '/api/reports/bookings',
    tags: ['reports'],
    summary: 'Bookings report (auth + tenant scoped; start/end or days)',
    request: { query: z.object({ start: z.string().optional(), end: z.string().optional(), days: z.string().optional() }) },
    responses: {
      200: { description: 'Bookings', content: { 'application/json': { schema: bookingsReportSchema } } },
      ...errorResponses(),
    },
  }),
];

// ─── Menu modules (T8-B2): meals / categories / meal-categories / meal-schedules ──
//
// Wire contract notes:
//  - REQUEST bodies: camelCase clients → toSnake → module snake_case zod schemas.
//  - QUERY params: NOT transformed (`camp_id`, `date_from`, `date_to`, ...).
//  - RESPONSES: camelCase (jsonResponse toCamel).
//  - Public: GET /api/meals*, /api/categories*, /api/meal-categories*. Everything
//    else (incl. ALL /api/meal-schedules*) is auth + tenant scoped.

const mealSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    mealCategoryId: z.string().nullable(),
    price: z.number(),
    imageUrl: z.string().nullable(),
    isActive: z.number().int(),
    createdAt: z.string(),
    name: z.string().nullable(), // meal_lang.en join (NULL if no lang row)
    description: z.string().nullable(),
    categoryId: z.string().nullable(),
    categoryName: z.string().nullable(),
  })
  .openapi('Meal');

const mealListSchema = z.array(mealSchema).openapi('MealList');

const mealPostRequestSchema = z
  .object({
    id: z.string().optional(),
    name: z.string(),
    mealCategoryId: z.string().optional(),
    price: z.number().min(0),
    description: z.string().optional(),
    imageUrl: z.string().optional(),
    isActive: z.number().optional(),
  })
  .openapi('MealCreateRequest');

const mealPutRequestSchema = mealPostRequestSchema.partial().openapi('MealUpdateRequest');

const categorySchema = z
  .object({
    id: z.string(),
    parentId: z.string().nullable(),
    active: z.number().int(),
    position: z.number().int(),
    createdAt: z.string(),
    tenantId: z.string().nullable(), // NULL = global category
    name: z.string().nullable(),
    description: z.string().nullable(),
    linkRewrite: z.string().nullable(),
  })
  .openapi('Category');

const categoryListSchema = z.array(categorySchema).openapi('CategoryList');

const categoryDetailSchema = categorySchema
  .extend({
    metaTitle: z.string().nullable().optional(),
    metaDescription: z.string().nullable().optional(),
  })
  .openapi('CategoryDetail');

const categoryPostRequestSchema = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    parentId: z.string().optional(),
    active: z.number().optional(),
    position: z.number().optional(),
  })
  .openapi('CategoryCreateRequest');

const categoryPutRequestSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    parentId: z.string().optional(),
    active: z.number().optional(),
    position: z.number().optional(),
  })
  .openapi('CategoryUpdateRequest');

const mealCategorySchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    position: z.number().int(),
    createdAt: z.string(),
    name: z.string().nullable(),
  })
  .openapi('MealCategory');

const mealCategoryListSchema = z.array(mealCategorySchema).openapi('MealCategoryList');

const mealCategoryPostRequestSchema = z
  .object({ name: z.string(), position: z.number().optional() })
  .openapi('MealCategoryCreateRequest');

const mealCategoryPutRequestSchema = z
  .object({ name: z.string().optional(), position: z.number().optional() })
  .openapi('MealCategoryUpdateRequest');

const mealScheduleSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    campId: z.string(),
    campName: z.string().nullable(),
    date: z.string(),
    mealId: z.string(),
    mealName: z.string().nullable(),
    packageType: z.string(),
    maxServings: z.number().int(),
    createdAt: z.string(),
  })
  .openapi('MealSchedule');

const mealScheduleListSchema = z.array(mealScheduleSchema).openapi('MealScheduleList');

const schedulePostRequestSchema = z
  .object({
    campId: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
    mealId: z.string(),
    packageType: z.enum(['all', 'full_board', 'half_board']).optional(),
    maxServings: z.number().int().min(0).optional(),
  })
  .openapi('MealScheduleCreateRequest');

// ── Menu route definitions (18) ─────────────────────────────────────────────────

export const menuRoutes = [
  // Meals (5)
  createRoute({
    method: 'get',
    path: '/api/meals',
    tags: ['meals'],
    summary: 'List meals (public GET)',
    responses: {
      200: { description: 'Meals', content: { 'application/json': { schema: mealListSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'get',
    path: '/api/meals/{id}',
    tags: ['meals'],
    summary: 'Get a single meal (public GET)',
    responses: {
      200: { description: 'Meal', content: { 'application/json': { schema: mealSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'post',
    path: '/api/meals',
    tags: ['meals'],
    summary: 'Create a meal (auth + tenant scoped)',
    request: { body: { content: { 'application/json': { schema: mealPostRequestSchema } } } },
    responses: {
      200: { description: 'Created', content: { 'application/json': { schema: idResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'put',
    path: '/api/meals/{id}',
    tags: ['meals'],
    summary: 'Update a meal (auth + tenant scoped)',
    request: { body: { content: { 'application/json': { schema: mealPutRequestSchema } } } },
    responses: {
      200: { description: 'Updated', content: { 'application/json': { schema: successResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'delete',
    path: '/api/meals/{id}',
    tags: ['meals'],
    summary: 'Delete a meal (auth + tenant scoped)',
    responses: {
      200: { description: 'Deleted', content: { 'application/json': { schema: successResponseSchema } } },
      ...errorResponses(),
    },
  }),

  // Categories (5)
  createRoute({
    method: 'get',
    path: '/api/categories',
    tags: ['categories'],
    summary: 'List categories (public GET; global + tenant-scoped)',
    responses: {
      200: { description: 'Categories', content: { 'application/json': { schema: categoryListSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'get',
    path: '/api/categories/{id}',
    tags: ['categories'],
    summary: 'Get a single category (public GET)',
    responses: {
      200: { description: 'Category', content: { 'application/json': { schema: categoryDetailSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'post',
    path: '/api/categories',
    tags: ['categories'],
    summary: 'Create a category (auth + tenant scoped)',
    request: { body: { content: { 'application/json': { schema: categoryPostRequestSchema } } } },
    responses: {
      200: { description: 'Created', content: { 'application/json': { schema: idResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'put',
    path: '/api/categories/{id}',
    tags: ['categories'],
    summary: 'Update a category (own or global)',
    request: { body: { content: { 'application/json': { schema: categoryPutRequestSchema } } } },
    responses: {
      200: { description: 'Updated', content: { 'application/json': { schema: successResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'delete',
    path: '/api/categories/{id}',
    tags: ['categories'],
    summary: 'Delete a category (400 if linked to products; global categories cannot be deleted)',
    responses: {
      200: { description: 'Deleted', content: { 'application/json': { schema: successResponseSchema } } },
      ...errorResponses(),
    },
  }),

  // Meal categories (5)
  createRoute({
    method: 'get',
    path: '/api/meal-categories',
    tags: ['mealCategories'],
    summary: 'List meal categories (public GET)',
    responses: {
      200: { description: 'Meal categories', content: { 'application/json': { schema: mealCategoryListSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'get',
    path: '/api/meal-categories/{id}',
    tags: ['mealCategories'],
    summary: 'Get a single meal category (public GET)',
    responses: {
      200: { description: 'Meal category', content: { 'application/json': { schema: mealCategorySchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'post',
    path: '/api/meal-categories',
    tags: ['mealCategories'],
    summary: 'Create a meal category (auth + tenant scoped)',
    request: { body: { content: { 'application/json': { schema: mealCategoryPostRequestSchema } } } },
    responses: {
      200: { description: 'Created', content: { 'application/json': { schema: idResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'put',
    path: '/api/meal-categories/{id}',
    tags: ['mealCategories'],
    summary: 'Update a meal category (auth + tenant scoped)',
    request: { body: { content: { 'application/json': { schema: mealCategoryPutRequestSchema } } } },
    responses: {
      200: { description: 'Updated', content: { 'application/json': { schema: successResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'delete',
    path: '/api/meal-categories/{id}',
    tags: ['mealCategories'],
    summary: 'Delete a meal category (auth + tenant scoped)',
    responses: {
      200: { description: 'Deleted', content: { 'application/json': { schema: successResponseSchema } } },
      ...errorResponses(),
    },
  }),

  // Meal schedules (3 — no PUT branch in handler)
  createRoute({
    method: 'get',
    path: '/api/meal-schedules',
    tags: ['mealSchedules'],
    summary: 'List meal schedules (auth + tenant scoped; optional camp_id / date_from / date_to filters)',
    request: { query: z.object({ campId: z.string().optional(), dateFrom: z.string().optional(), dateTo: z.string().optional() }) },
    responses: {
      200: { description: 'Meal schedules', content: { 'application/json': { schema: mealScheduleListSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'post',
    path: '/api/meal-schedules',
    tags: ['mealSchedules'],
    summary: 'Create a meal schedule (auth + tenant scoped)',
    request: { body: { content: { 'application/json': { schema: schedulePostRequestSchema } } } },
    responses: {
      200: { description: 'Created', content: { 'application/json': { schema: idResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'delete',
    path: '/api/meal-schedules/{id}',
    tags: ['mealSchedules'],
    summary: 'Delete a meal schedule (auth + tenant scoped)',
    responses: {
      200: { description: 'Deleted', content: { 'application/json': { schema: successResponseSchema } } },
      ...errorResponses(),
    },
  }),
];

// ─── Tenants + /api/me (T8-B3) ─────────────────────────────────────────────────
// Wire contract: public GETs return the `selectFieldsPublic()` projection (incl.
// menu_config); super-admin GETs additionally add admin_email/admin_name (modelled
// as optional adminEmail/adminName). POST /api/tenants is SUPER-ADMIN ONLY (P0-7);
// PUT /api/me is auth + tenant scoped.
const tenantSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    subdomain: z.string(),
    customDomain: z.string().nullable().optional(),
    logoUrl: z.string().nullable().optional(),
    faviconUrl: z.string().nullable().optional(),
    primaryColor: z.string().nullable().optional(),
    footerText: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    whatsappNumber: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    heroImageUrl: z.string().nullable().optional(),
    galleryImages: z.string().nullable().optional(),
    aboutText: z.string().nullable().optional(),
    faqItems: z.string().nullable().optional(),
    reviews: z.string().nullable().optional(),
    mapEmbedUrl: z.string().nullable().optional(),
    activities: z.string().nullable().optional(),
    capacity: z.number().optional(),
    currency: z.string().optional(),
    status: z.string().optional(),
    menuConfig: z.any().optional(),
    adminEmail: z.string().nullable().optional(), // super-admin GET only
    adminName: z.string().nullable().optional(), // super-admin GET only
  })
  .openapi('Tenant');

const tenantListSchema = z.array(tenantSchema).openapi('TenantList');

const tenantPostRequestSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(1, 'Name is required'),
    subdomain: z.string().min(1, 'Subdomain is required'),
    customDomain: z.string().optional(),
    logoUrl: z.string().optional(),
    faviconUrl: z.string().optional(),
    primaryColor: z.string().optional(),
    footerText: z.string().optional(),
    location: z.string().optional(),
    whatsappNumber: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    description: z.string().optional(),
    heroImageUrl: z.string().optional(),
    galleryImages: z.string().optional(),
    aboutText: z.string().optional(),
    faqItems: z.string().optional(),
    reviews: z.string().optional(),
    mapEmbedUrl: z.string().optional(),
    activities: z.string().optional(),
    capacity: z.number().optional(),
    currency: z.string().optional(),
    adminEmail: z.string().optional(),
    adminFirstName: z.string().optional(),
    adminLastName: z.string().optional(),
    adminPassword: z.string().min(1, 'Admin password is required'),
  })
  .openapi('TenantCreateRequest');

const tenantCreateResponseSchema = z
  .object({ id: z.string(), name: z.string(), subdomain: z.string(), success: z.boolean() })
  .openapi('TenantCreateResponse');

const tenantMePutRequestSchema = z
  .object({
    name: z.string().optional(),
    logoUrl: z.string().optional(),
    faviconUrl: z.string().optional(),
    primaryColor: z.string().optional(),
    footerText: z.string().optional(),
    location: z.string().optional(),
    whatsappNumber: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    description: z.string().optional(),
    heroImageUrl: z.string().optional(),
    galleryImages: z.string().optional(),
    aboutText: z.string().optional(),
    faqItems: z.string().optional(),
    reviews: z.string().optional(),
    mapEmbedUrl: z.string().optional(),
    activities: z.string().optional(),
    capacity: z.number().optional(),
    currency: z.string().optional(),
    adminEmail: z.string().optional(),
    adminFirstName: z.string().optional(),
    adminLastName: z.string().optional(),
    adminPassword: z.string().optional(),
    adminId: z.string().optional(),
  })
  .openapi('TenantMeUpdateRequest');

// GET /api/me — no-tenant graceful shape (nullable id/name/subdomain + message)
// OR full tenant row + hasMeals count.
const meSchema = z
  .object({
    id: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    subdomain: z.string().nullable().optional(),
    message: z.string().optional(),
    customDomain: z.string().nullable().optional(),
    logoUrl: z.string().nullable().optional(),
    faviconUrl: z.string().nullable().optional(),
    primaryColor: z.string().nullable().optional(),
    footerText: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    whatsappNumber: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    heroImageUrl: z.string().nullable().optional(),
    galleryImages: z.string().nullable().optional(),
    aboutText: z.string().nullable().optional(),
    faqItems: z.string().nullable().optional(),
    reviews: z.string().nullable().optional(),
    mapEmbedUrl: z.string().nullable().optional(),
    activities: z.string().nullable().optional(),
    capacity: z.number().optional(),
    currency: z.string().optional(),
    status: z.string().optional(),
    menuConfig: z.any().optional(),
    hasMeals: z.number().optional(),
  })
  .openapi('Me');

export const tenantRoutes = [
  createRoute({
    method: 'get',
    path: '/api/tenants',
    tags: ['tenants'],
    summary: 'List tenants (public marketplace; super-admin sees all with admin info)',
    request: {
      query: z.object({
        search: z.string().optional(),
        location: z.string().optional(),
        capacity: z.string().optional(),
        activities: z.string().optional(),
        status: z.string().optional(),
      }),
    },
    responses: {
      200: { description: 'Tenants', content: { 'application/json': { schema: tenantListSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'post',
    path: '/api/tenants',
    tags: ['tenants'],
    summary: 'Create a tenant + default admin (SUPER ADMIN ONLY — P0-7)',
    request: { body: { content: { 'application/json': { schema: tenantPostRequestSchema } } } },
    responses: {
      200: { description: 'Created', content: { 'application/json': { schema: tenantCreateResponseSchema } } },
      ...errorResponses({ 403: { description: 'Forbidden', content: { 'application/json': { schema: errorEnvelopeSchema } } } }),
    },
  }),
  createRoute({
    method: 'get',
    path: '/api/tenants/{id}',
    tags: ['tenants'],
    summary: 'Get a tenant by id, subdomain, or custom domain (public)',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: { description: 'Tenant', content: { 'application/json': { schema: tenantSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'get',
    path: '/api/me',
    tags: ['tenants'],
    summary: 'Current tenant context (public; graceful when no tenant)',
    responses: {
      200: { description: 'Tenant context', content: { 'application/json': { schema: meSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'put',
    path: '/api/me',
    tags: ['tenants'],
    summary: 'Update the current tenant (auth + tenant scoped)',
    request: { body: { content: { 'application/json': { schema: tenantMePutRequestSchema } } } },
    responses: {
      200: { description: 'Updated', content: { 'application/json': { schema: successResponseSchema } } },
      ...errorResponses(),
    },
  }),
];

// ─── Plans (T8-B3): plans_new via camps tenant scoping ─────────────────────────
const planSchema = z
  .object({
    id: z.string(),
    campId: z.string(),
    name: z.string(),
    description: z.string().nullable().optional(),
    date: z.string().nullable().optional(),
    time: z.string().nullable().optional(),
    capacity: z.number().nullable().optional(),
    status: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    createdAt: z.string().nullable().optional(),
  })
  .openapi('Plan');

const planListSchema = z.array(planSchema).openapi('PlanList');

const planPostRequestSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(1, 'Name is required'),
    description: z.string().optional(),
    campId: z.string().min(1, 'Camp ID is required'),
    date: z.string().optional(),
    time: z.string().optional(),
    capacity: z.number().min(1).optional(),
    status: z.string().optional(),
    category: z.string().optional(),
  })
  .openapi('PlanCreateRequest');

const planPutRequestSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    campId: z.string().optional(),
    date: z.string().optional(),
    time: z.string().optional(),
    capacity: z.number().min(1).optional(),
    status: z.string().optional(),
    category: z.string().optional(),
  })
  .openapi('PlanUpdateRequest');

export const planRoutes = [
  createRoute({
    method: 'get',
    path: '/api/plans',
    tags: ['plans'],
    summary: 'List plans for the current tenant (auth + tenant scoped)',
    responses: {
      200: { description: 'Plans', content: { 'application/json': { schema: planListSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'get',
    path: '/api/plans/{id}',
    tags: ['plans'],
    summary: 'Get a single plan (auth + tenant scoped)',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: { description: 'Plan', content: { 'application/json': { schema: planSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'post',
    path: '/api/plans',
    tags: ['plans'],
    summary: 'Create a plan for a tenant camp (auth + tenant scoped)',
    request: { body: { content: { 'application/json': { schema: planPostRequestSchema } } } },
    responses: {
      200: { description: 'Created', content: { 'application/json': { schema: idResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'put',
    path: '/api/plans/{id}',
    tags: ['plans'],
    summary: 'Update a plan (auth + tenant scoped)',
    request: { body: { content: { 'application/json': { schema: planPutRequestSchema } } }, params: z.object({ id: z.string() }) },
    responses: {
      200: { description: 'Updated', content: { 'application/json': { schema: successResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'delete',
    path: '/api/plans/{id}',
    tags: ['plans'],
    summary: 'Delete a plan (auth + tenant scoped)',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: { description: 'Deleted', content: { 'application/json': { schema: successResponseSchema } } },
      ...errorResponses(),
    },
  }),
];

// ─── Leads + /api/contact (T8-B3) ──────────────────────────────────────────────
// Note: the handler implements NO GET /api/leads/:id branch (404) — only the
// paginated GET list, POST, PUT (status), DELETE. POST /api/contact aliases the
// POST /api/leads handler (public, rate-limited).
const leadRowSchema = z
  .object({
    id: z.string(),
    tenantId: z.string().nullable().optional(),
    name: z.string(),
    email: z.string(),
    phone: z.string().nullable().optional(),
    subject: z.string().nullable().optional(),
    message: z.string().nullable().optional(),
    source: z.string().nullable().optional(),
    status: z.string(),
    createdAt: z.string().nullable().optional(),
  })
  .openapi('Lead');

const paginatedLeadsSchema = paginatedEnvelope(leadRowSchema, 'PaginatedLeads');

const leadPostRequestSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Valid email is required'),
    phone: z.string().optional(),
    subject: z.string().optional(),
    message: z.string().optional(),
    source: z.string().optional(),
  })
  .openapi('LeadCreateRequest');

const leadCreateResponseSchema = z
  .object({ success: z.boolean(), message: z.string(), id: z.string() })
  .openapi('LeadCreateResponse');

const leadPutRequestSchema = z
  .object({ status: z.enum(['new', 'contacted', 'converted', 'archived']) })
  .openapi('LeadStatusUpdateRequest');

export const leadRoutes = [
  createRoute({
    method: 'get',
    path: '/api/leads',
    tags: ['leads'],
    summary: 'List leads (auth + tenant scoped, T6 pagination envelope, optional status filter)',
    request: {
      query: z.object({ page: z.string().optional(), pageSize: z.string().optional(), status: z.string().optional() }),
    },
    responses: {
      200: { description: 'Leads', content: { 'application/json': { schema: paginatedLeadsSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'post',
    path: '/api/leads',
    tags: ['leads'],
    summary: 'Submit a lead (public, rate-limited)',
    request: { body: { content: { 'application/json': { schema: leadPostRequestSchema } } } },
    responses: {
      200: { description: 'Lead submitted', content: { 'application/json': { schema: leadCreateResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'post',
    path: '/api/contact',
    tags: ['leads'],
    summary: 'Contact form submission (public, rate-limited; same handler as POST /api/leads)',
    request: { body: { content: { 'application/json': { schema: leadPostRequestSchema } } } },
    responses: {
      200: { description: 'Message submitted', content: { 'application/json': { schema: leadCreateResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'put',
    path: '/api/leads/{id}',
    tags: ['leads'],
    summary: 'Update lead status (auth + tenant scoped)',
    request: { body: { content: { 'application/json': { schema: leadPutRequestSchema } } }, params: z.object({ id: z.string() }) },
    responses: {
      200: { description: 'Updated', content: { 'application/json': { schema: successResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'delete',
    path: '/api/leads/{id}',
    tags: ['leads'],
    summary: 'Delete a lead (auth + tenant scoped)',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: { description: 'Deleted', content: { 'application/json': { schema: successResponseSchema } } },
      ...errorResponses(),
    },
  }),
];

// ─── Unified inbox (P4): merged leads + bookings feed ────────────────────────
// GET /api/inbox is auth + tenant scoped (dispatched inside the catch-all, like
// /api/leads GET). Rows are a snake_case UNION of the leads arm and the bookings
// arm, camelized by jsonResponse. Booking rooms display via rooms_new.name
// (rooms_new has NO room_number column). Read state: leads carry is_read/read_at;
// bookings ack via the inbox_reads side table (migration 0049).
const inboxItemSchema = z
  .object({
    id: z.string(),
    kind: z.enum(['lead', 'booking']),
    name: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    subject: z.string().nullable().optional(),
    message: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    source: z.string().nullable().optional(),
    isRead: z.number(),
    campName: z.string().nullable().optional(),
    roomNumber: z.string().nullable().optional(),
    customerName: z.string().nullable().optional(),
    checkInDate: z.string().nullable().optional(),
    checkOutDate: z.string().nullable().optional(),
    numberOfPeople: z.number().nullable().optional(),
    totalAmount: z.number().nullable().optional(),
    amountPaid: z.number().nullable().optional(),
    paymentStatus: z.string().nullable().optional(),
    orderStateId: z.string().nullable().optional(),
    reference: z.string().nullable().optional(),
    createdAt: z.string().nullable().optional(),
  })
  .openapi('InboxItem');

const inboxResponseSchema = z
  .object({
    data: z.array(inboxItemSchema),
    total: z.number(),
    page: z.number(),
    pageSize: z.number(),
    hasMore: z.boolean(),
    unread: z.number(),
  })
  .openapi('InboxResponse');

const inboxReadRequestSchema = z
  .object({
    kind: z.enum(['lead', 'booking'], { required_error: 'Invalid kind' }),
    id: z.string().min(1, 'ID is required'),
  })
  .openapi('InboxReadRequest');

export const inboxRoutes = [
  createRoute({
    method: 'get',
    path: '/api/inbox',
    tags: ['inbox'],
    summary: 'Unified inbox feed (auth + tenant scoped): merged leads + bookings, T6 pagination envelope + unread count, kind/status filters',
    request: {
      query: z.object({
        page: z.string().optional(),
        pageSize: z.string().optional(),
        kind: z.string().optional(),
        status: z.string().optional(),
      }),
    },
    responses: {
      200: { description: 'Inbox feed', content: { 'application/json': { schema: inboxResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'patch',
    path: '/api/inbox/read',
    tags: ['inbox'],
    summary: 'Mark an inbox item read (lead: set is_read/read_at; booking: INSERT OR IGNORE into inbox_reads; idempotent)',
    request: { body: { content: { 'application/json': { schema: inboxReadRequestSchema } } } },
    responses: {
      200: { description: 'Marked read', content: { 'application/json': { schema: successResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'delete',
    path: '/api/inbox/{kind}/{id}',
    tags: ['inbox'],
    summary: 'Delete an inbox item — lead only; booking deletion returns 400',
    request: { params: z.object({ kind: z.string(), id: z.string() }) },
    responses: {
      200: { description: 'Deleted', content: { 'application/json': { schema: successResponseSchema } } },
      ...errorResponses(),
    },
  }),
];

// ─── Super-admin (T8-B3): /api/admin/* (Bearer + super_admin + active check) ───
const adminStatsSchema = z
  .object({
    totalTenants: z.number(),
    totalCamps: z.number(),
    totalRooms: z.number(),
    totalOrders: z.number(),
    totalRevenue: z.number(),
    totalAdmins: z.number(),
  })
  .openapi('AdminStats');

const adminTenantRowSchema = z
  .object({
    id: z.string(),
    subdomain: z.string(),
    customDomain: z.string().nullable().optional(),
    name: z.string(),
    logoUrl: z.string().nullable().optional(),
    faviconUrl: z.string().nullable().optional(),
    primaryColor: z.string().nullable().optional(),
    footerText: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    whatsappNumber: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    heroImageUrl: z.string().nullable().optional(),
    galleryImages: z.string().nullable().optional(),
    aboutText: z.string().nullable().optional(),
    faqItems: z.string().nullable().optional(),
    reviews: z.string().nullable().optional(),
    mapEmbedUrl: z.string().nullable().optional(),
    activities: z.string().nullable().optional(),
    capacity: z.number().optional(),
    currency: z.string().optional(),
    status: z.string().optional(),
    menuConfig: z.any().optional(),
    createdAt: z.string().nullable().optional(),
    updatedAt: z.string().nullable().optional(),
    adminEmail: z.string().nullable().optional(),
    adminFirstName: z.string().nullable().optional(),
    adminLastName: z.string().nullable().optional(),
  })
  .openapi('AdminTenant');

const paginatedAdminTenantsSchema = paginatedEnvelope(adminTenantRowSchema, 'PaginatedAdminTenants');

const tenantUpdateRequestSchema = z
  .object({
    name: z.string().optional(),
    subdomain: z.string().optional(),
    customDomain: z.string().optional(),
    logoUrl: z.string().optional(),
    faviconUrl: z.string().optional(),
    primaryColor: z.string().optional(),
    footerText: z.string().optional(),
    status: z.string().optional(),
    location: z.string().optional(),
    whatsappNumber: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    description: z.string().optional(),
    currency: z.string().optional(),
    adminEmail: z.string().optional(),
    adminPassword: z.string().optional(),
    adminFirstName: z.string().optional(),
    adminLastName: z.string().optional(),
  })
  .openapi('AdminTenantUpdateRequest');

const bulkActionRequestSchema = z
  .object({ ids: z.array(z.string()).min(1, 'Tenant IDs array is required') })
  .openapi('BulkActionRequest');

const bulkActionResultSchema = z
  .object({
    success: z.boolean(),
    suspended: z.array(z.string()).optional(),
    activated: z.array(z.string()).optional(),
    deleted: z.array(z.string()).optional(),
  })
  .openapi('BulkActionResult');

const adminRowSchema = z
  .object({
    id: z.string(),
    tenantId: z.string().nullable().optional(),
    email: z.string(),
    role: z.string(),
    firstName: z.string().nullable().optional(),
    lastName: z.string().nullable().optional(),
    isActive: z.number().optional(),
    lastLogin: z.string().nullable().optional(),
    createdAt: z.string().nullable().optional(),
  })
  .openapi('AdminRow');

const paginatedAdminsSchema = paginatedEnvelope(adminRowSchema, 'PaginatedAdmins');

const adminCreateRequestSchema = z
  .object({
    email: z.string().email('Valid email is required'),
    password: z.string().min(1, 'Password is required'),
    tenantId: z.string().optional(),
    role: z.string().min(1, 'Role is required'),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
  })
  .openapi('AdminCreateRequest');

const adminCreateResponseSchema = z
  .object({ success: z.boolean(), id: z.string(), updated: z.boolean().optional() })
  .openapi('AdminCreateResponse');

const adminUpdateRequestSchema = z
  .object({
    isActive: z.boolean().optional(),
    role: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
  })
  .openapi('AdminUpdateRequest');

const adminUpdateResponseSchema = z
  .object({ success: z.boolean(), id: z.string() })
  .openapi('AdminUpdateResponse');

export const adminRoutes = [
  createRoute({
    method: 'get',
    path: '/api/admin/stats',
    tags: ['admin'],
    summary: 'Super-admin aggregate stats',
    responses: {
      200: { description: 'Stats', content: { 'application/json': { schema: adminStatsSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'get',
    path: '/api/admin/tenants',
    tags: ['admin'],
    summary: 'Super-admin tenant list (T6 pagination envelope)',
    request: { query: z.object({ page: z.string().optional(), pageSize: z.string().optional() }) },
    responses: {
      200: { description: 'Tenants', content: { 'application/json': { schema: paginatedAdminTenantsSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'post',
    path: '/api/admin/tenants/bulk/{action}',
    tags: ['admin'],
    summary: 'Bulk suspend / activate / delete tenants (super-admin)',
    request: {
      params: z.object({ action: z.enum(['suspend', 'activate', 'delete']) }),
      body: { content: { 'application/json': { schema: bulkActionRequestSchema } } },
    },
    responses: {
      200: { description: 'Bulk action result', content: { 'application/json': { schema: bulkActionResultSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'put',
    path: '/api/admin/tenants/{id}',
    tags: ['admin'],
    summary: 'Update a tenant (super-admin)',
    request: { body: { content: { 'application/json': { schema: tenantUpdateRequestSchema } } }, params: z.object({ id: z.string() }) },
    responses: {
      200: { description: 'Updated', content: { 'application/json': { schema: successResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'delete',
    path: '/api/admin/tenants/{id}',
    tags: ['admin'],
    summary: 'Cascade-delete a tenant (super-admin)',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: { description: 'Deleted', content: { 'application/json': { schema: successResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'get',
    path: '/api/admin/admins',
    tags: ['admin'],
    summary: 'Super-admin admin list (T6 pagination envelope)',
    request: { query: z.object({ page: z.string().optional(), pageSize: z.string().optional() }) },
    responses: {
      200: { description: 'Admins', content: { 'application/json': { schema: paginatedAdminsSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'post',
    path: '/api/admin/admins',
    tags: ['admin'],
    summary: 'Create (or upsert) an admin (super-admin)',
    request: { body: { content: { 'application/json': { schema: adminCreateRequestSchema } } } },
    responses: {
      200: { description: 'Created/updated', content: { 'application/json': { schema: adminCreateResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'put',
    path: '/api/admin/admins/{id}',
    tags: ['admin'],
    summary: 'Update an admin (super-admin; super_admin accounts are protected)',
    request: { body: { content: { 'application/json': { schema: adminUpdateRequestSchema } } }, params: z.object({ id: z.string() }) },
    responses: {
      200: { description: 'Updated', content: { 'application/json': { schema: adminUpdateResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'delete',
    path: '/api/admin/admins/{id}',
    tags: ['admin'],
    summary: 'Delete an admin (super-admin; super_admin accounts are protected)',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: { description: 'Deleted', content: { 'application/json': { schema: successResponseSchema } } },
      ...errorResponses(),
    },
  }),
];

// ─── POS Users (staff management): /api/pos-users/* ─────────────────────────────
// Wire rows from pos_users (SELECT in pos-users.js): id, username, email,
// first_name, last_name, name, phone, role, is_active, status, department,
// employee_id, organization_id, store_id, tenant_id, last_login, created_at,
// updated_at. All keys camelCase via the jsonResponse toCamel choke point.
const posUserSchema = z
  .object({
    id: z.number().int(),
    username: z.string(),
    email: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    name: z.string(),
    phone: z.string().nullable().optional(),
    role: z.string(),
    isActive: z.boolean(),
    status: z.string(),
    department: z.string().nullable().optional(),
    employeeId: z.string().nullable().optional(),
    organizationId: z.number().int().nullable().optional(),
    storeId: z.number().int().nullable().optional(),
    tenantId: z.string().nullable().optional(),
    lastLogin: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('PosUser');

const paginatedPosUsersSchema = paginatedEnvelope(posUserSchema, 'PaginatedPosUsers');

const posUserCreateRequestSchema = z.object({
  email: z.string(),
  username: z.string().optional(),
  password: z.string().min(8),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().optional(),
  role: z.enum(['cashier', 'manager', 'admin']).optional(),
  department: z.string().optional(),
  employeeId: z.string().optional(),
  storeId: z.number().int().optional(),
});

const posUserPatchRequestSchema = z.object({
  email: z.string().optional(),
  username: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  role: z.enum(['cashier', 'manager', 'admin']).optional(),
  isActive: z.boolean().optional(),
  department: z.string().optional(),
  employeeId: z.string().optional(),
  storeId: z.number().int().optional(),
});

const posUserResetPasswordRequestSchema = z.object({
  password: z.string().min(8),
});

const posUserActionResponseSchema = z
  .object({
    success: z.boolean(),
    id: z.number().int(),
  })
  .openapi('PosUserActionResponse');

export const posUsersRoutes = [
  createRoute({
    method: 'get',
    path: '/api/pos-users',
    tags: ['admin'],
    summary: 'List POS staff (tenant-admin scoped to own tenant; super-admin via ?tenantId=)',
    request: {
      query: z.object({
        page: z.string().optional(),
        pageSize: z.string().optional(),
        role: z.string().optional(),
        search: z.string().optional(),
        tenantId: z.string().optional(),
      }),
    },
    responses: {
      200: { description: 'Paginated POS users', content: { 'application/json': { schema: paginatedPosUsersSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'post',
    path: '/api/pos-users',
    tags: ['admin'],
    summary: 'Create a POS user (tenant-admin scoped to own tenant; super-admin via ?tenantId=)',
    request: { body: { content: { 'application/json': { schema: posUserCreateRequestSchema } } } },
    responses: {
      200: { description: 'POS user created', content: { 'application/json': { schema: posUserActionResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'patch',
    path: '/api/pos-users/{id}',
    tags: ['admin'],
    summary: 'Update a POS user',
    request: {
      params: z.object({ id: z.number().int() }),
      body: { content: { 'application/json': { schema: posUserPatchRequestSchema } } },
    },
    responses: {
      200: { description: 'POS user updated', content: { 'application/json': { schema: posUserActionResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'delete',
    path: '/api/pos-users/{id}',
    tags: ['admin'],
    summary: 'Soft-delete a POS user',
    request: { params: z.object({ id: z.number().int() }) },
    responses: {
      200: { description: 'POS user deleted', content: { 'application/json': { schema: posUserActionResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'post',
    path: '/api/pos-users/{id}/reset-password',
    tags: ['admin'],
    summary: 'Reset a POS user password',
    request: {
      params: z.object({ id: z.number().int() }),
      body: { content: { 'application/json': { schema: posUserResetPasswordRequestSchema } } },
    },
    responses: {
      200: { description: 'Password reset', content: { 'application/json': { schema: posUserActionResponseSchema } } },
      ...errorResponses(),
    },
  }),
];

// ─── Payments (T8-B3) ──────────────────────────────────────────────────────────
// Request schemas are the module's OWN paymentIntentSchema / confirmPaymentSchema —
// they are already camelCase and parsed WITHOUT toSnake (wire-identical). The
// webhook deliberately has NO request schema: it is a raw Stripe event body and
// must not imply case-normalization.
const paymentIntentResponseSchema = z
  .object({
    success: z.boolean(),
    paymentIntentId: z.string(),
    clientSecret: z.string(),
    amount: z.number(),
    currency: z.string(),
    orderId: z.string(),
  })
  .openapi('PaymentIntentResponse');

const confirmPaymentResponseSchema = z
  .object({ success: z.boolean(), orderId: z.string(), status: z.string(), amountPaid: z.number() })
  .openapi('ConfirmPaymentResponse');

const webhookResponseSchema = z.object({ received: z.boolean() }).openapi('WebhookResponse');

export const paymentRoutes = [
  createRoute({
    method: 'post',
    path: '/api/payments/create-intent',
    tags: ['payments'],
    summary: 'Create a (mock) Stripe PaymentIntent for an order (auth + tenant)',
    request: { body: { content: { 'application/json': { schema: paymentIntentSchema } } } },
    responses: {
      200: { description: 'Payment intent created', content: { 'application/json': { schema: paymentIntentResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'post',
    path: '/api/payments/create-checkout',
    tags: ['payments'],
    summary: 'Create a checkout payment intent (auth + tenant; same handler as create-intent)',
    request: { body: { content: { 'application/json': { schema: paymentIntentSchema } } } },
    responses: {
      200: { description: 'Payment intent created', content: { 'application/json': { schema: paymentIntentResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'post',
    path: '/api/payments/confirm',
    tags: ['payments'],
    summary: 'Confirm a (mock) payment and mark the order paid (auth + tenant)',
    request: { body: { content: { 'application/json': { schema: confirmPaymentSchema } } } },
    responses: {
      200: { description: 'Payment confirmed', content: { 'application/json': { schema: confirmPaymentResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'post',
    path: '/api/payments/webhook',
    tags: ['payments'],
    summary: 'Mock Stripe webhook (raw event body; x-webhook-secret header) — no request schema by design',
    responses: {
      200: { description: 'Webhook acknowledged', content: { 'application/json': { schema: webhookResponseSchema } } },
      ...errorResponses({ 401: { description: 'Invalid webhook secret', content: { 'application/json': { schema: errorEnvelopeSchema } } } }),
    },
  }),
];

// ─── POS (T8-B3): /api/pos/* — self-contained pos_token JWT auth ───────────────
// Verified against routes/pos/index.js: ONLY 9 routes exist (login, products,
// orders list/create/detail, dashboard, shifts active/open/close). There are NO
// customers / inventory / staff / reports routes in the POS router.
const posLoginRequestSchema = z
  .object({ identifier: z.string(), password: z.string() })
  .openapi('PosLoginRequest');

const posLoginUserSchema = z
  .object({
    id: z.string(),
    username: z.string(),
    email: z.string(),
    firstName: z.string().nullable().optional(),
    lastName: z.string().nullable().optional(),
    role: z.string(),
    organizationId: z.union([z.number(), z.string()]).optional(),
    storeId: z.union([z.number(), z.string()]).nullable().optional(),
  })
  .openapi('PosLoginUser');

const posLoginResponseSchema = z
  .object({ success: z.boolean(), token: z.string(), user: posLoginUserSchema })
  .openapi('PosLoginResponse');

const posProductSchema = z
  .object({
    id: z.string(),
    sku: z.string().nullable().optional(),
    name: z.string(),
    description: z.string().nullable().optional(),
    sellingPrice: z.number(),
    costPrice: z.number().nullable().optional(),
    categoryId: z.union([z.number(), z.string()]).nullable().optional(),
    type: z.string().nullable().optional(),
    imageUrl: z.string().nullable().optional(),
    isActive: z.number().optional(),
    stockQuantity: z.number().nullable().optional(),
  })
  .openapi('PosProduct');

const posProductListSchema = z.array(posProductSchema).openapi('PosProductList');

const posOrderCreateItemSchema = z
  .object({ productId: z.string(), quantity: z.union([z.number(), z.string()]) })
  .openapi('PosOrderItemRequest');

const posOrderCreateRequestSchema = z
  .object({
    items: z.array(posOrderCreateItemSchema).min(1, 'Order must contain at least one item'),
    paymentMethod: z.enum(['cash', 'card', 'split']).optional(),
    notes: z.string().optional(),
    amountCash: z.number().optional(),
    amountCard: z.number().optional(),
  })
  .openapi('PosOrderCreateRequest');

const posOrderItemResponseSchema = z
  .object({
    id: z.string(),
    productId: z.string(),
    quantity: z.number(),
    unitPrice: z.number(),
    totalAmount: z.number(),
  })
  .openapi('PosOrderItemResponse');

const posOrderCreateResponseSchema = z
  .object({
    success: z.boolean(),
    order: z.object({
      id: z.string(),
      orderNumber: z.string(),
      subtotal: z.number(),
      taxAmount: z.number(),
      totalAmount: z.number(),
      paymentMethod: z.string(),
      amountCash: z.number(),
      amountCard: z.number(),
      status: z.string(),
      items: z.array(posOrderItemResponseSchema),
    }),
  })
  .openapi('PosOrderCreateResponse');

const posOrderRowSchema = z
  .object({
    id: z.string(),
    orderNumber: z.string(),
    status: z.string(),
    subtotal: z.number(),
    taxAmount: z.number(),
    totalAmount: z.number(),
    paymentMethod: z.string(),
    paymentStatus: z.string().nullable().optional(),
    createdAt: z.string(),
    cashierName: z.string().nullable().optional(),
  })
  .openapi('PosOrder');

const posOrderListSchema = z.array(posOrderRowSchema).openapi('PosOrderList');

const posOrderDetailItemSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    orderId: z.string(),
    productId: z.string(),
    quantity: z.number(),
    unitPrice: z.number(),
    subtotal: z.number(),
    taxAmount: z.number(),
    totalAmount: z.number(),
    createdAt: z.string().nullable().optional(),
    updatedAt: z.string().nullable().optional(),
    productName: z.string().nullable().optional(),
    sku: z.string().nullable().optional(),
  })
  .openapi('PosOrderDetailItem');

const posOrderDetailSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    organizationId: z.union([z.number(), z.string()]).optional(),
    storeId: z.union([z.number(), z.string()]).nullable().optional(),
    orderNumber: z.string(),
    cashierId: z.string().nullable().optional(),
    status: z.string(),
    subtotal: z.number(),
    taxAmount: z.number(),
    taxRate: z.number().nullable().optional(),
    totalAmount: z.number(),
    paidAmount: z.number().nullable().optional(),
    paymentMethod: z.string(),
    paymentStatus: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    amountCash: z.number().nullable().optional(),
    amountCard: z.number().nullable().optional(),
    createdAt: z.string().nullable().optional(),
    updatedAt: z.string().nullable().optional(),
    cashierName: z.string().nullable().optional(),
    items: z.array(posOrderDetailItemSchema),
  })
  .openapi('PosOrderDetail');

const posDashboardRecentOrderSchema = z
  .object({
    id: z.string(),
    orderNumber: z.string(),
    totalAmount: z.number(),
    paymentMethod: z.string(),
    status: z.string(),
    createdAt: z.string(),
  })
  .openapi('PosRecentOrder');

const posDashboardSchema = z
  .object({
    todayRevenue: z.number(),
    todayOrders: z.number(),
    activeProducts: z.number(),
    recentOrders: z.array(posDashboardRecentOrderSchema),
  })
  .openapi('PosDashboard');

const posShiftSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    openingTime: z.string(),
    openingCash: z.number(),
    expectedClosingCash: z.number().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .openapi('PosShift');

const posShiftActiveResponseSchema = z
  .object({ active: z.boolean(), shift: posShiftSchema.optional() })
  .openapi('PosShiftActiveResponse');

const posShiftOpenRequestSchema = z
  .object({ openingCash: z.number(), notes: z.string().optional() })
  .openapi('PosShiftOpenRequest');

const posShiftOpenResponseSchema = z
  .object({
    success: z.boolean(),
    shift: z.object({ id: z.string(), status: z.string(), openingTime: z.string(), openingCash: z.number() }),
  })
  .openapi('PosShiftOpenResponse');

const posShiftCloseRequestSchema = z
  .object({ actualClosingCash: z.number(), notes: z.string().optional() })
  .openapi('PosShiftCloseRequest');

const posShiftCloseResponseSchema = z
  .object({
    success: z.boolean(),
    shift: z.object({
      id: z.string(),
      status: z.string(),
      openingCash: z.number(),
      totalCashSales: z.number(),
      expectedClosingCash: z.number(),
      actualClosingCash: z.number(),
      discrepancy: z.number(),
    }),
  })
  .openapi('PosShiftCloseResponse');

export const posRoutes = [
  createRoute({
    method: 'post',
    path: '/api/pos/auth/login',
    tags: ['pos'],
    summary: 'POS cashier login (identifier = email or username)',
    request: { body: { content: { 'application/json': { schema: posLoginRequestSchema } } } },
    responses: {
      200: { description: 'Login successful', content: { 'application/json': { schema: posLoginResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'get',
    path: '/api/pos/products',
    tags: ['pos'],
    summary: 'List active POS products (pos_token auth)',
    responses: {
      200: { description: 'Products', content: { 'application/json': { schema: posProductListSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'post',
    path: '/api/pos/orders',
    tags: ['pos'],
    summary: 'Create a POS order (pos_token auth; deducts recipe stock)',
    request: { body: { content: { 'application/json': { schema: posOrderCreateRequestSchema } } } },
    responses: {
      200: { description: 'Order created', content: { 'application/json': { schema: posOrderCreateResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'get',
    path: '/api/pos/orders',
    tags: ['pos'],
    summary: 'List POS orders (latest 100, pos_token auth)',
    responses: {
      200: { description: 'Orders', content: { 'application/json': { schema: posOrderListSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'get',
    path: '/api/pos/orders/{id}',
    tags: ['pos'],
    summary: 'Get a POS order with items (pos_token auth)',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: { description: 'Order detail', content: { 'application/json': { schema: posOrderDetailSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'get',
    path: '/api/pos/dashboard',
    tags: ['pos'],
    summary: 'POS dashboard stats for today (pos_token auth)',
    responses: {
      200: { description: 'Dashboard', content: { 'application/json': { schema: posDashboardSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'get',
    path: '/api/pos/shifts/active',
    tags: ['pos'],
    summary: 'Get the current cashier active shift, if any (pos_token auth)',
    responses: {
      200: { description: 'Active shift status', content: { 'application/json': { schema: posShiftActiveResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'post',
    path: '/api/pos/shifts/open',
    tags: ['pos'],
    summary: 'Open a cashier shift (pos_token auth)',
    request: { body: { content: { 'application/json': { schema: posShiftOpenRequestSchema } } } },
    responses: {
      200: { description: 'Shift opened', content: { 'application/json': { schema: posShiftOpenResponseSchema } } },
      ...errorResponses(),
    },
  }),
  createRoute({
    method: 'post',
    path: '/api/pos/shifts/close',
    tags: ['pos'],
    summary: 'Close the active cashier shift with discrepancy (pos_token auth)',
    request: { body: { content: { 'application/json': { schema: posShiftCloseRequestSchema } } } },
    responses: {
      200: { description: 'Shift closed', content: { 'application/json': { schema: posShiftCloseResponseSchema } } },
      ...errorResponses(),
    },
  }),
];

// ─── Media (Phase 2): R2-backed image upload + public stream ──────────────────
// POST /api/upload is tenant-admin auth (enforced by the catch-all dispatcher,
// not by the route). Request bodies: `multipart/form-data` with a `file` field
// OR a raw `application/octet-stream` body + `?filename=` query param. The
// spec describes the octet-stream variant (multipart is awkward in OpenAPI).
// GET /api/media/{key} is PUBLIC — the key embeds tenantId (`media/{tenantId}/…`)
// so it can never cross tenant boundaries. Response is the raw binary stream.
const uploadResponseSchema = z
  .object({ url: z.string().describe('Worker-served path: /api/media/{key}') })
  .openapi('UploadResponse');

const binarySchema = z.string().openapi({ format: 'binary' });

export const mediaRoutes = [
  createRoute({
    method: 'post',
    path: '/api/upload',
    tags: ['media'],
    summary: 'Upload an image (multipart file field or raw octet-stream + filename; tenant-admin auth, max 8 MB, jpg/jpeg/png/webp/gif)',
    request: {
      query: z.object({ filename: z.string().optional() }),
      body: { content: { 'application/octet-stream': { schema: binarySchema } } },
    },
    responses: {
      200: { description: 'Uploaded', content: { 'application/json': { schema: uploadResponseSchema } } },
      ...errorResponses({
        405: { description: 'Method not allowed', content: { 'application/json': { schema: errorEnvelopeSchema } } },
        413: { description: 'Payload too large (max 8 MB)', content: { 'application/json': { schema: errorEnvelopeSchema } } },
        503: { description: 'Media storage not configured', content: { 'application/json': { schema: errorEnvelopeSchema } } },
      }),
    },
  }),
  createRoute({
    method: 'get',
    path: '/api/media/{key}',
    tags: ['media'],
    summary: 'Stream a stored media object (public; key = media/{tenantId}/{uuid}.{ext})',
    request: { params: z.object({ key: z.string() }) },
    responses: {
      200: { description: 'Binary image', content: { 'application/octet-stream': { schema: binarySchema } } },
      ...errorResponses(),
    },
  }),
];

// ─── Inventory (T1A): GET /api/inventory/low-stock ────────────────────────────
// Tenant-admin read-only endpoint (deliberately under /api/inventory/ because
// /api/admin/* is super-admin-only). Resolves tenant → organization via
// tenant_org_mapping (migration 0041), then returns pos_products at/below
// min_stock_level. Sorted by stock/min ratio ascending (most critical first).
// Each item carries a computed `status` (out when stockQuantity <= 0).
const inventoryItemSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    stockQuantity: z.number(),
    minStockLevel: z.number(),
    unit: z.string().nullable(),
    category: z.string().nullable(),
    status: z.enum(['low', 'out']),
  })
  .openapi('InventoryItem');

const inventoryLowStockListSchema = z
  .object({
    items: z.array(inventoryItemSchema),
    total: z.number(),
    page: z.number(),
    pageSize: z.number(),
    hasMore: z.boolean(),
  })
  .openapi('InventoryLowStockList');

export const inventoryRoutes = [
  createRoute({
    method: 'get',
    path: '/api/inventory/low-stock',
    tags: ['inventory'],
    summary: 'Low-stock POS products for the tenant organization (auth + tenant scoped; sorted by stock/min ratio, most critical first)',
    request: { query: z.object({ page: z.string().optional(), pageSize: z.string().optional() }) },
    responses: {
      200: { description: 'Low-stock inventory', content: { 'application/json': { schema: inventoryLowStockListSchema } } },
      ...errorResponses(),
    },
  }),
];

// All registered routes — T8-B tasks append their module arrays here.
export const openApiRoutes = [
  ...authRoutes,
  ...marketplaceRoutes,
  ...menuRoutes,
  ...tenantRoutes,
  ...planRoutes,
  ...leadRoutes,
  ...adminRoutes,
  ...posUsersRoutes,
  ...paymentRoutes,
  ...posRoutes,
  ...mediaRoutes,
  ...inventoryRoutes,
  ...inboxRoutes,
];

// ─── Document assembly ────────────────────────────────────────────────────────

export function buildOpenApiDocument() {
  // Definitions must be wrapped as { type: 'route', route } — the same shape
  // @hono/zod-openapi's OpenAPIHono registry produces. Bare route configs would
  // be mistaken for zod schemas by the generator's sortDefinitions/generateSingle.
  const definitions = openApiRoutes.map((route) => ({ type: 'route', route }));
  const generator = new OpenApiGeneratorV3(definitions);
  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      title: 'SinaiCamps API',
      description: 'Serverless API for the SinaiCamps multi-tenant hospitality marketplace (Cloudflare Worker + D1). Wire contract is camelCase end-to-end (T3); structured errors `{ success:false, error, errors? }` (T4).',
      version: '2.1.0',
    },
    servers: [{ url: 'https://sinaicamps.com' }],
  });
}
