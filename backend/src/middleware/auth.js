/**
 * Authentication Middleware — backward-compat re-export from sharedAuth.
 *
 * All real logic lives in sharedAuth.js. This file re-exports symbols
 * that existing callers import from here so nothing breaks.
 */

export {
  generateToken,
  verifyToken,
  extractToken,
  verifyPassword,
  hashPassword,
  rehashIfNeeded,
  isValidEmail,
  hasRolePermission,
  authMiddleware,
  auth,
  USER_ROLES,
  ROLE_HIERARCHY,
} from './sharedAuth.js';
