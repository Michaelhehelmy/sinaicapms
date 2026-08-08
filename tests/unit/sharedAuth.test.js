/**
 * Unit tests for sharedAuth.js — the single source of truth for all auth logic.
 * Covers: JWT generation/verification, password hashing/verification,
 * role hierarchy, email validation, token extraction, and rehash logic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  USER_ROLES,
  ROLE_HIERARCHY,
  generateToken,
  verifyToken,
  extractToken,
  verifyPassword,
  hashPassword,
  rehashIfNeeded,
  isValidEmail,
  hasRolePermission,
} from '../../backend/src/middleware/sharedAuth.js';

const TEST_SECRET = 'test_jwt_secret_for_unit_tests_12345';

describe('sharedAuth', () => {
  // ─── Role Constants ────────────────────────────────────────
  describe('USER_ROLES', () => {
    it('defines SUPER_ADMIN as "super_admin"', () => {
      expect(USER_ROLES.SUPER_ADMIN).toBe('super_admin');
    });

    it('defines ADMIN as "admin"', () => {
      expect(USER_ROLES.ADMIN).toBe('admin');
    });
  });

  describe('ROLE_HIERARCHY', () => {
    it('super_admin has level 10', () => {
      expect(ROLE_HIERARCHY[USER_ROLES.SUPER_ADMIN]).toBe(10);
    });

    it('admin has level 4', () => {
      expect(ROLE_HIERARCHY[USER_ROLES.ADMIN]).toBe(4);
    });

    it('super_admin > admin', () => {
      expect(ROLE_HIERARCHY[USER_ROLES.SUPER_ADMIN]).toBeGreaterThan(
        ROLE_HIERARCHY[USER_ROLES.ADMIN]
      );
    });
  });

  // ─── hasRolePermission ─────────────────────────────────────
  describe('hasRolePermission', () => {
    it('super_admin can access admin-level resources', () => {
      expect(hasRolePermission('super_admin', 'admin')).toBe(true);
    });

    it('super_admin can access super_admin resources', () => {
      expect(hasRolePermission('super_admin', 'super_admin')).toBe(true);
    });

    it('admin cannot access super_admin resources', () => {
      expect(hasRolePermission('admin', 'super_admin')).toBe(false);
    });

    it('admin can access admin-level resources', () => {
      expect(hasRolePermission('admin', 'admin')).toBe(true);
    });

    it('unknown role (level 0) cannot access any protected resource', () => {
      expect(hasRolePermission('guest', 'admin')).toBe(false);
    });

    it('unknown role cannot access super_admin', () => {
      expect(hasRolePermission('guest', 'super_admin')).toBe(false);
    });
  });

  // ─── extractToken ──────────────────────────────────────────
  describe('extractToken', () => {
    it('extracts token from valid Bearer header', () => {
      const request = new Request('http://localhost', {
        headers: { Authorization: 'Bearer abc123' },
      });
      expect(extractToken(request)).toBe('abc123');
    });

    it('returns null for missing Authorization header', () => {
      const request = new Request('http://localhost');
      expect(extractToken(request)).toBeNull();
    });

    it('returns null for non-Bearer Authorization header', () => {
      const request = new Request('http://localhost', {
        headers: { Authorization: 'Basic abc123' },
      });
      expect(extractToken(request)).toBeNull();
    });

    it('returns empty string for Bearer with no token', () => {
      const request = new Request('http://localhost', {
        headers: { Authorization: 'Bearer ' },
      });
      // extractToken returns authHeader.substring(7) which is '' for 'Bearer '
      const result = extractToken(request);
      // Depending on the runtime, this may be '' or null; both are acceptable
      expect(result === '' || result === null).toBe(true);
    });
  });

  // ─── isValidEmail ──────────────────────────────────────────
  describe('isValidEmail', () => {
    it('accepts valid email addresses', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
      expect(isValidEmail('admin@domain.org')).toBe(true);
      expect(isValidEmail('test+tag@sub.domain.com')).toBe(true);
    });

    it('rejects invalid email addresses', () => {
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail('notanemail')).toBe(false);
      expect(isValidEmail('@domain.com')).toBe(false);
      expect(isValidEmail('user@')).toBe(false);
      expect(isValidEmail('user @domain.com')).toBe(false);
      expect(isValidEmail('user@domain')).toBe(false);
    });
  });

  // ─── JWT: generateToken + verifyToken ──────────────────────
  describe('JWT token generation and verification', () => {
    it('generates a valid access token', async () => {
      const payload = {
        sub: 'user_123',
        userId: 'user_123',
        email: 'test@example.com',
        role: 'admin',
        tenantId: 'tenant_1',
      };
      const token = await generateToken(payload, TEST_SECRET, 'access');
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('generates a valid refresh token', async () => {
      const payload = { sub: 'user_123', userId: 'user_123' };
      const token = await generateToken(payload, TEST_SECRET, 'refresh');
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('verifies a valid token and returns decoded payload', async () => {
      const payload = {
        sub: 'user_456',
        userId: 'user_456',
        email: 'admin@test.com',
        role: 'super_admin',
        tenantId: 'tenant_2',
      };
      const token = await generateToken(payload, TEST_SECRET, 'access');
      const decoded = await verifyToken(token, TEST_SECRET);

      expect(decoded).not.toBeNull();
      expect(decoded.sub).toBe('user_456');
      expect(decoded.userId).toBe('user_456');
      expect(decoded.email).toBe('admin@test.com');
      expect(decoded.role).toBe('super_admin');
      expect(decoded.tenantId).toBe('tenant_2');
    });

    it('rejects token signed with wrong secret', async () => {
      const payload = { sub: 'user_1', userId: 'user_1', role: 'admin' };
      const token = await generateToken(payload, TEST_SECRET, 'access');
      const decoded = await verifyToken(token, 'wrong_secret_key');
      expect(decoded).toBeNull();
    });

    it('rejects null token', async () => {
      const decoded = await verifyToken(null, TEST_SECRET);
      expect(decoded).toBeNull();
    });

    it('rejects empty string token', async () => {
      const decoded = await verifyToken('', TEST_SECRET);
      expect(decoded).toBeNull();
    });

    it('rejects null secret', async () => {
      const payload = { sub: 'user_1', userId: 'user_1' };
      const token = await generateToken(payload, TEST_SECRET, 'access');
      const decoded = await verifyToken(token, null);
      expect(decoded).toBeNull();
    });

    it('rejects tampered token', async () => {
      const payload = { sub: 'user_1', userId: 'user_1', role: 'admin' };
      const token = await generateToken(payload, TEST_SECRET, 'access');
      // Tamper with the token by flipping a character
      const parts = token.split('.');
      const middle = parts[1];
      const tampered = middle.split('').reverse().join('');
      const tamperedToken = parts[0] + '.' + tampered + '.' + parts[2];
      const decoded = await verifyToken(tamperedToken, TEST_SECRET);
      expect(decoded).toBeNull();
    });

    it('different tokens are not equal (unique iat)', async () => {
      const payload = { sub: 'user_1', userId: 'user_1', role: 'admin' };
      const token1 = await generateToken(payload, TEST_SECRET, 'access');
      // Small delay to ensure different iat
      await new Promise((r) => setTimeout(r, 1100));
      const token2 = await generateToken(payload, TEST_SECRET, 'access');
      expect(token1).not.toBe(token2);
    });
  });

  // ─── Password: hashPassword + verifyPassword ───────────────
  describe('Password hashing and verification', () => {
    it('hashPassword returns a bcrypt hash', async () => {
      const hash = await hashPassword('mySecurePassword123');
      expect(typeof hash).toBe('string');
      expect(hash).toMatch(/^\$2[aby]?\$/); // bcrypt hash prefix
      expect(hash).not.toBe('mySecurePassword123');
    });

    it('verifyPassword matches correct plaintext against bcrypt hash', async () => {
      const hash = await hashPassword('correctPassword');
      const result = await verifyPassword('correctPassword', hash);
      expect(result).toBe(true);
    });

    it('verifyPassword rejects wrong plaintext against bcrypt hash', async () => {
      const hash = await hashPassword('correctPassword');
      const result = await verifyPassword('wrongPassword', hash);
      expect(result).toBe(false);
    });

    it('verifyPassword returns false for null/undefined storedHash', async () => {
      expect(await verifyPassword('password', null)).toBe(false);
      expect(await verifyPassword('password', undefined)).toBe(false);
      expect(await verifyPassword('password', '')).toBe(false);
    });

    it('verifyPassword supports legacy $sha256$ prefixed hashes', async () => {
      // Compute a SHA-256 hash manually to create a $sha256$ prefixed hash
      const plaintext = 'legacyPass123';
      const msgBuffer = new TextEncoder().encode(plaintext);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const computed = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      const legacyHash = '$sha256$' + computed;

      const result = await verifyPassword(plaintext, legacyHash);
      expect(result).toBe(true);
    });

    it('verifyPassword rejects wrong password for $sha256$ hash', async () => {
      const plaintext = 'legacyPass123';
      const msgBuffer = new TextEncoder().encode(plaintext);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const computed = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      const legacyHash = '$sha256$' + computed;

      const result = await verifyPassword('wrongPassword', legacyHash);
      expect(result).toBe(false);
    });

    it('two hashes of the same password are different (random salt)', async () => {
      const hash1 = await hashPassword('samePass');
      const hash2 = await hashPassword('samePass');
      expect(hash1).not.toBe(hash2);
      // But both verify correctly
      expect(await verifyPassword('samePass', hash1)).toBe(true);
      expect(await verifyPassword('samePass', hash2)).toBe(true);
    });
  });

  // ─── rehashIfNeeded ────────────────────────────────────────
  describe('rehashIfNeeded', () => {
    it('rehashes $sha256$ passwords to bcrypt', async () => {
      const plaintext = 'rehashMe123';
      const msgBuffer = new TextEncoder().encode(plaintext);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const computed = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      const legacyHash = '$sha256$' + computed;

      const mockPrepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn(),
        }),
      });
      const mockEnv = { DB: { prepare: mockPrepare } };

      await rehashIfNeeded('admin_1', plaintext, legacyHash, mockEnv);

      // Should have called UPDATE on admins table
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE admins SET password_hash')
      );
    });

    it('does nothing for bcrypt passwords (no $sha256$ prefix)', async () => {
      const hash = await hashPassword('bcryptPass');
      const mockPrepare = vi.fn();
      const mockEnv = { DB: { prepare: mockPrepare } };

      await rehashIfNeeded('admin_1', 'bcryptPass', hash, mockEnv);

      // Should NOT have called DB.prepare at all
      expect(mockPrepare).not.toHaveBeenCalled();
    });
  });
});
