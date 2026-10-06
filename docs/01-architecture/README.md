---
title: "docs/01-architecture — Architecture"
aliases:
  - 01-architecture
  - Architecture Index
tags:
  - type/index
  - audience/developer
  - domain/architecture
  - status/current
created: 2026-10-06
updated: 2026-10-06
relates-to:
  - "[[ARCHITECTURE]]"
  - "[[QUICK_START]]"
  - "[[docs/README]]"
code-references:
  - "app/src/lib/routeZones.ts:23-69"
  - "backend/src/index.js:123-141"
  - "deploy.sh:376-380"
verified: never
---

# docs/01-architecture — Architecture

## Overview

The two canonical entry points for the system: **what shape it is**, and **how to get it
running**. Every other folder in the vault describes one part of one of these two docs.

## Concepts

- **Four-layer contract** — `Frontend (app/)` → `API (backend/)` → `Database (D1)` + `Cache (KV/R2)`.
  The frontend never touches D1 or KV; every read and write goes through `/api/*`.
- **Zone model** — every route resolves to `marketplace` or `tenant` via `app/src/lib/routeZones.ts`.
  `/camps` and `/camp/*` are marketplace-only; `/book` `/menu` `/rooms` and `/pos/*` are tenant-only;
  a wrong-zone route renders a branded 404 through `ZoneGuard`.
- **Tenant isolation, enforced twice** — `app/src/middleware/tenant.ts` decides what renders,
  `backend/src/middleware/` decides what is readable. Neither trusts the other.
- **Rate limiting and the free-plan trap** — the limiter is KV-backed and fails closed, but the free
  plan caps KV writes at 1,000/day, so `RATE_LIMIT_KV_ENABLED="false"` forces the per-isolate
  in-memory fallback. [[security-guide]] carries the security view of the same mechanism.
- **The second Worker** — `monitor/` is a separate Worker with its own storage, not a view of the API.
- **Deployment and tests** — `./deploy.sh` is the single deploy path; each layer has its own test command.

## Docs

| Doc | What it is |
|---|---|
| [[ARCHITECTURE\|ARCHITECTURE.md]] | Self-declared source of truth for the system shape. If it disagrees with prose elsewhere, trust this file. |
| [[QUICK_START\|QUICK_START.md]] | Setup path from zero to a running stack. |

## Related

- [[docs/README]] — vault entry point
- [[API_CONTRACT]] — the frontend↔API rule layer 2 has to honour
- [[COMPONENT_CATALOG]] · [[PERF_BASELINE]] — the layer-1 reference docs
- [[RUNBOOK]] — deploy, rollback and incident procedures for the shape described here
- [[migrations]] — the layer-3 schema the contract depends on
- [[docs/98-history/README]] — superseded architecture and wave reports

## Gaps

<!-- Populated by 99-gaps/code-vs-docs.md -->
