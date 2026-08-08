#!/bin/bash
# run-e2e.sh — Start servers + run E2E tests in a single persistent process
BASEDIR=/workspace/sinaicamps

echo "[$(date)] Starting backend on port 8787..."
cd "$BASEDIR/backend" && npx wrangler dev --port 8787 --local > /tmp/e2e-backend.log 2>&1 &
BACKEND_PID=$!

echo "[$(date)] Starting frontend on port 4320..."
cd "$BASEDIR/app" && npx astro dev --port 4320 --host > /tmp/e2e-frontend.log 2>&1 &
FRONTEND_PID=$!

echo "[$(date)] Waiting for servers (backend=$BACKEND_PID frontend=$FRONTEND_PID)..."
sleep 25

echo "[$(date)] Running Playwright tests..."
cd "$BASEDIR"
npx playwright test "$@" --reporter=line 2>&1

EXIT_CODE=$?
echo "[$(date)] Tests finished with exit code $EXIT_CODE"

kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
exit $EXIT_CODE
