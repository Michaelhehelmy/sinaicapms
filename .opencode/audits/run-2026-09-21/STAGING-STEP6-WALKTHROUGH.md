# Staging Step 6 — walkthrough (2026-09-22, partial)

- Public ?debug=1: PASS — widget live after fix 4140703, report WALK-PUBLIC-1
  submitted (shot 01-public.png).
- Owner panel: PASS — WALK-PUBLIC-1 visible in Feedback panel, lifecycle
  open → in progress → resolved (shots 04-owner-panel.png, 05-lifecycle.png).
- Tenant admin (admin.test): BLOCKED — apex sends marketplace scope, tenant
  login 401s by design (custom-domain flow). Needs acacia.staging custom
  domain (owner dashboard).
- POS (testpos): BLOCKED — /pos on apex is branded 404 by zone design; same
  domain needed.
- Super-admin apex login: PASS (widget present, no errors) after fix 7b36f07.

## Both hostnames (2026-09-22, after zone fix 1e745e1 + same-origin api 1a11696)
- staging.acaciacamp.com + acacia.staging.sinaicamps.com render tenant
  landing 200; /api/* routes to staging backend (400 guard, no CORS).
- Tenant admin login both hosts: PASS (widget present).
- POS login both hosts: PASS (widget present). Note: POS success-modal Done
  button needs force-click in automation (shell overlay intercepts normal
  click) — cosmetic, human taps work.
- Reports: WALK-ADMIN-STAGINGCD, WALK-POS-STAGINGCD, WALK-ADMIN-ACACIA,
  WALK-POS-ACACIA submitted (shots 06/07 x2 hosts) plus earlier WALK-PUBLIC-1.
- Owner panel: all 5 markers visible (shot 08-all-reports.png); lifecycle
  open → in progress → resolved run on WALK-POS-ACACIA (2nd lifecycle demo).
- Real bug found en route: SSR API base pointed staging mirrors at PROD
  (CORS death) — fixed in 1a11696 (same-origin for staging mirrors).
