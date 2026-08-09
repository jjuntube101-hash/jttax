/* 리드 폼 3종의 «전환 계측·완료 화면»이 실제 전송 성공에 묶여 있는지 AST 로 확인한다.

   왜 이 파일이 따로 있나 (260808):
     종전 세 폼은 전부 이런 모양이었다 —

       if (window.gtag) window.gtag('event', 'booking_submit', {...});   ← fetch 전에 발화
       try {
         if (키 있음) { await fetch(...); }
         else { window.location.href = 'mailto:...'; }                    ← 열렸는지 알 수 없음
         setDone(true);                                                   ← 그런데 「접수 완료」
       } catch (e) { ... }

     둘 다 «실패를 성공으로 세는» 코드다.
       ① 전환 이벤트가 fetch 앞에 있으면 네트워크 차단·4xx·이탈 건까지 전환이 된다.
          그 수치로 「어느 채널이 상담을 만드는가」를 판단하면 판단 자체가 틀어진다.
       ② mailto 는 메일 앱이 없는 기기에서 «아무 일도 일어나지 않는다». 그런데도
          setDone(true) 가 실행돼 방문자는 접수된 줄 알고 기다리고, 사무소에는
          아무것도 오지 않는다.

     문자열 순서만 보면 이런 되돌림을 놓친다 —
       try { ... } catch(e) { }
       finally { if (window.gtag) gtag('event','booking_submit'); }      ← 뒤에 있지만 실패도 발화

     그래서 «전환 이벤트가 fetch 보다 뒤인가»와 «mailto 분기가 throw 로 끝나는가»를
     구문 트리에서 직접 본다.

   ⚠️ 한계 — 이 검사는 jsdom 없이 할 수 있는 최선이다. 실제 네트워크 4xx/timeout 응답에
      대한 화면 전이는 브라우저 실측으로 확인한다(260808 수행). Phase 2 의 Playwright
      스윕이 들어오면 그쪽으로 승격할 것. */
const fs = require('fs'), path = require('path');
const parser = require('@babel/parser');

const SRC = (f) => path.join(__dirname, 'src', f);

/* ⚠️ 주석은 «고지»가 아니다 — 검사에서 제외한다.
   처음엔 원문 그대로 훑었더니, 「단정 문구를 삭제한다」고 설명한 내 «주석»이 단정 문구로
   잡혀 위양성이 났다 (260808). 게이트가 오탐을 내면 산출물보다 검사 로직을 먼저 본다. */
const stripComments = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')   // JSX 주석 {/* ... */}
  .replace(/\/\*[\s\S]*?\*\//g, ' ')       // 블록 주석
  .replace(/^[ \t]*\/\/.*$/gm, ' ');       // 줄 주석

/* 검사 대상 — [파일, 함수를 특정할 전환 이벤트명, 완료 setter 이름]
   ⚠️ 새 리드 폼을 만들면 «반드시» 여기에 등록한다. 등록을 잊으면 그 폼만 옛 패턴으로
      되돌아가도 게이트가 조용히 통과한다 (tests_gate_ast.js 가 260806 에 겪은 구멍과 같다). */
const TARGETS = [
  ['Pages2.jsx', 'booking_submit', 'setDone'],
  ['ReportConvert.jsx', 'report_lead_submit', 'setDone'],
];

/* PDF 게이트는 성격이 다르다 — 이벤트가 «인쇄창을 여는 행위»를 세므로 실패해도 발화한다.
   대신 sent 판정이 끝난 «뒤»에 발화하고 sent 를 파라미터로 실어야 두 지표가 분리된다. */
const PDF_TARGET = ['ReportConvert.jsx', 'report_pdf_request'];

let fails = 0;
function eq(label, got, want) {
  const ok = String(got) === String(want); if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n      got=${JSON.stringify(got)}  want=${JSON.stringify(want)}`);
}

function parse(file) {
  return parser.parse(fs.readFileSync(SRC(file), 'utf8'), {
    sourceType: 'script',
    plugins: ['jsx'],
    errorRecovery: true,
  });
}

/* AST 를 훑어 조건에 맞는 노드를 모은다 (부모 추적 포함) */
function walk(node, visit, parent) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(n => walk(n, visit, parent)); return; }
  if (node.type) visit(node, parent);
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue;
    walk(node[k], visit, node);
  }
}

/* 이벤트 발화 노드를 찾는다 — 두 형태를 모두 인식한다.
     ① gtag('event', '<name>', ...)        raw 호출 (사이트 전반의 기존 형태)
     ② jtEvent('<name>', ...)              예외를 삼키는 래퍼 (260808 신설, 리드 폼은 이것만 허용)
   ⚠️ ①만 알던 시절, 코드를 ②로 바꾸자 게이트가 「이벤트가 없다」며 FAIL 했다.
      검사기는 «개선된 형태»도 알아야 한다 — 모르면 개선을 되돌리라고 압박하게 된다. */
function findEventCalls(ast, eventName) {
  const hits = [];
  walk(ast, (n) => {
    // 옵셔널 체이닝(`window.jtEvent?.(…)`)도 같은 호출이다 — 하나만 보면 개선을 회귀로 오판한다
    if (n.type !== 'CallExpression' && n.type !== 'OptionalCallExpression') return;
    const c = n.callee, a = n.arguments || [];
    const isMember = c.type === 'MemberExpression' || c.type === 'OptionalMemberExpression';
    const isGtag = (isMember && c.property && c.property.name === 'gtag')
      || (c.type === 'Identifier' && c.name === 'gtag');
    const isWrapper = (isMember && c.property && c.property.name === 'jtEvent')
      || (c.type === 'Identifier' && c.name === 'jtEvent');
    if (isGtag && a.length >= 2 && a[0].type === 'StringLiteral' && a[0].value === 'event'
      && a[1].type === 'StringLiteral' && a[1].value === eventName) hits.push(n);
    if (isWrapper && a.length >= 1 && a[0].type === 'StringLiteral' && a[0].value === eventName) hits.push(n);
  });
  return hits;
}

/* mailto 를 window.location.href 에 대입하는 문장을 «직접» 담은 블록을 찾는다.

   ⚠️ 처음엔 「블록 안 어딘가에 mailto 문자열이 있으면」으로 잡았더니 중첩된 바깥
      블록(함수 본문·try·if)까지 전부 걸려 위양성 6건이 났다 (260808). 검사 의도는
      «mailto 로 분기한 그 자리가 throw 로 끝나는가»이므로 직계 자식만 본다.
      — 게이트가 오탐을 내면 산출물보다 먼저 검사 로직이 규칙 의도보다 넓은지 본다. */
function findMailtoBlocks(ast) {
  const blocks = [];
  walk(ast, (n) => {
    if (n.type !== 'BlockStatement') return;
    const direct = (n.body || []).some((st) => {
      if (st.type !== 'ExpressionStatement') return false;
      const e = st.expression;
      if (!e || e.type !== 'AssignmentExpression') return false;
      return /location/.test(JSON.stringify(e.left)) && /mailto:/.test(JSON.stringify(e.right));
    });
    if (direct) blocks.push(n);
  });
  return blocks;
}

/* 주어진 오프셋을 감싸는 «가장 안쪽» 함수의 범위를 돌려준다.
   위치 비교 검사에서 «다른 함수의 판정»을 잘못 기준 삼지 않으려면 함수 경계가 필요하다
   (260808 Codex R8 P2 — 음성 대조군 ㉜ 이 실제로 이 구멍을 뚫었다). */
function enclosingFunctionRange(ast, pos) {
  let best = null;
  walk(ast, (n) => {
    if (n.type !== 'FunctionDeclaration' && n.type !== 'FunctionExpression'
      && n.type !== 'ArrowFunctionExpression') return;
    if (typeof n.start !== 'number' || typeof n.end !== 'number') return;
    if (n.start <= pos && pos <= n.end) {
      if (!best || (n.end - n.start) < (best.end - best.start)) best = { start: n.start, end: n.end };
    }
  });
  return best;
}

/* Chrome.jsx 의 유틸 3종(jtEvent·jtAttribution·jtAttributionFields)을 «구문 트리»로 본다.

   🔑 왜 실행(vm)을 그만뒀나 (260808 Codex P2a R10 P1):
     R6 에 정규식의 한계를 넘으려고 `node:vm` 으로 «실제 실행»을 도입했다. 값은 정확해졌지만
     Node 공식 문서가 **`node:vm` 은 격리 경계가 아니다**라고 명시한다 — timeout 도 Promise
     작업은 못 막는다. 게이트가 CI 에서 자동으로 도는데, 검사 대상 파일에 부작용 코드가
     들어오면 그대로 실행된다. 「검사하려다 실행시킨다」는 건 게이트가 질 위험이 아니다.

   그래서 실행 없이, 그러나 정규식보다 강하게 — **AST 로 본다**:
     · 함수 «본문 안»에 실제 호출이 있는가 (문자열 매칭이 아니라 CallExpression 노드)
     · `if (false) …` 처럼 **절대 실행되지 않는 분기**에 들어 있지는 않은가
     · 반환 객체의 «키 집합»은 무엇인가 (spread 로 넣어도 ObjectExpression 에 드러난다)
     · 같은 이름이 두 번 할당되지는 않는가
   추출이 실패하면 그 자체를 FAIL 로 만들어(아래 eq) 조용히 «검사 안 함»으로 넘어가지 않게 한다.

   ⚠️ 이 게이트가 «막는 것»과 «막지 않는 것» (260808, Codex R1~R11 종료 시점 기준)
     막는다  — 실수로 생기는 회귀: 함수를 비움 / 호출을 지움 / try 밖으로 뺌 / 이벤트명을
               상수로 바꿈 / 반환 키를 늘리거나 줄임 / 같은 이름을 두 번 할당 /
               `if(false)`·`if(0===1)`·`!true`·`false &&`·`for(;false;)` 같은 죽은 분기 /
               중첩 함수(decoy)에만 호출을 두기 / 무조건 return 뒤의 코드
     막지 않는다 — «게이트를 속이려고 작정한 코드». 예를 들어 런타임에만 결정되는 플래그로
               분기를 죽이거나(`if (FLAG_FROM_CONFIG)`), 호출을 여러 단계 간접 참조로 감싸면
               정적 분석으로는 판정할 수 없다. 그건 코드 리뷰·저장소 접근 권한의 영역이고,
               게이트가 감당할 범위를 넘으면 게이트 자체가 컴파일러가 된다.
     ⛔ 그러므로 「게이트가 녹색」을 「악의적 변경이 없다」로 읽지 말 것. 이 게이트의 약속은
        «사람이 실수로 되돌린 것을 잡는다» 하나다. */
function loadChromeApi() {
  const src = fs.readFileSync(SRC('Chrome.jsx'), 'utf8');
  let ast;
  try { ast = parser.parse(src, { sourceType: 'script', plugins: ['jsx'], errorRecovery: true }); }
  catch (e) { return { error: `파싱 예외: ${(e.message || '').slice(0, 60)}` }; }
  if (ast.errors && ast.errors.length) return { error: `문법 오류 ${ast.errors.length}건` };

  /** window.<name> = … 대입을 전부 모은다 (재할당 감지용) */
  const assignsOf = (name) => {
    const hits = [];
    walk(ast, (n) => {
      if (n.type !== 'AssignmentExpression') return;
      const L = n.left;
      if (L && L.type === 'MemberExpression' && !L.computed
        && L.object && L.object.type === 'Identifier' && L.object.name === 'window'
        && L.property && L.property.name === name) hits.push(n);
    });
    return hits;
  };

  /** 상수식을 최대한 접어 falsy 여부를 본다 (정적으로 확정 가능한 것만) */
  const constFalsy = (t) => {
    if (!t) return false;
    switch (t.type) {
      case 'BooleanLiteral': return t.value === false;
      case 'NumericLiteral': return t.value === 0;
      case 'StringLiteral': return t.value === '';
      case 'NullLiteral': return true;
      case 'Identifier': return t.name === 'undefined';
      case 'UnaryExpression':                       // !true / !1
        return t.operator === '!' && constTruthy(t.argument);
      case 'BinaryExpression': {                    // 0===1 / 1!==1 같은 상수 비교
        const L = litVal(t.left), R = litVal(t.right);
        if (L === undefined || R === undefined) return false;
        if (t.operator === '===' || t.operator === '==') return L !== R;
        if (t.operator === '!==' || t.operator === '!=') return L === R;
        return false;
      }
      case 'LogicalExpression':                     // false && x
        return t.operator === '&&' && constFalsy(t.left);
      default: return false;
    }
  };
  const constTruthy = (t) => {
    if (!t) return false;
    if (t.type === 'BooleanLiteral') return t.value === true;
    if (t.type === 'NumericLiteral') return t.value !== 0;
    if (t.type === 'StringLiteral') return t.value !== '';
    return false;
  };
  const litVal = (t) => {
    if (!t) return undefined;
    if (t.type === 'StringLiteral' || t.type === 'NumericLiteral' || t.type === 'BooleanLiteral') return t.value;
    if (t.type === 'NullLiteral') return null;
    return undefined;
  };

  /** 노드가 «절대 실행되지 않는 분기» 안에 있는지 (260808 Codex R11 P1 로 상수식 확장) */
  const deadBranches = (root) => {
    const dead = [];
    walk(root, (n) => {
      if ((n.type === 'IfStatement' || n.type === 'WhileStatement') && constFalsy(n.test)) {
        dead.push(n.type === 'IfStatement' ? n.consequent : n.body);
      }
      if (n.type === 'ForStatement' && n.test && constFalsy(n.test)) dead.push(n.body);
      if (n.type === 'ConditionalExpression' && constFalsy(n.test)) dead.push(n.consequent);
      // false && foo() — 오른쪽은 절대 평가되지 않는다
      if (n.type === 'LogicalExpression' && n.operator === '&&' && constFalsy(n.left)) dead.push(n.right);
    });
    return dead;
  };

  /** root «자신»의 본문만 본다 — 중첩 함수(decoy) 안의 코드는 root 를 대표하지 않는다.
      ⚠️ 이게 없으면 `function decoy(){ gtag('event', name) }` 를 넣어 놓고 본체는 no-op 으로
         비워도 통과한다 (260808 Codex R11 P1).

      ⓘ 알려진 위양성 2건 (260808 Codex R12 P2 — 마감 시점에 «기록만» 하고 남김):
        · **IIFE**: `(function(){ gtag('event', name) })()` 처럼 즉시 실행되는 함수 안의
          호출은 실제로 실행되는데도 여기서 decoy 로 제외된다. 지금 세 유틸 중 IIFE 는
          `jtAttribution` 뿐이고 그 안에서 gtag 를 부르지 않아 실제 영향은 없다.
          → 나중에 계측을 IIFE 로 감싸게 되면 이 함수에 «즉시 호출되는가» 판정을 더할 것.
        · **shadow 된 `undefined`**: 지역 매개변수로 `undefined` 를 가린 경우 constFalsy 가
          falsy 로 본다. 그런 코드는 그 자체로 피해야 할 패턴이라 방치한다. */
  const isNested = (node, root) => {
    let nested = false;
    walk(root, (n) => {
      if (n === root || nested) return;
      if (n.type !== 'FunctionDeclaration' && n.type !== 'FunctionExpression'
        && n.type !== 'ArrowFunctionExpression' && n.type !== 'ObjectMethod'
        && n.type !== 'ClassMethod') return;
      if (typeof n.start === 'number' && node.start >= n.start && node.end <= n.end) nested = true;
    });
    return nested;
  };
  const inAnyDead = (node, root) =>
    deadBranches(root).some(d => d && typeof d.start === 'number'
      && node.start >= d.start && node.end <= d.end);

  /** 함수 본문에서 gtag('event', …) 호출을 «살아 있는 경로»에서만 센다 */
  const liveGtagCalls = (fnNode) => {
    const hits = [];
    walk(fnNode, (n) => {
      /* ⚠️ `window.gtag?.(…)` 는 CallExpression 이 아니라 OptionalCallExpression 이다.
         하나만 보면 «정상 리팩터링»(옵셔널 체이닝 도입)을 회귀로 오판한다 — 실측 위양성.
         멤버 접근도 `window?.gtag` 면 OptionalMemberExpression 이다 (260808 R12 자체검증). */
      if (n.type !== 'CallExpression' && n.type !== 'OptionalCallExpression') return;
      const c = n.callee;
      const isMember = c.type === 'MemberExpression' || c.type === 'OptionalMemberExpression';
      const isGtag = (isMember && c.property && c.property.name === 'gtag')
        || (c.type === 'Identifier' && c.name === 'gtag');
      if (!isGtag) return;
      const a = n.arguments || [];
      if (!(a.length >= 1 && a[0].type === 'StringLiteral' && a[0].value === 'event')) return;
      if (inAnyDead(n, fnNode)) return;      // if(false) 안이면 실행되지 않는다
      if (isNested(n, fnNode)) return;       // 중첩 함수(decoy) 안이면 이 함수를 대표하지 않는다
      hits.push(n);
    });
    return hits;
  };

  /** 함수 본문 최상위에서 «무조건 빠져나가는» 지점 뒤는 도달 불가다.
      ⚠️ `if (1) return {};` 를 함수 맨 앞에 넣고 뒤에 진짜 return 을 남겨 두면,
         런타임은 `{}` 를 반환하는데 게이트는 뒤엣것의 키를 읽어 통과한다
         (260808 Codex R11 P1). 조건 없는 return·상수 truthy 조건의 return 을 경계로 삼는다. */
  const unreachableFrom = (fnNode) => {
    const body = fnNode && fnNode.body && fnNode.body.type === 'BlockStatement'
      ? fnNode.body.body : null;
    if (!body) return Infinity;
    for (const st of body) {
      if (st.type === 'ReturnStatement' || st.type === 'ThrowStatement') return st.end;
      if (st.type === 'IfStatement' && constTruthy(st.test)) {
        const c = st.consequent;
        const hasRet = c && (c.type === 'ReturnStatement'
          || (c.type === 'BlockStatement' && c.body.some(x => x.type === 'ReturnStatement')));
        if (hasRet) return st.end;
      }
    }
    return Infinity;
  };

  /** return 하는 ObjectExpression 들의 «직접 키» 목록 (spread 는 별도로 표시) */
  const returnedKeys = (fnNode) => {
    const keys = []; let hasSpread = false; let found = false;
    const cutoff = unreachableFrom(fnNode);
    walk(fnNode, (n) => {
      if (n.type !== 'ReturnStatement' || !n.argument) return;
      if (n.argument.type !== 'ObjectExpression') return;
      // 중첩 함수의 return 은 이 함수의 반환값이 아니다 (Codex R11 P1)
      if (isNested(n, fnNode)) return;
      // 앞에서 이미 무조건 빠져나갔다면 여기는 실행되지 않는다
      if (typeof n.start === 'number' && n.start > cutoff) return;
      found = true;
      for (const p of n.argument.properties) {
        if (p.type === 'SpreadElement') { hasSpread = true; continue; }
        if (p.key) keys.push(p.key.name || p.key.value);
      }
    });
    return { keys, hasSpread, found };
  };

  const ev = assignsOf('jtEvent');
  const at = assignsOf('jtAttribution');
  const fd = assignsOf('jtAttributionFields');
  const tc = assignsOf('jtTrackCta');

  return {
    error: null,
    assigns: { jtEvent: ev.length, jtAttribution: at.length, jtAttributionFields: fd.length, jtTrackCta: tc.length },
    extracted: { okEvent: ev.length === 1, okAttr: at.length === 1, okField: fd.length === 1 },
    jtEventNode: ev[0] ? ev[0].right : null,
    jtTrackCtaNode: tc[0] ? tc[0].right : null,
    fieldsNode: fd[0] ? fd[0].right : null,
    liveGtagCalls, returnedKeys, inAnyDead,
  };
}

console.log('════ 리드 폼: 전환 계측·완료 화면이 전송 성공에 묶여 있는가 ════\n');

for (const [file, evName, doneSetter] of TARGETS) {
  const code = fs.readFileSync(SRC(file), 'utf8');
  const ast = parse(file);

  // ① 전환 이벤트가 «있고», fetch 보다 뒤에 온다
  const gtags = findEventCalls(ast, evName);
  eq(`${file}: ${evName} 이벤트 존재`, gtags.length > 0, true);

  if (gtags.length > 0) {
    const evPos = gtags[0].start;
    // 같은 파일에서 web3forms 로 보내는 fetch 위치
    const fetchPos = code.indexOf('api.web3forms.com/submit');
    eq(`${file}: ${evName} 이 fetch «뒤»에 발화 (실패 건 전환 집계 차단)`,
      fetchPos >= 0 && evPos > fetchPos, true);

    /* ⚠️ 「fetch 뒤」만으로는 부족하다 (260808 Codex R1 P1). fetch 는 걸었지만 응답의
       success 를 «보기 전»에 발화하는 상태도 fetch 뒤다. 실제 안전선은 sent 판정이므로
       그 지점보다 뒤인지를 함께 본다. */
    const sentPos = code.indexOf('sent = !!(res.ok');
    eq(`${file}: ${evName} 이 sent 판정 «뒤»에 발화 (응답 확인 전 발화 차단)`,
      sentPos >= 0 && evPos > sentPos, true);

    // ② 이벤트 바로 뒤에 완료 setter 가 온다 = 성공 경로에서만 함께 실행
    const tail = code.slice(evPos, evPos + 400);
    eq(`${file}: ${evName} 직후에 ${doneSetter}(true)`,
      new RegExp(`${doneSetter}\\(true\\)`).test(tail), true);
    eq(`${file}: ${doneSetter}(true) 도 sent 판정 «뒤»에만 존재`,
      sentPos >= 0 && code.indexOf(`${doneSetter}(true)`, sentPos) > sentPos
      && code.indexOf(`${doneSetter}(true)`) > sentPos, true);

    /* ③ 계측이 접수를 망치지 않는다 — 전환 이벤트는 예외를 삼키는 래퍼로만 부른다.
       raw gtag 를 try 안에서 직접 부르면 광고차단기 환경에서 «성공인데 실패 화면»이 된다. */
    eq(`${file}: ${evName} 을 jtEvent 래퍼로 발화 (gtag throw 가 접수를 깨지 않음)`,
      new RegExp(`jtEvent\\(\\s*'${evName}'`).test(code), true);
  }

  // ③ mailto 분기는 throw 로 끝나야 한다 — 아래 setDone 으로 흘러들면 거짓 완료
  const mblocks = findMailtoBlocks(ast);
  eq(`${file}: 폼 제출 mailto 분기 존재`, mblocks.length > 0, true);
  for (let i = 0; i < mblocks.length; i++) {
    const body = mblocks[i].body || [];
    const last = body[body.length - 1];
    eq(`${file}: mailto 분기 #${i + 1} 가 throw 로 종료 (거짓 「접수 완료」 차단)`,
      !!(last && last.type === 'ThrowStatement'), true);
  }

  // ④ 유입 출처가 payload 에 실린다
  eq(`${file}: jtAttributionFields 로 유입 출처 보존`,
    /jtAttributionFields\s*\(/.test(code), true);
}

console.log('\n════ PDF 게이트: 행위 계측이되 sent 를 분리해 싣는가 ════\n');
{
  const [file, evName] = PDF_TARGET;
  const code = fs.readFileSync(SRC(file), 'utf8');
  const ast = parse(file);
  const hits = findEventCalls(ast, evName);
  eq(`${file}: ${evName} 존재`, hits.length > 0, true);
  if (hits.length > 0) {
    const n = hits[0];
    /* sent 판정(=setSentOk 직전)보다 뒤에 있어야 sent 를 실을 수 있다.
       ⚠️ 이 파일에는 `sent = !!(res.ok` 가 여러 개 있다(리드폼·PDF).
         · 파일 전체에서 «첫» sent 를 기준 → PDF 판정 앞으로 되돌려도 통과 (Codex R8 P2)
         · 이벤트 앞의 «가장 가까운» sent 를 기준 → 그래도 리드폼 sent 가 잡혀 통과
           (음성 대조군 ㉜ 이 실제로 뚫었다)
       → 이벤트를 감싸는 «그 함수» 범위 안에서만 sent 판정을 찾는다. 함수 경계는 AST 로 잡는다. */
    const fnRange = enclosingFunctionRange(ast, n.start);
    eq(`${file}: ${evName} 을 감싸는 함수 범위 확인`, !!fnRange, true);
    const scope = fnRange ? code.slice(fnRange.start, fnRange.end) : '';
    const rel = scope.indexOf('sent = !!(res.ok');
    const sentAbs = rel >= 0 ? fnRange.start + rel : -1;
    eq(`${file}: ${evName} 이 «같은 함수 안의» sent 판정 뒤에 발화`,
      sentAbs >= 0 && n.start > sentAbs, true);
    const argSrc = code.slice(n.start, n.end);
    eq(`${file}: ${evName} 파라미터에 sent 포함 (도달 여부 분리 계측)`,
      /sent\s*:/.test(argSrc), true);
  }
}

console.log('\n════ 동의문 ↔ 실제 전송 항목 일치 ════\n');
{
  /* 🔑 왜 이 검사가 생겼나 (260808 Codex R4 P2):
       attribution 을 payload 에 추가하면서 동의문 4곳 중 «3곳만» 고치고 리드 폼 하나를
       빠뜨렸다. 그런데 게이트는 `jtAttributionFields` 호출 «존재»만 봤기 때문에
       고지가 어긋난 상태를 그대로 통과시켰다 — 코덱스가 R4 에서 잡아냈다.
       고지는 코드가 아니라 «문장»이라 AST 로 못 본다. 그래서 문구 자체를 검사한다.

     ⚠️ payload 에 새 필드를 추가하면 «반드시» 아래 REQUIRED 와 각 동의문을 함께 고친다.
        jtAttributionFields 가 만드는 필드: 접수ID·유입경로·유입상세·랜딩페이지·제출위치 */
  const REQUIRED = ['접수번호', '유입 매체', '유입 사이트 주소', '첫 방문 경로', '제출 위치', '접수 시각'];

  /* ⚠️ 문구 검사만으로는 «반대 방향의 어긋남»을 못 잡는다 (260808 Codex R5 P2):
       동의문은 그대로 두고 payload 쪽에 새 필드를 추가하면 고지 없이 전송하게 된다.

     🔑 그리고 «정규식으로 소스를 읽는» 방식은 우회당한다 (Codex R6 P2) —
        `return {...기존, ...{화면해상도: screen.width}}` 처럼 스프레드로 넣으면
        직접 프로퍼티가 아니라서 안 잡힌다.
     → 그래서 소스를 «읽지» 않고 **실제로 실행해 반환값을 본다**. 어떤 문법으로 넣든
        결과 객체의 키에는 드러난다. */
  {
    const EXPECTED_KEYS = ['접수ID', '유입경로', '유입상세', '랜딩페이지', '제출위치'];
    const api = loadChromeApi();
    eq('Chrome.jsx 파싱 오류 없음', api.error || 'none', 'none');
    eq('attribution: jtAttributionFields 정의 1개', api.assigns && api.assigns.jtAttributionFields, 1);
    if (api.fieldsNode) {
      const { keys, hasSpread, found } = api.returnedKeys(api.fieldsNode);
      eq('attribution: 반환 객체를 찾음', found, true);
      /* spread 로 넣으면 키 집합을 정적으로 확정할 수 없다 — 고지 없이 필드가 늘어날 수 있으므로
         판정 불가로 거부한다(값을 «추론»하지 않는다는 원칙). */
      eq('attribution 반환에 spread 없음 (키 집합을 확정할 수 있어야 함)', hasSpread, false);
      const extra = keys.filter(k => EXPECTED_KEYS.indexOf(k) < 0);
      const missing = EXPECTED_KEYS.filter(k => keys.indexOf(k) < 0);
      eq(`attribution 전송 필드 집합 고정 (추가된 것: ${extra.join('·') || '없음'})`, extra.length, 0);
      eq(`attribution 전송 필드 누락 없음 (빠진 것: ${missing.join('·') || '없음'})`, missing.length, 0);
      // 금액·계산값이 섞이지 않는지 — 키 이름으로 확인
      eq('attribution 반환 키에 금액류 없음',
        keys.some(k => /(금액|취득가|양도가|세액|calc)/.test(String(k))), false);
    }
  }
  /* 동의를 받는 지점 4곳 — [파일, 그 지점을 특정할 앵커 문자열, 라벨] */
  const CONSENTS = [
    ['Pages2.jsx', '개인정보 수집·이용 동의', '예약폼'],
    ['ReportConvert.jsx', '상담 목적 개인정보 수집·이용', '리포트 회신폼'],
    ['ReportConvert.jsx', '개인정보 수집·이용 및 처리위탁에 동의합니다. 수집 항목', 'PDF 게이트'],
    ['ReportConvert.jsx', '[1/2] 개인정보 수집·이용 동의', '카톡 확인창'],
  ];

  for (const [file, anchor, label] of CONSENTS) {
    const code = stripComments(fs.readFileSync(SRC(file), 'utf8'));
    const at = code.indexOf(anchor);
    eq(`${label}: 동의 지점 존재`, at >= 0, true);
    if (at < 0) continue;
    const seg = code.slice(at, at + 1400);
    const missing = REQUIRED.filter(k => seg.indexOf(k) < 0);
    eq(`${label}: 전송 항목 6종 전부 고지 (누락: ${missing.join('·') || '없음'})`, missing.length, 0);
    // §15② 요건 — 보유기간·거부권
    eq(`${label}: 보유기간 고지`, /보유[·기]|3년/.test(seg), true);
    eq(`${label}: 거부할 권리 고지`, /거부/.test(seg), true);
    /* 보장할 수 없는 단정은 쓰지 않는다 — referrer·landing 에 무엇이 실릴지 우리가 정하지 못한다 */
    eq(`${label}: 「개인 식별 정보 미포함」 단정 없음`,
      /개인 식별 정보는 포함하지 않|개인을 식별하는 정보는 포함하지 않/.test(seg), false);
  }

  /* ── §28의8 국외 이전 (260809 결재 「안 A」) ──────────────────────────────
     Web3Forms 서버가 «미국»이라 이 4곳은 전부 국외 이전이다. §28의8① 은 국외
     제공·처리위탁·보관을 원칙 «금지»하고 5개 예외만 두는데, 우리가 쓰는 1호는
     ②의 5가지를 미리 알릴 것을 요구한다. 종전엔 「처리위탁: 외부 폼 서비스」라고만
     적혀 있어 «국외»라는 사실이 어디에도 없었다 (260809 Codex B-2 P0).
     ⚠️ 검사는 «국외 고지 블록 안»에서만 한다 — 위 §15 문구의 낱말을 빌려 쓰면
        국외 고지가 없어도 통과해 버린다. */
  const INTL_REQ = [
    ['이전 항목', /이전 항목|위 수집 항목|위 항목/],
    ['국가', /미국/],
    ['시기·방법', /제출\s*즉시|HTTPS/],
    ['받는 자', /Web3Forms/],
    ['받는 자 연락처', /@web3forms\.com/],
    ['보유기간', /2개월/],
    ['거부 방법·효과', /거부/],
  ];
  const INTL_ANCHORS = [
    ['Pages2.jsx', '개인정보 국외 이전 동의', '예약폼'],
    ['ReportConvert.jsx', '개인정보 국외 이전에 동의합니다. (필수)', '리포트 회신폼'],
    ['ReportConvert.jsx', '개인정보 국외 이전에 동의합니다.</strong>', 'PDF 게이트'],
    ['ReportConvert.jsx', '[2/2] 개인정보 국외 이전 동의', '카톡 확인창'],
  ];
  for (const [file, anchor, label] of INTL_ANCHORS) {
    const code = stripComments(fs.readFileSync(SRC(file), 'utf8'));
    const at = code.indexOf(anchor);
    eq(`${label}: 국외 이전 고지 존재 (§28의8)`, at >= 0, true);
    if (at < 0) continue;
    const seg = code.slice(at, at + 1200);
    const miss = INTL_REQ.filter(([, re]) => !re.test(seg)).map(([k]) => k);
    eq(`${label}: §28의8② 고지 6요건 (누락: ${miss.join('·') || '없음'})`, miss.length, 0);
  }

  /* 동의는 «별도»여야 한다 (§28의8①1호) — 체크박스를 하나로 합치면 별도가 아니다.
     그리고 «동의 없이는 전송되지 않아야» 한다 — 문구만 있고 가드가 없으면 고지 위반이다. */
  {
    const pg2 = stripComments(fs.readFileSync(SRC('Pages2.jsx'), 'utf8'));
    eq('예약폼: 국외이전 동의가 별도 state', /consentIntl/.test(pg2), true);
    eq('예약폼: 두 동의를 «모두» 받아야 전송',
      /canSubmit\s*=\s*form\.consent\s*&&\s*form\.consentIntl/.test(pg2), true);
    const rc = stripComments(fs.readFileSync(SRC('ReportConvert.jsx'), 'utf8'));
    eq('리포트·PDF: 국외이전 동의가 별도 state (2곳)',
      (rc.match(/const \[agreeIntl/g) || []).length, 2);
    eq('리포트·PDF: 두 동의를 «모두» 받아야 전송 (2곳)',
      (rc.match(/agree && agreeIntl/g) || []).length, 2);
    /* ⚠️ 가드 «식»만 고정하면 초기값으로 뚫린다 (260809 Codex R10 P0) —
       `consentIntl: false` 를 `true` 로 바꾸면 식은 그대로인데 «처음부터 동의된 상태»가 된다.
       체크박스는 화면에 있지만 이미 켜져 있으므로 정보주체는 «동의한 적이 없는데» 전송된다.
       초기값·리셋 경로를 모두 못 박는다. */
    const INIT_PINS = [
      ['예약폼 초기값 consent', pg2, 'consent: false,'],
      ['예약폼 초기값 consentIntl', pg2, 'consentIntl: false,'],
      ['예약폼 리셋에 consent·consentIntl 둘 다 false', pg2, 'consent: false, consentIntl: false }'],
      ['리포트·PDF 초기값 agree(2곳)', rc, 'const [agree, setAgree] = useCvtState(false);'],
      ['리포트·PDF 초기값 agreeIntl(2곳)', rc, 'const [agreeIntl, setAgreeIntl] = useCvtState(false);'],
    ];
    for (const [label, src, needle] of INIT_PINS) {
      const n = src.split(needle).length - 1;
      eq(`${label} — 「${needle.slice(0, 34)}」`, n >= 1, true);
    }
    /* 반대로 «true 로 초기화된» 동의 state 가 하나라도 있으면 즉시 FAIL */
    const truthy = [
      ...(pg2.match(/consent(?:Intl)?\s*:\s*true/g) || []),
      ...(rc.match(/const \[agree(?:Intl)?,[^\]]*\]\s*=\s*useCvtState\(\s*true\s*\)/g) || []),
    ];
    eq(`동의 state 가 true 로 초기화된 곳 없음 (${truthy.join(' · ') || '없음'})`, truthy.length, 0);

    /* ⚠️ 초기값만 못 박으면 «마운트 뒤 주입»이 남는다 (260809 Codex R11 P0) —
       `useEffect(() => setAgreeIntl(sessionStorage.getItem('x')==='1'), [])` 같은 한 줄이면
       초기값은 false 그대로인데 화면이 뜨자마자 동의된 상태가 된다.
       → 동의 setter 는 «체크박스 onChange» 에서만 불려야 한다. 호출 지점을 전수로 못 박는다. */
    const SETTER_PINS = [
      ['예약폼 consent', pg2, /set\('consent'\)/g, /onChange=\{set\('consent'\)\}/g, 1],
      ['예약폼 consentIntl', pg2, /set\('consentIntl'\)/g, /onChange=\{set\('consentIntl'\)\}/g, 1],
      ['리포트·PDF agree', rc, /setAgree\(/g, /onChange=\{e => setAgree\(e\.target\.checked\)\}/g, 2],
      ['리포트·PDF agreeIntl', rc, /setAgreeIntl\(/g, /onChange=\{e => setAgreeIntl\(e\.target\.checked\)\}/g, 2],
    ];
    for (const [label, src, allRe, okRe, want] of SETTER_PINS) {
      const all = (src.match(allRe) || []).length;
      const ok = (src.match(okRe) || []).length;
      eq(`${label}: 체크박스 onChange 호출이 ${want}곳`, ok, want);
      eq(`${label}: 그 밖의 호출 없음 (전체 ${all})`, all, want);
    }
    /* 동의 state 를 저장소에서 «복원»하지 않는다 — 이전 방문의 동의를 이번 제출에 쓰면 안 된다 */
    for (const [label, src] of [['예약폼', pg2], ['리포트·PDF', rc]]) {
      const restore = (src.match(/(?:session|local)Storage[\s\S]{0,60}?(consent|consentIntl|agree|agreeIntl)\b/g) || []);
      eq(`${label}: 동의를 저장소에서 복원하지 않음 (${restore.length}건)`, restore.length, 0);
    }

    /* ⚠️ 예약폼 동의문이 열거 항목을 «전부 필수»라고 안내했는데, 실제 가드는 성명·연락처뿐이고
       처리방침도 셋만 필수라 한다 — 세 곳이 서로 달랐다 (260809 Codex R10 P1).
       고지가 실제보다 넓으면 필요 없는 정보를 «필수»로 받아 내는 셈이라 최소수집 원칙에 어긋난다. */
    eq('예약폼 고지가 필수/선택을 구분', /\(필수\)[\s\S]{0,80}?\/\s*\(선택\)/.test(pg2), true);
    eq('예약폼 고지가 「위 항목은 …필수」라 뭉뚱그리지 않음', /위 항목은 상담 접수에 «필수»/.test(pg2), false);
    {
      const m = pg2.match(/\(필수\)\s*([^/]*)\//);
      eq('예약폼 필수 항목 표기 존재', !!m, true);
      if (m) {
        const req = m[1];
        for (const k of ['성명', '연락처', '문의분야']) eq(`예약폼 고지 필수에 ${k} 포함`, req.indexOf(k) >= 0, true);
        for (const k of ['이메일', '회사명']) eq(`예약폼 고지 필수에 ${k} «없음»(선택이므로)`, req.indexOf(k) < 0, true);
      }
    }

    /* ⚠️ 고지문이 «실제 동작»과 어긋나 있었다 (260809). PDF 게이트는
       「거부 시 PDF 저장은 그대로 가능하고 사무소 전달만 이루어지지 않습니다」라고 적어 놓고,
       정작 저장 버튼을 동의에 묶어 두어 거부하면 저장도 못 했다. 그건 거짓 고지이자
       §16③(최소한의 정보 «외»의 수집에 동의하지 않는다는 이유로 재화·서비스 제공 거부 금지)
       위반이다. 인쇄와 전송이 «분리된 채로» 유지되는지 검사한다. */
    const pdfAt = rc.indexOf('function JTConvertPdfGate');
    eq('PDF 게이트: 함수 존재', pdfAt >= 0, true);
    if (pdfAt >= 0) {
      const pdf = rc.slice(pdfAt, pdfAt + 5000);
      eq('PDF 게이트: 인쇄 가드가 동의를 참조하지 않음 (§16③)',
        /const canPrint\s*=\s*!sending\s*;/.test(pdf), true);
      eq('PDF 게이트: 저장 버튼이 canPrint 로만 잠김',
        /disabled=\{!canPrint\}/.test(pdf) && !/disabled=\{!canSend\}/.test(pdf), true);
      eq('PDF 게이트: 전송은 willSend 로 잠김',
        /if \(willSend && w3fKey/.test(pdf), true);
      eq('PDF 게이트: 「미요청」과 「전송 실패」를 구분해 안내',
        /askedToSend/.test(pdf), true);
    }
  }
}

console.log('\n════ 파트너 데스크 폼 (네이티브 POST) ════\n');
{
  /* desk/*.html 은 React 가 아니라 «네이티브 form POST» 다 — 제출하면 페이지가 떠나므로
     「성공 후 발화」·「거짓 완료 화면」이 구조적으로 성립하지 않는다. 다만 개인정보는
     똑같이 받는다 — 상담 폼 3곳과 같은 수준으로 고지한다 (260809 결재 B-2·안 A).

     ⚠️ 이 블록은 260809 에 «정규식 → HTML 토크나이저»로 통째로 다시 썼다.
        Codex 교차검토가 4라운드 연속(R2~R5) 정규식의 새 구멍을 찾아냈고, 원인이 전부
        같았다 — 정규식은 HTML 의 «상태»(원시텍스트·주석·속성 구간)를 모른다.
        파서와 그 자체 검증은 project/_shared/html-scan.js · project/tests_html_scan.js. */
  const { tokenize, elementEnd, textBetween, inlineScripts, externalScriptSrcs, eventHandlers, domTouches, freeIdentifiers, propertyNames } = require('./_shared/html-scan.js');

  /* §15② — 수집·이용 동의문이 반드시 담아야 할 4가지 */
  const REQ = ['목적', '항목', '보유', '거부'];
  /* §28의8② — 국외 이전 «별도» 동의문이 담아야 할 것.
     Web3Forms 서버가 미국이라 이 폼은 개인정보를 국외로 이전한다. 공식 문서 실측:
     서버 미국 US-East · 운영사 Web3Creative(인도) · 제출 내용 미저장이나 서버 로그 2개월 보관. */
  const REQ_INTL = [
    ['이전 항목', /이전 항목|위 수집 항목/],
    ['국가', /미국/],
    ['시기·방법', /제출\s*즉시|HTTPS/],
    ['받는 자', /Web3Forms/],
    ['받는 자 연락처', /@web3forms\.com/],
    ['보유기간', /2개월/],
    ['거부 방법·효과', /거부/],
  ];
  /* hidden 은 «수집 항목»이 아니라고 통째로 빼 왔는데, 그러면 스크립트가 채우는
     `<input type="hidden" name="주민등록번호">` 가 고지 없이 전송된다 (Codex R2 P1).
     Web3Forms 운영에 필요한 것만 이름으로 허용하고, 나머지 hidden 은 수집 항목으로 본다. */
  const HIDDEN_OK = new Set(['access_key', 'subject', 'from_name', 'redirect', 'botcheck', 'replyto']);
  /* ⚠️ image 를 여기 넣어 두면 «이름 있는» image 제출 버튼이 수집 항목 검사를 통째로
     빠져나간다 — 실제로는 name.x·name.y 좌표가 전송된다 (R7 P0). 빼서 검사 대상으로 둔다. */
  const CTRL = new Set(['submit', 'button', 'reset']);
  const ACTION = 'https://api.web3forms.com/submit';
  const LABEL = { office: '사무소명', name: '성함', contact: '연락처', memo: '문의 내용' };
  /* 외부 스크립트는 «허용 목록»으로만 — `<script src="helper.js">` 한 줄이면 그 안에서
     무엇이든 할 수 있고 게이트는 아무것도 못 본다 (R4 P0).
     ⚠️ 호스트·스킴은 대소문자를 가리지 않는다 — URL 로 정규화해 비교한다 (R5 P2). */
  /* ⚠️ host·path 만 보면 «어느 컨테이너인지»가 안 잠긴다 — `?id=GTM-ATTACKER` 로 바꾸면
     그 컨테이너가 임의 태그를 실행할 수 있다 (260809 Codex R10 P0). 전체 URL 을 고정한다. */
  const SRC_OK = ['https://www.googletagmanager.com/gtag/js?id=G-ETRXTFKLFE'];
  /* ⚠️ 수신 계정도 «이름»이 아니라 «값»으로 고정한다 — access_key 를 다른 Web3Forms 키로
     바꾸면 action 은 그대로인 채 제출 내용이 «남의 계정»으로 간다 (R10 P0). */
  const HIDDEN_PIN = {
    access_key: 'c3a5ab0f-c275-4434-a4ba-bda8500378fa',
    from_name: { 'broker.html': 'jttax.co.kr 중개사 데스크', 'scrivener.html': 'jttax.co.kr 법무사 데스크' },
  };
  /* on* 는 전면 금지가 아니라 «내용 허용 목록» — 이 페이지의 핸들러는 전부 정당한 추적 호출이다 */
  const HANDLER_OK = /^jtTrackCta\('[\w-]+'\s*,\s*'[\w-]+'\)$/;

  /* desk 두 파일에서 뽑은 보유기간 — 처리방침과 대조하려고 모은다.
     ⚠️ 종전엔 broker 만 읽어 scrivener 를 단독으로 바꿔도 통과했다 (R5 P1). */
  const deskRetention = [];

  for (const f of ['broker.html', 'scrivener.html']) {
    const p = path.join(__dirname, '..', 'desk', f);
    if (!fs.existsSync(p)) { eq(`desk/${f} 존재`, false, true); continue; }
    const html = fs.readFileSync(p, 'utf8');
    const toks = tokenize(html);
    const A = (t, k) => (t.attrs ? t.attrs.get(k) : undefined);
    const HAS = (t, k) => t.attrs && t.attrs.has(k);

    /* ── 실행되는 코드가 폼을 건드리지 않는가 ─────────────────────────────
       정적 검사는 «런타임» 조작을 못 본다. 그래서 애초에 조작할 코드가 없다는 것을
       불변식으로 못 박는다. (임의 JS 를 실행할 수 있는 상대는 fetch 로 무엇이든 보낼 수
       있으므로, 이 검사의 목적은 공격 차단이 아니라 «우리 코드가 스스로 우회하지 않게»
       하는 것이다 — 그 한계는 Codex R4 에서 서로 확인했다.) */
    /* ⚠️ 종전엔 «단어 포함»으로 봤다. 그건 우회가 너무 쉽다 —
       `document.forms[0]['submit']()` 는 \bform\b(forms 라 불일치) 에도
       `.submit()`(대괄호 접근) 에도 걸리지 않으면서 required 검증을 건너뛴다
       (260809 Codex R6 P0). 「AST 는 과하다」던 내 판단이 틀렸다 — AST 로 본다. */
    const js = inlineScripts(toks);
    const jsHits = domTouches(js);
    eq(`desk/${f}: 인라인 스크립트가 DOM·폼을 건드리지 않음 (${jsHits.join('·') || '없음'})`, jsHits.length, 0);
    /* ⚠️ «금지 목록»으로는 이 게임을 이길 수 없다 (260809 Codex R8 P0).
       동적 접근·eval 을 막았더니 `Object.assign(f,{action:…})`(키가 ObjectProperty) 와
       `Reflect.get(f,'submit')`(이름이 «인수») 로 뚫었다. 금지어를 늘려도 다음 라운드에 또 나온다.
       → 「무엇을 만지면 안 되나」가 아니라 «무엇을 써도 되나»로 뒤집는다.
          이 페이지의 인라인 JS 는 GA 부트스트랩 하나뿐이고 쓰는 이름이 정해져 있다. */
    /* ★ 여기서 접근을 «한 번 더» 뒤집는다 (260809 Codex R9).
       R7~R9 동안 금지목록 → 허용 전역 → 허용 속성으로 계속 좁혀 왔는데, 매 라운드
       새 우회가 나왔다(`Reflect`·`window.fetch`·`this.location`·파라미터 섀도잉…).
       임의 JS 를 정적으로 «완벽히» 판정하는 것은 애초에 되는 일이 아니다.
       그런데 이 페이지의 인라인 JS 는 «임의 코드»가 아니다 — GA 부트스트랩 18줄로 고정돼
       있고 바뀔 이유가 거의 없다. 그러니 분석하지 말고 «내용을 못 박는다».
       우회할 분석기가 없으니 우회도 없고, 정확히 일치하므로 위양성도 없다.
       ⛔ 이 해시가 FAIL 하면 «게이트를 고치지 말고» 바뀐 코드를 사람이 읽어라.
          의도한 변경이면 그때 해시를 갱신한다(그 리뷰가 이 검사의 목적이다). */
    const JS_BASELINE = {
      'broker.html': '364c51cbf2318b431c825d4405c60d174c370ff2e24fb2be1e7af86bbcb2c5b0',
      'scrivener.html': '3cb09cffe5c0e350fa1bc04f9216cb1ceebb4d83f6225a461073d21e7eb51d62',
    };
    const jsNorm = js.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim();
    const jsHash = require('crypto').createHash('sha256').update(jsNorm, 'utf8').digest('hex');
    eq(`desk/${f}: 인라인 스크립트가 기준선과 동일 (바뀌었으면 사람이 읽을 것)`,
      jsHash, JS_BASELINE[f]);
    /* 아래는 «두 번째» 신호다 — 해시가 갱신될 때 무엇이 들어왔는지 바로 보이게 한다 */
    const JS_GLOBALS_OK = new Set(['window', 'dataLayer', 'Date', 'Object', 'URLSearchParams']);
    const strangers = freeIdentifiers(js).filter(n => !JS_GLOBALS_OK.has(n));
    eq(`desk/${f}: 인라인 JS 가 «허용된 전역»만 사용 (낯선 이름: ${strangers.join('·') || '없음'})`,
      strangers.length, 0);
    /* ⚠️ 전역 이름만 좁혀서는 부족하다 — 내가 스스로 찔러 보니 허용 전역 `window` 하나로
       `window.fetch(…)`(유출) · `window.location = …`(유출) · `window.Reflect.get(f,'submit')`(제출)
       셋이 다 빠져나갔다 (260809). 속성 이름도 «써도 되는 것»만 남긴다.
       실측: 이 페이지들의 인라인 JS 가 쓰는 속성은 아래 8개뿐이다. */
    const JS_PROPS_OK = new Set([
      /* 실제로 «꺼내 쓰는» 것 */
      'dataLayer', 'gtag', 'jtTrackCta', 'location', 'search', 'push', 'get', 'assign',
      /* GA 이벤트에 실어 보내는 «파라미터 이름»(객체 리터럴 키) */
      'anonymize_ip', 'channel', 'page', 'partner_code',
    ]);
    const props = propertyNames(js);
    const oddProps = props.names.filter(n => !JS_PROPS_OK.has(n));
    eq(`desk/${f}: 인라인 JS 가 «허용된 속성»만 사용 (낯선 속성: ${oddProps.join('·') || '없음'})`,
      oddProps.length, 0);
    eq(`desk/${f}: 인라인 JS 에 이름을 계산한 접근 없음`, props.dynamic, false);
    /* on* 핸들러 본문도 «실행되는 코드»다 — 같은 잣대로 본다 */
    const hHits = [...new Set(eventHandlers(toks).flatMap(h => domTouches(h.value)))];
    eq(`desk/${f}: on* 핸들러가 DOM·폼을 건드리지 않음 (${hHits.join('·') || '없음'})`, hHits.length, 0);
    /* ⚠️ `type="application/ld+json" src=…` 는 «실행되지 않는» 데이터라 허용목록 대상이
       아니고(위양성), 반대로 스킴을 안 보면 `http:` 평문 로딩을 허용한다 (R6 P2). */
    const badSrc = externalScriptSrcs(toks).filter(s => {
      try {
        const u = new URL(s, 'https://www.jttax.co.kr');
        if (u.protocol !== 'https:') return true;
        return !SRC_OK.some(ok => { const o = new URL(ok);
          return u.host.toLowerCase() === o.host && u.pathname === o.pathname && u.search === o.search; });
      } catch (_e) { return true; }
    });
    eq(`desk/${f}: 허용되지 않은 외부 스크립트 없음 (${badSrc.join(' · ') || '없음'})`, badSrc.length, 0);
    /* ⚠️ `<input type="image">` 는 클릭 제출 시 `name.x`·`name.y` 를 «추가로» 보낸다 —
       이름 검사는 `name` 만 보므로 알려진 이름을 쓰면 새 전송 항목이 조용히 들어간다
       (R8 P1). 이 폼들에는 쓸 이유가 없으니 아예 금지한다. */
    const imageInputs = toks.filter(t => t.type === 'open' && t.name === 'input'
      && (A(t, 'type') || '').toLowerCase() === 'image');
    eq(`desk/${f}: <input type="image"> 없음 (name.x·name.y 가 고지 없이 전송된다)`, imageInputs.length, 0);
    /* ⚠️ 인라인 <script> 와 on* 만 보면 «실행되는 정적 마크업»이 통째로 남는다 (R10 P0).
       `<a href=javascript:fetch(…,{body:new FormData(form)})>` 한 줄이면 같은 출처에서 폼 값을
       읽어 밖으로 보낼 수 있고, 인라인 JS 해시도 외부 script 검사도 그대로 통과한다.
       `srcdoc` 은 문서를 통째로 심는다. 둘 다 이 페이지들에 쓸 이유가 없으니 금지한다. */
    const URL_ATTRS = ['href', 'src', 'action', 'formaction', 'data', 'poster', 'xlink:href', 'content'];
    /* ⚠️ 엔티티로 감싸면 문자열 비교를 통째로 비켜 간다 — `&#106;avascript:` 는 브라우저가
       `javascript:` 로 읽는다 (260809 Codex R11 P0). 판정 «전에» 디코드한다. */
    const decodeEnt = (v) => v
      .replace(/&#x([0-9a-f]+);?/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);?/g, (_m, d) => String.fromCodePoint(parseInt(d, 10)))
      .replace(/&colon;/gi, ':').replace(/&Tab;|&NewLine;/gi, '');
    const jsUrls = [];
    for (const t of toks) {
      if (t.type !== 'open') continue;
      for (const a of URL_ATTRS) {
        const rawV = A(t, a);
        if (rawV === undefined) continue;
        /* `content` 는 meta refresh 만 대상 — 다른 meta 의 설명문까지 보면 위양성이 난다 */
        if (a === 'content' && !/refresh/i.test(A(t, 'http-equiv') || '')) continue;
        let dec = decodeEnt(rawV).trim().toLowerCase().replace(/[\s\u0000-\u001f]/g, '');
        /* ⚠️ meta refresh 는 `0;url=…` 꼴이라 스킴이 «앞»에 없다 — url= 뒤를 꺼내야 보인다
           (260809 음성 대조군 ㌏ 가 이걸 잡았다: 검사가 있는데 형태를 몰라 지나쳤다). */
        if (a === 'content') { const m2 = dec.match(/url=(.*)$/); dec = m2 ? m2[1] : ''; }
        const v = dec;
        if (v.startsWith('javascript:') || v.startsWith('vbscript:') || v.startsWith('data:text/html')) {
          jsUrls.push(t.name + ' ' + a);
        }
      }
      if (t.attrs.has('srcdoc')) jsUrls.push(t.name + ' srcdoc');
    }
    eq(`desk/${f}: 실행되는 URL·srcdoc 없음 (${jsUrls.join(' · ') || '없음'})`, jsUrls.length, 0);
    const badHandler = eventHandlers(toks).filter(h => !HANDLER_OK.test(h.value.trim()));
    eq(`desk/${f}: on* 핸들러가 추적 호출뿐 (${badHandler.map(h => h.value.slice(0, 34)).join(' · ') || '없음'})`,
      badHandler.length, 0);

    /* ── 폼 ──────────────────────────────────────────────────────────── */
    const formIdxs = toks.map((t, k) => (t.type === 'open' && t.name === 'form' ? k : -1)).filter(k => k >= 0);
    eq(`desk/${f}: 폼이 하나뿐 (${formIdxs.length}개)`, formIdxs.length, 1);
    if (formIdxs.length !== 1) continue;
    const fi = formIdxs[0];
    const fend = elementEnd(toks, fi);
    const form = toks[fi];

    /* required 가 «있어도» 브라우저 검증을 끄면 무력화된다 (R2 P0) */
    eq(`desk/${f}: <form> 에 novalidate 없음`, HAS(form, 'novalidate'), false);
    /* 수신처를 검사하지 않으면 동의·항목 게이트가 다 녹색이어도 전송처를 바꿀 수 있다 */
    eq(`desk/${f}: action 이 Web3Forms 로 고정`, A(form, 'action'), ACTION);
    eq(`desk/${f}: method 가 POST`, (A(form, 'method') || '').toUpperCase(), 'POST');

    /* 폼 «안»의 입력 전수 — 이름을 모르면 그것 자체를 FAIL 로 만든다.
       ⚠️ 「아는 이름 4개」만 훑던 시절엔 새 필드(`memo2`)가 조용히 지나갔다. */
    const inForm = [];
    for (let k = fi + 1; k < fend; k++) {
      const t = toks[k];
      if (t.type !== 'open') continue;
      if (['input', 'textarea', 'select'].includes(t.name)) {
        inForm.push({ ...t, idx: k, ctl: (A(t, 'type') || (t.name === 'input' ? 'text' : t.name)).toLowerCase(), nm: A(t, 'name') });
      }
      /* ⚠️ `<input type="image">` 도 브라우저에서는 «제출 버튼»이다 (260809 Codex R7 P0).
         종전엔 type=submit 만 봐서, image 로 넣으면 formnovalidate·formaction·formmethod 를
         전부 붙여 필수 동의와 수신처 고정을 한꺼번에 우회할 수 있었다. */
      /* ⚠️ `<button type="button">` 은 제출자가 아니다 — formaction 을 붙여도 제출 동작이
         바뀌지 않으므로 FAIL 로 보면 위양성이다 (R8 P2). button 은 type 이 없으면 기본 submit. */
      const ctlType = (A(t, 'type') || '').toLowerCase();
      /* ⚠️ `<button type="unexpected">` 은 «알 수 없는 값»이라 브라우저가 기본값(submit)으로
         되돌린다 (R9 P1). 「빈값이거나 정확히 submit」만 제출자로 보면 그 틈으로 빠진다.
         button 은 type 이 button·reset «이 아니면» 전부 제출자로 본다. */
      const isSubmitter = (t.name === 'button' && !['button', 'reset'].includes(ctlType))
        || (t.name === 'input' && ['submit', 'image'].includes(ctlType));
      if (isSubmitter) {
        eq(`desk/${f}: 제출 버튼에 formnovalidate 없음`, HAS(t, 'formnovalidate'), false);
        eq(`desk/${f}: 제출 버튼에 formaction 없음`, HAS(t, 'formaction'), false);
        /* formmethod=GET 이면 개인정보가 «URL 쿼리»에 실려 이력·리퍼러·로그에 남는다 */
        eq(`desk/${f}: 제출 버튼에 formmethod 없음`, HAS(t, 'formmethod'), false);
      }
    }
    /* `<input form="폼id">` 는 폼 «밖»에 있어도 POST 에 실린다 (form-associated control) */
    const outsideBound = toks.filter((t, k) => t.type === 'open' && (k < fi || k >= fend)
      && ['input', 'textarea', 'select', 'button'].includes(t.name) && HAS(t, 'form'));
    eq(`desk/${f}: 폼 밖에서 form= 로 묶인 입력 없음`, outsideBound.length, 0);

    /* ── 동의 체크박스 — 속성 «순서»에 기대지 않는다 ──────────────────── */
    const box = (nm) => inForm.filter(i => i.nm === nm && i.ctl === 'checkbox');
    const consentBoxes = box('개인정보동의');
    const intlBoxes = box('국외이전동의');
    eq(`desk/${f}: 수집·이용 동의 체크박스가 폼 «안»에 정확히 1개`, consentBoxes.length, 1);
    eq(`desk/${f}: 국외이전 동의 체크박스가 폼 «안»에 정확히 1개 (§28의8①1호 «별도» 동의)`, intlBoxes.length, 1);
    /* ⚠️ `disabled` 가 붙으면 브라우저는 제약검증에서 «제외»하고 값도 «전송하지 않는다» —
       required 가 그대로 있어도 동의 없이 제출된다 (260809 Codex R10 P0). */
    /* ⚠️ `disabled` 는 «조상»에서도 내려온다 — `<fieldset disabled>` 로 감싸면 안의 입력이
       전부 disabled 가 되어 required 검증·전송에서 빠진다 (260809 Codex R11 P0).
       체크박스 자신만 보면 못 잡는다. 폼 안에 disabled fieldset 자체를 금지한다. */
    const disabledFs = toks.filter((t, k) => t.type === 'open' && t.name === 'fieldset'
      && HAS(t, 'disabled') && k > fi && k < fend);
    eq(`desk/${f}: 폼 안에 disabled fieldset 없음 (안의 입력이 통째로 빠진다)`, disabledFs.length, 0);
    /* ⚠️ 네이티브 폼은 마크업에 `checked` 를 박으면 «사용자 조작 없이» required 가 충족되고
       동의 값이 그대로 POST 된다 (260809 Codex R12 P2). React 쪽 초기값과 같은 문제다. */
    const preChecked = [...consentBoxes, ...intlBoxes].filter(b => HAS(b, 'checked'));
    eq(`desk/${f}: 동의 체크박스에 checked 사전설정 없음`, preChecked.length, 0);
    for (const [lbl, arr] of [['수집·이용', consentBoxes], ['국외이전', intlBoxes]]) {
      eq(`desk/${f}: ${lbl} 동의가 required`, arr.length === 1 && HAS(arr[0], 'required'), true);
      eq(`desk/${f}: ${lbl} 동의에 disabled 없음 (있으면 검증·전송에서 빠진다)`,
        arr.length === 1 && HAS(arr[0], 'disabled'), false);
    }

    /* ── 고지문은 «그 체크박스와 같은 label 안»에 있어야 한다 ──────────────
       ⚠️ 종전엔 제목 문자열부터 `</form>`(또는 첫 `</label>`)까지를 봤다. 그러면 label
          «밖»의 문단이 요건을 대신 채워 통과한다 (R4 P2 · R5 P0). 이제 체크박스를
          담고 있는 label 요소를 찾아 그 «안쪽 글자»만 본다. */
    /* 체크박스를 «담고 있는» label 을 찾아 그 안쪽 글자만 돌려준다.
       ⚠️ inForm 항목은 토큰의 «복사본»이라 toks.indexOf 로는 못 찾는다 — 인덱스를 쓴다. */
    const labelTextFor = (boxIdx) => {
      for (let k = boxIdx; k >= 0; k--) {
        if (toks[k].type === 'open' && toks[k].name === 'label') {
          const end = elementEnd(toks, k);
          return end > boxIdx ? textBetween(toks, k, end) : '';
        }
      }
      return '';
    };
    const seg = consentBoxes.length === 1 ? labelTextFor(consentBoxes[0].idx) : '';
    const iSeg = intlBoxes.length === 1 ? labelTextFor(intlBoxes[0].idx) : '';
    eq(`desk/${f}: 수집·이용 고지가 체크박스와 같은 <label> 안`, /개인정보 수집·이용 동의/.test(seg), true);
    eq(`desk/${f}: 국외이전 고지가 체크박스와 같은 <label> 안`, /개인정보 국외 이전 동의/.test(iSeg), true);
    const miss = REQ.filter(k => seg.indexOf(k) < 0);
    eq(`desk/${f}: §15② 고지 4요건 (누락: ${miss.join('·') || '없음'})`, miss.length, 0);
    const missI = REQ_INTL.filter(([, re]) => !re.test(iSeg)).map(([k]) => k);
    eq(`desk/${f}: §28의8② 고지 요건 (누락: ${missI.join('·') || '없음'})`, missI.length, 0);

    /* ── 실제 수집 항목이 고지에 다 들어 있는가 ──────────────────────── */
    const collected = inForm
      .filter(i => i.nm && !CTRL.has(i.ctl))
      .filter(i => !(i.ctl === 'hidden' && HIDDEN_OK.has(i.nm)))
      .filter(i => !(i.ctl === 'checkbox' && (i.nm === '개인정보동의' || i.nm === '국외이전동의')))
      .map(i => i.nm);
    /* 수신 계정·발신 표기를 «값»으로 대조한다 (R10 P0) */
    for (const [nm, want] of Object.entries(HIDDEN_PIN)) {
      const el = inForm.find(i => i.nm === nm && i.ctl === 'hidden');
      const expect = typeof want === 'string' ? want : want[f];
      /* 같은 이름을 두 번 두면 «어느 값이 채택되는지»가 우리 손을 떠난다 (R11 P2) */
      eq(`desk/${f}: hidden ${nm} 값이 고정값과 일치`, el ? A(el, 'value') : null, expect);
    }
    /* ⚠️ 이름 중복은 access_key 뿐 아니라 «모든» 입력에서 문제다 — 수신 서비스가 어느 값을
       쓰는지 우리가 정하지 못한다 (260809 Codex R12 P2). 폼 안 전체를 본다. */
    {
      const names = inForm.map(i => i.nm).filter(Boolean);
      const dup = [...new Set(names.filter((n, k) => names.indexOf(n) !== k))];
      eq(`desk/${f}: 이름이 중복된 입력 없음 (${dup.join('·') || '없음'})`, dup.length, 0);
    }
    const unknown = [...new Set(collected)].filter(k => !(k in LABEL));
    eq(`desk/${f}: 모르는 수집 항목 없음 (${unknown.join('·') || '없음'}) — 새 필드를 넣었으면 고지와 이 표를 함께 고칠 것`,
      unknown.length, 0);
    const notNoticed = [...new Set(collected)].filter(k => (k in LABEL) && seg.indexOf(LABEL[k]) < 0);
    eq(`desk/${f}: 수집 항목이 모두 고지됨 (빠진 것: ${notNoticed.map(k => LABEL[k]).join('·') || '없음'})`,
      notNoticed.length, 0);
    /* 고지가 「필수」라 한 항목은 실제로 required 여야 한다 — 문구와 마크업의 어긋남 방지 */
    for (const k of ['office', 'name', 'contact']) {
      const el = inForm.find(i => i.nm === k);
      eq(`desk/${f}: ${LABEL[k]}(필수 고지)에 required 있음`, !!el && HAS(el, 'required'), true);
    }

    /* 개인정보를 받는 페이지인데 처리방침으로 가는 길이 없었다 (Codex B-2 R1 지적, 260809 반영) */
    /* ⚠️ 문서 전체에서 `/#/privacy` «부분문자열»만 찾으면 `https://evil.example/#/privacy`
       한 줄로도 통과한다 (260809 Codex R6 P1). 같은 출처의 상대경로만 인정한다. */
    const privacyLinks = toks.filter(t => t.type === 'open' && t.name === 'a')
      .map(t => A(t, 'href') || '')
      .filter(h => { try { const u = new URL(h, 'https://www.jttax.co.kr'); return u.host === 'www.jttax.co.kr' && u.hash === '#/privacy'; } catch (_e) { return false; } });
    eq(`desk/${f}: 개인정보 처리방침 링크 존재 (같은 출처)`, privacyLinks.length >= 1, true);

    /* ⚠️ 보유기간을 «문서 전역 정규식»으로 읽고 있었다 — 주석이나 script 문자열에 적힌
       값도 잡혀서, 정작 화면 고지엔 기간이 없어도 통과할 수 있었다 (R6 P1).
       실제로 정보주체가 읽는 «동의 label 안»에서만 뽑는다. */
    const m = seg.match(/보유[·\s]*이용기간\s*:?\s*([^·.]*?\d+\s*(?:년|개월)(?:\s*\d+\s*개월)?)/);
    eq(`desk/${f}: 보유기간이 동의 문구 «안»에 있음`, !!m, true);
    if (m) deskRetention.push({ file: f, period: m[1].trim() });
  }

  /* ── 폼 고지 ↔ 처리방침 대조 ──────────────────────────────────────────
     ⚠️ 한쪽만 고치는 일을 막는다. 실제로 260808 에 예약폼·PDF·카톡만 갱신하고 리포트
        폼을 빠뜨린 적이 있고(Codex R4), 260809 에는 처리방침을 고치고도 «게이트를 안
        만들어» 음성 대조군이 통과해 버렸다. */
  {
    const legal = stripComments(fs.readFileSync(SRC('Legal.jsx'), 'utf8'));
    /* ⚠️ 고지 문구 사이에는 <strong> 같은 «태그»가 끼어 있다 — 태그를 걷어낸 «글자»로
       비교해야 「상담 응대 종료 시점으로부터 <strong>3년</strong>」이 한 덩어리로 읽힌다. */
    const detag = (x) => x.replace(/<[^>]*>/g, '');
    const lAt = legal.indexOf('개인정보의 국외 이전');
    eq('처리방침: 국외 이전 절 존재', lAt >= 0, true);
    if (lAt >= 0) {
      const lSeg = legal.slice(lAt, lAt + 2200);
      const lMiss = REQ_INTL.filter(([, re]) => !re.test(lSeg)).map(([k]) => k);
      eq(`처리방침: 국외 이전 고지 요건 (누락: ${lMiss.join('·') || '없음'})`, lMiss.length, 0);
      eq('처리방침: 「별도의 동의」 근거 명시', /별도의 동의/.test(lSeg), true);
      /* 거부 «방법»은 경로마다 다르다 — 폼은 체크 해제, 카카오 연결은 확인창 [취소] */
      eq('처리방침: 거부 방법에 폼 체크 해제', /체크하지 않으시면/.test(lSeg), true);
      eq('처리방침: 거부 방법에 카카오 확인창 [취소]', /\[취소\]/.test(lSeg), true);
    }
    /* 「위탁할 수 있습니다」는 실제와 다르다 — 이미 위탁 «하고» 있다 */
    eq('처리방침: 위탁을 가정형으로 쓰지 않음', /위탁할 수 있습니다/.test(legal), false);

    /* 보유기간 — desk «두 파일 모두»와 대조한다 (R5 P1: 종전엔 broker 만 봤다).
       ⚠️ 글자 그대로 비교하면 「신청일로부터 12개월」처럼 뜻이 같은 표현에 위양성이 난다
          (R5 P2). 「사건 + 수량 + 단위」로 정규화해 비교한다. */
    /* ⚠️ 「1년 6개월」처럼 «단위가 둘»이면 첫 값만 읽어 1년으로 오인했다 (R6 P1) — 전부 더한다.
       ⚠️ 그리고 「신청일」과 「접수일」을 같은 사건으로 합치고 있었다. 실제 기산일이 다를 수
          있으므로 합치지 않는다 — 표현을 통일하는 편이 맞다. */
    const normPeriod = (s) => {
      const ev = /접수일/.test(s) ? '접수' : (/신청일/.test(s) ? '신청' : (/상담|응대/.test(s) ? '상담' : '기타'));
      const parts = [...s.matchAll(/(\d+)\s*(년|개월)/g)];
      if (!parts.length) return null;
      const months = parts.reduce((a, m2) => a + (m2[2] === '년' ? Number(m2[1]) * 12 : Number(m2[1])), 0);
      return `${ev}+${months}개월`;
    };
    eq('desk: 두 파일 모두에서 보유기간을 읽음', deskRetention.length, 2);
    const norms = [...new Set(deskRetention.map(d => normPeriod(d.period)))];
    eq(`desk: 두 파일의 보유기간이 서로 같음 (${deskRetention.map(d => d.period).join(' / ')})`, norms.length, 1);
    if (norms.length === 1 && norms[0]) {
      /* 처리방침의 «파트너 파일럿» 줄에서 같은 값이 나와야 한다 */
      const pilot = legal.match(/파트너 파일럿[^<]*<\/strong>[^<]*<strong>([^<]+)<\/strong>/)
        || legal.match(/파트너 파일럿[\s\S]{0,160}?(\d+\s*(?:년|개월))/);
      eq('처리방침: 파트너 파일럿 보유기간 존재', !!pilot, true);
      if (pilot) {
        eq(`처리방침 파일럿 보유기간이 desk 와 일치 (desk=${norms[0]})`,
          normPeriod('접수 ' + pilot[1]), norms[0]);
      }
    }
    /* ── 처리방침 §1 «필수/선택» ↔ 실제 폼 가드 대조 ──────────────────────
       ⚠️ 여기가 가장 잘 어긋난다. 실제로 260809 이전 §1 은 이메일·상담내용을 「필수」로
          적어 두었는데 예약폼에서는 둘 다 «선택»이었고, desk 의 사무소명·문의내용은 §1 에
          아예 없었다 (Codex R6 P1). 방침이 화면과 다르면 그 자체가 거짓 고지다.
       필수 여부의 «정본»은 문구가 아니라 코드의 가드다 — 가드를 읽어 방침과 맞춘다. */
    {
      const legalText = detag(legal);
      const sec1 = legalText.slice(legalText.indexOf('수집하는 개인정보 항목'), legalText.indexOf('수집 및 이용 목적'));
      const pg2 = stripComments(fs.readFileSync(SRC('Pages2.jsx'), 'utf8'));
      const rc2 = stripComments(fs.readFileSync(SRC('ReportConvert.jsx'), 'utf8'));
      /* [경로, 코드에서 읽은 실제 필수 조건, 방침이 「필수」로 적어야 할 낱말들] */
      /* ⚠️ 종전엔 가드를 «앞부분만» 정규식으로 훑어서, 뒤에 조건을 «추가»해도 통과했다
         (`canNext2 = form.name && form.phone && form.email` → 여전히 녹색, 260809 Codex R8 P1).
         가드 식을 통째로 떼어 «피연산자 집합»을 뽑고, 기대한 것과 정확히 같은지 본다. */
      /* ⚠️ `new RegExp('…\\s…')` 은 쓰지 않는다 — 이 저장소를 다루는 도구 체인에서 백슬래시가
         한 겹 유실돼 `\s` 가 그냥 `s` 가 된 적이 있다(그러면 조용히 «매치 없음»이 되어
         검사가 통째로 죽는다). 문자열 탐색 + 정규식 «리터럴»만 쓴다. */
      const guardOperands = (src, name) => {
        const key = 'const ' + name + ' =';
        const i = src.indexOf(key);
        if (i < 0) return null;
        const end = src.indexOf(';', i);
        if (end < 0) return null;
        const expr = src.slice(i + key.length, end);
        /* `email.includes('@')` 는 한 토큰(`email.includes`)으로 잡힌다 — «호출 꼬리»를 떼서
           값 자체의 이름(`email`)만 남긴다. `form.topic` 처럼 호출이 아닌 경로는 그대로 둔다. */
        const CALLS = ['includes', 'trim', 'toLowerCase', 'toUpperCase', 'test', 'match'];
        return [...new Set((expr.match(/[A-Za-z_$][\w$.]*/g) || [])
          .map(x => { const seg = x.split('.'); return CALLS.includes(seg[seg.length - 1]) ? seg.slice(0, -1).join('.') : x; })
          .filter(Boolean)
          .filter(x => !['sending', 'true', 'false'].includes(x)))].sort().join(',');
      };
      /* ⚠️ 피연산자 «집합»만 보면 연산자를 바꿔 요건을 완화해도 통과한다 —
         `form.name || form.phone` · `form.name ? form.phone : true` · IIFE 모두 같은 집합이다
         (260809 Codex R9 P0). 집합이 아니라 «식 자체»를 못 박는다. */
      const guardExpr = (src, name) => {
        const key = 'const ' + name + ' =';
        const i = src.indexOf(key);
        if (i < 0) return null;
        const end = src.indexOf(';', i);
        if (end < 0) return null;
        return src.slice(i + key.length, end).trim().replace(/\s+/g, ' ');
      };
      const ROWS = [
        ['상담 예약', guardExpr(pg2, 'canNext1') === 'form.topic'
          && guardExpr(pg2, 'canNext2') === 'form.name && form.phone',
          ['성명', '연락처', '상담 분야'], ['이메일', '회사·법인명', '문의 내용']],
        ['JT 리포트 회신',
          guardExpr(rc2, 'canSend') === "email.includes('@') && name.trim() && phone.trim() && agree && agreeIntl && !sending",
          ['성명', '연락처', '이메일'], []],
        ['리포트 PDF 저장', guardExpr(rc2, 'willSend') === "email.includes('@') && agree && agreeIntl",
          /* ⚠️ 진단요약은 사용자가 «입력»하는 항목이 아니라 앱이 자동으로 싣는다 —
             `reportSummary || ''` 라 빈 값도 간다. 방침이 그걸 「필수」라 부르면 사실과 다르다
             (260809 Codex R11 P1). 그래서 아래 기대 목록에서 진단요약을 «입력 필수»에서 뺐다. */
          ['이메일'], []],
        /* 카카오 연결 — 실제 payload 키를 그대로 대조한다 (260809 Codex R12 P1).
           확인창에만 적고 처리방침 §1 에는 빠뜨렸던 항목이다. */
        ['카카오톡 상담 연결', /maySend\s*=\s*!!\(okCollect\s*&&\s*okIntl\)/.test(rc2),
          ['리포트 유형', '진단요약', '분석 내용'], []],
      ];
      for (const [label, guardOk, must, opt] of ROWS) {
        eq(`${label}: 코드의 필수 가드가 방침이 전제한 그대로`, guardOk, true);
        const line = (sec1.split('\n').find(x => x.includes(label)) || '');
        eq(`처리방침 §1 에 「${label}」 줄 존재`, !!line, true);
        /* ⚠️ `split('/')[0]` 은 「필수」 구간을 «줄 앞부분»으로 어림잡는다 — 선택 목록을
           「/ 필수:」 로 바꿔 적으면 그대로 통과했다 (R8 P1). 라벨로 정확히 자른다. */
        /* 진단요약은 앱이 자동으로 싣는 항목이라 «입력 필수»가 아니다 (R11 P1).
         방침이 그렇게 부르면 사실과 다르므로 이름을 직접 막는다. */
      if (label === '리포트 PDF 저장') {
        eq('처리방침 §1 PDF: 진단요약을 «입력 필수»라 하지 않음',
          /«입력»\s*필수:[^/·]*진단요약/.test(line) || /필수:\s*이메일,\s*진단요약/.test(line), false);
        eq('처리방침 §1 PDF: 진단요약을 «자동 포함»으로 표기', /자동 포함[^·]*진단요약/.test(line), true);
      }
      const mReq = line.match(/필수:\s*([^/]*)/);
        eq(`처리방침 §1 ${label}: 「필수:」 표기 존재`, !!mReq, true);
        const req = mReq ? mReq[1] : '';
        eq(`처리방침 §1 ${label}: 「필수:」 가 한 번만`, (line.match(/필수:/g) || []).length, 1);
        const missM = must.filter(k => !req.includes(k));
        eq(`처리방침 §1 ${label} 필수 항목 (누락: ${missM.join('·') || '없음'})`, missM.length, 0);
        const wrong = opt.filter(k => req.includes(k));
        eq(`처리방침 §1 ${label}: 선택 항목을 필수로 적지 않음 (${wrong.join('·') || '없음'})`, wrong.length, 0);
      }
      /* ⚠️ 유입 경로 정보를 «보내는 곳»과 방침 문구가 맞는지 (260809 Codex R7 P1).
         desk 두 폼은 jtAttributionFields 를 쓰지 않으므로 그 항목을 고지하면 «허위»가 된다. */
      {
        const deskHtml = ['broker.html', 'scrivener.html']
          .map(f => fs.readFileSync(path.join(__dirname, '..', 'desk', f), 'utf8')).join('\n');
        eq('desk 폼은 유입 경로 정보를 보내지 않음', /jtAttributionFields|접수번호|유입 매체/.test(deskHtml), false);
        const attrLine = (sec1.split('\n').find(x => x.includes('함께 전송')) || '');
        eq('처리방침 §1 「함께 전송」 줄 존재', !!attrLine, true);
        eq('처리방침 §1: 「함께 전송」을 모든 경로 공통이라 하지 않음', /공통으로 함께 전송/.test(sec1), false);
        eq('처리방침 §1: 파트너 파일럿 제외를 명시', /파트너 파일럿 신청에는 해당하지 않습니다/.test(attrLine), true);
      }
      /* desk 는 마크업의 required 가 정본이다 */
      const dline = (sec1.split('\n').find(x => x.includes('파트너 파일럿')) || '');
      eq('처리방침 §1 에 「파트너 파일럿」 줄 존재', !!dline, true);
      const mD = dline.match(/필수:\s*([^/]*)/);
      eq('처리방침 §1 파트너 파일럿: 「필수:」 표기 존재', !!mD, true);
      const dreq = mD ? mD[1] : '';
      eq('처리방침 §1 파트너 파일럿: 「필수:」 가 한 번만', (dline.match(/필수:/g) || []).length, 1);
      const dMiss = ['사무소명', '성함', '연락처'].filter(k => !dreq.includes(k));
      eq(`처리방침 §1 파트너 파일럿 필수 항목 (누락: ${dMiss.join('·') || '없음'})`, dMiss.length, 0);
      eq('처리방침 §1 파트너 파일럿: 문의 내용을 필수로 적지 않음', dreq.includes('문의 내용'), false);
    }
    /* 상담·리포트 3년도 폼과 대조한다 (R5 P1: Legal 만 바꿔도 안 잡혔다) */
    const legalConsult = detag(legal).match(/세무 상담·리포트 회신[\s\S]{0,60}?(상담[^\n]{0,26}?\d+\s*년)/);
    eq('처리방침: 상담 보유기간 존재(기산점 포함)', !!legalConsult, true);
    /* ⚠️ 종전엔 예약폼 하나만 대조했다 — PDF 게이트 고지는 「보유기간: 3년」으로 기산점이
       아예 없었는데 검사는 통과했다 (260809 Codex R6 P1). 3년을 말하는 곳 «전부» 본다. */
    if (legalConsult) {
      const want = normPeriod(legalConsult[1]);
      const SPOTS = [
        ['예약폼', 'Pages2.jsx', /보유·이용기간\s*:?\s*(상담[^·\n]{0,26}?\d+\s*년)/],
        ['리포트 회신폼', 'ReportConvert.jsx', /보유기간:\s*(상담[^·\n]{0,26}?\d+\s*년)/],
        ['PDF 게이트', 'ReportConvert.jsx', /목적: 상담 회신 · 보유기간:\s*([^·\n]*?\d+\s*년)/],
      ];
      for (const [label, file, re] of SPOTS) {
        const mm = detag(stripComments(fs.readFileSync(SRC(file), 'utf8'))).match(re);
        eq(`${label}: 보유기간 문구 존재(기산점 포함)`, !!mm, true);
        if (mm) eq(`${label} 보유기간(${mm[1].trim()}) = 처리방침(${legalConsult[1].trim()})`,
          normPeriod(mm[1]), want);
      }
    }
  }
}

console.log('\n════ 카카오 연결 POST (동의 기반 전송) ════\n');
{
  /* 코덱스 R2 P1: 이 경로도 실제 Web3Forms POST 인데 게이트 대상이 아니었다.
     성격이 다르다 — 응답을 보고 «안내문»을 고르는 구조(완료 화면 전이가 없다).
     그래서 검사 항목도 다르다: ①동의(confirm) 없이는 보내지 않는가 ②success 필드로
     판정하는가 ③유입 출처를 함께 싣는가 ④동의문이 실제 전송 항목을 고지하는가 */
  const code = fs.readFileSync(SRC('ReportConvert.jsx'), 'utf8');
  const seg = code.slice(0, code.indexOf('const send = async'));   // 카톡 블록은 첫 send 앞에 있다
  /* ⚠️ 동의는 «두 개»이고 창도 두 개여야 한다 (260809 Codex R3 P0) — §28의8①1호의
     「별도의 동의」·§22①의 「구분해 받을 것」. 창 하나로 둘을 겸하면 «수집·이용에는
     동의하되 국외 이전만 거부»할 길이 없어진다. 확인창이 둘인지, 두 동의가 모두
     있어야만 보내는지를 검사한다. */
  eq('카톡: 확인창이 «둘»로 분리 (별도 동의)', (seg.match(/window\.confirm\(/g) || []).length, 2);
  eq('카톡: 수집·이용 동의 창', /okCollect\s*=\s*window\.confirm/.test(seg), true);
  eq('카톡: 국외이전 동의 창 (1단계 거부 시 묻지 않음)', /okIntl\s*=\s*okCollect\s*&&\s*window\.confirm/.test(seg), true);
  eq('카톡: 두 동의를 «모두» 받아야 전송', /maySend\s*=\s*!!\(okCollect\s*&&\s*okIntl\)/.test(seg), true);
  eq('카톡: maySend 가 false 면 전송 안 함', /if \(maySend\)\s*\{[\s\S]{0,80}fetch\(/.test(seg), true);
  eq('카톡: success 필드로 성공 판정', /data\.success === true/.test(seg), true);
  eq('카톡: 유입 출처 동봉', /jtAttributionFields\('report_kakao'\)/.test(seg), true);
  eq('카톡: 확인창이 «함께 가는 것»을 고지', /함께 가는 것/.test(seg), true);
}

console.log('\n════ 계측이 사용자 동선을 막지 않는가 (raw gtag 금지) ════\n');
{
  /* 코덱스 R2 P2: `mcta_booking`·`report_cta_banner_booking` 처럼 «이벤트 뒤에 화면 전환이
     이어지는» 핸들러에서 raw gtag 가 throw 하면 전환 자체가 죽는다. 리드 폼뿐 아니라
     동선을 여는 버튼 전부가 대상이다 — 안전 래퍼(jtEvent) 사용을 강제한다. */
  const files = ['Chrome.jsx', 'Pages2.jsx', 'ReportConvert.jsx'];
  /* 래퍼 «자신»의 내부만 예외로 둔다. 판정은 AST 부모 사슬로 한다 —
     ⚠️ 종전엔 「호출 앞 700자에 래퍼 선언 문자열이 있으면 예외」로 봤는데, 그러면 래퍼
     선언 직후 700자 안에 새 raw gtag 를 «함수 밖»에 적어도 통과한다 (260808 Codex R3 P2).
     문자열 근접은 소속을 증명하지 못한다 — 실제로 그 함수 «안»인지를 트리에서 본다. */
  const WRAPPERS = new Set(['jtTrackCta', 'jtEvent']);
  for (const f of files) {
    const ast = parse(f);
    let raw = 0;
    (function scan(node, insideWrapper) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach(n => scan(n, insideWrapper)); return; }
      let inside = insideWrapper;
      /* 예외로 인정하는 형태는 «window.<래퍼> = function(...) {...}» 하나뿐이다.
         ⚠️ 종전엔 left 의 property 이름만 봐서 `obj.jtEvent = window.gtag('event',…)` 같은
         «래퍼가 아닌 직접 호출»도 통과했다 (260808 Codex R4 P2). 소유자가 window 인지,
         우변이 실제 함수인지까지 확인한다. */
      if (node.type === 'AssignmentExpression' && node.left && node.left.type === 'MemberExpression'
        && node.left.object && node.left.object.type === 'Identifier' && node.left.object.name === 'window'
        && node.left.property && WRAPPERS.has(node.left.property.name)
        && node.right && (node.right.type === 'FunctionExpression' || node.right.type === 'ArrowFunctionExpression')) {
        inside = true;
      }
      // 옵셔널 체이닝으로 부른 raw gtag 도 «래퍼 밖 직접 호출»이다 — 놓치면 우회가 된다
      if ((node.type === 'CallExpression' || node.type === 'OptionalCallExpression') && !inside) {
        const c = node.callee, a = node.arguments || [];
        const isMember = c.type === 'MemberExpression' || c.type === 'OptionalMemberExpression';
        const isGtag = (isMember && c.property && c.property.name === 'gtag')
          || (c.type === 'Identifier' && c.name === 'gtag');
        if (isGtag && a.length >= 2 && a[0].type === 'StringLiteral' && a[0].value === 'event') raw++;
      }
      for (const k of Object.keys(node)) {
        if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue;
        scan(node[k], inside);
      }
    })(ast, false);
    eq(`${f}: 래퍼 밖 raw gtag('event') 0건`, raw, 0);
  }
}

console.log('\n════ 유입 출처 유틸·CGT 잔재 ════\n');
{
  /* 코덱스 R1 P1: 이 두 가지에 «검사 자체가 없었다». 게이트는 자기가 안 보는 것을
     조용히 통과시킨다 — 되돌림을 막으려면 명시적으로 걸어야 한다. */
  const chrome = fs.readFileSync(SRC('Chrome.jsx'), 'utf8');
  eq('Chrome.jsx: jtAttribution 정의 존재', /window\.jtAttribution\s*=/.test(chrome), true);
  eq('Chrome.jsx: jtAttributionFields 정의 존재', /window\.jtAttributionFields\s*=/.test(chrome), true);
  eq('Chrome.jsx: jtEvent 안전 래퍼 존재', /window\.jtEvent\s*=/.test(chrome), true);
  eq('Chrome.jsx: jtEvent 가 예외를 삼킨다(try/catch)',
    /window\.jtEvent[\s\S]{0,220}try\s*\{[\s\S]{0,160}catch/.test(chrome), true);
  /* ⚠️ 「예외를 삼킨다」만 검사하면 **아무것도 안 하는 빈 함수**로 바뀌어도 통과한다
     — 계측이 통째로 죽는데 게이트는 녹색이다 (260808 Codex R5 P2).
     그리고 「호출 문자열이 있다」만 봐도 `if (false) gtag(...)` 에 뚫린다 (R6 P2).
     → 구문 트리에서 «살아 있는 경로의 호출»을 센다 (R10 P1 로 vm 실행은 제거). */
  {
    const api = loadChromeApi();
    eq('Chrome.jsx: 파싱 오류 없음', api.error || 'none', 'none');
    eq('Chrome.jsx: 유틸 3종 정의 확인(검사 자체가 건너뛰어지지 않음)',
      !!(api.extracted && api.extracted.okEvent && api.extracted.okAttr && api.extracted.okField), true);

    /* 첫 정의만 검사하고 넘어가지 않도록, 같은 이름의 재할당이 없는지 확인한다 */
    eq('Chrome.jsx: jtEvent 재할당 없음(첫 정의가 곧 실제 동작)', api.assigns.jtEvent, 1);
    eq('Chrome.jsx: jtAttribution 재할당 없음', api.assigns.jtAttribution, 1);
    eq('Chrome.jsx: jtAttributionFields 재할당 없음', api.assigns.jtAttributionFields, 1);
    eq('Chrome.jsx: jtTrackCta 재할당 없음', api.assigns.jtTrackCta, 1);

    if (api.jtEventNode) {
      const calls = api.liveGtagCalls(api.jtEventNode);
      eq('jtEvent 가 gtag 를 «살아 있는 경로»에서 호출 (no-op·if(false) 회귀 차단)',
        calls.length >= 1, true);
      // 이벤트 이름을 그대로 넘기는지 — 상수로 갈아치우면 계측이 한 이름으로 뭉갠다
      const passesName = calls.some(c => (c.arguments || [])[1]
        && c.arguments[1].type === 'Identifier' && c.arguments[1].name === 'name');
      eq('jtEvent 가 인자로 받은 이름을 그대로 전달', passesName, true);
      /* 광고차단기 환경에서 실제로 던지는 건 gtag 쪽이다 — 그 호출이 try 안에 있어야
         호출부(예약 버튼 등)가 깨지지 않는다. 「try 가 파일 어딘가 있다」가 아니라
         «그 호출을 감싸는 try» 인지를 트리에서 본다. */
      const inTry = calls.every(c => {
        let ok = false;
        walk(api.jtEventNode, (n) => {
          if (n.type !== 'TryStatement' || !n.block) return;
          if (typeof n.block.start === 'number' && c.start >= n.block.start && c.end <= n.block.end) ok = true;
        });
        return ok;
      });
      eq('jtEvent 의 gtag 호출이 try 로 감싸여 있다 (throw 가 접수를 안 깸)', inTry, true);
    }
    if (api.jtTrackCtaNode) {
      const calls = api.liveGtagCalls(api.jtTrackCtaNode);
      eq('jtTrackCta 가 gtag 를 «살아 있는 경로»에서 호출', calls.length >= 1, true);
    }
  }
  eq('Chrome.jsx: 최초 1회 고정(sessionStorage 캐시)', /sessionStorage\.setItem\(KEY/.test(chrome), true);
  /* referrer 는 «도메인만» 남긴다 — 경로에 제3자 계정명이 실릴 수 있다 (Codex R3 P1) */
  eq('Chrome.jsx: referrer 를 origin 만으로 축소(경로 제거)',
    /ref = new URL\(ref\)\.origin;/.test(chrome), true);
  eq('Chrome.jsx: referrer 에 pathname 을 붙이지 않음',
    /u\.origin \+ u\.pathname/.test(chrome), false);
  /* 옛 형식이 sessionStorage 에 남아 재사용되면 고친 규칙이 적용되지 않는다 (Codex R3 P1) */
  eq('Chrome.jsx: attribution 스키마 버전 존재', /var SCHEMA_V = \d+;/.test(chrome), true);
  eq('Chrome.jsx: 버전 불일치 시 옛 값 폐기·재캡처',
    /prev\.v === SCHEMA_V/.test(chrome), true);
  eq('Chrome.jsx: referrer 내부 판정은 origin «정확 일치»(prefix 비교 금지)',
    /new URL\(ref\)\.origin === window\.location\.origin/.test(chrome), true);
  /* ⚠️ 음성 대조군 ⑫ 가 이 검사가 «없어서» 통과했다 (260808).
     landing 에 location.search 를 다시 실으면 임의 query 가 payload 로 나가는데,
     동의문에는 「개인 식별 정보 미포함」이라 적혀 있어 고지와 어긋난다.
     유입 정보는 위 utm 화이트리스트로만 받는다. */
  const landingSrc = (chrome.match(/landing:\s*\(function[\s\S]{0,300}?\}\)\(\),/) || [''])[0];
  eq('Chrome.jsx: landing 이 존재', landingSrc.length > 0, true);
  eq('Chrome.jsx: landing 에 location.search 미포함 (임의 query 유출 차단)',
    /location\.search/.test(landingSrc), false);
  // ⛔ 금액·계산값을 attribution 에 싣지 않는다 (개인정보 게이트의 씨앗 — Phase 4 에서 확장)
  eq('Chrome.jsx: attribution 에 금액류 키 없음',
    /jtAttributionFields[\s\S]{0,700}?\};/.test(chrome)
    && !/(금액|취득가|양도가|세액|calc)/.test((chrome.match(/jtAttributionFields[\s\S]{0,700}?\};/) || [''])[0]), true);

  const cgt = fs.readFileSync(SRC('ReportCGT.jsx'), 'utf8');
  /* 주석에는 설명이 남아 있으므로 «코드 라인»만 본다 — 주석까지 세면 영영 통과 못 한다. */
  const cgtCode = cgt.split(/\r?\n/).filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  eq('ReportCGT.jsx: 선언 없는 phase 참조 0건', /\bphase\s*===/.test(cgtCode), false);
  eq('ReportCGT.jsx: 선언 없는 setQuickReport 호출 0건', /setQuickReport\s*\(/.test(cgtCode), false);
  // 대조군 — 정상 보유 파일에는 그대로 있어야 한다(과잉 삭제 방지)
  const acq = fs.readFileSync(SRC('ReportAcquisition.jsx'), 'utf8');
  eq('대조군: ReportAcquisition 은 phase state 를 «보유»(과잉 삭제 아님)',
    /const \[phase, setPhase\]/.test(acq) && /const \[quickReport, setQuickReport\]/.test(acq), true);
}

console.log('\n════ 양성 대조군 — 검사가 실제로 동작하는지 ════\n');
{
  /* 「0건이라 통과」를 방지한다. 존재하지 않는 이벤트를 찾으면 0건이 나와야 하고,
     실재 이벤트를 찾으면 1건 이상이 나와야 한다 — 둘 다 맞아야 탐지기가 살아 있는 것이다. */
  const ast = parse('Pages2.jsx');
  eq('대조군: 없는 이벤트명은 0건으로 잡힘', findEventCalls(ast, '__NOT_EXIST__').length, 0);
  eq('대조군: 실재 이벤트명은 1건 이상 잡힘', findEventCalls(ast, 'booking_submit').length >= 1, true);
}

console.log('\n════════════════════');
console.log(`실패 ${fails}건`);
process.exit(fails ? 1 : 0);
