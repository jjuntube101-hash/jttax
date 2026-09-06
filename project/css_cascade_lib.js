'use strict';
/* ══════════════════════════════════════════════════════════════════════════
   CSS 캐스케이드 «라이브러리» — tests_css_cascade.js 와 tests_css_breakpoints.js 가 함께 쓴다.

   260906 C1(홈 개편 v2 A-1): 파서(maskOut·parseRules 등)를 tests_css_cascade.js 에서
   «본문 그대로» 옮겨 왔다(코드 이력·주석은 그 파일 260809 라운드 기록이 정본). 새로 붙은 것은
   아래 «시트 로더»뿐이다 — index.html 이 실제로 로드하는 순서의 스타일시트를 @import 까지
   펼쳐 한 캐스케이드로 읽는다.

   ▣ 왜 «이어붙이지» 않는가 (계획 v2.5 A-1, Codex R1-F1)
     `styles.css:2` 는 `@import url("./colors_and_type.css?v=2");` 로 시작한다. 세 파일을 그대로
     이으면 parseRules 는 `@import …; .jt-btn--primary{…}` 를 «@ 로 시작하는 prelude 하나»로 읽어
     첫 블록을 통째로 건너뛴다(at-rule 이름이 import 라 media/supports 어느 쪽도 아니므로).
     그래서 @import 문은 «같은 길이의 공백»으로 지우고(줄번호 보존), 로컬 @import 는 그 파일의
     규칙을 브라우저처럼 «그 자리(=파일 앞)»에 1회 삽입한다. 원격 @import(폰트 CSS)는 규칙이
     없으니 지우기만 한다.
   ══════════════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

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
    /* 속성명·`!important` 는 ident 라 CSS 이스케이프가 올 수 있다(`padding-\\74op`·`!\\69mportant`) — 선택자와 같은 규칙으로
       되돌린 뒤 비교한다(TASK-020 R6-F1·F2). 안 그러면 브라우저가 적용하는 선언을 게이트가 다른 이름으로 세어 놓친다. */
    const prop = unescapeSelector(text.slice(seg.from, colon).trim()).toLowerCase();
    const rawValue = text.slice(colon + 1, seg.to).trim();
    /* `!important` 는 «delim `!` + ident `important`» 두 토큰이다(CSS Cascade §6.3). 그래서 ① `!` 는 글자 그대로여야 하고
       (`\\21 important` 는 ident 하나라 important 가 아니다 — TASK-020 R7-F1) ② 뒤 ident 만 되돌려 비교한다(`!\\69mportant` 는 맞다).
       important 가 아니면 값은 원문 그대로 둔다 — 길이 판정이 «!important 로 보이는 글자»에 속지 않게. */
    const impM = rawValue.match(/!\s*([^\s!;]+)\s*$/);
    const important = !!impM && unescapeSelector(impM[1]).toLowerCase() === 'important';
    const value = important ? unescapeSelector(rawValue.slice(0, impM.index)).trim() : rawValue;
    /* custom property(--x) 도 «선언»이다 — 캐스케이드·!important 규칙을 똑같이 받는다. 260809 초판은 건너뛰었는데,
       그러면 :root 토큰이 앞 파일 !important 에 막히는 것을 XFILE 검사가 못 본다(TASK-020 R1-F4). */
    if (!prop || /\s/.test(prop)) continue;
    out.push({ prop, value, important, seq: declSeq++ });
  }
  return out;
}

function parseRules(css, masked, textMask, file) {
  const rules = [];   // {selector, decls, media, line}

  /* 구간 [from, to) 안의 «문»(…;)을 읽어 @charset·@import 외는 fail-closed 로 기록하고, 마지막 문 끝 위치를 돌려준다.
     블록 앞에서도, «시트 끝»(더는 '{' 가 없는 꼬리 — TASK-020 R5-F3)에서도 부른다. */
  function noteStatements(from, to) {
    const stmtRe = /@([a-z-]+)\b[^;{]*;/gi;
    const region = masked.slice(from, to);
    let jj = from, st;
    while ((st = stmtRe.exec(region)) !== null) {
      const name = st[1].toLowerCase();
      if (name !== 'charset' && name !== 'import') parseNotes.push({ kind: 'statement', name: '@' + name, line: lineOf(css, from + st.index) });
      jj = from + st.index + st[0].length;
    }
    return jj;
  }

  function scan(from, to, media) {
    let j = from;
    while (j < to) {
      const open = masked.indexOf('{', j);
      if (open < 0 || open >= to) { noteStatements(j, to); break; }

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
      /* 블록 앞에 «문»(…;)이 끼어 있으면 — 후행 @layer 문·@namespace 등 — 그 문을 먼저 소비한다(TASK-020 R4-F2).
         안 그러면 `@layer x;\n.next` 가 통째로 «@ 로 시작하는 prelude» 가 되어 .next 블록이 조용히 사라진다.
         @charset·@import 는 stripImports/⓪ 검사 소관이라 여기서는 넘기고, 그 밖의 문은 fail-closed 로 기록한다. */
      const jj = noteStatements(j, open);
      const rawPrelude = textMask.slice(jj, open);
      const prelude = rawPrelude.trim();
      // 줄번호는 «선택자의 첫 글자» 기준. j 는 앞 규칙이 끝난 자리라 그대로 쓰면
      // 사이의 빈 줄·주석만큼 위로 어긋난다(260809 자기시험에서 적발).
      const lead = rawPrelude.length - rawPrelude.replace(/^\s*/, '').length;
      const startOff = jj + lead;

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
        } else if (!CASCADE_NEUTRAL_AT.has(name.toLowerCase())) {
          /* @layer 블록·@container·@scope·@starting-style·알 수 없는 at-rule — 캐스케이드에 «영향을 주는데» 이 게이트가
             계산하지 못하는 것. 조용히 건너뛰면 «본 척»이다 → fail-closed 로 기록(TASK-020 R4-F2). */
          parseNotes.push({ kind: 'block', name: '@' + name, line: lineOf(css, startOff) });
        }
        // @keyframes / @font-face 등(CASCADE_NEUTRAL_AT)은 캐스케이드 대상이 아니라 건너뛴다
      } else if (prelude) {
        /* CSS nesting(선언 블록 안의 규칙) — 파서가 모른다. 있으면 fail-closed 로 기록하고, 앞부분 선언은 그대로 읽는다. */
        if (masked.slice(bodyFrom, bodyTo).indexOf('{') >= 0) parseNotes.push({ kind: 'nesting', name: prelude.slice(0, 60), line: lineOf(css, startOff) });
        const decls = parseDecls(textMask, masked, bodyFrom, bodyTo);
        for (const sel of splitTop(textMask, masked, jj + lead, open, ',')) {
          const s = sel.text.trim();
          if (!s) continue;
          rules.push({ selector: unescapeSelector(s), decls, media: media && media.length ? media : null, line: lineOf(css, startOff), file: file || '' });
        }
      }
      j = k;
    }
  }

  scan(0, css.length, null);
  return rules;
}

/* 캐스케이드와 무관해 «조용히 건너뛰어도 되는» at-rule 블록(TASK-020 R4-F2). 여기 없는 at-rule 블록은 fail-closed. */
const CASCADE_NEUTRAL_AT = new Set(['keyframes', '-webkit-keyframes', '-moz-keyframes', 'font-face', 'page', 'counter-style',
  'property', 'font-feature-values', 'font-palette-values', 'view-transition']);
/* parseRules 가 «읽되 계산 못 하는» 문법을 적어 두는 통. parseSheets 가 시트마다 비워 가져간다. */
let parseNotes = [];
function takeParseNotes() { const n = parseNotes; parseNotes = []; return n; }

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

/* ══ 시트 로더 (260906 C1 · TASK-260906-020 R1-F1·F2 반영) ═══════════════════════════ */

/* 괄호 짝을 찾는다 — s[open] 이 '(' 일 때 짝이 되는 ')' 의 인덱스(없으면 -1). supports(…) 안에 괄호가 겹친다. */
function matchParen(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/* @import 문을 찾아 «같은 길이의 공백»으로 지운다. 마스크(문자열·주석 제거본)에서 찾으므로
   문자열 안의 '@import' 에 속지 않는다. spec·조건은 원문에서 자른다.
   ⚠️ TASK-020 R1-F1 (브라우저와 어긋나 «조용히 통과»하던 두 곳):
     ① `@import url(a.css) print;` 처럼 뒤에 붙는 supports(…)·미디어 조건을 버리지 않고 conds 로 돌려준다 —
        로더가 그 시트의 규칙 전부를 그 조건 아래 둔다(CSS Cascade 4 §2: 조건 불일치면 적용 안 됨).
     ② `@import url(a.css)\n@import url(b.css);` 처럼 세미콜론이 빠져 두 문이 하나로 읽히는 형태는 브라우저가
        «둘 다» 버린다(잘못된 prelude). 문법을 못 읽는 @import 도 같다. 그런 문은 지우지 않고 «남겨» ⓪ 검사
        (CSS-IMPORT-PRELUDE)가 FAIL 로 올리게 한다 — 지워 버리면 «못 읽은 것을 읽은 척»이 된다. */
function stripImports(raw) {
  const masked = maskOut(raw, true);
  const out = raw.split('');
  const imports = [];
  const re = /@import\b[^;{]*;/gi;   // CSS 키워드는 ASCII 대소문자 무구분 — `@IMPORT` 도 유효(TASK-020 R5-F1)
  /* ③ TASK-020 R2-F1: @import 는 시트 «머리»에만 올 수 있다(CSS Cascade 5 §@import — 앞에 올 수 있는 것은
     @charset·@layer 문뿐). 다른 규칙 «뒤»나 블록 «안»의 @import 는 브라우저가 무시한다. 그런 것을 로드하면
     브라우저가 안 쓰는 시트를 게이트가 «적용»한다. 머리 구간 = 첫 '{' 앞이면서, 그 앞 텍스트가 @charset·@layer·
     @import 문과 공백뿐인 곳. 밖에 있는 @import 는 남겨 ⓪ 검사가 FAIL 로 올린다. */
  const firstBrace = masked.indexOf('{');
  /* ③ 머리 판정은 «순서대로»(TASK-020 R3-F1): 머리 = 첫 '{' 앞. 그 안의 문(;로 끝나는 at-rule)을 앞에서부터 읽어
     @charset → @layer 문* → @import* 순서만 유효하다. 첫 @import «뒤»에 @layer 문이 끼면 그 뒤 @import 는 무효
     (CSS Cascade 5 §6.4.4.2). 그 밖의 문·토큰이 나오면 그 뒤 @import 도 무효. 무효 @import 는 남겨 ⓪ 이 FAIL 로 올린다. */
  const headText = firstBrace >= 0 ? masked.slice(0, firstBrace) : masked;
  const validImportIdx = new Set();
  const headStmts = [];
  {
    const stmtRe = /@([a-z-]+)\b[^;{]*;|[^\s;]+/gi;
    let seenImport = false, st;
    while ((st = stmtRe.exec(headText)) !== null) {
      const name = (st[1] || '').toLowerCase();
      /* 머리의 @charset·@layer 문(첫 @import 앞)은 «허용 범위»다. 그런데 @import 만 지우고 이것들을 남기면
         뒤 첫 규칙의 prelude 가 `@charset …; @layer …; .x` 가 되어 파서가 .x 블록을 삼킨다(TASK-020 R4-F1).
         그래서 같은 길이의 공백으로 함께 지운다(줄번호 보존). 레이어 «순서 선언»은 @layer 블록이 없는 한 캐스케이드에
         영향이 없고, 블록이 나타나면 parseRules 가 fail-closed 로 알린다. */
      if (name === 'charset' && !seenImport) { headStmts.push([st.index, st[0].length]); continue; }
      if (name === 'layer' && !seenImport) { headStmts.push([st.index, st[0].length]); continue; }
      if (name === 'import') { seenImport = true; validImportIdx.add(st.index); continue; }
      break;   // @layer(첫 @import 뒤)·@namespace·알 수 없는 토큰 → 이후 @import 전부 무효
    }
  }
  for (const [from, len] of headStmts) for (let k = from; k < from + len; k++) if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' ';
  const unsupported = [];
  let m;
  while ((m = re.exec(masked)) !== null) {
    if (!validImportIdx.has(m.index)) continue;                   // ③ 머리 밖·순서 위반 — 남긴다
    const inner = masked.slice(m.index + 7, m.index + m[0].length);
    if (/@import\b/i.test(inner)) continue;                      // ② 두 문이 붙음 — 남긴다
    const stmt = raw.slice(m.index, m.index + m[0].length);
    const head = stmt.match(/^@import\s+(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^"')\s]*))\s*\)|"([^"]*)"|'([^']*)')/si);
    if (!head) continue;                                          // 문법을 못 읽음 — 남긴다
    const spec = (head[1] ?? head[2] ?? head[3] ?? head[4] ?? head[5] ?? '').trim();
    let rest = stmt.slice(head[0].length).replace(/;\s*$/, '').trim();
    /* ④ `layer` / `layer(이름)` (TASK-020 R3-F3): 캐스케이드 레이어는 이 게이트의 위협 모델 밖(@layer 미지원 — 계산하려면
       레이어 순서·important 역순 우선순위가 필요). 미디어 조건으로 오인해 «적용»하지 않고 fail-closed — 남기고 따로 알린다. */
    if (/^layer\b/i.test(rest)) { unsupported.push({ kind: 'import-layer', line: lineOf(raw, m.index), what: '@import … ' + rest.split(/\s+/)[0] }); continue; }
    const conds = [];
    if (/^supports\s*\(/i.test(rest)) {                          // ① supports(…) 는 미디어 조건 «앞»에 온다
      const open = rest.indexOf('(');
      const close = matchParen(rest, open);
      if (close < 0) continue;                                    // 괄호가 안 닫힘 — 남긴다
      conds.push({ kind: 'supports', cond: rest.slice(open + 1, close).trim() });
      rest = rest.slice(close + 1).trim();
    }
    if (rest && !/^all$/i.test(rest)) conds.push({ kind: 'media', cond: rest });
    imports.push({ spec, line: lineOf(raw, m.index), conds });
    for (let k = m.index; k < m.index + m[0].length; k++) if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' ';
  }
  return { text: out.join(''), imports, unsupported };
}

/* @supports 조건의 «정적» 판정 (TASK-020 R2-F2). 뷰포트로는 못 정하고 브라우저 프로브도 없으므로,
   오늘날 전 브라우저가 지원하는 «단일 선언» 몇 가지만 참으로 확정하고 나머지는 null(보류)로 돌려준다.
   보류를 참으로 두면 «거짓인 조건부 @import·@supports 의 규칙»을 승자로 계산해 구멍을 메운 척하게 된다.
   true / null 만 있다 — false 는 만들지 않는다(«지원 안 함»을 정적으로 단정할 근거가 없다). */
/* ⚠️ TASK-020 R3-F2: «값 문법이 단순해 정식 문법 전체를 정규식으로 적을 수 있는» 속성만 둔다. grid-template-columns·
   aspect-ratio 처럼 문법이 복잡한 속성은 목록에서 뺀다(→ null 보류) — `/./` 같은 느슨한 패턴은 무효 값도 참으로 확정해
   R2-F2 를 되살린다. 여기 없는 속성·값은 전부 보류다. */
const SUPPORTS_TRUE = {
  display: /^(grid|inline-grid|flex|inline-flex|block|inline-block|none|contents)$/i,
  position: /^(sticky|fixed|absolute|relative)$/i,
  gap: /^(0|\d+(?:\.\d+)?(?:px|rem|em|%))$/i,
  'object-fit': /^(cover|contain|fill|none|scale-down)$/i,
};
function supportsMatches(cond) {
  let s = String(cond == null ? '' : cond).trim();
  if (/^\(.*\)$/s.test(s) && matchParen(s, 0) === s.length - 1) s = s.slice(1, -1).trim();
  if (!s || /\b(not|and|or)\b/i.test(s) || /\b(selector|font-tech|font-format)\s*\(/i.test(s)) return null;
  const m = s.match(/^([a-zA-Z-]+)\s*:\s*(.+)$/s);
  if (!m) return null;
  const re = SUPPORTS_TRUE[m[1].toLowerCase()];
  return re && re.test(m[2].trim()) ? true : null;
}

/* 원격(폰트 CDN)·data: 는 null — 규칙이 없다. 로컬은 «?v=·#» 을 떼고 파일 기준 상대 경로로. */
function resolveImport(spec, fromPath) {
  if (/^(?:https?:)?\/\//i.test(spec) || /^data:/i.test(spec)) return null;
  return path.resolve(path.dirname(fromPath), spec.replace(/[?#].*$/, ''));
}

/* 시트의 표시 이름 = «저장소 루트 기준 상대경로»(슬래시). 파일명만 쓰면 다른 폴더의 같은 이름과 섞인다(R1-F2). */
function sheetName(root, absPath) {
  return path.relative(root, absPath).split(path.sep).join('/');
}

/* 한 시트와 그 @import 트리를 «캐스케이드 순서»로 order 에 쌓는다.
   ⚠️ TASK-020 R1-F2: 같은 시트가 두 번 링크·@import 되면 브라우저는 «두 번» 적용한다(CSS Cascade 4 §2.2) —
      그래서 중복 제거를 하지 않는다. 막는 것은 «순환»(a → b → a)뿐이고, 순환은 정규화한 절대경로의 활성
      스택으로 판정한다. overrides 는 표시 이름을 키로 사본을 끼운다(자기시험 — 이름은 원래 것을 유지).
   conds = 이 시트를 끌어온 @import / <link media> 의 조건 누적 — parseSheets 가 규칙마다 앞에 붙인다. */
function loadSheetTree(filePath, name, stack, order, overrides, conds, root) {
  const canon = path.resolve(filePath);
  if (stack.includes(canon)) {
    throw new Error(`@import 순환: ${stack.map((p) => sheetName(root, p)).join(' → ')} → ${name}`);
  }
  const actual = (overrides && overrides[name]) ? path.resolve(overrides[name]) : filePath;
  const raw = fs.readFileSync(actual, 'utf8');
  const { text, imports, unsupported } = stripImports(raw);
  stack.push(canon);
  for (const imp of imports) {
    const p = resolveImport(imp.spec, filePath);
    if (!p) continue;
    const childName = sheetName(root, p);
    if (!(overrides && overrides[childName]) && !fs.existsSync(p)) {
      throw new Error(`${name}:${imp.line} @import 대상이 없다: ${imp.spec}`);
    }
    loadSheetTree(p, childName, stack, order, overrides, (conds || []).concat(imp.conds || []), root);
  }
  stack.pop();
  order.push({ name, path: actual, raw: text, imports, unsupported, conds: conds && conds.length ? conds : null });
}

/* <link …> 태그의 속성을 읽는다 (R1-F2). rel 은 «공백 구분 토큰 집합»(HTML 표준)이라 `rel="next stylesheet"` 도
   스타일시트다. 등호 주변 공백·따옴표 없는 값(`href=d.css`)도 HTML 이 허용하므로 받는다. */
function parseLinkAttrs(tag) {
  const attrs = {};
  const body = tag.replace(/^<link\b/i, '').replace(/\/?>\s*$/, '');
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(body)) !== null) attrs[m[1].toLowerCase()] = (m[2] ?? m[3] ?? m[4] ?? '');
  return attrs;
}

/* index.html 의 <link rel="stylesheet"> 를 «문서 순서»로 읽어 시트 목록을 만든다.
   순서를 여기 하드코딩하지 않는 이유: 링크 순서가 바뀌면 캐스케이드가 바뀌는데, 게이트가 옛 순서를
   고집하면 «본 척»이 된다. 외부(http) 링크는 규칙을 읽을 수 없으니 건너뛰고 건수만 돌려준다.
   <link media="…"> 는 그 시트의 조건이다(all 은 무조건). */
function loadSheets(opts) {
  const root = opts.root;
  const overrides = opts.overrides || {};
  /* HTML 주석 안의 <link> 는 비활성이다 — 지우고 훑는다(TASK-020 R6-F3). */
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const links = [];
  let external = 0;
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    const a = parseLinkAttrs(tag);
    const rel = (a.rel || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!rel.includes('stylesheet') || !a.href) continue;
    if (/^(?:https?:)?\/\//i.test(a.href)) { external++; continue; }
    const media = (a.media || '').trim();
    links.push({ href: a.href.replace(/[?#].*$/, ''), conds: media && !/^all$/i.test(media) ? [{ kind: 'media', cond: media }] : [] });
  }
  if (!links.length) throw new Error('index.html 에서 로컬 <link rel="stylesheet"> 를 하나도 못 찾았다 — 구조가 바뀌었는지 확인하라.');
  const order = [];
  for (const l of links) {
    const abs = path.join(root, l.href);
    loadSheetTree(abs, sheetName(root, abs), [], order, overrides, l.conds, root);
  }
  return { sheets: order, external, hrefs: links.map((l) => l.href) };
}

/* 자기시험용 환경변수 → overrides. 두 게이트(cascade·breakpoints)가 같은 규약을 쓴다.
     CSS_CASCADE_TARGET  = redesign.css 자리에 끼울 사본 경로 (260809 부터)
     CSS_CASCADE_SOURCES = JSON {"project/src/styles.css": "사본경로", ...} — 키는 루트 상대경로 (260906 C1) */
function envOverrides(env) {
  const o = {};
  if (env.CSS_CASCADE_TARGET) o['project/src/redesign.css'] = path.resolve(env.CSS_CASCADE_TARGET);
  if (env.CSS_CASCADE_SOURCES) Object.assign(o, JSON.parse(env.CSS_CASCADE_SOURCES));
  return o;
}

/* 시트 목록 → 규칙 목록(파일명 표기, 선언 순번은 전 시트에 걸쳐 단조 증가 = 캐스케이드 순서).
   시트에 조건(conds — 조건부 @import·<link media>)이 있으면 그 시트의 규칙마다 조건을 «앞»에 붙인다(AND). */
function parseSheets(sheets) {
  const rules = [];
  for (const s of sheets) {
    const masked = maskOut(s.raw, true);
    const textMask = maskOut(s.raw, false);
    const got = parseRules(s.raw, masked, textMask, s.name);
    s.ruleCount = got.length;
    const notes = takeParseNotes();
    if (notes.length) s.unsupported = (s.unsupported || []).concat(notes.map((n) => ({ kind: n.kind, line: n.line, what: n.name })));
    for (const r of got) {
      if (s.conds) r.media = s.conds.concat(r.media || []);
      rules.push(r);
    }
  }
  return rules;
}

module.exports = {
  maskOut, unescapeSelector, lineOf, splitTop, parseDecls, parseRules, expand, mediaText, SHORTHAND,
  stripImports, resolveImport, loadSheets, parseSheets, envOverrides, parseLinkAttrs, sheetName, matchParen, supportsMatches, takeParseNotes,
  declCount: () => declSeq,
};
