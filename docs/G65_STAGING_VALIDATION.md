# G6.5 Staging Validation — SATISFIED (2026-09-22)

- Step 1 reachability: PASS (staging live, tenant guard 400)
- Step 2 migrations: PASS (already at head)
- Step 3 seed: PASS (3 accounts verified)
- Step 4 super-admin: PASS (200 + token)
- Step 5 E2E: 11 passed / 0 failed (rerun after zone fix; prior 4/6/1 was
  hostname bound to backend worker — env drift, resolved)
- Step 6 walkthrough: 5/5 reports verified (public + 2x tenant-admin + 2x POS
  across staging.acaciacamp.com and acacia.staging.sinaicamps.com); 2 lifecycles
  open → in progress → resolved; 8 screenshots committed
- Step 7 rollback: PASS (pin previous + restore latest, staging flags only)
- Verdict: SATISFIED

Real bugs fixed en route: public widget hydration (4140703), apex scope
client+server (7b36f07, 5689ed3), custom-domain staging mirrors (1e745e1),
staging-mirror same-origin API (1a11696). No spec changes; no real bugs remain.
