/**
 * Soft/hard delete utilities (unified architecture migration).
 *
 * Schema facts this module relies on (verified against migrations 0059–0063):
 *   - tenants.deleted_at / projects.deleted_at (DATETIME, NULL = live)
 *   - projects.tenant_id REFERENCES tenants(id) with NO cascade (0063 rebuild)
 *   - most legacy child tables declare tenant_id → tenants ON DELETE CASCADE,
 *     but RESTRICT edges exist deeper in the graph (orders→rooms_new,
 *     rooms_new→pos_products), so a naive single DELETE fails or orphans rows.
 *
 * Conventions:
 *   - Soft deletes stamp deleted_at = datetime('now'); restores clear it.
 *   - Every multi-statement operation runs through DB.batch → ONE implicit D1
 *     transaction (all-or-nothing).
 *   - projects.updated_at is stamped explicitly on soft delete/restore: the
 *     trg_camps_updated_at trigger died with the camps table in the 0063
 *     create-copy-drop rename and was NOT recreated.
 *   - tenants.updated_at is left alone: trg_tenants_updated_at (0059) owns it.
 */

/** True when the row carries a non-null deleted_at. Null-safe (missing row → false). */
export function isSoftDeleted(row) {
  return Boolean(row && row.deleted_at !== undefined && row.deleted_at !== null);
}

// ─── Soft delete ───────────────────────────────────────────────

/** Soft-delete one project. Returns true when a live row was affected. */
export async function softDeleteProject(DB, projectId) {
  if (!projectId) return false;
  const results = await DB.batch([
    DB.prepare(
      `UPDATE projects SET deleted_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ? AND deleted_at IS NULL`
    ).bind(projectId),
  ]);
  return (results?.[0]?.meta?.changes ?? 0) > 0;
}

/**
 * Soft-delete one tenant AND all of its projects in one transaction.
 * Children of projects (meta/tags junctions) stay put — they are unreachable
 * through every live read path (deleted_at IS NULL filters) and ride along on
 * restore or are swept by hardDeleteTenant.
 */
export async function softDeleteTenant(DB, tenantId) {
  if (!tenantId) return false;
  // Projects first, then tenant — logical cascade order.
  // Both run in one D1 batch (implicit transaction), but ordering
  // correctly prevents any window where a deleted tenant has live projects.
  const results = await DB.batch([
    DB.prepare(
      `UPDATE projects SET deleted_at = datetime('now'), updated_at = datetime('now')
       WHERE tenant_id = ? AND deleted_at IS NULL`
    ).bind(tenantId),
    DB.prepare(`UPDATE tenants SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`)
      .bind(tenantId),
  ]);
  // Tenant row is the authoritative signal; zero changes there means already
  // deleted (or unknown id). The tenants arm is statement index 1 in the
  // batch above (projects arm runs first, index 0).
  return (results?.[1]?.meta?.changes ?? 0) > 0;
}

// ─── Restore ───────────────────────────────────────────────────

/** Clear deleted_at on one project. Returns true when a soft-deleted row was restored. */
export async function restoreProject(DB, projectId) {
  if (!projectId) return false;
  const results = await DB.batch([
    DB.prepare(
      `UPDATE projects SET deleted_at = NULL, updated_at = datetime('now')
       WHERE id = ? AND deleted_at IS NOT NULL`
    ).bind(projectId),
  ]);
  return (results?.[0]?.meta?.changes ?? 0) > 0;
}

/**
 * Restore one tenant AND all of its projects in one transaction.
 * Only rows that were soft-deleted TOGETHER are restored semantics-wise —
 * projects soft-deleted individually keep their own tombstone? No: like the
 * delete side, the batch clears every project of the tenant. Per-entity
 * granularity lives at project level via restoreProject().
 */
export async function restoreTenant(DB, tenantId) {
  if (!tenantId) return false;
  // Tenant first, then projects — reverse of delete cascade.
  const results = await DB.batch([
    DB.prepare(`UPDATE tenants SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL`)
      .bind(tenantId),
    DB.prepare(
      `UPDATE projects SET deleted_at = NULL, updated_at = datetime('now')
       WHERE tenant_id = ? AND deleted_at IS NOT NULL`
    ).bind(tenantId),
  ]);
  return (results?.[0]?.meta?.changes ?? 0) > 0;
}

// ─── Hard delete ───────────────────────────────────────────────

// Inline subselects keep each statement self-contained inside the batch
// (bindings cannot be shared between statements).
const ORGS_OF_TENANT = '(SELECT organization_id FROM tenant_org_mapping WHERE tenant_id = ?)';
const PROJECTS_OF_TENANT = '(SELECT id FROM projects WHERE tenant_id = ?)';
const TAGS_OF_TENANT = '(SELECT id FROM tags WHERE tenant_id = ?)';
// pos_products carries organization_id only (INTEGER) — no tenant_id column.
const POS_PRODUCTS_OF_TENANT =
  `(SELECT p.id FROM pos_products p WHERE p.organization_id IN ${ORGS_OF_TENANT})`;
const LEGACY_PRODUCTS_OF_TENANT = '(SELECT id FROM products WHERE tenant_id = ?)';

/**
 * PERMANENTLY delete a tenant and every cascaded row. IRREVERSIBLE.
 *
 * ⚠️ CALLER MUST ENFORCE super_admin — this module intentionally stays
 * request-context-free and performs no role checks.
 *
 * Statement order follows the live FK graph (PRAGMA foreign_key_list, verified
 * 2026-08): children before parents wherever ON DELETE is RESTRICT/NO ACTION:
 *   orders → rooms_new [RESTRICT], rooms_new/pos_recipe_ingredients/
 *   rate_plans_new → pos_products [RESTRICT/NO ACTION],
 *   pos_transaction_items → pos_transactions/pos_products [NO ACTION],
 *   pos_transactions → pos_customers/pos_stores [NO ACTION],
 *   pos_users → pos_stores [NO ACTION], everything org-scoped before
 *   pos_organizations/tenant_org_mapping, all children before projects, all
 *   children before tenants.
 *
 * Junction/meta tables without their own tenant_id (project_meta, project_tags,
 * product_camps, price_overrides) are swept via subselects on their parents.
 * password_reset_tokens of the tenant's admin accounts go too; global
 * super-admin accounts and lookup tables (languages, order_state, …) survive.
 */
export async function hardDeleteTenant(DB, tenantId) {
  if (!tenantId) return false;

  const stmts = [
    // -- unified-schema tables (0058+) -------------------------------------
    DB.prepare('DELETE FROM audit_log WHERE tenant_id = ?').bind(tenantId),
    DB.prepare(
      `DELETE FROM project_tags WHERE tag_id IN ${TAGS_OF_TENANT} OR project_id IN ${PROJECTS_OF_TENANT}`
    ).bind(tenantId, tenantId),
    DB.prepare(
      `DELETE FROM project_meta WHERE project_id IN ${PROJECTS_OF_TENANT}`
    ).bind(tenantId),
    DB.prepare('DELETE FROM tags WHERE tenant_id = ?').bind(tenantId),
    DB.prepare('DELETE FROM tenant_meta WHERE tenant_id = ?').bind(tenantId),

    // -- catalog content (children of projects first where RESTRICT applies) --
    DB.prepare('DELETE FROM plans_new WHERE tenant_id = ?').bind(tenantId),
    DB.prepare('DELETE FROM meal_schedules WHERE tenant_id = ?').bind(tenantId),
    // BEFORE rooms_new (orders.room_id → rooms_new.id ON DELETE RESTRICT)
    DB.prepare('DELETE FROM orders WHERE tenant_id = ?').bind(tenantId),
    // BEFORE pos_products (rate_plans_new.product_id FK)
    DB.prepare('DELETE FROM rate_plans_new WHERE tenant_id = ?').bind(tenantId),
    DB.prepare(
      `DELETE FROM rooms_new WHERE tenant_id = ? OR camp_id IN ${PROJECTS_OF_TENANT}`
    ).bind(tenantId, tenantId),

    // -- junctions without tenant_id ---------------------------------------
    DB.prepare(
      `DELETE FROM product_camps WHERE camp_id IN ${PROJECTS_OF_TENANT} OR product_id IN ${POS_PRODUCTS_OF_TENANT} OR product_id IN ${LEGACY_PRODUCTS_OF_TENANT}`
    ).bind(tenantId, tenantId, tenantId),
    DB.prepare(
      `DELETE FROM price_overrides WHERE product_id IN ${POS_PRODUCTS_OF_TENANT} OR product_id IN ${LEGACY_PRODUCTS_OF_TENANT}`
    ).bind(tenantId, tenantId),

    // -- POS family (org-scoped; strict child→parent order) -----------------
    DB.prepare(
      `DELETE FROM pos_recipe_ingredients WHERE product_id IN ${POS_PRODUCTS_OF_TENANT} OR ingredient_id IN ${POS_PRODUCTS_OF_TENANT}`
    ).bind(tenantId, tenantId),
    DB.prepare(
      `DELETE FROM pos_transaction_items WHERE order_id IN (SELECT id FROM pos_transactions WHERE tenant_id = ?) OR product_id IN ${POS_PRODUCTS_OF_TENANT}`
    ).bind(tenantId, tenantId),
    DB.prepare('DELETE FROM pos_transactions WHERE tenant_id = ?').bind(tenantId),
    DB.prepare('DELETE FROM pos_customers WHERE tenant_id = ?').bind(tenantId),
    DB.prepare('DELETE FROM pos_shifts WHERE tenant_id = ?').bind(tenantId),
    DB.prepare('DELETE FROM pos_users WHERE tenant_id = ?').bind(tenantId),
    // BEFORE pos_organizations + tenant_org_mapping (org subselects above)
    DB.prepare(`DELETE FROM pos_products WHERE organization_id IN ${ORGS_OF_TENANT}`).bind(tenantId),
    DB.prepare(`DELETE FROM pos_stores WHERE organization_id IN ${ORGS_OF_TENANT}`).bind(tenantId),
    DB.prepare(`DELETE FROM pos_organizations WHERE id IN ${ORGS_OF_TENANT}`).bind(tenantId),
    DB.prepare('DELETE FROM tenant_org_mapping WHERE tenant_id = ?').bind(tenantId),

    // -- meals/categories/products mirrors -----------------------------------
    DB.prepare('DELETE FROM meals WHERE tenant_id = ?').bind(tenantId),
    DB.prepare('DELETE FROM meal_categories WHERE tenant_id = ?').bind(tenantId),
    DB.prepare('DELETE FROM categories WHERE tenant_id = ?').bind(tenantId), // *_lang rows cascade
    DB.prepare('DELETE FROM products WHERE tenant_id = ?').bind(tenantId),

    // -- the project rows themselves -----------------------------------------
    DB.prepare('DELETE FROM projects WHERE tenant_id = ?').bind(tenantId),

    // -- CRM / comms ----------------------------------------------------------
    DB.prepare('DELETE FROM leads WHERE tenant_id = ?').bind(tenantId),
    DB.prepare('DELETE FROM customers WHERE tenant_id = ?').bind(tenantId),
    DB.prepare('DELETE FROM inbox_reads WHERE tenant_id = ?').bind(tenantId),

    // -- accounts --------------------------------------------------------------
    DB.prepare(
      'DELETE FROM password_reset_tokens WHERE user_id IN (SELECT id FROM admins WHERE tenant_id = ?)'
    ).bind(tenantId),
    DB.prepare('DELETE FROM admins WHERE tenant_id = ?').bind(tenantId),

    // -- the tenant row LAST ----------------------------------------------------
    DB.prepare('DELETE FROM tenants WHERE id = ?').bind(tenantId),
  ];

  const results = await DB.batch(stmts);
  // Success signal = the final statement removed exactly the tenant row.
  return (results?.[results.length - 1]?.meta?.changes ?? 0) > 0;
}
