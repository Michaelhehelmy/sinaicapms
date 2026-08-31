import { Hono } from 'hono';
import { z } from 'zod';
import { verifyToken, verifyPassword, generateToken, rehashIfNeeded } from '../../middleware/sharedAuth.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { jsonResponse, errorResponse } from '../../utils/response.js';
import { parsePagination, paginationEnvelope } from '../../utils/pagination.js';
import { validationError } from '../../utils/errors.js';
import { withSunset } from '../../utils/deprecation.js';

const pos = new Hono();

// ─── POS order validation ───────────────────────────────────
// Structural validation only: per-item quantity/price checks stay in the handler
// so their error messages can include the product name (asserted by unit tests).
const posOrderItemSchema = z.object({
  productId: z.string({ message: 'Product ID is required' }).min(1, 'Product ID is required'),
  quantity: z.number({ message: 'Quantity must be a number' }),
}).strip();

const posOrderSchema = z.object({
  items: z.array(posOrderItemSchema)
    .min(1, 'Order must contain at least one item')
    .max(100, 'Order has too many items (max 100)'),
  paymentMethod: z.enum(['cash', 'card', 'split'], { message: 'Invalid payment method' }).optional(),
  notes: z.string({ message: 'Notes must be text' }).max(500, 'Notes must be 500 characters or less').optional(),
  amountCash: z.number({ message: 'Cash amount must be a number' }).min(0, 'Cash amount cannot be negative').optional(),
  amountCard: z.number({ message: 'Card amount must be a number' }).min(0, 'Card amount cannot be negative').optional(),
  idempotencyKey: z.string({ message: 'Idempotency key must be text' }).max(64, 'Idempotency key is too long').optional(),
  // 0069 Restaurant pillar: optional dine-in table. Must belong to the
  // cashier's tenant; the referenced table is flipped to 'occupied' in the
  // commit batch below.
  tableId: z.string({ message: 'Table ID must be text' }).max(64, 'Table ID is too long').optional(),
  // Client-side tip display — accepted so it's not silently stripped.
  // TODO: Add tip_amount column to pos_transactions and persist it.
  tipAmount: z.number().min(0).optional(),
}).strip();

const posRefreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required').optional(),
}).strip();

// Shared by login + refresh: resolve organization_id → tenant_id via the
// mapping table (fallback to String(organization_id) keeps legacy behavior).
async function resolveOrgTenantId(env, organizationId) {
  try {
    const { results } = await env.DB.prepare(
      "SELECT tenant_id FROM tenant_org_mapping WHERE organization_id = ?"
    ).bind(organizationId).all();
    if (results.length > 0) {
      return results[0].tenant_id;
    }
    return String(organizationId);
  } catch (e) {
    console.warn('[POS AUTH] tenant_org_mapping lookup failed, using organization_id:', e.message);
    return String(organizationId);
  }
}

// Shared by login + refresh: expose the org tax rate so terminals render
// server-driven tax. Falls back to null → client uses 0.1.
async function getOrgTaxRate(env, organizationId) {
  try {
    const { results } = await env.DB.prepare(
      "SELECT tax_rate FROM pos_organizations WHERE id = ?"
    ).bind(organizationId).all();
    if (results.length > 0 && results[0].tax_rate != null) {
      return parseFloat(results[0].tax_rate);
    }
  } catch { /* taxRate stays null */ }
  return null;
}

// ─── POS Auth Middleware ────────────────────────────────────
async function posAuth(c, next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse('Unauthorized', 401);
  }
  const token = authHeader.split(' ')[1];
  const secret = c.env.JWT_SECRET;
  const decoded = await verifyToken(token, secret);
  if (!decoded || decoded.posType !== 'pos') {
    return errorResponse('Invalid POS session', 401);
  }
  // Database check: verify cashier is still active and not deleted
  const { results: userCheck } = await c.env.DB.prepare(
    "SELECT is_active FROM pos_users WHERE id = ? AND deleted_at IS NULL"
  ).bind(decoded.userId).all();
  if (userCheck.length === 0 || !userCheck[0].is_active) {
    return errorResponse('Session revoked or account deactivated', 401);
  }
  c.set('posUser', decoded);
  await next();
}

// ─── POST /login ───────────────────────────────────────────
// Phase 9: the handler is shared by the legacy POS path (deprecated, Sunset)
// and the consolidated canonical mount POST /api/auth/pos-login in index.js.
export async function handlePosLoginRequest(request, env) {
  try {
    const { identifier, password } = await request.json();
    if (!identifier || !password) {
      return errorResponse('Identifier and password required', 400);
    }

    const { results } = await env.DB.prepare(
      `SELECT id, organization_id, store_id, username, email, first_name, last_name,
              password_hash, role, is_active
       FROM pos_users
       WHERE (email = ? OR username = ?) AND deleted_at IS NULL`
    ).bind(identifier, identifier).all();

    if (results.length === 0) {
      return errorResponse('Invalid credentials', 401);
    }

    const user = results[0];
    if (!user.is_active) {
      return errorResponse('Account deactivated', 403);
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return errorResponse('Invalid credentials', 401);
    }

    // Phase 5 session-lifecycle parity: legacy $sha256$ hashes in pos_users
    // are upgraded to bcrypt on successful login (same as admin login).
    await rehashIfNeeded(user.id, password, user.password_hash, env, { table: 'pos_users' });

    // Resolve organization_id → tenant_id via mapping table
    const tenantId = await resolveOrgTenantId(env, user.organization_id);

    // Expose the org tax rate so the POS terminal renders server-driven tax
    // instead of a client-side hardcoded rate.
    const taxRate = await getOrgTaxRate(env, user.organization_id);

    // Token contract v2 + legacy tag both emitted; access TTL honours
    // POS_ACCESS_TTL_SECONDS when configured (env passed as 4th arg).
    const claims = {
      sub: String(user.id),
      userId: String(user.id),
      tenantId,
      organizationId: user.organization_id,
      storeId: user.store_id,
      role: user.role,
      posType: 'pos',
      userType: 'org',
    };
    const token = await generateToken({ ...claims }, env.JWT_SECRET, 'access', env);
    const refreshToken = await generateToken(claims, env.JWT_SECRET, 'refresh');

    await env.DB.prepare(
      `UPDATE pos_users SET last_login_at = datetime('now') WHERE id = ?`
    ).bind(user.id).run();

    return jsonResponse({
      success: true,
      token,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        organizationId: user.organization_id,
        storeId: user.store_id,
        taxRate,
      },
    });
  } catch (e) {
    return errorResponse('Login failed', 500);
  }
}

// Legacy surface: still served during the Phase 9 transition, marked
// deprecated (Deprecation + Sunset). Canonical path is POST /api/auth/pos-login.
pos.post('/auth/login', async (c) => withSunset(await handlePosLoginRequest(c.req.raw, c.env)));

// ─── POST /auth/refresh (Phase 5: POS session-lifecycle parity) ───
// Gated by requireAuth({realm:'pos'}) — the ONE auth gate (plan §7.2).
// Accepts the refresh token issued by /auth/login as `Authorization:
// Bearer <refresh>` OR `{ refreshToken }` in the body; header wins when both
// are present. The gate enforces signature → realm → is_active ∧ deleted_at
// on every call, so deactivated/deleted cashiers can never refresh.
//
// Rotation here is stateless RE-ISSUE (same design as POST /api/auth/refresh):
// each call returns a NEW refresh token while previously issued ones remain
// valid until their own 7d expiry — there is no revocation table yet.
// Cryptographic invalidation of superseded tokens lands with the D1-backed
// refresh_tokens table (backend/REFRESH_TOKENS_DESIGN.md, post-plan build).
const posRefreshGate = requireAuth({
  realm: 'pos',
  requireTenant: false,
  // An admin/platform refresh token presented to the POS realm is a type
  // error, not an authorization hierarchy statement.
  realmMismatch: { status: 401, message: 'Invalid token type' },
});

pos.post('/auth/refresh', async (c) => {
  const env = c.env;
  try {
    let rawBody = {};
    try { rawBody = await c.req.json(); } catch { /* empty body → header-only */ }
    const parsed = posRefreshSchema.safeParse(rawBody ?? {});
    if (!parsed.success) {
      return validationError(parsed);
    }

    const bearerHeader = c.req.header('Authorization') || '';
    const hasBearer = bearerHeader.startsWith('Bearer ');
    const bodyToken = typeof parsed.data.refreshToken === 'string' ? parsed.data.refreshToken.trim() : '';
    if (!hasBearer && !bodyToken) {
      return errorResponse('Missing or invalid Authorization header or refreshToken body field', 401);
    }

    // requireAuth reads the Bearer header — feed it whichever source won.
    const probeRequest = hasBearer
      ? c.req.raw
      : new Request(c.req.url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${bodyToken}` },
        });

    const auth = await posRefreshGate(probeRequest, env);
    if (auth instanceof Response) return auth;

    // Access tokens must never be replayed as refresh material
    // (admin-refresh parity: "Invalid token type").
    if (auth.user.type !== 'refresh') {
      return errorResponse('Invalid token type', 401);
    }

    const userId = auth.user.userId || auth.user.sub;
    const { results } = await env.DB.prepare(
      `SELECT id, organization_id, store_id, username, email, first_name, last_name, role
       FROM pos_users WHERE id = ? AND deleted_at IS NULL`
    ).bind(userId).all();
    if (results.length === 0) {
      return errorResponse('Invalid or expired refresh token', 401);
    }
    const user = results[0];

    const tenantId = await resolveOrgTenantId(env, user.organization_id);
    const taxRate = await getOrgTaxRate(env, user.organization_id);

    // Token contract v2 + legacy tag both emitted; access TTL honours
    // POS_ACCESS_TTL_SECONDS when configured (env passed as 4th arg).
    const claims = {
      sub: String(user.id),
      userId: String(user.id),
      tenantId,
      organizationId: user.organization_id,
      storeId: user.store_id,
      role: user.role,
      posType: 'pos',
      userType: 'org',
    };
    const token = await generateToken(claims, env.JWT_SECRET, 'access', env);
    const refreshToken = await generateToken({ ...claims }, env.JWT_SECRET, 'refresh');

    return jsonResponse({
      success: true,
      token,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        organizationId: user.organization_id,
        storeId: user.store_id,
        taxRate,
      },
    });
  } catch (e) {
    console.error('[POS REFRESH ERROR]', e.message);
    return errorResponse('Failed to process refresh', 500);
  }
});
// ── All routes below require POS auth ──────────────────────
pos.use('/*', posAuth);

// ─── GET /products ─────────────────────────────────────────
pos.get('/products', async (c) => {
  const env = c.env;
  const orgId = c.get('posUser').organizationId;
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, sku, name, description, selling_price, cost_price, category_id,
              type, image_url, is_active, stock_quantity
       FROM pos_products
       WHERE organization_id = ? AND deleted_at IS NULL AND is_active = 1
       ORDER BY name`
    ).bind(orgId).all();
    return jsonResponse(results);
  } catch (e) {
    return errorResponse('Failed to fetch products', 500);
  }
});

// ─── POST /orders ──────────────────────────────────────────
pos.post('/orders', async (c) => {
  const env = c.env;
  try {
    const body = await c.req.json();
    const parsed = posOrderSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(parsed);
    }
    const posUser = c.get('posUser');
    const tenantId = posUser.tenantId;
    const organizationId = posUser.organizationId;
    const { items, paymentMethod, notes, amountCash, amountCard, tipAmount } = parsed.data;
    const idempotencyKeyRaw = typeof parsed.data.idempotencyKey === 'string' ? parsed.data.idempotencyKey.trim() : '';
    const idempotencyKey = idempotencyKeyRaw.length > 0 && idempotencyKeyRaw.length <= 64 ? idempotencyKeyRaw : null;
    // 0069: optional dine-in table — empty string normalizes to null.
    const tableIdRaw = typeof parsed.data.tableId === 'string' ? parsed.data.tableId.trim() : '';
    const tableId = tableIdRaw.length > 0 && tableIdRaw.length <= 64 ? tableIdRaw : null;

    const loadExistingOrder = async (key) => {
      const { results: existing } = await env.DB.prepare(
        `SELECT id, order_number, subtotal, tax_amount, total_amount, payment_method,
                amount_cash, amount_card, status, table_id, kitchen_status, created_at
         FROM pos_transactions
         WHERE idempotency_key = ? AND tenant_id = ? AND cashier_id = ?`
      ).bind(key, tenantId, String(posUser.userId)).all();

      if (existing.length === 0) return null;

      const found = existing[0];
      const { results: existingItems } = await env.DB.prepare(
        `SELECT ti.*, p.name AS product_name, p.sku
         FROM pos_transaction_items ti
         LEFT JOIN pos_products p ON p.id = ti.product_id
         WHERE ti.order_id = ? AND ti.tenant_id = ?`
      ).bind(found.id, tenantId).all();

      return jsonResponse({
        success: true,
        deduplicated: true,
        order: {
          id: found.id,
          orderNumber: found.order_number,
          subtotal: found.subtotal,
          taxAmount: found.tax_amount,
          totalAmount: found.total_amount,
          paymentMethod: found.payment_method,
          amountCash: found.amount_cash,
          amountCard: found.amount_card,
          status: found.status,
          tableId: found.table_id,
          kitchenStatus: found.kitchen_status,
          items: existingItems.map((r) => ({
            id: r.id,
            productId: r.product_id,
            productName: r.product_name,
            sku: r.sku,
            quantity: r.quantity,
            unitPrice: r.unit_price,
            totalAmount: r.total_amount,
          })),
        },
      });
    };

    if (idempotencyKey) {
      const existingResponse = await loadExistingOrder(idempotencyKey);
      if (existingResponse) return existingResponse;
    }

    const orderId = 'ord_' + crypto.randomUUID().slice(0, 12);
    const orderNumber = 'ORD-' + Date.now().toString(36).toUpperCase();
    let subtotal = 0;

    // Bulk-fetch all ordered products in one query (was N+1 per line item)
    const productIds = items.map((i) => i.productId);
    const placeholders = productIds.map(() => '?').join(',');
    const { results: productRows } = await env.DB.prepare(
      `SELECT id, selling_price, name, category_id FROM pos_products
       WHERE id IN (${placeholders}) AND organization_id = ?`
    ).bind(...productIds, organizationId).all();
    const productMap = new Map(productRows.map((p) => [p.id, p]));

    const itemRows = [];
    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product) {
        return errorResponse(`Product ${item.productId} not found`, 400);
      }
      const qty = Number(item.quantity);
      if (!Number.isInteger(qty) || qty < 1 || qty > 9999) {
        return errorResponse(`Invalid quantity for ${product.name}: must be an integer between 1 and 9999`, 400);
      }
      const unitPrice = parseFloat(product.selling_price);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return errorResponse(`Invalid price for ${product.name}`, 400);
      }
      const lineTotal = unitPrice * qty;
      subtotal += lineTotal;
      itemRows.push({
        id: 'ti_' + crypto.randomUUID().slice(0, 12),
        tenantId,
        orderId,
        productId: item.productId,
        quantity: qty,
        unitPrice,
        subtotal: lineTotal,
        totalAmount: lineTotal,
      });
    }

    // ── Apply promotions (0071) ────────────────────────────
    // Best promo per item wins; discounts are applied BEFORE tax.
    const round2 = (n) => Math.round(n * 100) / 100;
    const categoryByProduct = new Map(productRows.map((p) => [p.id, p.category_id]));
    let totalDiscount = 0;
    const discountRows = [];

    try {
      const today = new Date().toISOString().slice(0, 10);
      const dow = new Date().getUTCDay();
      const { results: promoRows } = await env.DB.prepare(
        'SELECT * FROM promotions WHERE tenant_id = ? AND is_active = 1'
      ).bind(tenantId).all();

      const eligiblePromos = promoRows.filter((p) => {
        if (p.day_of_week != null && p.day_of_week !== dow) return false;
        if (p.start_date && today < p.start_date) return false;
        if (p.end_date && today > p.end_date) return false;
        if ((p.min_purchase || 0) > subtotal) return false;
        return true;
      });

      if (eligiblePromos.length > 0) {
        const matchesItem = (promo, productId) => {
          if (promo.applies_to === 'product') return promo.applies_to_id === productId;
          if (promo.applies_to === 'category') {
            const catId = categoryByProduct.get(productId);
            return catId != null && promo.applies_to_id === catId;
          }
          return true; // applies_to === 'all'
        };

        const discountFor = (promo, unitPrice, quantity) => {
          if (promo.type === 'percentage') {
            return round2(unitPrice * quantity * ((promo.value || 0) / 100));
          }
          if (promo.type === 'fixed') {
            return round2(Math.min(promo.value || 0, unitPrice) * quantity);
          }
          // bogo: every second unit free
          return round2(Math.floor(quantity / 2) * unitPrice);
        };

        for (const row of itemRows) {
          let best = null;
          for (const promo of eligiblePromos) {
            if (!matchesItem(promo, row.productId)) continue;
            const discount = discountFor(promo, row.unitPrice, row.quantity);
            if (discount > 0 && (!best || discount > best.discount)) {
              best = { discount, promotionId: promo.id, promotionName: promo.name, type: promo.type, value: promo.value };
            }
          }
          if (best) {
            totalDiscount += best.discount;
            discountRows.push({
              id: 'disc_' + crypto.randomUUID().slice(0, 12),
              tenantId,
              orderId,
              transactionItemId: row.id,
              promotionId: best.promotionId,
              promotionName: best.promotionName,
              discountType: best.type,
              discountValue: best.value,
              discountAmount: best.discount,
            });
            // Adjust item total to reflect discount
            row.totalAmount = round2(row.totalAmount - best.discount);
            row.subtotal = row.totalAmount;
          }
        }
        totalDiscount = round2(totalDiscount);
      }
    } catch {
      // Promotion lookup is best-effort — never fail the order.
    }

    // ── Validate dine-in table ownership (0069) ───────────
    // Only queried when a tableId was supplied so takeout flows (and legacy
    // clients) keep their exact DB call sequence.
    if (tableId) {
      const { results: tableRows } = await env.DB.prepare(
        `SELECT id FROM pos_tables WHERE id = ? AND tenant_id = ?`
      ).bind(tableId, tenantId).all();
      if (tableRows.length === 0) {
        return errorResponse(`Table ${tableId} not found`, 400);
      }
    }

    // F10 fix: org tax rate lives in pos_organizations (tenants has no tax_rate column)
    let taxRate = 0.1;
    try {
      const { results: orgRows } = await env.DB.prepare(
        "SELECT tax_rate FROM pos_organizations WHERE id = ?"
      ).bind(organizationId).all();
      if (orgRows.length > 0 && orgRows[0].tax_rate != null) {
        taxRate = parseFloat(orgRows[0].tax_rate);
      }
    } catch { /* use default */ }

    // Tax is calculated on the discounted subtotal (promotions applied before tax)
    const discountedSubtotal = Math.max(0, round2(subtotal - totalDiscount));
    const taxAmount = round2(discountedSubtotal * taxRate);
    const totalAmount = round2(discountedSubtotal + taxAmount);

    // ── Split payment amounts ─────────────────────────────
    let finalAmountCash = 0;
    let finalAmountCard = 0;
    // `paymentMethod` was validated against the enum by zod; missing → cash.
    const method = paymentMethod || 'cash';
    if (method === 'split') {
      finalAmountCash = parseFloat(amountCash) || 0;
      finalAmountCard = parseFloat(amountCard) || 0;
      const paymentSum = Math.round((finalAmountCash + finalAmountCard) * 100) / 100;
      const totalRound = Math.round(totalAmount * 100) / 100;
      if (Math.abs(paymentSum - totalRound) > 0.01) {
        return errorResponse(`Split payment sum ($${paymentSum.toFixed(2)}) does not match total ($${totalRound.toFixed(2)})`, 400);
      }
    } else if (method === 'card') {
      finalAmountCard = totalAmount;
    } else {
      finalAmountCash = totalAmount;
    }

    // ── Recipe inventory deduction ─────────────────────────
    const stockDeductions = [];
    for (const item of itemRows) {
      const { results: recipes } = await env.DB.prepare(
        `SELECT ingredient_id, quantity FROM pos_recipe_ingredients WHERE product_id = ? AND tenant_id = ?`
      ).bind(item.productId, tenantId).all();

      for (const recipe of recipes) {
        const required = item.quantity * recipe.quantity;
        const { results: stockRows } = await env.DB.prepare(
          `SELECT id, name, stock_quantity FROM pos_products WHERE id = ? AND organization_id = ?`
        ).bind(recipe.ingredient_id, organizationId).all();

        if (stockRows.length === 0) continue;
        const ingredient = stockRows[0];
        const stock = parseFloat(ingredient.stock_quantity) || 0;

        if (stock < required) {
          return errorResponse(
            `Insufficient stock for ingredient: ${ingredient.name} (Need ${required}, Have ${stock})`,
            400
          );
        }
        stockDeductions.push({ id: recipe.ingredient_id, deduct: required });
      }
    }

    // ── Deduct sold products from master stock ─────────────
    // Recipe deductions above handle INGREDIENTS; this handles the product ITSELF.
    // Critical for supermarkets: selling 100 Cokes must reduce Coke stock by 100.
    const productStockDeductions = [];
    for (const row of itemRows) {
      productStockDeductions.push({
        id: row.productId,
        deduct: row.quantity,
      });
    }

    // ── Resolve the order's store ─────────────────────────
    // Store id 1 was the pre-0051 seed store; on a fresh DB it does not exist
    // and inserting a transaction against it fails the store_id FK, so when
    // the cashier has no store assigned look up the tenant's real store.
    let storeId = posUser.storeId;
    if (storeId == null) {
      const { results: orgStores } = await env.DB.prepare(
        'SELECT id FROM pos_stores WHERE organization_id = ? LIMIT 1'
      ).bind(organizationId).all();
      storeId = orgStores.length > 0 ? orgStores[0].id : 1;
    }

    // ── Commit all mutations atomically in one batch ──────
    // Product self-deductions go FIRST, then recipe ingredient deductions. Both
    // share the atomic conditional pattern below AND the deductionIndexes /
    // compensation guard, so `allDeductions` must be the single source of truth
    // for both statement generation and rollback bookkeeping.
    const allDeductions = [...productStockDeductions, ...stockDeductions];
    const statements = [];
    const deductionIndexes = [];

    for (const deduction of allDeductions) {
      deductionIndexes.push(statements.length);
      // Atomic conditional deduction: affects 0 rows if stock ran out between the
      // read check above and commit (concurrent terminal) — stock never goes negative.
      statements.push(
        env.DB.prepare(
          `UPDATE pos_products SET stock_quantity = stock_quantity - ?
           WHERE id = ? AND organization_id = ? AND stock_quantity >= ?`
        ).bind(deduction.deduct, deduction.id, organizationId, deduction.deduct)
      );
    }

    statements.push(
      env.DB.prepare(
        `INSERT INTO pos_transactions
          (id, tenant_id, organization_id, store_id, order_number, cashier_id,
           status, subtotal, tax_amount, tax_rate, total_amount,
           paid_amount, payment_method, payment_status, notes,
            amount_cash, amount_card, idempotency_key, table_id, kitchen_status,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))`
      ).bind(
        orderId, tenantId, organizationId, storeId, orderNumber,
        String(posUser.userId),
        discountedSubtotal, taxAmount, taxRate, totalAmount,
        totalAmount, method,
        notes || null,
        finalAmountCash, finalAmountCard,
        idempotencyKey || null,
        tableId
      )
    );

    // 0069: a dine-in order occupies its table in the SAME commit batch —
    // the sale and the floor state land together or not at all. Placed after
    // every deduction statement so the deductionIndexes/compensation guard
    // below is untouched.
    if (tableId) {
      statements.push(
        env.DB.prepare(
          `UPDATE pos_tables SET status = 'occupied' WHERE id = ? AND tenant_id = ?`
        ).bind(tableId, tenantId)
      );
    }

    for (const row of itemRows) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO pos_transaction_items
            (id, tenant_id, order_id, product_id, quantity, unit_price, subtotal, tax_amount, total_amount, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, datetime('now'), datetime('now'))`
        ).bind(row.id, row.tenantId, row.orderId, row.productId, row.quantity, row.unitPrice, row.subtotal, row.totalAmount)
      );
    }

    // ── Order discount records (0071) ──────────────────────
    for (const disc of discountRows) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO order_discounts
            (id, tenant_id, order_id, transaction_item_id, promotion_id, promotion_name,
             discount_type, discount_value, discount_amount, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        ).bind(
          disc.id, disc.tenantId, disc.orderId, disc.transactionItemId,
          disc.promotionId, disc.promotionName, disc.discountType,
          disc.discountValue, disc.discountAmount
        )
      );
    }

    let batchResults;
    try {
      batchResults = await env.DB.batch(statements);
    } catch (e) {
      if (idempotencyKey && String(e.message).includes('UNIQUE constraint failed')) {
        const existingResponse = await loadExistingOrder(idempotencyKey);
        if (existingResponse) return existingResponse;
      }
      throw e;
    }

    // Post-batch guard: if a conditional deduction affected 0 rows (stock raced out
    // under a concurrent terminal), compensate — undo the stock already applied and
    // remove the orphan order so the ledger stays consistent. The read check above
    // catches the common case; this closes the remaining race window. D1 batch()
    // resolves one result per statement, in order. Indexes refer into allDeductions
    // (product self-deductions + recipe ingredient deductions).
    if (
      deductionIndexes.length > 0 &&
      Array.isArray(batchResults) &&
      batchResults.length >= deductionIndexes.length
    ) {
      const shortedIdx = deductionIndexes.findIndex((idx) => (batchResults[idx]?.meta?.changes ?? 1) === 0);
      if (shortedIdx !== -1) {
        const compensate = [];
        for (let i = 0; i < deductionIndexes.length; i++) {
          if (i !== shortedIdx && (batchResults[deductionIndexes[i]]?.meta?.changes ?? 0) > 0) {
            compensate.push(
              env.DB.prepare(
                `UPDATE pos_products SET stock_quantity = stock_quantity + ? WHERE id = ?`
              ).bind(allDeductions[i].deduct, allDeductions[i].id)
            );
          }
        }
        compensate.push(
          env.DB.prepare(`DELETE FROM pos_transaction_items WHERE order_id = ?`).bind(orderId)
        );
        compensate.push(
          env.DB.prepare(`DELETE FROM pos_transactions WHERE id = ?`).bind(orderId)
        );
        if (compensate.length > 0) {
          await env.DB.batch(compensate).catch(() => {});
        }
        return errorResponse(
          'Insufficient stock for an item in your order (stock changed under concurrent checkout). Please retry.',
          400
        );
      }
    }

    // ── Low-stock inbox alerts (best-effort) ─────────────────────────────
    // After a committed sale, flag any sold product now sitting at/below its
    // reorder threshold (but not fully out of stock). Best-effort by design:
    // any failure here must never fail the order response.
    try {
      const soldIds = [...new Set(itemRows.map((r) => r.productId))];
      if (soldIds.length > 0) {
        const stockPlaceholders = soldIds.map(() => '?').join(',');
        const { results: stockRows } = await env.DB.prepare(
          `SELECT id, name, stock_quantity, min_stock_level FROM pos_products
           WHERE id IN (${stockPlaceholders}) AND organization_id = ?`
        ).bind(...soldIds, organizationId).all();

        const alertStmts = [];
        for (const product of stockRows) {
          const qty = parseFloat(product.stock_quantity) || 0;
          const minLevel = product.min_stock_level == null ? 0 : (parseFloat(product.min_stock_level) || 0);
          if (qty > 0 && qty <= minLevel) {
            alertStmts.push(
              env.DB.prepare(
                `INSERT INTO inbox (id, tenant_id, title, message, severity, is_read, created_at)
                 VALUES (?, ?, ?, ?, 'warning', 0, datetime('now'))`
              ).bind(
                `lowstock_${product.id}_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`,
                tenantId,
                `Low Stock: ${product.name}`,
                `Only ${qty} units remaining. Reorder suggested.`
              )
            );
          }
        }
        if (alertStmts.length > 0) {
          await env.DB.batch(alertStmts).catch(() => {});
        }
      }
    } catch {
      // Alerting is advisory — swallow and continue to the success response.
    }

    return jsonResponse({
      success: true,
      order: {
        id: orderId,
        orderNumber,
        subtotal: discountedSubtotal,
        originalSubtotal: subtotal,
        discountAmount: totalDiscount,
        taxAmount,
        totalAmount,
        paymentMethod: method,
        amountCash: finalAmountCash,
        amountCard: finalAmountCard,
        status: 'completed',
        tableId,
        kitchenStatus: 'pending',
        tipAmount: tipAmount || 0,
        appliedPromotions: discountRows.map((d) => ({
          promotionId: d.promotionId,
          promotionName: d.promotionName,
          discountAmount: d.discountAmount,
        })),
        items: itemRows.map((r) => ({
          id: r.id,
          productId: r.productId,
          quantity: r.quantity,
          unitPrice: r.unitPrice,
          totalAmount: r.totalAmount,
        })),
      },
    });
  } catch (e) {
    console.error('[POS CREATE ORDER ERROR]', e.message);
    return errorResponse('Failed to create order', 500);
  }
});

// ─── GET /orders ───────────────────────────────────────────
pos.get('/orders', async (c) => {
  const env = c.env;
  const posUser = c.get('posUser');
  const tenantId = posUser.tenantId;
  try {
    // Phase 3 contract normalization: paginated envelope by default;
    // `?raw=1` still serves the legacy bare array while consumers migrate.
    const url = new URL(c.req.url);
    const raw = url.searchParams.get('raw') === '1';
    const { page, pageSize, offset } = parsePagination(url, { defaultPageSize: 100 });
    const { results: countResult } = await env.DB.prepare(
      'SELECT COUNT(*) AS total FROM pos_transactions WHERE tenant_id = ?'
    ).bind(tenantId).all();
    const { results } = await env.DB.prepare(
       `SELECT t.id, t.order_number, t.status, t.subtotal, t.tax_amount, t.total_amount,
              t.payment_method, t.payment_status, t.table_id, t.kitchen_status, t.created_at,
              u.username AS cashier_name
       FROM pos_transactions t
       LEFT JOIN pos_users u ON u.id = t.cashier_id
       WHERE t.tenant_id = ?
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`
    ).bind(tenantId, pageSize, offset).all();
    if (raw) return jsonResponse(results);
    return jsonResponse(paginationEnvelope(results, countResult?.[0]?.total || 0, page, pageSize));
  } catch (e) {
    console.error('[POS ORDERS ERROR]', e.message);
    return errorResponse('Failed to fetch orders', 500);
  }
});

// ─── GET /orders/:id ──────────────────────────────────────
pos.get('/orders/:id', async (c) => {
  const env = c.env;
  const posUser = c.get('posUser');
  const tenantId = posUser.tenantId;
  const orderId = c.req.param('id');
  try {
    const { results: orders } = await env.DB.prepare(
      `SELECT t.*, u.username AS cashier_name
       FROM pos_transactions t
       LEFT JOIN pos_users u ON u.id = t.cashier_id
       WHERE t.id = ? AND t.tenant_id = ?`
    ).bind(orderId, tenantId).all();

    if (orders.length === 0) {
      return errorResponse('Order not found', 404);
    }

    const { results: items } = await env.DB.prepare(
      `SELECT ti.*, p.name AS product_name, p.sku
       FROM pos_transaction_items ti
       LEFT JOIN pos_products p ON p.id = ti.product_id
       WHERE ti.order_id = ? AND ti.tenant_id = ?`
    ).bind(orderId, tenantId).all();

    return jsonResponse({ ...orders[0], items });
  } catch (e) {
    return errorResponse('Failed to fetch order', 500);
  }
});

// ─── GET /dashboard ────────────────────────────────────────
pos.get('/dashboard', async (c) => {
  const env = c.env;
  const posUser = c.get('posUser');
  const tenantId = posUser.tenantId;
  try {
    let timezone = '';
    try {
      const { results: orgRows } = await env.DB.prepare(
        'SELECT timezone FROM pos_organizations WHERE id = ?'
      ).bind(posUser.organizationId).all();
      if (orgRows.length > 0 && orgRows[0].timezone) timezone = orgRows[0].timezone;
    } catch { /* fall back to UTC day */ }

    const today = new Date().toISOString().slice(0, 10);
    let startInstant = '';
    let endInstant = '';
    if (timezone) {
      try {
        const localDate = new Intl.DateTimeFormat('en-CA', {
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date());
        const [y, m, d] = localDate.split('-');
        const nextDate = new Date(Date.UTC(+y, +m - 1, +d + 1)).toISOString().slice(0, 10);

        // UTC instants of the org-local calendar day's midnights in `timezone`,
        // DST-correct (offsets are derived by formatting in the target timezone).
        const localMidnightUtc = (dateStr) => {
          const dtf = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            hourCycle: 'h23',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });
          const offsetMs = (inst) => {
            const parts = Object.fromEntries(dtf.formatToParts(inst).map((p) => [p.type, p.value]));
            const asUtc = Date.UTC(
              +parts.year, +parts.month - 1, +parts.day,
              +parts.hour, +parts.minute, +parts.second
            );
            return asUtc - inst.getTime();
          };
          const naive = new Date(`${dateStr}T00:00:00Z`);
          const start = naive.getTime() - offsetMs(naive);
          const end = start - (offsetMs(new Date(start)) - offsetMs(naive));
          return new Date(end).toISOString().slice(0, 19).replace('T', ' ');
        };

        const start = localMidnightUtc(localDate);
        const end = localMidnightUtc(nextDate);
        startInstant = start;
        endInstant = end;
      } catch { /* fall back to UTC day */ }
    }

    const { results: revenueRows } = startInstant
      ? await env.DB.prepare(
          `SELECT COALESCE(SUM(total_amount), 0) AS revenue
           FROM pos_transactions
           WHERE tenant_id = ? AND created_at >= ? AND created_at < ? AND status != 'voided'`
        ).bind(tenantId, startInstant, endInstant).all()
      : await env.DB.prepare(
          `SELECT COALESCE(SUM(total_amount), 0) AS revenue
           FROM pos_transactions
           WHERE tenant_id = ? AND date(created_at) = ? AND status != 'voided'`
        ).bind(tenantId, today).all();

    const { results: orderCountRows } = startInstant
      ? await env.DB.prepare(
          `SELECT COUNT(*) AS count
           FROM pos_transactions
           WHERE tenant_id = ? AND created_at >= ? AND created_at < ?`
        ).bind(tenantId, startInstant, endInstant).all()
      : await env.DB.prepare(
          `SELECT COUNT(*) AS count
           FROM pos_transactions
           WHERE tenant_id = ? AND date(created_at) = ?`
        ).bind(tenantId, today).all();

    const { results: productCountRows } = await env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM pos_products
       WHERE organization_id = ? AND deleted_at IS NULL AND is_active = 1`
    ).bind(posUser.organizationId).all();

    const { results: recentOrders } = await env.DB.prepare(
      `SELECT t.id, t.order_number, t.total_amount, t.payment_method, t.status, t.created_at
       FROM pos_transactions t
       WHERE t.tenant_id = ?
       ORDER BY t.created_at DESC
       LIMIT 10`
    ).bind(tenantId).all();

    return jsonResponse({
      todayRevenue: revenueRows[0]?.revenue || 0,
      todayOrders: orderCountRows[0]?.count || 0,
      activeProducts: productCountRows[0]?.count || 0,
      recentOrders,
    });
  } catch (e) {
    return errorResponse('Failed to load dashboard', 500);
  }
});

// ─── GET /shifts/active ────────────────────────────────────
pos.get('/shifts/active', async (c) => {
  const env = c.env;
  const posUser = c.get('posUser');
  const tenantId = posUser.tenantId;
  const cashierId = String(posUser.userId);
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, status, opening_time, opening_cash, expected_closing_cash, notes
       FROM pos_shifts
       WHERE tenant_id = ? AND cashier_id = ? AND status = 'open'
       ORDER BY opening_time DESC LIMIT 1`
    ).bind(tenantId, cashierId).all();

    if (results.length === 0) {
      return jsonResponse({ active: false });
    }
    return jsonResponse({ active: true, shift: results[0] });
  } catch (e) {
    return errorResponse('Failed to check active shift', 500);
  }
});

// ─── POST /shifts/open ─────────────────────────────────────
pos.post('/shifts/open', async (c) => {
  const env = c.env;
  const posUser = c.get('posUser');
  const tenantId = posUser.tenantId;
  const cashierId = String(posUser.userId);
  try {
    const body = await c.req.json();
    const openingCash = parseFloat(body.openingCash) || 0;
    if (openingCash < 0) {
      return errorResponse('Opening cash cannot be negative', 400);
    }

    // Block if active shift already exists
    const { results: existing } = await env.DB.prepare(
      `SELECT id FROM pos_shifts WHERE tenant_id = ? AND cashier_id = ? AND status = 'open'`
    ).bind(tenantId, cashierId).all();
    if (existing.length > 0) {
      return errorResponse('An active shift already exists. Close it before opening a new one.', 400);
    }

    const shiftId = 'sh_' + crypto.randomUUID().slice(0, 12);
    await env.DB.prepare(
      `INSERT INTO pos_shifts (id, tenant_id, cashier_id, status, opening_time, opening_cash, notes)
       VALUES (?, ?, ?, 'open', datetime('now'), ?, ?)`
    ).bind(shiftId, tenantId, cashierId, openingCash, body.notes || null).run();

    return jsonResponse({
      success: true,
      shift: { id: shiftId, status: 'open', openingTime: new Date().toISOString(), openingCash },
    });
  } catch (e) {
    return errorResponse('Failed to open shift', 500);
  }
});

// ─── POST /shifts/close ────────────────────────────────────
pos.post('/shifts/close', async (c) => {
  const env = c.env;
  const posUser = c.get('posUser');
  const tenantId = posUser.tenantId;
  const cashierId = String(posUser.userId);
  try {
    const body = await c.req.json();
    const actualClosingCash = parseFloat(body.actualClosingCash);
    if (isNaN(actualClosingCash)) {
      return errorResponse('Closing cash amount is required', 400);
    }

    // Find the active shift
    const { results: shifts } = await env.DB.prepare(
      `SELECT id, opening_cash, opening_time FROM pos_shifts
       WHERE tenant_id = ? AND cashier_id = ? AND status = 'open'
       ORDER BY opening_time DESC LIMIT 1`
    ).bind(tenantId, cashierId).all();
    if (shifts.length === 0) {
      return errorResponse('No active shift found', 400);
    }
    const shift = shifts[0];

    // Compute expected closing cash: opening_cash + SUM(amount_cash) from transactions during this shift
    const { results: cashRows } = await env.DB.prepare(
      `SELECT COALESCE(SUM(amount_cash), 0) AS total_cash
       FROM pos_transactions
       WHERE tenant_id = ? AND cashier_id = ? AND created_at >= ?
         AND status != 'voided'`
    ).bind(tenantId, cashierId, shift.opening_time).all();
    const totalCashSales = parseFloat(cashRows[0]?.total_cash) || 0;
    const expectedClosingCash = shift.opening_cash + totalCashSales;
    const discrepancy = Math.round((actualClosingCash - expectedClosingCash) * 100) / 100;

    await env.DB.prepare(
      `UPDATE pos_shifts
       SET status = 'closed', closing_time = datetime('now'),
           expected_closing_cash = ?, actual_closing_cash = ?, notes = COALESCE(?, notes)
       WHERE id = ?`
    ).bind(expectedClosingCash, actualClosingCash, body.notes || null, shift.id).run();

    return jsonResponse({
      success: true,
      shift: {
        id: shift.id,
        status: 'closed',
        openingCash: shift.opening_cash,
        totalCashSales,
        expectedClosingCash,
        actualClosingCash,
        discrepancy,
      },
    });
  } catch (e) {
    return errorResponse('Failed to close shift', 500);
  }
});

export default pos;
