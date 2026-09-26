// project/commercial/build-commercial.mjs
//
// 상업 정적 랜딩 생성 — Node.js 18+
//
// 사용법:  node project/commercial/build-commercial.mjs
//
// commercial.data.mjs(수렴된 카피 정본)를 읽어:
//   /services/index.html + 5장  — 업무분야 (Service + BreadcrumbList, 허브는 CollectionPage/ItemList)
//   /acquisition-tax/index.html · /creators.html — 업무분야 06·07 (260926: 1~5와 같은 틀 renderServicePage)
//   /experts/index.html  + 3장  — 전문가 (Person + BreadcrumbList)
//   /about/index.html           — 회사소개 (AccountingService 보강)
//   /consult.html               — 상담+오시는 길 (FAQPage + BreadcrumbList)
// 그리고 공유 sitemap 을 갱신한다 (build-sitemap.mjs — 신설 디렉터리 열거 포함).
//
// ⛔ 광고규제(세무사법 §12조의7·시행령 §33): 확인되지 않은 실적 수치·우월 표현·결과 단정 금지.

import { writeFile, mkdir } from 'node:fs/promises';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SERVICES, SERVICE_EXTRA, EXPERTS, TEAM_MODEL, ABOUT, CONSULT } from './commercial.data.mjs';
import { CALCULATORS } from '../calculators/calculators.data.mjs';
import { writeSitemap } from '../_shared/build-sitemap.mjs';
import { GA_HEAD_SNIPPET } from '../_shared/ga-snippet.mjs';
import { footerHtml, stylesHref, ogImageHref, faviconHtml } from '../_shared/site-meta.mjs';
import { insightSlug } from '../_shared/insight-slug.mjs';

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
/* 인사이트 글 — slug → 제목. 제목의 정본은 원고(md) frontmatter 하나다.
   허브 데이터에는 slug 만 적고 제목은 여기서 읽는다. 원고가 없는 slug 는 빌드를 멈춘다. */
let _insightTitles = null;
function insightTitleBySlug(slug, where) {
  if (!_insightTitles) {
    _insightTitles = new Map();
    const dir = join(__dirname, '..', 'insights');
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.md') || f.startsWith('README')) continue;
      const src = readFileSync(join(dir, f), 'utf8').replace(/\r\n?/g, '\n');
      const m = src.match(/^---\n([\s\S]*?)\n---\n/);
      if (!m) continue;
      const meta = {};
      for (const line of m[1].split('\n')) {
        const i = line.indexOf(':');
        if (i < 0) continue;
        let v = line.slice(i + 1).trim();
        if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
        meta[line.slice(0, i).trim()] = v;
      }
      if (meta.title) _insightTitles.set(insightSlug(f, meta.slug), meta.title);
    }
  }
  assertSlug(slug, where);
  const t = _insightTitles.get(slug);
  if (!t) throw new Error(`[${where}] 인사이트 원고가 없는 슬러그 "${slug}"`);
  return t;
}
function serviceBySlug(slug, where) {
  const s = SERVICES.find(x => x.slug === slug) || SERVICE_EXTRA.find(x => x.slug === slug);
  if (!s) throw new Error(`[${where}] 알 수 없는 업무분야 슬러그 "${slug}"`);
  return s;
}
/* 업무분야 면의 주소 — 1~5 는 /services/<slug>.html, 06·07 은 데이터의 href(종전 주소 유지) */
const serviceHref = (s) => s.href || `/services/${s.slug}.html`;

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
    .jt-cc-grid--experts{grid-template-columns:repeat(3,minmax(0,1fr));}
    .jt-cc-portrait{display:block;width:100%;height:auto;aspect-ratio:3/4;object-fit:cover;object-position:center top;background:#eee;}
    .jt-cc-card .jt-cc-portrait{margin:0 0 14px;}
    .jt-cc-expert-intro{display:grid;grid-template-columns:180px minmax(0,1fr);gap:24px;align-items:start;}
    .jt-cc-expert-intro .jt-cc-lede{margin-bottom:0;}
    @media(max-width:600px){.jt-cc-grid--experts{grid-template-columns:1fr;}.jt-cc-expert-intro{grid-template-columns:1fr;}.jt-cc-expert-intro .jt-cc-portrait{max-width:180px;}}
    .jt-cc-links{list-style:none;padding:0;}
    .jt-cc-links a{color:#1a1a1a;text-decoration:none;border-bottom:1px solid rgba(0,0,0,.15);}
    .jt-cc-chips{display:flex;gap:8px;flex-wrap:wrap;}
    .jt-cc-kqr{display:flex;align-items:center;gap:12px;margin-top:14px;font-size:13px;color:#555;}
    .jt-cc-kqr img{width:88px;height:88px;border:1px solid rgba(0,0,0,.1);border-radius:8px;background:#fff;}
    @media(max-width:640px){.jt-cc-kqr > a:first-child{display:none;}}
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
    .jt-cr-card{display:flex;flex-direction:column;gap:10px;padding:22px 24px;}
    .jt-cr-card .jt-btn{align-self:flex-start;margin-top:6px;}
    .jt-cr-kicker{margin:0;font-family:ui-monospace,monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#999;}
    .jt-cr-links{margin:4px 0 0;line-height:2.0;font-size:14px;}
    .jt-cr-proof{font-size:14px;color:#666;border-left:3px solid #0B0B0F;padding:6px 0 6px 14px;margin:0 0 28px;}
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
${faviconHtml()}
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

/* 카카오톡 채널 QR (260922 오너 제공 — 판독값 http://pf.kakao.com/_CcxlJG, 채널 «제이티 세무회계»).
   화면이 좁으면(휴대폰) 링크를 바로 누르면 되므로 그림은 숨긴다. */
const KAKAO_URL = 'https://pf.kakao.com/_CcxlJG';
const KAKAO_QR = `    <div class="jt-cc-kqr">
      <a href="${KAKAO_URL}" target="_blank" rel="noopener" onclick="jtTrackCta('kakao','qr')"><img src="/project/assets/kakao-qr.png" alt="카카오톡 채널 제이티 세무회계 QR 코드" loading="lazy" width="88" height="88"></a>
      <span>휴대폰 카메라로 QR을 찍으면 카카오톡 채널 <b>제이티 세무회계</b>로 연결됩니다.<br><a href="${KAKAO_URL}" target="_blank" rel="noopener" style="color:#333;">pf.kakao.com/_CcxlJG</a></span>
    </div>`;

const CTA_BOTTOM = `    <div class="jt-cc-cta" style="margin-top:24px;">
      <a href="/#/booking" class="jt-btn jt-btn--primary" onclick="jtTrackCta('booking','commercial')">상담 예약 →</a>
      <a href="${KAKAO_URL}" class="jt-btn jt-btn--outline" target="_blank" rel="noopener" onclick="jtTrackCta('kakao','commercial')">카톡 상담</a>
      <a href="tel:02-554-6405" class="jt-btn jt-btn--outline" onclick="jtTrackCta('call','commercial')">02-554-6405</a>
    </div>
${KAKAO_QR}`;

const DISCLAIMER = `    <div class="jt-cc-disc">
      <div class="l">안내</div>
      <p>본 페이지는 업무 소개를 위한 일반 정보이며, 특정 사안에 대한 확정적 세무 자문이 아닙니다. 세법은 개별 사실관계에 따라 결과가 달라지므로, 정확한 판단은 상담을 통해 진행하시기 바랍니다.</p>
    </div>`;

function leadCard(e, note) {
  return `    <section class="jt-cc-sec">
      <h2>관련 대표세무사 프로필</h2>
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
/* 크리에이터 경로 계측 — 성장기획 §1단계 수렴 스펙(귀속 = 최초 선택 고정):
   jt_creator_path 는 «세션 최초 1회만» 저장하고 GA4 path_select 도 그때만 발화한다.
   이후 다른 경로를 눌러도 덮어쓰지도 재발화하지도 않는다 — 한 세션 = 정확히 한 경로.
   저장이 실패(스토리지 차단)하면 이벤트도 내보내지 않는다 — 분모(GA4)와
   분자(접수 메일의 크리에이터경로)가 어긋나지 않게 같은 성공 경로에 묶는다. */
const CREATOR_PATH_SCRIPT = `  <script>
    function jtCreatorPath(p) {
      try {
        if (sessionStorage.getItem('jt_creator_path')) return;
        sessionStorage.setItem('jt_creator_path', p);
        if (typeof window.gtag === 'function') {
          window.gtag('event', 'path_select', { creator_path: p });
        }
      } catch (_e) {}
    }
  </script>`;
const VALID_CREATOR_PATH_ID = /^(first|side|mcn)$/;

/* 06·07 만의 추가 절 — 같은 틀 «안»에 둔다(1~5 는 이 필드가 없어 아무것도 그리지 않는다). */
function extraSectionsHtml(s) {
  const out = [];
  if (s.acqCheck) {
    /* 접수 화면으로 가는 유일한 자리. 문안은 접수와서류 4차본 B(260926 오너 확정) — 서류 없이 써 준 내용만으로 1차 재검토.
       tests_acq_check (a)가 이 절(h2~</section>, 600자 안)에 금지 문구가 없는지 본다. */
    out.push(`    <section class="jt-cc-sec">
      <h2>이미 낸 취득세를 점검받고 싶다면</h2>
      <p style="font-size:16px;line-height:1.75;color:#333;">과거에 신고·납부한 취득세를 다시 보고 싶으시면 접수 화면에 써 주신 내용만으로 1차 재검토를 받으실 수 있습니다. 재계산이 아니라 다시 볼 여지가 있는지 확인하는 절차이며, 서류는 자문을 맡기시기로 한 뒤에 필요한 것만 받습니다.</p>
      <div class="jt-cc-chips" style="margin-top:12px;">
        <a class="jt-cc-chip" href="${s.acqCheck.href}">${esc(s.acqCheck.label)}</a>
      </div>
    </section>`);
  }
  if (s.creatorPaths) {
    const cards = s.creatorPaths.map(p => {
      if (!VALID_CREATOR_PATH_ID.test(p.id)) throw new Error(`[creators] 경로 id 오류: ${JSON.stringify(p.id)} — first|side|mcn 만 허용합니다(GA4 creator_path 값과 한 몸).`);
      const links = p.links.map(l =>
        `        <li><a href="${l.href}" onclick="jtCreatorPath('${p.id}')">${esc(l.label)} →</a></li>`
      ).join('\n');
      return `      <div class="jt-cc-card jt-cr-card">
        <p class="jt-cr-kicker">${esc(p.label)}</p>
        <h3>${esc(p.title)}</h3>
        <p>${esc(p.desc)}</p>
        <ul class="jt-cc-links jt-cr-links">
${links}
        </ul>
        <a href="/#/booking" class="jt-btn jt-btn--primary" onclick="jtCreatorPath('${p.id}');jtTrackCta('booking','creators_${p.id}')">이 상황으로 상담 예약 →</a>
      </div>`;
    }).join('\n');
    out.push(`${CREATOR_PATH_SCRIPT}
    <section class="jt-cc-sec">
      <h2>지금 어느 단계인가요?</h2>
      <div class="jt-cc-grid">
${cards}
      </div>
    </section>`);
  }
  if (s.consultHook) {
    out.push(`    <section class="jt-cc-sec">
      <h2>${esc(CONSULT.hook.title)}</h2>
      <p style="font-size:16px;line-height:1.75;color:#333;">${esc(CONSULT.hook.body)}</p>
    </section>`);
  }
  for (const x of (s.extraSections || [])) {
    const chips = (x.chips || []).map(c => `        <a class="jt-cc-chip" href="${c.href}">${esc(c.label)}</a>`).join('\n');
    out.push(`    <section class="jt-cc-sec">
      <h2>${esc(x.h2)}</h2>
      <p style="font-size:16px;line-height:1.75;color:#333;">${esc(x.body)}</p>
${chips ? `      <div class="jt-cc-chips" style="margin-top:12px;">\n${chips}\n      </div>` : ''}
    </section>`);
  }
  if (s.closing) out.push(`    <p style="font-size:16px;line-height:1.75;color:#333;">${esc(s.closing)}</p>`);
  return out.join('\n\n');
}

function renderServicePage(s) {
  const url = `${SITE}${serviceHref(s)}`;
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
  /* 제목이 데이터에 없으면 원고(md) frontmatter 에서 읽는다 — 06·07 은 전부 그 방식이다 */
  const insightLi = (slug, title, where) =>
    `        <li><a href="/insights/${assertSlug(slug, where)}.html">${esc(title || insightTitleBySlug(slug, where))} →</a></li>`;
  const insightsHtml = (s.relatedInsights || []).map(r => insightLi(r.slug, r.title, `services/${s.slug}.relatedInsights`)).join('\n');
  const groupsHtml = (s.insightGroups || []).map(g => `${g.label ? `      <p style="margin:16px 0 6px;font-size:13px;color:#777;">${esc(g.label)}</p>\n` : ''}      <ul class="jt-cc-links">
${g.slugs.map(sl => insightLi(sl, null, `services/${s.slug}.insightGroups`)).join('\n')}
      </ul>`).join('\n');
  return headHtml({
    title: `${s.metaTitle} | ${FIRM}`, desc: s.metaDesc, keywords: s.keywords, url,
    ldBlocks: [svcLd, crumbLd([['홈', `${SITE}/`], ['업무분야', `${SITE}/services/`], [s.kr, url]])],
  }) + `
  <main class="jt-cc-wrap">
    <nav class="jt-cc-crumb"><a href="/">홈</a> › <a href="/services/">업무분야</a> › ${esc(s.kr)}</nav>
    <h1>${esc(s.h1)}</h1>
    <p class="jt-cc-lede">${esc(s.lede)}</p>
${s.proof ? `    <p class="jt-cr-proof">${esc(s.proof)}</p>\n` : ''}
    <div class="jt-cc-cta">
      <a href="/#/booking" class="jt-btn jt-btn--primary" onclick="jtTrackCta('booking','svc_top')">이 분야 상담 예약 →</a>
      <a href="https://pf.kakao.com/_CcxlJG" class="jt-btn jt-btn--outline" target="_blank" rel="noopener" onclick="jtTrackCta('kakao','svc_top')">카톡 상담</a>
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
${s.creatorsLink ? `      <p style="font-size:14px;"><a href="/creators.html" style="color:#1a1a1a;">크리에이터·유튜버라면 — 지금 단계에 맞는 세금 경로부터 확인하기 →</a></p>` : ''}
    </section>

${leadCard(lead)}

${(calcsHtml || deepLink) ? `    <section class="jt-cc-sec">
      <h2>직접 계산해 보기</h2>
      <div class="jt-cc-chips">
${[calcsHtml, deepLink].filter(Boolean).join('\n')}
      </div>
    </section>` : ''}

${(insightsHtml || groupsHtml) ? `    <section class="jt-cc-sec">
      <h2>관련 인사이트</h2>
${[insightsHtml ? `      <ul class="jt-cc-links">\n${insightsHtml}\n      </ul>` : '', groupsHtml].filter(Boolean).join('\n')}
    </section>` : ''}

${extraSectionsHtml(s) ? extraSectionsHtml(s) + '\n\n' : ''}${DISCLAIMER}
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
      itemListElement: [
        ...SERVICES.concat(SERVICE_EXTRA).map((s) => ({ name: s.kr, url: `${SITE}${serviceHref(s)}` })),
      ].map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, url: it.url })),
    },
  };
  const card = (href, kr, lede) => `      <a class="jt-cc-card" style="display:block;text-decoration:none;color:#0B0B0F;" href="${href}">
        <h3>${esc(kr)}</h3>
        <p>${esc(lede)}</p>
        <p style="margin-top:10px;font-weight:600;font-size:13px;">업무 안내 보기 →</p>
      </a>`;
  const cards = SERVICES.concat(SERVICE_EXTRA)   // 260926: 06·07 도 같은 카드·같은 leaf 틀
    .map(s => card(serviceHref(s), s.kr, s.cardLede || s.lede)).join('\n');
  return headHtml({
    title: `업무분야 — 양도상속증여·세무조사·기장·컨설팅·경정청구·취득세·크리에이터 | ${FIRM}`,
    desc: '기장·세금 신고, 양도·상속·증여, 기업 자문, 세무조사 대응과 경정청구, 취득세, 크리에이터 세금까지 사업과 재산의 세무 업무를 안내합니다.',
    keywords: '강남 세무법인, 세무법인 업무, 상속 세무, 세무조사 대응, 기장 대행, 경정청구, 취득세 세무사, 크리에이터 세무', url,
    ldBlocks: [listLd, crumbLd([['홈', `${SITE}/`], ['업무분야', url]])],
  }) + `
  <main class="jt-cc-wrap">
    <nav class="jt-cc-crumb"><a href="/">홈</a> › 업무분야</nav>
    <h1>일곱 개의 전문 영역. 하나의 호흡.</h1>
    <p class="jt-cc-lede">기장·신고, 양도·상속·증여, 기업 자문, 세무조사 대응과 경정청구, 그리고 취득세와 크리에이터 세금까지 사업과 재산의 세금 문제를 폭넓게 살핍니다.</p>
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
    // 정적 셸 게이트는 모든 페이지의 OG·Twitter·JSON-LD 이미지를 공용 OG와 일치시킨다.
    // 개인 사진은 아래 프로필 본문에 표시한다.
    image: ogImageHref(),
    jobTitle: '대표세무사',
    url,
    description: e.metaDesc,
    worksFor: { '@type': 'Organization', name: FIRM, url: SITE },
  };
  const svcChips = (e.services || []).map(slug => {
    const s = serviceBySlug(slug, `experts/${e.slug}.services`);
    return `        <a class="jt-cc-chip" href="${serviceHref(s)}">${esc(s.kr)}</a>`;
  }).join('\n');
  const profileSections = [
    ['실무 경력', e.practice],
    ['자문 · 대외활동', e.advisory],
    ['교육 활동', e.teaching],
    ['저서', e.books],
    ['학력', e.education],
    ['자격', e.qualifications],
  ].filter(([, entries]) => entries && entries.length);
  return headHtml({
    title: `${e.name} 세무사 — ${e.headline} | ${FIRM}`, desc: e.metaDesc, keywords: e.keywords, url,
    ldBlocks: [personLd, crumbLd([['홈', `${SITE}/`], ['전문가', `${SITE}/experts/`], [`${e.name} 세무사`, url]])],
  }) + `
  <main class="jt-cc-wrap">
    <nav class="jt-cc-crumb"><a href="/">홈</a> › <a href="/experts/">전문가</a> › ${esc(e.name)} 세무사</nav>
    <div class="jt-cc-expert-intro">
      <img class="jt-cc-portrait" src="${esc(e.photo)}" alt="${esc(e.name)} 대표세무사" width="180" height="240">
      <div>
        <p style="font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#999;margin:0 0 8px;">Managing Partner · 대표세무사</p>
        <h1>${esc(e.name)} 대표세무사 · ${esc(e.headline)}</h1>
        <p class="jt-cc-lede">${esc(e.lede)}</p>
      </div>
    </div>

    <section class="jt-cc-sec">
      <h2>주요 실무</h2>
      <p style="font-size:16px;line-height:1.7;color:#333;">${esc(e.focus)}</p>
      <div class="jt-cc-chips" style="margin-top:12px;">
${svcChips}
      </div>
    </section>

${profileSections.map(([heading, entries]) => `    <section class="jt-cc-sec">
      <h2>${esc(heading)}</h2>
      <ul>
${entries.map(entry => `        <li>${esc(heading === '저서' ? `『${entry}』` : entry)}</li>`).join('\n')}
      </ul>
    </section>`).join('\n')}

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
        <img class="jt-cc-portrait" src="${esc(expertBySlug(v.slug, 'team-model').photo)}" alt="${esc(v.name)} 대표세무사" loading="lazy" width="210" height="280">
        <p style="margin:0 0 4px;font-family:ui-monospace,monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#999;">${esc(v.view)}</p>
        <h3>${esc(v.name)} 대표세무사</h3>
        <p>${esc(v.d)}</p>
        <p style="margin-top:10px;font-weight:600;font-size:13px;">프로필 보기 →</p>
      </a>`).join('\n');
  return headHtml({
    title: `전문가 — 세 명의 대표세무사 | ${FIRM}`,
    desc: '김민석·이현준·김가환 대표세무사의 실무 경력과 활동을 소개합니다. 세 대표 모두 사업과 재산의 세금 문제를 폭넓게 다룹니다.',
    keywords: '강남 세무사, 제이티 세무법인 세무사, 대표세무사, 김민석 세무사, 이현준 세무사, 김가환 세무사', url,
    ldBlocks: [listLd, crumbLd([['홈', `${SITE}/`], ['전문가', url]])],
  }) + `
  <main class="jt-cc-wrap">
    <nav class="jt-cc-crumb"><a href="/">홈</a> › 전문가</nav>
    <h1>${esc(TEAM_MODEL.title)}</h1>
    <p class="jt-cc-lede">${esc(TEAM_MODEL.lede)}</p>
    <div class="jt-cc-grid jt-cc-grid--experts">
${views}
    </div>
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
${KAKAO_QR}

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
  for (const s of SERVICE_EXTRA) {   // 260926: 06·07 — 1~5 와 같은 틀, 출력 경로만 데이터(out)에서
    assertSlug(s.slug, 'commercial.data SERVICE_EXTRA');
    if (!s.out || !s.href) throw new Error(`[SERVICE_EXTRA ${s.slug}] out·href 가 필요합니다`);
    await mkdir(dirname(join(REPO_ROOT, s.out)), { recursive: true });
    await writeFile(join(REPO_ROOT, s.out), renderServicePage(s)); n++;
  }
  console.log(`✓ 상업 랜딩 ${n}장 생성 → /services /experts /about /consult.html /creators.html /acquisition-tax/`);
  const total = await writeSitemap(REPO_ROOT, SITE);
  console.log(`✓ sitemap.xml 갱신 (${total} URL)`);
}

main();
