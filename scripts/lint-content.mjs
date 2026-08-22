import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const projectRoot = new URL('../', import.meta.url);
const projectPath = decodeURIComponent(projectRoot.pathname).replace(/^\/(?:[A-Za-z]:)/, (match) => match.slice(1));
const publicRoots = [join(projectPath, 'src'), join(projectPath, 'public')];
const errors = [];

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

const files = publicRoots
  .flatMap(walk)
  .filter((file) => ['.astro', '.ts', '.js', '.mjs', '.json', '.md', '.txt', '.xml', '.svg'].includes(extname(file)));

const prohibited = [
  { pattern: /info@vavgroup\.pro/i, label: 'inactive email alias info@' },
  { pattern: /sales@vavgroup\.pro/i, label: 'inactive email alias sales@' },
  { pattern: /partners@vavgroup\.pro/i, label: 'inactive email alias partners@' },
  { pattern: /PHONE_TO_BE_ADDED|FORM_ENDPOINT/i, label: 'stale public contact/form placeholder' },
  { pattern: /450\s*(?:документ|операц)/i, label: 'unsupported C01 metric' },
  { pattern: /(?:\+\s*)?66[,.]7\s*%/i, label: 'unsupported C02 growth metric' },
  { pattern: /\b2[,.]2\s*[xх]\b/i, label: 'unsupported C02 multiplier' },
  { pattern: /\b(?:103[,.]3|172[,.]1)\b/i, label: 'unsupported C02 financial metric' },
  { pattern: /\b84[\s,.]*000\b/i, label: 'unsupported C06 value' },
  { pattern: /\b(?:vasconi|cojocari|shumilov|solis)\b/i, label: 'unapproved company or counterparty name' },
];

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  for (const rule of prohibited) {
    if (rule.pattern.test(content)) errors.push(`${relative(projectPath, file)}: ${rule.label}`);
  }
  for (const match of content.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
    if (match[0].toLowerCase() !== 'valentin@vavgroup.pro') errors.push(`${relative(projectPath, file)}: unapproved public email ${match[0]}`);
  }
}

const caseDataPath = join(projectPath, 'src', 'data', 'cases.ts');
const caseData = readFileSync(caseDataPath, 'utf8');
const expectedSlugs = ['retail-process-automation', 'retail-commercial-system', 'complex-b2b-opportunity'];
const declaredSlugs = [...caseData.matchAll(/\n\s+slug:\s+'([^']+)'/g)].map((match) => match[1]);

if (declaredSlugs.length !== 3) errors.push(`src/data/cases.ts: expected exactly 3 public cases, found ${declaredSlugs.length}`);
for (const slug of expectedSlugs) if (!declaredSlugs.includes(slug)) errors.push(`src/data/cases.ts: missing approved slug ${slug}`);

const requiredSafetyCopy = [
  'Кейс показывает работу на этапе квалификации и подготовки предложения. Факт заключения сделки не заявляется.',
  'Работодатель не является клиентом VAV Group.',
  'Из опыта основателя',
];
for (const copy of requiredSafetyCopy) if (!caseData.includes(copy)) errors.push(`src/data/cases.ts: missing safety wording: ${copy}`);

const about = readFileSync(join(projectPath, 'src', 'pages', 'about.astro'), 'utf8');
for (const marker of ['Валентин Стратила', 'Опыт основателя', 'Проекты VAV Group']) {
  if (!about.includes(marker)) errors.push(`src/pages/about.astro: missing founder distinction marker: ${marker}`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`Content lint passed for ${files.length} public source files and 3 approved cases.`);
