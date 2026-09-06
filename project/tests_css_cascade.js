'use strict';
/* ══════════════════════════════════════════════════════════════════════════
   CSS 캐스케이드 게이트 — 「썼는데 안 먹는 규칙」을 잡는다 (260809 신설)

   ▣ 왜 만들었나 (실사고)
     첫 화면 계산기를 배포한 «뒤» 라이브에서 재 보니 375×812 에서 「세액 계산」
     버튼이 bottom 812px — 화면 경계에 정확히 걸려 사실상 안 보였다.
     CSS 에는 분명히 모바일 압축 규칙이 있었는데 셋 다 죽어 있었다.

       ① @media(max-width:640px) 안의  .jt-brandmoment{ padding: 34px ... !important }
          가, 파일 «뒤»의 무조건 규칙 .jt-brandmoment{ padding-top: clamp(96px…) !important }
          에 덮였다. 미디어쿼리는 우선순위를 올려 주지 않는다 — 같은 선택자·같은
          !important 면 «뒤에 쓴 것»이 이긴다. 그래서 여백이 34px 이 아니라 96px 였다.
       ② 압축 규칙이 .jt-bm-logosvg 를 겨냥하고 있었는데, 로고를 공식 PNG(.jt-bm-primary)
          로 교체하면서 그 요소가 DOM 에서 사라졌다. 규칙은 남았고 대상은 없었다.
       ③ 세로 압축 규칙에 min-width:641px 이 붙어 «모바일이 통째로 제외»돼 있었고,
          768×1024(태블릿 세로)는 어느 규칙에도 안 걸리는 구멍이었다(-93px).

   ▣ 이 게이트가 «못» 잡는 것 (위협 모델 — 과신 금지)
     - 실제 픽셀 높이. 규칙이 살아 있어도 값이 모자라면 여전히 접힌다.
       그건 브라우저에서 재는 수밖에 없다(헤드리스 미도입 — 의존성 0 유지).
     - 선택자 특정도(specificity)가 «다른» 두 규칙 사이의 승패. 같은 선택자
       문자열끼리만 본다. 예컨대 `.home .jt-brandmoment{...}` 를 새로 넣으면
       특정도가 높아 실제로는 이기는데 이 게이트는 보지 못한다. 좁게 잡은 대신
       위양성이 없다 — 넓히려면 특정도 계산이 필요하고 :is()/:has() 때문에
       그 자체가 새 오판원이 된다.
     - CSS_FILES 에 없는 스타일시트. index.html 이 styles.css 도 로드하는데
       거기에는 히어로 선택자가 없어 대상에서 뺐다(아래 SHEET_NOTE 로 매 실행 고지).
     - @layer / @container / @scope / CSS nesting. 이 프로젝트가 쓰지 않는다.
     - 자바스크립트가 style 속성으로 덮는 경우.

   ▣ 파서의 «판정 보류» 원칙
     해석 못 하는 미디어 조건(not/only/범위문법)·길이식(calc 등)은 «참»도 «거짓»도
     아닌 null 로 두고, 그 건수를 매 실행 로그에 찍는다. 조용히 참·거짓 어느 한쪽으로
     밀어 넣으면 게이트가 «본 척»하게 된다 — 260809 Codex R1 P1-3·P1-5 지적.
   ══════════════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
/* ── 검사 대상 = index.html 이 «실제로 로드하는 순서»의 시트 전부 (260906 C1 확장) ─────
   styles.css(v26) → redesign.css(v49). styles.css:2 는 @import 로 colors_and_type.css 를 끌어오므로
   캐스케이드 순서는 colors_and_type → styles(나머지) → redesign 이다. 파서·로더는 css_cascade_lib.js.
   ⛔ 세 장을 그대로 이어붙이지 않는다 — 이유는 lib 머리말(«@import prelude»).
   자기시험용 환경변수(운영 실행에서는 절대 설정되지 않는다 — tests_css_cascade_selftest.js 만 쓴다):
     CSS_CASCADE_TARGET  = redesign.css 자리에 끼울 «결함 주입 사본» 경로 (260809 부터 있던 것)
     CSS_CASCADE_SOURCES = JSON {"project/src/styles.css": "사본경로", ...} — 루트 상대경로 이름으로 시트를 바꿔 끼운다 */
const ROOT = path.join(__dirname, '..');
const lib = require('./css_cascade_lib.js');
const { maskOut, splitTop, expand, mediaText } = lib;
const overrides = lib.envOverrides(process.env);

const SHEET_NOTE = '특정도가 «다른» 선택자끼리의 승패·인라인 style·JS 가 덮는 값은 이 게이트 밖이다 — ' +
                   '브라우저 computed style(신선 로드 4해상도)로 보완한다(계획 v2.5 A-1).';

/* ── 알려진 기존 위반 (260809 등재) ───────────────────────────────────────
   히어로 작업 중 이 게이트를 새로 만들면서 «전부터 있던» 위반 5건이 같이 드러났다.
   전부 브라우저에서 실측해 진짜임을 확인했지만(위양성 0), 이번 작업 범위 밖이라
   손대지 않고 등재한다. ⛔ 이 목록은 «묻어 두는 곳»이 아니다 —
   해소되면 아래 STALE 검사가 「예외가 불필요해졌다」고 FAIL 을 낸다.

   ⚠️ key 에 «미디어 조건»까지 넣는다. 선택자·속성만으로 묶으면, 등재된 위반을
      고친 뒤 «같은 선택자·같은 속성»의 새 위반이 다른 조건에서 생겨도 조용히
      통과한다(260809 Codex R1 P1-6). 형식: `선택자 | 속성 | 미디어조건`. */
const KNOWN = [
  { key: '.jt-sithero | padding-bottom | (max-width: 640px)',
    실측: '84px (모바일 의도는 0px)',
    사유: '상황 카드와 히어로 사이 여백. 첫 화면 밖이라 이번 범위에서 제외.' },
  { key: '.jt-nav__brand img | height | (max-width: 640px)',
    실측: '38px (의도 34px — 600px 이하 블록이 대신 이김)',
    사유: '4px 차이이고 넘침도 없다. 나란히 있는 두 규칙을 정리할 때 함께.' },
  { key: '.jt-app::before | background-image | (max-width: 640px)',
    실측: 'none (모바일 격자 배경이 안 나옴)',
    사유: '700행이 배경 격자를 전역 제거한 «뒤»에 남은 잔재로 보인다. 디자인 판단 필요.' },
  { key: '.jt-brandmoment:has(.jt-brandmoment__logowrap.is-visible)::before | animation | (prefers-reduced-motion: reduce)',
    실측: '무해 — 뒤쪽에 같은 의도의 reduced-motion 블록이 또 있어 실제로는 꺼진다',
    사유: '중복 선언. 지우면 되지만 동작에 영향이 없어 범위 밖.' },
  { key: 'SEL .jt-report-feature',
    실측: 'DOM 0개',
    사유: '보고서 변환 페이지 개편 때 사라진 클래스. 규칙만 남았다.' },
  /* ── 260906 C1: 검사 범위를 styles.css 까지 넓히자 드러난 «구 디자인 잔재» 21건 ──
     전부 styles.css 의 미디어쿼리 압축 규칙이 겨냥하는 클래스인데 JSX·HTML 어디에도 없다
     (구 히어로 jt-hero__*·구 팀 카드 jt-team*·수수료표 jt-fees__*·jt-creds 등). 이번 범위(게이트 확장,
     라이브 시각 변화 0)에서는 손대지 않고 등재만 한다 — 장부화 C3+C4 가 styles.css 구 블록을
     지우면서 «순감소»시키고, 해소되면 아래 STALE 검사가 예외 삭제를 요구한다. */
  { key: 'SEL .jt-hero__scope', 실측: 'DOM 0개', 사유: 'styles.css 구 디자인 잔재(260906 C1 등재) — C3+C4 에서 제거.' },
  { key: 'SEL .jt-hero__pledge', 실측: 'DOM 0개', 사유: 'styles.css 구 디자인 잔재(260906 C1 등재) — C3+C4 에서 제거.' },
  { key: 'SEL .jt-hero__copyswitch', 실측: 'DOM 0개', 사유: 'styles.css 구 디자인 잔재(260906 C1 등재) — C3+C4 에서 제거.' },
  { key: 'SEL .jt-hero__copyswitch-btn', 실측: 'DOM 0개', 사유: 'styles.css 구 디자인 잔재(260906 C1 등재) — C3+C4 에서 제거.' },
  { key: 'SEL .jt-team-feature', 실측: 'DOM 0개', 사유: 'styles.css 구 디자인 잔재(260906 C1 등재) — C3+C4 에서 제거.' },
  { key: 'SEL .jt-team-feature__head', 실측: 'DOM 0개', 사유: 'styles.css 구 디자인 잔재(260906 C1 등재) — C3+C4 에서 제거.' },
  { key: 'SEL .jt-team-feature__avatar', 실측: 'DOM 0개', 사유: 'styles.css 구 디자인 잔재(260906 C1 등재) — C3+C4 에서 제거.' },
  { key: 'SEL .jt-team-feature__name', 실측: 'DOM 0개', 사유: 'styles.css 구 디자인 잔재(260906 C1 등재) — C3+C4 에서 제거.' },
  { key: 'SEL .jt-team-feature__grid', 실측: 'DOM 0개', 사유: 'styles.css 구 디자인 잔재(260906 C1 등재) — C3+C4 에서 제거.' },
  { key: 'SEL .jt-team-feature__bio', 실측: 'DOM 0개', 사유: 'styles.css 구 디자인 잔재(260906 C1 등재) — C3+C4 에서 제거.' },
  { key: 'SEL .jt-hero__impact', 실측: 'DOM 0개', 사유: 'styles.css 구 디자인 잔재(260906 C1 등재) — C3+C4 에서 제거.' },
  { key: 'SEL .jt-hero__impact-cell', 실측: 'DOM 0개', 사유: 'styles.css 구 디자인 잔재(260906 C1 등재) — C3+C4 에서 제거.' },
  { key: 'SEL .jt-hero__impact-num', 실측: 'DOM 0개', 사유: 'styles.css 구 디자인 잔재(260906 C1 등재) — C3+C4 에서 제거.' },
  { key: 'SEL .jt-fees__row', 실측: 'DOM 0개', 사유: 'styles.css 구 디자인 잔재(260906 C1 등재) — C3+C4 에서 제거.' },
  { key: 'SEL .jt-fees__range', 실측: 'DOM 0개', 사유: 'styles.css 구 디자인 잔재(260906 C1 등재) — C3+C4 에서 제거.' },
  { key: 'SEL .jt-team__card', 실측: 'DOM 0개', 사유: 'styles.css 구 디자인 잔재(260906 C1 등재) — C3+C4 에서 제거.' },
  { key: 'SEL .jt-section--inverse', 실측: 'DOM 0개', 사유: 'styles.css 구 디자인 잔재(260906 C1 등재) — C3+C4 에서 제거.' },
  { key: 'SEL .jt-creds', 실측: 'DOM 0개', 사유: 'styles.css 구 디자인 잔재(260906 C1 등재) — C3+C4 에서 제거.' },
  { key: 'SEL .jt-hero__meta', 실측: 'DOM 0개', 사유: 'styles.css 구 디자인 잔재(260906 C1 등재) — C3+C4 에서 제거.' },
  { key: 'SEL .jt-hero__tagrow', 실측: 'DOM 0개', 사유: 'styles.css 구 디자인 잔재(260906 C1 등재) — C3+C4 에서 제거.' },
  { key: 'SEL .jt-team__card--featured', 실측: 'DOM 0개', 사유: 'styles.css 구 디자인 잔재(260906 C1 등재) — C3+C4 에서 제거.' },
];
const knownSeen = new Set();

const fails = [];
function fail(code, msg, key) {
  if (key && KNOWN.some((k) => k.key === key)) { knownSeen.add(key); return; }
  fails.push(code + '  ' + msg);
}


const loaded = lib.loadSheets({ root: ROOT, overrides });
const sheets = loaded.sheets;
const rules = lib.parseSheets(sheets);
/* 메시지의 자리 표기 — «파일:줄». 3장을 한 캐스케이드로 보므로 줄번호만으로는 어느 파일인지 모른다. */
const at = (x) => (x.file ? x.file + ':' : '') + x.line + '행';

console.log('[css-cascade] 규칙 ' + rules.length + '개 · 선언 ' + lib.declCount() + '개 — ' +
            sheets.map((s) => s.name + '(' + s.ruleCount + ')').join(' → ') + '  (index.html 로드 순서, @import 인라인)');
{
  const remote = sheets.reduce((n, s) => n + s.imports.filter((i) => !lib.resolveImport(i.spec, s.path)).length, 0);
  const local = sheets.reduce((n, s) => n + s.imports.filter((i) => lib.resolveImport(i.spec, s.path)).length, 0);
  console.log('  ⓘ @import 처리: 로컬 ' + local + '건 인라인 · 원격(폰트) ' + remote + '건 제거' +
              (loaded.external ? ' · index.html 외부 스타일시트 ' + loaded.external + '건은 읽지 않음' : '') + '. ' + SHEET_NOTE);
}

/* ── ⓪ @import 가 prelude 에 «남아 있지 않은가» (C1 신설 검사 ①) ──────────────────────
   @import 문이 지워지지 않고 남으면 파서가 `@import …  .jt-btn--primary{` 를 «@ 로 시작하는 prelude
   하나»로 읽어 그 뒤 첫 블록을 통째로 건너뛴다 — 그러면 이후 검사 전부가 «한 블록 빠진 캐스케이드»를
   본다. 세미콜론이 빠진 @import 는 브라우저도 그 블록을 버리므로(잘못된 at-rule) 잡는 것이 맞다.
   자기시험 NC-B1(주입 규칙이 잡히는가)·NC-B2(세미콜론 빠진 @import)가 이 검사를 음성으로 확인한다. */
{
  for (const s of sheets) {
    /* «읽되 계산 못 하는» 문법은 fail-closed — 계약 경계 밖(TASK-020 R3-F3·R4-F2). 조용히 건너뛰면 «본 척»이다. */
    for (const u of s.unsupported || []) {
      if (u.kind === 'import-layer') {
        fail('CSS-IMPORT-LAYER',
          `${s.name}:${u.line}행 ${u.what}: 캐스케이드 레이어는 이 게이트가 계산하지 못한다(@layer 미지원 — 레이어 순서·` +
          `important 역순이 필요). 미디어 조건으로 «오인해 적용»하지 않고 막는다. 레이어를 쓰려면 게이트를 먼저 확장하라.`);
      } else {
        fail('CSS-UNSUPPORTED-SYNTAX',
          `${s.name}:${u.line}행 ${u.what} (${u.kind}): 이 게이트의 계약 밖 문법이다(@layer 블록·후행 @layer/@namespace 문·` +
          `@container·@scope·CSS nesting·알 수 없는 at-rule). 캐스케이드에 영향을 주는데 계산하지 못하므로 «건너뛰지 않고» 막는다 — ` +
          `게이트(css_cascade_lib.js)를 먼저 확장하거나 그 문법을 쓰지 마라.`);
      }
    }
    const left = maskOut(s.raw, true).match(/@import\b/gi);
    if (left) {
      fail('CSS-IMPORT-PRELUDE',
        `${s.name}: 브라우저가 무시하거나 못 읽는 @import 문 ${left.length}건이 남았다(세미콜론 누락 · 두 문이 붙음 · 다른 규칙 뒤/` +
        `블록 안 · 첫 @import 뒤의 @layer 문 · layer() 등). 이 게이트는 그런 시트를 «적용한 척» 하지 않고 막는다 — @import 를 ` +
        `시트 머리에 \`@import url("…");\` 형태로 두어라(계획 v2.5 A-1 R1-F1, TASK-020 R2-F1·R3-F1).`);
    }
  }
  const first = rules.filter((r) => r.file === 'project/src/styles.css').sort((a, b) => a.line - b.line)[0];
  console.log('  ⓪ @import 제거 후 styles.css 첫 규칙: ' + (first ? at(first) + ' ' + first.selector : '(없음)'));
}

/* ── ⓪-2 파일 간 덮어쓰기 «재고» (C1 신설 검사 ②) ───────────────────────────────
   같은 선택자·속성을 두 파일이 «무조건 규칙»으로 선언한 자리. 정상 덮어쓰기(뒤 파일이 이김)는
   장부화(C3+C4)에서 styles.css 구 블록을 지우며 순감소시킬 «숫자»이고, 역전(뒤 파일이 앞 파일의
   !important 에 짐)은 «썼는데 안 먹는» 그 사고라 FAIL 로 올린다. 등재된 기존분은 KNOWN(`XFILE …`). */
{
  const byKey = new Map();
  for (const r of rules) {
    if (r.media) continue;
    for (const d of r.decls) for (const lh of expand(d.prop)) {
      const key = r.selector + '||' + lh;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push({ file: r.file, line: r.line, important: d.important, seq: d.seq });
    }
  }
  let forward = 0, blocked = 0;
  for (const [key, list] of byKey) {
    if (new Set(list.map((x) => x.file)).size < 2) continue;
    let best = list[0];
    for (const x of list) if ((x.important && !best.important) || (x.important === best.important && x.seq > best.seq)) best = x;
    const last = list[list.length - 1];
    if (best.file === last.file) { forward++; continue; }
    blocked++;
    const cut = key.indexOf('||');
    fail('CSS-XFILE-BLOCKED',
      `${key.slice(0, cut)} 의 ${key.slice(cut + 2)}: 뒤 파일 ${at(last)} 의 «무조건» 선언이 앞 파일 ${at(best)} 의 ` +
      `!important 에 막혀 적용되지 않는다. 뒤 파일의 의도가 죽어 있다 — 앞 규칙의 !important 를 걷어내거나 뒤 선언을 옮겨라.`,
      'XFILE ' + key.slice(0, cut) + ' | ' + key.slice(cut + 2));
  }
  console.log('  ⓪-2 파일 간 덮어쓰기: 정상(뒤 파일이 이김) ' + forward + '건 · 역전(앞 파일 !important 에 막힘) ' + blocked + '건');
}

/* ── ① 미디어쿼리가 무조건 규칙에 덮여 «절대 적용되지 않는» 선언 ──────────
   CSS 캐스케이드(같은 특정도):
     · u.important && !m.important            → u 이김 (순서 무관)
     · u.important === m.important && u 뒤    → u 이김
   둘 중 하나면 미디어쿼리 선언 m 은 어떤 화면에서도 적용될 수 없다. */
{
  const byKey = new Map();   // "selector||longhand" → 선언들
  for (const r of rules) {
    for (const d of r.decls) {
      for (const lh of expand(d.prop)) {
        const key = r.selector + '||' + lh;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push({ media: r.media, important: d.important, seq: d.seq, line: r.line, file: r.file, prop: d.prop });
      }
    }
  }

  let dead = 0;
  for (const [key, list] of byKey) {
    const cut = key.indexOf('||');
    const selector = key.slice(0, cut), lh = key.slice(cut + 2);
    const uncond = list.filter((x) => !x.media);
    if (!uncond.length) continue;
    for (const m of list) {
      if (!m.media) continue;
      const killer = uncond.find((u) =>
        (u.important && !m.important) ||
        (u.important === m.important && u.seq > m.seq));
      if (killer) {
        dead++;
        fail('CSS-DEAD-MQ',
          `${selector} 의 ${lh}: @media(${mediaText(m.media)}) 안 ${at(m)} 선언이 ` +
          `${at(killer)}의 «무조건» 규칙(${killer.prop}${killer.important ? ' !important' : ''})에 덮여 ` +
          `어떤 화면에서도 적용되지 않는다. 미디어쿼리 블록을 그 규칙 «뒤»로 옮겨라.`,
          `${selector} | ${lh} | ${mediaText(m.media)}`);
      }
    }
  }
  console.log('  ① 죽은 미디어쿼리 선언: ' + dead + '건');
}

/* ── ② 소스 어디에도 없는 클래스를 겨냥한 «압축» 규칙 ─────────────────────
   전수 검사는 위양성이 크다(동적 클래스·외부 라이브러리). 그래서 범위를 좁힌다:
   «미디어쿼리 안에서 크기·여백을 지정하는 jt- 접두 클래스»만 본다. 이 조합이
   죽어 있으면 「압축했다고 믿는데 대상이 없다」는 이번 사고의 정확한 모습이다. */
{
  const SRC_FILES = [];
  const pushDir = (dir, exts) => {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) pushDir(p, exts);
      else if (exts.some((e) => f.name.endsWith(e))) SRC_FILES.push(p);
    }
  };
  pushDir(path.join(ROOT, 'project', 'src'), ['.jsx', '.js']);
  pushDir(path.join(ROOT, 'desk'), ['.html']);
  SRC_FILES.push(path.join(ROOT, 'index.html'));

  let markup = '';
  for (const p of SRC_FILES) { try { markup += fs.readFileSync(p, 'utf8') + '\n'; } catch (_e) {} }

  const SIZE_PROPS = /^(height|width|min-height|max-height|padding|margin|gap|font-size|top|bottom)/;
  const seen = new Set();
  let dead = 0;
  for (const r of rules) {
    if (!r.media) continue;
    if (!r.decls.some((d) => SIZE_PROPS.test(d.prop))) continue;
    // 클래스명 문자 집합을 ASCII 로 좁히면 한글 등이 든 이름을 조용히 놓친다
    // (자기시험 NC-2 가 실제로 그걸 적발했다 — 260809). 구분자로 «끊는다».
    const classes = r.selector.match(/\.jt-[^\s{,>:+~)\[\]"'.]+/g) || [];
    for (const c of classes) {
      const name = c.slice(1);
      if (seen.has(name)) continue;
      if (markup.indexOf(name) >= 0) continue;
      seen.add(name);
      dead++;
      fail('CSS-DEAD-SEL',
        `.${name} 를 겨냥한 압축 규칙(${at(r)}, @media ${mediaText(r.media)})이 있는데 ` +
        `그 클래스가 JSX·HTML 어디에도 없다. 요소를 갈아치우고 규칙만 남은 것이다.`,
        'SEL .' + name);
    }
  }
  console.log('  ② 대상 없는 압축 규칙: ' + dead + '건');
}

/* ── ③④ 대표 뷰포트에서 «실제로 어떤 값이 적용되는가» ────────────────────── */
{
  const VIEWPORTS = [
    { w: 375, h: 640, 이름: 'iPhone SE(브라우저 UI 포함 실효)' },
    { w: 375, h: 812, 이름: 'iPhone X' },
    { w: 390, h: 844, 이름: 'iPhone 14' },
    { w: 768, h: 1024, 이름: '태블릿 세로' },
    { w: 1280, h: 720, 이름: '노트북 표준' },
    { w: 1440, h: 900, 이름: '노트북 대형' },
  ];

  let 보류_미디어 = 0, 보류_길이 = 0;

  /* 하나의 미디어쿼리 «절»(콤마로 나뉜 한 조각)을 평가.
     true=일치 / false=불일치 / null=판정 보류(해석 못 함) */
  function matchOne(cond, vp) {
    const s = cond.trim();
    if (!s) return true;
    // not / only 는 의미가 뒤집히거나 레거시 처리라 «조용히 틀리느니» 보류한다
    if (/^(not|only)\b/i.test(s)) return null;
    let parts = s.split(/\band\b/i).map((x) => x.trim()).filter(Boolean);
    for (const p of parts) {
      const t = p.toLowerCase();
      if (t === 'screen' || t === 'all') continue;      // 화면 대상 — 참
      if (t === 'print' || t === 'speech') return false;
      // orientation 은 뷰포트만으로 «판정할 수 있다» — 거짓으로 밀지 않는다 (Codex R2 P2)
      const ori = p.match(/^\(\s*orientation\s*:\s*(portrait|landscape)\s*\)$/i);
      if (ori) {
        const isPortrait = vp.h >= vp.w;
        if (ori[1].toLowerCase() === 'portrait' ? !isPortrait : isPortrait) return false;
        continue;
      }
      if (/prefers-|hover|pointer|resolution|forced-colors|color-gamut|display-mode/i.test(p)) return false;
      const m = p.match(/^\(\s*(max|min)-(width|height)\s*:\s*(\d+(?:\.\d+)?)px\s*\)$/i);
      if (!m) return null;      // 범위 문법 (width >= 640px) 등 — 보류
      const v = m[2].toLowerCase() === 'width' ? vp.w : vp.h;
      const n = parseFloat(m[3]);
      if (m[1].toLowerCase() === 'max' ? !(v <= n) : !(v >= n)) return false;
    }
    return true;
  }

  /* 콤마는 OR. 하나라도 참이면 참, 전부 거짓이면 거짓, 아니면 보류. */
  function oneQuery(cond, vp) {
    const alts = splitTop(cond, maskOut(cond), 0, cond.length, ',').map((x) => x.text);
    let unknown = false;
    for (const a of alts) {
      const r = matchOne(a, vp);
      if (r === true) return true;
      if (r === null) unknown = true;
    }
    return unknown ? null : false;
  }

  /* 중첩된 조건 배열 전체를 평가 — «전부» 만족해야 참.
     ⚠️ 문자열로 이어 붙이지 않는 이유가 여기 있다. 부모가 `A, B`(OR)이고 자식이 `C`면
        올바른 뜻은 (A OR B) AND C 인데, 이어 붙이면 A OR (B AND C) 가 된다 (Codex R2 P1-1).
     @supports(및 조건부 @import 의 supports(…))는 «기능 지원» 질의라 뷰포트로 판정할 수 없다.
     260809 초판은 «오늘날 전부 지원되는 기능뿐»이라며 참으로 뒀는데, 그러면 거짓인 조건의 규칙을 승자로
     계산해 구멍을 메운 척한다(TASK-020 R2-F2). 이제 lib.supportsMatches 가 확정하는 단일 선언
     (display:grid 류)만 참, 나머지는 «보류» — 승자를 바꿀 수 있으면 CSS-UNDECIDED 로 FAIL. */
  function mediaMatches(media, vp) {
    let unknown = false;
    for (const part of media) {
      if (part.kind === 'supports') {
        if (lib.supportsMatches(part.cond) !== true) unknown = true;
        continue;
      }
      const r = oneQuery(part.cond, vp);
      if (r === false) return false;
      if (r === null) unknown = true;
    }
    return unknown ? null : true;
  }

  /* 해당 뷰포트에서 (selector, longhand) 의 승자 선언을 고른다.
     ⚠️ 260809 Codex R2 P1-4 로 «보류의 처리»를 바꿨다. 초판은 해석 못 한 미디어 조건을
        조용히 건너뛰고 로그만 찍었다 — 그러면 그 규칙이 실제로는 승자인데도 게이트가
        다른 규칙을 승자로 잡고 「구멍 0건」으로 «성공 종료»한다. 못 본 것을 본 것처럼
        보고하는 정확히 그 실패다. 이제 보류가 «검사 대상 선택자·속성»에 닿으면
        그 사실 자체를 FAIL 로 올린다(아래 blocked 반환). */
  function winner(selector, longhand, vp) {
    let best = null;
    const 보류후보 = [];
    for (const r of rules) {
      if (r.selector !== selector) continue;
      if (r.media) {
        const ok = mediaMatches(r.media, vp);
        if (ok === null) {
          보류_미디어++;
          for (const d of r.decls) {
            if (expand(d.prop).includes(longhand)) {
              보류후보.push({ line: r.line, file: r.file, media: mediaText(r.media), important: d.important, seq: d.seq });
            }
          }
          continue;
        }
        if (ok !== true) continue;
      }
      for (const d of r.decls) {
        if (!expand(d.prop).includes(longhand)) continue;
        const cand = { media: r.media, important: d.important, seq: d.seq, line: r.line, file: r.file, value: d.value };
        if (!best) { best = cand; continue; }
        if (cand.important && !best.important) best = cand;
        else if (cand.important === best.important && cand.seq > best.seq) best = cand;
      }
    }
    /* ⚠️ 260809 Codex R3 P1: 보류 규칙이 «있기만 하면» FAIL 하면, 어차피 확정 승자에게
       지는 규칙 때문에도 배포가 막힌다. 정상 CSS(범위 문법 등)에 FAIL 을 내면 사람이
       게이트를 꺼 버린다 — 그게 이 게이트가 죽는 방식이다.
       그래서 «승자를 실제로 바꿀 수 있는» 보류만 남긴다: 확정 승자를 캐스케이드로
       이길 수 있는 선언이어야 한다. 확정 승자가 아예 없으면 무엇이든 승자가 되므로 남긴다. */
    const 이길수있음 = (b) => !best ||
      (b.important && !best.important) ||
      (b.important === best.important && b.seq > best.seq);
    const blocked = 보류후보.filter(이길수있음)[0] || null;
    return { best, blocked };
  }

  /* 길이 값의 «모양» 검사 — 정식 문법 전체가 아니라, 이 저장소가 쓰는 형태(px·vw·vh·rem·em·%·0·auto·clamp/min/max/calc/var·전역 키워드)만.
     여기서 걸리면 «무효 값이 승자가 되는 것»을 통과시키지 않는다(TASK-020 R5-F2). */
  const looksLikeLength = (v) => {
    const s = String(v).replace(/!\s*important\s*$/i, '').trim();
    return /^(0|auto|inherit|initial|unset|revert|-?\d+(?:\.\d+)?(px|rem|em|vh|vw|%|svh|dvh|lvh))$/i.test(s) || /^(clamp|min|max|calc|var)\(/i.test(s);
  };
  const TARGETS = [
    { sel: '.jt-brandmoment', prop: 'padding-top', 뭐: '히어로 위 여백' },
    { sel: '.jt-bm-primary', prop: 'height', 뭐: '로고 높이' },
  ];

  let holes = 0, blockedN = 0;
  const 보류FAIL = (vp, sel, prop, b) => {
    blockedN++;
    fail('CSS-UNDECIDED',
      `${vp.w}×${vp.h}(${vp.이름}): ${sel} 의 ${prop} 을 정하는 규칙 중 ${at(b)} ` +
      `@media(${b.media}) 를 «해석하지 못했다». 이 조건이 실제로는 승자일 수 있어 판정을 낼 수 없다. ` +
      `게이트가 이해하는 형태(px 단위 max-/min-width·height, and·콤마 결합)로 바꾸거나 ` +
      `tests_css_cascade.js 의 matchOne 을 넓혀라. ⛔ 「모르니까 통과」로 두지 않는다.`);
  };

  for (const vp of VIEWPORTS) {
    for (const t of TARGETS) {
      const { best: w, blocked } = winner(t.sel, t.prop, vp);
      if (blocked) 보류FAIL(vp, t.sel, t.prop, blocked);
      if (!w) { fail('CSS-HERO-NONE', `${vp.w}×${vp.h}(${vp.이름}): ${t.sel} 의 ${t.prop} 을 정하는 규칙이 없다.`); continue; }
      /* 값이 «길이로 읽히지 않으면» 브라우저는 그 선언을 버리고 다음 후보를 쓴다(CSS Syntax 3 §8). 게이트는 값을 검증하지
         않으므로(260809 설계) 그런 승자를 «본 척» 하지 않고 보류로 올린다(TASK-020 R5-F2). 검사 대상 속성에 한정. */
      if (!looksLikeLength(w.value)) {
        blockedN++;
        fail('CSS-UNDECIDED',
          `${vp.w}×${vp.h}(${vp.이름}): ${t.sel} 의 ${t.prop} 승자 «${w.value}»(${at(w)})를 길이로 읽지 못했다 — 브라우저는 무효 값을 ` +
          `버리고 다른 규칙을 쓰므로 판정을 낼 수 없다. 값을 px·vw·vh·rem·em·%·clamp/min/max/calc/var 형태로 쓰거나 looksLikeLength 를 넓혀라.`);
        continue;
      }
      if (!w.media) {
        holes++;
        fail('CSS-HERO-HOLE',
          `${vp.w}×${vp.h}(${vp.이름})에서 ${t.뭐}(${t.sel} ${t.prop})가 ` +
          `«압축 규칙에 안 걸리고» ${at(w)} 기본값 «${w.value}» 을 그대로 쓴다. ` +
          `첫 화면에서 「세액 계산」 버튼이 접힐 수 있는 구간이다 — 브라우저에서 실측하고 구간 규칙을 넣어라.`);
      }
    }
  }
  console.log('  ③ 압축 규칙 공백 뷰포트: ' + holes + '건');

  /* ── ④ 슬로건이 «실제로 몇 px 로 그려지는가» ────────────────────────────
     ③ 은 「어느 규칙이 이기는가」만 본다. 그런데 이번 사고의 슬로건 건은
     규칙은 멀쩡히 이겼는데 «값이» 문제였다 — clamp(24px,3.6vw,52px) 가
     375px 폭에서 3.6vw=13.5px → 하한 24px 로 떨어져, 첫 화면 브랜드 문장이
     본문보다 겨우 큰 크기로 나왔다(브라우저 실측 24px). 눈으로 안 보면 못 잡는다. */
  const SLOGAN_MIN = 26;

  function evalLen(expr, vp) {
    const s = String(expr).replace(/!\s*important/i, '').trim();
    const fn = s.match(/^(clamp|min|max)\((.*)\)$/is);
    if (fn) {
      const inner = fn[2];
      const args = splitTop(inner, maskOut(inner), 0, inner.length, ',').map((x) => evalLen(x.text, vp));
      if (args.some((a) => a === null) || !args.length) return null;
      const name = fn[1].toLowerCase();
      if (name === 'min') return Math.min(...args);
      if (name === 'max') return Math.max(...args);
      if (args.length !== 3) return null;
      /* clamp(MIN, VAL, MAX) === max(MIN, min(VAL, MAX)) — 스펙 그대로.
         ⚠️ 초판은 min(max(MIN,VAL),MAX) 로 썼다. MIN<MAX 인 «정상» 범위에서는 두 식이
            같지만 MIN>MAX 로 «역전»되면 갈린다. 브라우저 실측(260809):
            clamp(40px,20px,28px) → 40px(하한이 이김), 내 초판 식은 28px 였다. */
      return Math.max(args[0], Math.min(args[1], args[2]));
    }
    const px = s.match(/^(-?\d+(?:\.\d+)?)px$/i);
    if (px) return parseFloat(px[1]);
    const vw = s.match(/^(-?\d+(?:\.\d+)?)vw$/i);
    if (vw) return parseFloat(vw[1]) * vp.w / 100;
    const vh = s.match(/^(-?\d+(?:\.\d+)?)vh$/i);
    if (vh) return parseFloat(vh[1]) * vp.h / 100;
    const n = s.match(/^(-?\d+(?:\.\d+)?)$/);
    if (n && parseFloat(n[1]) === 0) return 0;
    return null;   // calc()·rem·% 등은 판정 보류 — 아래에서 «보류했다»고 알린다
  }

  let small = 0;
  for (const vp of VIEWPORTS) {
    const { best: w, blocked } = winner('.jt-brandmoment__slogan', 'font-size', vp);
    if (blocked) 보류FAIL(vp, '.jt-brandmoment__slogan', 'font-size', blocked);
    if (!w) continue;
    const px = evalLen(w.value, vp);
    if (px === null) {
      보류_길이++;
      /* 길이식을 계산 못 하면 하한을 «확인하지 못한» 것이다. 로그만 찍고 통과하면
         그게 곧 「안 본 것을 봤다고 말하는 일」이다(260809 Codex R2 P2). */
      fail('CSS-UNDECIDED',
        `${vp.w}×${vp.h}(${vp.이름}): 슬로건 크기 «${w.value}»(${at(w)})를 계산하지 못해 ` +
        `하한 ${SLOGAN_MIN}px 준수를 확인할 수 없다. px·vw·vh·clamp·min·max 로 쓰거나 evalLen 을 넓혀라.`);
      continue;
    }
    if (px < SLOGAN_MIN) {
      small++;
      fail('CSS-SLOGAN-SMALL',
        `${vp.w}×${vp.h}(${vp.이름})에서 첫 화면 슬로건이 ${px.toFixed(1)}px 로 그려진다 ` +
        `(하한 ${SLOGAN_MIN}px). ${at(w)} «${w.value}» 이 이 폭에서 하한까지 떨어진 것이다. ` +
        `브랜드 문장을 지키려고 안 2 를 골랐다 — 이 크기면 그 이유가 사라진다.`);
    }
  }
  console.log('  ④ 슬로건이 하한(' + SLOGAN_MIN + 'px) 밑으로 그려지는 뷰포트: ' + small + '건');

  /* 보류는 «못 본 것»이다. 0 이 아니면 그만큼 이 게이트의 눈이 가려져 있다. */
  console.log('  ⚠ 판정 보류 — 미디어 조건 ' + 보류_미디어 + '회 / 길이식 ' + 보류_길이 + '회' +
              (보류_미디어 + 보류_길이 === 0 ? ' (없음)' : ' ← 이만큼은 검사하지 못했다'));
}

/* ── 예외 목록이 낡지 않았는지 ────────────────────────────────────────────
   등재해 둔 위반이 «더는 검출되지 않으면» 그 예외는 불필요해진 것이다. 그대로 두면
   다음 사람이 「아직 남은 문제」로 오해하고, 더 나쁘게는 같은 자리에 새 위반이 나도
   예외에 걸려 조용히 통과한다. 그래서 해소도 FAIL 로 알린다. */
{
  const stale = KNOWN.filter((k) => !knownSeen.has(k.key));
  for (const k of stale) {
    fails.push('CSS-STALE-KNOWN  「' + k.key + '」 가 더는 검출되지 않는다 — 고쳐진 것이다. ' +
               'tests_css_cascade.js 의 KNOWN 에서 이 항목을 지워라(예외를 남겨 두면 같은 자리의 새 위반이 조용히 통과한다).');
  }
  console.log('  ▸ 알려진 기존 위반 ' + KNOWN.length + '건 중 ' + knownSeen.size + '건 여전히 검출' +
              (stale.length ? ' / ' + stale.length + '건은 해소됨(예외 삭제 필요)' : ''));
}

/* ── 결과 ───────────────────────────────────────────────────────────────── */
if (fails.length) {
  console.error('\n[css-cascade] FAIL ' + fails.length + '건');
  for (const f of fails) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log('[css-cascade] PASS — 죽은 규칙·공백 뷰포트 0건');
