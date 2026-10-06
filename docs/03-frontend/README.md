---
title: "docs/03-frontend — Frontend"
aliases:
  - 03-frontend
  - Frontend Index
tags:
  - type/index
  - audience/developer
  - domain/frontend
  - status/current
created: 2026-10-06
updated: 2026-10-06
relates-to:
  - "[[COMPONENT_CATALOG]]"
  - "[[PERF_BASELINE]]"
  - "[[README]]"
  - "[[ARCHITECTURE]]"
code-references:
  - "app/src/components/admin/AdminApp.tsx:60-107"
  - "app/astro.config.mjs:8-26"
  - "app/budget.json:1-14"
verified: never
---

# docs/03-frontend — Frontend

## Overview

The Astro/React app (`app/`): its component inventory and its performance budget. The catalog is a
map, the baseline is a measurement — the baseline is the one to re-run after any bundle-affecting change.

## Concepts

- **Component tiers** — `components/ui/` shared primitives, `components/admin/` dashboard panels,
  `components/pos/` terminal views, `components/public/` tenant + marketplace surfaces. The catalog
  states a real on-disk count per tier rather than an aspirational one.
- **Hooks are the data layer** — `useAdminData`, `useQueryHooks`, `useApiError`, `useSseInbox`,
  `useSseOrders`. The admin SPA runs entirely on TanStack Query; nothing fetches data outside `@/lib/api`.
- **Islands are rationed** — four public islands exist by design. `client:visible` for below-fold
  content, and adding an island is a deliberate cost, not a default.
- **Bundle budget** — `app/budget.json` holds the enforced limits; `PERF_BASELINE.md` records what
  browsers actually download, the top-15 chunks and the top-3 suspects.
- **Reverted is a recorded result** — the `client:visible` candidate that was applied and then
  reverted is kept in the baseline on purpose, so the same experiment is not repeated blind.

## Docs

| Doc | What it is |
|---|---|
| [[COMPONENT_CATALOG\|COMPONENT_CATALOG.md]] | Frontend component inventory with an explicit on-disk truth count and honest gaps called out. |
| [[PERF_BASELINE\|PERF_BASELINE.md]] | **The perf home.** Bundle snapshots (2026-08-07 / 2026-09-22 / 2026-10-02), the Lighthouse baseline, the top-3 chunk suspects and how to reproduce both. |

## Related

- [[README|docs/README.md]] — vault entry point
- [[ARCHITECTURE]] — the layer-1 rules this app is written against
- [[API_CONTRACT]] — the client these components call
- [[TESTING]] — unit suites for the components and hooks above
- [[RUNBOOK]] — deploy and post-deploy smoke for the built bundle

## Gaps

<!-- Populated by 99-gaps/code-vs-docs.md -->
