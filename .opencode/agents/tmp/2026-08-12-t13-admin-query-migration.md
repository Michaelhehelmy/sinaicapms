---
task_id: t13-admin-query-migration
parent_task: Implement all remaining backlog (T13 admin typed SPA shell)
created: 2026-08-12
status: done
verification: Audit verified the admin SPA is already fully migrated — zero raw fetch( data loads, zero window.* cross-file globals, 16/16 panels use @/lib/api + TanStack Query hooks. All 27 useEffect calls are legitimate (form sync, analytics, scope sync). No code changes required.
category: frontend
---

# Tmp Agent: T13 — Finish TanStack Query migration in admin panels

## Objective
Eliminate remaining raw `fetch()`/`useEffect` data-loading patterns in the admin SPA by migrating them onto the existing TanStack Query hooks (`useAdminData.ts`, `useQueryHooks.ts`), completing the typed SPA shell.

## Scope
- Files to touch: `app/src/components/admin/**` — audit every panel for raw `fetch(` + `useEffect` + `useState` data loads and convert to `useQuery`/`useMutation` hooks (or the existing `useCamps`, `useSettingsQuery`, `useInboxUnreadQuery` where they match).
- Files to READ (do not modify unless a bug is found): `app/src/hooks/useAdminData.ts`, `app/src/hooks/useQueryHooks.ts`, `app/src/hooks/useApiError.ts`, `app/src/components/admin/AdminApp.tsx` (already has QueryClientProvider — confirm it wraps all panels).
- Must NOT touch: backend, POS code, public components, `app/src/lib/api.ts`.

## Done Condition
- `cd app && npx vitest run` passes.
- `grep -rn "fetch(" app/src/components/admin/ --include="*.tsx" | grep -v "useQuery\|useMutation\|api\." ` returns only non-data-loading fetches (or none).
- No `window.<custom> =` cross-file global assignments remain in `app/src/components/admin/`.

## Steps
1. Inventory: list every `fetch(` in `app/src/components/admin/`.
2. For each: identify the matching query key pattern already established in `useQueryHooks.ts`; if none exists, add a typed hook there following the existing style.
3. Migrate components; keep loading/error UI via `LoadingSpinner`/`EmptyState` (existing ui components).
4. Run app vitest; fix any broken tests (update test mocks if they assert old fetch behavior — do not weaken assertions).
5. Set `status: done` in this file's frontmatter.
