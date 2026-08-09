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
    ['ReportConvert.jsx', '상담을 위해 아래 내용을 담당 세무사에게', '카톡 확인창'],
  ];
  /* ⚠️ 주석은 «고지»가 아니다 — 검사에서 제외한다.
     처음엔 원문 그대로 훑었더니, 「단정 문구를 삭제한다」고 설명한 내 «주석»이 단정 문구로
     잡혀 위양성이 났다 (260808). 게이트가 오탐을 내면 산출물보다 검사 로직을 먼저 본다. */
  const stripComments = (s) => s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')   // JSX 주석 {/* ... */}
    .replace(/\/\*[\s\S]*?\*\//g, ' ')       // 블록 주석
    .replace(/^[ \t]*\/\/.*$/gm, ' ');       // 줄 주석

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
}

console.log('\n════ 카카오 연결 POST (동의 기반 전송) ════\n');
{
  /* 코덱스 R2 P1: 이 경로도 실제 Web3Forms POST 인데 게이트 대상이 아니었다.
     성격이 다르다 — 응답을 보고 «안내문»을 고르는 구조(완료 화면 전이가 없다).
     그래서 검사 항목도 다르다: ①동의(confirm) 없이는 보내지 않는가 ②success 필드로
     판정하는가 ③유입 출처를 함께 싣는가 ④동의문이 실제 전송 항목을 고지하는가 */
  const code = fs.readFileSync(SRC('ReportConvert.jsx'), 'utf8');
  const seg = code.slice(0, code.indexOf('const send = async'));   // 카톡 블록은 첫 send 앞에 있다
  eq('카톡: 동의(confirm) 통과 시에만 전송', /maySend\s*=\s*window\.confirm/.test(seg), true);
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
