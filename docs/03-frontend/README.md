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
  - "app/src/hooks/ (5 files)"
  - "app/src/pages/marketplace.astro:14"
  - "app/src/pages/storefront/{index:54,cart:52,checkout:53}.astro, order/[orderNumber]/confirmation.astro:54"
  - "app/src/components/public/TenantLanding.astro:203, BookPage.astro:45, MenuPage.astro:48"
  - "app/src/layouts/PublicLayout.astro:778 (debug-gated DebugFeedbackWidget)"
  - "app/astro.config.mjs:8-26"
  - "app/budget.json:1-14 (resource sizes only)"
  - "app/package.json:15 (--budget-path=budget.json)"
  - "tests/lighthouse/run.ts:54 (cls/lcp/tbt targets, enforced: false)"
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
- **Hooks are the data layer** — `app/src/hooks/` is exactly five files:
  `useAdminData`, `usePosQueries`, `useQueryHooks`, `useSseInbox`, `useSseOrders`.
  **There is no `useApiError`** — the name previously listed here exists nowhere under
  `app/src`, and `usePosQueries` was missing while the count stayed at 5. The admin SPA runs
  entirely on TanStack Query and nothing fetches data outside `@/lib/api`
  (`grep -rn "fetch('" app/src/components/admin app/src/components/pos` → 0). The three
  deliberate raw-`fetch` bypasses that *do* exist all live inside `app/src/lib/api.ts` and
  are documented in `API_CONTRACT.md` §1.
- **Islands are rationed — 9 public-facing island sites exist, not 4** (re-censused
  2026-10-06). `client:visible` ×6 — `TenantLanding.astro`, `marketplace.astro:14`, and the
  four storefront pages (`storefront/index.astro:54`, `cart.astro:52`,
  `checkout.astro:53`, `order/[orderNumber]/confirmation.astro:54`) — plus `client:load` ×3 —
  `BookPage.astro` (`ReservationSummary`), `MenuPage.astro` (`TenantMenu`), `PublicLayout.astro`
  (the debug-gated `DebugFeedbackWidget`). A further **8** `client:only="react"` sites are
  full-page SPA hosts (admin, POS, onboarding, register/signup, forgot/reset password) and are
  not islands in the rationing sense. **Total directive sites: 17.**
  A raw `grep -c "client:" app/src` reports **23**; the 6 extra hits are code-comment
  mentions inside `StorefrontCart.tsx:4`, `StorefrontCheckout.tsx:4`,
  `StorefrontConfirmation.tsx:4`, `ShopCatalog.tsx:4`, `PosShell.tsx:10` and
  `AdminShell.tsx:12`, not directives. `ARCHITECTURE.md` §3 carries the same census and is
  consistent with it. `client:visible` for below-fold content, `client:load` only for
  above-fold primary interactive content, `client:only` only for full-page SPA hosts.
- **Bundle budget — two different files, and only one of them is "enforced"** —
  `app/budget.json` holds **five `transferSize` budgets only** (script 300, stylesheet 100,
  image 1500, font 400, total 2500 KB) and is genuinely enforced by the `lighthouse` script's
  `--budget-path=budget.json` (`app/package.json:15`). **The CLS / LCP / TBT targets live in a
  different file**: `tests/lighthouse/run.ts:54` = `{ cls: 0.1, lcpMs: 2500, tbtMs: 300,
  enforced: false }`. So "enforced" is right for resource sizes and wrong unqualified for the
  Core Web Vitals targets — those are recorded, not gated. (`PERF_BASELINE.md` §Status
  previously said `budget.json` enforced "TBT < 200 ms", which is wrong twice over: wrong
  file, and the real target is **300**.) `PERF_BASELINE.md` records what browsers actually
  download, the top-15 chunks and the top-3 suspects.
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

Audited 2026-10-06 against the tree, read-only. This folder's queued doc fixes:

- **[[code-vs-docs]]** — **10** `STALE`/`FALSE` claims, plus **9** `MATCHED` controls this folder's findings rest on. `MATCHED` entries are reproduced at the foot of that note, because a finding that quotes one of them is only auditable if it is readable there.
- **[[unverified]]** — **6** claims this folder states that the tree cannot answer · **[[unimplemented]]** — none.

Nothing is fixed yet. Each entry carries the `file:line` its claim was measured against and a named action; fix this folder's carriers together, not one file at a time — see [[99-gaps/README]] for the workflow.

