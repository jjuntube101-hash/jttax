/* 차단 게이트가 «실제로 빠져나가는지»를 AST 로 확인한다.

   왜 이 파일이 따로 있나 (260806 Codex P1):
     tests_fallback_block.js 는 `indexOf` 로 «게이트 문자열이 AI 호출보다 앞인가»만 봤다.
     그러면 이런 되돌림을 통과시킨다 —

       if (giftFallbackGaps(answers, calc).length > 0) { hint = '...'; }   ← 앞에 있지만 안 막음
       const txt = await window.claude.complete(prompt);                   ← 그대로 나감
       if (gaps.length > 0) { setReport(...); return; }                    ← 뒤늦게 막음

     문자열 순서도 맞고 호출 횟수도 맞는다. 그런데 세액은 이미 외부로 나갔다.
     그래서 «판정 호출이 들어 있는 if 문이 return 으로 끝나는가»를 구문 트리에서 직접 본다.

   ⚠️ 이 검사는 jsdom 없이 할 수 있는 최선이다. 실제 렌더·네트워크까지 확인하려면
      브라우저에서 window.claude.complete 를 mock 해 호출 0회를 보는 실측이 필요하다
      (260806 실측 완료 — 커밋 메시지에 결과 기록). */
const fs = require('fs'), path = require('path');
const parser = require('@babel/parser');

const SRC = (f) => path.join(__dirname, 'src', f);
const TARGETS = [
  ['ReportInheritance.jsx', 'inhFallbackGaps'],
  ['ReportGift.jsx', 'giftFallbackGaps'],
  ['ReportAcquisition.jsx', 'acqFallbackGaps'],
  ['ReportProperty.jsx', 'propFallbackGaps'],
  ['ReportCGT.jsx', 'cgtFallbackGaps'],
];

let fails = 0;
function eq(label, got, want) {
  const ok = String(got) === String(want); if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n      got=${JSON.stringify(got)}  want=${JSON.stringify(want)}`);
}

/* 트리를 훑으며 조건에 맞는 노드를 모은다 (visitor 라이브러리 없이) */
function walk(node, visit, parent) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((n) => walk(n, visit, parent)); return; }
  if (typeof node.type === 'string') visit(node, parent);
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue;
    walk(node[k], visit, node);
  }
}

/* 이 서브트리 안에서 «반드시» return 으로 빠져나가는가 — 조건부 return 은 인정하지 않는다 */
function alwaysReturns(node) {
  if (!node) return false;
  if (node.type === 'ReturnStatement') return true;
  if (node.type === 'BlockStatement') return node.body.some(alwaysReturns);
  return false;
}

console.log('════ 차단 게이트가 «막고 나가는가» — 구문 트리로 확인 ════');
TARGETS.forEach(([file, fn]) => {
  const code = fs.readFileSync(SRC(file), 'utf8');
  const ast = parser.parse(code, { sourceType: 'script', plugins: ['jsx'] });

  /* ① 판정 함수를 부르는 if 문 중, «막고 return 하는» 것이 있는가 */
  const gates = [];
  let aiCallStart = null;
  walk(ast.program, (n) => {
    if (n.type === 'IfStatement') {
      const src = code.slice(n.test.start, n.test.end);
      if (src.includes(`${fn}(answers, calc)`) && alwaysReturns(n.consequent)) gates.push(n);
    }
    if (n.type === 'CallExpression') {
      const callee = code.slice(n.callee.start, n.callee.end);
      if (callee === 'window.claude.complete' && (aiCallStart === null || n.start < aiCallStart)) aiCallStart = n.start;
    }
  });

  eq(`${file} · 판정 결과로 «return 하는» 게이트가 있다`, gates.length > 0, true);
  eq(`${file} · window.claude.complete 호출이 있다(계측 대상 존재)`, aiCallStart !== null, true);
  if (!gates.length || aiCallStart === null) return;

  /* ② 그 게이트가 AI 호출보다 앞이어야 한다. «막고 나가는» 게이트만 세므로,
        빈 껍데기 if 를 앞에 두는 되돌림으로는 통과할 수 없다. */
  const earliestGate = Math.min(...gates.map((g) => g.start));
  eq(`${file} · «막고 나가는» 게이트가 AI 호출보다 앞이다`, earliestGate < aiCallStart, true);

  /* ③ 게이트와 AI 호출이 같은 함수(runAnalysis) 안이어야 의미가 있다 —
        딴 함수에 있는 게이트는 이 경로를 막지 못한다. */
  let sameFn = false;
  walk(ast.program, (n) => {
    const isFn = n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression';
    if (!isFn) return;
    if (n.start < earliestGate && n.end > aiCallStart) {
      const body = code.slice(n.start, n.end);
      /* 가장 안쪽 함수만 보고 싶지만, 감싸는 함수도 참이라 «둘 다 포함»이면 충분하다 */
      if (body.includes(`${fn}(answers, calc)`) && body.includes('window.claude.complete')) sameFn = true;
    }
  });
  eq(`${file} · 게이트와 AI 호출이 같은 함수 안에 있다`, sameFn, true);
});

console.log(`\n════════════════════\n실패 ${fails}건`);
process.exit(fails ? 1 : 0);
