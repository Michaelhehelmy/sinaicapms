---
title: "docs/02-api — API"
aliases:
  - 02-api
  - API Index
tags:
  - type/index
  - audience/developer
  - domain/api
  - status/current
created: 2026-10-06
updated: 2026-10-06
relates-to:
  - "[[API_CONTRACT]]"
  - "[[API_SURFACE_MAP]]"
  - "[[API_SURFACE]]"
  - "[[README]]"
code-references:
  - "app/src/lib/api.ts:1-2837"
  - "backend/src/routes/registry.js:1-3494"
  - "backend/openapi.json"
verified: never
---

# docs/02-api — API

## Overview

The frontend↔backend contract, and the full endpoint map. Read the contract first: it is short on
purpose, because it is a statement of rules, not a list of endpoints.

## Concepts

- **The contract lives in the client** — `app/src/lib/api.ts` is the authoritative surface, not this
  documentation. A doc that disagrees with the client loses.
- **Generated types, not hand-written ones** — `app/src/lib/api-types.ts` is generated from
  `backend/openapi.json`; regeneration is part of the setup path, not an occasional chore.
- **Auth model** — JWT (HS256) in `Authorization: Bearer`, tenant scope resolved server-side.
  401 means "not authenticated", 403 means "authenticated but not allowed" — the two are not interchangeable.
- **Response envelope** — errors are `errorResponse(message, status, errors)`; success is plain JSON.
  Every endpoint answers the same shape so one client error path covers the whole surface.
- **Per-domain map** — `API_SURFACE_MAP.md` walks **41** domain groups (`grep -c "^## " API_SURFACE_MAP.md` →
  41), each as endpoint → client function → handler → table → hook. It records the
  **frontend's reach**, which is a strict superset of what the OpenAPI registry declares —
  see `API_CONTRACT.md` §1 for the measured gap (38 of 268 rows registered) and for the
  three columns of the map that have drifted from the tree.

## Docs

| Doc | What it is |
|---|---|
| [[API_CONTRACT\|API_CONTRACT.md]] | **The contract statement** — thin, and it says so: the contract lives in `app/src/lib/api.ts`. |
| [[API_SURFACE_MAP\|API_SURFACE_MAP.md]] | The full per-domain mapping: endpoint → client function → handler → table → hook. Split out of `../API_SURFACE.md`. |

## Related

- [[README|docs/README.md]] — vault entry point
- [[ARCHITECTURE]] — the layer split these endpoints are the seam of
- [[security-guide]] — auth, RBAC and tenant scoping on the same endpoints
- [[migrations]] — the tables the surface map resolves to
- [[tenant-import-schema]] — the one endpoint whose contract is a whole manifest

## Gaps

Audited 2026-10-06 against the tree, read-only. This folder's queued doc fixes:

- **[[code-vs-docs]]** — **10** `STALE`/`FALSE` claims, plus **11** `MATCHED` controls this folder's findings rest on. `MATCHED` entries are reproduced at the foot of that note, because a finding that quotes one of them is only auditable if it is readable there.
- **[[unverified]]** — none · **[[unimplemented]]** — **3** items of real code no doc here claims.

Nothing is fixed yet. Each entry carries the `file:line` its claim was measured against and a named action; fix this folder's carriers together, not one file at a time — see [[99-gaps/README]] for the workflow.

