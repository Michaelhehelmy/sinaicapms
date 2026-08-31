/**
 * Shared Authentication Module — Single Source of Truth
 *
 * All auth logic (JWT, password, roles) lives here.
 * api/auth.js and middleware/auth.js both import from here.
 */

import jwt from '@tsndr/cloudflare-worker-jwt';
import bcrypt from 'bcryptjs';
import { errorResponse } from '../utils/response.js';

// ─── JWT Configuration ────────────────────────────────────

const JWT_CONFIG = {
  algorithm: 'HS256',
  accessExpiresIn: '24h',
  refreshExpiresIn: '7d',
  accessTtl: 24 * 60 * 60,
  refreshTtl: 7 * 24 * 60 * 60,
  // Phase 5: floor/clamp for the optional shorter org (POS) access TTL.
  // A misconfigured env value can neither brick terminals with sub-5-minute
  // sessions nor outlive the admin (platform) token lifetime.
  posAccessTtlFloorSeconds: 5 * 60,
};

// ─── Role Hierarchy (single definition) ───────────────────

export const USER_ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
};

// Higher number = more permissions
export const ROLE_HIERARCHY = {
  [USER_ROLES.SUPER_ADMIN]: 10,
  [USER_ROLES.ADMIN]: 4,
};

// ─── JWT Helpers ──────────────────────────────────────────

function getJwtSecret(env) {
  const secret = env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured in environment');
  return secret;
}

/**
 * Resolve the access-token TTL (seconds) for a payload.
 *
 * Phase 5: org (POS) sessions may run a SHORTER access TTL than admin
 * sessions (e.g. 15 minutes vs 24 hours) so that a stolen terminal token has
 * a small blast radius. Opt-in via `POS_ACCESS_TTL_SECONDS` — unset or
 * invalid keeps the legacy 24h lifetime, and refresh/admin tokens are never
 * shortened. Configured values are clamped to
 * [JWT_CONFIG.posAccessTtlFloorSeconds .. JWT_CONFIG.accessTtl].
 */
export function getAccessTtlSeconds(env, payload) {
  const isOrg = !!payload && (
    payload.userType === 'org' ||
    (payload.userType == null && payload.posType === 'pos')
  );
  if (!isOrg) return JWT_CONFIG.accessTtl;
  const raw = env?.POS_ACCESS_TTL_SECONDS;
  if (raw === undefined || raw === null || String(raw).trim() === '') return JWT_CONFIG.accessTtl;
  const configured = Number(String(raw).trim());
  if (!Number.isInteger(configured) || configured <= 0) return JWT_CONFIG.accessTtl;
  return Math.min(
    Math.max(configured, JWT_CONFIG.posAccessTtlFloorSeconds),
    JWT_CONFIG.accessTtl
  );
}

/**
 * Generate JWT token.
 *
 * Token contract v2 (Phase 5): every issued token carries `userType` —
 * 'platform' for admin tokens, 'org' for POS tokens. The legacy `posType:
 * 'pos'` claim stays EMITTED for backward compatibility; verifiers accept
 * BOTH during the transition (plan §7.1).
 *
 * @param {Object} payload - Must include at least { sub, userId, email, role, tenantId }
 * @param {string} secret - JWT secret
 * @param {'access'|'refresh'} type - Token type
 * @param {Object} [env] - Worker env; enables POS_ACCESS_TTL_SECONDS for org access tokens
 * @returns {Promise<string>} Signed JWT
 */
export async function generateToken(payload, secret, type = 'access', env = null) {
  const ttl = type === 'refresh'
    ? JWT_CONFIG.refreshTtl
    : getAccessTtlSeconds(env, payload);
  // v2 realm tag: every token carries `userType` — 'org' for POS sessions
  // (detected via the legacy posType claim when the caller omits it),
  // 'platform' for admin sessions. Legacy `posType` keeps flowing through
  // untouched for backward compatibility.
  const userType = payload.userType || (payload.posType === 'pos' ? 'org' : 'platform');
  const tokenPayload = {
    ...payload,
    userType,
    type,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ttl,
  };
  return await jwt.sign(tokenPayload, secret, { algorithm: JWT_CONFIG.algorithm });
}

/**
 * Verify and decode JWT. Returns payload or null.
 * @param {string} token
 * @param {string} secret
 * @returns {Promise<Object|null>}
 */
export async function verifyToken(token, secret) {
  if (!token || !secret) return null;
  try {
    const isValid = await jwt.verify(token, secret);
    if (!isValid) return null;
    const decoded = jwt.decode(token);
    if (!decoded?.payload) return null;
    if (decoded.payload.exp && decoded.payload.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded.payload;
  } catch {
    return null;
  }
}

/**
 * Extract Bearer token from Authorization header.
 * @param {Request} request
 * @returns {string|null}
 */
export function extractToken(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.substring(7);
}

// ─── Password Helpers ─────────────────────────────────────

/**
 * Verify password against stored hash.
 * Supports bcrypt and legacy $sha256$ prefix.
 * @param {string} plaintext
 * @param {string} storedHash
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(plaintext, storedHash) {
  if (!storedHash) return false;
  if (storedHash.startsWith('$sha256$')) {
    const actualHash = storedHash.slice(8); // "$sha256$" is 8 chars
    const msgBuffer = new TextEncoder().encode(plaintext);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const computed = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    // Timing-safe comparison: prevent timing side-channel
    const a = new TextEncoder().encode(computed);
    const b = new TextEncoder().encode(actualHash);
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a[i] ^ b[i];
    }
    return diff === 0;
  }
  return bcrypt.compare(plaintext, storedHash);
}

/**
 * Hash password with bcrypt.
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
  return await bcrypt.hash(password, 12);
}

/**
 * Auto-rehash SHA-256 passwords to bcrypt on successful login.
 *
 * Phase 5: covers BOTH user stores. The default table stays `admins`
 * (byte-compatible with every existing caller); POS login passes
 * `{ table: 'pos_users' }` so legacy-hash cashiers are upgraded too.
 *
 * @returns {Promise<boolean>} true when a rehash was written
 */
export async function rehashIfNeeded(userId, plaintext, storedHash, env, { table = 'admins' } = {}) {
  if (!(storedHash && storedHash.startsWith('$sha256$'))) return false;
  if (table !== 'admins' && table !== 'pos_users') {
    throw new Error(`rehashIfNeeded: unsupported user table "${table}"`);
  }
  const newHash = await bcrypt.hash(plaintext, 12);
  await env.DB.prepare(
    `UPDATE ${table} SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(newHash, userId).run();
  return true;
}

/**
 * Validate email format.
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ─── User Lookup ──────────────────────────────────────────

/**
 * Get user by ID from admins table.
 * @param {string} userId
 * @param {Object} env
 * @returns {Promise<Object|null>}
 */
export async function getUserById(userId, env) {
  try {
    const stmt = env.DB.prepare(`
      SELECT id, email, first_name, last_name, role,
             is_active, tenant_id, last_login, created_at, updated_at
      FROM admins
      WHERE id = ?
    `);
    return await stmt.bind(userId).first();
  } catch (error) {
    console.error('getUserById error:', error);
    return null;
  }
}

// ─── Auth Middleware (Hono) ────────────────────────────────

/**
 * DEPRECATED: This middleware is exported but never mounted as Hono middleware.
 * All auth is handled by requireAuth.js / resolveScope.js instead.
 * Kept for reference only — remove in next cleanup pass.
 */
// eslint-disable-next-line no-unused-vars
export const authMiddleware = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse('Unauthorized: Missing or invalid token', 401);
  }
  const token = authHeader.split(' ')[1];

  const secret = getJwtSecret(c.env);
  const payload = await verifyToken(token, secret);
  if (!payload) {
    return errorResponse('Unauthorized: Session expired or invalid signature', 401);
  }

  if (!payload.role) {
    return errorResponse('Unauthorized: Token missing role claim', 401);
  }

  if (payload.posType === 'pos') {
    return errorResponse('Forbidden: POS sessions cannot access admin routes', 403);
  }

  const user = await getUserById(payload.userId || payload.sub, c.env);
  if (!user || user.is_active === 0) {
    return errorResponse('Unauthorized: Account deactivated', 401);
  }

  c.set('user', {
    id: user.id,
    email: user.email,
    fullName: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email,
    role: user.role,
    tenantId: user.tenant_id || payload.tenantId,
    status: user.is_active ? 'active' : 'inactive',
    lastLogin: user.last_login,
    createdAt: user.created_at,
  });

  await next();
};

// DEPRECATED: auth is an alias for authMiddleware — never mounted, kept for reference.
export const auth = authMiddleware;

// ─── Role Checking ────────────────────────────────────────

/**
 * Check if userRole has >= permission level than requiredRole.
 */
export function hasRolePermission(userRole, requiredRole) {
  const userLevel = ROLE_HIERARCHY[userRole] || 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
  return userLevel >= requiredLevel;
}
