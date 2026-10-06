---
title: "docs/08-guides — Product guides"
aliases:
tags:
  - type/index
  - audience/tenant-admin
  - domain/guides
  - status/live
created: 2026-10-06
updated: 2026-10-06
relates-to:
  - "[[analytics-guide]]"
  - "[[camp-guide]]"
  - "[[restaurant-guide]]"
  - "[[service-guide]]"
  - "[[supermarket-guide]]"
code-references:
  - "app/src/lib/api.ts"
  - "backend/src/index.js"
  - "app/src/components/admin/AdminApp.tsx"
  - "app/src/components/pos/POSApp.tsx"
verified: never
---
# docs/08-guides — Product guides

## Overview

The five business pillars, one guide each. These are UI walkthroughs for a tenant admin — what to
click and what the screen is called — not API docs. Each guide's `code-references` frontmatter names
the real router and panel behind the screen, so a claim here can be checked against the tree.

## Concepts

- **Pillar ↔ endpoint-group alignment** — each guide maps to a domain group in [[API_SURFACE_MAP]]:
  camp→Camps/Rooms/Rate Plans, restaurant→Tables/Reservations/Kitchen, service→Services,
  supermarket→Products/Promotions/Inventory, analytics→Reports.
- **Setup precedes operation** — every operational guide opens with a setup section, because a walkthrough
  that assumes a configured tenant is a walkthrough nobody can follow.
- **Status lifecycles are the load-bearing concept** — rooms (available → reserved → occupied →
  cleaning → out_of_service), bookings, reservations and tables all move through named states, and the
  state machine is what the UI is really teaching.
- **Pricing is its own step** — rate plans and pricing tiers are separate objects from rooms, services
  or products, and are configured after the thing they price exists.
- **Promotions and stock are inventory concerns, not pricing ones** — BOGO / percentage / fixed
  discounts, low-stock alerts and manual stock adjustments live in the supermarket pillar.
- **Custom fields are JSON Schema** — the service pillar's extensibility mechanism, so its UI is
  schema-driven rather than hardcoded fields.
- **Exports and scheduled reports are a first-class feature** — the analytics pillar ends in delivery,
  not just display.

## Docs

| Doc | What it is |
|---|---|
| [[analytics-guide\|analytics-guide.md]] | Analytics pillar. |
| [[camp-guide\|camp-guide.md]] | Camp / accommodation pillar. |
| [[restaurant-guide\|restaurant-guide.md]] | Restaurant pillar. |
| [[service-guide\|service-guide.md]] | Services pillar. |
| [[supermarket-guide\|supermarket-guide.md]] | Supermarket pillar. |

## Related

- [[README|docs/README.md]] — vault entry point; its TOC is the only inbound link to these five guides
- [[API_SURFACE_MAP]] — the endpoint groups behind each pillar
- [[COMPONENT_CATALOG]] — the admin panels and POS views these walkthroughs drive
- [[TESTING]] — manual cross-cutting steps and the admin tab IDs used to reach each panel
- [[DEVELOPER_ROADMAP]] — what is still being decided about these pillars

## Gaps

<!-- Populated by 99-gaps/code-vs-docs.md -->
