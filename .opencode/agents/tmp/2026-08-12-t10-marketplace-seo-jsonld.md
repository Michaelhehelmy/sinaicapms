---
task_id: t10-marketplace-seo-jsonld
parent_task: Implement all remaining backlog (T10 marketplace SEO)
created: 2026-08-12
status: done
category: frontend
---

# Tmp Agent: T10 — Marketplace SEO JSON-LD completion

## Objective
Add missing structured data for marketplace SEO: `ItemList`/`CollectionPage` JSON-LD on the `/camps` listing page, and verify camp detail already emits Campground/LodgingBusiness schema correctly.

## Scope
- Files to touch:
  - `app/src/pages/camps.astro` — add `<script type="application/ld+json">` with `CollectionPage` + `ItemList` of the public tenants (name, url `/camp/{id}`, image) when `tenants.length > 0`. Reuse the same sanitization approach as `PublicLayout.astro` (see `sanitizeForJsonLd` usage in `TenantLanding.astro` line ~116; do not introduce new escaping bugs).
- Read-only verification: `app/src/layouts/PublicLayout.astro` (Campground schema, line ~93) and `app/src/components/public/TenantLanding.astro` (LodgingBusiness, line ~77) — confirm camp detail (`app/src/pages/camp/[id]/index.astro`) emits structured data via TenantLanding; only fix if clearly broken.
- Must NOT touch: `PublicLayout.astro`, `TenantLanding.astro`, images, backend.

## Done Condition
- `/camps` HTML output contains a `CollectionPage`/`ItemList` ld+json block listing the camp entries.
- `cd app && npx vitest run` passes.

## Steps
1. Read `camps.astro` fully and the existing JSON-LD pattern in `PublicLayout.astro`.
2. Add the JSON-LD block in the `frontmatter`-computed variable style used elsewhere (build the object, `set:html={JSON.stringify(...)}`), guarding for `tenantsLoaded` and empty lists.
3. Verify with a quick grep for `ld+json` in `camps.astro`.
4. Run app vitest.
5. Set `status: done` in this file's frontmatter.
