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
