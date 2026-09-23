# Staging tenant-manifest UI walkthrough — 7/7 PASS (2026-09-22)

Host: acacia.staging.sinaicamps.com/admin (tenant admin) + apex /admin/import (super-admin).
Supersedes BLOCKED-tenant-manifest-staging.md (staging redeployed with feature code).

1. Import section visible: PASS
2. Template download valid, no identity key: PASS
3. Identity block rejected with exact message, Import disabled: PASS
4. Valid 1 product + 1 room → preview counts 1/1: PASS
5. Import success toast with counts: PASS (Walk Tent/R1 live in staging tenant;
   required a camp in tenant — provisioned Acacia Main Camp via API first)
6. Malformed JSON → error, Import disabled: PASS
7. Super-admin banner visible at apex /admin/import: PASS
