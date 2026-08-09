/* ──────────────────────────────────────────────────────────────────────────
   JSX 스모크 테스트 — «브라우저에서 안 깨지는가»를 배포 전에 잡는다

   ★ 왜 만들었나 (260805)
   접근성 자동 치환이 이미 `role="button"` 을 갖고 있던 앵커에 `role="link"` 를
   덧붙여 **중복 attribute** 를 만들었다. Babel 은 이걸 오류로 처리해
   `Home.jsx` 전체가 로드되지 않았고, **라이브 홈이 20분간 백지**가 됐다.
   계산 검산은 계산부만 잘라 쓰므로 이 사고를 못 잡는다.

   ★ 왜 «수제 파서»를 버렸나 (260805 Codex R15 P1)
   1판은 중괄호 깊이를 세는 손수 만든 태그 파서였는데, 문자열·템플릿 리터럴·
   정규식 안의 `{`·`}`·`>` 를 코드 구조로 오인해 **거짓 통과**를 낼 수 있었다.
     예) <a title="x > y" role="button" role="link">  ← 첫 `>` 에서 잘려 중복을 못 봄
   재발 방지 장치가 스스로 「0건」을 말하는 건 원래 사고와 같은 실패다.
   → **@babel/parser 로 실제 AST 를 만든다.** 파서가 없으면 «통과시키지 않고 실패»한다.

   실행:  node project/tests_jsx_smoke.js   (또는 npm test)
   ────────────────────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.jsx'));
let fails = 0;
const fail = (msg) => { console.log('FAIL  ' + msg); fails++; };

/* ── 파서 확보 — 없으면 «실패» (조용히 건너뛰지 않는다) ────────────────── */
let parser = null;
try {
  parser = require('@babel/parser');
} catch (e) {
  console.log('FAIL  @babel/parser 가 없습니다 — `npm install` 을 먼저 실행하세요.');
  console.log('      (파서 없이 통과시키면 이 테스트가 만들어진 이유가 사라집니다)');
  process.exit(1);
}

/* HTML 에서 기본으로 키보드 조작이 되는 요소 — 여기엔 role/tabIndex 를 요구하지 않는다 */
const NATIVE_INTERACTIVE = new Set(['button', 'input', 'select', 'textarea', 'summary', 'details', 'label', 'option']);

for (const f of files) {
  const src = fs.readFileSync(path.join(SRC, f), 'utf8');
  const line = (node) => (node && node.loc ? node.loc.start.line : '?');

  /* ── ① 실제 파싱 — 여기서 걸리면 브라우저에서도 그 파일이 통째로 죽는다 ── */
  let ast;
  try {
    ast = parser.parse(src, {
      sourceType: 'script',
      plugins: ['jsx'],
      errorRecovery: false,
      sourceFilename: f,
    });
  } catch (e) {
    fail(`파싱 실패  ${f}:${e.loc ? e.loc.line : '?'}  — ${String(e.message).split('\n')[0]}`);
    continue;                      // 파싱이 안 되면 아래 검사는 의미가 없다
  }

  /* ── AST 순회 (의존성 없이 직접) ─────────────────────────────────────── */
  const walk = (node, visit) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((n) => walk(n, visit)); return; }
    if (typeof node.type === 'string') visit(node);
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue;
      walk(node[k], visit);
    }
  };

  walk(ast.program, (node) => {
    if (node.type !== 'JSXOpeningElement') return;
    const nameNode = node.name;
    const tag = nameNode && nameNode.type === 'JSXIdentifier' ? nameNode.name : '(expr)';

    /* ── ② 중복 attribute — Babel 이 파일을 거부하는 그 원인 ───────────── */
    const seen = new Map();
    for (const attr of node.attributes) {
      if (attr.type !== 'JSXAttribute' || !attr.name || !attr.name.name) continue;
      const n = String(attr.name.name);
      if (seen.has(n)) {
        fail(`중복 속성  ${f}:${line(attr)}  <${tag}> 의 ${n} (앞선 선언 ${seen.get(n)}행)`);
      } else {
        seen.set(n, line(attr));
      }
    }

    /* ── ③ 키보드 조작 가능성 ────────────────────────────────────────────
       클릭 핸들러가 달렸는데 네이티브 인터랙티브 요소가 아니면
       role·tabIndex·키보드 핸들러가 모두 있어야 한다. (a 는 href 가 있으면 면제) */
    const has = (n) => seen.has(n);
    const isNative = NATIVE_INTERACTIVE.has(tag);
    const clickable = has('onClick');
    const anchorWithHref = tag === 'a' && has('href');
    if (clickable && !isNative && !anchorWithHref) {
      const missing = ['role', 'tabIndex', 'onKeyDown'].filter((n) => !has(n));
      if (missing.length) {
        fail(`키보드 조작 불가  ${f}:${line(node)}  <${tag}> onClick 있는데 ${missing.join('·')} 없음`);
      }
    }
    /* href 도 onClick 도 없는 <a> 는 링크가 아니다 — 최소한 포커스는 되어야 한다 */
    if (tag === 'a' && !anchorWithHref && !clickable && !has('tabIndex')) {
      fail(`포커스 불가  ${f}:${line(node)}  href·onClick 없는 <a> 에 tabIndex 없음`);
    }
  });
}


/* ── ③ 정의 없이 «참조»하는 식별자 ────────────────────────────────────────
   ★ 왜 (260809) — `const acRef = useHCRef(null);` 선언을 빠뜨린 채 `acRef.current` 를
      쓰기만 한 코드가 배포 직전까지 안 잡혔다. 문법은 멀쩡해 파싱은 통과하고,
      브라우저에서 ReferenceError 가 나며 «입력 onChange 핸들러가 통째로 죽어»
      「버튼이 영영 안 눌리는」 상태가 됐다. 눌러 보고서야 알았다.
   이 파일들은 모듈이 아니라 «전역 스크립트»라 서로의 이름을 window 로 주고받는다.
   그래서 «이 파일 안 + 알려진 전역» 밖의 맨이름이 나오면 사람이 봐야 한다. */
{
  const GLOBALS = new Set([
    'window', 'document', 'console', 'fetch', 'navigator', 'location', 'history', 'screen',
    'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame',
    'Promise', 'Math', 'Number', 'String', 'Boolean', 'Object', 'Array', 'JSON', 'Date',
    'Map', 'Set', 'WeakMap', 'Error', 'TypeError', 'RegExp', 'Symbol', 'BigInt', 'Intl',
    'parseFloat', 'parseInt', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent',
    'encodeURI', 'decodeURI', 'AbortController', 'URLSearchParams', 'URL', 'FormData', 'Blob',
    'sessionStorage', 'localStorage', 'matchMedia', 'getComputedStyle', 'alert', 'confirm',
    'React', 'ReactDOM', 'undefined', 'NaN', 'Infinity', 'arguments', 'globalThis',
    'require', 'module', 'exports', 'process',
    'IntersectionObserver', 'MutationObserver', 'ResizeObserver', 'performance',
    'DOMParser', 'Image', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent',
  ]);
  /* ⚠️ 이 파일들은 서로의 이름을 window 에 올려 쓴다 — `window.formatWon = …` 해 두고
     다른 파일에서 맨이름 `formatWon` 으로 부르는 것이 «이 저장소의 정상 구조»다.
     그걸 결함이라 하면 멀쩡한 코드 수십 건이 FAIL 나고, 그런 게이트는 곧 꺼진다.
     → 먼저 전 파일에서 `window.X = ` 로 «올려 둔 이름»을 모아 허용 집합에 넣는다.
        그러고도 남는 이름이 진짜 «아무 데도 없는» 것이다. */
  const exported = new Set();
  for (const f of files) {
    const src = fs.readFileSync(path.join(SRC, f), 'utf8');
    for (const m of src.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=[^=]/g)) exported.add(m[1]);
    /* ⚠️ window 게시만이 아니다 — 이 파일들은 «전역 스크립트»라 최상위 `function f(){}` 와
       `const/let/var` 도 그대로 전역이 된다. 실제로 `formatWon`·`acqKoreanAmount` 가
       그 방식으로 공유되고 있었다(내 첫 판은 이걸 몰라 멀쩡한 코드 20여 건을 FAIL 냈다). */
    try {
      const top = parser.parse(src, { sourceType: 'script', plugins: ['jsx'], errorRecovery: false });
      for (const st of top.program.body) {
        if (st.type === 'FunctionDeclaration' && st.id) exported.add(st.id.name);
        if (st.type === 'ClassDeclaration' && st.id) exported.add(st.id.name);
        if (st.type === 'VariableDeclaration') {
          for (const d of st.declarations) if (d.id && d.id.type === 'Identifier') exported.add(d.id.name);
        }
      }
    } catch (_e) { /* ① 에서 이미 실패로 잡혔다 */ }
  }
  for (const f of files) {
    const src = fs.readFileSync(path.join(SRC, f), 'utf8');
    const ln = (node) => (node && node.loc ? node.loc.start.line : '?');
    let ast;
    try { ast = parser.parse(src, { sourceType: 'script', plugins: ['jsx'], errorRecovery: false }); }
    catch (_e) { continue; }   /* ① 에서 이미 실패로 잡혔다 */
    const declared = new Set();
    const refs = new Map();
    const declarePattern = (n) => {
      if (!n || typeof n !== 'object') return;
      if (n.type === 'Identifier') { declared.add(n.name); return; }
      if (n.type === 'ObjectPattern') return n.properties.forEach((pr) => declarePattern(pr.value || pr.argument));
      if (n.type === 'ArrayPattern') return n.elements.forEach(declarePattern);
      if (n.type === 'AssignmentPattern') return declarePattern(n.left);
      if (n.type === 'RestElement') return declarePattern(n.argument);
    };
    (function walk(n, parent, key) {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) return n.forEach((x) => walk(x, parent, key));
      if (n.type === 'VariableDeclarator') declarePattern(n.id);
      if (/^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(n.type)) {
        if (n.id) declared.add(n.id.name);
        (n.params || []).forEach(declarePattern);
      }
      if (n.type === 'CatchClause' && n.param) declarePattern(n.param);
      if ((n.type === 'ClassDeclaration' || n.type === 'ClassExpression') && n.id) declared.add(n.id.name);
      if (n.type === 'Identifier') {
        /* ⚠️ `a?.tax` 는 MemberExpression 이 아니라 OptionalMemberExpression 이다 —
           빠뜨리면 속성 이름을 «참조»로 세어 오탐이 난다(ReportCGT 의 `tax` 가 그랬다). */
        const isMemberProp = parent && /^(MemberExpression|OptionalMemberExpression)$/.test(parent.type)
          && key === 'property' && !parent.computed;
        const isObjKey = parent && /^(ObjectProperty|ObjectMethod|ClassProperty|ClassMethod)$/.test(parent.type)
          && key === 'key' && !parent.computed;
        const isJsxAttr = parent && parent.type === 'JSXAttribute' && key === 'name';
        if (!isMemberProp && !isObjKey && !isJsxAttr && !refs.has(n.name)) refs.set(n.name, ln(n));
      }
      for (const k of Object.keys(n)) {
        if (k === 'loc' || k === 'start' || k === 'end' || /Comments$/.test(k)) continue;
        walk(n[k], n, k);
      }
    })(ast.program, null, null);
    for (const [name, at] of refs) {
      if (declared.has(name) || GLOBALS.has(name) || exported.has(name)) continue;
      fail(`정의 없음  ${f}:${at}  «${name}» 를 선언 없이 참조합니다 (window.${name} 로 쓰거나 선언하세요)`);
    }
  }
}

/* ── ④ 만들어 놓고 «내보내지 않은» 컴포넌트 ────────────────────────────────
   ★ 왜 (260809) — `window.JTHeroCalc = JTHeroCalc;` 한 줄을 지워도 모든 게이트가 통과했다.
      이 파일들은 전역 스크립트라 컴포넌트를 window 에 올려야 다른 파일이 쓴다. 안 올리면
      소비 측(`window.JTHeroCalc ? <window.JTHeroCalc/> : null`)이 조용히 null 을 그려
      **계산기가 화면에서 사라진다** — 오류도 안 난다. 그래서 «가장 늦게» 발견된다.

   ⚠️ 1판은 «문자열 포함»으로 짰다가 Codex 가 네 가지로 뚫었다:
        ① `const JTX = () => {}` 는 선언으로 못 봄        ② `window['JTX']` 소비를 못 읽음
        ③ «주석 안»의 `window.JTX = JTX;` 를 진짜 export 로 오인   ④ 공백·줄바꿈 변형에 오탐
      문자열로 문법을 흉내내면 이 싸움은 끝나지 않는다 — 이미 이 저장소에서 두 번 겪었다
      (정규식 HTML → 토크나이저 / 단어 검사 → AST). **파서를 쓴다.**
      AST 는 주석을 애초에 안 보고, 공백·줄바꿈에 영향받지 않으며, 대괄호 접근도 노드로 읽는다. */
{
  /* 파일마다 한 번만 파싱해 «선언·소비·노출»을 모은다 (파일 수² 순회를 피한다) */
  /* ⚠️ 같은 `JT*` 이름이 여러 파일에 있으면 Map.set 이 «마지막 파일»만 남겨,
     한 파일의 노출이 다른 파일의 미노출을 가린다 (Codex P1). 파일 «집합»으로 든다. */
  const declaredIn = new Map();   // 이름 → 선언한 파일 Set
  const exportedIn = new Map();   // 이름 → window 에 올린 파일
  const consumed = new Map();     // 이름 → 소비한 파일(첫 번째)

  for (const f of files) {
    const src = fs.readFileSync(path.join(SRC, f), 'utf8');
    let ast;
    try { ast = parser.parse(src, { sourceType: 'script', plugins: ['jsx'], errorRecovery: false }); }
    catch (_e) { continue; }   /* ① 에서 이미 실패로 잡혔다 */

    /* window.X / window['X'] 의 X 를 꺼낸다 — 점 접근과 대괄호 문자열을 같게 본다 */
    const winProp = (n) => {
      if (!n) return null;
      /* ⚠️ JSX 의 `<window.JTX />` 는 MemberExpression 이 «아니라» JSXMemberExpression 이다
         — 이걸 빠뜨리면 조건식 없이 바로 쓰는 소비를 놓친다 (260809 Codex P1).
         `window.JTX ? <window.JTX/> : null` 이 잡히던 건 «조건식» 덕분이었을 뿐이다. */
      if (n.type === 'JSXMemberExpression') {
        return (n.object && n.object.type === 'JSXIdentifier' && n.object.name === 'window'
          && n.property && n.property.name) || null;
      }
      if (n.type !== 'MemberExpression' && n.type !== 'OptionalMemberExpression') return null;
      if (!n.object || n.object.type !== 'Identifier' || n.object.name !== 'window') return null;
      if (!n.computed && n.property && n.property.type === 'Identifier') return n.property.name;
      if (n.computed && n.property && n.property.type === 'StringLiteral') return n.property.value;
      return null;
    };

    for (const st of ast.program.body) {
      const note = (nm) => {
        if (!declaredIn.has(nm)) declaredIn.set(nm, new Set());
        declaredIn.get(nm).add(f);
      };
      if (st.type === 'FunctionDeclaration' && st.id && /^JT/.test(st.id.name)) note(st.id.name);
      if (st.type === 'VariableDeclaration') {
        for (const d of st.declarations) {
          if (d.id && d.id.type === 'Identifier' && /^JT/.test(d.id.name)) note(d.id.name);
        }
      }
    }

    (function walk(n, parent) {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) return n.forEach((x) => walk(x, parent));
      /* 노출: window.X = … (대입의 «왼쪽»). 값이 무엇이든 «올라간다»는 사실이 중요하다 */
      if (n.type === 'AssignmentExpression') {
        const nm = winProp(n.left);
        if (nm && /^JT/.test(nm)) exportedIn.set(nm, f);
      }
      /* Object.assign(window, { JTX }) 도 노출이다 */
      if (n.type === 'CallExpression' && n.callee && n.callee.type === 'MemberExpression'
        && n.callee.object && n.callee.object.name === 'Object'
        && n.callee.property && n.callee.property.name === 'assign'
        && n.arguments[0] && n.arguments[0].name === 'window') {
        for (const arg of n.arguments.slice(1)) {
          if (arg.type !== 'ObjectExpression') continue;
          for (const pr of arg.properties) {
            const k = pr.key && (pr.key.name || pr.key.value);
            if (k && /^JT/.test(k)) exportedIn.set(k, f);
          }
        }
      }
      /* 소비: window.X 를 «읽는» 곳 (대입의 왼쪽은 제외 — 그건 노출이다) */
      const nm = winProp(n);
      if (nm && /^JT/.test(nm)) {
        const isAssignTarget = parent && parent.type === 'AssignmentExpression' && parent.left === n;
        if (!isAssignTarget && !consumed.has(nm)) consumed.set(nm, f);
      }
      for (const k of Object.keys(n)) {
        if (k === 'loc' || k === 'start' || k === 'end' || /Comments$/.test(k)) continue;
        walk(n[k], n);
      }
    })(ast.program, null);
  }

  /* ── 이 검사의 «위협 모델» ─────────────────────────────────────────────
     막으려는 것: **깜빡 잊은 것.** 컴포넌트를 만들고 `window.X = X;` 를 빠뜨리면
     화면에서 조용히 사라지는데 오류도 안 난다 — 그게 이 검사가 존재하는 이유다.

     막지 «않는» 것 (Codex 가 제시했고, 판단해서 범위 밖으로 둔다):
       · `if (false) window.X = X;` · 호출되지 않는 함수 안의 대입 — 실행 여부는 정적으로
         못 정한다. 그리고 «실수로» 이렇게 쓰는 사람은 없다.
       · `function install(window) { window.X = X }` 처럼 `window` 를 가린 지역 변수 —
         스코프 분석을 다 하려면 이 검사가 작은 번들러가 된다.
       · `src` 밖·`.js` 브리지 파일에서의 노출 — 지금 이 저장소에 그런 파일이 없다.
         생기면 그때 이 목록을 넓힌다(그 편이 «지금 없는 것»을 위해 복잡해지는 것보다 낫다).
       · `window.X = Y` 처럼 «다른 값»을 같은 이름에 올리는 것 — 노출 자체는 일어난다.

     ⛔ 여기서 «완전 재현»을 쫓지 않는다. 문법을 전부 흉내내려는 검사는 위양성을 만들고,
        위양성이 나면 사람이 게이트를 끈다 — 그러면 «깜빡 잊은 것»조차 못 막게 된다.
        선을 넓혀야 할 이유가 생기면 «그 사례를 여기 적고» 넓힌다. */
  for (const [name, filesWith] of declaredIn) {
    if (!consumed.has(name)) continue;              // 아무도 window 로 안 쓰면 대상 아님
    if (exportedIn.has(name)) continue;             // 어디선가 올렸으면 통과
    for (const file of filesWith) {
      fail(`미노출  ${file}  «${name}» 를 window 에 올리지 않았습니다 `
        + `(${consumed.get(name)} 가 window.${name} 로 씁니다)`);
    }
  }
}
console.log(`\n(파싱 ${files.length}개 JSX 파일 · @babel/parser)`);
console.log(`════════════════════\nJSX 스모크 실패 ${fails}건`);
process.exit(fails ? 1 : 0);
