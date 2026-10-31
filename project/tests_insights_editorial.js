'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const root = path.join(__dirname, '..');
const files = fs.readdirSync(path.join(root, 'insights')).filter(f => f.endsWith('.html') && f !== 'index.html');
for (const f of files) {
  const html = fs.readFileSync(path.join(root, 'insights', f), 'utf8');
  assert.equal((html.match(/<h1\b/g)||[]).length, 1, f + ': H1');
  const ids = [...html.matchAll(/<h2 id="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length, new Set(ids).size, f + ': duplicate headings');
  for (const m of html.matchAll(/href="#(section-\d+)"/g)) assert.ok(ids.includes(m[1]), f + ': broken TOC');
  assert.ok(html.includes('class="jt-editorial"'), f + ': shared layout');
  const json = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]));
  assert.ok(json.some(x=>x['@type']==='Article'), f + ': Article schema');
  // 261031 SEO 1-3: Home > Tax guide > this article, last item = canonical URL, name = Article headline.
  const crumbs = json.filter(x=>x['@type']==='BreadcrumbList');
  assert.equal(crumbs.length, 1, f + ': one BreadcrumbList');
  const canonical = (html.match(/<link rel="canonical" href="([^"]+)"/)||[])[1];
  const items = crumbs[0].itemListElement;
  assert.deepEqual(items.map(x=>x.position), [1,2,3], f + ': breadcrumb positions');
  assert.ok(items.every(x=>x['@type']==='ListItem'), f + ': breadcrumb ListItem type');
  assert.deepEqual([items[0].name, items[0].item, items[1].name], ['홈', 'https://www.jttax.co.kr/', '세금 가이드'], f + ': breadcrumb home/hub names');
  assert.equal(items[1].item, 'https://www.jttax.co.kr/insights/', f + ': breadcrumb hub');
  assert.equal(items[2].item, canonical, f + ': breadcrumb last item = canonical');
  assert.equal(items[2].name, json.find(x=>x['@type']==='Article').headline, f + ': breadcrumb name = headline');
  // 261031 SEO 1-4: internal evidence-table codes must not reach readers.
  assert.ok(!/근거표|GT-\d/.test(html.replace(/<!--[\s\S]*?-->/g, '')), f + ': internal evidence-table code visible');
  // 261031 owner decision 0-5 (SEO 1-2): reviewer 이현준 세무사 on the byline and as the Article editor (Person) linked to the expert page.
  // The firm stays the only author: a reviewer is not declared a co-author (Codex R1-F1).
  const art = json.find(x=>x['@type']==='Article');
  const authors = [].concat(art.author);
  assert.ok(authors.length === 1 && authors[0]['@type']==='Organization' && authors[0].name==='제이티 세무법인', f + ': firm is the sole author');
  assert.ok(art.editor && art.editor['@type']==='Person', f + ': reviewer Person as editor');
  assert.deepEqual([art.editor.name, art.editor.jobTitle, art.editor.url], ['이현준', '세무사', 'https://www.jttax.co.kr/experts/lee-hyunjun.html'], f + ': reviewer Person');
  assert.ok(/<div class="jt-ed-byline">[\s\S]*?<span>검토 <a href="\/experts\/lee-hyunjun\.html">이현준 세무사<\/a><\/span>/.test(html), f + ': reviewer on byline');
}
{
  // The reviewer's expert page must exist and name the same Person.
  const ex = fs.readFileSync(path.join(root,'experts','lee-hyunjun.html'),'utf8');
  assert.ok(/"@type":"Person","name":"이현준"/.test(ex), 'expert page Person name matches reviewer');
}
for (const slug of ['vat-basics','vat-final-filing-2026']) {
  const html = fs.readFileSync(path.join(root,'insights',slug+'.html'),'utf8');
  assert.ok(html.includes('법령 원문 대조 2026-10-02'));
  assert.ok(html.includes('https://www.law.go.kr/'));
  assert.ok(html.includes('상반기 세금계산서 발급'));
  assert.ok(!html.includes('개인 일반과세자만 대상이고 간이과세자는 제외'));
}
// Mutate only a generated test page, and always restore it. An arbitrary URL must fail.
const target = path.join(root,'insights','vat-final-filing-2026.html');
const original = fs.readFileSync(target,'utf8');
const gate = () => spawnSync(process.execPath,[path.join(__dirname,'tests_static_shell.js')],{cwd:root,encoding:'utf8'});
assert.equal(gate().status,0,'positive control');
try {
  const broken = original.replace(/(<meta property="og:image" content=")[^"]+/, '$1https://invalid.example/fake.png');
  assert.notEqual(broken, original);
  fs.writeFileSync(target,broken);
  const result = gate();
  assert.notEqual(result.status,0,'foreign/mismatched image must fail');
  assert.ok(result.stdout.includes('이미지 정본과 다릅니다'));
} finally { fs.writeFileSync(target,original); }
assert.equal(fs.readFileSync(target,'utf8'),original);
console.log(`PASS: ${files.length} article layouts, VAT sources/exceptions, image positive/negative controls and restoration`);

const card = path.join(root,'insights','business-card-vat-deduction.html');
if(fs.existsSync(card)) {
  const html=fs.readFileSync(card,'utf8');
  assert.ok(html.includes('<li>[1] <a href="https://www.law.go.kr/'),'Reference labels must remain outside link text');
  assert.ok(html.includes('<ol>'),'Numbered steps must render as a list');
  assert.ok(/jt-publication:[a-f0-9]{64}/.test(html),'Exact deployment source marker');
}

// 261031 SEO 1-0: related-service block. One block per non-acquisition article, none on acquisition-hub articles.
const serviceOf = html => {
  const blocks = [...html.matchAll(/<aside aria-label="관련 업무"[\s\S]*?<\/aside>/g)];
  return {count: blocks.length, slug: blocks[0] && (blocks[0][0].match(/href="\/services\/([a-z-]+)\.html"/)||[])[1]};
};
let serviceBlocks = 0;
for (const f of files) {
  const html = fs.readFileSync(path.join(root,'insights',f),'utf8');
  const {count, slug} = serviceOf(html);
  const acqHub = /^acquisition-tax(-|$)/.test(f.replace(/\.html$/, '')); // same rule as isAcqHubArticle in build-insights.mjs
  assert.equal(count, acqHub ? 0 : 1, f + ': related-service block count');
  assert.equal(html.includes('취득세는 «어떤 이유로, 무엇을, 누구 명의로» 취득했는지'), acqHub, f + ': acquisition hub block (ACQ_HUB_BLOCK)');
  if (count) { assert.ok(fs.existsSync(path.join(root,'services',slug+'.html')), f + ': service page exists'); serviceBlocks++; }
}
const expectService = {
  'gift-tax-saving':'asset-transfer', 'burdened-gift':'asset-transfer', 'one-house-cgt-exemption':'asset-transfer',
  'property-holding-tax-june1':'asset-transfer', 'capital-gains-tax-traps':'asset-transfer',
  'youtube-youth-startup-tax-relief':'bookkeeping', 'existing-business-youtuber-startup-tax-relief':'bookkeeping',
  'youtuber-startup-business-location':'bookkeeping', 'youtuber-tax-guide':'bookkeeping',
  'corporate-conversion':'consulting', 'family-business-succession':'consulting',
  'tax-audit-first-72h':'tax-audit', 'tax-appeal-refund-correction':'tax-refund',
};
for (const [slug, svc] of Object.entries(expectService)) {
  assert.equal(serviceOf(fs.readFileSync(path.join(root,'insights',slug+'.html'),'utf8')).slug, svc, slug + ': related service');
}
console.log(`PASS: ${serviceBlocks} related-service blocks, ${Object.keys(expectService).length} expected mappings`);
