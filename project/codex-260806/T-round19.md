## 1. 작업 요약

`afb88c6..c31442b`를 읽기 전용으로 정적 검토했습니다. 결론은 **P1 2건, P2 4건**입니다.
외국배당 차단 자체와 법인전환의 현재 TDZ 회피 동작은 타당합니다. 다만 종부세의 지분율 미입력을 계속 50%로 계산해 “정밀 계산” 결과를 내보내는 정책은 허용 가능한 고지가 아니라 차단 대상이며, 새 AST 게이트 검사는 `fn(` 완화로 실제 차단 조건이 무력화된 회귀를 통과시킬 수 있습니다.
Node는 사용자 지시 및 환경 제약에 따라 실행을 시도하지 않았습니다.

## 2. 변경 내역 및 지적

검토자가 변경한 파일은 없습니다.

### [P1] [project/src/ReportComprehensive.jsx:400](/D:/jt-data/jttax-cta/project/src/ReportComprehensive.jsx:400) · 공동명의 지분율 미입력을 50%로 가정한 “정밀 계산”을 계속 표시해, 실제 지분 30% 사례에서 2.4배 낮은 세액을 내보낸다

재현: `housingCount='one'`, `totalValue='2000000000'`, `ownership='joint'`, `ownShare=''`로 입력합니다. 실제 본인 지분이 30%인 사용자가 지분율을 비워 두면 [ReportComprehensive.jsx:103](/D:/jt-data/jttax-cta/project/src/ReportComprehensive.jsx:103)과 [ReportComprehensive.jsx:137](/D:/jt-data/jttax-cta/project/src/ReportComprehensive.jsx:137)은 50%를 엔진·폴백에 전송합니다. 사용자께서 제시한 엔진 실측 기준으로 50%는 **655,200원**, 실제 30%는 **1,593,000원**입니다. 결과 화면은 “종부세 정밀 계산” 및 “정밀 계산 (JT택스랩 엔진)”으로 수치를 강하게 신뢰시키며, 그 뒤의 노란 고지만으로는 잘못된 숫자 제시를 해소하지 못합니다.

수정안: `ownShare`를 공동명의 1주택의 필수 입력으로 바꾸고, `0 < ownShare < 100`을 UI 단계와 `runAnalysis` 직전 양쪽에서 검증하십시오. 빠른 결과에서 상세 입력을 건너뛰는 경로를 유지해야 한다면, 최소한 `housingCount === 'one' && ownership === 'joint' && !(0 < ownShare < 100)`을 차단 규칙으로 만들어 세액 대신 `JTFallbackBlocked`/입력 보완 안내만 렌더해야 합니다. “부부 공동명의의 절대다수가 50%”라는 통계적 가정은, 이 사례처럼 계산 결과가 2.4배 달라지는 세목에서 미입력을 수치로 대체할 근거가 되지 않습니다.

### [P1] [project/tests_gate_ast.js:72](/D:/jt-data/jttax-cta/project/tests_gate_ast.js:72) · `fn(` 포함 여부만 보므로 판정 결과를 버린 가짜 게이트도 정상 차단 게이트로 통과한다

재현: [ReportCorporate.jsx:200](/D:/jt-data/jttax-cta/project/src/ReportCorporate.jsx:200)의 조건을 아래처럼 되돌리는 회귀를 가정합니다.

```js
if (corpFallbackGaps(answers, { precise: false }), false) {
  return;
}
```

입력은 `businessIncome='50000000'`, `ownerSalary='100000000'`입니다. `corpFallbackGaps()`는 호출되지만 쉼표 연산자의 최종값은 `false`이므로 차단되지 않습니다. 이어서 [ReportCorporate.jsx:206](/D:/jt-data/jttax-cta/project/src/ReportCorporate.jsx:206)이 급여를 5천만 원으로 조용히 낮추고, 엔진 호출 및 [ReportCorporate.jsx:252](/D:/jt-data/jttax-cta/project/src/ReportCorporate.jsx:252)의 AI 프롬프트 전송까지 진행합니다.

그런데 이 회귀는 현 검사 조건을 모두 만족합니다.

- `tests_fallback_block.js`의 `indexOf("if (corpFallbackGaps(")`는 발견합니다.
- `corpFallbackGaps(` 문자열 수는 정의 1회, 가짜 분석 게이트 1회, 렌더 1회로 여전히 3회입니다.
- AST 검사는 조건식 원문에 `corpFallbackGaps(`가 있고, `if` 본문에 `return`이 있으므로 게이트로 수집합니다.
- 이 가짜 `if`는 AI 호출보다 앞이고 같은 `runAnalysis` 안에 있으며 `finally`도 아닙니다.

따라서 “주석·문자열”만의 단순 위장은 두 파일을 함께 통과시키기 어렵지만, **판정 함수를 호출하되 그 결과를 차단 조건으로 쓰지 않는** 현실적인 회귀는 두 검사 모두 거짓 통과합니다. 다른 함수에 결과를 넘기거나, 추가 조건으로 무력화하는 경우도 같은 문제가 됩니다.

수정안: 문자열 검색을 폐기하고 AST에서 다음 구조를 직접 판정하십시오.

- `IfStatement.test`가 `corpFallbackGaps(...)` 호출의 결과를 직접 검사할 것
- 호출 결과의 `.length`를 `> 0`, `!== 0` 등 허용한 비교 연산으로 검사할 것
- 해당 `IfStatement.consequent`가 무조건 `return`할 것
- AI 호출보다 앞이고 같은 가장 안쪽 함수에 있을 것

즉 “`fn(`이 존재한다”가 아니라 “**`fn(...).length > 0`의 참일 때 현재 분석 함수를 종료한다**”를 AST 노드 관계로 확인해야 합니다.

### [P2] [project/tests_fallback_block.js:242](/D:/jt-data/jttax-cta/project/tests_fallback_block.js:242) · `fn(`의 원시 문자열 개수를 정확히 3회로 고정해 정상적인 서식·리팩터링에도 거짓 실패하고, 호출 역할도 증명하지 못한다

재현: 현재 렌더 호출을 기능상 동등한 아래 코드로 포맷하기만 해도 됩니다.

```js
const corpGaps = corpFallbackGaps (answers, calc);
```

자바스크립트 문법과 실제 동작은 동일하지만, `new RegExp(fn + '\\(', 'g')`는 공백이 있는 호출을 세지 못합니다. 정의·분석 게이트만 세어 기대값 `3` 대신 `2`가 되어 게이트가 실패합니다. 반대로 주석·문자열의 `corpFallbackGaps(`도 횟수에 포함되므로, 이 검사는 “정의 1 + 분석 1 + 렌더 1”이라는 설명을 실제로 보장하지 못합니다. 이 항목은 사용자 세액의 잘못된 결과가 아니라 **정상 변경을 회귀로 오판하거나, 잘못된 배선을 놓칠 수 있는 테스트 결함**입니다.

수정안: 이미 `@babel/parser`를 사용하는 만큼, `FunctionDeclaration` 1개와 `callee.type === 'Identifier' && callee.name === fn`인 실제 `CallExpression`만 세십시오. 그 후 호출 위치를 `runAnalysis` 내부 1개와 결과 렌더 경로 1개로 구분해 확인하십시오. 이렇게 하면 공백·주석·문자열과 무관해지고, 호출 수가 아니라 역할을 검사하게 됩니다.

### [P2] [project/tests_gate_ast.js:85](/D:/jt-data/jttax-cta/project/tests_gate_ast.js:85) · 종합소득세의 “AI 호출이 없다”는 사실을 고정하지 않아, 새 AI 호출을 추가해도 현재 게이트가 있으면 테스트가 통과한다

재현: [ReportIncome.jsx:301](/D:/jt-data/jttax-cta/project/src/ReportIncome.jsx:301) 뒤에 아래와 같은 호출을 추가한다고 가정합니다.

```js
await window.claude.complete('종합소득세 자동 분석');
```

예를 들어 `businessIncome='100000000'`, `dividendIncome='50000000'`, `dividendType='domestic'`인 정상 입력은 `incFallbackGaps()`에 걸리지 않으므로 새 외부 호출이 실행됩니다. 하지만 `aiCallStart !== null`이 되는 순간 [tests_gate_ast.js:85](/D:/jt-data/jttax-cta/project/tests_gate_ast.js:85)의 “AI 호출이 없다” 분기는 아예 실행되지 않습니다. 기존 게이트는 이미 AI 호출보다 앞에 있고 같은 `runAnalysis` 안에 있으므로, 이후의 순서·스코프·`finally` 검사는 모두 통과 조건입니다. [tests_fallback_block.js:237](/D:/jt-data/jttax-cta/project/tests_fallback_block.js:237)도 같은 이유로 통과합니다.

즉 주석의 “나중에 누가 AI 호출을 넣으면 이 줄이 FAIL 난다”와 달리, **현재 구현은 FAIL 나지 않습니다.** 개발자가 무엇을 해야 하는지도 테스트 실패로 강제되지 않습니다.

수정안: 종합소득세가 AI 비사용 계산기라는 정책을 유지할 계획이면 명시적 불변식을 만드십시오. 예를 들면 `NO_AI_FILES = new Set(['ReportIncome.jsx'])`를 두고, 해당 파일은 `aiCallStart === null`을 직접 기대값으로 검사해야 합니다. 향후 AI 기능을 의도적으로 추가할 때는 이 정책 목록을 변경하고, 해당 커밋에서 프롬프트 범위·차단 입력 전송 금지·게이트 순서를 별도 승인/테스트로 추가하도록 실패 메시지에 명시하십시오. AI 추가를 원래 허용하는 정책이라면, 현재 주석의 “추가되면 FAIL” 설명은 삭제하거나 “추가되어도 기존 게이트 순서를 검사한다”로 바로잡아야 합니다.

### [P2] [project/src/ReportComprehensive.jsx:400](/D:/jt-data/jttax-cta/project/src/ReportComprehensive.jsx:400) · 이전에 공동명의를 선택했다가 2주택 이상으로 바꾸면, 지분이 계산에 쓰이지 않았는데도 “50%로 계산했다”는 새 경고가 표시된다

재현: 빠른 단계에서 `housingCount='one'`을 고르고, 상세 단계에서 `ownership='joint'`, `ownShare=''` 상태를 만든 뒤 상세 첫 단계의 뒤로 가기로 빠른 단계로 돌아옵니다. 그 후 `housingCount='two'`, `totalValue='2000000000'`로 바꿔 다시 결과를 만듭니다. 상태 객체에는 과거의 `ownership='joint'`가 남아 있으므로 새 경고 조건은 참입니다. 그러나 [ReportComprehensive.jsx:101](/D:/jt-data/jttax-cta/project/src/ReportComprehensive.jsx:101) 및 [ReportComprehensive.jsx:136](/D:/jt-data/jttax-cta/project/src/ReportComprehensive.jsx:136)은 `housingCount === 'one'`일 때만 지분을 사용합니다. 즉 2주택 계산 결과와 무관한데도 화면은 “본인 지분율을 넣지 않으셔서 50%로 보고 계산했습니다”라고 잘못 고지합니다.

수정안: 새 고지 조건을 아래처럼 계산 조건과 일치시키십시오.

```jsx
{answers.housingCount === 'one' &&
 answers.ownership === 'joint' &&
 !(Number(answers.ownShare) > 0) && (
  // 고지
)}
```

가능하면 주택 수를 변경할 때 더 이상 표시되지 않는 `ownership`, `ownShare` 상태를 함께 정리하거나, 모든 계산·고지 조건을 하나의 정규화 함수에서 파생해 숨은 이전 상태가 화면에 새지 않게 하십시오.

### [P2] [project/codex-260806/S-round18.md:3](/D:/jt-data/jttax-cta/project/codex-260806/S-round18.md:3) · 직전 검토 기록에 실제 줄끝 공백 5건이 남아 있어 대상 범위의 `git diff --check`가 실패한다

재현: 읽기 전용으로 실행한 `git diff --check afb88c6..HEAD` 결과는 다음과 같습니다.

```text
project/codex-260806/S-round18.md:3: trailing whitespace.
project/codex-260806/S-round18.md:54: trailing whitespace.
project/codex-260806/S-round18.md:56: trailing whitespace.
project/codex-260806/S-round18.md:58: trailing whitespace.
project/codex-260806/S-round18.md:60: trailing whitespace.
project/codex-260806/S-round18.md:62: trailing whitespace.
```

표시상 6줄이지만, 3번 줄의 본문 1건과 목록의 Markdown 강제 줄바꿈 공백 5건입니다. 이 파일은 `c5e09b8`에서 대상 범위에 새로 추가되었습니다. 이전에 지적된 `R-unknown.md`의 공백은 현재 이 검사 결과에 나타나지 않습니다.

수정안: [S-round18.md:3](/D:/jt-data/jttax-cta/project/codex-260806/S-round18.md:3), [S-round18.md:54](/D:/jt-data/jttax-cta/project/codex-260806/S-round18.md:54), [S-round18.md:56](/D:/jt-data/jttax-cta/project/codex-260806/S-round18.md:56), [S-round18.md:58](/D:/jt-data/jttax-cta/project/codex-260806/S-round18.md:58), [S-round18.md:60](/D:/jt-data/jttax-cta/project/codex-260806/S-round18.md:60), [S-round18.md:62](/D:/jt-data/jttax-cta/project/codex-260806/S-round18.md:62)의 줄끝 공백을 제거하십시오. 줄바꿈이 필요하면 빈 줄이나 명시적 HTML `<br>`을 쓰고, 검사와 충돌하는 두 칸 공백은 사용하지 않는 편이 안전합니다.

## 3. 재발 방지

- 차단 게이트 테스트는 텍스트 토큰 수가 아니라 AST의 **직접적인 판정식·무조건 반환·동일 함수 스코프·외부 호출 선행 여부**를 함께 검사해야 합니다.
- 종합소득세처럼 “현재 외부 AI를 사용하지 않는다”가 정책인 파일은 일반 순서 검사와 별개로 AI 호출 수 `0`을 명시적으로 고정해야 합니다.
- 종부세 공동명의의 지분율은 추정 기본값이 아니라 세액 산정의 필수 사실로 취급하고, UI 검증과 실행 직전 검증을 중복 적용해야 합니다.
- 문서까지 포함하는 저장소 게이트라면 `git diff --check <base>..HEAD`를 커밋 전 검사에 넣어 같은 형식 오류의 재유입을 막아야 합니다.

추가 확인 결과, `corpFallbackGaps(answers, { precise: false })`의 **현재 TDZ 처리 자체는 맞습니다.** 함수 본문은 `calc`을 전혀 읽지 않으므로 리터럴 전달은 실행상 안전하며, 게이트를 엔진 호출 뒤로 옮기면 차단 입력이 엔진·AI 경로에 먼저 도달하므로 더 나쁩니다. 다만 미래에 `calc` 의존 규칙을 추가할 때 이 리터럴이 의미 있는 엔진 결과인 양 오해될 수 있으므로, `let calc = { precise: false }`를 게이트 앞에서 먼저 선언해 그 동일 객체를 게이트와 후속 계산에 쓰는 형태가 더 명료합니다. 이는 현재 P1의 원인은 아니며, 핵심은 위 P1의 게이트 의미 검증 보강입니다.

## 4. 검증 결과

- `git log --oneline --decorate afb88c6..HEAD`
  결과: 요청한 실질 변경 커밋 `89789b5`, `e8888b9`, `c5e09b8` 및 후속 문서 커밋을 확인했습니다. HEAD는 `c31442b`입니다.

- `git diff --no-ext-diff --unified=0 afb88c6..HEAD -- project/src/ReportIncome.jsx project/src/ReportCorporate.jsx project/src/ReportComprehensive.jsx project/tests_fallback_block.js project/tests_gate_ast.js`
  결과: 외국배당 차단 추가, 법인 판정 함수 시그니처/등록 변경, 종부세 50% 고지 추가, `fn(` 기반 완화의 정확한 변경 지점을 확인했습니다.

- 정적 호출 수 검사
  결과: `ReportIncome.jsx`는 `window.claude.complete(` **0회**, `incFallbackGaps(` **3회**, 직접 게이트 접두부 **1회**입니다. `ReportCorporate.jsx`는 AI 호출 **1회**, `corpFallbackGaps(` **3회**, 직접 게이트 접두부 **1회**입니다. 이 결과가 “종소세 AI 부재가 실제 테스트 불변식으로 고정되지 않았다”는 P2의 근거입니다.

- `git diff --check afb88c6..HEAD`
  결과: 위 `S-round18.md`의 trailing-whitespace 6건을 확인했습니다.

- Node 기반 `npm run gate`·AST 파서 실행·UI/엔진 E2E
  **미실행** — 사용자 지시대로 Node가 없는 환경에서 실행을 시도하지 않았습니다.

## 5. 미확인 사항

- 종부세 50%/30%의 **655,200원 / 1,593,000원**은 사용자께서 제공한 엔진 실측을 코드 경로와 대조해 사용했습니다. 이 환경에서는 엔진을 호출해 독립 재측정하지 않았습니다.
- 작업 트리에 `project/src/ReportProperty.jsx`의 수정 및 `project/codex-260806/T-round19.prompt.txt` 미추적 파일이 있었으나, 둘 다 `afb88c6..HEAD` 커밋 범위 밖이므로 본 검토의 판단 대상에서 제외했습니다.