---
title: "docs/98-history/worksheets"
aliases:
tags:
  - type/index
  - audience/developer
  - domain/history
  - status/archived
created: 2026-10-06
updated: 2026-10-06
relates-to:
  - "[[docs/98-history/README]]"
  - "[[audit-2026-09-15-route-gaps]]"
  - "[[audit-2026-09-30-eschtml-inventory]]"
  - "[[audit-2026-09-30-monitor-404]]"
  - "[[audit-2026-09-30-tenant-import-parity]]"
code-references:
  - "backend/src/index.js"
  - "app/src/lib/utils.ts"
  - "scripts/export-tenant.mjs"
verified: never
---
# docs/98-history/worksheets

Worksheets — one-step investigations

Each of these root-caused something that then shipped. The verdict of each lives in the live doc it fed.

| Doc | What it is |
|---|---|
| [`audit-2026-09-15-route-gaps.md`](audit-2026-09-15-route-gaps.md) |  |
| [`audit-2026-09-30-monitor-404.md`](audit-2026-09-30-monitor-404.md) |  |
| [`audit-2026-09-30-eschtml-inventory.md`](audit-2026-09-30-eschtml-inventory.md) | Still cited by [`../../06-security/security-guide.md`](../../06-security/security-guide.md) as the full inventory. |
| [`audit-2026-09-30-tenant-import-parity.md`](audit-2026-09-30-tenant-import-parity.md) | Still cited by migration `0127` and two backend tests; its D3/D4 drift items survive via [`../../10-tenant-import/BLOCKED-pos-products-composite-pk.md`](../../10-tenant-import/BLOCKED-pos-products-composite-pk.md). |
