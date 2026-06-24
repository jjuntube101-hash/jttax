// project/calculators/build-calculators.mjs
//
// 계산기 SEO 랜딩 페이지 자동 생성 — Node.js 18+
//
// 사용법:  node project/calculators/build-calculators.mjs
//
// calculators.data.mjs(계산기 정의)를 읽어:
//   1. /calculators/<slug>.html 정적 SEO 페이지 생성 (검색봇이 읽는 진짜 HTML)
//      - 제목·설명·핵심개념·FAQ가 초기 HTML에 들어감 → 구글·네이버·다음 색인 가능
//      - JSON-LD(SoftwareApplication + FAQPage + BreadcrumbList)
//      - "지금 계산하기 →" 버튼 = SPA 계산기 딥링크(/#/report/<sub>)
//   2. 루트 sitemap.xml 갱신 (공유 모듈 — 인사이트+계산기 자동 열거)

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CALCULATORS } from './calculators.data.mjs';
import { writeSitemap } from '../_shared/build-sitemap.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));   // project/calculators
const REPO_ROOT = join(__dirname, '..', '..');               // 사이트 루트
const OUT_DIR = join(REPO_ROOT, 'calculators');
const SITE = 'https://www.jttax.co.kr';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function renderCalcPage(c) {
  const url = `${SITE}/calculators/${c.slug}.html`;
  const appUrl = `/#/report/${c.sub}`;
  const fullTitle = `${c.metaTitle} | 제이티 세무법인`;

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: (c.faq || []).map(f => ({
      '@type': 'Question', name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
  const appLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: c.h1,
    url,
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' },
    provider: { '@type': 'Organization', name: '제이티 세무법인', url: SITE },
    description: c.metaDesc,
  };
  const crumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '홈', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: '세금 계산기', item: `${SITE}/calculators/` },
      { '@type': 'ListItem', position: 3, name: c.h1, item: url },
    ],
  };

  const li = (arr) => (arr || []).map(x => `      <li>${esc(x)}</li>`).join('\n');
  const conceptsHtml = (c.concepts || []).map(p =>
    `      <div class="jt-cc-card"><h3>${esc(p.term)}</h3><p>${esc(p.desc)}</p></div>`
  ).join('\n');
  const faqHtml = (c.faq || []).map(f =>
    `      <div class="jt-cc-faq"><h3>${esc(f.q)}</h3><p>${esc(f.a)}</p></div>`
  ).join('\n');
  const relatedHtml = (c.related && c.related.length)
    ? `    <section class="jt-cc-sec">
      <h2>관련 인사이트</h2>
      <ul class="jt-cc-links">
${c.related.map(r => `        <li><a href="/insights/${r.slug}.html">${esc(r.title)} →</a></li>`).join('\n')}
      </ul>
    </section>`
    : '';
  const otherCalcs = CALCULATORS.filter(o => o.slug !== c.slug).slice(0, 6)
    .map(o => `        <a class="jt-cc-chip" href="/calculators/${o.slug}.html">${esc(o.h1)}</a>`).join('\n');

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>${esc(fullTitle)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${esc(c.metaDesc)}">
  <meta name="keywords" content="${esc(c.keywords)}">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(fullTitle)}">
  <meta property="og:description" content="${esc(c.metaDesc)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${SITE}/project/assets/og-image.png">
  <meta property="og:locale" content="ko_KR">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(fullTitle)}">
  <meta name="twitter:description" content="${esc(c.metaDesc)}">
  <link rel="icon" href="/project/assets/logo_symbol.png">
  <link rel="stylesheet" href="/project/src/styles.css">
  <script type="application/ld+json">${JSON.stringify(appLd)}</script>
  <script type="application/ld+json">${JSON.stringify(faqLd)}</script>
  <script type="application/ld+json">${JSON.stringify(crumbLd)}</script>
  <style>
    .jt-cc-wrap{max-width:760px;margin:0 auto;padding:40px 24px 80px;color:#0B0B0F;}
    .jt-cc-crumb{font-size:13px;color:#888;margin-bottom:20px;}
    .jt-cc-crumb a{color:#888;text-decoration:none;}
    .jt-cc-wrap h1{font-size:30px;letter-spacing:-0.02em;margin:0 0 12px;}
    .jt-cc-lede{font-size:18px;color:#5a5a5a;line-height:1.65;margin:0 0 28px;}
    .jt-cc-cta{display:flex;gap:12px;flex-wrap:wrap;margin:0 0 8px;}
    .jt-cc-note{font-size:13px;color:#888;margin:10px 0 40px;}
    .jt-cc-sec{margin:40px 0;}
    .jt-cc-sec h2{font-size:21px;letter-spacing:-0.01em;margin:0 0 16px;padding-bottom:8px;border-bottom:1px solid rgba(0,0,0,.08);}
    .jt-cc-wrap ul{padding-left:20px;line-height:1.85;color:#333;}
    .jt-cc-grid{display:grid;gap:14px;}
    .jt-cc-card{border:1px solid rgba(0,0,0,.1);border-radius:10px;padding:16px 18px;background:#FAFAF8;}
    .jt-cc-card h3{margin:0 0 6px;font-size:16px;}
    .jt-cc-card p{margin:0;font-size:14px;color:#555;line-height:1.6;}
    .jt-cc-faq{padding:16px 0;border-bottom:1px solid rgba(0,0,0,.06);}
    .jt-cc-faq h3{margin:0 0 8px;font-size:16px;}
    .jt-cc-faq p{margin:0;font-size:15px;color:#444;line-height:1.7;}
    .jt-cc-links{list-style:none;padding:0;}
    .jt-cc-links a{color:#1a1a1a;text-decoration:none;border-bottom:1px solid rgba(0,0,0,.15);}
    .jt-cc-chips{display:flex;gap:8px;flex-wrap:wrap;}
    .jt-cc-chip{font-size:13px;border:1px solid rgba(0,0,0,.15);border-radius:999px;padding:7px 13px;text-decoration:none;color:#333;background:#fff;}
    .jt-cc-disc{margin-top:48px;padding:24px;border:1px solid rgba(0,0,0,.1);background:#FAFAF8;border-radius:10px;}
    .jt-cc-disc .l{font-family:ui-monospace,monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#999;}
    .jt-cc-disc p{font-size:13px;color:#5a5a5a;margin:8px 0 0;line-height:1.7;}
  </style>
</head>
<body style="background:#fff;">
  <header style="border-bottom:1px solid rgba(0,0,0,.08);padding:16px 24px;display:flex;align-items:center;gap:12px;">
    <a href="/" style="display:flex;align-items:center;gap:10px;text-decoration:none;color:#0B0B0F;font-weight:700;letter-spacing:-0.01em;">
      <img src="/project/assets/logo_symbol.png" width="28" alt="제이티 세무법인"/> 제이티 세무법인
    </a>
    <span style="margin-left:auto;font-size:13px;"><a href="/calculators/" style="color:#666;text-decoration:none;">← 모든 계산기</a></span>
  </header>

  <main class="jt-cc-wrap">
    <nav class="jt-cc-crumb"><a href="/">홈</a> › <a href="/calculators/">세금 계산기</a> › ${esc(c.h1)}</nav>
    <h1>${esc(c.h1)}</h1>
    <p class="jt-cc-lede">${esc(c.lede)}</p>

    <div class="jt-cc-cta">
      <a href="${appUrl}" class="jt-btn jt-btn--primary">지금 계산하기 →</a>
      <a href="/#booking" class="jt-btn jt-btn--outline">세무사 상담</a>
    </div>
    <p class="jt-cc-note">로그인 불필요 · 입력값은 내 브라우저에만 저장 · 검증된 계산 엔진</p>

    <section class="jt-cc-sec">
      <h2>이 계산기로 알 수 있는 것</h2>
      <ul>
${li(c.canDo)}
      </ul>
    </section>

    <section class="jt-cc-sec">
      <h2>이런 분께 필요합니다</h2>
      <ul>
${li(c.audience)}
      </ul>
    </section>

    <section class="jt-cc-sec">
      <h2>${esc(c.h1.replace(/\s*계산기$/, '').replace(/\s*시뮬레이터$/, ''))}, 이렇게 계산됩니다</h2>
      <ul>
${li(c.howItWorks)}
      </ul>
    </section>

    <section class="jt-cc-sec">
      <h2>꼭 알아야 할 핵심</h2>
      <div class="jt-cc-grid">
${conceptsHtml}
      </div>
    </section>

    <section class="jt-cc-sec">
      <h2>자주 묻는 질문</h2>
${faqHtml}
    </section>

    <div class="jt-cc-cta" style="margin-top:8px;">
      <a href="${appUrl}" class="jt-btn jt-btn--primary">${esc(c.h1)}로 계산하기 →</a>
    </div>

${relatedHtml}

    <section class="jt-cc-sec">
      <h2>다른 세금 계산기</h2>
      <div class="jt-cc-chips">
${otherCalcs}
      </div>
    </section>

    <div class="jt-cc-disc">
      <div class="l">안내</div>
      <p>본 페이지와 계산기는 일반적인 정보 제공을 위한 참고 자료이며, 특정 사안에 대한 확정적 세무 자문이 아닙니다. 세법은 개별 사실관계에 따라 결과가 달라지므로, 정확한 판단은 담당 세무사와의 상담을 통해 진행하시기 바랍니다. 세율·공제 등은 현행 시행 법령 기준입니다.</p>
    </div>

    <div class="jt-cc-cta" style="margin-top:24px;">
      <a href="/#booking" class="jt-btn jt-btn--primary">상담 예약 →</a>
      <a href="http://pf.kakao.com/_CcxlJG/chat" class="jt-btn jt-btn--outline" target="_blank" rel="noopener">카톡 상담</a>
    </div>
  </main>

  <footer style="margin-top:40px;padding:32px 24px;border-top:1px solid rgba(0,0,0,.08);font-size:12px;color:#888;text-align:center;">
    © 2026 JT TAX CORP. — www.jttax.co.kr
  </footer>
</body>
</html>`;
}

function renderIndexPage() {
  const url = `${SITE}/calculators/`;
  const itemsLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: CALCULATORS.map((c, i) => ({
      '@type': 'ListItem', position: i + 1, name: c.h1, url: `${SITE}/calculators/${c.slug}.html`,
    })),
  };
  const cards = CALCULATORS.map(c =>
    `      <a class="jt-ci-card" href="/calculators/${c.slug}.html">
        <h2>${esc(c.h1)}</h2>
        <p>${esc(c.lede)}</p>
        <span class="jt-ci-go">계산하기 →</span>
      </a>`
  ).join('\n');
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>무료 세금 계산기 — 양도·증여·상속·취득·재산세·종부세·종소세 | 제이티 세무법인</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="양도소득세·증여세·상속세·취득세·재산세·종합부동산세·종합소득세·법인전환·4대보험 실수령까지, 검증된 계산 엔진으로 5분 만에 계산하는 무료 세금 계산기 모음.">
  <meta name="keywords" content="세금 계산기, 무료 세금 계산기, 양도소득세 계산기, 증여세 계산기, 상속세 계산기, 취득세 계산기, 재산세 계산기, 종합부동산세 계산기, 종합소득세 계산기, 실수령액 계산기">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="무료 세금 계산기 모음 | 제이티 세무법인">
  <meta property="og:description" content="양도·증여·상속·취득·재산세·종부세·종소세·법인전환·4대보험까지 검증 엔진으로 계산하는 무료 세금 계산기.">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${SITE}/project/assets/og-image.png">
  <meta property="og:locale" content="ko_KR">
  <link rel="icon" href="/project/assets/logo_symbol.png">
  <link rel="stylesheet" href="/project/src/styles.css">
  <script type="application/ld+json">${JSON.stringify(itemsLd)}</script>
  <style>
    .jt-ci-wrap{max-width:860px;margin:0 auto;padding:48px 24px 80px;color:#0B0B0F;}
    .jt-ci-wrap h1{font-size:32px;letter-spacing:-0.02em;margin:0 0 12px;}
    .jt-ci-lede{font-size:18px;color:#5a5a5a;line-height:1.65;margin:0 0 36px;}
    .jt-ci-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px;}
    .jt-ci-card{display:block;border:1px solid rgba(0,0,0,.1);border-radius:12px;padding:20px;text-decoration:none;color:#0B0B0F;background:#fff;transition:box-shadow .15s,transform .15s;}
    .jt-ci-card:hover{box-shadow:0 6px 24px rgba(0,0,0,.08);transform:translateY(-2px);}
    .jt-ci-card h2{font-size:18px;margin:0 0 8px;border:0;padding:0;}
    .jt-ci-card p{font-size:13.5px;color:#666;line-height:1.55;margin:0 0 12px;}
    .jt-ci-go{font-size:13px;color:#1a1a1a;font-weight:600;}
  </style>
</head>
<body style="background:#fff;">
  <header style="border-bottom:1px solid rgba(0,0,0,.08);padding:16px 24px;display:flex;align-items:center;gap:12px;">
    <a href="/" style="display:flex;align-items:center;gap:10px;text-decoration:none;color:#0B0B0F;font-weight:700;letter-spacing:-0.01em;">
      <img src="/project/assets/logo_symbol.png" width="28" alt="제이티 세무법인"/> 제이티 세무법인
    </a>
    <span style="margin-left:auto;font-size:13px;"><a href="/" style="color:#666;text-decoration:none;">홈 →</a></span>
  </header>
  <main class="jt-ci-wrap">
    <nav style="font-size:13px;color:#888;margin-bottom:20px;"><a href="/" style="color:#888;text-decoration:none;">홈</a> › 세금 계산기</nav>
    <h1>무료 세금 계산기</h1>
    <p class="jt-ci-lede">양도·증여·상속·취득·재산세·종합부동산세 + 종합소득세·법인전환·4대보험 실수령까지. 검증된 계산 엔진으로 로그인 없이 5분 만에 계산하고, 바로 담당 세무사 상담으로 이어집니다.</p>
    <div class="jt-ci-grid">
${cards}
    </div>
    <div style="margin-top:40px;display:flex;gap:12px;flex-wrap:wrap;">
      <a href="/#/report" class="jt-btn jt-btn--primary">계산기 허브 열기 →</a>
      <a href="/#booking" class="jt-btn jt-btn--outline">세무사 상담</a>
    </div>
  </main>
  <footer style="margin-top:40px;padding:32px 24px;border-top:1px solid rgba(0,0,0,.08);font-size:12px;color:#888;text-align:center;">
    © 2026 JT TAX CORP. — www.jttax.co.kr
  </footer>
</body>
</html>`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const c of CALCULATORS) {
    await writeFile(join(OUT_DIR, `${c.slug}.html`), renderCalcPage(c));
  }
  await writeFile(join(OUT_DIR, 'index.html'), renderIndexPage());
  console.log(`✓ 계산기 SEO 페이지 ${CALCULATORS.length}건 + 인덱스 생성 → /calculators/`);
  const n = await writeSitemap(REPO_ROOT, SITE);
  console.log(`✓ sitemap.xml 갱신 (${n} URL)`);
}

main();
