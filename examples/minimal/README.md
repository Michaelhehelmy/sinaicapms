# minimal — Minimal marketplace fetch example

> This `examples/` directory is the intended home for runnable reference snippets.
> `minimal/` is the first one: the smallest correct way to read the marketplace
> API from outside the app, using the same contract the frontend uses.

## What it shows

The production frontend never talks to D1/KV directly — it goes through the
Hono Worker at `/api/*` with camelCase responses (`docs/API_CONTRACT.md`). This
example does the same with plain `fetch`:

```js
// minimal-marketplace.mjs
// Node 18+ (global fetch). Requires the Worker to be running (wrangler dev or prod).

const API_BASE = process.env.API_BASE || 'http://localhost:8787';

async function getCamps() {
  const res = await fetch(`${API_BASE}/api/camps`);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json(); // camelCase keys (toCamel applied server-side)
}

async function main() {
  const data = await getCamps();
  const camps = data.camps ?? data ?? [];
  console.log(`Found ${camps.length ?? '?'} camps on the marketplace`);
  for (const camp of camps.slice(0, 5)) {
    console.log(`- ${camp.campName ?? camp.name} (id=${camp.id})`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
```

## Notes

- Read-only GET endpoints are `Cache-Control: public` — the client may cache.
- Mutations require auth: `Authorization: Bearer <jwt>` (admin) or
  `<pos_token>` (POS) — see `docs/API_CONTRACT.md`.
- The canonical typed client (used by the app itself) is `app/src/lib/api.ts`
  (113 functions); the generated OpenAPI schema lives at `backend/openapi.json`
  and is served at `/api/openapi.json`.

## Running

```bash
node minimal-marketplace.mjs
```
