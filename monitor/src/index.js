import { Hono } from 'hono';
import { TARGETS } from './targets.js';

const app = new Hono();

// A.1 scaffold only — health route. Full check/persist/alert logic lands in A.3/A.4.
app.get('/health', (c) => c.json({ ok: true, targets: TARGETS.length }));

app.notFound((c) => c.json({ success: false, error: 'Not found' }, 404));

export default app;
