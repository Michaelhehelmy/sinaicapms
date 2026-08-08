import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';

const PORT = parseInt(process.env.TEST_PORT || '8789', 10);
const MAX_WAIT_MS = 60_000;
const POLL_INTERVAL_MS = 500;

let serverPid: number | null = null;
let weStartedServer = false;

export async function setup() {
  // Check if server is already running
  const alreadyUp = await isServerUp();
  if (alreadyUp) {
    console.log(`[globalSetup] Server already running on port ${PORT}`);
    return;
  }

  console.log(`[globalSetup] Starting wrangler dev on port ${PORT}...`);

  let wrangler: ReturnType<typeof spawn>;
  try {
    wrangler = spawn(
      process.execPath,
      [
        'node_modules/wrangler/bin/wrangler.js',
        'dev',
        '-c', 'backend/wrangler.toml',
        '--port', String(PORT),
      ],
      {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
  } catch (err: any) {
    console.warn(`[globalSetup] Could not spawn wrangler: ${err.message}`);
    console.warn('[globalSetup] Integration tests will fail with ECONNREFUSED. Unit tests will still pass.');
    return;
  }

  serverPid = wrangler.pid!;
  weStartedServer = true;

  wrangler.on('error', (err) => {
    console.warn(`[globalSetup] wrangler error: ${err.message}`);
  });

  wrangler.on('exit', (code) => {
    if (weStartedServer) {
      console.warn(`[globalSetup] wrangler exited with code ${code}`);
    }
    serverPid = null;
  });

  // Wait for server to become available
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_MS) {
    if (await isServerUp()) {
      console.log(`[globalSetup] Server ready after ${Date.now() - start}ms (pid ${serverPid})`);
      return;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  // Timeout — don't throw, just warn so unit tests can still run
  console.warn(`[globalSetup] Server failed to start within ${MAX_WAIT_MS}ms`);
  console.warn('[globalSetup] Integration tests requiring the server will fail. Unit tests will still pass.');
  weStartedServer = false;
}

export async function teardown() {
  if (!weStartedServer || !serverPid) return;

  console.log(`[globalSetup] Shutting down wrangler (pid ${serverPid})...`);
  try {
    process.kill(serverPid, 'SIGTERM');
  } catch {}
  await sleep(2000);
  try {
    process.kill(serverPid, 'SIGKILL');
  } catch {}
  serverPid = null;
  console.log('[globalSetup] Wrangler stopped.');
}

async function isServerUp(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}
