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
  const acqHub = html.includes('href="/acquisition-tax/"');
  assert.equal(count, acqHub ? 0 : 1, f + ': related-service block count');
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
