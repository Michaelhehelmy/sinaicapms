// minimal-marketplace.mjs
// Minimal marketplace API example (see README.md).
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
