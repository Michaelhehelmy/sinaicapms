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
  - "[[02-api/API_SURFACE_MAP]]"
code-references:
  - "backend/src/api/tenant-import.js"
  - "backend/src/index.js:244"
  - "backend/tests/tenant-import-smoke.test.js"
verified: never
---
# docs/10-tenant-import — Tenant Import

## Overview

`POST /api/tenants/import` — the single manifest that provisions or fills a tenant. One admin call
imports branding, products, rooms, rate plans, menu and POS users. Three docs describe the contract,
one records an item that is still blocked.

## Concepts

- **88 leaf fields** — the manifest schema is a table, not prose, and the field count is a measured
  number at the current handler rather than an aspiration.
- **Two modes, and only one may roll back** — existing-tenant mode (the requester's own tenant, admin
  roles) and super-admin `identity` provisioning, which creates tenant + admin + POS org + project.
  Identity mode is a SAGA with a reverse-order undo log; existing-tenant mode never deletes, so its
  failure answer honestly says partial data may remain.
- **Tenant-type matrix is handler-verified** — which of the 8 manifest sections does anything for each
  of the 5 tenant types, read off the handler branches, never assumed. A section that is accepted and
  ignored is a distinct outcome from one that is unsupported.
- **Products must exist before anything references them** — referenced products must be present in the
  tenant (or resolved by `productName`) or the manifest is a 400/404; rooms and rate plans land in the
  guarded `rooms_new` / `rate_plans_new` tables.
- **Meals reference categories by `categoryName`**, never by id, because the category set differs per tenant.
- **Image handling is bounded** — base64 `data:image/*;base64,…` up to 8 MB auto-uploads to R2 and
  stores the returned `/api/media/` URL; `http(s)` and `/api/media/` URLs pass through unchanged.
- **A round-trip is only closed when both sides name the column** — the export CLI's ledger of what
  survives and what drops is the honest measure of import fidelity; a clean read side proves nothing.
- **The composite-PK item is BLOCKED, not open** — a verdict and an unblock condition, kept separate
  from the schema docs so an open question is never filed under "here is how it works".

## Docs

| Doc | What it is |
|---|---|
| [[tenant-import-schema\|tenant-import-schema.md]] | The 88-leaf-field manifest schema table, the D1 probe caps, and the 2026-09-30 schema-level findings. |
| [[tenant-import-types\|tenant-import-types.md]] | Which of the 8 manifest sections does anything for each of the 5 tenant types, with the handler-branch evidence. |
| [[tenant-import-appendix\|tenant-import-appendix.md]] | Example manifests, the validator CLI, the export CLI and its round-trip ledger, residual findings, and the images/errors/top-10-mistakes reference. |
| [[BLOCKED-pos-products-composite-pk\|BLOCKED-pos-products-composite-pk.md]] | **Live BLOCKED item** — why a composite `(tenant_id, id)` PK on `pos_products` cannot be landed, and what would unblock it. |

## Related

- [[README|docs/README.md]] — vault entry point
- [[tenant-import|tenant-import.md]] — the path-preserving stub at the original path (walkthrough + manifest field reference); the three split halves below also claim the bare `tenant-import` name, so the stub is addressed by PATH here
- [[API_SURFACE_MAP]] — this endpoint's row in the full surface map
- [[API_CONTRACT]] — the response envelope the manifest errors answer with
- [[migrations]] — the guarded `rooms_new` / `rate_plans_new` tables the manifest writes
- [[BLOCKED-pos-products-composite-pk]] §5 — why identity-path rollback coverage is still insufficient

## Gaps

Audited 2026-10-06 against the tree, read-only. This folder's queued doc fixes:

- **[[code-vs-docs]]** — **7** `STALE`/`FALSE` claims, plus **11** `MATCHED` controls this folder's findings rest on. `MATCHED` entries are reproduced at the foot of that note, because a finding that quotes one of them is only auditable if it is readable there.
- **[[unverified]]** — none · **[[unimplemented]]** — **1** item of real code no doc here claims.

Nothing is fixed yet. Each entry carries the `file:line` its claim was measured against and a named action; fix this folder's carriers together, not one file at a time — see [[99-gaps/README]] for the workflow.

