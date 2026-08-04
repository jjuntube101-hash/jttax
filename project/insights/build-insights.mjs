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
import { writeSitemap } from '../_shared/build-sitemap.mjs';
import { GA_HEAD_SNIPPET } from '../_shared/ga-snippet.mjs';

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
  // CRLF/CR 방어: 정규식과 값 파싱 모두 \r 를 허용/제거한다.
  // (loadArticles 에서 src 를 이미 LF 로 정규화하지만, 단독 호출·미래 회귀 대비 이중 방어)
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return { meta: {}, body: src };
  const meta = {};
  m[1].split(/\r?\n/).forEach(line => {
    const i = line.indexOf(':');
    if (i < 0) return;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim().replace(/\r$/, '');
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
  const skipped = [];          // ① title/date 파싱 실패 파일
  const seenSlugs = new Map(); // ② slug → 파일명 (중복 감지)
  for (const f of files) {
    // 줄바꿈 정규화(CRLF/CR → LF): Windows(core.autocrlf=true) 워킹트리에서
    // 체크아웃된 .md 는 CRLF 라 프론트매터·본문 파싱이 어긋난다. 여기서 한 번에 흡수해
    // 플랫폼과 무관하게 동일한 HTML(byte-identical) 을 생성한다.
    const raw = await readFile(join(INSIGHTS_SRC, f), 'utf8');
    const src = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const { meta, body } = parseFrontmatter(src);
    if (!meta.title || !meta.date) {
      console.warn(`[skip] ${f} — 프론트매터에 title/date 누락`);
      skipped.push(f);
      continue;
    }
    const slug = meta.slug || f.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '');
    // ② slug 충돌 방지: 같은 slug 두 글은 /insights/<slug>.html 을 서로 덮어써
    //    한 글이 조용히 유실된다. 충돌 시 빌드를 실패시킨다.
    if (seenSlugs.has(slug)) {
      throw new Error(`slug 충돌: '${slug}' 가 '${seenSlugs.get(slug)}' 와 '${f}' 에서 중복됩니다. 한 글의 /insights/${slug}.html 이 덮어써지니 파일명 또는 slug 프론트매터를 구분하세요.`);
    }
    seenSlugs.set(slug, f);
    arts.push({
      slug,
      title: meta.title,
      date: meta.date.replace(/-/g, '.'),
      dateISO: meta.date,
      tag: meta.tag || 'INSIGHT',
      excerpt: meta.excerpt || '',
      author: meta.author || '제이티 세무회계',
      body,
      html: mdToHtml(body),
      filename: f,
    });
  }
  // ① 부분 skip 침묵 실패 방지: insights/ 의 .md 는 모두 발행 가능해야 한다.
  //    하나라도 파싱 실패(그 글이 조용히 누락)하면 나머지만 성공하지 않고 빌드를 실패시킨다.
  if (skipped.length > 0) {
    throw new Error(`프론트매터(title/date) 파싱 실패 ${skipped.length}건 — 해당 글이 발행에서 누락됩니다: ${skipped.join(', ')}`);
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
  // ④ 배열 종료 앵커를 '\n  ],'(개행+2칸)로 고정한다. 종전 '[\s\S]*?\],' 는 title/excerpt
  //    안의 ']' 바로 뒤 ','(예: "취득세[신설], …")에서 비탐욕 매칭이 조기 종료해 Data.jsx 를
  //    손상시켰다. 항목 값은 한 줄(내부 개행 없음)이라 '\n  ],' 는 배열 종료에만 매칭된다.
  const re = /\/\/ 인사이트 칼럼[\s\S]*?insights:\s*\[[\s\S]*?\n {2}\],/;
  if (!re.test(src)) {
    // 침묵 실패 금지: 여기서 return 하면 Data.jsx 를 못 바꿨는데도 빌드가 "성공"으로 끝난다.
    // throw 로 올려 main 의 try/catch 가 exit 1 로 실패 처리하게 한다.
    throw new Error('Data.jsx 의 insights 블록(// 인사이트 칼럼 ... insights: [ ... ],)을 찾지 못했습니다. Data.jsx 구조가 변경됐는지 확인하세요.');
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
  <title>${a.title} | 제이티 세무회계</title>
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
${GA_HEAD_SNIPPET}
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": ${JSON.stringify(a.title)},
    "datePublished": ${JSON.stringify(a.dateISO)},
    "author": { "@type": "Organization", "name": ${JSON.stringify(a.author)} },
    "publisher": { "@type": "Organization", "name": "제이티 세무회계", "logo": { "@type": "ImageObject", "url": "${SITE}/project/assets/logo_symbol.png" } },
    "description": ${JSON.stringify(a.excerpt)},
    "mainEntityOfPage": ${JSON.stringify(shareUrl)}
  }
  </script>
</head>
<body style="background:#fff;color:#0B0B0F;">
  <header style="border-bottom:1px solid rgba(0,0,0,.08);padding:16px 24px;display:flex;align-items:center;gap:12px;">
    <a href="/" style="display:flex;align-items:center;gap:10px;text-decoration:none;color:#0B0B0F;font-weight:700;letter-spacing:-0.01em;">
      <img src="/project/assets/logo_symbol.png" width="28" alt=""/> 제이티 세무회계
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
      <a href="/#booking" class="jt-btn jt-btn--primary" onclick="jtTrackCta('booking','insight')">상담 예약 →</a>
      <a href="http://pf.kakao.com/_CcxlJG/chat" class="jt-btn jt-btn--outline" target="_blank" rel="noopener" onclick="jtTrackCta('kakao','insight')">카톡 상담</a>
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

// ────────────── sitemap 갱신 (공유 모듈 — 인사이트+계산기 자동 열거, 해시 URL 제외) ──────────────
async function updateSitemap() {
  const n = await writeSitemap(REPO_ROOT, SITE);
  console.log(`✓ sitemap.xml 갱신 (${n} URL)`);
}

// ────────────── main ──────────────
try {
  const arts = await loadArticles();
  if (arts.length === 0) {
    // 침묵 실패 방지 가드: insights/ 에는 항상 발행 글이 존재해야 한다.
    // 0건이면 프론트매터 파싱 실패(줄바꿈 오염·title/date 누락)가 거의 확실하므로
    // 종료코드 1 로 빌드를 실패시켜 CI/로컬에서 즉시 드러나게 한다.
    console.error('✗ 발행 가능한 인사이트가 0건입니다 — .md 프론트매터 파싱 실패(줄바꿈 또는 title/date 누락) 가능성이 높습니다. 침묵 실패를 막기 위해 빌드를 실패 처리합니다.');
    process.exit(1);
  }
  await updateDataJsx(arts);
  await writeArticlePages(arts);
  await updateSitemap(arts);
  console.log(`\n✅ 빌드 완료 — 인사이트 ${arts.length}건 처리.`);
} catch (e) {
  // 어떤 단계(파싱·Data.jsx 치환·글 렌더·sitemap)든 예외가 나면 침묵하지 않고
  // 명확히 실패(exit 1) 처리한다. 산출물이 일부만 갱신된 채 "성공"으로 끝나는 것을 차단.
  console.error(`✗ 빌드 실패: ${e && e.message ? e.message : e}`);
  process.exit(1);
}
