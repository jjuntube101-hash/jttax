## 1. 작업 요약

`c31442b..77d5026`를 정적 검토했습니다. 종부세 공동명의 지분 차단은 최초 빠른 계산에서는 과잉 차단되지 않지만, 지분 미입력 상태에서도 정밀 엔진 요청이 먼저 나가는 결함이 있습니다. 또한 새 AST 게이트 검사는 truthy·변수형을 수용했으나, 변수 바인딩을 이름만으로 판정해 다시 가짜 게이트를 통과시킬 수 있습니다.

## 2. 지적 사항

### [P1] `project/src/ReportComprehensive.jsx:335` · 지분 미입력 차단보다 정밀 엔진 POST가 먼저 실행되어, 기본값 50%가 외부 엔진으로 전송됩니다

재현: 1세대 1주택 → `부부 공동명의` 선택 → `본인 지분율`을 비운 채 상세 계산을 완료합니다. `ownShare`는 optional이라 다음으로 진행할 수 있고, `mapAnswersToComprehensive()`는 빈 값에 `50`을 대입해 `ownership_share: 0.5`를 만듭니다([`ReportComprehensive.jsx:119`](D:\jt-data\jttax-cta\project\src\ReportComprehensive.jsx:119)–122). 이후 `runAnalysis()`가 [`:335`](D:\jt-data\jttax-cta\project\src\ReportComprehensive.jsx:335)에서 `/v1/calc/comprehensive`를 호출한 뒤, 비로소 [`:350`](D:\jt-data\jttax-cta\project\src\ReportComprehensive.jsx:350)에서 차단합니다. 화면·AI·공유는 막히지만, 불확정 지분 및 50% 가정값이 엔진에는 이미 전달됩니다.

수정안: `runAnalysis()`의 맨 앞에서 `compFallbackGaps(answers, { precise: false })`를 판정하고, gap이 있으면 `setReport(blockedRep)` 후 즉시 `return`하십시오. 그 뒤에만 `fallbackCompTax`, `mapAnswersToComprehensive`, `callCompEngine`을 실행해야 합니다. `compFallbackGaps`는 현재 `calc`을 사용하지 않으므로 선행 판정에 안전합니다.

### [P1] `project/tests_gate_ast.js:83` · 변수 이름만 전역 Set으로 기억해, 다른 스코프의 같은 이름으로 가짜 게이트를 인정합니다

재현: 아래처럼 실제 결과를 담은 `gaps`를 별도 블록에 두고, AI 호출 경로에서는 빈 배열을 같은 이름으로 선언하는 회귀를 주입합니다.

```js
{
  const gaps = compFallbackGaps(answers, calc);
}
const gaps = [];
if (gaps.length) {
  return;
}
const txt = await window.claude.complete(prompt);
```

[`gapVars`](D:\jt-data\jttax-cta\project\tests_gate_ast.js:83)에는 앞 블록의 `gaps`라는 “이름”만 등록됩니다. [`isGapsLength`](D:\jt-data\jttax-cta\project\tests_gate_ast.js:91)는 `if`의 식별자가 실제로 어느 선언을 가리키는지 확인하지 않고 `gapVars.has('gaps')`만 보므로, 뒤의 빈 배열 조건도 정상 게이트로 오인합니다. 그 결과 차단 입력에서 AI 호출이 계속되어도 AST 검사가 통과할 수 있습니다.

수정안: 이름 Set 대신 식별자의 **렉시컬 바인딩**을 해석하십시오. 예를 들어 `@babel/traverse`의 `path.scope.getBinding(name)`으로 `if`의 `gaps`가 가리키는 `VariableDeclarator.init`이 정확히 해당 `*FallbackGaps(...)` 호출인지 확인합니다. 최소한 “동일한 함수” 수준이 아니라 블록 스코프·shadowing까지 구분해야 합니다. 위 shadowing 주입 사례를 실패해야 하는 회귀 테스트로 추가하십시오.

### [P2] `project/tests_gate_ast.js:100` · 안전한 부정형 게이트(`if (!gaps.length) … else return`)를 정당한 게이트로 인정하지 못합니다

재현: 아래는 gap이 있으면 반드시 `return`하고, gap이 없을 때만 AI를 호출하는 정상 흐름입니다.

```js
const gaps = compFallbackGaps(answers, calc);
if (!gaps.length) {
  const txt = await window.claude.complete(prompt);
  // 정상 분석
} else {
  setReport(blockedRep);
  return;
}
```

현재 [`isGateTest`](D:\jt-data\jttax-cta\project\tests_gate_ast.js:100)는 `MemberExpression` 자체, 또는 `>`, `!==`, `!=`, `>=`의 양성 비교만 인정하고 `UnaryExpression(!)`을 전부 거부합니다. 따라서 위처럼 실제로는 안전한 리팩터링이 검사 실패가 됩니다. 반대로 `if (!gaps.length) { return; }`는 gap이 없을 때만 반환하므로 **계속 거부되어야** 합니다.

수정안: `isGateTest`가 단순 boolean 대신 “gap일 때 차단하는 분기”를 반환하도록 확장하십시오. 양성식이면 `consequent`의 확정 반환을, `!gaps.length` 부정식이면 `alternate`의 확정 반환을 검사해야 합니다. AI가 `consequent` 안에 있든 `if` 뒤에 있든, gap 경로가 해당 AI 도달 전에 종료되는지도 함께 확인하십시오.

## 3. 재발 방지 및 확인 결과

종부세 빠른 경로는 최초 진입 기준으로 과잉 차단되지 않습니다. [`ownership`](D:\jt-data\jttax-cta\project\src\ReportComprehensive.jsx:61)과 [`ownShare`](D:\jt-data\jttax-cta\project\src\ReportComprehensive.jsx:72)는 `tier: 'quick'`이 없어서 상세 단계에 속하고, `showIf`도 각각 “1주택”, “1주택+공동명의”로 정확히 제한됩니다. 빠른 단계에는 `housingCount`, `totalValue`만 표시되므로 공동명의 상태가 만들어지지 않으며 `compFallbackGaps`도 통과합니다. 상세에서 공동명의를 고른 뒤 지분을 비우면 차단되는 것은 계산이 실제로 지분을 쓰는 상태이므로 의도된 동작입니다.

`NO_AI_FILES`는 [`tests_gate_ast.js:24`](D:\jt-data\jttax-cta\project\tests_gate_ast.js:24)–29에서 `ReportIncome.jsx`의 `window.claude.complete` 호출 수를 0으로 고정하며, 정책 해제 시 목록에서 제거하고 함께 검토하라는 절차도 주석으로 명시합니다. 목록 제거 자체는 필연적으로 정책 변경 diff이므로 기술적으로 “삭제 불가능”하게 만들 수는 없지만, 현재 수준에서는 의도적 결정이 코드 리뷰에 드러나는 장치로 충분합니다. 이 항목에는 별도 지적이 없습니다.

차단 결과 렌더 기준의 8개 계산기 감사 결과는 다음과 같습니다.

| 계산기 | AI | 클립보드·Web3Forms·CTA gtag | 차단 결과의 외부 유출 |
|---|---|---|---|
| 상속·증여·취득·재산·양도·법인전환 | 게이트 뒤에만 호출 | `JTReportConvert`가 `!…Blocked` 또는 조기 반환 뒤에만 렌더 | 없음 |
| 종합소득세 | `NO_AI_FILES`로 0회 정책 | 정밀 결과일 때만 `JTReportConvert` 렌더 | 없음 |
| 종부세 | AI는 차단 뒤라 안전 | 차단 렌더 조기 반환으로 `JTReportConvert` 미렌더 | 없음. 단, 위 P1의 **엔진 POST 선행**은 존재 |

주소 조회 API는 모두 질문 화면의 사용자가 누르는 기능이고, 차단 결과 화면에서는 렌더되지 않습니다. 다만 “차단될 입력을 이미 선택한 순간부터 주소·health 요청까지 절대 금지”라는 더 넓은 의미라면 현 구조는 충족하지 않습니다. 차단 판정이 `runAnalysis()` 시점에 이루어지고, 일부 계산기는 마운트 시 `/health`를 호출하며 주소 조회는 분석 전 질문 화면에서 일어나기 때문입니다. 이는 현재 차단 정책의 대상이 “오류 세액의 AI·공유 전송”인지, “차단 가능 세션의 모든 네트워크”인지에 따라 별도 정책 결정이 필요합니다.

## 4. 검증 결과

- `git diff --check c31442b..HEAD`
  결과: 종료 코드 0, 공백 오류 없음.
- `Get-FileHash -Algorithm SHA256 project/src/ReportComprehensive.jsx`와 `project/asset_versions.json` 대조
  결과: `2e4c4a110357fd3de923286699cce333135209a933ae1e1f02a2629a5b1c1418`로 일치.
- `git diff`, `rg`, PowerShell 정적 라인 추적으로 변경 범위·호출 순서·렌더 조건을 확인했습니다.
- Node 실행은 사용자 지시대로 시도하지 않았습니다.

## 5. 미확인 사항

브라우저에서 `window.claude.complete`·`fetch`를 mock한 실제 호출 횟수 및 네트워크 요청은 Node 미설치 조건과 사용자 지시에 따라 실행 검증하지 않았습니다. 또한 작업 트리에 검토 대상과 무관한 미추적 파일 `project/codex-260806/U-round20.prompt.txt`가 있었으며, 수정하지 않았습니다.