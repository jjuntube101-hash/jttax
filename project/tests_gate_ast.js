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
/* 「외부 AI 를 쓰지 않는다」가 정책인 파일 — 이 목록에 있으면 AI 호출 수 0 을 «기대값»으로
   검사한다. 순서 검사만으로는 부족하다: 게이트 «뒤»에 AI 를 추가하면 순서상 통과라
   정책 위반이 조용히 들어온다 (260806 Codex R19 P2).
   AI 를 의도적으로 도입할 땐 이 목록에서 빼고, 그 커밋에서 프롬프트 범위·차단 입력
   전송 금지·게이트 순서를 함께 검토한다. */
const NO_AI_FILES = new Set(['ReportIncome.jsx']);

const TARGETS = [
  ['ReportInheritance.jsx', 'inhFallbackGaps'],
  ['ReportGift.jsx', 'giftFallbackGaps'],
  ['ReportAcquisition.jsx', 'acqFallbackGaps'],
  ['ReportProperty.jsx', 'propFallbackGaps'],
  ['ReportCGT.jsx', 'cgtFallbackGaps'],
  ['ReportIncome.jsx', 'incFallbackGaps'],
  ['ReportCorporate.jsx', 'corpFallbackGaps'],
  ['ReportComprehensive.jsx', 'compFallbackGaps'],
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

  /* ① 판정 함수의 «결과를 실제로 조건으로 쓰는» if 문 중, 막고 return 하는 것이 있는가.
        ⚠️ 문자열로 `fn(` 이 있는지만 보면 이런 가짜 게이트가 통과한다 (260806 Codex R19 P1) —

          if (corpFallbackGaps(answers, calc), false) { return; }   ← 쉼표 연산자로 결과를 버림

        호출도 하고, if 도 있고, return 도 있고, AI 호출보다 앞이고, 같은 함수 안이다.
        그런데 «막지 않는다». 그래서 조건식의 «구조»를 본다:
          fn(...).length  를  0  과 비교하는 이항식이어야 한다. */
  /* `const gaps = fn(...)` 로 담아 둔 변수 — 변수를 거쳐 쓰는 건 «정당한» 형태다.
     실제로 렌더 쪽은 전부 그렇게 쓴다. 직접 호출만 인정하면 동작이 같은 리팩터링에
     헛경보가 난다(260806 주입 실험으로 확인). 헛경보는 게이트를 죽인다.

     ⚠️ 단, «이름»만 기억하면 shadowing 으로 뚫린다 (260806 Codex R20 P1) —

       { const gaps = compFallbackGaps(answers, calc); }   ← 이름만 등록됨
       const gaps = [];                                    ← 다른 선언
       if (gaps.length) { return; }                        ← 빈 배열이라 안 막힘

     @babel/traverse 가 없어 스코프 해석은 못 하지만, «같은 이름이 두 번 이상 선언되면
     어느 것을 가리키는지 알 수 없다»는 사실은 안다. 그럴 땐 그 이름을 인정하지 않는다 —
     모르면 통과시키지 않는 쪽이 맞다. 정당한 코드에서 같은 이름을 두 번 선언할 이유도 없다. */
  const gapDecls = new Map();   // 이름 → 판정함수로 초기화된 선언 수
  const allDecls = new Map();   // 이름 → 전체 선언 수
  walk(ast.program, (n) => {
    if (n.type !== 'VariableDeclarator' || !n.id || n.id.type !== 'Identifier') return;
    const name = n.id.name;
    allDecls.set(name, (allDecls.get(name) || 0) + 1);
    const init = n.init;
    if (init && init.type === 'CallExpression' && init.callee
        && init.callee.type === 'Identifier' && init.callee.name === fn) {
      gapDecls.set(name, (gapDecls.get(name) || 0) + 1);
    }
  });
  const gapVars = new Set(
    [...gapDecls.keys()].filter((name) => allDecls.get(name) === gapDecls.get(name)),
  );
  /* 판정 결과를 «실제로 조건으로 쓰는가» — 값을 버리는 가짜 게이트를 걸러 내는 핵심 */
  const isGapsLength = (L) => {
    if (!L || L.type !== 'MemberExpression' || !L.property || L.property.name !== 'length') return false;
    const o = L.object;
    if (!o) return false;
    if (o.type === 'CallExpression') {
      return !!o.callee && o.callee.type === 'Identifier' && o.callee.name === fn;
    }
    return o.type === 'Identifier' && gapVars.has(o.name);
  };
  const isGateTest = (t) => {
    if (!t) return false;
    /* `if (gaps.length)` truthy 형도 정당하다 */
    if (isGapsLength(t)) return true;
    if (t.type !== 'BinaryExpression') return false;
    if (!['>', '!==', '!=', '>='].includes(t.operator)) return false;
    if (!isGapsLength(t.left)) return false;
    const R = t.right;
    if (!R || R.type !== 'NumericLiteral') return false;
    return t.operator === '>=' ? R.value >= 1 : R.value === 0;
  };
  const gates = [];
  let aiCallStart = null;
  walk(ast.program, (n) => {
    if (n.type === 'IfStatement') {
      if (isGateTest(n.test) && alwaysReturns(n.consequent)) gates.push(n);
    }
    if (n.type === 'CallExpression') {
      const callee = code.slice(n.callee.start, n.callee.end);
      if (callee === 'window.claude.complete' && (aiCallStart === null || n.start < aiCallStart)) aiCallStart = n.start;
    }
  });

  eq(`${file} · 판정 결과로 «return 하는» 게이트가 있다`, gates.length > 0, true);
  if (!gates.length) return;
  /* AI 비사용 «정책» 파일은 호출 수 0 을 직접 고정한다. 그냥 통과시키면
     게이트 뒤에 AI 를 넣는 방식으로 정책이 조용히 무너진다 (R19 P2). */
  if (NO_AI_FILES.has(file)) {
    eq(`${file} · AI 비사용 정책 — window.claude.complete 호출 0회`
       + ' (도입하려면 NO_AI_FILES 에서 빼고 게이트 순서를 함께 검토)', aiCallStart === null, true);
    if (aiCallStart === null) return;
  }
  if (aiCallStart === null) return;   // 정책 파일이 아닌데 AI 가 없으면 볼 순서가 없다

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

  /* ⑤ runAnalysis 안의 «모든» 판정 호출이 실제 게이트에 쓰이는가.
        게이트가 둘(엔진 전 ①층 + 엔진 후 ②층)인 파일에서, 하나만 무력화하면
        「게이트가 있다」는 여전히 참이라 위 검사들이 통과한다. 그래서 개수가 아니라
        «남는 호출이 있는가»를 본다 — 판정해 놓고 안 쓰는 호출이 곧 무력화의 흔적이다. */
  const raFn = (() => {
    let best = null;
    walk(ast.program, (n) => {
      const isFn = n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression' || n.type === 'FunctionDeclaration';
      if (!isFn) return;
      const body = code.slice(n.start, n.end);
      if (!body.includes(`${fn}(`) || !body.includes('setLoading(true)')) return;
      if (!best || (n.end - n.start) < (best.end - best.start)) best = n;
    });
    return best;
  })();
  if (!raFn) { eq(`${file} · runAnalysis 를 찾았다`, false, true); return; }
  const callsInRa = [];
  walk(raFn, (n) => {
    if (n.type === 'CallExpression' && n.callee && n.callee.type === 'Identifier' && n.callee.name === fn) callsInRa.push(n.start);
  });
  /* 게이트 조건식 안에 들어 있거나, 게이트가 쓰는 변수의 초기화인 호출이면 «쓰인 것» */
  const usedRanges = gates.map((g) => [g.test.start, g.test.end]);
  walk(raFn, (n) => {
    if (n.type !== 'VariableDeclarator' || !n.id || n.id.type !== 'Identifier') return;
    if (!gapVars.has(n.id.name) || !n.init) return;
    usedRanges.push([n.init.start, n.init.end]);
  });
  const orphan = callsInRa.filter((pos) => !usedRanges.some(([a, b]) => pos >= a && pos <= b));
  eq(`${file} · 판정 호출이 전부 게이트에 쓰인다 (판정만 하고 안 쓰는 호출 = 무력화 흔적)`,
     orphan.length, 0);
});

/* ── 판정 함수를 «분석»과 «렌더»가 둘 다 쓰는가 — 실제 호출 노드로 센다 ──────────
   종전엔 소스에서 `fn(` 문자열을 셌다. 그건 `fn (a, b)` 처럼 공백만 넣어도 못 세고,
   반대로 주석·문자열 안의 `fn(` 은 세어 버린다 (260806 Codex R19 P2).
   규칙이 «한 벌»인지는 실제 CallExpression 으로 확인해야 한다. */
console.log('\n════ 판정 규칙이 한 벌인가 — 실제 호출 노드로 확인 ════');
TARGETS.forEach(([file, fn]) => {
  const code = fs.readFileSync(SRC(file), 'utf8');
  const ast = parser.parse(code, { sourceType: 'script', plugins: ['jsx'] });
  let defs = 0;
  const calls = [];
  walk(ast.program, (n) => {
    if (n.type === 'FunctionDeclaration' && n.id && n.id.name === fn) defs++;
    if (n.type === 'CallExpression' && n.callee && n.callee.type === 'Identifier' && n.callee.name === fn) calls.push(n.start);
  });
  eq(`${file} · ${fn} 정의가 정확히 1개다`, defs, 1);
  eq(`${file} · 분석·렌더 최소 2곳에서 호출한다 (규칙이 두 벌이면 반드시 어긋난다)`,
     calls.length >= 2, true);
});

console.log(`\n════════════════════\n실패 ${fails}건`);
process.exit(fails ? 1 : 0);
