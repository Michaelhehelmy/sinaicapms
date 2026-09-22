# Staging Step 4 — super-admin login (2026-09-21)

Probe: `POST https://staging.sinaicamps.com/api/auth/login` as admin@sinaicamps.com
Result: HTTP 200, `success:true`, JWT access token + refreshToken issued.

Status: PASS. P0 tenant-binding risk cleared on staging.
