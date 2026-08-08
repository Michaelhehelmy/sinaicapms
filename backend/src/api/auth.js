/**
 * Auth API — login/register/forgot-password for tenant admins.
 * Uses the `admins` table for authentication.
 */

import bcrypt from 'bcryptjs';
import { jsonResponse, errorResponse } from '../utils/response';
import { validationError } from '../utils/errors';
import { sendPasswordResetEmail } from '../services/emailService';
import {
  verifyToken,
  verifyPassword,
  rehashIfNeeded,
  hashPassword,
  isValidEmail,
  generateToken,
} from '../middleware/sharedAuth.js';
import { z } from 'zod';

// T8-D1: camelCase-only contract — the `tenant_id` alias was removed. Unknown keys
// are stripped (not rejected) by `.strip()`; a client sending `tenant_id` falls
// through to the super-admin (no-tenant) login path. Send `tenantId` instead.
export const loginSchema = z.object({
  email: z.string().min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
  tenantId: z.string().optional(),
}).strip();

export const registerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  tenantId: z.string().min(1, 'Tenant ID is required'),
}).strip();

export const forgotPasswordSchema = z.object({
  email: z.string().min(1, 'Email is required'),
  tenantId: z.string().optional(),
}).strip();

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
}).strip();

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
}).strip();

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
}).strip();

// S-C3: Per-IP forgot-password rate limiter (5 requests per 15 min)
const _forgotRateLimit = new Map();
function isForgotRateLimited(ip) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const max = 5;
  const key = `fp:${ip}`;
  let record = _forgotRateLimit.get(key);
  if (!record || now > record.resetTime) {
    record = { count: 0, resetTime: now + windowMs };
  }
  record.count++;
  _forgotRateLimit.set(key, record);
  // Cleanup stale entries
  if (_forgotRateLimit.size > 5000) {
    for (const [k, v] of _forgotRateLimit) {
      if (now > v.resetTime) _forgotRateLimit.delete(k);
    }
  }
  return record.count > max;
}

function getJwtSecret(env) {
  const secret = env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured in environment');
  return secret;
}

// Backward-compat re-export for index.js callers
export const verifyJWT = verifyToken;

async function ensureResetTokensTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
}

export async function handleAuthRoute(request, env) {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname.split('/').filter(Boolean);
  const subRoute = path[2];

  // ───── POST /api/auth/login ─────
  if (subRoute === 'login' && method === 'POST') {
    try {
      const parsed = loginSchema.safeParse(await request.json());
      if (!parsed.success) {
        return validationError(parsed);
      }
      let { email, password, tenantId } = parsed.data;
      const targetTenant = tenantId || null;

      const secret = getJwtSecret(env);

      // Resolve tenant ID from subdomain or custom domain (if provided)
      if (targetTenant) {
        const { results: tenantCheck } = await env.DB.prepare(
          "SELECT id FROM tenants WHERE id = ? OR subdomain = ? OR custom_domain = ?"
        ).bind(targetTenant, targetTenant, targetTenant).all();

        if (tenantCheck.length > 0) {
          tenantId = tenantCheck[0].id;
        } else {
          tenantId = targetTenant;
        }
      }

      // Look up admin in the admins table
      // Super admins (tenant_id IS NULL) can login without a tenantId
      const admin = targetTenant
        ? await env.DB.prepare(
            "SELECT id, email, password_hash, role, tenant_id, first_name, last_name, is_active FROM admins WHERE email = ? AND (tenant_id = ? OR tenant_id IS NULL) AND is_active = 1"
          ).bind(email, tenantId).first()
        : await env.DB.prepare(
            "SELECT id, email, password_hash, role, tenant_id, first_name, last_name, is_active FROM admins WHERE email = ? AND tenant_id IS NULL AND is_active = 1"
          ).bind(email).first();

      if (!admin) return errorResponse('Invalid email or password', 401);

      const passwordValid = await verifyPassword(password, admin.password_hash);
      if (!passwordValid) return errorResponse('Invalid email or password', 401);

      // Rehash if using old SHA-256
      await rehashIfNeeded(admin.id, password, admin.password_hash, env);

      // Update last login
      await env.DB.prepare(
        "UPDATE admins SET last_login = datetime('now') WHERE id = ?"
      ).bind(admin.id).run();

      // Generate JWT token
      const token = await generateToken(
        { sub: admin.id, userId: admin.id, tenantId: admin.tenant_id || tenantId, email: admin.email, role: admin.role },
        secret,
        'access'
      );

      const refreshToken = await generateToken(
        { sub: admin.id, userId: admin.id, tenantId: admin.tenant_id || tenantId },
        secret,
        'refresh'
      );

      const displayName = [admin.first_name, admin.last_name].filter(Boolean).join(' ') || admin.email;

      return jsonResponse({
        success: true,
        token,
        refreshToken,
        user: {
          id: admin.id,
          name: displayName,
          email: admin.email,
          role: admin.role,
          tenantId: admin.tenant_id || tenantId
        }
      });
    } catch (e) {
      return errorResponse('Failed to process login');
    }
  }

  // ───── POST /api/auth/refresh ─────
  // T7: stateless silent-refresh. DB is frozen (no revocation table), so tokens are
  // re-issued rather than rotated-with-revocation: each refresh returns a NEW access
  // token AND a NEW refresh token (fresh iat/exp). Previously issued refresh tokens
  // remain valid until their own 7d expiry — accepted for this stateless design.
  if (subRoute === 'refresh' && method === 'POST') {
    try {
      const parsed = refreshSchema.safeParse(await request.json());
      if (!parsed.success) {
        return validationError(parsed);
      }

      const { refreshToken } = parsed.data;
      const secret = getJwtSecret(env);
      const decoded = await verifyToken(refreshToken, secret);

      // Reject invalid/expired tokens AND non-refresh tokens (access, POS, password-reset)
      if (!decoded) return errorResponse('Invalid or expired refresh token', 401);
      if (decoded.type !== 'refresh') return errorResponse('Invalid token type', 401);

      const admin = await env.DB.prepare(
        "SELECT id, email, role, tenant_id, first_name, last_name, is_active FROM admins WHERE id = ?"
      ).bind(decoded.sub).first();

      if (!admin) return errorResponse('Invalid or expired refresh token', 401);
      if (admin.is_active === 0) return errorResponse('Account deactivated', 401);

      // Issue new access + refresh tokens
      const token = await generateToken(
        { sub: admin.id, userId: admin.id, tenantId: admin.tenant_id || decoded.tenantId, email: admin.email, role: admin.role },
        secret,
        'access'
      );

      const newRefreshToken = await generateToken(
        { sub: admin.id, userId: admin.id, tenantId: admin.tenant_id || decoded.tenantId },
        secret,
        'refresh'
      );

      const displayName = [admin.first_name, admin.last_name].filter(Boolean).join(' ') || admin.email;

      return jsonResponse({
        success: true,
        token,
        refreshToken: newRefreshToken,
        user: {
          id: admin.id,
          name: displayName,
          email: admin.email,
          role: admin.role,
          tenantId: admin.tenant_id || decoded.tenantId
        }
      });
    } catch (e) {
      return errorResponse('Failed to process refresh');
    }
  }

  // ───── POST /api/auth/logout ─────
  if (subRoute === 'logout' && method === 'POST') {
    return jsonResponse({ success: true });
  }

  // ───── GET /api/auth/me ─────
  if (subRoute === 'me' && method === 'GET') {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse('Missing or invalid Authorization header', 401);
    }

    const jwtToken = authHeader.split(' ')[1];
    const secret = getJwtSecret(env);
    const decoded = await verifyToken(jwtToken, secret);
    if (!decoded) return errorResponse('Session expired or invalid signature', 401);

    const admin = await env.DB.prepare(
      "SELECT id, email, role, tenant_id, first_name, last_name, is_active FROM admins WHERE id = ?"
    ).bind(decoded.sub).first();

    if (!admin) return errorResponse('Admin not found', 404);
    // P0-6: Verify user is still active (explicit check for consistency)
    if (admin.is_active === 0) return errorResponse('Account deactivated', 401);

    const displayName = [admin.first_name, admin.last_name].filter(Boolean).join(' ') || admin.email;

    return jsonResponse({
      user: {
        id: admin.id,
        name: displayName,
        email: admin.email,
        role: admin.role,
        tenantId: admin.tenant_id
      }
    });
  }

  // ───── POST /api/auth/register ─────
  if (subRoute === 'register' && method === 'POST') {
    try {
      const parsed = registerSchema.safeParse(await request.json());
      if (!parsed.success) {
        return validationError(parsed);
      }
      const { name, email, password, tenantId } = parsed.data;

      const tenant = await env.DB.prepare(
        "SELECT id FROM tenants WHERE id = ? OR subdomain = ?"
      ).bind(tenantId, tenantId).first();
      if (!tenant) {
        return errorResponse('Tenant not found', 404);
      }
      const resolvedTenantId = tenant.id;

      const existing = await env.DB.prepare(
        "SELECT id FROM admins WHERE email = ? AND tenant_id = ?"
      ).bind(email, resolvedTenantId).first();
      if (existing) {
        return errorResponse('An account with this email already exists', 409);
      }

      const adminId = 'adm_' + crypto.randomUUID().slice(0, 12); // S-C5 fix: use crypto ID
      const passwordHash = await hashPassword(password);
      const nameParts = (name || '').trim().split(/\s+/);
      const firstName = nameParts[0] || 'Admin';
      const lastName = nameParts.slice(1).join(' ') || '';

      await env.DB.prepare(
        `INSERT INTO admins (id, tenant_id, email, password_hash, role, first_name, last_name, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'admin', ?, ?, 0, datetime('now'), datetime('now'))`
      ).bind(adminId, resolvedTenantId, email, passwordHash, firstName, lastName || null).run();

      return jsonResponse({
        success: true,
        message: 'Registration successful. Your account is pending administrator approval.',
        adminId,
      });
    } catch (e) {
      return errorResponse('Failed to process registration');
    }
  }

  // ───── POST /api/auth/forgot-password ─────
  if (subRoute === 'forgot-password' && method === 'POST') {
    try {
      const parsed = forgotPasswordSchema.safeParse(await request.json());
      if (!parsed.success) {
        return validationError(parsed);
      }
      const { email, tenantId } = parsed.data;

      // S-C3: Rate limit forgot-password to prevent abuse
      // S-C3 fix: cf-connecting-ip only (Cloudflare-populated, not spoofable). Never trust forwarded headers.
      const clientIp = request.headers.get('cf-connecting-ip') || 'unknown';
      if (isForgotRateLimited(clientIp)) {
        return errorResponse('Too many reset attempts. Please try again later.', 429);
      }

      const successResponse_ = jsonResponse({ success: true, message: 'If an account exists, a reset link has been sent.' });

      let admin = null;
      if (tenantId) {
        admin = await env.DB.prepare(
          "SELECT id, email, tenant_id FROM admins WHERE email = ? AND tenant_id = ?"
        ).bind(email, tenantId).first();
      }
      if (!admin) {
        admin = await env.DB.prepare(
          "SELECT id, email, tenant_id FROM admins WHERE email = ?"
        ).bind(email).first();
      }

      if (!admin) return successResponse_;

      // Purge old tokens for this user before creating new one
      await ensureResetTokensTable(env);
      await env.DB.prepare(
        "DELETE FROM password_reset_tokens WHERE user_id = ? AND used = 0"
      ).bind(admin.id).run();

      const token = crypto.randomUUID();
      const tokenId = 'prt_' + crypto.randomUUID().slice(0, 12); // L1 fix
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      // Limit max active tokens per user to 5
      const { results: activeTokens } = await env.DB.prepare(
        "SELECT id FROM password_reset_tokens WHERE user_id = ? AND used = 0 ORDER BY created_at DESC"
      ).bind(admin.id).all();
      if (activeTokens.length >= 5) {
        // Delete oldest tokens
        const toDelete = activeTokens.slice(4);
        for (const t of toDelete) {
          await env.DB.prepare("DELETE FROM password_reset_tokens WHERE id = ?").bind(t.id).run();
        }
      }

      await env.DB.prepare(
        `INSERT INTO password_reset_tokens (id, user_id, token, expires_at, created_at)
         VALUES (?, ?, ?, ?, datetime('now'))`
      ).bind(tokenId, admin.id, token, expiresAt).run();

      await sendPasswordResetEmail(admin.email, token, undefined, env);

      return successResponse_;
    } catch (e) {
      return errorResponse('Failed to process reset request');
    }
  }

  // ───── POST /api/auth/reset-password ─────
  if (subRoute === 'reset-password' && method === 'POST') {
    try {
      const parsed = resetPasswordSchema.safeParse(await request.json());
      if (!parsed.success) {
        return validationError(parsed);
      }
      const { token, password } = parsed.data;

      await ensureResetTokensTable(env);

      const tokenRecord = await env.DB.prepare(
        "SELECT id, user_id, token, expires_at, used FROM password_reset_tokens WHERE token = ?"
      ).bind(token).first();

      if (!tokenRecord) return errorResponse('Invalid or expired reset token', 400);
      if (tokenRecord.used) return errorResponse('This reset token has already been used', 400);
      if (new Date(tokenRecord.expires_at) < new Date()) return errorResponse('This reset token has expired', 400);

      const passwordHash = await hashPassword(password);

      await env.DB.prepare(
        "UPDATE admins SET password_hash = ?, updated_at = datetime('now') WHERE id = ?"
      ).bind(passwordHash, tokenRecord.user_id).run();

      await env.DB.prepare(
        "UPDATE password_reset_tokens SET used = 1 WHERE id = ?"
      ).bind(tokenRecord.id).run();

      return jsonResponse({ success: true, message: 'Password reset successful. Please log in with your new password.' });
    } catch (e) {
      return errorResponse('Failed to reset password');
    }
  }

  // ───── POST /api/auth/change-password ─────
  if (subRoute === 'change-password' && method === 'POST') {
    try {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return errorResponse('Missing or invalid Authorization header', 401);
      }
      const jwtToken = authHeader.split(' ')[1];
      const secret = getJwtSecret(env);
      const decoded = await verifyToken(jwtToken, secret);
      if (!decoded) return errorResponse('Session expired or invalid signature', 401);

      const parsed = changePasswordSchema.safeParse(await request.json());
      if (!parsed.success) {
        return validationError(parsed);
      }
      const { currentPassword, newPassword } = parsed.data;

      const admin = await env.DB.prepare(
        "SELECT id, password_hash FROM admins WHERE id = ? AND is_active = 1"
      ).bind(decoded.sub).first();
      if (!admin) return errorResponse('Admin not found', 404);

      const valid = await verifyPassword(currentPassword, admin.password_hash);
      if (!valid) return errorResponse('Current password is incorrect', 401);

      const passwordHash = await hashPassword(newPassword);
      await env.DB.prepare(
        "UPDATE admins SET password_hash = ?, updated_at = datetime('now') WHERE id = ?"
      ).bind(passwordHash, admin.id).run();

      return jsonResponse({ success: true, message: 'Password changed successfully.' });
    } catch (e) {
      return errorResponse('Failed to change password');
    }
  }

  return errorResponse('Auth endpoint not found', 404);
}
