# Frontend Unification Audit — POS · Tenant · Marketplace · Admin

> **Scope**: Deep audit of `app/src` (Astro 5.18 + React 19 islands + Tailwind v4, `output: 'server'` on Cloudflare Pages) to answer whether and how the four product concerns can be unified into ONE frontend.
> **Method**: Every page route, both SPA shells, all public components, `lib/auth.tsx`, `lib/api.ts`, all hooks, all layouts, and `lib/routeZones.ts` were read in full. Bundle numbers measured from a real `dist/` build.
> **Date**: 2026-08-22 · **Author**: tmp agent (@frontend audit)

---

## 0. Executive Summary

The four concerns are **already one frontend at the repo/build/deploy level** (single Astro project, single Cloudflare Pages deployment, single `api.ts` transport). What remains fragmented is **runtime architecture**: two different SPA navigation models, two parallel auth systems over one transport, two parallel data-fetching layers inside Admin itself, and a UI kit whose adoption is uneven (Admin-heavy, POS-partial, Public-islands-minimal).

**Headline findings**

| # | Finding | Severity |
|---|---------|----------|
| F1 | POS "SPA" navigates by **full page reloads** (`window.location.href = posUrl(...)`) — every tab click is an SSR round-trip + full re-hydration | High |
| F2 | POS ships a **dead `QueryClientProvider`** — zero views use React Query; all data fetching is hand-rolled `useState/useEffect` | High |
| F3 | Two parallel auth realms share one `apiFetch` via an endpoint-prefix heuristic (`/pos/` → `pos_token`, else `sinaicamps_token`) — works, but undocumented coupling | High |
| F4 | Admin runs **two data layers simultaneously**: legacy `useCachedData` hooks (`useAdminData.ts`) still feed the shell while panels use TanStack Query | Medium |
| F5 | 9 of 26 `ui/` components are **story-only dead code** (zero app imports) | Low |
| F6 | 3 pages violate the documented zone-guard pattern (`return Astro.redirect('/404')` before the guard renders) | Medium |
| F7 | Bundle impact of unification ≈ **neutral** — React runtime (184 KB) is already a single shared chunk for every concern; no new deps required | Info |

**Verdict**: unification is recommended as a **runtime consolidation** (shared session store, one data layer, pushState navigation, shared shell primitives) — *not* a literal merge into one mega-SPA mount. The Astro outer shell + zone guards are load-bearing for multi-tenancy and must stay.

---

## 1. Current Architecture Analysis — The Four Concerns

### 1.1 Concern map

```
                        ┌──────────────────────────────────────────────┐
                        │        Astro middleware (tenant.ts)          │
                        │  resolveTenantId → zone → routeForbidden     │
                        │  locals.API_FETCH (API_BACKEND binding)      │
                        └───────────────┬──────────────────────────────┘
                                        │
        ┌───────────────┬───────────────┼──────────────────┬──────────────────┐
        ▼               ▼               ▼                  ▼                  ▼
  MARKETPLACE      TENANT PUBLIC     ADMIN SPA         POS SPA         AUTH MICRO-PAGES
  (SSR .astro)     (SSR .astro)      (CSR island)      (CSR island)    (CSR islands on
  /camps /camp/*   /  /book /menu    /admin/*          /pos /pos/*     PublicLayout)
  /camp/*/book     /rooms            hash routing      path+reload     /auth/*  /register
  /camp/*/menu     about/contact     #tab=<panel>      ?tenant= kept   (components live
                   /faq /gallery                                       in components/admin/)
```

All five entry families share: `lib/api.ts` (transport + tenant resolution), `lib/theme.ts` + `lib/utils.ts`, the `ui/` kit, `styles/global.css`, and the Google-font pairing (Plus Jakarta Sans + Sora).

### 1.2 Per-concern profile

| Dimension | Marketplace | Tenant Public | Admin SPA | POS SPA |
|---|---|---|---|---|
| Rendering | Full SSR (.astro) | Full SSR (.astro) + 3 islands | CSR island on empty div | CSR island on empty div |
| Layout | `PublicLayout.astro` (768 ln: theme vars, dark-mode pre-paint, Plausible, JSON-LD, zone-aware nav) | Same `PublicLayout` | `AdminLayout.astro` (57 ln) | `POSLayout.astro` (58 ln) |
| Router | None (file routes) | None (file routes) | In-app **hash** router (`#tab=`) | Path-detect at mount + **full-reload nav** |
| Auth | none (public endpoints) | none | `AuthProvider` + refresh-token rotation | raw localStorage (`pos_token`/`pos_user`), no refresh |
| Data | SSR via `locals.API_FETCH` (service binding) | same + island props | TanStack Query (+ legacy hooks) | manual `useEffect` fetch |
| Realtime | — | — | SSE (`useSseInbox`, `useSseOrders`) | — |
| Theme source | marketplace branding row | tenant `primaryColor` → `buildTenantTheme` | tenant settings query → CSS vars | static sidebar tokens |
| Zone rule | forbidden on tenant zone | forbidden on marketplace zone | system prefix — always allowed | tenant-only (branded 404 on marketplace) |

### 1.3 The hidden fifth concern: auth micro-pages

`/auth/forgot-password`, `/auth/reset-password`, `/register` render **admin-foldered components** (`ForgotPasswordPage`, `ResetPasswordPage`, `RegisterPage`) inside `PublicLayout` — not `AdminLayout`. This is a cross-concern leak that any unification must make explicit (they belong to neither SPA nor public marketing; they are pre-auth flows).

---

## 2. Component Inventory

Counts verified by directory listing + import graph. Line counts from `wc -l`.

### 2.1 Pages (`app/src/pages/`) — 24 routes

| Route | Lines | Concern | Notes |
|---|---|---|---|
| `index.astro` | 43 | Both zones | Zone router: `zone==='tenant'` → TenantLanding (SSR data) else MarketplaceHome |
| `camps.astro` | 105 | Marketplace-only | Listing; ZoneGuard when forbidden |
| `camp/[id]/index.astro` | 51 | Marketplace-only | Camp deep link; correct guard pattern (null tenant → branded 404) |
| `camp/[id]/book.astro` | 49 | Marketplace-only | ⚠️ uses `return Astro.redirect('/404')` anti-pattern |
| `camp/[id]/menu.astro` | 58 | Marketplace-only | TenantMenu wrapper |
| `book.astro` | 62 | Tenant-only | ⚠️ `return Astro.redirect('/404')` anti-pattern |
| `menu.astro` | 71 | Tenant-only | ⚠️ `return Astro.redirect('/404')` anti-pattern |
| `rooms.astro` | 145 | Tenant-only | Room listing, SafeImage, local `ctaInk()` helper |
| `about.astro` | 117 | Both | Local `ctaInk()` copy |
| `contact.astro` | 173 | Both | Lead form |
| `faq.astro` | 73 | Both | |
| `gallery.astro` | 192 | Both | JSON gallery parse, SafeImage |
| `404.astro` | 13 | System | Dev-reachable branded 404 |
| `[...path].astro` | 19 | System | Prod catch-all → branded 404 (Cloudflare worker fallthrough fix) |
| `admin/[...rest]/index.astro` | 25 | Admin | Mounts `ToastProvider > AuthProvider > AdminApp` into `#admin-mount` |
| `pos/[...rest]/index.astro` | 28 | POS | Mounts `ToastProvider > POSApp` into `#pos-app-root`; ZoneGuard if forbidden |
| `pos/login/index.astro` | 25 | POS | Mounts `POSApp` **without ToastProvider** ⚠️ inconsistency |
| `auth/forgot-password.astro` | 12 | Auth | PublicLayout + `admin/ForgotPasswordPage` |
| `auth/reset-password.astro` | 12 | Auth | PublicLayout + `admin/ResetPasswordPage` |
| `register/index.astro` | 12 | Auth | PublicLayout + `admin/RegisterPage` |
| `login.astro` | 5 | System | Inline JS redirect → `/admin` |
| `robots.txt.ts`, `sitemap.xml.ts` | — | System | Endpoints |
| `api/health.ts` | — | System | Health endpoint |
| `camp/"[id]"/` | 0 | — | 🗑️ **Junk**: empty directory with literal quotes in name |

### 2.2 Components — Admin (`components/admin/`, 26 files)

| Component | Purpose | Notes |
|---|---|---|
| `AdminApp.tsx` (525) | Shell: sidebar/topbar/mobile-nav + hash router + login overlay | Defines own `TOKEN_KEY` dup; uses legacy `useCamps()` alongside RQ queries; theme via `buildTenantTheme` CSS vars |
| 19 lazy panels | Dashboard, Camps, Rooms, RatePlans, Orders, Settings, Password, Meals, Planning, Reports, Menu, BookingCalendar, MenuPlanner, LowStock, Staff, Inbox, SuperTenants, SuperDashboard, SuperOrders | Code-split per tab (~8–36 KB/chunk); all TanStack Query except where noted |
| `TenantDrilldown.tsx` | Super-admin cross-tenant drill-down | **Own fresh QueryClient per mount** (cache isolation because query keys are NOT tenant-scoped); drives `setTenantScope()` module global |
| `ListingWizard.tsx` + `PhotosStep.tsx` | Multi-step camp creation | Used by `CampsPanel` only |
| `ForgotPasswordPage` / `ResetPasswordPage` / `RegisterPage` | Pre-auth forms | ⚠️ Rendered under **PublicLayout** on `/auth/*`, `/register` |
| `icons.tsx` | SVG icon set (IconProps) | Consumed by AdminApp/Inbox/Staff/LowStock only |

### 2.3 Components — POS (`components/pos/`, 10 files)

| Component | Purpose | Notes |
|---|---|---|
| `POSApp.tsx` (236) | Shell: sidebar + view switch + shift gate | Dead QueryClientProvider ×3 branches; full-reload navigation; cart/shift state lifted here |
| `views/LoginView.tsx` | Identifier+password form | Parallel implementation of Admin's inline `LoginOverlay` |
| `views/DashboardView.tsx` | Today stats + recent orders | Manual fetch; `StatCard`, `POSDashboardSkeleton` |
| `views/ProductsView.tsx` | Catalog grid → cart add | Receives `cart/setCart` props |
| `views/CartPanel.tsx` | Cart + checkout | Uses `useToast` (crashes under the login host if ever rendered there) |
| `views/OrdersView.tsx` | Order history + receipt open | Refresh driven by `ordersRefreshKey` counter prop |
| `views/ReceiptModal.tsx` | Print-friendly receipt | Hand-rolled overlay (no `ui/Modal`) |
| `views/ShiftOverlay.tsx` / `ShiftDashboard.tsx` | Open/close cash shift | Hand-rolled overlays |
| `types.ts` | PosUser/PosProduct/CartItem/Order/Dashboard/Shift | Aligned to OpenAPI schemas |

### 2.4 Components — Public (`components/public/`, 10 files)

| Component | Type | Purpose |
|---|---|---|
| `MarketplaceHome.astro` (250) | SSR | Marketplace hero + stats + CampsSection + onboarding; fetches `/tenants/public`, splits out `marketplace` branding row |
| `TenantLanding.astro` (271) | SSR | Tenant landing (hero/about/reviews/map); zone-aware deep links (`/menu` vs `/camp/{id}/menu`); ⚠️ duplicates `luminance()` helpers already in `lib/theme.ts` |
| `CampsSection.astro` (341) | SSR + inline script | Client-rendered camp grid + API-driven search filter |
| `BookPage.astro` (55) / `MenuPage.astro` (68) | SSR wrappers | Full-bleed chrome for islands |
| `NotFoundPage.astro` (56) / `ZoneGuard.astro` (16) | SSR | Branded 404; zone-exclusivity renderer (sets status 404) |
| `CampBooking.tsx` (456) | Island `client:visible` | Room booking flow → localStorage `sc_reservation`; ⚠️ line 246 still emits `${primaryColor}08` 8-digit hex inline style (known hydration-error trigger) |
| `ReservationSummary.tsx` (372) | Island `client:load` | Reads `sc_reservation`, WhatsApp handoff; ⚠️ raw `fetch(${apiBase}/leads)` **bypassing `apiFetch`** |
| `TenantMenu.tsx` (579) | Island `client:load` | Meal menu + drawer cart |

### 2.5 Shared substrate

| Layer | Files | Consumers |
|---|---|---|
| Transport | `lib/api.ts` (870 ln, ~110 fns) | ALL concerns |
| Types | `lib/api-types.ts` (8635, generated) | api client + typed casts |
| Zones | `lib/routeZones.ts` (69) | middleware + guarded pages |
| Theme | `lib/theme.ts` (221) | PublicLayout, AdminApp shell, TenantMenu |
| Utils | `lib/utils.ts` (148: escHtml, normalizeAssetUrl, formatCurrency, cn, readableTextOn…) | ALL concerns |
| SSE | `lib/sse.ts` (213) + `hooks/useSseInbox/Orders` | Admin only (InboxPanel, BookingCalendar) |
| Misc | `lib/posUrl.ts` (18, ?tenant=-preserving reload URLs), `lib/plausible.ts` (69) | POS / PublicLayout |
| Middleware | `middleware/tenant.ts` (252), `securityHeaders.ts` (97) | every request |

---

## 3. Shared Components Identification

### 3.1 Actual usage matrix (import-graph count: admin / pos / public-islands)

| ui component | Admin | POS | Public islands | Verdict |
|---|---|---|---|---|
| Button | 18 | 5 | 3 | **Core shared** |
| Card | 18 | 3 | 3 | Core shared |
| Input | 14 | 5 | 3 | Core shared |
| Badge | 8 | 4 | 3 | Core shared |
| EmptyState | 13 | 3 | 3 | Core shared |
| Toast(+provider) | 17 | 1 | 1 (+both hosts) | Core shared |
| LoadingSpinner | 17 | 1 | – | Shared |
| Skeleton | 3 | 3 | – | Shared (POS uses named presets) |
| StatCard | 2 | 1 | – | Shared |
| ErrorBoundary | 1 | 1 | – | Shared |
| Select | 14 | – | – | Admin-only today, trivially portable |
| ConfirmDialog | 10 | – | – | Admin-only (POS uses none!) |
| DataTable | 10 | – | – | Admin-only (POS grids instead) |
| FormModal | 9 | – | – | Admin-only |
| StatusTag | 9 | – | – | Admin-only |
| Modal | 1 | – | – | Under-used (POS hand-rolls 2 overlays) |
| Accordion, Checkbox, FormField, Radio, Separator, Switch, Tabs, Textarea, Tooltip | 0 | 0 | 0 | **Dead** — storybook-only |

Plus `SafeImage.astro`: SSR-public only (rooms/gallery/TenantLanding/MarketplaceHome/CampsSection).

### 3.2 What is *already* shared and working

- **React runtime**: one 184 KB `client.*.js` chunk serves every island and both SPAs (Vite dedupe) — see §Bundle.
- **Transport**: every concern goes through `apiFetch` (except two deliberate bypasses: multipart `upload()`, and `ReservationSummary`'s lead post).
- **Design tokens**: `--brand-*` CSS vars from `buildTenantTheme` are set by PublicLayout (SSR), AdminApp shell (client), and consumed by Tailwind v4 utilities everywhere.
- **Toast/ErrorBoundary/LoadingSpinner/Skeleton**: identical UX primitives across concerns.

### 3.3 Minimal shared kernel for a unified frontend

```
lib/session.ts        ← NEW: multi-realm token store (see §6)
lib/api.ts            ← keep; swap inline localStorage reads for session store
lib/routeZones.ts     ← keep (SSR-owned)
lib/theme.ts/utils.ts ← keep; fold duplicated luminance/ctaInk copies into them
lib/navigation.ts     ← NEW: ~60-line pushState router helper (see §4)
hooks/useQueryHooks.ts← extend with ['pos',…] key factories; delete useAdminData hooks
components/ui/*       ← keep 16 used comps; delete 9 dead comps
components/shell/     ← NEW: AppSidebar/AppTopbar/MobileBottomNav/LoginForm extracted
                        from AdminApp+POSApp so both SPAs compose them
admin/icons.tsx       ← promote to components/ui/icons.tsx (replace POS emoji icons)
```

That is the whole kernel: **~16 UI primitives + 6 lib modules + 1 hook family + 3 new small modules**. Nothing else needs to be shared; panel/view bodies stay concern-local.

---

## 4. Routing Analysis

### 4.1 Three routing models coexist today

| Model | Where | Mechanics |
|---|---|---|
| A. File routes + zone guards | all public/system pages | Astro file routes; middleware sets `locals.routeForbidden`; pages render `{forbidden ? <ZoneGuard/> : …}` |
| B. In-app hash router | Admin only | `getHashTab()` parses `location.hash`; `hashchange` listener; `switchTab()` sets `#tab=x`. Deep-linkable, no server involvement, survives any host/path |
| C. Path-detect + hard reload | POS only | View derived once from `pathname.includes(...)` at mount; `navigate()` does `window.location.href = posUrl(path)` → **full SSR round-trip + re-hydration per click**; `posUrl()` preserves `?tenant=` (dev/E2E convention) |

### 4.2 Zone exclusivity (routeZones.ts)

- Marketplace-only: `/camps`, `/camp`, `/camp/*`
- Tenant-only: `/pos`, `/pos/*`, `/menu`, `/book`, `/rooms`
- System prefixes (never forbidden): `/admin /auth /register /login /api /robots.txt /sitemap.xml /404 /_astro /favicon`
- Both zones: `/`, `/about`, `/contact`, `/faq`, `/gallery`
- Enforcement is **SSR-side only** — correct, because `sinaicamps.com/pos` must serve a branded 404 before any JS loads.

### 4.3 Findings

1. **Model C is the biggest architectural wart.** POS loses all in-memory state per navigation (hence `ordersRefreshKey`, shift re-check on boot, `pos_user` in localStorage). It exists presumably to keep E2E URLs stable and avoid writing a router.
2. **Model B is fine short-term** (deep-linkable, zero-dep) but inconsistent with C and invisible in `pathname`.
3. Guard-pattern violations: `book.astro`, `menu.astro`, `camp/[id]/book.astro` do `if (!forbidden && !tenant) return Astro.redirect('/404');` in frontmatter — the exact anti-pattern AGENTS.md forbids (unknown tenant should render the branded 404 *document*, not a bare redirect; `camp/[id]/index.astro` shows the correct pattern).
4. `_routes.json` routes `/*` through the worker (excluding `/api/*`, `/_astro/*`, images) — any client-router scheme must keep this intact or lose SSR 404s.

### 4.4 Recommended unified routing design

Keep the Astro outer layer exactly as-is (SSR + zone guards + catch-all). Standardize **inner SPA navigation on path-based pushState**, no new dependency:

```
/admin            → AdminApp (dashboard default)     [hash still honored during migration]
/admin/:panel     → switchTab(panel) via pushState
/pos              → POSApp (dashboard)
/pos/login        → POSApp login view
/pos/:view        → navigate(view) via pushState + popstate listener
```

A shared `lib/navigation.ts` (~60 LOC: `createRouter({ base, routes })` returning `{ view, navigate }`) replaces both `setHashTab/hashchange` and `window.location.href = posUrl(...)`. `posUrl()`'s `?tenant=` preservation moves inside the helper (only needed for localhost dev). This removes per-click SSR round-trips in POS, makes Admin URLs visible in the address bar, and keeps E2E path conventions (`/pos/dashboard` etc.) valid.

---

## 5. State Management Analysis

| Concern | Mechanism | Cache config | Issues |
|---|---|---|---|
| Admin | TanStack Query via `useQueryHooks.ts` (queryKeys factory, ~24 queries, ~20 mutations, `throwOnError`→toast) + **legacy `useCachedData`** hooks from `useAdminData.ts` | `staleTime 30s, gcTime 5min, refetchOnWindowFocus, retry 1` | Shell uses `useCamps()` (legacy) while panels use `useCampsQuery()` → **same endpoint fetched twice through two caches**; legacy layer kept alive only for `activeCamp` derivation + type exports |
| Super-admin drill-down | `TenantDrilldown` mounts a **fresh QueryClient per tenant** (key remount) + module-global `setTenantScope()` | default RQ | Necessary today because query keys aren't tenant-scoped; a `['tenant', id, …]` key namespace would remove the special client |
| POS | Manual `useState/useEffect` per view; lifted `cart`, `activeShift`, `ordersRefreshKey` in `POSApp` | none | No caching/dedup/retry; dead `posQueryClient` (10s staleTime configured, unused); checkout→orders sync via manual counter |
| Public islands | SSR props + local `useState` + `localStorage.sc_reservation` as cross-island bus | n/a | Fine at current scope; `ReservationSummary`'s raw fetch skips shared error handling |
| Realtime | `sse.ts` EventSource w/ token-as-query-param → `useSseInbox` (InboxPanel), `useSseOrders` (BookingCalendar) invalidate/queryClient updates | — | Admin-only; token passed as prop from `localStorage.getItem(TOKEN_KEY)` in AdminApp |

**Answer embedded**: Admin and POS can absolutely share **one** `QueryClient` — the configs differ only in freshness defaults (30s vs 10s), which belong on individual queries anyway (a POS dashboard query wants `staleTime: 10_000`; an admin settings query doesn't care). The real requirement is **identity-scoped keys + cache clearing on auth transitions**, not two clients.

---

## 6. Auth Integration Analysis

### 6.1 Two realms over one transport

| Aspect | Admin realm | POS realm |
|---|---|---|
| Storage keys | `sinaicamps_token` / `sinaicamps_user` / `sinaicamps_refresh_token` | `pos_token` / `pos_user` |
| Realm selection | default | `endpoint.startsWith('/pos/')` inside `apiFetch` |
| Boot validation | `AuthProvider` → `GET /auth/me`, clears keys on failure | `POSApp` reads localStorage; trusts it until a 401 |
| Refresh | silent `POST /auth/refresh` + single-flight `_refreshPromise` + one retry (non-POS endpoints only) | **none by design** ("POS login issues only an access token") |
| Roles | `ROLE_HIERARCHY {super_admin:10, admin:4}` via `hasRole()` | role string carried on `PosUser` (cashier/manager/admin) |
| Logout | `POST /auth/logout` + clear 3 keys + `setTenantScope(null)` | clear 2 keys + reset local state |
| Cross-tenant | super-admin `setTenantScope()` override feeds `x-tenant-id` | org-scoped JWT only |

### 6.2 Fragility found

1. **`TOKEN_KEY` defined three times** — `api.ts:34`, `auth.tsx:40`, `AdminApp.tsx:41` (used to hand InboxPanel its SSE token). One rename = silent breakage.
2. **Realm heuristic is load-bearing and implicit**: any future endpoint under `/pos/` automatically switches token realm; any admin endpoint that ever moved under `/pos/*` would silently authenticate as a cashier.
3. `InboxPanel` receives the raw JWT as a prop (for SSE query-param auth) — couples shell → storage format.
4. POS has no central 401 UX: cleanup happens in `apiFetch`, then each call's `.catch` decides what happens; the redirect lives in one `useEffect`.

### 6.3 Can they share one auth system? Yes — design

Backend users were already unified (`pos_users`, migration 0019; dual-hash bcrypt support), so the split is purely a frontend storage convention. Introduce `lib/session.ts`:

```ts
type Realm = 'admin' | 'pos';
session.get(realm): { token, user } | null
session.set(realm, payload) / session.clear(realm) / session.onChange(cb)
// keeps existing localStorage keys (no forced logout migration),
// single source of truth for key names, event-based updates
```

Then: `AuthProvider` becomes the admin-realm consumer, POSApp consumes the pos-realm; `apiFetch` selects realm by the same prefix rule (kept explicit and documented); SSE token comes from `session.get('admin')`. Optional later step: issue refresh tokens to POS too and reuse the same silent-refresh path.

---

## 7. Unification Plan (step-by-step, strangler order)

Each phase is independently shippable and leaves the tree green (unit suites + E2E gates).

**Phase 0 — Hygiene & hazard removal (no behavior change)**
1. Delete junk: `pages/camp/"[id]"`, empty `components/layout/`, `components/tables/`; delete 9 story-only `ui/` comps (or move under `stories/`); update AGENTS.md structure section (forms/, feedback/ don't exist).
2. Fix zone-guard violations in `book.astro`, `menu.astro`, `camp/[id]/book.astro` (render `ZoneGuard`/branded 404 instead of `Astro.redirect`).
3. Fix `${primaryColor}08` inline style in `CampBooking.tsx:246` (known hydration-error trigger).
4. Add missing `ToastProvider` to `pos/login/index.astro` host.
5. Collapse duplicate luminance/ctaInk helpers (`TenantLanding.astro`, rooms/about/gallery/contact) into `lib/theme.ts`/`utils.ts`.

**Phase 1 — Session kernel (auth unification)**
6. Create `lib/session.ts` (multi-realm store, same keys). Refactor `api.ts`, `auth.tsx`, `AdminApp`, `POSApp` to consume it. Delete the three `TOKEN_KEY` dups. InboxPanel reads token via session.
7. Document the `/pos/` prefix realm rule next to `apiFetch`.

**Phase 2 — Data layer convergence**
8. Migrate POS views to TanStack Query using the existing `posQueryClient`: add `posQueryKeys = { dashboard, products, orders, activeShift }`; replace each view's effect-fetch; delete `ordersRefreshKey` (invalidation after checkout mutation); keep `cart`/`shift` as local state (server-cache-adjacent, not query material).
9. Migrate AdminApp shell off `useCamps()` → `useCampsQuery()`; move domain types from `useAdminData.ts` into a `types.ts`; **delete the legacy hook layer**.
10. Namespace query keys per concern (`['admin',…]/['pos',…]`) and add `tenantId` to admin keys → later removes TenantDrilldown's bespoke QueryClient.
11. Route `ReservationSummary`'s lead post through `apiFetch` (accept a tiny public-endpoint allowance) or at minimum reuse its error shape.

**Phase 3 — Navigation unification**
12. Add `lib/navigation.ts` pushState router; convert POS first (highest pain): internal `navigate()` stops reloading; popstate syncs view; keep `posUrl()` only for external redirects (post-login, logout).
13. Optionally migrate Admin `#tab=` → `/admin/<panel>` paths behind the same helper (keep hash parsing as fallback for old bookmarks). E2E specs asserting `#tab=` URLs must be updated in the same commit.

**Phase 4 — Shell & component consolidation**
14. Extract `components/shell/{AppSidebar,AppTopbar,MobileBottomNav,LoginForm}` from the two apps; POS drops emoji icons for promoted `ui/icons.tsx`; unify `LoginOverlay`+`LoginView` into one `LoginForm` with a `realm` prop (testids preserved per realm).
15. Promote `DataTable/FormModal/ConfirmDialog/StatusTag` adoption in POS where tables/modals exist (ReceiptModal/ShiftOverlay → `Modal`).

**Explicitly NOT in scope**: merging public SSR pages into a client router, merging the two SPA mounts into one `/app` mount, renaming storage keys (would force-logout users), adding react-router/TanStack Router deps.

---

## 8. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| E2E breakage: 74 spec files depend on testids, `#tab=` URLs, POS full-reload semantics, hydration-wait on `#admin-mount`/`#pos-*-root` | High (Phases 3–4) | Release gate | Convert POS nav in one commit with its 9 POS spec files updated; keep all testids byte-identical; run `CI=true npx playwright test` gate per phase |
| Silent auth regression via realm-prefix change | Medium | Lockouts / wrong-tenant writes | Keep prefix rule verbatim; add unit tests pinning `apiFetch` token-key selection per endpoint class (mirrors backend SQL-string assertion style) |
| Cache leakage across identities (one QueryClient) | Medium | Stale cross-user data | `queryClient.clear()` on any `session.clear()`; tenant-scoped keys (Phase 2.10) — precedent: TenantDrilldown's fresh-client pattern exists precisely because of this |
| POS regression from removing reloads (state assumptions: shift gate re-check, `?tenant=` propagation) | High | Broken terminals in production | Preserve boot-time `posGetActiveShift` gate; keep `?tenant=` handling inside navigation helper; E2E `workflows.spec`/`shift-lifecycle.spec` cover the loop |
| Zone-guard refactor changing 404 semantics on unknown tenants | Medium | SEO/UX, prod 302-vs-404 diffs | Only Phase 0.2; covered by `routing/zone-exclusivity.spec.ts` |
| Legacy-hook removal breaking hidden importers | Low | Build/test failures | Typecheck + grep gate (`useCachedData` refs) before deletion; tsc baseline currently 153 pre-existing errors — compare deltas, don't chase baseline |
| Free-plan constraints (KV/D1 quotas) unaffected | — | — | No backend changes proposed; SSE untouched |
| Rollback cost | — | — | Phases are additive and separately revertible; Phase 3 POS nav is the riskiest single diff |

---

## 9. Key Questions Answered

**Q1 — Can POS and Admin share the same QueryClient configuration?**
Yes, and they should. The two clients differ only in defaults (`staleTime` 30s vs 10s, `gcTime` 5min vs 2min) — freshness belongs on queries, not clients. Requirements for sharing safely: per-concern key namespaces (`['pos',…]`/`['admin',…]`, ideally tenant-tagged) and `queryClient.clear()` on auth transitions. Note POS currently has **zero** React Query usage — the prerequisite work is migrating POS views onto Query (Plan §7 Phase 2), after which one client with per-query options suffices.

**Q2 — Can POS and Admin share the same auth system?**
Yes. The backend already unified accounts into `pos_users` (migration 0019, dual-hash bcrypt); both realms are bearer JWTs differing only in localStorage keys and refresh semantics. Unify via a small multi-realm session store (§6.3) keeping existing keys (no user-facing logout), keep the explicit `/pos/` prefix realm rule in `apiFetch`, and optionally grant POS refresh tokens later to reuse the existing silent-refresh machinery.

**Q3 — How many components are truly unique to each concern?**
- Admin: **26 files** unique (19 lazy panels + shell + wizard pair + drilldown + 3 pre-auth forms + icons).
- POS: **9 files** unique (shell + 8 views + types).
- Public: **10 files** unique (7 SSR comps + 3 islands) + `SafeImage.astro`.
Everything else — 16 actively-used UI primitives, all of `lib/`, middleware, layouts' shared tokens/fonts — is or should be common. Roughly **45 concern-specific components vs a ~25-file shared kernel**.

**Q4 — Minimal set of shared components needed?**
UI: `Button, Card, Input, Select, Badge, StatusTag, EmptyState, Skeleton, LoadingSpinner, StatCard, Modal, ConfirmDialog, FormModal, DataTable, Toast, ErrorBoundary` + promoted `icons`. Lib: `api, session(new), routeZones, theme, utils, sse, navigation(new), posUrl(folded in)`. Hooks: `useQueryHooks` (extended with pos keys) + `useApiError` + SSE pair. Delete: 9 dead UI comps, legacy `useCachedData` layer.

**Q5 — How should routing work in a unified SPA?**
Don't build one literal SPA. Keep Astro file routes + SSR zone guards as the outer shell (multi-tenant 404 enforcement must stay server-side; `_routes.json` depends on it). Inside each SPA mount, standardize on **path-based pushState routing** (`/admin/:panel`, `/pos/:view`) through one shared ~60-line router helper; drop POS's full-reloads immediately, migrate Admin's hash tabs opportunistically. URL shapes stay compatible with today's E2E paths.

**Q6 — What's the bundle-size impact of unification?**
Measured baseline (`dist/_astro`): total client JS **700 KB** across all chunks; the 184 KB React runtime chunk is **already shared by every concern**, `api.ts` is a shared 12 KB chunk, panels/views are already lazy (8–36 KB each). Unification adds **no new runtime dependencies** and mostly deletes code: −9 dead UI comps, −legacy data layer, −duplicate login form (~few KB gz). The only addition is the tiny router helper (<2 KB). Net impact ≈ **neutral (±5 KB gz)**; the plan deliberately avoids merging mounts, which is the only scenario that would *increase* bytes (forcing POS terminals to download admin-shell code). Performance levers remain what they are today: island discipline and lazy boundaries.

---

## Appendix A — Hygiene findings (fix during Phase 0)

1. `pages/camp/"[id]"` — empty directory with literal quote characters in its name (junk artifact).
2. `components/layout/`, `components/tables/` exist but are empty; AGENTS.md documents `components/forms/` and `components/feedback/` which don't exist at all — doc drift.
3. `return Astro.redirect('/404')` violations: `book.astro:24`, `menu.astro:32`, `camp/[id]/book.astro:26` (contradicts AGENTS.md zone-guard rule).
4. `CampBooking.tsx:246` — `${primaryColor}08` 8-digit-hex inline style (logbook-root-caused hydration error trigger).
5. `pos/login/index.astro` omits `ToastProvider` that `pos/[...rest]` provides.
6. `TOKEN_KEY` triplicated (`api.ts:34`, `auth.tsx:40`, `AdminApp.tsx:41`).
7. Luminance/readable-text helpers duplicated in `TenantLanding.astro` and four pages despite `theme.ts`/`utils.ts` exports.
8. `ReservationSummary.tsx` raw `fetch` to `/leads` bypasses `apiFetch` (no dedupe, ad-hoc error handling).

## Appendix B — Measured bundle data (`app/dist`)

| Chunk | Size | Loaded by |
|---|---|---|
| `client.DVkETIMt.js` | 184 KB | **every** page/island (React+ReactDOM runtime) |
| admin entry script | 44 KB | `/admin/*` host |
| `BookingCalendar.*.js` | 36 KB | lazy admin tab |
| `LoadingSpinner.*.js` | 32 KB | shared primitive chunk |
| `CampsPanel` / `SuperTenantsPanel` | 24 / 20 KB | lazy admin tabs |
| `TenantMenu` / mid-tier (api, CampBooking, ReservationSummary, Rooms/Staff/Meals/Dashboard/Inbox/MenuPanel…) | 16 / 12 KB | islands + lazy tabs |
| `POSApp.*.js` | 8 KB | `/pos/*` host (+lazy views) |
| **Total client JS** | **700 KB** | all chunks combined (per-page payload far lower due to lazy split) |
| `_worker.js` (SSR) | 1.5 MB | server-side only |
