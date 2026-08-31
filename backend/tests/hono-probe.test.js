import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';

describe('hono param probe', () => {
  it('probes empty code', async () => {
    const app = new Hono();
    app.get('/barcode/:code', (c) => {
      return new Response(JSON.stringify({ code: c.req.param('code') }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const r1 = await app.request('/barcode/');
    console.log('trailing slash status', r1.status);
    try { console.log('trailing slash body', await r1.text()); } catch {}
    const r2 = await app.request('/barcode/%00');
    console.log('null byte status', r2.status);
    try { console.log('null byte body', await r2.text()); } catch {}
  });
});
