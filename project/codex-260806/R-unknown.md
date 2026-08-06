## 1. 작업 요약

`739ab31..34308b5`를 정적 검토했습니다. 결론은 **P0 2건, P1 3건, P2 2건**입니다.  
가장 중요한 문제는 상속·증여의 비거주자 차단이 “비거주자라고 상세 단계에서 답한 경우”에만 작동하고, 실제 빠른 계산 경로에서는 해당 질문 자체가 생략되어 거주자 기준 금액이 그대로 노출된다는 점입니다.

### [P0] `project/src/ReportInheritance.jsx:113, 283, 395-397, 459` · 빠른 계산의 비거주자 상속인이 거주자 금액을 받는다

재현:

1. 상속 계산에서 빠른 단계만 진행합니다. 예: 총상속재산 20억, 배우자 있음, 자녀 2명.
2. `isResident`는 `tier`가 없으므로 `phase === 'quick'`에서 표시되지 않습니다.
3. `answers.isResident`는 `undefined`이고, `inhFallbackGaps()`의 `nonResident = answers.isResident === 'no'`는 `false`입니다.
4. 엔진이 응답하면 `calc.precise = true`가 되고 차단 없이 거주자 기준 세액·AI 분석·공유 경로가 열립니다. 비거주자는 화면 경고 배너도 받지 못합니다.

이는 이번 변경이 의도한 “엔진이 지원하지 않는 비거주자 사실은 정밀값이어도 금액을 막는다”를 빠른 경로에서 우회합니다.

수정안:

- `isResident`를 상속 빠른 단계로 올려 `tier: 'quick'`을 부여하고, 빠른 계산 완료 전 답변을 필수화하십시오.
- 방어적으로 차단 기준도 `answers.isResident !== 'yes'`로 두십시오. 이렇게 하면 URL/state 조작이나 이후 문항 구성 변경으로 값이 빠져도 거주자 가정 수치가 노출되지 않습니다.
- `tests_fallback_block.js`에 `isResident` 미입력 + `precise: true`가 차단되는 사례와, 빠른 단계의 문항 집합에 `isResident`가 들어 있는지를 검사하는 테스트를 추가하십시오.

### [P0] `project/src/ReportGift.jsx:107, 313, 496-498, 597` · 빠른 계산의 비거주자 수증자가 거주자 공제 포함 금액을 받는다

재현:

1. 증여 계산에서 현금 증여, 금액, 관계 등 빠른 단계 문항만 입력합니다.
2. 수증자 거주자 여부인 `isResident`는 `tier`가 없어 빠른 단계에 표시되지 않습니다.
3. `giftFallbackGaps()`는 `answers.isResident === 'no'`일 때만 차단하므로 미입력(`undefined`)은 통과합니다.
4. `mapAnswersToGift()`는 거주자 여부를 payload에 보내지 않으므로, 비거주자인 실제 사용자가 거주자 공제를 전제로 한 엔진 금액을 보고 AI·공유까지 진행할 수 있습니다.

수정안:

- 상속과 동일하게 `isResident`를 빠른 단계의 필수 문항으로 옮기십시오.
- 차단 조건은 `answers.isResident !== 'yes'`로 두고, `yes`만 숫자 계산 허용 상태로 만드십시오.
- `giftFallbackGaps({}, { precise: true })`가 막히고 `isResident: 'yes'`만 통과하는 회귀 테스트를 추가하십시오.

### [P1] `project/tests_gate_ast.js:37-44, 61-88` · 새 AST 테스트는 “게이트가 runAnalysis를 실제로 종료한다”는 목적을 완전히 보장하지 못한다

`sameFn` 검사는 게이트와 AI 호출의 **가장 가까운 함수**가 같은지를 보지 않습니다. 두 노드를 감싸는 상위 컴포넌트 함수가 하나라도 있으면 통과합니다. 따라서 다음과 같은 되돌림이 현재 두 테스트를 통과할 수 있습니다.

재현 가능한 되돌림 형태:

```jsx
const stopIfBlocked = () => {
  if (giftFallbackGaps(answers, calc).length > 0) {
    setReport(blockedRep);
    return; // stopIfBlocked만 종료
  }
};

stopIfBlocked();
const txt = await window.claude.complete(prompt); // 여전히 실행됨
```

이 경우:

- `tests_fallback_block.js`의 호출 횟수는 정의 1회 + helper 내 호출 1회 + 렌더 호출 1회로 기존 기대치 3회를 유지할 수 있습니다.
- AST 테스트는 helper 내부 `return`을 발견합니다.
- helper는 `runAnalysis` 내부에 있으므로 상위 `runAnalysis` 함수가 게이트 호출 문자열과 `window.claude.complete` 문자열을 모두 포함해 `sameFn`도 통과합니다.
- 실제로는 `runAnalysis`가 계속 진행되어 금액이 AI에 전송됩니다.

`try/finally`에서 `finally`가 외부 전송을 실행하는 변형도 현재의 “return 존재 여부” 검사만으로는 막지 못합니다.

수정안:

- 단순 문자열 포함 검사 대신, 게이트 `IfStatement`의 **직접 상위 함수**가 `runAnalysis`임을 AST parent chain으로 확인하십시오.
- 해당 `IfStatement`가 `runAnalysis` 본문 블록의 직접 statement이고, consequent가 그 함수 자체를 종료하는 `ReturnStatement`를 갖는지 확인하십시오.
- 가장 신뢰도 높은 보강은 주석에도 적힌 브라우저 회귀 테스트입니다. `window.claude.complete`와 공유 전송 함수를 mock한 뒤, 차단 입력에서 호출 횟수가 각각 0회인지를 자동 검증해야 합니다.

### [P1] `project/src/ReportIncome.jsx:61-67, 227-238` · 모든 배당을 국내법인 배당으로 단정하여 Gross-up을 요청한다  
*이번 diff 이전부터 존재한 문제이나, 요청하신 다른 계산기 payload 감사 결과입니다.*

재현:

- 외국법인 배당만 3,000만원 이상 있는 사용자가 `dividendIncome`에 금액을 입력합니다.
- 화면에는 국내법인 배당인지, 외국 배당인지, 혼합 배당인지 고르는 질문이 없습니다.
- 그런데 payload는 무조건 `is_dividend_grossup: dividend > 0`를 전송합니다.
- 코드 주석도 “국내법인 배당 가정”임을 명시합니다. 즉 외국 배당도 국내법인 Gross-up·배당세액공제 전제로 엔진에 전달됩니다.

수정안:

- `dividendType`을 `국내법인 배당 / 외국 배당·혼합 / 모름`으로 구조화하십시오.
- 국내법인 배당일 때만 `is_dividend_grossup: true`를 전송하십시오.
- 외국·혼합·모름은 금액 차단 또는 Gross-up 미적용의 별도 계산임을 명확히 표시하고 공유·AI 수치 전송을 막으십시오.

### [P1] `project/src/ReportCorporate.jsx:180-191` · 입력한 대표 급여를 사전 고지 없이 사업이익 이하로 바꿔 다른 시나리오를 계산한다  
*이번 diff 이전부터 존재한 문제이나, 요청하신 다른 계산기 payload 감사 결과입니다.*

재현:

- 사업이익 `50,000,000원`, 대표 연봉 `100,000,000원`을 입력합니다.
- 두 값 모두 입력 UI의 `canNext()` 조건은 통과합니다.
- 실제 payload와 프롬프트에는 `salary = Math.min(100,000,000, 50,000,000)`인 `50,000,000원`이 사용됩니다.
- 결과는 사용자가 입력한 “대표 연봉 1억원” 시나리오가 아니라 “대표 연봉 5천만원” 시나리오인데, 사전 오류나 정정 안내가 없습니다. 법인 전환 유불리 판단을 바꿀 수 있습니다.

수정안:

- 현 모델이 “당기 사업이익을 초과하는 급여는 계산 대상이 아니다”라는 제약이라면 입력 즉시 검증 오류를 내고 계산을 중단하십시오.
- 손실·기존 유보금 등을 포함한 실제 급여 시나리오를 지원할 엔진 계약이 있다면, 임의 clamp 대신 그 값을 그대로 전달하고 법인 과세표준 처리 규칙을 명시하십시오.
- 최소한 clamp를 유지해야 한다면, 결과·공유 전문·AI 프롬프트에 “입력 1억원 → 모델 제약상 5천만원으로 조정”을 명시해야 합니다.

### [P2] `project/src/ReportGift.jsx:687-696, 713-718` · `engineErr` 승격 뒤의 도달 불가 조건과 불필요한 JSX 래퍼가 남아 있다

`giftBlocked`일 때는 667행의 조기 반환으로 끝납니다. 따라서 이후 정상 결과 트리의 다음 분기는 도달 불가 또는 항상 참입니다.

- 687행: `{giftBlocked && ...}` — 항상 false
- 688행: `{!giftBlocked && ...}` — 항상 true
- 696행: `!calc.precise && !giftBlocked` — 뒤의 `!giftBlocked`는 불필요
- 716-718행: `engineErr` 분기를 지운 자리의 `{(<table ...>)}`는 JSX 문법상 깨지지는 않지만 괄호만 남은 불필요한 expression container입니다.

재현:

- 부담부증여 엔진 실패로 `calc.engineErr = true`가 되면 310-311행에서 즉시 차단 사유를 반환하고 667행에서 조기 반환합니다.
- 위 정상 결과 트리의 `engineErr` 관련 주석·조건은 실행될 수 없습니다.

수정안:

- 정상 결과 트리에서 `giftBlocked`를 다시 검사하는 조건과 `engineErr` 도달 불가 주석을 제거하십시오.
- 부담부증여 표는 단순 `<table>`로 렌더하십시오.
- 이는 현재 P0 재발은 아니지만, 다음 수정자가 “이 조건이 살아 있다”고 오해해 분기를 다시 열 가능성을 줄입니다.

### [P2] `project/src/ReportCGT.jsx:327-340, 354` · 이번에 추가된 2층 게이트 블록이 trailing whitespace를 포함한다

재현:

```powershell
git diff --check 739ab31..HEAD
```

결과는 `ReportCGT.jsx`의 새 `unknown` 블록 여러 줄에 대해 `trailing whitespace`를 보고합니다.

수정안:

- 해당 새 블록의 줄 끝 공백/혼합 줄바꿈을 제거하십시오.
- CI가 있다면 `git diff --check` 또는 동등한 whitespace 검사도 gate에 포함하는 편이 안전합니다.

## 2. 변경 내역 검토 결과

명시적으로 비거주자라고 답한 전체 상세 경로에 한정하면, 이번 2층 구조는 의도대로 동작합니다.

- `inhFallbackGaps()`와 `giftFallbackGaps()`는 비거주자를 `unknown` 층에서 먼저 판정하므로, `calc.precise`여도 차단합니다.
- 상속·증여의 기존 폴백 한계는 `unknown.concat(...)` 뒤에 남아 있어, 비거주자 항목을 ②층에서 제거하면서 다른 기존 차단 항목이 같이 사라진 흔적은 보지 못했습니다.
- `giftFallbackGaps()`의 `calc.engineErr`는 가장 먼저 차단 사유를 반환하므로, 부담부증여 엔진 실패 시 AI 프롬프트와 결과 렌더·공유 경로가 모두 차단됩니다.
- `calc.engineErr`의 위험한 렌더 조건은 남아 있지 않았습니다. 남은 것은 위 P2의 도달 불가 주석·중복 조건뿐이며, `{(<table>)}` 자체는 유효한 JSX입니다.

또한 취득세 전용면적 미입력 차단은, 제공하신 엔진 실측과 현재 mapping을 기준으로는 과잉 차단이라고 판단하지 않았습니다. `mapAnswersToAcquisition()`은 양수 면적일 때만 `exclusive_area`를 전송하고, 엔진은 생략 시 농어촌특별세를 0으로 가정합니다. 따라서 엔진이 살아 있더라도 이 값은 보완되지 않으며, 금액을 계속 표시하는 쪽이 더 위험합니다. 다만 이 선택은 정상 이용자에게 상세 입력을 요구하는 UX 비용이 있으므로, 차단 화면에서 면적 확인 방법을 바로 제시하는 방식이 적절합니다.

## 3. 재발 방지

다른 계산기의 payload도 확인했습니다.

- `ReportComprehensive.jsx:90-107`은 빠른 계산에서 나이·보유기간·공동명의/지분을 받지 않아 payload에서 생략합니다. 빠른 결과라는 제품 설계로 보이지만, 정밀 엔진 호출 결과가 공유까지 이어지는 구조라면 “단독명의·연령/보유 공제 미반영 빠른 추정”을 결과와 공유 전문에 명시하는 것이 안전합니다.
- `ReportIncome.jsx:182, 209-237`은 빠른 단계에서 배우자·부양가족·연금 공제도 0/false로 보냅니다. 빠른 결과 UI가 이를 안내하는지와 공유 결과가 동일한 경고를 유지하는지는 별도 확인이 필요합니다. 다만 외국 배당 Gross-up 문제는 이 일반 빠른 계산 정책과 달리 선택지가 전혀 없으므로 위 P1로 분리했습니다.
- `ReportCorporate.jsx:162, 182-191`은 빠른 단계에서 부양가족을 0/false로 보내지만, 결과 화면이 빠른 비교임을 알립니다. 반면 대표급여 clamp는 사용자의 입력 자체를 다른 값으로 바꾸므로 P1입니다.
- `ReportInsurance.jsx:166, 185-203`은 빠른 단계에서 부양가족·자녀를 0으로 보내지만, 결과 화면이 “부양가족 없이 낸 빠른 계산”이라고 명시합니다. 이 경로는 조용한 가정으로 분류하지 않았습니다.
- `ReportVat.jsx`는 phase 분리가 없어 업종·과세기간·직전연도 10억원 초과 여부 등 조건부 문항을 UI에서 직접 받습니다. `simplified_value_sector || '도소매업'` 기본값은 존재하지만, 일반 UI 흐름에서 간이과세 업종 문항을 건너뛰어 정밀 결과를 만드는 경로는 확인하지 못했습니다.

## 4. 검증 결과

실행한 정적 검증:

```powershell
git diff --check 739ab31..HEAD
```

결과:

```text
project/src/ReportCGT.jsx:327: trailing whitespace.
project/src/ReportCGT.jsx:328: trailing whitespace.
...
project/src/ReportCGT.jsx:354: trailing whitespace.
```

추가로 다음을 정적 대조했습니다.

- 상속·증여의 `isResident` 문항 tier, 빠른 단계 문항 필터, 게이트 조건, 엔진 호출 전 게이트 위치
- 5개 기존 게이트 함수의 `unknown.concat(...)` 경계
- 증여 `calc.engineErr` 전체 참조와 렌더 도달성
- `tests_gate_ast.js`의 AST 탐색·함수 범위 판정 로직
- 종부세·종합소득세·부가세·법인전환·4대보험의 질문 정의와 engine payload mapping

요청대로 이 환경에서 `node`, `npm test`, 브라우저 실행 검증은 시도하지 않았습니다. 작업 트리에는 기존 사용자 변경인 `project/codex-260806/R-unknown.prompt.txt`가 있었고, 검토 중 수정하지 않았습니다.

## 5. 미확인 사항

- `ReportComprehensive` 빠른 계산에서 생략된 연령·보유기간·공동명의 필드에 대해 엔진이 정확히 어떤 기본값을 적용하는지는 저장소에 엔진 스키마/구현이 없어 **미확인**입니다. 프론트 mapping이 해당 값을 보내지 않는 사실만 확인했습니다.
- 상속·증여 P0은 UI 문항 흐름과 프론트 게이트만으로 재현 가능한 결함입니다. 다만 실제 브라우저에서의 AI 호출·카카오 전송 0회 여부는 이번 검토에서 재실측하지 않았습니다.