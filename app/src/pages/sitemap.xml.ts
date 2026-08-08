import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ site, locals }) => {
  const baseUrl = site?.toString().replace(/\/$/, '') || 'https://sinaicamps.com';

  // Prefer the binding-aware SSR fetcher (set by the tenant middleware) so the
  // sitemap works in production without a cross-origin request to the public
  // API host. Falls back to a plain fetch on the public API endpoint.
  const ssrFetch = locals?.API_FETCH as ((path: string, init?: RequestInit) => Promise<Response>) | undefined;

  let tenants: { id: string; subdomain: string; name: string; customDomain?: string }[] = [];
  try {
    const res = ssrFetch
      ? await ssrFetch('/tenants/public')
      : await fetch(`${baseUrl}/api/tenants/public`);
    if (res.ok) {
      tenants = (await res.json()) as typeof tenants;
    }
  } catch {
    // Non-fatal: fall back to an empty (or statically listed) sitemap.
  }

  const campPages = tenants
    .filter(t => t.id !== 'marketplace')
    .map(t => {
      const slug = t.subdomain || t.id;
      return `  <url>
    <loc>${baseUrl}/camp/${slug}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${baseUrl}/camp/${slug}/menu</loc>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>${baseUrl}/camp/${slug}/book</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
    }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/camps</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${baseUrl}/about</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>${baseUrl}/gallery</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>${baseUrl}/faq</loc>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>
  <url>
    <loc>${baseUrl}/contact</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
${campPages}
</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
