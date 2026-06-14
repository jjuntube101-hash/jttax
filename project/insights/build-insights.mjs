// project/insights/build-insights.mjs
//
// 인사이트(블로그) 자동 발행 빌드 스크립트 — Node.js 18+
//
// 사용법 (수동):
//   node project/insights/build-insights.mjs
//
// 보통은 직접 실행할 필요 없음 — GitHub Actions가 자동 실행합니다.
// project/insights/*.md 파일을 추가/수정해서 커밋하면 아래가 자동 수행됩니다:
//   1. project/insights/*.md 파싱 (프론트매터 + 본문)
//   2. 날짜 역순 정렬 → project/src/Data.jsx 의 insights 배열 교체
//   3. 각 글을 /insights/<slug>.html 단독 페이지로 렌더링 (사이트 루트 기준)
//   4. 루트 sitemap.xml 갱신 (정적 페이지 + 글 URL)

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url)); // project/insights
const PROJECT = join(__dirname, '..');                     // project
const REPO_ROOT = join(PROJECT, '..');                     // 저장소 루트 = 사이트 루트
const INSIGHTS_SRC = __dirname;                            // .md 원고 위치
const DATA_PATH = join(PROJECT, 'src', 'Data.jsx');
const SITEMAP_PATH = join(REPO_ROOT, 'sitemap.xml');
const ARTICLE_OUT_DIR = join(REPO_ROOT, 'insights');       // 생성된 글 HTML → /insights/
const SITE = 'https://www.jttax.co.kr';

// ────────────── 프론트매터 파서 ──────────────
function parseFrontmatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { meta: {}, body: src };
  const meta = {};
  m[1].split('\n').forEach(line => {
    const i = line.indexOf(':');
    if (i < 0) return;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    meta[key] = val;
  });
  return { meta, body: m[2] };
}

// ────────────── 경량 마크다운 → HTML ──────────────
function mdToHtml(md) {
  let html = md
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" rel="noopener">$1</a>');
  html = html.replace(/(^|\n)((?:- .+\n?)+)/g, (_, pre, block) => {
    const items = block.trim().split('\n').map(l => `  <li>${l.replace(/^- /, '')}</li>`).join('\n');
    return `${pre}<ul>\n${items}\n</ul>\n`;
  });
  html = html.split(/\n\n+/).map(p => {
    const t = p.trim();
    if (!t) return '';
    if (/^<(h[1-6]|ul|ol|blockquote|pre|div)/.test(t)) return t;
    return `<p>${t.replace(/\n/g, '<br/>')}</p>`;
  }).join('\n\n');
  return html;
}

// ────────────── 글 로드 ──────────────
async function loadArticles() {
  const files = (await readdir(INSIGHTS_SRC))
    .filter(f => f.endsWith('.md') && !f.startsWith('README'));
  const arts = [];
  for (const f of files) {
    const src = await readFile(join(INSIGHTS_SRC, f), 'utf8');
    const { meta, body } = parseFrontmatter(src);
    if (!meta.title || !meta.date) {
      console.warn(`[skip] ${f} — 프론트매터에 title/date 누락`);
      continue;
    }
    arts.push({
      slug: meta.slug || f.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, ''),
      title: meta.title,
      date: meta.date.replace(/-/g, '.'),
      dateISO: meta.date,
      tag: meta.tag || 'INSIGHT',
      excerpt: meta.excerpt || '',
      author: meta.author || '제이티 세무법인',
      body,
      html: mdToHtml(body),
      filename: f,
    });
  }
  arts.sort((a, b) => b.dateISO.localeCompare(a.dateISO));
  return arts;
}

// ────────────── Data.jsx 의 insights 배열 교체 ──────────────
async function updateDataJsx(arts) {
  const src = await readFile(DATA_PATH, 'utf8');
  const jsonItems = arts.map(a =>
    `    { slug: ${JSON.stringify(a.slug)}, tag: ${JSON.stringify(a.tag)}, date: ${JSON.stringify(a.date)}, title: ${JSON.stringify(a.title)}, excerpt: ${JSON.stringify(a.excerpt)} }`
  ).join(',\n');
  const block = `  // 인사이트 칼럼 (자동 생성 — build-insights.mjs로 재생성됨. 직접 수정하지 마세요)\n  insights: [\n${jsonItems}\n  ],`;
  const re = /\/\/ 인사이트 칼럼[\s\S]*?insights:\s*\[[\s\S]*?\],/;
  if (!re.test(src)) {
    console.error('[error] Data.jsx 의 insights 블록을 찾지 못함');
    return;
  }
  await writeFile(DATA_PATH, src.replace(re, block));
  console.log(`✓ Data.jsx insights ${arts.length}건 갱신`);
}

// ────────────── 단독 글 HTML 렌더링 (/insights/<slug>.html) ──────────────
function renderArticlePage(a) {
  const shareUrl = `${SITE}/insights/${a.slug}.html`;
  const esc = (s) => String(s).replace(/"/g, '&quot;');
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>${a.title} | 제이티 세무법인</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${esc(a.excerpt)}">
  <link rel="canonical" href="${shareUrl}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${esc(a.title)}">
  <meta property="og:description" content="${esc(a.excerpt)}">
  <meta property="og:url" content="${shareUrl}">
  <meta property="og:image" content="${SITE}/project/assets/og-image.png">
  <meta property="og:locale" content="ko_KR">
  <meta property="article:published_time" content="${a.dateISO}">
  <meta property="article:author" content="${esc(a.author)}">
  <link rel="icon" href="/project/assets/logo_symbol.png">
  <link rel="stylesheet" href="/project/src/styles.css">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": ${JSON.stringify(a.title)},
    "datePublished": ${JSON.stringify(a.dateISO)},
    "author": { "@type": "Organization", "name": ${JSON.stringify(a.author)} },
    "publisher": { "@type": "Organization", "name": "제이티 세무법인", "logo": { "@type": "ImageObject", "url": "${SITE}/project/assets/logo_symbol.png" } },
    "description": ${JSON.stringify(a.excerpt)},
    "mainEntityOfPage": ${JSON.stringify(shareUrl)}
  }
  </script>
</head>
<body style="background:#fff;color:#0B0B0F;">
  <header style="border-bottom:1px solid rgba(0,0,0,.08);padding:16px 24px;display:flex;align-items:center;gap:12px;">
    <a href="/" style="display:flex;align-items:center;gap:10px;text-decoration:none;color:#0B0B0F;font-weight:700;letter-spacing:-0.01em;">
      <img src="/project/assets/logo_symbol.png" width="28" alt=""/> 제이티 세무법인
    </a>
    <span style="margin-left:auto;font-size:13px;color:#666;">
      <a href="/#insights" style="color:inherit;">← 모든 인사이트</a>
    </span>
  </header>

  <article class="jt-legal" style="max-width:720px;margin:0 auto;padding:56px 24px;">
    <div class="jt-legal__meta">${a.tag} · ${a.date}</div>
    <h2 style="margin-bottom:24px;">${a.title}</h2>
    <p style="font-size:18px;color:#5a5a5a;margin-bottom:40px;">${a.excerpt}</p>
    ${a.html}

    <div style="margin-top:64px;padding:32px;border:1px solid rgba(0,0,0,.1);background:#FAFAF8;">
      <div style="font-family:ui-monospace,monospace;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#888;">DISCLAIMER</div>
      <p style="font-size:13px;color:#5a5a5a;margin-top:8px;line-height:1.7;">본 글은 일반적인 정보 제공을 목적으로 하는 참고 자료이며, 특정 사안에 대한 확정적 세무 자문이 아닙니다. 정확한 검토는 담당 세무사와의 상담을 통해 진행되어야 합니다.</p>
    </div>

    <div style="margin-top:48px;display:flex;gap:12px;">
      <a href="/#booking" class="jt-btn jt-btn--primary">상담 예약 →</a>
      <a href="http://pf.kakao.com/_CcxlJG/chat" class="jt-btn jt-btn--outline" target="_blank" rel="noopener">카톡 상담</a>
    </div>
  </article>

  <footer style="margin-top:80px;padding:32px 24px;border-top:1px solid rgba(0,0,0,.08);font-size:12px;color:#888;text-align:center;">
    © 2026 JT TAX CORP. — www.jttax.co.kr
  </footer>
</body>
</html>`;
}

async function writeArticlePages(arts) {
  await mkdir(ARTICLE_OUT_DIR, { recursive: true });
  for (const a of arts) {
    await writeFile(join(ARTICLE_OUT_DIR, `${a.slug}.html`), renderArticlePage(a));
  }
  console.log(`✓ 글 페이지 ${arts.length}건 생성 → /insights/`);
}

// ────────────── sitemap 갱신 ──────────────
async function updateSitemap(arts) {
  const today = new Date().toISOString().slice(0, 10);
  const staticUrls = [
    { loc: `${SITE}/`,          p: '1.0', f: 'weekly' },
    { loc: `${SITE}/#services`, p: '0.9', f: 'monthly' },
    { loc: `${SITE}/#team`,     p: '0.8', f: 'monthly' },
    { loc: `${SITE}/#about`,    p: '0.7', f: 'monthly' },
    { loc: `${SITE}/#report`,   p: '0.9', f: 'weekly' },
    { loc: `${SITE}/#insights`, p: '0.9', f: 'weekly' },
    { loc: `${SITE}/#contact`,  p: '0.7', f: 'monthly' },
    { loc: `${SITE}/#booking`,  p: '0.9', f: 'monthly' },
  ];
  const articleUrls = arts.map(a => ({
    loc: `${SITE}/insights/${a.slug}.html`, p: '0.8', f: 'monthly', lastmod: a.dateISO,
  }));
  const all = [...staticUrls, ...articleUrls];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${all.map(u =>
    `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod || today}</lastmod>\n    <changefreq>${u.f}</changefreq>\n    <priority>${u.p}</priority>\n  </url>`
  ).join('\n')}\n</urlset>\n`;
  await writeFile(SITEMAP_PATH, xml);
  console.log(`✓ sitemap.xml 갱신 (${all.length} URL)`);
}

// ────────────── main ──────────────
const arts = await loadArticles();
if (arts.length === 0) {
  console.warn('⚠ 발행할 .md 글이 없습니다. Data.jsx/sitemap 변경을 건너뜁니다.');
} else {
  await updateDataJsx(arts);
  await writeArticlePages(arts);
  await updateSitemap(arts);
  console.log(`\n✅ 빌드 완료 — 인사이트 ${arts.length}건 처리.`);
}
