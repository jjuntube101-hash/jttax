## 1. 작업 요약

**수렴**입니다. 검토 범위 `95d6501..HEAD`(HEAD `d319c63`)에서 **P0/P1은 0건**입니다.
직전 4건은 정적으로 확인한 범위에서 모두 닫혔습니다. 다만 회귀 방지용 새 AST 검사가 합법적인 리팩터링을 오판할 수 있는 P2 1건과, diff 공백 검사 실패 P2 1건이 있습니다.

- `preEngineBlock`을 저장하는 6개 2층 계산기(상속·증여·취득·재산·양도·종부)는 모두 결과 렌더의 `...Blocked` 조기 반환이 정밀 라벨·금액·단계별 계산표·공유 컴포넌트보다 먼저입니다.
- 종합소득세·법인전환도 자체 차단 게이트가 엔진 호출보다 먼저이며, 해당 차단 렌더는 공통 `JTFallbackBlocked`로 끝납니다.
- 렌더의 `reason` 재판정은 8개 `*FallbackGaps`와 `window.jtFallbackGaps`를 기준으로 읽기 전용 값 계산만 수행합니다. 상태 변경, 네트워크, 타이머, 저장소 접근은 확인되지 않았습니다.
- `React.Fragment`는 `index.html`에서 React UMD가 먼저 로드된 뒤 `Report.jsx`가 로드되는 순서입니다.

## 2. 변경 검토 지적

- [P2] [`project/tests_gate_ast.js:260, 276`](</D:/jt-data/jttax-cta/project/tests_gate_ast.js:260>) · 엔진 전 게이트 AST 검사가 구현 세부 문자열·직접 호출 이름에 의존하여, 동작상 안전한 리팩터링을 거부하거나 실제 엔진 실행이 아닌 중첩 함수 정의를 엔진 호출로 오인할 수 있습니다.
  재현: `ReportCGT.jsx`의 정상 경로를 아래처럼 동등하게 리팩터링합니다.

  ```js
  const runEngine = callTransferEngine;
  // 엔진 전 게이트
  if (cgtFallbackGaps(answers, { precise: true }).length > 0) return;
  const ej = await runEngine(answers);
  ```

  현재 검사는 호출 callee가 `/^call.*Eng/`인 `Identifier`여야 하므로 `runEngine(...)`을 엔진 호출로 세지 못합니다. 따라서 실제 차단 게이트가 올바르게 엔진 실행보다 앞에 있어도 `firstEngine === null`로 FAIL합니다.

  또한 아래처럼 `async` 화살표 래퍼를 게이트 전에 정의하고 게이트 후 실행하는 정상 구조도, AST walk가 `runAnalysis` 내부의 **하위 함수까지** 함께 순회해 정의부의 `call...Eng()` 위치를 먼저 엔진 호출로 잡습니다.

  ```js
  const runEngine = async () => callTransferEngine(answers);
  if (cgtFallbackGaps(answers, { precise: true }).length > 0) return;
  const ej = await runEngine();
  ```

  이 경우 실제 POST는 게이트 뒤지만, 래퍼 본문이 소스상 게이트 앞에 있으므로 잘못 FAIL합니다. 반대로 호출하지 않는 중첩 함수 안의 `call...Eng()`도 엔진 호출로 세어 잘못 PASS할 수 있습니다.

  수정안: 문자열 `includes()`와 함수명 정규식으로 엔진 호출을 식별하지 말고, `runAnalysis`의 직접 실행 흐름만 대상으로 검사하십시오. 최소한 다음을 적용해야 합니다.

  - 게이트를 포함한 가장 안쪽 함수의 **직접 자식 실행문**만 탐색하고, 중첩 `FunctionDeclaration`/`FunctionExpression`/`ArrowFunctionExpression` 내부는 순회에서 제외
  - 직접 `call*Eng` 호출뿐 아니라 변수 별칭·래퍼 호출을 허용하려면, 해당 변수의 초기화/대입을 한 단계 추적
  - 정적 분석 범위를 의도적으로 좁힐 경우에는 `const runEngine = …` 같은 별칭/래퍼 구조를 명시적으로 금지하고, 그 정책을 테스트 주석 및 코드 규칙으로 고정

- [P2] [`project/src/ReportCGT.jsx:675`](</D:/jt-data/jttax-cta/project/src/ReportCGT.jsx:675>) · 이번 diff에 후행 공백이 포함되어 저장소의 기본 공백 검증이 실패합니다.
  재현: 아래 명령의 결과입니다.

  ```powershell
  git diff --check 95d6501..HEAD
  ```

  출력: `ReportCGT.jsx:675`~`679`, `1224`에 `trailing whitespace`가 보고됩니다. 또한 이전 리뷰 문서 `project/codex-260806/V-round21.md:3`에도 동일 경고가 있습니다.

  수정안: 해당 추가 행의 후행 공백을 제거하고, 커밋 전 `git diff --check <base>..HEAD`를 검토 절차에 포함하십시오.

## 3. 재발 방지

- AST 검사에는 “별칭 엔진 호출”, “게이트 전 선언·게이트 후 호출되는 async 화살표 래퍼”, “실행되지 않는 중첩 함수”를 각각 fixture로 추가해야 합니다. 현재 검사는 실제 회귀를 막는 목적과 달리 코드 형태를 고정하는 방향으로 작동합니다.
- 공백 문제는 `git diff --check`를 PR/커밋 전 필수 정적 검사로 넣으면 재발을 막을 수 있습니다.

## 4. 검증 결과

읽기 전용 정적 검토로 다음을 확인했습니다.

```powershell
git log --oneline --decorate 95d6501..HEAD
git diff --stat 95d6501..HEAD
git diff --name-status 95d6501..HEAD
```

결과: 대상 변경은 `54feba6`, `d319c63`의 `Report.jsx`, 8개 계산기, `tests_fallback_block.js`, `tests_gate_ast.js`에 집중되어 있습니다.

```powershell
rg -n -S "preEngineBlock|JTFallbackBlocked|...FallbackGaps|call.*Eng|window\.claude\.complete|JTReportConvert|navigator\.clipboard|web3forms|gtag\(|localStorage|jtLookupHousePrice" project/src -g "Report*.jsx"
```

결과:

- `preEngineBlock`은 상속·증여·취득·재산·양도·종부 6개에서만 조기 반환용 보고서 상태로 저장됩니다.
- 이 6개는 `calc.precise: true`라도 각 `*FallbackGaps(answers, calc)`가 불확정 입력 사유를 유지하여 `...Blocked` 조기 반환으로 진입합니다.
- 해당 조기 반환은 정밀 계산 라벨, 금액 표시, 단계별 계산표, `JTReportConvert`보다 앞입니다. 따라서 `preEngineBlock`이 정밀 성공 화면을 열지는 않습니다.
- AI 호출과 엔진 POST는 각 `runAnalysis`의 엔진 전 게이트 또는 엔진 후 차단 게이트 뒤에 있습니다.
- 클립보드·Web3Forms·`gtag`는 `ReportConvert.jsx`에 있고, 차단 조기 반환은 `JTReportConvert`를 렌더하지 않습니다.
- 주소 조회는 별도 주소 조회 핸들러에 있고 차단 `runAnalysis` 경로에는 없습니다. `localStorage` 접근은 `Report.jsx`의 라우팅 상태 보존부에만 있습니다.
- 계산기 마운트 시의 `/health` GET은 별도 `useEffect`입니다. 차단 계산 실행이 여는 엔진 **POST**는 아닙니다.

```powershell
git diff --check 95d6501..HEAD
```

결과: 위 P2의 후행 공백 경고가 발생했습니다.

`JTFallbackBlocked`의 `React.Fragment` 관련 정적 확인:

- `index.html:123`에서 React UMD,
- `index.html:124`에서 ReactDOM UMD,
- `index.html:134`에서 `Report.jsx`

순으로 동기 `<script>` 로드됩니다. 정상적인 CDN 로드 조건에서는 `Report.jsx` 평가 시점에 `React` 전역이 먼저 존재합니다.

## 5. 미확인 사항

- **미확인:** Node 실행은 사용자 지시대로 시도하지 않았습니다. 따라서 `tests_fallback_block.js` 및 `tests_gate_ast.js`의 실제 실행 PASS/FAIL, 그리고 주입 검증 결과는 실행 증거로 확인하지 못했습니다.
- **미확인:** 브라우저에서 CDN React UMD가 실제로 내려오는 상황의 E2E 렌더입니다. 정적 로드 순서는 올바르지만, 네트워크 실패까지 이 검토에서 실행 검증하지는 않았습니다.
- **미확인:** 실제 차단 입력을 이용한 네트워크 관찰로 AI·주소조회·외부 전송이 0회인지의 런타임 계측입니다. 정적 제어 흐름상 해당 경로는 닫혀 있습니다.