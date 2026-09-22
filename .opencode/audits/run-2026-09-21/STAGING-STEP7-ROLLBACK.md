# Staging Step 7 — rollback drill (2026-09-22, staging flags only)

- Pinned backend staging to previous Upload 03efd74e (via
  `./deploy.sh --rollback 03efd74e --staging`): /api/me HTTP 400 (alive).
- Restored latest d2d18e6f (same command): /api/me 400, homepage 200.
- D1 untouched (migrations forward-only by design); no prod flags used.

Status: PASS.
