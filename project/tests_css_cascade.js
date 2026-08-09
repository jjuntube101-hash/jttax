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

const ROOT = path.join(__dirname, '..');
/* 자기시험용 — 원본을 건드리지 않고 «결함을 주입한 사본»을 검사시킬 수 있게 한다.
   운영 실행에서는 절대 설정되지 않는다(tests_css_cascade_selftest.js 만 쓴다). */
const CSS_PATH = process.env.CSS_CASCADE_TARGET
  ? path.resolve(process.env.CSS_CASCADE_TARGET)
  : path.join(ROOT, 'project', 'src', 'redesign.css');

const SHEET_NOTE = 'index.html 은 styles.css 도 로드한다 — 히어로 선택자가 없어 대상에서 제외했다. ' +
                   '거기에 .jt-brandmoment 류가 생기면 이 게이트를 그 파일까지 확장해야 한다.';

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
];
const knownSeen = new Set();

const fails = [];
function fail(code, msg, key) {
  if (key && KNOWN.some((k) => k.key === key)) { knownSeen.add(key); return; }
  fails.push(code + '  ' + msg);
}

/* ══ CSS 파서 ═══════════════════════════════════════════════════════════════
   ⚠️ 260809 Codex R1 P1-1·P1-2 로 재작성했다. 초판은 주석·중괄호·쉼표를 «원문»에서
      직접 찾아, 문자열 리터럴 안의 그것들에 속았다. 실제 피해가 이미 있었다 —
      `:where(h1,h2,h3,...)` 4건이 쉼표에서 잘려 `:where(h1` 같은 «없는 선택자»가
      규칙 목록에 들어가 있었다.

   해법: 원문과 «같은 길이»의 마스크를 만들어 주석·문자열 내부를 공백으로 지운다.
   구조(중괄호·세미콜론·쉼표·괄호)는 마스크에서 찾고, 텍스트는 원문에서 자른다.
   길이가 같으므로 오프셋이 그대로 통하고 줄번호도 어긋나지 않는다. */
/* @param structural — true 면 «구조 탐색용»(문자열·식별자 이스케이프까지 공백),
                       false 면 «텍스트 추출용»(주석만 공백).
   ⚠️ 260809 Codex R3 P1: 초판은 구조용 마스크에서 선택자까지 잘라, 정상 CSS 인
      `.jt-brand\6d oment`(= .jt-brandmoment) 가 `.jt-brand   oment` 로 «의미가 바뀐 채»
      저장됐다. 구조는 구조용으로 찾고 텍스트는 텍스트용에서 잘라야 한다. */
function maskOut(css, structural) {
  if (structural === undefined) structural = true;
  const m = css.split('');
  const blank = (from, to) => {
    for (let k = from; k < to && k < css.length; k++) {
      if (m[k] !== '\n' && m[k] !== '\r') m[k] = ' ';
    }
  };
  let i = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      const stop = end < 0 ? css.length : end + 2;
      blank(i, stop); i = stop; continue;
    }
    if ((ch === '"' || ch === "'") && structural) {
      let k = i + 1;
      while (k < css.length) {
        if (css[k] === '\\') {
          // CSS 는 역슬래시+개행(CRLF 포함)을 «이어짐»으로 본다 — 여기서 끊으면
          // 그 뒤 구조 문자가 파서에 노출된다 (260809 Codex R2 P1-3).
          if (css[k + 1] === '\r' && css[k + 2] === '\n') { k += 3; continue; }
          k += 2; continue;
        }
        if (css[k] === ch) { k++; break; }
        if (css[k] === '\n' || css[k] === '\r') break;   // 이스케이프 안 된 개행에서 끝
        k++;
      }
      blank(i, k); i = k; continue;
    }
    /* CSS 식별자 이스케이프 — `.a\,b` 나 `.a\(b\)` 의 `\,` `\(` `\)` 는 구조 문자가
       아니라 «이름의 일부»다. 마스크에서 지워야 splitTop 이 안 속는다. */
    if (structural && ch === '\\' && i + 1 < css.length && css[i + 1] !== '\n' && css[i + 1] !== '\r') {
      blank(i, i + 2); i += 2; continue;
    }
    i++;
  }
  return m.join('');
}

/* CSS 선택자의 이스케이프를 «실제 문자»로 되돌린다.
   ⚠️ 260809 Codex R3 P1: `.jt-brandmoment__slog\61 n` 은 브라우저에게
      `.jt-brandmoment__slogan` 과 «같은 선택자»다. 표기를 그대로 두면 검사 대상과
      매칭되지 않아 그 규칙이 통째로 안 보인다 — 조용히 못 보는 쪽이라 더 나쁘다.
   형식: \XXXXXX(16진 1~6자리, 뒤에 공백 하나 소비 — CRLF 는 «둘이 아니라 하나») 또는 \C.
   0·서로게이트(D800~DFFF)·범위 초과는 스펙대로 U+FFFD 로 (260809 Codex R4 P2). */
function unescapeSelector(s) {
  return s.replace(/\\([0-9a-fA-F]{1,6})(?:\r\n|[ \t\n\r\f])?|\\([^\n\r\f])/g, (m, hex, ch) => {
    if (!hex) return ch;
    const cp = parseInt(hex, 16);
    if (!cp || cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF)) return '�';
    try { return String.fromCodePoint(cp); } catch (_e) { return '�'; }
  });
}

function lineOf(css, offset) {
  let n = 1;
  for (let i = 0; i < offset && i < css.length; i++) if (css[i] === '\n') n++;
  return n;
}

/* 마스크에서 «괄호 깊이 0» 인 구분자로만 자른다. :is(.a,.b) 나 clamp(a,b,c) 를 지킨다. */
function splitTop(text, masked, from, to, sep) {
  const out = [];
  let depth = 0, start = from;
  for (let i = from; i < to; i++) {
    const c = masked[i];
    if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === sep && depth === 0) { out.push([start, i]); start = i + 1; }
  }
  out.push([start, to]);
  return out.map(([a, b]) => ({ from: a, to: b, text: text.slice(a, b) }));
}

let declSeq = 0;   /* 선언 «하나하나»에 순번을 준다.
   ⚠️ 초판은 규칙 단위로만 순번을 매겨, 같은 규칙 안의 뒤 선언이 앞 선언을 이기는 것을
      반영하지 못했다(260809 Codex R1 P1-4). 예: { padding:100px; padding-top:10px } 는
      실제 승자가 10px 인데 100px 로 계산했다. */

function parseDecls(text, masked, from, to) {
  const out = [];
  for (const seg of splitTop(text, masked, from, to, ';')) {
    let colon = -1;
    let depth = 0;
    for (let i = seg.from; i < seg.to; i++) {
      const c = masked[i];
      if (c === '(') depth++;
      else if (c === ')') depth = Math.max(0, depth - 1);
      else if (c === ':' && depth === 0) { colon = i; break; }
    }
    if (colon < 0) continue;
    const prop = text.slice(seg.from, colon).trim().toLowerCase();
    const value = text.slice(colon + 1, seg.to).trim();
    if (!prop || prop.startsWith('--') || /\s/.test(prop)) continue;
    out.push({ prop, value, important: /!\s*important\s*$/i.test(value), seq: declSeq++ });
  }
  return out;
}

function parseRules(css, masked, textMask) {
  const rules = [];   // {selector, decls, media, line}

  function scan(from, to, media) {
    let j = from;
    while (j < to) {
      const open = masked.indexOf('{', j);
      if (open < 0 || open >= to) break;

      let depth = 1, k = open + 1;
      while (k < to && depth > 0) {
        if (masked[k] === '{') depth++;
        else if (masked[k] === '}') depth--;
        k++;
      }
      const bodyFrom = open + 1, bodyTo = k - 1;

      /* ⛔ prelude·선언은 «마스크»에서 자른다. 원본에서 자르면 주석이 그대로 딸려와
         선택자가 된다 — 재작성 직후 실제로 규칙 목록에 「/* 간이 계산기의 …」 같은
         가짜 선택자가 들어가 .jt-brandmoment 가 0개로 나왔다(260809). 마스크는 주석·
         문자열을 «같은 길이의 공백»으로 지우므로 오프셋과 줄번호는 그대로 통한다. */
      const rawPrelude = textMask.slice(j, open);
      const prelude = rawPrelude.trim();
      // 줄번호는 «선택자의 첫 글자» 기준. j 는 앞 규칙이 끝난 자리라 그대로 쓰면
      // 사이의 빈 줄·주석만큼 위로 어긋난다(260809 자기시험에서 적발).
      const lead = rawPrelude.length - rawPrelude.replace(/^\s*/, '').length;
      const startOff = j + lead;

      if (prelude.startsWith('@')) {
        const name = (prelude.match(/^@([a-z-]+)/i) || [])[1] || '';
        /* ⚠️ 조건을 «문자열로 이어 붙이지» 않는다. `A, B` + ' AND ' + `C` 는
           (A OR B) AND C 가 아니라 A OR (B AND C) 로 읽힌다 — 260809 Codex R2 P1-1.
           배열로 쌓고 «전부 만족» 으로 평가한다.
           @supports 는 미디어 조건이 아니므로 따로 표시한다(같은 평가기에 넣으면
           해석 실패로 전부 보류가 된다 — R2 P1-5). */
        if (name === 'media') {
          const cond = prelude.slice(name.length + 1).trim();
          scan(bodyFrom, bodyTo, (media || []).concat([{ kind: 'media', cond }]));
        } else if (name === 'supports') {
          const cond = prelude.slice(name.length + 1).trim();
          scan(bodyFrom, bodyTo, (media || []).concat([{ kind: 'supports', cond }]));
        }
        // @keyframes / @font-face 등은 캐스케이드 대상이 아니라 건너뛴다
      } else if (prelude) {
        const decls = parseDecls(textMask, masked, bodyFrom, bodyTo);
        for (const sel of splitTop(textMask, masked, j + lead, open, ',')) {
          const s = sel.text.trim();
          if (!s) continue;
          rules.push({ selector: unescapeSelector(s), decls, media: media && media.length ? media : null, line: lineOf(css, startOff) });
        }
      }
      j = k;
    }
  }

  scan(0, css.length, null);
  return rules;
}

/* shorthand → longhand. 값은 보지 않는다 — shorthand 는 «항상» 하위 속성을 전부 설정한다. */
const SHORTHAND = {
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
  inset: ['top', 'right', 'bottom', 'left'],
  gap: ['row-gap', 'column-gap'],
  'grid-gap': ['row-gap', 'column-gap'],
};
const expand = (prop) => SHORTHAND[prop] || [prop];

/* 조건 배열을 사람이 읽는 한 줄로. KNOWN key·메시지가 이 표기를 쓴다. */
function mediaText(media) {
  if (!media) return '';
  return media.map((x) => (x.kind === 'supports' ? '@supports ' + x.cond : x.cond)).join(' AND ');
}

const raw = fs.readFileSync(CSS_PATH, 'utf8');
const masked = maskOut(raw, true);
const textMask = maskOut(raw, false);
const rules = parseRules(raw, masked, textMask);

console.log('[css-cascade] 규칙 ' + rules.length + '개 · 선언 ' + declSeq + '개 — ' + path.relative(ROOT, CSS_PATH));
console.log('  ⓘ 검사 대상은 이 파일 하나다. ' + SHEET_NOTE);

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
        byKey.get(key).push({ media: r.media, important: d.important, seq: d.seq, line: r.line, prop: d.prop });
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
          `${selector} 의 ${lh}: @media(${mediaText(m.media)}) 안 ${m.line}행 선언이 ` +
          `${killer.line}행의 «무조건» 규칙(${killer.prop}${killer.important ? ' !important' : ''})에 덮여 ` +
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
        `.${name} 를 겨냥한 압축 규칙(${r.line}행, @media ${mediaText(r.media)})이 있는데 ` +
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
     @supports 는 «기능 지원» 질의라 뷰포트로 판정할 수 없다. 이 프로젝트가 쓰는 것은
     display:grid 류의 «오늘날 전부 지원되는» 기능뿐이므로 참으로 두되, 쓰이기 시작하면
     보류로 바꿔야 한다 — 그래서 건수를 따로 센다. */
  function mediaMatches(media, vp) {
    let unknown = false;
    for (const part of media) {
      if (part.kind === 'supports') continue;   // 지원 질의는 뷰포트로 판정 불가 — 참으로 둔다(아래 고지)
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
              보류후보.push({ line: r.line, media: mediaText(r.media), important: d.important, seq: d.seq });
            }
          }
          continue;
        }
        if (ok !== true) continue;
      }
      for (const d of r.decls) {
        if (!expand(d.prop).includes(longhand)) continue;
        const cand = { media: r.media, important: d.important, seq: d.seq, line: r.line, value: d.value };
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

  const TARGETS = [
    { sel: '.jt-brandmoment', prop: 'padding-top', 뭐: '히어로 위 여백' },
    { sel: '.jt-bm-primary', prop: 'height', 뭐: '로고 높이' },
  ];

  let holes = 0, blockedN = 0;
  const 보류FAIL = (vp, sel, prop, b) => {
    blockedN++;
    fail('CSS-UNDECIDED',
      `${vp.w}×${vp.h}(${vp.이름}): ${sel} 의 ${prop} 을 정하는 규칙 중 ${b.line}행 ` +
      `@media(${b.media}) 를 «해석하지 못했다». 이 조건이 실제로는 승자일 수 있어 판정을 낼 수 없다. ` +
      `게이트가 이해하는 형태(px 단위 max-/min-width·height, and·콤마 결합)로 바꾸거나 ` +
      `tests_css_cascade.js 의 matchOne 을 넓혀라. ⛔ 「모르니까 통과」로 두지 않는다.`);
  };

  for (const vp of VIEWPORTS) {
    for (const t of TARGETS) {
      const { best: w, blocked } = winner(t.sel, t.prop, vp);
      if (blocked) 보류FAIL(vp, t.sel, t.prop, blocked);
      if (!w) { fail('CSS-HERO-NONE', `${vp.w}×${vp.h}(${vp.이름}): ${t.sel} 의 ${t.prop} 을 정하는 규칙이 없다.`); continue; }
      if (!w.media) {
        holes++;
        fail('CSS-HERO-HOLE',
          `${vp.w}×${vp.h}(${vp.이름})에서 ${t.뭐}(${t.sel} ${t.prop})가 ` +
          `«압축 규칙에 안 걸리고» ${w.line}행 기본값 «${w.value}» 을 그대로 쓴다. ` +
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
        `${vp.w}×${vp.h}(${vp.이름}): 슬로건 크기 «${w.value}»(${w.line}행)를 계산하지 못해 ` +
        `하한 ${SLOGAN_MIN}px 준수를 확인할 수 없다. px·vw·vh·clamp·min·max 로 쓰거나 evalLen 을 넓혀라.`);
      continue;
    }
    if (px < SLOGAN_MIN) {
      small++;
      fail('CSS-SLOGAN-SMALL',
        `${vp.w}×${vp.h}(${vp.이름})에서 첫 화면 슬로건이 ${px.toFixed(1)}px 로 그려진다 ` +
        `(하한 ${SLOGAN_MIN}px). ${w.line}행 «${w.value}» 이 이 폭에서 하한까지 떨어진 것이다. ` +
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
