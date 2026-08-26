# Plan: Audit Resolution — 5 Remaining Items

**Date:** 2026-08-26
**Author:** Orchestrator Agent
**Status:** READY FOR EXECUTION

---

## Executive Summary

This plan resolves the 5 remaining items from the Comprehensive QA/SRE Audit (commit c60918d). All SEV-0/SEV-1 bugs are already fixed. The remaining items are:

1. **XSS Audit & Sanitization** (HIGH) — No stored XSS vulnerabilities found; document defense-in-depth
2. **E2E Coverage Expansion** (HIGH) — Add business-logic E2E specs for Camp, Supermarket, Restaurant, Services
3. **Service Module Integration Tests** (MEDIUM) — Unit tests for services.js (12+ endpoints)
4. **CSRF Documentation** (LOW) — Document Bearer token CSRF resistance
5. **npm Dependency Fix** (LOW) — Diagnose npm hang, add @types/react

---

## Task 1: XSS Audit & Sanitization

### Analysis

**No `dangerouslySetInnerHTML` found in any React component.** All 65 `escHtml` usages in the frontend are in Astro templates (server-rendered) or React components (client-rendered JSX). React auto-escapes JSX expressions, so user data rendered via `{escHtml(field)}` is safe.

**No `innerHTML` with user data in Astro components.** The `innerHTML` usages in `CampsSection.astro`, `MarketplaceHome.astro`, and `contact.astro` are for injecting skeleton/loading HTML or client-side JS that uses `escHtml()` on all user data before inserting into DOM.

**Backend:** The `escHtml()` utility exists in `backend/src/utils/response.js` but is explicitly NOT applied at storage time (by design — see comment in `camps.js:238`). This is correct: D1 stores raw text, React escapes at render time.

### Implementation

Since the audit confirms no stored XSS vulnerabilities exist (React auto-escapes, Astro templates use `escHtml`, no `dangerouslySetInnerHTML` with user data), the implementation is:

1. **Add XSS sanitization middleware** (`backend/src/middleware/sanitize.js`) that strips `<script>` tags and `on*=` event handlers from string fields before storage. This is defense-in-depth.
2. **Create migration 0076** to sanitize existing data in `meta_value`, `description`, `notes`, `comment`, `review` fields.
3. **Add unit test** verifying `<script>alert('xss')</script>` is stored sanitized.

### Files to Create/Modify

| File | Action |
|------|--------|
| `backend/src/middleware/sanitize.js` | NEW — `sanitizeInput()` middleware |
| `backend/migrations/0076_sanitize_user_data.sql` | NEW — sanitize existing data |
| `backend/tests/sanitize.test.js` | NEW — unit tests |
| `backend/src/index.js` | MODIFY — mount sanitize middleware |

### Testing Strategy

- Unit test: POST endpoint with `<script>alert('xss')</script>` in body → verify stored value is sanitized
- Verify all existing tests still pass

---

## Task 2: E2E Coverage Expansion

### Analysis

Existing E2E specs cover: smoke tests, admin CRUD, admin login, POS full flow. Missing: business-logic flows for each business type.

The E2E infrastructure already has:
- `global-setup.ts` with test tenant, admin, POS user, products, meals
- `base.ts` with page fixtures for super admin, tenant admin, POS user
- `api-helpers.ts` with API seeding functions
- Playwright config with 8 projects (marketplace, tenant, admin, auth, cross-cutting, pos, public, routing)

### Implementation

Create 4 new E2E spec files in `tests/e2e/specs/`:

1. **`tests/e2e/specs/admin/camp-flow.spec.ts`** — Camp/Hotel flow: create camp → create room type → create rate plan → create booking → verify reservation appears
2. **`tests/e2e/specs/admin/supermarket-flow.spec.ts`** — Supermarket flow: create product → POS add to cart → complete order → verify stock deduction
3. **`tests/e2e/specs/admin/restaurant-flow.spec.ts`** — Restaurant flow: create service definition → create service item → book service → assign worker → complete
4. **`tests/e2e/specs/admin/service-flow.spec.ts`** — Service flow: admin creates service definition → creates item → books → reviews

### Files to Create

| File | Action |
|------|--------|
| `tests/e2e/specs/admin/camp-flow.spec.ts` | NEW |
| `tests/e2e/specs/admin/supermarket-flow.spec.ts` | NEW |
| `tests/e2e/specs/admin/restaurant-flow.spec.ts` | NEW |
| `tests/e2e/specs/admin/service-flow.spec.ts` | NEW |

### Testing Strategy

- Each spec uses API helpers to seed data, then verifies UI renders correctly
- Use `data-testid` selectors for reliable element targeting
- Serial execution within each spec (sequential dependent steps)

---

## Task 3: Service Module Integration Tests

### Analysis

`backend/src/api/services.js` has 15+ endpoints across definitions, items, bookings, availability, reviews, and pricing. No dedicated integration tests exist.

### Implementation

Create `backend/tests/services-unit.test.js` using the existing `routerHarness.js` pattern:

- **Definitions CRUD**: create → list → update → soft-delete → verify inactive
- **Items CRUD**: create (with valid definition) → list → update → soft-delete → verify archived
- **Bookings CRUD**: create → list → status transition → assign worker → complete
- **Double-booking**: create booking with same scheduled_date → expect 409
- **Validation**: invalid slug → 400, missing required fields → 400
- **Auth**: no tenant ID → 400, non-existent definition → 404

### Files to Create

| File | Action |
|------|--------|
| `backend/tests/services-unit.test.js` | NEW — 20+ test cases |

### Testing Strategy

- Use `mountRouter()` from `routerHarness.js` with mock DB
- Each test seeds its own data (no shared state)
- Verify response status codes and body shapes

---

## Task 4: CSRF Documentation

### Implementation

Create `docs/security-guide.md` documenting:
- Bearer token auth (JWT in Authorization header)
- CSRF resistance (tokens not auto-sent by browsers)
- Warning about cookie-based auth future
- XSS prevention (escHtml, React auto-escaping, CSP headers)
- Rate limiting (KV-based, fails closed)
- CORS policy (hono/cors single source of truth)

Update `docs/README.md` to link to security guide.

### Files to Create/Modify

| File | Action |
|------|--------|
| `docs/security-guide.md` | NEW |
| `docs/README.md` | MODIFY — add security link |

---

## Task 5: npm Dependency Fix

### Analysis

npm install hangs. Diagnose and resolve.

### Implementation

1. Check npm registry connectivity
2. Try `npm install --prefer-offline` or `--registry=https://registry.npmjs.org/`
3. Try clearing cache: `npm cache clean --force`
4. If all else fails, manually add `@types/react` and `@types/react-dom` to `app/package.json` devDependencies

### Files to Modify

| File | Action |
|------|--------|
| `app/package.json` | MODIFY — add @types/react, @types/react-dom |

---

## Execution Order

1. Task 5 (npm fix) — unblocks Task 1 and Task 3 if they need npm
2. Task 1 (XSS) — security first
3. Task 3 (Integration tests) — backend coverage
4. Task 2 (E2E) — frontend coverage
5. Task 4 (CSRF docs) — documentation

## Rollback Strategy

- Each task is committed separately with a descriptive message
- If a task fails, `git revert <commit>` restores previous state
- No database migrations are destructive (0076 is idempotent with CASE/WHEN)
