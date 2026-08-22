import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const root = new URL('../dist/', import.meta.url);
const rootPath = decodeURIComponent(root.pathname).replace(/^\/(?:[A-Za-z]:)/, (match) => match.slice(1));
const expectedPages = ['index', 'business', 'sales', 'automation', 'ai', 'consulting', 'networking', 'academy', 'production', 'about', 'cases', 'cases/retail-process-automation', 'cases/retail-commercial-system', 'cases/complex-b2b-opportunity', 'contacts', 'privacy', '404'];
const expectedAssets = ['CNAME', 'favicon.svg', 'apple-touch-icon.png', 'og/vav-group.jpg', 'robots.txt', 'sitemap.xml'];
const errors = [];

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function routeExists(pathname) {
  if (pathname === '/') return existsSync(join(rootPath, 'index.html'));
  const clean = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (!clean) return true;
  if (extname(clean)) return existsSync(join(rootPath, clean));
  return existsSync(join(rootPath, `${clean}.html`)) || existsSync(join(rootPath, clean, 'index.html'));
}

for (const page of expectedPages) {
  if (!existsSync(join(rootPath, `${page}.html`)) && !existsSync(join(rootPath, page, 'index.html'))) errors.push(`Missing page: /${page === 'index' ? '' : page}`);
}
for (const asset of expectedAssets) if (!existsSync(join(rootPath, asset))) errors.push(`Missing public asset: /${asset}`);

const htmlFiles = walk(rootPath).filter((file) => file.endsWith('.html'));
const outputFiles = walk(rootPath);
const titles = new Set();
let internalLinks = 0;

const blockedArtifactPath = /(^|\/)(?:intake|sources|docs|internal|review|evidence|cv|resume)(?:\/|$)/i;
const blockedArtifactExtension = /\.(?:pdf|docx?|xlsx?|pptx?|csv|zip|7z|rar|pem|key|p12|pfx)$/i;

for (const file of outputFiles) {
  const label = relative(rootPath, file).replaceAll('\\', '/');
  if (blockedArtifactPath.test(label)) errors.push(`${label}: private artifact path detected in dist`);
  if (blockedArtifactExtension.test(label)) errors.push(`${label}: private document type detected in dist`);
  if (file.endsWith('.map')) errors.push(`${label}: production source map should not be public`);
  const size = readFileSync(file).byteLength;
  if (size > 1_000_000) errors.push(`${label}: asset exceeds 1 MB (${size} bytes)`);
}

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const label = relative(rootPath, file);
  if (/localhost|127\.0\.0\.1/.test(html)) errors.push(`${label}: contains a local URL`);
  if (/\bC0[126]\b|current score|publication risk|source[_ -]?id|evidence status|PHONE_TO_BE_ADDED|FORM_ENDPOINT/i.test(html)) errors.push(`${label}: contains internal or stale publication data`);
  for (const match of html.matchAll(/mailto:([^"'?#\s]+)/gi)) if (match[1].toLowerCase() !== 'valentin@vavgroup.pro') errors.push(`${label}: unapproved public email ${match[1]}`);
  for (const match of html.matchAll(/tel:([^"'?#\s]+)/gi)) if (match[1] !== '+79224615517') errors.push(`${label}: unapproved public phone ${match[1]}`);
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  if (!title) errors.push(`${label}: missing title`);
  else if (titles.has(title) && !label.includes('404')) errors.push(`${label}: duplicate title "${title}"`);
  else titles.add(title);
  for (const required of ['name="description"', 'rel="canonical"', 'property="og:title"', 'name="twitter:title"']) {
    if (!html.includes(required)) errors.push(`${label}: missing ${required}`);
  }
  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    const href = match[1];
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    internalLinks += 1;
    const pathname = href.split(/[?#]/)[0] || '/';
    if (!routeExists(pathname)) errors.push(`${label}: broken link ${href}`);
  }
}

const robots = readFileSync(join(rootPath, 'robots.txt'), 'utf8');
const sitemap = readFileSync(join(rootPath, 'sitemap.xml'), 'utf8');
if (!robots.includes('Sitemap: https://vavgroup.pro/sitemap.xml')) errors.push('robots.txt: production sitemap URL missing');
if (/https?:\/\/(?:www\.)?[^<\s]*vavgroup\.pro/i.test(sitemap) && sitemap.includes('https://www.vavgroup.pro')) errors.push('sitemap.xml: www canonical URLs are not allowed');
if (!sitemap.includes('https://vavgroup.pro/cases')) errors.push('sitemap.xml: public cases route missing');

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const totalBytes = outputFiles.reduce((sum, file) => sum + readFileSync(file).byteLength, 0);
console.log(`Validated ${htmlFiles.length} HTML pages, ${internalLinks} internal links, and ${outputFiles.length} public files (${Math.round(totalBytes / 1024)} KB).`);
