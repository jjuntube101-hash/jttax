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
       문자열끼리만 본다. 좁게 잡은 대신 위양성이 없다.
     - 자바스크립트가 style 속성으로 덮는 경우.
   ══════════════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
/* 자기시험용 — 원본을 건드리지 않고 «결함을 주입한 사본»을 검사시킬 수 있게 한다.
   운영 실행에서는 절대 설정되지 않는다(tests_css_cascade_selftest.js 만 쓴다). */
const CSS_PATH = process.env.CSS_CASCADE_TARGET
  ? path.resolve(process.env.CSS_CASCADE_TARGET)
  : path.join(ROOT, 'project', 'src', 'redesign.css');

/* ── 알려진 기존 위반 (260809 등재) ───────────────────────────────────────
   히어로 작업 중 이 게이트를 새로 만들면서 «전부터 있던» 위반 5건이 같이 드러났다.
   전부 브라우저에서 실측해 진짜임을 확인했지만(위양성 0), 이번 작업 범위 밖이라
   손대지 않고 등재한다. ⛔ 이 목록은 «묻어 두는 곳»이 아니다 —
   해소되면 아래 STALE 검사가 「예외가 불필요해졌다」고 FAIL 을 낸다.
   key 는 게이트가 만드는 「선택자 공백 속성」 문자열과 정확히 같아야 한다. */
const KNOWN = [
  { key: '.jt-sithero padding-bottom',
    실측: '84px (모바일 의도는 0px)',
    사유: '상황 카드와 히어로 사이 여백. 첫 화면 밖이라 이번 범위에서 제외.' },
  { key: '.jt-nav__brand img height',
    실측: '38px (의도 34px — 600px 이하 블록이 대신 이김)',
    사유: '4px 차이이고 넘침도 없다. 나란히 있는 두 규칙을 정리할 때 함께.' },
  { key: '.jt-app::before background-image',
    실측: 'none (모바일 격자 배경이 안 나옴)',
    사유: '700행이 배경 격자를 전역 제거한 «뒤»에 남은 잔재로 보인다. 디자인 판단 필요.' },
  { key: '.jt-brandmoment:has(.jt-brandmoment__logowrap.is-visible)::before animation',
    실측: '무해 — 1102행에 같은 의도의 reduced-motion 블록이 «뒤»에 또 있어 실제로는 꺼진다',
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

/* ── CSS 최소 파서 ────────────────────────────────────────────────────────
   주석을 «같은 길이의 공백»으로 지워 오프셋→줄번호 계산이 어긋나지 않게 한다. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n\r]/g, ' '));
}

function lineOf(css, offset) {
  let n = 1;
  for (let i = 0; i < offset && i < css.length; i++) if (css[i] === '\n') n++;
  return n;
}

/* 선언 목록 파싱. 괄호 깊이를 세어 clamp(…, …) 안의 쉼표·세미콜론에 속지 않는다. */
function parseDecls(body) {
  const out = [];
  let depth = 0, buf = '';
  const flush = () => {
    const s = buf.trim(); buf = '';
    if (!s) return;
    const i = s.indexOf(':');
    if (i < 0) return;
    const prop = s.slice(0, i).trim().toLowerCase();
    const value = s.slice(i + 1).trim();
    if (!prop || prop.startsWith('--')) return;
    out.push({ prop, value, important: /!\s*important\s*$/i.test(value) });
  };
  for (const ch of body) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ';' && depth === 0) { flush(); continue; }
    buf += ch;
  }
  flush();
  return out;
}

/* 최상위 규칙 스캔. @media / @supports 는 한 겹 들어가 내부 규칙을 수집한다. */
function parseRules(css) {
  const rules = [];   // {selector, decls, media, order, line}
  let i = 0, order = 0;

  function scanBlock(text, base, media) {
    let j = 0;
    while (j < text.length) {
      const open = text.indexOf('{', j);
      if (open < 0) break;
      const rawPrelude = text.slice(j, open);
      const prelude = rawPrelude.trim();
      // 줄번호는 «선택자의 첫 글자» 기준. j 는 앞 규칙이 끝난 자리라 그대로 쓰면
      // 사이의 빈 줄·주석만큼 위로 어긋난다(260809 자기시험에서 적발).
      const startOff = base + j + (rawPrelude.length - rawPrelude.replace(/^\s*/, '').length);
      // 짝 맞는 닫는 중괄호 찾기
      let depth = 1, k = open + 1;
      while (k < text.length && depth > 0) {
        if (text[k] === '{') depth++;
        else if (text[k] === '}') depth--;
        k++;
      }
      const body = text.slice(open + 1, k - 1);
      const atRule = prelude.startsWith('@');
      if (atRule) {
        const name = (prelude.match(/^@([a-z-]+)/i) || [])[1] || '';
        if (name === 'media' || name === 'supports') {
          const cond = prelude.slice(name.length + 1).trim();
          scanBlock(body, base + open + 1, media ? media + ' AND ' + cond : cond);
        }
        // @keyframes / @font-face 등은 캐스케이드 대상이 아니라 건너뛴다
      } else if (prelude) {
        for (const sel of prelude.split(',')) {
          const s = sel.trim();
          if (!s) continue;
          rules.push({
            selector: s, decls: parseDecls(body), media: media || null,
            order: order++, line: lineOf(css, startOff),
          });
        }
      }
      j = k;
    }
  }

  scanBlock(css, 0, null);
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

const raw = fs.readFileSync(CSS_PATH, 'utf8');
const css = stripComments(raw);
const rules = parseRules(css);

console.log('[css-cascade] 규칙 ' + rules.length + '개 파싱 — ' + path.relative(ROOT, CSS_PATH));

/* ── ① 미디어쿼리가 무조건 규칙에 덮여 «절대 적용되지 않는» 선언 ──────────
   CSS 캐스케이드(같은 특정도):
     · u.important && !m.important            → u 이김 (순서 무관)
     · u.important === m.important && u 뒤    → u 이김
   둘 중 하나면 미디어쿼리 선언 m 은 어떤 화면에서도 적용될 수 없다. */
{
  const byKey = new Map();   // "selector\0longhand" → [{media, important, order, line, prop}]
  for (const r of rules) {
    for (const d of r.decls) {
      for (const lh of expand(d.prop)) {
        const key = r.selector + ' ' + lh;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push({ media: r.media, important: d.important, order: r.order, line: r.line, prop: d.prop });
      }
    }
  }

  let dead = 0;
  for (const [key, list] of byKey) {
    const cut = key.lastIndexOf(' ');
    const selector = key.slice(0, cut), lh = key.slice(cut + 1);
    const uncond = list.filter((x) => !x.media);
    if (!uncond.length) continue;
    for (const m of list) {
      if (!m.media) continue;
      const killer = uncond.find((u) =>
        (u.important && !m.important) ||
        (u.important === m.important && u.order > m.order));
      if (killer) {
        dead++;
        fail('CSS-DEAD-MQ',
          `${selector} 의 ${lh}: @media(${m.media}) 안 ${m.line}행 선언이 ` +
          `${killer.line}행의 «무조건» 규칙(${killer.prop}${killer.important ? ' !important' : ''})에 덮여 ` +
          `어떤 화면에서도 적용되지 않는다. 미디어쿼리 블록을 그 규칙 «뒤»로 옮겨라.`,
          key);
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
  const SRC_GLOBS = [];
  const pushDir = (dir, exts) => {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) pushDir(p, exts);
      else if (exts.some((e) => f.name.endsWith(e))) SRC_GLOBS.push(p);
    }
  };
  pushDir(path.join(ROOT, 'project', 'src'), ['.jsx', '.js']);
  pushDir(path.join(ROOT, 'desk'), ['.html']);
  SRC_GLOBS.push(path.join(ROOT, 'index.html'));

  let markup = '';
  for (const p of SRC_GLOBS) { try { markup += fs.readFileSync(p, 'utf8') + '\n'; } catch (_e) {} }

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
      // 소스 마크업에 그 클래스 이름이 «단어»로 등장하는가
      const re = new RegExp('[\\s"\'`]' + name.replace(/[-]/g, '\\-') + '[\\s"\'`]');
      if (re.test(markup) || markup.indexOf(name) >= 0) continue;
      seen.add(name);
      dead++;
      fail('CSS-DEAD-SEL',
        `.${name} 를 겨냥한 압축 규칙(${r.line}행, @media ${r.media})이 있는데 ` +
        `그 클래스가 JSX·HTML 어디에도 없다. 요소를 갈아치우고 규칙만 남은 것이다.`,
        'SEL .' + name);
    }
  }
  console.log('  ② 대상 없는 압축 규칙: ' + dead + '건');
}

/* ── ③ 첫 화면 히어로: 대표 뷰포트가 «어느 압축 규칙에도» 안 걸리는 구멍 ──
   미디어쿼리 조건을 실제로 평가해, 대표 뷰포트마다 .jt-brandmoment 의
   padding-top 과 .jt-bm-primary 의 height 를 «누가» 정하는지 계산한다.
   기본값(무조건 규칙)이 그대로 이기는 뷰포트가 있으면 그게 구멍이다. */
{
  const VIEWPORTS = [
    { w: 375, h: 640, 이름: 'iPhone SE(브라우저 UI 포함 실효)' },
    { w: 375, h: 812, 이름: 'iPhone X' },
    { w: 390, h: 844, 이름: 'iPhone 14' },
    { w: 768, h: 1024, 이름: '태블릿 세로' },
    { w: 1280, h: 720, 이름: '노트북 표준' },
    { w: 1440, h: 900, 이름: '노트북 대형' },
  ];

  function mediaMatches(cond, vp) {
    // 이 파일이 쓰는 형태만 다룬다: (max|min)-(width|height): Npx, and 결합
    if (/print|prefers-|hover|orientation|resolution/.test(cond)) return false;
    const parts = cond.split(/\band\b/i).map((s) => s.trim()).filter(Boolean);
    for (const p of parts) {
      const m = p.match(/\(?\s*(max|min)-(width|height)\s*:\s*(\d+(?:\.\d+)?)px\s*\)?/i);
      if (!m) return null;            // 해석 못 하는 조건 → 판정 보류
      const [, kind, axis, num] = m;
      const v = axis.toLowerCase() === 'width' ? vp.w : vp.h;
      const n = parseFloat(num);
      if (kind.toLowerCase() === 'max' ? !(v <= n) : !(v >= n)) return false;
    }
    return true;
  }

  /* 해당 뷰포트에서 (selector, prop) 의 승자 규칙을 고른다 */
  function winner(selector, longhand, vp) {
    let best = null;
    for (const r of rules) {
      if (r.selector !== selector) continue;
      if (r.media) { const ok = mediaMatches(r.media, vp); if (ok !== true) continue; }
      for (const d of r.decls) {
        if (!expand(d.prop).includes(longhand)) continue;
        const cand = { media: r.media, important: d.important, order: r.order, line: r.line, value: d.value };
        if (!best) { best = cand; continue; }
        if (cand.important && !best.important) best = cand;
        else if (cand.important === best.important && cand.order > best.order) best = cand;
      }
    }
    return best;
  }

  const TARGETS = [
    { sel: '.jt-brandmoment', prop: 'padding-top', 뭐: '히어로 위 여백' },
    { sel: '.jt-bm-primary', prop: 'height', 뭐: '로고 높이' },
  ];

  let holes = 0;
  for (const vp of VIEWPORTS) {
    for (const t of TARGETS) {
      const w = winner(t.sel, t.prop, vp);
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
     본문보다 겨우 큰 크기로 나왔다(브라우저 실측 24px). 눈으로 안 보면 못 잡는다.
     그래서 여기서 clamp/vw/vh 를 «계산»해 하한을 지킨다. */
  const SLOGAN_MIN = 26;

  function evalLen(expr, vp) {
    const s = String(expr).replace(/!\s*important/i, '').trim();
    const clamp = s.match(/^clamp\(([^,]+),([^,]+),(.+)\)$/i);
    if (clamp) {
      const [a, b, c] = [clamp[1], clamp[2], clamp[3]].map((x) => evalLen(x, vp));
      if (a === null || b === null || c === null) return null;
      return Math.min(Math.max(a, b), c);
    }
    const px = s.match(/^(-?\d+(?:\.\d+)?)px$/i);
    if (px) return parseFloat(px[1]);
    const vw = s.match(/^(-?\d+(?:\.\d+)?)vw$/i);
    if (vw) return parseFloat(vw[1]) * vp.w / 100;
    const vh = s.match(/^(-?\d+(?:\.\d+)?)vh$/i);
    if (vh) return parseFloat(vh[1]) * vp.h / 100;
    return null;   // rem·% 등은 판정 보류 (이 파일은 px/vw/vh/clamp 만 쓴다)
  }

  let small = 0;
  for (const vp of VIEWPORTS) {
    const w = winner('.jt-brandmoment__slogan', 'font-size', vp);
    if (!w) continue;
    const px = evalLen(w.value, vp);
    if (px === null) continue;
    if (px < SLOGAN_MIN) {
      small++;
      fail('CSS-SLOGAN-SMALL',
        `${vp.w}×${vp.h}(${vp.이름})에서 첫 화면 슬로건이 ${px.toFixed(1)}px 로 그려진다 ` +
        `(하한 ${SLOGAN_MIN}px). ${w.line}행 «${w.value}» 이 이 폭에서 하한까지 떨어진 것이다. ` +
        `브랜드 문장을 지키려고 안 2 를 골랐다 — 이 크기면 그 이유가 사라진다.`);
    }
  }
  console.log('  ④ 슬로건이 하한(' + SLOGAN_MIN + 'px) 밑으로 그려지는 뷰포트: ' + small + '건');
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
