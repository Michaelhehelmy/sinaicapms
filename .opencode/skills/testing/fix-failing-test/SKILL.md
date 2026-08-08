---
name: fix-failing-test
description: Debug and resolve failing tests in SinaiCamps
---

## When to use
When a test is failing and blocking verification.

## Steps

1. **Isolate**
   - Run the specific failing test file using filter flags (e.g. `npx vitest run -t "test name"`).

2. **Diagnose**
   - Check if failure is due to:
     - Missing database migrations.
     - Outdated mocks/fixtures.
     - Selector changes (for E2E).
     - Recent schema alterations.

3. **Fix**
   - Address the root cause. Avoid changing assertions to make a broken flow pass.

4. **Verify**
   - Run the full test suite (`npm run test`) to confirm resolution.
