// project/_shared/build-sitemap.mjs
//
// 공유 sitemap 생성기 — build-insights.mjs / build-calculators.mjs 양쪽이 호출.
// /insights/*.html 와 /calculators/*.html 를 자동 열거해 루트 + 정적 페이지만 담는다.
// (해시 URL(#services 등)은 검색엔진에서 루트로 뭉개지므로 의도적으로 제외 — 색인 효율)
//
// 어느 빌드 스크립트가 실행되든 동일한 '완전한' sitemap을 만들어 상호 클로버를 방지한다.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { insightSlug } from './insight-slug.mjs';

/* ⚠️ lastmod 를 «빌드한 날»로 쓰면 안 된다 (260808 Codex sol 지적).
     ① 내용이 안 바뀌어도 매 빌드마다 sitemap.xml 이 달라져 **빌드가 재현 불가능**해진다.
        「빌드 산출물이 커밋과 일치하는가」를 검사하는 신선도 게이트를 넣으면 매일 거짓 실패한다.
     ② 전 URL 이 매일 「오늘 수정됨」이라고 말하면 크롤러에게 거짓 신호를 준다.
        구글은 신뢰할 수 없는 lastmod 를 그냥 무시한다.

   그래서 «실제로 아는 날짜»만 쓴다 —
     · 인사이트: 원고(.md) frontmatter 의 date  ← 진짜 발행일
     · 계산기  : 날짜 소스가 없다 → **lastmod 를 아예 출력하지 않는다**(선택 필드다).
                 모르는 날짜를 지어내느니 비워 두는 편이 정직하고, 재현도 된다.
     · 홈      : 인사이트 중 가장 최근 날짜 = 사이트가 마지막으로 갱신된 시점 */
async function readInsightDates(repoRoot) {
  const map = new Map();           // slug → 'YYYY-MM-DD'
  let files = [];
  try {
    files = (await readdir(join(repoRoot, 'project', 'insights'))).filter(f => f.endsWith('.md'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    return map;
  }
  for (const f of files) {
    if (f.toUpperCase() === 'README.MD') continue;
    const raw = await readFile(join(repoRoot, 'project', 'insights', f), 'utf8');
    const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm) continue;
    const date = (fm[1].match(/^\s*date:\s*['"]?(\d{4}-\d{2}-\d{2})/m) || [])[1];
    if (!date) continue;
    // slug 계산은 빌더와 «같은 함수»로 한다 — 규칙이 갈라지면 lastmod 가 조용히 빠진다
    const fmSlug = (fm[1].match(/^\s*slug:\s*['"]?([\w-]+)/m) || [])[1];
    map.set(insightSlug(f, fmSlug), date);
  }
  return map;
}

export async function writeSitemap(repoRoot, site) {
  const insightDates = await readInsightDates(repoRoot);
  // 홈의 lastmod = 가장 최근 인사이트 발행일(없으면 생략)
  const latest = [...insightDates.values()].sort().pop() || null;

  const urls = [{ loc: `${site}/`, lastmod: latest, freq: 'weekly', priority: '1.0' }];

  const dirs = [
    { dir: 'calculators', freq: 'monthly', priority: '0.9' }, // 계산기 랜딩(고가치)
    { dir: 'insights', freq: 'monthly', priority: '0.8' },     // 인사이트 글
    // 상업 랜딩 (260830 신설 — build-commercial.mjs 산출. 수기 sitemap 추가 금지:
    // 여기 열거되지 않은 디렉터리의 URL 은 다음 빌드가 삭제한다)
    { dir: 'services', freq: 'monthly', priority: '0.9' },     // 업무분야
    { dir: 'experts', freq: 'monthly', priority: '0.8' },      // 전문가
    { dir: 'about', freq: 'monthly', priority: '0.8' },        // 회사소개
  ];
  for (const d of dirs) {
    let files = [];
    try {
      files = (await readdir(join(repoRoot, d.dir))).filter(f => f.endsWith('.html'));
    } catch (e) {
      // 디렉토리 자체가 없을 때만(ENOENT) 조용히 건너뛴다. 그 외 오류(권한·IO)는
      // 해당 섹션 URL 이 통째 누락되는 침묵 실패이므로 전파해 빌드를 실패시킨다.
      if (e.code !== 'ENOENT') throw e;
    }
    files.sort();
    for (const f of files) {
      // index.html은 canonical(디렉토리 URL)과 일치시킴
      const loc = f === 'index.html' ? `${site}/${d.dir}/` : `${site}/${d.dir}/${f}`;
      const priority = f === 'index.html' ? '0.95' : d.priority;
      const slug = f.replace(/\.html$/, '');
      const lastmod = d.dir === 'insights' ? (insightDates.get(slug) || null) : null;
      urls.push({ loc, lastmod, freq: d.freq, priority });
    }
  }

  // 루트 단일 페이지 — 상담+오시는 길 (260830 신설). 파일이 실제로 있을 때만 등재한다.
  try {
    await readFile(join(repoRoot, 'consult.html'));
    urls.push({ loc: `${site}/consult.html`, lastmod: null, freq: 'monthly', priority: '0.9' });
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u =>
      `  <url>\n    <loc>${u.loc}</loc>\n` +
      (u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>\n` : '') +
      `    <changefreq>${u.freq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
    ).join('\n') +
    `\n</urlset>\n`;

  await writeFile(join(repoRoot, 'sitemap.xml'), xml);
  return urls.length;
}
