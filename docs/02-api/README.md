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

The frontend↔backend contract, and the full endpoint map.

| Doc | What it is |
|---|---|
| [`API_CONTRACT.md`](API_CONTRACT.md) | **The contract statement** — thin, and it says so: the contract lives in `app/src/lib/api.ts`. |
| [`API_SURFACE_MAP.md`](API_SURFACE_MAP.md) | The full per-domain mapping: endpoint → client function → handler → table → hook. Split out of `../API_SURFACE.md`. |
