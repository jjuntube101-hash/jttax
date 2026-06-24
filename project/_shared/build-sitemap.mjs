// project/_shared/build-sitemap.mjs
//
// 공유 sitemap 생성기 — build-insights.mjs / build-calculators.mjs 양쪽이 호출.
// /insights/*.html 와 /calculators/*.html 를 자동 열거해 루트 + 정적 페이지만 담는다.
// (해시 URL(#services 등)은 검색엔진에서 루트로 뭉개지므로 의도적으로 제외 — 색인 효율)
//
// 어느 빌드 스크립트가 실행되든 동일한 '완전한' sitemap을 만들어 상호 클로버를 방지한다.

import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function writeSitemap(repoRoot, site) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [{ loc: `${site}/`, lastmod: today, freq: 'weekly', priority: '1.0' }];

  const dirs = [
    { dir: 'calculators', freq: 'monthly', priority: '0.9' }, // 계산기 랜딩(고가치)
    { dir: 'insights', freq: 'monthly', priority: '0.8' },     // 인사이트 글
  ];
  for (const d of dirs) {
    let files = [];
    try {
      files = (await readdir(join(repoRoot, d.dir))).filter(f => f.endsWith('.html'));
    } catch (e) { /* 디렉토리 없으면 건너뜀 */ }
    files.sort();
    for (const f of files) {
      // index.html은 canonical(디렉토리 URL)과 일치시킴
      const loc = f === 'index.html' ? `${site}/${d.dir}/` : `${site}/${d.dir}/${f}`;
      const priority = f === 'index.html' ? '0.95' : d.priority;
      urls.push({ loc, lastmod: today, freq: d.freq, priority });
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u =>
      `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.freq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
    ).join('\n') +
    `\n</urlset>\n`;

  await writeFile(join(repoRoot, 'sitemap.xml'), xml);
  return urls.length;
}
