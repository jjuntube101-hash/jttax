## 1. 작업 요약

**수렴**입니다. 사용자가 지정한 범위인 `d319c63..1d3006b`(라이브 기준 HEAD)에서 **P0/P1은 0건**입니다.

다만 P2 2건이 있습니다. 하나는 중첩 함수를 전부 제외한 AST 검사가 실제 엔진 호출 우회를 놓치는 문제이고, 다른 하나는 인계문서가 8개 계산기의 게이트 구조를 과도하게 일반화한 문제입니다.

검토 중 로컬 `HEAD`가 `5dcd8b0`으로 이동했고(`origin/main`은 여전히 `1d3006b`), 이 후속 커밋은 첫 번째 P2를 겨냥한 변경입니다. 해당 새 커밋은 사용자가 지정한 검토 범위 밖이므로, 아래 판정은 라이브 기준 `1d3006b`에 대해 내렸습니다.

## 2. 변경 내역 및 지적

- [P2] `project/tests_gate_ast.js:284-299` · `walkSkippingNestedFns`가 중첩 함수를 전부 제외하여, 게이트 전의 실제 IIFE·콜백 엔진 호출을 검사 대상에서 누락합니다.

  재현:

  ```js
  // ReportAcquisition.jsx의 runAnalysis 내부에 주입
  await (async () => {
    await callAcqEngine(mapAnswersToAcquisition(answers));
  })();

  if (acqFallbackGaps(answers, { precise: true }).length > 0) {
    return;
  }

  const ej = await callAcqEngine(mapAnswersToAcquisition(answers));
  ```

  구체 입력은 다음과 같습니다.

  ```js
  {
    propertyType: '주택',
    acquisitionType: '증여',
    exclusiveArea: '84',
    isRegulatedArea: 'unsure'
  }
  ```

  이 입력은 `acqFallbackGaps(..., { precise: true })`에서 차단되어야 합니다. 그러나 첫 IIFE는 게이트 도달 전에 실제 `callAcqEngine()`을 시작하므로 엔진 POST가 이미 발생합니다. 반면 지정 HEAD의 walker는 IIFE 내부 `CallExpression` 전체를 건너뛰고, 게이트 뒤의 두 번째 직접 호출만 `firstEngine`으로 보므로 순서 검사는 정적으로 PASS 조건이 됩니다. 같은 원리로 아래도 누락됩니다.

  ```js
  Promise.resolve().then(() => callAcqEngine(mapAnswersToAcquisition(answers)));
  ```

  `.then()` 콜백은 게이트가 `return`한 뒤에도 microtask로 실행되어 POST를 발생시킬 수 있습니다. 잘못된 결과는 화면 숫자 노출이 아니라, **“불확정 입력은 엔진 요청 0건”이라는 안전 조건을 위반했는데 AST 회귀검사가 통과하는 것**입니다.

  수정안: 중첩 함수를 일괄 제외하지 말고 실행 경로에 따라 나누어야 합니다. 즉, 변수 초기화·대입 속 래퍼 정의는 건너뛰되, `CallExpression.callee`인 IIFE와 `CallExpression.arguments`인 콜백 내부는 순회하십시오. 게이트 앞 IIFE, `.then(() => callEng())`, 게이트 앞에서 정의·게이트 뒤에서 호출하는 래퍼를 각각 주입 fixture로 고정해야 합니다.

  참고로 검토 도중 생긴 범위 밖 로컬 커밋 `5dcd8b0`은 `walkRunPath`로 바로 이 구분을 도입했습니다. 다만 이는 `origin/main`/라이브 기준 `1d3006b`에 포함되지 않았으므로 본 검토의 P2를 상쇄하지는 않습니다.

- [P2] `project/codex-260806/HANDOFF_폴백차단.md:33-42` · “각 계산기”, “두 층”, “`runAnalysis`에서 두 번”, “엔진 전은 모두 `{ precise: true }`”라는 서술이 실제 8개 구현과 일치하지 않습니다.

  재현:

  - 종합소득세의 정상 국내배당 입력:

    ```js
    { dividendIncome: '50000000', dividendType: 'domestic' }
    ```

    `ReportIncome.jsx:264`에서 `incFallbackGaps(answers, calc)`가 엔진 호출 전 한 번만 호출됩니다. 이 함수는 `calc.precise`를 읽지 않고, 엔진 응답 뒤에 같은 함수를 다시 호출하는 ②층도 없습니다.

  - 법인전환의 정상 입력:

    ```js
    { businessIncome: '100000000', ownerSalary: '50000000' }
    ```

    `ReportCorporate.jsx:200`은 `corpFallbackGaps(answers, { precise: false })`를 한 번 호출합니다. 역시 엔진 응답 뒤 재호출이 없고 `corpFallbackGaps`도 `calc` 값을 사용하지 않습니다.

  - 재산세는 `ReportProperty.jsx:167`에서 `calc.precise`이면 즉시 `[]`을 반환하므로 ①층이 있는 것이 아니라 ② 폴백 한계만 존재합니다. 반대로 종부세의 `compFallbackGaps`는 `calc.precise`를 읽지 않고 공동명의 지분 조건만 판정합니다.

  따라서 현재 문서는 후속 작업자가 “8개 모두 같은 2층 구조”라고 오해하게 합니다. 세액 계산의 현재 결과가 틀리는 문제는 아니지만, 인계문서의 “하나만 지우면 샌다”는 경고와 맞물려 잘못된 유지보수 판단을 유도할 수 있습니다.

  수정안: 다음처럼 계산기별 구조를 구분해 기록하십시오.

  | 구분 | 계산기 | 실제 `runAnalysis` 판정 구조 |
  |---|---|---|
  | ①·② 모두 사용 | 상속·증여·취득·양도 | 엔진 전 `{ precise: true }` ① + 엔진 응답 후 `calc` ② |
  | ②만 사용 | 재산세 | 엔진 전 `{ precise: true }`은 빈 배열, 엔진 장애 시 폴백 한계만 차단 |
  | ①만 사용하되 두 호출 지점 존재 | 종부세 | 공동명의 지분 조건이 `precise`와 무관하게 유지 |
  | 단일 엔진 전 게이트 | 종합소득세·법인전환 | 엔진 응답 후 재판정 없음; `precise` 계층 모델을 적용하지 않음 |

### 과잉 차단 방지 12건 대조 — 지적 없음

`project/tests_fallback_block.js:214-228`의 12개 통과 fixture는 각 판정 함수 본문과 대조했습니다. “막아야 하는데 통과”로 고정된 사례는 확인하지 못했습니다.

| fixture | 판정식 대조 결과 |
|---|---|
| 상속: 거주자·배우자·자녀 2명 | `isResident === 'yes'`여서 비거주자 ①층에 해당하지 않고, 사전증여·동거주택·순금융자산 등 ② 조건도 없음 |
| 증여: 거주자·직계존속 | 비거주자·세대생략·혼인/출산공제·사전증여 조건에 해당하지 않음 |
| 취득: 1주택 매매 84㎡ | 면적 입력 완료, 다주택 조정지역 불확정·3주택 일시적 특례 잔존 조건에 해당하지 않음 |
| 취득: 2주택 비조정·일시적 아님 | 조정지역을 명시적으로 `no`로 답했고, 엔진 정상(`precise`)에서는 폴백 전용 ②층을 적용하지 않는 것이 코드 의도와 일치 |
| 재산: 일반 주택 | 토지·건축물·전년도 재산세 입력 조건이 모두 아님 |
| 양도: 1주택 비조정 | 취득 당시 조정지역을 `no`로 확정했고, 입주권 동시보유·전입일 역전 조건이 없음 |
| 양도: 상가 | 입주권·1주택 비과세 거주요건 판정 범위 밖이며 함수 조건에도 해당하지 않음 |
| 소득: 배당 없음 | 배당금이 0이면 배당 유형 분기가 적용되지 않음 |
| 소득: 국내 배당 | `domestic`은 엔진이 Gross-up을 적용하도록 매핑하는 정상 지원 경로 |
| 법인: 급여 ≤ 사업이익 | 유일한 차단 조건인 `salary > income`이 거짓 |
| 종부: 단독명의 | 공동명의·1주택·유효하지 않은 지분율의 동시 조건이 성립하지 않음 |
| 종부: 공동명의 50% | `0 < ownShare < 100`이므로 지분 미확정 차단 조건이 거짓 |

또한 이 fixture들은 의도적으로 `OK = { precise: true }`로 실행되어, “엔진이 정상일 때 평범한 입력을 ① 불확정 층이 과잉 차단하지 않는가”를 고정합니다. 폴백 장애 시의 ②층 차단 여부는 앞선 별도 테스트가 담당하는 구조입니다.

### 공백·asset 변경 대조 — 지적 없음

`Home.jsx` 3곳과 `Pages1.jsx` 2곳은 모두 JSX 태그 사이의 공백 전용 줄입니다. 템플릿 리터럴, JSX 텍스트가 들어 있는 줄, 속성 문자열, 표현식은 변경되지 않았습니다. 공백을 지운 뒤에도 빈 줄 자체는 남아 있어 JSX의 표시 텍스트에는 영향을 주지 않습니다.

## 3. 재발 방지

- AST 검사는 래퍼 “정의”와 IIFE·콜백 “실행 가능 경로”를 구분하고, IIFE·`.then()`·정상 래퍼 정의를 각각 회귀 주입으로 추가해야 합니다.
- 인계문서는 “8개 공통 2층” 대신 위 표와 같이 계산기별 실제 계층·호출 횟수를 명시해야 합니다. 특히 종합소득세·법인전환을 두 번 호출 구조로 설명하지 않아야 합니다.
- 12개 과잉 차단 방지 fixture는 현 판정식과 충돌하지 않아 유지해도 됩니다. 차단 규칙을 넓힐 때에는 해당 fixture를 `precise:true`와 폴백 상태 양쪽에서 의도적으로 점검하는 기준으로 사용하면 됩니다.

## 4. 검증 결과

읽기 전용 정적 검토로 아래를 실행했습니다.

```powershell
git log --oneline --decorate --all -12
git diff --name-status d319c63..1d3006b
git diff --check d319c63..1d3006b
git diff --word-diff=porcelain d319c63..1d3006b -- project/src/Home.jsx project/src/Pages1.jsx
git grep -n -E "(inh|gift|acq|prop|cgt|inc|corp|comp)FallbackGaps\(" 1d3006b -- project/src
```

결과:

- `git diff --check d319c63..1d3006b`: 종료 코드 0, 공백 오류 없음.
- Home/Pages1의 word diff는 공백 전용 변경만 표시했습니다.
- `project/asset_versions.json`의 SHA-256은 현재 파일과 일치했습니다.

  ```text
  project/src/Home.jsx
  7bd706b99c8eccec4cc58de205773262aaae1867e80366d41ad0b098ed131a37

  project/src/Pages1.jsx
  c028432136160b52331e0c21c62b4519602068e82fce78ca62b7a219f9ef7d81
  ```

- Node 실행은 사용자 지시대로 **시도하지 않았습니다**.

## 5. 미확인 사항

- **미확인:** Node가 없는 환경이므로 `npm run gate`, `tests_gate_ast.js`, `tests_fallback_block.js`의 실제 실행 PASS/FAIL은 확인하지 않았습니다. 위 AST P2는 지정 HEAD의 구문 트리 순회 로직을 정적으로 추적한 결과입니다.
- **미확인:** 브라우저에서 차단 입력으로 IIFE·`.then()` 주입 시 엔진 POST가 실제로 발생하는지의 E2E 계측은 수행하지 않았습니다. 다만 JavaScript 실행 순서상 해당 호출은 게이트 반환 전에 시작되거나 반환 후 microtask로 실행됩니다.
- **미확인:** 검토 도중 추가된 로컬 커밋 `5dcd8b0`의 전체 회귀 여부 및 배포 여부입니다. `origin/main`은 관찰 시점에 `1d3006b`이었습니다.