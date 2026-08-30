// project/commercial/build-commercial.mjs
//
// 상업 정적 랜딩 생성 — Node.js 18+
//
// 사용법:  node project/commercial/build-commercial.mjs
//
// commercial.data.mjs(수렴된 카피 정본)를 읽어:
//   /services/index.html + 5장  — 업무분야 (Service + BreadcrumbList, 허브는 CollectionPage/ItemList)
//   /experts/index.html  + 3장  — 전문가 (Person + BreadcrumbList)
//   /about/index.html           — 회사소개 (AccountingService 보강)
//   /consult.html               — 상담+오시는 길 (FAQPage + BreadcrumbList)
// 그리고 공유 sitemap 을 갱신한다 (build-sitemap.mjs — 신설 디렉터리 열거 포함).
//
// ⛔ 광고규제(세무사법 §12조의7·시행령 §33): 문안은 코덱스 수렴본(인물브랜딩카피_260830.md)
//    외의 표현을 임의로 추가하지 않는다. 실적 수치·우월 표현·결과 단정 금지.

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SERVICES, EXPERTS, TEAM_MODEL, ABOUT, CONSULT } from './commercial.data.mjs';
import { CALCULATORS } from '../calculators/calculators.data.mjs';
import { writeSitemap } from '../_shared/build-sitemap.mjs';
import { GA_HEAD_SNIPPET } from '../_shared/ga-snippet.mjs';
import { footerHtml, stylesHref, ogImageHref } from '../_shared/site-meta.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));   // project/commercial
const REPO_ROOT = join(__dirname, '..', '..');
const SITE = 'https://www.jttax.co.kr';
const FIRM = '제이티 세무법인';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function assertSlug(slug, where) {
  if (!SLUG_RE.test(String(slug || ''))) {
    throw new Error(`[${where}] slug 형식 오류: ${JSON.stringify(slug)} — 소문자·숫자·하이픈만 허용합니다.`);
  }
  return slug;
}

/* 참조 무결성 — 오타가 조용히 빠지지 않고 빌드를 멈춘다 (fail-loud, 칩 패턴과 동일) */
function expertBySlug(slug, where) {
  const e = EXPERTS.find(x => x.slug === slug);
  if (!e) throw new Error(`[${where}] 알 수 없는 전문가 슬러그 "${slug}"`);
  return e;
}
function calcBySlug(slug, where) {
  const c = CALCULATORS.find(x => x.slug === slug);
  if (!c) throw new Error(`[${where}] 알 수 없는 계산기 슬러그 "${slug}"`);
  return c;
}
function serviceBySlug(slug, where) {
  const s = SERVICES.find(x => x.slug === slug);
  if (!s) throw new Error(`[${where}] 알 수 없는 업무분야 슬러그 "${slug}"`);
  return s;
}

/* ── 공통 셸 ───────────────────────────────────────────────────── */
const STYLE = `  <style>
    .jt-cc-wrap{max-width:760px;margin:0 auto;padding:40px 24px 80px;color:#0B0B0F;}
    .jt-cc-crumb{font-size:13px;color:#888;margin-bottom:20px;}
    .jt-cc-crumb a{color:#888;text-decoration:none;}
    .jt-cc-wrap h1{font-size:30px;letter-spacing:-0.02em;margin:0 0 12px;}
    .jt-cc-lede{font-size:18px;color:#5a5a5a;line-height:1.65;margin:0 0 28px;}
    .jt-cc-cta{display:flex;gap:12px;flex-wrap:wrap;margin:0 0 8px;}
    .jt-cc-sec{margin:40px 0;}
    .jt-cc-sec h2{font-size:21px;letter-spacing:-0.01em;margin:0 0 16px;padding-bottom:8px;border-bottom:1px solid rgba(0,0,0,.08);}
    .jt-cc-wrap ul{padding-left:20px;line-height:1.85;color:#333;}
    .jt-cc-grid{display:grid;gap:14px;}
    .jt-cc-card{border:1px solid rgba(0,0,0,.1);border-radius:10px;padding:16px 18px;background:#FAFAF8;}
    .jt-cc-card h3{margin:0 0 6px;font-size:16px;}
    .jt-cc-card p{margin:0;font-size:14px;color:#555;line-height:1.6;}
    .jt-cc-links{list-style:none;padding:0;}
    .jt-cc-links a{color:#1a1a1a;text-decoration:none;border-bottom:1px solid rgba(0,0,0,.15);}
    .jt-cc-chips{display:flex;gap:8px;flex-wrap:wrap;}
    .jt-cc-chip{font-size:13px;border:1px solid rgba(0,0,0,.15);border-radius:999px;padding:7px 13px;text-decoration:none;color:#333;background:#fff;}
    .jt-cc-faq{padding:16px 0;border-bottom:1px solid rgba(0,0,0,.06);}
    .jt-cc-faq h3{margin:0 0 8px;font-size:16px;}
    .jt-cc-faq p{margin:0;font-size:15px;color:#444;line-height:1.7;}
    .jt-cc-disc{margin-top:48px;padding:24px;border:1px solid rgba(0,0,0,.1);background:#FAFAF8;border-radius:10px;}
    .jt-cc-disc .l{font-family:ui-monospace,monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#999;}
    .jt-cc-disc p{font-size:13px;color:#5a5a5a;margin:8px 0 0;line-height:1.7;}
    .jt-cm-steps{counter-reset:s;list-style:none;padding:0;}
    .jt-cm-steps li{counter-increment:s;position:relative;padding:8px 0 8px 40px;line-height:1.6;}
    .jt-cm-steps li::before{content:counter(s);position:absolute;left:0;top:10px;width:26px;height:26px;border-radius:50%;background:#0B0B0F;color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;}
    .jt-cm-steps b{display:block;}
    .jt-cm-lead{border:1px solid rgba(0,0,0,.1);border-radius:12px;padding:20px 22px;background:#FAFAF8;display:flex;flex-direction:column;gap:6px;}
    .jt-cm-lead .r{font-family:ui-monospace,monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#999;}
    .jt-cm-lead .n{font-size:18px;font-weight:800;}
    .jt-cm-lead p{margin:0;font-size:14px;color:#555;line-height:1.6;}
    .jt-cm-close{margin:36px 0 0;padding:22px 24px;border-left:3px solid #0B0B0F;background:#FAFAF8;font-size:16px;line-height:1.7;font-style:italic;color:#333;}
  </style>`;

function headHtml({ title, desc, keywords, url, ldBlocks }) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>${esc(title)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${esc(desc)}">
  <meta name="keywords" content="${esc(keywords)}">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${ogImageHref()}">
  <meta property="og:locale" content="ko_KR">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image" content="${ogImageHref()}">
  <link rel="icon" href="/project/assets/logo_symbol.png">
  <link rel="stylesheet" href="${stylesHref()}">
${GA_HEAD_SNIPPET}
${ldBlocks.map(b => `  <script type="application/ld+json">${JSON.stringify(b)}</script>`).join('\n')}
${STYLE}
</head>
<body style="background:#fff;">
  <header style="border-bottom:1px solid rgba(0,0,0,.08);padding:16px 24px;display:flex;align-items:center;gap:12px;">
    <a href="/" style="display:flex;align-items:center;gap:10px;text-decoration:none;color:#0B0B0F;font-weight:700;letter-spacing:-0.01em;">
      <img src="/project/assets/logo_symbol.png" width="28" alt="${FIRM}"/> ${FIRM}
    </a>
    <span style="margin-left:auto;font-size:13px;"><a href="/" style="color:#666;text-decoration:none;">홈 →</a></span>
  </header>
`;
}

function crumbLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it[0], item: it[1] })),
  };
}

const CTA_BOTTOM = `    <div class="jt-cc-cta" style="margin-top:24px;">
      <a href="/#/booking" class="jt-btn jt-btn--primary" onclick="jtTrackCta('booking','commercial')">상담 예약 →</a>
      <a href="https://pf.kakao.com/_CcxlJG/chat" class="jt-btn jt-btn--outline" target="_blank" rel="noopener" onclick="jtTrackCta('kakao','commercial')">카톡 상담</a>
      <a href="tel:02-554-6405" class="jt-btn jt-btn--outline" onclick="jtTrackCta('call','commercial')">02-554-6405</a>
    </div>`;

const DISCLAIMER = `    <div class="jt-cc-disc">
      <div class="l">안내</div>
      <p>본 페이지는 업무 소개를 위한 일반 정보이며, 특정 사안에 대한 확정적 세무 자문이 아닙니다. 세법은 개별 사실관계에 따라 결과가 달라지므로, 정확한 판단은 상담을 통해 진행하시기 바랍니다.</p>
    </div>`;

function leadCard(e, note) {
  return `    <section class="jt-cc-sec">
      <h2>담당 대표세무사</h2>
      <div class="jt-cm-lead">
        <span class="r">Managing Partner</span>
        <span class="n">${esc(e.name)} 대표세무사</span>
        <p>${esc(e.focus)}</p>
        ${note ? `<p style="color:#777;">${esc(note)}</p>` : ''}
        <p><a href="/experts/${e.slug}.html" style="color:#1a1a1a;">프로필 보기 →</a></p>
      </div>
    </section>`;
}

/* ── 업무분야 leaf ─────────────────────────────────────────────── */
function renderServicePage(s) {
  const url = `${SITE}/services/${s.slug}.html`;
  const lead = expertBySlug(s.lead, `services/${s.slug}`);
  const svcLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: s.h1,
    image: ogImageHref(),
    serviceType: s.kr,
    url,
    description: s.metaDesc,
    areaServed: 'KR',
    provider: { '@type': 'Organization', name: FIRM, url: SITE },
  };
  const calcsHtml = (s.relatedCalcs || []).map(slug => {
    const c = calcBySlug(slug, `services/${s.slug}.relatedCalcs`);
    return `        <a class="jt-cc-chip" href="/calculators/${c.slug}.html">${esc(c.h1)}</a>`;
  }).join('\n');
  const deepLink = s.appDeepLink
    ? `        <a class="jt-cc-chip" href="${s.appDeepLink.href}">${esc(s.appDeepLink.label)}</a>`
    : '';
  const insightsHtml = (s.relatedInsights || []).map(r =>
    `        <li><a href="/insights/${assertSlug(r.slug, `services/${s.slug}.relatedInsights`)}.html">${esc(r.title)} →</a></li>`
  ).join('\n');
  return headHtml({
    title: `${s.metaTitle} | ${FIRM}`, desc: s.metaDesc, keywords: s.keywords, url,
    ldBlocks: [svcLd, crumbLd([['홈', `${SITE}/`], ['업무분야', `${SITE}/services/`], [s.kr, url]])],
  }) + `
  <main class="jt-cc-wrap">
    <nav class="jt-cc-crumb"><a href="/">홈</a> › <a href="/services/">업무분야</a> › ${esc(s.kr)}</nav>
    <h1>${esc(s.h1)}</h1>
    <p class="jt-cc-lede">${esc(s.lede)}</p>

    <div class="jt-cc-cta">
      <a href="/#/booking" class="jt-btn jt-btn--primary" onclick="jtTrackCta('booking','svc_top')">이 분야 상담 예약 →</a>
      <a href="https://pf.kakao.com/_CcxlJG/chat" class="jt-btn jt-btn--outline" target="_blank" rel="noopener" onclick="jtTrackCta('kakao','svc_top')">카톡 상담</a>
    </div>

    <section class="jt-cc-sec">
      <h2>이런 상황이면 맡겨주세요</h2>
      <ul>
${(s.situations || []).map(x => `      <li>${esc(x)}</li>`).join('\n')}
      </ul>
    </section>

    <section class="jt-cc-sec">
      <h2>이렇게 진행됩니다</h2>
      <ol class="jt-cm-steps">
${(s.steps || []).map(st => `        <li><b>${esc(st.t)}</b>${esc(st.d)}</li>`).join('\n')}
      </ol>
${s.handoff ? `      <p style="font-size:14px;color:#666;">${esc(s.handoff)}</p>` : ''}
    </section>

${leadCard(lead)}

${(calcsHtml || deepLink) ? `    <section class="jt-cc-sec">
      <h2>직접 계산해 보기</h2>
      <div class="jt-cc-chips">
${[calcsHtml, deepLink].filter(Boolean).join('\n')}
      </div>
    </section>` : ''}

${insightsHtml ? `    <section class="jt-cc-sec">
      <h2>관련 인사이트</h2>
      <ul class="jt-cc-links">
${insightsHtml}
      </ul>
    </section>` : ''}

${DISCLAIMER}
${CTA_BOTTOM}
  </main>

${footerHtml()}
</body>
</html>`;
}

/* ── 업무분야 허브 ─────────────────────────────────────────────── */
function renderServicesIndex() {
  const url = `${SITE}/services/`;
  const listLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `업무분야 — ${FIRM}`,
    image: ogImageHref(),
    url,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: SERVICES.map((s, i) => ({
        '@type': 'ListItem', position: i + 1, name: s.kr, url: `${SITE}/services/${s.slug}.html`,
      })),
    },
  };
  const cards = SERVICES.map(s => `      <a class="jt-cc-card" style="display:block;text-decoration:none;color:#0B0B0F;" href="/services/${s.slug}.html">
        <h3>${esc(s.kr)}</h3>
        <p>${esc(s.lede)}</p>
        <p style="margin-top:10px;font-weight:600;font-size:13px;">담당: ${esc(expertBySlug(s.lead, 'services-index').name)} 대표세무사 →</p>
      </a>`).join('\n');
  return headHtml({
    title: `업무분야 — 양도상속증여·세무조사·기장·컨설팅·경정청구 | ${FIRM}`,
    desc: '양도·상속·증여, 세무조사 대응, 기장·세금 신고, 세금 종합 컨설팅, 경정청구 — 다섯 영역을 세 대표세무사가 분야별 전담으로 진행합니다.',
    keywords: '강남 세무법인, 세무법인 업무, 상속 세무, 세무조사 대응, 기장 대행, 경정청구', url,
    ldBlocks: [listLd, crumbLd([['홈', `${SITE}/`], ['업무분야', url]])],
  }) + `
  <main class="jt-cc-wrap">
    <nav class="jt-cc-crumb"><a href="/">홈</a> › 업무분야</nav>
    <h1>다섯 개의 전문 영역. 하나의 호흡.</h1>
    <p class="jt-cc-lede">양도·상속·증여부터 세무조사 대응, 기장, 경정청구까지 — 의사결정 이전부터 사후 관리까지 세 대표세무사가 분야별 전담으로 진행합니다.</p>
    <div class="jt-cc-grid">
${cards}
    </div>
${DISCLAIMER}
${CTA_BOTTOM}
  </main>
${footerHtml()}
</body>
</html>`;
}

/* ── 전문가 leaf ───────────────────────────────────────────────── */
function renderExpertPage(e) {
  const url = `${SITE}/experts/${e.slug}.html`;
  const personLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: `${e.name} 세무사`,
    image: ogImageHref(),
    jobTitle: '대표세무사',
    url,
    description: e.metaDesc,
    worksFor: { '@type': 'Organization', name: FIRM, url: SITE },
  };
  const svcChips = (e.services || []).map(slug => {
    const s = serviceBySlug(slug, `experts/${e.slug}.services`);
    return `        <a class="jt-cc-chip" href="/services/${s.slug}.html">${esc(s.kr)}</a>`;
  }).join('\n');
  return headHtml({
    title: `${e.name} 세무사 — ${e.headline} | ${FIRM}`, desc: e.metaDesc, keywords: e.keywords, url,
    ldBlocks: [personLd, crumbLd([['홈', `${SITE}/`], ['전문가', `${SITE}/experts/`], [`${e.name} 세무사`, url]])],
  }) + `
  <main class="jt-cc-wrap">
    <nav class="jt-cc-crumb"><a href="/">홈</a> › <a href="/experts/">전문가</a> › ${esc(e.name)} 세무사</nav>
    <p style="font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#999;margin:0 0 8px;">Managing Partner · 대표세무사</p>
    <h1>${esc(e.headline)}</h1>
    <p class="jt-cc-lede">${esc(e.lede)}</p>

    <section class="jt-cc-sec">
      <h2>전문 업무 영역</h2>
      <p style="font-size:16px;line-height:1.7;color:#333;">${esc(e.focus)}</p>
      <div class="jt-cc-chips" style="margin-top:12px;">
${svcChips}
      </div>
    </section>

    <section class="jt-cc-sec">
      <h2>경력 · 활동</h2>
      <ul>
${(e.credentials || []).map(c => `      <li>${esc(c)}</li>`).join('\n')}
      </ul>
    </section>

    <div class="jt-cm-close">${esc(e.closing)}</div>

${DISCLAIMER}
${CTA_BOTTOM}
  </main>
${footerHtml()}
</body>
</html>`;
}

/* ── 전문가 허브 ───────────────────────────────────────────────── */
function renderExpertsIndex() {
  const url = `${SITE}/experts/`;
  const listLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `전문가 — ${FIRM}`,
    image: ogImageHref(),
    url,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: EXPERTS.map((e, i) => ({
        '@type': 'ListItem', position: i + 1, name: `${e.name} 세무사`, url: `${SITE}/experts/${e.slug}.html`,
      })),
    },
  };
  const views = TEAM_MODEL.views.map(v => `      <a class="jt-cc-card" style="display:block;text-decoration:none;color:#0B0B0F;" href="/experts/${assertSlug(v.slug, 'team-model')}.html">
        <p style="margin:0 0 4px;font-family:ui-monospace,monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#999;">${esc(v.view)}</p>
        <h3>${esc(v.name)} 대표세무사</h3>
        <p>${esc(v.d)}</p>
        <p style="margin-top:10px;font-weight:600;font-size:13px;">프로필 보기 →</p>
      </a>`).join('\n');
  return headHtml({
    title: `전문가 — 세 명의 대표세무사 | ${FIRM}`,
    desc: '재산의 시선, 설계의 시선, 장부의 시선. 제이티 세무법인은 대표세무사 세 명이 각자의 전문 영역에서 같은 사안을 봅니다.',
    keywords: '강남 세무사, 제이티 세무법인 세무사, 대표세무사, 김민석 세무사, 이현준 세무사, 김가환 세무사', url,
    ldBlocks: [listLd, crumbLd([['홈', `${SITE}/`], ['전문가', url]])],
  }) + `
  <main class="jt-cc-wrap">
    <nav class="jt-cc-crumb"><a href="/">홈</a> › 전문가</nav>
    <h1>${esc(TEAM_MODEL.title)}</h1>
    <p class="jt-cc-lede">${esc(TEAM_MODEL.lede)}</p>
    <div class="jt-cc-grid">
${views}
    </div>
    <section class="jt-cc-sec">
      <h2>경계에 걸치는 일은, 이어달리기로</h2>
      <ul>
${TEAM_MODEL.handoffs.map(h => `      <li>${esc(h)}</li>`).join('\n')}
      </ul>
    </section>
${DISCLAIMER}
${CTA_BOTTOM}
  </main>
${footerHtml()}
</body>
</html>`;
}

/* ── 회사소개 ──────────────────────────────────────────────────── */
function renderAboutPage() {
  const url = `${SITE}/about/`;
  const orgLd = {
    '@context': 'https://schema.org',
    '@type': 'AccountingService',
    name: FIRM,
    image: ogImageHref(),
    alternateName: 'JT TAX CORP.',
    url: SITE,
    telephone: '+82-2-554-6405',
    email: 'jttax@jttax.co.kr',
    address: {
      '@type': 'PostalAddress', streetAddress: '강남대로78길 22, 5층', postalCode: '06242',
      addressLocality: '강남구', addressRegion: '서울특별시', addressCountry: 'KR',
    },
    founder: EXPERTS.map(e => ({ '@type': 'Person', name: `${e.name} 세무사`, url: `${SITE}/experts/${e.slug}.html` })),
    foundingDate: '2026',
    description: ABOUT.metaDesc,
  };
  return headHtml({
    title: `${ABOUT.metaTitle}`, desc: ABOUT.metaDesc, keywords: ABOUT.keywords, url,
    ldBlocks: [orgLd, crumbLd([['홈', `${SITE}/`], ['회사소개', url]])],
  }) + `
  <main class="jt-cc-wrap">
    <nav class="jt-cc-crumb"><a href="/">홈</a> › 회사소개</nav>
    <h1>${esc(ABOUT.h1)}</h1>
    <p class="jt-cc-lede">${esc(ABOUT.story)}</p>

    <section class="jt-cc-sec">
      <h2>합치면서 달라진 것</h2>
      <div class="jt-cc-grid">
${ABOUT.synergy.map(s => `      <div class="jt-cc-card"><h3>${esc(s.t)}</h3><p>${esc(s.d)}</p></div>`).join('\n')}
      </div>
    </section>

    <section class="jt-cc-sec">
      <h2>세 가지 원칙으로 일합니다</h2>
      <div class="jt-cc-grid">
${ABOUT.philosophy.map(p => `      <div class="jt-cc-card"><h3>${esc(p.n)} · ${esc(p.t)}</h3><p>${esc(p.d)}</p></div>`).join('\n')}
      </div>
    </section>

    <section class="jt-cc-sec">
      <h2>연혁</h2>
      <ul>
${ABOUT.timeline.map(t => `      <li><b>${esc(t.y)}</b> — ${esc(t.t)}</li>`).join('\n')}
      </ul>
    </section>

    <section class="jt-cc-sec">
      <h2>전문가</h2>
      <div class="jt-cc-chips">
${EXPERTS.map(e => `        <a class="jt-cc-chip" href="/experts/${e.slug}.html">${esc(e.name)} 대표세무사</a>`).join('\n')}
      </div>
    </section>

${DISCLAIMER}
${CTA_BOTTOM}
  </main>
${footerHtml()}
</body>
</html>`;
}

/* ── 상담 + 오시는 길 ──────────────────────────────────────────── */
function renderConsultPage() {
  const url = `${SITE}/consult.html`;
  const L = CONSULT.location;
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    image: ogImageHref(),
    mainEntity: CONSULT.faq.map(f => ({
      '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
  return headHtml({
    title: `${CONSULT.metaTitle} | ${FIRM}`, desc: CONSULT.metaDesc, keywords: CONSULT.keywords, url,
    ldBlocks: [faqLd, crumbLd([['홈', `${SITE}/`], ['상담 예약', url]])],
  }) + `
  <main class="jt-cc-wrap">
    <nav class="jt-cc-crumb"><a href="/">홈</a> › 상담 예약</nav>
    <h1>${esc(CONSULT.h1)}</h1>
    <p class="jt-cc-lede">${esc(CONSULT.lede)}</p>

    <div class="jt-cc-cta">
      <a href="/#/booking" class="jt-btn jt-btn--primary" onclick="jtTrackCta('booking','consult_top')">상담 예약 폼 열기 →</a>
      <a href="${L.kakaoChatUrl}" class="jt-btn jt-btn--outline" target="_blank" rel="noopener" onclick="jtTrackCta('kakao','consult_top')">카톡 상담</a>
      <a href="tel:${L.phone}" class="jt-btn jt-btn--outline" onclick="jtTrackCta('call','consult_top')">${L.phone}</a>
    </div>

    <section class="jt-cc-sec">
      <h2>${esc(CONSULT.hook.title)}</h2>
      <p style="font-size:16px;line-height:1.75;color:#333;">${esc(CONSULT.hook.body)}</p>
    </section>

    <section class="jt-cc-sec">
      <h2>오시는 길</h2>
      <ul>
      <li><b>주소</b> — ${esc(L.address)}</li>
      <li><b>지하철</b> — ${esc(L.subway)}</li>
      <li><b>업무시간</b> — ${esc(L.hours)}</li>
      <li><b>주차</b> — ${esc(L.parking)}</li>
      <li><b>이메일</b> — <a href="mailto:${L.email}">${L.email}</a></li>
      </ul>
      <div class="jt-cc-chips">
        <a class="jt-cc-chip" href="${L.kakaoMapUrl}" target="_blank" rel="noopener">카카오맵에서 보기</a>
        <a class="jt-cc-chip" href="${L.naverMapUrl}" target="_blank" rel="noopener">네이버지도에서 보기</a>
      </div>
    </section>

    <section class="jt-cc-sec">
      <h2>자주 묻는 질문</h2>
${CONSULT.faq.map(f => `      <div class="jt-cc-faq"><h3>${esc(f.q)}</h3><p>${esc(f.a)}</p></div>`).join('\n')}
    </section>

${DISCLAIMER}
${CTA_BOTTOM}
  </main>
${footerHtml()}
</body>
</html>`;
}

/* ── 실행 ──────────────────────────────────────────────────────── */
async function main() {
  const svcDir = join(REPO_ROOT, 'services');
  const expDir = join(REPO_ROOT, 'experts');
  const aboutDir = join(REPO_ROOT, 'about');
  await mkdir(svcDir, { recursive: true });
  await mkdir(expDir, { recursive: true });
  await mkdir(aboutDir, { recursive: true });

  let n = 0;
  for (const s of SERVICES) {
    assertSlug(s.slug, 'commercial.data SERVICES');
    await writeFile(join(svcDir, `${s.slug}.html`), renderServicePage(s)); n++;
  }
  await writeFile(join(svcDir, 'index.html'), renderServicesIndex()); n++;
  for (const e of EXPERTS) {
    assertSlug(e.slug, 'commercial.data EXPERTS');
    await writeFile(join(expDir, `${e.slug}.html`), renderExpertPage(e)); n++;
  }
  await writeFile(join(expDir, 'index.html'), renderExpertsIndex()); n++;
  await writeFile(join(aboutDir, 'index.html'), renderAboutPage()); n++;
  await writeFile(join(REPO_ROOT, 'consult.html'), renderConsultPage()); n++;
  console.log(`✓ 상업 랜딩 ${n}장 생성 → /services /experts /about /consult.html`);
  const total = await writeSitemap(REPO_ROOT, SITE);
  console.log(`✓ sitemap.xml 갱신 (${total} URL)`);
}

main();
