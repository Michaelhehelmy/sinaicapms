# SinaiCamps — Testing

## Suites and counts (verified)

| Suite | Command | Count |
| --- | --- | --- |
| Backend unit | `cd backend && npx vitest run` | **2610 tests / 115 files** |
| Frontend unit | `cd app && npx vitest run` | **3561 tests / 149 files** |
| Root integration | `npx vitest run` | **255 tests / 37 files** (262 registered; 7 dropped by the documented 30-min `/api/auth` login-limit flake)
| E2E | `CI=true npx playwright test` | **566 total / 552 gate passed, 14 env-skipped** |

## E2E specifics

Playwright config lives in `playwright.config.ts` (repo root). The E2E suite **boots both servers** (backend + frontend) itself in CI mode.

```bash
CI=true npx playwright test          # full gate
npx playwright test --project=auth   # auth project only
npx playwright show-report tests/e2e/results/html
```

### Port hygiene before a full E2E run

If ports are already taken, the suite will fail before any test runs:

```bash
ss -tlnp | grep -E '4320|8787'
#  4320 = frontend (Astro dev/preview)
#  8787 = backend (wrangler dev)
```

Free the ports (or let the config pick alternates) before running.

### Environment-skipped tests (14)

A subset of specs only run against a live staging/prod environment (e.g. production-specific flows). In CI mode they are skipped — the gate is the 552 that run locally.

### Tenant page `load` hang

Tenant E2E pages can hang on `load` in `astro dev` because logo/favicon point at a dead `localhost:8001`. Specs use `page.goto(url, { waitUntil: 'domcontentloaded' })` — keep this convention in new specs.

### Ground truth

`test-results/.last-run.json` records the previous run's results. If `tests/e2e/results/*` disagree with `AGENT_LOGBOOK.md`, the `.last-run.json` and the full log are authoritative.

## Writing tests

- **Unit**: Vitest. Backend tests live in `backend/` (**115 files**); frontend in `app/` (**149 files**, colocated or under `app/src/**/__tests__`).
- **Integration**: `tests/` root, run via `vitest.integration.config.ts` (`npm run test:integration`).
- **E2E**: Playwright specs in `tests/e2e/specs/` with shared pages/fixtures in `tests/e2e/pages/` and `tests/e2e/fixtures/`.
- Reusable processes: use the `fix-failing-test` skill (`.opencode/skills/testing/fix-failing-test/SKILL.md`) to debug failures and `new-e2e-test` (`.opencode/skills/testing/new-e2e-test/SKILL.md`) to add specs.

## Cross-cutting concerns (manual steps 32–34)

### Manual step 32: Authentication and Security
| # | Action | Expected Result |
|---|---|---|
| 32.1 | Visit `/admin` while logged out | Redirected to login |
| 32.2 | Login with wrong password | Error toast shown |
| 32.3 | Login with valid credentials | Dashboard loads |
| 32.4 | Refresh page while logged in | Session persists (JWT in localStorage) |
| 32.5 | Visit `/admin` with expired token | Redirected to login |
| 32.6 | Click Logout | Session cleared, redirected to login |
| 32.7 | Attempt access after logout (back button) | Redirected to login |

---

### Manual step 33: Responsive Design
| # | Action | Expected Result |
|---|---|---|
| 33.1 | Resize to mobile (< 768px) | Sidebar collapses, hamburger menu appears |
| 33.2 | Click hamburger menu | Sidebar slides in |
| 33.3 | Navigate on mobile | Panels load correctly |
| 33.4 | Resize to tablet (768-1024px) | Sidebar persistent, content adjusts |
| 33.5 | Resize to desktop (> 1024px) | Full sidebar visible |

---

### Manual step 34: Error Handling
| # | Action | Expected Result |
|---|---|---|
| 34.1 | Disconnect network (DevTools offline) | Graceful error messages, no white screen |
| 34.2 | Reconnect network | Data refreshes automatically |
| 34.3 | Submit form with invalid data | Validation errors shown (no 500 errors) |
| 34.4 | Navigate to non-existent route | 404 page shown |

## Quick reference: all admin panel tab IDs

### Super Admin (3 tabs)
| Tab ID | Label | Purpose |
|---|---|---|
| `super_dashboard` | Super Dashboard | Platform-wide stats |
| `super_tenants` | Tenants | Manage all tenants + admins |
| `super_reservations` | All Orders | Orders across all tenants |

### Tenant Admin (15 tabs)
| Tab ID | Label | Purpose |
|---|---|---|
| `dashboard` | Dashboard | Tenant stats and quick actions |
| `camps` | Camps | Manage camp locations |
| `rooms` | Rooms | Manage room types and pricing |
| `rateplans` | Rate Plans | Seasonal and special pricing |
| `reservations` | Orders | Guest bookings and status |
| `inbox` | Inbox | Contact form leads and messages |
| `calendar` | Booking Calendar | Visual booking grid |
| `meals` | Meals | Food and beverage items |
| `menu-planner` | Menu Planner | Weekly meal scheduling |
| `menu` | Menu Page | Public menu preview |
| `planning` | Planning | Upcoming capacity view |
| `reports` | Reports | Revenue and analytics |
| `low-stock` | Low Stock | Inventory alerts |
| `staff` | Staff | Staff management |
| `settings` | Settings | Tenant config and password |

### POS (4 tabs)
| Tab ID | Label | Purpose |
|---|---|---|
| `dashboard` | Dashboard | Today's sales overview |
| `products` | Products | POS product catalog |
| `orders` | Orders | Transaction history |
| `shift` | Shift | Open/close shifts, cash reconciliation |

## CI checks before shipping

1. `cd backend && npx vitest run` — green.
2. `cd app && npx vitest run` — green.
3. `npx vitest run` (root integration) — green.
4. `cd app && npm run build` — green.
5. `CI=true npx playwright test` — 552 passed / 0 failed (14 skipped) unless environment specs apply.
