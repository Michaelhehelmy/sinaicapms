# SinaiCamps — Owner Testing Guide (Human-Testing Phase)

This guide is **only for you (the owner)**. Testers get `docs/TESTING_GUIDE_TESTER.md` — share that file, not this one. It covers your super-admin credentials, the Feedback panel in-box, and the dashboard areas you test personally.

---

## 1. Your Super-Admin Login

| Role | Email | Password | Notes |
| --- | --- | --- | --- |
| Super admin (owner) | `admin@sinaicamps.com` | `sinairoot` | Seeded by migration 0029 — there is NO API that creates super admins. Change it after the testing phase. |

:warning: Keep this credential out of the tester guide. `scripts/seed-test-users.js` only creates the two tester accounts.

## 2. Prepare an environment for testers

```bash
# Start the backend, then seed the tester accounts (idempotent — safe to re-run):
node scripts/seed-test-users.js
# Environment override for staging/prod:
API_BASE_URL=https://staging.sinaicamps.com node scripts/seed-test-users.js
```

Created accounts (documented for testers in TESTING_GUIDE_TESTER.md):
- `admin.test@acaciacamp.com` / `TestPass123!` (camp admin)
- `pos.test@acaciacamp.com` / `pass1234`, POS username `testpos`

## 3. Reviewing tester reports (Feedback panel)

1. Log in at `sinaicamps.com/admin` as the **super admin**.
2. Open the **Feedback** tab (envelope icon) in the left sidebar — newest first.
3. Click a row to expand: full message, the tester's "point of view", page URL, tester identity/role, browser user-agent, tenant, and the **screenshot** (click to open full-size).
4. Move reports through the lifecycle: `open` → `in progress` → `resolved` (or `archived` for noise).
5. Filter by status and by surface (admin / POS / public).

## 4. Your personal smoke list — Super Admin Dashboard (Global Operator Mode)

Only you test these tabs; testers cannot reach them:

- [ ] **Dashboard** — KPI cards, charts, alerts render; numbers match reality
- [ ] **Tenants** — create/edit/delete tenant flow (start with a throwaway tenant), tenant type switch (hotel/camp/restaurant/custom), marketplace branding
- [ ] **All Orders** — filter, status change, order detail across ALL tenants
- [ ] **Users** — search admins, reset password, role visibility
- [ ] **System Settings** — global branding, site config persists after refresh
- [ ] **Audit Log** — recent actions appear; export CSV works
- [ ] **Subscriptions** — plan list, trial/status transitions
- [ ] **Financials** — reports load with tenant data; drilldowns
- [ ] **HR / Supply Chain / CRM / Storefront / AI & Insights** — each panel loads and saves without errors
- [ ] **Reports** — scheduled/generated reports render
- [ ] **System Health** — health snapshot + metrics endpoints return live data
- [ ] **Performance** — performance payload renders
- [ ] **Feedback** — see section 3 above; live reports from the tester group land here

Capture anything odd with the same Feedback widget (it is always visible on your admin session too) — or fix it directly.

## 5. Wrapping up the phase

1. Close every report in the Feedback panel (resolve or archive).
2. Change test passwords or delete the tester accounts.
3. Ask the agent to remove the debug widget gate (`?debug=1`) before launch.