# SinaiCamps — Developer Roadmap (Backlog State)

Status of the production-readiness backlog, as of the **T9–T18** batch plus the docs refresh (2026-08-13). The `AGENT_LOGBOOK.md` in the repo root holds the session-by-session log with dates and file lists.

## Done

| ID | Task | Notes |
| --- | --- | --- |
| T8 | OpenAPI generation | `backend/openapi.json`, `gen:openapi` / `gen:types` scripts |
| T9 | Design-system expansion | +8 a11y-first UI primitives (Accordion, Checkbox, FormField, Radio, Separator, Switch, Textarea, Tooltip) + 8 stories; ui library is now 26 components |
| T10 | Marketplace SEO (JSON-LD) | `CollectionPage`/`ItemList` on `/camps`; `Campground`/`LodgingBusiness` already present on home + tenant landing |
| T11 | ~~Arabic RTL~~ **CANCELLED** | Deliberate product decision: frontend stays hard-coded English LTR. No `app/src/i18n/` exists, no locale middleware, no `sc_lang` cookie; the "arabic-rtl-deep" E2E spec asserts en/ltr (verified). Implementing RTL would break the passing E2E suite. |
| T12 | Image pipeline | `sharpImageService()` (no passthrough), `image.remotePatterns`, new `SafeImage.astro` with graceful fallback; migrated hero/logos/room cards |
| T13 | Admin query migration | Verified already complete: admin SPA fully on TanStack Query, zero raw `fetch` data loads, zero `window.*` globals, 16/16 panels use `@/lib/api` |
| T14 | POS terminal | Shipped (8 POS views, `pos_token` auth, shifts, cart/checkout) |
| T15 | Performance pass | `budget.json` + `lighthouserc.cjs` + `npm run lighthouse`; CampBooking island now `client:visible`; backend caching audit (no KV caching — safe under free plan) |
| T16 | A11y suite | E2E + unit coverage for a11y patterns |
| T18 | Documentation set | This docs/ set |
| T19 | Docs refresh | README + AGENTS + `.opencode/prompts/project-context.md` + `docs/*` updated to match the codebase (repo now `campmaster`, no i18n, 53 migrations, 18 admin panels, 552 E2E gate, R2/DO bindings) |

## Remaining / follow-ups

| Area | Status | Next step |
| --- | --- | --- |
| Staging DNS | Blocked on human | Create `staging.sinaicamps.com` → Pages DNS record, then `./deploy.sh --staging` |
| Git remote + push | **Repo created** — `github.com/Michaelhehelmy/campmaster` (private), `origin` set; commit `5d11305` local. Push blocked on OAuth `workflow` scope — approve the `gh auth refresh -h github.com -s workflow` device flow, or drop `.github/workflows/*` from pushed history |
| Credential vault | Owner action | Store rotated admin credentials (2 accounts) |
| Lighthouse execution | Tooling ready | Run `cd app && npm run lighthouse` against a live preview once a URL is up |

## Known pre-existing type errors (baseline, not regressions)

`BookPage.astro` (`apiBase` prop) and `MenuPage.astro` (meal/mealCategory types) have LSP errors that predate this backlog batch (part of the known 153-error baseline). They do not block `astro build` or the test suites.
