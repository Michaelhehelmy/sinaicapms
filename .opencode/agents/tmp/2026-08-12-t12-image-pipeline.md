---
task_id: t12-image-pipeline
parent_task: Implement all remaining backlog (T12 image pipeline)
created: 2026-08-12
status: done
category: frontend
---

# Tmp Agent: T12 — Replace passthrough image service with a real image pipeline

## Objective
Replace `passthroughImageService` with the Astro sharp image service, add remote-pattern support, and create a reusable `SafeImage` component that keeps `normalizeAssetUrl` semantics with a plain-`<img>` fallback so remote fetch failures can never 500 a page.

## Scope
- Files to touch:
  - `app/astro.config.mjs` — `image.service` → sharp, add `image.remotePatterns` allowing https remotes (keep it aligned with `normalizeAssetUrl`, which already permits any https URL).
  - NEW `app/src/components/ui/SafeImage.astro` — normalize URL via `normalizeAssetUrl`, use Astro `<Image>` (sharp, `widths` for responsive srcset, `sizes`, `loading`, `decoding`) when the URL is a valid https remote; wrap the `<Image>` usage in a try/catch-safe manner so a failed remote fetch degrades to a plain `<img src>` with `loading="lazy" decoding="async"` (never throws, never 500s). Must accept `src`, `alt`, `class`, `width`, `height`, `fallback` props and pass through any other attrs.
  - Migrate the main public image sites to `<SafeImage>`:
    - `app/src/components/public/MarketplaceHome.astro` (logo at ~line 89)
    - `app/src/components/public/CampsSection.astro` (tenant logos at ~line 116)
    - `app/src/components/public/TenantLanding.astro` (hero/logo images)
    - `app/src/pages/gallery.astro`, `app/src/pages/rooms.astro`, `app/src/pages/about.astro`, `app/src/pages/faq.astro`, `app/src/pages/contact.astro` (image tags)
    - `app/src/components/public/CampBooking.tsx` and `app/src/components/pos/views/ProductsView.tsx` (image rendering)
  - Keep `normalizeAssetUrl` in `app/src/lib/utils.ts` UNCHANGED (it is the contract).
- Must NOT touch: `backend/**`, `tests/e2e/**` baselines, any admin panel logic, translations.

## Done Condition
- `cd app && npm run build` completes successfully with the sharp image service configured.
- `cd app && npx vitest run` passes (no regressions).
- `grep -n passthroughImageService app/astro.config.mjs` returns nothing.
- `app/src/components/ui/SafeImage.astro` exists and is used by at least the 3 core public components above.
- No page renders a broken 500 when a remote image URL fails (fallback path exists).

## Steps
1. Read `app/src/lib/utils.ts` `normalizeAssetUrl` fully; read each target component's image usage.
2. Update `app/astro.config.mjs`: import sharp service, set `image.service`, add `remotePatterns` (protocol https, allow all hosts — matching normalizeAssetUrl semantics). Keep the ANALYZE block intact.
3. Verify `sharp` is available (it is a dependency; if not, `npm i -D sharp` inside `app/`).
4. Create `SafeImage.astro` implementing normalize + `<Image>` + fallback. Keep the fallback branch simple and defensive.
5. Migrate each image site listed above; preserve `escHtml()` behavior where dynamic strings are involved (SafeImage should normalize internally; do not double-escape).
6. Build + run app vitest. If visual rendering is risky in E2E, ensure fallback keeps pages renderable.
7. Update the tmp file frontmatter `status: done` when complete.
