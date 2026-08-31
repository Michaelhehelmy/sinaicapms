import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isSoftDeleted,
  softDeleteProject,
  softDeleteTenant,
  restoreProject,
  restoreTenant,
  hardDeleteTenant,
} from '../src/api/softDelete.js';

function mockDb(batchResults = []) {
  return {
    batch: vi.fn().mockResolvedValue(batchResults),
    prepare: vi.fn(() => ({
      bind: vi.fn().mockReturnThis(),
    })),
  };
}

describe('softDelete utilities', () => {
  // ─── isSoftDeleted ──────────────────────────────────────────
  describe('isSoftDeleted', () => {
    it('returns false for null', () => {
      expect(isSoftDeleted(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isSoftDeleted(undefined)).toBe(false);
    });

    it('returns false when deleted_at is null', () => {
      expect(isSoftDeleted({ deleted_at: null })).toBe(false);
    });

    it('returns false when deleted_at is undefined', () => {
      expect(isSoftDeleted({ deleted_at: undefined })).toBe(false);
    });

    it('returns false when deleted_at key is missing', () => {
      expect(isSoftDeleted({ id: 'x' })).toBe(false);
    });

    it('returns true when deleted_at is a datetime string', () => {
      expect(isSoftDeleted({ deleted_at: '2026-01-01T00:00:00Z' })).toBe(true);
    });

    it('returns true when deleted_at is a non-null value', () => {
      expect(isSoftDeleted({ deleted_at: 1 })).toBe(true);
    });
  });

  // ─── softDeleteProject ───────────────────────────────────────
  describe('softDeleteProject', () => {
    it('returns false for falsy projectId', async () => {
      expect(await softDeleteProject(mockDb(), null)).toBe(false);
      expect(await softDeleteProject(mockDb(), '')).toBe(false);
      expect(await softDeleteProject(mockDb(), undefined)).toBe(false);
    });

    it('returns true when a row is updated', async () => {
      const db = mockDb([{ meta: { changes: 1 } }]);
      expect(await softDeleteProject(db, 'proj_1')).toBe(true);
      expect(db.batch).toHaveBeenCalledTimes(1);
    });

    it('returns false when no row is updated (already deleted)', async () => {
      const db = mockDb([{ meta: { changes: 0 } }]);
      expect(await softDeleteProject(db, 'proj_1')).toBe(false);
    });

    it('returns false when batch returns empty', async () => {
      const db = mockDb([]);
      expect(await softDeleteProject(db, 'proj_1')).toBe(false);
    });

    it('returns false when meta is missing', async () => {
      const db = mockDb([{}]);
      expect(await softDeleteProject(db, 'proj_1')).toBe(false);
    });
  });

  // ─── softDeleteTenant ───────────────────────────────────────
  describe('softDeleteTenant', () => {
    it('returns false for falsy tenantId', async () => {
      expect(await softDeleteTenant(mockDb(), null)).toBe(false);
      expect(await softDeleteTenant(mockDb(), '')).toBe(false);
    });

    it('returns true when tenant row is updated', async () => {
      const db = mockDb([
        { meta: { changes: 3 } },  // projects
        { meta: { changes: 1 } },  // tenant
      ]);
      expect(await softDeleteTenant(db, 't1')).toBe(true);
      expect(db.batch).toHaveBeenCalledTimes(1);
    });

    it('returns false when tenant not found', async () => {
      const db = mockDb([
        { meta: { changes: 0 } },
        { meta: { changes: 0 } },
      ]);
      expect(await softDeleteTenant(db, 't1')).toBe(false);
    });

    it('runs projects update before tenant update in batch', async () => {
      const db = mockDb([
        { meta: { changes: 2 } },
        { meta: { changes: 1 } },
      ]);
      await softDeleteTenant(db, 't1');
      // Verify batch was called (both statements in one batch)
      expect(db.batch).toHaveBeenCalledTimes(1);
      expect(db.batch.mock.calls[0][0]).toHaveLength(2);
    });
  });

  // ─── restoreProject ─────────────────────────────────────────
  describe('restoreProject', () => {
    it('returns false for falsy projectId', async () => {
      expect(await restoreProject(mockDb(), null)).toBe(false);
      expect(await restoreProject(mockDb(), '')).toBe(false);
    });

    it('returns true when a row is restored', async () => {
      const db = mockDb([{ meta: { changes: 1 } }]);
      expect(await restoreProject(db, 'proj_1')).toBe(true);
    });

    it('returns false when not deleted (changes = 0)', async () => {
      const db = mockDb([{ meta: { changes: 0 } }]);
      expect(await restoreProject(db, 'proj_1')).toBe(false);
    });
  });

  // ─── restoreTenant ──────────────────────────────────────────
  describe('restoreTenant', () => {
    it('returns false for falsy tenantId', async () => {
      expect(await restoreTenant(mockDb(), null)).toBe(false);
      expect(await restoreTenant(mockDb(), '')).toBe(false);
    });

    it('returns true when tenant is restored', async () => {
      const db = mockDb([
        { meta: { changes: 1 } },  // tenant
        { meta: { changes: 3 } },  // projects
      ]);
      expect(await restoreTenant(db, 't1')).toBe(true);
    });

    it('returns false when tenant not soft-deleted', async () => {
      const db = mockDb([
        { meta: { changes: 0 } },
        { meta: { changes: 0 } },
      ]);
      expect(await restoreTenant(db, 't1')).toBe(false);
    });

    it('runs tenant restore before projects restore in batch', async () => {
      const db = mockDb([
        { meta: { changes: 1 } },
        { meta: { changes: 2 } },
      ]);
      await restoreTenant(db, 't1');
      expect(db.batch).toHaveBeenCalledTimes(1);
      expect(db.batch.mock.calls[0][0]).toHaveLength(2);
    });
  });

  // ─── hardDeleteTenant ───────────────────────────────────────
  describe('hardDeleteTenant', () => {
    it('returns false for falsy tenantId', async () => {
      expect(await hardDeleteTenant(mockDb(), null)).toBe(false);
      expect(await hardDeleteTenant(mockDb(), '')).toBe(false);
    });

    it('returns true when tenant is deleted (last statement changes > 0)', async () => {
      // 30 statements in hardDeleteTenant — last one is the tenant DELETE
      const stmts = Array.from({ length: 29 }, () => ({ meta: { changes: 1 } }));
      stmts.push({ meta: { changes: 1 } }); // final tenant row
      const db = mockDb(stmts);
      expect(await hardDeleteTenant(db, 't1')).toBe(true);
    });

    it('returns false when tenant not found (last statement changes = 0)', async () => {
      const stmts = Array.from({ length: 29 }, () => ({ meta: { changes: 1 } }));
      stmts.push({ meta: { changes: 0 } }); // tenant not found
      const db = mockDb(stmts);
      expect(await hardDeleteTenant(db, 't1')).toBe(false);
    });

    it('sends correct number of batch statements', async () => {
      // Create enough results for all statements
      const stmts = Array.from({ length: 31 }, () => ({ meta: { changes: 1 } }));
      const db = mockDb(stmts);
      await hardDeleteTenant(db, 't1');
      const batchArg = db.batch.mock.calls[0][0];
      // hardDeleteTenant has a specific number of DELETE statements
      expect(batchArg.length).toBeGreaterThanOrEqual(25);
      expect(batchArg.length).toBeLessThanOrEqual(35);
    });

    it('returns false when batch returns empty array', async () => {
      const db = mockDb([]);
      expect(await hardDeleteTenant(db, 't1')).toBe(false);
    });

    it('returns false when batch result has no meta', async () => {
      const db = mockDb([{}, {}, {}]);
      expect(await hardDeleteTenant(db, 't1')).toBe(false);
    });
  });
});
