---
title: "escHtml usage inventory + classification (2026-09-30, esc-s1)"
aliases:
tags:
  - type/worksheet
  - audience/developer
  - domain/security
  - domain/frontend
  - status/done
created: 2026-09-30
updated: 2026-10-06
relates-to:
  - "[[docs/98-history/worksheets/README]]"
  - "[[security-guide]]"
  - "[[docs/98-history/audits/AUDIT_FRONTEND_FINDINGS]]"
code-references:
  - "app/src/components/public/CampsSection.astro:267"
  - "app/src/components/public/TenantLanding.astro:12"
  - "app/src/components/public/MarketplaceHome.astro:9"
  - "app/src/pages/contact.astro:4"
  - "app/src/pages/rooms.astro:7"
  - "app/src/pages/faq.astro:4"
  - "app/src/pages/gallery.astro:4"
  - "app/src/pages/about.astro:4"
  - "app/src/lib/utils.ts:3"
verified: never
---
# escHtml usage inventory + classification (2026-09-30, esc-s1)

Parent: escHtml double-escape 2026-09-30 — Step 1 inventory. Docs only; no source touched.

## Command

`grep -rn "escHtml" app/src --include="*.astro" --include="*.tsx" --include="*.ts"` → **77 hits**.

## Category key (per mission)

- **A** — Astro `{...}` expression (framework auto-escapes) → REMOVE wrapper
- **B** — React `{...}` expression (framework auto-escapes) → REMOVE wrapper
- **C** — `set:html` raw-HTML insertion → KEEP (zero hits: all 3 `set:html` sites are JSON-LD `JSON.stringify`, no escHtml)
- **D** — manual HTML string inserted as raw HTML (`innerHTML` / `document.write` / `img-src` string) → KEEP
- **E** — plain-text sink (WhatsApp/`wa.me` message, `textContent`, clipboard) → REMOVE wrapper
- **IMP** — import line (infra) → KEEP | **DEF** — escHtml function definition (infra) → KEEP

## Full table (path:line | usage | category | action)

| path:line | usage | cat | action |
|---|---|---|---|
| app/src/components/public/TenantLanding.astro:12 | `import { escHtml, normalizeAssetUrl, readableTextOn } from '@/lib/utils';` | IMP | keep |
| app/src/components/public/TenantLanding.astro:128 | `<h1 …>{escHtml((t?.name as string) \|\| tenantName)}</h1>` | A | remove wrapper |
| app/src/components/public/TenantLanding.astro:134 | `{escHtml((t?.location as string) \|\| 'Sinai, Egypt')}` | A | remove wrapper |
| app/src/components/public/TenantLanding.astro:155 | `{escHtml(aboutText \|\| 'Experience … nature.')}` | A | remove wrapper |
| app/src/components/public/TenantLanding.astro:162 | `<span …>{escHtml(a.trim())}</span>` (activities map) | A | remove wrapper |
| app/src/components/public/TenantLanding.astro:225 | `<p …>"{escHtml(r.text as string)}"</p>` | A | remove wrapper |
| app/src/components/public/TenantLanding.astro:227 | `<strong>{escHtml(r.author as string)}</strong>` | A | remove wrapper |
| app/src/components/public/TenantLanding.astro:228 | `<span>{escHtml(r.date as string)}</span>` | A | remove wrapper |
| app/src/components/public/TenantLanding.astro:242 | `src={escHtml(mapEmbed)}` (iframe; mapEmbed via normalizeAssetUrl) | A | remove wrapper |
| app/src/components/public/TenantMenu.tsx:2 | `import { escHtml } from '@/lib/utils';` | IMP | keep (remove with E-fix if unused after) |
| app/src/components/public/TenantMenu.tsx:290 | `` return `• ${escHtml(item.name)} × ${item.qty} - ${priceStr}`; `` (WhatsApp line) | E | remove wrapper |
| app/src/components/public/TenantMenu.tsx:293 | `` const msg = `${t.newOrder.replace('{name}', escHtml(tenantName))}…`; `` (wa.me via encodeURIComponent) | E | remove wrapper |
| app/src/components/public/ReservationSummary.tsx:2 | `import { escHtml, readableTextOn } from '@/lib/utils';` | IMP | keep |
| app/src/components/public/ReservationSummary.tsx:172 | `` let line = `${i + 1}. ${escHtml(item.roomType.name)}…`; `` (WhatsApp line) | E | remove wrapper |
| app/src/components/public/ReservationSummary.tsx:181 | `` return `🏕️ ${t.newBooking.replace('{name}', escHtml(tenantName))}…👤 ${escHtml(guestName)}…` `` (wa.me via encodeURIComponent) | E | remove wrapper |
| app/src/components/public/ReservationSummary.tsx:446 | `{escHtml(payError)}` (React `<p>`) | B | remove wrapper |
| app/src/components/public/MarketplaceHome.astro:9 | `import { normalizeAssetUrl, escHtml } from '@/lib/utils';` | IMP | keep |
| app/src/components/public/MarketplaceHome.astro:104 | `{escHtml(marketplaceName.charAt(0).toUpperCase())}` | A | remove wrapper |
| app/src/components/public/MarketplaceHome.astro:108 | `{escHtml(marketplaceName)}` | A | remove wrapper |
| app/src/components/public/MarketplaceHome.astro:201 | `function escHtml(s) {` (local `is:inline` def, textContent→innerHTML trick) | DEF | keep |
| app/src/components/public/CampsSection.astro:6 | `import { escHtml, normalizeAssetUrl, getLocationDisplay } from '@/lib/utils';` | IMP | keep |
| app/src/components/public/CampsSection.astro:132 | `{escHtml(((t.name as string) \|\| '').charAt(0).toUpperCase())}` (SSR avatar fallback) | A | remove wrapper |
| app/src/components/public/CampsSection.astro:136 | `<h3 data-testid="camp-name" …>{escHtml(t.name as string)}</h3>` (SSR) | A | remove wrapper |
| app/src/components/public/CampsSection.astro:137 | `{t.customDomain ? escHtml(t.customDomain as string) : `${escHtml(t.subdomain as string)}.sinaicamps.com`}` (SSR; 2 calls, 1 line) | A | remove wrappers |
| app/src/components/public/CampsSection.astro:139 | `{escHtml((t.description as string) \|\| 'Premium … courses.')}` (SSR) | A | remove wrapper |
| app/src/components/public/CampsSection.astro:146 | `<span data-testid="camp-location">{escHtml(getLocationDisplay(t.location as string))}</span>` (SSR) | A | remove wrapper |
| app/src/components/public/CampsSection.astro:150 | `{escHtml(typeLabel(t.type))}` (SSR badge) | A | remove wrapper |
| app/src/components/public/CampsSection.astro:156 | `<span …>{escHtml(a.trim())}</span>` (SSR activities map) | A | remove wrapper |
| app/src/components/public/CampsSection.astro:195 | `function escHtml(s) {` (local `is:inline` def for the innerHTML pipeline) | DEF | keep |
| app/src/components/public/CampsSection.astro:276 | `'<img src="' + escHtml(logoUrl) + '" alt="' + escHtml(t.name) + '" … />'` (logoHtml, →innerHTML) | D | keep |
| app/src/components/public/CampsSection.astro:277 | `'style="background-color:' + escHtml(color) + '">' + escHtml((t.name \|\| '').charAt(0).toUpperCase()) + …` (logoHtml, →innerHTML) | D | keep |
| app/src/components/public/CampsSection.astro:279 | `… + t.activities.split(',').map(function(a) { return '…>' + escHtml(a.trim()) + '</span>'; }).join('') + …` (actsHtml, →innerHTML) | D | keep |
| app/src/components/public/CampsSection.astro:281 | `var typeBadge = escHtml(window.__TYPE_LABELS[(t.type \|\| 'camp')] \|\| (t.type \|\| 'camp'));` (→typeHtml→innerHTML) | D | keep |
| app/src/components/public/CampsSection.astro:285 | `… style="background: linear-gradient(135deg, ' + escHtml(color) + ' 0%, ' + escHtml(color) + 'cc 100%)…style="color:' + escHtml(color) + '"…` (→innerHTML) | D | keep |
| app/src/components/public/CampsSection.astro:288 | `+ '<h3 data-testid="camp-name" …>' + escHtml(t.name) + '</h3>'` (→innerHTML) | D | keep |
| app/src/components/public/CampsSection.astro:289 | `+ '<span …>' + escHtml(t.customDomain \|\| ((t.subdomain \|\| '') + '.sinaicamps.com')) + '</span>'` (→innerHTML) | D | keep |
| app/src/components/public/CampsSection.astro:290 | `+ '<p data-testid="camp-description" …>' + escHtml(t.description \|\| 'Premium … courses.') + '</p>'` (→innerHTML) | D | keep |
| app/src/components/public/CampsSection.astro:291 | `…<span data-testid="camp-location">' + escHtml(t.location \|\| 'Sinai, Egypt') + '</span>…'` (→innerHTML) | D | keep |
| app/src/components/public/CampsSection.astro:295 | `… style="background-color:' + escHtml(color) + '1A;…">Capacity: ' + (parseInt(t.capacity) \|\| 50) + …` (→innerHTML) | D | keep |
| app/src/components/public/CampsSection.astro:296 | `+ '<a href="' + escHtml(detailUrl) + '" … style="background-color:' + escHtml(color) + '">Explore Camp…'` (→innerHTML) | D | keep |
| app/src/components/public/MarketplaceDirectory.tsx:4 | `import { escHtml, getLocationDisplay } from '@/lib/utils';` | IMP | keep |
| app/src/components/public/MarketplaceDirectory.tsx:153 | `{escHtml(cat.name)}` (category pill) | B | remove wrapper |
| app/src/components/public/MarketplaceDirectory.tsx:242 | `{escHtml(listing.tenantName.charAt(0).toUpperCase())}` (avatar initial) | B | remove wrapper |
| app/src/components/public/MarketplaceDirectory.tsx:248 | `{escHtml(listing.tenantName)}` | B | remove wrapper |
| app/src/components/public/MarketplaceDirectory.tsx:251 | `{escHtml(listing.subdomain)}.sinaicamps.com` | B | remove wrapper |
| app/src/components/public/MarketplaceDirectory.tsx:256 | `{escHtml(listing.projectDescription \|\| listing.tenantDescription \|\| 'Premium … courses.')}` | B | remove wrapper |
| app/src/components/public/MarketplaceDirectory.tsx:270 | `<span className="truncate">{escHtml(getLocationDisplay(listing.location))}</span>` | B | remove wrapper |
| app/src/components/admin/TenantImportPanel.tsx:5 | `import { escHtml } from '@/lib/utils';` | IMP | keep |
| app/src/components/admin/TenantImportPanel.tsx:341 | `{escHtml(parseError)}` (alert div) | B | remove wrapper |
| app/src/components/admin/TenantImportPanel.tsx:356 | `{escHtml(preview.name)}` | B | remove wrapper |
| app/src/components/admin/TenantImportPanel.tsx:364 | `{escHtml(preview.type)}` | B | remove wrapper |
| app/src/components/admin/TenantImportPanel.tsx:403 | `{escHtml(submitError)}` | B | remove wrapper |
| app/src/components/admin/HRPanel.tsx:14 | `import { formatCurrency, escHtml } from '@/lib/utils';` | IMP | keep |
| app/src/components/admin/HRPanel.tsx:302 | `const periodStart = escHtml(pr.periodStart \|\| pr.period_start \|\| '');` (→`html`→document.write) | D | keep |
| app/src/components/admin/HRPanel.tsx:303 | `const periodEnd = escHtml(pr.periodEnd \|\| pr.period_end \|\| '');` (→`html`→document.write) | D | keep |
| app/src/components/admin/HRPanel.tsx:307 | `const status = escHtml(pr.status \|\| 'draft');` (→`html`→document.write) | D | keep |
| app/src/pages/contact.astro:4 | `import { escHtml, normalizeAssetUrl, readableTextOn } from '@/lib/utils';` | IMP | keep |
| app/src/pages/contact.astro:63 | `<p class="font-bold">{escHtml(tenant?.location \|\| 'Sinai Peninsula, Egypt')}</p>` | A | remove wrapper |
| app/src/pages/contact.astro:72 | `<p class="font-bold">{escHtml(tenant?.phone \|\| 'N/A')}</p>` | A | remove wrapper |
| app/src/pages/contact.astro:82 | `<p class="font-bold">{escHtml(tenant?.email \|\| 'N/A')}</p>` | A | remove wrapper |
| app/src/pages/contact.astro:112 | `function escHtml(s) {` (local `is:inline` def) | DEF | keep |
| app/src/pages/contact.astro:158 | `successBox.textContent = 'Thank you, ' + escHtml(name) + '! … ' + escHtml(email) + ' shortly.';` (plain-text DOM sink) | E | remove wrappers (keep local def for no other use → drop if unused) |
| app/src/pages/rooms.astro:7 | `import { escHtml, normalizeAssetUrl, formatCurrency, readableTextOn } from '@/lib/utils';` | IMP | keep |
| app/src/pages/rooms.astro:108 | `<h2 data-testid="room-name" …>{escHtml(rt.name as string)}</h2>` | A | remove wrapper |
| app/src/pages/rooms.astro:110 | `{escHtml((rt.description as string) \|\| 'Enjoy … views.')}` | A | remove wrapper |
| app/src/pages/faq.astro:4 | `import { escHtml, normalizeAssetUrl } from '@/lib/utils';` | IMP | keep |
| app/src/pages/faq.astro:62 | `<span>{escHtml(faq.question)}</span>` | A | remove wrapper |
| app/src/pages/faq.astro:66 | `{escHtml(faq.answer)}` | A | remove wrapper |
| app/src/pages/gallery.astro:4 | `import { escHtml, normalizeAssetUrl, readableTextOn } from '@/lib/utils';` | IMP | keep |
| app/src/pages/gallery.astro:84 | `` style={`background-image: url(${escHtml(img)})`} `` (img pre-sanitized by normalizeAssetUrl; Astro attr auto-escapes) | A | remove wrapper |
| app/src/pages/about.astro:4 | `import { escHtml, normalizeAssetUrl, readableTextOn } from '@/lib/utils';` | IMP | keep |
| app/src/pages/about.astro:46 | `<h1 …>About {escHtml(tenantName)}</h1>` | A | remove wrapper |
| app/src/pages/about.astro:71 | `{escHtml(tenant?.aboutText \|\| 'Welcome … environment.')}` | A | remove wrapper |
| app/src/pages/about.astro:80 | `{escHtml(missionText)}` | A | remove wrapper |
| app/src/pages/about.astro:95 | `<h4 …>{escHtml(f.title)}</h4>` | A | remove wrapper |
| app/src/pages/about.astro:96 | `<p …>{escHtml(f.description)}</p>` | A | remove wrapper |
| app/src/lib/utils.ts:3 | `export function escHtml(str: string): string {` (canonical def) | DEF | keep |

## CampsSection:276/277/288 insertion verification (explicit)

- Sinks: `CampsSection.astro:267` — `grid.innerHTML = camps.map(function(t) { … }).join('');` (raw-HTML sink); static fallbacks at :248/:263/:301 also `innerHTML` but carry no escHtml.
- :276/:277 build `logoHtml` (img-src + alt + style + initial), concatenated into the card string at :287 (`'<div class="-mt-10 mb-4">' + logoHtml + '</div>'`).
- :288 builds the `<h3 data-testid="camp-name">` string, concatenated at :288 in the same return chain.
- :279/:281/:285/:289/:290/:291/:295/:296 join the same returned string → same `grid.innerHTML` sink.
- Escaper: local `escHtml` (:195–199, `textContent`→`innerHTML` trick) — the correct sanitizer for an innerHTML pipeline.
- Verdict: **D KEEP all** — removing escHtml here would open XSS via tenant-controlled name/domain/description/location/activities/color/URL. Fix step (esc-s2) must NOT touch these lines.

## Counts

- A (Astro expr, remove): **30 lines** (31 calls; :137 holds 2)
- B (React expr, remove): **11 lines**
- C (set:html, keep): **0** (no escHtml→set:html site exists)
- D (manual HTML string, keep): **14 usage lines** (CampsSection 11 + HRPanel 3) + 4 DEFs
- E (plain-text, remove): **5 lines** (TenantMenu 2 + ReservationSummary 2 + contact textContent 1)
- IMP (imports, keep): **13 lines**
- Total: 30+11+0+14+5+13+4 = **77** = grep count ✓
- Fix scope for esc-s2 (unwrap, inner expr byte-identical): **46 lines (A+B+E)**; C/D/IMP/DEF untouched.

## Notes for esc-s2

- Known lines from the mission land as expected: TenantLanding:128 (A), CampsSection:132/:136 (A), CampsSection:276/:277/:288 (D keep), MarketplaceDirectory:153/:242/:248 (B), TenantMenu:290/:293 (E), ReservationSummary:172/:181 (E).
- TenantLanding:242 (`src={escHtml(mapEmbed)}`) is A: Astro escapes attributes; URL already via normalizeAssetUrl.
- gallery:84 is A: URL pre-sanitized by normalizeAssetUrl + Astro attr escaping; follow-up may prefer `escapeUrl()` but inventory action is unwrap.
- contact:158 is E (textContent sink): unwrap both calls; local def at :112 becomes unused → drop if lint flags it.
- TenantMenu:2 import becomes unused after E unwrap → drop the import in the fix.
