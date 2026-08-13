---
task_id: t9-design-system-expansion
parent_task: Implement all remaining backlog (T9 design system library)
created: 2026-08-12
status: done
category: frontend
---

# Tmp Agent: T9 — Expand ui component library to a11y-first set

## Objective
Expand `app/src/components/ui/` from 17 to ~24 a11y-first components by adding 7–8 new primitives with Storybook stories, matching the existing design system (Tailwind v4 tokens, `cn()` util, focus-visible states).

## Scope
- Existing 17 (READ for patterns, do not modify): Badge, Button, Card, ConfirmDialog, DataTable, EmptyState, ErrorBoundary, FormModal, Input, LoadingSpinner, Modal, Select, Skeleton, StatCard, StatusTag, Tabs, Toast.
- NEW components to add (follow each one's a11y contract):
  1. `Checkbox.tsx` — native input + label, `aria-checked`, keyboard operable, `disabled`, `id` wiring via `htmlFor`/`useId`.
  2. `Radio.tsx` — `role="radiogroup"` group + `RadioItem`, arrow-key navigation.
  3. `Switch.tsx` — `role="switch"`, `aria-checked`, keyboard toggle.
  4. `Textarea.tsx` — label, `aria-invalid`, `aria-describedby` error wiring.
  5. `FormField.tsx` — wrapper composing label + control + hint + error with `useId`-generated ids.
  6. `Separator.tsx` — `role="separator"` horizontal/vertical.
  7. `Tooltip.tsx` — accessible tooltip (focus + hover triggers, `role="tooltip"`, `aria-describedby`, Escape close, no pointer-events trap).
  8. `Accordion.tsx` — `button` headers, `aria-expanded`, `aria-controls`/`aria-labelledby`, Enter/Space/Arrow keys, `region` panels.
- Stories: add a `.stories.tsx` file for each new component under `app/src/stories/` matching the existing story conventions (check 1–2 existing stories first).
- Files to touch: `app/src/components/ui/` (new files only), `app/src/stories/` (new files only).
- Must NOT touch: existing ui components (unless a genuine bug — if so, stop and report), public components, admin, backend.

## Done Condition
- 8 new components exist in `app/src/components/ui/` with default and a11y-verified variants.
- 8 new story files exist under `app/src/stories/` and Storybook builds (`.storybook/` exists; run `cd app && npx storybook build` if installed, else verify stories compile via `npx tsc --noEmit` on stories — do NOT add Storybook as a new dependency).
- `cd app && npx vitest run` passes.

## Steps
1. Read 2 existing ui components + 1 story to absorb conventions (cn, tokens, focus-visible).
2. Create components in dependency-safe order (FormField last — it composes Input/Select/Textarea/Checkbox/Radio).
3. Create stories.
4. Run app vitest + tsc check on new files.
5. Set `status: done` in this file's frontmatter.
