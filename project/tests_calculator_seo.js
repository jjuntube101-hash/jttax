// 계산기 정적 랜딩의 색인 가능성 회귀 검사.
// 실행: node project/tests_calculator_seo.js (빌드 산출물 기준)

const { readFile } = require('node:fs/promises');
const { existsSync } = require('node:fs');

const SITE = 'https://www.jttax.co.kr';
let failures = 0;

function fail(message) {
  failures += 1;
  console.error(`FAIL ${message}`);
}

function jsonLd(html, where) {
  const values = [];
  for (const match of html.matchAll(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi)) {
    try {
      values.push(JSON.parse(match[1]));
    } catch (error) {
      fail(`${where}: invalid JSON-LD (${error.message})`);
    }
  }
  return values;
}

function hasMetaDescription(html) {
  const match = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']\s*\/?>/i);
  return Boolean(match && match[1].trim().length >= 20);
}

async function main() {
  const { CALCULATORS } = await import('./calculators/calculators.data.mjs');
  const slugs = new Set();
  const subs = new Set();
  const sitemap = await readFile('sitemap.xml', 'utf8');
  const index = await readFile('calculators/index.html', 'utf8');
  const robots = await readFile('robots.txt', 'utf8');
  const chrome = await readFile('project/src/Chrome.jsx', 'utf8');
  const routesMatch = chrome.match(/const calculatorLandings = (\{[\s\S]*?\n      \});/);
  if (!routesMatch) throw new Error('calculator canonical map missing');
  const canonicalRoutes = require('node:vm').runInNewContext('(' + routesMatch[1] + ')');

  if (!robots.includes(`Sitemap: ${SITE}/sitemap.xml`)) fail('robots.txt does not advertise the canonical sitemap');
  if (/Disallow:\s*\/calculators\/?\s*$/mi.test(robots)) fail('robots.txt blocks calculator landing pages');
  if (/<meta\s+name=["']robots["'][^>]*\bnoindex\b/i.test(index)) fail('calculators/index.html has noindex');

  for (const calc of CALCULATORS) {
    if (canonicalRoutes[calc.sub] !== calc.slug) fail(`${calc.sub}: SPA canonical differs from static landing`);
    const where = `calculators/${calc.slug}.html`;
    const url = `${SITE}/${where}`;
    if (slugs.has(calc.slug)) fail(`${calc.slug}: duplicate slug in source data`);
    if (subs.has(calc.sub)) fail(`${calc.slug}: duplicate SPA sub-route in source data`);
    slugs.add(calc.slug);
    subs.add(calc.sub);

    if (!existsSync(where)) {
      fail(`${where}: source entry has no static landing page`);
      continue;
    }
    const html = await readFile(where, 'utf8');
    const ld = jsonLd(html, where);
    const app = ld.find((item) => item['@type'] === 'WebApplication');

    if (!/<title>[^<]+<\/title>/i.test(html)) fail(`${where}: missing title`);
    if (!hasMetaDescription(html)) fail(`${where}: missing or too-short description`);
    if (!html.includes(`<link rel="canonical" href="${url}">`)) fail(`${where}: missing self-referential canonical`);
    if (!html.includes(`<meta property="og:url" content="${url}">`)) fail(`${where}: Open Graph URL differs from canonical`);
    if (!/<h1(?:\s[^>]*)?>[\s\S]*?<\/h1>/i.test(html)) fail(`${where}: missing H1`);
    if (/<meta\s+name=["']robots["'][^>]*\bnoindex\b/i.test(html)) fail(`${where}: has noindex`);
    if (!html.includes('href="/calculators/"')) fail(`${where}: lacks static link to calculator hub`);
    if (!html.includes(`href="/#/report/${calc.sub}"`)) fail(`${where}: lacks its calculator execution link`);
    if (!app || app.url !== url) fail(`${where}: missing WebApplication JSON-LD with canonical URL`);
    if (!ld.some((item) => item['@type'] === 'BreadcrumbList')) fail(`${where}: missing BreadcrumbList JSON-LD`);
    if (!sitemap.includes(`<loc>${url}</loc>`)) fail(`${where}: omitted from sitemap.xml`);
    if (!index.includes(`href="/calculators/${calc.slug}.html"`)) fail(`${where}: omitted from calculator hub`);
  }

  if (failures) process.exitCode = 1;
  else console.log(`OK calculator SEO: ${CALCULATORS.length} landing pages, hub, sitemap, robots, canonical and JSON-LD verified`);
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
