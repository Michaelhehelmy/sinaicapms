import { describe, it, expect } from 'vitest';
import { ROLE_HIERARCHY, roleAtLeast } from '@/lib/rbac';

describe('ROLE_HIERARCHY', () => {
  it('has correct role levels (Phase 6: mirrors backend ROLE_RANKS)', () => {
    expect(ROLE_HIERARCHY.super_admin).toBe(100);
    expect(ROLE_HIERARCHY.admin).toBe(80);
    expect(ROLE_HIERARCHY.manager).toBe(50);
    expect(ROLE_HIERARCHY.cashier).toBe(30);
  });

  it('super_admin has highest level', () => {
    const maxRole = Object.entries(ROLE_HIERARCHY).reduce((a, b) =>
      a[1] > b[1] ? a : b,
    );
    expect(maxRole[0]).toBe('super_admin');
  });

  it('cashier has lowest level', () => {
    const minRole = Object.entries(ROLE_HIERARCHY).reduce((a, b) =>
      a[1] < b[1] ? a : b,
    );
    expect(minRole[0]).toBe('cashier');
  });

  it('roleAtLeast enforces the tier order', () => {
    expect(roleAtLeast('super_admin', 'admin')).toBe(true);
    expect(roleAtLeast('admin', 'manager')).toBe(true);
    expect(roleAtLeast('manager', 'cashier')).toBe(true);
    expect(roleAtLeast('cashier', 'manager')).toBe(false);
    expect(roleAtLeast(undefined, 'cashier')).toBe(false);
  });
});
