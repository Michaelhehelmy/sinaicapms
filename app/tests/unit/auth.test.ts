import { describe, it, expect } from 'vitest';
import { ROLE_HIERARCHY } from '@/lib/auth';

describe('ROLE_HIERARCHY', () => {
  it('has correct role levels', () => {
    expect(ROLE_HIERARCHY.super_admin).toBe(10);
    expect(ROLE_HIERARCHY.admin).toBe(4);
  });

  it('super_admin has highest level', () => {
    const maxRole = Object.entries(ROLE_HIERARCHY).reduce((a, b) =>
      a[1] > b[1] ? a : b,
    );
    expect(maxRole[0]).toBe('super_admin');
  });

  it('admin has lowest level', () => {
    const minRole = Object.entries(ROLE_HIERARCHY).reduce((a, b) =>
      a[1] < b[1] ? a : b,
    );
    expect(minRole[0]).toBe('admin');
  });
});
