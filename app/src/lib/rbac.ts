// Phase 6 / Task 3 — Single-source RBAC rank table (Unified Architecture Plan §6).
//
// Mirrors backend ROLE_RANKS (backend/src/middleware/requireAuth.js) exactly:
// super_admin:100 > admin:80 > manager:50 > cashier:30. The frontend must never
// redefine its own hierarchy — import from here.

export const ROLE_HIERARCHY: Record<string, number> = {
  super_admin: 100,
  admin: 80,
  manager: 50,
  cashier: 30,
};

/**
 * True when `role` ranks at or above `minRole`. Unknown roles (including
 * undefined/null) always fail; unknown minRole requirements also resolve to 0,
 * so any known role satisfies them.
 */
export function roleAtLeast(role: string | null | undefined, minRole: string): boolean {
  return (ROLE_HIERARCHY[role ?? ''] ?? 0) >= (ROLE_HIERARCHY[minRole] ?? 0);
}
