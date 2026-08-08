/* 정적 페이지 셸 게이트 (260808 신설 · Codex R1 반영)

   막으려는 사고 두 가지 — 둘 다 실제로 일어나 있었다.

   1) 광고 표시의무 누락 (세무사법 시행령 §33①, 본조신설 2026.6.9)
      광고에는 «사무소명 + 세무사 성명»을 표시해야 한다. SPA 푸터는 지키고 있었지만
      생성된 정적 45 장의 푸터는 `© 2026 JT TAX CORP.` 한 줄이라 둘 다 없었다.
      260711 컴플라이언스 메모가 지적했는데도 260808 까지 그대로 라이브였다.

   2) CSS 캐시가 안 깨지는 문제
      정적 페이지는 `styles.css` 를 «버전 쿼리 없이» 링크하고 있었다. CSS 를 고쳐도
      재방문자는 옛 스타일을 받는다. index.html 만 `?v=` 를 쓰고 있어 둘이 어긋났다.

   ★ 게이트가 «비어 있지» 않게 하는 세 가지 원칙
      - 대상 목록을 손으로 적지 않는다 → 데이터를 실제로 import 해서 뽑는다.
        (숫자를 박아 두면 계산기를 custom 으로 등재하는 순간 그 페이지가 조용히 빠진다.
         youthstartup 이 정확히 그 상태였다 — 라이브인데 데이터엔 없는 고아)
      - 문서 «어딘가»가 아니라 «푸터 안»을 본다. 제목·스크립트에 이름이 있어도
        푸터가 비었으면 표시의무 미충족이다.
      - 법인 정보는 SPA 정본(Data.jsx)과 대조한다. 사본끼리 맞춰 봐야 둘 다 틀리면 못 잡는다.
*/
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = path.join(__dirname, '..');

(async () => {
  const bad = [];

  /* ── 정본 값 읽기 ──────────────────────────────────────────────── */
  const meta = await import(url.pathToFileURL(path.join(__dirname, '_shared', 'site-meta.mjs')).href);

  /* SPA 정본 Data.jsx 에서 법인명·대표자를 «추출»해 대조한다 (사본 드리프트 차단) */
  const dataJsx = fs.readFileSync(path.join(ROOT, 'project', 'src', 'Data.jsx'), 'utf8');
  const pickData = (key) => {
    const m = new RegExp(`${key}:\\s*'([^']+)'`).exec(dataJsx);
    return m ? m[1] : null;
  };
  const firmKr = pickData('nameKr');
  const rep = pickData('representative');
  if (!firmKr || !rep) {
    bad.push('Data.jsx — nameKr / representative 를 읽지 못했습니다 (구조 변경?)');
  } else {
    if (meta.FIRM !== firmKr) bad.push(`site-meta.FIRM「${meta.FIRM}」≠ Data.jsx.nameKr「${firmKr}」`);
    if (!meta.TAX_ACCOUNTANT.includes(rep)) bad.push(`site-meta.TAX_ACCOUNTANT「${meta.TAX_ACCOUNTANT}」에 Data.jsx.representative「${rep}」가 없습니다`);
  }
  const FIRM = firmKr || meta.FIRM;
  const NAME = rep || '이현준';

  /* index.html 이 자산 버전의 SSOT */
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const stylesV = /project\/src\/styles\.css\?v=(\d+)/.exec(indexHtml);
  if (!stylesV) bad.push('index.html — styles.css 의 ?v= 를 찾지 못했습니다 (구조 변경?)');
  /* 파서는 site-meta 의 것을 «재사용»한다 — 복제하면 한쪽만 보완되어 어긋난다(Codex R5) */
  const readOgTag = meta.readOgImage;
  const indexOg = readOgTag(indexHtml);
  const ogM = indexOg && /og-image\.png(?:\?v=(\d+))?/.exec(indexOg);
  const ogV = ogM ? (ogM[1] || '') : null;
  if (ogV === null) bad.push('index.html — og:image 를 찾지 못했습니다 (구조 변경?)');
  else if (ogV === '') bad.push('index.html — og:image 에 ?v= 가 없습니다 (SNS 공유 캐시가 안 깨집니다)');
  /* 공유 이미지 3필드(og:image·twitter:image·JSON-LD image)를 한 함수로 검사한다.
     index.html 과 정적 페이지에 «다른 기준»을 쓰면 그 분기가 곧 구멍이 된다(Codex R8).
     세 필드 모두 «없어도 FAIL» — 있으면 검사하는 방식은 지워 버리는 것이 우회로다. */
  const checkShareImages = (rel, html, expected) => {
    const twTag = (html.match(/<meta[^>]*>/gi) || []).find((t) => /(name|property)=["']twitter:image["']/i.test(t));
    const twUrl = twTag && (/content=["']([^"']+)["']/i.exec(twTag) || [])[1];
    if (!twUrl) bad.push(`${rel} — twitter:image 가 없습니다 (트위터·일부 메신저에서 미리보기 누락)`);
    else if (twUrl !== expected) bad.push(`${rel} — twitter:image 가 og:image 와 다릅니다 (${twUrl.slice(0, 70)})`);

    /* JSON-LD 는 «파싱해서» 본다. 문자열만 grep 하면 본문 어디에 있는 `"image"` 도
       통과하고, 깨진 JSON-LD 는 영영 안 잡힌다(Codex R7). */
    const ldBlocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
    if (ldBlocks.length === 0) { bad.push(`${rel} — JSON-LD 블록이 없습니다`); return; }
    const ldImages = [];
    for (const raw of ldBlocks) {
      let obj;
      try { obj = JSON.parse(raw); } catch (e) {
        bad.push(`${rel} — JSON-LD 가 깨졌습니다 (JSON 파싱 실패: ${String(e.message).slice(0, 60)})`);
        continue;
      }
      for (const node of Array.isArray(obj) ? obj : [obj]) {
        if (node && typeof node.image === 'string') ldImages.push(node.image);
      }
    }
    if (ldImages.length === 0) bad.push(`${rel} — JSON-LD 에 image 가 없습니다`);
    else {
      const off = ldImages.find((u) => u !== expected);
      if (off) bad.push(`${rel} — JSON-LD image 가 og:image 와 다릅니다: ${off.slice(0, 80)}`);
    }
  };

  if (ogV) checkShareImages('index.html', indexHtml, indexOg);

  /* ── 검사 대상 산출 ─────────────────────────────────────────────── */
  const listHtml = (dir) => {
    const p = path.join(ROOT, dir);
    if (!fs.existsSync(p)) return [];
    return fs.readdirSync(p).filter((f) => f.endsWith('.html')).map((f) => `${dir}/${f}`);
  };

  const generated = [...listHtml('insights'), ...listHtml('calculators')];
  const desk = listHtml('desk');

  /* custom:true = 빌더가 «덮어쓰지 않는» 수기 페이지. 정규식으로 소스를 긁지 않고
     데이터 모듈을 실제로 import 한다 — 주석 속 `custom: true` 같은 것에 걸리지 않게. */
  const calcMod = await import(url.pathToFileURL(path.join(__dirname, 'calculators', 'calculators.data.mjs')).href);
  const customSlugs = calcMod.CALCULATORS.filter((c) => c.custom).map((c) => c.slug);
  if (customSlugs.length === 0) bad.push('calculators.data.mjs — custom:true 가 하나도 없습니다 (데이터 구조 확인)');
  const handwritten = [...customSlugs.map((s) => `calculators/${s}.html`), ...desk];

  /* 수기 목록은 생성 목록에서 뺀다 — 같은 파일을 두 기준으로 재지 않는다 */
  const generatedOnly = generated.filter((f) => !handwritten.includes(f));

  /* 데이터 ↔ 산출물 대조: 소스에서 지워도 옛 HTML 이 남아 계속 배포되는 것을 막는다.
     빌더는 «생성만» 하고 지우지 않으며 sitemap 은 디렉터리를 통째로 열거하므로,
     이 대조가 없으면 죽은 페이지가 색인된 채로 남는다. */
  const postsDir = path.join(ROOT, 'project', 'insights');
  const postSlugs = fs.readdirSync(postsDir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}-.+\.md$/.test(f))
    .map((f) => f.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, ''));
  listHtml('insights').map((f) => path.basename(f, '.html'))
    .filter((s) => !postSlugs.includes(s))
    .forEach((s) => bad.push(`insights/${s}.html — 대응 원고(.md)가 없습니다. 원고를 지웠다면 HTML 도 지우세요(계속 배포됩니다)`));

  const calcSlugs = calcMod.CALCULATORS.map((c) => c.slug);
  listHtml('calculators').map((f) => path.basename(f, '.html'))
    .filter((s) => s !== 'index' && !calcSlugs.includes(s))
    .forEach((s) => bad.push(`calculators/${s}.html — calculators.data.mjs 에 없는 고아 페이지입니다(허브에서 못 찾는데 색인은 됩니다). 등재하거나 삭제하세요`));

  /* ── 페이지별 검사 ─────────────────────────────────────────────── */
  const checkPage = (rel, { requireShellMarker }) => {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) { bad.push(`${rel} — 파일 없음 (데이터엔 있는데 산출물이 없습니다)`); return; }
    const html = fs.readFileSync(p, 'utf8');

    /* §33① 표시의무 — «푸터 블록 안»에 있어야 한다. 문서 어딘가가 아니라.
       마커도 같은 블록에서 본다: 마커를 head 에 두고 푸터는 비워 두는 식으로
       형식만 맞추는 통과를 막는다(Codex R2). 푸터가 여럿이면 «하나라도»
       조건을 만족하면 되지만, 만족하는 게 하나도 없으면 실패다. */
    const footers = html.match(/<footer[\s\S]*?<\/footer>/gi) || [];
    if (footers.length === 0) {
      bad.push(`${rel} — <footer> 가 없습니다`);
    } else {
      const ok = footers.find((f) => f.includes(FIRM) && f.includes(NAME) && /<!--\s*jt-shell v\d+\s*-->/.test(f));
      if (!ok) {
        const missing = [];
        if (!footers.some((f) => f.includes(FIRM))) missing.push(`사무소명 「${FIRM}」`);
        if (!footers.some((f) => f.includes(NAME))) missing.push(`세무사 성명 「${NAME}」`);
        if (!footers.some((f) => /<!--\s*jt-shell v\d+\s*-->/.test(f))) missing.push('jt-shell 마커');
        bad.push(`${rel} — 공통 셸 푸터 조건 미충족 (시행령 §33①): ${missing.length ? missing.join(' · ') + ' 없음' : '한 푸터 안에 함께 있지 않음'}`);
      }
    }

    /* OG 이미지 — 있으면 검사하는 게 아니라 «있어야» 한다. 태그를 지우거나 다른
       URL 로 바꿔도 통과하면 게이트가 비어 있는 것이다(Codex R3). 버전이 어긋나면
       공유 미리보기가 옛 이미지(구 브랜드 골드 배너)로 굳는다. */
    if (ogV !== null) {
      const ogUrl = readOgTag(html);
      if (!ogUrl) {
        bad.push(`${rel} — og:image 가 없습니다 (SNS 공유 시 미리보기 이미지 없음)`);
      } else if (ogUrl !== indexOg) {
        /* 파일명·버전만 보면 `https://cdn.example/og-image.png?v=2` 같은 외부 URL 도
           통과한다(Codex R4). URL «전체»를 index.html 과 대조한다. */
        bad.push(`${rel} — og:image 가 index.html 과 다릅니다: ${ogUrl.slice(0, 90)}`);
      }
      /* index.html 에만 요구하고 정적 47장은 봐주면 그게 구멍이다(Codex R6).
         «같은 함수»로 검사한다 — 기준이 갈리면 그 분기가 곧 구멍이다(R8). */
      checkShareImages(rel, html, indexOg);
    }

    /* CSS 캐시 버전 — index.html 과 같은 번호여야 한다 */
    if (stylesV) {
      const m = /\/project\/src\/styles\.css(\?v=(\d+))?/.exec(html);
      if (!m) bad.push(`${rel} — styles.css 링크 없음`);
      else if (!m[2]) bad.push(`${rel} — styles.css 에 ?v= 가 없습니다 (캐시가 안 깨집니다)`);
      else if (m[2] !== stylesV[1]) bad.push(`${rel} — styles.css?v=${m[2]} 인데 index.html 은 ?v=${stylesV[1]} 입니다`);
    }

    /* 버전 없는 로컬 CSS 링크가 더 있으면 알린다 */
    const reAnyCss = /<link[^>]+href=["']([^"']*\/project\/src\/[^"']+\.css)(\?v=\d+)?["']/gi;
    let c;
    while ((c = reAnyCss.exec(html)) !== null) {
      if (!c[2]) bad.push(`${rel} — 버전 없는 CSS 링크: ${c[1]}`);
    }
    void requireShellMarker; /* 마커는 이제 전 페이지 공통 요구 */
  };

  generatedOnly.forEach((f) => checkPage(f, { requireShellMarker: true }));
  handwritten.forEach((f) => checkPage(f, { requireShellMarker: true }));

  /* ── 결과 ───────────────────────────────────────────────────────── */
  const total = generatedOnly.length + handwritten.length;
  console.log(`대상: 생성 ${generatedOnly.length}장 + 수기 ${handwritten.length}장 (custom ${customSlugs.length} + desk ${desk.length}) · 원고 ${postSlugs.length}건`);
  if (total < 20) bad.push(`검사 대상이 ${total}장뿐입니다 — 열거가 깨졌는지 확인하세요 (정상은 45장 이상)`);

  bad.forEach((b) => console.log('FAIL  ' + b));
  console.log(`${bad.length ? '' : 'PASS  '}정적 셸 정합 (푸터 표시의무·셸 마커·CSS 버전·원고 대조)`);
  console.log(`\n════════════════════\n정적 셸 게이트 실패 ${bad.length}건`);
  process.exit(bad.length ? 1 : 0);
})().catch((e) => {
  console.log('FAIL  게이트 자체 오류 — ' + (e && e.message ? e.message : e));
  console.log('\n════════════════════\n정적 셸 게이트 실패 1건');
  process.exit(1);
});
