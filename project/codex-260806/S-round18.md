## 1. 작업 요약

`34308b5..afb88c6`을 HEAD 기준으로 정적 검토했습니다. 요청하신 상속·증여 거주자 하드닝의 상태 복원 경로와 종소세 렌더 분기는 정상으로 확인됐고, 종소세 외국배당 처리 1건, 법인전환 전송 게이트의 테스트 공백 1건, 실제 줄끝 공백 1건을 지적합니다.
특히 외국배당은 Gross-up만 끈다고 정확해지지 않습니다. 거주자의 국외원천소득에 외국소득세가 있는 경우 소득세법 제57조의 공제 대상이 될 수 있는데, HEAD 클라이언트는 그 금액을 받거나 전송하지 않습니다. [국가법령정보센터 소득세법 제57조](https://law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1030575745)

## 2. 변경 내역 및 지적

### [P1] [project/src/ReportIncome.jsx:124](/D:/jt-data/jttax-cta/project/src/ReportIncome.jsx:124) · 외국배당을 “Gross-up 미적용이면 정확”으로 통과시켜 외국납부세액공제를 누락한다

재현: `businessIncome=500,000,000`, `dividendIncome=200,000,000`, `dividendType='foreign'`으로 입력하고, 실제로 외국에서 원천징수된 배당세가 있는 거주자를 가정합니다. HEAD의 `incFallbackGaps()`는 `foreign`을 차단하지 않으며, [ReportIncome.jsx:273](/D:/jt-data/jttax-cta/project/src/ReportIncome.jsx:273)은 `is_dividend_grossup: false`만 전송하고 외국납부세액·공제금액 관련 필드는 전혀 전송하지 않습니다. 따라서 제시된 엔진 실측상 Gross-up 미적용 값인 **251,760,000원**이 표시되지만, 실제 세액은 외국납부세액공제 한도 내에서 외국소득세액이 차감될 수 있어 이 값은 과대일 수 있습니다. 외국세액이 없는 사례에서는 우연히 맞을 수 있으나, 화면은 이를 구별하지 않습니다.

수정안: 현 엔진이 외국납부세액을 계산할 수 없다는 전제라면 `dividend > 0 && dividendType === 'foreign'`도 `incFallbackGaps()`에서 차단하십시오. 대안으로 외국 원천징수세액, 국외원천소득, 적용 통화/환산 기준 등 필요한 입력을 수집하여 엔진이 제57조 한도 계산을 지원하는 것이 확인된 경우에만 통과시키십시오. [project/tests_fallback_block.js:204](/D:/jt-data/jttax-cta/project/tests_fallback_block.js:204)의 “외국 배당 → 통과” 기대값도 차단으로 변경해야 합니다.

### [P1] [project/tests_gate_ast.js:21](/D:/jt-data/jttax-cta/project/tests_gate_ast.js:21) · 법인전환의 새 차단 게이트가 AST·전송 순서 게이트 대상에서 빠져, AI 전송 회귀를 잡지 못한다

재현: 현재 입력 `businessIncome=50,000,000`, `ownerSalary=100,000,000`에서는 [ReportCorporate.jsx:198](/D:/jt-data/jttax-cta/project/src/ReportCorporate.jsx:198)의 조기 반환이 실행되어 실제 `window.claude.complete()` 호출은 막힙니다. 그러나 해당 `return`을 제거하거나 게이트를 AI 호출 뒤로 옮기는 회귀를 주입해도, `tests_gate_ast.js`의 `TARGETS` 목록은 상속·증여·취득·재산·양도 5종만 검사하고 법인전환을 전혀 파싱하지 않습니다. 같은 이유로 [project/tests_fallback_block.js:225](/D:/jt-data/jttax-cta/project/tests_fallback_block.js:225)의 전송 순서 `FILES` 목록과 차단 서브트리 누설 검사도 법인전환을 검사하지 않습니다. 즉, 그 회귀가 발생하면 위 입력에서 대표 급여·사업이익·계산 세액을 포함한 AI 프롬프트가 외부로 전송될 수 있는데도 두 게이트는 이를 FAIL로 만들지 않습니다.

수정안: `corpFallbackGaps`를 다른 판정 함수와 동일하게 `function corpFallbackGaps(answers, calc)`로 표준화하고, 분석·렌더 호출도 `(answers, calc)`로 통일하십시오. 이후 `tests_gate_ast.js`의 `TARGETS`와 `tests_fallback_block.js`의 `FILES`에 `['ReportCorporate.jsx', 'corpFallbackGaps', 'corpBlocked']`를 추가해 다음을 함께 강제해야 합니다.

- 차단 게이트가 `window.claude.complete()`보다 앞에 존재할 것
- 게이트와 AI 호출의 가장 안쪽 함수가 동일할 것
- 차단 렌더 서브트리에 `JTReportConvert`, `formatWon`, `commentary`가 없을 것

### [P2] [project/codex-260806/R-unknown.md:3](/D:/jt-data/jttax-cta/project/codex-260806/R-unknown.md:3) · 검토 기록 Markdown에 실제 줄끝 공백 3건이 있어 `git diff --check`가 실패한다

재현: `git diff --check 34308b5..HEAD`의 실제 출력은 아래 3건입니다.

```text
project/codex-260806/R-unknown.md:3: trailing whitespace.
project/codex-260806/R-unknown.md:71: trailing whitespace.
project/codex-260806/R-unknown.md:87: trailing whitespace.
```

수정안: [R-unknown.md:3](/D:/jt-data/jttax-cta/project/codex-260806/R-unknown.md:3), [R-unknown.md:71](/D:/jt-data/jttax-cta/project/codex-260806/R-unknown.md:71), [R-unknown.md:87](/D:/jt-data/jttax-cta/project/codex-260806/R-unknown.md:87)의 줄끝 공백 두 칸을 제거하십시오. 의도한 Markdown 줄바꿈이었다면 줄끝 공백 대신 빈 줄 또는 명시적 `<br>` 사용 여부를 문서 규칙으로 정하는 편이 Git 게이트와 충돌하지 않습니다.

### 요청 항목별 무결성 판정

- **상속·증여 `isResident !== 'yes'` 하드닝:** 지적 없음. 두 파일 모두 `isResident`가 `tier: 'quick'`이고 선택형 필수 문항입니다. 빠른 결과 → `goDetail()` → 상세 첫 문항에서 `goPrev()`를 타도 `answers`는 초기화되지 않고 `quickReport`만 복원하므로, `yes`를 선택한 정상 이용자가 값 소실로 갇히는 경로는 정적으로 발견하지 못했습니다. “처음부터 다시” 버튼만 의도적으로 `setAnswers({})`를 수행하며, 이후 빠른 단계에서 거주자 문항을 다시 답해야 합니다.

- **`incFallbackGaps`의 엔진 호출 전 차단과 `calc.precise=false`:** 지적 없음. 차단 결과에서는 렌더의 `if (incBlocked)` 조기 반환이 `!calc.precise` 엔진 오류 화면보다 먼저 실행됩니다. 따라서 혼합·모름·미입력 배당은 “엔진 연결 지연” 화면이 아니라 `JTFallbackBlocked` 상담 안내로 갑니다.

- **AI·공유 전송:** 현재 HEAD 실행 흐름상 지적 없음. 종합소득세 [ReportIncome.jsx]( /D:/jt-data/jttax-cta/project/src/ReportIncome.jsx:1 )에는 `window.claude.complete`가 없고, 차단 결과는 `JTReportConvert`보다 먼저 반환됩니다. 법인전환도 현재 조기 반환이 엔진 `fetch`, `window.claude.complete`, `JTReportConvert`보다 앞에 있습니다. 다만 위 P1처럼 법인전환의 이 보장은 테스트 게이트에 고정되어 있지 않습니다.

- **CGT trailing whitespace 기각:** 기각은 타당합니다. `739ab31`, `34308b5`, `HEAD`의 `ReportCGT.jsx` 원시 바이트를 줄 단위로 확인한 결과, `\r`을 제외한 실제 줄끝 공백·탭은 모두 **0줄**이었습니다. 세 버전 모두 파일 전체가 CRLF이며, HEAD는 `CRLF=1,529`, `bareLF=0`입니다. 따라서 CGT의 `\r`을 공백으로 취급해 1,529줄을 LF로 정규화하는 수정은 기능과 무관한 대규모 diff가 됩니다.

## 3. 재발 방지

- 외국배당은 “국내/외국” 분류와 별개로 외국납부세액 입력·엔진 지원 여부를 테스트 조건으로 고정해야 합니다. 현 엔진 미지원 상태라면 `foreign`, `mixed`, `unsure`, 미입력을 모두 차단하는 회귀 테스트가 필요합니다.
- 새 `*FallbackGaps` 함수는 함수 시그니처와 AST `TARGETS`/전송 순서 `FILES` 등록을 하나의 추가 절차로 묶어야 합니다. 그렇지 않으면 판정 함수 자체 테스트만 통과하고 실제 AI·공유 차단 회귀는 감지되지 않습니다.
- 커밋 전 `git diff --check <base>..HEAD`를 게이트에 포함하거나 문서 파일에도 동일한 whitespace 검사를 적용하십시오.

## 4. 검증 결과

- `git rev-parse HEAD`
  결과: `afb88c6136e38ac2779c01f170091fb0db8dca04` — 요청하신 HEAD와 일치.
- `git diff --check 34308b5..HEAD`
  결과: `R-unknown.md`의 3개 실제 trailing-whitespace 오류를 확인.
- `git show HEAD:project/src/ReportIncome.jsx`, `git show HEAD:project/src/ReportCorporate.jsx`, `rg` 정적 추적
  결과: 종소세는 AI 호출이 없고 차단 렌더가 `!calc.precise` 분기보다 앞섬; 법인전환은 현재 게이트가 AI 호출보다 앞이나 두 테스트의 대상 목록에는 없음.
- CGT 원시 바이트 검사
  결과: 실제 줄끝 SP/TAB `0`, CRLF `1,529`.
- Node 실행 검증
  **미실행** — 사용자 지시대로 이 환경에 Node가 없으므로 실행을 시도하지 않았습니다.

## 5. 미확인 사항

- 외국납부세액공제의 실제 금액은 외국 원천징수세액, 공제한도, 신고 정보에 따라 달라지므로, 위 재현의 “정확한 세액”은 현재 UI 입력만으로 산출할 수 없습니다. 다만 HEAD가 그 판단에 필요한 외국세액을 입력·전송하지 않는 사실은 확인했습니다.
- 브라우저에서 `window.claude.complete`를 mock한 실제 호출 횟수 E2E는 Node/브라우저 실행 제한으로 재검증하지 못했습니다.