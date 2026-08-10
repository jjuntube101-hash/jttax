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
const parser = require('@babel/parser');

const ROOT = path.join(__dirname, '..');

(async () => {
  const bad = [];

  /* ── 정본 값 읽기 ──────────────────────────────────────────────── */
  const meta = await import(url.pathToFileURL(path.join(__dirname, '_shared', 'site-meta.mjs')).href);

  /* SPA 정본 Data.jsx 에서 법인 정보를 읽어 사본(부팅 폴백·에러 경계·site-meta)과 대조한다.
     사본끼리 맞춰 봐야 둘 다 틀리면 못 잡으므로 «정본 한 곳»을 기준으로 삼는다. */
  const dataJsx = fs.readFileSync(path.join(ROOT, 'project', 'src', 'Data.jsx'), 'utf8');

  /** Data.jsx 가 «순수 데이터 계약»을 지키는지 검사하고, 지킬 때만 firm 값을 돌려준다.

      🔑 여기까지 오는 데 일곱 라운드가 걸렸다 (260808 Codex P2a R3~R9). 기록해 둔다 —
        ① 파일 전체 문자열 검색      → firm «밖»의 동명 키에 걸림
        ② 첫 `firm: {` 중괄호 균형   → 주석·문자열 안의 `firm: {` 에 걸림
        ③ AST 첫 매치               → 중첩 scope·재대입·중복 firm
        ④ 최상위 단일 대입 강제      → spread·중복 키가 «뒤에서 덮음»
        ⑤ spread·중복키 차단        → computed·globalThis·별칭 경유가 남음
        ⑥ **vm 으로 실제 실행**      → 값은 정확해졌지만 두 가지가 새로 생겼다:
             · `node:vm` 은 격리 경계가 아니다(Node 공식 경고). 부작용 코드가 그대로 돈다
             · 지연 콜백(`Promise.then`)은 실행 시점엔 반영 전이라 여전히 옛 값을 읽는다
        ⑦ **계약으로 전환** ← 지금. 값을 «추론»하지도 «실행»하지도 않는다.

      계약: Data.jsx 는 순수 데이터여야 한다.
        ① 최상위 문장은 `window.JT_DATA = { … }` **하나뿐**
        ② 그 값은 객체·배열·문자열·숫자·불린·null **리터럴만**
           (함수 호출·spread·계산식·템플릿·식별자 참조·computed 키 전부 금지)

      계약이 서면 지연 콜백도 별칭 재대입도 «존재할 수 없고», 실행하지 않으니 vm 위험도
      없다. 계약이 깨지면 값을 읽지 않고 실패시킨다 — 애매하면 통과가 아니라 실패다.
      (현 Data.jsx 실측: 최상위 문장 1개·비리터럴 0건) */
  function readFirmContract(src) {
    let ast;
    try { ast = parser.parse(src, { sourceType: 'script', plugins: ['jsx'], errorRecovery: true }); }
    catch (e) { return { firm: null, error: '파싱 예외' }; }
    if (ast.errors && ast.errors.length) return { firm: null, error: `문법 오류 ${ast.errors.length}건` };

    const body = ast.program.body || [];
    if (body.length !== 1) {
      return { firm: null, error: `최상위 문장이 ${body.length}개 — 순수 데이터 파일이어야 합니다(계약 위반)` };
    }
    const st = body[0];
    if (st.type !== 'ExpressionStatement' || !st.expression
      || st.expression.type !== 'AssignmentExpression' || st.expression.operator !== '=') {
      return { firm: null, error: '최상위 문장이 window.JT_DATA 대입이 아님' };
    }
    const L = st.expression.left, R = st.expression.right;
    if (!(L.type === 'MemberExpression' && !L.computed
      && L.object && L.object.type === 'Identifier' && L.object.name === 'window'
      && L.property && L.property.name === 'JT_DATA')) {
      return { firm: null, error: '좌변이 window.JT_DATA 가 아님' };
    }
    if (!R || R.type !== 'ObjectExpression') return { firm: null, error: 'JT_DATA 가 객체 리터럴이 아님' };

    /** 리터럴만 허용하며 실제 값으로 환원한다. 하나라도 어긋나면 throw. */
    const LIT = (n) => {
      if (!n) throw new Error('빈 노드');
      switch (n.type) {
        case 'StringLiteral': case 'NumericLiteral': case 'BooleanLiteral': return n.value;
        case 'NullLiteral': return null;
        case 'ArrayExpression':
          // 배열 hole(`[1, , 2]`)은 elements 에 null 이 들어와 값이 모호해진다
          return n.elements.map((el) => { if (!el) throw new Error('배열 hole'); return LIT(el); });
        case 'ObjectExpression': {
          /* ⚠️ 일반 `{}` 를 쓰면 `__proto__` 키가 «프로토타입을 갈아끼워» 값이 상속으로
             읽힌다 — `{firm:{__proto__:{phone:'C'}}}` 는 순수 리터럴이라 통과하면서
             firm.phone 이 'C' 로 읽힌다 (260808 Codex P2a R10 P1).
             ① 키 자체를 거부하고 ② 상속이 아예 없는 null-prototype 객체에 담는다. */
          const o = Object.create(null);
          for (const p of n.properties) {
            if (p.type !== 'ObjectProperty' || p.computed) throw new Error(`${p.type}${p.computed ? '(computed)' : ''}`);
            const k = p.key.name || p.key.value;
            if (k === '__proto__') throw new Error('__proto__ 키(프로토타입 오염)');
            if (Object.prototype.hasOwnProperty.call(o, k)) throw new Error(`중복 키 ${k}`);
            o[k] = LIT(p.value);
          }
          return o;
        }
        default: throw new Error(n.type);
      }
    };
    let data;
    try { data = LIT(R); }
    catch (e) { return { firm: null, error: `순수 리터럴이 아닌 값(${e.message})이 있어 정본을 확정할 수 없음` }; }
    // own-property 로만 확인한다 — 상속으로 생긴 값을 정본으로 읽지 않기 위해
    if (!Object.prototype.hasOwnProperty.call(data, 'firm')) return { firm: null, error: 'JT_DATA.firm 이 없음' };
    if (!data.firm || typeof data.firm !== 'object') return { firm: null, error: 'JT_DATA.firm 이 객체가 아님' };
    return { firm: data.firm, error: null };
  }


  /* ── 정본 = 계약을 지킨 Data.jsx 에서 읽은 리터럴 값 ──────────── */
  const _run = readFirmContract(dataJsx);
  if (!_run.firm) bad.push(`Data.jsx — 정본(window.JT_DATA.firm)을 읽지 못했습니다: ${_run.error}`);
  {
    /* 계약 검사 자체검증 — 「순수 데이터가 아닌 것」은 전부 거부돼야 한다.
       ⚠️ 값을 읽는 게 아니라 «읽기를 거부하는지»가 핵심이다. 계약이 성립하는 파일에서만
          값을 읽으므로, 거부만 확실하면 값의 정확성은 리터럴 환원으로 보장된다. */
    const OKSRC = "window.JT_DATA={firm:{phone:'B'}};";
    const contractCases = [
      ['순수 리터럴', OKSRC, 'B'],
      ['중첩 객체·배열', "window.JT_DATA={firm:{phone:'B',tags:['a','b'],n:1,t:true,z:null}};", 'B'],
      // ↓ 전부 «거부»돼야 한다 (null 기대)
      ['spread', "window.JT_DATA={firm:{phone:'A'},...{firm:{phone:'B'}}};", null],
      ['중복 키', "window.JT_DATA={firm:{phone:'A',phone:'B'}};", null],
      ['computed 후속 변경', OKSRC + "window['JT_DATA'].firm.phone='C';", null],
      ['globalThis 경유', OKSRC + "globalThis.JT_DATA.firm.phone='C';", null],
      ['별칭 변수 경유', OKSRC + "const f=window.JT_DATA.firm;f.phone='C';", null],
      ['Object.assign', OKSRC + "Object.assign(window.JT_DATA.firm,{phone:'C'});", null],
      ['통째 재대입', OKSRC + "window.JT_DATA={firm:{phone:'C'}};", null],
      // ↓ R9 가 제시한 지연 콜백 — 실행 기반이었다면 옛 값을 읽고 통과했을 것
      ['Promise 지연 + 별칭', OKSRC + "Promise.resolve().then(()=>{const f=window.JT_DATA.firm;f.phone='C';});", null],
      ['queueMicrotask 지연', OKSRC + "queueMicrotask(()=>{window.JT_DATA.firm.phone='C';});", null],
      ['setTimeout 조건부', OKSRC + "if(location.search)setTimeout(()=>{window.JT_DATA.firm.phone='C';},0);", null],
      ['함수 호출로 값 생성', "window.JT_DATA={firm:{phone:makePhone()}};", null],
      ['템플릿 리터럴', "window.JT_DATA={firm:{phone:`02-${x}`}};", null],
      ['식별자 참조', "window.JT_DATA={firm:{phone:PHONE}};", null],
      ['계산식', "window.JT_DATA={firm:{phone:'02-'+'554'}};", null],
      ['computed 키', "window.JT_DATA={firm:{['pho'+'ne']:'B'}};", null],
      ['JT_DATA 없음', "const x = 1;", null],
      // ↓ R10 지적 — 프로토타입 오염·비리터럴 값 유형
      ['__proto__ 오염', "window.JT_DATA={firm:{__proto__:{phone:'C'}}};", null],
      ['getter(accessor)', "window.JT_DATA={firm:{get phone(){return 'C';}}};", null],
      ['메서드 축약', "window.JT_DATA={firm:{phone(){return 'C';}}};", null],
      ['배열 hole', "window.JT_DATA={firm:{phone:'B',a:[1,,2]}};", null],
      ['배열 안 spread', "window.JT_DATA={firm:{phone:'B',a:[...[1]]}};", null],
      ['unary 음수', "window.JT_DATA={firm:{phone:'B',n:-1}};", null],
      ['정규식 리터럴', "window.JT_DATA={firm:{phone:'B',r:/x/}};", null],
      ['bigint', "window.JT_DATA={firm:{phone:'B',n:1n}};", null],
      ['undefined 식별자', "window.JT_DATA={firm:{phone:'B',u:undefined}};", null],
    ];
    for (const [label, src, want] of contractCases) {
      const r = readFirmContract(src);
      const got = r.firm ? r.firm.phone : null;
      if (got !== want) {
        bad.push(`정본 계약 자체검증 실패 — 「${label}」은 ${want === null ? '거부돼야' : `'${want}' 여야`} 하는데 '${got}'${r.error ? ` (${r.error})` : ''}`);
      }
    }
  }

  /* ⚠️ 종전엔 여기서 «구조 위생»(extractFirmProps)과 «후속 변경 탐지»(findLateMutations)를
     따로 돌렸다. 계약 검사가 그 둘을 전부 포괄한다 —
       · spread·중복 키 → 리터럴 환원에서 거부
       · 후속 부분 수정·재대입·지연 콜백 → 「최상위 문장 1개」에서 거부
     같은 개념을 두 곳에서 판정하면 규칙이 갈라지므로 계약 하나로 남긴다 (260808 R9). */
  // 정본 값은 «실행 결과»에서 읽는다 — 어떤 문법으로 쓰였든 이게 런타임 값이다
  const pickData = (key) => {
    const v = _run.firm && _run.firm[key];
    return (typeof v === 'string' && v) ? v : null;
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

  /* ⚠️ 이 아래 방어선 검사들의 «남은 한계» (260808 Codex P2a R4 P1):
     문자열·구조만 본다. 「렌더 오류가 났을 때 실제로 그 화면이 뜨는가」는 브라우저가
     있어야 확인된다. 260808 에 수동 실증은 마쳤다 — Data.jsx 404 → 경계 화면,
     인라인 JSX 문법 오류 → 부팅 폴백(둘 다 전화·카톡·성명 표시 확인).
     그러나 **자동 회귀는 아니다.** Playwright 도입은 Phase 2b 진입 조건으로 남은 P1 이다.
     즉 이 게이트가 못 보는 구멍은 「구조는 통과했는데 실제로는 안 뜬다」이다.

     ── SPA 최후 방어선: 에러 경계 ────────────────────────────────────
     렌더 예외 하나가 나면 React 는 트리 전체를 언마운트한다 = 백지.
     260805 에 실제로 홈이 20분간 백지였고, 그때 사이트에 전화번호조차 남지 않았다.
     계산기가 안 되는 것과 «회사에 연락할 방법이 사라지는 것»은 손해의 크기가 다르다.
     → 경계가 지워지면 조용히 그 상태로 되돌아가므로 게이트로 붙잡는다 (260808). */
  {
    const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    if (!/class JTErrorBoundary/.test(idx)) {
      bad.push('index.html — JTErrorBoundary 가 없습니다. 렌더 예외 하나로 전 화면이 백지가 됩니다');
    }
    if (!/<JTErrorBoundary>[\s\S]{0,80}<App \/>/.test(idx)) {
      bad.push('index.html — <App /> 이 JTErrorBoundary 로 감싸여 있지 않습니다(정의만 있고 적용 안 됨)');
    }
    // 경계 화면에 «연락 수단»이 실제로 남는지 — 경계만 있고 빈 화면이면 의미가 없다
    const eb = (idx.match(/class JTErrorBoundary[\s\S]*?\n    \}/) || [''])[0];
    if (!/tel:/.test(eb)) bad.push('index.html — 에러 경계 화면에 전화 링크가 없습니다');
    if (!/kakao/i.test(eb)) bad.push('index.html — 에러 경계 화면에 카카오톡 링크가 없습니다');
    /* 새 창으로 열리는 링크는 그 사실을 알려야 한다(접근성). 부팅 폴백엔 있는데 경계엔
       없어 두 화면이 어긋나 있었다 — 한쪽만 고치는 일이 반복되므로 게이트로 묶는다.
       ⚠️ 「블록 안에 (새 창) 이 하나라도 있으면 통과」로 두면, 표기 없는 _blank 링크를
       하나 더 추가해도 그냥 넘어간다 (260808 Codex P2a R4 P2). 앵커 «하나하나» 본다. */
    const checkBlankLinks = (block, label) => {
      const anchors = block.match(/<a\b[\s\S]*?<\/a>/g) || [];
      anchors.forEach((a, i) => {
        /* ⚠️ `target="_blank"` 한 표기만 보면 변형에 뚫린다 (260808 Codex P2a R5·R6 P1):
             target = "_blank"  ·  target={'_blank'}  ·  target={`_blank`}  ·  target="_BLANK"
             target={'_' + 'blank'}   ← 값이 «리터럴이 아닌» 경우는 정적으로 알 수 없다
           리터럴은 대소문자 무시로 잡고, 비리터럴 target 은 «판정 불가»이므로 fail-closed. */
        /* ⚠️ JSX 는 속성을 spread 로도 넣는다 — `<a {...{target:'_blank'}} href="…">` 는
           실제로 새 창인데 `target=` 문자열이 없어 검사를 통째로 건너뛴다
           (260808 Codex P2a R7 P1). 확신할 수 없으므로 거부한다. */
        if (/\{\s*\.\.\./.test(a)) {
          bad.push(`index.html — ${label}에 속성 spread(\`{...}\`)를 쓴 링크가 있어 새 창 여부를 판정할 수 없습니다`);
          return;
        }
        const tgt = a.match(/target\s*=\s*(\{[^}]*\}|"[^"]*"|'[^']*')/);
        if (!tgt) return;                       // target 자체가 없으면 새 창 아님
        const raw = tgt[1];
        const lit = raw.match(/^\{?\s*["'`]([^"'`]*)["'`]\s*\}?$/);
        if (!lit) {
          // 예: target={cond ? '_blank' : '_self'} — 값을 확정할 수 없으니 통과시키지 않는다
          bad.push(`index.html — ${label}에 target 값이 표현식인 링크가 있어 새 창 여부를 판정할 수 없습니다 (${raw.slice(0, 40)})`);
          return;
        }
        if (lit[1].toLowerCase() !== '_blank') return;
        if (!/\(새 창\)/.test(a)) {
          const href = (a.match(/href\s*=\s*["{]?\s*["'`]?([^"'`\s}]+)/) || [])[1] || `#${i + 1}`;
          bad.push(`index.html — ${label}의 새 창 링크에 「(새 창)」 표기가 없습니다 (${href.slice(0, 40)})`);
        }
      });
    };
    checkBlankLinks(eb, '에러 경계');
    if (!/representative/.test(eb) || !/nameKr/.test(eb)) {
      bad.push('index.html — 에러 경계 화면에 사무소명·세무사 성명 표기가 없습니다(§33① 표시의무)');
    }
    /* 경계 화면이 JT_DATA 에 «조건부»로 매달리면, 그 파일이 못 읽힌 것이 실패 원인일 때
       연락처가 통째로 사라진다 — 상수 폴백이 있어야 한다 (260808 Codex P2a P1). */
    if (!/F\.phone \|\| '/.test(eb)) {
      bad.push('index.html — 에러 경계의 연락처가 JT_DATA 에만 의존합니다(상수 폴백 없음)');
    }

    /* ── 부팅 폴백: React 가 «실행조차 못 한» 경우의 최후 방어 ──────────
       에러 경계는 React 가 도는 뒤의 예외만 잡는다. 260805 실사고는 그 이전이었다 —
       JSX 문법 오류로 Babel 이 스크립트를 통째로 거부해 경계 코드도 죽었고, 홈이
       20분간 완전한 백지였다(전화번호조차 없었다). CDN 장애·번들 404 도 같은 결과다.
       → #root 안에 «자바스크립트 없이도 남는» HTML 을 둔다. React 마운트 시 교체된다. */
    /* ⚠️ 닫는 태그 짝(`</div></div>`)으로 잘라내면 폴백의 «태그를 바꾸는 순간» 게이트가
       거짓 실패한다(실제로 <div>→<main> 시맨틱 개선에서 4건 오탐). 검사 의도는
       «#root 안에 내용이 있는가»이므로, 여는 태그부터 다음 <script> 앞까지로 잡는다. */
    const rootStart = idx.indexOf('<div id="root">');
    const rootEnd = idx.indexOf('<script', rootStart);
    const rootBlock = (rootStart >= 0 && rootEnd > rootStart)
      ? idx.slice(rootStart + '<div id="root">'.length, rootEnd) : '';
    if (rootBlock.trim().length < 100) {
      bad.push('index.html — #root 가 비어 있습니다. 스크립트가 실행되지 않으면 백지가 됩니다(부팅 폴백 필요)');
    } else {
      if (!/tel:02-554-6405/.test(rootBlock)) bad.push('index.html — 부팅 폴백에 전화 링크가 없습니다');
      if (!/pf\.kakao\.com/.test(rootBlock)) bad.push('index.html — 부팅 폴백에 카카오톡 링크가 없습니다');
      if (!/제이티 세무법인/.test(rootBlock) || !/이현준/.test(rootBlock)) {
        bad.push('index.html — 부팅 폴백에 사무소명·세무사 성명이 없습니다(§33① 표시의무)');
      }
      // JT_DATA 를 참조하면 «그 파일을 못 읽은 상황»에서 무용지물이다
      if (/JT_DATA/.test(rootBlock)) {
        bad.push('index.html — 부팅 폴백이 JT_DATA 를 참조합니다. 스크립트 없이 렌더돼야 합니다');
      }
      checkBlankLinks(rootBlock, '부팅 폴백');

      /* ── 오류 안내는 «지연» 노출, 연락처는 «즉시» (260810) ──────────────
         이 화면은 오류 화면이 아니라 React 마운트 전까지 보이는 초기 HTML 이다.
         종전엔 첫 문장이 「문제가 생겼습니다 / 잠시 후 다시 시도해 주세요」라,
         정상적으로 기다리는 방문자에게 «고장 난 사이트»로 읽혔다(대표 지적).
         → 처음엔 「불러오는 중」, 6초가 지나도 그대로면 그때 오류 안내.

         ⛔ 이 구조에는 «조용히 망가지는» 실패가 둘 있고 둘 다 여기서 막는다.
            ① 오류 안내가 영영 안 나온다 — JS 가 죽은 진짜 상황에서 방문자가
               무한정 기다리게 된다. 전환은 CSS 여야 하고(JS 는 이미 죽었다),
               fill-mode:forwards 여야 하며, duration 0s 면 실행조차 안 하는
               구현이 있고, 동작 최소화 설정에서 애니메이션이 꺼질 수 있다.
            ② 연락처가 지연 블록 «안»에 들어간다 — 6초 동안 전화번호가 안 보인다.
               이 화면의 존재 이유가 바로 그 연락처다. */
      /* ⚠️ 260810 Codex R1 P1: 초판은 «첫» 선언만 봤다. 그러면 뒤에 animation:none 을
         하나 더 얹기만 해도 앞의 정상 shorthand 에서 forwards·.4s 를 찾아 통과하는데
         실제 계산값은 «애니메이션 없음»이다 — 오류 안내가 영영 안 나오는 회귀가
         조용히 지나간다. 그래서 «중괄호 균형»으로 at-rule 을 걷어내고, 무조건부에
         남은 .jt-boot__late 선언을 «전부» 모아 마지막에 이기는 값으로 판정한다. */
      const styleBlocks = (idx.match(/<style>[\s\S]*?<\/style>/g) || []).join('\n');
      /* @media / @supports 를 중괄호 짝을 세어 제거 — 정규식 [\s\S]*?\}\s*\} 는
         중첩 at-rule 에서 안쪽만 지우고 바깥을 남긴다(Codex R1 P2). */
      const stripAtRules = (css) => {
        let out = '', i = 0;
        while (i < css.length) {
          const at = css.indexOf('@', i);
          if (at < 0) { out += css.slice(i); break; }
          const name = (css.slice(at).match(/^@([a-z-]+)/i) || [])[1] || '';
          if (name !== 'media' && name !== 'supports') { out += css.slice(i, at + 1); i = at + 1; continue; }
          const open = css.indexOf('{', at);
          if (open < 0) { out += css.slice(i); break; }
          let depth = 1, k = open + 1;
          while (k < css.length && depth > 0) {
            if (css[k] === '{') depth++;
            else if (css[k] === '}') depth--;
            k++;
          }
          out += css.slice(i, at);
          i = k;
        }
        return out;
      };
      /* @supports 안의 규칙은 «그 기능을 쓸 수 있는 브라우저»에서 실제로 적용된다.
         지연 노출의 본체가 거기 있으므로, 판정은 「무조건부 + @supports(animation) 안」을
         합친 것으로 한다. @media 는 조건부라 제외하고 별도 검사한다. */
      const supportsBlock = (styleBlocks.match(/@supports[^{]*animation[^{]*\{([\s\S]*?)\n\s*\}/) || [])[1] || '';
      const 판정대상 = stripAtRules(styleBlocks) + '\n' + supportsBlock;
      const lateDecls = [...판정대상.matchAll(/\.jt-boot__late\s*\{([^}]*)\}/g)].map((m) => m[1]);
      if (!lateDecls.length) {
        bad.push('index.html — 부팅 폴백에 지연 노출 규칙(.jt-boot__late)이 없습니다. 정상 대기 중에도 오류 문구가 보입니다');
      } else {
        /* 「마지막에 이기는 값」 — 같은 속성이 여러 번 나오면 뒤가 이긴다 */
        const 이긴값 = (prop) => {
          let v = null;
          for (const d of lateDecls) {
            for (const m of d.matchAll(new RegExp(prop + '\\s*:\\s*([^;]+)', 'gi'))) v = m[1].trim();
          }
          return v;
        };
        const anim = 이긴값('animation');
        if (!anim) {
          bad.push('index.html — .jt-boot__late 에 animation 이 없습니다. JS 가 죽은 상황에서 오류 안내가 영영 안 나옵니다');
        } else if (/^\s*none\b/i.test(anim)) {
          bad.push('index.html — .jt-boot__late 의 최종 animation 이 none 입니다(뒤 선언이 앞을 덮었습니다). 오류 안내가 영영 안 나옵니다');
        } else {
          if (!/forwards/.test(anim)) {
            bad.push('index.html — .jt-boot__late 의 최종 animation 에 fill-mode:forwards 가 없습니다. 애니메이션이 끝나면 다시 사라집니다');
          }
          const dur = (anim.match(/(\d*\.?\d+)m?s/) || [])[1];
          if (dur !== undefined && parseFloat(dur) === 0) {
            bad.push('index.html — .jt-boot__late 의 animation-duration 이 0 입니다. 0초 애니메이션을 실행하지 않는 구현에서 오류 안내가 안 나옵니다');
          }
        }
        /* 숨기는 수단이 opacity 뿐이면 스크린리더가 6초 전에 오류 안내를 낭독한다 —
           눈으로 보는 사람과 다른 정보를 받는다 (260810 Codex R1). */
        if (!lateDecls.some((d) => /visibility\s*:\s*hidden/.test(d))) {
          bad.push('index.html — .jt-boot__late 를 opacity 로만 숨깁니다. opacity:0 은 접근성 트리에서 제거되지 않아 스크린리더가 6초 전에 오류 안내를 읽습니다(visibility:hidden 필요)');
        }
        /* 애니메이션을 못 쓰는 환경에서 «안 보이는 쪽»으로 실패하면 방문자가 무한정 기다린다.
           @supports 밖(무조건부)의 기본값이 보이는 값이어야 한다. */
        const 무조건decls = [...stripAtRules(styleBlocks).matchAll(/\.jt-boot__late\s*\{([^}]*)\}/g)].map((m) => m[1]);
        const 기본노출 = 무조건decls.some((d) => /opacity\s*:\s*1/.test(d) && !/visibility\s*:\s*hidden/.test(d));
        if (!기본노출) {
          bad.push('index.html — 애니메이션 미지원 환경의 기본값이 «보임»이 아닙니다. 그런 브라우저에서 오류 안내가 영영 안 나옵니다(@supports 밖에 opacity:1 필요)');
        }
        /* 동작 최소화 설정 — 보이게 하는 것만으로 부족하다. animation 도 꺼야 값이 안정된다. */
        const rm = (styleBlocks.match(/@media\s*\(prefers-reduced-motion[^{]*\{([\s\S]*?)\n\s*\}/) || [])[1] || '';
        const rmLate = (rm.match(/\.jt-boot__late\s*\{([^}]*)\}/) || [])[1] || '';
        if (!rmLate || !/opacity\s*:\s*1/.test(rmLate) || !/visibility\s*:\s*visible/.test(rmLate)) {
          bad.push('index.html — 동작 최소화(prefers-reduced-motion)에서 .jt-boot__late 를 보이게 하는 규칙이 없습니다(visibility:visible + opacity:1). 그 설정 사용자는 오류 안내를 못 봅니다');
        }
        if (rmLate && !/animation\s*:\s*none/.test(rmLate)) {
          bad.push('index.html — 동작 최소화 규칙에 animation:none 이 없습니다. 애니메이션이 계속 돌아 값이 되돌아갈 수 있습니다');
        }
      }
      const lateBlocks = rootBlock.match(/<[^>]*class="jt-boot__late"[^>]*>[\s\S]*?<\/[a-z]+>/gi) || [];
      for (const b of lateBlocks) {
        if (/tel:|pf\.kakao\.com/.test(b)) {
          bad.push('index.html — 연락처가 지연 노출 블록 안에 있습니다. 6초 동안 전화번호가 안 보입니다');
        }
      }
      /* 즉시 보이는 부분에 오류 표현이 있으면 정상 대기가 고장으로 읽힌다 */
      const 즉시 = lateBlocks.reduce((s, b) => s.replace(b, ''), rootBlock);
      for (const w of ['문제가 생겼', '오류', '실패', '다시 시도해']) {
        if (즉시.indexOf(w) >= 0) {
          bad.push('index.html — 부팅 폴백에서 «즉시» 보이는 부분에 「' + w + '」가 있습니다. 정상 대기 중인 방문자에게 고장으로 읽힙니다');
        }
      }
    }

    /* ── 연락처가 세 곳에 있다: Data.jsx(정본) · 부팅 폴백 · 에러 경계 폴백 ──
       폴백들은 «JT_DATA 를 못 읽은 상황»이 존재 이유라 상수일 수밖에 없다. 그래서
       중복 자체는 없앨 수 없고, 대신 «어긋나면 알아채게» 만든다 (260808 Codex P2a R2 P1).
       전화번호가 바뀌었는데 한 곳만 고치면, 사고가 난 순간 방문자가 «없는 번호»로 전화한다. */
    // 정본은 위에서 잘라 둔 firmBlock 하나만 쓴다 (pickData 와 같은 범위)
    const truth = {
      전화: pickData('phone') || '',
      카톡: pickData('kakaoChannelUrl') || '',
      사무소명: pickData('nameKr') || '',
      대표: pickData('representative') || '',
      주소: pickData('address') || '',
    };
    /* 클래스 «전체»를 잡아야 한다 — 상수 폴백은 render() 안에 있어서, 첫 메서드까지만
       끊으면 값을 못 찾고 게이트가 거짓 실패를 낸다(실측 4건). 마운트 호출 직전까지 본다. */
    const ebStart = idx.indexOf('class JTErrorBoundary');
    const ebEnd = idx.indexOf('ReactDOM.createRoot', ebStart);
    const ebBlock = (ebStart >= 0 && ebEnd > ebStart) ? idx.slice(ebStart, ebEnd) : '';
    if (!ebBlock) bad.push('index.html — 에러 경계 블록을 찾지 못했습니다(게이트가 검사할 대상이 없습니다)');
    for (const [label, val] of Object.entries(truth)) {
      if (!val) { bad.push(`Data.jsx — firm.${label} 값을 읽지 못했습니다(게이트가 대조할 정본이 없습니다)`); continue; }
      if (rootBlock.indexOf(val) < 0) {
        bad.push(`index.html 부팅 폴백 — ${label} 이 Data.jsx 와 다릅니다(정본 「${val}」). 연락처를 바꿀 땐 세 곳을 함께 고치세요`);
      }
      // 에러 경계는 주소·영업시간을 싣지 않으므로 연락 3종만 본다
      if (['전화', '카톡', '사무소명', '대표'].includes(label) && ebBlock.indexOf(val) < 0) {
        bad.push(`index.html 에러 경계 — ${label} 이 Data.jsx 와 다릅니다(정본 「${val}」)`);
      }
    }
  }

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
