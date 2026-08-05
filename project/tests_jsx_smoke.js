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

console.log(`\n(파싱 ${files.length}개 JSX 파일 · @babel/parser)`);
console.log(`════════════════════\nJSX 스모크 실패 ${fails}건`);
process.exit(fails ? 1 : 0);
