# Legacy migrations archive (0001–0099)

- Squashed on: 2026-09-23.
- Reason: reduce migration noise; the 99 files below are replaced by the canonical
  14-file baseline (`backend/migrations/0001_core.sql` … `0014_seed.sql`).
- Equivalence proof: a fresh local D1 applying (baseline 14 + 0100–0110) produces a
  `sqlite_master` export that diffs EMPTY against the canonical post-109 export
  (`.opencode/audits/tenant-architecture/canonical-schema-2026-09-23.txt`).
- Tracking rewrite (data-preserving, `d1_migrations` only — no table dropped, no data
  written): staging `9c8c31f`, production `c14b466` (prod additionally applied the
  genuinely-pending 0108 + 0110 during the rewrite).
- Full analysis: `.opencode/audits/tenant-architecture/03-migration-consolidation.md`.
- Preserved for schema archaeology ONLY. Do NOT move these files back into
  `backend/migrations/` and do NOT re-apply them — wrangler scans only the top
  level of `backend/migrations/` (this subdirectory is ignored), and the live
  ledgers (staging + prod) already record the baseline names.
