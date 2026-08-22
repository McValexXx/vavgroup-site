import { cases } from '@/data/cases';

const routes = [
  '/',
  '/business',
  '/sales',
  '/automation',
  '/ai',
  '/consulting',
  '/networking',
  '/academy',
  '/production',
  '/about',
  '/cases',
  ...cases.map((item) => `/cases/${item.slug}`),
  '/contacts',
];

export function GET() {
  const urls = routes
    .map((route) => `<url><loc>${new URL(route, 'https://vavgroup.pro')}</loc><changefreq>${route === '/' ? 'weekly' : 'monthly'}</changefreq><priority>${route === '/' ? '1.0' : '0.8'}</priority></url>`)
    .join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
