/* 정적 생성 페이지가 공유하는 법인 정보·자산 버전 (260808 신설)

   ★ 왜 필요한가 — 두 가지 사고를 막는다.

   1) 광고 표시의무 누락
      세무사법 시행령 §33① 은 광고에 «사무소명 + 세무사 성명» 표시를 요구한다
      (본조신설 2026.6.9, MST 286849). SPA 푸터는 충족하고 있었으나 생성된
      정적 45 장의 푸터는 `© 2026 JT TAX CORP.` 한 줄뿐이라 둘 다 빠져 있었다.
      두 빌더가 각자 문자열을 들고 있어 한쪽만 고치면 드리프트한다 → 여기로 모은다.

   2) CSS 캐시가 안 깨지는 문제
      index.html 은 `styles.css?v=NN` 으로 캐시를 무효화하는데 정적 페이지는
      쿼리 없이 링크하고 있었다. CSS 를 고쳐도 재방문자에겐 옛 스타일이 갔다.
      → 버전을 여기서 손으로 적지 않고 **index.html 에서 읽어온다**. index.html 이
      단일 SSOT 로 남고, 빌더는 자동으로 따라온다.

   법인 정보의 정본은 SPA 쪽 `project/src/Data.jsx` 다. 이 파일은 정적 세계용
   사본이며, 둘이 어긋나면 P2 에서 신설할 tests_static_shell.js 가 잡는다.
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');

/* ── 법인 정보 (Data.jsx 와 일치해야 함) ───────────────────────────── */
export const FIRM = '제이티 세무법인';
export const FIRM_EN = 'JT TAX CORP.';
/* 시행령 §33① 의 «세무사 성명». 법인은 광고 담당 지정 소속 세무사를 적는다. */
export const TAX_ACCOUNTANT = '대표 세무사 이현준';
export const SITE_HOST = 'www.jttax.co.kr';

/* ── 공통 푸터 ─────────────────────────────────────────────────────
   정적 페이지(인사이트·계산기·데스크) 전용. SPA 푸터는 Chrome.jsx 의 JTFooter.
   수기 HTML 에도 같은 내용을 넣되, 마커 주석으로 버전을 표시해 드리프트를
   테스트가 잡을 수 있게 한다. */
export const SHELL_VERSION = 1;

/* 마커는 «푸터 블록 안»에 둔다 — 밖에 두면 head 에 마커만 있고 푸터는 빈
   상태도 게이트를 통과한다(Codex R2). 마커·사무소명·성명이 한 블록에 있어야
   「이 푸터가 공통 셸 v1 이다」가 증명된다. */
export function footerHtml() {
  return `  <footer style="margin-top:80px;padding:32px 24px;border-top:1px solid rgba(0,0,0,.08);font-size:12px;color:#888;text-align:center;line-height:1.9;">
    <!-- jt-shell v${SHELL_VERSION} -->
    <div>${FIRM} · ${TAX_ACCOUNTANT}</div>
    <div>© 2026 ${FIRM_EN} — ${SITE_HOST}</div>
  </footer>`;
}

/* ── 자산 버전 — index.html 이 SSOT ────────────────────────────────
   `project/src/styles.css?v=22` 같은 링크에서 숫자만 뽑는다.
   못 찾으면 조용히 0 을 쓰지 않고 던진다 — 「버전 없이 배포」가 바로 그 사고다. */
export function assetVersion(relFromSrc) {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const esc = relFromSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`project/src/${esc}\\?v=(\\d+)`).exec(html);
  if (!m) throw new Error(`index.html 에서 project/src/${relFromSrc} 의 ?v= 를 찾지 못했습니다.`);
  return m[1];
}

/* 정적 페이지가 링크할 스타일시트 URL (버전 포함) */
export function stylesHref() {
  return `/project/src/styles.css?v=${assetVersion('styles.css')}`;
}

/* <meta ... property="og:image" ...> 태그를 «먼저» 잡고 그 안에서 content 를 읽는다.
   두 가지 함정을 동시에 피한다 (Codex R4·R5):
     - `property` 와 `content` 의 순서에 의존하면 순서만 바뀐 정상 HTML 에서
       조용히 "못 찾음"이 되어 게이트가 비어 버린다.
     - `og:image` 를 느슨하게 찾으면 보조 태그인 `og:image:width` 가 먼저 걸려
       URL 대신 `1200` 을 읽는다. property 값을 «정확히» 대조해야 한다. */
export function readOgImage(html) {
  const tags = html.match(/<meta[^>]*>/gi) || [];
  for (const t of tags) {
    if (!/(property|name)=["']og:image["']/i.test(t)) continue;
    const c = /content=["']([^"']+)["']/i.exec(t);
    if (c) return c[1];
  }
  return null;
}

/* OG 이미지 URL — index.html 의 og:image 를 «그대로» 돌려준다.
   파일명·버전만 뽑아 재조합하면 호스트·경로가 바뀌는 순간 정적 페이지와
   문자열이 어긋난다(게이트가 요구하는 것은 «완전 동일»이다, Codex R5). */
export function ogImageHref() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const url = readOgImage(html);
  if (!url) throw new Error('index.html 에서 og:image 를 찾지 못했습니다.');
  return url;
}
