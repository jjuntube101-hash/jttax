## 1. 작업 요약

커밋 `739ab31`을 읽기 전용으로 정적 검토했습니다. 결론적으로, 일반적인 `FallbackGaps` 차단 입력에서는 5개 계산기 모두 AI 호출보다 게이트가 앞에 있어 직전 P0는 대부분 닫혔고, `commentary: null`도 차단 렌더 경로에서 안전합니다. 다만 **부담부증여 엔진 실패 경로는 `engineErr` 예외 때문에 AI·공유/전송 경로가 여전히 도달 가능**하므로 P0가 완전히 닫히지는 않았습니다. 또한 `isRegulatedArea: 'unsure'`를 payload에서 생략하는 판단은 엔진 성공 시 불확정 사실을 잃으므로 타당하지 않습니다. 파일 수정은 하지 않았습니다.

## 2. 검토 지적

- [P0] [ReportGift.jsx:309](D:/jt-data/jttax-cta/project/src/ReportGift.jsx:309), [ReportGift.jsx:586-597](D:/jt-data/jttax-cta/project/src/ReportGift.jsx:586), [ReportGift.jsx:796-801](D:/jt-data/jttax-cta/project/src/ReportGift.jsx:796) · **부담부증여 엔진 실패(`engineErr`)는 차단 함수에서 예외 처리되어 AI에 가짜 총세부담 0원을 보내고, 이후 공유·Web3Forms 경로도 열립니다.**

  재현: 부동산 부담부증여를 선택한 뒤 엔진 `/v1/calc/burdened-gift`가 오류 응답을 주거나 네트워크 오류가 나게 합니다. `runAnalysis`는 `calc = { mode: 'burdened', totalTax: 0, precise: false }`로 시작하고 실패 시 `calc.engineErr = true`가 됩니다. 그런데 `giftFallbackGaps()`는 `calc.precise || calc.engineErr`이면 빈 배열을 반환하므로 586행 게이트를 통과합니다. 이어 597행의 `window.claude.complete(prompt)`는 `총세부담: 0원`과 관계·재산가액·부담부 여부를 외부 AI에 전송합니다. 화면은 676행 이하에서 금액을 “정밀 계산 필요”로 감추지만, 796행의 `JTReportConvert`는 `giftBlocked === false`이므로 렌더되고, 801행의 `reportSummary`에는 `총 세부담 0원`이 들어갑니다. 사용자가 그 컴포넌트의 카카오/상담 전송을 누르면 클립보드·분석 이벤트·Web3Forms 전송 경로까지 도달할 수 있습니다.

  수정안: `engineErr`를 일반 폴백 차단 사유와 혼합하지 말고, 부담부증여 전용 “엔진 계산 불가” 결과 상태로 **AI 호출 전에** 반환하십시오. 예를 들어 `if (calc.engineErr) { setReport({ calc, commentary: null, isBurdened, quick: ... }); return; }`를 586행 게이트보다 앞에 두고, 렌더에서는 `commentary`를 읽기 전에 `calc.engineErr` 전용 화면을 조기 반환해야 합니다. 그 전용 화면에는 재시도만 두고 `JTReportConvert`를 렌더하지 않아야 합니다. 이 방식이면 현재의 “부담부증여는 0원이 아니라 정밀 계산 필요” 안내는 유지하면서 외부 AI·공유·전송을 함께 막습니다.

- [P1] [ReportAcquisition.jsx:106-113](D:/jt-data/jttax-cta/project/src/ReportAcquisition.jsx:106), [ReportAcquisition.jsx:185](D:/jt-data/jttax-cta/project/src/ReportAcquisition.jsx:185), [ReportAcquisition.jsx:200-202](D:/jt-data/jttax-cta/project/src/ReportAcquisition.jsx:200), [ReportAcquisition.jsx:246-261](D:/jt-data/jttax-cta/project/src/ReportAcquisition.jsx:246) · **`isRegulatedArea: 'unsure'`를 “폴백만 차단하고 payload에서는 생략”하는 것은 타당하지 않습니다. 엔진이 응답하면 불확정 사실이 사라진 채 정밀 계산으로 표시됩니다.**

  재현: `매매 / 주택 / 8억원 / 취득 후 2채 / 전용 84㎡ / 조정대상지역: 모르겠어요 / 일시적 2주택: 아니오`를 입력합니다. `mapAnswersToAcquisition()`은 `yes`일 때만 `is_regulated_area: true`를 보냅니다. 따라서 `unsure`와 `no`는 동일하게 `is_regulated_area`가 없는 JSON으로 직렬화됩니다. 엔진이 필수 `calc` 필드를 포함한 응답을 주면 프런트엔드는 `calc.precise = true`로 설정하고, 247행의 `acqFallbackGaps()`는 즉시 빈 배열을 반환하므로 “정밀 계산” 금액을 표시합니다. 즉 “모르겠다”는 사용자의 명시적 불확정 답변이 결과에서 보존되지 않습니다.

  엔진이 누락 필드를 실제로 비조정지역으로 해석하는지, 별도 주소 정보로 판정하는지는 이 저장소에 백엔드 계약이 없어 **미확인**입니다. 다만 프런트엔드가 `unsure`와 `no`를 동일한 payload로 만드는 사실, 그리고 어떤 정상 응답이든 `precise`로 표시하는 사실은 확인했습니다. 엔진이 누락값을 비조정으로 처리한다면, 예컨대 8억원 조정대상지역 2주택의 중과(코드상 8.4%)가 일반 주택세율로 계산될 수 있습니다.

  수정안: 백엔드가 명시적 `unknown`/`unsure` enum 또는 `null`을 수용하고 “정밀 산출 불가”로 응답하도록 계약을 정한 뒤 그 상태를 보존하십시오. 그 계약 전에는 조정대상지역이 세율을 가르는 입력에서 `unsure`를 **엔진 호출 전** 차단하거나, 엔진 응답이 와도 `precise`로 승격하지 않아야 합니다. 증여 경로도 `gift_regulated_over_3b`의 부재가 `no`와 `unsure`를 구별하지 못하므로 같은 정책을 적용해야 합니다.

- [P1] [tests_fallback_block.js:42-61](D:/jt-data/jttax-cta/project/tests_fallback_block.js:42), [tests_fallback_block.js:153-171](D:/jt-data/jttax-cta/project/tests_fallback_block.js:153), [tests_fallback_block.js:191-207](D:/jt-data/jttax-cta/project/tests_fallback_block.js:191) · **새 테스트는 판정 함수 실행은 하지만 분석 흐름을 실행하지 않습니다. 따라서 실제 게이트를 다시 AI 호출 뒤로 옮기는 되돌림과 `engineErr` 전송 경로를 확실히 잡지 못합니다.**

  재현: 각 `runAnalysis()`에 AI 호출 전의 무의미한 조건문 `if (giftFallbackGaps(answers, calc).length > 0) { /* 안내 변수만 설정 */ }`를 두고, 실제 `return` 게이트는 `const gaps = giftFallbackGaps(answers, calc); if (gaps.length > 0) ...` 형태로 `window.claude.complete()` 뒤로 옮깁니다. 현재 테스트는 첫 번째 문자열의 위치만 `indexOf()`로 비교하고, 함수 정의 1회 + 무의미한 조건문 1회 + 렌더 호출 1회로 호출 수 3회도 맞출 수 있습니다. `loadGapFn()`은 순수 판정 함수만 `eval`할 뿐 `runAnalysis`·`setReport`·`window.claude.complete`·`JTReportConvert`를 실행하지 않으므로 테스트가 통과할 수 있습니다.

  또한 이 테스트는 `engineErr: true` 부담부증여를 만들지 않으며, `mapAnswersToAcquisition()`도 호출하지 않아 `unsure`의 payload 소실을 검사하지 않습니다. 차단 JSX 안의 `LEAK_TARGETS`도 `fetch`·`gtag`·`window.jtTrackCta`·`navigator.clipboard`·Web3Forms를 직접 검사하지 않습니다.

  수정안: CI에서 실행할 흐름 테스트를 추가하십시오. 최소한 다음을 mock으로 검증해야 합니다.

  - 부담부증여 엔진 실패 시 `window.claude.complete` 호출 수가 `0`이고, `JTReportConvert`/Web3Forms/클립보드 경로가 렌더되지 않는지
  - 각 5개 계산기의 실제 차단 입력에서 AI mock·`fetch` mock·`gtag`/`jtTrackCta` mock의 호출 인자와 횟수가 정책에 맞는지
  - 취득세 `unsure` 입력이 서버로 보낼 때 `no`와 구별되는지, 또는 엔진 호출 전 차단되는지
  - “게이트가 AI보다 앞”을 문자열 순서가 아니라 차단 입력을 실제로 실행해 AI mock이 0회인지로 검증하는지

- [P2] [ReportAcquisition.jsx:121](D:/jt-data/jttax-cta/project/src/ReportAcquisition.jsx:121), [ReportAcquisition.jsx:125](D:/jt-data/jttax-cta/project/src/ReportAcquisition.jsx:125), [ReportAcquisition.jsx:130](D:/jt-data/jttax-cta/project/src/ReportAcquisition.jsx:130) · **일시적 2주택 문항의 핵심 법령 인용과 3년 기한은 맞지만, “종전 주택 1채”라는 문구는 법정 대상인 “종전 주택등 1개”보다 좁습니다.**

  재현: 기존에 주거용 오피스텔 1개 또는 조합원입주권·주택분양권 1개를 보유한 세대가 이사·학업·취업·직장이전 등의 사유로 신규 주택을 취득하고 3년 안에 기존 자산을 처분하는 경우를 생각할 수 있습니다. 시행령 제28조의5 제1항은 기존 보유 자산을 주택뿐 아니라 조합원입주권·주택분양권·오피스텔까지 포함해 규정합니다. 그런데 화면은 “종전 주택 1채”라고만 물어, 앱이 주택 수 안내에서 “분양권·입주권·주거용 오피스텔도 포함될 수 있다”고 설명한 범위와도 용어가 어긋납니다. 사용자가 자신은 “종전 주택”이 없다고 이해해 `no`를 택하면, 조정대상지역 2주택 중과 결과가 나올 수 있습니다.

  수정안: 질문과 선택지를 “국내의 종전 주택등 1개(주택·조합원입주권·주택분양권·오피스텔)를 보유한 상태에서 …” 및 “네, 종전 주택등 1개를 3년 내 처분 예정”으로 바꾸십시오. 설명문의 “종전 주택”도 “종전 주택등”으로 통일하십시오.

  법령 확인 결과, 이번 수정의 나머지 핵심은 맞습니다. 현행 지방세법 제13조의2 제1항 제2호는 **“1세대 2주택(대통령령으로 정하는 일시적 2주택은 제외한다)”**라는 괄호 문언으로 특례를 둡니다. 시행령 제28조의5 제1항은 종전 주택등 1개 보유 세대가 법정 사유로 신규 주택을 추가 취득한 뒤 **3년 이내** 종전 주택등을 처분하는 경우를 정하며, 현행 조문에는 조정대상지역에 따라 그 3년을 달리한다는 문언이 없습니다. 따라서 `housingCount === 2`로 좁히고 3주택 이상 + `temporaryTwoHouse: 'yes'`를 차단한 이번 수정의 방향은 타당합니다. [지방세법 제13조의2 제1항 제2호](https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1033360867), [지방세법 시행령 제28조의5 제1항](https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1032972381)

## 3. 재발 방지

판정 함수 추출 자체는 의미를 바꾸지 않은 것으로 확인했습니다. 취득세의 `acqArea`는 함수 내부에서 같은 `Number(answers.exclusiveArea) || 0`으로 재계산되고, 상속세의 `nonResident`도 동일하게 `answers.isResident === 'no'`로 계산됩니다. 증여세의 `(calc.precise || calc.engineErr)` 조건도 추출 과정에서 보존되었습니다. 다만 바로 그 `engineErr` 예외가 P0 경로를 남긴 원인이므로, “금액을 숨기는 모든 결과 상태는 AI·공유·전송도 금지한다”는 출력 정책을 별도 boolean/상태로 만들고 흐름 테스트로 고정해야 합니다.

`{ calc, commentary: null, quick }` 형태는 진짜 `FallbackGaps` 차단 경로에서는 안전합니다. 다섯 렌더러 모두 `commentary`를 역참조하기 전에 `xxxBlocked` 조기 반환을 수행하며, 차단 공통 컴포넌트는 사유 목록과 재시도 버튼만 렌더합니다. 일반 차단 화면에는 `JTReportConvert`, `gtag`, Web3Forms, 클립보드, 주소 조회 UI가 없습니다. 재시도는 계산 엔진 요청을 다시 보낼 수 있지만, 그것은 정밀 계산 재시도라는 명시적 동작이며 클라이언트 폴백 세액을 보내지는 않습니다.

## 4. 검증 결과

- `git show --stat --oneline --decorate --find-renames 739ab31`로 검토 대상이 현재 `HEAD`의 `739ab31`이며, 5개 계산기와 `tests_fallback_block.js`가 변경된 것을 확인했습니다.
- `rg` 정적 추적으로 취득·상속·일반 증여·재산세·양도세의 `FallbackGaps → setReport(blockedRep) → return`이 각각 `window.claude.complete()`보다 앞에 있음을 확인했습니다.
- 같은 추적으로 부담부증여의 `engineErr`는 `giftFallbackGaps()`가 빈 배열을 반환하여 위 게이트를 우회하고, AI 호출 및 `JTReportConvert` 렌더까지 이어지는 것을 확인했습니다.
- `Report.jsx`의 `JTFallbackBlocked`는 `onRetry` 버튼 외에 CTA·분석·저장 호출을 하지 않습니다. `localStorage`는 리포트 하위 경로 복원용 `jt_report_sub`만 사용하며 계산 답변·세액을 저장하지 않습니다. 주소 조회 API는 입력 단계의 사용자 클릭 경로이며 차단 결과 화면에는 노출되지 않습니다.
- 요청에 따라 Node 및 `tests_fallback_block.js` 실행은 시도하지 않았습니다.

## 5. 미확인 사항

- `jt-tax-engine`의 `is_regulated_area` 누락값 처리 계약은 이 프런트엔드 저장소에 구현·명세가 없어 미확인입니다. 따라서 `unsure` 입력 때 실제 엔진이 내놓는 정확한 세액은 단정하지 않았습니다.
- 엔진의 `is_temporary_two_house: true`와 `housing_count: 1` 조합에 대한 백엔드 계약도 저장소 밖이므로 미확인입니다. 프런트엔드 차원에서는 3주택 이상에서 해당 덮어쓰기를 막았고, 법령상 특례 전제가 1개 보유 세대라는 점은 확인했습니다.