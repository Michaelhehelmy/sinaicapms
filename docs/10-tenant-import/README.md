---
title: "docs/10-tenant-import — Tenant Import"
aliases:
tags:
  - type/index
  - audience/developer
  - domain/tenant-import
  - status/live
created: 2026-10-06
updated: 2026-10-06
relates-to:
  - "[[tenant-import]]"
  - "[[tenant-import-schema]]"
  - "[[tenant-import-types]]"
  - "[[tenant-import-appendix]]"
  - "[[BLOCKED-pos-products-composite-pk]]"
  - "[[docs/02-api/API_SURFACE_MAP]]"
code-references:
  - "backend/src/api/tenant-import.js"
  - "backend/src/index.js:244"
  - "backend/tests/tenant-import-smoke.test.js"
verified: never
---
# docs/10-tenant-import — Tenant Import

`POST /api/tenants/import` — the manifest that provisions or fills a tenant.

| Doc | What it is |
|---|---|
| [`tenant-import-schema.md`](tenant-import-schema.md) | The 88-leaf-field manifest schema table, the D1 probe caps, and the 2026-09-30 schema-level findings. |
| [`tenant-import-types.md`](tenant-import-types.md) | Which of the 8 manifest sections does anything for each of the 5 tenant types, with the handler-branch evidence. |
| [`tenant-import-appendix.md`](tenant-import-appendix.md) | Example manifests, the validator CLI, the export CLI and its round-trip ledger, residual findings, and the images/errors/top-10-mistakes reference. |
| [`BLOCKED-pos-products-composite-pk.md`](BLOCKED-pos-products-composite-pk.md) | **Live BLOCKED item** — why a composite `(tenant_id, id)` PK on `pos_products` cannot be landed, and what would unblock it. |
