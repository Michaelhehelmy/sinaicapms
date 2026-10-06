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
  - "[[docs/README]]"
code-references:
  - "app/src/lib/api.ts:1-2838"
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
- **Per-domain map** — `API_SURFACE_MAP.md` walks 25 domain groups, each as
  endpoint → client function → handler → table → hook.

## Docs

| Doc | What it is |
|---|---|
| [[API_CONTRACT\|API_CONTRACT.md]] | **The contract statement** — thin, and it says so: the contract lives in `app/src/lib/api.ts`. |
| [[API_SURFACE_MAP\|API_SURFACE_MAP.md]] | The full per-domain mapping: endpoint → client function → handler → table → hook. Split out of `../API_SURFACE.md`. |

## Related

- [[docs/README]] — vault entry point
- [[ARCHITECTURE]] — the layer split these endpoints are the seam of
- [[security-guide]] — auth, RBAC and tenant scoping on the same endpoints
- [[migrations]] — the tables the surface map resolves to
- [[tenant-import-schema]] — the one endpoint whose contract is a whole manifest

## Gaps

<!-- Populated by 99-gaps/code-vs-docs.md -->
