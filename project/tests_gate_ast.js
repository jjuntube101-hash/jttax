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
/* ⚠️ 새 *FallbackGaps 를 만들면 «반드시» 여기에 등록한다 — 판정 함수 자체 테스트만
   통과하고 AI·공유 차단 회귀는 안 잡히는 구멍이 생긴다 (260806 Codex R18 P1: 법인전환이
   이 목록에 없어, 게이트의 return 을 지워도 두 테스트가 전부 통과했다). */
const TARGETS = [
  ['ReportInheritance.jsx', 'inhFallbackGaps'],
  ['ReportGift.jsx', 'giftFallbackGaps'],
  ['ReportAcquisition.jsx', 'acqFallbackGaps'],
  ['ReportProperty.jsx', 'propFallbackGaps'],
  ['ReportCGT.jsx', 'cgtFallbackGaps'],
  ['ReportIncome.jsx', 'incFallbackGaps'],
  ['ReportCorporate.jsx', 'corpFallbackGaps'],
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
      /* 인자 형태는 파일마다 다르다(법인전환은 calc 가 TDZ 라 리터럴을 넘긴다) —
         «판정 함수를 부르는가»만 본다. 인자까지 고정하면 정당한 변형에 헛되이 깨진다. */
      if (src.includes(`${fn}(`) && alwaysReturns(n.consequent)) gates.push(n);
    }
    if (n.type === 'CallExpression') {
      const callee = code.slice(n.callee.start, n.callee.end);
      if (callee === 'window.claude.complete' && (aiCallStart === null || n.start < aiCallStart)) aiCallStart = n.start;
    }
  });

  eq(`${file} · 판정 결과로 «return 하는» 게이트가 있다`, gates.length > 0, true);
  if (!gates.length) return;
  /* AI 호출이 «없는» 계산기(종합소득세)도 있다. 그때는 순서를 볼 대상이 없으므로
     「지금은 없다」는 사실만 고정한다 — 나중에 누가 AI 호출을 넣으면 이 줄이 FAIL 나서
     게이트 순서를 같이 챙기게 된다. 조용히 통과시키면 그때 또 샌다. */
  if (aiCallStart === null) {
    eq(`${file} · AI 호출이 없다 (생기면 게이트 순서를 함께 배선해야 한다)`, true, true);
    return;
  }

  /* ② 그 게이트가 AI 호출보다 앞이어야 한다. «막고 나가는» 게이트만 세므로,
        빈 껍데기 if 를 앞에 두는 되돌림으로는 통과할 수 없다. */
  const earliestGate = Math.min(...gates.map((g) => g.start));
  eq(`${file} · «막고 나가는» 게이트가 AI 호출보다 앞이다`, earliestGate < aiCallStart, true);

  /* ③ 게이트와 AI 호출을 «직접» 감싸는 함수가 같아야 한다.
        종전엔 «둘 다 포함하는 함수가 하나라도 있으면» 통과였는데, 그러면 이런 되돌림이 샌다
        (260806 Codex P1) —

          const stopIfBlocked = () => {
            if (giftFallbackGaps(answers, calc).length > 0) { setReport(rep); return; }  ← helper 만 종료
          };
          stopIfBlocked();
          const txt = await window.claude.complete(prompt);                              ← 그대로 실행

        helper 안의 return 은 helper 만 끝내고 runAnalysis 는 계속 간다. 감싸는 함수가
        둘 다 포함하니 종전 검사는 통과했다. 그래서 «가장 안쪽» 함수를 비교한다. */
  const innermostFnAt = (pos) => {
    let best = null;
    walk(ast.program, (n) => {
      const isFn = n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression';
      if (!isFn || n.start > pos || n.end < pos) return;
      if (!best || (n.end - n.start) < (best.end - best.start)) best = n;
    });
    return best;
  };
  const gateFn = innermostFnAt(earliestGate);
  const aiFn = innermostFnAt(aiCallStart);
  eq(`${file} · 게이트와 AI 호출을 «직접» 감싸는 함수가 같다`,
     !!gateFn && !!aiFn && gateFn.start === aiFn.start, true);

  /* ④ AI 호출이 `finally` 안에 있으면 안 된다 — finally 는 return 을 «통과»해도 실행되므로
        게이트가 아무리 앞에 있어도 소용없다. 게이트가 try 안에 있는 것 자체는 정상이다
        (try 안의 return 도 함수를 종료한다). 막아야 할 건 «return 해도 실행되는 자리»뿐이다. */
  let aiInFinally = false;
  walk(ast.program, (n) => {
    if (n.type !== 'TryStatement' || !n.finalizer) return;
    if (n.finalizer.start <= aiCallStart && n.finalizer.end >= aiCallStart) aiInFinally = true;
  });
  eq(`${file} · AI 호출이 finally 안에 있지 않다 (return 을 통과해도 실행되는 자리)`, aiInFinally, false);
});

console.log(`\n════════════════════\n실패 ${fails}건`);
process.exit(fails ? 1 : 0);
