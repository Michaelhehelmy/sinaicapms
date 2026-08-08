import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  const robots = `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /pos/
Disallow: /api/

Sitemap: https://sinaicamps.com/sitemap.xml
`;

  return new Response(robots, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
