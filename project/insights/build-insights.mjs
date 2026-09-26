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
import { insightSlug } from '../_shared/insight-slug.mjs';
import { GA_HEAD_SNIPPET } from '../_shared/ga-snippet.mjs';
import { footerHtml, stylesHref, ogImageHref } from '../_shared/site-meta.mjs';

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

/* ⚠️ slug 는 파일 «경로»가 된다. `../index` 같은 값이면 출력 디렉터리를 탈출해
   루트 index.html(홈 SPA)까지 덮어쓴다 (260805 Codex R12 P1). 문자 집합을 강제한다. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function assertSlug(slug, where) {
  if (!SLUG_RE.test(String(slug || ''))) {
    throw new Error(`[${where}] slug 형식 오류: ${JSON.stringify(slug)} — 소문자·숫자·하이픈만 허용합니다(경로 구분자 금지).`);
  }
  return slug;
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
  /* ⚠️ 표 치환 «전에» fenced code block 을 빼 둔다.
     안 그러면 코드블록 안의 표 모양 텍스트까지 <table> 로 바뀐다 (260805 Codex P2).
     센티널은 사용자 私用영역(U+E000)이라 본문과 충돌하지 않는다. */
  const _fences = [];
  html = html.replace(/```[\s\S]*?```/g, (m) => {
    _fences.push(m);
    return 'FENCE' + (_fences.length - 1) + '';
  });
  // ── GFM 표 (260805 추가) ────────────────────────────────────────────────
  // 종전 렌더러엔 표 지원이 없어, 세제개편안처럼 「연도별 비교」가 핵심인 글의
  // 표가 «파이프 문자가 그대로 보이는 문단»으로 깨져 나왔다.
  //   | a | b |
  //   |---|---|
  //   | 1 | 2 |
  // 셀 안의 <strong>·<a> 는 위 인라인 치환이 이미 끝난 상태로 들어온다.
  const splitRow = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
  html = html.replace(
    /(^|\n)(\|.+\|[ \t]*\n\|[ \t:|-]+\|[ \t]*\n(?:\|.+\|[ \t]*\n?)+)/g,
    (_, pre, block) => {
      const lines = block.trim().split('\n');
      const head = splitRow(lines[0]);
      const rows = lines.slice(2).map(splitRow);
      const th = head.map(c => `<th>${c}</th>`).join('');
      const tb = rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('\n      ');
      // 좁은 화면에서 가로 스크롤 — 표가 본문 폭을 밀어내지 않게(모바일 필수)
      return `${pre}<div class="jt-ins-tblwrap">\n  <table class="jt-ins-tbl">\n    <thead><tr>${th}</tr></thead>\n    <tbody>\n      ${tb}\n    </tbody>\n  </table>\n</div>\n`;
    }
  );
  html = html.replace(/FENCE(\d+)/g, (_, i) => _fences[Number(i)]);
  html = html.split(/\n\n+/).map(p => {
    const t = p.trim();
    if (!t) return '';
    if (/^<(h[1-6]|ul|ol|blockquote|pre|div|table)/.test(t)) return t;
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
    // slug 계산은 _shared/insight-slug.mjs 하나로 — sitemap 생성기도 같은 함수를 쓴다
    const slug = assertSlug(insightSlug(f, meta.slug), f);
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
      // 갱신일: 프론트매터 updated 가 있으면 그 날, 없으면 발행일 — 글을 고칠 때 updated 를
      // 올려야 검색·AI 가 «최신화됨»을 기계적으로 안다 (260830 전수감사 Q3)
      // 형식·순서가 틀리면 조용히 넘기지 않고 빌드를 멈춘다 (Codex R1-F2 fail-loud)
      updatedISO: (() => {
        // 키 자체가 없을 때만 발행일 폴백 — «updated:»만 적힌 빈 값은 오기재이므로 아래 검증에서 멈춘다 (Codex R2-F1)
        if (meta.updated === undefined) return meta.date;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.updated)) throw new Error(`[updated] ${meta.title}: 형식은 YYYY-MM-DD — "${meta.updated}"`);
        if (meta.updated < meta.date) throw new Error(`[updated] ${meta.title}: 갱신일(${meta.updated})이 발행일(${meta.date})보다 이릅니다`);
        return meta.updated;
      })(),
      tag: meta.tag || 'INSIGHT',
      excerpt: meta.excerpt || '',
      author: meta.author || '제이티 세무법인',
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
  //    또한 주석 «앞의 들여쓰기»까지 함께 먹어야 한다. 종전엔 '//' 부터만 잡고 2칸을 붙인
  //    block 으로 갈아끼워, 빌드를 돌릴 때마다 공백이 2칸씩 늘어났다(260805 발견).
  const re = /[ \t]*\/\/ 인사이트 칼럼[\s\S]*?insights:\s*\[[\s\S]*?\n {2}\],/;
  if (!re.test(src)) {
    // 침묵 실패 금지: 여기서 return 하면 Data.jsx 를 못 바꿨는데도 빌드가 "성공"으로 끝난다.
    // throw 로 올려 main 의 try/catch 가 exit 1 로 실패 처리하게 한다.
    throw new Error('Data.jsx 의 insights 블록(// 인사이트 칼럼 ... insights: [ ... ],)을 찾지 못했습니다. Data.jsx 구조가 변경됐는지 확인하세요.');
  }
  await writeFile(DATA_PATH, src.replace(re, block));
  console.log(`✓ Data.jsx insights ${arts.length}건 갱신`);
}

// ────────────── 단독 글 HTML 렌더링 (/insights/<slug>.html) ──────────────
/* 취득세 업무분야 면(/acquisition-tax/)과 1차 재검토 접수로 «들어오는 링크»를 다는 글.
   허브가 sitemap 에만 있고 들어오는 링크가 없으면 검색 계획이 아니다(Astra R1-F7).
   260921 에는 취득세 글 2편으로 한정했다(모든 글 하단에 같은 배너를 붙이면 문맥 없는 장식이라).
   260926: 취득세 글 묶음 1차 25편이 발행돼 «취득세 글»이 27편이 됐고 전부 같은 문맥이므로,
   목록이 아니라 «slug 접두 acquisition-tax-» 규칙으로 바꿨다(실행계획 v7 1~2주차 「기존 취득세
   노출 글에 재검토 접수 연결」). 취득세가 아닌 글에는 여전히 붙지 않는다. */
const isAcqHubArticle = (slug) => /^acquisition-tax(-|$)/.test(String(slug || ''));
const ACQ_HUB_BLOCK = `
    <div style="margin-top:48px;padding:22px 24px;border:1px solid rgba(0,0,0,.1);background:#FAFAF8;border-radius:10px;line-height:1.7;">
      <div style="font-family:ui-monospace,monospace;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#888;">취득세</div>
      <p style="margin:8px 0 12px;font-size:15px;color:#333;">취득세는 «어떤 이유로, 무엇을, 누구 명의로» 취득했는지에 따라 확인할 것이 달라집니다. 내 경우가 어디에 해당하는지부터 살펴보세요.</p>
      <a href="/acquisition-tax/" style="font-size:15px;color:#1a1a1a;border-bottom:1px solid rgba(0,0,0,.25);text-decoration:none;">취득세, 내 상황부터 확인하기 →</a>
    </div>
    <div style="margin-top:16px;padding:22px 24px;border:1px solid rgba(0,0,0,.1);background:#FAFAF8;border-radius:10px;line-height:1.7;">
      <div style="font-family:ui-monospace,monospace;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#888;">이미 취득세를 내셨다면</div>
      <p style="margin:8px 0 10px;font-size:15px;color:#333;">신고한 뒤에 다시 확인해 볼 만한 자리가 네 곳 있습니다. 해당하는지는 사안마다 결론이 다르고, 자료를 보면 달라질 수 있습니다.</p>
      <ul style="margin:0 0 12px;padding-left:18px;font-size:15px;color:#333;">
        <li><a href="/insights/acquisition-tax-household-overpaid.html" style="color:#1a1a1a;">세대를 어떻게 보았는지</a></li>
        <li><a href="/insights/acquisition-tax-acquisition-date-overpaid.html" style="color:#1a1a1a;">취득일을 언제로 잡았는지</a></li>
        <li><a href="/insights/acquisition-tax-temporary-two-houses-overpaid.html" style="color:#1a1a1a;">일시적 2주택에 해당했는지</a></li>
        <li><a href="/insights/acquisition-tax-reduction-missed-claim.html" style="color:#1a1a1a;">감면 신청을 빠뜨리지 않았는지</a></li>
      </ul>
      <p style="margin:0 0 12px;font-size:14px;color:#555;">기한이 먼저입니다 — <a href="/insights/acquisition-tax-correction-claim-deadline.html" style="color:#1a1a1a;">몇 년 전에 낸 취득세도 경정청구를 할 수 있나요</a></p>
      <a href="/#/report/acq-check" style="font-size:15px;color:#1a1a1a;border-bottom:1px solid rgba(0,0,0,.25);text-decoration:none;">이미 낸 취득세 1차 재검토 접수 — 서류 없이 →</a>
      <p style="margin:10px 0 0;font-size:13px;color:#777;">세액이나 차액을 계산해 보여 드리는 화면이 아니라, 써 주신 내용만으로 다시 볼 여지가 있는지 확인하는 접수입니다. 서류는 자문을 맡기시기로 한 뒤에 필요한 것만 받습니다.</p>
    </div>`;

function renderArticlePage(a) {
  const shareUrl = `${SITE}/insights/${a.slug}.html`;
  const esc = (s) => String(s).replace(/"/g, '&quot;');
  const hubBlock = isAcqHubArticle(a.slug) ? ACQ_HUB_BLOCK : '';
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
  <meta property="og:image" content="${ogImageHref()}">
  <meta property="og:locale" content="ko_KR">
  <meta property="article:published_time" content="${a.dateISO}">
  <meta property="article:modified_time" content="${a.updatedISO}">
  <meta property="article:author" content="${esc(a.author)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(a.title)}">
  <meta name="twitter:description" content="${esc(a.excerpt)}">
  <meta name="twitter:image" content="${ogImageHref()}">
  <link rel="icon" href="/project/assets/logo_symbol.png">
  <link rel="stylesheet" href="${stylesHref()}">
  <style>
    /* 본문 표 (260805 — mdToHtml GFM 표 지원과 한 쌍. 한쪽만 있으면 깨진다) */
    .jt-ins-tblwrap{overflow-x:auto;margin:22px 0;-webkit-overflow-scrolling:touch;}
    .jt-ins-tbl{width:100%;border-collapse:collapse;font-size:14.5px;min-width:460px;}
    .jt-ins-tbl th,.jt-ins-tbl td{padding:10px 12px;border-bottom:1px solid rgba(0,0,0,.08);text-align:left;vertical-align:top;line-height:1.6;}
    .jt-ins-tbl thead th{background:#F5F3EE;border-bottom:2px solid rgba(0,0,0,.14);font-size:13.5px;white-space:nowrap;}
    .jt-ins-tbl td+td,.jt-ins-tbl th+th{text-align:right;}
    .jt-ins-tbl tbody tr:nth-child(even){background:#FBFAF8;}
    @media (max-width:600px){ .jt-ins-tbl{font-size:13.5px;} }
  </style>
${GA_HEAD_SNIPPET}
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": ${JSON.stringify(a.title)},
    "image": ${JSON.stringify(ogImageHref())},
    "datePublished": ${JSON.stringify(a.dateISO)},
    "dateModified": ${JSON.stringify(a.updatedISO)},
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
      <a href="/insights/" style="color:inherit;">← 모든 인사이트</a>
    </span>
  </header>

  <article class="jt-legal" style="max-width:720px;margin:0 auto;padding:56px 24px;">
    <div class="jt-legal__meta">${a.tag} · ${a.date}</div>
    <!-- 글 제목은 h1 — 페이지에 h1 이 없으면 검색·AI 크롤러가 대표 제목을 못 잡는다
         (260830 SEO 파일럿 확정 #3). font-size 1.5em 은 종전 h2 기본 크기 유지용 -->
    <h1 style="margin-bottom:24px;font-size:1.5em;">${a.title}</h1>
    <p style="font-size:18px;color:#5a5a5a;margin-bottom:40px;">${a.excerpt}</p>
    ${a.html}
${hubBlock}

    <div style="margin-top:64px;padding:32px;border:1px solid rgba(0,0,0,.1);background:#FAFAF8;">
      <div style="font-family:ui-monospace,monospace;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#888;">DISCLAIMER</div>
      <p style="font-size:13px;color:#5a5a5a;margin-top:8px;line-height:1.7;">본 글은 일반적인 정보 제공을 목적으로 하는 참고 자료이며, 특정 사안에 대한 확정적 세무 자문이 아닙니다. 정확한 검토는 담당 세무사와의 상담을 통해 진행되어야 합니다.</p>
    </div>

    <div style="margin-top:48px;display:flex;gap:12px;">
      <a href="/#/booking" class="jt-btn jt-btn--primary" onclick="jtTrackCta('booking','insight')">상담 예약 →</a>
      <a href="https://pf.kakao.com/_CcxlJG" class="jt-btn jt-btn--outline" target="_blank" rel="noopener" onclick="jtTrackCta('kakao','insight')">카톡 상담</a>
    </div>
  </article>

${footerHtml()}
</body>
</html>`;
}

// ────────── 인사이트 정적 허브 (/insights/index.html) ──────────
/* 종전엔 인사이트 목록이 SPA 해시(#/insights)에만 있었다. 해시 URL 은 sitemap 에서
   의도적으로 제외하므로 «글 31편은 색인되는데 그 글들을 모아 주는 페이지는 없는» 상태였다
   (SEO 전수감사 S1 잔여분, 260921 Astra R1-F13).
   ⛔ 글 각각의 h1 은 이미 있으므로 건드리지 않는다 — 여기서 만드는 것은 «허브»뿐이다. */
function renderInsightsIndex(arts) {
  const url = `${SITE}/insights/`;
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const DESC = '세금 실무에서 자주 부딪히는 주제를 사실과 근거 중심으로 정리한 글 모음입니다. 양도·상속·증여·취득세·보유세·기장과 세무조사 대응까지.';
  const listLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `인사이트 — 제이티 세무법인`,
    image: ogImageHref(),
    url,
    description: DESC,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: arts.map((a, i) => ({
        '@type': 'ListItem', position: i + 1, name: a.title, url: `${SITE}/insights/${a.slug}.html`,
      })),
    },
  };
  const crumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '홈', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: '인사이트', item: url },
    ],
  };
  const cards = arts.map((a) => `      <a class="jt-ih-card" href="/insights/${a.slug}.html">
        <span class="jt-ih-meta">${esc(a.tag)} · ${esc(a.date)}</span>
        <h2>${esc(a.title)}</h2>
        <p>${esc(a.excerpt)}</p>
      </a>`).join('\n');
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>인사이트 — 세금 실무 해설 | 제이티 세무법인</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${esc(DESC)}">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="인사이트 — 세금 실무 해설 | 제이티 세무법인">
  <meta property="og:description" content="${esc(DESC)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${ogImageHref()}">
  <meta property="og:locale" content="ko_KR">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="인사이트 — 세금 실무 해설 | 제이티 세무법인">
  <meta name="twitter:description" content="${esc(DESC)}">
  <meta name="twitter:image" content="${ogImageHref()}">
  <link rel="icon" href="/project/assets/logo_symbol.png">
  <link rel="stylesheet" href="${stylesHref()}">
${GA_HEAD_SNIPPET}
  <script type="application/ld+json">${JSON.stringify(listLd)}</script>
  <script type="application/ld+json">${JSON.stringify(crumbLd)}</script>
  <style>
    .jt-ih-wrap{max-width:860px;margin:0 auto;padding:48px 24px 80px;color:#0B0B0F;}
    .jt-ih-wrap h1{font-size:32px;letter-spacing:-0.02em;margin:0 0 12px;}
    .jt-ih-lede{font-size:18px;color:#5a5a5a;line-height:1.65;margin:0 0 36px;}
    .jt-ih-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px;}
    .jt-ih-card{display:block;border:1px solid rgba(0,0,0,.1);border-radius:12px;padding:20px;text-decoration:none;color:#0B0B0F;background:#fff;}
    .jt-ih-card:hover{box-shadow:0 6px 24px rgba(0,0,0,.08);}
    .jt-ih-meta{font-family:ui-monospace,monospace;font-size:10px;letter-spacing:.14em;color:#999;}
    .jt-ih-card h2{font-size:17px;margin:8px 0;border:0;padding:0;line-height:1.45;}
    .jt-ih-card p{font-size:13.5px;color:#666;line-height:1.55;margin:0;}
    .jt-ih-links{margin:40px 0 0;display:flex;gap:8px;flex-wrap:wrap;}
    .jt-ih-links a{font-size:13px;border:1px solid rgba(0,0,0,.15);border-radius:999px;padding:7px 13px;text-decoration:none;color:#333;background:#fff;}
  </style>
</head>
<body style="background:#fff;">
  <header style="border-bottom:1px solid rgba(0,0,0,.08);padding:16px 24px;display:flex;align-items:center;gap:12px;">
    <a href="/" style="display:flex;align-items:center;gap:10px;text-decoration:none;color:#0B0B0F;font-weight:700;letter-spacing:-0.01em;">
      <img src="/project/assets/logo_symbol.png" width="28" alt="제이티 세무법인"/> 제이티 세무법인
    </a>
    <span style="margin-left:auto;font-size:13px;"><a href="/" style="color:#666;text-decoration:none;">홈 →</a></span>
  </header>
  <main class="jt-ih-wrap">
    <nav style="font-size:13px;color:#888;margin-bottom:20px;"><a href="/" style="color:#888;text-decoration:none;">홈</a> › 인사이트</nav>
    <h1>인사이트</h1>
    <p class="jt-ih-lede">${esc(DESC)}</p>
    <div class="jt-ih-grid">
${cards}
    </div>
    <div class="jt-ih-links">
      <a href="/acquisition-tax/">취득세, 내 상황부터 확인하기</a>
      <a href="/calculators/">세금 계산기</a>
      <a href="/services/">업무분야</a>
      <a href="/consult.html">상담·오시는 길</a>
    </div>
    <div style="margin-top:32px;display:flex;gap:12px;flex-wrap:wrap;">
      <a href="/#/booking" class="jt-btn jt-btn--primary" onclick="jtTrackCta('booking','insight')">상담 예약 →</a>
      <a href="https://pf.kakao.com/_CcxlJG" class="jt-btn jt-btn--outline" target="_blank" rel="noopener" onclick="jtTrackCta('kakao','insight')">카톡 상담</a>
    </div>
  </main>
${footerHtml()}
</body>
</html>`;
}

async function writeArticlePages(arts) {
  await mkdir(ARTICLE_OUT_DIR, { recursive: true });
  for (const a of arts) {
    await writeFile(join(ARTICLE_OUT_DIR, `${a.slug}.html`), renderArticlePage(a));
  }
  await writeFile(join(ARTICLE_OUT_DIR, 'index.html'), renderInsightsIndex(arts));
  console.log(`✓ 글 페이지 ${arts.length}건 + 허브 1장 생성 → /insights/`);
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
  /* ACQ_HUB_BLOCK 이 가리키는 글이 실제로 있는가 — 원고가 빠지거나 slug 가 바뀌면 빌드를 멈춘다(죽은 링크 방지) */
  {
    const have = new Set(arts.map((a) => a.slug));
    const linked = [...ACQ_HUB_BLOCK.matchAll(/href="\/insights\/([a-z0-9-]+)\.html"/g)].map((m) => m[1]);
    const dead = linked.filter((s) => !have.has(s));
    if (dead.length) {
      console.error(`✗ ACQ_HUB_BLOCK 이 없는 글을 가리킵니다: ${dead.join(', ')}`);
      process.exit(1);
    }
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
