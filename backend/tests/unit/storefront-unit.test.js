/**
 * Storefront Module tests — products, cart, checkout, pages, blog, categories.
 *
 * Uses the same SQL-routing mock DB and mountRouter helper as financials-unit.test.js.
 */
import { describe, it, expect, vi } from 'vitest';
import storefrontRouter from '../../src/api/storefront';
import { mountRouter } from '../helpers/routerHarness';

// ── SQL-routing mock DB ─────────────────────────────────────────────────────

function makeRoutingDb() {
  const handlers = [];
  const db = {
    prepare: vi.fn((sql) => {
      const stmt = {
        bind: vi.fn((...binds) => { stmt.boundBinds = binds; return stmt; }),
        boundBinds: [],
        all: vi.fn(async () => (await runHandler(sql, stmt.boundBinds)) ?? { results: [], meta: { changes: 0 } }),
        first: vi.fn(async () => ((await runHandler(sql, stmt.boundBinds))?.results ?? [])[0] ?? null),
        run: vi.fn(async () => (await runHandler(sql, stmt.boundBinds)) ?? { meta: { changes: 1 } }),
      };
      db.statements.push(stmt);
      return stmt;
    }),
    batch: vi.fn(async () => []),
    statements: [],
  };
  function runHandler(sql, binds) {
    for (const h of handlers) {
      if (h.match.test(sql)) return h.result(binds);
    }
    return undefined;
  }
  db.on = (match, result) => {
    handlers.push({ match, result: typeof result === 'function' ? result : () => ({ results: result ?? [], meta: { changes: 1 } }) });
    return db;
  };
  return db;
}

const env = (db) => ({ DB: db });
const TENANT_HEADERS = { 'Content-Type': 'application/json', 'x-tenant-id': 't1' };
const req = (path, init = {}) =>
  new Request(`http://localhost${path}`, { headers: TENANT_HEADERS, ...init });

// ── Products ────────────────────────────────────────────────────────────────

describe('Storefront Products', () => {
  it('GET /products lists products with pagination', async () => {
    const db = makeRoutingDb()
      .on(/SELECT COUNT.*FROM pos_products/, [{ total: 1 }])
      .on(/SELECT \* FROM pos_products/, [{ id: 'p1', name: 'Tent', price: 99.99, tenant_id: 't1' }]);
    const app = mountRouter(storefrontRouter, { tenantId: 't1' });
    const res = await app.request(req('/products'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.items.length).toBe(1);
    expect(body.items[0].name).toBe('Tent');
    expect(body.total).toBe(1);
  });

  it('GET /products filters by category', async () => {
    const db = makeRoutingDb()
      .on(/SELECT COUNT.*FROM pos_products/, [{ total: 0 }])
      .on(/SELECT \* FROM pos_products/, []);
    const app = mountRouter(storefrontRouter, { tenantId: 't1' });
    const res = await app.request(req('/products?category=gear'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.items.length).toBe(0);
  });

  it('GET /products requires tenant', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(storefrontRouter, { tenantId: null });
    const res = await app.request(req('/products'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('GET /products/:id returns a product', async () => {
    const db = makeRoutingDb()
      .on(/SELECT \* FROM pos_products WHERE id/, [{ id: 'p1', name: 'Tent', price: 99.99 }]);
    const app = mountRouter(storefrontRouter, { tenantId: 't1' });
    const res = await app.request(req('/products/p1'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.name).toBe('Tent');
  });

  it('GET /products/:id returns 404 when not found', async () => {
    const db = makeRoutingDb()
      .on(/SELECT \* FROM pos_products WHERE id/, null);
    const app = mountRouter(storefrontRouter, { tenantId: 't1' });
    const res = await app.request(req('/products/missing'), {}, env(db));
    expect(res.status).toBe(404);
  });
});

// ── Cart ────────────────────────────────────────────────────────────────────

describe('Storefront Cart', () => {
  it('GET /cart returns empty when no cart exists', async () => {
    const db = makeRoutingDb().on(/SELECT \* FROM carts WHERE session_id/, null);
    const app = mountRouter(storefrontRouter, { tenantId: 't1' });
    const res = await app.request(req('/cart?sessionId=s1'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.cart).toBeNull();
    expect(body.items.length).toBe(0);
  });

  it('GET /cart requires sessionId or userId', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(storefrontRouter, { tenantId: 't1' });
    const res = await app.request(req('/cart'), {}, env(db));
    expect(res.status).toBe(400);
  });

  it('POST /cart/items adds item to new cart', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id, price FROM pos_products/, [{ id: 'p1', price: 25.0 }])
      .on(/SELECT id FROM carts WHERE session_id/, null)
      .on(/INSERT INTO carts/, { meta: { changes: 1 } })
      .on(/SELECT id, quantity FROM cart_items/, null)
      .on(/INSERT INTO cart_items/, { meta: { changes: 1 } });
    const app = mountRouter(storefrontRouter, { tenantId: 't1' });
    const res = await app.request(req('/cart/items', {
      method: 'POST',
      body: JSON.stringify({ productId: 'p1', quantity: 2, sessionId: 's1' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.quantity).toBe(2);
    expect(body.totalPrice).toBe(50.0);
  });

  it('POST /cart/items increases quantity for existing item', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id, price FROM pos_products/, [{ id: 'p1', price: 25.0 }])
      .on(/SELECT id FROM carts WHERE session_id/, [{ id: 'cart1' }])
      .on(/SELECT id, quantity FROM cart_items/, [{ id: 'ci1', quantity: 1 }])
      .on(/UPDATE cart_items SET/, { meta: { changes: 1 } });
    const app = mountRouter(storefrontRouter, { tenantId: 't1' });
    const res = await app.request(req('/cart/items', {
      method: 'POST',
      body: JSON.stringify({ productId: 'p1', quantity: 1, sessionId: 's1' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.quantity).toBe(2);
  });

  it('PUT /cart/items/:id updates quantity', async () => {
    const db = makeRoutingDb()
      .on(/SELECT ci.id, ci.unit_price FROM cart_items/, [{ id: 'ci1', unit_price: 25.0 }])
      .on(/UPDATE cart_items SET/, { meta: { changes: 1 } });
    const app = mountRouter(storefrontRouter, { tenantId: 't1' });
    const res = await app.request(req('/cart/items/ci1', {
      method: 'PUT',
      body: JSON.stringify({ quantity: 5 }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.quantity).toBe(5);
    expect(body.totalPrice).toBe(125.0);
  });

  it('DELETE /cart/items/:id removes item', async () => {
    const db = makeRoutingDb()
      .on(/SELECT ci.id FROM cart_items/, [{ id: 'ci1' }])
      .on(/DELETE FROM cart_items/, { meta: { changes: 1 } });
    const app = mountRouter(storefrontRouter, { tenantId: 't1' });
    const res = await app.request(req('/cart/items/ci1', { method: 'DELETE' }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('DELETE /cart/items/:id returns 404 when not found', async () => {
    const db = makeRoutingDb()
      .on(/SELECT ci.id FROM cart_items/, null);
    const app = mountRouter(storefrontRouter, { tenantId: 't1' });
    const res = await app.request(req('/cart/items/missing', { method: 'DELETE' }), {}, env(db));
    expect(res.status).toBe(404);
  });
});

// ── Checkout ────────────────────────────────────────────────────────────────

describe('Storefront Checkout', () => {
  it('POST /checkout creates order from cart', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM carts WHERE session_id/, [{ id: 'cart1' }])
      .on(/SELECT \* FROM cart_items WHERE cart_id/, [
        { id: 'ci1', product_id: 'p1', quantity: 2, unit_price: 50.0, total_price: 100.0 },
      ])
      .on(/SELECT COUNT.*FROM orders/, [{ cnt: 0 }])
      .on(/INSERT INTO orders/, { meta: { changes: 1 } })
      .on(/INSERT INTO order_items/, { meta: { changes: 1 } })
      .on(/DELETE FROM cart_items/, { meta: { changes: 1 } });
    const app = mountRouter(storefrontRouter, { tenantId: 't1' });
    const res = await app.request(req('/checkout', {
      method: 'POST',
      body: JSON.stringify({ sessionId: 's1' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.orderNumber).toBe('ORD-000001');
    expect(body.totalAmount).toBe(100.0);
    expect(body.paymentStatus).toBe('pending');
  });

  it('POST /checkout returns 400 for empty cart', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM carts WHERE session_id/, [{ id: 'cart1' }])
      .on(/SELECT \* FROM cart_items WHERE cart_id/, []);
    const app = mountRouter(storefrontRouter, { tenantId: 't1' });
    const res = await app.request(req('/checkout', {
      method: 'POST',
      body: JSON.stringify({ sessionId: 's1' }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });

  it('POST /checkout returns 404 when cart not found', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM carts WHERE session_id/, null);
    const app = mountRouter(storefrontRouter, { tenantId: 't1' });
    const res = await app.request(req('/checkout', {
      method: 'POST',
      body: JSON.stringify({ sessionId: 's1' }),
    }), {}, env(db));
    expect(res.status).toBe(404);
  });
});

// ── Customer Orders ─────────────────────────────────────────────────────────

describe('Storefront Orders', () => {
  it('GET /orders lists orders by session', async () => {
    const db = makeRoutingDb()
      .on(/SELECT \* FROM orders/, [{ id: 'o1', order_number: 'ORD-000001', status: 'pending' }]);
    const app = mountRouter(storefrontRouter, { tenantId: 't1' });
    const res = await app.request(req('/orders?sessionId=s1'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.length).toBe(1);
  });
});

// ── CMS Pages ───────────────────────────────────────────────────────────────

describe('Storefront CMS Pages', () => {
  it('GET /pages/:slug returns published page', async () => {
    const db = makeRoutingDb()
      .on(/SELECT \* FROM pages WHERE slug/, [{ id: 'pg1', slug: 'about', title: 'About Us', is_published: 1 }]);
    const app = mountRouter(storefrontRouter, { tenantId: 't1' });
    const res = await app.request(req('/pages/about'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.slug).toBe('about');
  });

  it('GET /pages/:slug returns 404 for unpublished', async () => {
    const db = makeRoutingDb()
      .on(/SELECT \* FROM pages WHERE slug/, null);
    const app = mountRouter(storefrontRouter, { tenantId: 't1' });
    const res = await app.request(req('/pages/draft'), {}, env(db));
    expect(res.status).toBe(404);
  });

  it('GET /admin/pages lists all pages', async () => {
    const db = makeRoutingDb()
      .on(/SELECT \* FROM pages WHERE tenant_id/, [{ id: 'pg1', title: 'Home', slug: 'home' }]);
    const app = mountRouter(storefrontRouter, { tenantId: 't1' });
    const res = await app.request(req('/admin/pages'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.length).toBe(1);
  });

  it('POST /admin/pages creates a page', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM pages WHERE slug/, null)
      .on(/INSERT INTO pages/, { meta: { changes: 1 } });
    const app = mountRouter(storefrontRouter, { tenantId: 't1' });
    const res = await app.request(req('/admin/pages', {
      method: 'POST',
      body: JSON.stringify({ slug: 'faq', title: 'FAQ', content: '<p>Content</p>' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.slug).toBe('faq');
  });

  it('POST /admin/pages rejects duplicate slug', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM pages WHERE slug/, [{ id: 'existing' }]);
    const app = mountRouter(storefrontRouter, { tenantId: 't1' });
    const res = await app.request(req('/admin/pages', {
      method: 'POST',
      body: JSON.stringify({ slug: 'faq', title: 'FAQ' }),
    }), {}, env(db));
    expect(res.status).toBe(409);
  });

  it('PUT /admin/pages/:id updates a page', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM pages WHERE id/, [{ id: 'pg1' }])
      .on(/UPDATE pages SET/, { meta: { changes: 1 } });
    const app = mountRouter(storefrontRouter, { tenantId: 't1' });
    const res = await app.request(req('/admin/pages/pg1', {
      method: 'PUT',
      body: JSON.stringify({ title: 'Updated Title' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('DELETE /admin/pages/:id soft-deletes a page', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM pages WHERE id/, [{ id: 'pg1' }])
      .on(/UPDATE pages SET/, { meta: { changes: 1 } });
    const app = mountRouter(storefrontRouter, { tenantId: 't1' });
    const res = await app.request(req('/admin/pages/pg1', { method: 'DELETE' }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// ── Blog Posts ──────────────────────────────────────────────────────────────

describe('Storefront Blog', () => {
  it('GET /blog lists published posts', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id, slug, title.*FROM blog_posts/, [{ id: 'b1', slug: 'hello', title: 'Hello World', is_published: 1 }]);
    const app = mountRouter(storefrontRouter, { tenantId: 't1' });
    const res = await app.request(req('/blog'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.length).toBe(1);
    expect(body[0].title).toBe('Hello World');
  });

  it('GET /blog/:slug returns a published post', async () => {
    const db = makeRoutingDb()
      .on(/SELECT \* FROM blog_posts WHERE slug/, [{ id: 'b1', slug: 'hello', title: 'Hello', is_published: 1 }]);
    const app = mountRouter(storefrontRouter, { tenantId: 't1' });
    const res = await app.request(req('/blog/hello'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.slug).toBe('hello');
  });

  it('GET /blog/:slug returns 404 for draft', async () => {
    const db = makeRoutingDb()
      .on(/SELECT \* FROM blog_posts WHERE slug/, null);
    const app = mountRouter(storefrontRouter, { tenantId: 't1' });
    const res = await app.request(req('/blog/draft-post'), {}, env(db));
    expect(res.status).toBe(404);
  });

  it('POST /admin/blog creates a post', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM blog_posts WHERE slug/, null)
      .on(/INSERT INTO blog_posts/, { meta: { changes: 1 } });
    const app = mountRouter(storefrontRouter, { tenantId: 't1' });
    const res = await app.request(req('/admin/blog', {
      method: 'POST',
      body: JSON.stringify({ slug: 'new-post', title: 'New Post', content: '<p>Content here</p>', isPublished: true }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.slug).toBe('new-post');
  });

  it('POST /admin/blog rejects duplicate slug', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM blog_posts WHERE slug/, [{ id: 'existing' }]);
    const app = mountRouter(storefrontRouter, { tenantId: 't1' });
    const res = await app.request(req('/admin/blog', {
      method: 'POST',
      body: JSON.stringify({ slug: 'existing', title: 'Dup', content: '<p>Hi</p>' }),
    }), {}, env(db));
    expect(res.status).toBe(409);
  });

  it('PUT /admin/blog/:id updates a post', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM blog_posts WHERE id/, [{ id: 'b1' }])
      .on(/UPDATE blog_posts SET/, { meta: { changes: 1 } });
    const app = mountRouter(storefrontRouter, { tenantId: 't1' });
    const res = await app.request(req('/admin/blog/b1', {
      method: 'PUT',
      body: JSON.stringify({ title: 'Updated Post' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('DELETE /admin/blog/:id soft-deletes a post', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM blog_posts WHERE id/, [{ id: 'b1' }])
      .on(/UPDATE blog_posts SET/, { meta: { changes: 1 } });
    const app = mountRouter(storefrontRouter, { tenantId: 't1' });
    const res = await app.request(req('/admin/blog/b1', { method: 'DELETE' }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// ── Blog Categories ─────────────────────────────────────────────────────────

describe('Storefront Blog Categories', () => {
  it('GET /admin/blog-categories lists categories', async () => {
    const db = makeRoutingDb()
      .on(/SELECT \* FROM blog_categories/, [{ id: 'cat1', name: 'Travel', slug: 'travel' }]);
    const app = mountRouter(storefrontRouter, { tenantId: 't1' });
    const res = await app.request(req('/admin/blog-categories'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.length).toBe(1);
    expect(body[0].name).toBe('Travel');
  });

  it('POST /admin/blog-categories creates a category', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM blog_categories WHERE slug/, null)
      .on(/INSERT INTO blog_categories/, { meta: { changes: 1 } });
    const app = mountRouter(storefrontRouter, { tenantId: 't1' });
    const res = await app.request(req('/admin/blog-categories', {
      method: 'POST',
      body: JSON.stringify({ name: 'Tips', slug: 'tips' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.name).toBe('Tips');
  });

  it('POST /admin/blog-categories rejects duplicate slug', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM blog_categories WHERE slug/, [{ id: 'existing' }]);
    const app = mountRouter(storefrontRouter, { tenantId: 't1' });
    const res = await app.request(req('/admin/blog-categories', {
      method: 'POST',
      body: JSON.stringify({ name: 'Dup', slug: 'tips' }),
    }), {}, env(db));
    expect(res.status).toBe(409);
  });

  it('DELETE /admin/blog-categories/:id removes a category', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM blog_categories WHERE id/, [{ id: 'cat1' }])
      .on(/DELETE FROM blog_categories/, { meta: { changes: 1 } });
    const app = mountRouter(storefrontRouter, { tenantId: 't1' });
    const res = await app.request(req('/admin/blog-categories/cat1', { method: 'DELETE' }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// ── Tenant Isolation ────────────────────────────────────────────────────────

describe('Storefront Tenant Isolation', () => {
  it('rejects requests without tenant', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(storefrontRouter, { tenantId: null });
    const res = await app.request(req('/products'), {}, env(db));
    expect(res.status).toBe(400);
  });

  it('admin endpoints require tenant', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(storefrontRouter, { tenantId: null });
    const res = await app.request(req('/admin/pages'), {}, env(db));
    expect(res.status).toBe(400);
  });

  it('blog admin endpoints require tenant', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(storefrontRouter, { tenantId: null });
    const res = await app.request(req('/admin/blog'), {}, env(db));
    expect(res.status).toBe(400);
  });

  it('cart endpoints require tenant', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(storefrontRouter, { tenantId: null });
    const res = await app.request(req('/cart?sessionId=s1'), {}, env(db));
    expect(res.status).toBe(400);
  });
});
