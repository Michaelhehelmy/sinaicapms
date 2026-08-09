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
 * Generate JWT token.
 * @param {Object} payload - Must include at least { sub, userId, email, role, tenantId }
 * @param {string} secret - JWT secret
 * @param {'access'|'refresh'} type - Token type
 * @returns {Promise<string>} Signed JWT
 */
export async function generateToken(payload, secret, type = 'access') {
  const ttl = type === 'refresh' ? JWT_CONFIG.refreshTtl : JWT_CONFIG.accessTtl;
  const tokenPayload = {
    ...payload,
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
 */
export async function rehashIfNeeded(userId, plaintext, storedHash, env) {
  if (storedHash && storedHash.startsWith('$sha256$')) {
    const newHash = await bcrypt.hash(plaintext, 12);
    await env.DB.prepare(
      "UPDATE admins SET password_hash = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(newHash, userId).run();
  }
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
 * Hono middleware: verifies JWT, sets c.set('user', {...}).
 * Checks is_active in DB and rejects tokens without role.
 */
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
