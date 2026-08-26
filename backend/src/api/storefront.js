/**
 * Storefront Module — public product catalog, shopping cart, checkout,
 * CMS pages, and blog. Admin CRUD for pages, blog posts, and categories.
 *
 * Mounted at /api/storefront in index.js.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { validationError } from '../utils/errors.js';
import { getScope } from '../middleware/resolveScope.js';

const router = new Hono();

// ── Schemas ────────────────────────────────────────────────────────────────

const addToCartSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(999).default(1),
  sessionId: z.string().min(1),
}).strip();

const updateCartItemSchema = z.object({
  quantity: z.number().int().min(1).max(999),
}).strip();

const pageCreateSchema = z.object({
  slug: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  content: z.string().max(50000).optional(),
  metaTitle: z.string().max(200).optional(),
  metaDescription: z.string().max(500).optional(),
  isPublished: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
}).strip();

const pageUpdateSchema = pageCreateSchema.partial().strip();

const blogPostCreateSchema = z.object({
  slug: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  content: z.string().min(1).max(100000),
  excerpt: z.string().max(2000).optional(),
  category: z.string().max(100).optional(),
  tags: z.string().max(500).optional(),
  authorId: z.string().optional(),
  isPublished: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
}).strip();

const blogPostUpdateSchema = blogPostCreateSchema.partial().strip();

const blogCategoryCreateSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(200),
}).strip();

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC ENDPOINTS (no auth required)
// ════════════════════════════════════════════════════════════════════════════

// ── Products ───────────────────────────────────────────────────────────────

router.get('/products', async (c) => {
  const scope = getScope(c);
  const tenantId = scope?.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);

  const url = new URL(c.req.url);
  const category = url.searchParams.get('category');
  const search = url.searchParams.get('search');
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
  const offset = (page - 1) * limit;

  let sql = 'SELECT * FROM pos_products WHERE tenant_id = ? AND deleted_at IS NULL';
  const binds = [tenantId];

  if (category) { sql += ' AND category = ?'; binds.push(category); }
  if (search) { sql += ' AND (name LIKE ? OR description LIKE ?)'; binds.push(`%${search}%`, `%${search}%`); }

  let countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
  const countResult = await c.env.DB.prepare(countSql).bind(...binds).first();
  const total = countResult?.total || 0;

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  binds.push(limit, offset);

  const rows = await c.env.DB.prepare(sql).bind(...binds).all();
  return jsonResponse({ items: rows.results || [], total, page, limit });
});

router.get('/products/:id', async (c) => {
  const scope = getScope(c);
  const tenantId = scope?.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { id } = c.req.param();

  const product = await c.env.DB.prepare(
    'SELECT * FROM pos_products WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL'
  ).bind(id, tenantId).first();
  if (!product) return errorResponse('Product not found', 404);
  return jsonResponse(product);
});

// ── Cart ───────────────────────────────────────────────────────────────────

router.get('/cart', async (c) => {
  const scope = getScope(c);
  const tenantId = scope?.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);

  const url = new URL(c.req.url);
  const sessionId = url.searchParams.get('sessionId');
  const userId = url.searchParams.get('userId');

  if (!sessionId && !userId) return errorResponse('sessionId or userId required', 400);

  let cart;
  if (sessionId) {
    cart = await c.env.DB.prepare(
      'SELECT * FROM carts WHERE session_id = ? AND tenant_id = ?'
    ).bind(sessionId, tenantId).first();
  } else {
    cart = await c.env.DB.prepare(
      'SELECT * FROM carts WHERE user_id = ? AND tenant_id = ?'
    ).bind(userId, tenantId).first();
  }

  if (!cart) return jsonResponse({ cart: null, items: [] });

  const items = await c.env.DB.prepare(
    'SELECT * FROM cart_items WHERE cart_id = ? ORDER BY created_at DESC'
  ).bind(cart.id).all();

  return jsonResponse({ cart, items: items.results || [] });
});

router.post('/cart/items', async (c) => {
  const scope = getScope(c);
  const tenantId = scope?.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);

  const body = await c.req.json();
  const parsed = addToCartSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const { productId, quantity, sessionId } = parsed.data;

  const product = await c.env.DB.prepare(
    'SELECT id, price FROM pos_products WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL'
  ).bind(productId, tenantId).first();
  if (!product) return errorResponse('Product not found', 404);

  let cart = await c.env.DB.prepare(
    'SELECT id FROM carts WHERE session_id = ? AND tenant_id = ?'
  ).bind(sessionId, tenantId).first();

  if (!cart) {
    const cartId = crypto.randomUUID();
    await c.env.DB.prepare(
      'INSERT INTO carts (id, tenant_id, session_id) VALUES (?, ?, ?)'
    ).bind(cartId, tenantId, sessionId).run();
    cart = { id: cartId };
  }

  const unitPrice = product.price;
  const totalPrice = unitPrice * quantity;

  const existingItem = await c.env.DB.prepare(
    'SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ?'
  ).bind(cart.id, productId).first();

  if (existingItem) {
    const newQty = existingItem.quantity + quantity;
    await c.env.DB.prepare(
      "UPDATE cart_items SET quantity = ?, total_price = unit_price * ?, created_at = datetime('now') WHERE id = ?"
    ).bind(newQty, newQty, existingItem.id).run();
    return jsonResponse({ id: existingItem.id, cartId: cart.id, productId, quantity: newQty, unitPrice, totalPrice: unitPrice * newQty, success: true });
  }

  const itemId = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO cart_items (id, cart_id, product_id, quantity, unit_price, total_price) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(itemId, cart.id, productId, quantity, unitPrice, totalPrice).run();

  return jsonResponse({ id: itemId, cartId: cart.id, productId, quantity, unitPrice, totalPrice, success: true }, 201);
});

router.put('/cart/items/:id', async (c) => {
  const scope = getScope(c);
  const tenantId = scope?.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = updateCartItemSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);

  const item = await c.env.DB.prepare(
    'SELECT ci.id, ci.unit_price FROM cart_items ci JOIN carts c ON ci.cart_id = c.id WHERE ci.id = ? AND c.tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!item) return errorResponse('Cart item not found', 404);

  const newQty = parsed.data.quantity;
  const totalPrice = item.unit_price * newQty;

  await c.env.DB.prepare(
    "UPDATE cart_items SET quantity = ?, total_price = ?, created_at = datetime('now') WHERE id = ?"
  ).bind(newQty, totalPrice, id).run();

  return jsonResponse({ id, quantity: newQty, unitPrice: item.unit_price, totalPrice, success: true });
});

router.delete('/cart/items/:id', async (c) => {
  const scope = getScope(c);
  const tenantId = scope?.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { id } = c.req.param();

  const item = await c.env.DB.prepare(
    'SELECT ci.id FROM cart_items ci JOIN carts c ON ci.cart_id = c.id WHERE ci.id = ? AND c.tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!item) return errorResponse('Cart item not found', 404);

  await c.env.DB.prepare('DELETE FROM cart_items WHERE id = ?').bind(id).run();
  return jsonResponse({ success: true });
});

// ── Checkout ───────────────────────────────────────────────────────────────

router.post('/checkout', async (c) => {
  const scope = getScope(c);
  const tenantId = scope?.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);

  const body = await c.req.json();
  const { sessionId } = body;
  if (!sessionId) return errorResponse('sessionId required', 400);

  const cart = await c.env.DB.prepare(
    'SELECT id FROM carts WHERE session_id = ? AND tenant_id = ?'
  ).bind(sessionId, tenantId).first();
  if (!cart) return errorResponse('Cart not found', 404);

  const items = await c.env.DB.prepare(
    'SELECT * FROM cart_items WHERE cart_id = ?'
  ).bind(cart.id).all();
  const cartItems = items.results || [];

  if (cartItems.length === 0) return errorResponse('Cart is empty', 400);

  // Payment stub — no real payment processing
  const totalAmount = cartItems.reduce((sum, item) => sum + item.total_price, 0);

  const orderId = crypto.randomUUID();
  const seqResult = await c.env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM orders WHERE tenant_id = ?"
  ).bind(tenantId).first();
  const seq = (seqResult?.cnt || 0) + 1;
  const orderNumber = `ORD-${String(seq).padStart(6, '0')}`;

  await c.env.DB.prepare(
    `INSERT INTO orders (id, tenant_id, order_number, customer_email, total_amount, status, payment_status, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', 'pending', 'Storefront checkout', datetime('now'), datetime('now'))`
  ).bind(orderId, tenantId, orderNumber, sessionId, totalAmount).run();

  for (const item of cartItems) {
    const lineId = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO order_items (id, order_id, product_id, product_name, quantity, unit_price, total_price)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(lineId, orderId, item.product_id, item.product_id, item.quantity, item.unit_price, item.total_price).run();
  }

  await c.env.DB.prepare('DELETE FROM cart_items WHERE cart_id = ?').bind(cart.id).run();

  return jsonResponse({ orderId, orderNumber, totalAmount, status: 'pending', paymentStatus: 'pending', success: true }, 201);
});

// ── Customer Orders ────────────────────────────────────────────────────────

router.get('/orders', async (c) => {
  const scope = getScope(c);
  const tenantId = scope?.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);

  const url = new URL(c.req.url);
  const sessionId = url.searchParams.get('sessionId');
  const userId = url.searchParams.get('userId');

  let sql = 'SELECT * FROM orders WHERE tenant_id = ?';
  const binds = [tenantId];

  if (sessionId) { sql += ' AND customer_email = ?'; binds.push(sessionId); }
  if (userId) { sql += ' AND customer_email = ?'; binds.push(userId); }

  sql += ' ORDER BY created_at DESC';
  const rows = await c.env.DB.prepare(sql).bind(...binds).all();
  return jsonResponse(rows.results || []);
});

// ── CMS Pages ──────────────────────────────────────────────────────────────

router.get('/pages/:slug', async (c) => {
  const scope = getScope(c);
  const tenantId = scope?.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { slug } = c.req.param();

  const page = await c.env.DB.prepare(
    'SELECT * FROM pages WHERE slug = ? AND tenant_id = ? AND is_published = 1'
  ).bind(slug, tenantId).first();
  if (!page) return errorResponse('Page not found', 404);
  return jsonResponse(page);
});

// ── Blog ───────────────────────────────────────────────────────────────────

router.get('/blog', async (c) => {
  const scope = getScope(c);
  const tenantId = scope?.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);

  const url = new URL(c.req.url);
  const category = url.searchParams.get('category');
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
  const offset = (page - 1) * limit;

  let sql = 'SELECT id, slug, title, excerpt, category, tags, author_id, published_at, created_at FROM blog_posts WHERE tenant_id = ? AND is_published = 1';
  const binds = [tenantId];

  if (category) { sql += ' AND category = ?'; binds.push(category); }
  sql += ' ORDER BY published_at DESC LIMIT ? OFFSET ?';
  binds.push(limit, offset);

  const rows = await c.env.DB.prepare(sql).bind(...binds).all();
  return jsonResponse(rows.results || []);
});

router.get('/blog/:slug', async (c) => {
  const scope = getScope(c);
  const tenantId = scope?.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { slug } = c.req.param();

  const post = await c.env.DB.prepare(
    'SELECT * FROM blog_posts WHERE slug = ? AND tenant_id = ? AND is_published = 1'
  ).bind(slug, tenantId).first();
  if (!post) return errorResponse('Blog post not found', 404);
  return jsonResponse(post);
});

// ════════════════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS (auth required)
// ════════════════════════════════════════════════════════════════════════════

// ── Admin Pages ────────────────────────────────────────────────────────────

router.get('/admin/pages', async (c) => {
  const scope = getScope(c);
  const tenantId = scope?.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);

  const rows = await c.env.DB.prepare(
    'SELECT * FROM pages WHERE tenant_id = ? ORDER BY updated_at DESC'
  ).bind(tenantId).all();
  return jsonResponse(rows.results || []);
});

router.post('/admin/pages', async (c) => {
  const scope = getScope(c);
  const tenantId = scope?.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = pageCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const { slug, title, content, metaTitle, metaDescription, isPublished } = parsed.data;

  const existing = await c.env.DB.prepare(
    'SELECT id FROM pages WHERE slug = ? AND tenant_id = ?'
  ).bind(slug, tenantId).first();
  if (existing) return errorResponse('Page slug already exists', 409);

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO pages (id, tenant_id, slug, title, content, meta_title, meta_description, is_published)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, tenantId, slug, title, content || null, metaTitle || null, metaDescription || null, isPublished ? 1 : 0).run();

  return jsonResponse({ id, slug, title, isPublished: isPublished ? 1 : 0, success: true }, 201);
});

router.put('/admin/pages/:id', async (c) => {
  const scope = getScope(c);
  const tenantId = scope?.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = pageUpdateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);

  const existing = await c.env.DB.prepare(
    'SELECT id FROM pages WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!existing) return errorResponse('Page not found', 404);

  const data = parsed.data;
  const sets = [];
  const binds = [];
  if (data.slug !== undefined) { sets.push('slug = ?'); binds.push(data.slug); }
  if (data.title !== undefined) { sets.push('title = ?'); binds.push(data.title); }
  if (data.content !== undefined) { sets.push('content = ?'); binds.push(data.content); }
  if (data.metaTitle !== undefined) { sets.push('meta_title = ?'); binds.push(data.metaTitle); }
  if (data.metaDescription !== undefined) { sets.push('meta_description = ?'); binds.push(data.metaDescription); }
  if (data.isPublished !== undefined) { sets.push('is_published = ?'); binds.push(data.isPublished ? 1 : 0); }
  if (sets.length === 0) return jsonResponse({ success: true });
  sets.push("updated_at = datetime('now')");
  binds.push(id, tenantId);

  await c.env.DB.prepare(
    `UPDATE pages SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...binds).run();

  return jsonResponse({ success: true });
});

router.delete('/admin/pages/:id', async (c) => {
  const scope = getScope(c);
  const tenantId = scope?.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { id } = c.req.param();

  const existing = await c.env.DB.prepare(
    'SELECT id FROM pages WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!existing) return errorResponse('Page not found', 404);

  await c.env.DB.prepare(
    "UPDATE pages SET is_published = 0, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?"
  ).bind(id, tenantId).run();

  return jsonResponse({ success: true });
});

// ── Admin Blog ─────────────────────────────────────────────────────────────

router.get('/admin/blog', async (c) => {
  const scope = getScope(c);
  const tenantId = scope?.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);

  const rows = await c.env.DB.prepare(
    'SELECT * FROM blog_posts WHERE tenant_id = ? ORDER BY created_at DESC'
  ).bind(tenantId).all();
  return jsonResponse(rows.results || []);
});

router.post('/admin/blog', async (c) => {
  const scope = getScope(c);
  const tenantId = scope?.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = blogPostCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const { slug, title, content, excerpt, category, tags, authorId, isPublished } = parsed.data;

  const existing = await c.env.DB.prepare(
    'SELECT id FROM blog_posts WHERE slug = ? AND tenant_id = ?'
  ).bind(slug, tenantId).first();
  if (existing) return errorResponse('Blog post slug already exists', 409);

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO blog_posts (id, tenant_id, slug, title, content, excerpt, category, tags, author_id, is_published, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, tenantId, slug, title, content, excerpt || null, category || null, tags || null, authorId || null, isPublished ? 1 : 0, isPublished ? new Date().toISOString() : null).run();

  return jsonResponse({ id, slug, title, isPublished: isPublished ? 1 : 0, success: true }, 201);
});

router.put('/admin/blog/:id', async (c) => {
  const scope = getScope(c);
  const tenantId = scope?.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = blogPostUpdateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);

  const existing = await c.env.DB.prepare(
    'SELECT id FROM blog_posts WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!existing) return errorResponse('Blog post not found', 404);

  const data = parsed.data;
  const sets = [];
  const binds = [];
  if (data.slug !== undefined) { sets.push('slug = ?'); binds.push(data.slug); }
  if (data.title !== undefined) { sets.push('title = ?'); binds.push(data.title); }
  if (data.content !== undefined) { sets.push('content = ?'); binds.push(data.content); }
  if (data.excerpt !== undefined) { sets.push('excerpt = ?'); binds.push(data.excerpt); }
  if (data.category !== undefined) { sets.push('category = ?'); binds.push(data.category); }
  if (data.tags !== undefined) { sets.push('tags = ?'); binds.push(data.tags); }
  if (data.authorId !== undefined) { sets.push('author_id = ?'); binds.push(data.authorId); }
  if (data.isPublished !== undefined) {
    sets.push('is_published = ?'); binds.push(data.isPublished ? 1 : 0);
    if (data.isPublished) { sets.push("published_at = datetime('now')"); }
  }
  if (sets.length === 0) return jsonResponse({ success: true });
  sets.push("updated_at = datetime('now')");
  binds.push(id, tenantId);

  await c.env.DB.prepare(
    `UPDATE blog_posts SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...binds).run();

  return jsonResponse({ success: true });
});

router.delete('/admin/blog/:id', async (c) => {
  const scope = getScope(c);
  const tenantId = scope?.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { id } = c.req.param();

  const existing = await c.env.DB.prepare(
    'SELECT id FROM blog_posts WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!existing) return errorResponse('Blog post not found', 404);

  await c.env.DB.prepare(
    "UPDATE blog_posts SET is_published = 0, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?"
  ).bind(id, tenantId).run();

  return jsonResponse({ success: true });
});

// ── Admin Blog Categories ──────────────────────────────────────────────────

router.get('/admin/blog-categories', async (c) => {
  const scope = getScope(c);
  const tenantId = scope?.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);

  const rows = await c.env.DB.prepare(
    'SELECT * FROM blog_categories WHERE tenant_id = ? ORDER BY name'
  ).bind(tenantId).all();
  return jsonResponse(rows.results || []);
});

router.post('/admin/blog-categories', async (c) => {
  const scope = getScope(c);
  const tenantId = scope?.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = blogCategoryCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const { name, slug } = parsed.data;

  const existing = await c.env.DB.prepare(
    'SELECT id FROM blog_categories WHERE slug = ? AND tenant_id = ?'
  ).bind(slug, tenantId).first();
  if (existing) return errorResponse('Category slug already exists', 409);

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO blog_categories (id, tenant_id, name, slug) VALUES (?, ?, ?, ?)'
  ).bind(id, tenantId, name, slug).run();

  return jsonResponse({ id, name, slug, success: true }, 201);
});

router.delete('/admin/blog-categories/:id', async (c) => {
  const scope = getScope(c);
  const tenantId = scope?.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { id } = c.req.param();

  const existing = await c.env.DB.prepare(
    'SELECT id FROM blog_categories WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!existing) return errorResponse('Category not found', 404);

  await c.env.DB.prepare('DELETE FROM blog_categories WHERE id = ? AND tenant_id = ?').bind(id, tenantId).run();
  return jsonResponse({ success: true });
});

// ── Admin Carts & Orders Overview ──────────────────────────────────────────

router.get('/admin/carts', async (c) => {
  const scope = getScope(c);
  const tenantId = scope?.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);

  const rows = await c.env.DB.prepare(
    `SELECT c.id, c.session_id, c.user_id, c.created_at,
            COUNT(ci.id) as item_count, COALESCE(SUM(ci.total_price), 0) as total
     FROM carts c
     LEFT JOIN cart_items ci ON c.id = ci.cart_id
     WHERE c.tenant_id = ?
     GROUP BY c.id
     ORDER BY c.created_at DESC`
  ).bind(tenantId).all();
  return jsonResponse(rows.results || []);
});

router.get('/admin/orders', async (c) => {
  const scope = getScope(c);
  const tenantId = scope?.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);

  const rows = await c.env.DB.prepare(
    'SELECT * FROM orders WHERE tenant_id = ? ORDER BY created_at DESC'
  ).bind(tenantId).all();
  return jsonResponse(rows.results || []);
});

export default router;
